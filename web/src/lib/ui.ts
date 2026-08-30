// RANDI web — utilidades DOM compartidas (sin framework).
import { GRADES } from './compat.js';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag) as HTMLElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k in node) {
      (node as any)[k] = v;
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function gradeBadge(grade: string): HTMLSpanElement {
  const g = GRADES[grade] || GRADES['?'];
  const b = el('span', { class: 'grade', style: `--grade-color:${g.color}`, title: g.label, text: grade });
  return b;
}

export function pills(items: Array<string | [string, string?]>): HTMLSpanElement {
  return el('span', { class: 'inline-flex flex-wrap gap-1.5' },
    items.map((it) => {
      const [text, name] = Array.isArray(it) ? it : [it, undefined];
      return el('span', { class: `pill${name === 'moe' ? ' text-accent-2 border-accent-2/40' : ''}`, text });
    }));
}

export function fmtCtx(n?: number): string {
  if (!n) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);
}

export function spinner(): HTMLSpanElement {
  const s = el('span', { class: 'inline-block h-4 w-4 rounded-full border-2 border-line border-t-accent animate-spin' });
  return s;
}

export function fmtTs(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n * 100) / 100}s`;
}