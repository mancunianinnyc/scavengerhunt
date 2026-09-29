-- Admin-managed teams: members, nullable departure (null = waiting for the quizmasters' Start), stagger setting.
alter table hunt.teams add column if not exists members text[] not null default '{}';
alter table hunt.teams alter column depart drop not null;
alter table hunt.config add column if not exists stagger_minutes int not null default 10;

-- started = has a departure time that has passed
create or replace function hunt._started(t hunt.teams) returns boolean language sql stable as $$ select t.depart is not null and now() >= t.depart $$;
revoke all on function hunt._started(hunt.teams) from public, anon, authenticated;

create or replace function public.hunt_state(p_token text) returns jsonb
language plpgsql stable security definer set search_path = hunt, public as $$
declare t hunt.teams; cur int; st hunt.stops; lim int;
begin
  t := hunt._team(p_token);
  cur := hunt._current(t.id);
  select * into st from hunt.stops where n = cur;
  select taxi_limit into lim from hunt.config where id = 1;
  return jsonb_build_object(
    'now', now(),
    'team', jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'depart', t.depart, 'members', t.members),
    'taxis', (select count(*) from hunt.taxis where team_id = t.id),
    'taxiLimit', coalesce(lim, 4),
    'finish', (select s.t from hunt.subs s where s.team_id = t.id and s.key = 's10' and s.status <> 'rejected'),
    'progress', coalesce((select jsonb_agg(jsonb_build_object('n', s.n, 'name', s.name, 'ask', s.ask, 'proof', s.proof,
        'status', sb.status, 't', sb.t, 'note', sb.note, 'hint', h.stop is not null) order by s.n)
      from hunt.stops s join hunt.subs sb on sb.team_id = t.id and sb.key = 's' || s.n
      left join hunt.hints h on h.team_id = t.id and h.stop = s.n), '[]'::jsonb),
    'current', case when cur is null or not hunt._started(t) then null else jsonb_build_object(
      'n', st.n, 'clue', st.clue, 'ask', st.ask, 'proof', st.proof, 'qm', st.qm, 'finish', st.finish,
      'hint', (select st.hint from hunt.hints h where h.team_id = t.id and h.stop = st.n),
      'checkin', (select jsonb_build_object('t', c.t, 'ok', c.ok, 'dist', c.dist, 'name', st.name)
                  from hunt.checkins c where c.team_id = t.id and c.stop = st.n)) end,
    'sides', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'place', d.place, 'pts', d.pts,
        'ask', d.ask, 'status', sb.status, 'note', sb.note) order by d.sort)
      from hunt.sides d left join hunt.subs sb on sb.team_id = t.id and sb.key = d.id
      where hunt._started(t) and (coalesce(cur, 11) > d.after_stop or sb.key is not null)), '[]'::jsonb)
  );
end $$;

-- guard every team write on "started"
create or replace function hunt._require_started(t hunt.teams) returns void language plpgsql stable as $$
begin if not hunt._started(t) then raise exception 'not_started'; end if; end $$;
revoke all on function hunt._require_started(hunt.teams) from public, anon, authenticated;


create or replace function public.hunt_checkin(p_token text, p_lat double precision, p_lng double precision, p_acc double precision)
returns jsonb language plpgsql volatile security definer set search_path = hunt, public as $$
declare t hunt.teams; cur int; st hunt.stops; d double precision; c hunt.checkins;
begin
  t := hunt._team(p_token);
  perform hunt._require_started(t);
  cur := hunt._current(t.id);
  if cur is null then raise exception 'finished'; end if;
  select * into st from hunt.stops where n = cur;
  select * into c from hunt.checkins where team_id = t.id and stop = cur;
  if found then return jsonb_build_object('ok', true, 'gps', c.ok, 'dist', c.dist, 'name', st.name, 'already', true); end if;
  if p_lat is null or p_lng is null then
    insert into hunt.checkins(team_id, stop, ok) values (t.id, cur, false);
    return jsonb_build_object('ok', true, 'gps', false, 'name', st.name);
  end if;
  d := hunt._dist(p_lat, p_lng, st.lat, st.lng);
  if d <= st.radius + least(coalesce(p_acc, 0), 150) then
    insert into hunt.checkins(team_id, stop, ok, dist, lat, lng, accuracy) values (t.id, cur, true, round(d), p_lat, p_lng, p_acc);
    return jsonb_build_object('ok', true, 'gps', true, 'dist', round(d), 'name', st.name);
  end if;
  return jsonb_build_object('ok', false, 'dist', round(d));
end $$;

create or replace function public.hunt_hint(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = hunt, public as $$
declare t hunt.teams; cur int; h text;
begin
  t := hunt._team(p_token);
  perform hunt._require_started(t);
  cur := hunt._current(t.id);
  if cur is null then raise exception 'finished'; end if;
  insert into hunt.hints(team_id, stop) values (t.id, cur) on conflict do nothing;
  select hint into h from hunt.stops where n = cur;
  return jsonb_build_object('ok', true, 'stop', cur, 'hint', h);
end $$;

create or replace function public.hunt_taxi(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = hunt, public as $$
declare t hunt.teams;
begin
  t := hunt._team(p_token);
  perform hunt._require_started(t);
  insert into hunt.taxis(team_id) values (t.id);
  return jsonb_build_object('ok', true, 'taxis', (select count(*) from hunt.taxis where team_id = t.id));
end $$;

create or replace function public.hunt_submit(p_token text, p_key text, p_answer text, p_media text, p_media_type text)
returns jsonb language plpgsql volatile security definer set search_path = hunt, public as $$
declare t hunt.teams; cur int; v_n int; st hunt.stops; d hunt.sides; prev hunt.subs; w text; ok boolean := true;
begin
  t := hunt._team(p_token);
  perform hunt._require_started(t);
  if p_media is not null and length(p_media) > 4000000 then raise exception 'too_large'; end if;
  cur := hunt._current(t.id);
  select * into prev from hunt.subs where team_id = t.id and key = p_key;

  if p_key ~ '^s[0-9]+$' then
    v_n := substring(p_key from 2)::int;
    select * into st from hunt.stops where hunt.stops.n = v_n;
    if not found then raise exception 'bad_key'; end if;
    if prev.key is not null and prev.status <> 'rejected' then raise exception 'already_submitted'; end if;
    if prev.key is null then
      if cur is distinct from v_n then raise exception 'wrong_stop'; end if;
      if not exists (select 1 from hunt.checkins where team_id = t.id and stop = v_n) then raise exception 'not_checked_in'; end if;
    end if;
    if st.proof = 'phrase' then
      foreach w in array coalesce(st.answer_words, '{}') loop
        if position(hunt._norm(w) in hunt._norm(p_answer)) = 0 then ok := false; end if;
      end loop;
      if not ok or coalesce(trim(p_answer), '') = '' then return jsonb_build_object('ok', false, 'reason', 'wrong'); end if;
      insert into hunt.subs(team_id, key, status, kind, answer, resub) values (t.id, p_key, 'approved', 'phrase', p_answer, prev.key is not null)
        on conflict (team_id, key) do update set status = 'approved', answer = excluded.answer, note = null, resub = true, updated_at = now();
      return jsonb_build_object('ok', true, 'status', 'approved', 'next', hunt._current(t.id));
    end if;
    if p_media is null then raise exception 'media_required'; end if;
    insert into hunt.subs(team_id, key, status, kind, media, media_type, resub) values (t.id, p_key, 'pending', st.proof, p_media, p_media_type, prev.key is not null)
      on conflict (team_id, key) do update set status = 'pending', media = excluded.media, media_type = excluded.media_type, note = null, resub = true, updated_at = now();
    return jsonb_build_object('ok', true, 'status', 'pending', 'next', hunt._current(t.id));
  end if;

  select * into d from hunt.sides where id = p_key;
  if not found then raise exception 'bad_key'; end if;
  if prev.key is not null and prev.status <> 'rejected' then raise exception 'already_submitted'; end if;
  if prev.key is null and coalesce(cur, 11) <= d.after_stop then raise exception 'locked'; end if;
  if p_media is null then raise exception 'media_required'; end if;
  insert into hunt.subs(team_id, key, status, kind, media, media_type, resub) values (t.id, p_key, 'pending', 'photo', p_media, p_media_type, prev.key is not null)
    on conflict (team_id, key) do update set status = 'pending', media = excluded.media, media_type = excluded.media_type, note = null, resub = true, updated_at = now();
  return jsonb_build_object('ok', true, 'status', 'pending');
end $$;

-- admin state now carries members + stagger
create or replace function public.hunt_admin_state(p_key text) returns jsonb
language plpgsql stable security definer set search_path = hunt, public as $$
begin
  perform hunt._admin(p_key);
  return jsonb_build_object(
    'now', now(),
    'config', (select jsonb_build_object('theatron', theatron_team, 'taxiLimit', taxi_limit, 'stagger', stagger_minutes) from hunt.config where id = 1),
    'stops', (select jsonb_agg(jsonb_build_object('n', n, 'name', name, 'ask', ask, 'proof', proof, 'hint', hint, 'finish', finish,
        'lat', lat, 'lng', lng, 'radius', radius) order by n) from hunt.stops),
    'sides', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'place', place, 'pts', pts, 'after', after_stop, 'ask', ask) order by sort) from hunt.sides),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'color', t.color, 'token', t.token, 'depart', t.depart, 'members', t.members,
        'quiz', t.quiz, 'acts', t.acts, 'adj', t.adj, 'isTest', t.is_test,
        'subs', coalesce((select jsonb_agg(jsonb_build_object('key', s.key, 't', s.t, 'status', s.status, 'kind', s.kind, 'answer', s.answer,
                  'note', s.note, 'resub', s.resub, 'hasMedia', s.media is not null, 'mediaType', s.media_type, 'updated', s.updated_at)) from hunt.subs s where s.team_id = t.id), '[]'::jsonb),
        'checkins', coalesce((select jsonb_agg(jsonb_build_object('stop', c.stop, 't', c.t, 'ok', c.ok, 'dist', c.dist)) from hunt.checkins c where c.team_id = t.id), '[]'::jsonb),
        'hints', coalesce((select jsonb_agg(h.stop) from hunt.hints h where h.team_id = t.id), '[]'::jsonb),
        'taxis', coalesce((select jsonb_agg(x.t order by x.t) from hunt.taxis x where x.team_id = t.id), '[]'::jsonb)
      ) order by t.is_test, t.created_at, t.id) from hunt.teams t), '[]'::jsonb)
  );
end $$;

drop function if exists public.hunt_admin_team(text, text, text, timestamptz);

-- create (p_team null) or update a team: name, colour, members
create or replace function public.hunt_admin_team_save(p_key text, p_team text, p_name text, p_color text, p_members text[])
returns jsonb language plpgsql volatile security definer set search_path = hunt, public, extensions as $$
declare v_id text;
begin
  perform hunt._admin(p_key);
  if p_team is null or p_team = '' then
    v_id := 't' || substr(md5(random()::text), 1, 6);
    insert into hunt.teams(id, name, color, token, depart, members)
    values (v_id, coalesce(nullif(trim(p_name), ''), 'Equipo nuevo'), coalesce(nullif(p_color, ''), '#16347F'),
            translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_'), null, coalesce(p_members, '{}'));
  else
    v_id := p_team;
    update hunt.teams set name = coalesce(nullif(trim(p_name), ''), name), color = coalesce(nullif(p_color, ''), color),
      members = coalesce(p_members, members) where id = p_team;
    if not found then raise exception 'no_team'; end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.hunt_admin_team_delete(p_key text, p_team text) returns jsonb
language plpgsql volatile security definer set search_path = hunt, public as $$
begin
  perform hunt._admin(p_key);
  delete from hunt.teams where id = p_team;
  update hunt.config set theatron_team = null where theatron_team = p_team;
  return jsonb_build_object('ok', true);
end $$;

-- set one team's departure: p_depart null = back to waiting; 'now' handled by the page sending the server time
create or replace function public.hunt_admin_depart(p_key text, p_team text, p_depart timestamptz, p_now boolean)
returns jsonb language plpgsql volatile security definer set search_path = hunt, public as $$
begin
  perform hunt._admin(p_key);
  update hunt.teams set depart = case when p_now then now() else p_depart end where id = p_team;
  return jsonb_build_object('ok', found);
end $$;

-- schedule the listed teams in order from p_first, p_stagger minutes apart; saves the stagger as the default
create or replace function public.hunt_admin_schedule(p_key text, p_order text[], p_first timestamptz, p_stagger int)
returns jsonb language plpgsql volatile security definer set search_path = hunt, public as $$
declare i int;
begin
  perform hunt._admin(p_key);
  if p_stagger is null or p_stagger < 0 or p_stagger > 120 then raise exception 'bad_stagger'; end if;
  update hunt.config set stagger_minutes = p_stagger, updated_at = now() where id = 1;
  for i in 1 .. coalesce(array_length(p_order, 1), 0) loop
    update hunt.teams set depart = coalesce(p_first, now()) + ((i - 1) * p_stagger) * interval '1 minute' where id = p_order[i];
  end loop;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.hunt_admin_team_save(text,text,text,text,text[]), public.hunt_admin_team_delete(text,text),
  public.hunt_admin_depart(text,text,timestamptz,boolean), public.hunt_admin_schedule(text,text[],timestamptz,int) from public;
grant execute on function public.hunt_admin_team_save(text,text,text,text,text[]), public.hunt_admin_team_delete(text,text),
  public.hunt_admin_depart(text,text,timestamptz,boolean), public.hunt_admin_schedule(text,text[],timestamptz,int) to anon, authenticated;

-- event teams start in "waiting" until the quizmasters schedule or start them
update hunt.teams set depart = null where not is_test;
