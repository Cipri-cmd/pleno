create table if not exists public.league_matches (
  match_id bigint primary key,
  kickoff timestamptz not null
);

alter table public.league_matches enable row level security;
revoke all on public.league_matches from anon, authenticated;

alter table public.predictions
  add column if not exists joker boolean not null default false;

create or replace function public.can_view_prediction(
  p_league_id uuid,
  p_user_id uuid,
  p_match_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    or (
      public.is_league_member(p_league_id)
      and exists (
        select 1
        from public.league_matches fixture
        where fixture.match_id = p_match_id
          and fixture.kickoff <= now()
      )
    );
$$;

revoke all on function public.can_view_prediction(uuid, uuid, bigint) from public;
grant execute on function public.can_view_prediction(uuid, uuid, bigint) to authenticated;

drop policy if exists "Players can view their own predictions" on public.predictions;
drop policy if exists "Members can view predictions after kickoff" on public.predictions;

create policy "Members can view predictions after kickoff"
on public.predictions for select to authenticated
using (public.can_view_prediction(league_id, user_id, match_id));
