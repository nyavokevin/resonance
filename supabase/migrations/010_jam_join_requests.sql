-- Resonance — migration 010 : JAM join requests (guest demande, host accepte/refuse)
-- Idempotent : peut être ré-exécuté sans erreur.
-- NOTE : à appliquer manuellement via le Dashboard (SQL Editor),
-- comme les migrations précédentes (001-009). SANS elle, toute demande
-- de rejoindre une Jam échoue (table/fonctions absentes) : le bouton
-- Rejoindre affiche une erreur et aucune navigation n'a lieu.
--
-- Posture : pas de DELETE côté host (refusé = ligne `declined`, terminale).
-- Le guest peut retirer sa propre demande (DELETE own) — choix documenté :
-- plus simple qu'un état `cancelled`, et le host n'a plus rien à voir.

-- ========== TABLE ==========
create table if not exists public.jam_join_requests (
  session_id uuid not null references public.jam_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- ========== RLS ==========
-- Pas de risque de récursion : les policies guest ne touchent que auth.uid(),
-- les policies host réutilisent public.is_jam_host (DEFINER, lit seulement
-- jam_sessions — même idiome que la migration 002).
alter table public.jam_join_requests enable row level security;

-- Le guest crée sa propre demande (pending uniquement).
drop policy if exists "guest inserts own request" on public.jam_join_requests;
create policy "guest inserts own request" on public.jam_join_requests
  for insert with check (auth.uid() = user_id and status = 'pending');

-- Le guest voit ses propres demandes (suivi pending → accepted/declined).
drop policy if exists "own requests select" on public.jam_join_requests;
create policy "own requests select" on public.jam_join_requests
  for select using (auth.uid() = user_id);

-- Le host voit les demandes de sa session.
drop policy if exists "host views requests" on public.jam_join_requests;
create policy "host views requests" on public.jam_join_requests
  for select using (public.is_jam_host(session_id));

-- Le host peut mettre à jour les demandes de sa session
-- (chemin client direct ; les fonctions DEFINER ci-dessous s'en passent
-- mais la policy garde le modèle "host décide" explicite).
drop policy if exists "host decides requests" on public.jam_join_requests;
create policy "host decides requests" on public.jam_join_requests
  for update using (public.is_jam_host(session_id));

-- Le guest retire sa propre demande (annulation) — seul DELETE autorisé.
drop policy if exists "guest withdraws own request" on public.jam_join_requests;
create policy "guest withdraws own request" on public.jam_join_requests
  for delete using (auth.uid() = user_id);

-- ========== FONCTIONS DEFINER ==========
-- Demande (ou re-demande après refus) : idempotent. Un `accepted` existant
-- est renvoyé tel quel (le client rejoint directement) — jamais rétrogradé.
create or replace function public.request_jam_join(p_session_id uuid)
returns public.jam_join_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_row public.jam_join_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_found';
  end if;

  select host_id into v_host
    from public.jam_sessions where id = p_session_id;
  if v_host is null then
    raise exception 'not_found';
  end if;
  if v_host = auth.uid() then
    raise exception 'not_found';
  end if;

  insert into public.jam_join_requests (session_id, user_id, status)
    values (p_session_id, auth.uid(), 'pending')
    on conflict (session_id, user_id) do update
      set status = case
        when jam_join_requests.status = 'declined' then 'pending'
        else jam_join_requests.status
      end
    returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.request_jam_join(uuid) from public, anon;
grant execute on function public.request_jam_join(uuid) to authenticated;

-- Acceptation host : pending → accepted + ajout participant (atomique).
-- Les états accepted/declined sont terminaux (second appel → false).
create or replace function public.approve_jam_join_request(p_session_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_jam_host(p_session_id) then
    return false;
  end if;

  update public.jam_join_requests
    set status = 'accepted'
    where session_id = p_session_id
      and user_id = p_user_id
      and status = 'pending';
  if not found then
    return false;
  end if;

  insert into public.jam_participants (session_id, user_id)
    values (p_session_id, p_user_id)
    on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.approve_jam_join_request(uuid, uuid) from public, anon;
grant execute on function public.approve_jam_join_request(uuid, uuid) to authenticated;

-- Refus host : pending → declined (terminal, la ligne reste en archive).
create or replace function public.decline_jam_join_request(p_session_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_jam_host(p_session_id) then
    return false;
  end if;

  update public.jam_join_requests
    set status = 'declined'
    where session_id = p_session_id
      and user_id = p_user_id
      and status = 'pending';
  return found;
end;
$$;

revoke all on function public.decline_jam_join_request(uuid, uuid) from public, anon;
grant execute on function public.decline_jam_join_request(uuid, uuid) to authenticated;

-- ========== REALTIME ==========
-- Le host suit les INSERT (nouvelles demandes), le guest les UPDATE de sa
-- propre ligne (accepté/refusé) — le RLS filtre ce que chacun reçoit.
do $$
begin
  alter publication supabase_realtime add table public.jam_join_requests;
exception
  when duplicate_object then null;
end $$;
