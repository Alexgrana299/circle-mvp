-- Circle: salida robusta de presencia
-- Ejecutar después de conversations_upgrade.sql/state_integrity_upgrade.sql.

create or replace function public.leave_circle()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Si el usuario estaba en una conversación, terminarla primero.
  -- Los triggers de conversación existentes liberan al resto de miembros.
  update public.conversations c
     set status = 'ended',
         ended_at = coalesce(c.ended_at, now())
   where c.status = 'active'
     and exists (
       select 1
         from public.conversation_members cm
        where cm.conversation_id = c.id
          and cm.user_id = uid
     );

  -- El usuario que cierra sesión no debe seguir apareciendo en nearby_profiles.
  update public.presence
     set is_available = false,
         social_status = 'available'
   where user_id = uid;
end;
$$;

revoke all on function public.leave_circle() from public;
grant execute on function public.leave_circle() to authenticated;
