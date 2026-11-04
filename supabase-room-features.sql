begin;

create table if not exists public.room_debts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.leagues(id) on delete cascade,
  debtor_user_id uuid not null,
  amount numeric(8, 2) not null check (amount > 0 and amount <= 10000),
  description text not null check (char_length(description) between 1 and 120),
  status text not null default 'pending'
    check (status in ('pending', 'payment_reported', 'paid')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  payment_reported_at timestamptz,
  paid_at timestamptz,
  foreign key (room_id, debtor_user_id)
    references public.league_members(league_id, user_id) on delete cascade,
  check (
    (status = 'pending' and payment_reported_at is null and paid_at is null)
    or (status = 'payment_reported' and payment_reported_at is not null and paid_at is null)
    or (status = 'paid' and payment_reported_at is not null and paid_at is not null)
  )
);

create index if not exists room_debts_by_room_status
  on public.room_debts (room_id, status, created_at desc);
create index if not exists room_debts_by_debtor
  on public.room_debts (room_id, debtor_user_id, created_at desc);

alter table public.room_debts enable row level security;
revoke all on public.room_debts from anon, authenticated;
grant select on public.room_debts to authenticated;
grant all on public.room_debts to service_role;

drop policy if exists "League members read room debts" on public.room_debts;
create policy "League members read room debts"
  on public.room_debts for select to authenticated
  using (public.is_league_member(room_id));

create table if not exists public.room_chronicles (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.leagues(id) on delete cascade,
  season_start_year smallint not null check (season_start_year between 2000 and 2100),
  matchday smallint not null check (matchday between 1 and 60),
  content text not null check (char_length(content) between 1 and 4000),
  scoreboard jsonb not null default '[]'::jsonb
    check (jsonb_typeof(scoreboard) = 'array'),
  created_at timestamptz not null default now(),
  unique (room_id, season_start_year, matchday)
);

create index if not exists room_chronicles_by_room
  on public.room_chronicles (room_id, season_start_year desc, matchday desc);

alter table public.room_chronicles enable row level security;
revoke all on public.room_chronicles from anon, authenticated;
grant select on public.room_chronicles to authenticated;
grant all on public.room_chronicles to service_role;

drop policy if exists "League members read room chronicles" on public.room_chronicles;
create policy "League members read room chronicles"
  on public.room_chronicles for select to authenticated
  using (public.is_league_member(room_id));

create or replace function public.is_room_admin(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.league_members member
    where member.league_id = p_room_id
      and member.user_id = (select auth.uid())
      and member.user_id = (
        select first_member.user_id
        from public.league_members first_member
        where first_member.league_id = p_room_id
        order by first_member.joined_at asc, first_member.user_id asc
        limit 1
      )
  );
$$;

revoke all on function public.is_room_admin(uuid) from public, anon;
grant execute on function public.is_room_admin(uuid) to authenticated;

create or replace function public.create_room_debt(
  p_room_id uuid,
  p_debtor_user_id uuid,
  p_amount numeric,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  debt_id uuid;
begin
  if not public.is_room_admin(p_room_id) then
    raise exception 'Only the room administrator can create a debt';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000 then
    raise exception 'Debt amount must be between 0 and 10000';
  end if;
  if p_description is null or char_length(btrim(p_description)) not between 1 and 120 then
    raise exception 'Debt description must contain 1 to 120 characters';
  end if;
  if not exists (
    select 1 from public.league_members member
    where member.league_id = p_room_id
      and member.user_id = p_debtor_user_id
  ) then
    raise exception 'The debtor must be a member of this room';
  end if;

  insert into public.room_debts (
    room_id, debtor_user_id, amount, description, created_by
  ) values (
    p_room_id, p_debtor_user_id, round(p_amount, 2),
    btrim(p_description), (select auth.uid())
  )
  returning id into debt_id;
  return debt_id;
end;
$$;

create or replace function public.report_room_debt_payment(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.room_debts
  set status = 'payment_reported',
      payment_reported_at = now()
  where id = p_debt_id
    and debtor_user_id = (select auth.uid())
    and status = 'pending';
  if not found then
    raise exception 'Debt not found or payment cannot be reported';
  end if;
end;
$$;

create or replace function public.confirm_room_debt_payment(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  debt_room_id uuid;
begin
  select room_id into debt_room_id
  from public.room_debts
  where id = p_debt_id and status = 'payment_reported'
  for update;
  if debt_room_id is null then
    raise exception 'Reported debt not found';
  end if;
  if not public.is_room_admin(debt_room_id) then
    raise exception 'Only the room administrator can confirm payment';
  end if;

  update public.room_debts
  set status = 'paid', paid_at = now()
  where id = p_debt_id and status = 'payment_reported';
end;
$$;

revoke all on function public.create_room_debt(uuid, uuid, numeric, text)
  from public, anon;
revoke all on function public.report_room_debt_payment(uuid)
  from public, anon;
revoke all on function public.confirm_room_debt_payment(uuid)
  from public, anon;
grant execute on function public.create_room_debt(uuid, uuid, numeric, text)
  to authenticated;
grant execute on function public.report_room_debt_payment(uuid)
  to authenticated;
grant execute on function public.confirm_room_debt_payment(uuid)
  to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'room_debts'
    ) then
      alter publication supabase_realtime add table public.room_debts;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'room_chronicles'
    ) then
      alter publication supabase_realtime add table public.room_chronicles;
    end if;
  end if;
end;
$$;

commit;
