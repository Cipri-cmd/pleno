begin;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  avatar_path text,
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from anon, authenticated;
grant select, insert, update on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;

drop policy if exists "League members read profile avatars" on public.user_profiles;
create policy "League members read profile avatars"
  on public.user_profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.league_members viewer
      join public.league_members owner
        on owner.league_id = viewer.league_id
      where viewer.user_id = (select auth.uid())
        and owner.user_id = user_profiles.user_id
    )
  );

drop policy if exists "Users insert own profile" on public.user_profiles;
create policy "Users insert own profile"
  on public.user_profiles for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      avatar_path is null
      or avatar_path ~ ('^' || (select auth.uid())::text || '/[^/]+[.]webp$')
    )
  );

drop policy if exists "Users update own profile" on public.user_profiles;
create policy "Users update own profile"
  on public.user_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      avatar_path is null
      or avatar_path ~ ('^' || (select auth.uid())::text || '/[^/]+[.]webp$')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-avatars', 'room-avatars', false, 2097152, array['image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "League members can read avatars" on storage.objects;
create policy "League members can read avatars"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'room-avatars'
    and exists (
      select 1
      from public.league_members viewer
      join public.league_members owner
        on owner.league_id = viewer.league_id
      where viewer.user_id = (select auth.uid())
        and owner.user_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'room-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'room-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'room-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'room-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
