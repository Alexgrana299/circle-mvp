-- CIRCLE · Sincronización simétrica de conversaciones
-- Ejecuta DESPUÉS de conversations_upgrade.sql, realtime_upgrade.sql y state_integrity_upgrade.sql.
-- Objetivo: una conversación activa es la única fuente de verdad para el estado "busy".

-- 1) Helper interno: estado efectivo derivado de conversaciones activas.
create or replace function public.effective_social_status(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when exists (
    select 1
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    where cm.user_id = p_user_id
      and cm.left_at is null
      and c.status = 'active'
  ) then 'busy'::text else 'available'::text end;
$$;

revoke all on function public.effective_social_status(uuid) from public;

-- 2) Poka-yoke: cada alta a una conversación activa fuerza inmediatamente busy.
create or replace function public.mark_member_busy_on_join()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.conversations c
    where c.id = new.conversation_id and c.status = 'active'
  ) then
    update public.presence
    set social_status = 'busy'
    where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mark_member_busy_on_join on public.conversation_members;
create trigger trg_mark_member_busy_on_join
after insert on public.conversation_members
for each row
execute function public.mark_member_busy_on_join();

-- 3) nearby_profiles ya NO confía en presence.social_status.
--    Deriva el estado de la conversación activa, evitando que un cliente vea
--    "Disponible" mientras la persona ya está conversando.
drop function if exists public.nearby_profiles(double precision,double precision,integer);

create function public.nearby_profiles(
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
        and nullif(trim(coalesce(my_presence.specific_location,'')), '') is not null
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

-- 4) Reparación inmediata de todos los estados actuales según conversaciones reales.
update public.presence p
set social_status = public.effective_social_status(p.user_id)
where p.social_status is distinct from public.effective_social_status(p.user_id);
