let catalog = null;

export async function loadCatalog() {
  if (catalog) return catalog;
  const res = await fetch('models.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('No se pudo cargar el catalogo de modelos');
  catalog = await res.json();
  return catalog;
}

export function getCatalog() {
  return catalog;
}

export function getOllamaModels() {
  return catalog ? catalog.ollama || [] : [];
}

export function getOllamaModelInfo(modelId) {
  return getOllamaModels().find((m) => m.id === modelId) || null;
}

export function getOllamaContext(modelId) {
  const info = getOllamaModelInfo(modelId);
  if (info && info.ctx) return info.ctx;
  const name = modelId || '';
  if (/7b|8b/i.test(name)) return 32768;
  if (/3b|4b/i.test(name)) return 16384;
  return 8192;
}

export function getWebGPUModels() {
  return catalog ? catalog.webgpu || [] : [];
}

export function getTools() {
  return catalog ? catalog.tools || {} : {};
}
