-- Resonance — migration 006 : DISCORD RICH PRESENCE
-- Idempotent : peut être ré-exécuté sans erreur.
-- NOTE : à appliquer manuellement via le Dashboard (SQL Editor),
-- comme les migrations précédentes.

-- ========== PROFILES : opt-in Discord ==========
alter table public.profiles
  add column if not exists discord_presence boolean default true;
