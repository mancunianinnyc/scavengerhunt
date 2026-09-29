/* Admin: teams & departures, proof review, live scoring, reveal. */
let KEY = null, STOPS = [], SIDE = [], TEAMS = [], CFG = {};
const S = {expanded:null, scoreTeam:null, showTests:false};
let modal = null, lightbox = null, loading = false;
const mediaCache = {};

/* ---------- data ---------- */
function model(d){
  syncClock(d.now);
  CFG = d.config || {}; STOPS = d.stops || []; SIDE = (d.sides || []).map(s => ({...s, where:s.place}));
  TEAMS = (d.teams || []).map(t => ({...t,
    depart: t.depart ? Date.parse(t.depart) : null,
    subs: Object.fromEntries(t.subs.map(s => [s.key, {...s, t:Date.parse(s.t)}])),
    taxis: t.taxis.map(x => Date.parse(x)),
    checkins: Object.fromEntries(t.checkins.map(c => [c.stop, {...c, t:Date.parse(c.t)}])),
    hints: t.hints || [], quiz: t.quiz || {}, acts: t.acts || {}, members: t.members || [] }));
  if (!TEAMS.find(t => t.id === S.scoreTeam)) S.scoreTeam = TEAMS.find(t=>!t.isTest)?.id || TEAMS[0]?.id;
}
async function load(){ model(await rpc('hunt_admin_state', {p_key: KEY})); }
const team = id => TEAMS.find(t => t.id === id);
const board = () => TEAMS.filter(t => S.showTests || !t.isTest);
const linkFor = t => `${location.origin}/?t=${encodeURIComponent(t.token)}`;
const taxiLimit = () => CFG.taxiLimit || 4;

/* ---------- scoring ---------- */
function finishT(t){ const f = t.subs.s10; return f && f.status !== 'rejected' ? f.t : null; }
function started(t){ return t.depart != null && now() >= t.depart; }
function elapsed(t){ if (t.depart == null) return 0; return (finishT(t) ?? now()) - t.depart; }
function currentStop(t){ let m = 0; for (const k in t.subs) if (/^s\d+$/.test(k)) m = Math.max(m, +k.slice(1)); return m >= 10 ? null : m + 1; }
function quizPts(t, q){ const v = t.quiz[q] || {}; let p = QUIZ[q].fields.reduce((a,[k,,w]) => a + (Number(v[k])||0)*w, 0); if (q==='q2' && Number(v.n) >= 20) p *= 2; return p; }
function placements(list){
  const fin = list.filter(t => { const f = finishT(t); return f && f <= HUNT.cutoff || (f && t.isTest); }).sort((a,b) => elapsed(a) - elapsed(b));
  const m = {}; fin.forEach((t,i) => m[t.id] = {place:i+1, pts: HUNT.placement[i] || 0}); return m;
}
function score(t, P){
  const stops = STOPS.filter(s => t.subs['s'+s.n]?.status === 'approved').length;
  const stopPts = STOPS.filter(s => t.subs['s'+s.n]?.status === 'approved' && !t.hints.includes(s.n)).length * HUNT.stopPts;
  const place = P[t.id]?.pts || 0;
  const quiz = Object.keys(QUIZ).reduce((a,q) => a + quizPts(t,q), 0);
  const side = SIDE.reduce((a,q) => a + (t.subs[q.id]?.status === 'approved' ? q.pts : 0), 0);
  const acts = ACTS.reduce((a,x) => a + (t.acts[x.id] ? x.pts : 0), 0) + (CFG.theatron === t.id ? HUNT.theatronBonus : 0);
  const extraTaxis = Math.max(0, t.taxis.length - taxiLimit());
  const pen = extraTaxis * HUNT.taxiPenalty;
  const adj = Number(t.adj) || 0;
  return {stops, stopPts, place, placeN:P[t.id]?.place, quiz, side, acts, pen, extraTaxis, hintsUsed:t.hints.length, adj, total: stopPts + place + quiz + side + acts - pen + adj, finished: !!finishT(t)};
}
function ranked(){ const list = board(); const P = placements(list); return list.map(t => ({t, s:score(t,P)})).sort((a,b) => b.s.total - a.s.total || elapsed(a.t) - elapsed(b.t)); }
const ord = n => n + (['st','nd','rd'][n-1] || 'th');

/* ---------- views ---------- */
function departLabel(t){
  if (t.depart == null) return '<span class="chip idle">Waiting</span>';
  if (now() < t.depart) return `<span class="chip pend">Leaves ${hm(t.depart)} · in ${Math.max(1, Math.round((t.depart - now())/60000))} min</span>`;
  if (finishT(t)) return `<span class="chip ok">At FRANC · ${dur(elapsed(t))}</span>`;
  return `<span class="chip ok">Out since ${hm(t.depart)}</span>`;
}
function teamsPanel(){
  const rows = TEAMS.map(t => `<div class="tm" data-team-row="${esc(t.id)}">
      <div class="tm-id"><input type="color" value="${esc(t.color)}" data-color="${esc(t.id)}" aria-label="Team colour">
        <input class="tm-name" value="${esc(t.name)}" data-name="${esc(t.id)}" aria-label="Team name">${t.isTest?'<span class="chip idle">test</span>':''}</div>
      <textarea class="tm-members" rows="2" data-members="${esc(t.id)}" placeholder="Members, one per line or comma-separated" aria-label="Members of ${esc(t.name)}">${esc(t.members.join(', '))}</textarea>
      <div class="tm-dep">${departLabel(t)}
        <div class="tm-btns">
          ${started(t) ? '' : `<button class="btn sm terra" data-start="${esc(t.id)}">Start now</button>`}
          <input type="time" class="tm-time" data-time="${esc(t.id)}" value="${t.depart ? hm(t.depart) : ''}" aria-label="Departure time for ${esc(t.name)}">
          ${t.depart != null ? `<button class="btn sm ghost" data-unstart="${esc(t.id)}">Clear</button>` : ''}
        </div></div>
      <div class="tm-link"><button class="btn sm ghost" data-copy="${esc(t.id)}">Copy link</button><a class="muted" href="${esc(linkFor(t))}" target="_blank" rel="noopener">Open</a>
        ${t.isTest ? `<label class="muted" style="font-size:12px">Demo: jump to <select data-jump="${esc(t.id)}" aria-label="Jump ${esc(t.name)} to stop"><option value="">stop…</option>${STOPS.map(s => `<option value="${s.n}">${s.n}. ${esc(s.name)}</option>`).join('')}</select></label>` : ''}
        <button class="t-link tm-danger" data-reset="${esc(t.id)}">Reset progress</button><button class="t-link tm-danger" data-delete="${esc(t.id)}">Delete</button></div>
    </div>`).join('');
  const ev = TEAMS.filter(t => !t.isTest);
  return `<section class="panel"><div class="panel-h"><h2>Teams &amp; departures</h2><p>Names and members save as you type. Each team's link opens its own view only.</p></div>
    <div class="sched"><label for="schedFirst">First departure<input type="time" id="schedFirst" value="10:00"></label>
      <label for="schedGap">Minutes apart<input type="number" id="schedGap" min="0" max="120" value="${CFG.stagger ?? 10}"></label>
      <button class="btn sm" id="schedOrder">Schedule in this order</button><button class="btn sm ghost" id="schedShuffle">Shuffle order &amp; schedule</button>
      <span class="muted" style="font-size:12px">Applies to the ${ev.length} event teams on 3 Oct.</span></div>
    <div class="tms">${rows}</div>
    <div style="margin-top:12px"><button class="btn sm ghost" id="addTeam">+ Add team</button></div></section>`;
}
function queuePanel(){
  const q = [];
  board().forEach(t => Object.entries(t.subs).forEach(([k,s]) => { if (s.status === 'pending') q.push({t,k,s}); }));
  q.sort((a,b) => a.s.t - b.s.t);
  const items = q.map(({t,k,s}) => {
    const st = /^s\d+$/.test(k) ? STOPS.find(x => 's'+x.n === k) : null; const sq = SIDE.find(x => x.id === k);
    const title = st ? `Stop ${st.n} · ${st.name}` : `Side quest · ${sq?.name} (${sq?.pts})`;
    const ci = st ? t.checkins[st.n] : null;
    const mk = `${t.id}|${k}|${s.updated}`; const m = mediaCache[mk];
    let ph;
    if (s.mediaType?.startsWith('audio')) ph = m?.media ? `<audio controls src="${m.media}" style="width:100%"></audio>` : '<div class="ph-load">loading audio…</div>';
    else ph = m?.media ? `<button class="ph-btn" data-zoom="${esc(mk)}"><img src="${m.media}" alt="Proof from ${esc(t.name)}"></button>` : `<div class="ph-load" style="background:${esc(t.color)}">loading…</div>`;
    return `<div class="qi ${s.mediaType?.startsWith('audio')?'audio':''}"><div class="ph">${ph}</div><div class="meta">
      <b>${esc(t.name)} · ${esc(title)}${s.resub?' · resubmitted':''}</b><span class="muted" style="font-size:12px"><span class="mono">${hm(s.t)}</span> · asked for: ${esc(st ? st.ask : sq?.ask)}</span>
      ${ci ? (ci.ok ? `<span class="chip ok" style="align-self:flex-start">GPS check-in · ${ci.dist ?? '?'} m</span>` : `<span class="chip pend" style="align-self:flex-start">No-GPS check-in: confirm location</span>`) : ''}
      <div class="acts"><button class="btn sm" data-approve="${esc(t.id)}|${esc(k)}">Approve</button><button class="btn sm ghost" data-reject="${esc(t.id)}|${esc(k)}">Reject</button></div></div></div>`;
  }).join('');
  return `<section class="panel"><div class="panel-h"><h2>Review queue</h2><p>Oldest first. Rejecting removes the stop's points until the team resubmits.</p></div>
    <div class="queue">${items || '<div class="empty">No proofs waiting. New photos and voice notes land here as teams submit them.</div>'}</div></section>`;
}
function leaderboardPanel(R){
  const rows = R.map(({t,s},i) => {
    const c = currentStop(t);
    const where = t.depart == null ? 'waiting to start' : now() < t.depart ? `leaves ${hm(t.depart)}` : !c ? 'at FRANC' : `→ ${c}. ${STOPS[c-1]?.name || ''}`;
    const row = `<tr class="lb" data-row="${esc(t.id)}"><td class="rank">${i+1}</td><td class="l"><div class="tname"><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}</div><div class="muted" style="font-size:12px">${esc(where)}</div></td>
      <td>${s.stops}/10</td><td class="mono">${started(t)?dur(elapsed(t)):'—'}</td><td class="${s.extraTaxis?'neg':''}">${t.taxis.length}/${taxiLimit()}</td><td>${s.hintsUsed}</td>
      <td>${s.stopPts}</td><td>${s.placeN?`${s.place} <span class="muted">(${ord(s.placeN)})</span>`:'<span class="muted">—</span>'}</td><td>${s.quiz}</td><td>${s.side+s.acts}</td><td class="${s.pen?'neg':''}">${s.pen?'−'+s.pen:0}</td><td class="total">${s.total}</td></tr>`;
    const bd = S.expanded === t.id ? `<tr class="bd"><td></td><td colspan="11"><div class="bdgrid">
      <div><span>Stops approved</span><b>${s.stops}, ${s.hintsUsed} with hint · ${s.stopPts}</b></div>
      <div><span>Placement bonus</span><b>${s.placeN?`${ord(s.placeN)} fastest · ${s.place}`:'not finished'}</b></div>
      ${Object.keys(QUIZ).map(q => `<div><span>${QUIZ[q].name}</span><b>${quizPts(t,q)}</b></div>`).join('')}
      ${SIDE.map(q => `<div><span>${esc(q.name)}</span><b>${t.subs[q.id]?.status==='approved'?q.pts:(t.subs[q.id]?t.subs[q.id].status:'—')}</b></div>`).join('')}
      <div><span>Drink can</span><b>${t.acts.can?10:0}</b></div><div><span>Theatron award</span><b>${CFG.theatron===t.id?HUNT.theatronBonus:0}</b></div>
      <div><span>Taxi penalty</span><b class="${s.extraTaxis?'neg':''}">${s.extraTaxis} extra · −${s.pen}</b></div><div><span>Manual adjustment</span><b>${s.adj}</b></div>
      <div><span>Members</span><b style="white-space:normal;text-align:right">${esc(t.members.join(', ')) || '—'}</b></div>
    </div></td></tr>` : '';
    return row + bd;
  }).join('');
  return `<section class="panel"><div class="panel-h"><h2>Leaderboard</h2><p>Hidden from teams. Tap a team for its breakdown. Placement is provisional until everyone reaches FRANC.</p></div>
    <div class="scroll"><table><thead><tr><th></th><th>Team</th><th>Stops</th><th>Elapsed</th><th>Taxis</th><th>Hints</th><th>Stop pts</th><th>Placement</th><th>Quiz</th><th>Side</th><th>Pen.</th><th>Total</th></tr></thead><tbody>${rows || '<tr><td colspan="12" class="l muted">No teams yet.</td></tr>'}</tbody></table></div></section>`;
}
function scorePanel(){
  const st = team(S.scoreTeam); if (!st) return '';
  return `<section class="panel"><div class="panel-h"><h2>Quizzes &amp; awards</h2><p>Enter counts; points save automatically.</p></div>
    <div class="scoreform">
      <div class="row"><label for="scoreTeam">Team<select id="scoreTeam">${TEAMS.map(t => `<option value="${esc(t.id)}" ${t.id===st.id?'selected':''}>${esc(t.name)}${t.isTest?' (test)':''}</option>`).join('')}</select></label></div>
      ${Object.entries(QUIZ).map(([q,def]) => `<div class="qblock"><div class="row"><h5>${def.name} <span class="muted" style="font-weight:400">· ${def.rule}</span></h5><span class="pts" id="qp-${q}">${quizPts(st,q)}</span></div>
        <div class="row">${def.fields.map(([k,label]) => `<label for="q-${q}-${k}">${label}<input type="number" min="0" ${def.max?`max="${def.max}"`:''} id="q-${q}-${k}" data-quiz="${q}" data-k="${k}" value="${st.quiz[q]?.[k] ?? ''}" placeholder="0"></label>`).join('')}</div></div>`).join('')}
      <div class="qblock"><div class="row">
        <label style="flex-direction:row;gap:6px;align-items:center;color:var(--ink)"><input type="checkbox" id="actCan" ${st.acts.can?'checked':''}> Correct drink can (+10)</label>
        <label for="adj">Manual ±<input type="number" id="adj" value="${st.adj||0}"></label></div></div>
      <div class="qblock"><div class="row"><label for="theatron">Most evocative Theatron photo (+${HUNT.theatronBonus}, one team)<select id="theatron"><option value="">Not awarded yet</option>${TEAMS.map(t => `<option value="${esc(t.id)}" ${CFG.theatron===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label></div></div>
    </div></section>`;
}
function matrixPanel(){
  const n = now();
  return `<section class="panel"><div class="panel-h"><h2>Check-in times</h2><p>Proof timestamps per stop. Dashed = where they are headed now. Amber dot = checked in without GPS.</p></div>
    <div class="scroll"><table class="matrix"><thead><tr><th>Team</th><th>Out</th>${STOPS.map(s => `<th title="${esc(s.name)}">${s.n}</th>`).join('')}<th>Taxi times</th></tr></thead><tbody>
    ${board().map(t => { const c = currentStop(t); return `<tr><td><div class="tname"><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}</div></td><td><span class="cell none" style="color:var(--ink-soft)">${t.depart?hm(t.depart):'—'}</span></td>
      ${STOPS.map(s => { const sub = t.subs['s'+s.n]; const ci = t.checkins[s.n]; const flag = ci && !ci.ok ? '<span class="nogps" title="No-GPS check-in"></span>' : '';
        if (sub) return `<td><span class="cell ${sub.status==='approved'?'ok':sub.status==='pending'?'pend':'bad'}">${hm(sub.t)}</span>${flag}</td>`;
        if (c === s.n && t.depart && n >= t.depart) return `<td><span class="cell here">${ci?'reto':'en ruta'}</span>${flag}</td>`;
        return `<td><span class="cell none">·</span></td>`; }).join('')}
      <td class="l mono ${t.taxis.length>taxiLimit()?'neg':''}" style="font-size:12px">${t.taxis.map(hm).join(', ') || '—'}</td></tr>`; }).join('')}
    </tbody></table></div></section>`;
}
function rulesPanel(){
  return `<section class="panel"><div class="panel-h"><h2>Scoring rules v1</h2><p>What this page calculates. <span class="prop">Proposed</span> items still need Julia's yes.</p></div>
    <p class="formula">Total = 10 × approved stops without a hint + placement bonus + quiz points + side quests + awards − taxi penalty ± manual</p>
    <div class="rules">
      <div class="rule"><h5>Stops</h5><ul><li>10 pts per approved stop, 10 stops, max 100.</li><li>Arrival is a GPS check-in within 250–400 m. A no-GPS check-in is allowed and flagged here.<span class="prop">Proposed</span></li><li>Phrase answers auto-check. Photos and voice notes unlock the next clue on submit; a rejected proof scores 0 until resubmitted.</li><li>Using a hint: that stop scores 0.<span class="prop">Proposed</span></li></ul></div>
      <div class="rule"><h5>Placement</h5><ul><li>Clock runs from each team's own departure to its FRANC photo.</li><li>Fastest three: 50 / 30 / 20.</li><li>FRANC after 18:00 earns no placement bonus.<span class="prop">Proposed</span></li><li>Tie-break: faster elapsed time.</li></ul></div>
      <div class="rule"><h5>Quizzes</h5><ul><li>Universities 1 each. Localidades 1 each, doubled for all 20.</li><li>Water bodies 2 each. Poets 3, writers 2, musicians 1.</li><li>3 minutes per quiz, phones away.<span class="prop">Proposed</span></li></ul></div>
      <div class="rule"><h5>Extras &amp; penalties</h5><ul><li>Coin 20 · Boyacá ticket 50 · Prom photo 20 · Drink can 10 · Theatron award 10.</li><li>Each taxi beyond ${taxiLimit()}: −10.<span class="prop">Proposed</span></li></ul></div>
    </div></section>`;
}
function adminView(){
  const R = ranked(); const n = now();
  const ev = board();
  const out = ev.filter(t => started(t) && !finishT(t)).length, fin = ev.filter(t => finishT(t)).length;
  let pend = 0; ev.forEach(t => Object.values(t.subs).forEach(s => { if (s.status === 'pending') pend++; }));
  const kpis = `<div class="kpis">
    <div class="kpi"><div class="k">On the route</div><div class="v num">${out}</div><div class="s">${fin} at FRANC · ${ev.length-out-fin} not started</div></div>
    <div class="kpi ${pend?'alert':''}"><div class="k">Proofs to review</div><div class="v num">${pend}</div><div class="s">${pend?'see the queue below':'queue clear'}</div></div>
    <div class="kpi"><div class="k">Leader right now</div><div class="v" style="font-size:22px">${R[0] ? esc(R[0].t.name) : '—'}</div><div class="s">${R[0] ? R[0].s.total + ' pts · hidden from teams' : ''}</div></div>
    <div class="kpi"><div class="k">Teams</div><div class="v num">${TEAMS.filter(t=>!t.isTest).length}</div><div class="s">${CFG.stagger ?? 10} min apart by default</div></div></div>`;
  return `<div class="admin">${kpis}${queuePanel()}${leaderboardPanel(R)}${teamsPanel()}<div class="grid2">${scorePanel()}${rulesPanel()}</div>${matrixPanel()}
    <section class="panel"><div class="panel-h"><h2>Finish &amp; reveal</h2><p>At FRANC, run the reveal on a phone or laptop: last place first.</p></div><div class="demo-ctl"><button class="btn terra" id="revealBtn">Start the reveal</button></div></section></div>
    ${overlay()}`;
}
function overlay(){
  if (lightbox) return `<div class="scrim" id="lbScrim"><img src="${lightbox}" alt="Proof photo" style="max-width:100%;max-height:90vh;border-radius:12px"></div>`;
  if (modal) return `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mH"><h3 id="mH">${esc(modal.title)}</h3><p>${esc(modal.body)}</p>
      <div class="btns"><button class="t-primary ${modal.danger?'terra':''}" id="mYes"><span>${esc(modal.yes)}</span><span aria-hidden="true">→</span></button><button class="sec" id="mNo">Cancel</button></div></div></div>`;
  return '';
}
function render(){
  $('#clk').textContent = hm(now());
  $('#tests').checked = S.showTests;
  $('#app').innerHTML = adminView();
  bind(); fetchMedia();
}
function login(msg){
  $('#app').innerHTML = `<div class="admin"><section class="panel" style="max-width:420px;margin:40px auto"><div class="panel-h"><h2>Quizmasters</h2></div>
    <form id="loginForm" class="scoreform"><label for="pass">Admin passcode<input id="pass" type="password" autocomplete="current-password" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--paper)"></label>
    ${msg?`<div class="err">${esc(msg)}</div>`:''}<button class="btn" type="submit">Open admin</button></form></section></div>`;
  $('#pass').focus();
  $('#loginForm').onsubmit = async e => { e.preventDefault(); KEY = $('#pass').value.trim(); try { await load(); try { localStorage.setItem('hunt-admin', KEY); } catch(_){} render(); } catch(err) { login(err.code === 'bad_admin' ? 'That passcode is not right.' : 'Could not reach the server. Try again.'); } };
}

/* ---------- actions ---------- */
async function doRpc(fn, args, okMsg){ try { await rpc(fn, {p_key:KEY, ...args}); await load(); render(); if (okMsg) toast(okMsg); } catch(e) { toast(e.code === 'offline' ? 'Offline. Try again.' : `Failed: ${e.code}`); } }
function confirmThen(m){ modal = m; render(); }
async function fetchMedia(){
  const need = [];
  board().forEach(t => Object.entries(t.subs).forEach(([k,s]) => { const mk = `${t.id}|${k}|${s.updated}`; if (s.status === 'pending' && s.hasMedia && !mediaCache[mk]) need.push([t.id,k,mk]); }));
  for (const [tid,k,mk] of need) { mediaCache[mk] = {loading:true}; try { const r = await rpc('hunt_admin_media', {p_key:KEY, p_team:tid, p_sub:k}); mediaCache[mk] = r || {}; } catch(e) { delete mediaCache[mk]; } }
  if (need.length && !isEditing()) render();
}
const saveTimers = {};
function saveTeamSoon(id){ clearTimeout(saveTimers[id]); saveTimers[id] = setTimeout(() => saveTeam(id), 700); }
async function saveTeam(id){
  const name = document.querySelector(`[data-name="${id}"]`)?.value; const color = document.querySelector(`[data-color="${id}"]`)?.value;
  const mem = (document.querySelector(`[data-members="${id}"]`)?.value || '').split(/[\n,]/).map(x => x.trim()).filter(Boolean);
  try { await rpc('hunt_admin_team_save', {p_key:KEY, p_team:id, p_name:name, p_color:color, p_members:mem}); const t = team(id); if (t) { t.name = name || t.name; t.color = color || t.color; t.members = mem; } toast('Saved.'); } catch(e) { toast(`Save failed: ${e.code}`); }
}
function timeToday(hhmm, t){ // event teams: HH:MM on event day (until it passes); test teams: today, Bogotá time
  const day = !t?.isTest && now() < Date.parse('2026-10-03T00:00:00-05:00') ? '2026-10-03' : new Date(now()).toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
  return new Date(`${day}T${hhmm}:00-05:00`).toISOString();
}
let scoreTimer;
function bind(){
  document.querySelectorAll('[data-row]').forEach(r => r.onclick = () => { S.expanded = S.expanded === r.dataset.row ? null : r.dataset.row; render(); });
  const decide = (v, status) => { const [id,k] = v.split('|'); doRpc('hunt_admin_review', {p_team:id, p_sub:k, p_status:status, p_note:null}, `${team(id)?.name}: ${status}.`); };
  document.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => decide(b.dataset.approve, 'approved'));
  document.querySelectorAll('[data-reject]').forEach(b => b.onclick = () => decide(b.dataset.reject, 'rejected'));
  document.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => { lightbox = mediaCache[b.dataset.zoom]?.media; render(); });
  const lb = $('#lbScrim'); if (lb) lb.onclick = () => { lightbox = null; render(); };
  // teams
  document.querySelectorAll('[data-name],[data-members]').forEach(x => x.oninput = () => saveTeamSoon(x.dataset.name || x.dataset.members));
  document.querySelectorAll('[data-color]').forEach(x => x.onchange = () => saveTeam(x.dataset.color));
  document.querySelectorAll('[data-start]').forEach(b => b.onclick = () => { const t = team(b.dataset.start);
    confirmThen({title:`Start ${t.name} now?`, body:'Their clock starts and the first clue appears on their phones.', yes:'Start now', danger:true, run:() => doRpc('hunt_admin_depart', {p_team:t.id, p_depart:null, p_now:true}, `${t.name} started.`)}); });
  document.querySelectorAll('[data-unstart]').forEach(b => b.onclick = () => { const t = team(b.dataset.unstart);
    confirmThen({title:`Clear ${t.name}'s departure?`, body: started(t) ? 'They are already out. Clearing hides their clue and stops their clock until you start them again.' : 'They go back to waiting.', yes:'Clear departure', danger:started(t), run:() => doRpc('hunt_admin_depart', {p_team:t.id, p_depart:null, p_now:false}, 'Cleared.')}); });
  document.querySelectorAll('[data-time]').forEach(x => x.onchange = () => { if (x.value) doRpc('hunt_admin_depart', {p_team:x.dataset.time, p_depart:timeToday(x.value, team(x.dataset.time)), p_now:false}, `Departure set to ${x.value}.`); });
  document.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { const t = team(b.dataset.copy); const text = `${t.name} · El Gran Scavenger Hunt\n${linkFor(t)}`;
    try { await navigator.clipboard.writeText(text); toast('Link copied. Paste it in the team\'s WhatsApp group.'); } catch(e) { prompt('Copy this link', linkFor(t)); } });
  document.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => { const t = team(b.dataset.reset);
    confirmThen({title:`Reset ${t.name}?`, body:'Deletes all their check-ins, proofs, hints, taxis and quiz scores. The team, link and members stay.', yes:'Reset progress', danger:true, run:() => doRpc('hunt_admin_reset', {p_team:t.id}, 'Progress reset.')}); });
  document.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => { const t = team(b.dataset.delete);
    confirmThen({title:`Delete ${t.name}?`, body:'Removes the team, its link and everything it submitted. This cannot be undone.', yes:'Delete team', danger:true, run:() => doRpc('hunt_admin_team_delete', {p_team:t.id}, 'Team deleted.')}); });
  document.querySelectorAll('[data-jump]').forEach(x => x.onchange = () => { const t = team(x.dataset.jump); const n = +x.value; if (!n) return;
    confirmThen({title:`Jump ${t.name} to stop ${n}?`, body:`Wipes its progress and marks stops 1–${n-1} as done, so the phone shows the stop ${n} clue. Test teams only.`, yes:`Jump to stop ${n}`, danger:true,
      run:() => doRpc('hunt_admin_jump', {p_team:t.id, p_stop:n}, `${t.name} is at stop ${n}.`)}); });
  const add = $('#addTeam'); if (add) add.onclick = () => { const colors = ['#CF5436','#2E7A57','#7A4B2A','#E4AA2A','#3F6FD8','#8A3FA0','#1F8A8A','#B8336A'];
    doRpc('hunt_admin_team_save', {p_team:null, p_name:`Equipo ${TEAMS.filter(t=>!t.isTest).length + 1}`, p_color:colors[TEAMS.length % colors.length], p_members:[]}, 'Team added.'); };
  const sched = shuffle => { const ev = TEAMS.filter(t => !t.isTest).map(t => t.id); if (shuffle) for (let i = ev.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [ev[i],ev[j]] = [ev[j],ev[i]]; }
    const first = $('#schedFirst').value || '10:00'; const gap = Math.max(0, Math.min(120, parseInt($('#schedGap').value,10) || 0));
    const firstIso = new Date(`2026-10-03T${first}:00-05:00`).toISOString();
    confirmThen({title: shuffle ? 'Shuffle and schedule?' : 'Schedule departures?', body:`${ev.length} teams from ${first} on 3 Oct, ${gap} min apart${shuffle?' in a random order':' in the order shown'}. This replaces their current departure times.`, yes:'Schedule', danger:false,
      run:() => doRpc('hunt_admin_schedule', {p_order:ev, p_first:firstIso, p_stagger:gap}, 'Departures scheduled.')}); };
  const so = $('#schedOrder'); if (so) so.onclick = () => sched(false);
  const ss = $('#schedShuffle'); if (ss) ss.onclick = () => sched(true);
  // scoring
  const sel = $('#scoreTeam'); if (sel) sel.onchange = () => { S.scoreTeam = sel.value; render(); };
  document.querySelectorAll('[data-quiz]').forEach(inp => inp.oninput = () => {
    const t = team(S.scoreTeam); const q = inp.dataset.quiz; const quiz = JSON.parse(JSON.stringify(t.quiz)); quiz[q] = quiz[q] || {};
    let v = inp.value === '' ? '' : Math.max(0, Math.floor(Number(inp.value) || 0)); if (QUIZ[q].max && v !== '') v = Math.min(v, QUIZ[q].max);
    quiz[q][inp.dataset.k] = v; t.quiz = quiz; $('#qp-'+q).textContent = quizPts(t,q);
    clearTimeout(scoreTimer); scoreTimer = setTimeout(async () => { try { await rpc('hunt_admin_score', {p_key:KEY, p_team:t.id, p_quiz:t.quiz, p_acts:null, p_adj:null}); toast('Quiz saved.'); } catch(e) { toast(`Save failed: ${e.code}`); } }, 700);
  });
  const can = $('#actCan'); if (can) can.onchange = () => { const t = team(S.scoreTeam); doRpc('hunt_admin_score', {p_team:t.id, p_quiz:null, p_acts:{...t.acts, can:can.checked}, p_adj:null}, 'Saved.'); };
  const adj = $('#adj'); if (adj) adj.onchange = () => doRpc('hunt_admin_score', {p_team:S.scoreTeam, p_quiz:null, p_acts:null, p_adj:Math.round(Number(adj.value)||0)}, 'Saved.');
  const th = $('#theatron'); if (th) th.onchange = () => doRpc('hunt_admin_theatron', {p_team:th.value}, 'Theatron award saved.');
  const rv = $('#revealBtn'); if (rv) rv.onclick = startReveal;
  // modal
  const my = $('#mYes'); if (my) { my.focus(); my.onclick = () => { const f = modal.run; modal = null; f(); }; }
  const mn = $('#mNo'); if (mn) mn.onclick = () => { modal = null; render(); };
  const sc = $('#scrim'); if (sc) sc.onclick = e => { if (e.target === sc) { modal = null; render(); } };
}
function isEditing(){ const a = document.activeElement; return modal || lightbox || document.querySelector('.reveal') || (a && ['INPUT','TEXTAREA','SELECT'].includes(a.tagName) && a.id !== 'tests'); }

/* ---------- reveal ---------- */
function startReveal(){
  const order = ranked().reverse(); let i = -1;
  const host = document.createElement('div'); host.className = 'reveal'; document.body.appendChild(host);
  const allIn = board().every(t => finishT(t));
  const draw = () => {
    if (i < 0) host.innerHTML = `<div class="eyebrow">El Gran Scavenger Hunt de Bogotá</div><h2>Los resultados</h2><p style="opacity:.8;max-width:460px">${allIn?'Todos los equipos llegaron. Del último al primero.':'Not every team is in yet, so placement bonuses are provisional.'}</p><div class="ctrl"><button class="btn" id="rvNext">Empezar</button><button class="btn ghost" id="rvClose">Cerrar</button></div>`;
    else { const {t,s} = order[i]; const place = order.length - i;
      host.innerHTML = `<div class="eyebrow">${place===1?'Campeones de la primera edición':'Puesto'}</div><div class="place">${place}</div><h2>${esc(t.name)}</h2><div class="tot">${s.total} puntos</div>
      <div class="bd"><span>Paradas <b>${s.stopPts}</b></span><span>Velocidad <b>${s.place}</b></span><span>Trivia <b>${s.quiz}</b></span><span>Side quests <b>${s.side}</b></span><span>Premios <b>${s.acts}</b></span>${s.pen?`<span>Taxis <b>−${s.pen}</b></span>`:''}<span>Tiempo <b>${dur(elapsed(t))}</b></span></div>
      ${t.members.length?`<p style="opacity:.8;margin:0">${esc(t.members.join(' · '))}</p>`:''}
      <div class="ladder">${order.slice(0,i).map((x,j) => `<span>${order.length-j}. ${esc(x.t.name)} · ${x.s.total}</span>`).join(' · ')}</div>
      <div class="ctrl">${i < order.length-1 ? '<button class="btn" id="rvNext">Siguiente</button>' : ''}<button class="btn ghost" id="rvClose">${i < order.length-1 ? 'Cerrar' : 'Terminar'}</button></div>`; }
    const nx = host.querySelector('#rvNext'); if (nx) { nx.onclick = () => { i++; draw(); }; nx.focus(); }
    host.querySelector('#rvClose').onclick = () => host.remove();
  };
  draw();
}

/* ---------- boot ---------- */
(async function start(){
  $('#tests').onchange = e => { S.showTests = e.target.checked; render(); };
  $('#logout').onclick = () => { try { localStorage.removeItem('hunt-admin'); } catch(_){} KEY = null; login(); };
  try { KEY = localStorage.getItem('hunt-admin'); } catch(_){}
  if (!KEY) return login();
  try { await load(); render(); } catch(e) { return login(e.code === 'bad_admin' ? 'Please sign in again.' : 'Could not reach the server.'); }
  setInterval(async () => { if (!KEY) return; try { await load(); if (!isEditing()) render(); else $('#clk').textContent = hm(now()); } catch(_){} }, 15000);
})();
