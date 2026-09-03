-- CIRCLE · Solicitudes recibidas/enviadas + cancelación + poka-yoke anti-spam
-- Ejecuta UNA VEZ después de los upgrades anteriores.

-- 1) Enviar saludo: si ya existe uno pendiente, NO crea otro y devuelve un mensaje claro.
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
      and nullif(trim(coalesce(pr.specific_location,'')), '') is not null
      and pr.is_available = true
      and pr.social_status = 'available'
  ) then
    raise exception 'Tu perfil debe estar completo, visible y disponible para enviar solicitudes.';
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

-- 2) Solo el emisor puede cancelar una solicitud, y únicamente mientras siga pendiente.
create or replace function public.cancel_social_request(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  update public.social_requests
  set status = 'cancelled'
  where id = p_request_id
    and sender_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Esta solicitud ya no puede cancelarse.';
  end if;
end;
$$;

revoke all on function public.cancel_social_request(bigint) from public;
grant execute on function public.cancel_social_request(bigint) to authenticated;
