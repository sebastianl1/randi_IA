// Catálogo central (leído de web/models.json en build).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RAW = JSON.parse(readFileSync(join(ROOT, 'web', 'models.json'), 'utf-8')) as {
  ollama: any[]; media: any[];
};

export interface ModelEntry {
  id: string; slug: string; name: string; size?: string; paramsBillions?: number;
  provider?: string; family?: string; architecture?: string; useCase?: string[];
  tools?: boolean; thinking?: boolean; license?: string; desc?: string; ctx?: number;
  ollamaId?: string; installer?: string; type?: string; category?: string;
}

export function slugFor(id: string): string {
  return id.replace(/[:/\\]/g, '-');
}

export const CAT = RAW;
export const allModels: ModelEntry[] = [...RAW.ollama, ...RAW.media].map((m) => ({ ...m, slug: slugFor(m.id) }));

export function bySlug(slug: string): ModelEntry | undefined {
  return allModels.find((m) => m.slug === slug || m.id === slug);
}