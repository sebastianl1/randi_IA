// RANDI — motor de compatibilidad (mirror JS de bin/lib/compat.py)
// skills global: mismos umbrales que el motor Python. Usado por el frontend
// para calculos rapidos sin red; /api/recommend es la fuente autoritativa.

export const GRADES = {
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
];

const RUNTIME_OVERHEAD_GB = 0.5;

export function makeQuants(paramsBillions) {
  const total = paramsBillions * 1e9;
  return QUANTS.map(([name, bits, bpp, quality]) => {
    const vram = Math.max((total * bpp) / 1024 ** 3 * 1.1 + RUNTIME_OVERHEAD_GB, 0.5);
    const disk = Math.max((total * bpp) / 1024 ** 3 * 1.05, 0.1);
    return { name, bits, vramGB: Math.round(vram * 10) / 10, diskGB: Math.round(disk * 10) / 10, quality };
  });
}

export function activeParams(model) {
  if (model.architecture !== 'moe') return Number(model.paramsBillions) || 0;
  let p = Number(model.activeParams?.match(/([\d.]+)\s*B/i)?.[1]);
  return isFinite(p) && p > 0 ? p : Number(model.paramsBillions) || 0;
}

export function workingSet(vramGB, model) {
  const active = activeParams(model);
  const total = Number(model.paramsBillions) || 0;
  if (total <= 0 || active >= total) return vramGB;
  return Math.max(0.5, vramGB * (active / total));
}

function usableRam(hw) {
  if (hw.is_mobile && !hw.is_apple_silicon) {
    const f = hw.platform === 'iOS' ? 0.5 : 0.55;
    return hw.ram_gb ? hw.ram_gb * f : null;
  }
  if (hw.is_apple_silicon && hw.ram_gb) return hw.ram_gb * 0.75;
  if (hw.ram_gb) return hw.ram_gb * 0.7;
  return null;
}

export function evaluateStatus(vramNeeded, hw) {
  const usable = usableRam(hw);
  const step = (u) => vramNeeded <= u * 0.7 ? 'can-run' : vramNeeded <= u ? 'tight' : 'cannot-run';
  if (hw.is_mobile) return usable == null ? 'unknown' : step(usable);
  if (hw.is_apple_silicon) return usable == null ? 'unknown' : step(usable);
  if (hw.gpu_vram_gb) {
    if (vramNeeded <= hw.gpu_vram_gb * 0.85) return 'can-run';
    if (vramNeeded <= hw.gpu_vram_gb * 1.1) return 'tight';
    if (hw.system_ram_gb && hw.system_ram_gb > hw.gpu_vram_gb) {
      const u = hw.system_ram_gb * 0.7;
      if (vramNeeded <= hw.gpu_vram_gb + u) return 'can-run-slow';
    }
    return 'cannot-run';
  }
  if (hw.ram_gb) return step(hw.ram_gb * 0.7);
  return 'unknown';
}

export function estimateTokensPerSecond(workingSetGB, hw) {
  if (!hw.gpu_memory_bw) return null;
  const eff = hw.is_mobile && !hw.is_apple_silicon ? 0.4 : hw.is_apple_silicon ? 0.65 : 0.7;
  if (hw.gpu_vram_gb && workingSetGB > hw.gpu_vram_gb && hw.system_ram_gb) {
    const fv = Math.min(1, hw.gpu_vram_gb / workingSetGB);
    const ebw = 1 / (fv / hw.gpu_memory_bw + (1 - fv) / 50);
    return Math.max(1, Math.round((ebw / workingSetGB) * eff * 0.85));
  }
  return Math.round((hw.gpu_memory_bw / workingSetGB) * eff);
}

export function memPercent(vramNeeded, hw) {
  if (hw.is_mobile || hw.is_apple_silicon) return hw.ram_gb ? Math.round(vramNeeded / hw.ram_gb * 100) : null;
  const v = hw.gpu_vram_gb || hw.ram_gb;
  return v ? Math.round(vramNeeded / v * 100) : null;
}

function lerp(x, x0, x1, y0, y1) { return y0 + (y1 - y0) * ((x - x0) / (x1 - x0)); }

export function computeScore(status, toks, paramsB, memPct) {
  if (status === 'cannot-run' || status === 'unknown') return 0;
  let speedScore;
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

export function scoreToGrade(score, status) {
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

export function evaluateModel(model, hw) {
  const quants = makeQuants(Number(model.paramsBillions) || 0);
  let best = null;
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
