  -- Resonance — migration 004 : SOCIAL (friends + DM)
  -- Idempotent : peut être ré-exécuté sans erreur.
  -- NOTE : à appliquer manuellement via le Dashboard (SQL Editor),
  -- comme les migrations précédentes.

  -- ========== PROFILES : colonnes vie privée ==========
  alter table public.profiles
    add column if not exists share_listening_activity boolean default true;
  alter table public.profiles
    add column if not exists allow_friend_requests boolean default true;
  alter table public.profiles
    add column if not exists appear_online boolean default true;

  -- ========== TABLES ==========
  create table if not exists public.friendships (
    id uuid primary key default gen_random_uuid(),
    requester_id uuid not null references auth.users (id) on delete cascade,
    addressee_id uuid not null references auth.users (id) on delete cascade,
    status text not null default 'pending'
      check (status in ('pending', 'accepted', 'blocked')),
    blocked_by uuid references auth.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (requester_id <> addressee_id),
    unique (requester_id, addressee_id)
  );

  create unique index if not exists friendships_pair_uidx
    on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

  create index if not exists friendships_addressee_status_idx
    on public.friendships (addressee_id, status);

  create table if not exists public.conversations (
    id uuid primary key default gen_random_uuid(),
    user_a_id uuid not null references auth.users (id) on delete cascade,
    user_b_id uuid not null references auth.users (id) on delete cascade,
    last_message_at timestamptz,
    created_at timestamptz not null default now(),
    check (user_a_id < user_b_id),
    unique (user_a_id, user_b_id)
  );

  create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations (id) on delete cascade,
    sender_id uuid not null references auth.users (id) on delete cascade,
    content text not null check (char_length(content) between 1 and 2000),
    type text not null default 'text'
      check (type in ('text', 'track_share', 'jam_invite', 'system')),
    payload jsonb not null default '{}'::jsonb,
    read_at timestamptz,
    created_at timestamptz not null default now()
  );

  create index if not exists messages_conversation_created_idx
    on public.messages (conversation_id, created_at desc);

  -- ========== FONCTIONS HELPER (anti-récursion RLS) ==========
  -- SECURITY DEFINER : lisent les tables sans déclencher leurs policies RLS.
  create or replace function public.is_friends_with(other uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  as $$
    select exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = other)
          or (f.requester_id = other and f.addressee_id = auth.uid()))
    );
  $$;

  revoke all on function public.is_friends_with(uuid) from public, anon;
  grant execute on function public.is_friends_with(uuid) to authenticated;

  create or replace function public.is_conversation_member(conv uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  as $$
    select exists (
      select 1 from public.conversations c
      where c.id = conv
        and (c.user_a_id = auth.uid() or c.user_b_id = auth.uid())
    );
  $$;

  revoke all on function public.is_conversation_member(uuid) from public, anon;
  grant execute on function public.is_conversation_member(uuid) to authenticated;

  -- ========== RLS ==========
  alter table public.friendships enable row level security;
  alter table public.conversations enable row level security;
  alter table public.messages enable row level security;

  -- Friendships
  drop policy if exists "friendships select" on public.friendships;
  create policy "friendships select" on public.friendships
    for select using (
      auth.uid() in (requester_id, addressee_id)
      and (status <> 'blocked' or blocked_by = auth.uid())
    );
  drop policy if exists "friendships insert" on public.friendships;
  create policy "friendships insert" on public.friendships
    for insert with check (requester_id = auth.uid());
  drop policy if exists "friendships update" on public.friendships;
  create policy "friendships update" on public.friendships
    for update using (auth.uid() in (requester_id, addressee_id));
  drop policy if exists "friendships delete" on public.friendships;
  create policy "friendships delete" on public.friendships
    for delete using (
      auth.uid() in (requester_id, addressee_id)
      and (status <> 'blocked' or blocked_by = auth.uid())
    );

  -- Conversations : lecture seule via policy, écritures via RPC uniquement.
  drop policy if exists "conversations select" on public.conversations;
  create policy "conversations select" on public.conversations
    for select using (public.is_conversation_member(id));

  -- Messages : lecture seule via policy, écritures via RPC uniquement.
  drop policy if exists "messages select" on public.messages;
  create policy "messages select" on public.messages
    for select using (public.is_conversation_member(conversation_id));

  -- ========== RPC : ouvrir (ou récupérer) une conversation ==========
  -- Erreur générique 'not_found' : ne révèle pas l'existence d'un blocage.
  create or replace function public.start_conversation(other uuid)
  returns public.conversations
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_self uuid := auth.uid();
    v_a uuid;
    v_b uuid;
    v_row public.conversations%rowtype;
  begin
    if v_self is null or other is null or other = v_self then
      raise exception 'not_found';
    end if;

    if exists (
      select 1 from public.friendships f
      where f.status = 'blocked'
        and ((f.requester_id = v_self and f.addressee_id = other)
          or (f.requester_id = other and f.addressee_id = v_self))
    ) then
      raise exception 'not_found';
    end if;

    if not public.is_friends_with(other) then
      raise exception 'not_found';
    end if;

    v_a := least(v_self, other);
    v_b := greatest(v_self, other);

    insert into public.conversations (user_a_id, user_b_id)
      values (v_a, v_b)
      on conflict (user_a_id, user_b_id) do nothing;

    select * into v_row
      from public.conversations
      where user_a_id = v_a and user_b_id = v_b;

    return v_row;
  end;
  $$;

  revoke all on function public.start_conversation(uuid) from public, anon;
  grant execute on function public.start_conversation(uuid) to authenticated;

  -- ========== RPC : envoyer un message (v1 : text/system uniquement) ==========
  create or replace function public.send_message(conv uuid, p_content text, p_type text default 'text', p_payload jsonb default '{}')
  returns public.messages
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_type text := coalesce(p_type, 'text');
    v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
    v_row public.messages%rowtype;
  begin
    if auth.uid() is null then
      raise exception 'not_found';
    end if;

    if p_content is null or char_length(p_content) < 1 or char_length(p_content) > 2000 then
      raise exception 'invalid content';
    end if;

    if v_type not in ('text', 'system') then
      raise exception 'unsupported type';
    end if;

    if not public.is_conversation_member(conv) then
      raise exception 'not_found';
    end if;

    insert into public.messages (conversation_id, sender_id, content, type, payload)
      values (conv, auth.uid(), p_content, v_type, v_payload)
      returning * into v_row;

    update public.conversations
      set last_message_at = now()
      where id = conv;

    return v_row;
  end;
  $$;

  revoke all on function public.send_message(uuid, text, text, jsonb) from public, anon;
  grant execute on function public.send_message(uuid, text, text, jsonb) to authenticated;

  -- ========== RPC : marquer une conversation comme lue ==========
  create or replace function public.mark_read(conv uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $$
  begin
    if not public.is_conversation_member(conv) then
      raise exception 'not_found';
    end if;

    update public.messages
      set read_at = now()
      where conversation_id = conv
        and sender_id <> auth.uid()
        and read_at is null;
  end;
  $$;

  revoke all on function public.mark_read(uuid) from public, anon;
  grant execute on function public.mark_read(uuid) to authenticated;

  -- ========== RPC : recherche de profils (ajout d'amis) ==========
  create or replace function public.search_profiles(q text)
  returns table (id uuid, display_name text, avatar_url text)
  language plpgsql
  stable
  security definer
  set search_path = public
  as $$
  begin
    if q is null or btrim(q) = '' then
      return;
    end if;

    return query
    select p.id, p.display_name, p.avatar_url
      from public.profiles p
      where p.display_name ilike '%' || q || '%'
        and p.id <> auth.uid()
        and p.allow_friend_requests = true
        and not exists (
          select 1 from public.friendships f
          where f.status = 'blocked'
            and ((f.requester_id = auth.uid() and f.addressee_id = p.id)
              or (f.requester_id = p.id and f.addressee_id = auth.uid()))
        )
      limit 20;
  end;
  $$;

  revoke all on function public.search_profiles(text) from public, anon;
  grant execute on function public.search_profiles(text) to authenticated;

  -- ========== REALTIME ==========
  do $$
  begin
    alter publication supabase_realtime add table public.messages;
  exception
    when duplicate_object then null;
  end $$;

  do $$
  begin
    alter publication supabase_realtime add table public.conversations;
  exception
    when duplicate_object then null;
  end $$;
