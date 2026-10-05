-- Resonance — migration 011 : BACKFILL display_name + email (serveur)
-- Idempotent : peut être ré-exécuté sans erreur.
-- NOTE : à appliquer manuellement via le Dashboard (SQL Editor),
-- comme les migrations précédentes (001-010). SANS elle, les comptes
-- pré-display-name gardent display_name NULL et email NULL → l'UI montre
-- le préfixe d'id (8 chars) au lieu d'un nom lisible.
--
-- Pourquoi serveur : auth.users n'est pas lisible côté client (RLS), mais
-- le SQL Editor tourne en postgres et le voit. 011 rend le backfill
-- client (syncOwnProfileEmail dans lib/friends.ts) inutile pour les
-- lignes existantes : l'email est déjà rempli, la mise à jour `.is('email',
-- null)` ne touche plus rien.
--
-- Contexte : profiles a aussi display_name/email NULL si le compte a été
-- créé avant la migration 009 (le trigger handle_new_user 009 ne s'est
-- appliqué qu'aux nouveaux signups) ou si l'utilisateur n'a jamais choisi
-- de nom d'affichage.

-- ========== COLONNE (indépendante de 009) ==========
alter table public.profiles
  add column if not exists email text;

-- ========== BACKFILL EMAIL (une seule passe) ==========
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and (p.email is null or p.email = '');

-- ========== BACKFILL DISPLAY_NAME (préfixe email, une seule passe) ==========
update public.profiles p
set display_name = coalesce(p.display_name, split_part(u.email, '@', 1))
from auth.users u
where u.id = p.id
  and (p.display_name is null or btrim(p.display_name) = '');

-- NOTE : le trigger handle_new_user (009) n'est pas modifié ici — 011
-- ne fait que combler les lignes existantes. Les nouveaux signups
-- continuent de remplir display_name + email via le trigger.