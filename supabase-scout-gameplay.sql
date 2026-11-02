begin;

alter table public.scout_daily_attempts
  add column if not exists scout_points smallint not null default 0
    check (scout_points between 0 and 100);

update public.scout_daily_attempts
set scout_points = greatest(20, 120 - hints_revealed * 20)
where is_correct is true
  and submitted_at is not null
  and scout_points = 0;

create or replace function public.submit_scout_guess(
  p_challenge_date date,
  p_league_id uuid,
  p_guess text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := (select auth.uid());
  attempt public.scout_daily_attempts%rowtype;
  solution private.scout_daily_solutions%rowtype;
  normalized_guess text;
  correct boolean;
  awarded_points smallint;
begin
  if player is null or not public.is_league_member(p_league_id) then
    raise exception 'League membership required';
  end if;
  if p_guess is null or length(btrim(p_guess)) not between 1 and 80 then
    raise exception 'Enter a player name';
  end if;

  insert into public.scout_daily_attempts (challenge_date, league_id, user_id)
  select c.challenge_date, p_league_id, player
  from public.scout_daily_challenges c
  where c.challenge_date = p_challenge_date
    and c.published_at <= now()
    and c.closes_at > now()
  on conflict (challenge_date, user_id) do nothing;

  select * into attempt
  from public.scout_daily_attempts
  where challenge_date = p_challenge_date and user_id = player
  for update;
  if not found or attempt.league_id <> p_league_id then
    raise exception 'Daily challenge is unavailable';
  end if;
  if attempt.submitted_at is not null then
    raise exception 'Your daily guess has already been submitted';
  end if;
  if attempt.hints_revealed = 0 then
    raise exception 'Reveal at least one hint before guessing';
  end if;

  select * into solution
  from private.scout_daily_solutions
  where challenge_date = p_challenge_date;
  if not found then
    raise exception 'Daily answer is not configured';
  end if;

  normalized_guess := lower(regexp_replace(btrim(p_guess), '\s+', ' ', 'g'));
  correct := normalized_guess = solution.answer_normalized
    or exists (
      select 1
      from unnest(solution.accepted_answers) as answers(answer)
      where lower(regexp_replace(btrim(answers.answer), '\s+', ' ', 'g')) = normalized_guess
    );
  awarded_points := case
    when correct then greatest(20, 120 - attempt.hints_revealed * 20)::smallint
    else 0
  end;

  update public.scout_daily_attempts
    set guess_normalized = normalized_guess,
        is_correct = correct,
        scout_points = awarded_points,
        submitted_at = now()
    where challenge_date = p_challenge_date and user_id = player;

  return jsonb_build_object(
    'correct', correct,
    'answer', solution.answer_normalized,
    'points', awarded_points,
    'hints_used', attempt.hints_revealed
  );
end;
$$;

revoke all on function public.submit_scout_guess(date, uuid, text)
  from public, anon;
grant execute on function public.submit_scout_guess(date, uuid, text)
  to authenticated;

create or replace function public.get_scout_daily_leaderboard(
  p_challenge_date date,
  p_league_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := (select auth.uid());
  results jsonb;
begin
  if player is null or not public.is_league_member(p_league_id) then
    raise exception 'League membership required';
  end if;

  select coalesce(jsonb_agg(to_jsonb(scored) order by scored.position), '[]'::jsonb)
    into results
  from (
    select
      rank() over (
        order by attempt.scout_points desc,
          attempt.hints_revealed asc,
          attempt.submitted_at asc
      ) as position,
      member.display_name,
      attempt.scout_points as points,
      attempt.hints_revealed,
      attempt.user_id = player as is_me
    from public.scout_daily_attempts attempt
    join public.league_members member
      on member.league_id = attempt.league_id
      and member.user_id = attempt.user_id
    where attempt.challenge_date = p_challenge_date
      and attempt.league_id = p_league_id
      and attempt.submitted_at is not null
      and attempt.is_correct is true
      and attempt.scout_points > 0
    order by attempt.scout_points desc,
      attempt.hints_revealed asc,
      attempt.submitted_at asc
    limit 10
  ) scored;

  return results;
end;
$$;

revoke all on function public.get_scout_daily_leaderboard(date, uuid)
  from public, anon;
grant execute on function public.get_scout_daily_leaderboard(date, uuid)
  to authenticated;

commit;
