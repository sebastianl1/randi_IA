// RANDI web — detalle de modelo: quants por hardware + requisitos e instalacion.
import * as api from '../lib/api.js';
import * as c from '../lib/compat.js';
import { findModel } from '../lib/catalog.js';
import * as u from '../lib/ui.js';
import type { CatalogModel, Hw } from '../lib/api.js';

export async function mount(modelId: string) {
  const model = findModel(modelId) as CatalogModel;
  if (!model) return;
  let hw = await detectHw();

  const qBody = document.getElementById('quantsBody');
  const quants = c.makeQuants(Number(model.paramsBillions) || 0);
  if (qBody) {
    qBody.innerHTML = '';
    for (const q of quants) {
      const ev = c.evaluateModel(model, hw);
      const status = c.evaluateStatus(q.vramGB, hw);
      const ws = c.workingSet(q.vramGB, model);
      const toks = c.estimateTokensPerSecond(ws, hw);
      const score = c.computeScore(status, toks, Number(model.paramsBillions) || 0, c.memPercent(q.vramGB, hw));
      const grade = c.scoreToGrade(score, status);
      const tr = u.el('tr', { class: 'border-t border-line' }, [
        u.el('td', { class: 'py-2 pr-2 mono' }, q.name),
        u.el('td', { class: 'p-1', text: c.gb(q.vramGB) }),
        u.el('td', { class: 'p-1', text: c.gb(q.diskGB) }),
        u.el('td', { class: 'p-1' }, [u.el('span', { class: 'flex items-center gap-1.5' }, [u.el('span', { class: 'status-dot sd-' + status }), c.statusLabel(status)])]),
        u.el('td', { class: 'p-1' }, u.gradeBadge(grade)),
      ]);
      qBody.appendChild(tr);
    }
  }

  const reqEl = document.getElementById('requirements');
  if (reqEl) {
    const req = c.requiredHardware(model, c.evaluateModel(model, hw).quant);
    const ev = c.evaluateModel(model, hw);
    const isLlm = model.installer === 'ollama';
    reqEl.innerHTML = '';
    reqEl.appendChild(u.el('h3', { class: 'font-semibold text-sm text-muted uppercase tracking-wide', text: isLlm ? 'Hardware que necesita' : 'Requisitos recomendados' }));
    const grid = u.el('div', { class: 'mt-2 grid grid-cols-2 gap-2 text-sm' }, [
      spec('VRAM', `${req.vramRequiredGb} GB`),
      spec('GPU recomendada', req.gpuClass),
      spec('GPU VRAM mínima', `${req.gpuVramRecommendedGb} GB`),
      spec('RAM total', `${req.systemRamTotalGb} GB`),
      spec('Ancho de banda', `${req.bandwidthRecommendedGbps} GB/s`),
      spec('Disco', `${req.diskRequiredGb} GB`),
    ]);
    reqEl.appendChild(grid);
    const notes = c.notesFor(model, ev, hw);
    reqEl.appendChild(u.el('div', { class: 'mt-3 space-y-1' },
      notes.map((n) => u.el('p', { class: 'text-xs text-muted flex gap-1.5' }, [u.el('span', { text: '•' }), n]))));
  }

  // instalacion one-click (solo modelos Ollama)
  const btn = document.getElementById('installBtn');
  const st = document.getElementById('installState');
  if (btn && st) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      st.replaceChildren(u.spinner());
      try {
        const { jobId } = await api.installModel(model.id);
        await poll(jobId, st, btn);
      } catch (e: any) {
        st.textContent = /randi serve/i.test(e?.message || '') ? `Ejecutá localmente: randi install ${model.id}` : (e?.message || 'Error');
        btn.hidden = true;
      }
    });
  }

  async function poll(jobId: string, st: HTMLElement, btn: HTMLButtonElement) {
    for (let i = 0; i < 900; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      let j: any; try { j = await api.installStatus(jobId); } catch { continue; }
      if (j?.phase) st.textContent = String(j.detail || j.phase);
      if (j?.done) { st.className = 'text-xs text-good'; st.textContent = '✓ ' + (j.detail || 'Listo'); btn.textContent = 'Instalado'; return; }
      if (j?.status === 'error') { st.className = 'text-xs text-bad'; st.textContent = j.detail || 'Error'; btn.disabled = false; btn.textContent = 'Reintentar'; return; }
    }
  }
}

function spec(k: string, v: string) {
  return u.el('div', { class: 'rounded-lg bg-bg-soft border border-line px-3 py-2' }, [
    u.el('div', { class: 'text-[11px] text-muted uppercase tracking-wide', text: k }),
    u.el('div', { class: 'font-semibold', text: v }),
  ]);
}

async function detectHw(): Promise<Hw> {
  return api.fastHardware();
}