-- CIRCLE · Profile upgrade
-- Run once in Supabase SQL Editor after the original schema.sql.

-- 1) Avatar storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 12582912, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Only the owner may upload/change/delete files in their own first-level folder.
drop policy if exists "avatar public read" on storage.objects;
create policy "avatar public read" on storage.objects
for select using (bucket_id = 'avatars');

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar" on storage.objects
for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users update own avatar" on storage.objects;
create policy "users update own avatar" on storage.objects
for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete own avatar" on storage.objects;
create policy "users delete own avatar" on storage.objects
for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 2) Nearby users. Avatar URLs are returned only when the CURRENT user's own
-- profile is complete. This implements the product rule at the RPC layer too.
create or replace function public.nearby_profiles(user_lat double precision, user_lng double precision, radius_meters integer default 75)
returns table (
  id uuid,
  display_name text,
  bio text,
  avatar_url text,
  interests text[],
  intent text
)
language sql
security invoker
set search_path = public
as $$
  with viewer as (
    select exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and nullif(trim(me.display_name), '') is not null
        and nullif(trim(coalesce(me.bio,'')), '') is not null
        and nullif(trim(coalesce(me.avatar_url,'')), '') is not null
        and nullif(trim(coalesce(me.intent,'')), '') is not null
        and cardinality(me.interests) > 0
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
  where pr.is_available = true
    and pr.last_seen > now() - interval '5 minutes'
    and pr.user_id <> auth.uid()
    and ST_DWithin(pr.location, ST_SetSRID(ST_MakePoint(user_lng, user_lat),4326)::geography, radius_meters)
  order by pr.last_seen desc
  limit 20;
$$;
