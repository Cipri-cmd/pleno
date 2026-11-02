begin;

with challenge_config as (
  select
    (now() at time zone 'Europe/Madrid')::date as challenge_date,
    (((now() at time zone 'Europe/Madrid')::date + 1)::timestamp
      at time zone 'Europe/Madrid') as closes_at,
    (
      select fixture.match_id
      from public.league_matches fixture
      where fixture.kickoff > now()
      order by fixture.kickoff
      limit 1
    ) as featured_match_id
),
created_challenge as (
  insert into public.daily_challenges (
    challenge_date,
    title,
    clues,
    featured_match_id,
    published_at,
    closes_at
  )
  select
    challenge_date,
    'El Fichaje Clandestino',
    '[
      {"label":"Primer rastro","text":"Debutó como profesional en Lisboa antes de cumplir los 18 años."},
      {"label":"Palmarés","text":"Ha ganado ligas nacionales en Inglaterra, España e Italia."},
      {"label":"Récord europeo","text":"Fue el primer jugador en superar los 100 goles en la UEFA Champions League."},
      {"label":"Temporada histórica","text":"Marcó 17 goles en una sola edición de la Champions League."},
      {"label":"Último informe","text":"Anotó 450 goles oficiales con el Real Madrid y ganó cinco Balones de Oro."}
    ]'::jsonb,
    featured_match_id,
    now(),
    closes_at
  from challenge_config
  on conflict (challenge_date) do update
    set featured_match_id = coalesce(
      public.daily_challenges.featured_match_id,
      excluded.featured_match_id
    ),
    clues = excluded.clues
  returning id
)
insert into private.daily_challenge_answers (challenge_id, answer_normalized, accepted_answers)
select id, 'cristiano ronaldo', array[
  'cr7',
  'cristiano ronaldo dos santos aveiro'
]
from created_challenge
on conflict (challenge_id) do nothing;

commit;
