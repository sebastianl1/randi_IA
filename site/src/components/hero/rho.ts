// Glifo griego "Ρ" interactivo: sigue/brilla con el cursor (listener global,
// porque la capa de fondo tiene pointer-events:none).
const ACCENT = '255, 59, 77';

export function initRho(el: HTMLElement, zone?: HTMLElement): void {
  const area = zone || document;
  const onMove = (e: PointerEvent) => {
    const r = area === document
      ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
      : (area.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 });
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const k = Math.max(-16, Math.min(16, dx * 0.05));
    const kv = Math.max(-16, Math.min(16, dy * 0.05));
    el.style.transform = `translate(calc(-50% + ${k}px), calc(-50% + ${kv}px))`;
    const dist = Math.hypot(dx, dy);
    const glow = Math.max(0, 1 - dist / 380);
    el.style.filter = `drop-shadow(0 0 ${12 + glow * 30}px rgba(${ACCENT}, ${0.24 + glow * 0.3}))`;
  };
  (area as HTMLElement).addEventListener?.('pointermove', onMove);
  (el as any).__destroy = () => (area as HTMLElement).removeEventListener?.('pointermove', onMove);
}