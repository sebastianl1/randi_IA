import { chat as ollamaChat, abort as ollamaAbort } from './ollama-client.js';
import { generateStream, abortGenerationWebGPU, getModelMaxTokens } from './webgpu-client.js';
import { DEFAULT_CONTEXT } from './config.js';

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('chat-input');
const sendBtn = document.getElementById('btn-send');
const stopBtn = document.getElementById('btn-stop');
const ctxBar = document.getElementById('context-bar');
const ctxIndicator = document.getElementById('ctx-indicator');

let currentAbort = null;
let isStreaming = false;
let contextLimit = DEFAULT_CONTEXT;

export function setContextLimit(limit) {
  if (limit > 0) contextLimit = limit;
  updateContextBar(getMessages());
}

export function removeWelcome() {
  const card = document.getElementById('welcome-card');
  if (card) card.remove();
}

export function getMessages() {
  const msgs = [];
  const els = messagesEl.querySelectorAll('.message');
  for (const el of els) {
    const role = el.dataset.role;
    const content = el.querySelector('.msg-content')?.dataset.content || '';
    if (role && content) msgs.push({ role, content });
  }
  return msgs;
}

export function setMessages(msgs) {
  removeWelcome();
  messagesEl.innerHTML = '';
  for (const m of msgs) {
    appendMessage(m.role, m.content);
  }
  scrollToBottom();
}

export function clearMessages() {
  removeWelcome();
  messagesEl.innerHTML = '';
  updateContextBar([]);
  scrollToBottom();
}

function sanitizeHtml(html) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((n) => n.remove());
    doc.querySelectorAll('*').forEach((n) => {
      [...n.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
          n.removeAttribute(attr.name);
        } else if (name === 'href' || name === 'src' || name === 'xlink:href') {
          const v = (attr.value || '').trim().toLowerCase();
          if (v.startsWith('javascript:') || v.startsWith('vbscript:') || v.startsWith('data:text/html')) {
            n.removeAttribute(attr.name);
          }
        }
      });
    });
    return doc.body.innerHTML;
  } catch {
    return html.replace(/[<>]/g, '');
  }
}

function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    try {
      return sanitizeHtml(marked.parse(text, { breaks: true, gfm: true }));
    } catch {}
  }
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function scrollToBottom() {
  const container = document.getElementById('chat-container');
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function formatTime() {
  const now = new Date();
  return now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function createMessageEl(role) {
  const div = document.createElement('div');
  div.className = 'message';
  div.dataset.role = role;

  const header = document.createElement('div');
  header.className = 'msg-header';

  const roleSpan = document.createElement('span');
  roleSpan.className = `msg-role ${role}`;
  const labels = { user: 'Tu', assistant: 'RANDI', system: 'Sistema' };
  roleSpan.textContent = labels[role] || role;

  const time = document.createElement('span');
  time.className = 'msg-time';
  time.textContent = formatTime();

  header.appendChild(roleSpan);
  header.appendChild(time);
  div.appendChild(header);

  const content = document.createElement('div');
  content.className = 'msg-content';
  content.dataset.content = '';
  div.appendChild(content);

  return div;
}

export function appendMessage(role, content) {
  const div = createMessageEl(role);
  const contentEl = div.querySelector('.msg-content');
  contentEl.innerHTML = role === 'user' ? escapeHtml(content) : renderMarkdown(content);
  contentEl.dataset.content = content;
  messagesEl.appendChild(div);
  scrollToBottom();
  updateContextBar(getMessages());
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function showTyping() {
  const div = document.createElement('div');
  div.className = 'message assistant typing-msg';
  div.id = 'typing-indicator';
  const content = document.createElement('div');
  content.className = 'msg-content';
  content.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
  div.appendChild(content);
  messagesEl.appendChild(div);
  scrollToBottom();
}

export function hideTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

function appendStreamingMessage(role) {
  hideTyping();
  const existing = document.getElementById('streaming-msg');
  if (existing) {
    existing.dataset.role = role;
    const roleSpan = existing.querySelector('.msg-role');
    if (roleSpan) roleSpan.className = `msg-role ${role}`;
    return existing;
  }

  const div = createMessageEl(role);
  div.id = 'streaming-msg';
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

export function updateStreamingContent(text) {
  const el = document.getElementById('streaming-msg');
  if (!el) return;
  const contentEl = el.querySelector('.msg-content');
  if (!contentEl) return;
  contentEl.innerHTML = renderMarkdown(text);
  contentEl.dataset.content = text;
  scrollToBottom();
}

// Render de markdown con throttling para no re-renderizar en cada token
function createThrottledRenderer(contentEl, renderFn) {
  let pending = false;
  let lastText = '';
  const apply = () => {
    pending = false;
    if (lastText) renderFn(lastText);
  };
  return {
    update(text) {
      lastText = text;
      if (pending) return;
      pending = true;
      requestAnimationFrame(apply);
    },
    flush() {
      if (lastText) renderFn(lastText);
    },
  };
}

export function finalizeStreaming(role, fullText, stats) {
  hideTyping();
  const el = document.getElementById('streaming-msg');
  if (el) {
    el.id = '';
    const contentEl = el.querySelector('.msg-content');
    if (contentEl) {
      contentEl.innerHTML = renderMarkdown(fullText);
      contentEl.dataset.content = fullText;
    }
    if (stats) {
      const statsDiv = document.createElement('div');
      statsDiv.className = 'msg-stats';
      statsDiv.textContent = stats;
      el.appendChild(statsDiv);
    }
  }
  updateContextBar(getMessages());
  scrollToBottom();
}

function showError(msg) {
  const div = document.createElement('div');
  div.className = 'message system';
  div.dataset.role = 'system';
  const content = document.createElement('div');
  content.className = 'msg-content';
  content.textContent = `Error: ${msg}`;
  div.appendChild(content);
  messagesEl.appendChild(div);
  scrollToBottom();
}

function setInputState(streaming) {
  isStreaming = streaming;
  inputEl.disabled = streaming;
  sendBtn.classList.toggle('hidden', streaming);
  stopBtn.classList.toggle('hidden', !streaming);
  if (!streaming) inputEl.focus();
}

export async function sendMessage(text, backend, model, temperature, systemPrompt) {
  const trimmed = text.trim();
  if (!trimmed || isStreaming) return;

  if (trimmed.startsWith('/')) {
    return handleCommand(trimmed);
  }

  appendMessage('user', trimmed);
  inputEl.value = '';
  autoResizeInput();
  setInputState(true);
  showTyping();

  const messages = getMessages();

  if (backend === 'ollama') {
    await new Promise((resolve) => {
      let fullText = '';
      const streamingEl = appendStreamingMessage('assistant');
      const contentEl = streamingEl.querySelector('.msg-content');
      const renderer = createThrottledRenderer(contentEl, (text) => {
        contentEl.innerHTML = renderMarkdown(text);
        contentEl.dataset.content = text;
        scrollToBottom();
      });

      ollamaChat(
        model,
        messages,
        (token) => {
          fullText += token;
          renderer.update(fullText);
        },
        (data) => {
          renderer.flush();
          if (data.aborted) {
            if (fullText) {
              finalizeStreaming('assistant', fullText, null);
            } else {
              hideTyping();
              updateContextBar(getMessages());
            }
          } else {
            const tps = data.tokens_per_second;
            const td = data.total_duration ? (data.total_duration / 1e9).toFixed(1) : null;
            const ec = data.eval_count;
            const parts = [];
            if (tps) parts.push(`${tps.toFixed(1)} tok/s`);
            if (td) parts.push(`${td}s`);
            if (ec) parts.push(`${ec} tok`);
            const stats = parts.length ? parts.join(' · ') : null;
            finalizeStreaming('assistant', fullText, stats);
          }
          setInputState(false);
          resolve();
        },
        (err) => {
          hideTyping();
          showError(err);
          setInputState(false);
          resolve();
        }
      );
    });
  } else if (backend === 'webgpu') {
    await new Promise((resolve) => {
      let fullText = '';
      const streamingEl = appendStreamingMessage('assistant');
      const chatMessages = [{ role: 'system', content: systemPrompt }, ...messages];
      const maxTokens = getModelMaxTokens(model);

      generateStream(
        chatMessages,
        temperature,
        maxTokens,
        (token) => {
          fullText = token;
          updateStreamingContent(token);
        },
        (data) => {
          if (data.aborted) {
            if (fullText) {
              finalizeStreaming('assistant', fullText, null);
            } else {
              hideTyping();
            }
          } else {
            const text = data.response || fullText;
            let stats = null;
            if (text && data.elapsedMs) {
              const secs = data.elapsedMs / 1000;
              const approxTokens = Math.max(1, Math.round(text.length / 4));
              stats = `${approxTokens} tok · ${(approxTokens / secs).toFixed(0)} tok/s · ${secs.toFixed(1)}s`;
            }
            finalizeStreaming('assistant', text, stats);
          }
          setInputState(false);
          resolve();
        },
        (err) => {
          hideTyping();
          showError(err);
          setInputState(false);
          resolve();
        }
      );
    });
  }
}

export function stopStreaming() {
  if (isStreaming) {
    ollamaAbort();
    abortGenerationWebGPU();
    setInputState(false);
  }
}

function handleCommand(cmd) {
  const parts = cmd.slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ');

  if (command === 'help') {
    const lines = [
      '**Comandos disponibles:**',
      '',
      '`/help`         - Mostrar esta ayuda',
      '`/clear`        - Limpiar conversación',
      '`/temp <n>`     - Ajustar temperatura (0-2)',
      '`/system <p>`   - Cambiar system prompt',
      '`/save <nom>`   - Guardar sesión',
      '`/load <nom>`   - Cargar sesión',
    ];
    appendMessage('system', lines.join('\n'));
    return;
  }

  if (command === 'clear') {
    clearMessages();
    return;
  }

  if (command === 'temp') {
    const val = parseFloat(arg);
    if (!isNaN(val) && val >= 0 && val <= 2) {
      document.getElementById('temperature').value = val;
      document.getElementById('temp-value').textContent = val;
      document.getElementById('temperature').dispatchEvent(new Event('input'));
      appendMessage('system', `Temperatura ajustada a ${val}`);
    } else {
      appendMessage('system', 'Uso: /temp <0.0-2.0>');
    }
    return;
  }

  if (command === 'system') {
    if (arg) {
      window.__setSystemPrompt?.(arg);
      appendMessage('system', 'System prompt actualizado');
    } else {
      appendMessage('system', 'Uso: /system <prompt>');
    }
    return;
  }

  if (command === 'save') {
    document.getElementById('btn-save-session').click();
    return;
  }

  if (command === 'load') {
    if (arg) {
      window.__loadSession?.(arg);
    } else {
      document.getElementById('btn-load-session').click();
    }
    return;
  }

  appendMessage('system', `Comando desconocido: ${command}. /help para ayuda.`);
}

export function updateContextBar(messages) {
  const total = messages.length;
  if (total === 0) {
    ctxBar.classList.add('hidden');
    return;
  }
  ctxBar.classList.remove('hidden');

  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const approxTokens = Math.round(totalChars * 0.3);
  const limit = contextLimit;
  const pct = Math.min(100, Math.round((approxTokens / limit) * 100));

  const color = pct < 50 ? 'var(--green)' : pct < 80 ? 'var(--yellow)' : 'var(--red)';

  ctxIndicator.innerHTML = `
    <span>ctx</span>
    <div class="ctx-bar">
      <div class="ctx-fill" style="width:${pct}%;background:${color}"></div>
    </div>
    <span>${approxTokens.toLocaleString()}/${limit.toLocaleString()}</span>
    <span>${total} msgs</span>
  `;
}

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

inputEl.addEventListener('input', autoResizeInput);

function autoResizeInput() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
}

sendBtn.addEventListener('click', () => {
  const event = new CustomEvent('send-message');
  window.dispatchEvent(event);
});

stopBtn.addEventListener('click', stopStreaming);
