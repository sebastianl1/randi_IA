// Catálogo de modelos: filas estilo "detección" (badge de color por tamaño)
// paginadas con carrusel (‹ ›), buscador y filtro por familia.
// Al hacer clic se abre la ficha en pestaña nueva.
interface CatModel {
  id: string; slug: string; name: string; size: string | null;
  params: number | null; arch: string | null; family: string | null;
  provider: string | null; useCase: string[];
}

const PER = 12; // 12 filas por página (2 columnas × 6)

// Badge por tamaño: S=super ligero … F=pesado (paleta de grados).
function bandOf(params: number | null): { g: string; c: string } {
  const p = params ?? 99;
  if (p <= 1.5) return { g: 'S', c: '#22c55e' };
  if (p <= 4) return { g: 'A', c: '#4ade80' };
  if (p <= 8) return { g: 'B', c: '#a3e635' };
  if (p <= 14) return { g: 'C', c: '#f59e0b' };
  if (p <= 32) return { g: 'D', c: '#f97316' };
  return { g: 'F', c: '#ef4444' };
}

export async function mountCatalog(lang: 'es' | 'en'): Promise<void> {
  const root = document.getElementById('models');
  if (!root) return;
  const base = import.meta.env.BASE_URL || '/';
  const es = lang === 'es';
  const L = {
    q: es ? 'Buscar modelo…' : 'Search models…',
    all: es ? 'Todos' : 'All',
    empty: es ? 'Sin resultados para esa búsqueda.' : 'No results for that search.',
    shown: es ? 'modelos' : 'models',
    page: es ? 'página' : 'page',
  };

  const input = root.querySelector<HTMLInputElement>('[data-mc-q]');
  const chips = root.querySelector<HTMLElement>('[data-mc-families]');
  const list = root.querySelector<HTMLElement>('[data-mc-list]');
  const prev = root.querySelector<HTMLButtonElement>('[data-mc-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-mc-next]');
  const pageEl = root.querySelector<HTMLElement>('[data-mc-page]');
  const status = root.querySelector<HTMLElement>('[data-mc-status]');
  const empty = root.querySelector<HTMLElement>('[data-mc-empty]');
  if (!input || !chips || !list || !prev || !next || !pageEl || !status || !empty) return;

  let all: CatModel[] = [];
  let filtered: CatModel[] = [];
  let fam: string | null = null;
  let page = 0;

  function totalPages(): number { return Math.max(1, Math.ceil(filtered.length / PER)); }

  async function load(): Promise<void> {
    try {
      const res = await fetch(`${base}catalog.json`, { cache: 'no-store' });
      all = await res.json();
      buildChips();
      apply();
    } catch {
      empty.classList.remove('hidden');
    }
  }

  function buildChips(): void {
    const counts = new Map<string, number>();
    for (const m of all) if (m.family) counts.set(m.family, (counts.get(m.family) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9);
    chips.innerHTML = '';
    const btn = (label: string, active: boolean, onClick: () => void) => {
      const b = document.createElement('button');
      b.className = `mc-chip${active ? ' on' : ''}`;
      b.textContent = label;
      b.addEventListener('click', onClick);
      chips.appendChild(b);
    };
    btn(L.all, fam === null, () => { fam = null; apply(); });
    for (const [f, c] of top) {
      btn(`${f} · ${c}`, fam === f, () => { fam = fam === f ? null : f; apply(); });
    }
  }

  function apply(): void {
    const q = input.value.trim().toLowerCase();
    filtered = all.filter((m) => {
      if (fam && m.family !== fam) return false;
      if (!q) return true;
      const hay = [m.name, m.id, m.family, m.arch, m.provider, ...(m.useCase || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
    page = 0;
    empty.classList.add('hidden');
    render();
  }

  function render(): void {
    list.innerHTML = '';
    if (!filtered.length) {
      empty.classList.remove('hidden');
    } else {
      const start = page * PER;
      for (const m of filtered.slice(start, start + PER)) list.appendChild(row(m));
    }
    const tp = totalPages();
    pageEl.textContent = `${L.page} ${page + 1} / ${tp}`;
    prev.disabled = page <= 0;
    next.disabled = page >= tp - 1;
    status.textContent = `${filtered.length} ${L.shown}`;
    list.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function row(m: CatModel): HTMLElement {
    const href = `${base}${lang === 'en' ? 'en/' : ''}model/${m.slug}`;
    const a = document.createElement('a');
    a.className = 'mc-row';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noreferrer';

    const b = bandOf(m.params);
    const badge = document.createElement('span');
    badge.className = 'grade';
    badge.style.setProperty('--grade-color', b.c);
    badge.textContent = b.g;
    a.appendChild(badge);

    const mid = document.createElement('span');
    mid.className = 'mc-mid';
    const name = document.createElement('span');
    name.className = 'mc-name';
    name.textContent = m.name;
    const sub = document.createElement('span');
    sub.className = 'mc-sub';
    const label = m.useCase && m.useCase.length ? m.useCase.join(' · ') : [m.family, m.arch].filter(Boolean).join(' · ');
    sub.textContent = label || '—';
    mid.appendChild(name);
    mid.appendChild(sub);
    a.appendChild(mid);

    const right = document.createElement('span');
    right.className = 'mc-right';
    const sz = document.createElement('span');
    sz.className = 'mc-size';
    sz.textContent = m.size ? `${m.size}` : (m.params != null ? `#${m.params}B` : '');
    right.appendChild(sz);
    const go = document.createElement('span');
    go.className = 'mc-go';
    go.textContent = '↗';
    right.appendChild(go);
    a.appendChild(right);
    return a;
  }

  input.addEventListener('input', () => apply());
  prev.addEventListener('click', () => { if (page > 0) { page -= 1; render(); } });
  next.addEventListener('click', () => { if (page < totalPages() - 1) { page += 1; render(); } });

  await load();
}