export const WEBGPU_MODELS = [
  {
    id: 'onnx-community/gemma-3-270m-it-ONNX',
    name: 'Gemma 3 270M',
    size: '~200 MB',
    ram: '1 GB+',
    context: 4096,
    maxTokens: 1024,
    description: 'Google Gemma 3 ultra ligero',
  },
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    name: 'Qwen2.5 0.5B Instruct',
    size: '~300 MB',
    ram: '1 GB+',
    context: 8192,
    maxTokens: 1024,
    description: 'Super ligero y rápido',
  },
  {
    id: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct',
    name: 'Qwen2.5 Coder 0.5B',
    size: '~300 MB',
    ram: '1 GB+',
    context: 8192,
    maxTokens: 1024,
    description: 'Código super ligero',
  },
  {
    id: 'Xenova/tinyllama-1.1b-chat-v1.0',
    name: 'TinyLlama 1.1B Chat',
    size: '~700 MB',
    ram: '2 GB+',
    context: 2048,
    maxTokens: 1024,
    description: 'Ligero y versátil',
  },
  {
    id: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
    name: 'Llama 3.2 1B',
    size: '~700 MB',
    ram: '2 GB+',
    context: 8192,
    maxTokens: 1024,
    description: 'Meta Llama 3.2',
  },
  {
    id: 'onnx-community/gemma-3-1b-it-ONNX-GQA',
    name: 'Gemma 3 1B IT',
    size: '~700 MB',
    ram: '2 GB+',
    context: 8192,
    maxTokens: 1024,
    description: 'Google Gemma 3',
  },
  {
    id: 'onnx-community/Qwen2.5-1.5B-Instruct',
    name: 'Qwen2.5 1.5B Instruct',
    size: '~900 MB',
    ram: '2 GB+',
    context: 16384,
    maxTokens: 2048,
    description: 'Balanceado general',
  },
  {
    id: 'onnx-community/Qwen2.5-Coder-1.5B-Instruct',
    name: 'Qwen2.5 Coder 1.5B',
    size: '~900 MB',
    ram: '2 GB+',
    context: 16384,
    maxTokens: 2048,
    description: 'Código balanceado',
  },
  {
    id: 'onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX',
    name: 'DeepSeek R1 Distill 1.5B',
    size: '~1 GB',
    ram: '3 GB+',
    context: 8192,
    maxTokens: 1024,
    description: 'Razonamiento profundo',
  },
  {
    id: 'Xenova/phi-3-mini-4k-instruct',
    name: 'Phi-3 Mini 4K',
    size: '~2 GB',
    ram: '4 GB+',
    context: 4096,
    maxTokens: 1024,
    description: 'Microsoft Phi-3',
  },
];

export function getModelInfo(modelId) {
  return WEBGPU_MODELS.find((m) => m.id === modelId) || null;
}

export function getModelContext(modelId) {
  const info = getModelInfo(modelId);
  return info?.context || 8192;
}

export function getModelMaxTokens(modelId) {
  const info = getModelInfo(modelId);
  return info?.maxTokens || 1024;
}

let transformersPipeline = null;
let loadedModelId = null;
let abortGeneration = false;
export let isLoading = false;

function getCachedModels() {
  try {
    const raw = localStorage.getItem('randi_webgpu_cached');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function markModelCached(modelId) {
  try {
    const cached = getCachedModels();
    cached.add(modelId);
    localStorage.setItem('randi_webgpu_cached', JSON.stringify([...cached]));
  } catch {}
}

export function removeCachedModel(modelId) {
  try {
    const cached = getCachedModels();
    cached.delete(modelId);
    localStorage.setItem('randi_webgpu_cached', JSON.stringify([...cached]));
    if (loadedModelId === modelId) {
      unloadModel();
    }
  } catch {}
}

export function isModelCached(modelId) {
  return getCachedModels().has(modelId);
}

export function getCachedModelIds() {
  return [...getCachedModels()];
}

export function getAvailableModels() {
  return WEBGPU_MODELS;
}

export function isModelLoaded() {
  return loadedModelId !== null;
}

export function getLoadedModelId() {
  return loadedModelId;
}

const VERSION = '4.2.0';
const CDN = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${VERSION}`;

async function loadTransformers() {
  if (window.__transformers) return window.__transformers;
  const module = await import(CDN);
  window.__transformers = module;
  return module;
}

async function webgpuAvailable() {
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

// Watchdog por fase: solo avisa si algo se estanca. NO cancela durante
// carga/compilación de shaders, que puede tardar minutos sin progreso.
function createWatchdog(phase, onStall) {
  let lastActivity = Date.now();
  let warned = {};

  const limits = { init: 120, download: 1200, load: 1800 };
  const messages = {
    init: 'Conectando con Hugging Face...',
    download: 'Descarga lenta, pero sigue en progreso...',
    load: 'Compilando shaders WebGPU (la primera vez tarda varios minutos)...',
  };

  const timer = setInterval(() => {
    const limit = limits[phase] || 300;
    const elapsed = (Date.now() - lastActivity) / 1000;
    if (elapsed > limit && !warned[phase]) {
      warned[phase] = true;
      onStall?.(messages[phase] || 'Preparando el modelo, por favor espera...');
    }
  }, 5000);

  return { touch: () => { lastActivity = Date.now(); warned = {}; }, stop: () => clearInterval(timer) };
}

function computePercent(p) {
  if (p.progress != null && !isNaN(p.progress)) return p.progress;
  if (p.total && p.loaded != null && p.total > 0) return (p.loaded / p.total) * 100;
  return 0;
}

export async function downloadModel(modelId, onProgress) {
  if (isLoading) {
    onProgress?.({ status: 'error', percent: 0, text: 'Ya hay una descarga en curso. Espera a que termine.' });
    return;
  }
  isLoading = true;
  window.dispatchEvent(new CustomEvent('randi-model-loading', { detail: { modelId } }));

  const info = getModelInfo(modelId);
  const modelName = info ? info.name : modelId;

  const sendProgress = (status, pct, text, detail) => {
    onProgress?.({ status, percent: pct, text, loaded: detail?.loaded, total: detail?.total });
  };
  const onStall = (text) => sendProgress('download', 50, text);

  sendProgress('download', 0, 'Iniciando...');

  let watchdog;
  try {
    watchdog = createWatchdog('init', onStall);
    const { pipeline } = await loadTransformers();
    watchdog.stop();
    watchdog = createWatchdog('init', onStall);

    sendProgress('download', 3, 'Preparando componentes...');
    watchdog.touch();

    sendProgress('download', 5, 'Verificando WebGPU...');
    watchdog.touch();
    const hasWebGPU = await webgpuAvailable();
    const device = hasWebGPU ? 'webgpu' : 'cpu';
    if (!hasWebGPU) sendProgress('download', 6, 'WebGPU no disponible, usando CPU (más lento)');

    watchdog.stop();
    watchdog = createWatchdog('download', onStall);

    // Fallback robusto de dtype para evitar colgarse en cuantización on-the-fly
    const deviceAttempts = hasWebGPU
      ? [{ device: 'webgpu', dtypes: ['q4', 'q8', 'fp16', 'fp32'] }, { device: 'cpu', dtypes: ['q8', 'fp32'] }]
      : [{ device: 'cpu', dtypes: ['q8', 'fp32'] }];
    let pipe = null;
    let lastErr = null;

    for (const attempt of deviceAttempts) {
      for (const dtype of attempt.dtypes) {
        watchdog.touch();
        sendProgress('download', Math.min(10, 8 + Math.random() * 2), `Cargando componentes (${dtype})...`);
        try {
          pipe = await pipeline('text-generation', modelId, {
            device: attempt.device,
            dtype,
            progress_callback: (p) => {
              watchdog.touch();
              if (p.status === 'progress' || p.status === 'download') {
                const pct = computePercent(p);
                const scaled = Math.round(10 + pct * 0.85);
                sendProgress('download', Math.min(scaled, 90), `Descargando ${modelName}...`, p);
              } else if (p.status === 'load') {
                sendProgress('load', 95, 'Cargando modelo en memoria...', p);
              } else if (p.status === 'ready' || p.status === 'done') {
                sendProgress('load', 95, 'Modelo preparado, finalizando...');
              }
            },
          });
          break;
        } catch (e) {
          console.warn(`Fallo el intento con ${attempt.device}/${dtype}:`, e);
          lastErr = e;
        }
      }
      if (pipe) break;
    }

    if (!pipe) throw lastErr || new Error('No se pudo cargar el modelo');

    watchdog.stop();

    transformersPipeline = pipe;
    loadedModelId = modelId;
    markModelCached(modelId);
    isLoading = false;
    window.dispatchEvent(new CustomEvent('randi-model-ready', { detail: { modelId } }));
    onProgress?.({ status: 'ready', percent: 100, text: 'Modelo listo' });
  } catch (err) {
    watchdog?.stop();
    isLoading = false;
    const msg = err.message || 'Error desconocido';
    window.dispatchEvent(new CustomEvent('randi-model-error', { detail: { modelId, error: msg } }));
    onProgress?.({ status: 'error', percent: 0, text: msg });
  }
}

export async function generateStream(messages, temperature, maxTokens, onToken, onDone, onError) {
  if (!transformersPipeline) {
    onError?.('Modelo no cargado');
    return;
  }
  abortGeneration = false;
  const t0 = performance.now();
  try {
    const genOpts = {
      max_new_tokens: maxTokens || 1024,
      temperature: temperature ?? 0.7,
      do_sample: true,
      top_p: 0.9,
      repetition_penalty: 1.1,
    };

    let out;
    try {
      out = await transformersPipeline(messages, genOpts);
    } catch {
      // Fallback a texto plano si el pipeline no soporta chat
      const text = messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') + '\nAssistant:';
      out = await transformersPipeline(text, genOpts);
    }

    if (abortGeneration) {
      onDone?.({ aborted: true });
      return;
    }

    const responseText = extractResponse(out);
    if (responseText) {
      onToken?.(responseText);
    }
    onDone?.({ response: responseText, elapsedMs: performance.now() - t0 });
  } catch (err) {
    console.error('WebGPU generate error:', err);
    onError?.(err.message || 'Error en generacion');
  }
}

function extractResponse(out) {
  if (out == null) return '';
  if (typeof out === 'string') return out;
  if (Array.isArray(out)) {
    if (!out.length) return '';
    const last = out[out.length - 1];
    if (last && typeof last.generated_text === 'string') return last.generated_text;
    if (last && typeof last.content === 'string') return last.content;
    return '';
  }
  if (typeof out.generated_text === 'string') return out.generated_text;
  return '';
}

export function abortGenerationWebGPU() {
  abortGeneration = true;
}

export async function unloadModel() {
  transformersPipeline = null;
  loadedModelId = null;
  abortGeneration = false;
}