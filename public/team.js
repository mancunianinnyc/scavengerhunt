/* Team app: one team, three cards per stop (status · call to action · hint). */
const ICON = {
  cam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  mic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
};
const arrow = '<span aria-hidden="true">→</span>';
const MSG = {
  already_started:'Ya salieron: el nombre quedó fijo.', bad_name:'El nombre debe tener entre 2 y 32 letras.',
  bad_token:'Este link no es válido. Pídanle uno nuevo a los quizmasters por WhatsApp.',
  offline:'Sin conexión. Revisen los datos del celular e intenten de nuevo.',
  too_large:'El archivo es muy pesado. Intenten con una foto o nota de voz más corta.',
  not_started:'Todavía no han salido.', finished:'Ya terminaron el recorrido.',
  not_checked_in:'Primero hagan check-in en la parada.', media_required:'Adjunten la foto o la nota de voz.',
};
const errMsg = e => MSG[e?.code] || 'Algo falló. Intenten de nuevo en un momento.';

let TOKEN = null, ST = null, screen = 'stop', modal = null, celebration = null, busy = false, geo = {}, missFx = null;
const pending = {}, drafts = {};

function readToken(){
  const q = new URLSearchParams(location.search).get('t');
  try { if (q) localStorage.setItem('hunt-token', q); return q || localStorage.getItem('hunt-token'); } catch(e) { return q; }
}
async function load(){
  ST = await rpc('hunt_state', {p_token: TOKEN});
  syncClock(ST.now);
  if (ST.current && !ST.current.checkin && typeof puz !== 'undefined') { delete puz.letters[ST.current.n]; delete puz.vals[ST.current.n]; delete puz.marks[ST.current.n]; delete puz.pick[ST.current.n]; delete puz.shown[ST.current.n]; }
}
function sig(){ return ST ? JSON.stringify([ST.progress.map(p=>[p.n,p.status]), ST.sides.map(s=>[s.id,s.status]), ST.current?.n, !!ST.current?.checkin, ST.taxis, ST.team.name, ST.team.depart]) : ''; }

/* ---------- rendering ---------- */
const departMs = () => ST.team.depart ? Date.parse(ST.team.depart) : Infinity;
const finishMs = () => ST.finish ? Date.parse(ST.finish) : null;
const elapsed = () => (finishMs() ?? now()) - departMs();
const curN = () => ST.current?.n ?? null;

function statusCard(){
  const cur = curN(); const started = now() >= departMs();
  const byN = Object.fromEntries(ST.progress.map(p=>[p.n,p]));
  const segs = Array.from({length:10},(_,i)=>i+1).map(n => { const p = byN[n]; const c = p ? (p.status==='rejected'?'bad':(p.hint?'hint':'done')) : (cur===n?'cur':''); return `<span class="seg-p ${c}"></span>`; }).join('');
  const over = ST.taxis > ST.taxiLimit;
  const sides = ST.sides.length;
  return `<section class="c-status" aria-label="Progreso">
    <div class="row"><div><div class="lbl">${finishMs()?'Tiempo final':'Tiempo'}</div><div class="t-timer" id="timer">${started?durS(elapsed()):'0:00:00'}</div></div>
      <div class="c-taxi ${over?'over':''}"><span class="lbl">Taxis</span><b>${ST.taxis}/${ST.taxiLimit}</b></div></div>
    <div class="t-bar" role="img" aria-label="${ST.progress.length} de 10 paradas">${segs}</div>
    <div class="row foot"><span class="team"><span class="dot" style="background:${esc(ST.team.color)}"></span><span>${esc(ST.team.name)} · ${cur?`parada <b>${cur}</b> de 10`:(started?'<b>10 de 10</b>':'por salir')}</span></span>${sides?`<button class="t-link" data-go="sides">Side quests · ${sides}</button>`:''}</div>
  </section>`;
}
function dropInput(key, kind, sub){
  const staged = pending[key];
  const accept = kind==='voice' ? 'audio/*' : 'image/*';
  const inner = staged?.img ? `<img src="${staged.img}" alt="Foto elegida"><small>Toquen para cambiarla</small>`
    : staged ? `${ICON.mic}<b>${esc(staged.fileName)}</b><small>Toquen para cambiarla</small>`
    : `${kind==='voice'?ICON.mic:ICON.cam}<b>${kind==='voice'?'Grabar o subir nota de voz':'Tomar o subir la foto'}</b><small>${sub || (kind==='voice'?'Audio del celular o de WhatsApp':'Todo el equipo en la foto')}</small>`;
  return `<label class="t-drop" for="in-${key}">${inner}</label><input class="vh" type="file" id="in-${key}" accept="${accept}">`;
}
function proofField(key, kind){
  return kind==='phrase' ? `<textarea class="t-input" id="in-${key}" rows="2" placeholder="Escriban la frase exacta…">${esc(drafts[key]||'')}</textarea>` : dropInput(key, kind);
}
function redoNotice(){
  const r = ST.progress.find(p => p.status==='rejected');
  return r && !finishMs() ? `<button class="t-alert" data-go="redo:${r.n}">La prueba de la parada ${r.n} fue rechazada. Reenviar →</button>` : '';
}
function ctaCard(){
  const c = ST.current; const ci = c.checkin;
  if (!ci) {
    const g = geo;
    return `<section class="c-cta" id="cta"><div class="t-eyebrow">Parada ${c.n} · La pista</div>
      ${poemHTML(c.clue)}
      ${g.miss?`<div class="t-miss" role="alert"><span class="pin">${ICON.pin}</span><span>Aún no. Están a <b id="missDist">${fmtDist(g.miss)}</b> de la parada. Lean la pista otra vez.</span></div>`:''}
      <button class="t-primary" id="checkinBtn" ${busy?'disabled':''}><span>${busy?'Buscando su ubicación…':'Estamos aquí · hacer check-in'}</span>${ICON.pin}</button>
      ${g.fail||g.miss?`<div class="geo-alt"><p class="t-p">${g.fail?'No pudimos leer su ubicación.':'¿Seguros que están en el lugar?'} Pueden hacer check-in sin GPS y los quizmasters lo confirman.</p>
        <button class="t-link" id="checkinManual" style="align-self:flex-start">Hacer check-in sin GPS</button></div>`:''}
      ${ST.team.isTest?`<div class="demo-row"><span>Modo prueba · solo equipos de prueba</span><div><button id="simHere">Simular: estamos aquí</button><button id="simFar">Simular: lugar equivocado</button></div></div>`:''}
      ${redoNotice()}</section>`;
  }
  const key='s'+c.n;
  if (c.legTaxi == null) return `<section class="c-cta" id="cta"><div class="t-eyebrow">Parada ${c.n} · Antes del reto</div>
    <div class="t-ok">${ICON.check}<span>${ci.ok?'Check-in confirmado':'Check-in sin GPS'} · ${esc(ci.name)} · ${hm(ci.t)}</span></div>
    ${legQuestionHTML()}</section>`;
  return `<section class="c-cta" id="cta"><div class="t-eyebrow">Parada ${c.n} · El reto</div>
    <div class="t-ok">${ICON.check}<span>${ci.ok?'Check-in confirmado':'Check-in sin GPS'} · ${esc(ci.name)} · ${hm(ci.t)}</span></div>
    ${c.puzzle ? puzzleHTML(c) : `<h3 class="t-h">${esc(c.ask)}</h3>${c.qm?`<p class="t-note">${esc(c.qm)}</p>`:''}
    ${proofField(key, c.proof)}<div class="err" id="err-${key}"></div>
    <button class="t-primary terra" data-submit="${key}" ${busy?'disabled':''}><span>${busy?'Enviando…':c.finish?'Detener el reloj':c.proof==='phrase'?'Comprobar':'Enviar'}</span>${arrow}</button>`}
    <details class="again" ontoggle="fitPoems(this)"><summary>Ver la pista otra vez</summary>${poemHTML(c.clue)}</details>
    ${redoNotice()}</section>`;
}

/* Stop-1 style puzzle: fill the missing letters (checked on the server), then unscramble them. */
const puz = {vals:{}, letters:{}, marks:{}, pick:{}, shown:{}, help:{}};
try { Object.assign(puz.letters, JSON.parse(sessionStorage.getItem('hunt-puz') || '{}')); } catch(_) {}
function puzzleHTML(c){
  const n = c.n, key = 's'+n;
  if (!puz.letters[n]) {
    let i = -1;
    const vals = puz.vals[n] || [], marks = puz.marks[n] || [];
    const phrase = esc(c.puzzle).split(' ').map(w => w.includes('[_]') ? `<span class="pz-w">${w}</span>` : w).join(' ').replace(/\[_\]/g, () => { i++; const m = marks[i]; return `<input class="pz-box ${m===true?'ok':m===false?'bad':''}" data-i="${i}" maxlength="1" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Letra ${i+1}" value="${esc(vals[i]||'')}">`; });
    return `<h3 class="t-h">Completen la frase</h3><p class="t-p">Está grabada en la fachada del Palacio de Justicia. Escriban las letras que faltan.</p>
      <p class="pz">${phrase}</p><div class="err" id="err-${key}"></div>
      <button class="t-primary terra" id="pzCheck" ${busy?'disabled':''}><span>${busy?'Comprobando…':'Comprobar letras'}</span>${arrow}</button>`;
  }
  const L = puz.letters[n].split('');
  const pick = puz.pick[n] || (puz.pick[n] = []);
  const word = pick.map(i => L[i]).join('');
  const intro = !puz.shown[n]; puz.shown[n] = true;
  return `<h3 class="t-h">Las letras esconden una palabra</h3><p class="t-p">Toquen las letras en orden para formarla.</p>
    <div class="pz-grid pz-slots" aria-label="Su palabra">${L.map((_,k) => pick[k] != null
      ? `<button class="pz-cell pz-slot filled" data-unpick="${k}" aria-label="Quitar ${esc(L[pick[k]])}">${esc(L[pick[k]])}</button>`
      : `<span class="pz-cell pz-slot"></span>`).join('')}</div>
    <div class="pz-grid pz-tiles ${intro?'intro':''}">${L.map((ch,i) => `<button class="pz-cell pz-tile ${pick.includes(i)?'used':''}" style="--i:${i}" data-pick="${i}" ${pick.includes(i)?'disabled':''} aria-label="Letra ${esc(ch)}">${esc(ch)}</button>`).join('')}</div>
    ${c.puzzleHint ? (puz.help[n] ? `<div class="t-hint"><span>Ayuda</span>${esc(c.puzzleHint)}</div>` : `<button class="t-link" id="pzHelp" style="align-self:flex-start">¿Necesitan una ayuda?</button>`) : ''}
    <input type="hidden" id="in-${key}" value="${esc(word)}">
    <div class="err" id="err-${key}"></div>
    <button class="t-primary terra" data-submit="${key}" ${busy||pick.length<L.length?'disabled':''}><span>${busy?'Comprobando…':'Comprobar palabra'}</span>${arrow}</button>
    ${pick.length?'<button class="t-link" id="pzClear" style="align-self:flex-start">Borrar y empezar de nuevo</button>':''}`;
}
function checkLetters(){
  const n = curN(); const boxes = [...document.querySelectorAll('.pz-box')];
  const vals = boxes.map(b => b.value.trim()); puz.vals[n] = vals;
  if (vals.some(v => !v)) { shake('s'+n, 'Llenen todas las casillas.'); return; }
  let res = null;
  act(async () => { res = await rpc('hunt_check_letters', {p_token:TOKEN, p_letters:vals}); }).then(() => {
    if (!res) return;
    puz.marks[n] = res.boxes;
    if (res.ok) { puz.letters[n] = res.letters; try { sessionStorage.setItem('hunt-puz', JSON.stringify(puz.letters)); } catch(_) {} render(); Motion.confetti('small'); }
    else { render(); shake('s'+n, `${res.boxes.filter(x=>!x).length === 1 ? 'Una letra no es' : 'Algunas letras no son'} correcta${res.boxes.filter(x=>!x).length === 1 ? '' : 's'}. Miren la fachada otra vez.`); }
  });
}
const sidePlace = q => q.place || 'ubicación secreta';

/* After the clock stops: confirm or correct the taxi count. */
let tc = null;
function taxiConfirmHTML(){
  if (ST.team.taxiDeclared != null) return `<div class="fin-taxi done"><span>${ICON.check}</span>Taxis confirmados: <b>${ST.team.taxiDeclared}</b></div>`;
  if (tc == null) tc = ST.taxis;
  const same = tc === ST.taxis;
  return `<div class="fin-taxi"><b>Confirmen sus taxis</b>
    <p>Registramos ${ST.taxis} taxi${ST.taxis===1?'':'s'} en la app. ¿Cuántos tomaron en total? Sean honestos: si alguno no quedó registrado, corríjanlo aquí.</p>
    <div class="stepper"><button id="tcMinus" aria-label="Uno menos" ${tc<=0?'disabled':''}>−</button><span aria-live="polite">${tc}</span><button id="tcPlus" aria-label="Uno más" ${tc>=30?'disabled':''}>+</button></div>
    <button class="t-primary" id="tcSave" ${busy?'disabled':''}><span>${same ? `Sí, fueron ${tc}` : `Confirmar ${tc} taxi${tc===1?'':'s'}`}</span>${arrow}</button></div>`;
}

/* Before departure: the team names itself (editable until the quizmasters start them). */
let editingName = false;
function nameCard(){
  if (ST.team.nameSet && !editingName) return `<section class="c-cta name-card set"><div class="t-eyebrow">Su equipo</div><h2 class="t-h">${esc(ST.team.name)}</h2>
    <button class="t-link" id="nmEdit" style="align-self:flex-start">Cambiar el nombre</button></section>`;
  return `<section class="c-cta name-card" id="cta"><div class="t-eyebrow">Primero lo primero</div><h2 class="t-h">¿Cómo se llama su equipo?</h2>
    <p class="t-p">Pónganse de acuerdo y escríbanlo. Pueden cambiarlo hasta que salgan.</p>
    <label class="vh" for="nmInput">Nombre del equipo</label><input class="t-input nm-input" id="nmInput" maxlength="32" autocomplete="off" placeholder="Los Rolos Perdidos" value="${esc(ST.team.nameSet ? ST.team.name : '')}">
    <div class="err" id="err-nm"></div>
    <button class="t-primary terra" id="nmSave" ${busy?'disabled':''}><span>${busy?'Guardando…':'Guardar nombre'}</span>${arrow}</button></section>`;
}
function saveName(){
  const v = ($('#nmInput')?.value || '').trim().replace(/\s+/g, ' ');
  if (v.length < 2) return shake('nm', 'Escriban un nombre de al menos 2 letras.');
  let ok = false;
  act(async () => { await rpc('hunt_team_name', {p_token:TOKEN, p_name:v}); await load(); ok = true; }).then(() => {
    if (ok) { editingName = false; render(); Motion.confetti('small'); toast(`¡Bienvenidos, ${v}!`); }
  });
}

/* After every check-in: did this leg use a taxi? That answer is the taxi count. */
function legQuestionHTML(dark){
  const k = ST.taxis, next = k + 1, extra = next > ST.taxiLimit;
  return `<div class="leg-q ${dark?'dark':''}"><h3 class="t-h">¿Llegaron en taxi?</h3>
    <p class="t-p">Solo este tramo, desde la parada anterior. Llevan ${k} de ${ST.taxiLimit} taxis gratis.${extra?` Uno más resta ${HUNT.taxiPenalty} puntos.`:''}</p>
    <div class="leg-btns"><button class="t-primary" data-leg="no" ${busy?'disabled':''}><span>No</span></button><button class="t-primary ${extra?'terra':'alt'}" data-leg="yes" ${busy?'disabled':''}><span>Sí, en taxi</span></button></div></div>`;
}
function answerLeg(taxi){
  let r = null;
  act(async () => { r = await rpc('hunt_leg_taxi', {p_token:TOKEN, p_taxi:taxi}); await load(); }).then(() => {
    if (!r) return; celebration = null; render(); window.scrollTo(0,0);
    toast(taxi ? `Taxi ${r.taxis} registrado${r.taxis > ST.taxiLimit ? ` (resta ${HUNT.taxiPenalty} pts)` : ''}.` : 'Anotado: sin taxi.');
  });
}
function hintCard(){
  const c = ST.current;
  if (c.hint) return `<section class="c-hint used"><span class="lbl">Pista · parada ${c.n}</span><p>${esc(c.hint)}</p><small class="muted">Usaron la pista: esta parada vale 5 puntos en vez de 10.</small></section>`;
  if (c.checkin) return '';
  return `<button class="c-hint" id="hintBtn"><span><b>Necesitamos una pista</b><small>Si la usan, esta parada vale la mitad: 5 puntos</small></span><span class="q">?</span></button>`;
}
const fmtDist = m => m>=1000 ? `${(m/1000).toFixed(1).replace('.',',')} km` : `${Math.round(m/10)*10} m`;
function body(){
  const started = now() >= departMs();
  let sc = screen;
  if (!started) sc = 'pre';
  else if (!ST.current && !(sc==='sides' || sc.startsWith('side:'))) sc = 'done';
  if (sc==='pre') { const mem = (ST.team.members||[]).length ? `<p class="t-p">Su equipo: ${ST.team.members.map(esc).join(' · ')}</p>` : '';
    return nameCard() + (ST.team.depart
      ? `<section class="c-cta"><div class="t-eyebrow">Parque de los Hippies</div><h2 class="t-h">Salen a las ${hm(departMs())}</h2><p class="t-p">Faltan <b class="mono" id="countdown"></b>. Su primera pista aparece aquí en cuanto salgan.</p>${mem}</section>`
      : `<section class="c-cta"><div class="t-eyebrow">Parque de los Hippies</div><h2 class="t-h">Esperando la salida</h2><p class="t-p">Los quizmasters les dan la señal. Su primera pista aparece aquí en cuanto salgan.</p>${mem}</section>`); }
  if (sc==='done') { const sides = ST.sides.filter(q => q.status && q.status !== 'rejected').length; const mem = ST.team.members || [];
    return `<section class="c-cta fin"><div class="fin-medal" aria-hidden="true"><span>${ICON.check}</span></div>
      <div class="t-eyebrow">Destino final</div><h2 class="t-h">¡Felicitaciones, ${esc(ST.team.name)}!</h2>
      <p class="t-p">Completaron El Gran Scavenger Hunt de Bogotá.</p>
      <div class="fin-clock"><span>Tiempo final</span><b>${durS(elapsed())}</b></div>
      <div class="fin-stats"><div><b>10</b><span>paradas</span></div><div><b>${sides}</b><span>side quest${sides===1?'':'s'}</span></div><div><b>${ST.team.taxiDeclared ?? ST.taxis}</b><span>taxi${(ST.team.taxiDeclared ?? ST.taxis)===1?'':'s'}</span></div></div>
      ${taxiConfirmHTML()}
      ${mem.length?`<p class="fin-mem">${mem.map(esc).join(' · ')}</p>`:''}
      <p class="t-p">Pidan algo y celebren. Los puntajes y el equipo ganador se revelan cuando lleguen todos.</p>${redoNotice()}</section>`; }
  if (sc==='sides') return `<section class="c-cta"><div class="t-eyebrow">Side quests</div><h2 class="t-h">Puntos extra, a cambio de tiempo</h2><p class="t-p">Son opcionales. Cada equipo decide si vale la pena desviarse.</p>
      <div class="t-list">${ST.sides.map(q=>{ const lab = !q.status?'':q.status==='approved'?'<span class="chip ok">Aprobado</span>':q.status==='pending'?'<span class="chip pend">En revisión</span>':'<span class="chip bad">Rechazado</span>';
        return `<button class="t-card" data-go="side:${esc(q.id)}"><div class="row"><b>${esc(q.name)}</b>${lab}</div><span class="s">+${q.pts} pts · ${esc(sidePlace(q))} · opcional</span></button>`; }).join('')}</div>
      <div class="t-actions"><button class="t-link" data-go="stop">${ST.current?'Volver a la pista':'Volver'}</button></div></section>`;
  if (sc.startsWith('side:')) { const q = ST.sides.find(x=>x.id===sc.slice(5)); if (!q) { screen='sides'; return body(); } const open = !q.status || q.status==='rejected';
    return `<section class="c-cta"><div class="t-eyebrow">Side quest opcional · +${q.pts} pts</div><h3 class="t-h">${esc(q.name)}</h3>${q.clue?poemHTML(q.clue):''}<p class="t-p"><b>${esc(q.ask)}</b>${q.place?` · ${esc(q.place)}`:''}${q.note?` · ${esc(q.note)}`:''}</p>
      ${open?`${dropInput(q.id,'photo','Una foto clara como prueba')}<div class="err" id="err-${esc(q.id)}"></div><button class="t-primary terra" data-submit="${esc(q.id)}" ${busy?'disabled':''}><span>${busy?'Enviando…':'Enviar'}</span>${arrow}</button>`:`<p><span class="chip ${q.status==='approved'?'ok':'pend'}">${q.status==='approved'?'Aprobado':'En revisión'}</span></p>`}
      <div class="t-actions"><button class="t-link" data-go="sides">Volver</button></div></section>`; }
  if (sc.startsWith('redo:')) { const p = ST.progress.find(x=>x.n===+sc.slice(5)); if (!p || p.status!=='rejected') { screen='stop'; return body(); } const key='s'+p.n;
    return `<section class="c-cta" id="cta"><div class="t-eyebrow">Parada ${p.n} · Reenviar</div><h3 class="t-h">${esc(p.ask)}</h3><p class="t-note">Rechazada: ${esc(p.note||'no cumple la prueba')}</p>
      ${proofField(key, p.proof)}<div class="err" id="err-${key}"></div>
      <button class="t-primary terra" data-resubmit="${key}" ${busy?'disabled':''}><span>${busy?'Enviando…':'Reenviar'}</span>${arrow}</button>
      <div class="t-actions"><button class="t-link" data-go="stop">Volver</button></div></section>`; }
  screen = 'stop';
  return ctaCard() + hintCard();
}
function overlay(){
  if (celebration) { const c = celebration;
    return `<div class="celebrate" role="dialog" aria-modal="true" aria-labelledby="celH"><div class="burst">${ICON.check}</div>
      ${c.eyebrow?`<div class="eyebrow">${esc(c.eyebrow)}</div>`:''}<h2 id="celH">${esc(c.title)}</h2><p>${esc(c.body)}</p>
      ${c.side?`<button class="t-card treasure" id="celSide" aria-label="Side quest opcional desbloqueado: ${esc(c.side.name)}, ${c.side.pts} puntos">
        <span class="tr-shine" aria-hidden="true"></span>${[1,2,3,4].map(k => `<svg class="tr-spark k${k}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C13 8 16 11 24 12 16 13 13 16 12 24 11 16 8 13 0 12 8 11 11 8 12 0Z"/></svg>`).join('')}
        <span class="tr-eyebrow">Side quest desbloqueado</span><b>${esc(c.side.name)}</b><span class="s">+${c.side.pts} pts · ${esc(sidePlace(c.side))}</span>
        <span class="tr-opt">Opcional · puntos extra si deciden desviarse</span></button>`:''}
      ${c.taxiAsk && ST.current?.checkin && ST.current.legTaxi == null ? legQuestionHTML(true) : `<button class="t-primary" id="celGo"><span>${esc(c.cta)}</span>${arrow}</button>`}</div>`; }
  if (modal) { const m = modal;
    return `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mH"><h3 id="mH">${esc(m.title)}</h3><p>${esc(m.body)}</p>
      <div class="btns"><button class="t-primary ${m.danger?'terra':''}" id="mYes"><span>${esc(m.yes)}</span>${arrow}</button><button class="sec" id="mNo">${esc(m.no)}</button></div></div></div>`; }
  return '';
}
let lastKey = '';
function render(){
  if (!ST) return;
  const key = screen+'|'+curN()+'|'+!!ST.current?.checkin; const enter = key !== lastKey; lastKey = key;
  $('#app').innerHTML = `<div class="tapp ${enter?'enter':''}">${statusCard()}${body()}</div>${overlay()}`;
  bind(); tick(); fitPoems();
  if (celebration && !celebration.fired) { celebration.fired = true; Motion.confetti(celebration.fx || 'normal'); }
  if (missFx != null) { const d = missFx; missFx = null; Motion.nope($('#cta')); Motion.countUp($('#missDist'), d, fmtDist); }
}
function fatal(msg){ $('#app').innerHTML = `<div class="tapp"><section class="c-cta"><div class="t-eyebrow">El Gran Scavenger Hunt</div><h2 class="t-h">Ups</h2><p class="t-p">${esc(msg)}</p></section></div>`; }

/* ---------- actions ---------- */
function go(s){ screen = s; geo = {}; render(); window.scrollTo(0,0); }
async function act(fn){ if (busy) return; busy = true; render(); try { await fn(); } catch(e) { toast(errMsg(e)); if (e.code!=='offline') { try { await load(); } catch(_){} } } finally { busy = false; render(); } }

function checkIn(){
  const n = curN();
  if (!navigator.geolocation) { geo = {fail:true}; render(); return; }
  busy = true; render();
  navigator.geolocation.getCurrentPosition(async pos => {
    busy = false;
    await act(async () => {
      const r = await rpc('hunt_checkin', {p_token:TOKEN, p_lat:pos.coords.latitude, p_lng:pos.coords.longitude, p_acc:pos.coords.accuracy});
      if (r.ok) { geo = {}; celebration = {eyebrow:`Parada ${n}`, title:'¡Correcto!', body:`Encontraron ${r.name}. Ahora, el reto.`, cta:'Ver el reto', fx:'normal', taxiAsk:true}; await load(); }
      else { geo = {miss:r.dist}; missFx = r.dist; }
    });
  }, () => { busy = false; geo = {fail:true}; render(); }, {enableHighAccuracy:true, timeout:15000, maximumAge:0});
}
function manualCheckin(){
  const n = curN();
  act(async () => { const r = await rpc('hunt_checkin', {p_token:TOKEN, p_lat:null, p_lng:null, p_acc:null});
    geo = {}; celebration = {eyebrow:`Parada ${n}`, title:'Check-in registrado', body:`Los quizmasters confirman que están en ${r.name}. Ahora, el reto.`, cta:'Ver el reto', fx:'small', taxiAsk:true}; await load(); });
}
function shake(key, m){ const e = document.getElementById('err-'+key); if (e) e.textContent = m; else toast(m); Motion.nope($('#cta')); }
async function submit(key, resubmit){
  const isStop = /^s\d+$/.test(key);
  const kind = isStop ? (resubmit ? ST.progress.find(p=>'s'+p.n===key)?.proof : ST.current?.proof) : 'photo';
  let answer = null, media = null, mtype = null;
  if (kind==='phrase') { answer = (document.getElementById('in-'+key)?.value || '').trim(); if (!answer) return shake(key, 'Escriban la frase primero.'); }
  else { const s = pending[key]; if (!s) return shake(key, kind==='voice' ? 'Adjunten la nota de voz.' : 'Adjunten la foto.'); media = s.data; mtype = s.type; }
  const n = isStop ? +key.slice(1) : null; const wasFinish = isStop && ST.current?.finish && !resubmit;
  const prevSides = new Set(ST.sides.map(s=>s.id));
  let wrong = false;
  await act(async () => {
    const r = await rpc('hunt_submit', {p_token:TOKEN, p_key:key, p_answer:answer, p_media:media, p_media_type:mtype});
    if (r.ok === false) { wrong = true; return; }
    delete pending[key]; delete drafts[key];
    await load();
    if (resubmit) { screen = 'stop'; toast('Reenviado a los quizmasters.'); return; }
    if (!isStop) { screen = 'sides'; toast('Enviado a los quizmasters.'); return; }
    const side = ST.sides.find(s => !prevSides.has(s.id));
    celebration = wasFinish
      ? {eyebrow:'Destino final', title:'¡Llegaron!', body:`Reloj detenido en ${durS(elapsed())}. Pidan algo: los puntajes se revelan cuando lleguen todos.`, cta:'Ver nuestro tiempo', fx:'big'}
      : {eyebrow:`Parada ${n} completa`, title: kind==='phrase' ? (puz.letters[n] ? '¡MAESTRO!' : '¡Frase correcta!') : '¡Reto enviado!', body: kind==='phrase' ? 'Exacto. La siguiente pista ya está desbloqueada.' : 'Los quizmasters revisan su prueba. Mientras tanto, sigan.', cta:`Pista ${curN()}`, side, fx: kind==='phrase' ? 'normal' : 'small'};
    screen = 'stop';
  });
  if (wrong && ST.current?.puzzle) { puz.pick[ST.current.n] = []; render(); }
  if (wrong) shake(key, ST.current?.puzzle ? 'Esa no es la palabra. Reorganicen las letras.' : 'Esa no es. Levanten los ojos otra vez.');
}
function bind(){
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  document.querySelectorAll('[data-submit]').forEach(b => b.onclick = () => submit(b.dataset.submit));
  document.querySelectorAll('[data-resubmit]').forEach(b => b.onclick = () => submit(b.dataset.resubmit, true));
  document.querySelectorAll('input[type=file]').forEach(inp => inp.onchange = async () => {
    const key = inp.id.slice(3); const f = inp.files[0]; if (!f) return;
    if (f.type.startsWith('image/')) { const d = await downscale(f); if (!d) return toast('No pudimos leer esa foto. Intenten con otra.'); pending[key] = {img:d, data:d, type:'image/jpeg', fileName:f.name}; }
    else { if (f.size > 2.8e6) return toast(MSG.too_large); const d = await readDataURL(f); pending[key] = {data:d, type:f.type||'audio/mpeg', fileName:f.name}; }
    render();
  });
  document.querySelectorAll('textarea.t-input').forEach(x => { x.oninput = () => { drafts[x.id.slice(3)] = x.value; };
    x.onkeydown = e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); const k=x.id.slice(3); document.querySelector(`[data-submit="${k}"],[data-resubmit="${k}"]`)?.click(); } }; });
  const cb = $('#checkinBtn'); if (cb) cb.onclick = checkIn;
  const cm = $('#checkinManual'); if (cm) cm.onclick = manualCheckin;
  const sh = $('#simHere'); if (sh) sh.onclick = () => { const n = curN(); act(async () => { const r = await rpc('hunt_checkin_demo', {p_token:TOKEN});
    geo = {}; celebration = {eyebrow:`Parada ${n}`, title:'¡Correcto!', body:`Encontraron ${r.name}. Ahora, el reto.`, cta:'Ver el reto', fx:'normal', taxiAsk:true}; await load(); }); };
  const sf = $('#simFar'); if (sf) sf.onclick = () => { const d = Math.round(600 + Math.random()*2400); geo = {miss:d}; missFx = d; render(); };
  const pc = $('#pzCheck'); if (pc) pc.onclick = checkLetters;
  document.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { const n = curN(); const p = puz.pick[n] ||= []; const i = +b.dataset.pick; if (!p.includes(i)) p.push(i); render(); });
  document.querySelectorAll('[data-unpick]').forEach(b => b.onclick = () => { const n = curN(); puz.pick[n].splice(+b.dataset.unpick, 1); render(); });
  const pzc = $('#pzClear'); if (pzc) pzc.onclick = () => { puz.pick[curN()] = []; render(); };
  const boxes = [...document.querySelectorAll('.pz-box')];
  boxes.forEach((bx, i) => {
    bx.oninput = () => { bx.value = bx.value.slice(-1).toUpperCase(); bx.classList.remove('bad','ok'); (puz.vals[curN()] ||= [])[i] = bx.value; if (puz.marks[curN()]) puz.marks[curN()][i] = null; if (bx.value && boxes[i+1]) boxes[i+1].focus(); };
    bx.onkeydown = e => { if (e.key === 'Backspace' && !bx.value && boxes[i-1]) { boxes[i-1].focus(); } if (e.key === 'Enter') { e.preventDefault(); checkLetters(); } };
  });
  const tm = $('#tcMinus'); if (tm) tm.onclick = () => { tc = Math.max(0, tc - 1); render(); };
  const tp = $('#tcPlus'); if (tp) tp.onclick = () => { tc = Math.min(30, tc + 1); render(); };
  const ts = $('#tcSave'); if (ts) ts.onclick = () => act(async () => { await rpc('hunt_taxi_confirm', {p_token:TOKEN, p_count:tc}); await load(); toast('Gracias. Taxis confirmados.'); });
  const ns = $('#nmSave'); if (ns) ns.onclick = saveName;
  const ni = $('#nmInput'); if (ni) ni.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); saveName(); } };
  const ne = $('#nmEdit'); if (ne) ne.onclick = () => { editingName = true; render(); $('#nmInput')?.focus(); };
  document.querySelectorAll('[data-leg]').forEach(b => b.onclick = () => answerLeg(b.dataset.leg === 'yes'));
  const ph = $('#pzHelp'); if (ph) ph.onclick = () => { puz.help[curN()] = true; render(); };
  const hb = $('#hintBtn'); if (hb) hb.onclick = () => { modal = {title:'¿Usar la pista?', body:'Si usan la pista, esta parada vale la mitad: 5 puntos en vez de 10. El reloj sigue corriendo.', yes:'Sí, dame la pista', no:'Seguimos intentando', danger:true,
    onYes: () => act(async () => { await rpc('hunt_hint', {p_token:TOKEN}); await load(); toast('Pista desbloqueada. Esta parada vale 5 puntos.'); })}; render(); };
  const tb = $('#taxiBtn'); if (tb) tb.onclick = () => { const k = ST.taxis; const extra = k >= ST.taxiLimit;
    modal = {title:`¿Registrar el taxi ${k+1}?`, body: extra ? `Ya usaron los ${ST.taxiLimit}. Este taxi extra resta ${HUNT.taxiPenalty} puntos.` : `Llevan ${k} de ${ST.taxiLimit}. Los cuatro van juntos en el mismo carro.`, yes:'Sí, registrar', no:'Cancelar', danger:extra,
    onYes: () => act(async () => { const r = await rpc('hunt_taxi', {p_token:TOKEN}); await load(); toast(`Taxi ${r.taxis} registrado.`); })}; render(); };
  const my = $('#mYes'); if (my) { my.focus(); my.onclick = () => { const f = modal.onYes; modal = null; f(); }; }
  const mn = $('#mNo'); if (mn) mn.onclick = () => { modal = null; render(); };
  const sc = $('#scrim'); if (sc) sc.onclick = e => { if (e.target === sc) { modal = null; render(); } };
  const cg = $('#celGo'); if (cg) { cg.focus({focusVisible:false}); cg.onclick = () => { celebration = null; render(); window.scrollTo(0,0); }; }
  const cs = $('#celSide'); if (cs) cs.onclick = () => { const id = celebration.side.id; celebration = null; go('side:'+id); };
}
function tick(){
  if (!ST) return;
  const t = $('#timer'); if (t && now() >= departMs()) t.textContent = durS(elapsed());
  const cd = $('#countdown'); if (cd) { const ms = departMs() - now(); if (ms <= 0) { cd.removeAttribute('id'); refresh(true); } else { const m = Math.floor(ms/60000); cd.textContent = m >= 60 ? `${Math.floor(m/60)} h ${m%60} min` : `${m} min ${String(Math.floor(ms/1000)%60).padStart(2,'0')} s`; } }
}
async function refresh(force){
  if (busy || modal || celebration) return;
  const before = sig();
  try { await load(); } catch(e) { return; }
  const typing = ['TEXTAREA','INPUT'].includes(document.activeElement?.tagName);
  if ((force || sig() !== before) && !typing) render();
}

(async function start(){
  TOKEN = readToken();
  if (!TOKEN) return Landing.show(false);
  try { await load(); } catch(e) { return e.code === 'bad_token' ? Landing.show(true) : fatal(errMsg(e)); }
  document.title = `${ST.team.name} · El Gran Scavenger Hunt`;
  render();
  setInterval(tick, 1000);
  setInterval(() => refresh(false), 20000);
  setInterval(() => { if (ST && now() < departMs()) refresh(false); }, 5000);
  window.addEventListener('resize', () => fitPoems());
  document.fonts?.ready.then(() => fitPoems());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(false); });
})();
