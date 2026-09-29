-- Resonance — schéma Supabase
-- À exécuter dans SQL Editor (supabase.com/dashboard)
-- Idempotent : peut être ré-exécuté sans erreur.

-- ========== PROFILES ==========
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "own profile select" on public.profiles;
create policy "own profile select" on public.profiles
  for select to authenticated using (true);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== LIKED TRACKS ==========
create table if not exists public.liked_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  platform_track_id text not null,
  title text not null,
  artist text not null,
  cover_url text,
  source_url text not null,
  duration_ms integer,
  added_at timestamptz not null default now(),
  unique (user_id, platform, platform_track_id)
);

create index if not exists liked_tracks_user_recent
  on public.liked_tracks (user_id, added_at desc);

alter table public.liked_tracks enable row level security;

drop policy if exists "own likes all" on public.liked_tracks;
create policy "own likes all" on public.liked_tracks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ========== HISTORY ==========
create table if not exists public.history_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  track jsonb not null,
  played_at timestamptz not null default now()
);

create index if not exists history_user_recent
  on public.history_entries (user_id, played_at desc);

alter table public.history_entries enable row level security;

drop policy if exists "own history all" on public.history_entries;
create policy "own history all" on public.history_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ========== QUEUE STATE (reprise d'état) ==========
create table if not exists public.queue_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  current_index integer not null default 0,
  position_ms integer not null default 0,
  is_playing boolean not null default false,
  volume real not null default 1,
  repeat_mode text not null default 'off',
  shuffle boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.queue_state enable row level security;

drop policy if exists "own queue all" on public.queue_state;
create policy "own queue all" on public.queue_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);