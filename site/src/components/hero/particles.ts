// Constelación de partículas (rojo translúcido) con atracción suave al cursor.
// Canvas nítido (devicePixelRatio) y tamaño contenido, sin estirar.
const ACCENT = '229, 72, 77';

export function initParticles(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let w = 0;
  let h = 0;
  let raf = 0;
  let pts: Array<{ x: number; y: number; vx: number; vy: number }> = [];
  let mx = -9999; // fuera de pantalla
  let my = -9999;

  function spawn(): void {
    const n = Math.min(120, Math.max(50, Math.floor(w / 14)));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
    }));
  }
  function resize(): void {
    const r = canvas.parentElement?.getBoundingClientRect();
    const cw = r ? r.width : window.innerWidth;
    const ch = r ? Math.min(r.height, 300) : 220;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = cw; h = ch;
    canvas.width = Math.max(1, Math.round(cw * dpr));
    canvas.height = Math.max(1, Math.round(ch * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    spawn();
  }
  const onMove = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; };
  document.addEventListener('pointermove', onMove);

  function frame(): void {
    ctx!.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      // atracción suave hacia el cursor
      const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
      if (d2 < 170 * 170) {
        const d = Math.sqrt(d2) || 1, force = (1 - d / 170) * 0.35;
        p.x -= (dx / d) * force;
        p.y -= (dy / d) * force;
      }
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, 1.0, 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(${ACCENT}, .55)`;
      ctx!.fill();
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < 70 * 70) {
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.strokeStyle = `rgba(${ACCENT}, ${0.18 * (1 - d2 / (70 * 70))})`;
          ctx!.stroke();
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(frame);
  (canvas as any).__destroy = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    document.removeEventListener('pointermove', onMove);
  };
}