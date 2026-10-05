-- Resonance — migration 013 : UNIQUE display_name global
-- Idempotent : peut être ré-exécuté sans erreur.
-- NOTE : à appliquer manuellement via le Dashboard (SQL Editor),
-- comme les migrations précédentes (001-012). SANS elle, l'index unique
-- n'existe pas : les noms doublons passent, et le client ne peut pas
-- détecter les collisions (is_display_name_taken absent → vérification
-- silencieusement désactivée, la 23505 n'arrive jamais).
--
-- Règle de déduplication : pour chaque doublon (case-insensitive), on
-- garde la ligne la plus ancienne (created_at, puis id pour trancher) et
-- on suffixe les autres avec `-<6 premiers chars de l'id>`
-- (ex. "bob" → "bob-6f2ac1"). Les NULL ne sont pas touchés (l'index
-- partiel les ignore).
--
-- Pourquoi ce fichier doit tourner dans le SQL Editor : la déduplication
-- lit/écrit profiles en masse (pas de RLS bloquante ici), et le trigger
-- handle_new_user lit auth.users (email) — illisible côté client, mais le
-- SQL Editor s'exécute en postgres.

-- ========== 1. DÉDUP DES LIGNES EXISTANTES ==========
update public.profiles p
set display_name = p.display_name || '-' || left(p.id::text, 6)
from (
  select id,
         row_number() over (
           partition by lower(display_name)
           order by created_at asc, id asc
         ) as rn
  from public.profiles
  where display_name is not null
) d
where p.id = d.id
  and d.rn > 1;

-- Passe de sécurité : un suffixe peut (rarement) recoller un autre nom —
-- on re-suffixe tant qu'il reste des doublons (borné par construction :
-- chaque passe ajoute le préfixe d'id, distinct par ligne).
do $$
declare
  v_remaining int;
begin
  loop
    update public.profiles p
    set display_name = p.display_name || '-' || left(p.id::text, 6)
    from (
      select id,
             row_number() over (
               partition by lower(display_name)
               order by created_at asc, id asc
             ) as rn
      from public.profiles
      where display_name is not null
    ) d
    where p.id = d.id
      and d.rn > 1;

    select count(*) into v_remaining
    from (
      select 1
      from public.profiles
      where display_name is not null
      group by lower(display_name)
      having count(*) > 1
    ) dup;

    exit when v_remaining = 0;
  end loop;
end;
$$;

-- ========== 2. INDEX UNIQUE (case-insensitive, NULL ignorés) ==========
create unique index if not exists profiles_display_name_key
  on public.profiles (lower(display_name))
  where display_name is not null;

-- ========== 3. RPC : vérification de disponibilité ==========
-- SECURITY DEFINER + recherche simple → ne renvoie qu'un booléen.
-- Grant à anon AUSSI : la vérification peut tourner pendant le signup,
-- avant qu'une session n'existe (pré-auth). Il ne fuit qu'un booléen
-- « ce nom existe-t-il » — le pattern 004 ne concédait qu'à
-- authenticated ; ici anon est requis, commenté explicitement.
create or replace function public.is_display_name_taken(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where display_name is not null
      and lower(display_name) = lower(p_name)
  );
$$;

revoke all on function public.is_display_name_taken(text) from public, anon;
grant execute on function public.is_display_name_taken(text) to anon, authenticated;

-- ========== 4. TRIGGER : nom unique garanti ==========
-- display_name non vide dans la metadata signup → inséré tel quel : le
-- client a déjà validé la disponibilité, et l'index unique est autoritaire
-- (un doublon → 23505 → le client affiche le message amical).
-- display_name vide → nom dérivé de l'email avec repli garanti unique :
-- on part du préfixe email, si pris on essaie +2, +3, +4… jusqu'à trouver
-- un nom libre (jamais d'échec de signup pour cause de nom).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_suffix int := 2;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if v_name is null then
    -- Base : préfixe email ; sans email (OAuth), 8 premiers chars de l'id.
    v_name := coalesce(
      nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      left(new.id::text, 8)
    );
    while exists (
      select 1 from public.profiles
      where display_name is not null
        and lower(display_name) = lower(v_name)
    ) loop
      v_name := coalesce(
        nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
        left(new.id::text, 8)
      ) || v_suffix::text;
      v_suffix := v_suffix + 1;
    end loop;
  end if;

  insert into public.profiles (id, display_name, avatar_url, email)
  values (
    new.id,
    v_name,
    new.raw_user_meta_data ->> 'avatar_url',
    new.email
  );
  return new;
end;
$$;