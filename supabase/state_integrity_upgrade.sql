-- CIRCLE · Poka-yokes de estado social y conversaciones
-- Ejecuta UNA VEZ después de conversations_upgrade.sql y realtime_upgrade.sql.
-- Objetivo: un usuario jamás debe quedar "busy" si no pertenece a una conversación activa.

-- 1) Función interna: determina y repara el estado social de un usuario.
create or replace function public.repair_social_status_for_user(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_has_active boolean;
  v_status text;
begin
  select exists (
    select 1
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    where cm.user_id = p_user_id
      and cm.left_at is null
      and c.status = 'active'
  ) into v_has_active;

  v_status := case when v_has_active then 'busy' else 'available' end;

  update public.presence
  set social_status = v_status
  where user_id = p_user_id
    and social_status is distinct from v_status;

  return v_status;
end;
$$;

revoke all on function public.repair_social_status_for_user(uuid) from public;
-- No se concede execute al cliente: es helper interno security definer.

-- 2) RPC pública solo para reparar el estado del usuario autenticado.
create or replace function public.repair_my_social_status()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  return public.repair_social_status_for_user(auth.uid());
end;
$$;

revoke all on function public.repair_my_social_status() from public;
grant execute on function public.repair_my_social_status() to authenticated;

-- 3) Trigger de integridad: terminar una conversación libera SIEMPRE a todos sus miembros.
create or replace function public.release_members_when_conversation_ends()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'active' and new.status = 'ended' then
    update public.presence p
    set social_status = 'available'
    where p.user_id in (
      select cm.user_id
      from public.conversation_members cm
      where cm.conversation_id = new.id
        and cm.left_at is null
    );

    update public.conversation_members
    set left_at = coalesce(left_at, now())
    where conversation_id = new.id
      and left_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_release_members_when_conversation_ends on public.conversations;
create trigger trg_release_members_when_conversation_ends
after update of status on public.conversations
for each row
when (old.status is distinct from new.status)
execute function public.release_members_when_conversation_ends();

-- 4) Actualizar ubicación también repara el estado social antes de publicar presencia.
create or replace function public.update_my_presence_location(
  user_lat double precision,
  user_lng double precision
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  perform public.repair_social_status_for_user(auth.uid());

  update public.presence
  set location = ST_SetSRID(ST_MakePoint(user_lng, user_lat),4326)::geography,
      is_available = true,
      last_seen = now()
  where user_id = auth.uid();
end;
$$;

revoke all on function public.update_my_presence_location(double precision,double precision) from public;
grant execute on function public.update_my_presence_location(double precision,double precision) to authenticated;

-- 5) Enviar solicitud repara primero estados huérfanos del emisor Y receptor.
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

-- 6) Aceptar solicitud también repara estados huérfanos antes de validar.
create or replace function public.respond_social_request(
  p_request_id bigint,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sender uuid;
  v_receiver uuid;
  v_conversation_id bigint;
begin
  if p_decision not in ('accepted','declined') then
    raise exception 'Respuesta inválida.';
  end if;

  select sender_id, receiver_id
  into v_sender, v_receiver
  from public.social_requests
  where id = p_request_id
    and receiver_id = auth.uid()
    and status = 'pending'
  for update;

  if not found then
    raise exception 'La solicitud ya no está pendiente o no te pertenece.';
  end if;

  if p_decision = 'declined' then
    update public.social_requests set status = 'declined' where id = p_request_id;
    return;
  end if;

  perform public.repair_social_status_for_user(v_sender);
  perform public.repair_social_status_for_user(v_receiver);

  if exists (
    select 1 from public.presence
    where user_id in (v_sender, v_receiver)
      and (is_available = false or social_status <> 'available')
  ) then
    raise exception 'Una de las personas ya está ocupada o no disponible.';
  end if;

  if exists (
    select 1
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    where cm.user_id in (v_sender, v_receiver)
      and cm.left_at is null
      and c.status = 'active'
  ) then
    raise exception 'Una de las personas ya está en una conversación.';
  end if;

  insert into public.conversations(status, created_from_request_id)
  values ('active', p_request_id)
  returning id into v_conversation_id;

  insert into public.conversation_members(conversation_id, user_id)
  values (v_conversation_id, v_sender), (v_conversation_id, v_receiver);

  update public.presence
  set social_status = 'busy'
  where user_id in (v_sender, v_receiver);

  update public.social_requests
  set status = 'accepted'
  where id = p_request_id;
end;
$$;

revoke all on function public.respond_social_request(bigint,text) from public;
grant execute on function public.respond_social_request(bigint,text) to authenticated;

-- 7) Finalizar: una sola actualización de conversations dispara el trigger transaccional.
create or replace function public.end_conversation(p_conversation_id bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    where cm.conversation_id = p_conversation_id
      and cm.user_id = auth.uid()
      and cm.left_at is null
      and c.status = 'active'
  ) then
    -- Poka-yoke: si la conversación ya terminó, repara al usuario y no falla duro.
    perform public.repair_social_status_for_user(auth.uid());
    return;
  end if;

  update public.conversations
  set status = 'ended', ended_at = coalesce(ended_at, now())
  where id = p_conversation_id
    and status = 'active';

  -- Defensa adicional por si el trigger fue deshabilitado accidentalmente.
  perform public.repair_social_status_for_user(auth.uid());
end;
$$;

revoke all on function public.end_conversation(bigint) from public;
grant execute on function public.end_conversation(bigint) to authenticated;

-- 8) Limpieza inicial de cualquier busy huérfano ya existente.
update public.presence p
set social_status = 'available'
where p.social_status = 'busy'
  and not exists (
    select 1
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    where cm.user_id = p.user_id
      and cm.left_at is null
      and c.status = 'active'
  );
