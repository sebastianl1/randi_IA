// Motor de compatibilidad mínimo (espejo de web/src/lib/compat.ts) para la
// landing: quants + hardware requerido + grado frente al equipo detectado.
import type { DetectedHw } from './detect.js';

const QUANTS: Array<[string, number, number]> = [
  ['Q2_K', 2, 0.3125], ['Q3_K_M', 3, 0.4375], ['Q4_K_M', 4, 0.5],
  ['Q5_K_M', 5, 0.625], ['Q6_K', 6, 0.75], ['Q8_0', 8, 1.0], ['F16', 16, 2.0],
];
const OVER = 0.5;

export interface Quant { name: string; bits: number; vramGB: number; diskGB: number }
export function makeQuants(paramsGB: number): Quant[] {
  const t = paramsGB * 1e9;
  return QUANTS.map(([name, bits, bpp]) => ({
    name, bits,
    vramGB: Math.round(Math.max((t * bpp) / 1024 ** 3 * 1.1 + OVER, 0.5) * 10) / 10,
    diskGB: Math.round(Math.max((t * bpp) / 1024 ** 3 * 1.05, 0.1) * 10) / 10,
  }));
}

const GPU = [
  [1, 'GTX 1050 Ti / GTX 1650'], [2, 'GTX 1060 / RTX 2060'], [4, 'RTX 2060 Super / GTX 1080'],
  [6, 'RTX 3060'], [8, 'RTX 4060 / RTX 3060 Ti'], [10, 'RTX 4070'],
  [12, 'RTX 4070 Ti / RX 7800 XT'], [16, 'RTX 4080 / RTX 4070 Ti Super / RX 7900 XT'],
  [24, 'RTX 4090 / A100'], [40, 'A100 40GB / L40'], [80, 'H100 / A100 80GB'], [141, 'H200 / B200'],
] as const;
export function gpuClass(vram: number): string {
  for (const [t, l] of GPU) if (vram <= t) return l;
  return 'H100 / B200';
}

export function requiredHardware(paramsGB: number) {
  const q = makeQuants(paramsGB)[3];           // Q4_K_M
  const vram = q.vramGB;
  const gpuVramRec = Math.round((vram / 0.85) * 10) / 10;
  const ramReq = Math.round(Math.max(vram * 1.5, 2.0) * 10) / 10;
  return {
    quant: q.name, vramGB: vram, gpuVramRec,
    gpuClass: gpuClass(Math.max(1, gpuVramRec)),
    ramTotal: Math.round((ramReq / 0.7) * 10) / 10,
    bandwidth: Math.round(Math.max(vram * 40, 50)),
    diskGB: Math.round(Math.max(paramsGB * 0.55, 0.5) * 10) / 10,
  };
}

const GCOLOR: Record<string, string> = { S: '#22c55e', A: '#4ade80', B: '#a3e635', C: '#f59e0b', D: '#f97316', F: '#ef4444', '?': '#56565f' };
export function gradeColor(g: string): string { return GCOLOR[g] || '#56565f'; }

export function gradeFor(hw: DetectedHw, paramsGB: number) {
  const q = makeQuants(paramsGB)[3];
  const vram = q.vramGB;
  const usable = hw.ramGb ? hw.ramGb * (hw.isMobile ? 0.55 : hw.isApple ? 0.75 : 0.7) : null;
  let status: string;
  if (hw.isMobile || hw.isApple) {
    status = usable == null ? 'unknown' : vram <= usable * 0.7 ? 'can-run' : vram <= usable ? 'tight' : 'cannot-run';
  } else if (hw.vramGb) {
    status = vram <= hw.vramGb * 0.85 ? 'can-run' : vram <= hw.vramGb * 1.1 ? 'tight' : 'cannot-run';
  } else if (usable) {
    status = vram <= usable ? 'can-run' : 'cannot-run';
  } else status = 'unknown';
  const bw = hw.bandwidthGbps || 160;
  const toks = bw / Math.max(vram, 0.5);
  let score = 40;
  if (status === 'can-run') score = 55 + Math.min(45, Math.round(toks * 2));
  else if (status === 'tight') score = 30;
  const grade = status === 'cannot-run' ? 'F' : status === 'unknown' ? '?' : score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';
  return { grade, status, quant: q.name, toksPerSec: Math.round(toks), vramGB: vram };
}

export function statusLabel(s: string): string {
  return ({ 'can-run': 'Corre cómodo', tight: 'Ajustado', 'cannot-run': 'No corre aquí', unknown: 'Sin datos' } as Record<string, string>)[s] || s;
}