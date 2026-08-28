// Fondo de fondo: galaxias espirales + estrellas sueltas (rojo RANDI).
// Canvas fijo full-viewport, detrás del contenido, con atracción suave al cursor.
const RED = '229, 72, 77';
const REDD = '122, 31, 35';

interface Star { x: number; y: number; vy: number; sway: number; phase: number; size: number; op: number; color: string }
interface ArmStar { dx: number; dy: number; size: number; op: number; color: string; phase: number }
interface Galaxy { x: number; y: number; vx: number; vy: number; rot: number; rotSpeed: number; arms: ArmStar[][]; r: number }

function makeGalaxy(cx: number, cy: number, r: number, armsCount = 2, per = 22): Galaxy {
  const wind = 2.6;
  const arms: ArmStar[][] = [];
  for (let a = 0; a < armsCount; a++) {
    const armBase = (a * Math.PI * 2) / armsCount;
    const list: ArmStar[] = [];
    for (let i = 0; i < per; i++) {
      const t = 0.25 + i / per;
      const radius = r * t;
      const ang = armBase + t * wind + Math.sin(t * 9) * 0.22;
      const jitter = r * 0.02;
      list.push({
        dx: Math.cos(ang) * radius + (Math.random() - 0.5) * jitter,
        dy: Math.sin(ang) * radius + (Math.random() - 0.5) * jitter,
        size: 0.7 + Math.random() * 2.0,
        op: 0.28 + Math.random() * 0.45,
        color: Math.random() > 0.5 ? RED : REDD,
        phase: Math.random() * Math.PI * 2,
      });
    }
    arms.push(list);
  }
  return {
    x: cx, y: cy, r,
    vx: (Math.random() - 0.5) * 0.06,
    vy: (Math.random() - 0.5) * 0.06,
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.0036,
    arms,
  };
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
  const time0 = performance.now();

  function seed(): void {
    const n = Math.min(150, Math.max(90, Math.floor(w / 12)));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vy: 0.1 + Math.random() * 0.22,
      sway: (Math.random() - 0.5) * 0.4,
      phase: Math.random() * Math.PI * 2,
      size: 0.6 + Math.random() * 1.2,
      op: 0.2 + Math.random() * 0.45,
      color: Math.random() > 0.5 ? RED : REDD,
    }));
    const R = Math.max(70, Math.min(w, h) * 0.2);
    galaxies = [
      makeGalaxy(w * 0.22, h * 0.65, R),
      makeGalaxy(w * 0.82, h * 0.3, R * 0.8),
      makeGalaxy(w * 0.58, h * 0.85, R * 0.7),
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
  void time0;

  function frame(): void {
    ctx!.clearRect(0, 0, w, h);
    if (!reduced) {
      time.v += 0.005;
      for (const g of galaxies) {
        g.x += g.vx; g.y += g.vy; g.rot += g.rotSpeed;
        if (g.x < -g.r) g.x = w + g.r;
        if (g.x > w + g.r) g.x = -g.r;
        if (g.y < -g.r) g.y = h + g.r;
        if (g.y > h + g.r) g.y = -g.r;
      }
      for (const s of stars) {
        s.y -= s.vy;
        s.x += Math.sin(time.v + s.phase) * s.sway;
        if (s.y < -8) { s.y = h + 8; s.x = Math.random() * w; }
        const dx = s.x - mx, dy = s.y - my, d2 = dx * dx + dy * dy;
        if (d2 < 120 * 120) {
          const d = Math.sqrt(d2) || 1, f = (1 - d / 120) * 0.3;
          s.x -= (dx / d) * f;
          s.y -= (dy / d) * f;
        }
      }
    }
    // Galaxias espirales (brazos de estrellas en varias formas/tamaños)
    for (const g of galaxies) {
      const cos = Math.cos(g.rot), sin = Math.sin(g.rot);
      for (const arm of g.arms) {
        for (const p of arm) {
          const x = g.x + p.dx * cos - p.dy * sin;
          const y = g.y + p.dx * sin + p.dy * cos;
          ctx!.globalAlpha = p.op * (reduced ? 1 : 0.75 + 0.35 * Math.sin(time.v * 2 + p.phase));
          ctx!.beginPath();
          ctx!.arc(x, y, p.size, 0, Math.PI * 2);
          ctx!.fillStyle = `rgb(${p.color})`;
          ctx!.fill();
        }
      }
    }
    // Estrellas sueltas
    for (const s of stars) {
      ctx!.globalAlpha = s.op * (reduced ? 1 : 0.85 + 0.3 * Math.sin(time.v * 2 + s.phase));
      ctx!.beginPath();
      ctx!.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx!.fillStyle = `rgb(${s.color})`;
      ctx!.fill();
    }
    ctx!.globalAlpha = 1;
    if (!reduced) raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  if (!reduced) raf = requestAnimationFrame(frame);
  (canvas as any).__destroy = () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    document.removeEventListener('pointermove', onMove);
  };
}