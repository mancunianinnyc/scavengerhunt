/* Shared helpers for the team app and the admin page. */
const HUNT = {
  url: 'https://flbjlwckcgtlamnpabmj.supabase.co',
  key: 'sb_publishable_p0yhCENHJlvNcNRvqN2kpw_zo1vKS2b',
  taxiPenalty: 10, stopPts: 10, hintStopPts: 5, placement: [50, 30, 20], theatronBonus: 10,
  cutoff: Date.parse('2026-10-03T18:00:00-05:00'),
};
const QUIZ = {
  q1:{name:'Universities in Bogotá', rule:'1 pt each', fields:[['n','Valid',1]]},
  q2:{name:'Localidades', rule:'1 pt each · all 20 doubles it', fields:[['n','Correct (of 20)',1]], max:20},
  q3:{name:'Water bodies', rule:'2 pts each', fields:[['n','Valid',2]]},
  q4:{name:'Cultural figures', rule:'poet 3 · writer 2 · musician 1', fields:[['poets','Poets',3],['writers','Writers',2],['musicians','Musicians',1]]},
};
const ACTS = [{id:'can', name:'Correct drink can (hint: the cats)', pts:10}];

class RpcError extends Error { constructor(code, status){ super(code); this.code = code; this.status = status; } }
async function rpc(fn, args){
  let r;
  try {
    r = await fetch(`${HUNT.url}/rest/v1/rpc/${fn}`, {method:'POST', headers:{apikey:HUNT.key, 'Content-Type':'application/json'}, body: JSON.stringify(args)});
  } catch (e) { throw new RpcError('offline', 0); }
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (_) {}
  if (!r.ok) throw new RpcError(j?.message || `http_${r.status}`, r.status);
  return j;
}

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hm = t => new Date(t).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Bogota'});
function dur(ms){ if(!(ms>0)) ms=0; const m=Math.floor(ms/60000); return `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`; }
function durS(ms){ if(!(ms>0)) ms=0; const s=Math.floor(ms/1000); return `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
let clockOffset = 0; // server time minus device time
const now = () => Date.now() + clockOffset;
function syncClock(serverNow){ const t = Date.parse(serverNow); if (t) clockOffset = t - Date.now(); }

let toastTimer;
function toast(msg){ const h = $('#toastHost'); if (!h) return; h.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`; clearTimeout(toastTimer); toastTimer = setTimeout(()=>h.innerHTML='', 3600); }

// Shrinks a photo on the phone before upload: longest side 1280 px, JPEG.
function downscale(file, max=1280, q=.74){
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => {
      const s = Math.min(1, max/Math.max(img.width,img.height)); const c=document.createElement('canvas'); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height); res(c.toDataURL('image/jpeg',q)); };
      img.onerror = () => res(null); img.src = r.result; };
    r.onerror = () => res(null); r.readAsDataURL(file);
  });
}
function readDataURL(file){ return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(file); }); }

/* Clues are poems: one line per verse line, stanza gaps kept, sized so the longest line fits.
   Lines that still can't fit at the minimum size turn over with a hanging indent, as in print. */
function poemHTML(text){
  const stanzas = String(text||'').trim().split(/\n\s*\n/);
  return `<div class="poem">${stanzas.map(st => `<p class="stanza">${st.split('\n').map(l => `<span class="verse">${esc(l.trim())}</span>`).join('')}</p>`).join('')}</div>`;
}
function fitPoems(root=document){
  root.querySelectorAll('.poem').forEach(p => {
    const max = 24, min = 16;
    p.style.fontSize = max + 'px'; p.classList.add('measuring');
    const avail = p.clientWidth; let widest = 0;
    p.querySelectorAll('.verse').forEach(v => { widest = Math.max(widest, v.scrollWidth); });
    p.classList.remove('measuring');
    if (widest > avail * .95 && avail > 0) p.style.fontSize = Math.max(min, Math.floor(max * avail * .94 / widest * 10) / 10) + 'px';
  });
}

document.fonts?.addEventListener?.('loadingdone', () => fitPoems());
