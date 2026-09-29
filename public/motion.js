/* Motion: confetti for a correct answer, a damped "nope" for a miss.
   Confetti is canvas physics: paper pieces with drag, gravity, flutter and a 3D flip (front/back shade). */
const Motion = (() => {
  const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // invite palette: [front, back]
  const PAL = [['#E4AA2A','#B7851A'], ['#CF5436','#A33E27'], ['#16347F','#0F2560'], ['#F6F3EC','#D9D3C4'], ['#3F6FD8','#2B54AE'], ['#E4AA2A','#B7851A']];
  let canvas, ctx, parts = [], raf = 0, last = 0;

  function ensure(){
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {position:'fixed', inset:'0', width:'100%', height:'100%', pointerEvents:'none', zIndex:'90'});
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    size(); window.addEventListener('resize', size);
  }
  function size(){ const d = Math.min(window.devicePixelRatio || 1, 2); canvas.width = innerWidth * d; canvas.height = innerHeight * d; ctx.setTransform(d,0,0,d,0,0); }
  const rnd = (a, b) => a + Math.random() * (b - a);

  function spawn(x, y, angleDeg, spread, count, speed){
    for (let i = 0; i < count; i++) {
      const a = (angleDeg + rnd(-spread, spread)) * Math.PI / 180;
      const v = speed * rnd(.55, 1.15);
      const shape = Math.random() < .62 ? 'rect' : Math.random() < .6 ? 'circle' : 'ribbon';
      const [front, back] = PAL[(Math.random() * PAL.length) | 0];
      parts.push({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, shape, front, back,
        w: shape === 'ribbon' ? rnd(3, 4.5) : rnd(6, 11), h: shape === 'ribbon' ? rnd(12, 20) : rnd(4, 7),
        rot: rnd(0, Math.PI * 2), vr: rnd(-9, 9), tilt: rnd(0, Math.PI * 2), vt: rnd(6, 14),
        sway: rnd(0, Math.PI * 2), swayF: rnd(2, 4.5), swayA: rnd(18, 55), age: 0, life: rnd(2.6, 3.8)});
    }
  }
  function step(t){
    const dt = Math.min(.033, (t - last) / 1000 || .016); last = t;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const G = 1100, drag = 1.6;
    parts = parts.filter(p => p.age < p.life && p.y < innerHeight + 60);
    for (const p of parts) {
      p.age += dt;
      const k = Math.exp(-drag * dt);
      p.vx *= k; p.vy = p.vy * k + G * dt;
      const term = p.shape === 'circle' ? 460 : 290;          // paper flutters down slower than it flew up
      if (p.vy > term) p.vy = term;
      p.sway += p.swayF * dt;
      p.x += (p.vx + Math.sin(p.sway) * p.swayA) * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt; p.tilt += p.vt * dt;
      const flip = Math.cos(p.tilt);
      const fade = Math.min(1, (p.life - p.age) / .6);
      ctx.save(); ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = flip > 0 ? p.front : p.back;
      if (p.shape === 'circle') { ctx.scale(1, Math.max(.25, Math.abs(flip))); ctx.beginPath(); ctx.arc(0, 0, p.w / 2.2, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.scale(1, flip); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
      ctx.restore();
    }
    if (parts.length) raf = requestAnimationFrame(step); else { raf = 0; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  function run(){ if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); } }

  // size: 'small' (correct phrase), 'normal' (check-in), 'big' (FRANC)
  function confetti(size = 'normal'){
    if (reduce()) return;
    ensure();
    const W = innerWidth, H = innerHeight;
    const n = size === 'small' ? 45 : size === 'big' ? 130 : 85;
    const sp = Math.max(1150, H * 2.3);
    spawn(-10, H * .92, -62, 14, n, sp);          // left cannon
    spawn(W + 10, H * .92, -118, 14, n, sp);      // right cannon
    if (size !== 'small') setTimeout(() => { spawn(W / 2, H * .38, -90, 70, size === 'big' ? 90 : 50, sp * .55); run(); }, 160);   // centre pop
    if (size === 'big') setTimeout(() => { spawn(-10, H * .8, -55, 18, 70, sp); spawn(W + 10, H * .8, -125, 18, 70, sp); run(); }, 650);  // second volley
    run();
    navigator.vibrate?.(size === 'big' ? [30, 60, 30, 60, 80] : [25, 50, 40]);
  }

  // miss: damped head-shake + terracotta pulse on the element, distance ticker, double buzz
  function nope(el){
    navigator.vibrate?.([70, 50, 70]);
    if (!el || reduce()) return;
    el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
    el.addEventListener('animationend', () => el.classList.remove('nope'), {once: true});
  }
  function countUp(el, to, fmt, ms = 750){
    if (!el) return;
    if (reduce()) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const f = t => { const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }
  return {confetti, nope, countUp};
})();
