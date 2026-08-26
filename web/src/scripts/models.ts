// RANDI web — explorador de modelos (filtros, busqueda, 3 modos de vista).
import * as api from '../lib/api.js';
import * as c from '../lib/compat.js';
import * as cat from '../lib/catalog.js';
import * as u from '../lib/ui.js';
import type { CatalogModel } from '../lib/api.js';

type ViewMode = 'compact' | 'detail' | 'list';

interface Row { m: CatalogModel; ev: c.Eval }

let hw: c.Hw = {};
let rows: Row[] = [];
let mode: ViewMode = 'detail';

const grid = () => document.getElementById('grid')!;

function providerOptions(models: CatalogModel[]) {
  const sel = document.getElementById('fProvider') as HTMLSelectElement;
  const set = new Set<string>();
  models.forEach((m) => m.provider && set.add(m.provider));
  sel.innerHTML = '<option value="">Proveedor</option>' +
    [...set].sort().map((p) => `<option>${p}</option>`).join('');
}

function statusDot(ev: c.Eval): HTMLSpanElement {
  return u.el('span', { class: `status-dot sd-${ev.status}` });
}

function installBtn(m: CatalogModel) {
  const btn = u.el('button', { class: 'btn btn-primary text-xs !px-2.5 !py-1', text: m.installer === 'ollama' ? 'Instalar' : 'Guía' });
  const st = u.el('span', { class: 'text-xs text-muted' });
  if (m.installer !== 'ollama') {
    btn.addEventListener('click', () => {
      if (m.url) window.open(m.url, '_blank');
    });
    return u.el('span', { class: 'flex items-center gap-2' }, [btn, st]);
  }
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Instalando…';
    st.replaceChildren(u.spinner());
    try {
      const { jobId } = await api.installModel(m.id);
      await poll(jobId, st, btn);
    } catch (e: any) {
      btn.hidden = true; st.textContent = e?.message || 'Error';
    }
  });
  return u.el('span', { class: 'flex items-center gap-2' }, [btn, st]);
}

async function poll(jobId: string, st: HTMLElement, btn: HTMLButtonElement) {
  for (let i = 0; i < 600; i++) {
    await new Promise((r) => setTimeout(r, 1200));
    let j: any; try { j = await api.installStatus(jobId); } catch { continue; }
    if (j?.phase) st.textContent = (j.detail || j.phase).toString().slice(0, 60);
    if (j?.done) { st.textContent = '✓ ' + (j.detail || 'Listo'); btn.textContent = 'Instalado'; return; }
    if (j?.status === 'error') { btn.disabled = false; btn.textContent = 'Reintentar'; st.textContent = j.detail || 'Error'; return; }
  }
}

function card(row: Row, view: ViewMode): HTMLElement {
  const { m, ev } = row;
  if (view === 'list') {
    return u.el('div', { class: 'card p-3 flex flex-wrap items-center gap-3', style: 'grid-column:1/-1' }, [
      u.gradeBadge(ev.grade),
      u.el('span', { class: 'status-dot sd-' + ev.status }),
      u.el('a', { href: `/model/${encodeURIComponent(m.id)}`, class: 'font-semibold hover:text-accent min-w-0 truncate', text: m.name }),
      u.el('span', { class: 'text-xs text-muted mono', text: `${m.paramsBillions}B · ${m.provider}` }),
      u.el('span', { class: 'text-xs text-muted', text: m.installer === 'ollama' ? `q${ev.quant || '—'} ${ev.toksPerSec ? '· ' + ev.toksPerSec + ' tok/s' : ''}` : m.category || '' }),
      u.el('span', { class: 'ml-auto' }, [installBtn(m)]),
    ]);
  }
  const head = u.el('div', { class: 'flex items-center justify-between' }, [
    u.el('span', { class: 'text-xs text-muted', text: m.provider || '—' }),
    u.gradeBadge(ev.grade),
  ]);
  const meta = u.pills([
    `#${m.paramsBillions}B`,
    m.architecture === 'moe' ? ['MoE', 'moe'] : 'Dense',
    m.useCase?.[0] || m.type || '',
    m.size || '',
  ]);
  const statusLine = u.el('div', { class: 'flex items-center gap-2 text-xs' }, [
    statusDot(ev),
    u.el('span', { class: 'text-muted', text: c.statusLabel(ev.status) }),
    ev.toksPerSec ? u.el('span', { class: 'mono text-muted', text: `≈${ev.toksPerSec} tok/s` }) : u.el('span'),
    u.el('span', { class: 'mono text-muted ml-auto', text: `q${ev.quant}` }),
  ]);
  if (view === 'compact') {
    return u.el('a', { href: `/model/${encodeURIComponent(m.id)}`, class: 'card p-4 flex flex-col gap-2' }, [
      head,
      u.el('h3', { class: 'font-bold', text: m.name }),
      statusLine,
    ]);
  }
  return u.el('div', { class: 'card p-4 flex flex-col gap-2.5' }, [
    head,
    u.el('a', { href: `/model/${encodeURIComponent(m.id)}`, class: 'font-bold hover:text-accent transition-colors', text: m.name }),
    u.el('p', { class: 'text-sm text-muted line-clamp-2', text: m.desc || '' }),
    meta,
    statusLine,
    u.el('div', { class: 'mt-auto pt-1' }, [installBtn(m)]),
  ]);
}

function applyFilters() {
  const q = (document.getElementById('q') as HTMLInputElement).value.trim().toLowerCase();
  const useCase = (document.getElementById('fUseCase') as HTMLSelectElement).value;
  const provider = (document.getElementById('fProvider') as HTMLSelectElement).value;
  const onlyRun = (document.getElementById('fRun') as HTMLInputElement).checked;
  const tools = (document.getElementById('fML') as HTMLInputElement).checked;
  const think = (document.getElementById('fThink') as HTMLInputElement).checked;
  const moe = (document.getElementById('fMoe') as HTMLInputElement).checked;

  const list = rows.filter(({ m, ev }) => {
    if (useCase && !(m.useCase || []).includes(useCase) && m.type !== useCase && m.category !== useCase) return false;
    if (provider && m.provider !== provider) return false;
    if (onlyRun && ev.status === 'cannot-run') return false;
    if (tools && !m.tools) return false;
    if (think && !m.thinking) return false;
    if (moe && m.architecture !== 'moe') return false;
    if (q && !((m.name + ' ' + m.id + ' ' + (m.provider || '')).toLowerCase().includes(q))) return false;
    return true;
  });
  const g = grid();
  g.innerHTML = '';
  list.forEach((r) => g.appendChild(card(r, mode)));
  document.getElementById('empty')!.classList.toggle('hidden', list.length > 0);
  (document.getElementById('fCount')!).textContent = `${list.length} de ${rows.length}`;
}

export async function mount() {
  hw = await detectHw();
  let models: CatalogModel[] = [];
  try {
    models = await api.getModels({ media: true });
  } catch {
    models = [...cat.llmModels, ...cat.mediaModels];
  }
  providerOptions(models);
  rows = models.map((m) => ({ m, ev: c.evaluateModel(m, hw) }));

  // modos de vista
  const tabs = document.getElementById('viewTabs')!;
  const modes: Array<[ViewMode, string]> = [['compact', 'Compacta'], ['detail', 'Detalle'], ['list', 'Lista']];
  for (const [key, label] of modes) {
    const b = u.el('button', { class: 'px-3 py-1 text-sm rounded-md' + (key === mode ? ' bg-panel' : ' text-muted'), text: label });
    b.addEventListener('click', () => {
      mode = key;
      tabs.querySelectorAll('button').forEach((x) => { x.classList.toggle('bg-panel', x === b); x.classList.toggle('text-muted', x !== b); });
      applyFilters();
    });
    tabs.appendChild(b);
  }

  // atajos de teclado
  document.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (e.key === '/') { e.preventDefault(); (document.getElementById('q') as HTMLInputElement).focus(); }
    if (e.key === 'j' || e.key === 'k') {
      const links = Array.from(grid().querySelectorAll<HTMLElement>('[href^="/model/"]'));
      const idx = links.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'j' ? Math.min(idx + 1, links.length - 1) : Math.max(idx - 1, 0);
      links[next]?.focus();
      e.preventDefault();
    }
  });

  ['q', 'fUseCase', 'fProvider'].forEach((id) => document.getElementById(id)!.addEventListener('input', applyFilters));
  ['fRun', 'fML', 'fThink', 'fMoe'].forEach((id) => document.getElementById(id)!.addEventListener('change', applyFilters));
  applyFilters();
}

async function detectHw(): Promise<c.Hw> {
  return api.fastHardware();
}