// RANDI — utilidades de UI compartidas entre vistas.
import { GRADES } from './compat.js';

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function gradeBadge(grade) {
  const g = GRADES[grade] || GRADES['?'];
  const b = el('span', { class: 'grade', style: `--grade-color:${g.color}` }, grade);
  b.title = g.label;
  return b;
}

export function quantPills(quants) {
  return el('div', { class: 'quants' },
    quants.map(q => el('span', { class: 'quant' }, q.name)));
}

export function gb(n) {
  if (n == null) return '—';
  return n >= 1 ? n.toFixed(1) + 'GB' : Math.round(n * 1024) + 'MB';
}

export function statusLabel(s) {
  return ({ 'can-run': 'Cómodo', 'tight': 'Ajustado', 'can-run-slow': 'Lento (CPU)', 'cannot-run': 'No corre', 'unknown': 'Desconocido' })[s] || s;
}

export function spinner() {
  return el('span', { class: 'spinner' });
}
