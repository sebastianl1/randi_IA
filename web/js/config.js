export const DEFAULT_BACKEND = 'ollama';
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_CONTEXT = 8192;
export const DEFAULT_SYSTEM_PROMPT =
  'Eres RANDI, un asistente AI util, amigable y preciso. Respondes en el mismo idioma en que te hablan.';

export const OLLAMA_MODELS = [
  { id: 'gemma4:2b', name: 'Gemma 4 2B', ram: 1.5, context: 8192 },
  { id: 'deepseek-r1:1.5b', name: 'DeepSeek R1 1.5B', ram: 1.1, context: 8192 },
  { id: 'qwen2.5-coder:1.5b', name: 'Qwen2.5 Coder 1.5B', ram: 0.9, context: 16384 },
  { id: 'qwen2.5-coder:0.5b', name: 'Qwen2.5 Coder 0.5B', ram: 0.4, context: 8192 },
  { id: 'phi3:mini', name: 'Phi-3 Mini', ram: 2.0, context: 8192 },
  { id: 'llama3.2:3b', name: 'Llama 3.2 3B', ram: 2.0, context: 8192 },
  { id: 'qwen3:4b', name: 'Qwen3 4B', ram: 2.5, context: 16384 },
  { id: 'phi3:3.8b', name: 'Phi-3 3.8B', ram: 2.3, context: 8192 },
  { id: 'deepseek-r1:7b', name: 'DeepSeek R1 7B', ram: 4.7, context: 32768 },
  { id: 'qwen2.5-coder:7b', name: 'Qwen2.5 Coder 7B', ram: 4.7, context: 32768 },
  { id: 'qwen3:8b', name: 'Qwen3 8B', ram: 4.5, context: 32768 },
  { id: 'mistral:7b', name: 'Mistral 7B', ram: 4.1, context: 32768 },
];

export function getOllamaModelInfo(modelId) {
  return OLLAMA_MODELS.find((m) => m.id === modelId) || null;
}

export function getOllamaContext(modelId) {
  const info = getOllamaModelInfo(modelId);
  if (info) return info.context;
  const name = modelId || '';
  if (/7b|8b/i.test(name)) return 32768;
  if (/3b|4b/i.test(name)) return 16384;
  return DEFAULT_CONTEXT;
}
