// RANDI web — Playground: chat local con doble backend (Ollama + WebGPU),
// vision, TTS/STT, sesiones y comandos slash.
import * as api from '../lib/api.js';
import * as wg from '../lib/webgpu.js';
import * as u from '../lib/ui.js';

interface Msg { role: 'user' | 'assistant' | 'system'; content: any; }

let messages: Msg[] = [];
let model = '';
let backend: 'ollama' | 'webgpu' = 'ollama';
let temp = 0.7;
let system = 'Eres RANDI, un asistente de IA local util y conciso.';
let eco = false;
let codeMode = false;
let abort: AbortController | null = null;
let stream = false;

const SESSIONS_KEY = 'randi-sessions';

export function mount() {
  const input = document.getElementById('input') as HTMLTextAreaElement;
  const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
  const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
  const msgs = document.getElementById('msgs')!;
  const stat = document.getElementById('stat')!;
  const conn = document.getElementById('conn')!;
  const backendSel = document.getElementById('backend') as HTMLSelectElement;
  const modelSel = document.getElementById('modelSel') as HTMLSelectElement;
  const wgSel = document.getElementById('wgSel') as HTMLSelectElement;

  const logged = localStorage.getItem('randi-backend');
  if (logged === 'webgpu') backend = 'webgpu';

  function connDot(ok: boolean, text?: string) {
    conn.classList.toggle('sd-cannot-run', !ok);
    conn.classList.toggle('sd-can-run', ok);
    conn.title = text || (ok ? 'Ollama conectado' : 'Ollama no disponible');
    conn.textContent = ok ? '●' : '○';
  }

  async function setupOllama() {
    try {
      const tags = await api.apiGet<{ models: Array<{ name: string }> }>('/api/tags');
      modelSel.innerHTML = '';
      tags.models.forEach((m) => modelSel.appendChild(new Option(m.name, m.name)));
      model = modelSel.options[0]?.value || '';
      connDot(true, `Ollama · ${tags.models.length} modelos`);
      stat.textContent = 'Conectado a Ollama.';
    } catch {
      connDot(false);
      stat.textContent = 'Ollama no disponible — inicia el servidor con `randi serve` o usa WebGPU.';
      modelSel.innerHTML = '<option value="">(sin servidor Ollama)</option>';
    }
  }

  async function applyBackend() {
    backend = backendSel.value === 'webgpu' ? 'webgpu' : 'ollama';
    localStorage.setItem('randi-backend', backend);
    modelSel.style.display = backend === 'webgpu' ? 'none' : '';
    if (backend === 'webgpu') {
      const info = await wg.deviceInfo();
      stat.textContent = `WebGPU: ${info.api}${info.renderer ? ' · ' + info.renderer : ''}. Modelos onNX en el navegador.`;
      modelSel.innerHTML = '';
      wgSel.classList.remove('hidden');
    } else {
      wgSel.classList.add('hidden');
      await setupOllama();
    }
  }

  function addMsg(role: string, content: any) {
    const wrap = u.el('div', { class: 'flex flex-col gap-1' + (role === 'user' ? ' items-end' : '') }, [
      u.el('div', { class: 'text-[11px] text-muted', text: role === 'user' ? 'Tú' : 'RANDI' }),
    ]);
    const bubble = u.el('div', {
      class: 'rounded-xl px-3.5 py-2.5 max-w-[85%] whitespace-pre-wrap break-words ' +
        (role === 'user' ? 'bg-accent text-[#0b0b0f]' : 'bg-bg-soft border border-line'),
    });
    if (role === 'assistant') {
      appendMd(bubble, content || '');
    } else if (typeof content === 'string') {
      bubble.textContent = content;
    } else {
      content[0].text && (bubble.textContent = content[0].text);
    }
    wrap.appendChild(bubble);
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
    return bubble;
  }

  function appendMd(el: HTMLElement, md: string) {
    el.textContent = md;
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const usrMsg = messages.filter((m) => m.role !== 'system').length >= 20;
    if (usrMsg) {
      // control de contexto: colapsar historial viejo (eco)
      if (eco) messages = [messages[0], ...messages.slice(Math.max(1, messages.length - 8))];
      else messages = [messages[0], ...messages.slice(-12)];
    }
    const hasImage = pendingImage;
    messages.push({ role: 'user', content: hasImage ? [{ type: 'text', text }, hasImage] : text });
    addMsg('user', text);
    stat.textContent = codeMode ? 'Modo programador activo.' : (eco ? 'Modo eco: contexto reducido.' : 'Generando…');
    sendBtn.classList.toggle('hidden', true);
    stopBtn.classList.toggle('hidden', false);

    let aiBubble!: HTMLElement;
    const aiWrap = u.el('div', { class: 'flex flex-col gap-1' }, [u.el('div', { class: 'text-[11px] text-muted', text: 'RANDI' })]);
    aiBubble = u.el('div', { class: 'rounded-xl px-3.5 py-2.5 max-w-[85%] bg-bg-soft border border-line' });
    aiBubble.textContent = '…';
    aiWrap.appendChild(aiBubble);
    msgs.appendChild(aiWrap);
    msgs.scrollTop = msgs.scrollHeight;

    let acc = '';
    const withSys = [{ role: 'system', content: system + (codeMode ? '\nContexto: programación, respuestas con código, conciso.' : '') }, ...messages.slice(-1)];
    // construir mensajes completos con las slices (los ya enviados)
    const history = messages;
    try {
      if (backend === 'ollama') {
        abort = new AbortController();
        const normalize = (m: Msg) => {
          if (Array.isArray(m.content)) {
            return {
              ...m,
              content: m.content.map((p: any) =>
                p.type === 'image_url' && p.image_url?.url?.startsWith('data:')
                  ? { ...p, image_url: { url: p.image_url.url.split(',')[1] } }
                  : p),
            };
          }
          return m;
        };
        const res = await fetch('/api/chat', {
          method: 'POST',
          signal: abort.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model, stream: true, options: { temperature: temp, num_predict: eco ? 512 : 2048 },
            system: withSys[0].content,
            messages: history.map(normalize),
          }),
        });
        if (!res.ok) throw new Error('Ollama respondió ' + res.status);
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop()!;
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const j = JSON.parse(line);
              if (j.message?.content) { acc += j.message.content; appendMd(aiBubble, acc); msgs.scrollTop = msgs.scrollHeight; }
            } catch {}
          }
        }
        if (!acc) throw new Error('Sin respuesta del modelo');
      } else {
        const wgModel = wgSel.value || wgSel.options[0]?.value;
        await wg.generateStream(wgModel, history as any, {
          maxTokens: eco ? 256 : 512,
          temperature: temp,
          onToken: (t) => { acc += t; appendMd(aiBubble, acc); msgs.scrollTop = msgs.scrollHeight; },
          onProgress: (p, d) => { stat.textContent = d; },
        });
      }
      messages.push({ role: 'assistant', content: acc });
      stream = true;
      stat.textContent = `${Math.round(acc.split(/\s+/).filter(Boolean).length / (eco ? 256 : 512) * 100)} tok aprox · ${messages.length} mensajes`;
    } catch (e: any) {
      aiBubble.textContent = 'Error: ' + e.message;
      stat.textContent = 'Hubo un error al generar.';
    } finally {
      abort = null;
      sendBtn.classList.toggle('hidden', false);
      stopBtn.classList.toggle('hidden', true);
    }
    pendingImage = null;
  }

  // vision
  let pendingImage: any = null;
  document.getElementById('imgBtn')!.addEventListener('click', () => (document.getElementById('fileIn') as HTMLInputElement).click());
  (document.getElementById('fileIn') as HTMLInputElement).addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const data = (await readAsDataURL(file)).split(',')[1];
    pendingImage = { type: 'image_url', image_url: { url: `data:${file.type};base64,${data}` } };
    stat.textContent = 'Imagen adjunta (si el modelo no es vision, se ignorará).';
  });

  // tts
  document.getElementById('ttsBtn')!.addEventListener('click', () => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!last || typeof last.content !== 'string') return;
    const audio = new Audio(`/api/tts?text=${encodeURIComponent(last.content.slice(0, 500))}`);
    audio.play().catch(() => stat.textContent = 'TTS no disponible (instala espeak-ng).');
  });

  // stt
  document.getElementById('sttBtn')!.addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const streamM = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(streamM);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const res = await fetch('/api/stt', { method: 'POST', body: blob });
      const j = await res.json();
      if (j.text) { input.value = (input.value + ' ' + j.text).trim(); input.focus(); }
      else stat.textContent = j.error || 'No se pudo transcribir.';
      streamM.getTracks().forEach((t) => t.stop());
    };
    rec.start();
    await new Promise((r) => setTimeout(r, 3500));
    rec.stop();
  });

  // comandos slash
  async function slash(cmd: string): Promise<boolean> {
    const [head, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(' ');
    switch (head) {
      case '/clear': messages = []; msgs.innerHTML = ''; return true;
      case '/model': if (arg) { model = arg; if (Array.from(modelSel.options).find((o) => o.value === arg)) modelSel.value = arg; } return true;
      case '/system': if (arg) system = arg; return true;
      case '/temp': temp = Math.min(2, Math.max(0, parseFloat(arg) || 0.7)); return true;
      case '/eco': eco = !eco; (document.getElementById('eco') as HTMLInputElement).checked = eco; return true;
      case '/code': codeMode = !codeMode; (document.getElementById('code') as HTMLInputElement).checked = codeMode; return true;
      case '/general': codeMode = false; (document.getElementById('code') as HTMLInputElement).checked = false; return true;
      case '/tokens': return true;
      case '/save': return saveSession(arg || `session-${Date.now()}`);
      case '/load':
        if (arg) { loadSession(arg); return true; }
        return true;
      case '/help':
        addMsg('assistant', 'Comandos: /clear /model <m> /system <p> /temp <0-2> /eco /code /general /tts /save <nombre> /load <nombre> /help');
        return true;
      default: return false;
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const v = input.value.trim();
      if (v.startsWith('/')) { if (slash(v.slice(1).trim())) input.value = ''; return; }
      send();
    }
  });
  sendBtn.addEventListener('click', () => {
    if (input.value.trim().startsWith('/')) { slash(input.value.trim().slice(1)); input.value = ''; } else send();
  });
  stopBtn.addEventListener('click', () => abort?.abort());
  backendSel.addEventListener('change', applyBackend);
  modelSel.addEventListener('change', () => { model = modelSel.value; });

  // sesiones
  const sessions: string[] = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
  const sp = document.getElementById('sessionPanel')!;
  document.getElementById('sessionsBtn')!.addEventListener('click', () => {
    sp.classList.toggle('hidden');
    sp.innerHTML = '';
    sessions.forEach((id) => {
      sp.appendChild(u.el('button', { class: 'btn btn-ghost text-xs justify-start w-full', text: id, onclick: () => loadSession(id) }));
    });
  });

  function saveSession(name: string): boolean {
    const key = `session:${name}`;
    localStorage.setItem(key, JSON.stringify(messages));
    if (!sessions.includes(name)) { sessions.push(name); localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); }
    stat.textContent = `Sesión guardada: ${name}`;
    return true;
  }
  function loadSession(name: string) {
    const raw = localStorage.getItem(`session:${name}`);
    if (!raw) return;
    messages = JSON.parse(raw);
    msgs.innerHTML = '';
    messages.forEach((m) => addMsg(m.role, m.content));
  }

  backendSel.value = backend;
  applyBackend();
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}