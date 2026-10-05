-- Resonance — migration 009 : PROFILES email (fallback d'affichage)
-- Idempotent : peut être ré-exécuté sans erreur.
-- NOTE : à appliquer manuellement via le Dashboard (SQL Editor),
-- comme les migrations précédentes (001-008). SANS elle, la colonne
-- `profiles.email` n'existe pas : les selects client l'incluant échouent
-- et l'affichage retombe sur l'id tronqué (8 chars) — jamais d'UUID complet.
--
-- Contexte : auth.users n'est pas lisible côté client, mais
-- public.profiles l'est (policy select `using (true)`). On persiste donc
-- l'email de l'utilisateur dans sa propre ligne profiles (UPDATE own
-- déjà autorisé) pour offrir le fallback : display_name → préfixe email
-- (avant @) → id tronqué. Les lignes existantes (email NULL) sont
-- remplies par le client au login / bootstrap (syncOwnProfileEmail).

-- ========== COLONNE ==========
alter table public.profiles
  add column if not exists email text;

-- ========== TRIGGER SIGNUP : persiste aussi l'email ==========
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    new.email
  );
  return new;
end;
$$;

-- ========== RPC search_profiles : retourne aussi l'email ==========
-- Même comportement que 004 + colonne email (fallback préfixe côté client).
-- DROP d'abord : Postgres (42P13) refuse de changer le type de retour
-- d'une fonction existante via CREATE OR REPLACE.
drop function if exists public.search_profiles(text);
create function public.search_profiles(q text)
returns table (id uuid, display_name text, avatar_url text, email text)
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
  select p.id, p.display_name, p.avatar_url, p.email
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

-- ========== NOTIFICATIONS : from_name avec fallback préfixe email ==========
-- Même trigger que 007, sauf la résolution du nom : display_name, sinon
-- préfixe email, sinon NULL (le client affiche "?" — jamais d'UUID).
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
    select coalesce(display_name, split_part(email, '@', 1)) into v_name
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
        select coalesce(display_name, split_part(email, '@', 1)) into v_name
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
        select coalesce(display_name, split_part(email, '@', 1)) into v_name
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
