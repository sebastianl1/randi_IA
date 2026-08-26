// RANDI web — comparador de dos modelos por hardware.
import * as api from '../lib/api.js';
import * as c from '../lib/compat.js';
import { findModel } from '../lib/catalog.js';
import * as u from '../lib/ui.js';

export async function mount() {
  let hw = null;
  try { hw = await api.getHardware(); } catch {
    const { detectHardware } = await import('../lib/hardware.js');
    hw = await detectHardware();
  }
  const a = document.getElementById('a') as HTMLSelectElement;
  const b = document.getElementById('b') as HTMLSelectElement;
  const box = document.getElementById('cmp');
  const state = document.getElementById('cmpState');

  function render() {
    const ma = findModel(a.value);
    const mb = findModel(b.value);
    if (!ma || !mb) { state!.textContent = 'Seleccioná dos modelos.'; box!.innerHTML = ''; return; }
    state!.textContent = `Resultado para tu equipo: ${hw?.gpu_name || hw?.ram_gb + 'GB RAM' || 'desconocido'}`;
    box!.innerHTML = '';
    box!.appendChild(panel(ma, hw));
    box!.appendChild(panel(mb, hw));
  }

  function panel(m: any, hw: any) {
    const ev = c.evaluateModel(m, hw);
    const req = c.requiredHardware(m, ev.quant);
    const rows: Array<[string, string]> = [
      ['Estado', c.statusLabel(ev.status)],
      ['Cuantización', `q${ev.quant}`],
      ['Velocidad', ev.toksPerSec ? `≈${ev.toksPerSec} tok/s` : '—'],
      ['VRAM requerida', `${req.vramRequiredGb} GB`],
      ['GPU recomendada', req.gpuClass],
      ['RAM total', `${req.systemRamTotalGb} GB`],
      ['Score', String(ev.score)],
    ];
    return u.el('div', { class: 'card p-5 flex flex-col gap-3' }, [
      u.el('div', { class: 'flex items-center justify-between gap-2' }, [
        u.el('a', { href: `/model/${encodeURIComponent(m.id)}`, class: 'font-bold text-lg hover:text-accent', text: m.name }),
        u.gradeBadge(ev.grade),
      ]),
      u.el('p', { class: 'text-sm text-muted', text: m.desc || '' }),
      u.el('div', { class: 'ml-3' },
        rows.map(([k, v]) => u.el('div', { class: 'flex justify-between gap-4 py-0.5 border-b border-line/40 text-sm' }, [
          u.el('span', { class: 'text-muted', text: k }), u.el('span', { class: 'font-semibold text-right', text: v }),
        ]))),
    ]);
  }

  a.addEventListener('change', render);
  b.addEventListener('change', render);
  a.value = 'qwen3:8b';
  b.value = 'deepseek-r1:7b';
  if (Array.from(a.options).length) render();
}