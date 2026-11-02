begin;

create table if not exists public.room_season_hall (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  league_name text not null check (char_length(btrim(league_name)) between 1 and 80),
  season_start_year smallint not null check (season_start_year between 2000 and 2100),
  winner_user_id uuid,
  winner_name text not null,
  winner_points integer not null check (winner_points >= 0),
  last_user_id uuid,
  last_name text not null,
  last_points integer not null check (last_points >= 0),
  scoreboard jsonb not null check (
    jsonb_typeof(scoreboard) = 'array'
    and jsonb_array_length(scoreboard) > 0
  ),
  archived_at timestamptz not null default now(),
  unique (room_id, season_start_year)
);

create index if not exists room_season_hall_by_room
  on public.room_season_hall (room_id, season_start_year desc);

alter table public.room_season_hall enable row level security;
revoke all on public.room_season_hall from public, anon, authenticated;
grant select on public.room_season_hall to authenticated;
grant all on public.room_season_hall to service_role;

drop policy if exists "League members read hall of fame" on public.room_season_hall;
create policy "League members read hall of fame"
  on public.room_season_hall for select to authenticated
  using (public.is_league_member(room_id));

create table if not exists public.room_dinner_history (
  id uuid primary key default gen_random_uuid(),
  source_debt_id uuid not null unique,
  room_id uuid not null,
  user_id uuid,
  display_name text not null,
  amount numeric(8, 2) not null check (amount > 0),
  description text not null,
  paid_at timestamptz not null
);

create index if not exists room_dinner_history_by_room_paid
  on public.room_dinner_history (room_id, paid_at desc);
create index if not exists room_dinner_history_by_user
  on public.room_dinner_history (room_id, user_id);

alter table public.room_dinner_history enable row level security;
revoke all on public.room_dinner_history from public, anon, authenticated;
grant select on public.room_dinner_history to authenticated;
grant all on public.room_dinner_history to service_role;

drop policy if exists "League members read dinner history" on public.room_dinner_history;
create policy "League members read dinner history"
  on public.room_dinner_history for select to authenticated
  using (public.is_league_member(room_id));

create or replace function public.record_room_paid_debt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_name text;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    select member.display_name into member_name
    from public.league_members member
    where member.league_id = new.room_id
      and member.user_id = new.debtor_user_id;

    insert into public.room_dinner_history (
      source_debt_id, room_id, user_id, display_name, amount, description, paid_at
    ) values (
      new.id, new.room_id, new.debtor_user_id,
      coalesce(member_name, 'Miembro'), new.amount, new.description,
      coalesce(new.paid_at, now())
    )
    on conflict (source_debt_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.record_room_paid_debt() from public, anon, authenticated;
drop trigger if exists record_room_paid_debt on public.room_debts;
create trigger record_room_paid_debt
  after update of status on public.room_debts
  for each row execute function public.record_room_paid_debt();

insert into public.room_dinner_history (
  source_debt_id, room_id, user_id, display_name, amount, description, paid_at
)
select debt.id, debt.room_id, debt.debtor_user_id,
       coalesce(member.display_name, 'Miembro'), debt.amount,
       debt.description, coalesce(debt.paid_at, debt.created_at)
from public.room_debts debt
left join public.league_members member
  on member.league_id = debt.room_id
 and member.user_id = debt.debtor_user_id
where debt.status = 'paid'
on conflict (source_debt_id) do nothing;

create or replace function public.archive_room_season(
  p_room_id uuid,
  p_season_start_year smallint,
  p_league_name text,
  p_scoreboard jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  archived_id uuid;
  champion jsonb;
  last_place jsonb;
  player jsonb;
  rank_position integer := 1;
begin
  if not public.is_room_admin(p_room_id) then
    raise exception 'Only the room administrator can archive a season';
  end if;
  if p_season_start_year is null or p_season_start_year not between 2000 and 2100 then
    raise exception 'Invalid season start year';
  end if;
  if p_league_name is null or char_length(btrim(p_league_name)) not between 1 and 80 then
    raise exception 'League name must contain 1 to 80 characters';
  end if;
  if p_scoreboard is null or jsonb_typeof(p_scoreboard) <> 'array' then
    raise exception 'Season scoreboard must be an array';
  end if;
  if jsonb_array_length(p_scoreboard) < 1 then
    raise exception 'Season scoreboard must contain at least one player';
  end if;
  if jsonb_array_length(p_scoreboard) <> (
    select count(*) from public.league_members member
    where member.league_id = p_room_id
  ) then
    raise exception 'Season scoreboard must include every league member';
  end if;
  for player in select value from jsonb_array_elements(p_scoreboard) loop
    if jsonb_typeof(player) <> 'object'
       or nullif(btrim(player ->> 'name'), '') is null
       or coalesce(player ->> 'points', '') !~ '^[0-9]+$'
       or coalesce(player ->> 'position', '') !~ '^[1-9][0-9]*$'
       or (player ->> 'position')::integer <> rank_position
       or not exists (
         select 1 from public.league_members member
         where member.league_id = p_room_id
           and member.user_id = nullif(player ->> 'user_id', '')::uuid
       ) then
      raise exception 'Season scoreboard entries are invalid';
    end if;
    rank_position := rank_position + 1;
  end loop;

  champion := p_scoreboard -> 0;
  last_place := p_scoreboard -> (jsonb_array_length(p_scoreboard) - 1);
  if jsonb_typeof(champion) <> 'object'
     or jsonb_typeof(last_place) <> 'object'
     or nullif(btrim(champion ->> 'name'), '') is null
     or nullif(btrim(last_place ->> 'name'), '') is null
     or coalesce(champion ->> 'points', '') !~ '^[0-9]+$'
     or coalesce(last_place ->> 'points', '') !~ '^[0-9]+$' then
    raise exception 'Season scoreboard entries are invalid';
  end if;

  insert into public.room_season_hall (
    room_id, league_name, season_start_year,
    winner_user_id, winner_name, winner_points,
    last_user_id, last_name, last_points, scoreboard
  ) values (
    p_room_id, btrim(p_league_name), p_season_start_year,
    nullif(champion ->> 'user_id', '')::uuid,
    btrim(champion ->> 'name'), (champion ->> 'points')::integer,
    nullif(last_place ->> 'user_id', '')::uuid,
    btrim(last_place ->> 'name'), (last_place ->> 'points')::integer,
    p_scoreboard
  )
  on conflict (room_id, season_start_year) do nothing
  returning id into archived_id;

  if archived_id is null then
    select entry.id into archived_id
    from public.room_season_hall entry
    where entry.room_id = p_room_id
      and entry.season_start_year = p_season_start_year;
  end if;
  return archived_id;
end;
$$;

revoke all on function public.archive_room_season(uuid, smallint, text, jsonb)
  from public, anon;
grant execute on function public.archive_room_season(uuid, smallint, text, jsonb)
  to authenticated;

create or replace function public.get_room_hall_of_fame(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_league_member(p_room_id) then
    raise exception 'League membership required';
  end if;

  select jsonb_build_object(
    'seasons', coalesce((
      select jsonb_agg(to_jsonb(season) order by season.season_start_year desc)
      from public.room_season_hall season
      where season.room_id = p_room_id
    ), '[]'::jsonb),
    'dinners', coalesce((
      select jsonb_agg(to_jsonb(ranking) order by ranking.meals desc, ranking.amount desc, ranking.display_name)
      from (
        select history.user_id,
               (array_agg(history.display_name order by history.paid_at desc, history.source_debt_id))[1] as display_name,
               count(*)::integer as meals,
               sum(history.amount)::numeric(12, 2) as amount
        from public.room_dinner_history history
        where history.room_id = p_room_id
        group by history.user_id
      ) ranking
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_room_hall_of_fame(uuid) from public, anon;
grant execute on function public.get_room_hall_of_fame(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'room_season_hall'
     ) then
    alter publication supabase_realtime add table public.room_season_hall;
  end if;
end;
$$;

commit;
