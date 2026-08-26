// RANDI web — deteccion de hardware 100% client-side (fallback cuando el
// servidor local no esta). /api/hardware es la fuente autoritativa en linea.

import type { Hw } from './compat.js';

export function detectPlatform(): string | null {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Android/.test(ua)) return 'Android';
  if (/Linux/.test(ua)) return 'Linux';
  return null;
}

export function getGpuInfo() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { renderer: null, vendor: null };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    };
  } catch {
    return { renderer: null, vendor: null };
  }
}

export function parseVRAM(renderer: string | null): number | null {
  const m = renderer && (renderer.match(/\((\d+)\s*GB\)/i) || renderer.match(/\b(\d+)\s*GB\b/i));
  if (m) {
    const gb = parseInt(m[1], 10);
    if (gb >= 1 && gb <= 128) return gb;
  }
  return null;
}

const IS_APPLE = /\bm[1-9]\b|apple/i;

async function webgpuEstimates() {
  let gpuVram: number | null = null;
  let bw: number | null = null;
  try {
    if ('gpu' in navigator) {
      const adapter = await (navigator as any).gpu?.requestAdapter?.();
      if (adapter?.limits?.maxBufferSize) {
        const gb = adapter.limits.maxBufferSize / 1024 ** 3;
        if (gb >= 0.5) {
          const est = gb * 2;
          const common = [2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64, 80, 128];
          gpuVram = common.reduce((a, b) => (Math.abs(b - est) < Math.abs(a - est) ? b : a));
        }
      }
    }
  } catch { /* webgpu no disponible */ }
  if (!gpuVram) return { gpuVram: null, bw: null };
  if (!bw) bw = commonVramBw(gpuVram);
  return { gpuVram, bw };
}

export async function detectHardware(): Promise<Hw> {
  const platform = detectPlatform();
  const { renderer, vendor } = getGpuInfo();
  const deviceMemory = (navigator as any).deviceMemory || null;
  const cores = navigator.hardwareConcurrency || null;
  const isApple = platform === 'macOS' && (renderer ? IS_APPLE.test(renderer) : /mac/i.test(vendor || ''));
  const { gpuVram, bw } = await webgpuEstimates();
  const vram = isApple ? null : (parseVRAM(renderer) ?? gpuVram);
  const isMobile = platform === 'iOS' || platform === 'Android';
  return {
    platform: platform || undefined,
    cpu_cores: cores ?? undefined,
    cpu_threads: cores ?? undefined,
    ram_gb: deviceMemory ?? undefined,
    system_ram_gb: null,
    gpu_name: renderer || undefined,
    gpu_vram_gb: vram ?? undefined,
    gpu_memory_bw: isApple ? undefined : (bw ?? undefined),
    is_apple_silicon: isApple,
    is_mobile: isMobile,
  };
}

function commonVramBw(vram: number): number | null {
  if (vram >= 20) return 700;
  if (vram >= 12) return 450;
  if (vram >= 8) return 300;
  if (vram >= 4) return 180;
  return null;
}

export function deviceClass(hw: Hw): string {
  if (hw.is_apple_silicon) return 'apple-silicon';
  if (hw.is_mobile) return 'mobile';
  const vram = hw.gpu_vram_gb || 0;
  const bw = hw.gpu_memory_bw || 0;
  if (vram <= 0 && bw <= 0) return 'igpu';
  if (vram >= 40 || bw >= 1500) return 'workstation';
  return 'dedicated';
}

export function hardwareProfile(hw: Hw) {
  const cls = deviceClass(hw);
  const gpu = hw.gpu_name || 'CPU integrada';
  const ram = hw.ram_gb ? `${hw.ram_gb}GB` : 'RAM desconocida';
  let summary: string;
  if (cls === 'mobile') summary = `Movil ${gpu} con ${ram}`;
  else if (cls === 'apple-silicon') summary = `Apple Silicon ${gpu} con memoria unificada de ${ram}`;
  else if (cls === 'workstation') summary = `Estacion de trabajo ${gpu} con ${hw.gpu_vram_gb}GB de VRAM`;
  else if (hw.gpu_vram_gb) summary = `${gpu} con ${hw.gpu_vram_gb}GB VRAM y ${ram}`;
  else summary = `Sin GPU dedicada (${gpu}) con ${ram}`;
  const usable = hw.ram_gb ? (hw.is_mobile && !hw.is_apple_silicon ? hw.ram_gb * 0.55 : hw.is_apple_silicon ? hw.ram_gb * 0.75 : hw.ram_gb * 0.7) : null;
  const cap = hw.gpu_vram_gb || usable || hw.ram_gb;
  return {
    class: cls,
    platform: hw.platform,
    ramGb: hw.ram_gb,
    usableRamGb: usable ? Math.round(usable * 10) / 10 : null,
    gpu: { name: hw.gpu_name, vramGb: hw.gpu_vram_gb, bandwidthGbps: hw.gpu_memory_bw },
    comfortableVramGb: cap ? Math.round(cap * 0.85 * 10) / 10 : null,
    isMobile: hw.is_mobile,
    isAppleSilicon: hw.is_apple_silicon,
    summary,
  };
}