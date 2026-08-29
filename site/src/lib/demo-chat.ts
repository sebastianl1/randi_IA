// RANDI Chat — cliente del widget "Chatea ahora".
// Contexto guardado en localStorage (por modelo); exportar/borrar incluidos.

interface DemoModel { id: string; label: string; provider?: string; note?: string }
interface Msg { role: 'user' | 'assistant'; content: string }

const LS_NS = 'randi-ctx:';
const MAX_CTX = 24;

interface L10n {
  offline: string; sel: string; send: string; stop: string; placeholder: string;
  ctx: string; export: string; clear: string; pro: string; sponsor: string;
  limit: string; reset: string; err: string; hint: string; typing: string;
  newConv: string; msgsL: string; tokL: string; sugg: string[];
}

const es: L10n = {
  offline: 'El chat online aún no está conectado. Configurá la URL del Worker en /chat-config.json',
  sel: 'Modelo',
  send: 'Enviar',
  stop: 'Detener',
  placeholder: 'Escribí tu mensaje…',
  ctx: 'Tu contexto vive en tu navegador (localStorage)',
  export: 'Exportar',
  clear: 'Borrar',
  pro: 'Pro — sin límites',
  sponsor: 'Patrocina RANDI',
  limit: 'Llegaste al límite gratuito de hoy. Probá Pro (sin límites) o volvé mañana.',
  reset: 'El límite gratuito se reinicia cada día.',
  err: 'Ups, algo falló al chatear. Intentá de nuevo.',
  hint: 'Enter enviar · Shift+Enter salto de línea',
  typing: 'Pensando…',
  newConv: 'Nueva conversación',
  msgsL: 'mensajes',
  tokL: '≈ tokens',
  sugg: [
    'Explicame qué es un LLM en términos simples',
    'Escribí un script de Python para leer un CSV',
    'Dame 3 ideas para presentar un proyecto',
  ],
};
const en: L10n = {
  offline: 'The online chat is not connected yet. Set the Worker URL in /chat-config.json',
  sel: 'Model',
  send: 'Send',
  stop: 'Stop',
  placeholder: 'Type your message…',
  ctx: 'Your context stays in your browser (localStorage)',
  export: 'Export',
  clear: 'Clear',
  pro: 'Pro — no limits',
  sponsor: 'Sponsor RANDI',
  limit: 'You reached today\'s free limit. Try Pro (no limits) or come back tomorrow.',
  reset: 'The free limit resets every day.',
  err: 'Something went wrong while chatting. Try again.',
  hint: 'Enter to send · Shift+Enter for newline',
  typing: 'Thinking…',
  newConv: 'New conversation',
  msgsL: 'messages',
  tokL: '≈ tokens',
  sugg: [
    'Explain what an LLM is in simple terms',
    'Write a Python script to read a CSV',
    'Give me 3 ideas to present a project',
  ],
};

export async function mountChat(): Promise<void> {
  const L: L10n = document.documentElement.lang.startsWith('es') ? es : en;
  const root = document.getElementById('chat-online');
  if (!root) return;
  const base = import.meta.env.BASE_URL || '/';
  const sel = root.querySelector<HTMLSelectElement>('[data-cd-model]');
  const msgs = root.querySelector<HTMLElement>('[data-cd-msgs]');
  const input = root.querySelector<HTMLTextAreaElement>('[data-cd-input]');
  const send = root.querySelector<HTMLButtonElement>('[data-cd-send]');
  const stop = root.querySelector<HTMLButtonElement>('[data-cd-stop]');
  const status = root.querySelector<HTMLElement>('[data-cd-status]');
  const exportBtn = root.querySelector<HTMLButtonElement>('[data-cd-export]');
  const clearBtn = root.querySelector<HTMLButtonElement>('[data-cd-clear]');
  const newBtn = root.querySelector<HTMLButtonElement>('[data-cd-new]');
  const countEls = Array.from(root.querySelectorAll<HTMLElement>('[data-cd-count]'));
  const tokEls = Array.from(root.querySelectorAll<HTMLElement>('[data-cd-tokens]'));
  const modelLabel = root.querySelector<HTMLElement>('[data-cd-model-label]');
  const suggEl = root.querySelector<HTMLElement>('[data-cd-sugg]');
  if (!sel || !msgs || !input || !send || !stop || !exportBtn || !clearBtn) return;

  let endpoint = '';
  let models: DemoModel[] = [];
  let ctx: Msg[] = [];
  let current = '';
  let abort: AbortController | null = null;
  let busy = false;

  function save(): void { try { localStorage.setItem(LS_NS + current, JSON.stringify(ctx)); } catch { /* lleno */ } }
  function load(): Msg[] {
    try { const raw = localStorage.getItem(LS_NS + (sel.value || '')); return raw ? JSON.parse(raw) : []; } catch { return []; }
  }
  function addBubble(role: 'user' | 'assistant', text: string, prepend?: boolean): HTMLElement {
    const d = document.createElement('div');
    d.className = `cd-bubble ${role}`;
    d.textContent = text;
    if (prepend && msgs.firstChild) msgs.insertBefore(d, msgs.firstChild); else msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }
  function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function estTokens(list: Msg[]): number {
    let chars = 0;
    for (const m of list) chars += m.content.length;
    return Math.round(chars / 4);
  }
  function updateStat(): void {
    const c = `${ctx.length} ${L.msgsL}`;
    const t = `${L.tokL} ${estTokens(ctx).toLocaleString()}`;
    countEls.forEach((el) => { el.textContent = c; });
    tokEls.forEach((el) => { el.textContent = t; });
  }
  function refresh(): void {
    msgs.innerHTML = '';
    for (const m2 of ctx) addBubble(m2.role, m2.content);
    updateStat();
  }
  function nuevaConversacion(): void {
    try { localStorage.removeItem(LS_NS + current); } catch { /* noop */ }
    ctx = [];
    refresh();
    input.focus();
  }

  function renderModels(): void {
    sel.innerHTML = '';
    for (const m of models) {
      const o = document.createElement('option');
      o.value = m.id; o.textContent = m.label;
      sel.appendChild(o);
    }
    current = sel.value;
    if (modelLabel) {
      const mm = models.find((x) => x.id === current);
      modelLabel.textContent = mm ? mm.label : current;
    }
    if (status) status.textContent = `${L.ctx} · ${L.reset}`;
  }

  function setModelLabel(): void {
    if (modelLabel) {
      const mm = models.find((x) => x.id === sel.value);
      modelLabel.textContent = mm ? mm.label : sel.value;
    }
  }

  async function offline(msg?: string): Promise<void> {
    msgs.innerHTML = `<div class="cd-note">${esc(msg || L.offline)}</div>`;
    send.disabled = true;
  }
  function setBusy(b: boolean): void {
    busy = b;
    send.disabled = b || !endpoint;
    stop.hidden = !b;
    input.disabled = b;
  }

  async function loadCfg(): Promise<void> {
    try {
      const res = await fetch(`${base}chat-config.json`, { cache: 'no-store' });
      const cfg = await res.json();
      endpoint = String(cfg.endpoint || '').replace(/\/+$/, '');
      models = cfg.models || [];
      if (endpoint) {
        try {
          const m = await (await fetch(`${endpoint}/api/models`, { cache: 'no-store' })).json();
          models = m.models?.length ? m.models : models;
        } catch { /* usa el fallback local */ }
      }
      if (!endpoint) { await offline(); return; }
      if (!models.length) { await offline(L.offline); return; }
      renderModels();
      ctx = load();
      refresh();
    } catch {
      await offline();
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  });
  send.addEventListener('click', () => void sendMessage());
  stop.addEventListener('click', () => abort?.abort());
  sel.addEventListener('change', () => {
    current = sel.value;
    ctx = load();
    setModelLabel();
    refresh();
  });
  if (newBtn) newBtn.addEventListener('click', () => nuevaConversacion());
  clearBtn.addEventListener('click', () => {
    try { localStorage.removeItem(LS_NS + current); } catch { /* noop */ }
    ctx = [];
    refresh();
  });
  if (suggEl) {
    for (const s of L.sugg) {
      const c = document.createElement('button');
      c.className = 'cd-sugg';
      c.textContent = s;
      c.addEventListener('click', () => {
        input.value = s;
        input.focus();
      });
      suggEl.appendChild(c);
    }
  }
  exportBtn.addEventListener('click', () => {
    const payload = { model: current, exportedAt: new Date().toISOString(), context: ctx };
    const file = new File([JSON.stringify(payload, null, 2)], `randi-chat-${current}.json`, { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  async function sendMessage(): Promise<void> {
    const text = input.value.trim();
    if (!text || busy || !endpoint) return;
    input.value = '';
    ctx.push({ role: 'user', content: text });
    save();
    addBubble('user', text);
    updateStat();
    const aiEl = addBubble('assistant', '');
    addBubble('typing' as 'assistant', L.typing);
    setBusy(true);
    abort = new AbortController();
    try {
      const res = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({ model: current, messages: ctx.slice(-MAX_CTX) }),
      });
      if (!res.ok || !res.body) {
        let code: string, msg: string;
        try { const e = await res.json(); code = e?.error?.code || ''; msg = e?.error?.message || ''; } catch { code = ''; msg = ''; }
        const typing = msgs.querySelector('.cd-typing');
        if (typing) typing.remove();
        if (code === 'limit') addBubble('assistant', `${L.limit}`);
        else addBubble('assistant', `${L.err}${msg ? ' — ' + msg : ''}`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let d;
        while ((d = buf.indexOf('\n\n')) >= 0) {
          const event = buf.slice(0, d);
          buf = buf.slice(d + 2);
          if (!event.startsWith('data:')) continue;
          try {
            const j = JSON.parse(event.slice(5).trim());
            if (j.type === 'delta') {
              aiEl.textContent += String(j.data);
              msgs.scrollTop = msgs.scrollHeight;
            } else if (j.type === 'done') {
              const typing = msgs.querySelector('.cd-typing');
              if (typing) typing.remove();
              if (aiEl.textContent && aiEl.textContent.trim()) {
                ctx.push({ role: 'assistant', content: aiEl.textContent });
                save();
                updateStat();
              }
            } else if (j.type === 'error') {
              const typing = msgs.querySelector('.cd-typing');
              if (typing) typing.remove();
              addBubble('assistant', `${L.err} — ${String(j.data?.message || '')}`);
            }
          } catch { /* fragmento */ }
        }
      }
    } catch (e) {
      const typing = msgs.querySelector('.cd-typing');
      if (typing) typing.remove();
      if ((e as Error)?.name !== 'AbortError') addBubble('assistant', L.err);
    } finally {
      setBusy(false);
    }
  }

  const proBtn = root.querySelector<HTMLAnchorElement>('[data-cd-pro]');
  void proBtn;
  await loadCfg();
}