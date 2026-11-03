begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter table public.league_matches
  add column if not exists matchday smallint,
  add column if not exists status text,
  add column if not exists home_goals smallint,
  add column if not exists away_goals smallint;

create table if not exists public.prediction_match_scores (
  league_id uuid not null,
  user_id uuid not null,
  match_id bigint not null,
  base_points smallint not null check (base_points in (0, 3, 7, 10)),
  points smallint not null check (points in (0, 3, 6, 7, 10, 14, 20)),
  tier text not null check (tier in ('exact', 'difference', 'sign', 'miss')),
  settled_at timestamptz not null default now(),
  primary key (league_id, user_id, match_id)
);

create index if not exists prediction_match_scores_by_league_user
  on public.prediction_match_scores (league_id, user_id, match_id);

alter table public.prediction_match_scores enable row level security;
revoke all on public.prediction_match_scores from public, anon, authenticated;
grant all on public.prediction_match_scores to service_role;

create or replace function private.score_prediction(
  p_predicted_home smallint,
  p_predicted_away smallint,
  p_actual_home smallint,
  p_actual_away smallint,
  p_joker boolean,
  p_red_card boolean
)
returns table(base_points smallint, points smallint, tier text)
language plpgsql
immutable
set search_path = ''
as $$
begin
  base_points := case
    when p_predicted_home = p_actual_home and p_predicted_away = p_actual_away then 10
    when sign(p_predicted_home - p_predicted_away) = sign(p_actual_home - p_actual_away)
      and p_predicted_home - p_predicted_away = p_actual_home - p_actual_away then 7
    when sign(p_predicted_home - p_predicted_away) = sign(p_actual_home - p_actual_away) then 3
    else 0
  end;
  tier := case base_points
    when 10 then 'exact'
    when 7 then 'difference'
    when 3 then 'sign'
    else 'miss'
  end;
  points := case when p_red_card then 0
    else base_points * case when p_joker then 2 else 1 end
  end;
  return next;
end;
$$;
revoke all on function private.score_prediction(smallint, smallint, smallint, smallint, boolean, boolean)
  from public, anon, authenticated;

create or replace function public.validate_prediction_joker()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_matchday smallint;
begin
  if new.joker is not true then
    return new;
  end if;

  select fixture.matchday into fixture_matchday
  from public.league_matches fixture
  where fixture.match_id = new.match_id;

  if fixture_matchday is null then
    raise exception 'Cannot use a Joker without a scheduled matchday';
  end if;

  perform pg_advisory_xact_lock(hashtext(new.league_id::text || ':' || new.user_id::text || ':' || fixture_matchday::text));
  if exists (
    select 1
    from public.predictions other_prediction
    join public.league_matches other_fixture
      on other_fixture.match_id = other_prediction.match_id
    where other_prediction.league_id = new.league_id
      and other_prediction.user_id = new.user_id
      and other_fixture.matchday = fixture_matchday
      and other_prediction.joker is true
      and other_prediction.match_id <> new.match_id
  ) then
    raise exception 'Only one Joker can be used per matchday';
  end if;

  return new;
end;
$$;
revoke all on function public.validate_prediction_joker() from public, anon, authenticated;

drop trigger if exists validate_prediction_joker on public.predictions;
create trigger validate_prediction_joker
  before insert or update of joker on public.predictions
  for each row execute function public.validate_prediction_joker();

create or replace function private.refresh_prediction_match_scores(p_match_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.prediction_match_scores (
    league_id, user_id, match_id, base_points, points, tier, settled_at
  )
  select
    prediction.league_id,
    prediction.user_id,
    prediction.match_id,
    score.base_points,
    score.points,
    score.tier,
    now()
  from public.predictions prediction
  join public.league_matches fixture on fixture.match_id = prediction.match_id
  cross join lateral private.score_prediction(
    prediction.home_goals,
    prediction.away_goals,
    fixture.home_goals,
    fixture.away_goals,
    prediction.joker,
    exists (
      select 1
      from public.minigame_sabotages sabotage
      where sabotage.league_id = prediction.league_id
        and sabotage.target_user_id = prediction.user_id
        and sabotage.match_id = prediction.match_id
    )
  ) score
  where prediction.match_id = p_match_id
    and fixture.status = 'FINISHED'
    and fixture.home_goals is not null
    and fixture.away_goals is not null
  on conflict (league_id, user_id, match_id) do update
    set base_points = excluded.base_points,
        points = excluded.points,
        tier = excluded.tier,
        settled_at = excluded.settled_at;
end;
$$;
revoke all on function private.refresh_prediction_match_scores(bigint)
  from public, anon, authenticated;

create or replace function public.refresh_scores_for_finished_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'FINISHED'
    and new.home_goals is not null
    and new.away_goals is not null then
    perform private.refresh_prediction_match_scores(new.match_id);
  end if;
  return new;
end;
$$;
revoke all on function public.refresh_scores_for_finished_match() from public, anon, authenticated;

drop trigger if exists refresh_scores_for_finished_match on public.league_matches;
create trigger refresh_scores_for_finished_match
  after insert or update of status, home_goals, away_goals on public.league_matches
  for each row execute function public.refresh_scores_for_finished_match();

create or replace function public.refresh_score_for_prediction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_prediction_match_scores(new.match_id);
  return new;
end;
$$;
revoke all on function public.refresh_score_for_prediction() from public, anon, authenticated;

drop trigger if exists refresh_score_for_prediction on public.predictions;
create trigger refresh_score_for_prediction
  after insert or update of home_goals, away_goals, joker on public.predictions
  for each row execute function public.refresh_score_for_prediction();

create or replace function private.league_scoreboard_rows(
  p_league_id uuid,
  p_matchday smallint,
  p_season_start_year smallint
)
returns table(
  user_id uuid,
  display_name text,
  points bigint,
  exact_scores bigint,
  seven_points bigint,
  three_points bigint,
  played bigint,
  is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    member.user_id,
    member.display_name,
    coalesce(match_scores.points, 0)
      + coalesce(minute_scores.points, 0)
      + coalesce(round_scores.points, 0) as points,
    coalesce(match_scores.exact_scores, 0) as exact_scores,
    coalesce(match_scores.seven_points, 0) as seven_points,
    coalesce(match_scores.three_points, 0) as three_points,
    coalesce(match_scores.played, 0) as played,
    member.user_id = (select auth.uid()) as is_me
  from public.league_members member
  left join lateral (
    select
      coalesce(sum(score.points), 0)::bigint as points,
      count(*) filter (where score.tier = 'exact' and score.points > 0)::bigint as exact_scores,
      count(*) filter (where score.tier = 'difference' and score.points > 0)::bigint as seven_points,
      count(*) filter (where score.tier = 'sign' and score.points > 0)::bigint as three_points,
      count(*)::bigint as played
    from public.prediction_match_scores score
    join public.league_matches fixture on fixture.match_id = score.match_id
    where score.league_id = member.league_id
      and score.user_id = member.user_id
      and (p_matchday is null or fixture.matchday = p_matchday)
      and (
        p_season_start_year is null
        or (
          fixture.kickoff >= make_date(p_season_start_year, 7, 1)::timestamptz
          and fixture.kickoff < make_date(p_season_start_year + 1, 7, 1)::timestamptz
        )
      )
  ) match_scores on true
  left join lateral (
    select coalesce(sum(prediction.points), 0)::bigint as points
    from public.minute_of_gold_predictions prediction
    join public.league_matches fixture on fixture.match_id = prediction.match_id
    where prediction.league_id = member.league_id
      and prediction.user_id = member.user_id
      and prediction.settled
      and (p_matchday is null or fixture.matchday = p_matchday)
      and (
        p_season_start_year is null
        or (
          fixture.kickoff >= make_date(p_season_start_year, 7, 1)::timestamptz
          and fixture.kickoff < make_date(p_season_start_year + 1, 7, 1)::timestamptz
        )
      )
  ) minute_scores on true
  left join lateral (
    select coalesce(sum(5 * item.quantity), 0)::bigint as points
    from public.user_inventory item
    where item.league_id = member.league_id
      and item.user_id = member.user_id
      and item.reward_type = 'boots_gold'
      and item.target_matchday is not null
      and item.status in ('available', 'used')
      and (p_matchday is null or item.target_matchday = p_matchday)
      and (
        p_season_start_year is null
        or (
          item.created_at >= make_date(p_season_start_year, 7, 1)::timestamptz
          and item.created_at < make_date(p_season_start_year + 1, 7, 1)::timestamptz
        )
      )
  ) round_scores on true
  where member.league_id = p_league_id;
$$;
revoke all on function private.league_scoreboard_rows(uuid, smallint, smallint)
  from public, anon, authenticated;

create or replace function public.get_league_scoreboards(
  p_league_id uuid,
  p_season_start_year smallint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  season_rows jsonb;
  round_rows jsonb := '{}'::jsonb;
  fixture_round record;
  current_round_rows jsonb;
begin
  if (select auth.uid()) is null or not public.is_league_member(p_league_id) then
    raise exception 'League membership required';
  end if;

  select coalesce(jsonb_agg(to_jsonb(scores)
    order by scores.points desc, scores.exact_scores desc, scores.display_name),
    '[]'::jsonb)
  into season_rows
  from private.league_scoreboard_rows(p_league_id, null, p_season_start_year) scores;

  for fixture_round in
    select distinct fixture.matchday
    from public.league_matches fixture
    where fixture.matchday is not null
      and (
        p_season_start_year is null
        or (
          fixture.kickoff >= make_date(p_season_start_year, 7, 1)::timestamptz
          and fixture.kickoff < make_date(p_season_start_year + 1, 7, 1)::timestamptz
        )
      )
    order by fixture.matchday
  loop
    select coalesce(jsonb_agg(to_jsonb(scores)
      order by scores.points desc, scores.exact_scores desc, scores.played desc, scores.display_name),
      '[]'::jsonb)
    into current_round_rows
    from private.league_scoreboard_rows(p_league_id, fixture_round.matchday, p_season_start_year) scores;

    round_rows := round_rows || jsonb_build_object(fixture_round.matchday::text, current_round_rows);
  end loop;

  return jsonb_build_object('season', season_rows, 'rounds', round_rows);
end;
$$;

revoke all on function public.get_league_scoreboards(uuid, smallint) from public, anon;
grant execute on function public.get_league_scoreboards(uuid, smallint) to authenticated;

commit;
