// Listado de modelos con scroll infinito, búsqueda por texto y filtro por
// familia. Al hacer click en una tarjeta se abre la ficha en pestaña nueva.
interface CatModel {
  id: string; slug: string; name: string; size: string | null;
  params: number | null; arch: string | null; family: string | null;
  provider: string | null; useCase: string[];
}

const PAGE = 18;

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
    more: es ? 'Cargar más' : 'Load more',
    back: es ? 'Ver catálogo completo' : 'See full catalog',
  };

  const input = root.querySelector<HTMLInputElement>('[data-mc-q]');
  const chips = root.querySelector<HTMLElement>('[data-mc-families]');
  const list = root.querySelector<HTMLElement>('[data-mc-list]');
  const sentinel = root.querySelector<HTMLElement>('[data-mc-sentinel]');
  const status = root.querySelector<HTMLElement>('[data-mc-status]');
  const empty = root.querySelector<HTMLElement>('[data-mc-empty]');
  if (!input || !chips || !list || !sentinel || !status || !empty) return;

  let all: CatModel[] = [];
  let filtered: CatModel[] = [];
  let fam: string | null = null;
  let shown = 0;
  let busy = false;

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
      return b;
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
    shown = 0;
    const was = chips.querySelector('.mc-chip.on');
    list.innerHTML = '';
    empty.classList.add('hidden');
    status.textContent = `${filtered.length} ${L.shown}`;
    renderChunk();
    if (was) void was;
  }

  function renderChunk(): void {
    const end = Math.min(shown + PAGE, filtered.length);
    const frag = document.createDocumentFragment();
    for (let i = shown; i < end; i++) frag.appendChild(card(filtered[i], base, lang));
    list.appendChild(frag);
    shown = end;
    if (shown >= filtered.length) list.appendChild(endMarker());
    busy = false;
  }

  function endMarker(): HTMLElement {
    const p = document.createElement('p');
    p.className = 'mc-end';
    p.textContent = filtered.length ? `— ${filtered.length} ${L.shown} —` : L.empty;
    return p;
  }

  function card(m: CatModel, base: string, lang: 'es' | 'en'): HTMLElement {
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

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && shown < filtered.length && !busy) {
        busy = true;
        renderChunk();
      }
    }, { rootMargin: '300px' });
    io.observe(sentinel);
  } else {
    const btn = document.createElement('button');
    btn.className = 'btn btn-dark text-xs';
    btn.textContent = L.more;
    btn.addEventListener('click', () => renderChunk());
    sentinel.replaceWith(btn);
  }

  await load();
}