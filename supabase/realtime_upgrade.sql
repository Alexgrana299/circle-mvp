-- CIRCLE · Realtime social sync
-- Run ONCE after conversations_upgrade.sql.
-- Enables realtime events for requests and the authenticated user's own conversation membership.

-- conversation_members originally has no direct SELECT policy because the app uses secure RPCs.
-- Realtime needs a SELECT policy to deliver only the signed-in user's own membership row.
drop policy if exists "users read own conversation membership" on public.conversation_members;
create policy "users read own conversation membership"
on public.conversation_members
for select to authenticated
using (auth.uid() = user_id);

-- Add the tables to Supabase Realtime publication if they are not already present.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'social_requests'
  ) then
    alter publication supabase_realtime add table public.social_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_members'
  ) then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end $$;
