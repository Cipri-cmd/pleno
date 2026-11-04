begin;

create table if not exists public.user_legal_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null check (char_length(terms_version) between 1 and 20),
  accepted_at timestamptz not null default now(),
  age_confirmed_at timestamptz
);

alter table public.user_legal_consents
  add column if not exists age_confirmed_at timestamptz;

alter table public.user_legal_consents enable row level security;
revoke all on public.user_legal_consents from public, anon, authenticated;
grant select, insert, update on public.user_legal_consents to authenticated;

drop policy if exists "Users read their own legal consent" on public.user_legal_consents;
create policy "Users read their own legal consent"
  on public.user_legal_consents for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users record their own legal consent" on public.user_legal_consents;
create policy "Users record their own legal consent"
  on public.user_legal_consents for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users update their own legal consent" on public.user_legal_consents;
create policy "Users update their own legal consent"
  on public.user_legal_consents for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.room_debts
  alter column created_by drop not null;
alter table public.room_debts
  drop constraint if exists room_debts_created_by_fkey;
alter table public.room_debts
  add constraint room_debts_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

create table if not exists public.room_user_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

alter table public.room_user_blocks enable row level security;
revoke all on public.room_user_blocks from public, anon, authenticated;
grant select, insert, delete on public.room_user_blocks to authenticated;

drop policy if exists "Users read their own chat blocks" on public.room_user_blocks;
create policy "Users read their own chat blocks"
  on public.room_user_blocks for select to authenticated
  using (blocker_user_id = (select auth.uid()));

drop policy if exists "Users block other chat members" on public.room_user_blocks;
create policy "Users block other chat members"
  on public.room_user_blocks for insert to authenticated
  with check (
    blocker_user_id = (select auth.uid())
    and blocked_user_id <> (select auth.uid())
  );

drop policy if exists "Users remove their own chat blocks" on public.room_user_blocks;
create policy "Users remove their own chat blocks"
  on public.room_user_blocks for delete to authenticated
  using (blocker_user_id = (select auth.uid()));

create table if not exists public.room_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.room_messages(id) on delete cascade,
  room_id uuid not null references public.leagues(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (message_id, reporter_user_id),
  check (reporter_user_id <> reported_user_id)
);

create index if not exists room_message_reports_review_queue
  on public.room_message_reports (created_at desc);
alter table public.room_message_reports enable row level security;
revoke all on public.room_message_reports from public, anon, authenticated;
grant select, insert on public.room_message_reports to authenticated;
grant all on public.room_message_reports to service_role;

drop policy if exists "Users read their own message reports" on public.room_message_reports;
create policy "Users read their own message reports"
  on public.room_message_reports for select to authenticated
  using (reporter_user_id = (select auth.uid()));

drop policy if exists "League members report messages" on public.room_message_reports;
create policy "League members report messages"
  on public.room_message_reports for insert to authenticated
  with check (
    reporter_user_id = (select auth.uid())
    and reported_user_id <> (select auth.uid())
    and public.is_league_member(room_id)
    and exists (
      select 1
      from public.room_messages message
      where message.id = room_message_reports.message_id
        and message.room_id = room_message_reports.room_id
        and message.user_id = room_message_reports.reported_user_id
    )
  );

commit;
