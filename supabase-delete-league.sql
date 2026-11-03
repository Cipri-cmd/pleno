begin;

alter table public.leagues
  add column if not exists owner_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leagues_owner_id_fkey'
      and conrelid = 'public.leagues'::regclass
  ) then
    alter table public.leagues
      add constraint leagues_owner_id_fkey
      foreign key (owner_id) references auth.users(id) on delete set null;
  end if;
end;
$$;

update public.leagues league
set owner_id = (
  select member.user_id
  from public.league_members member
  where member.league_id = league.id
  order by member.joined_at asc, member.user_id asc
  limit 1
)
where league.owner_id is null
  and exists (
    select 1
    from public.league_members member
    where member.league_id = league.id
  );

grant select (owner_id) on public.leagues to authenticated;

create or replace function public.capture_league_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.owner_id := (select auth.uid());
    end if;
  else
    if new.owner_id is distinct from old.owner_id then
      if old.owner_id is distinct from (select auth.uid()) then
        raise exception 'Only the current owner can transfer the league';
      end if;
      if new.owner_id is not null and not exists (
        select 1
        from public.league_members member
        where member.league_id = old.id
          and member.user_id = new.owner_id
      ) then
        raise exception 'The new owner must be a league member';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.capture_league_owner() from public, anon, authenticated;
drop trigger if exists capture_league_owner on public.leagues;
create trigger capture_league_owner
  before insert or update on public.leagues
  for each row execute function public.capture_league_owner();

create or replace function public.delete_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_league_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select league.id into locked_league_id
  from public.leagues league
  where league.id = p_league_id
    and league.owner_id = (select auth.uid())
  for update;

  if locked_league_id is null then
    raise exception 'Only the league creator can delete this league';
  end if;

  delete from public.predictions
  where league_id = locked_league_id;

  if to_regclass('public.league_duel_slots') is not null then
    execute 'delete from public.league_duel_slots where league_id = $1'
      using locked_league_id;
  end if;
  if to_regclass('public.room_dinner_history') is not null then
    execute 'delete from public.room_dinner_history where room_id = $1'
      using locked_league_id;
  end if;
  if to_regclass('public.room_season_hall') is not null then
    execute 'delete from public.room_season_hall where room_id = $1'
      using locked_league_id;
  end if;

  delete from public.league_members
  where league_id = locked_league_id;

  delete from public.leagues
  where id = locked_league_id
    and owner_id = (select auth.uid());

  if not found then
    raise exception 'The league could not be deleted';
  end if;
end;
$$;

revoke all on function public.delete_league(uuid) from public, anon;
grant execute on function public.delete_league(uuid) to authenticated;

create or replace function public.leave_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := (select auth.uid());
  current_owner uuid;
  next_owner uuid;
begin
  if player is null then
    raise exception 'Authentication required';
  end if;

  select league.owner_id into current_owner
  from public.leagues league
  where league.id = p_league_id
  for update;

  if not found or not exists (
    select 1
    from public.league_members member
    where member.league_id = p_league_id
      and member.user_id = player
  ) then
    raise exception 'You are not a member of this league';
  end if;

  if current_owner = player then
    select member.user_id into next_owner
    from public.league_members member
    where member.league_id = p_league_id
      and member.user_id <> player
    order by member.joined_at asc, member.user_id asc
    limit 1;

    if next_owner is null then
      perform public.delete_league(p_league_id);
      return;
    end if;

    update public.leagues
    set owner_id = next_owner
    where id = p_league_id;
  end if;

  delete from public.league_members
  where league_id = p_league_id
    and user_id = player;

  if not found then
    raise exception 'Could not leave the league';
  end if;
end;
$$;

revoke all on function public.leave_league(uuid) from public, anon;
grant execute on function public.leave_league(uuid) to authenticated;

commit;
