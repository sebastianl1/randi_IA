// RANDI — Vista Chat: conectar con Ollama local via proxy.
import * as api from '../api.js';
import * as u from '../ui.js';

export default async function chatView(app, hw) {
  app.innerHTML = '';
  app.appendChild(u.el('h1', { class: 'page-title', text: 'Chat local' }));
  app.appendChild(u.el('p', { class: 'page-sub', text: 'Conectado a tu servidor Ollama local. 100% privado, sin internet.' }));

  const state = { messages: [], abort: null };

  // Selector de modelos instalados
  const sel = u.el('select', {}, u.el('option', { value: '', text: 'Cargando modelos…' }));
  app.appendChild(sel);

  // Indicador estado Ollama
  const stat = u.el('div', { class: 'conn' }, '…');
  app.appendChild(stat);

  try {
    await refreshModels(sel, stat);
  } catch (e) {
    stat.textContent = 'Ollama no disponible — ejecuta `randi serve`';
    stat.className = 'conn off';
  }

  const chat = u.el('div', { class: 'chat', id: 'chat' });
  const msgs = u.el('div', { class: 'messages' });
  chat.appendChild(msgs);

  const inputRow = u.el('div', { class: 'input-row' });
  const input = u.el('textarea', { rows: 1, placeholder: 'Escribe un mensaje… (Enter para enviar, Shift+Enter salto de línea)' });
  const sendBtn = u.el('button', { class: 'send', text: '➤' });
  const stopBtn = u.el('button', { class: 'stop', text: '■' });
  stopBtn.style.display = 'none';
  inputRow.append(input, sendBtn, stopBtn);
  chat.appendChild(inputRow);
  app.appendChild(chat);

  function addMsg(role, text) {
    const wrap = u.el('div', { class: 'msg ' + role });
    wrap.appendChild(u.el('div', { class: 'bubble', text: text }));
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
    return wrap;
  }

  async function refreshModels(sel, stat) {
    const res = await fetch('/api/tags');
    if (!res.ok) throw new Error('ollama down');
    const data = await res.json();
    const models = data.models || [];
    sel.innerHTML = '';
    models.forEach(m => sel.appendChild(u.el('option', { value: m.name, text: m.name })));
    stat.textContent = '● Ollama conectado · ' + models.length + ' modelos';
    stat.className = 'conn ok';
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    state.messages.push({ role: 'user', content: text });
    const model = sel.value || sel.options[0]?.value;
    addMsg('user', text);

    sendBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    const aiWrap = addMsg('assistant', '');

    const controller = new AbortController();
    state.abort = controller;
    const aiBubble = aiWrap.querySelector('.bubble');
    let acc = '';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: state.messages, stream: true }),
      });
      if (!res.ok) throw new Error('Ollama erróneo (' + res.status + ')');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const j = JSON.parse(line);
            if (j.message?.content) { acc += j.message.content; aiBubble.textContent = acc; msgs.scrollTop = msgs.scrollHeight; }
          } catch (e) {}
        }
      }
      if (acc) state.messages.push({ role: 'assistant', content: acc });
    } catch (e) {
      if (e.name !== 'AbortError') aiBubble.textContent = 'Error: ' + e.message;
    } finally {
      state.abort = null;
      sendBtn.style.display = 'inline-block';
      stopBtn.style.display = 'none';
    }
  }

  sendBtn.addEventListener('click', send);
  stopBtn.addEventListener('click', () => state.abort && state.abort.abort());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  input.focus();
}
