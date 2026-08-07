import { checkServer, listModels } from './ollama-client.js';
import { getAvailableModels, downloadModel, isModelLoaded, getLoadedModelId, isModelCached, getCachedModelIds, getModelInfo, getModelContext, isLoading as isGPUModelLoading, removeCachedModel } from './webgpu-client.js';
import { loadCatalog, getOllamaContext, getOllamaModelInfo } from './catalog.js';
import { DEFAULT_BACKEND, DEFAULT_TEMPERATURE, DEFAULT_SYSTEM_PROMPT } from './config.js';
import {
  sendMessage, clearMessages, setMessages,
  getMessages, updateContextBar, showTyping, hideTyping,
  appendMessage, removeWelcome, setContextLimit,
  toggleMic, generateImage,
} from './chat-ui.js';

const state = {
  backend: DEFAULT_BACKEND,
  model: '',
  temperature: DEFAULT_TEMPERATURE,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  ollamaOnline: false,
  messages: [],
  eco: false,
  codeMode: false,
  tts: false,
  pendingImage: null,
};

const modelSelect = document.getElementById('model-select');
const modelName = document.getElementById('model-name');
const connectionDot = document.getElementById('connection-dot');
const btnBackendOllama = document.getElementById('btn-backend-ollama');
const btnBackendWebgpu = document.getElementById('btn-backend-webgpu');
const webgpuActions = document.getElementById('webgpu-actions');
const btnDownload = document.getElementById('btn-download-model');
const modelLoading = document.getElementById('model-loading');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const ollamaStatusText = document.getElementById('ollama-status-text');
const ollamaDot = document.getElementById('ollama-dot');
const tempSlider = document.getElementById('temperature');
const tempValue = document.getElementById('temp-value');
const btnSave = document.getElementById('btn-save-session');
const btnLoad = document.getElementById('btn-load-session');
const btnClear = document.getElementById('btn-clear');
const modelStatus = document.getElementById('model-status');
const availableModelsSection = document.getElementById('available-models-section');
const availableModelsList = document.getElementById('available-models-list');
const availableCount = document.getElementById('available-count');
const modelBar = document.getElementById('model-bar');
const modelBarText = document.getElementById('model-bar-text');
const modelBarClose = document.getElementById('model-bar-close');
const btnAttach = document.getElementById('btn-attach');
const fileInput = document.getElementById('file-input');
const attachPreview = document.getElementById('attach-preview');
const attachImg = document.getElementById('attach-img');
const attachRemove = document.getElementById('attach-remove');
const btnMic = document.getElementById('btn-mic');
const btnImagegen = document.getElementById('btn-imagegen');
const ecoToggle = document.getElementById('eco-toggle');
const codeToggle = document.getElementById('code-toggle');
const ttsToggle = document.getElementById('tts-toggle');

function showModelBar(text, type) {
  modelBar.className = 'model-bar ' + type;
  modelBarText.textContent = text;
  modelBar.classList.remove('hidden');
}

function hideModelBar() {
  modelBar.classList.add('hidden');
}

window.__setSystemPrompt = (prompt) => {
  state.systemPrompt = prompt;
};

window.__setEco = (val) => {
  if (ecoToggle) {
    ecoToggle.checked = !!val;
    ecoToggle.dispatchEvent(new Event('change'));
  }
};

window.__setCode = (val) => {
  if (codeToggle) {
    codeToggle.checked = !!val;
    codeToggle.dispatchEvent(new Event('change'));
  }
};

window.__setTts = (val) => {
  if (ttsToggle) {
    ttsToggle.checked = !!val;
    ttsToggle.dispatchEvent(new Event('change'));
  }
};

window.__attachImage = () => fileInput.click();

function setModelStatus(status) {
  modelStatus.className = 'status-indicator ' + status;
}

function saveState() {
  try {
    localStorage.setItem('randi_state', JSON.stringify({
      backend: state.backend,
      model: state.model,
      temperature: state.temperature,
      systemPrompt: state.systemPrompt,
      eco: state.eco,
      codeMode: state.codeMode,
      tts: state.tts,
    }));
  } catch {}
}

function loadSavedState() {
  try {
    const saved = localStorage.getItem('randi_state');
    if (saved) {
      const data = JSON.parse(saved);
      state.backend = data.backend || DEFAULT_BACKEND;
      state.temperature = data.temperature ?? DEFAULT_TEMPERATURE;
      state.systemPrompt = data.systemPrompt || state.systemPrompt;
      state.model = data.model || '';
      state.eco = !!data.eco;
      state.codeMode = !!data.codeMode;
      state.tts = !!data.tts;
      tempSlider.value = state.temperature;
      tempValue.textContent = state.temperature;
      if (ecoToggle) ecoToggle.checked = state.eco;
      if (codeToggle) codeToggle.checked = state.codeMode;
      if (ttsToggle) ttsToggle.checked = state.tts;
      if (state.backend === 'webgpu') {
        document.querySelector('[data-backend="webgpu"]').classList.add('active');
        document.querySelector('[data-backend="ollama"]').classList.remove('active');
        webgpuActions.classList.remove('hidden');
      } else {
        webgpuActions.classList.add('hidden');
      }
    }
  } catch {}
}

async function init() {
  try {
    await loadCatalog();
  } catch (e) {
    console.warn('No se pudo cargar el catalogo:', e);
  }
  loadSavedState();
  syncContextLimit();
  populateWebGPUModels();
  populateAvailableModels();
  await checkOllamaStatus();
  await refreshModels();

  if (state.backend === 'webgpu' && state.model) {
    modelSelect.value = state.model;
    modelName.textContent = state.model;
    if (isModelCached(state.model) && !isModelLoaded()) {
      await loadCachedModel(state.model);
    } else if (isModelLoaded()) {
      updateWebGPUButtonState();
    }
  } else if (state.model) {
    modelName.textContent = state.model;
  }

  if (state.model) {
    removeWelcome();
  }
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function formatProgress(pct, loaded, total) {
  let s = pct + '%';
  if (loaded != null && total != null && total > 0) {
    const pct2 = Math.round((loaded / total) * 100);
    s = pct2 + '% (' + formatSize(loaded) + ' / ' + formatSize(total) + ')';
  } else if (loaded != null) {
    s = pct + '% (' + formatSize(loaded) + ')';
  }
  return s;
}

async function loadCachedModel(modelId) {
  modelLoading.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Preparando todo...';
  try {
    await downloadModel(modelId, (progress) => {
      if (progress.status === 'download' || progress.status === 'load') {
        progressFill.style.width = `${Math.max(progress.percent, 5)}%`;
        const detail = formatProgress(progress.percent, progress.loaded, progress.total);
        progressText.textContent = detail;
      } else if (progress.status === 'ready') {
        progressFill.style.width = '100%';
        progressText.textContent = 'Modelo listo';
      }
    });
  } catch (err) {
    progressText.textContent = `Error: ${err.message}`;
  }
}

async function checkOllamaStatus() {
  const online = await checkServer();
  state.ollamaOnline = online;
  const text = online ? 'conectado' : 'desconectado';
  ollamaStatusText.textContent = text;
  ollamaDot.className = 'status-dot ' + (online ? 'online' : 'offline');
  connectionDot.className = 'conn-dot ' + (online ? 'online' : 'offline');
  return online;
}

function populateWebGPUModels() {
  const models = getAvailableModels();
  const currentValue = modelSelect.value;
  modelSelect.innerHTML = '<option value="">Seleccionar...</option>';
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m.id;
    const cached = isModelCached(m.id);
    const badge = cached ? ' ✓' : '';
    const loaded = cached && getLoadedModelId() === m.id ? ' (cargado)' : cached ? ' (en caché)' : '';
    opt.textContent = `${m.name} (${m.size})${badge}${loaded}`;
    opt.title = `${m.description} - RAM: ${m.ram}${cached ? ' - Ya descargado' : ''}`;
    if (isModelLoaded() && getLoadedModelId() === m.id) {
      opt.style.fontWeight = 'bold';
      opt.style.color = 'var(--green)';
    } else if (cached) {
      opt.style.color = 'var(--accent)';
    }
    modelSelect.appendChild(opt);
  }
  if (currentValue) modelSelect.value = currentValue;
}

function populateAvailableModels() {
  const cachedIds = getCachedModelIds();
  if (cachedIds.length === 0) {
    availableModelsSection.classList.add('hidden');
    return;
  }
  availableModelsSection.classList.remove('hidden');
  availableCount.textContent = cachedIds.length;
  availableModelsList.innerHTML = '';
  for (const id of cachedIds) {
    const info = getModelInfo(id);
    const item = document.createElement('div');
    item.className = 'available-model-item';
    const isLoaded = getLoadedModelId() === id;
    const statusClass = isLoaded ? 'loaded' : 'cached';
    const statusText = isLoaded ? 'cargado' : 'en caché';
    const displayName = info ? info.name : id.split('/').pop();
    item.innerHTML = `
      <span class="av-name">${displayName}</span>
      <div class="av-actions">
        <span class="av-status ${statusClass}">${statusText}</span>
        <button class="av-delete" data-id="${id}" title="Eliminar de caché">✕</button>
      </div>
    `;
    item.querySelector('.av-name').addEventListener('click', async () => {
      state.model = id;
      modelSelect.value = id;
      saveState();
      updateTopBar();
      removeWelcome();
      if (isLoaded) {
        updateWebGPUButtonState();
      } else {
        await loadCachedModel(id);
      }
    });
    const delBtn = item.querySelector('.av-delete');
    if (!isLoaded) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCachedModel(id);
        populateAvailableModels();
        populateWebGPUModels();
        if (state.model === id) {
          state.model = '';
          modelSelect.value = '';
          modelName.textContent = 'RANDI';
          updateWebGPUButtonState();
          saveState();
        }
      });
    } else {
      delBtn.style.display = 'none';
    }
    availableModelsList.appendChild(item);
  }
}

async function refreshModels() {
  if (state.backend === 'ollama') {
    setModelStatus('loading');
    const models = await listModels();
    const currentValue = modelSelect.value;
    modelSelect.innerHTML = '<option value="">Seleccionar...</option>';
    if (models.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No hay modelos (randi pull)';
      opt.disabled = true;
      modelSelect.appendChild(opt);
      setModelStatus('error');
    } else {
      for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m.name;
        const size = m.size > 1e9 ? `${(m.size / 1e9).toFixed(1)}GB` :
                     m.size > 1e6 ? `${(m.size / 1e6).toFixed(1)}MB` : `${m.size}B`;
        opt.textContent = `${m.name} (${size})`;
        modelSelect.appendChild(opt);
      }
      setModelStatus('ready');
    }
    if (currentValue) {
      const exists = Array.from(modelSelect.options).some(o => o.value === currentValue);
      if (exists) modelSelect.value = currentValue;
    }
  } else {
    setModelStatus(isModelLoaded() ? 'ready' : '');
    if (state.model && isModelLoaded() && state.model === getLoadedModelId()) {
      modelSelect.value = state.model;
    }
  }
}

function updateTopBar() {
  modelName.textContent = state.model || 'RANDI';
}

function syncContextLimit() {
  let limit = state.backend === 'webgpu'
    ? getModelContext(state.model)
    : getOllamaContext(state.model);
  if (state.eco && limit > 0) limit = Math.min(limit, 2048);
  setContextLimit(limit);
}

async function switchBackend(backend) {
  state.backend = backend;
  saveState();
  syncContextLimit();

  webgpuActions.classList.toggle('hidden', backend !== 'webgpu');

  if (backend === 'webgpu') {
    populateWebGPUModels();
    populateAvailableModels();
    setModelStatus(isModelLoaded() ? 'ready' : '');
    if (state.model) {
      const exists = Array.from(modelSelect.options).some(o => o.value === state.model);
      if (exists) {
        modelSelect.value = state.model;
        if (isModelCached(state.model) && !isModelLoaded()) {
          await loadCachedModel(state.model);
        } else {
          updateWebGPUButtonState();
        }
      }
    }
  } else {
    refreshModels();
  }

  document.querySelectorAll('.backend-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-backend="${backend}"]`).classList.add('active');

  updateContextBar(getMessages());
}

function updateWebGPUButtonState() {
  if (!state.model) {
    btnDownload.textContent = 'Descargar modelo';
    btnDownload.disabled = true;
    return;
  }
  if (isModelLoaded() && getLoadedModelId() === state.model) {
    btnDownload.textContent = 'Modelo cargado';
    btnDownload.disabled = true;
  } else if (isModelCached(state.model)) {
    btnDownload.textContent = 'Cargar desde caché';
    btnDownload.disabled = false;
  } else {
    btnDownload.textContent = 'Descargar modelo';
    btnDownload.disabled = false;
  }
}

document.querySelectorAll('.backend-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchBackend(btn.dataset.backend);
  });
});

modelSelect.addEventListener('change', async () => {
  state.model = modelSelect.value;
  saveState();
  updateTopBar();
  syncContextLimit();

  if (state.model) {
    removeWelcome();
  }

  if (state.backend === 'webgpu' && state.model) {
    if (isModelLoaded() && getLoadedModelId() === state.model) {
      updateWebGPUButtonState();
    } else if (isModelCached(state.model)) {
      await loadCachedModel(state.model);
    } else {
      updateWebGPUButtonState();
    }
  }
});

tempSlider.addEventListener('input', () => {
  state.temperature = parseFloat(tempSlider.value);
  tempValue.textContent = state.temperature;
  saveState();
});

/* ─── Adjuntar imagen (vision) ─── */

btnAttach.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Solo se admiten imagenes', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    state.pendingImage = reader.result;
    attachImg.src = state.pendingImage;
    attachPreview.classList.remove('hidden');
    if (state.backend !== 'ollama') {
      showToast('Vision requiere el backend Ollama', 'warning');
    } else {
      const info = getOllamaModelInfo(state.model);
      if (state.model && info && info.type !== 'vision') {
        showToast('Este modelo no es de vision. Prueba: gemma3:1b, llava, qwen2.5vl', 'warning');
      }
    }
  };
  reader.readAsDataURL(file);
});

attachRemove.addEventListener('click', () => {
  state.pendingImage = null;
  attachPreview.classList.add('hidden');
  attachImg.src = '';
  fileInput.value = '';
});

btnMic.addEventListener('click', () => {
  btnMic.classList.toggle('recording');
  toggleMic();
});

/* ─── Generacion de imagenes ─── */

btnImagegen.addEventListener('click', () => {
  document.getElementById('imagegen-modal').classList.remove('hidden');
  document.getElementById('ig-prompt').value = '';
  document.getElementById('ig-result').classList.add('hidden');
  document.getElementById('ig-result').src = '';
  document.getElementById('ig-generate').disabled = false;
});

document.getElementById('ig-cancel').addEventListener('click', () => {
  document.getElementById('imagegen-modal').classList.add('hidden');
});

document.getElementById('ig-generate').addEventListener('click', async () => {
  const prompt = document.getElementById('ig-prompt').value.trim();
  const engine = document.getElementById('ig-engine').value;
  if (!prompt) return;
  const btn = document.getElementById('ig-generate');
  const status = document.getElementById('ig-status');
  const result = document.getElementById('ig-result');
  btn.disabled = true;
  status.textContent = 'Generando (requiere ComfyUI/A1111 local)...';
  status.classList.remove('hidden');
  try {
    const { ok, data } = await generateImage(prompt, engine);
    if (ok && data.image) {
      result.src = 'data:image/png;base64,' + data.image;
      result.classList.remove('hidden');
      status.textContent = '';
      status.classList.add('hidden');
    } else {
      status.textContent = data.error || 'Error al generar imagen';
    }
  } catch {
    status.textContent = 'Error al generar imagen';
  } finally {
    btn.disabled = false;
  }
});

/* ─── Toggles eco / codigo / tts ─── */

ecoToggle.addEventListener('change', () => {
  state.eco = ecoToggle.checked;
  syncContextLimit();
  saveState();
});

codeToggle.addEventListener('change', () => {
  state.codeMode = codeToggle.checked;
  saveState();
});

ttsToggle.addEventListener('change', () => {
  state.tts = ttsToggle.checked;
  saveState();
});

btnDownload.addEventListener('click', async () => {
  const modelId = state.model;
  if (!modelId) return;

  modelLoading.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Preparando...';

  try {
    await downloadModel(modelId, (progress) => {
      if (progress.status === 'download' || progress.status === 'load') {
        progressFill.style.width = `${Math.max(progress.percent, 5)}%`;
        const detail = formatProgress(progress.percent, progress.loaded, progress.total);
        progressText.textContent = detail;
      } else if (progress.status === 'ready') {
        progressFill.style.width = '100%';
        progressText.textContent = 'Modelo listo';
      }
    });
  } catch (err) {
    progressText.textContent = `Error: ${err.message}`;
  }
});

window.addEventListener('send-message', async () => {
  const input = document.getElementById('chat-input');
  const text = input.value;
  if (!text.trim()) return;

  if (!state.model) {
    showTyping();
    setTimeout(() => {
      hideTyping();
      appendMessage('system', 'Selecciona un modelo desde el menú primero.');
    }, 100);
    return;
  }

  if (state.backend === 'ollama' && !state.ollamaOnline) {
    showTyping();
    setTimeout(() => {
      hideTyping();
      appendMessage('system', 'Ollama no está corriendo. Ejecuta: randi serve');
    }, 100);
    return;
  }

  if (state.backend === 'webgpu') {
    if (isGPUModelLoading) {
      showTyping();
      setTimeout(() => {
        hideTyping();
        appendMessage('system', 'El modelo se está cargando, espera un momento...');
      }, 100);
      return;
    }
    if (!isModelLoaded()) {
      showTyping();
      setTimeout(() => {
        hideTyping();
        appendMessage('system', 'Selecciona un modelo desde el menú primero.');
      }, 100);
      return;
    }
  }

  const systemPrompt = state.codeMode
    ? 'Eres RANDI en modo programador. Das respuestas de codigo precisas, con explicaciones breves y ejemplos funcionales.'
    : state.systemPrompt;

  const imagePayload = state.pendingImage ? [state.pendingImage] : null;
  await sendMessage(text, state.backend, state.model, state.temperature, systemPrompt,
    imagePayload, state.tts);
  if (state.pendingImage) {
    state.pendingImage = null;
    attachPreview.classList.add('hidden');
    attachImg.src = '';
    fileInput.value = '';
  }
  saveState();
});

btnClear.addEventListener('click', () => {
  clearMessages();
});

btnSave.addEventListener('click', () => {
  const modal = document.getElementById('session-modal');
  const title = document.getElementById('modal-title');
  const input = document.getElementById('modal-input');
  const list = document.getElementById('session-list');
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');

  title.textContent = 'Guardar sesión';
  input.value = `sesión_${new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '')}`;
  input.style.display = 'block';
  list.innerHTML = '';
  list.style.display = 'none';

  modal.classList.remove('hidden');
  input.focus();

  const onConfirm = () => {
    const name = input.value.trim();
    if (name) {
      const msgs = getMessages();
      const data = {
        name,
        model: state.model,
        backend: state.backend,
        temperature: state.temperature,
        systemPrompt: state.systemPrompt,
        messages: msgs,
        savedAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem(`randi_session_${name}`, JSON.stringify(data));
        appendMessage('system', `Sesión guardada: ${name}`);
      } catch {
        appendMessage('system', 'Error al guardar la sesión');
      }
    }
    modal.classList.add('hidden');
    cleanup();
  };

  const onCancel = () => {
    modal.classList.add('hidden');
    cleanup();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') onConfirm();
    if (e.key === 'Escape') onCancel();
  };

  const cleanup = () => {
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
    input.removeEventListener('keydown', onKeyDown);
  };

  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
  input.addEventListener('keydown', onKeyDown);
});

btnLoad.addEventListener('click', () => {
  const modal = document.getElementById('session-modal');
  const title = document.getElementById('modal-title');
  const input = document.getElementById('modal-input');
  const list = document.getElementById('session-list');
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');

  title.textContent = 'Cargar sesión';
  input.style.display = 'none';
  list.style.display = 'block';
  list.innerHTML = '';

  const sessions = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('randi_session_')) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        sessions.push(data);
      } catch {}
    }
  }

  if (sessions.length === 0) {
    list.innerHTML = '<div class="session-item" style="color:var(--text-dim)">No hay sesiones guardadas</div>';
  } else {
    sessions.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    for (const s of sessions) {
      const item = document.createElement('div');
      item.className = 'session-item';
      const date = new Date(s.savedAt).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      });
      item.innerHTML = `
        <span class="session-name">${escapeHtml(s.name)}</span>
        <span class="session-info">${escapeHtml(s.model || '?')} · ${s.messages?.length || 0} msgs · ${date}</span>
      `;
      item.addEventListener('click', () => {
        window.__loadSession?.(s.name);
        modal.classList.add('hidden');
        cleanup();
      });
      list.appendChild(item);
    }
  }

  modal.classList.remove('hidden');

  const onCancel = () => {
    modal.classList.add('hidden');
    cleanup();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') onCancel();
  };

  const cleanup = () => {
    cancelBtn.removeEventListener('click', onCancel);
    document.removeEventListener('keydown', onKeyDown);
  };

  cancelBtn.addEventListener('click', onCancel);
  document.addEventListener('keydown', onKeyDown);
});

window.__loadSession = async (name) => {
  try {
    const data = JSON.parse(localStorage.getItem(`randi_session_${name}`));
    if (!data) return;
    state.model = data.model || state.model;
    state.temperature = data.temperature ?? state.temperature;
    state.systemPrompt = data.systemPrompt || state.systemPrompt;
    tempSlider.value = state.temperature;
    tempValue.textContent = state.temperature;
    if (data.backend && data.backend !== state.backend) {
      switchBackend(data.backend);
    }
    if (data.messages) {
      removeWelcome();
      setMessages(data.messages);
    }
    if (data.model && modelSelect.querySelector(`[value="${data.model}"]`)) {
      modelSelect.value = data.model;
      if (data.backend === 'webgpu' && isModelCached(data.model) && !isModelLoaded()) {
        await loadCachedModel(data.model);
      }
    }
    if (data.model) {
      modelName.textContent = data.model;
    }
    syncContextLimit();
    saveState();
    appendMessage('system', `Sesión cargada: ${name}`);
  } catch {
    appendMessage('system', 'Error al cargar la sesión');
  }
};

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('session-modal').classList.add('hidden');
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* ─── Bottom Sheet toggle ─── */

function openSheet() {
  document.getElementById('settings-sheet').classList.remove('hidden');
  document.getElementById('sheet-backdrop').classList.remove('hidden');
  if (state.backend === 'webgpu') {
    populateAvailableModels();
  }
}

function closeSheet() {
  document.getElementById('settings-sheet').classList.add('hidden');
  document.getElementById('sheet-backdrop').classList.add('hidden');
}

document.getElementById('btn-model').addEventListener('click', () => {
  if (document.getElementById('settings-sheet').classList.contains('hidden')) {
    openSheet();
  } else {
    closeSheet();
  }
});

document.getElementById('sheet-backdrop').addEventListener('click', closeSheet);

document.querySelectorAll('.btn-secondary, .btn-primary').forEach(el => {
  el.addEventListener('click', () => {
    if (el.closest('.modal')) return;
    if (el.closest('.backend-btn')) return;
    setTimeout(closeSheet, 180);
  });
});

/* ─── Model loading events ─── */

function showToast(message, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

window.addEventListener('randi-model-loading', (e) => {
  const { modelId } = e.detail;
  const info = getModelInfo(modelId);
  const name = info ? info.name : modelId;
  showModelBar(`Cargando ${name}...`, 'loading');
  btnDownload.textContent = 'Cargando...';
  btnDownload.disabled = true;
  modelName.textContent = name;
});

window.addEventListener('randi-model-ready', (e) => {
  const { modelId } = e.detail;
  const info = getModelInfo(modelId);
  const name = info ? info.name : modelId;
  showModelBar(`${name} listo`, 'ready');
  setTimeout(hideModelBar, 3000);
  setModelStatus('ready');
  btnDownload.textContent = 'Modelo cargado';
  btnDownload.disabled = true;
  modelLoading.classList.add('hidden');
  modelName.textContent = name;
  showToast(`${name} listo`, 'success');
  populateWebGPUModels();
  populateAvailableModels();
  updateWebGPUButtonState();
});

window.addEventListener('randi-model-error', (e) => {
  const { error } = e.detail;
  showModelBar(`Error: ${error}`, 'error');
  setModelStatus('error');
  btnDownload.textContent = 'Descargar modelo';
  btnDownload.disabled = false;
  modelLoading.classList.add('hidden');
  showToast(error, 'error');
});

modelBarClose.addEventListener('click', hideModelBar);

// Poll Ollama status
setInterval(async () => {
  const online = await checkServer();
  if (online !== state.ollamaOnline) {
    state.ollamaOnline = online;
    const text = online ? 'conectado' : 'desconectado';
    ollamaStatusText.textContent = text;
    ollamaDot.className = 'status-dot ' + (online ? 'online' : 'offline');
    connectionDot.className = 'conn-dot ' + (online ? 'online' : 'offline');
    if (state.backend === 'ollama') {
      refreshModels();
    }
  }
}, 10000);

init();
