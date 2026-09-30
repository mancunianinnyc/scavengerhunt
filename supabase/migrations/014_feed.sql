-- 014: read-only event feed for the WhatsApp notifier (Pipo / OpenClaw VPS).
-- The VPS polls public.hunt_feed every ~15 s with its own feed key (sha256 in
-- hunt.config.feed_hash) — it never holds the admin passcode and can only read
-- event lines, never photos. Messages go to the quizmasters only; the final
-- stop is still left unnamed.

alter table hunt.config add column if not exists feed_hash text;

create or replace function hunt._hm(p interval) returns text
language sql immutable as $$
  select floor(extract(epoch from p) / 3600)::int || 'h' || lpad((floor(extract(epoch from p) / 60)::int % 60)::text, 2, '0')
$$;

create or replace function public.hunt_feed(p_key text, p_since timestamptz, p_tests boolean default false)
returns jsonb
language plpgsql stable security definer
set search_path to 'hunt', 'public', 'extensions'
as $function$
declare
  v_until timestamptz := now() - interval '2 seconds';  -- let in-flight writes commit
  v_since timestamptz;
  v_total int;
  v_events jsonb;
begin
  if p_key is null or not exists (select 1 from hunt.config where feed_hash = encode(extensions.digest(p_key, 'sha256'), 'hex')) then
    raise exception 'bad_feed_key';
  end if;
  -- no cursor = start from now; never replay more than 6 h
  v_since := greatest(coalesce(p_since, v_until), v_until - interval '6 hours');
  if v_since >= v_until then
    return jsonb_build_object('until', v_since, 'events', '[]'::jsonb);
  end if;
  select count(*) into v_total from hunt.stops;

  with tm as (
    select t.id, t.depart, t.members,
           t.name || case when t.is_test then ' [test]' else '' end as nm,
           (select count(*) from hunt.legs l where l.team_id = t.id and l.taxi) as taxis
      from hunt.teams t
     where p_tests or not t.is_test
  ), ev as (
    select tm.depart as t, 1 as ord, tm.id as team, 'depart' as kind,
           '🚦 ' || tm.nm || ' set off'
             || case when coalesce(array_length(tm.members, 1), 0) > 0 then ' (' || array_to_string(tm.members, ', ') || ')' else '' end as text
      from tm
     where tm.depart > v_since and tm.depart <= v_until
    union all
    select c.t, 2, tm.id, case when c.ok then 'checkin' else 'checkin_nogps' end,
           case when c.ok then '📍 ' || tm.nm || ' reached stop ' else '⚠️ ' || tm.nm || ' checked in WITHOUT GPS at stop ' end
             || c.stop || '/' || v_total
             || ' (' || case when s.finish then 'final stop' else s.name end || ')'
             || ' · ' || hunt._hm(c.t - tm.depart)
             || case when tm.taxis > 0 then ' · 🚕 ' || tm.taxis else '' end
             || case when c.ok then '' else ' — check they are really there' end
      from hunt.checkins c join tm on tm.id = c.team_id join hunt.stops s on s.n = c.stop
     where c.t > v_since and c.t <= v_until
    union all
    select coalesce(b.updated_at, b.t), 3, tm.id,
           case when b.status = 'approved' then 'solved' when s.finish and not b.resub then 'finish' else 'proof' end,
           case
             when b.status = 'approved' then '✅ ' || tm.nm || ' solved stop ' || s.n || ' (' || s.name || ')'
             when s.finish and not b.resub then '🏁 ' || tm.nm || ' FINISHED · ' || hunt._hm(b.t - tm.depart)
                  || case when tm.taxis > 0 then ' · 🚕 ' || tm.taxis else '' end || ' — final photo to review'
             when s.n is not null then '📸 ' || tm.nm || ' sent a photo for stop ' || s.n
                  || ' (' || case when s.finish then 'final stop' else s.name end || ')'
                  || case when b.resub then ', second try' else '' end || ' — to review'
             else '📸 ' || tm.nm || ' sent a side quest photo: ' || coalesce(d.name, b.key)
                  || case when b.resub then ', second try' else '' end || ' — to review'
           end
      from hunt.subs b join tm on tm.id = b.team_id
      left join hunt.stops s on s.n = case when b.key ~ '^s[0-9]+$' then substring(b.key from 2)::int end
      left join hunt.sides d on d.id = b.key
     where coalesce(b.updated_at, b.t) > v_since and coalesce(b.updated_at, b.t) <= v_until
       and (b.status = 'pending' or (b.status = 'approved' and b.kind = 'phrase'))
  )
  select coalesce(jsonb_agg(jsonb_build_object('t', ev.t, 'team', ev.team, 'kind', ev.kind, 'text', ev.text) order by ev.t, ev.ord), '[]'::jsonb)
    into v_events from ev;

  return jsonb_build_object('until', v_until, 'events', v_events);
end $function$;

revoke all on function public.hunt_feed(text, timestamptz, boolean) from public;
grant execute on function public.hunt_feed(text, timestamptz, boolean) to anon, authenticated;

-- feed_hash is set out of band (sha256 of the key that lives only on the VPS):
--   update hunt.config set feed_hash = '<sha256 hex>' where id = 1;
