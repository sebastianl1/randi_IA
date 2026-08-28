// Fondo galaxia en toda la página (patrón del portfolio, con rojo RANDI).
// Canvas fijo full-viewport detrás del contenido: estrellas + nebulosas.
const RED = '229, 72, 77';
const REDD = '122, 31, 35';

export function initGalaxy(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0;
  let h = 0;
  let raf = 0;
  const time = { v: 0 };
  let mx = -1e4; // fuera de pantalla
  let my = -1e4;
  let stars: Array<{ x: number; y: number; vy: number; sway: number; phase: number; size: number; op: number; color: string }> = [];
  let neb: Array<{ x: number; y: number; r: number; vx: number; vy: number; a: number; phase: number }> = [];

  function seed(): void {
    const n = Math.min(72, Math.max(36, Math.floor(w / 24)));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vy: 0.12 + Math.random() * 0.2,
      sway: (Math.random() - 0.5) * 0.4,
      phase: Math.random() * Math.PI * 2,
      size: 0.8 + Math.random() * 1.6,
      op: 0.22 + Math.random() * 0.5,
      color: Math.random() > 0.55 ? RED : REDD,
    }));
    neb = Array.from({ length: 6 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: 60 + Math.random() * 90,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      a: 0.04 + Math.random() * 0.05,
      phase: Math.random() * Math.PI * 2,
    }));
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

  function nebula(x: number, y: number, r: number, color: string, a: number): void {
    const g = ctx!.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color}, ${a})`);
    g.addColorStop(1, `rgba(${color}, 0)`);
    ctx!.fillStyle = g;
    ctx!.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function frame(): void {
    ctx!.clearRect(0, 0, w, h);
    if (!reduced) {
      time.v += 0.005;
      for (const nb of neb) {
        nb.x += nb.vx; nb.y += nb.vy;
        if (nb.x < -nb.r) nb.x = w + nb.r;
        if (nb.x > w + nb.r) nb.x = -nb.r;
        if (nb.y < -nb.r) nb.y = h + nb.r;
        if (nb.y > h + nb.r) nb.y = -nb.r;
      }
    }
    for (const nb of neb) {
      nebula(nb.x, nb.y, nb.r, RED, nb.a * (reduced ? 1 : 0.8 + 0.4 * Math.sin(time.v * 2 + nb.phase)));
    }
    for (const s of stars) {
      if (!reduced) {
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