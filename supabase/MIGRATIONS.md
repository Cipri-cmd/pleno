# Supabase SQL workflow

The root `supabase-*.sql` files are incremental feature scripts, not a complete
database bootstrap. They depend on core tables such as `leagues`,
`league_members`, and `predictions`, which are not created by this repository.
Do not run every file against a new or production project as one unreviewed
batch.

For the age-confirmation change, run `supabase-age-consent.sql` in the Supabase
SQL Editor. It is idempotent and can be re-run safely. It creates or updates
`user_legal_consents`, enables row-level security, and only allows each
authenticated user to manage their own consent record. The existing
`supabase-privacy-moderation.sql` also contains the same schema change for
future setups.

The repository does not yet have a verified migration baseline for the
existing Supabase project. Before converting the remaining feature scripts to
versioned migrations or assembling a one-shot bundle, compare them with the
project's applied schema; otherwise an already-applied or dependent script
could fail partway through.

## Daily challenge automation

The paid Render cron has been removed. GitHub Actions runs
`.github/workflows/publish-daily-challenge.yml` daily and can also be started
manually. Add these repository Actions secrets:

- `FOOTBALL_DATA_KEY`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

The separate daily-puzzle workflow also needs `PUZZLE_SEED_SECRET`. Scheduled
workflows require GitHub Actions to be enabled for the repository.
