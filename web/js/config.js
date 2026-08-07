export const DEFAULT_BACKEND = 'ollama';
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_CONTEXT = 8192;
export const DEFAULT_SYSTEM_PROMPT =
  'Eres RANDI, un asistente AI util, amigable y preciso. Respondes en el mismo idioma en que te hablan.';

export function apiHeaders(extra = {}) {
  const headers = { ...extra };
  const meta = document.querySelector('meta[name="randi-token"]');
  if (meta && meta.content) headers['X-RANDI-Token'] = meta.content;
  return headers;
}
