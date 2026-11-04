begin;

insert into storage.buckets (id, name, public)
values ('puzzle-catalog', 'puzzle-catalog', false)
on conflict (id) do update set public = false;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.daily_game_puzzles (
  game text not null check (game in ('connections', 'grid', 'player')),
  puzzle_date date not null,
  payload jsonb not null,
  solution jsonb not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  difficulty smallint not null check (difficulty between 1 and 7),
  repeat_window_days smallint not null check (repeat_window_days between 30 and 90),
  source_refs jsonb not null check (jsonb_typeof(source_refs) = 'array'),
  created_at timestamptz not null default now(),
  primary key (game, puzzle_date),
  unique (game, content_hash)
);

create table if not exists private.daily_game_repetition_ledger (
  game text not null check (game in ('connections', 'grid', 'player')),
  repeat_key_hash text not null check (repeat_key_hash ~ '^[0-9a-f]{64}$'),
  puzzle_date date not null,
  puzzle_content_hash text not null,
  primary key (game, repeat_key_hash, puzzle_date)
);

create table if not exists private.daily_game_repeat_events (
  game text not null check (game in ('connections', 'grid', 'player')),
  puzzle_date date not null,
  repeat_key_hash text not null check (repeat_key_hash ~ '^[0-9a-f]{64}$'),
  previous_date date not null,
  default_window_days smallint not null,
  used_window_days smallint not null,
  primary key (game, puzzle_date, repeat_key_hash)
);

create index if not exists daily_game_repetition_recent
  on private.daily_game_repetition_ledger (game, repeat_key_hash, puzzle_date desc);

revoke all on private.daily_game_puzzles, private.daily_game_repetition_ledger, private.daily_game_repeat_events
  from public, anon, authenticated;
grant all on private.daily_game_puzzles, private.daily_game_repetition_ledger, private.daily_game_repeat_events
  to service_role;

create table if not exists private.daily_game_entities (
  entity_id text primary key check (entity_id ~ '^Q[0-9]+$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object')
);
revoke all on private.daily_game_entities from public, anon, authenticated;
grant all on private.daily_game_entities to service_role;

create or replace function public.publish_daily_game_entities(p_entities jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  entity jsonb;
  saved_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if jsonb_typeof(p_entities) is distinct from 'array' then
    raise exception 'Invalid entity catalog';
  end if;
  for entity in select value from jsonb_array_elements(p_entities)
  loop
    if entity->>'id' !~ '^Q[0-9]+$'
      or length(btrim(coalesce(entity->>'name', ''))) not between 1 and 100
      or jsonb_typeof(coalesce(entity->'attributes', '{}'::jsonb)) is distinct from 'object' then
      raise exception 'Invalid entity in catalog';
    end if;
    insert into private.daily_game_entities (entity_id, display_name, attributes)
    values (entity->>'id', btrim(entity->>'name'), coalesce(entity->'attributes', '{}'::jsonb))
    on conflict (entity_id) do update
      set display_name = excluded.display_name,
          attributes = excluded.attributes;
    saved_count := saved_count + 1;
  end loop;
  return saved_count;
end;
$$;
revoke all on function public.publish_daily_game_entities(jsonb) from public, anon, authenticated;
grant execute on function public.publish_daily_game_entities(jsonb) to service_role;

create table if not exists public.daily_game_attempts (
  game text not null check (game in ('connections', 'grid', 'player')),
  puzzle_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempts_count smallint not null default 0 check (attempts_count between 0 and 9),
  mistakes_count smallint not null default 0 check (mistakes_count between 0 and 4),
  solved boolean not null default false,
  completed_at timestamptz,
  score integer not null default 0 check (score >= 0),
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (game, puzzle_date, user_id),
  check ((solved and completed_at is not null) or (not solved and completed_at is null))
);
alter table public.daily_game_attempts
  add column if not exists streak_eligible boolean not null default true;
alter table public.daily_game_attempts enable row level security;
revoke all on public.daily_game_attempts from public, anon, authenticated;
grant select on public.daily_game_attempts to authenticated;
drop policy if exists "Players read their daily game progress" on public.daily_game_attempts;
create policy "Players read their daily game progress"
  on public.daily_game_attempts for select to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.daily_game_reports (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('connections', 'grid', 'player')),
  puzzle_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  details text not null check (length(btrim(details)) between 3 and 500),
  created_at timestamptz not null default now()
);
alter table public.daily_game_reports enable row level security;
revoke all on public.daily_game_reports from public, anon, authenticated;
grant select on public.daily_game_reports to authenticated;
drop policy if exists "Players read their daily game reports" on public.daily_game_reports;
create policy "Players read their daily game reports"
  on public.daily_game_reports for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.report_daily_game_error(
  p_game text,
  p_puzzle_date date,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  report_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_game not in ('connections', 'grid', 'player')
    or p_puzzle_date is null
    or length(btrim(coalesce(p_details, ''))) not between 3 and 500 then
    raise exception 'Invalid puzzle report';
  end if;
  insert into public.daily_game_reports (game, puzzle_date, user_id, details)
  values (p_game, p_puzzle_date, current_user_id, btrim(p_details))
  returning id into report_id;
  return report_id;
end;
$$;
revoke all on function public.report_daily_game_error(text, date, text) from public, anon;
grant execute on function public.report_daily_game_error(text, date, text) to authenticated;

create or replace function public.get_daily_games_for_day(p_puzzle_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  daily_games jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_puzzle_date is null or p_puzzle_date > (now() at time zone 'Europe/Madrid')::date
    or p_puzzle_date < (now() at time zone 'Europe/Madrid')::date - 365 then
    raise exception 'Puzzle date is outside the playable archive';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'game', puzzle.game,
    'date', puzzle.puzzle_date,
    'difficulty', puzzle.difficulty,
    'payload', case puzzle.game
      when 'connections' then jsonb_build_object(
        'tiles', coalesce((
          select jsonb_agg(jsonb_build_object('id', tile.entity_id, 'name', entity.display_name)
            order by tile.ordinality)
          from jsonb_array_elements_text(puzzle.payload->'tiles') with ordinality as tile(entity_id, ordinality)
          join private.daily_game_entities entity on entity.entity_id = tile.entity_id
        ), '[]'::jsonb)
      )
      when 'grid' then jsonb_build_object(
        'rows', puzzle.payload->'rows',
        'columns', puzzle.payload->'columns'
      )
      else '{}'::jsonb
    end,
    'progress', case when attempt.user_id is null then jsonb_build_object(
      'attempts_count', 0, 'mistakes_count', 0, 'solved', false, 'score', 0,
      'progress', case puzzle.game
        when 'connections' then jsonb_build_object('solved_groups', '[]'::jsonb)
        when 'grid' then jsonb_build_object('picks', '{}'::jsonb, 'score', 0)
        else jsonb_build_object('guesses', '[]'::jsonb)
      end
    ) else jsonb_build_object(
      'attempts_count', attempt.attempts_count,
      'mistakes_count', attempt.mistakes_count,
      'solved', attempt.solved,
      'score', attempt.score,
      'completed_at', attempt.completed_at,
      'progress', attempt.progress
    ) end
  ) order by puzzle.game), '[]'::jsonb)
  into daily_games
  from private.daily_game_puzzles puzzle
  left join public.daily_game_attempts attempt
    on attempt.game = puzzle.game and attempt.puzzle_date = puzzle.puzzle_date
    and attempt.user_id = current_user_id
  where puzzle.puzzle_date = p_puzzle_date;
  return daily_games;
end;
$$;
revoke all on function public.get_daily_games_for_day(date) from public, anon;
grant execute on function public.get_daily_games_for_day(date) to authenticated;

create or replace function public.get_daily_games_history(p_game text, p_limit smallint default 365)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  history jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_game not in ('connections', 'grid', 'player')
    or p_limit not between 1 and 365 then raise exception 'Invalid history request'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', attempt.puzzle_date,
    'completed', attempt.solved,
    'score', attempt.score,
    'attempts_count', attempt.attempts_count,
    'streak_eligible', attempt.streak_eligible,
    'outcome', attempt.progress->>'outcome'
  ) order by attempt.puzzle_date desc), '[]'::jsonb)
  into history
  from (
    select * from public.daily_game_attempts
    where game = p_game and user_id = current_user_id
    order by puzzle_date desc
    limit p_limit
  ) attempt;
  return history;
end;
$$;
revoke all on function public.get_daily_games_history(text, smallint) from public, anon;
grant execute on function public.get_daily_games_history(text, smallint) to authenticated;

create or replace function public.submit_daily_game_guess(
  p_game text,
  p_puzzle_date date,
  p_guess jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  puzzle private.daily_game_puzzles%rowtype;
  attempt public.daily_game_attempts%rowtype;
  guess_id text;
  guess_name text;
  matched_count integer;
  group_index integer;
  selected_group jsonb;
  solved_groups jsonb;
  revealed_groups jsonb;
  picks jsonb;
  cell_index integer;
  answer_count integer;
  earned_points integer := 0;
  target_attributes jsonb;
  guess_attributes jsonb;
  comparisons jsonb;
  player_name text;
  is_correct boolean := false;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_game not in ('connections', 'grid', 'player')
    or jsonb_typeof(p_guess) is distinct from 'object' then
    raise exception 'Invalid daily game guess';
  end if;
  select * into puzzle from private.daily_game_puzzles
  where game = p_game and puzzle_date = p_puzzle_date;
  if not found then raise exception 'Daily game is unavailable'; end if;

  insert into public.daily_game_attempts (game, puzzle_date, user_id, progress, streak_eligible)
  values (
    p_game, p_puzzle_date, current_user_id,
    case p_game when 'connections' then '{"solved_groups":[]}'::jsonb
      when 'grid' then '{"picks":{},"score":0}'::jsonb else '{"guesses":[]}'::jsonb end,
    p_puzzle_date = (now() at time zone 'Europe/Madrid')::date
  )
  on conflict do nothing;
  select * into attempt from public.daily_game_attempts
  where game = p_game and puzzle_date = p_puzzle_date and user_id = current_user_id
  for update;
  if attempt.solved then raise exception 'This daily game is already complete'; end if;

  if p_game = 'connections' then
    if jsonb_typeof(p_guess->'tiles') is distinct from 'array'
      or jsonb_array_length(p_guess->'tiles') <> 4
      or (select count(distinct value) from jsonb_array_elements_text(p_guess->'tiles')) <> 4
      or exists (
        select 1 from jsonb_array_elements_text(p_guess->'tiles') tile(value)
        where not (puzzle.payload->'tiles' @> jsonb_build_array(tile.value))
      ) then
      raise exception 'Select four different tiles from the puzzle';
    end if;
    solved_groups := coalesce(attempt.progress->'solved_groups', '[]'::jsonb);
    revealed_groups := coalesce(attempt.progress->'revealed_groups', '[]'::jsonb);
    for group_index in 0..3 loop
      selected_group := puzzle.solution->'groups'->group_index;
      if not (solved_groups @> jsonb_build_array(group_index))
        and selected_group->'members' @> p_guess->'tiles'
        and p_guess->'tiles' @> selected_group->'members' then
        is_correct := true;
        exit;
      end if;
    end loop;
    if is_correct then
      solved_groups := solved_groups || jsonb_build_array(group_index);
      selected_group := selected_group || jsonb_build_object(
        'members', coalesce((
          select jsonb_agg(jsonb_build_object('id', member.entity_id, 'name', entity.display_name)
            order by member.ordinality)
          from jsonb_array_elements_text(selected_group->'members') with ordinality as member(entity_id, ordinality)
          join private.daily_game_entities entity on entity.entity_id = member.entity_id
        ), '[]'::jsonb)
      );
      revealed_groups := revealed_groups || jsonb_build_array(selected_group);
      attempt.progress := jsonb_build_object('solved_groups', solved_groups);
    else
      select count(*) into matched_count
      from jsonb_array_elements(puzzle.solution->'groups') group_data
      where (select count(*) from jsonb_array_elements_text(group_data->'members') member
        where p_guess->'tiles' @> jsonb_build_array(member.value)) = 3;
      attempt.progress := coalesce(attempt.progress, '{}'::jsonb);
    end if;
    attempt.attempts_count := attempt.attempts_count + 1;
    if not is_correct then attempt.mistakes_count := attempt.mistakes_count + 1; end if;
    attempt.score := attempt.score + case when is_correct then 10 else 0 end;
    attempt.solved := jsonb_array_length(solved_groups) = 4;
    attempt.progress := attempt.progress || jsonb_build_object(
      'last_correct', is_correct,
      'one_away', (not is_correct and matched_count = 3),
      'last_group', case when is_correct then selected_group else null end,
      'revealed_groups', revealed_groups
    );
    if attempt.solved then
      attempt.progress := attempt.progress || jsonb_build_object('outcome', 'won');
    end if;
    if attempt.mistakes_count >= 4 and not attempt.solved then
      select coalesce(jsonb_agg(
        group_data.value || jsonb_build_object('members', coalesce((
          select jsonb_agg(jsonb_build_object('id', member.entity_id, 'name', entity.display_name)
            order by member.ordinality)
          from jsonb_array_elements_text(group_data.value->'members') with ordinality as member(entity_id, ordinality)
          join private.daily_game_entities entity on entity.entity_id = member.entity_id
        ), '[]'::jsonb))
        order by group_data.ordinality
      ), '[]'::jsonb)
      into revealed_groups
      from jsonb_array_elements(puzzle.solution->'groups') with ordinality as group_data(value, ordinality);
      attempt.progress := attempt.progress || jsonb_build_object(
        'revealed_groups', revealed_groups,
        'outcome', 'lost'
      );
      attempt.solved := true;
    end if;
  elsif p_game = 'grid' then
    if jsonb_typeof(p_guess->'cell') is distinct from 'number'
      or (p_guess->>'cell') !~ '^[0-8]$'
      or length(btrim(coalesce(p_guess->>'player', ''))) = 0 then
      raise exception 'Choose a grid cell and a player';
    end if;
    if attempt.attempts_count >= 9 then raise exception 'No attempts remain'; end if;
    cell_index := (p_guess->>'cell')::integer;
    select entity_id, display_name into guess_id, guess_name
    from private.daily_game_entities
    where lower(btrim(display_name)) = lower(btrim(p_guess->>'player'));
    if not found then raise exception 'Player is not in the verified catalog'; end if;
    select count(*) into matched_count from private.daily_game_entities
    where lower(btrim(display_name)) = lower(btrim(p_guess->>'player'));
    if matched_count <> 1 then raise exception 'Player name is ambiguous; use another spelling'; end if;
    picks := coalesce(attempt.progress->'picks', '{}'::jsonb);
    if picks ? cell_index::text then raise exception 'This grid cell is already solved'; end if;
    if exists (
      select 1 from jsonb_each(picks) pick
      where pick.value->>'id' = guess_id
    ) then raise exception 'A player can only be used once in this grid'; end if;
    select count(*) into answer_count
    from jsonb_array_elements_text(puzzle.solution->'cells'->cell_index) answer
    where answer.value = guess_id;
    is_correct := answer_count > 0;
    if is_correct then
      earned_points := greatest(1, round(100.0 / answer_count)::integer);
      picks := picks || jsonb_build_object(cell_index::text, jsonb_build_object(
        'id', guess_id, 'name', guess_name, 'points', earned_points
      ));
      attempt.score := attempt.score + earned_points;
    end if;
    attempt.progress := jsonb_build_object(
      'picks', picks,
      'score', attempt.score,
      'last_correct', is_correct
    );
    attempt.attempts_count := attempt.attempts_count + 1;
    attempt.solved := jsonb_object_length(picks) = 9 or attempt.attempts_count >= 9;
    if attempt.solved then
      attempt.progress := attempt.progress || jsonb_build_object(
        'outcome', case when jsonb_object_length(picks) = 9 then 'won' else 'lost' end
      );
    end if;
  else
    if length(btrim(coalesce(p_guess->>'player', ''))) = 0 then raise exception 'Enter a player name'; end if;
    select entity_id, display_name into guess_id, guess_name
    from private.daily_game_entities
    where lower(btrim(display_name)) = lower(btrim(p_guess->>'player'));
    if not found then raise exception 'Player is not in the verified catalog'; end if;
    select count(*) into matched_count from private.daily_game_entities
    where lower(btrim(display_name)) = lower(btrim(p_guess->>'player'));
    if matched_count <> 1 then raise exception 'Player name is ambiguous; use another spelling'; end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(attempt.progress->'guesses', '[]'::jsonb)) prior
      where prior->>'id' = guess_id
    ) then raise exception 'Player already guessed'; end if;
    select attributes into target_attributes from private.daily_game_entities
    where entity_id = puzzle.solution->>'player';
    guess_attributes := (select attributes from private.daily_game_entities where entity_id = guess_id);
    if target_attributes is null or not (target_attributes ?& array['club','country','position','age','shirt_number','height_cm'])
      or guess_attributes is null or not (guess_attributes ?& array['club','country','position','age','shirt_number','height_cm']) then
      raise exception 'Verified player attributes are unavailable';
    end if;
    is_correct := guess_id = puzzle.solution->>'player';
    comparisons := jsonb_build_array(
      jsonb_build_object('field','club','label','Club','color',case when target_attributes->>'club' = guess_attributes->>'club' then 'green' else 'red' end),
      jsonb_build_object('field','country','label','País','color',case when target_attributes->>'country' = guess_attributes->>'country' then 'green' else 'red' end),
      jsonb_build_object('field','position','label','Posición','color',case when target_attributes->>'position' = guess_attributes->>'position' then 'green' else 'red' end),
      jsonb_build_object('field','age','label','Edad','color',case when target_attributes->>'age' = guess_attributes->>'age' then 'green' when abs((target_attributes->>'age')::integer - (guess_attributes->>'age')::integer) <= 2 then 'yellow' else 'red' end,'direction',case when (guess_attributes->>'age')::integer < (target_attributes->>'age')::integer then 'up' when (guess_attributes->>'age')::integer > (target_attributes->>'age')::integer then 'down' else 'equal' end),
      jsonb_build_object('field','shirt_number','label','Dorsal','color',case when target_attributes->>'shirt_number' = guess_attributes->>'shirt_number' then 'green' when abs((target_attributes->>'shirt_number')::integer - (guess_attributes->>'shirt_number')::integer) <= 3 then 'yellow' else 'red' end,'direction',case when (guess_attributes->>'shirt_number')::integer < (target_attributes->>'shirt_number')::integer then 'up' when (guess_attributes->>'shirt_number')::integer > (target_attributes->>'shirt_number')::integer then 'down' else 'equal' end),
      jsonb_build_object('field','height_cm','label','Altura','color',case when target_attributes->>'height_cm' = guess_attributes->>'height_cm' then 'green' when abs((target_attributes->>'height_cm')::integer - (guess_attributes->>'height_cm')::integer) <= 5 then 'yellow' else 'red' end,'direction',case when (guess_attributes->>'height_cm')::integer < (target_attributes->>'height_cm')::integer then 'up' when (guess_attributes->>'height_cm')::integer > (target_attributes->>'height_cm')::integer then 'down' else 'equal' end)
    );
    attempt.attempts_count := attempt.attempts_count + 1;
    attempt.solved := is_correct or attempt.attempts_count >= 8;
    attempt.score := case when is_correct then 100 - 10 * attempt.attempts_count else attempt.score end;
    attempt.progress := jsonb_build_object(
      'guesses', coalesce(attempt.progress->'guesses', '[]'::jsonb) ||
        jsonb_build_array(jsonb_build_object('id',guess_id,'name',guess_name,'comparisons',comparisons)),
      'answer', case when attempt.solved then jsonb_build_object(
        'id', puzzle.solution->>'player',
        'name', (select display_name from private.daily_game_entities where entity_id = puzzle.solution->>'player')
      ) else null end
    );
    if attempt.solved then
      attempt.progress := attempt.progress || jsonb_build_object('outcome', case when is_correct then 'won' else 'lost' end);
    end if;
  end if;

  if attempt.solved then attempt.completed_at := now(); end if;
  attempt.updated_at := now();
  update public.daily_game_attempts set
    attempts_count = attempt.attempts_count,
    mistakes_count = attempt.mistakes_count,
    solved = attempt.solved,
    completed_at = attempt.completed_at,
    score = attempt.score,
    progress = attempt.progress,
    updated_at = attempt.updated_at
  where game = p_game and puzzle_date = p_puzzle_date and user_id = current_user_id;

  return jsonb_build_object(
    'game', p_game,
    'correct', is_correct,
    'attempts_count', attempt.attempts_count,
    'mistakes_count', attempt.mistakes_count,
    'solved', attempt.solved,
    'score', attempt.score,
    'progress', attempt.progress
  );
end;
$$;
revoke all on function public.submit_daily_game_guess(text, date, jsonb) from public, anon;
grant execute on function public.submit_daily_game_guess(text, date, jsonb) to authenticated;

create or replace function public.publish_daily_game_puzzle(
  p_game text,
  p_puzzle_date date,
  p_payload jsonb,
  p_solution jsonb,
  p_content_hash text,
  p_difficulty smallint,
  p_repeat_key_hashes text[],
  p_repeat_window_days smallint,
  p_source_refs jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_repeat_days integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_game is null or p_puzzle_date is null or p_content_hash is null
    or p_difficulty is null or p_repeat_window_days is null
    or p_game not in ('connections', 'grid', 'player')
    or p_difficulty not between 1 and 7
    or extract(isodow from p_puzzle_date)::smallint <> p_difficulty
    or p_content_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_solution) is distinct from 'object'
    or jsonb_typeof(p_source_refs) is distinct from 'array'
    or p_source_refs = '[]'::jsonb
    or coalesce(cardinality(p_repeat_key_hashes), 0) = 0
    or exists (
      select 1 from unnest(p_repeat_key_hashes) as keys(key_hash)
      where keys.key_hash !~ '^[0-9a-f]{64}$'
    )
    or cardinality(p_repeat_key_hashes) <> (
      select count(distinct key_hash) from unnest(p_repeat_key_hashes) as keys(key_hash)
    ) then
    raise exception 'Invalid daily game puzzle';
  end if;

  if exists (
    select 1 from private.daily_game_puzzles puzzle
    where puzzle.game = p_game and puzzle.puzzle_date = p_puzzle_date
  ) then
    return false;
  end if;
  if exists (
    select 1 from private.daily_game_puzzles puzzle
    where puzzle.game = p_game and puzzle.content_hash = p_content_hash
  ) then
    raise exception 'Puzzle content has already been published';
  end if;

  default_repeat_days := case p_game
    when 'player' then 90
    when 'grid' then 60
    else 45
  end;
  if p_repeat_window_days not between 30 and default_repeat_days
    or (default_repeat_days - p_repeat_window_days) % 15 <> 0 then
    raise exception 'Invalid repetition window';
  end if;
  if exists (
    select 1
    from private.daily_game_repetition_ledger ledger
    where ledger.game = p_game
      and ledger.repeat_key_hash = any(p_repeat_key_hashes)
      and ledger.puzzle_date between p_puzzle_date - p_repeat_window_days and p_puzzle_date - 1
  ) then
    raise exception 'Puzzle key used inside repetition window';
  end if;

  insert into private.daily_game_repeat_events (
    game, puzzle_date, repeat_key_hash, previous_date, default_window_days, used_window_days
  )
  select
    p_game, p_puzzle_date, ledger.repeat_key_hash, max(ledger.puzzle_date),
    default_repeat_days, p_repeat_window_days
  from private.daily_game_repetition_ledger ledger
  where ledger.game = p_game
    and ledger.repeat_key_hash = any(p_repeat_key_hashes)
    and ledger.puzzle_date between p_puzzle_date - default_repeat_days and p_puzzle_date - p_repeat_window_days - 1
  group by ledger.repeat_key_hash;

  insert into private.daily_game_puzzles (
    game, puzzle_date, payload, solution, content_hash, difficulty, repeat_window_days, source_refs
  ) values (
    p_game, p_puzzle_date, p_payload, p_solution, p_content_hash, p_difficulty, p_repeat_window_days, p_source_refs
  );
  insert into private.daily_game_repetition_ledger (
    game, repeat_key_hash, puzzle_date, puzzle_content_hash
  )
  select p_game, keys.key_hash, p_puzzle_date, p_content_hash
  from unnest(p_repeat_key_hashes) as keys(key_hash)
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.publish_daily_game_puzzle(text, date, jsonb, jsonb, text, smallint, text[], smallint, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_daily_game_puzzle(text, date, jsonb, jsonb, text, smallint, text[], smallint, jsonb)
  to service_role;

create or replace function public.get_daily_game_schedule(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  schedule_rows jsonb;
  history_hashes jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_start_date is null or p_end_date < p_start_date
    or p_end_date > p_start_date + 59 then
    raise exception 'Invalid schedule range';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'game', puzzle.game,
    'puzzle_date', puzzle.puzzle_date,
    'content_hash', puzzle.content_hash,
    'repeat_key_hashes', coalesce(keys.hashes, '[]'::jsonb)
  ) order by puzzle.puzzle_date, puzzle.game), '[]'::jsonb)
  into schedule_rows
  from private.daily_game_puzzles puzzle
  left join lateral (
    select jsonb_agg(ledger.repeat_key_hash) as hashes
    from private.daily_game_repetition_ledger ledger
    where ledger.game = puzzle.game
      and ledger.puzzle_date = puzzle.puzzle_date
  ) keys on true
  where puzzle.puzzle_date between p_start_date - 90 and p_end_date;

  select coalesce(jsonb_object_agg(game, hashes), '{}'::jsonb)
  into history_hashes
  from (
    select puzzle.game, jsonb_agg(puzzle.content_hash) as hashes
    from private.daily_game_puzzles puzzle
    group by puzzle.game
  ) all_hashes;

  return jsonb_build_object('puzzles', schedule_rows, 'content_hashes', history_hashes);
end;
$$;
revoke all on function public.get_daily_game_schedule(date, date) from public, anon, authenticated;
grant execute on function public.get_daily_game_schedule(date, date) to service_role;

notify pgrst, 'reload schema';
commit;
