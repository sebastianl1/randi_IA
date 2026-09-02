// RANDI Workspace (web online) — núcleo F1:
// Espacios persistentes (compartidos con el chat de /chat) + app Documentos
// con IA (resumir vía worker). Todo local (localStorage).

interface Space { id: string; title: string; model: string }

const LS_SPACES = 'randi-sessions';
const LS_MSG = 'randi-sess:';
const LS_DOC = 'rw-doc:';
const LS_ACTIVE = 'rw-active';
const SUMM_MODEL = 'nemotron-3-free';
const docKey = (id: string) => LS_DOC + id;

function readSpaces(): Space[] {
  try { const r = localStorage.getItem(LS_SPACES); if (r) { const a = JSON.parse(r); if (Array.isArray(a)) return a.filter((x) => x && typeof x.id === 'string'); } } catch { /* noop */ }
  return [];
}
function saveSpaces(s: Space[]): void { try { localStorage.setItem(LS_SPACES, JSON.stringify(s)); } catch { /* lleno */ } }
function sid(): string { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

export function mountWorkspace(): void {
  const es = document.documentElement.lang.startsWith('es');
  const base = import.meta.env.BASE_URL || '/';
  const L = {
    spacesL: es ? 'Espacios' : 'Spaces',
    newS: es ? 'Nuevo espacio' : 'New space',
    emptyS: es ? 'Crea tu primer espacio.' : 'Create your first space.',
    chat: es ? 'Asistentes' : 'Assistants',
    docs: es ? 'Documentos' : 'Documents',
    docPh: es ? 'Pegá o escribe tu documento… (se guarda automático en este espacio)' : 'Paste or type your document… (auto-saved to this space)',
    export: es ? 'Exportar .txt' : 'Export .txt',
    clear: es ? 'Limpiar' : 'Clear',
    sum: es ? 'Resumir con IA' : 'Summarize with AI',
    thinking: es ? 'La IA está pensando…' : 'AI is thinking…',
    saved: es ? 'Guardado ·' : 'Saved ·',
    del: es ? 'Eliminar' : 'Delete',
    offline: es ? 'El motor de IA no está disponible (revisá /chat).' : 'The AI engine is not available (check /chat).',
    sumTitle: es ? 'Resumen con IA' : 'AI summary',
  };
  const root = document.getElementById('randi-workspace');
  if (!root) return;
  const selEl = root.querySelector<HTMLSelectElement>('[data-ws-select]');
  const delBtn = root.querySelector<HTMLButtonElement>('[data-ws-del]');
  const newBtn = root.querySelector<HTMLButtonElement>('[data-ws-new]');
  const titleEl = root.querySelector<HTMLElement>('[data-ws-title]');
  const titleDocEl = root.querySelector<HTMLElement>('[data-ws-title-doc]');
  const docEl = root.querySelector<HTMLTextAreaElement>('[data-ws-doc]');
  const exportBtn = root.querySelector<HTMLButtonElement>('[data-ws-export]');
  const clearBtn = root.querySelector<HTMLButtonElement>('[data-ws-clear]');
  const sumBtn = root.querySelector<HTMLButtonElement>('[data-ws-summarize]');
  const outEl = root.querySelector<HTMLElement>('[data-ws-out]');
  const statusEl = root.querySelector<HTMLElement>('[data-ws-status]');

  let activeId = '';
  function active(): Space | undefined { return readSpaces().find((s) => s.id === activeId); }
  function persistActive(): void { try { localStorage.setItem(LS_ACTIVE, activeId); } catch { /* noop */ } }
  function loadDoc(id: string): string { try { return localStorage.getItem(docKey(id)) || ''; } catch { return ''; } }
  function saveDocText(id: string, text: string): void { try { localStorage.setItem(docKey(id), text); } catch { /* lleno */ } }

  function renderList(): void {
    if (!selEl) return;
    const spaces = readSpaces();
    selEl.innerHTML = '';
    if (!spaces.length) {
      const o = document.createElement('option'); o.value = ''; o.textContent = L.emptyS;
      selEl.appendChild(o);
      return;
    }
    for (const sp of spaces) {
      const o = document.createElement('option'); o.value = sp.id; o.textContent = sp.title;
      selEl.appendChild(o);
    }
    selEl.value = activeId;
  }
  function switchSpace(id: string): void {
    activeId = id; persistActive();
    const sp = active();
    if (titleEl) titleEl.textContent = sp ? sp.title : '';
    if (titleDocEl) titleDocEl.textContent = sp ? ` / ${sp.title}` : '';
    if (docEl) docEl.value = loadDoc(id);
    if (outEl) outEl.innerHTML = '';
    renderList();
  }
  function newSpace(): void {
    const s: Space = { id: sid(), title: (es ? 'Espacio ' : 'Space ') + (new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), model: SUMM_MODEL };
    const all = readSpaces(); all.unshift(s); saveSpaces(all);
    try { localStorage.setItem(LS_MSG + s.id, '[]'); } catch { /* noop */ }
    activeId = s.id; persistActive();
    switchSpace(s.id);
    if (docEl) docEl.focus();
  }
  function deleteSpace(id: string): void {
    const all = readSpaces().filter((x) => x.id !== id); saveSpaces(all);
    try { localStorage.removeItem(LS_MSG + id); } catch { /* noop */ }
    try { localStorage.removeItem(docKey(id)); } catch { /* noop */ }
    if (activeId === id) {
      if (all.length) switchSpace(all[0].id); else { activeId = ''; if (titleEl) titleEl.textContent = ''; if (docEl) docEl.value = ''; if (selEl) selEl.value = ''; renderList(); }
    } else renderList();
  }

  // arranque
  const stored = readSpaces();
  let last = '';
  try { last = localStorage.getItem(LS_ACTIVE) || ''; } catch { /* noop */ }
  activeId = last && stored.some((s) => s.id === last) ? last : stored.length ? stored[0].id : '';
  if (!activeId) newSpace(); else switchSpace(activeId);

  selEl?.addEventListener('change', () => { if (selEl.value) switchSpace(selEl.value); });
  delBtn?.addEventListener('click', () => { if (activeId) deleteSpace(activeId); });
  newBtn?.addEventListener('click', newSpace);
  docEl?.addEventListener('input', () => { if (activeId) { saveDocText(activeId, docEl.value); if (statusEl) statusEl.textContent = L.saved + ' ' + new Date().toLocaleTimeString(); } });
  exportBtn?.addEventListener('click', () => {
    if (!docEl) return;
    const file = new File([docEl.value], `${active().title || 'documento'}.txt`, { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); URL.revokeObjectURL(a.href);
  });
  clearBtn?.addEventListener('click', () => { if (docEl) { docEl.value = ''; if (activeId) saveDocText(activeId, ''); } });
  sumBtn?.addEventListener('click', () => void summarize());

  async function summarize(): Promise<void> {
    const text = (docEl?.value || '').trim();
    if (!text) return;
    if (!outEl || !sumBtn) return;
    sumBtn.disabled = true;
    const original = sumBtn.textContent; sumBtn.textContent = L.thinking;
    if (statusEl) statusEl.textContent = L.thinking;
    outEl.innerHTML = '<p class="text-xs text-muted">' + L.thinking + '…</p>';
    try {
      let endpoint = String((import.meta.env.PUBLIC_CHAT_ENDPOINT as string) || '').replace(/\/+$/, '');
      if (!endpoint) {
        const cfg = await (await fetch(`${base}chat-config.json`, { cache: 'no-store' })).json();
        endpoint = String(cfg.endpoint || '').replace(/\/+$/, '');
      }
      if (!endpoint) throw new Error(L.offline);
      const res = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: SUMM_MODEL, messages: [{ role: 'user', content: `${es ? 'Resumí el siguiente documento en 3-5 viñetas claras:\n' : 'Summarize the following document into 3-5 clear bullets:\n'}${text.slice(0, 6000)}` }] }),
      });
      if (!res.ok || !res.body) throw new Error(L.offline);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = ''; let html = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let d;
        while ((d = buf.indexOf('\n\n')) >= 0) {
          const ev = buf.slice(0, d); buf = buf.slice(d + 2);
          if (!ev.startsWith('data:')) continue;
          try {
            const j = JSON.parse(ev.slice(5).trim());
            if (j.type === 'delta') { html += String(j.data); outEl.innerHTML = '<div class="ws-out">' + renderLight(html) + '</div>'; }
            else if (j.type === 'done') break;
            else if (j.type === 'error') { outEl.textContent = L.offline; break; }
          } catch { /* fragmento */ }
        }
      }
      if (!html) outEl.textContent = L.offline;
      if (statusEl) statusEl.textContent = '';
    } catch (e) {
      outEl.textContent = e instanceof Error ? e.message : L.offline;
      if (statusEl) statusEl.textContent = '';
    } finally {
      sumBtn.disabled = false; sumBtn.textContent = original;
    }
  }
  // render ligero del texto del resumen (escapa HTML)
  function renderLight(txt: string): string {
    const esc = txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
    return esc;
  }
}