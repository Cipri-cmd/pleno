begin;

alter table private.daily_challenge_answers
  add column if not exists source_player_id text;

create or replace function public.publish_daily_challenge(
  p_challenge_date date,
  p_title text,
  p_clues jsonb,
  p_featured_match_id bigint,
  p_answer_normalized text,
  p_accepted_answers text[],
  p_source_player_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_id uuid;
  previous_player_id text;
  challenge_closes_at timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_challenge_date <> (now() at time zone 'Europe/Madrid')::date then
    raise exception 'Challenge date must be today in Europe/Madrid';
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 80
    or p_answer_normalized is null or length(btrim(p_answer_normalized)) not between 1 and 80
    or p_source_player_id is null or length(btrim(p_source_player_id)) not between 1 and 100
    or jsonb_typeof(p_clues) is distinct from 'array'
    or jsonb_array_length(p_clues) <> 5 then
    raise exception 'Invalid daily challenge content';
  end if;

  select challenge.id into existing_id
  from public.daily_challenges challenge
  where challenge.challenge_date = p_challenge_date;
  if found then
    if not exists (
      select 1 from private.daily_challenge_answers answer
      where answer.challenge_id = existing_id
    ) then
      raise exception 'Existing challenge has no configured answer';
    end if;
    return false;
  end if;

  select answer.source_player_id into previous_player_id
  from public.daily_challenges challenge
  join private.daily_challenge_answers answer on answer.challenge_id = challenge.id
  where challenge.challenge_date = p_challenge_date - 1;
  if previous_player_id is not null and previous_player_id = p_source_player_id then
    raise exception 'Player cannot repeat on consecutive days';
  end if;

  challenge_closes_at :=
    ((p_challenge_date + 1)::timestamp at time zone 'Europe/Madrid');

  insert into public.daily_challenges (
    challenge_date, title, clues, featured_match_id, published_at, closes_at
  ) values (
    p_challenge_date, btrim(p_title), p_clues, p_featured_match_id, now(), challenge_closes_at
  )
  returning id into existing_id;

  insert into private.daily_challenge_answers (
    challenge_id, answer_normalized, accepted_answers, source_player_id
  ) values (
    existing_id,
    lower(regexp_replace(btrim(p_answer_normalized), '\s+', ' ', 'g')),
    coalesce(p_accepted_answers, '{}'),
    btrim(p_source_player_id)
  );
  return true;
end;
$$;

revoke all on function public.publish_daily_challenge(date, text, jsonb, bigint, text, text[], text)
  from public, anon, authenticated;
grant execute on function public.publish_daily_challenge(date, text, jsonb, bigint, text, text[], text)
  to service_role;

commit;
