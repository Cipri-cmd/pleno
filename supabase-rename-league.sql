begin;

create or replace function public.rename_league(
  p_league_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name text := regexp_replace(
    btrim(coalesce(p_name, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
  v_league_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if char_length(v_name) not between 1 and 50 then
    raise exception 'League name must contain 1 to 50 characters';
  end if;

  select league.id into v_league_id
  from public.leagues league
  where league.id = p_league_id
    and league.owner_id = v_user_id
  for update;

  if v_league_id is null then
    raise exception 'Only the league creator can rename this league';
  end if;

  update public.leagues
  set name = v_name
  where id = v_league_id;
end;
$$;

revoke all on function public.rename_league(uuid, text)
  from public, anon, authenticated;
grant execute on function public.rename_league(uuid, text)
  to authenticated;

commit;
