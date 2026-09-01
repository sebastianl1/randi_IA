// RANDI Chat — cliente del "Chatea con nosotros".
// UI tipo harness: sesiones en sidebar, mensajes como bloques con rol,
// composer inferior, markdown rico, reasoning colapsable y copiar código.
// Todo el contexto es local (localStorage).

interface DemoModel { id: string; label: string; provider?: string; note?: string; ready?: boolean }
interface Msg { role: 'user' | 'assistant'; content: string; reason?: string }
interface Session { id: string; title: string; model: string; ts: number }
interface Task { id: string; text: string; done: boolean }

const LS_SESS = 'randi-sessions';
const LS_ACTIVE = 'randi-active';
const LS_NS = 'randi-sess:';
const TASKS_KEY = 'randi-tasks';
const MAX_CTX = 24;
const DEFAULT_MODEL = 'nemotron-3-free';

interface L10n {
  offline: string; send: string; stop: string; placeholder: string; ctx: string;
  export: string; clear: string; pro: string; sponsor: string; limit: string; reset: string;
  err: string; hint: string; typing: string; newConv: string; sessions: string; del: string;
  emptySessions: string; regenerate: string; assistant: string; you: string; msgsL: string;
  tokL: string; sugg: string[]; empty: string; soon: string; priv1: string; priv2: string; priv3: string;
}

const es: L10n = {
  offline: 'El chat online aún no está conectado.',
  send: 'Enviar',
  stop: 'Detener',
  placeholder: 'Escribí tu mensaje…',
  ctx: 'Contexto',
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
  sessions: 'Conversaciones',
  del: 'Eliminar',
  emptySessions: 'Sin conversaciones aún.',
  regenerate: 'Regenerar respuesta',
  assistant: 'Asistente',
  you: 'Tú',
  msgsL: 'mensajes',
  tokL: '≈ tokens',
  sugg: ['Explicame qué es un LLM en términos simples', 'Escribí un script de Python para leer un CSV', 'Dame 3 ideas para presentar un proyecto'],
  empty: 'El modelo devolvió una respuesta vacía. Probá con otro modelo.',
  soon: 'Próximamente',
  priv1: 'Cero cookies y cero rastreo.',
  priv2: 'Sin cuenta y sin tarjeta.',
  priv3: '40 mensajes gratis por IP y por día (se reinicia).',
};
const en: L10n = {
  offline: 'The online chat is not connected yet.',
  send: 'Send',
  stop: 'Stop',
  placeholder: 'Type your message…',
  ctx: 'Context',
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
  sessions: 'Conversations',
  del: 'Delete',
  emptySessions: 'No conversations yet.',
  regenerate: 'Regenerate reply',
  assistant: 'Assistant',
  you: 'You',
  msgsL: 'messages',
  tokL: '≈ tokens',
  sugg: ['Explain what an LLM is in simple terms', 'Write a Python script to read a CSV', 'Give me 3 ideas to present a project'],
  empty: 'The model returned an empty reply. Try another model.',
  soon: 'Coming soon',
  priv1: 'Zero cookies and zero tracking.',
  priv2: 'No account and no card.',
  priv3: '40 free messages per IP and day (resets).',
};

// ── Renderizador markdown propio (XSS-safe) ────────────────────────────
function mdEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function inlineMd(s: string): string {
  let r = s.replace(/`([^`]+)`/g, '<code class="md-c">$1</code>');
  r = r.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  r = r.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  r = r.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a class="md-msg-link" href="$2" target="_blank" rel="noreferrer">$1</a>');
  r = r.replace(/\$\$([^$]+)\$\$/g, '<span class="md-math md-math-block">$$$1$$</span>');
  r = r.replace(/\$([^$]+)\$/g, '<span class="md-math">$1</span>');
  return r;
}
const MD_KW = /^(def|class|return|if|elif|else|for|while|in|not|and|or|None|True|False|print|import|from|as|function|const|let|var|export|throw|new|async|await|try|catch|finally|switch|case|break|continue|npm|npx|sudo|pkg|apt|git|curl|cd|ls|echo)$/;
function hlLang(code: string): string {
  let s = code.replace(/(&quot;.*?&quot;|'[^']*')/g, '<span class="md-str">$1</span>').replace(/(#.*)$/gm, '<span class="md-com">$1</span>');
  s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="md-num">$1</span>');
  s = s.replace(/^(\s*)([A-Za-z_][\w]*)/gm, (_m, sp, w) => (MD_KW.test(w) ? `${sp}<span class="md-kw">${w}</span>` : `${sp}${w}`));
  s = s.replace(/([A-Za-z_]\w*)(?=\s*\()/g, '<span class="md-fn">$1</span>');
  return s;
}
function tableHtml(rows: string[]): string {
  const cells = (r: string) => r.replace(/^\||\|$/g, '').split('|');
  const head = cells(rows[0]);
  let h = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
  h += head.map((c) => `<th>${inlineMd(c.trim())}</th>`).join('');
  h += '</tr></thead><tbody>';
  for (const r of rows.slice(2)) {
    h += '<tr>' + cells(r).slice(0, head.length).map((c) => `<td>${inlineMd(c.trim())}</td>`).join('') + '</tr>';
  }
  h += '</tbody></table></div>';
  return h;
}
function thinkHtml(reason: string): string {
  return `<details class="md-think"><summary>💭 ${reason.length > 60 ? reason.slice(0, 60) + '…' : reason}</summary><div class="md-think-body">${mdEsc(reason)}</div></details>`;
}
function renderMd(src: string): string {
  const lines = mdEsc(src).split('\n');
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i += 1; }
      i += 1;
      const enc = encodeURIComponent(buf.join('\n'));
      html += `<div class="md-pre-wrap"><button type="button" class="md-copy" data-copy="${enc}" aria-label="copiar">⧉</button><pre class="md-pre"><code class="md-code${fence[1] ? ' lang-' + fence[1] : ''}">${hlLang(buf.join('\n'))}</code></pre></div>`;
      continue;
    }
    if (line.startsWith('|') && lines[i + 1] && /^[\|:\-\s]+$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i += 1; }
      html += tableHtml(rows);
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { html += `<h${h[1].length} class="md-h${h[1].length}">${inlineMd(h[2])}</h${h[1].length}>`; i += 1; continue; }
    if (/^---+$/.test(line.trim())) { html += '<hr class="md-hr" />'; i += 1; continue; }
    if (/^&gt;\s?/.test(line)) { html += `<blockquote class="md-quote">${inlineMd(line.replace(/^&gt;\s?/, ''))}</blockquote>`; i += 1; continue; }
    if (/^[-*]\s+/.test(line)) {
      html += '<ul class="md-ul">';
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { html += `<li>${inlineMd(lines[i].replace(/^[-*]\s+/, ''))}</li>`; i += 1; }
      html += '</ul>';
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      html += '<ol class="md-ol">';
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) { html += `<li>${inlineMd(lines[i].replace(/^\d+[.)]\s+/, ''))}</li>`; i += 1; }
      html += '</ol>';
      continue;
    }
    html += `<p class="md-p">${inlineMd(line) || '&nbsp;'}</p>`;
    i += 1;
  }
  return html;
}

// ── Arranque del chat ──────────────────────────────────────────────────
export async function mountChat(): Promise<void> {
  const L: L10n = document.documentElement.lang.startsWith('es') ? es : en;
  const root = document.getElementById('chat-online');
  if (!root) return;
  const base = import.meta.env.BASE_URL || '/';

  const modelBtn = root.querySelector<HTMLButtonElement>('[data-cd-model]');
  const modelMenu = root.querySelector<HTMLElement>('[data-cd-models]');
  const sessionsEl = root.querySelector<HTMLElement>('[data-cd-sessions]');
  const newBtn = root.querySelector<HTMLButtonElement>('[data-cd-new]');
  const sideOpen = root.querySelector<HTMLButtonElement>('[data-cd-open-side]');
  const scrim = root.querySelector<HTMLElement>('[data-cd-scrim]');
  const msgs = root.querySelector<HTMLElement>('[data-cd-msgs]');
  const input = root.querySelector<HTMLTextAreaElement>('[data-cd-input]');
  const send = root.querySelector<HTMLButtonElement>('[data-cd-send]');
  const stop = root.querySelector<HTMLButtonElement>('[data-cd-stop]');
  const status = root.querySelector<HTMLElement>('[data-cd-status]');
  const exportBtn = root.querySelector<HTMLButtonElement>('[data-cd-export]');
  const clearBtn = root.querySelector<HTMLButtonElement>('[data-cd-clear]');
  const countEls = Array.from(root.querySelectorAll<HTMLElement>('[data-cd-count]'));
  const tokEls = Array.from(root.querySelectorAll<HTMLElement>('[data-cd-tokens]'));
  const suggEl = root.querySelector<HTMLElement>('[data-cd-sugg]');
  const modelsListEl = root.querySelector<HTMLElement>('[data-cd-models-list]');
  const taskInput = root.querySelector<HTMLInputElement>('[data-cd-task-input]');
  const taskAdd = root.querySelector<HTMLButtonElement>('[data-cd-task-add]');
  const tasksListEl = root.querySelector<HTMLElement>('[data-cd-tasks-list]');
  const taskBar = root.querySelector<HTMLElement>('[data-cd-task-bar]');
  const taskNums = root.querySelector<HTMLElement>('[data-cd-task-nums]');
  if (!modelBtn || !modelMenu || !sessionsEl || !newBtn || !msgs || !input || !send || !stop || !exportBtn || !clearBtn) return;

  let endpoint = '';
  let models: DemoModel[] = [];
  let sessions: Session[] = [];
  let activeId = '';
  let ctx: Msg[] = [];
  let current = '';
  let abort: AbortController | null = null;
  let busy = false;
  let lastUserText = '';

  function readSessions(): Session[] {
    try { const r = localStorage.getItem(LS_SESS); if (r) { const a = JSON.parse(r); if (Array.isArray(a)) return a; } } catch { /* noop */ }
    return [];
  }
  function persistSessions(): void { try { localStorage.setItem(LS_SESS, JSON.stringify(sessions)); } catch { /* lleno */ } }
  function saveCtx(): void { try { localStorage.setItem(LS_NS + activeId, JSON.stringify(ctx)); } catch { /* lleno */ } }
  function loadCtx(id: string): Msg[] {
    try { const r = localStorage.getItem(LS_NS + id); return r ? JSON.parse(r) : []; } catch { /* noop */ }
    return [];
  }
  function estTokens(list: Msg[]): number {
    let chars = 0; for (const m of list) chars += m.content.length; return Math.round(chars / 4);
  }
  function updateStat(): void {
    const c = `${ctx.length} ${L.msgsL}`; const t = `${L.tokL} ${estTokens(ctx).toLocaleString()}`;
    countEls.forEach((el) => { el.textContent = c; }); tokEls.forEach((el) => { el.textContent = t; });
  }
  function sid(): string { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function shortTitle(text: string): string { const t = text.trim().replace(/\s+/g, ' '); return t.length > 32 ? t.slice(0, 32) + '…' : t || '…'; }

  // ── Selector de modelo (popover) ────────────────────────────────────
  function setModelLabel(): void {
    const m = models.find((x) => x.id === current);
    modelBtn.textContent = (m ? m.label : current) + ' ▾';
  }
  function renderModelMenu(): void {
    modelMenu.innerHTML = '';
    for (const m of models) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'model-opt' + (m.id === current ? ' on' : '') + (m.ready === false ? ' disabled' : '');
      if (m.ready !== false) b.addEventListener('click', () => { current = m.id; setModelLabel(); renderModelMenu(); const s = sessions.find((x) => x.id === activeId); if (s) { s.model = m.id; persistSessions(); } renderSessions(); });
      const n = document.createElement('span'); n.className = 'n'; n.textContent = m.label;
      const hint = document.createElement('span'); hint.className = 'hint';
      hint.textContent = (m.ready === false ? '(sin key)' : m.note) || '';
      b.appendChild(n); b.appendChild(hint);
      modelMenu.appendChild(b);
    }
  }
  modelBtn.addEventListener('click', (e) => { e.stopPropagation(); modelMenu.classList.toggle('visible'); });
  document.addEventListener('click', (e) => { if (!modelMenu.contains(e.target as Node)) modelMenu.classList.remove('visible'); });

  // ── Panel derecho: listado de modelos ──────────────────────────────
  function renderModelsList(): void {
    if (!modelsListEl || !models.length) return;
    modelsListEl.innerHTML = '';
    for (const m of models) {
      const row = document.createElement('div'); row.className = 'model-list-item';
      const dot = document.createElement('span'); dot.className = 'ml-dot' + (m.ready === false ? ' off' : '');
      const name = document.createElement('span'); name.className = 'ml-name'; name.textContent = m.label;
      const note = document.createElement('span'); note.className = 'ml-note'; note.textContent = (m.ready === false ? '(sin key)' : m.note) || '';
      row.appendChild(dot); row.appendChild(name); row.appendChild(note);
      modelsListEl.appendChild(row);
    }
  }

  // ── Panel derecho: tareas con progreso en vivo ─────────────────────
  function readTasks(): Task[] {
    try { const r = localStorage.getItem(TASKS_KEY); if (r) { const a = JSON.parse(r); if (Array.isArray(a)) return a; } } catch { /* noop */ }
    return [];
  }
  function saveTasks(ts: Task[]): void { try { localStorage.setItem(TASKS_KEY, JSON.stringify(ts)); } catch { /* lleno */ } }
  function renderTasks(): void {
    if (!tasksListEl) return;
    const ts = readTasks();
    tasksListEl.innerHTML = '';
    for (const t of ts) {
      const row = document.createElement('div'); row.className = 'task-item' + (t.done ? ' done' : '');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = t.done;
      cb.addEventListener('change', () => { const all = readTasks(); const it = all.find((x) => x.id === t.id); if (it) it.done = cb.checked; saveTasks(all); renderTasks(); });
      const span = document.createElement('span'); span.className = 'tt'; span.textContent = t.text;
      const del = document.createElement('button'); del.type = 'button'; del.className = 'tdel'; del.textContent = '✕'; del.title = L.del;
      del.addEventListener('click', () => { saveTasks(readTasks().filter((x) => x.id !== t.id)); renderTasks(); });
      row.appendChild(cb); row.appendChild(span); row.appendChild(del);
      tasksListEl.appendChild(row);
    }
    const total = ts.length; const doneCount = ts.filter((t) => t.done).length;
    if (taskBar) taskBar.style.width = total ? `${Math.round((doneCount / total) * 100)}%` : '0%';
    if (taskNums) taskNums.textContent = `${doneCount}/${total}`;
  }
  function addTask(): void {
    const v = (taskInput?.value || '').trim();
    if (!v) return;
    const ts = readTasks(); ts.unshift({ id: sid(), text: v, done: false }); saveTasks(ts);
    if (taskInput) taskInput.value = '';
    renderTasks();
  }
  taskAdd?.addEventListener('click', addTask);
  taskInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTask(); } });

  // ── Sesiones ────────────────────────────────────────────────────────
  function renderSessions(): void {
    sessionsEl.innerHTML = '';
    if (!sessions.length) {
      const p = document.createElement('p'); p.className = 'side-label'; p.textContent = L.emptySessions;
      sessionsEl.appendChild(p); return;
    }
    for (const s of sessions) {
      const row = document.createElement('div');
      row.className = 'sess-item' + (s.id === activeId ? ' active' : '');
      const t = document.createElement('span'); t.className = 'sess-title'; t.textContent = s.title;
      const del = document.createElement('button'); del.type = 'button'; del.className = 'sess-del'; del.title = L.del; del.setAttribute('aria-label', L.del); del.textContent = '✕';
      del.addEventListener('click', (e) => { e.stopPropagation(); deleteSession(s.id); });
      row.appendChild(t); row.appendChild(del);
      row.addEventListener('click', () => switchSession(s.id));
      sessionsEl.appendChild(row);
    }
  }
  function switchSession(id: string): void {
    if (busy) return;
    activeId = id; ctx = loadCtx(id);
    const s = sessions.find((x) => x.id === id);
    if (s) { current = s.model; setModelLabel(); renderModelMenu(); }
    renderBubbles(); renderSessions(); updateStat();
    try { localStorage.setItem(LS_ACTIVE, id); } catch { /* noop */ }
  }
  function newSession(): void {
    if (busy) return;
    const s: Session = { id: sid(), title: '—', model: current, ts: Date.now() };
    sessions.unshift(s); persistSessions();
    activeId = s.id; ctx = [];
    try { localStorage.setItem(LS_ACTIVE, s.id); } catch { /* noop */ }
    renderSessions(); renderBubbles(); updateStat(); input.focus();
  }
  function deleteSession(id: string): void {
    try { localStorage.removeItem(LS_NS + id); } catch { /* noop */ }
    sessions = sessions.filter((x) => x.id !== id); persistSessions();
    if (activeId === id) {
      if (sessions.length) switchSession(sessions[0].id); else { activeId = ''; ctx = []; renderBubbles(); updateStat(); }
    } else renderSessions();
  }
  function setSessionTitle(id: string, text: string): void {
    const s = sessions.find((x) => x.id === id);
    if (s && (s.title === '—' || s.title === '…')) { s.title = shortTitle(text); persistSessions(); renderSessions(); }
  }

  // ── Bloques de mensaje ──────────────────────────────────────────────
  function addMsgBlock(role: 'user' | 'assistant', opts?: { reason?: string; streaming?: boolean; regen?: boolean }): { elt: HTMLElement; body: HTMLElement } {
    const block = document.createElement('div');
    block.className = 'msg-block ' + role;
    const ava = document.createElement('div'); ava.className = 'msg-ava';
    ava.textContent = role === 'assistant' ? 'Ρ' : 'Tú'.charAt(0);
    const main = document.createElement('div'); main.className = 'msg-main';
    const head = document.createElement('div'); head.className = 'msg-head';
    const roleLbl = document.createElement('span'); roleLbl.className = 'msg-role'; roleLbl.textContent = role === 'assistant' ? L.assistant : L.you;
    head.appendChild(roleLbl);
    const sep = document.createElement('span'); sep.textContent = '·'; sep.className = 'sp';
    head.appendChild(sep);
    const stamp = document.createElement('span'); stamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    head.appendChild(stamp);
    if (role === 'assistant' && opts?.regen && !opts.streaming) {
      const reg = document.createElement('button'); reg.type = 'button'; reg.className = 'btn-icon'; reg.title = L.regenerate; reg.setAttribute('aria-label', L.regenerate); reg.textContent = '↻';
      reg.setAttribute('data-regen', '');
      head.appendChild(reg);
    }
    const actions = document.createElement('span'); actions.className = 'msg-actions';
    if (role === 'assistant') {
      const cp = document.createElement('button'); cp.type = 'button'; cp.className = 'btn-icon'; cp.title = 'copy'; cp.textContent = '⧉';
      cp.setAttribute('data-copy-msg', '');
      actions.appendChild(cp);
      head.appendChild(actions);
    }
    const body = document.createElement('div'); body.className = 'msg-body';
    if (opts?.streaming) block.classList.add('msg-streaming');
    main.appendChild(head); main.appendChild(body);
    block.appendChild(ava); block.appendChild(main);
    msgs.appendChild(block);
    msgs.scrollTop = msgs.scrollHeight;
    return { elt: block, body };
  }
  function bubbleInner(role: 'user' | 'assistant', msg: Msg): void {
    const b = addMsgBlock(role, msg.role === 'assistant' ? { reason: msg.reason, regen: true } : undefined);
    if (role === 'user') b.body.textContent = msg.content;
    else b.body.innerHTML = (msg.reason ? thinkHtml(msg.reason) : '') + renderMd(msg.content);
    if (msg.role === 'assistant' && msg.reason) { /* think ya incluido */ }
  }
  function renderBubbles(): void {
    msgs.innerHTML = '';
    for (const m of ctx) bubbleInner(m.role, m);
    updateStat();
  }

  // ── Responsive: abrir/cerrar sidebar ────────────────────────────────
  const sidebar = document.querySelector('.chat-sidebar');
  function openSide(mm: boolean): void { if (sidebar) sidebar.classList.toggle('open', mm); else void mm; }
  sideOpen?.addEventListener('click', () => openSide(true));
  scrim?.addEventListener('click', () => openSide(false));

  // ── Config/offline ──────────────────────────────────────────────────
  async function offline(): Promise<void> {
    msgs.innerHTML = `<p class="md-p">${L.offline}</p>`;
    send.disabled = true;
  }
  function setBusy(b: boolean): void {
    busy = b;
    send.disabled = b || !endpoint || !activeId;
    stop.hidden = !b;
    input.disabled = b;
  }

  async function loadCfg(): Promise<void> {
    try {
      let cfgEndpoint = String(import.meta.env.PUBLIC_CHAT_ENDPOINT || '').replace(/\/+$/, '');
      if (!cfgEndpoint) {
        const res = await fetch(`${base}chat-config.json`, { cache: 'no-store' });
        const cfg = await res.json();
        cfgEndpoint = String(cfg.endpoint || '').replace(/\/+$/, '');
      }
      endpoint = cfgEndpoint;
      const cfgRes = await fetch(`${base}chat-config.json`, { cache: 'no-store' });
      const cfg = await cfgRes.json();
      models = cfg.models || [];
      if (endpoint) {
        try { const m = await (await fetch(`${endpoint}/api/models`, { cache: 'no-store' })).json(); models = m.models?.length ? m.models : models; } catch { /* fallback */ }
      }
      renderModelsList();
      if (!endpoint) { await offline(); return; }
      if (!models.length) { await offline(L.offline); return; }

      current = models.find((m) => m.id === DEFAULT_MODEL && m.ready !== false)?.id
        || models.find((m) => m.ready !== false)?.id || models[0]?.id || '';

      sessions = readSessions();
      let last: string | null = null;
      try { last = localStorage.getItem(LS_ACTIVE); } catch { /* noop */ }
      if (!sessions.length) {
        newSession();
      } else {
        activeId = last && sessions.some((x) => x.id === last) ? last : sessions[0].id;
        const s = sessions.find((x) => x.id === activeId);
        if (s) { if (s.model) current = s.model; else { s.model = current; persistSessions(); } }
      }
      setModelLabel(); renderModelMenu();
      ctx = loadCtx(activeId);
      renderBubbles(); renderSessions();
      if (status) status.textContent = `${L.reset} · ${L.ctx}`;
    } catch { await offline(); }
  }

  // ── Acciones ────────────────────────────────────────────────────────
  newBtn.addEventListener('click', () => newSession());
  exportBtn.addEventListener('click', () => {
    const payload = { sessionId: activeId, exportedAt: new Date().toISOString(), model: current, context: ctx };
    const file = new File([JSON.stringify(payload, null, 2)], `randi-chat.json`, { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
    URL.revokeObjectURL(a.href);
  });
  clearBtn.addEventListener('click', () => { ctx = []; saveCtx(); renderBubbles(); input.focus(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } });
  send.addEventListener('click', () => void sendMessage());
  stop.addEventListener('click', () => abort?.abort());

  if (suggEl) {
    for (const s of L.sugg) {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'cd-sugg'; c.textContent = s;
      c.addEventListener('click', () => { input.value = s; input.focus(); });
      suggEl.appendChild(c);
    }
  }

  // Delegación: copiar código, copiar mensaje, regenerar
  msgs.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const copyBtn = t.closest ? t.closest('.md-copy') : null;
    if (copyBtn) { copyText(decodeURIComponent((copyBtn as HTMLElement).dataset.copy || ''), copyBtn); return; }
    const copyMsg = t.closest ? t.closest('[data-copy-msg]') : null;
    if (copyMsg) { const blk = copyMsg.closest('.msg-block'); if (blk) copyText(blk.textContent || '', copyMsg); return; }
    const reg = t.closest ? t.closest('[data-regen]') : null;
    if (reg) { const blk = reg.closest('.msg-block'); if (blk) blk.remove(); if (lastUserText) void call(lastUserText); }
  });

  function copyText(text: string, btn: Element): void {
    const done = () => { const o = btn.textContent; btn.textContent = '✓'; setTimeout(() => { btn.textContent = o; }, 1200); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
    else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { /* noop */ } ta.remove(); done(); }
  }

  // ── Envío/streaming ─────────────────────────────────────────────────
  async function call(text: string): Promise<void> {
    if (!text || busy || !endpoint || !activeId) return;
    lastUserText = text;
    ctx.push({ role: 'user', content: text });
    saveCtx();
    setSessionTitle(activeId, text);
    updateStat();
    const ub = addMsgBlock('user');
    ub.body.textContent = text;
    const ab = addMsgBlock('assistant', { streaming: true });
    addTyping(ab.body);
    setBusy(true);
    abort = new AbortController();
    let md = '';
    let reason = '';
    try {
      const res = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({ model: current, messages: ctx.slice(-MAX_CTX) }),
      });
      if (!res.ok || !res.body) {
        let code: string, msg: string;
        try { const er = await res.json(); code = er?.error?.code || ''; msg = er?.error?.message || ''; } catch { code = ''; msg = ''; }
        removeTyping(ab.body);
        if (code === 'limit') { ab.body.textContent = L.limit; }
        else { ab.body.textContent = `${L.err}${msg ? ' — ' + msg : ''}`; }
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
            if (j.type === 'delta') { md += String(j.data); ab.body.innerHTML = (reason ? thinkHtml(reason) : '') + renderMd(md); ab.body.classList.remove('typing'); msgs.scrollTop = msgs.scrollHeight; }
            else if (j.type === 'reason') { reason += String(j.data); }
            else if (j.type === 'done') {
              removeTyping(ab.body);
              ab.body.classList.remove('msg-streaming');
              if (md.trim()) {
                ab.body.innerHTML = (reason ? thinkHtml(reason) : '') + renderMd(md);
                ctx.push({ role: 'assistant', content: md, reason: reason || undefined });
                saveCtx(); updateStat();
              } else { ab.body.textContent = L.empty; }
            } else if (j.type === 'error') {
              removeTyping(ab.body);
              ab.body.classList.remove('msg-streaming');
              ab.body.textContent = `${L.err} — ${String(j.data?.message || '')}`;
            }
          } catch { /* fragmento */ }
        }
      }
    } catch (e) {
      removeTyping(ab.body);
      ab.body.classList.remove('msg-streaming');
      if ((e as Error)?.name !== 'AbortError') ab.body.textContent = L.err;
    } finally {
      setBusy(false);
      ab.body.classList.remove('msg-streaming');
    }
  }
  function sendMessage(): Promise<void> { const txt = input.value.trim(); if (!txt) return Promise.resolve(); input.value = ''; return call(txt); }
  function addTyping(body: HTMLElement): void { body.classList.add('typing'); body.textContent = L.typing + '…'; }
  function removeTyping(body: HTMLElement): void { body.classList.remove('typing'); }

  renderTasks();
  await loadCfg();
}