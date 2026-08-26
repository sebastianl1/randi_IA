// RANDI web — motor de compatibilidad (mirror TS de bin/lib/compat.py).
// Mismos umbrales que el motor Python; /api/recommend es la fuente autoritativa.

import type { CatalogModel } from './api.js';

export const GRADES: Record<string, { label: string; color: string }> = {
  S: { label: 'Runs great', color: '#22c55e' },
  A: { label: 'Runs well', color: '#4ade80' },
  B: { label: 'Decent', color: '#a3e635' },
  C: { label: 'Tight fit', color: '#f59e0b' },
  D: { label: 'Barely runs', color: '#f97316' },
  F: { label: 'Too heavy', color: '#ef4444' },
  '?': { label: 'Unknown', color: '#56565f' },
};

export const QUANTS = [
  ['Q2_K', 2, 0.3125, 'low'],
  ['Q3_K_M', 3, 0.4375, 'moderate'],
  ['Q4_K_M', 4, 0.5, 'good'],
  ['Q5_K_M', 5, 0.625, 'good'],
  ['Q6_K', 6, 0.75, 'excellent'],
  ['Q8_0', 8, 1.0, 'excellent'],
  ['F16', 16, 2.0, 'lossless'],
] as const;

export type Status = 'can-run' | 'tight' | 'can-run-slow' | 'cannot-run' | 'unknown';

export interface Hw {
  platform?: string;
  ram_gb?: number;
  gpu_vram_gb?: number;
  gpu_memory_bw?: number;
  is_apple_silicon?: boolean;
  is_mobile?: boolean;
}

const RUNTIME_OVERHEAD = 0.5;

export function makeQuants(paramsBillions: number) {
  const total = paramsBillions * 1e9;
  return QUANTS.map(([name, bits, bpp, quality]) => {
    const vram = Math.max((total * bpp) / 1024 ** 3 * 1.1 + RUNTIME_OVERHEAD, 0.5);
    const disk = Math.max((total * bpp) / 1024 ** 3 * 1.05, 0.1);
    return {
      name, bits,
      vramGB: Math.round(vram * 10) / 10,
      diskGB: Math.round(disk * 10) / 10,
      quality,
    };
  });
}

export function activeParams(model: CatalogModel): number {
  if (model.architecture !== 'moe') return Number(model.paramsBillions) || 0;
  const m = String(model.activeParams || '').match(/([\d.]+)\s*B/i);
  const active = m ? parseFloat(m[1]) : NaN;
  return Number.isFinite(active) && active > 0 ? active : Number(model.paramsBillions) || 0;
}

export function workingSet(vramGB: number, model: CatalogModel): number {
  const active = activeParams(model);
  const total = Number(model.paramsBillions) || 0;
  if (total <= 0 || active >= total) return vramGB;
  return Math.max(0.5, vramGB * (active / total));
}

function usableRam(hw: Hw): number | null {
  if (!hw.ram_gb) return null;
  if (hw.is_mobile && !hw.is_apple_silicon) return hw.ram_gb * (hw.platform === 'iOS' ? 0.5 : 0.55);
  if (hw.is_apple_silicon) return hw.ram_gb * 0.75;
  return hw.ram_gb * 0.7;
}

export function evaluateStatus(vramNeeded: number, hw: Hw): Status {
  const step = (u: number) => (vramNeeded <= u * 0.7 ? 'can-run' : vramNeeded <= u ? 'tight' : 'cannot-run');
  if (hw.is_mobile || hw.is_apple_silicon) {
    const u = usableRam(hw);
    return u == null ? 'unknown' : step(u);
  }
  if (hw.gpu_vram_gb) {
    if (vramNeeded <= hw.gpu_vram_gb * 0.85) return 'can-run';
    if (vramNeeded <= hw.gpu_vram_gb * 1.1) return 'tight';
    if (hw.ram_gb && hw.ram_gb > hw.gpu_vram_gb) {
      const u = hw.ram_gb * 0.7;
      if (vramNeeded <= hw.gpu_vram_gb + u) return 'can-run-slow';
    }
    return 'cannot-run';
  }
  if (hw.ram_gb) {
    const u = hw.ram_gb * 0.7;
    if (vramNeeded <= u * 0.7) return 'can-run';
    if (vramNeeded <= u) return 'tight';
    return 'cannot-run';
  }
  return 'unknown';
}

export function estimateTokensPerSecond(workingSetGB: number, hw: Hw): number | null {
  if (!hw.gpu_memory_bw) return null;
  const eff = hw.is_mobile && !hw.is_apple_silicon ? 0.4 : hw.is_apple_silicon ? 0.65 : 0.7;
  if (hw.gpu_vram_gb && workingSetGB > hw.gpu_vram_gb && hw.ram_gb) {
    const fv = Math.min(1, hw.gpu_vram_gb / workingSetGB);
    const ebw = 1 / (fv / hw.gpu_memory_bw + (1 - fv) / 50);
    return Math.max(1, Math.round((ebw / workingSetGB) * eff * 0.85));
  }
  return Math.round((hw.gpu_memory_bw / workingSetGB) * eff);
}

export function memPercent(vramNeeded: number, hw: Hw): number | null {
  if (hw.is_mobile || hw.is_apple_silicon) return hw.ram_gb ? Math.round((vramNeeded / hw.ram_gb) * 100) : null;
  const v = hw.gpu_vram_gb || hw.ram_gb;
  return v ? Math.round((vramNeeded / v) * 100) : null;
}

function lerp(x: number, x0: number, x1: number, y0: number, y1: number) {
  return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
}

export function computeScore(status: Status, toks: number | null, paramsB: number, memPct: number | null): number {
  if (status === 'cannot-run' || status === 'unknown') return 0;
  let speedScore: number;
  if (toks != null) {
    if (toks >= 80) speedScore = 100;
    else if (toks >= 40) speedScore = lerp(toks, 40, 80, 80, 100);
    else if (toks >= 20) speedScore = lerp(toks, 20, 40, 55, 80);
    else if (toks >= 10) speedScore = lerp(toks, 10, 20, 35, 55);
    else if (toks >= 5) speedScore = lerp(toks, 5, 10, 15, 35);
    else speedScore = lerp(Math.max(toks, 0), 0, 5, 0, 15);
  } else {
    speedScore = status === 'can-run' ? 45 : 20;
  }
  let headroom = 45;
  if (memPct != null) {
    if (memPct <= 20) headroom = 100;
    else if (memPct <= 40) headroom = lerp(memPct, 20, 40, 100, 75);
    else if (memPct <= 60) headroom = lerp(memPct, 40, 60, 75, 45);
    else if (memPct <= 80) headroom = lerp(memPct, 60, 80, 45, 20);
    else headroom = lerp(Math.min(memPct, 100), 80, 100, 20, 0);
  }
  const quality = Math.min(12, Math.log2(paramsB + 1) * 2);
  const fit = status === 'can-run-slow' ? 0.6 : status === 'tight' ? 0.75 : 1;
  return Math.round((speedScore * 0.55 + headroom * 0.35 + quality) * fit);
}

export function scoreToGrade(score: number, status: Status): string {
  if (status === 'cannot-run') return 'F';
  if (status === 'unknown') return '?';
  if (status === 'can-run-slow') return score >= 40 ? 'C' : 'D';
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

export interface Eval {
  quant: string;
  status: Status;
  toksPerSec: number | null;
  memPct: number | null;
  score: number;
  grade: string;
}

export function evaluateModel(model: CatalogModel, hw: Hw): Eval {
  const quants = makeQuants(Number(model.paramsBillions) || 0);
  let best: { q: (typeof quants)[number]; status: Status } | null = null;
  for (const q of quants) {
    const status = evaluateStatus(q.vramGB, hw);
    if (status === 'can-run' || status === 'tight') {
      if (!best || q.bits > best.q.bits) best = { q, status };
    }
  }
  if (!best) {
    const q = quants[quants.length - 1];
    const status = evaluateStatus(q.vramGB, hw);
    const ws = workingSet(q.vramGB, model);
    const toks = estimateTokensPerSecond(ws, hw);
    const mp = memPercent(q.vramGB, hw);
    const score = computeScore(status, toks, Number(model.paramsBillions) || 0, mp);
    return { quant: q.name, status, toksPerSec: toks, memPct: mp, score, grade: scoreToGrade(score, status) };
  }
  const ws = workingSet(best.q.vramGB, model);
  const toks = estimateTokensPerSecond(ws, hw);
  const mp = memPercent(best.q.vramGB, hw);
  const score = computeScore(best.status, toks, Number(model.paramsBillions) || 0, mp);
  return { quant: best.q.name, status: best.status, toksPerSec: toks, memPct: mp, score, grade: scoreToGrade(score, best.status) };
}

// ── Hardware requerido ("no corre aqui, necesitas...") ────────────────────

const GPU_CLASSES: Array<[number, string]> = [
  [1, 'GTX 1050 Ti / GTX 1650'],
  [2, 'GTX 1060 / RTX 2060'],
  [4, 'RTX 2060 Super / GTX 1080'],
  [6, 'RTX 3060'],
  [8, 'RTX 4060 / RTX 3060 Ti'],
  [10, 'RTX 4070'],
  [12, 'RTX 4070 Ti / RX 7800 XT'],
  [16, 'RTX 4080 / RTX 4070 Ti Super / RX 7900 XT'],
  [24, 'RTX 4090 / A100'],
  [40, 'A100 40GB / L40'],
  [80, 'H100 / A100 80GB'],
  [141, 'H200 / B200'],
];

export function gpuClassForVram(vramRequired: number): string {
  for (const [t, label] of GPU_CLASSES) if (vramRequired <= t) return label;
  return 'H100 / B200 (datacenter)';
}

export function requiredHardware(model: CatalogModel, quantName?: string) {
  const quants = makeQuants(Number(model.paramsBillions) || 0);
  const quant = quants.find((q) => q.name === quantName) || quants[2];
  const vram = quant.vramGB;
  const gpuVramRecommended = Math.round((vram / 0.85) * 10) / 10;
  const ramRequired = Math.round(Math.max(vram * 1.5, 2.0) * 10) / 10;
  return {
    quantization: quant.name,
    vramRequiredGb: vram,
    gpuVramRecommendedGb: gpuVramRecommended,
    gpuClass: gpuClassForVram(gpuVramRecommended),
    ramRequiredGb: ramRequired,
    systemRamTotalGb: Math.round((ramRequired / 0.7) * 10) / 10,
    bandwidthRecommendedGbps: Math.round(Math.max(vram * 40, 50)),
    diskRequiredGb: Math.round(Math.max(Number(model.paramsBillions || 0) * 0.55, 0.5) * 10) / 10,
  };
}

export function statusLabel(s?: string): string {
  return ({ 'can-run': 'Comodo', tight: 'Ajustado', 'can-run-slow': 'Lento (CPU)', 'cannot-run': 'No corre', unknown: 'Desconocido' } as Record<string, string>)[s || 'unknown'] || '—';
}

export function statusToCanirun(s: string): string {
  return ({ 'can-run': 'comfortable', tight: 'tight', 'can-run-slow': 'cpu-offload', 'cannot-run': 'insufficient', unknown: 'unknown' } as Record<string, string>)[s] || 'unknown';
}

export function notesFor(model: CatalogModel, ev: Eval, hw: Hw): string[] {
  const notes = [`Modelo ${model.name} (${model.paramsBillions}B, q${ev.quant || 'auto'})`];
  if (ev.status === 'cannot-run') {
    const req = requiredHardware(model, ev.quant);
    notes.push(`Tu hardware no alcanza: necesitas GPU con ${req.gpuVramRecommendedGb}GB de VRAM (${req.gpuClass}) y ${req.systemRamTotalGb}GB de RAM.`);
  } else if (ev.status === 'can-run-slow') {
    notes.push(hw.gpu_vram_gb
      ? `El modelo excede tu VRAM (${hw.gpu_vram_gb}GB): parte va a RAM de sistema y la velocidad sera baja.`
      : 'Solo correra en CPU: sin GPU dedicada la velocidad es muy baja.');
  } else if (ev.status === 'tight') {
    notes.push('Ajustado: corre pero sin margen para otras apps.');
  } else {
    notes.push(ev.toksPerSec ? `Velocidad estimada ~${ev.toksPerSec} tok/s.` : 'El modelo deberia caber comodo en tu memoria.');
  }
  return notes;
}

export function gb(n?: number | null): string {
  if (n == null) return '—';
  return n >= 1 ? n.toFixed(1) + 'GB' : String(Math.round(n * 1024)) + 'MB';
}