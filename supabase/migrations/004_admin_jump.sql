-- 003 (applied directly): hunt_state rewritten with v_team/v_started to avoid the "t" column ambiguity. See 002 for the prior body.
-- 004: test teams only — wipe progress and mark stops 1..p_stop-1 as done, so a demo can start at any stop.
create or replace function public.hunt_admin_jump(p_key text, p_team text, p_stop int) returns jsonb
language plpgsql volatile security definer set search_path = hunt, public as $$
begin
  perform hunt._admin(p_key);
  if not exists (select 1 from hunt.teams where id = p_team and is_test) then raise exception 'test_only'; end if;
  if p_stop < 1 or p_stop > 10 then raise exception 'bad_stop'; end if;
  delete from hunt.subs where team_id = p_team;
  delete from hunt.checkins where team_id = p_team;
  delete from hunt.hints where team_id = p_team;
  insert into hunt.checkins(team_id, stop, ok, dist) select p_team, g, true, 0 from generate_series(1, p_stop - 1) g;
  insert into hunt.subs(team_id, key, status, kind, answer) select p_team, 's' || g, 'approved', 'demo', 'demo' from generate_series(1, p_stop - 1) g;
  update hunt.teams set depart = now() - ((p_stop - 1) * interval '30 minutes') where id = p_team;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.hunt_admin_jump(text, text, int) from public;
grant execute on function public.hunt_admin_jump(text, text, int) to anon, authenticated;
