// RANDI web — backend WebGPU (Transformers.js en el navegador).
// Corre modelos ONNX pequenos (<4B) en la GPU del navegador sin servidor.
// Fallbacks: cuantizacion (q4->q8->fp32) y device (webgpu -> wasm).

const JSDR_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.2/dist/transformers.min.js';

let pipeline: any = null;
let env: any = null;
let backendReady: Promise<any> | null = null;

export type WebGPUProgress = (phase: string, detail: string) => void;

export function isWebGPUAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

function loadTransformers(): Promise<typeof import('@huggingface/transformers')> {
  if (!backendReady) {
    backendReady = (async () => {
      const mod = await import(/* @vite-ignore */ JSDR_URL);
      env = mod.env;
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      pipeline = mod.pipeline;
      return mod;
    })();
  }
  return backendReady;
}

async function warmup(modelId: string, device: 'webgpu' | 'wasm', onProgress?: WebGPUProgress) {
  const attempts: Array<[string, string]> =
    device === 'webgpu'
      ? [['q4', 'q4'], ['q8', 'q8'], ['fp32', 'fp32']]
      : [['q8', 'q8'], ['fp32', 'fp32']];
  let lastErr: Error | null = null;
  for (const [dtype] of attempts) {
    try {
      onProgress?.('loading', `Cargando ${modelId} (${dtype})…`);
      const gen = await pipeline('text-generation', modelId, { device, dtype });
      return gen;
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw lastErr || new Error('No se pudo cargar el modelo');
}

export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }

export async function generate(
  modelId: string,
  messages: ChatMsg[],
  opts: { device?: 'webgpu' | 'wasm'; maxTokens?: number; temperature?: number; onProgress?: WebGPUProgress } = {},
): Promise<string> {
  const { device = isWebGPUAvailable() ? 'webgpu' : 'wasm', maxTokens = 512, temperature = 0.7, onProgress } = opts;
  onProgress?.('init', 'Conectando con Transformers.js…');
  await loadTransformers();
  const gen = await warmup(modelId, device, onProgress);
  onProgress?.('generate', 'Generando…');
  const out = await gen(messages, { max_new_tokens: maxTokens, temperature, do_sample: temperature > 0 });
  const text = typeof out === 'string' ? out : (out?.[0]?.generated_text as string) || '';
  return text;
}

export async function generateStream(
  modelId: string,
  messages: ChatMsg[],
  opts: { device?: 'webgpu' | 'wasm'; maxTokens?: number; temperature?: number; onToken: (token: string) => void; onProgress?: WebGPUProgress },
): Promise<void> {
  const { device = isWebGPUAvailable() ? 'webgpu' : 'wasm', maxTokens = 512, temperature = 0.7, onToken, onProgress } = opts;
  onProgress?.('init', 'Conectando con Transformers.js…');
  await loadTransformers();
  const gen = await warmup(modelId, device, onProgress);
  onProgress?.('generate', 'Generando…');
  try {
    const stream = await gen(messages, { max_new_tokens: maxTokens, temperature, do_sample: temperature > 0, stream: true });
    if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
      for await (const chunk of stream) {
        const tok = chunk?.[0]?.token?.text ?? chunk?.token?.text ?? '';
        if (tok) onToken(tok);
      }
      return;
    }
  } catch { /* el modelo no soporta streaming: fallback */ }
  const text = await generate(modelId, messages, { device, maxTokens, temperature, onProgress });
  onToken(text);
}

export async function deviceInfo(): Promise<{ api: 'webgpu' | 'wasm'; renderer?: string }> {
  if (!isWebGPUAvailable()) return { api: 'wasm' };
  try {
    const adapter = await (navigator as any).gpu?.requestAdapter?.();
    return { api: 'webgpu', renderer: adapter?.info?.description || adapter?.info?.device || undefined };
  } catch {
    return { api: 'wasm' };
  }
}