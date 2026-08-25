// RANDI — Vista Home: deteccion de hardware + best picks por use case.
import * as api from '../api.js';
import * as u from '../ui.js';
import { GRADES } from '../compat.js';

const CASES = [
  { key: 'chat', label: 'Chat' },
  { key: 'code', label: 'Codificación' },
  { key: 'reasoning', label: 'Razonamiento' },
  { key: 'vision', label: 'Visión' },
];

export default async function homeView(app, hw) {
  app.innerHTML = '';
  app.appendChild(u.el('h1', { class: 'hero-title' }, ['Ejecuta IA local en tu ', u.el('span', { class: 'grad' }, 'dispositivo')]));
  app.appendChild(u.el('p', { class: 'hero-sub', text: 'Detectamos tu hardware y te recomendamos los modelos que realmente corren en tu equipo.' }));

  // Panel hardware
  const hwPanel = u.el('div', { class: 'hw-panel' });
  hwPanel.append(
    u.el('div', { class: 'hw-item' }, u.el('b', { text: String(hw.ram_gb ? hw.ram_gb + 'GB' : '—') }), u.el('span', { text: 'RAM' })),
    u.el('div', { class: 'hw-item' }, u.el('b', { text: hw.gpu_name || '—' }), u.el('span', { text: 'GPU' })),
    hw.gpu_vram_gb ? u.el('div', { class: 'hw-item' }, u.el('b', { text: hw.gpu_vram_gb + 'GB' }), u.el('span', { text: 'VRAM' })) : u.el('div', { class: 'hw-item' }, u.el('b', { text: String(hw.cpu_cores || '—') }), u.el('span', { text: 'Núcleos' })),
    u.el('div', { class: 'hw-item' }, u.el('b', { text: hw.platform || '—' }), u.el('span', { text: 'Plataforma' })),
  );
  app.appendChild(hwPanel);

  // Best picks por use case
  const h2 = u.el('h2', { class: 'section-title', text: 'Recomendados para tu equipo' });
  app.appendChild(h2);

  for (const c of CASES) {
    const box = u.el('section', { class: 'bestpick' });
    box.appendChild(u.el('h3', { class: 'bp-title', text: c.label }));
    try {
      const res = await api.recommend({ hardware: hw, useCase: c.key, limit: 4 });
      const recs = res.recommendations || [];
      const rows = u.el('div', { class: 'bp-list' });
      if (!recs.length) rows.appendChild(u.el('p', { class: 'empty', text: 'Nada cómodo en esta categoría con tu hardware.' }));
      recs.forEach(r => {
        rows.appendChild(u.el('a', { class: 'bp-row', href: `#/model/${encodeURIComponent(r.modelId)}` }, [
          u.gradeBadge(r.grade),
          u.el('span', { class: 'bp-name', text: r.name }),
          u.el('span', { class: 'bp-quant', text: r.quantization }),
          r.tokensPerSecond ? u.el('span', { class: 'bp-toks', text: `≈${r.tokensPerSecond} tok/s` }) : u.el('span', { class: 'bp-toks', text: '' }),
        ]));
      });
      box.appendChild(rows);
    } catch (e) {
      box.appendChild(u.el('p', { class: 'error', text: 'Error: ' + e.message }));
    }
    app.appendChild(box);
  }
}
