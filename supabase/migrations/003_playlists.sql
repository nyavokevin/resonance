-- Resonance — migration 003 : PLAYLISTS + repeat ×N + radio
-- Idempotent : peut être ré-exécuté sans erreur.

-- NOTE : is_in_active_jam() est supprimée EN FIN DE FICHIER (elle doit être
-- retirée APRÈS le remplacement des policies qui y faisaient référence,
-- sinon DROP FUNCTION échoue avec "other objects depend on it").

-- ========== TABLES ==========
create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  cover_url text,
  is_public boolean not null default false,
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists playlists_user_updated
  on public.playlists (user_id, updated_at desc);

create table if not exists public.playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  position integer not null,
  platform text not null,
  track_id text not null,
  track jsonb not null,
  added_at timestamptz not null default now(),
  unique (playlist_id, position)
);

create index if not exists playlist_tracks_order
  on public.playlist_tracks (playlist_id, position);

alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;

-- ========== RLS : playlists ==========
-- IMPORTANT : lecture = OWNER UNIQUEMENT. Le partage se fait exclusivement
-- via le RPC get_playlist_by_share_token (token) — jamais par is_public
-- dans les policies, sinon toutes les playlists publiques apparaissent
-- chez tous les utilisateurs.
drop policy if exists "playlists select" on public.playlists;
create policy "playlists select" on public.playlists
  for select using (auth.uid() = user_id);
drop policy if exists "playlists insert" on public.playlists;
create policy "playlists insert" on public.playlists
  for insert with check (auth.uid() = user_id);
drop policy if exists "playlists update" on public.playlists;
create policy "playlists update" on public.playlists
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "playlists delete" on public.playlists;
create policy "playlists delete" on public.playlists
  for delete using (auth.uid() = user_id);

-- ========== RLS : playlist_tracks (droits hérités de la playlist parente) ==========
drop policy if exists "playlist_tracks select" on public.playlist_tracks;
create policy "playlist_tracks select" on public.playlist_tracks
  for select using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and p.user_id = auth.uid()
    )
  );
drop policy if exists "playlist_tracks insert" on public.playlist_tracks;
create policy "playlist_tracks insert" on public.playlist_tracks
  for insert with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );
drop policy if exists "playlist_tracks update" on public.playlist_tracks;
create policy "playlist_tracks update" on public.playlist_tracks
  for update
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );
drop policy if exists "playlist_tracks delete" on public.playlist_tracks;
create policy "playlist_tracks delete" on public.playlist_tracks
  for delete using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );

-- ========== TRIGGER : updated_at parent ==========
create or replace function public.touch_playlist_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.playlists
    set updated_at = now()
    where id = coalesce(new.playlist_id, old.playlist_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists playlist_tracks_touch_parent on public.playlist_tracks;
create trigger playlist_tracks_touch_parent
  after insert or update or delete on public.playlist_tracks
  for each row execute function public.touch_playlist_updated_at();

-- ========== RPC : lecture par token de partage ==========
-- Retourne { playlist, tracks } si publique ou si l'appelant est owner,
-- null sinon. Consommée par /playlist/share/[token].
create or replace function public.get_playlist_by_share_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_playlist public.playlists%rowtype;
begin
  if p_token is null or p_token = '' then
    return null;
  end if;

  select * into v_playlist
    from public.playlists
    where share_token = p_token;

  if not found then
    return null;
  end if;

  if not v_playlist.is_public and v_playlist.user_id <> auth.uid() then
    return null;
  end if;

  return jsonb_build_object(
    'playlist', row_to_json(v_playlist),
    'tracks', coalesce((
      select jsonb_agg(row_to_json(t) order by t.position)
      from public.playlist_tracks t
      where t.playlist_id = v_playlist.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_playlist_by_share_token(text) from public, anon;
grant execute on function public.get_playlist_by_share_token(text) to authenticated;

-- ========== RPC : réordonnancement en une mutation ==========
-- p_ordered_ids : ids de playlist_tracks dans le nouvel ordre.
-- Seul le owner peut réordonner ; les ids étrangers sont ignorés.
create or replace function public.reorder_playlist_tracks(p_playlist_id uuid, p_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    return;
  end if;

  select user_id into v_owner
    from public.playlists
    where id = p_playlist_id;

  if v_owner is null or v_owner <> auth.uid() then
    return;
  end if;

  -- Deux phases (positions temporaires négatives) : une réécriture directe
  -- violerait transitoirement UNIQUE(playlist_id, position) (ex. swap 0↔1).
  update public.playlist_tracks
    set position = -position - 1000000
    where playlist_id = p_playlist_id;

  update public.playlist_tracks t
    set position = o.idx - 1
    from unnest(p_ordered_ids) with ordinality as o(id, idx)
    where t.id = o.id and t.playlist_id = p_playlist_id;

  update public.playlists
    set updated_at = now()
    where id = p_playlist_id;
end;
$$;

revoke all on function public.reorder_playlist_tracks(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_playlist_tracks(uuid, uuid[]) to authenticated;

-- ========== EXTENSIONS queue_state (repeat ×N + radio) ==========
alter table public.queue_state
  add column if not exists repeat_count integer not null default 0;
alter table public.queue_state
  add column if not exists autoplay boolean not null default true;

-- ========== EXTENSIONS jam_sessions (diffusion repeat host → invités) ==========
alter table public.jam_sessions
  add column if not exists repeat_mode text not null default 'off';
alter table public.jam_sessions
  add column if not exists repeat_count integer not null default 0;

-- ========== CLEANUP : suppression is_in_active_jam ==========
-- Les nouvelles policies (owner-only, ci-dessus) ne la référencent plus,
-- le DROP passe maintenant. Elle exposait TOUTES les playlists à quiconque
-- était dans un Jam — fuite de visibilité.
drop function if exists public.is_in_active_jam();

-- ========== RPC : tendances globales (page Découvrir) ==========
-- Agrégat sur TOUS les utilisateurs : uniquement des stats agrégées
-- (titre/plateforme + compteur), aucune donnée personnelle (pas d'user_id).
create or replace function public.get_global_trending(p_limit int default 10)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  from (
    select track, count(*) as plays
    from public.history_entries
    where played_at > now() - interval '7 days'
      and track ->> 'id' is not null
    group by track
    order by count(*) desc, max(played_at) desc
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ) t;
$$;

revoke all on function public.get_global_trending(int) from public, anon;
grant execute on function public.get_global_trending(int) to authenticated;
