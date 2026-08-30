// Proveedores del chat online (todos los modelos listados son del tier
// gratuito / libre de uso). El proveedor por defecto es Cloudflare Workers
// AI (no requiere API key); OpenRouter y Hugging Face son opcionales.
export interface ChatMsg { role: 'user' | 'assistant' | 'system'; content: string }

export interface Env {
  AI?: any;
  OPENROUTER_API_KEY?: string;
  HF_API_KEY?: string;
  HF_BASE?: string;
  FREE_DAILY_LIMIT?: string;
}

export type Provider = 'workers-ai' | 'openrouter' | 'huggingface';

export interface ModelDef {
  id: string;
  label: string;
  provider: Provider;
  ref: string; // id en del proveedor (model_id o ruta Workers AI)
  note: string;
}

export const MODELS: ModelDef[] = [
  { id: 'qwen-coder-32b', label: 'Qwen Coder 32B', provider: 'workers-ai', ref: '@cf/qwen/qwen2.5-coder-32b-instruct', note: 'Especialista en código' },
  { id: 'llama-3.1-8b', label: 'Llama 3.1 8B', provider: 'workers-ai', ref: '@cf/meta/llama-3.1-8b-instruct-fast', note: 'Generalista y equilibrado' },
  { id: 'llama-3.2-3b', label: 'Llama 3.2 3B', provider: 'workers-ai', ref: '@cf/meta/llama-3.2-3b-instruct', note: 'Ligero y veloz' },
  { id: 'llama-3.2-1b', label: 'Llama 3.2 1B', provider: 'workers-ai', ref: '@cf/meta/llama-3.2-1b-instruct', note: 'Ultraligero, corre hasta en una papa' },
  { id: 'glm-5.2-free', label: 'GLM 5.2 · Free', provider: 'openrouter', ref: 'z-ai/glm-5.2:free', note: 'OpenRouter · chat forte con cifras' },
  { id: 'gemma-4-26b-free', label: 'Gemma 4 26B · Free', provider: 'openrouter', ref: 'google/gemma-4-26b-a4b-it:free', note: 'OpenRouter · general y ágil' },
  { id: 'nemotron-3-free', label: 'Nemotron 3 · Free', provider: 'openrouter', ref: 'nvidia/nemotron-3-super-120b-a12b:free', note: 'OpenRouter · potente (MoE)' },
];

// Indica si un modelo está listo según las keys configuradas (se expone en /api/models).
export function modelReady(m: ModelDef, env: Env): boolean {
  if (m.provider === 'workers-ai') return true;
  if (m.provider === 'openrouter') return Boolean(env.OPENROUTER_API_KEY);
  if (m.provider === 'huggingface') return Boolean(env.HF_API_KEY);
  return false;
}

// Crosstream compatible OpenAI (OpenRouter y Hugging Face Inference).
async function* openAICompat(provider: Provider, model: ModelDef, messages: ChatMsg[], env: Env): AsyncGenerator<string> {
  const apiKey = provider === 'openrouter' ? env.OPENROUTER_API_KEY : env.HF_API_KEY;
  if (!apiKey) throw new Error(`${provider}: falta la API key`);
  const url = provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : `${env.HF_BASE || 'https://api-inference.huggingface.co'}/v1/chat/completions`;
  const body = { model: model.ref, messages, stream: true, max_tokens: 720 };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let res: Response | null = null;
  let lastErr = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://github.com/sebastianl1/randi_IA', 'X-Title': 'RANDI Chat' } : {}),
      },
      body: JSON.stringify(body),
    });
    if (res.ok) break;
    if (res.status !== 429 && res.status < 500) break; // 4xx no recuperables
    const txt = await res.text().catch(() => '');
    lastErr = `${provider}: HTTP ${res.status} ${txt.slice(0, 160)}`;
    await sleep(1200 * (attempt + 1));
  }
  if (!res || !res.ok || !res.body) {
    const txt = res ? await res.text().catch(() => '') : '';
    throw new Error(lastErr || `${provider}: HTTP ${res ? res.status : '?'} ${txt.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const j = JSON.parse(payload);
        const delta = j?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) yield delta;
      } catch {
        /* fragmento parcial */
      }
    }
  }
}

export async function* streamModel(model: ModelDef, messages: ChatMsg[], env: Env): AsyncGenerator<string> {
  if (model.provider === 'openrouter' || model.provider === 'huggingface') {
    yield* openAICompat(model.provider, model, messages, env);
    return;
  }
  throw new Error(`proveedor no soportado: ${model.provider}`);
}