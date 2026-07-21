export const WEBGPU_MODELS = [
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    name: 'Qwen2.5 0.5B Instruct',
    size: '~300 MB',
    ram: '1 GB+',
    description: 'Super ligero, rapido',
  },
  {
    id: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct',
    name: 'Qwen2.5 Coder 0.5B',
    size: '~300 MB',
    ram: '1 GB+',
    description: 'Codigo super ligero',
  },
  {
    id: 'Xenova/tinyllama-1.1b-chat-v1.0',
    name: 'TinyLlama 1.1B Chat',
    size: '~700 MB',
    ram: '2 GB+',
    description: 'Ligero y versatil',
  },
  {
    id: 'onnx-community/Qwen2.5-1.5B-Instruct',
    name: 'Qwen2.5 1.5B Instruct',
    size: '~900 MB',
    ram: '2 GB+',
    description: 'Balanceado',
  },
  {
    id: 'onnx-community/Qwen2.5-Coder-1.5B-Instruct',
    name: 'Qwen2.5 Coder 1.5B',
    size: '~900 MB',
    ram: '2 GB+',
    description: 'Codigo balanceado',
  },
  {
    id: 'onnx-community/DeepSeek-R1-Distill-Qwen-1.5B',
    name: 'DeepSeek R1 Distill 1.5B',
    size: '~1 GB',
    ram: '2 GB+',
    description: 'Razonamiento profundo',
  },
  {
    id: 'onnx-community/gemma-2-2b-it',
    name: 'Gemma 2 2B IT',
    size: '~1.5 GB',
    ram: '3 GB+',
    description: 'Google Gemma 2',
  },
  {
    id: 'onnx-community/Llama-3.2-1B-Instruct',
    name: 'Llama 3.2 1B',
    size: '~700 MB',
    ram: '2 GB+',
    description: 'Meta Llama 3.2',
  },
  {
    id: 'microsoft/Phi-3.5-mini-instruct-onnx',
    name: 'Phi-3.5 Mini Instruct',
    size: '~2 GB',
    ram: '3 GB+',
    description: 'Microsoft Phi-3.5',
  },
  {
    id: 'Xenova/phi-3-mini-4k-instruct',
    name: 'Phi-3 Mini 4K',
    size: '~2 GB',
    ram: '3 GB+',
    description: 'Microsoft Phi-3',
  },
  {
    id: 'microsoft/Phi-3-mini-4k-instruct-onnx',
    name: 'Phi-3 Mini 4K ONNX',
    size: '~2 GB',
    ram: '3 GB+',
    description: 'Microsoft Phi-3 ONNX',
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

  onProgress?.({ status: 'download', percent: 0, text: 'Preparando todo...' });

  let hasWebGPU = await webgpuAvailable();

  const { pipeline } = await loadTransformers();

  if (!hasWebGPU) {
    onProgress?.({ status: 'download', percent: 0, text: 'WebGPU no disponible, usando CPU...' });
  }

  async function tryLoad(device, dtype) {
    const opts = {
      device,
      progress_callback: (progress) => {
        if (progress.status === 'progress' || progress.status === 'download') {
          const pct = progress.progress != null
            ? Math.round(progress.progress)
            : progress.total
              ? Math.round((progress.loaded / progress.total) * 100)
              : 0;
          onProgress?.({ status: 'download', percent: Math.min(pct, 99), text: 'Preparando todo, por favor espera...' });
        } else if (progress.status === 'load') {
          onProgress?.({ status: 'load', percent: 50, text: 'Preparando todo, por favor espera...' });
        } else if (progress.status === 'ready' || progress.status === 'done') {
          onProgress?.({ status: 'ready', percent: 100, text: 'Modelo listo' });
        }
      }
    };
    if (dtype) opts.dtype = dtype;
    return await pipeline('text-generation', modelId, opts);
  }

  let lastError = '';

  try {
    transformersPipeline = await tryLoad(hasWebGPU ? 'webgpu' : 'cpu', 'q4');
  } catch (e) {
    lastError = e.message || 'Error al cargar con q4';
    console.error('First attempt failed (q4):', e);
    if (hasWebGPU) {
      onProgress?.({ status: 'download', percent: 0, text: 'WebGPU falló, reintentando con CPU...' });
      hasWebGPU = false;
    }
    try {
      transformersPipeline = await tryLoad('cpu', 'q4');
    } catch (e2) {
      lastError = e2.message || 'Error al cargar con CPU';
      console.error('CPU attempt failed:', e2);
      isLoading = false;
      window.dispatchEvent(new CustomEvent('randi-model-error', { detail: { modelId, error: lastError } }));
      throw new Error(`No se pudo cargar: ${lastError}`);
    }
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
