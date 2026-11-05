begin;

create or replace function public.remove_league_member(
  p_league_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_locked_league_id uuid;
begin
  if v_owner_id is null then
    raise exception 'Authentication required';
  end if;

  select league.id into v_locked_league_id
  from public.leagues league
  where league.id = p_league_id
    and league.owner_id = v_owner_id
  for update;

  if v_locked_league_id is null then
    raise exception 'Only the league creator can remove members';
  end if;

  if p_user_id is null or p_user_id = v_owner_id then
    raise exception 'The league creator cannot be removed';
  end if;

  delete from public.league_members
  where league_id = v_locked_league_id
    and user_id = p_user_id;

  if not found then
    raise exception 'The selected user is not a member of this league';
  end if;
end;
$$;

revoke all on function public.remove_league_member(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.remove_league_member(uuid, uuid)
  to authenticated;

commit;
