// RANDI — Vista detalle de modelo: quants + compatibilidad por tu hardware.
import * as api from '../api.js';
import * as c from '../compat.js';
import * as u from '../ui.js';

export default async function modelView(app, hw, id) {
  app.innerHTML = '';
  app.appendChild(u.el('a', { class: 'back', href: '#/models', text: '← Volver' }));

  let model = null, quants = [];
  try {
    const detail = await api.getModelDetail(id);
    model = detail.model;
    quants = detail.quants || c.makeQuants(Number(model?.paramsBillions) || 0);
  } catch (e) {
    app.appendChild(u.el('p', { class: 'error', text: 'No se pudo cargar el modelo: ' + e.message }));
    return;
  }

  app.appendChild(u.el('h1', { class: 'page-title', text: model.name }));
  const meta = u.el('div', { class: 'model-meta' });
  meta.append(
    u.el('span', { class: 'pill' }, `#${model.paramsBillions}B`),
    model.architecture === 'moe' ? u.el('span', { class: 'pill moe', text: 'MoE' }) : u.el('span', { class: 'pill', text: 'Dense' }),
    u.el('span', { class: 'pill' }, model.provider || ''),
    u.el('span', { class: 'pill' }, model.license || ''),
  );
  app.appendChild(meta);
  if (model.desc || model.description) app.appendChild(u.el('p', { class: 'model-desc', text: model.desc || model.description }));

  // Instalar
  const install = u.el('div', { class: 'install-box' });
  install.append(u.el('code', { class: 'cmd' }, `randi pull ${model.ollamaId || model.id}`));
  app.appendChild(install);

  // Tabla de quants con evaluacion local por hardware
  app.appendChild(u.el('h2', { class: 'section-title', text: 'Compatibilidad por cuantización' }));
  const table = u.el('table', { class: 'quant-table' });
  const thead = u.el('thead', {}, u.el('tr', {}, [
    u.el('th', { text: 'Quant' }), u.el('th', { text: 'VRAM' }), u.el('th', { text: 'Disco' }),
    u.el('th', { text: 'Estado' }), u.el('th', { text: 'Nota' }),
  ]));
  table.appendChild(thead);
  const tbody = u.el('tbody');
  for (const q of quants) {
    const ev = c.evaluateModel({ ...model, paramsBillions: model.paramsBillions }, hw);
    const status = c.evaluateStatus(q.vramGB, hw);
    const ws = c.workingSet(q.vramGB, model);
    const toks = c.estimateTokensPerSecond(ws, hw);
    const score = c.computeScore(status, toks, Number(model.paramsBillions) || 0, c.memPercent(q.vramGB, hw));
    const grade = c.scoreToGrade(score, status);
    const tr = u.el('tr', {}, [
      u.el('td', { class: 'quant-cell' }, u.el('b', { text: q.name })),
      u.el('td', {}, u.gb(q.vramGB)),
      u.el('td', {}, u.gb(q.diskGB)),
      u.el('td', { class: 'status-' + status }, u.statusLabel(status)),
      u.el('td', {}, u.gradeBadge(grade)),
    ]);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  app.appendChild(table);
}
