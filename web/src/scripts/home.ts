// RANDI web — onboarding: detecta hardware, recomienda y permite instalar.
import * as api from '../lib/api.js';
import * as c from '../lib/compat.js';
import { hardwareProfile, detectHardware } from '../lib/hardware.js';
import { findModel, llmModels, mediaModels } from '../lib/catalog.js';
import { el, gradeBadge, spinner, fmtCtx } from '../lib/ui.js';
import type { CatalogModel, Hw } from '../lib/api.js';

let hw: Hw | null = null;

function scanState(): HTMLSpanElement {
  const s = el('span', {}, [spinner(), ' Analizando hardware y modelos…']);
  return s;
}

async function evaluateSet(models: CatalogModel[], limit: number) {
  const mapped = await Promise.all(models.map(async (m) => {
    if (hw) return { model: m, ev: c.evaluateModel(m, hw) };
    try {
      const res = await api.checkCompatibility({ hardware: hw, modelId: m.id });
      return { model: m, ev: { quant: res.quantization, status: c.statusToCanirun(res.status) === 'comfortable' ? 'can-run' : (res.status === 'cpu-offload' ? 'can-run-slow' : res.status), toksPerSec: res.estimated?.tokensPerSecond, score: res.score, grade: res.grade, memPct: null } as c.Eval };
    } catch {
      return { model: m, ev: c.evaluateModel(m, hw || {}) };
    }
  }));
  return mapped.sort((a, b) => b.ev.score - a.ev.score).slice(0, limit);
}

function installBtn(m: CatalogModel) {
  const btn = el('button', { class: 'btn btn-primary text-xs !px-3 !py-1.5', text: 'Instalar' });
  const status = el('span', { class: 'text-xs text-muted' });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Instalando…';
    status.replaceChildren(spinner(), document.createTextNode(' '));
    try {
      const { jobId } = await api.installModel(m.id);
      await poll(jobId, status, btn);
    } catch (e: any) {
      btn.hidden = true;
      status.textContent = e?.message || 'Error';
      if (/randi serve/i.test(status.textContent)) {
        status.textContent = `Ejecuta localmente: randi install ${m.id}`;
      }
    }
  });
  return el('div', { class: 'flex items-center gap-2' }, [btn, status]);
}

async function poll(jobId: string, status: HTMLElement, btn: HTMLButtonElement) {
  for (let i = 0; i < 600; i++) {
    await new Promise((r) => setTimeout(r, 1200));
    let j: any;
    try { j = await api.installStatus(jobId); } catch { continue; }
    if (j?.phase) status.textContent = `${j.phase === 'configuration' ? 'Configurando' : j.phase}: ${j.detail || ''}`.trim();
    if (j?.done) {
      status.className = 'text-xs text-good';
      status.textContent = j.detail || 'Listo';
      btn.textContent = '✓ Instalado';
      return;
    }
    if (j?.status === 'error') {
      btn.textContent = 'Reintentar';
      btn.disabled = false;
      status.textContent = j.detail || 'Error';
      return;
    }
  }
}

function modelRow(m: CatalogModel, ev: c.Eval, opts: { install?: boolean; extra?: string }) {
  const head = el('div', { class: 'flex items-center gap-2' }, [gradeBadge(ev.grade)]);
  const title = el('a', { href: `/model/${encodeURIComponent(m.id)}`, class: 'font-bold hover:text-accent transition-colors', text: m.name });
  const meta = el('span', { class: 'text-xs text-muted mono flex flex-wrap gap-x-2' },
    [`${m.paramsBillions}B`, `q${ev.quant || '—'}`, ev.toksPerSec ? `≈${ev.toksPerSec} tok/s` : '', m.size || '']);
  const right = opts.install ? installBtn(m)
    : el('span', { class: 'text-xs text-bad', text: opts.extra || '' });
  return el('div', { class: 'card p-4 flex flex-col gap-2' }, [
    el('div', { class: 'flex items-start justify-between gap-3' }, [
      el('div', { class: 'flex flex-col gap-1.5' }, [title, meta]),
      head,
    ]),
    el('p', { class: 'text-sm text-muted line-clamp-2', text: m.desc || '' }),
    el('div', { class: 'mt-1 flex items-center justify-between gap-2' }, [
      el('span', { class: 'inline-flex flex-wrap gap-1.5' }, (m.useCase || []).slice(0, 3).map((uc) => el('span', { class: 'pill', text: uc }))),
      right,
    ]),
  ]);
}

export function mount() {
  const hwPanel = document.getElementById('hwPanel');
  const picks = document.getElementById('picks');
  const installable = document.getElementById('installable');
  const requires = document.getElementById('requires');
  const btn = document.getElementById('scanBtn') as HTMLButtonElement;
  const state = document.getElementById('scanState');

  async function run() {
    if (state) state.replaceChildren(scanState());
    try {
      // Paso 1: deteccion en el navegador (instantanea) y render inmediato.
      let client: Hw = {};
      try { client = (await detectHardware()) as Hw; } catch { /* sin navegador */ }
      hw = client;
      renderHw(profileOf(client));
      // Paso 2: enriquecer con el servidor local (timeout, nunca bloquea).
      try {
        const srv = await api.getHardware();
        hw = { ...client, ...srv };
        renderHw(profileOf(hw));
      } catch { /* sin servidor: queda la deteccion del navegador */ }
      renderBasic();
      await renderPicks();
      await renderLists();
    } catch (e) {
      console.warn('home err', e);
    } finally {
      if (state) state.textContent = '';
    }

    let models: CatalogModel[] = [];
    try { models = await api.getModels({ media: true }); } catch { /* offline */ }

    if (btn) {
      btn.textContent = '↻ Re-analizar';
      btn.addEventListener('click', run);
    }
  }

  function profileOf(h: Hw) { return (h as any).profile || hardwareProfile(h); }

  // Modelos cuantizados (Q2/Q4) para equipos basicos sin GPU dedicada.
  const BASIC_IDS = ['qwen3:0.6b', 'qwen2.5-coder:0.5b', 'gemma3:1b', 'llama3.2:1b', 'qwen3:1.7b', 'deepseek-r1:1.5b', 'qwen2.5-coder:1.5b', 'phi3:mini', 'qwen3-moe:0.6b', 'nomic-embed-text'];
  function renderBasic() {
    const box = document.getElementById('basic');
    if (!box || !hw) return;
    const list = BASIC_IDS.map(findModel).filter(Boolean) as CatalogModel[];
    if (!list.length) return;
    const evals = list.map((m) => ({ m, ev: c.evaluateModel(m, hw!) }));
    box.innerHTML = '';
    box.appendChild(el('h2', { class: 'text-xl font-bold mb-3', text: 'Cuantizados para equipos básicos (sin GPU)' }));
    const grid = el('div', { class: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4' });
    evals.forEach(({ m, ev }) => grid.appendChild(modelRow(m, ev, { install: true })));
    box.appendChild(grid);
  }

  function renderHw(profile: any) {
    if (!hwPanel) return;
    const chips: Array<[string, string]> = [
      ['RAM', hw?.ram_gb ? `${hw.ram_gb}GB` : '—'],
      ['GPU', hw?.gpu_name || 'No detectada'],
    ];
    if (!hw?.is_apple_silicon && hw?.gpu_vram_gb) chips.push(['VRAM', `${hw.gpu_vram_gb}GB`]);
    chips.push(['Nucleos', String(hw?.cpu_cores || '—')]);
    chips.push(['Plataforma', profile?.platform || '—']);
    hwPanel.innerHTML = '';
    hwPanel.appendChild(el('div', { class: 'flex items-center justify-between gap-3 flex-wrap' }, [
      el('div', { class: 'flex gap-6 flex-wrap' },
        chips.map(([k, v]) => el('div', { class: 'flex flex-col' }, [
          el('span', { class: 'text-xs text-muted uppercase tracking-wide mono', text: k }),
          el('span', { class: 'font-semibold', text: v }),
        ]))),
      el('span', { class: 'text-sm text-muted', text: profile?.summary || '' }),
    ]));
  }

  async function renderPicks() {
    if (!picks) return;
    picks.innerHTML = '';
    picks.appendChild(el('h2', { class: 'section-title text-xl font-bold mb-4', text: 'Recomendados para tu equipo' }));
    let recs: any = null;
    try { recs = await api.getSetup(); } catch { /* offline */ }
    const cases = [['chat', 'Chat'], ['code', 'Codificacion'], ['reasoning', 'Razonamiento'], ['vision', 'Vision']] as const;
    const picksOk = recs?.recommendations && Object.keys(recs.recommendations).length > 0;
    for (const [key, label] of cases) {
      const grid = el('div', { class: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-2' });
      let rendered = 0;
      if (picksOk) {
        for (const r of (recs.recommendations[key] || []).slice(0, 4)) {
          const m = { id: r.modelId, name: r.name, paramsBillions: r.params } as CatalogModel;
          grid.appendChild(modelRow(m, { grade: r.grade, status: r.status, quant: r.quantization, toksPerSec: r.tokensPerSecond, score: 0, memPct: null } as c.Eval, { install: true }));
          rendered++;
        }
      }
      if (!rendered && hw) {
        // Fallback local sobre el catalogo estatico (sin servidor).
        const cands = llmModels
          .filter((m) => (m.useCase || []).includes(key) || m.type === key)
          .map((m) => ({ m, ev: c.evaluateModel(m, hw) }))
          .filter((x) => x.ev.status !== 'cannot-run')
          .sort((a, b) => b.ev.score - a.ev.score)
          .slice(0, 4);
        cands.forEach(({ m, ev }) => { grid.appendChild(modelRow(m, ev, { install: true })); rendered++; });
      }
      if (rendered) {
        picks.appendChild(el('div', { class: 'mt-5' }, [el('h3', { class: 'font-semibold text-muted', text: label }), grid]));
      }
    }
    if (!picks.childElementCount) {
      picks.appendChild(el('p', { class: 'text-muted text-sm', text: 'No se pudieron cargar recomendaciones (el servidor local no responde).' }));
    }
  }

  async function renderLists() {
    if (!hw) return;
    const all: CatalogModel[] = [];
    try { all.push(...(await api.getModels({ media: true }))); } catch { /* offline */ }
    if (!all.length) all.push(...llmModels, ...mediaModels);  // fallback estatico
    if (!all.length) return;
    const evals = all.map((m) => ({ m, ev: c.evaluateModel(m, hw) }));
    const ok = evals.filter((x) => ['can-run', 'tight', 'can-run-slow'].includes(x.ev.status));
    const too = evals.filter((x) => x.ev.status === 'cannot-run');

    if (installable) {
      installable.innerHTML = '';
      const shown = ok.sort((a, b) => b.ev.score - a.ev.score).slice(0, 8);
      installable.appendChild(el('div', { class: 'flex items-center justify-between mb-3' }, [
        el('h2', { class: 'text-xl font-bold', text: `También puedes instalar (${ok.length})` }),
        el('a', { href: '/models', class: 'text-sm text-accent hover:underline', text: 'Ver todos →' }),
      ]));
      const grid = el('div', { class: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4' });
      shown.forEach(({ m, ev }) => grid.appendChild(modelRow(m, ev, { install: true })));
      installable.appendChild(grid);
    }

    if (requires) {
      requires.innerHTML = '';
      const shown = too.sort((a, b) => (b.m.paramsBillions || 0) - (a.m.paramsBillions || 0)).slice(0, 6);
      requires.appendChild(el('h2', { class: 'text-xl font-bold mb-3', text: 'Requieren más hardware' }));
      const list = el('div', { class: 'flex flex-col gap-2' });
      shown.forEach(({ m, ev }) => {
        const req = c.requiredHardware(m, 'Q4_K_M');
        list.appendChild(el('div', { class: 'card p-3 flex flex-wrap items-center justify-between gap-2' }, [
          el('div', { class: 'flex flex-col' }, [
            el('span', { class: 'font-semibold', text: m.name }),
            el('span', { class: 'text-xs text-muted', text: `${m.paramsBillions}B · ${m.provider}` }),
          ]),
          el('div', { class: 'flex flex-col items-end gap-0.5' }, [
            el('span', { class: 'text-xs text-bad font-medium', text: `No corre en tu equipo` }),
            el('span', { class: 'text-xs text-muted', text: `Necesitas ${req.gpuVramRecommendedGb}GB VRAM (${req.gpuClass}) y ${req.systemRamTotalGb}GB RAM` }),
          ]),
        ]));
      });
      requires.appendChild(list);
    }
  }

  btn?.addEventListener('click', run);
  run();
}