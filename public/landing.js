/* Welcome page for anyone without a team link: countdown, details, how it works, paste-your-link. ES/EN. */
const Landing = (() => {
  const ARRIVE = Date.parse('2026-10-03T09:45:00-05:00');
  const START = Date.parse('2026-10-03T10:00:00-05:00');
  const END = Date.parse('2026-10-03T19:00:00-05:00');
  const T = {
    es: {
      edition:'Primera edición anual', title:'El Gran Scavenger Hunt de Bogotá',
      until:'para vernos en el letrero de Bogotá del Parque de los Hippies', d:'días', h:'horas', m:'min', s:'seg',
      live:'¡Es hoy! La búsqueda está en marcha.', liveSub:'Abran el link de su equipo para ver su pista.',
      over:'Gracias por jugar.', overSub:'Nos vemos en la segunda edición.',
      when:'Cuándo', whenV:'Sábado 3 de octubre', whenS:'Llegada 9:45 · salida 10:00',
      where:'Dónde', whereV:'Letrero de Bogotá, Parque de los Hippies', whereS:'Chapinero. Lleguen a las 9:45 para armar los equipos.',
      teams:'Equipos', teamsV:'Cuatro personas por equipo', teamsS:'Nosotros los armamos en el parque',
      how:'Cómo funciona', h1:'Armamos los equipos en el parque y cada uno sale con diez minutos de diferencia.',
      h2:'Su equipo recibe un link por WhatsApp. Ahí aparecen las pistas, el check-in y los retos.',
      h3:'Diez paradas por la ciudad y side quests opcionales. Los puntajes son secretos hasta el final, y el destino final lo tienen que descubrir ustedes.',
      bring:'Qué traer', b:['Celular con batería (y una batería externa)', 'Datos móviles y la ubicación activada', 'Zapatos cómodos', 'Algo de efectivo para comida y taxis'],
      have:'¿Ya tienen su link?', haveS:'Si les llegó por WhatsApp, ábranlo desde ahí. O péguenlo aquí:',
      paste:'Pegar el link del equipo', go:'Abrir', badPaste:'Ese no parece un link del equipo. Cópienlo completo desde WhatsApp.',
      bad:'Este link no funciona. Pídanle uno nuevo a los quizmasters por WhatsApp.',
      hosts:'Con sus quizmasters, Ross & Julia', lang:'English',
    },
    en: {
      edition:'First annual edition', title:'El Gran Scavenger Hunt de Bogotá',
      until:'until we meet at the Bogotá sign in Parque de los Hippies', d:'days', h:'hours', m:'min', s:'sec',
      live:'It’s today! The hunt is on.', liveSub:'Open your team’s link to see your clue.',
      over:'Thanks for playing.', overSub:'See you at the second edition.',
      when:'When', whenV:'Saturday 3 October', whenS:'Arrive 9:45 · start 10:00',
      where:'Where', whereV:'The Bogotá sign, Parque de los Hippies', whereS:'Chapinero. Arrive at 9:45 so we can make the teams.',
      teams:'Teams', teamsV:'Four people per team', teamsS:'We make the teams in the park',
      how:'How it works', h1:'We form teams in the park, and each team sets off ten minutes apart.',
      h2:'Your team gets a link on WhatsApp. Clues, check-ins and challenges all happen there.',
      h3:'Ten stops across the city and optional side quests. Scores stay secret until the end, and the final destination is yours to work out.',
      bring:'What to bring', b:['A charged phone (and a power bank)', 'Mobile data and location turned on', 'Comfortable shoes', 'Some cash for food and taxis'],
      have:'Got your link?', haveS:'If it came on WhatsApp, open it from there. Or paste it here:',
      paste:'Paste your team link', go:'Open', badPaste:'That doesn’t look like a team link. Copy the whole link from WhatsApp.',
      bad:'This link doesn’t work. Ask the quizmasters for a new one on WhatsApp.',
      hosts:'With your quizmasters, Ross & Julia', lang:'Español',
    },
  };
  let lang = 'es', err = null, timer = 0, drawn = false;
  try { lang = localStorage.getItem('hunt-lang') || ((navigator.language||'').startsWith('es') ? 'es' : (navigator.language ? 'en' : 'es')); } catch(_) {}

  const hero = () => `<svg class="l-art" viewBox="0 0 360 120" aria-hidden="true">
      <circle cx="298" cy="30" r="17" fill="var(--terracotta)"/>
      <path d="M0 120 L0 104 L40 96 L78 80 L112 84 L150 60 L186 66 L222 44 L256 50 L298 36 L330 48 L360 44 L360 120 Z" fill="var(--navy-deep)"/>
      <path class="l-route" d="M18 106 C70 98 96 84 132 76 S204 56 236 50 S286 40 298 38" fill="none" stroke="var(--gold)" stroke-width="2.4" stroke-dasharray="1 7" stroke-linecap="round"/>
      <circle class="l-dot" cx="18" cy="106" r="4" fill="var(--gold)"/><circle class="l-dot d2" cx="132" cy="76" r="4" fill="var(--gold)"/><circle class="l-dot d3" cx="236" cy="50" r="4" fill="var(--gold)"/>
    </svg>`;
  function clockHTML(t){
    const n = now();
    if (n >= END) return `<div class="l-live"><b>${t.over}</b><span>${t.overSub}</span></div>`;
    if (n >= ARRIVE) return `<div class="l-live"><b>${t.live}</b><span>${t.liveSub}</span></div>`;
    return `<div class="l-count" role="timer" aria-live="off">${['d','h','m','s'].map(k => `<div class="l-tile"><b id="cd-${k}">00</b><span>${t[k]}</span></div>`).join('')}</div><p class="l-until">${t.until}</p>`;
  }
  function html(){
    const t = T[lang];
    return `<div class="l-wrap">
      <div class="l-bar"><span>hunt.rossgarlick.com</span><button class="t-link" id="lLang" lang="${lang==='es'?'en':'es'}">${t.lang}</button></div>
      ${err ? `<div class="t-miss l-err" role="alert">${esc(t.bad)}</div>` : ''}
      <section class="l-hero ${drawn?'':'draw'}">
        <div class="l-orn" aria-hidden="true"><span></span><span></span><span></span></div>
        <p class="l-ed">${t.edition}</p>
        <h1 class="l-title">${t.title}</h1>
        ${hero()}
        <div id="lClock">${clockHTML(t)}</div>
      </section>
      <section class="l-card l-facts">
        ${[['when','whenV','whenS'],['where','whereV','whereS'],['teams','teamsV','teamsS']].map(([a,b,c]) => `<div class="l-fact"><span class="l-k">${t[a]}</span><b>${t[b]}</b><span class="l-s">${t[c]}</span></div>`).join('')}
      </section>
      <section class="l-card"><h2 class="l-h">${t.how}</h2>
        <ol class="l-steps">${['h1','h2','h3'].map((k,i) => `<li><span class="l-n">${i+1}</span><p>${t[k]}</p></li>`).join('')}</ol></section>
      <section class="l-card"><h2 class="l-h">${t.bring}</h2><ul class="l-bring">${t.b.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
      <section class="l-card"><h2 class="l-h">${t.have}</h2><p class="t-p">${t.haveS}</p>
        <form id="lForm" class="l-form"><label class="vh" for="lLink">${t.paste}</label><input id="lLink" type="text" inputmode="url" autocapitalize="off" spellcheck="false" autocomplete="off" placeholder="${t.paste}">
        <button class="t-primary" type="submit"><span>${t.go}</span><span aria-hidden="true">→</span></button></form><div class="err" id="lErr"></div></section>
      <p class="l-hosts">${t.hosts}</p>
    </div>`;
  }
  function tick(){
    const ms = ARRIVE - now();
    if (ms <= 0) { const c = $('#lClock'); if (c && c.querySelector('.l-count')) c.innerHTML = clockHTML(T[lang]); return; }
    const s = Math.floor(ms / 1000);
    const v = {d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60};
    for (const k in v) { const e = document.getElementById('cd-'+k); if (e) { const txt = String(v[k]).padStart(2, '0'); if (e.textContent !== txt) { e.textContent = txt; e.classList.remove('tick'); void e.offsetWidth; e.classList.add('tick'); } } }
  }
  function tokenFrom(str){
    const s = String(str || '').trim(); if (!s) return null;
    try { const u = new URL(s, location.origin); const t = u.searchParams.get('t'); if (t) return t; } catch(_) {}
    return /^[A-Za-z0-9_-]{8,20}$/.test(s) ? s : null;
  }
  function render(){
    document.title = 'El Gran Scavenger Hunt de Bogotá';
    document.documentElement.lang = lang;
    $('#app').innerHTML = html(); drawn = true;
    tick(); clearInterval(timer); timer = setInterval(tick, 1000);
    $('#lLang').onclick = () => { lang = lang === 'es' ? 'en' : 'es'; try { localStorage.setItem('hunt-lang', lang); } catch(_) {} render(); };
    $('#lForm').onsubmit = e => { e.preventDefault(); const tok = tokenFrom($('#lLink').value);
      if (!tok) { $('#lErr').textContent = T[lang].badPaste; return; }
      try { localStorage.setItem('hunt-token', tok); } catch(_) {} location.href = '/?t=' + encodeURIComponent(tok); };
  }
  return { show(badLink){ err = !!badLink; if (badLink) { try { localStorage.removeItem('hunt-token'); } catch(_) {} } render(); } };
})();
