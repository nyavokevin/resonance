-- Resonance — migration 005 : SOCIAL RICH (track_share + jam_invite)
-- Idempotent : peut être ré-exécuté sans erreur.
-- NOTE : à appliquer manuellement via le Dashboard (SQL Editor),
-- comme les migrations précédentes.
-- Fichier séparé : 004 reste valide, appliquée ou non
-- (create or replace écrase la version restrictive le cas échéant).

-- ========== RPC : envoyer un message (text/system/track_share/jam_invite) ==========
-- Même comportement que la version 004, sauf le type accepté +
-- contrôles de forme du payload pour les types riches :
--   track_share exige platform/track_id/title/artist (cover optionnelle) ;
--   jam_invite exige jam_id/code/host_name.
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

  if v_type not in ('text', 'system', 'track_share', 'jam_invite') then
    raise exception 'unsupported type';
  end if;

  if v_type = 'track_share' then
    if coalesce(v_payload ->> 'platform', '') = ''
      or coalesce(v_payload ->> 'track_id', '') = ''
      or coalesce(v_payload ->> 'title', '') = ''
      or coalesce(v_payload ->> 'artist', '') = '' then
      raise exception 'invalid track_share payload';
    end if;
  elsif v_type = 'jam_invite' then
    if coalesce(v_payload ->> 'jam_id', '') = ''
      or coalesce(v_payload ->> 'code', '') = ''
      or coalesce(v_payload ->> 'host_name', '') = '' then
      raise exception 'invalid jam_invite payload';
    end if;
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
