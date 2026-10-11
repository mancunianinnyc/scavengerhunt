/* Public demo (/demo): the real team app, played against an in-browser copy of the game.
   Loaded before team.js. Replaces rpc() with a local implementation of the hunt_* functions
   (same rules as the database), so visitors write nothing to the event data. State lives in
   this browser only. Content is a snapshot of the 3 Oct 2026 route — spoilers included. */
(() => {
  if (!document.body.hasAttribute('data-demo')) return;
  window.DEMO = true;

  const STOPS = [
    {n:1, name:'Plaza de Bolívar', clue:'En la plaza más importante,\nlevanten los ojos\npara copiar una frase.', ask:'Completen la frase', proof:'phrase', hint:'Una fachada en la Plaza de Bolívar…', lat:4.59819, lng:-74.076053, radius:250, words:['maestro'], puzzle:'Colombianos, las a[r][m]as [o]s h[a]n dado la ind[e]pendencia; las leyes o[s] darán la liber[t]ad.', puzzleHint:'Un experto es un…',
      en:'Palacio de Justicia, Plaza de Bolívar. Fill the 7 missing letters of the inscription on its façade, then unscramble them: MAESTRO.'},
    {n:2, name:'Museo Botero', clue:'Un ladrón en el gobierno,\nun ladrón en el banco,\nun ladrón en el techo,\n¡Ay qué escándalo!\n\nLos dos primeros se encuentran todos los días,\nel último, pintado por un famoso,\n¿dónde lo verías?', ask:'Selfie con el Ladrón', proof:'photo', hint:'Un ladrón corpulento...', lat:4.596698, lng:-74.07335, radius:250,
      en:'Museo Botero: Fernando Botero’s painting of a chubby thief on a rooftop.'},
    {n:3, name:'Policarpa, Las Aguas', clue:'La pola toma su nombre\nde una chica y no de un hombre.\nAl lado de Los Andes y Las Aguas,\nrendimos homenaje a Policarpa.', ask:'Completen la inscripción', proof:'phrase', hint:'Estás buscando una estatua', lat:4.6026, lng:-74.0668, radius:400, words:['sobra','valor','sufrir','muerte','libertad'], prefix:'Aunque mujer y joven,',
      en:'The statue of Policarpa Salavarrieta (“La Pola”) at Las Aguas. Type the rest of her inscription: “…me sobra valor para sufrir la muerte y mil muertes más… ¡No olvidéis este ejemplo!” The key words are sobra, valor, sufrir, muerte, libertad.'},
    {n:4, name:'Quinta de Bolívar', clue:'Nacido en Venezuela, muerto en Colombia,\nentre esas dos, liberó cuatro otras.\nPero no busca cuatro, sino un número más:\nuna casa y un jardín,\n¿a dónde te vas?', ask:'Selfie en la casa', proof:'photo', hint:'¿El Libertador dónde durmió?', lat:4.6004, lng:-74.0641, radius:400,
      en:'Quinta de Bolívar: “quinta” is both a country house and “fifth”. Bolívar freed five countries. Live trivia with Ross here.'},
    {n:5, name:'Plaza La Perseverancia', clue:'Presidentes, un autor y una pintora.\nEn el billete de $2.000 aparece Débora.\nEn el mismo billete, al otro lado, encontrarán el nombre de un vecindario.\nCerquita de allí, un poco al norte, hay una plaza con ajiaco para que uno devore.', ask:'Selfie con el plato vacío', proof:'photo', hint:'¿Dónde almuerzan los domingos los habitantes de La Macarena?', lat:4.616465, lng:-74.066279, radius:250,
      en:'Plaza de Mercado La Perseverancia: lunch is ajiaco, and the proof is the empty plate.'},
    {n:6, name:'Matorral / Diosa, Teusaquillo', clue:'Los habitantes de Bogotá han vivido millones de historias,\nuna librería verde en La Macarena contiene mil otras.\nEsa librería también tiene sede en otro lugar,\nencuéntrenla para continuar.', ask:'Selfie en la librería', proof:'photo', hint:'¿Dónde está la otra sede de Matorral?', lat:4.625927, lng:-74.073444, radius:250,
      en:'Matorral bookshop’s second branch, in Teusaquillo.'},
    {n:7, name:'Casa de Betty la Fea', clue:'Cambiamos de libros a la televisión.\nUna protagonista famosa en ese vecindario tenía habitación.\nVayan a visitarla, la de gafas y brackets,\ny tomen una foto donde ella existía.', ask:'Recreen una pose de Betty', proof:'photo', hint:'¿Dónde vivía Betty?', lat:4.633, lng:-74.0725, radius:400,
      en:'The house from “Yo soy Betty, la fea”, in Teusaquillo. Recreate a Betty pose.'},
    {n:8, name:'Biblioteca Virgilio Barco', clue:'Salmona no solo diseñó apartamentos,\ntambién diseñó un espacio para prestar libros.\nEn un edificio redondo de ladrillo y con fuente,\nnombrado por un presidente que buscó paz y constituyente.', ask:'El carné de BibloRed', proof:'photo', hint:'La biblioteca de Barco', lat:4.6578, lng:-74.0906, radius:400,
      en:'Rogelio Salmona’s Biblioteca Virgilio Barco. Sign up for a public-library card. Live trivia with J here.'},
    {n:9, name:'Theatron', clue:'En Bogotá hay catedrales, iglesias y capillas;\nla gran mayoría solo abren de día.\nPero hay un lugar de alabanza que se llena de noche,\nun templo en Chapinero donde los gays se gozan.', ask:'Selfie ilustrativa', proof:'photo', hint:'¿\'La Capilla\' se encuentra en qué discoteca?', lat:4.644929, lng:-74.063764, radius:250,
      en:'Theatron, Chapinero’s enormous gay club, which has a room called “La Capilla” (the chapel).'},
    {n:10, name:'FRANC', clue:'La última parada es la de siempre,\ndonde solemos llegar a tomar un vino.', ask:'Selfie en la puerta', proof:'photo', hint:'\'Franc\'-ly, we need a drink!', lat:4.643281, lng:-74.060122, radius:250, finish:true,
      en:'FRANC, the wine bar where we always end up. On the day it was the secret final destination, and its name never appeared anywhere the players could see.'},
  ];
  const SIDES = [
    {id:'coin', name:'La moneda más antigua', place:'Casa de Moneda, junto al Botero', pts:20, after:2, ask:'Foto de la moneda colombiana más antigua en exhibición'},
    {id:'terminal', name:'Una fecha histórica', place:'Terminal Salitre', pts:50, after:7, ask:'Compren el tiquete y mándennos una foto. Guárdenlo: se los pedimos al final.', clue:'Es un Salitre, pero no el mágico,\naquí las esperas se pueden poner trágicos.\nDesde acá encontrarás buses hacia cualquier destino,\nvayan y compren un tiquete para el departamento vinculado a este datico:\n\n7 de agosto de 1819'},
    {id:'novios', name:'Foto de prom', place:'Parque de Los Novios', pts:20, after:8, ask:'Foto en el puente del lago, como si fueran al prom'},
  ];
  const TAXI_LIMIT = 4, REVIEW_MS = 6000, KEY = 'hunt-demo-v1';

  const fresh = () => ({name:'Equipo demo', nameSet:false, depart:null, checkins:{}, hints:{}, legs:{}, subs:{}, taxiDeclared:null});
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch (_) { S = fresh(); }
  const media = {};  // photos stay in memory: localStorage is too small for them
  const save = () => { try { const {subs, ...rest} = S; const lite = Object.fromEntries(Object.entries(subs).map(([k, v]) => [k, {...v, media:null}])); localStorage.setItem(KEY, JSON.stringify({...rest, subs:lite})); } catch (_) {} };

  const iso = t => new Date(t).toISOString();
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const stop = n => STOPS.find(s => s.n === n);
  const live = k => S.subs[k] && S.subs[k].status !== 'rejected';
  const current = () => { const s = STOPS.find(s => !live('s' + s.n)); return s ? s.n : null; };
  const started = () => S.depart != null && Date.now() >= S.depart;
  const taxis = () => Object.values(S.legs).filter(m => m === 'taxi').length;
  const dist = (a, b, c, d) => { const R = 6371000, r = x => x * Math.PI / 180; const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const err = code => { throw new RpcError(code, 400); };
  const needStart = () => { if (!started()) err('not_started'); };
  // Photos "reviewed by the quizmasters" a few seconds after upload.
  const review = () => { const t = Date.now(); let changed = false; for (const v of Object.values(S.subs)) if (v.status === 'pending' && t - v.t >= REVIEW_MS) { v.status = 'approved'; changed = true; } if (changed) save(); };

  function state(){
    review();
    const cur = current(), st = stop(cur), ci = S.checkins[cur];
    return {
      now: iso(Date.now()),
      team: {id:'demo', name:S.name, color:'#16347F', depart: S.depart ? iso(S.depart) : null, members:[], isTest:true, taxiDeclared:S.taxiDeclared, nameSet:S.nameSet},
      taxis: taxis(), taxiLimit: TAXI_LIMIT,
      finish: live('s10') ? iso(S.subs.s10.t) : null,
      progress: STOPS.filter(s => S.subs['s' + s.n]).map(s => { const b = S.subs['s' + s.n]; return {n:s.n, name:s.name, ask:s.ask, proof:s.proof, status:b.status, t:iso(b.t), note:null, hint:!!S.hints[s.n]}; }),
      current: cur == null || !started() ? null : {
        n:st.n, clue:st.clue, ask:st.ask, proof:st.proof, qm:null, finish:!!st.finish,
        puzzle: st.puzzle && ci ? st.puzzle.replace(/\[[^\]]\]/g, '[_]') : null,
        puzzleHint: ci ? st.puzzleHint || null : null, prefix: ci ? st.prefix || null : null,
        hint: S.hints[st.n] ? st.hint : null,
        legTaxi: S.legs[st.n] ? S.legs[st.n] === 'taxi' : null, legMode: S.legs[st.n] || null,
        bus: S.subs['b' + st.n]?.status || null,
        checkin: ci ? {t:iso(ci.t), ok:ci.ok, dist:ci.dist, name:st.name} : null,
      },
      sides: !started() ? [] : SIDES.filter(d => (cur ?? 11) > d.after || S.subs[d.id]).map(d => ({id:d.id, name:d.name, place:d.clue ? null : d.place, clue:d.clue || null, pts:d.pts, ask:d.ask, status:S.subs[d.id]?.status || null, note:null})),
    };
  }
  function addCheckin(cur, ok, d){ S.checkins[cur] = {t:Date.now(), ok, dist:d}; save(); }
  function putSub(key, status, extra){ S.subs[key] = {status, t:Date.now(), ...extra}; if (extra.media) media[key] = extra.media; save(); }

  const FN = {
    hunt_state: () => state(),
    hunt_team_name: ({p_name}) => {
      if (started()) err('already_started');
      const v = String(p_name || '').trim().replace(/\s+/g, ' '); if (v.length < 2 || v.length > 32) err('bad_name');
      S.name = v; S.nameSet = true; if (!S.depart) S.depart = Date.now() + 4000; save(); return {ok:true, name:v};
    },
    hunt_checkin: ({p_lat, p_lng, p_acc}) => {
      needStart(); const cur = current(); if (cur == null) err('finished'); const st = stop(cur);
      if (S.checkins[cur]) return {ok:true, gps:S.checkins[cur].ok, dist:S.checkins[cur].dist, name:st.name, already:true};
      if (p_lat == null || p_lng == null) { addCheckin(cur, false, null); return {ok:true, gps:false, name:st.name}; }
      const d = Math.round(dist(p_lat, p_lng, st.lat, st.lng));
      if (d <= st.radius + Math.min(p_acc || 0, 150)) { addCheckin(cur, true, d); return {ok:true, gps:true, dist:d, name:st.name}; }
      return {ok:false, dist:d};
    },
    hunt_checkin_demo: () => { needStart(); const cur = current(); if (cur == null) err('finished'); if (!S.checkins[cur]) addCheckin(cur, true, 0); return {ok:true, gps:true, dist:0, name:stop(cur).name, demo:true}; },
    hunt_check_letters: ({p_letters}) => {
      needStart(); const st = stop(current()); if (!st?.puzzle) err('no_puzzle'); if (!S.checkins[st.n]) err('not_checked_in');
      const want = [...st.puzzle.matchAll(/\[([^\]])\]/g)].map(m => m[1]).join('');
      const boxes = [...want].map((ch, i) => norm(p_letters?.[i]) === norm(ch)); const ok = boxes.every(Boolean);
      return {ok, boxes, letters: ok ? want.toUpperCase() : null};
    },
    hunt_hint: () => { needStart(); const cur = current(); if (cur == null) err('finished'); S.hints[cur] = true; save(); return {ok:true, stop:cur, hint:stop(cur).hint}; },
    hunt_leg_mode: ({p_mode}) => {
      needStart(); if (!['walk', 'bus', 'taxi'].includes(p_mode)) err('bad_mode');
      const cur = current(); if (cur == null) err('finished'); if (!S.checkins[cur]) err('not_checked_in');
      S.legs[cur] = p_mode; if (p_mode !== 'bus' && S.subs['b' + cur]?.status !== 'approved') delete S.subs['b' + cur]; save();
      return {ok:true, mode:p_mode, taxis:taxis()};
    },
    hunt_submit: ({p_key, p_answer, p_media, p_media_type}) => {
      needStart(); const cur = current(), prev = S.subs[p_key];
      if (prev && prev.status !== 'rejected') err('already_submitted');
      let m = /^s(\d+)$/.exec(p_key);
      if (m) {
        const st = stop(+m[1]); if (!st) err('bad_key');
        if (!prev) { if (cur !== st.n) err('wrong_stop'); if (!S.checkins[st.n]) err('not_checked_in'); }
        if (st.proof === 'phrase') {
          const a = norm(p_answer); if (!a.trim() || !(st.words || []).every(w => a.includes(norm(w)))) return {ok:false, reason:'wrong'};
          putSub(p_key, 'approved', {answer:p_answer}); return {ok:true, status:'approved', next:current()};
        }
        if (!p_media) err('media_required');
        putSub(p_key, 'pending', {media:p_media, type:p_media_type}); return {ok:true, status:'pending', next:current()};
      }
      m = /^b(\d+)$/.exec(p_key);
      if (m) { if (S.legs[+m[1]] !== 'bus') err('not_bus'); if (!p_media) err('media_required'); putSub(p_key, 'pending', {media:p_media, type:p_media_type}); return {ok:true, status:'pending'}; }
      const d = SIDES.find(x => x.id === p_key); if (!d) err('bad_key');
      if (!prev && (cur ?? 11) <= d.after) err('locked'); if (!p_media) err('media_required');
      putSub(p_key, 'pending', {media:p_media, type:p_media_type}); return {ok:true, status:'pending'};
    },
    hunt_team_photos: () => Object.entries(S.subs).filter(([k, v]) => media[k] && v.status !== 'rejected' && /^image/.test(v.type || '')).sort((a, b) => a[1].t - b[1].t).map(([k]) => ({key:k, media:media[k]})),
    hunt_taxi_confirm: ({p_count}) => { if (!live('s10')) err('not_finished'); if (p_count == null || p_count < 0 || p_count > 30) err('bad_count'); S.taxiDeclared = p_count; save(); return {ok:true, taxiDeclared:p_count}; },
    hunt_taxi: () => { needStart(); return {ok:true, taxis:taxis()}; },
  };
  window.rpc = async (fn, args) => {
    await new Promise(r => setTimeout(r, 180));  // feel like a network call
    if (!FN[fn]) throw new RpcError('demo_unsupported', 400);
    return JSON.parse(JSON.stringify(FN[fn](args || {})));
  };
  // A finished photo review should show up without waiting for the 20-second poll.
  setInterval(() => { const before = JSON.stringify(Object.values(S.subs).map(v => v.status)); review(); if (JSON.stringify(Object.values(S.subs).map(v => v.status)) !== before && typeof refresh === 'function') refresh(true); }, 2000);

  /* English guide bar: what this is, the answer to the current stop, start over. */
  const bar = document.createElement('aside');
  bar.className = 'demo-bar'; bar.setAttribute('aria-label', 'About this demo');
  document.body.prepend(bar);
  let open = false, showAns = false, lastN = null;
  function drawBar(){
    const cur = S.depart && started() ? current() : null;
    if (cur !== lastN) { showAns = false; lastN = cur; }
    const st = stop(cur);
    const html = `<div class="db-row"><b>Demo · El Gran Scavenger Hunt de Bogotá</b><button class="db-tog" aria-expanded="${open}">${open ? 'Hide' : 'How this works'}</button></div>
      ${open ? `<div class="db-body"><p>This is the real app four teams of friends used on 3 October 2026, in Spanish as they saw it, running entirely in your browser. Nothing you do is sent anywhere, and your photos stay on your phone.</p>
        <p>Name your team to start the clock. You’re probably not in Bogotá, so use <b>“Simular: estamos aquí”</b> to check in at each stop. Photos are “approved by the quizmasters” after a few seconds.</p>
        <p class="db-links"><a href="https://rossgarlick.com/projects/scavenger-hunt">The story behind it</a> · <a href="/desde-lejos">Play the guess-the-place edition</a> · <button class="db-reset">Start over</button></p></div>` : ''}
      ${st ? `<div class="db-ans">${showAns ? `<span><b>Stop ${st.n}:</b> ${esc(st.en)}</span>` : `<button class="db-show">Stuck? Show the answer to stop ${st.n} (in English)</button>`}</div>` : ''}`;
    if (html === bar._html) return; bar._html = html; bar.innerHTML = html;
    bar.querySelector('.db-tog').onclick = () => { open = !open; drawBar(); };
    bar.querySelector('.db-show')?.addEventListener('click', () => { showAns = true; drawBar(); });
    bar.querySelector('.db-reset')?.addEventListener('click', () => { if (!confirm('Erase this demo team and start again?')) return; try { localStorage.removeItem(KEY); sessionStorage.clear(); localStorage.removeItem('hunt-trivia-seen'); } catch (_) {} location.reload(); });
  }
  drawBar(); setInterval(drawBar, 1500);
})();
