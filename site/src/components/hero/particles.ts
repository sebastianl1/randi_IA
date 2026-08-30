// Fondo: constelaciones — cúmulos espirales en "S" de estrellas unidas con
// líneas rectas (carta estelar) y estrellas sueltas, en rojo RANDI.
// Movimiento aleatorio real sin tirones: cada elemento cambia de rumbo cada
// unos segundos y rebota suave en los bordes; nada se teletransporta.
const RED = '229, 72, 77';
const REDD = '122, 31, 35';
const REDF = '255, 205, 207';

interface Star { x: number; y: number; vx: number; vy: number; retarget: number; phase: number; size: number; op: number; color: string }
interface Gpt { dx: number; dy: number; size: number; op: number; color: string; phase: number }
interface Galaxy { x: number; y: number; vx: number; vy: number; retarget: number; rot: number; rotSpeed: number; r: number; pts: Gpt[] }

function rnd(a: number, b: number): number { return a + Math.random() * (b - a); }
function clampV(v: number, mi: number, ma: number): number { return v < mi ? mi : v > ma ? ma : v; }
function newThumb(minS: number, maxS: number): [number, number] {
  const a = Math.random() * Math.PI * 2;
  const sp = rnd(minS, maxS);
  return [Math.cos(a) * sp, Math.sin(a) * sp];
}

function makeGalaxy(cx: number, cy: number, r: number, per: number): Galaxy {
  const wings = 9.4;
  const arms = 2;
  const pts: Gpt[] = [];
  for (let a = 0; a < arms; a++) {
    const base = (a * Math.PI * 2) / arms;
    const count = Math.max(2, Math.floor(per / arms));
    for (let i = 0; i < count; i++) {
      const t = 0.2 + (i / count) * 0.82;
      const rad = r * t;
      const ang = base + t * wings + Math.sin(t * 11) * 0.24;
      const jit = r * 0.022;
      const bright = Math.random() < 0.13;
      pts.push({
        dx: Math.cos(ang) * rad + rnd(-jit, jit),
        dy: Math.sin(ang) * rad + rnd(-jit, jit),
        size: bright ? rnd(1.6, 2.6) : rnd(0.6, 1.5),
        op: bright ? rnd(0.85, 1) : rnd(0.3, 0.62),
        color: bright ? REDF : Math.random() > 0.55 ? RED : REDD,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
  const [vx, vy] = newThumb(0.02, 0.06);
  return { x: cx, y: cy, vx, vy, retarget: rnd(160, 320), rot: rnd(0, Math.PI * 2), rotSpeed: rnd(-0.0016, 0.0016), r, pts };
}

export function initGalaxy(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0;
  let h = 0;
  let raf = 0;
  const time = { v: 0 };
  let mx = -1e4;
  let my = -1e4;
  let stars: Star[] = [];
  let galaxies: Galaxy[] = [];

  function seed(): void {
    const area = Math.max(1, w * h);
    const freeN = Math.round(clampV(area / 7800, 42, 84));
    const perN = Math.round(clampV(area / 4200, 36, 60));
    stars = Array.from({ length: freeN }, () => {
      const bright = Math.random() < 0.12;
      const [vx, vy] = newThumb(0.03, 0.15);
      return {
        x: rnd(0, w), y: rnd(0, h),
        vx, vy,
        retarget: rnd(60, 200),
        phase: Math.random() * Math.PI * 2,
        size: bright ? rnd(1.3, 2.2) : rnd(0.5, 1.2),
        op: bright ? rnd(0.8, 1) : rnd(0.2, 0.5),
        color: bright ? REDF : Math.random() > 0.55 ? RED : REDD,
      };
    });
    const R = Math.max(64, Math.min(w, h) * 0.2);
    galaxies = [
      makeGalaxy(w * 0.2, h * 0.64, R, perN),
      makeGalaxy(w * 0.8, h * 0.28, R * 0.82, Math.round(perN * 0.85)),
      makeGalaxy(w * 0.56, h * 0.84, R * 0.7, Math.round(perN * 0.72)),
    ];
  }

  function resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  const onMove = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; };
  document.addEventListener('pointermove', onMove);

  function step(): void {
    time.v += 0.006;
    for (const g of galaxies) {
      if (--g.retarget <= 0) {
        const [vx, vy] = newThumb(0.025, 0.075);
        g.vx = vx; g.vy = vy;
        g.retarget = rnd(150, 320);
      }
      g.x += g.vx;
      g.y += g.vy;
      g.rot += g.rotSpeed;
      const m = g.r * 0.55;
      if (g.x < -m) { g.x = -m; g.vx = Math.abs(g.vx); }
      if (g.x > w + m) { g.x = w + m; g.vx = -Math.abs(g.vx); }
      if (g.y < -m) { g.y = -m; g.vy = Math.abs(g.vy); }
      if (g.y > h + m) { g.y = h + m; g.vy = -Math.abs(g.vy); }
    }
    for (const s of stars) {
      if (--s.retarget <= 0) {
        const [vx, vy] = newThumb(0.03, 0.15);
        s.vx = vx; s.vy = vy;
        s.retarget = rnd(60, 200);
      }
      s.x += s.vx + Math.sin(time.v * 0.6 + s.phase) * 0.02;
      s.y += s.vy;
      if (s.x < 0) { s.x = 0; s.vx = Math.abs(s.vx); }
      if (s.x > w) { s.x = w; s.vx = -Math.abs(s.vx); }
      if (s.y < 0) { s.y = 0; s.vy = Math.abs(s.vy); }
      if (s.y > h) { s.y = h; s.vy = -Math.abs(s.vy); }
      const dx = s.x - mx, dy = s.y - my, d2 = dx * dx + dy * dy;
      if (d2 < 120 * 120) {
        const d = Math.sqrt(d2) || 1, f = (1 - d / 120) * 0.35;
        s.x -= (dx / d) * f;
        s.y -= (dy / d) * f;
      }
    }
  }

  function drawLines(g: Galaxy): void {
    const pts = g.pts;
    const n = pts.length;
    const conn = clampV(g.r * 0.34, 26, 62);
    const t1 = conn * 0.45, t2 = conn * 0.7, t3 = conn;
    const c1 = 'rgba(229, 72, 77, 0.16)';
    const c2 = 'rgba(169, 56, 61, 0.12)';
    const c3 = 'rgba(122, 31, 35, 0.09)';
    const cos = Math.cos(g.rot), sin = Math.sin(g.rot);
    ctx!.lineWidth = 1;
    const buckets: number[][] = [[], [], []]; // flat: ax, ay, bx, by
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const ax = g.x + a.dx * cos - a.dy * sin;
      const ay = g.y + a.dx * sin + a.dy * cos;
      for (let j = i + 1; j < n; j++) {
        const b = pts[j];
        const bx = g.x + b.dx * cos - b.dy * sin;
        const by = g.y + b.dx * sin + b.dy * cos;
        const dx = bx - ax, dy = by - ay;
        const dd = dx * dx + dy * dy;
        if (dd < t3 * t3) {
          buckets[dd < t1 * t1 ? 0 : dd < t2 * t2 ? 1 : 2].push(ax, ay, bx, by);
        }
      }
    }
    const colors = [c1, c2, c3];
    for (let k = 0; k < 3; k++) {
      const seg = buckets[k];
      if (!seg.length) continue;
      ctx!.strokeStyle = colors[k];
      ctx!.beginPath();
      for (let i = 0; i < seg.length; i += 4) {
        ctx!.moveTo(seg[i], seg[i + 1]);
        ctx!.lineTo(seg[i + 2], seg[i + 3]);
      }
      ctx!.stroke();
    }
  }

  function draw(): void {
    ctx!.clearRect(0, 0, w, h);
    if (!reduced) step();
    for (const g of galaxies) {
      drawLines(g);
      const cos = Math.cos(g.rot), sin = Math.sin(g.rot);
      for (const p of g.pts) {
        const x = g.x + p.dx * cos - p.dy * sin;
        const y = g.y + p.dx * sin + p.dy * cos;
        ctx!.globalAlpha = p.op * (reduced ? 1 : 0.75 + 0.35 * Math.sin(time.v * 2 + p.phase));
        ctx!.beginPath();
        ctx!.arc(x, y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgb(${p.color})`;
        ctx!.fill();
      }
    }
    for (const s of stars) {
      ctx!.globalAlpha = s.op * (reduced ? 1 : 0.8 + 0.3 * Math.sin(time.v * 2 + s.phase));
      ctx!.beginPath();
      ctx!.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx!.fillStyle = `rgb(${s.color})`;
      ctx!.fill();
    }
    ctx!.globalAlpha = 1;
  }

  function frame(): void {
    draw();
    if (!reduced) raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  draw();
  if (!reduced) raf = requestAnimationFrame(frame);
  (canvas as any).__destroy = () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    document.removeEventListener('pointermove', onMove);
  };
}