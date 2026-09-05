-- Circle · radio real preciso (37.5 m)
-- Ejecuta este archivo UNA VEZ en Supabase SQL Editor.
-- No reemplaza otras funciones sociales; agrega un RPC específico para el radar.

create or replace function public.nearby_profiles_precise(
  user_lat double precision,
  user_lng double precision,
  radius_meters double precision
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
stable
security definer
set search_path = public, pg_temp
as $$
  with origin as (
    select ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography as g
  )
  select
    p.id,
    p.display_name,
    p.bio,
    p.avatar_url,
    p.interests,
    p.intent,
    case
      when exists (
        select 1
        from public.conversation_members cm
        join public.conversations c on c.id = cm.conversation_id
        where cm.user_id = p.id
          and cm.left_at is null
          and c.status = 'active'
      ) then 'busy'::text
      else 'available'::text
    end as social_status
  from public.profiles p
  join public.presence pr on pr.user_id = p.id
  cross join origin o
  where auth.uid() is not null
    and p.id <> auth.uid()
    and pr.is_available = true
    and pr.location is not null
    and ST_DWithin(pr.location, o.g, radius_meters)
  order by ST_Distance(pr.location, o.g)
  limit 100;
$$;

revoke all on function public.nearby_profiles_precise(
  double precision,
  double precision,
  double precision
) from public;

grant execute on function public.nearby_profiles_precise(
  double precision,
  double precision,
  double precision
) to authenticated;
