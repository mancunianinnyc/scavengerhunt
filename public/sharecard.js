/* Share card for the finish screen: a 1080x1350 image (team, final time, photo collage, invite artwork)
   handed to the phone's own share sheet (Instagram, WhatsApp…). Never names the final destination. */
const ShareCard = (() => {
  const W = 1080, H = 1350;
  const C = {navy:'#16347F', deep:'#0F2560', cream:'#F6F3EC', gold:'#E4AA2A', terra:'#CF5436', ink:'#1A2344'};
  let cached = null; // {key, blob, url, file}

  const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  async function fonts(){
    try { await Promise.all(['400 120px "Libre Caslon Display"', 'italic 44px "Libre Caslon Text"', '500 44px "IBM Plex Mono"', '600 30px "Albert Sans"', '700 26px "Albert Sans"'].map(f => document.fonts.load(f))); } catch (_) {}
  }
  function fitText(ctx, text, font, maxW, start, min){
    let size = start; do { ctx.font = font.replace('{s}', size); if (ctx.measureText(text).width <= maxW) break; size -= 4; } while (size > min);
    return size;
  }
  function spacedCaps(ctx, text, x, y, spacing){
    const chars = [...text]; let w = chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
    let cx = x - w / 2; chars.forEach(c => { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + spacing; });
  }
  function polaroid(ctx, img, cx, cy, size, rot, caption){
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot * Math.PI / 180);
    const pad = 18, bottom = 58, fw = size + pad * 2, fh = size + pad + bottom;
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#FFFDF8'; ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
    ctx.shadowColor = 'transparent';
    // cover-crop the photo into a square
    const s = Math.min(img.width, img.height), sx = (img.width - s) / 2, sy = (img.height - s) / 2;
    ctx.drawImage(img, sx, sy, s, s, -fw / 2 + pad, -fh / 2 + pad, size, size);
    if (caption) { ctx.fillStyle = '#56608A'; ctx.font = '600 24px "Albert Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let c = caption; while (ctx.measureText(c).width > size && c.length > 4) c = c.slice(0, -2); if (c !== caption) c = c.trim() + '…';
      ctx.fillText(c, 0, fh / 2 - bottom / 2); }
    ctx.restore();
  }
  function landscape(ctx){
    // Monserrate ridge, gold dotted route, terracotta sun (after the invite)
    const top = 935;
    ctx.fillStyle = C.terra; ctx.beginPath(); ctx.arc(890, top + 30, 52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.deep; ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, top + 190);
    [[120, top + 170], [230, top + 130], [330, top + 145], [440, top + 95], [540, top + 110], [650, top + 70], [760, top + 85], [880, top + 58], [980, top + 92], [W, top + 80]].forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.gold; ctx.lineWidth = 5; ctx.setLineDash([2, 18]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(70, top + 205); ctx.bezierCurveTo(300, top + 175, 420, top + 135, 560, top + 128); ctx.bezierCurveTo(700, top + 120, 800, top + 95, 880, top + 88); ctx.stroke(); ctx.setLineDash([]);
    [[70, top + 205], [560, top + 128], [880, top + 88]].forEach(([x, y]) => { ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); });
  }
  async function draw({team, time, stops, sides, photos}){
    await fonts();
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.navy); g.addColorStop(1, '#122C6E'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // header
    [-22, 0, 22].forEach(dx => { ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(W / 2 + dx, 74, 5, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = C.gold; ctx.font = '700 26px "Albert Sans", sans-serif'; spacedCaps(ctx, 'EL GRAN SCAVENGER HUNT DE BOGOTÁ', W / 2, 128, 5);
    ctx.fillStyle = 'rgba(246,243,236,.72)'; ctx.font = '600 26px "Albert Sans", sans-serif'; ctx.fillText('Primera edición · 3 de octubre de 2026', W / 2, 170);
    // team
    ctx.fillStyle = C.cream; const ts = fitText(ctx, team, '400 {s}px "Libre Caslon Display", Georgia, serif', W - 140, 124, 56);
    ctx.font = `400 ${ts}px "Libre Caslon Display", Georgia, serif`; ctx.fillText(team, W / 2, 300);
    ctx.fillStyle = C.gold; ctx.font = 'italic 44px "Libre Caslon Text", Georgia, serif'; ctx.fillText('¡Llegamos al destino final!', W / 2, 372);
    // photos
    const imgs = (await Promise.all(photos.slice(0, 4).map(p => loadImg(p.media).then(img => img && {img, label: p.label})))).filter(Boolean);
    const slots = {1: [[540, 700, 400, -2]], 2: [[330, 690, 340, -5], [750, 700, 340, 4]], 3: [[250, 700, 290, -6], [540, 675, 290, 2], [830, 705, 290, 6]],
                   4: [[315, 562, 212, -5], [765, 570, 212, 4], [330, 868, 212, 3], [750, 874, 212, -4]]}[imgs.length] || [];
    // 4 photos sit in a 2x2 grid; keep them clear of the header and the landscape
    landscape(ctx); // mountains behind, photos in front
    imgs.forEach((it, i) => { const [x, y, s, r] = slots[i]; polaroid(ctx, it.img, x, y, s, r, it.label); });
    if (!imgs.length) { ctx.fillStyle = 'rgba(246,243,236,.85)'; ctx.font = 'italic 46px "Libre Caslon Text", Georgia, serif'; ctx.fillText('10 paradas por Bogotá', W / 2, 700); }
    // soft fade so the stats read cleanly over photos/landscape
    const fade = ctx.createLinearGradient(0, 1120, 0, H); fade.addColorStop(0, 'rgba(15,37,96,0)'); fade.addColorStop(.35, 'rgba(15,37,96,.92)'); fade.addColorStop(1, 'rgba(15,37,96,1)'); ctx.fillStyle = fade; ctx.fillRect(0, 1120, W, H - 1120);
    // stats band
    const y0 = 1240;
    const cols = [['TIEMPO FINAL', time, '500 58px "IBM Plex Mono", monospace'], ['PARADAS', String(stops), '400 64px "Libre Caslon Display", Georgia, serif'], ['SIDE QUESTS', String(sides), '400 64px "Libre Caslon Display", Georgia, serif']];
    const xs = [300, 640, 870];
    cols.forEach(([lab, val, font], i) => {
      ctx.fillStyle = 'rgba(246,243,236,.7)'; ctx.font = '700 22px "Albert Sans", sans-serif'; spacedCaps(ctx, lab, xs[i], y0 - 58, 3);
      ctx.fillStyle = C.cream; ctx.font = font; ctx.fillText(val, xs[i], y0 + 4);
    });
    ctx.fillStyle = 'rgba(246,243,236,.45)'; ctx.font = '600 20px "Albert Sans", sans-serif'; ctx.fillText('hunt.rossgarlick.com', W / 2, H - 28);
    return new Promise(res => cv.toBlob(b => res(b), 'image/jpeg', 0.9));
  }
  const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'equipo';
  async function build(data){
    const key = JSON.stringify([data.team, data.time, data.stops, data.sides, data.photos.map(p => p.key)]);
    if (cached?.key === key) return cached;
    const blob = await draw(data);
    const file = new File([blob], `scavenger-hunt-${slug(data.team)}.jpg`, {type: 'image/jpeg'});
    if (cached?.url) URL.revokeObjectURL(cached.url);
    cached = {key, blob, file, url: URL.createObjectURL(blob)};
    return cached;
  }
  const canShareFiles = f => { try { return !!navigator.canShare && navigator.canShare({files: [f]}); } catch (_) { return false; } };
  return {build, canShareFiles};
})();
