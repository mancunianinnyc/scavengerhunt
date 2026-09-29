-- El Gran Scavenger Hunt de Bogotá — schema + RPC layer.
-- Lives in its own `hunt` schema inside the Personal Library Supabase project.
-- Tables are NOT exposed: RLS on, no grants to anon/authenticated. The only way in is the
-- SECURITY DEFINER functions named public.hunt_*, each of which checks a team token or the admin key.

create schema if not exists hunt;
revoke all on schema hunt from public, anon, authenticated;

create table if not exists hunt.config (
  id int primary key default 1 check (id = 1),
  admin_hash text not null,
  theatron_team text,
  taxi_limit int not null default 4,
  updated_at timestamptz not null default now()
);

create table if not exists hunt.stops (
  n int primary key,
  name text not null,
  clue text not null,
  ask text not null,
  proof text not null check (proof in ('phrase','photo','voice')),
  hint text,
  qm text,
  finish boolean not null default false,
  lat double precision,
  lng double precision,
  radius int not null default 250,
  answer_words text[]
);

create table if not exists hunt.sides (
  id text primary key,
  name text not null,
  place text,
  pts int not null,
  after_stop int not null,
  ask text not null,
  sort int not null default 0
);

create table if not exists hunt.teams (
  id text primary key,
  name text not null,
  color text not null,
  token text not null unique,
  depart timestamptz not null,
  quiz jsonb not null default '{}',
  acts jsonb not null default '{}',
  adj int not null default 0,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists hunt.checkins (
  team_id text not null references hunt.teams on delete cascade,
  stop int not null references hunt.stops,
  t timestamptz not null default now(),
  ok boolean not null,
  dist int,
  lat double precision, lng double precision, accuracy double precision,
  primary key (team_id, stop)
);

create table if not exists hunt.hints (
  team_id text not null references hunt.teams on delete cascade,
  stop int not null references hunt.stops,
  t timestamptz not null default now(),
  primary key (team_id, stop)
);

create table if not exists hunt.subs (
  team_id text not null references hunt.teams on delete cascade,
  key text not null,
  t timestamptz not null default now(),
  status text not null check (status in ('pending','approved','rejected')),
  kind text not null,
  answer text,
  media text,
  media_type text,
  note text,
  resub boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (team_id, key)
);

create table if not exists hunt.taxis (
  id bigserial primary key,
  team_id text not null references hunt.teams on delete cascade,
  t timestamptz not null default now()
);

alter table hunt.config enable row level security;
alter table hunt.stops enable row level security;
alter table hunt.sides enable row level security;
alter table hunt.teams enable row level security;
alter table hunt.checkins enable row level security;
alter table hunt.hints enable row level security;
alter table hunt.subs enable row level security;
alter table hunt.taxis enable row level security;

-- ---------- internal helpers (not callable by anon) ----------
create or replace function hunt._team(p_token text) returns hunt.teams
language plpgsql stable security definer set search_path = hunt, public as $$
declare t hunt.teams;
begin
  select * into t from hunt.teams where token = p_token;
  if not found then raise exception 'bad_token'; end if;
  return t;
end $$;

create or replace function hunt._admin(p_key text) returns void
language plpgsql stable security definer set search_path = hunt, public, extensions as $$
begin
  if p_key is null or not exists (select 1 from hunt.config where admin_hash = encode(extensions.digest(p_key, 'sha256'), 'hex')) then
    raise exception 'bad_admin';
  end if;
end $$;

-- current stop = highest submitted stop + 1 (a rejected proof still counts as "moved on"); null when finished
create or replace function hunt._current(p_team text) returns int
language sql stable security definer set search_path = hunt, public as $$
  select case when m >= 10 then null else m + 1 end
  from (select coalesce(max(substring(key from 2)::int), 0) as m from hunt.subs where team_id = p_team and key ~ '^s[0-9]+$') x;
$$;

create or replace function hunt._norm(p text) returns text
language sql immutable as $$
  select translate(lower(coalesce(p,'')), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun');
$$;

create or replace function hunt._dist(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision) returns double precision
language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

revoke all on function hunt._team(text), hunt._admin(text), hunt._current(text), hunt._norm(text),
  hunt._dist(double precision,double precision,double precision,double precision) from public, anon, authenticated;

-- ---------- team RPCs ----------
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
    'team', jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'depart', t.depart),
    'taxis', (select count(*) from hunt.taxis where team_id = t.id),
    'taxiLimit', coalesce(lim, 4),
    'finish', (select s.t from hunt.subs s where s.team_id = t.id and s.key = 's10' and s.status <> 'rejected'),
    'progress', coalesce((select jsonb_agg(jsonb_build_object('n', s.n, 'name', s.name, 'ask', s.ask, 'proof', s.proof,
        'status', sb.status, 't', sb.t, 'note', sb.note, 'hint', h.stop is not null) order by s.n)
      from hunt.stops s join hunt.subs sb on sb.team_id = t.id and sb.key = 's' || s.n
      left join hunt.hints h on h.team_id = t.id and h.stop = s.n), '[]'::jsonb),
    'current', case when cur is null or now() < t.depart then null else jsonb_build_object(
      'n', st.n, 'clue', st.clue, 'ask', st.ask, 'proof', st.proof, 'qm', st.qm, 'finish', st.finish,
      'hint', (select st.hint from hunt.hints h where h.team_id = t.id and h.stop = st.n),
      'checkin', (select jsonb_build_object('t', c.t, 'ok', c.ok, 'dist', c.dist, 'name', st.name)
                  from hunt.checkins c where c.team_id = t.id and c.stop = st.n)) end,
    'sides', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'place', d.place, 'pts', d.pts,
        'ask', d.ask, 'status', sb.status, 'note', sb.note) order by d.sort)
      from hunt.sides d left join hunt.subs sb on sb.team_id = t.id and sb.key = d.id
      where now() >= t.depart and (coalesce(cur, 11) > d.after_stop or sb.key is not null)), '[]'::jsonb)
  );
end $$;

create or replace function public.hunt_checkin(p_token text, p_lat double precision, p_lng double precision, p_acc double precision)
returns jsonb language plpgsql volatile security definer set search_path = hunt, public as $$
declare t hunt.teams; cur int; st hunt.stops; d double precision; c hunt.checkins;
begin
  t := hunt._team(p_token);
  if now() < t.depart then raise exception 'not_started'; end if;
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
  if now() < t.depart then raise exception 'not_started'; end if;
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
  insert into hunt.taxis(team_id) values (t.id);
  return jsonb_build_object('ok', true, 'taxis', (select count(*) from hunt.taxis where team_id = t.id));
end $$;

create or replace function public.hunt_submit(p_token text, p_key text, p_answer text, p_media text, p_media_type text)
returns jsonb language plpgsql volatile security definer set search_path = hunt, public as $$
declare t hunt.teams; cur int; v_n int; st hunt.stops; d hunt.sides; prev hunt.subs; w text; ok boolean := true;
begin
  t := hunt._team(p_token);
  if now() < t.depart then raise exception 'not_started'; end if;
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

-- ---------- admin RPCs ----------
create or replace function public.hunt_admin_state(p_key text) returns jsonb
language plpgsql stable security definer set search_path = hunt, public as $$
begin
  perform hunt._admin(p_key);
  return jsonb_build_object(
    'now', now(),
    'config', (select jsonb_build_object('theatron', theatron_team, 'taxiLimit', taxi_limit) from hunt.config where id = 1),
    'stops', (select jsonb_agg(jsonb_build_object('n', n, 'name', name, 'ask', ask, 'proof', proof, 'hint', hint, 'finish', finish,
        'lat', lat, 'lng', lng, 'radius', radius) order by n) from hunt.stops),
    'sides', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'place', place, 'pts', pts, 'after', after_stop, 'ask', ask) order by sort) from hunt.sides),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'color', t.color, 'token', t.token, 'depart', t.depart, 'quiz', t.quiz, 'acts', t.acts, 'adj', t.adj, 'isTest', t.is_test,
        'subs', coalesce((select jsonb_agg(jsonb_build_object('key', s.key, 't', s.t, 'status', s.status, 'kind', s.kind, 'answer', s.answer,
                  'note', s.note, 'resub', s.resub, 'hasMedia', s.media is not null, 'mediaType', s.media_type, 'updated', s.updated_at)) from hunt.subs s where s.team_id = t.id), '[]'::jsonb),
        'checkins', coalesce((select jsonb_agg(jsonb_build_object('stop', c.stop, 't', c.t, 'ok', c.ok, 'dist', c.dist)) from hunt.checkins c where c.team_id = t.id), '[]'::jsonb),
        'hints', coalesce((select jsonb_agg(h.stop) from hunt.hints h where h.team_id = t.id), '[]'::jsonb),
        'taxis', coalesce((select jsonb_agg(x.t order by x.t) from hunt.taxis x where x.team_id = t.id), '[]'::jsonb)
      ) order by t.is_test, t.depart, t.id) from hunt.teams t), '[]'::jsonb)
  );
end $$;

create or replace function public.hunt_admin_media(p_key text, p_team text, p_sub text) returns jsonb
language plpgsql stable security definer set search_path = hunt, public as $$
begin
  perform hunt._admin(p_key);
  return (select jsonb_build_object('media', media, 'type', media_type) from hunt.subs where team_id = p_team and key = p_sub);
end $$;

create or replace function public.hunt_admin_review(p_key text, p_team text, p_sub text, p_status text, p_note text)
returns jsonb language plpgsql volatile security definer set search_path = hunt, public as $$
begin
  perform hunt._admin(p_key);
  if p_status not in ('approved','rejected','pending') then raise exception 'bad_status'; end if;
  update hunt.subs set status = p_status, note = case when p_status = 'rejected' then coalesce(p_note, 'Los quizmasters la rechazaron') else null end, updated_at = now()
   where team_id = p_team and key = p_sub;
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.hunt_admin_score(p_key text, p_team text, p_quiz jsonb, p_acts jsonb, p_adj int)
returns jsonb language plpgsql volatile security definer set search_path = hunt, public as $$
begin
  perform hunt._admin(p_key);
  update hunt.teams set quiz = coalesce(p_quiz, quiz), acts = coalesce(p_acts, acts), adj = coalesce(p_adj, adj) where id = p_team;
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.hunt_admin_theatron(p_key text, p_team text) returns jsonb
language plpgsql volatile security definer set search_path = hunt, public as $$
begin
  perform hunt._admin(p_key);
  update hunt.config set theatron_team = nullif(p_team, ''), updated_at = now() where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.hunt_admin_team(p_key text, p_team text, p_name text, p_depart timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = hunt, public as $$
begin
  perform hunt._admin(p_key);
  update hunt.teams set name = coalesce(nullif(trim(p_name), ''), name), depart = coalesce(p_depart, depart) where id = p_team;
  return jsonb_build_object('ok', found);
end $$;

-- wipes a team's progress (for test runs); never touches the team row itself
create or replace function public.hunt_admin_reset(p_key text, p_team text) returns jsonb
language plpgsql volatile security definer set search_path = hunt, public as $$
begin
  perform hunt._admin(p_key);
  delete from hunt.subs where team_id = p_team;
  delete from hunt.checkins where team_id = p_team;
  delete from hunt.hints where team_id = p_team;
  delete from hunt.taxis where team_id = p_team;
  update hunt.teams set quiz = '{}', acts = '{}', adj = 0 where id = p_team;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.hunt_state(text), public.hunt_checkin(text,double precision,double precision,double precision),
  public.hunt_hint(text), public.hunt_taxi(text), public.hunt_submit(text,text,text,text,text),
  public.hunt_admin_state(text), public.hunt_admin_media(text,text,text), public.hunt_admin_review(text,text,text,text,text),
  public.hunt_admin_score(text,text,jsonb,jsonb,int), public.hunt_admin_theatron(text,text),
  public.hunt_admin_team(text,text,text,timestamptz), public.hunt_admin_reset(text,text) from public;
grant execute on function public.hunt_state(text), public.hunt_checkin(text,double precision,double precision,double precision),
  public.hunt_hint(text), public.hunt_taxi(text), public.hunt_submit(text,text,text,text,text),
  public.hunt_admin_state(text), public.hunt_admin_media(text,text,text), public.hunt_admin_review(text,text,text,text,text),
  public.hunt_admin_score(text,text,jsonb,jsonb,int), public.hunt_admin_theatron(text,text),
  public.hunt_admin_team(text,text,text,timestamptz), public.hunt_admin_reset(text,text) to anon, authenticated;
