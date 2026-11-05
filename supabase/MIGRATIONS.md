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

For league display-name changes, run `supabase-rename-league-display-name.sql`
in the Supabase SQL Editor. The RPC only lets an authenticated user update
their own membership name and validates the normalized name length.

For league owners to rename their leagues, run `supabase-rename-league.sql`.
First apply `supabase-delete-league.sql`, which adds the `owner_id` column this
RPC uses to verify ownership. The rename RPC accepts names from 1 to 50
characters after trimming repeated whitespace.

For league owners to remove a member, run `supabase-remove-league-member.sql`
after `supabase-delete-league.sql`. Only the creator can remove another member;
the creator cannot remove themself through this RPC. A removed member's
predictions are retained, matching the existing leave-league behavior, and
become available again if they rejoin.

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
