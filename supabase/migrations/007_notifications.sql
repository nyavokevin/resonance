-- Resonance — migration 007 : NOTIFICATIONS (Lane A, durable + in-app)
-- Idempotent : peut être ré-exécuté sans erreur.
-- NOTE : à appliquer manuellement via le Dashboard (SQL Editor),
-- comme les migrations précédentes (001-006).

-- ========== TABLE ==========
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null
    check (type in ('message', 'friend_request', 'friend_accepted', 'jam_invite')),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;

-- ========== RLS ==========
-- Le client ne fait que lire + poser read_at ; les lignes naissent
-- uniquement dans le trigger DEFINER ci-dessous (bypass RLS, owner).
-- INSERT : aucune policy (trigger only). DELETE : aucune policy.
alter table public.notifications enable row level security;

drop policy if exists "notifications select own" on public.notifications;
create policy "notifications select own" on public.notifications
  for select using (auth.uid() = user_id);
drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own" on public.notifications
  for update using (auth.uid() = user_id);

-- ========== FONCTION TRIGGER ==========
create or replace function public.notify_on_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_name text;
begin
  if TG_TABLE_NAME = 'messages' then
    -- Destinataire = l'autre participant de la conversation.
    select case
      when c.user_a_id = NEW.sender_id then c.user_b_id
      else c.user_a_id
    end into v_recipient
    from public.conversations c
    where c.id = NEW.conversation_id;
    -- Garde sender≠recipient (jamais censé arriver, coût nul).
    if v_recipient is null or v_recipient = NEW.sender_id then
      return NEW;
    end if;
    select display_name into v_name
    from public.profiles where id = NEW.sender_id;
    insert into public.notifications (user_id, type, payload)
    values (
      v_recipient,
      case when NEW.type = 'jam_invite' then 'jam_invite' else 'message' end,
      jsonb_build_object(
        'from_user_id', NEW.sender_id,
        'from_name', v_name,
        'conversation_id', NEW.conversation_id,
        'preview', left(NEW.content, 80)
      )
    );
    return NEW;
  elsif TG_TABLE_NAME = 'friendships' then
    if TG_OP = 'INSERT' then
      if NEW.status = 'pending' then
        select display_name into v_name
        from public.profiles where id = NEW.requester_id;
        insert into public.notifications (user_id, type, payload)
        values (
          NEW.addressee_id,
          'friend_request',
          jsonb_build_object(
            'friendship_id', NEW.id,
            'from_user_id', NEW.requester_id,
            'from_name', v_name
          )
        );
      end if;
      return NEW;
    elsif TG_OP = 'UPDATE' then
      if OLD.status = 'pending' and NEW.status = 'accepted' then
        select display_name into v_name
        from public.profiles where id = NEW.addressee_id;
        insert into public.notifications (user_id, type, payload)
        values (
          NEW.requester_id,
          'friend_accepted',
          jsonb_build_object(
            'friendship_id', NEW.id,
            'from_user_id', NEW.addressee_id,
            'from_name', v_name
          )
        );
      end if;
      return NEW;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists notifications_on_message on public.messages;
create trigger notifications_on_message
  after insert on public.messages
  for each row execute function public.notify_on_event();

drop trigger if exists notifications_on_friendship_insert on public.friendships;
create trigger notifications_on_friendship_insert
  after insert on public.friendships
  for each row execute function public.notify_on_event();

drop trigger if exists notifications_on_friendship_update on public.friendships;
create trigger notifications_on_friendship_update
  after update of status on public.friendships
  for each row execute function public.notify_on_event();

-- ========== PROFILES : push (v2) + préférences (stockées, pas encore appliquées) ==========
-- push_token + notif_* sont stockés pour le futur sender v2 ; rien n'est
-- filtré côté trigger en Lane A (le client supprime déjà les toasts redondants).
alter table public.profiles
  add column if not exists push_token text;
alter table public.profiles
  add column if not exists notif_messages boolean default true;
alter table public.profiles
  add column if not exists notif_friend_requests boolean default true;
alter table public.profiles
  add column if not exists notif_jam_invites boolean default true;

-- NOTE : pas de table user_presence — la suppression "chat ouvert" est
-- client-side (openConversationId dans le store) : une table de présence
-- écrite au heartbeat amplifierait les écritures et courrait après les
-- races présence/lecture. Pas de push_log non plus : aucun sender à
-- rate-limiter tant que la Lane B (push) n'existe pas.

-- ========== REALTIME ==========
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;
