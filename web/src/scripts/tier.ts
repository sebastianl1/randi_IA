// RANDI web — tier list S-F de los modelos frente al hardware detectado.
import * as api from '../lib/api.js';
import * as c from '../lib/compat.js';
import * as cat from '../lib/catalog.js';
import * as u from '../lib/ui.js';
import type { CatalogModel } from '../lib/api.js';

const ORDER = ['S', 'A', 'B', 'C', 'D', 'F', '?'];
const COLOR: Record<string, string> = {
  S: '#22c55e', A: '#4ade80', B: '#a3e635', C: '#f59e0b', D: '#f97316', F: '#ef4444', '?': '#56565f',
};

export async function mount() {
  const hw = await api.fastHardware();
  let models: CatalogModel[] = [];
  try { models = await api.getModels({ media: true }); } catch { models = [...cat.llmModels, ...cat.mediaModels]; }

  const buckets: Record<string, CatalogModel[]> = Object.fromEntries(ORDER.map((g) => [g, []]));
  for (const m of models) {
    const ev = c.evaluateModel(m, hw);
    buckets[ev.grade]?.push(m);
  }
  for (const g of ORDER) {
    const tbody = document.querySelector<HTMLElement>(`[data-tbody="${g}"]`);
    if (!tbody) continue;
    tbody.innerHTML = '';
    buckets[g].forEach((m) => {
      const ev = c.evaluateModel(m, hw);
      tbody.appendChild(u.el('a', { href: `/model/${encodeURIComponent(m.id)}`, class: 'card p-3 flex flex-col gap-1 hover:border-accent transition-colors' }, [
        u.el('span', { class: 'font-semibold text-sm', text: m.name }),
        u.el('span', { class: 'text-xs text-muted', text: `${m.paramsBillions}B · ${m.provider} · q${ev.quant}` }),
      ]));
    });
  }
  const total = models.length;
  const ranks = ORDER.map((g) => `${g}: ${buckets[g].length}`).join(' · ');
  const state = document.getElementById('state');
  if (state) state.textContent = `${total} modelos evaluados`;

  const btn = document.getElementById('exportBtn');
  btn?.addEventListener('click', () => {
    const lines: string[] = ['RANDI Tier List — ' + new Date().toISOString().slice(0, 10)];
    for (const g of ORDER) {
      if (!buckets[g].length && g !== '?') continue;
      lines.push(`\n[${g}]`);
      buckets[g].forEach((m) => lines.push(`  ${m.name} (${m.paramsBillions}B, ${m.provider})`));
    }
    navigator.clipboard?.writeText(lines.join('\n'));
    btn.textContent = '✓ Copiado';
    setTimeout(() => { btn.textContent = 'Copiar como texto'; }, 1500);
  });
}