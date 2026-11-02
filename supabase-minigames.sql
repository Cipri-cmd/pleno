begin;

alter table public.league_matches
  add column if not exists matchday smallint;

create or replace function public.enforce_prediction_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.league_matches fixture
    where fixture.match_id = new.match_id
      and fixture.kickoff > now() + interval '1 hour'
  ) then
    raise exception 'Predictions close one hour before kickoff'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_prediction_deadline() from public, anon, authenticated;

drop trigger if exists enforce_prediction_deadline on public.predictions;
create trigger enforce_prediction_deadline
  before insert or update on public.predictions
  for each row execute function public.enforce_prediction_deadline();

create table if not exists public.daily_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_date date not null unique,
  title text not null default 'El Fichaje Clandestino',
  clues jsonb not null,
  featured_match_id bigint,
  published_at timestamptz not null default now(),
  closes_at timestamptz not null,
  unique (challenge_date, id),
  check (jsonb_typeof(clues) = 'array'),
  check (jsonb_array_length(clues) = 5),
  check (closes_at > published_at)
);
alter table public.daily_challenges enable row level security;
revoke all on public.daily_challenges from public, anon, authenticated;
grant all on public.daily_challenges to service_role;
drop policy if exists "Players read published daily challenges" on public.daily_challenges;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.daily_challenge_answers (
  challenge_id uuid primary key
    references public.daily_challenges(id) on delete cascade,
  answer_normalized text not null,
  accepted_answers text[] not null default '{}'
);
revoke all on private.daily_challenge_answers from public, anon, authenticated;
grant all on private.daily_challenge_answers to service_role;

create table if not exists public.user_daily_attempts (
  challenge_date date not null
    references public.daily_challenges(challenge_date) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  attempts_count smallint not null default 0 check (attempts_count between 0 and 6),
  max_attempts smallint not null default 5 check (max_attempts between 5 and 6),
  guesses text[] not null default '{}',
  solved boolean not null default false,
  reward_claimed boolean not null default false,
  started_at timestamptz not null default now(),
  solved_at timestamptz,
  primary key (challenge_date, user_id),
  unique (challenge_date, user_id, league_id),
  foreign key (challenge_date)
    references public.daily_challenges(challenge_date) on delete cascade,
  check (cardinality(guesses) = attempts_count),
  check ((solved and solved_at is not null) or (not solved and solved_at is null)),
  check (not reward_claimed or solved)
);
alter table public.user_daily_attempts enable row level security;
revoke all on public.user_daily_attempts from anon, authenticated;
grant select on public.user_daily_attempts to authenticated;
grant all on public.user_daily_attempts to service_role;
drop policy if exists "Players read their daily game attempts" on public.user_daily_attempts;
create policy "Players read their daily game attempts"
  on public.user_daily_attempts for select to authenticated
  using (user_id = (select auth.uid()) and public.is_league_member(league_id));

create table if not exists public.user_inventory (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_type text not null
    check (reward_type in ('boots_gold', 'joker_x2', 'red_card', 'second_chance')),
  quantity smallint not null default 1 check (quantity between 0 and 2),
  status text not null default 'available'
    check (status in ('available', 'used', 'expired')),
  target_matchday smallint,
  target_user_id uuid references auth.users(id) on delete set null,
  target_match_id bigint,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  check ((status = 'used' and used_at is not null) or (status <> 'used' and used_at is null))
);
alter table public.user_inventory
  drop constraint if exists user_inventory_quantity_check;
alter table public.user_inventory
  add constraint user_inventory_quantity_check check (quantity between 0 and 2);
create index if not exists user_inventory_available
  on public.user_inventory (league_id, user_id, status, expires_at);
alter table public.user_inventory enable row level security;
revoke all on public.user_inventory from anon, authenticated;
grant select on public.user_inventory to authenticated;
grant all on public.user_inventory to service_role;
drop policy if exists "Players read their minigame inventory" on public.user_inventory;
create policy "Players read their minigame inventory"
  on public.user_inventory for select to authenticated
  using (user_id = (select auth.uid()) and public.is_league_member(league_id));

create table if not exists public.daily_wheel_spins (
  challenge_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  section_index smallint not null check (section_index between 1 and 6),
  resolved_section_index smallint not null check (resolved_section_index between 1 and 6),
  outcome text not null
    check (outcome in ('boots_gold', 'joker_x2', 'red_card', 'double_or_nothing', 'var_annulled', 'second_chance')),
  final_reward text
    check (final_reward in ('boots_gold', 'joker_x2', 'red_card', 'var_annulled', 'second_chance')),
  quantity smallint not null default 0 check (quantity between 0 and 2),
  created_at timestamptz not null default now(),
  primary key (challenge_date, user_id),
  foreign key (challenge_date, user_id, league_id)
    references public.user_daily_attempts(challenge_date, user_id, league_id) on delete cascade
);
alter table public.daily_wheel_spins
  add column if not exists resolved_section_index smallint
  check (resolved_section_index between 1 and 6);
update public.daily_wheel_spins
set resolved_section_index = case final_reward
  when 'boots_gold' then 1
  when 'joker_x2' then 2
  when 'red_card' then 3
  when 'var_annulled' then 5
  when 'second_chance' then 6
  else section_index
end
where resolved_section_index is null;
alter table public.daily_wheel_spins
  alter column resolved_section_index set not null;
alter table public.daily_wheel_spins enable row level security;
revoke all on public.daily_wheel_spins from anon, authenticated;
grant select on public.daily_wheel_spins to authenticated;
grant all on public.daily_wheel_spins to service_role;
drop policy if exists "Players read their daily wheel result" on public.daily_wheel_spins;
create policy "Players read their daily wheel result"
  on public.daily_wheel_spins for select to authenticated
  using (user_id = (select auth.uid()) and public.is_league_member(league_id));

create table if not exists public.minute_of_gold_predictions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id bigint not null references public.league_matches(match_id) on delete cascade,
  predicted_minute smallint not null check (predicted_minute between 1 and 90),
  points smallint not null default 0 check (points in (0, 10)),
  settled boolean not null default false,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (league_id, user_id, match_id),
  check ((settled and settled_at is not null) or (not settled and settled_at is null))
);
create index if not exists minute_of_gold_match_results
  on public.minute_of_gold_predictions (league_id, match_id, settled);
alter table public.minute_of_gold_predictions enable row level security;
revoke all on public.minute_of_gold_predictions from anon, authenticated;
grant select on public.minute_of_gold_predictions to authenticated;
grant all on public.minute_of_gold_predictions to service_role;
drop policy if exists "Players read minute of gold predictions" on public.minute_of_gold_predictions;
create policy "Players read minute of gold predictions"
  on public.minute_of_gold_predictions for select to authenticated
  using (
    (user_id = (select auth.uid()) and public.is_league_member(league_id))
    or (
      public.is_league_member(league_id)
      and exists (
        select 1 from public.league_matches fixture
        where fixture.match_id = minute_of_gold_predictions.match_id
          and fixture.kickoff <= now()
      )
    )
  );

create table if not exists public.minute_of_gold_results (
  match_id bigint primary key references public.league_matches(match_id) on delete cascade,
  first_goal_minute smallint check (first_goal_minute between 1 and 90),
  settled_at timestamptz not null default now()
);
alter table public.minute_of_gold_results enable row level security;
revoke all on public.minute_of_gold_results from public, anon, authenticated;
grant all on public.minute_of_gold_results to service_role;

create or replace function public.settle_minute_of_gold_predictions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.minute_of_gold_predictions prediction
  set settled = true,
      settled_at = now(),
      points = case
        when new.first_goal_minute is not null
          and abs(prediction.predicted_minute - new.first_goal_minute) <= 3
          then 10
        else 0
      end
  where prediction.match_id = new.match_id
    and prediction.settled = false;
  return new;
end;
$$;
revoke all on function public.settle_minute_of_gold_predictions() from public, anon, authenticated;

drop trigger if exists settle_minute_of_gold_predictions on public.minute_of_gold_results;
create trigger settle_minute_of_gold_predictions
  after insert or update of first_goal_minute on public.minute_of_gold_results
  for each row execute function public.settle_minute_of_gold_predictions();

create table if not exists public.minigame_sabotages (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  match_id bigint not null references public.league_matches(match_id) on delete cascade,
  inventory_id uuid not null references public.user_inventory(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (league_id, target_user_id, match_id),
  check (sender_user_id <> target_user_id)
);
alter table public.minigame_sabotages enable row level security;
revoke all on public.minigame_sabotages from anon, authenticated;
grant select on public.minigame_sabotages to authenticated;
grant all on public.minigame_sabotages to service_role;
drop policy if exists "League members see resolved red cards" on public.minigame_sabotages;
create policy "League members see resolved red cards"
  on public.minigame_sabotages for select to authenticated
  using (
    public.is_league_member(league_id)
    and exists (
      select 1 from public.league_matches fixture
      where fixture.match_id = minigame_sabotages.match_id
        and fixture.kickoff <= now()
    )
  );

create or replace function public.get_daily_minigames_state(
  p_challenge_date date,
  p_league_id uuid,
  p_match_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := (select auth.uid());
  challenge public.daily_challenges%rowtype;
  attempt public.user_daily_attempts%rowtype;
  spin public.daily_wheel_spins%rowtype;
  revealed_clues jsonb := '[]'::jsonb;
  inventory jsonb := '[]'::jsonb;
  minute_pick jsonb := null;
  minute_history jsonb := '[]'::jsonb;
  available_extra boolean := false;
begin
  if player is null or not public.is_league_member(p_league_id) then
    raise exception 'League membership required';
  end if;

  select * into challenge from public.daily_challenges
  where challenge_date = p_challenge_date and published_at <= now();

  if found then
    select * into attempt from public.user_daily_attempts
    where challenge_date = p_challenge_date and user_id = player and league_id = p_league_id;

    if attempt.attempts_count > 0 then
      select coalesce(jsonb_agg(challenge.clues -> clue_index order by clue_index), '[]'::jsonb)
        into revealed_clues
      from generate_series(0, least(
        case when attempt.solved or attempt.attempts_count >= attempt.max_attempts
          then 5 else attempt.attempts_count end,
        5
      ) - 1) as clues(clue_index);
    end if;

    select * into spin from public.daily_wheel_spins
    where challenge_date = p_challenge_date and user_id = player and league_id = p_league_id;

  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'reward_type', item.reward_type,
    'quantity', item.quantity,
    'status', item.status,
    'target_matchday', item.target_matchday,
    'target_user_id', item.target_user_id,
    'target_match_id', item.target_match_id,
    'expires_at', item.expires_at
  ) order by item.created_at), '[]'::jsonb)
  into inventory
  from public.user_inventory item
  where item.user_id = player
    and item.league_id = p_league_id
    and item.status = 'available'
    and item.expires_at > now();

  select exists (
    select 1 from public.user_inventory item
    where item.user_id = player and item.league_id = p_league_id
      and item.reward_type = 'second_chance' and item.status = 'available'
      and item.quantity > 0 and item.expires_at > now()
  ) into available_extra;

  if p_match_id is not null then
    select jsonb_build_object(
      'predicted_minute', prediction.predicted_minute,
      'points', prediction.points,
      'settled', prediction.settled,
      'first_goal_minute', result.first_goal_minute
    ) into minute_pick
    from public.minute_of_gold_predictions prediction
    left join public.minute_of_gold_results result
      on result.match_id = prediction.match_id
    where prediction.match_id = p_match_id
      and prediction.user_id = player
      and prediction.league_id = p_league_id;
  end if;

  select coalesce(jsonb_agg(to_jsonb(recent) order by recent.created_at desc), '[]'::jsonb)
  into minute_history
  from (
    select
      prediction.match_id,
      prediction.predicted_minute,
      prediction.points,
      prediction.settled,
      result.first_goal_minute,
      prediction.created_at,
      fixture.matchday,
      fixture.kickoff
    from public.minute_of_gold_predictions prediction
    join public.league_matches fixture on fixture.match_id = prediction.match_id
    left join public.minute_of_gold_results result
      on result.match_id = prediction.match_id
    where prediction.user_id = player and prediction.league_id = p_league_id
    order by prediction.created_at desc
    limit 5
  ) recent;

  return jsonb_build_object(
    'available', challenge.id is not null,
    'playable', challenge.id is not null and challenge.closes_at > now(),
    'challenge', case when challenge.id is null then null else jsonb_build_object(
      'id', challenge.id,
      'date', challenge.challenge_date,
      'title', challenge.title,
      'closes_at', challenge.closes_at,
      'featured_match_id', challenge.featured_match_id
    ) end,
    'attempt', case when attempt.user_id is null then null else jsonb_build_object(
      'attempts_count', attempt.attempts_count,
      'max_attempts', attempt.max_attempts,
      'guesses', to_jsonb(attempt.guesses),
      'solved', attempt.solved,
      'reward_claimed', attempt.reward_claimed,
      'answer', case when attempt.solved or attempt.attempts_count >= attempt.max_attempts
        then (select answer.answer_normalized from private.daily_challenge_answers answer
          where answer.challenge_id = challenge.id)
        else null end,
      'clues', revealed_clues
    ) end,
    'can_use_extra_guess', available_extra,
    'spin', case when spin.user_id is null then null else jsonb_build_object(
      'section_index', spin.section_index,
      'resolved_section_index', spin.resolved_section_index,
      'outcome', spin.outcome,
      'final_reward', spin.final_reward,
      'quantity', spin.quantity
    ) end,
    'inventory', inventory,
    'minute_pick', minute_pick,
    'minute_history', minute_history
  );
end;
$$;
revoke all on function public.get_daily_minigames_state(date, uuid, bigint)
  from public, anon;
grant execute on function public.get_daily_minigames_state(date, uuid, bigint)
  to authenticated;

create or replace function public.submit_daily_player_guess(
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
  challenge public.daily_challenges%rowtype;
  attempt public.user_daily_attempts%rowtype;
  solution private.daily_challenge_answers%rowtype;
  extra_item public.user_inventory%rowtype;
  normalized_guess text;
  correct boolean;
begin
  if player is null or not public.is_league_member(p_league_id) then
    raise exception 'League membership required';
  end if;
  if p_guess is null or length(btrim(p_guess)) not between 1 and 80 then
    raise exception 'Enter a player name';
  end if;

  select * into challenge from public.daily_challenges
  where challenge_date = p_challenge_date
    and published_at <= now() and closes_at > now();
  if not found then raise exception 'Daily challenge is unavailable'; end if;

  select * into attempt from public.user_daily_attempts
  where challenge_date = p_challenge_date and user_id = player for update;
  if not found then
    select * into extra_item from public.user_inventory
    where user_id = player and league_id = p_league_id
      and reward_type = 'second_chance' and status = 'available'
      and quantity > 0 and expires_at > now()
    order by created_at limit 1 for update;

    insert into public.user_daily_attempts
      (challenge_date, user_id, league_id, max_attempts)
    values (
      p_challenge_date, player, p_league_id,
      case when extra_item.id is null then 5 else 6 end
    )
    on conflict (challenge_date, user_id) do nothing;

    if extra_item.id is not null then
      update public.user_inventory
      set quantity = quantity - 1,
          status = case when quantity = 1 then 'used' else 'available' end,
          used_at = case when quantity = 1 then now() else used_at end
      where id = extra_item.id;
    end if;

    select * into attempt from public.user_daily_attempts
    where challenge_date = p_challenge_date and user_id = player for update;
  end if;

  if attempt.league_id <> p_league_id then raise exception 'Daily attempt belongs to another league'; end if;
  if attempt.solved or attempt.attempts_count >= attempt.max_attempts then
    raise exception 'Daily attempts are exhausted';
  end if;

  select * into solution from private.daily_challenge_answers
  where challenge_id = challenge.id;
  if not found then raise exception 'Daily answer is not configured'; end if;

  normalized_guess := lower(regexp_replace(btrim(p_guess), '\s+', ' ', 'g'));
  correct := normalized_guess = solution.answer_normalized
    or exists (
      select 1 from unnest(solution.accepted_answers) as answers(answer)
      where lower(regexp_replace(btrim(answers.answer), '\s+', ' ', 'g')) = normalized_guess
    );

  update public.user_daily_attempts
  set attempts_count = attempts_count + 1,
      guesses = array_append(guesses, normalized_guess),
      solved = correct,
      solved_at = case when correct then now() else null end
  where challenge_date = p_challenge_date and user_id = player
  returning * into attempt;

  return jsonb_build_object(
    'correct', correct,
    'attempts_count', attempt.attempts_count,
    'max_attempts', attempt.max_attempts,
    'finished', correct or attempt.attempts_count >= attempt.max_attempts,
    'answer', case when correct or attempt.attempts_count >= attempt.max_attempts
      then solution.answer_normalized else null end,
    'unlocked_clue', case when not correct and attempt.attempts_count < attempt.max_attempts
      then challenge.clues -> (attempt.attempts_count - 1) else null end
  );
end;
$$;
revoke all on function public.submit_daily_player_guess(date, uuid, text)
  from public, anon;
grant execute on function public.submit_daily_player_guess(date, uuid, text)
  to authenticated;

create or replace function public.spin_daily_var(
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
  attempt public.user_daily_attempts%rowtype;
  existing_spin public.daily_wheel_spins%rowtype;
  initial_section smallint;
  resolved_section smallint;
  final_reward text;
  reward_quantity smallint := 0;
  target_round smallint;
  reward_expiry timestamptz;
  created_item uuid;
begin
  if player is null or not public.is_league_member(p_league_id) then
    raise exception 'League membership required';
  end if;

  select * into attempt from public.user_daily_attempts
  where challenge_date = p_challenge_date and user_id = player and league_id = p_league_id
  for update;
  if not found or not attempt.solved then raise exception 'Solve the daily challenge first'; end if;

  select * into existing_spin from public.daily_wheel_spins
  where challenge_date = p_challenge_date and user_id = player;
  if found then
    return jsonb_build_object(
      'section_index', existing_spin.section_index,
      'resolved_section_index', existing_spin.resolved_section_index,
      'outcome', existing_spin.outcome,
      'final_reward', existing_spin.final_reward,
      'quantity', existing_spin.quantity,
      'replayed', true
    );
  end if;

  initial_section := floor(random() * 6)::smallint + 1;
  resolved_section := initial_section;
  if initial_section = 4 then
    resolved_section := floor(random() * 5)::smallint + 1;
    if resolved_section >= 4 then resolved_section := resolved_section + 1; end if;
  end if;

  final_reward := case resolved_section
    when 1 then 'boots_gold'
    when 2 then 'joker_x2'
    when 3 then 'red_card'
    when 5 then 'var_annulled'
    when 6 then 'second_chance'
  end;
  if final_reward <> 'var_annulled' then
    reward_quantity := case when initial_section = 4 then 2 else 1 end;
  end if;

  insert into public.daily_wheel_spins
    (challenge_date, user_id, league_id, section_index, resolved_section_index, outcome, final_reward, quantity)
  values (
    p_challenge_date, player, p_league_id, initial_section, resolved_section,
    case initial_section when 4 then 'double_or_nothing' else final_reward end,
    final_reward, reward_quantity
  );

  if final_reward <> 'var_annulled' then
    select next_round.matchday, next_round.last_kickoff + interval '4 hours'
      into target_round, reward_expiry
    from (
      select fixture.matchday, max(fixture.kickoff) as last_kickoff
      from public.league_matches fixture
      where fixture.kickoff > now() and fixture.matchday is not null
      group by fixture.matchday
      order by min(fixture.kickoff)
      limit 1
    ) next_round;

    insert into public.user_inventory
      (league_id, user_id, reward_type, quantity, target_matchday, expires_at, metadata)
    values (
      p_league_id, player, final_reward, reward_quantity, target_round,
      coalesce(reward_expiry, now() + interval '14 days'),
      jsonb_build_object('challenge_date', p_challenge_date, 'wheel_section', initial_section)
    )
    returning id into created_item;
  end if;

  update public.user_daily_attempts
  set reward_claimed = true
  where challenge_date = p_challenge_date and user_id = player;

  return jsonb_build_object(
    'section_index', initial_section,
    'resolved_section_index', resolved_section,
    'outcome', case initial_section when 4 then 'double_or_nothing' else final_reward end,
    'final_reward', final_reward,
    'quantity', reward_quantity,
    'inventory_id', created_item,
    'replayed', false
  );
end;
$$;
revoke all on function public.spin_daily_var(date, uuid) from public, anon;
grant execute on function public.spin_daily_var(date, uuid) to authenticated;

create or replace function public.equip_minigame_joker(
  p_league_id uuid,
  p_inventory_id uuid,
  p_match_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := (select auth.uid());
begin
  if player is null or not public.is_league_member(p_league_id) then
    raise exception 'League membership required';
  end if;
  if not exists (
    select 1 from public.league_matches fixture
    where fixture.match_id = p_match_id
      and fixture.kickoff > now() + interval '1 hour'
  ) then raise exception 'Match predictions are closed'; end if;
  if not exists (
    select 1 from public.predictions prediction
    where prediction.league_id = p_league_id
      and prediction.user_id = player and prediction.match_id = p_match_id
  ) then raise exception 'Save your prediction before equipping the joker'; end if;
  if exists (
    select 1 from public.predictions prediction
    where prediction.league_id = p_league_id
      and prediction.user_id = player and prediction.match_id = p_match_id
      and prediction.joker
  ) then raise exception 'That prediction already has a joker'; end if;
  if not exists (
    select 1 from public.user_inventory item
    where item.id = p_inventory_id and item.league_id = p_league_id
      and item.user_id = player and item.reward_type = 'joker_x2'
      and item.status = 'available' and item.expires_at > now()
  ) then raise exception 'Joker item is unavailable'; end if;

  update public.predictions set joker = true
  where league_id = p_league_id and user_id = player and match_id = p_match_id;
  update public.user_inventory
  set quantity = quantity - 1,
      status = case when quantity = 1 then 'used' else 'available' end,
      used_at = case when quantity = 1 then now() else null end,
      target_match_id = p_match_id
  where id = p_inventory_id;
end;
$$;
revoke all on function public.equip_minigame_joker(uuid, uuid, bigint) from public, anon;
grant execute on function public.equip_minigame_joker(uuid, uuid, bigint) to authenticated;

create or replace function public.use_minigame_red_card(
  p_league_id uuid,
  p_inventory_id uuid,
  p_target_user_id uuid,
  p_match_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := (select auth.uid());
begin
  if player is null or not public.is_league_member(p_league_id)
    or not exists (
      select 1 from public.league_members member
      where member.league_id = p_league_id and member.user_id = p_target_user_id
    ) then
    raise exception 'League membership required for both players';
  end if;
  if p_target_user_id = player then raise exception 'Choose another player'; end if;
  if not exists (
    select 1 from public.league_matches fixture
    where fixture.match_id = p_match_id
      and fixture.kickoff > now() + interval '1 hour'
  ) then raise exception 'Match predictions are closed'; end if;
  if not exists (
    select 1 from public.predictions prediction
    where prediction.league_id = p_league_id
      and prediction.user_id = p_target_user_id and prediction.match_id = p_match_id
  ) then raise exception 'That player has no prediction for this match'; end if;
  if not exists (
    select 1 from public.user_inventory item
    where item.id = p_inventory_id and item.league_id = p_league_id
      and item.user_id = player and item.reward_type = 'red_card'
      and item.status = 'available' and item.expires_at > now()
  ) then raise exception 'Red card item is unavailable'; end if;

  insert into public.minigame_sabotages
    (league_id, sender_user_id, target_user_id, match_id, inventory_id)
  values (p_league_id, player, p_target_user_id, p_match_id, p_inventory_id);
  update public.user_inventory
  set quantity = quantity - 1,
      status = case when quantity = 1 then 'used' else 'available' end,
      used_at = case when quantity = 1 then now() else null end,
      target_user_id = p_target_user_id, target_match_id = p_match_id
  where id = p_inventory_id;
end;
$$;
revoke all on function public.use_minigame_red_card(uuid, uuid, uuid, bigint)
  from public, anon;
grant execute on function public.use_minigame_red_card(uuid, uuid, uuid, bigint)
  to authenticated;

create or replace function public.get_minigame_score_modifiers(p_league_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := (select auth.uid());
  bonuses jsonb;
  gold jsonb;
  sabotage jsonb;
begin
  if player is null or not public.is_league_member(p_league_id) then
    raise exception 'League membership required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', item.user_id,
    'matchday', item.target_matchday,
    'points', 5 * item.quantity
  )), '[]'::jsonb) into bonuses
  from public.user_inventory item
  where item.league_id = p_league_id and item.reward_type = 'boots_gold'
    and item.target_matchday is not null and item.status in ('available', 'used');

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', prediction.user_id,
    'match_id', prediction.match_id,
    'points', prediction.points
  )), '[]'::jsonb) into gold
  from public.minute_of_gold_predictions prediction
  where prediction.league_id = p_league_id and prediction.settled;

  select coalesce(jsonb_agg(jsonb_build_object(
    'target_user_id', card.target_user_id,
    'match_id', card.match_id,
    'sender_user_id', card.sender_user_id
  )), '[]'::jsonb) into sabotage
  from public.minigame_sabotages card
  join public.league_matches fixture on fixture.match_id = card.match_id
  where card.league_id = p_league_id and fixture.kickoff <= now();

  return jsonb_build_object('round_bonuses', bonuses, 'minute_bonuses', gold, 'red_cards', sabotage);
end;
$$;
revoke all on function public.get_minigame_score_modifiers(uuid) from public, anon;
grant execute on function public.get_minigame_score_modifiers(uuid) to authenticated;

create or replace function public.submit_minute_of_gold_prediction(
  p_league_id uuid,
  p_match_id bigint,
  p_minute smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := (select auth.uid());
  saved public.minute_of_gold_predictions%rowtype;
begin
  if player is null or not public.is_league_member(p_league_id) then
    raise exception 'League membership required';
  end if;
  if p_minute not between 1 and 90 then raise exception 'Minute must be from 1 to 90'; end if;
  if not exists (
    select 1 from public.league_matches fixture
    where fixture.match_id = p_match_id
      and fixture.kickoff > now() + interval '1 hour'
  ) then raise exception 'Match predictions are closed'; end if;

  insert into public.minute_of_gold_predictions
    (league_id, user_id, match_id, predicted_minute)
  values (p_league_id, player, p_match_id, p_minute)
  on conflict (league_id, user_id, match_id) do nothing
  returning * into saved;

  if not found then raise exception 'You have already submitted a minute prediction'; end if;
  return jsonb_build_object(
    'match_id', saved.match_id,
    'predicted_minute', saved.predicted_minute,
    'settled', saved.settled
  );
end;
$$;
revoke all on function public.submit_minute_of_gold_prediction(uuid, bigint, smallint)
  from public, anon;
grant execute on function public.submit_minute_of_gold_prediction(uuid, bigint, smallint)
  to authenticated;

commit;
