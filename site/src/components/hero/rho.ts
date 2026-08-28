// Glifo griego "Ρ" interactivo: sigue/brilla con el cursor.
const ACCENT = '229, 72, 77';

export function initRho(el: HTMLElement, zone?: HTMLElement): void {
  const area = zone || el.parentElement || document.body;
  const onMove = (e: PointerEvent) => {
    const r = area.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const k = Math.max(-26, Math.min(26, dx * 0.07));
    const kv = Math.max(-26, Math.min(26, dy * 0.06));
    el.style.transform = `translate(${k}px, ${kv}px)`;
    const dist = Math.hypot(dx, dy);
    const glow = Math.max(0, 1 - dist / 320);
    el.style.filter = `drop-shadow(0 0 ${16 + glow * 42}px rgba(${ACCENT}, ${0.3 + glow * 0.45}))`;
  };
  area.addEventListener('pointermove', onMove);
  (el as any).__destroy = () => area.removeEventListener('pointermove', onMove);
}