"""RANDI — Deteccion de hardware nativa (CLI + servidor).

Detecta CPU, RAM, GPU, VRAM y bandwidth por plataforma:
  - psutil cuando esta disponible (todas las plataformas)
  - fallback /proc/meminfo (Linux/Termux/WSL) y sysctl (macOS)
  - GPU via nvidia-smi / rocm-smi / system_profiler / wmic / lspci / getprop
  - base de datos de GPUs (misma curaduria que canirun.ai) como ultimo recurso

La web ademas hace deteccion en el navegador (web/js/hardware.js); este modulo
es la version nativa y alimenta la CLI y /api/hardware.
"""

from __future__ import annotations

import json
import os
import platform as _platform
import re
import shutil
import subprocess
from pathlib import Path

from compat import HardwareInfo  # noqa: F401  (re-export para el servidor)

# ── Base de datos de GPUs (curaduria basada en canirun.ai) ─────────────────

GPU_DB: dict[str, dict] = {
    # NVIDIA desktop
    "RTX 4090": {"vram": 24, "bw": 1008, "cores": 16384},
    "RTX 4080 SUPER": {"vram": 16, "bw": 736, "cores": 10240},
    "RTX 4080": {"vram": 16, "bw": 717, "cores": 9728},
    "RTX 4070 Ti SUPER": {"vram": 16, "bw": 672, "cores": 8448},
    "RTX 4070 Ti": {"vram": 12, "bw": 504, "cores": 7680},
    "RTX 4070 SUPER": {"vram": 12, "bw": 504, "cores": 7168},
    "RTX 4070": {"vram": 12, "bw": 504, "cores": 5888},
    "RTX 4060 Ti 16GB": {"vram": 16, "bw": 288, "cores": 4352},
    "RTX 4060 Ti": {"vram": 8, "bw": 288, "cores": 4352},
    "RTX 4060": {"vram": 8, "bw": 272, "cores": 3072},
    "RTX 3090 Ti": {"vram": 24, "bw": 1008, "cores": 10752},
    "RTX 3090": {"vram": 24, "bw": 936, "cores": 10496},
    "RTX 3080 Ti": {"vram": 12, "bw": 912, "cores": 10240},
    "RTX 3080": {"vram": 10, "bw": 760, "cores": 8704},
    "RTX 3070 Ti": {"vram": 8, "bw": 608, "cores": 6144},
    "RTX 3070": {"vram": 8, "bw": 448, "cores": 5888},
    "RTX 3060 Ti": {"vram": 8, "bw": 448, "cores": 4864},
    "RTX 3060": {"vram": 12, "bw": 360, "cores": 3584},
    "RTX 3050": {"vram": 8, "bw": 224, "cores": 2560},
    "RTX 2080 Ti": {"vram": 11, "bw": 616, "cores": 4352},
    "RTX 2080 SUPER": {"vram": 8, "bw": 496, "cores": 3072},
    "RTX 2080": {"vram": 8, "bw": 448, "cores": 2944},
    "RTX 2070 SUPER": {"vram": 8, "bw": 448, "cores": 2560},
    "RTX 2070": {"vram": 8, "bw": 448, "cores": 2304},
    "RTX 2060 SUPER": {"vram": 8, "bw": 448, "cores": 2176},
    "RTX 2060": {"vram": 6, "bw": 336, "cores": 1920},
    "GTX 1080 Ti": {"vram": 11, "bw": 484, "cores": 3584},
    "GTX 1080": {"vram": 8, "bw": 320, "cores": 2560},
    "GTX 1070": {"vram": 8, "bw": 256, "cores": 1920},
    "GTX 1060 6GB": {"vram": 6, "bw": 192, "cores": 1280},
    "GTX 1060 3GB": {"vram": 3, "bw": 192, "cores": 1152},
    "GTX 1050 Ti": {"vram": 4, "bw": 112, "cores": 768},
    "GTX 1050": {"vram": 2, "bw": 112, "cores": 640},
    # NVIDIA laptop 40
    "RTX 4090 Laptop": {"vram": 16, "bw": 576, "cores": 9728},
    "RTX 4080 Laptop": {"vram": 12, "bw": 432, "cores": 7424},
    "RTX 4070 Laptop": {"vram": 8, "bw": 256, "cores": 4608},
    "RTX 4060 Laptop": {"vram": 8, "bw": 256, "cores": 3072},
    "RTX 4050 Laptop": {"vram": 6, "bw": 192, "cores": 2560},
    # NVIDIA datacenter
    "A100": {"vram": 80, "bw": 2039, "cores": 6912},
    "A100 40GB": {"vram": 40, "bw": 1555, "cores": 6912},
    "H100": {"vram": 80, "bw": 3350, "cores": 14592},
    "H200": {"vram": 141, "bw": 4800, "cores": 16896},
    "B200": {"vram": 192, "bw": 8000, "cores": 20480},
    "RTX A6000": {"vram": 48, "bw": 768, "cores": 10752},
    "RTX A5000": {"vram": 24, "bw": 768, "cores": 8192},
    "RTX A4000": {"vram": 16, "bw": 448, "cores": 6144},
    "L4": {"vram": 24, "bw": 300, "cores": 7424},
    "T4": {"vram": 16, "bw": 300, "cores": 2560},
    # AMD desktop
    "RX 7900 XTX": {"vram": 24, "bw": 960, "cores": 6144},
    "RX 7900 XT": {"vram": 20, "bw": 800, "cores": 5376},
    "RX 7800 XT": {"vram": 16, "bw": 624, "cores": 3840},
    "RX 7700 XT": {"vram": 12, "bw": 432, "cores": 3456},
    "RX 7600 XT": {"vram": 16, "bw": 288, "cores": 2048},
    "RX 7600": {"vram": 8, "bw": 288, "cores": 2048},
    "RX 6800 XT": {"vram": 16, "bw": 512, "cores": 4608},
    "RX 6800": {"vram": 16, "bw": 512, "cores": 3840},
    "RX 6700 XT": {"vram": 12, "bw": 384, "cores": 2560},
    "RX 6600 XT": {"vram": 8, "bw": 256, "cores": 2048},
    "RX 6600": {"vram": 8, "bw": 224, "cores": 1792},
    "RX 5700 XT": {"vram": 8, "bw": 448, "cores": 2560},
    "RX 580": {"vram": 8, "bw": 256, "cores": 2304},
    "Vega 64": {"vram": 8, "bw": 484, "cores": 4096},
    # Intel Arc
    "Arc A770": {"vram": 16, "bw": 560, "cores": 4096},
    "Arc A750": {"vram": 8, "bw": 512, "cores": 3584},
    "Arc A580": {"vram": 8, "bw": 512, "cores": 3072},
    "Arc A380": {"vram": 6, "bw": 186, "cores": 1024},
    # iGPU Intel
    "Iris Xe": {"vram": 0, "bw": 68, "cores": 96},
    "UHD 770": {"vram": 0, "bw": 76, "cores": 32},
    "UHD 730": {"vram": 0, "bw": 76, "cores": 24},
    "UHD Graphics 630": {"vram": 0, "bw": 42, "cores": 24},
    "UHD Graphics 620": {"vram": 0, "bw": 34, "cores": 24},
    # iGPU AMD APU
    "Radeon 780M": {"vram": 0, "bw": 89, "cores": 768},
    "Radeon 760M": {"vram": 0, "bw": 89, "cores": 512},
    "Radeon 680M": {"vram": 0, "bw": 77, "cores": 768},
    "Vega 8": {"vram": 0, "bw": 51, "cores": 512},
    "Vega 7": {"vram": 0, "bw": 51, "cores": 448},
}

APPLE_DB: dict[str, dict] = {
    "m5 max": {"ram": 36, "bw": 614, "cpu": 18, "gpu": 40},
    "m5 pro": {"ram": 24, "bw": 307, "cpu": 18, "gpu": 20},
    "m5": {"ram": 16, "bw": 153, "cpu": 10, "gpu": 10},
    "m4 max": {"ram": 36, "bw": 546, "cpu": 16, "gpu": 40},
    "m4 pro": {"ram": 24, "bw": 273, "cpu": 14, "gpu": 20},
    "m4": {"ram": 16, "bw": 120, "cpu": 10, "gpu": 10},
    "m3 ultra": {"ram": 96, "bw": 819, "cpu": 32, "gpu": 80},
    "m3 max": {"ram": 36, "bw": 400, "cpu": 16, "gpu": 40},
    "m3 pro": {"ram": 18, "bw": 150, "cpu": 12, "gpu": 18},
    "m3": {"ram": 8, "bw": 100, "cpu": 8, "gpu": 10},
    "m2 ultra": {"ram": 64, "bw": 800, "cpu": 24, "gpu": 76},
    "m2 max": {"ram": 32, "bw": 400, "cpu": 12, "gpu": 38},
    "m2 pro": {"ram": 16, "bw": 200, "cpu": 12, "gpu": 19},
    "m2": {"ram": 8, "bw": 100, "cpu": 8, "gpu": 10},
    "m1 ultra": {"ram": 64, "bw": 800, "cpu": 20, "gpu": 64},
    "m1 max": {"ram": 32, "bw": 400, "cpu": 10, "gpu": 32},
    "m1 pro": {"ram": 16, "bw": 200, "cpu": 10, "gpu": 16},
    "m1": {"ram": 8, "bw": 68, "cpu": 8, "gpu": 8},
}

MOBILE_GPU_DB: dict[str, dict] = {
    "Adreno 830": {"bw": 90},
    "Adreno 750": {"bw": 77},
    "Adreno 740": {"bw": 62},
    "Adreno 730": {"bw": 51},
    "Adreno 720": {"bw": 38},
    "Adreno 710": {"bw": 34},
    "Adreno 660": {"bw": 44},
    "Adreno 650": {"bw": 44},
    "Adreno 640": {"bw": 34},
    "Adreno 630": {"bw": 30},
    "Adreno 620": {"bw": 17},
    "Immortalis-G925": {"bw": 77},
    "Immortalis-G720": {"bw": 77},
    "Immortalis-G715": {"bw": 51},
    "Mali-G925": {"bw": 77},
    "Mali-G720": {"bw": 77},
    "Mali-G715": {"bw": 51},
    "Mali-G710": {"bw": 44},
    "Mali-G78": {"bw": 35},
    "Mali-G77": {"bw": 30},
    "Mali-G76": {"bw": 25},
    "Mali-G57": {"bw": 17},
    "Mali-G52": {"bw": 12},
    "Xclipse 940": {"bw": 51},
    "Xclipse 930": {"bw": 44},
    "Tensor G5": {"bw": 56, "ram": 16},
    "Tensor G4": {"bw": 51, "ram": 12},
    "Tensor G3": {"bw": 51, "ram": 8},
    "Tensor G2": {"bw": 44, "ram": 8},
    "Tensor G1": {"bw": 35, "ram": 8},
}


def _run(cmd: list[str]) -> str:
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return out.stdout.strip()
    except Exception:
        return ""


def detect_platform() -> str:
    if os.path.isdir("/data/data/com.termux"):
        return "termux"
    if os.environ.get("MSYSTEM") or os.environ.get("MINGW_PREFIX"):
        return "windows"
    if _platform.system() == "Darwin":
        return "macos"
    if os.environ.get("WSL_DISTRO_NAME"):
        return "wsl"
    try:
        if "microsoft" in (Path("/proc/version").read_text(errors="ignore").lower() if Path("/proc/version").exists() else ""):
            return "wsl"
    except Exception:
        pass
    return "linux"


def _psutil_available():
    try:
        import psutil  # noqa: F401
        return True
    except ImportError:
        return False


def detect_ram() -> float:
    if _psutil_available():
        import psutil
        return round(psutil.virtual_memory().total / (1024 ** 3), 1)
    try:
        if Path("/proc/meminfo").exists():
            for line in Path("/proc/meminfo").read_text().splitlines():
                if line.startswith("MemTotal:"):
                    kb = float(line.split()[1])
                    return round(kb / 1024 / 1024, 1)
    except Exception:
        pass
    if _platform.system() == "Darwin":
        out = _run(["sysctl", "-n", "hw.memsize"])
        if out.isdigit():
            return round(int(out) / (1024 ** 3), 1)
    return 0.0


def detect_cpu() -> tuple[str, int, int]:
    import os
    name = _platform.processor() or _platform.machine() or "CPU"
    try:
        cores = os.cpu_count() or None
    except Exception:
        cores = None
    threads = cores
    try:
        if Path("/proc/cpuinfo").exists():
            with open("/proc/cpuinfo") as f:
                txt = f.read()
            if "model name" in txt:
                name = re.search(r"model name\s*:\s*(.+)", txt).group(1).strip()
            cores = txt.count("processor\t:")
            threads = cores
    except Exception:
        pass
    if _platform.system() == "Darwin":
        cores = int(_run(["sysctl", "-n", "hw.ncpu"]) or cores or 0)
    return name, cores or 0, threads or 0


def match_gpu_db(name: str) -> dict | None:
    upper = name.upper().replace("(TM)", "").replace("(R)", "")
    best = None
    best_len = 0
    for gpu, data in GPU_DB.items():
        if gpu.upper() in upper and len(gpu) > best_len:
            best = data
            best_len = len(gpu)
    return best


def match_apple_db(name: str) -> dict | None:
    lower = name.lower()
    for chip, data in APPLE_DB.items():
        if chip in lower:
            return data
    return None


def match_mobile_db(name: str) -> dict | None:
    upper = name.upper()
    for gpu, data in MOBILE_GPU_DB.items():
        if gpu.upper() in upper:
            return data
    return None


def detect_gpu(platform: str) -> tuple[str | None, float | None, float | None]:
    """Devuelve (nombre_gpu, vram_gb, bandwidth_gbs)."""
    name = None
    vram = None
    bw = None

    nvidia = shutil.which("nvidia-smi")
    if nvidia:
        out = _run([nvidia, "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        if out:
            line = out.splitlines()[0] if out else ""
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 2:
                name = parts[0]
                try:
                    vram = round(int(float(parts[1])) / 1024, 1)
                except ValueError:
                    vram = None

    if name is None and shutil.which("rocm-smi"):
        out = _run(["rocm-smi", "--showproductname", "--showmeminfo", "vram"])
        m = re.search(r"(\w[\w ]*)\s+AMD\s", out)
        if m:
            name = m.group(1).strip()
        m = re.search(r"vram\s*:\s*(\d+)\s*MB", out, re.I)
        if m:
            vram = round(int(m.group(1)) / 1024, 1)

    if name is None and platform == "macos":
        out = _run(["system_profiler", "SPDisplaysDataType", "-json"])
        try:
            data = json.loads(out)
            gpu = (data.get("SPDisplaysDataType") or [{}])[0]
            name = gpu.get("sppci_model") or gpu.get("_name")
            vram_raw = gpu.get("spdisplays_vram") or ""
            m = re.search(r"(\d+)\s*(GB|MB)", vram_raw, re.I)
            if m:
                val, unit = m.groups()
                vram = int(val) / 1024 if unit.upper() == "MB" else int(val)
        except Exception:
            pass

    if name is None and platform == "windows":
        out = _run(["wmic", "path", "win32_VideoController", "get", "name,AdapterRAM", "/format:csv"])
        for line in out.splitlines()[1:]:
            if not line.strip():
                continue
            parts = line.split(",")
            if len(parts) >= 3 and parts[2].strip():
                name = parts[2].strip()
                break

    if name is None and Path("/sys/class/drm").is_dir():
        try:
            for entry in sorted(Path("/sys/class/drm").iterdir()):
                if entry.name.startswith("card") and "-" in entry.name:
                    try:
                        name = (entry / "device/device").read_text().strip() or name
                    except Exception:
                        pass
        except PermissionError:
            pass

    if name is None and platform == "termux":
        hw = _run(["getprop", "ro.hardware"]).strip().lower()
        if "qcom" in hw or "qualcomm" in hw or "sm" in hw:
            name = "Adreno (Qualcomm)"
        elif "mali" in hw or "arm" in hw:
            name = "Mali (ARM)"

    # Bandwidth desde la DB si conocemos el GPU
    if name:
        db = match_gpu_db(name) or match_apple_db(name) or match_mobile_db(name)
        if db:
            if "vram" in db and db["vram"]:
                vram = vram or float(db["vram"])
            if "bw" in db:
                bw = float(db["bw"])
            if "ram" in db and not vram:
                vram = float(db["ram"])
    if bw is None and vram:
        # Heuristica simple por VRAM si la DB no la cubrio
        if vram >= 20:
            bw = 700
        elif vram >= 12:
            bw = 450
        elif vram >= 8:
            bw = 300
        elif vram >= 4:
            bw = 180
        else:
            bw = 112

    return name, vram, bw


def is_apple_silicon(platform: str, gpu_name: str | None) -> bool:
    if platform != "macos":
        return False
    if gpu_name:
        return bool(re.search(r"\bm[1-9]\b", gpu_name.lower())) or "apple" in gpu_name.lower()
    return False


def detect_hardware() -> HardwareInfo:
    platform = detect_platform()
    cpu_name, cores, threads = detect_cpu()
    ram = detect_ram()
    gpu_name, vram, bw = detect_gpu(platform)
    apple = is_apple_silicon(platform, gpu_name)
    mobile = platform == "termux"

    hw = HardwareInfo(
        platform=platform,
        cpu_name=cpu_name or None,
        cpu_cores=cores or None,
        cpu_threads=threads or None,
        ram_gb=ram or None,
        system_ram_gb=ram or None,
        gpu_name=gpu_name,
        gpu_vram_gb=vram,
        gpu_memory_bw=bw,
        is_apple_silicon=apple,
        is_mobile=mobile,
        device_name=gpu_name,
    )
    # Apple Silicon: memoria unificada es la RAM total
    if apple and ram:
        hw.ram_gb = ram
        hw.gpu_vram_gb = None
    return hw


def to_dict(hw: HardwareInfo) -> dict:
    return {
        "platform": hw.platform,
        "cpu_name": hw.cpu_name,
        "cpu_cores": hw.cpu_cores,
        "cpu_threads": hw.cpu_threads,
        "ram_gb": hw.ram_gb,
        "system_ram_gb": hw.system_ram_gb,
        "gpu_name": hw.gpu_name,
        "gpu_vram_gb": hw.gpu_vram_gb,
        "gpu_memory_bw": hw.gpu_memory_bw,
        "is_apple_silicon": hw.is_apple_silicon,
        "is_mobile": hw.is_mobile,
        "device_name": hw.device_name,
    }


def hardware_from_dict(data: dict) -> HardwareInfo:
    return HardwareInfo(**{k: data.get(k) for k in (
        "platform", "cpu_name", "cpu_cores", "cpu_threads", "cpu_benchmark",
        "ram_gb", "system_ram_gb", "gpu_name", "gpu_vram_gb", "gpu_memory_bw",
        "gpu_cores", "is_apple_silicon", "is_mobile", "device_name")})


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "detect":
        hw = detect_hardware()
        print(json.dumps(to_dict(hw), ensure_ascii=False, indent=2))
    else:
        print(json.dumps(to_dict(detect_hardware()), ensure_ascii=False, indent=2))
