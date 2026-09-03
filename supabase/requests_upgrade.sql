-- CIRCLE · Solicitudes reales + consentimiento de "Cómo encontrarme"
-- Run ONCE after how_to_find_me_upgrade.sql.

-- Avoid multiple simultaneous pending requests between the same pair.
-- If prior testing created duplicates, keep only the newest pending row first.
delete from public.social_requests older
using public.social_requests newer
where older.sender_id = newer.sender_id
  and older.receiver_id = newer.receiver_id
  and older.status = 'pending'
  and newer.status = 'pending'
  and older.id < newer.id;

create unique index if not exists one_pending_request_per_pair
on public.social_requests (sender_id, receiver_id)
where status = 'pending';

-- Send a real request. Sender must have a complete profile and active presence.
create or replace function public.send_social_request(p_receiver_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if p_receiver_id = auth.uid() then
    raise exception 'No puedes enviarte una solicitud a ti mismo.';
  end if;

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
      and nullif(trim(coalesce(pr.specific_location,'')), '') is not null
      and pr.is_available = true
  ) then
    raise exception 'Completa tu perfil y actualiza tu presencia antes de enviar solicitudes.';
  end if;

  if not exists (
    select 1 from public.presence pr
    where pr.user_id = p_receiver_id
      and pr.is_available = true
      and pr.last_seen > now() - interval '5 minutes'
  ) then
    raise exception 'Esta persona ya no está disponible.';
  end if;

  select id into v_request_id
  from public.social_requests
  where sender_id = auth.uid()
    and receiver_id = p_receiver_id
    and status = 'pending'
  order by created_at desc
  limit 1;

  if v_request_id is not null then
    return v_request_id;
  end if;

  insert into public.social_requests(sender_id, receiver_id, status)
  values (auth.uid(), p_receiver_id, 'pending')
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.send_social_request(uuid) from public;
grant execute on function public.send_social_request(uuid) to authenticated;

-- Receiver accepts or declines. Only a pending request can be changed.
create or replace function public.respond_social_request(
  p_request_id bigint,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_decision not in ('accepted','declined') then
    raise exception 'Respuesta inválida.';
  end if;

  update public.social_requests
  set status = p_decision
  where id = p_request_id
    and receiver_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'La solicitud ya no está pendiente o no te pertenece.';
  end if;
end;
$$;

revoke all on function public.respond_social_request(bigint,text) from public;
grant execute on function public.respond_social_request(bigint,text) to authenticated;

-- Safe request inbox/outbox. Privacy rules:
-- * incoming pending/accepted: receiver can see sender's "Cómo encontrarme"
-- * outgoing accepted: sender can see receiver's "Cómo encontrarme"
-- * outgoing pending/declined: receiver location remains hidden
create or replace function public.my_social_requests()
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
  how_to_find_me text,
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
        then sender_presence.specific_location
      when sr.sender_id = auth.uid() and sr.status = 'accepted'
        then receiver_presence.specific_location
      else null
    end as how_to_find_me,
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
