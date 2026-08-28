// Constelación de partículas (tinte rojo translúcido) para el hero de la landing.
const ACCENT = '229, 72, 77';

export function initParticles(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let w = 0;
  let h = 0;
  let raf = 0;
  let pts: Array<{ x: number; y: number; vx: number; vy: number }> = [];
  let mx = -1;
  let my = -1;

  function spawn(): void {
    const n = Math.min(70, Math.max(24, Math.floor(w / 22)));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
    }));
  }
  function resize(): void {
    const r = canvas.parentElement?.getBoundingClientRect();
    w = canvas.width = r ? r.width : window.innerWidth;
    h = canvas.height = r ? Math.min(r.height, 320) : 220;
    spawn();
  }
  function onMove(e: PointerEvent): void {
    const r = canvas.getBoundingClientRect();
    mx = e.clientX - r.left;
    my = e.clientY - r.top;
  }
  function frame(): void {
    ctx!.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      if (mx >= 0) {
        const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
        if (d2 < 120 * 120) {
          const d = Math.sqrt(d2) || 1, force = (120 - d) / 120;
          p.x += (dx / d) * force; p.y += (dy / d) * force;
        }
      }
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(${ACCENT}, .5)`;
      ctx!.fill();
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < 90 * 90) {
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.strokeStyle = `rgba(${ACCENT}, ${0.24 * (1 - d2 / (90 * 90))})`;
          ctx!.stroke();
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }
  document.addEventListener('pointermove', onMove);
  window.addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(frame);
  (canvas as any).__destroy = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    document.removeEventListener('pointermove', onMove);
  };
}