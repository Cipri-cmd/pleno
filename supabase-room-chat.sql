begin;

create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null,
  message text not null check (char_length(btrim(message)) between 1 and 500),
  created_at timestamptz not null default now(),
  foreign key (room_id, user_id)
    references public.league_members(league_id, user_id) on delete cascade
);

create index if not exists room_messages_recent
  on public.room_messages (room_id, created_at desc, id desc);

alter table public.room_messages enable row level security;
revoke all on public.room_messages from anon, authenticated;
grant select, insert on public.room_messages to authenticated;
grant all on public.room_messages to service_role;

drop policy if exists "League members read room messages" on public.room_messages;
create policy "League members read room messages"
  on public.room_messages for select to authenticated
  using (public.is_league_member(room_id));

drop policy if exists "League members send own room messages" on public.room_messages;
create policy "League members send own room messages"
  on public.room_messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_league_member(room_id)
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'room_messages'
    ) then
    alter publication supabase_realtime add table public.room_messages;
  end if;
end;
$$;

commit;
