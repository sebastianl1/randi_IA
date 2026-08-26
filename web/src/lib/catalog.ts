// RANDI web — acceso al catalogo estatico (web/models.json). Se importa en
// build para funcionar sin servidor (WebGPU offline, PWA). En linea se usan
// los endpoints /api/* como fuente autoritativa.
import catalog from '../../models.json' with { type: 'json' };
import type { CatalogModel } from './api.js';

export const CATALOG = catalog as {
  version: string;
  ollama: CatalogModel[];
  media: CatalogModel[];
  webgpu: CatalogModel[];
  tools: Record<string, unknown>;
};

export const llmModels = CATALOG.ollama;
export const mediaModels = CATALOG.media;
export const webgpuModels = CATALOG.webgpu;

export function findModel(id: string): CatalogModel | undefined {
  return [...llmModels, ...mediaModels].find(
    (m) => m.id === id || m.ollamaId === id,
  );
}

export function categories() {
  const c: Record<string, CatalogModel[]> = { llm: [], image: [], video: [] };
  for (const m of llmModels) (c[m.category || 'llm'] ||= []).push(m);
  for (const m of mediaModels) (c[m.category || 'image'] ||= []).push(m);
  return c;
}

export const USE_CASES = [
  { key: 'chat', label: 'Chat' },
  { key: 'code', label: 'Codificacion' },
  { key: 'reasoning', label: 'Razonamiento' },
  { key: 'vision', label: 'Vision' },
];