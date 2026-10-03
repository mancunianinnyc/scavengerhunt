-- 015: how did you get here? walk / bus / taxi (event day, 3 Oct).
-- Bus legs earn +5 with an approved selfie (sub key b<N> = leg arriving at stop N).
-- Taxi counting is unchanged (legs.taxi + hunt.taxis stay in sync).

alter table hunt.legs add column if not exists mode text default 'walk';
update hunt.legs set mode = case when taxi then 'taxi' else 'walk' end where mode is null;

create or replace function public.hunt_leg_mode(p_token text, p_mode text)
returns jsonb language plpgsql security definer set search_path to 'hunt', 'public' as $function$
declare v_team hunt.teams; cur int;
begin
  v_team := hunt._team(p_token);
  perform hunt._require_started(v_team);
  if p_mode is null or p_mode not in ('walk','bus','taxi') then raise exception 'bad_mode'; end if;
  cur := hunt._current(v_team.id);
  if cur is null then raise exception 'finished'; end if;
  if not exists (select 1 from hunt.checkins where team_id = v_team.id and stop = cur) then raise exception 'not_checked_in'; end if;
  insert into hunt.legs(team_id, stop, taxi, mode) values (v_team.id, cur, p_mode = 'taxi', p_mode)
    on conflict (team_id, stop) do update set taxi = excluded.taxi, mode = excluded.mode, t = now();
  delete from hunt.taxis where team_id = v_team.id and stop = cur;
  if p_mode = 'taxi' then insert into hunt.taxis(team_id, stop) values (v_team.id, cur); end if;
  if p_mode <> 'bus' then delete from hunt.subs where team_id = v_team.id and key = 'b' || cur and status <> 'approved'; end if;
  return jsonb_build_object('ok', true, 'mode', p_mode, 'taxis', (select count(*) from hunt.taxis where team_id = v_team.id));
end $function$;
revoke all on function public.hunt_leg_mode(text, text) from public;
grant execute on function public.hunt_leg_mode(text, text) to anon, authenticated;

-- old clients: yes/no taxi still works and records a mode
create or replace function public.hunt_leg_taxi(p_token text, p_taxi boolean)
returns jsonb language plpgsql security definer set search_path to 'hunt', 'public' as $function$
begin
  return public.hunt_leg_mode(p_token, case when p_taxi then 'taxi' else 'walk' end);
end $function$;

do $do$
declare d text;
begin
  -- hunt_submit: bus selfie keys b<N> (only for a leg answered "bus")
  d := pg_get_functiondef('public.hunt_submit(text,text,text,text,text)'::regprocedure);
  d := replace(d, $a$  select * into d from hunt.sides where id = p_key;$a$, $b$  if p_key ~ '^b[0-9]+$' then
    v_n := substring(p_key from 2)::int;
    if not exists (select 1 from hunt.legs where team_id = t.id and stop = v_n and mode = 'bus') then raise exception 'not_bus'; end if;
    if prev.key is not null and prev.status <> 'rejected' then raise exception 'already_submitted'; end if;
    if p_media is null then raise exception 'media_required'; end if;
    insert into hunt.subs(team_id, key, status, kind, media, media_type, resub) values (t.id, p_key, 'pending', 'photo', p_media, p_media_type, prev.key is not null)
      on conflict (team_id, key) do update set status = 'pending', media = excluded.media, media_type = excluded.media_type, note = null, resub = true, updated_at = now();
    return jsonb_build_object('ok', true, 'status', 'pending');
  end if;

  select * into d from hunt.sides where id = p_key;$b$);
  if position('not_bus' in d) = 0 then raise exception 'submit patch failed'; end if;
  execute d;

  -- hunt_state: current.legMode + current.bus (selfie status)
  d := pg_get_functiondef('public.hunt_state(text)'::regprocedure);
  d := replace(d, $a$'legTaxi', (select l.taxi from hunt.legs l where l.team_id = v_team.id and l.stop = st.n),$a$,
    $b$'legTaxi', (select l.taxi from hunt.legs l where l.team_id = v_team.id and l.stop = st.n),
      'legMode', (select l.mode from hunt.legs l where l.team_id = v_team.id and l.stop = st.n),
      'bus', (select sb.status from hunt.subs sb where sb.team_id = v_team.id and sb.key = 'b' || st.n),$b$);
  if position('legMode' in d) = 0 then raise exception 'state patch failed'; end if;
  execute d;

  -- hunt_feed: label bus selfies for the WhatsApp notifier
  d := pg_get_functiondef('public.hunt_feed(text,timestamptz,boolean)'::regprocedure);
  d := replace(d, $a$             when s.n is not null then '📸 '$a$, $b$             when b.key ~ '^b[0-9]+$' then '🚌 ' || tm.nm || ' took the bus to stop ' || substring(b.key from 2)
                  || case when b.resub then ', second try' else '' end || ' — selfie to review'
             when s.n is not null then '📸 '$b$);
  if position('took the bus' in d) = 0 then raise exception 'feed patch failed'; end if;
  execute d;
end $do$;
