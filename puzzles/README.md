# Daily puzzle catalog

The reviewed source catalog is stored as `catalog.json` in the private Supabase
Storage bucket `puzzle-catalog`. `catalog.example.json` documents its shape but is
not production content. Do not commit the real catalog: it contains candidate
answers. Empty arrays intentionally make production generation fail rather than
publish invented football facts.

Use Wikidata entity IDs (`Q...`) as answer identities and source references.
Wikidata data is CC0. Keep source IDs for every fact used to author a puzzle.
Use football-data.org only for current LaLiga squad data and follow its current
attribution and API terms. Do not add copied biographies, photos, or scraped data.
Catalog names must be unique (case-insensitive), every answer entity must exist
in the entity list, and a person must review puzzle wording and source facts
before upload. Automated checks cannot determine whether a football claim is
factually correct or whether wording is offensive.
The top-level `entities` array contains `{id, name, attributes}` records used
to display answer choices and compare verified player attributes. Names and
attributes are stored privately; clients receive display names only, while a
player puzzle's secret attributes stay server-side.

Each candidate has:

- `id`: stable catalog identifier.
- `difficulty`: integer 1 (Monday) through 7 (Sunday).
- `source_refs`: non-empty array of Wikidata QIDs backing its facts.
- `repeat_keys`: unique QIDs that must not recur inside that game's repeat window.
- `public` and `solution`: separate client-safe content and private answers.

Connections candidates additionally provide `possible_groups`: every verified
four-entity category that could be formed from the 16 tiles. The validator
requires exactly one exact-cover solution. Grid candidates provide three row
conditions, three column conditions, and nine answer arrays in row-major order;
each cell must have 3–60 verified answers. Player candidates use a QID as
`solution.player` and provide `club`, `country`, `position`, `age`,
`shirt_number`, and `height_cm` in `public.player`.

The weekly difficulty scale is Monday 1 through Sunday 7. A candidate must
match the date's level exactly. Default anti-repetition windows are 45 days for
Connections, 60 for Grid, and 90 for players. If a candidate can only be used
by reducing that window, the generator reduces it in 15-day steps (never below
30), writes the prior date and actual window to `private.daily_game_repeat_events`,
and emits a warning in the GitHub Actions log. If no eligible candidate remains,
generation fails visibly; it never repeats silently.

Player QIDs are also tracked across the full published history, independently
of the 90-day repetition window. The generator chooses an unused player whenever
the catalog still has one; it warns when the complete player pool has been used
and a player must be reused. GitHub Actions refreshes the 60-day reserve every
six hours so transient scheduled-run failures can be retried automatically.

The generator keeps answers in the private Supabase schema and reads the
catalog from the non-public Storage bucket. The scheduled workflow requires
repository secrets `PUZZLE_SEED_SECRET`, `SUPABASE_URL`, and
`SUPABASE_SECRET_KEY`, plus the SQL migration `supabase-daily-games.sql` applied
to the Supabase project and a curated catalog uploaded to that bucket. Reapply
the migration after updating it so the schedule RPC returns the all-time player
ledger. Create the private bucket by running the migration, then upload the
reviewed JSON as `catalog.json` in Supabase Storage. The HMAC seed is never
committed or sent to clients.

The migration also provides a service-role-only emergency replacement RPC,
`publish_daily_game_replacement`. It replaces only an already-published date,
keeps the original puzzle and repetition ledger for audit, and changes both the
public clues and private validation answer atomically. Record the correction
reason; do not put solutions or service credentials in the public repository.
Guess validation is limited to 20 requests per player and game per minute.

Daily and weekly league XP is written only for the current Madrid date.
Archived games remain playable but do not change streaks or league XP.

Run the synthetic-only pipeline tests with:

```powershell
node --test tests\daily-games.test.mjs
```

The test fixtures are deliberately synthetic and are never publishable catalog
entries.
