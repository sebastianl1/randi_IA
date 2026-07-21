export const WEBGPU_MODELS = [
  {
    id: 'onnx-community/gemma-3-270m-it-ONNX',
    name: 'Gemma 3 270M',
    size: '~200 MB',
    ram: '1 GB+',
    description: 'Google Gemma 3 ultra ligero',
  },
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    name: 'Qwen2.5 0.5B Instruct',
    size: '~300 MB',
    ram: '1 GB+',
    description: 'Super ligero y rápido',
  },
  {
    id: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct',
    name: 'Qwen2.5 Coder 0.5B',
    size: '~300 MB',
    ram: '1 GB+',
    description: 'Código super ligero',
  },
  {
    id: 'Xenova/tinyllama-1.1b-chat-v1.0',
    name: 'TinyLlama 1.1B Chat',
    size: '~700 MB',
    ram: '2 GB+',
    description: 'Ligero y versátil',
  },
  {
    id: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
    name: 'Llama 3.2 1B',
    size: '~700 MB',
    ram: '2 GB+',
    description: 'Meta Llama 3.2',
  },
  {
    id: 'onnx-community/gemma-3-1b-it-ONNX-GQA',
    name: 'Gemma 3 1B IT',
    size: '~700 MB',
    ram: '2 GB+',
    description: 'Google Gemma 3',
  },
  {
    id: 'onnx-community/Qwen2.5-1.5B-Instruct',
    name: 'Qwen2.5 1.5B Instruct',
    size: '~900 MB',
    ram: '2 GB+',
    description: 'Balanceado general',
  },
  {
    id: 'onnx-community/Qwen2.5-Coder-1.5B-Instruct',
    name: 'Qwen2.5 Coder 1.5B',
    size: '~900 MB',
    ram: '2 GB+',
    description: 'Código balanceado',
  },
  {
    id: 'onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX',
    name: 'DeepSeek R1 Distill 1.5B',
    size: '~1 GB',
    ram: '3 GB+',
    description: 'Razonamiento profundo',
  },
  {
    id: 'Xenova/phi-3-mini-4k-instruct',
    name: 'Phi-3 Mini 4K',
    size: '~2 GB',
    ram: '4 GB+',
    description: 'Microsoft Phi-3',
  },
];

export function getModelInfo(modelId) {
  return WEBGPU_MODELS.find(m => m.id === modelId) || null;
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

export async function downloadModel(modelId, onProgress) {
  isLoading = true;
  window.dispatchEvent(new CustomEvent('randi-model-loading', { detail: { modelId } }));

  const info = getModelInfo(modelId);
  const modelName = info ? info.name : modelId;

  const sendProgress = (pct, text) => {
    onProgress?.({ status: 'download', percent: pct, text });
  };

  sendProgress(0, 'Iniciando...');
  let keepAlive;

  try {
    sendProgress(2, 'Cargando Transformers.js...');
    const { pipeline } = await loadTransformers();

    sendProgress(5, 'Verificando WebGPU...');
    const hasWebGPU = await webgpuAvailable();
    if (!hasWebGPU) {
      sendProgress(6, 'WebGPU no disponible, usando CPU');
    }

    const device = hasWebGPU ? 'webgpu' : 'cpu';

    keepAlive = setInterval(() => {
      onProgress?.({ status: 'download', percent: 95, text: `Preparando todo, por favor espera...` });
    }, 15000);

    sendProgress(10, 'Descargando ' + modelName + '...');

    let pipe;
    try {
      pipe = await pipeline('text-generation', modelId, {
        device,
        dtype: 'q4',
        progress_callback: (p) => {
          if (p.status === 'progress' || p.status === 'download') {
            const pct = p.progress != null
              ? Math.round(p.progress)
              : p.total
                ? Math.round((p.loaded / p.total) * 100)
                : 0;
            const scaled = 10 + Math.round(pct * 0.85);
            onProgress?.({ status: 'download', percent: Math.min(scaled, 95), text: 'Preparando todo, por favor espera...' });
          } else if (p.status === 'load') {
            onProgress?.({ status: 'load', percent: 50, text: 'Cargando modelo en memoria...' });
          } else if (p.status === 'ready' || p.status === 'done') {
            clearInterval(keepAlive);
            keepAlive = null;
          }
        }
      });
    } catch (e) {
      console.error('WebGPU load failed:', e);
      if (hasWebGPU) {
        sendProgress(5, 'WebGPU falló, reintentando con CPU...');
        try {
          pipe = await pipeline('text-generation', modelId, {
            device: 'cpu',
            dtype: 'q4',
            progress_callback: (p) => {
              if (p.status === 'progress' || p.status === 'download') {
                const pct = p.progress != null
                  ? Math.round(p.progress)
                  : p.total
                    ? Math.round((p.loaded / p.total) * 100)
                    : 0;
                const scaled = 10 + Math.round(pct * 0.85);
                onProgress?.({ status: 'download', percent: Math.min(scaled, 95), text: 'Preparando todo, por favor espera...' });
              } else if (p.status === 'load') {
                onProgress?.({ status: 'load', percent: 50, text: 'Cargando modelo en memoria...' });
              } else if (p.status === 'ready' || p.status === 'done') {
                clearInterval(keepAlive);
                keepAlive = null;
              }
            }
          });
        } catch (e2) {
          throw new Error(e2.message || 'Error al cargar con CPU');
        }
      } else {
        throw e;
      }
    }

    clearInterval(keepAlive);
    keepAlive = null;
    transformersPipeline = pipe;
  } catch (err) {
    if (keepAlive) clearInterval(keepAlive);
    isLoading = false;
    const msg = err.message || 'Error desconocido';
    window.dispatchEvent(new CustomEvent('randi-model-error', { detail: { modelId, error: msg } }));
    throw new Error(msg);
  }

  loadedModelId = modelId;
  markModelCached(modelId);
  isLoading = false;
  window.dispatchEvent(new CustomEvent('randi-model-ready', { detail: { modelId } }));
  onProgress?.({ status: 'ready', percent: 100, text: 'Modelo listo' });
}

export async function generateStream(promptText, _systemPrompt, temperature, maxTokens, onToken, onDone, onError) {
  if (!transformersPipeline) {
    onError?.('Modelo no cargado');
    return;
  }

  abortGeneration = false;

  try {
    const messages = [{ role: 'user', content: promptText }];

    const result = await transformersPipeline(messages, {
      max_new_tokens: maxTokens || 512,
      temperature: temperature ?? 0.7,
      do_sample: true,
      top_p: 0.9,
      repetition_penalty: 1.1,
    });

    if (abortGeneration) {
      onDone?.({ aborted: true });
      return;
    }

    let responseText = '';
    const genText = result[0]?.generated_text;
    if (Array.isArray(genText)) {
      const last = genText[genText.length - 1];
      responseText = last?.content || '';
    } else if (typeof genText === 'string') {
      responseText = genText;
    }

    if (responseText) {
      onToken?.(responseText);
    }
    onDone?.({ response: responseText });
  } catch (err) {
    console.error('WebGPU generate error:', err);
    onError?.(err.message || 'Error en generacion');
  }
}

export function abortGenerationWebGPU() {
  abortGeneration = true;
}

export async function unloadModel() {
  transformersPipeline = null;
  loadedModelId = null;
  abortGeneration = false;
}
