// RANDI web — cliente de la API local (servidor Python). 
// Las llamadas /api/* pasan por el proxy de web/server.py hacia Ollama o
// al motor de compatibilidad (hardware/recommend/install).

const TOKEN = (() => {
  if (typeof document === 'undefined') return '';
  const m = document.querySelector('meta[name="randi-token"]');
  return m ? m.getAttribute('content') || '' : '';
})();

async function request(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
  if (TOKEN) headers['X-RANDI-Token'] = TOKEN;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  return fetch(path, { ...options, headers });
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await request(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiPost<T = any>(path: string, body: unknown): Promise<T> {
  const res = await request(path, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json())?.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export interface Hw {
  platform?: string;
  cpu_cores?: number;
  ram_gb?: number;
  system_ram_gb?: number;
  gpu_name?: string;
  gpu_vram_gb?: number;
  gpu_memory_bw?: number;
  is_apple_silicon?: boolean;
  is_mobile?: boolean;
  profile?: Record<string, unknown>;
}

let hwCache: Hw | null = null;

export async function getHardware(): Promise<Hw> {
  if (hwCache) return hwCache;
  try {
    hwCache = await apiGet<Hw>('/api/hardware');
  } catch {
    const { detectHardware } = await import('./hardware.js');
    hwCache = (await detectHardware()) as Hw;
  }
  return hwCache;
}

export interface CatalogModel {
  id: string;
  name: string;
  size?: string;
  ram?: number;
  ctx?: number;
  cat?: string;
  type?: string;
  category?: string;
  desc?: string;
  paramsBillions?: number;
  activeParams?: string;
  provider?: string;
  family?: string;
  architecture?: 'dense' | 'moe';
  useCase?: string[];
  tools?: boolean;
  thinking?: boolean;
  license?: string;
  ollamaId?: string;
  installer?: string;
  featured?: boolean;
  url?: string;
  ggufRepo?: string;
}

export async function getModels(opts: { media?: boolean; category?: string } = {}): Promise<CatalogModel[]> {
  const qs = new URLSearchParams();
  if (opts.media) qs.set('media', '1');
  if (opts.category) qs.set('category', opts.category);
  const data = await apiGet<{ models: CatalogModel[] }>(`/api/models?${qs.toString()}`);
  return data.models || [];
}

export async function getSetup() {
  return apiGet<any>('/api/setup');
}

export async function installModel(modelId: string): Promise<{ jobId: string; modelId: string }> {
  return apiPost('/api/install', { modelId });
}

export async function installStatus(jobId: string) {
  return apiGet<any>(`/api/install/status?id=${encodeURIComponent(jobId)}`);
}

export async function requirements(modelId: string) {
  return apiPost<any>('/api/requirements', { modelId });
}

export async function recommend(body: unknown) {
  return apiPost<any>('/api/recommend', body);
}

export async function checkCompatibility(body: unknown) {
  return apiPost<any>('/api/compatibility', body);
}

export async function hasServer(): Promise<boolean> {
  try {
    await apiGet('/api/health');
    return true;
  } catch {
    return false;
  }
}