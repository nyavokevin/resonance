-- Resonance — migration 012 : ENSURE profiles rows for every auth user
-- Idempotent : peut être ré-exécuté sans erreur.
-- NOTE : à appliquer manuellement via le Dashboard (SQL Editor),
-- comme les migrations précédentes (001-011). SANS elle, les comptes sans
-- ligne profiles (signups créés hors trigger — Dashboard manuel, seed,
-- OAuth ayant sauté handle_new_user...) gardent profil null → l'UI montre
-- le préfixe d'id (8 chars) avec un warn dev `[displayNameOf:...]` :
-- `no display_name/email for user <uuid>`. 011 ne corrigeait que les
-- lignes EXISTANTES ; ici on complète les lignes manquantes puis on
-- re-rejoue les backfills 011 pour les null/blank restants.
--
-- Pourquoi ce fichier doit tourner dans le SQL Editor : il lit
-- auth.users (emails) — illisible côté client (RLS), mais le SQL Editor
-- s'exécute en postgres et y a accès.

-- ========== 1. Ligne profiles pour tout auth user sans ligne ==========
-- display_name initial = préfixe email (sinon 8 premiers chars de l'id,
-- cohérent avec le repli client displayNameOf) ; email prérempli.
insert into public.profiles (id, display_name, email)
select
  u.id,
  coalesce(split_part(u.email, '@', 1), left(u.id::text, 8)),
  u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- ========== 2. Re-backfill 011 (lignes encore null/blank) ==========
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and (p.email is null or p.email = '');

update public.profiles p
set display_name = coalesce(p.display_name, split_part(u.email, '@', 1))
from auth.users u
where u.id = p.id
  and (p.display_name is null or btrim(p.display_name) = '');

-- ========== 3. Safety net trigger (idempotent) ==========
-- Recrée la version 009 de handle_new_user (qui persiste aussi l'email)
-- pour les bases où 009/010 auraient été appliquées dans le désordre :
-- create or replace est idempotent et le résultat est identique.
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

-- NOTE : si le trigger on_auth_user_created n'existe pas (bases antérieures
-- à 001), ce create or replace n'invoque pas le trigger mais ne casse rien.
-- Les nouveaux signups sans trigger restent couverts par la section 1 au
-- prochain passage de ce script — il est sûr de l'exécuter à nouveau.