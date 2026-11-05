begin;

create or replace function public.update_league_display_name(
  p_league_id uuid,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_display_name text := regexp_replace(
    btrim(coalesce(p_display_name, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if char_length(v_display_name) not between 1 and 30 then
    raise exception 'Display name must contain 1 to 30 characters';
  end if;

  update public.league_members
  set display_name = v_display_name
  where league_id = p_league_id
    and user_id = v_user_id;

  if not found then
    raise exception 'League membership not found';
  end if;
end;
$$;

revoke all on function public.update_league_display_name(uuid, text)
  from public, anon, authenticated;
grant execute on function public.update_league_display_name(uuid, text)
  to authenticated;

commit;
