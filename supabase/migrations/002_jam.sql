-- Resonance — migration 002 : JAM (Listen Together)
-- Idempotent : peut être ré-exécuté sans erreur.

-- ========== FONCTIONS HELPER (anti-récursion RLS) ==========
-- SECURITY DEFINER : s'exécutent avec les droits du propriétaire, donc
-- lisent les tables sans déclencher leurs policies RLS. Sans elles,
-- jam_sessions ↔ jam_participants se référencent → récursion infinie.

create or replace function public.is_jam_participant(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.jam_participants jp
    where jp.session_id = p_session_id and jp.user_id = auth.uid()
  );
$$;

create or replace function public.is_jam_host(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.jam_sessions js
    where js.id = p_session_id and js.host_id = auth.uid()
  );
$$;

-- Recherche par code : SECURITY DEFINER car un invité n'est pas encore
-- participant, donc la policy SELECT ne lui donnerait pas accès
-- (paradoxe join). La fonction ne renvoie QUE la ligne du code fourni,
-- jamais le reste de la table.
create or replace function public.find_jam_session(p_code text)
returns setof public.jam_sessions
language sql
stable
security definer
set search_path = public
as $$
  select * from public.jam_sessions where code = upper(trim(p_code));
$$;

revoke all on function public.find_jam_session(text) from public, anon;
grant execute on function public.find_jam_session(text) to authenticated;

-- Ajout d'un titre dans la file par n'importe quel participant
-- (les invités n'ont pas le droit UPDATE sur jam_sessions, donc on passe
-- par une fonction SECURITY DEFINER qui vérifie host/participant).
create or replace function public.jam_add_track(p_session_id uuid, p_track jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
begin
  if auth.uid() is null then
    return;
  end if;

  select host_id into v_host from public.jam_sessions where id = p_session_id;
  if v_host is null then
    return;
  end if;

  if v_host <> auth.uid() and not public.is_jam_participant(p_session_id) then
    return;
  end if;

  update public.jam_sessions
    set queue = queue || jsonb_build_array(p_track),
        updated_at = now()
    where id = p_session_id;
end;
$$;

revoke all on function public.jam_add_track(uuid, jsonb) from public, anon;
grant execute on function public.jam_add_track(uuid, jsonb) to authenticated;

-- ========== TABLES ==========
create table if not exists public.jam_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references auth.users (id) on delete cascade,
  current_track jsonb,
  queue jsonb not null default '[]'::jsonb,
  current_index integer not null default 0,
  position_ms integer not null default 0,
  is_playing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- migration pour les installations existantes (colonnes ajoutées après coup)
alter table public.jam_sessions add column if not exists queue jsonb not null default '[]'::jsonb;
alter table public.jam_sessions add column if not exists current_index integer not null default 0;
alter table public.jam_sessions add column if not exists updated_at timestamptz not null default now();

create table if not exists public.jam_participants (
  session_id uuid not null references public.jam_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- ========== RLS ==========
alter table public.jam_sessions enable row level security;
alter table public.jam_participants enable row level security;

-- Participants
drop policy if exists "own participation all" on public.jam_participants;
create policy "own participation all" on public.jam_participants
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "host views participants" on public.jam_participants;
create policy "host views participants" on public.jam_participants
  for select using (public.is_jam_host(session_id));

-- Sessions
drop policy if exists "host manages own session" on public.jam_sessions;
create policy "host manages own session" on public.jam_sessions
  for all using (auth.uid() = host_id) with check (auth.uid() = host_id);
drop policy if exists "participants view session" on public.jam_sessions;
create policy "participants view session" on public.jam_sessions
  for select using (public.is_jam_participant(id));

-- ========== REALTIME ==========
do $$
begin
  alter publication supabase_realtime add table public.jam_sessions;
exception
  when duplicate_object then null;
end $$;
