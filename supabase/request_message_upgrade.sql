-- CIRCLE · optional request message upgrade
-- Adds a short optional context message to social requests.
-- Safe to run after the current private locator / state integrity upgrades.

alter table public.social_requests
  add column if not exists message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'social_requests_message_length_check'
      and conrelid = 'public.social_requests'::regclass
  ) then
    alter table public.social_requests
      add constraint social_requests_message_length_check
      check (message is null or char_length(message) <= 140);
  end if;
end
$$;

-- Replace the old one-argument function so PostgREST has one unambiguous RPC.
drop function if exists public.send_social_request(uuid);

create function public.send_social_request(
  p_receiver_id uuid,
  p_message text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_id bigint;
  v_message text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if p_receiver_id = auth.uid() then
    raise exception 'No puedes enviarte una solicitud a ti mismo.';
  end if;

  v_message := nullif(trim(coalesce(p_message, '')), '');

  if v_message is not null and char_length(v_message) > 140 then
    raise exception 'El mensaje puede tener máximo 140 caracteres.';
  end if;

  perform public.repair_social_status_for_user(auth.uid());
  perform public.repair_social_status_for_user(p_receiver_id);

  if not exists (
    select 1
    from public.profiles p
    join public.presence pr on pr.user_id = p.id
    where p.id = auth.uid()
      and nullif(trim(p.display_name), '') is not null
      and nullif(trim(coalesce(p.bio,'')), '') is not null
      and nullif(trim(coalesce(p.avatar_url,'')), '') is not null
      and nullif(trim(coalesce(p.intent,'')), '') is not null
      and cardinality(p.interests) > 0
      and nullif(trim(coalesce(pr.where_i_am,'')), '') is not null
      and nullif(trim(coalesce(pr.what_im_wearing,'')), '') is not null
      and pr.is_available = true
      and pr.social_status = 'available'
  ) then
    raise exception 'Completa tu perfil y asegúrate de estar disponible para enviar solicitudes.';
  end if;

  if not exists (
    select 1
    from public.presence pr
    where pr.user_id = p_receiver_id
      and pr.is_available = true
      and pr.social_status = 'available'
  ) then
    raise exception 'Esta persona está ocupada o ya no está disponible.';
  end if;

  select id into v_request_id
  from public.social_requests
  where sender_id = auth.uid()
    and receiver_id = p_receiver_id
    and status = 'pending'
  order by created_at desc
  limit 1;

  if v_request_id is not null then
    raise exception 'Ya habías enviado un saludo a esta persona. Espera su respuesta o cancélalo desde Solicitudes > Enviadas.';
  end if;

  insert into public.social_requests(sender_id, receiver_id, status, message)
  values (auth.uid(), p_receiver_id, 'pending', v_message)
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.send_social_request(uuid,text) from public;
grant execute on function public.send_social_request(uuid,text) to authenticated;

-- The return shape changes because requests now include message.
drop function if exists public.my_social_requests();

create function public.my_social_requests()
returns table (
  id bigint,
  direction text,
  status text,
  other_id uuid,
  display_name text,
  bio text,
  avatar_url text,
  interests text[],
  intent text,
  where_i_am text,
  what_im_wearing text,
  message text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    sr.id,
    case when sr.receiver_id = auth.uid() then 'incoming' else 'outgoing' end as direction,
    sr.status,
    other_profile.id as other_id,
    other_profile.display_name,
    other_profile.bio,
    other_profile.avatar_url,
    other_profile.interests,
    other_profile.intent,
    case
      when sr.receiver_id = auth.uid() and sr.status in ('pending','accepted')
        then sender_presence.where_i_am
      when sr.sender_id = auth.uid() and sr.status = 'accepted'
        then receiver_presence.where_i_am
      else null
    end as where_i_am,
    case
      when sr.receiver_id = auth.uid() and sr.status in ('pending','accepted')
        then sender_presence.what_im_wearing
      when sr.sender_id = auth.uid() and sr.status = 'accepted'
        then receiver_presence.what_im_wearing
      else null
    end as what_im_wearing,
    sr.message,
    sr.created_at
  from public.social_requests sr
  join public.profiles other_profile
    on other_profile.id = case
      when sr.receiver_id = auth.uid() then sr.sender_id
      else sr.receiver_id
    end
  left join public.presence sender_presence on sender_presence.user_id = sr.sender_id
  left join public.presence receiver_presence on receiver_presence.user_id = sr.receiver_id
  where auth.uid() in (sr.sender_id, sr.receiver_id)
  order by
    case when sr.status = 'pending' and sr.receiver_id = auth.uid() then 0 else 1 end,
    sr.created_at desc;
$$;

revoke all on function public.my_social_requests() from public;
grant execute on function public.my_social_requests() to authenticated;
