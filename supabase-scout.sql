begin;

-- Daily challenge content is split from its private answer. The public API
-- schema only serves hints; answer keys are never exposed to PostgREST.
create table if not exists public.scout_daily_challenges (
  challenge_date date primary key,
  title text not null default 'El Fichaje Diario',
  hints jsonb not null,
  published_at timestamptz not null default now(),
  closes_at timestamptz not null,
  target_matchday smallint not null check (target_matchday between 1 and 60),
  reward_expires_at timestamptz not null,
  check (jsonb_typeof(hints) = 'array'),
  check (jsonb_array_length(hints) = 5),
  check (closes_at > published_at),
  check (reward_expires_at > closes_at)
);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.scout_daily_solutions (
  challenge_date date primary key
    references public.scout_daily_challenges(challenge_date) on delete cascade,
  answer_normalized text not null,
  accepted_answers text[] not null default '{}',
  created_at timestamptz not null default now()
);
revoke all on private.scout_daily_solutions from public, anon, authenticated;
grant all on private.scout_daily_solutions to service_role;

-- One row per account and challenge date. The trusted Edge Function owns
-- writes, so a client cannot reset its attempt or mark a wrong guess correct.
create table if not exists public.scout_daily_attempts (
  challenge_date date not null
    references public.scout_daily_challenges(challenge_date) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hints_revealed smallint not null default 0 check (hints_revealed between 0 and 5),
  guess_normalized text,
  is_correct boolean,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  primary key (challenge_date, user_id),
  unique (challenge_date, user_id, league_id),
  check (
    (guess_normalized is null and is_correct is null and submitted_at is null)
    or
    (guess_normalized is not null and is_correct is not null and submitted_at is not null)
  )
);
alter table public.scout_daily_attempts enable row level security;
revoke all on public.scout_daily_attempts from anon, authenticated;
grant select on public.scout_daily_attempts to authenticated;
grant all on public.scout_daily_attempts to service_role;

drop policy if exists "Players read own scout attempt" on public.scout_daily_attempts;
create policy "Players read own scout attempt"
  on public.scout_daily_attempts for select to authenticated
  using (user_id = (select auth.uid()));

-- Transparent, free rewards. Odds are basis points and must total 10,000.
create table if not exists public.scout_reward_catalog (
  reward_key text primary key,
  name text not null,
  description text not null,
  weight_basis_points integer not null check (weight_basis_points between 0 and 10000),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.scout_reward_catalog
  (reward_key, name, description, weight_basis_points)
values
  ('weekend_boost', 'Botas de Oro', '+5 puntos extra en una jornada elegida.', 4500),
  ('joker', 'Maletín', 'Duplica los puntos de un pronóstico propio.', 3500),
  ('prediction_shield', 'Escudo VAR', 'Protege uno de tus pronósticos: si fallas, recibes 3 puntos.', 2000)
on conflict (reward_key) do nothing;

create table if not exists public.scout_reward_claims (
  challenge_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  base_reward_key text not null references public.scout_reward_catalog(reward_key),
  var_choice text not null default 'keep'
    check (var_choice in ('keep', 'spin')),
  var_result text not null default 'pending'
    check (var_result in ('pending', 'secured', 'doubled')),
  final_reward_quantity smallint not null default 1
    check (final_reward_quantity between 0 and 2),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  primary key (challenge_date, user_id),
  unique (challenge_date, user_id, league_id),
  foreign key (challenge_date, user_id, league_id)
    references public.scout_daily_attempts(challenge_date, user_id, league_id) on delete cascade,
  check (
    (var_result = 'pending' and opened_at is null)
    or (var_result in ('secured', 'doubled') and opened_at is not null)
  )
);
alter table public.scout_reward_claims enable row level security;
revoke all on public.scout_reward_claims from anon, authenticated;
grant select on public.scout_reward_claims to authenticated;
grant all on public.scout_reward_claims to service_role;

drop policy if exists "Players read own scout rewards" on public.scout_reward_claims;
create policy "Players read own scout rewards"
  on public.scout_reward_claims for select to authenticated
  using (user_id = (select auth.uid()));

-- Inventory instances are bound to a league and expire at that matchday's
-- final whistle. The server validates expiry again when consuming an item.
create table if not exists public.scout_inventory (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_key text not null references public.scout_reward_catalog(reward_key),
  source_challenge_date date not null,
  target_matchday smallint not null check (target_matchday between 1 and 60),
  quantity smallint not null default 1 check (quantity between 1 and 2),
  status text not null default 'available'
    check (status in ('available', 'consumed', 'expired')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (source_challenge_date, user_id, league_id)
    references public.scout_reward_claims(challenge_date, user_id, league_id) on delete cascade,
  unique (source_challenge_date, user_id),
  check (
    (status = 'consumed' and consumed_at is not null)
    or (status <> 'consumed' and consumed_at is null)
  )
);
create index if not exists scout_inventory_available
  on public.scout_inventory (league_id, user_id, expires_at)
  where status = 'available';
alter table public.scout_inventory enable row level security;
revoke all on public.scout_inventory from anon, authenticated;
grant select on public.scout_inventory to authenticated;
grant all on public.scout_inventory to service_role;

drop policy if exists "Players read own scout inventory" on public.scout_inventory;
create policy "Players read own scout inventory"
  on public.scout_inventory for select to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_league_member(league_id)
  );

-- Clients may read challenge hints and active reward descriptions only.
alter table public.scout_daily_challenges enable row level security;
alter table public.scout_reward_catalog enable row level security;
revoke all on public.scout_daily_challenges, public.scout_reward_catalog
  from anon, authenticated;
grant select (challenge_date, title, published_at, closes_at)
  on public.scout_daily_challenges to authenticated;
grant select on public.scout_reward_catalog to authenticated;
grant all on public.scout_daily_challenges, public.scout_reward_catalog
  to service_role;

drop policy if exists "Authenticated players read published scout hints"
  on public.scout_daily_challenges;
create policy "Authenticated players read published scout hints"
  on public.scout_daily_challenges for select to authenticated
  using (published_at <= now() and closes_at > now());

drop policy if exists "Authenticated players read active scout rewards"
  on public.scout_reward_catalog;
create policy "Authenticated players read active scout rewards"
  on public.scout_reward_catalog for select to authenticated
  using (enabled);

-- Returns only already revealed hints and the caller's own attempt/reward.
-- The answer remains in the private schema and is never part of this payload.
create or replace function public.get_scout_daily_state(
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
  challenge public.scout_daily_challenges%rowtype;
  attempt public.scout_daily_attempts%rowtype;
  claim public.scout_reward_claims%rowtype;
  inventory public.scout_inventory%rowtype;
  revealed_hints jsonb := '[]'::jsonb;
begin
  if player is null or not public.is_league_member(p_league_id) then
    raise exception 'League membership required';
  end if;

  select * into challenge
  from public.scout_daily_challenges
  where challenge_date = p_challenge_date
    and published_at <= now();
  if not found then
    return jsonb_build_object('available', false);
  end if;

  select * into attempt
  from public.scout_daily_attempts
  where challenge_date = p_challenge_date
    and user_id = player
    and league_id = p_league_id;

  if found and attempt.hints_revealed > 0 then
    select coalesce(jsonb_agg(challenge.hints -> clue_index order by clue_index), '[]'::jsonb)
      into revealed_hints
      from generate_series(0, attempt.hints_revealed - 1) as clues(clue_index);
  end if;

  select * into claim
  from public.scout_reward_claims
  where challenge_date = p_challenge_date
    and user_id = player
    and league_id = p_league_id;

  if found then
    select * into inventory
    from public.scout_inventory
    where source_challenge_date = p_challenge_date
      and user_id = player
      and league_id = p_league_id;
  end if;

  return jsonb_build_object(
    'available', true,
    'challenge', jsonb_build_object(
      'date', challenge.challenge_date,
      'title', challenge.title,
      'closes_at', challenge.closes_at,
      'target_matchday', challenge.target_matchday,
      'reward_expires_at', challenge.reward_expires_at
    ),
    'playable', challenge.closes_at > now(),
    'attempt', case when attempt.user_id is null then null else jsonb_build_object(
      'hints_revealed', attempt.hints_revealed,
      'hints', revealed_hints,
      'submitted_at', attempt.submitted_at,
      'is_correct', attempt.is_correct,
      'answer', case when attempt.submitted_at is null then null else (
        select solution.answer_normalized
        from private.scout_daily_solutions solution
        where solution.challenge_date = p_challenge_date
      ) end
    ) end,
    'reward', case when claim.user_id is null then null else jsonb_build_object(
      'reward_key', claim.base_reward_key,
      'var_result', claim.var_result,
      'quantity', claim.final_reward_quantity,
      'opened_at', claim.opened_at
    ) end,
    'inventory', case when inventory.id is null then null else jsonb_build_object(
      'id', inventory.id,
      'reward_key', inventory.reward_key,
      'quantity', inventory.quantity,
      'status', inventory.status,
      'target_matchday', inventory.target_matchday,
      'expires_at', inventory.expires_at
    ) end
  );
end;
$$;

revoke all on function public.get_scout_daily_state(date, uuid)
  from public, anon;
grant execute on function public.get_scout_daily_state(date, uuid)
  to authenticated;

-- A player can reveal one clue at a time; the database persists progress and
-- creates the unique daily row on the first request.
create or replace function public.reveal_scout_hint(
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
  attempt public.scout_daily_attempts%rowtype;
  clue jsonb;
begin
  if player is null or not public.is_league_member(p_league_id) then
    raise exception 'League membership required';
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
  if attempt.hints_revealed >= 5 then
    return jsonb_build_object('finished', true, 'hints_revealed', 5);
  end if;

  select c.hints -> attempt.hints_revealed into clue
  from public.scout_daily_challenges c
  where c.challenge_date = p_challenge_date;
  if clue is null then
    raise exception 'Daily clue is unavailable';
  end if;

  update public.scout_daily_attempts
    set hints_revealed = hints_revealed + 1
    where challenge_date = p_challenge_date and user_id = player;

  return jsonb_build_object(
    'hint_number', attempt.hints_revealed + 1,
    'hint', clue,
    'hints_revealed', attempt.hints_revealed + 1
  );
end;
$$;

revoke all on function public.reveal_scout_hint(date, uuid)
  from public, anon;
grant execute on function public.reveal_scout_hint(date, uuid)
  to authenticated;

-- One final guess per user/date. The private answer and weighted reward draw
-- are evaluated in the database; neither can be supplied by the browser.
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
  weight_total integer;
  roll integer;
  reward_key text;
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

  update public.scout_daily_attempts
    set guess_normalized = normalized_guess,
        is_correct = correct,
        submitted_at = now()
    where challenge_date = p_challenge_date and user_id = player;

  if not correct then
    return jsonb_build_object(
      'correct', false,
      'answer', solution.answer_normalized,
      'reward_pending', false
    );
  end if;

  select coalesce(sum(weight_basis_points), 0)
    into weight_total
    from public.scout_reward_catalog
    where enabled;
  if weight_total <> 10000 then
    raise exception 'Enabled scout reward weights must total 10000';
  end if;
  roll := floor(random() * weight_total)::integer + 1;
  select weighted.reward_key into reward_key
  from (
    select reward_key,
      sum(weight_basis_points) over (order by reward_key) as cumulative_weight
    from public.scout_reward_catalog
    where enabled
  ) weighted
  where weighted.cumulative_weight >= roll
  order by weighted.cumulative_weight
  limit 1;
  if reward_key is null then
    raise exception 'Could not select a scout reward';
  end if;

  insert into public.scout_reward_claims
    (challenge_date, user_id, league_id, base_reward_key)
  values (p_challenge_date, player, p_league_id, reward_key);

  return jsonb_build_object(
    'correct', true,
    'answer', solution.answer_normalized,
    'reward_pending', true,
    'reveal_after_choice', true
  );
end;
$$;

revoke all on function public.submit_scout_guess(date, uuid, text)
  from public, anon;
grant execute on function public.submit_scout_guess(date, uuid, text)
  to authenticated;

-- Exactly one free roulette attempt, only after a correct answer.
-- It cannot destroy the guaranteed reward: the 50/50 outcome is secured
-- (keep one) or doubled (two of the same reward).
create or replace function public.resolve_scout_var(
  p_challenge_date date,
  p_spin boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := (select auth.uid());
  claim public.scout_reward_claims%rowtype;
  outcome text;
  amount smallint;
  inventory_id uuid;
begin
  if player is null then
    raise exception 'Authentication required';
  end if;

  select * into claim
  from public.scout_reward_claims
  where challenge_date = p_challenge_date and user_id = player
  for update;
  if not found then
    raise exception 'No reward to open';
  end if;
  if claim.opened_at is not null then
    select item.id into inventory_id
    from public.scout_inventory item
    where item.source_challenge_date = p_challenge_date
      and item.user_id = player;
    return jsonb_build_object(
      'result', claim.var_result,
      'reward_key', claim.base_reward_key,
      'quantity', claim.final_reward_quantity,
      'inventory_id', inventory_id,
      'replayed', true
    );
  end if;

  if p_spin then
    if random() < 0.5 then
      outcome := 'doubled';
      amount := 2;
    else
      outcome := 'secured';
      amount := 1;
    end if;
  else
    outcome := 'secured';
    amount := 1;
  end if;

  update public.scout_reward_claims
    set var_choice = case when p_spin then 'spin' else 'keep' end,
        var_result = outcome,
        final_reward_quantity = amount,
        opened_at = now()
    where challenge_date = p_challenge_date and user_id = player;

  insert into public.scout_inventory
    (league_id, user_id, reward_key, source_challenge_date,
     target_matchday, quantity, expires_at)
  select claim.league_id, player, claim.base_reward_key, p_challenge_date,
         challenge.target_matchday, amount, challenge.reward_expires_at
  from public.scout_daily_challenges challenge
  where challenge.challenge_date = p_challenge_date
  returning id into inventory_id;
  if inventory_id is null then
    raise exception 'Could not create the reward inventory item';
  end if;

  return jsonb_build_object(
    'result', outcome,
    'reward_key', claim.base_reward_key,
    'quantity', amount,
    'inventory_id', inventory_id,
    'replayed', false
  );
end;
$$;

revoke all on function public.resolve_scout_var(date, boolean)
  from public, anon;
grant execute on function public.resolve_scout_var(date, boolean)
  to authenticated;

commit;
