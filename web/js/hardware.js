// RANDI — deteccion de hardware en el navegador (fallback cuando no hay servidor).
// La fuente autoritativa en navegador conectado es /api/hardware (servidor local).

export function detectPlatform() {
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
  } catch (e) {
    return { renderer: null, vendor: null };
  }
}

export function parseVRAM(renderer) {
  const m = renderer && (renderer.match(/\((\d+)\s*GB\)/i) || renderer.match(/\b(\d+)\s*GB\b/i));
  if (m) {
    const gb = parseInt(m[1], 10);
    if (gb >= 1 && gb <= 128) return gb;
  }
  return null;
}

const IS_APPLE = /\bm[1-9]\b|apple/i;

export async function detectHardware() {
  const platform = detectPlatform();
  const { renderer, vendor } = getGpuInfo();
  const deviceMemory = navigator.deviceMemory || null;
  const cores = navigator.hardwareConcurrency || null;
  const isApple = platform === 'macOS' && (renderer ? IS_APPLE.test(renderer) : /mac/i.test(vendor || ''));

  let vram = parseVRAM(renderer);

  // WebGPU maxBufferSize -> estimacion de VRAM
  let gpuVram = vram;
  let bw = null;
  try {
    if ('gpu' in navigator) {
      const adapter = await navigator.gpu?.requestAdapter?.();
      if (adapter?.limits?.maxBufferSize) {
        const gb = adapter.limits.maxBufferSize / 1024 ** 3;
        if (gb >= 0.5) {
          const est = gb * 2;
          const common = [2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64, 80, 128];
          gpuVram = common.reduce((a, b) => (Math.abs(b - est) < Math.abs(a - est) ? b : a));
        }
      }
      if (adapter?.info) {
        bw = /nvidia/i.test(adapter.info.device || '') ? 300 : commonVramBw(gpuVram);
      }
    }
  } catch (e) {}
  if (!bw) bw = commonVramBw(gpuVram);

  const isMobile = platform === 'iOS' || platform === 'Android';
  return {
    platform,
    cpu_cores: cores,
    cpu_threads: cores,
    ram_gb: deviceMemory || (navigator.deviceMemory ? null : null),
    system_ram_gb: null,
    gpu_name: renderer,
    gpu_vram_gb: isApple ? null : gpuVram,
    gpu_memory_bw: isApple ? null : bw,
    is_apple_silicon: isApple,
    is_mobile: isMobile,
    device_name: renderer,
  };
}

function commonVramBw(vram) {
  if (!vram) return null;
  if (vram >= 20) return 700;
  if (vram >= 12) return 450;
  if (vram >= 8) return 300;
  if (vram >= 4) return 180;
  return 112;
}
