/* Admin-only: photo slideshow (for the reveal) and a zip export of every photo.
   Uses admin.js globals: TEAMS, STOPS, SIDE, KEY, S, mediaCache, finishT. */
const Photos = (() => {
  const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const labelOf = k => { if (/^s\d+$/.test(k)) { const st = STOPS.find(x => 's'+x.n === k); return st ? `Parada ${st.n} · ${st.name}` : k; } if (/^b\d+$/.test(k)) return `Bus · tramo a parada ${k.slice(1)}`; const q = SIDE.find(x => x.id === k); return q ? `Side quest · ${q.name}` : k; };
  const orderOf = k => /^s\d+$/.test(k) ? +k.slice(1) * 10 : (SIDE.find(x => x.id === k)?.after ?? 5) * 10 + 5;

  // every photo that isn't rejected, oldest first
  function list(){
    const out = [];
    TEAMS.filter(t => S.showTests || !t.isTest).forEach(t => Object.entries(t.subs).forEach(([k, s]) => {
      if (!s.hasMedia || s.status === 'rejected' || !(s.mediaType || '').startsWith('image')) return;
      out.push({t, k, s, mk: `${t.id}|${k}|${s.updated}`, label: labelOf(k), order: orderOf(k)});
    }));
    return out.sort((a, b) => a.s.t - b.s.t);
  }
  async function load(items, onProgress){
    let done = 0; const queue = items.filter(it => !mediaCache[it.mk]?.media);
    done = items.length - queue.length; onProgress?.(done, items.length);
    const worker = async () => { while (queue.length) { const it = queue.shift();
      for (let tries = 0; tries < 3; tries++) { try { const r = await rpc('hunt_admin_media', {p_key: KEY, p_team: it.t.id, p_sub: it.k}); mediaCache[it.mk] = r || {}; break; } catch (e) { await new Promise(r => setTimeout(r, 800)); } }
      done++; onProgress?.(done, items.length); } };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }
  // up to 4 photos of one team, spread across its route, for the reveal
  function teamStrip(t){
    const mine = list().filter(it => it.t.id === t.id && mediaCache[it.mk]?.media).sort((a, b) => a.order - b.order);
    if (!mine.length) return '';
    const pick = mine.length <= 4 ? mine : [0, 1, 2, 3].map(i => mine[Math.round(i * (mine.length - 1) / 3)]);
    return `<div class="rv-strip">${pick.map((it, i) => `<figure style="--r:${[-4, 3, -2, 4][i]}deg;--d:${i * 90}ms"><img src="${mediaCache[it.mk].media}" alt="${esc(it.label)}"><figcaption>${esc(it.label.replace(/^Parada \d+ · /, ''))}</figcaption></figure>`).join('')}</div>`;
  }

  /* ---------- slideshow ---------- */
  function slideshow(){
    let all = list(), items = all, i = 0, playing = true, timer = 0, layer = 0, filter = '';
    const host = document.createElement('div'); host.className = 'ss'; host.setAttribute('role', 'dialog'); host.setAttribute('aria-label', 'Fotos del hunt');
    const teams = [...new Map(all.map(it => [it.t.id, it.t])).values()];
    host.innerHTML = `<div class="ss-bg"><img alt=""></div><div class="ss-stage"><img class="ss-img" alt=""><img class="ss-img" alt=""></div>
      <div class="ss-top"><span class="ss-count"></span><select class="ss-filter" aria-label="Equipo"><option value="">Todos los equipos</option>${teams.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select><button class="ss-btn ss-x" aria-label="Cerrar">✕</button></div>
      <div class="ss-cap"></div>
      <div class="ss-ctrl"><button class="ss-btn" data-a="prev" aria-label="Anterior">‹</button><button class="ss-btn" data-a="play" aria-label="Pausar">❚❚</button><button class="ss-btn" data-a="next" aria-label="Siguiente">›</button></div>
      <div class="ss-load"></div>`;
    document.body.appendChild(host);
    const $h = s => host.querySelector(s), imgs = host.querySelectorAll('.ss-img');
    if (!all.length) { $h('.ss-load').textContent = 'Todavía no hay fotos.'; }
    const show = () => {
      if (!items.length) return;
      const it = items[i]; const m = mediaCache[it.mk]?.media;
      $h('.ss-count').textContent = `${i + 1} / ${items.length}`;
      $h('.ss-cap').innerHTML = `<span class="dot" style="background:${esc(it.t.color)}"></span><b>${esc(it.t.name)}</b><span>${esc(it.label)} · ${hm(it.s.t)}</span>`;
      if (!m) { $h('.ss-load').textContent = 'Cargando…'; return; }
      layer = 1 - layer; const img = imgs[layer], other = imgs[1 - layer];
      img.src = m; img.style.setProperty('--kx', `${(Math.random() * 4 - 2).toFixed(1)}%`); img.style.setProperty('--ky', `${(Math.random() * 4 - 2).toFixed(1)}%`);
      img.classList.remove('on'); void img.offsetWidth; img.classList.add('on'); other.classList.remove('on');
      $h('.ss-bg img').src = m;
    };
    const go = d => { if (!items.length) return; i = (i + d + items.length) % items.length; show(); restart(); };
    const restart = () => { clearInterval(timer); if (playing) timer = setInterval(() => go(1), 5000); };
    const close = () => { clearInterval(timer); document.removeEventListener('keydown', key); host.remove(); };
    const key = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === ' ') { e.preventDefault(); toggle(); } };
    const toggle = () => { playing = !playing; const b = host.querySelector('[data-a="play"]'); b.textContent = playing ? '❚❚' : '▶'; b.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir'); restart(); };
    host.querySelector('[data-a="prev"]').onclick = () => go(-1);
    host.querySelector('[data-a="next"]').onclick = () => go(1);
    host.querySelector('[data-a="play"]').onclick = toggle;
    $h('.ss-x').onclick = close;
    $h('.ss-filter').onchange = e => { filter = e.target.value; items = filter ? all.filter(it => it.t.id === filter) : all; i = 0; show(); restart(); };
    document.addEventListener('keydown', key);
    load(all, (d, n) => { $h('.ss-load').textContent = d < n ? `Cargando fotos ${d} / ${n}…` : ''; if (d === 1 || (d > 0 && !imgs[layer].src)) show(); }).then(() => { $h('.ss-load').textContent = ''; show(); restart(); });
    host.querySelector('[data-a="next"]').focus();
  }

  /* ---------- zip export ---------- */
  function loadJSZip(){ return window.JSZip ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  async function exportZip(btn){
    const all = list(); if (!all.length) { toast('No photos yet.'); return; }
    const label = btn.textContent; btn.disabled = true;
    try {
      await loadJSZip();
      await load(all, (d, n) => { btn.textContent = `Loading photos ${d} / ${n}…`; });
      btn.textContent = 'Building zip…';
      const zip = new JSZip(); const rows = [['team', 'stop', 'time', 'status', 'file']];
      all.forEach(it => {
        const m = mediaCache[it.mk]?.media; if (!m) return;
        const [head, b64] = m.split(','); const ext = /png/.test(head) ? 'png' : 'jpg';
        const file = `${slug(it.t.name)}/${String(it.order).padStart(3, '0')}_${slug(it.label)}_${hm(it.s.t).replace(':', '')}.${ext}`;
        zip.file(file, b64, {base64: true}); rows.push([it.t.name, it.label, hm(it.s.t), it.s.status, file]);
      });
      zip.file('index.csv', rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'));
      const blob = await zip.generateAsync({type: 'blob'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `scavenger-hunt-fotos-${new Date(now()).toLocaleDateString('en-CA', {timeZone: 'America/Bogota'})}.zip`;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      toast(`Downloaded ${rows.length - 1} photos.`);
    } catch (e) { toast('Export failed. Check the connection and try again.'); }
    finally { btn.disabled = false; btn.textContent = label; }
  }
  return {slideshow, exportZip, load, list, teamStrip};
})();
