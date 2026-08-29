// Catálogo de modelos: carrusel paginado (4 columnas × 2 filas por página)
// con botones laterales, búsqueda por texto y filtro por familia.
// Al hacer clic en una tarjeta se abre la ficha en pestaña nueva.
interface CatModel {
  id: string; slug: string; name: string; size: string | null;
  params: number | null; arch: string | null; family: string | null;
  provider: string | null; useCase: string[];
}

const PER = 8; // 4 columnas × 2 filas

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
      for (const m of filtered.slice(start, start + PER)) list.appendChild(card(m));
    }
    const tp = totalPages();
    pageEl.textContent = `${L.page} ${page + 1} / ${tp}`;
    prev.disabled = page <= 0;
    next.disabled = page >= tp - 1;
    status.textContent = `${filtered.length} ${L.shown}`;
    list.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function card(m: CatModel): HTMLElement {
    const href = `${base}${lang === 'en' ? 'en/' : ''}model/${m.slug}`;
    const a = document.createElement('a');
    a.className = 'mc-card';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noreferrer';
    const head = document.createElement('div');
    head.className = 'mc-head';
    if (m.params != null) {
      const p = document.createElement('span');
      p.className = 'mc-params';
      p.textContent = `#${m.params}B`;
      head.appendChild(p);
    }
    if (m.arch) {
      const ar = document.createElement('span');
      ar.className = 'mc-arch';
      ar.textContent = m.arch;
      head.appendChild(ar);
    }
    const h = document.createElement('div');
    h.className = 'mc-name';
    h.textContent = m.name;
    const meta = document.createElement('div');
    meta.className = 'mc-meta';
    meta.textContent = [m.family, m.provider].filter(Boolean).join(' · ');
    a.appendChild(head);
    a.appendChild(h);
    a.appendChild(meta);
    if (m.useCase && m.useCase.length) {
      const u = document.createElement('div');
      u.className = 'mc-use';
      for (const uc of m.useCase.slice(0, 3)) {
        const s = document.createElement('span');
        s.textContent = uc;
        u.appendChild(s);
      }
      a.appendChild(u);
    }
    const foot = document.createElement('div');
    foot.className = 'mc-foot';
    const sz = document.createElement('span');
    sz.textContent = m.size || '';
    foot.appendChild(sz);
    const go = document.createElement('span');
    go.textContent = '↗';
    foot.appendChild(go);
    a.appendChild(foot);
    return a;
  }

  input.addEventListener('input', () => apply());
  prev.addEventListener('click', () => { if (page > 0) { page -= 1; render(); } });
  next.addEventListener('click', () => { if (page < totalPages() - 1) { page += 1; render(); } });

  await load();
}