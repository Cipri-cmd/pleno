begin;

with challenge_config as (
  select
    (now() at time zone 'Europe/Madrid')::date as challenge_date,
    (((now() at time zone 'Europe/Madrid')::date + 1)::timestamp
      at time zone 'Europe/Madrid') as closes_at
)
insert into public.scout_daily_challenges (
  challenge_date,
  title,
  hints,
  published_at,
  closes_at,
  target_matchday,
  reward_expires_at
)
select
  challenge_date,
  'El Fichaje Diario',
  '[
    {"label":"Nacionalidad","text":"Es portugués."},
    {"label":"Origen","text":"Nació en Funchal, en la isla de Madeira."},
    {"label":"Posición","text":"Juega como delantero."},
    {"label":"Hito","text":"Ganó su primer Balón de Oro en 2008."},
    {"label":"Trayectoria","text":"Marcó más de 400 goles oficiales con el Real Madrid."}
  ]'::jsonb,
  now(),
  closes_at,
  12,
  closes_at + interval '7 days'
from challenge_config
on conflict (challenge_date) do nothing;

insert into private.scout_daily_solutions (
  challenge_date,
  answer_normalized,
  accepted_answers
)
select
  (now() at time zone 'Europe/Madrid')::date,
  'cristiano ronaldo',
  array['cr7', 'cristiano ronaldo dos santos aveiro']
on conflict (challenge_date) do nothing;

commit;
