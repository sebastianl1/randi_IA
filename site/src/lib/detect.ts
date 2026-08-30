// Detección de hardware del equipo (client-side, completo).
export interface DetectedHw {
  platform?: string;
  cores?: number;
  threads?: number;
  ramGb?: number | null;
  gpuName?: string | null;
  vramGb?: number | null;
  bandwidthGbps?: number | null;
  isMobile?: boolean;
  isApple?: boolean;
  deviceClass?: string;
  summary?: string;
}

// Bandwidth aproximado por GPU (subconjunto de la DB del motor RANDI).
const BW: Array<[string, number]> = [
  ['GB1024', 1008], ['RTX 4090', 1008], ['A100', 2039], ['H100', 3350],
  ['RTX 4080', 717], ['RTX 4070', 504], ['RTX 4060', 272],
  ['RTX 3090', 936], ['RTX 3080', 760], ['RTX 3070', 448], ['RTX 3060', 360],
  ['RTX 3050', 224],
  ['RX 7900', 960], ['RX 7800', 624], ['RX 7700', 432], ['RX 6800', 512], ['RX 6700', 384], ['RX 6600', 256],
  ['Arc A770', 560], ['A750', 512],
  ['M5', 614], ['M3', 400], ['M2', 400], ['M1', 400],
];

function renderer(): string | null {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : null;
  } catch { return null; }
}
export function bandwidthFor(name: string | null): number | null {
  if (!name) return null;
  const n = name.toUpperCase();
  for (const [k, v] of BW) if (n.includes(k.toUpperCase())) return v;
  return null;
}
function vramOf(r: string | null): number | null {
  const m = r && (r.match(/\((\d+)\s*GB\)/i) || r.match(/\b(\d+)\s*GB\b/i));
  return m ? parseInt(m[1], 10) : null;
}
function platformOf(): string | null {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Android/.test(ua)) return 'Android';
  if (/Linux/.test(ua)) return 'Linux';
  return null;
}
async function webgpuVram(): Promise<number | null> {
  try {
    if (!('gpu' in navigator)) return null;
    const a = await (navigator as any).gpu?.requestAdapter?.();
    const gb = a?.limits?.maxBufferSize / 1024 ** 3;
    if (gb >= 0.5) {
      const est = gb * 2;
      return [2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64, 80, 128].reduce((best, x) =>
        Math.abs(x - est) < Math.abs(best - est) ? x : best, 8);
    }
    return null;
  } catch { return null; }
}

export async function detectHardware(): Promise<DetectedHw> {
  const platform = platformOf();
  const gpu = renderer();
  const ramGb = (navigator as any).deviceMemory ?? null;
  const cores = navigator.hardwareConcurrency ?? null;
  const isApple = platform === 'macOS' && (gpu ? /\bm[1-9]\b|apple/i.test(gpu) : /mac/i.test(platform));
  const parsed = vramOf(gpu);
  const webgpu = parsed ? null : await webgpuVram();
  const vramGb = isApple ? null : (parsed ?? webgpu);
  const bw = isApple ? bandwidthFor(gpu) : (bandwidthFor(gpu) ?? (vramGb ? commonBw(vramGb) : null));
  const isMobile = platform === 'iOS' || platform === 'Android';
  const cls = isMobile ? 'mobile' : isApple ? (vramGb || ramGb || 0) >= 32 ? 'pro' : 'gpu'
    : (vramGb ?? 0) >= 24 ? 'pro' : (vramGb ?? 0) >= 8 ? 'gpu'
      : (ramGb ?? 0) >= 12 ? 'igpu' : 'basic';
  return {
    platform, cores, threads: cores,
    ramGb, gpuName: gpu, vramGb, bandwidthGbps: isApple ? null : bw,
    isMobile, isApple, deviceClass: cls,
    summary: `${gpu || 'CPU'} · ${ramGb ? ramGb + 'GB RAM' : 'RAM —'}`,
  };
}
function commonBw(vram: number): number | null {
  if (vram >= 20) return 700; if (vram >= 12) return 450; if (vram >= 8) return 300;
  if (vram >= 4) return 180; return null;
}