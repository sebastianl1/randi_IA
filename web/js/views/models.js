// RANDI — Vista Models: grilla de modelos con filtros, quants, notas S-F.
import * as api from '../api.js';
import * as c from '../compat.js';
import * as u from '../ui.js';

const USE_CASES = ['chat', 'code', 'reasoning', 'vision'];
const ARCH = ['dense', 'moe'];

export default async function modelsView(app, hw) {
  app.innerHTML = '';
  app.appendChild(u.el('h1', { class: 'page-title', text: 'Catálogo de modelos' }));
  app.appendChild(u.el('p', { class: 'page-sub', text: `${hw.gpu_name || hw.ram_gb + 'GB RAM' || 'dispositivo'} · explora y filtra por tu hardware.` }));

  const state = { useCase: 'all', arch: 'all', onlyRun: false, q: '', models: [], mapped: [] };

  // Cargar modelos
  try {
    state.models = await api.getModels();
  } catch (e) {
    app.appendChild(u.el('p', { class: 'error', text: 'No se pudieron cargar modelos: ' + e.message }));
    return;
  }

  // Pre-computar evaluacion local (mirror JS) para pintar grados sin esperar API
  state.mapped = state.models.map(m => ({
    model: m,
    ev: c.evaluateModel(m, hw),
    quants: c.makeQuants(Number(m.paramsBillions) || 0),
  }));

  // Toolbar filtros
  const filtros = u.el('div', { class: 'filters' });
  const selUse = u.el('select', {}, [u.el('option', { value: 'all', text: 'Caso de uso' })].concat(
    USE_CASES.map(x => u.el('option', { value: x, text: x.charAt(0).toUpperCase() + x.slice(1) }))));
  const selArch = u.el('select', {}, [u.el('option', { value: 'all', text: 'Arquitectura' })].concat(
    ARCH.map(x => u.el('option', { value: x, text: x === 'dense' ? 'Dense' : 'MoE' }))));
  const chkRun = u.el('label', { class: 'chk' }, [
    u.el('input', { type: 'checkbox' }),
    ' Solo los que corren en tu equipo',
  ]);
  const search = u.el('input', { type: 'search', placeholder: 'Buscar modelo…', class: 'search' });

  filtros.append(selUse, selArch, search, chkRun);
  app.appendChild(filtros);

  const grid = u.el('div', { class: 'model-grid' });
  app.appendChild(grid);

  function apply() {
    state.useCase = selUse.value;
    state.arch = selArch.value;
    state.onlyRun = chkRun.querySelector('input').checked;
    state.q = search.value.trim().toLowerCase();

    let rows = state.mapped.filter(({ model }) => {
      if (state.useCase !== 'all' && !model.useCase?.includes(state.useCase)) {
        if (model.type !== state.useCase) return false;
      }
      if (state.arch !== 'all' && model.architecture !== state.arch) return false;
      if (state.q && !(model.name + ' ' + model.id).toLowerCase().includes(state.q)) return false;
      if (state.onlyRun && state.mapped.find(x => x.model.id === model.id).ev.status === 'cannot-run') return false;
      return true;
    });
    // ordenar por data original (params)
    grid.innerHTML = '';
    rows.forEach(({ model, ev, quants }) => {
      grid.appendChild(modelCard(model, ev, quants, hw));
    });
    if (!rows.length) grid.appendChild(u.el('p', { class: 'empty', text: 'Sin resultados para ese filtro.' }));
  }

  selUse.addEventListener('change', apply);
  selArch.addEventListener('change', apply);
  search.addEventListener('input', apply);
  chkRun.querySelector('input').addEventListener('change', apply);

  apply();
}

function modelCard(model, ev, quants, hw) {
  const card = u.el('a', { class: 'model-card', href: `#/model/${encodeURIComponent(model.id)}` });
  const head = u.el('div', { class: 'mc-head' });
  head.append(u.el('span', { class: 'mc-provider', text: model.provider || '—' }));
  head.append(u.gradeBadge(ev.grade));
  card.appendChild(head);
  card.appendChild(u.el('h3', { class: 'mc-name', text: model.name }));
  card.appendChild(u.el('p', { class: 'mc-desc', text: model.desc || model.description || '' }));

  const meta = u.el('div', { class: 'mc-meta' });
  meta.append(u.el('span', { class: 'pill' }, `#${model.paramsBillions}B`));
  meta.append(u.el('span', { class: 'pill' }, `ctx ${fmtCtx(model.ctx)}`));
  meta.append(u.el('span', { class: 'pill' }, model.size));
  if (model.architecture === 'moe') meta.append(u.el('span', { class: 'pill moe' }, 'MoE'));
  card.appendChild(meta);

  card.appendChild(u.el('div', { class: 'mc-status ' + ev.status },
    u.el('span', {}, `${u.statusLabel(ev.status)} · ${ev.quant}`)));
  if (ev.toksPerSec) card.appendChild(u.el('span', { class: 'mc-toks', text: `≈${ev.toksPerSec} tok/s` }));

  card.appendChild(u.quantPills(quants));
  return card;
}

function fmtCtx(n) {
  if (!n) return '—';
  return n >= 1000 ? (n / 1000).toFixed(0) + 'K' : String(n);
}
