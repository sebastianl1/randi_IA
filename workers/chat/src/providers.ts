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
];

// Crosstream compatible OpenAI (OpenRouter y Hugging Face Inference).
async function* openAICompat(provider: Provider, model: ModelDef, messages: ChatMsg[], env: Env): AsyncGenerator<string> {
  const apiKey = provider === 'openrouter' ? env.OPENROUTER_API_KEY : env.HF_API_KEY;
  if (!apiKey) throw new Error(`${provider}: falta la API key`);
  const url = provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : `${env.HF_BASE || 'https://api-inference.huggingface.co'}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://github.com/sebastianl1/randi_IA', 'X-Title': 'RANDI Chat' } : {}),
    },
    body: JSON.stringify({ model: model.ref, messages, stream: true, max_tokens: 720 }),
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '');
    throw new Error(`${provider}: HTTP ${res.status} ${txt.slice(0, 200)}`);
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