-- CIRCLE · "Cómo encontrarme" privacy upgrade
-- Run ONCE in Supabase SQL Editor after schema.sql + profile_upgrade.sql.
-- Internal database column remains presence.specific_location; the product label is "Cómo encontrarme".

-- 1) Users without "Cómo encontrarme" cannot remain publicly available.
update public.presence
set is_available = false
where nullif(trim(coalesce(specific_location, '')), '') is null;

alter table public.presence
  drop constraint if exists available_requires_how_to_find_me;

alter table public.presence
  add constraint available_requires_how_to_find_me
  check (
    is_available = false
    or nullif(trim(coalesce(specific_location, '')), '') is not null
  );

-- 2) Lock raw tables. Other users should never be able to query private profile/presence rows directly.
drop policy if exists "profiles readable" on public.profiles;
drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles
for select to authenticated
using (auth.uid() = id);

drop policy if exists "presence readable" on public.presence;
drop policy if exists "users read own presence" on public.presence;
create policy "users read own presence" on public.presence
for select to authenticated
using (auth.uid() = user_id);

-- 3) Safe nearby search. It deliberately NEVER returns specific_location.
-- Avatar is returned only when the viewer has a complete profile, including "Cómo encontrarme".
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
  intent text
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
  )
  select
    p.id,
    p.display_name,
    p.bio,
    case when viewer.profile_complete then p.avatar_url else null end as avatar_url,
    p.interests,
    p.intent
  from public.presence pr
  join public.profiles p on p.id = pr.user_id
  cross join viewer
  where auth.uid() is not null
    and pr.is_available = true
    and pr.last_seen > now() - interval '5 minutes'
    and pr.user_id <> auth.uid()
    and ST_DWithin(
      pr.location,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat),4326)::geography,
      radius_meters
    )
  order by pr.last_seen desc
  limit 20;
$$;

revoke all on function public.nearby_profiles(double precision,double precision,integer) from public;
grant execute on function public.nearby_profiles(double precision,double precision,integer) to authenticated;

-- 4) Consent-aware access to "Cómo encontrarme".
-- Receiver of a PENDING request may see the SENDER's reference before deciding.
-- Sender may see the RECEIVER's reference only after ACCEPTED.
-- Once accepted, either participant may still retrieve the other participant's reference.
create or replace function public.request_how_to_find_me(p_request_id bigint)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() = sr.receiver_id and sr.status in ('pending','accepted')
      then sender_presence.specific_location
    when auth.uid() = sr.sender_id and sr.status = 'accepted'
      then receiver_presence.specific_location
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

-- Keep the old helper aligned with the new rule for backwards compatibility:
-- after acceptance, it returns the OTHER participant's reference.
create or replace function public.accepted_specific_location(request_id bigint)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select pr.specific_location
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
