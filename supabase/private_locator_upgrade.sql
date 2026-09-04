-- CIRCLE · Divide los datos privados de "Cómo encontrarme"
-- Ejecuta UNA VEZ después de los upgrades anteriores.
-- Nuevo modelo privado:
--   presence.where_i_am        -> "Dónde me ubico"
--   presence.what_im_wearing   -> "Qué estoy usando"
-- specific_location se conserva solo como compatibilidad interna y se rellena con ambos valores.

alter table public.presence
  add column if not exists where_i_am text,
  add column if not exists what_im_wearing text;

-- Migración conservadora: la referencia anterior pasa a "Dónde me ubico".
update public.presence
set where_i_am = coalesce(nullif(trim(where_i_am), ''), nullif(trim(specific_location), ''))
where nullif(trim(coalesce(where_i_am, '')), '') is null
  and nullif(trim(coalesce(specific_location, '')), '') is not null;

-- Un perfil ya no puede permanecer disponible si falta cualquiera de los dos datos privados.
update public.presence
set is_available = false
where nullif(trim(coalesce(where_i_am, '')), '') is null
   or nullif(trim(coalesce(what_im_wearing, '')), '') is null;

alter table public.presence
  drop constraint if exists available_requires_private_locator;

alter table public.presence
  add constraint available_requires_private_locator
  check (
    is_available = false
    or (
      nullif(trim(coalesce(where_i_am, '')), '') is not null
      and nullif(trim(coalesce(what_im_wearing, '')), '') is not null
    )
  );

-- Nearby nunca expone los datos privados. También usa ambos campos para decidir
-- si el perfil del VISUALIZADOR está completo y por tanto puede ver fotos.
create or replace function public.nearby_profiles(
  user_lat double precision,
  user_lng double precision,
  radius_meters integer default 75
)
returns table (
  id uuid,
  display_name text,
  bio text,
  avatar_url text,
  interests text[],
  intent text,
  social_status text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with viewer as (
    select exists (
      select 1
      from public.profiles me
      join public.presence my_presence on my_presence.user_id = me.id
      where me.id = auth.uid()
        and nullif(trim(me.display_name), '') is not null
        and nullif(trim(coalesce(me.bio,'')), '') is not null
        and nullif(trim(coalesce(me.avatar_url,'')), '') is not null
        and nullif(trim(coalesce(me.intent,'')), '') is not null
        and cardinality(me.interests) > 0
        and nullif(trim(coalesce(my_presence.where_i_am,'')), '') is not null
        and nullif(trim(coalesce(my_presence.what_im_wearing,'')), '') is not null
    ) as profile_complete
  ), nearby as (
    select
      p.id,
      p.display_name,
      p.bio,
      case when viewer.profile_complete then p.avatar_url else null end as avatar_url,
      p.interests,
      p.intent,
      pr.last_seen,
      case when exists (
        select 1
        from public.conversation_members cm
        join public.conversations c on c.id = cm.conversation_id
        where cm.user_id = p.id
          and cm.left_at is null
          and c.status = 'active'
      ) then 'busy'::text else 'available'::text end as effective_status
    from public.presence pr
    join public.profiles p on p.id = pr.user_id
    cross join viewer
    where auth.uid() is not null
      and pr.is_available = true
      and pr.user_id <> auth.uid()
      and ST_DWithin(
        pr.location,
        ST_SetSRID(ST_MakePoint(user_lng, user_lat),4326)::geography,
        radius_meters
      )
  )
  select
    id,
    display_name,
    bio,
    avatar_url,
    interests,
    intent,
    effective_status as social_status
  from nearby
  order by case when effective_status = 'available' then 0 else 1 end, last_seen desc
  limit 20;
$$;

revoke all on function public.nearby_profiles(double precision,double precision,integer) from public;
grant execute on function public.nearby_profiles(double precision,double precision,integer) to authenticated;

-- Backend anti-spam + perfil completo: ambos datos privados son obligatorios.
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

  insert into public.social_requests(sender_id, receiver_id, status)
  values (auth.uid(), p_receiver_id, 'pending')
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.send_social_request(uuid) from public;
grant execute on function public.send_social_request(uuid) to authenticated;

-- Cambia la forma del retorno, por eso se eliminan y recrean estas dos funciones.
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

drop function if exists public.my_active_conversation();

create function public.my_active_conversation()
returns table (
  conversation_id bigint,
  other_id uuid,
  display_name text,
  avatar_url text,
  intent text,
  where_i_am text,
  what_im_wearing text,
  started_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    other_profile.id,
    other_profile.display_name,
    other_profile.avatar_url,
    other_profile.intent,
    other_presence.where_i_am,
    other_presence.what_im_wearing,
    c.created_at
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id and c.status = 'active'
  join public.conversation_members other_member
    on other_member.conversation_id = c.id
    and other_member.user_id <> auth.uid()
    and other_member.left_at is null
  join public.profiles other_profile on other_profile.id = other_member.user_id
  left join public.presence other_presence on other_presence.user_id = other_member.user_id
  where me.user_id = auth.uid()
    and me.left_at is null
  order by c.created_at desc
  limit 1;
$$;

revoke all on function public.my_active_conversation() from public;
grant execute on function public.my_active_conversation() to authenticated;

-- Helpers antiguos conservados para compatibilidad: devuelven ambos datos en una sola cadena.
create or replace function public.request_how_to_find_me(p_request_id bigint)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() = sr.receiver_id and sr.status in ('pending','accepted')
      then concat_ws(' · ', sender_presence.where_i_am, sender_presence.what_im_wearing)
    when auth.uid() = sr.sender_id and sr.status = 'accepted'
      then concat_ws(' · ', receiver_presence.where_i_am, receiver_presence.what_im_wearing)
    else null
  end
  from public.social_requests sr
  left join public.presence sender_presence on sender_presence.user_id = sr.sender_id
  left join public.presence receiver_presence on receiver_presence.user_id = sr.receiver_id
  where sr.id = p_request_id
    and auth.uid() in (sr.sender_id, sr.receiver_id)
  limit 1;
$$;

revoke all on function public.request_how_to_find_me(bigint) from public;
grant execute on function public.request_how_to_find_me(bigint) to authenticated;

create or replace function public.accepted_specific_location(request_id bigint)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select concat_ws(' · ', pr.where_i_am, pr.what_im_wearing)
  from public.social_requests sr
  join public.presence pr
    on pr.user_id = case
      when auth.uid() = sr.sender_id then sr.receiver_id
      else sr.sender_id
    end
  where sr.id = request_id
    and sr.status = 'accepted'
    and auth.uid() in (sr.sender_id, sr.receiver_id)
  limit 1;
$$;

revoke all on function public.accepted_specific_location(bigint) from public;
grant execute on function public.accepted_specific_location(bigint) to authenticated;
