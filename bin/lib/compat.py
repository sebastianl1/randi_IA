"""RANDI — Motor de compatibilidad hardware <-> modelo.

Porte a Python del motor de canirun.ai (midudev/canirun.ai). Es el "skill
global" de compatibilidad: lo usan la CLI (Rich), el servidor web (/api/*) y
la deteccion nativa de hardware. La web ademas tiene un espejo en TS
(web/src/lib/compat.ts) que debe mantener los mismos umbrales.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

# ── Tipos ────────────────────────────────────────────────────────────────

ModelStatus = str  # can-run | tight | can-run-slow | cannot-run | unknown
Grade = str  # S | A | B | C | D | F | ?

GRADES: dict[str, dict[str, str]] = {
    "S": {"letter": "S", "label": "Runs great",  "color": "#22c55e"},
    "A": {"letter": "A", "label": "Runs well",   "color": "#4ade80"},
    "B": {"letter": "B", "label": "Decent",      "color": "#a3e635"},
    "C": {"letter": "C", "label": "Tight fit",   "color": "#f59e0b"},
    "D": {"letter": "D", "label": "Barely runs", "color": "#f97316"},
    "F": {"letter": "F", "label": "Too heavy",   "color": "#ef4444"},
    "?": {"letter": "?", "label": "Unknown",     "color": "#56565f"},
}

SYSTEM_RAM_BW_GBS = 50.0  # DDR5 dual-channel ~50 GB/s


@dataclass
class HardwareInfo:
    platform: Optional[str] = None
    cpu_name: Optional[str] = None
    cpu_cores: Optional[int] = None
    cpu_threads: Optional[int] = None
    cpu_benchmark: Optional[int] = None
    ram_gb: Optional[float] = None
    system_ram_gb: Optional[float] = None
    gpu_name: Optional[str] = None
    gpu_vram_gb: Optional[float] = None
    gpu_memory_bw: Optional[float] = None  # GB/s
    gpu_cores: Optional[int] = None
    is_apple_silicon: bool = False
    is_mobile: bool = False
    device_name: Optional[str] = None

    def usable_ram(self) -> Optional[float]:
        """RAM utilizable segun el tipo de dispositivo (factor canirun)."""
        if self.is_mobile and not self.is_apple_silicon:
            factor = 0.50 if self.platform == "iOS" else 0.55
            if self.ram_gb:
                return self.ram_gb * factor
            return None
        if self.is_apple_silicon and self.ram_gb:
            return self.ram_gb * 0.75
        if self.ram_gb:
            return self.ram_gb * 0.70
        return None


# ── Cuantizaciones ────────────────────────────────────────────────────────

RUNTIME_OVERHEAD_GB = 0.5
QUANT_SPECS = [
    ("Q2_K", 2, 0.3125, "low"),
    ("Q3_K_M", 3, 0.4375, "moderate"),
    ("Q4_K_M", 4, 0.5, "good"),
    ("Q5_K_M", 5, 0.625, "good"),
    ("Q6_K", 6, 0.75, "excellent"),
    ("Q8_0", 8, 1.0, "excellent"),
    ("F16", 16, 2.0, "lossless"),
]


def make_quants(params_billions: float) -> list[dict]:
    """Genera las 7 cuantizaciones (Q2_K -> F16) con vram/disk estimados.

    Mismas formulas que canirun.ai:
      vram = max(params*bpp/1024^3 * 1.1 + 0.5, 0.5)
      disk = max(params*bpp/1024^3 * 1.05, 0.1)
    """
    total_params = params_billions * 1_000_000_000
    quants = []
    for name, bits, bpp, quality in QUANT_SPECS:
        vram = max(total_params * bpp / (1024 ** 3) * 1.1 + RUNTIME_OVERHEAD_GB, 0.5)
        disk = max(total_params * bpp / (1024 ** 3) * 1.05, 0.1)
        quants.append({
            "name": name,
            "bits": bits,
            "vramGB": round(vram, 1),
            "diskGB": round(disk, 1),
            "quality": quality,
        })
    return quants


def active_params_billions(model: dict) -> float:
    """Parametros activos por token. Dense usa todos sus pesos."""
    if model.get("architecture") != "moe":
        return float(model.get("paramsBillions", 0) or 0)
    moe = model.get("moe") or {}
    if moe.get("activeParameters"):
        return moe["activeParameters"] / 1_000_000_000
    active = model.get("activeParams")
    if active:
        import re
        m = re.search(r"([\d.]+)\s*B", str(active), re.I)
        if m:
            return float(m.group(1))
    return float(model.get("paramsBillions", 0) or 0)


def inference_working_set_gb(total_vram_gb: float, model: dict) -> float:
    """Working set para estimar throughput en MoE."""
    active = active_params_billions(model)
    total = float(model.get("paramsBillions", 0) or 0)
    if total <= 0 or active >= total:
        return total_vram_gb
    return max(0.5, total_vram_gb * (active / total))


# ── Evaluacion ────────────────────────────────────────────────────────────

def evaluate_model(vram_needed: float, hw: HardwareInfo) -> ModelStatus:
    usable = hw.usable_ram()
    if hw.is_mobile and not hw.is_apple_silicon:
        if usable is None:
            return "unknown"
        if vram_needed <= usable * 0.70:
            return "can-run"
        if vram_needed <= usable:
            return "tight"
        return "cannot-run"

    if hw.is_apple_silicon:
        if usable is None:
            return "unknown"
        if vram_needed <= usable * 0.70:
            return "can-run"
        if vram_needed <= usable:
            return "tight"
        return "cannot-run"

    if hw.gpu_vram_gb:
        if vram_needed <= hw.gpu_vram_gb * 0.85:
            return "can-run"
        if vram_needed <= hw.gpu_vram_gb * 1.1:
            return "tight"
        if hw.system_ram_gb and hw.system_ram_gb > hw.gpu_vram_gb:
            usable_ram = hw.system_ram_gb * 0.70
            if vram_needed <= hw.gpu_vram_gb + usable_ram:
                return "can-run-slow"
        return "cannot-run"

    if hw.ram_gb:
        usable_ram = hw.ram_gb * 0.70
        if vram_needed <= usable_ram * 0.70:
            return "can-run"
        if vram_needed <= usable_ram:
            return "tight"
        return "cannot-run"

    return "unknown"


def estimate_tokens_per_second(working_set_gb: float, hw: HardwareInfo) -> Optional[int]:
    if not hw.gpu_memory_bw:
        return None
    if hw.is_mobile and not hw.is_apple_silicon:
        efficiency = 0.40
    elif hw.is_apple_silicon:
        efficiency = 0.65
    else:
        efficiency = 0.70

    if hw.gpu_vram_gb and working_set_gb > hw.gpu_vram_gb and hw.system_ram_gb:
        fraction_vram = min(1, hw.gpu_vram_gb / working_set_gb)
        fraction_ram = 1 - fraction_vram
        if fraction_vram > 0:
            effective_bw = 1 / (fraction_vram / hw.gpu_memory_bw + fraction_ram / SYSTEM_RAM_BW_GBS)
        else:
            effective_bw = SYSTEM_RAM_BW_GBS
        toks = (effective_bw / working_set_gb) * efficiency * 0.85
        return max(1, round(toks))

    toks = (hw.gpu_memory_bw / working_set_gb) * efficiency
    return round(toks)


def memory_percentage(vram_needed: float, hw: HardwareInfo) -> Optional[int]:
    if hw.is_mobile or hw.is_apple_silicon:
        if not hw.ram_gb:
            return None
        return round(vram_needed / hw.ram_gb * 100)
    vram = hw.gpu_vram_gb or hw.ram_gb
    if not vram:
        return None
    return round(vram_needed / vram * 100)


def _lerp(x, x0, x1, y0, y1):
    return y0 + (y1 - y0) * ((x - x0) / (x1 - x0))


def compute_score(status, toks_per_sec, params_billions, mem_pct=None) -> int:
    if status in ("cannot-run", "unknown"):
        return 0

    if toks_per_sec is not None:
        if toks_per_sec >= 80:
            speed_score = 100
        elif toks_per_sec >= 40:
            speed_score = _lerp(toks_per_sec, 40, 80, 80, 100)
        elif toks_per_sec >= 20:
            speed_score = _lerp(toks_per_sec, 20, 40, 55, 80)
        elif toks_per_sec >= 10:
            speed_score = _lerp(toks_per_sec, 10, 20, 35, 55)
        elif toks_per_sec >= 5:
            speed_score = _lerp(toks_per_sec, 5, 10, 15, 35)
        else:
            speed_score = _lerp(max(toks_per_sec, 0), 0, 5, 0, 15)
    else:
        speed_score = 45 if status == "can-run" else 20

    headroom_score = 45
    if mem_pct is not None:
        if mem_pct <= 20:
            headroom_score = 100
        elif mem_pct <= 40:
            headroom_score = _lerp(mem_pct, 20, 40, 100, 75)
        elif mem_pct <= 60:
            headroom_score = _lerp(mem_pct, 40, 60, 75, 45)
        elif mem_pct <= 80:
            headroom_score = _lerp(mem_pct, 60, 80, 45, 20)
        else:
            headroom_score = _lerp(min(mem_pct, 100), 80, 100, 20, 0)

    quality_bonus = min(12, math.log2(params_billions + 1) * 2)
    fit_multiplier = 0.60 if status == "can-run-slow" else 0.75 if status == "tight" else 1

    return round((speed_score * 0.55 + headroom_score * 0.35 + quality_bonus) * fit_multiplier)


def score_to_grade(score: int, status) -> str:
    if status == "cannot-run":
        return "F"
    if status == "unknown":
        return "?"
    if status == "can-run-slow":
        return "C" if score >= 40 else "D"
    if score >= 85:
        return "S"
    if score >= 70:
        return "A"
    if score >= 55:
        return "B"
    if score >= 40:
        return "C"
    if score >= 20:
        return "D"
    return "F"


# ── Evaluacion completa de un modelo ──────────────────────────────────────

@dataclass
class ModelEvaluation:
    status: ModelStatus
    toks_per_sec: Optional[int]
    mem_pct: Optional[int]
    score: int
    grade: str
    quant: Optional[str] = None


def evaluate_quant(model: dict, quant: dict, hw: HardwareInfo) -> ModelEvaluation:
    vram_needed = quant["vramGB"]
    params = float(model.get("paramsBillions", 0) or 0)
    status = evaluate_model(vram_needed, hw)
    working_set = inference_working_set_gb(vram_needed, model)
    toks = estimate_tokens_per_second(working_set, hw)
    mem_pct = memory_percentage(vram_needed, hw)
    score = compute_score(status, toks, params, mem_pct)
    grade = score_to_grade(score, status)
    return ModelEvaluation(status=status, toks_per_sec=toks, mem_pct=mem_pct,
                           score=score, grade=grade, quant=quant["name"])


def best_quant_for_hardware(model: dict, hw: HardwareInfo) -> Optional[ModelEvaluation]:
    """Elije la mejor cuantizacion: la mayor calidad que corra comoda."""
    best = None
    for quant in make_quants(float(model.get("paramsBillions", 0) or 0)):
        ev = evaluate_quant(model, quant, hw)
        if ev.status in ("can-run", "tight") and ev.quant:
            if best is None or quant["bits"] > best["bits"]:
                best = {"bits": quant["bits"], "ev": ev}
    if best:
        return best["ev"]
    # Ninguna corre: devuelve la menor (F16) para mostrar el "too heavy"
    quants = make_quants(float(model.get("paramsBillions", 0) or 0))
    return evaluate_quant(model, quants[-1], hw)


def evaluate_model_best(model: dict, hw: HardwareInfo) -> ModelEvaluation:
    """Evaluacion con la mejor cuantizacion (o la menor si nada corre)."""
    return best_quant_for_hardware(model, hw) or evaluate_quant(
        model, make_quants(float(model.get("paramsBillions", 0) or 0))[-1], hw)


# ── Hardware requerido ("no corre aqui, necesitas...") ────────────────────

_GPU_CLASSES = [
    (1, "GTX 1050 Ti / GTX 1650"),
    (2, "GTX 1060 / RTX 2060"),
    (4, "RTX 2060 Super / GTX 1080"),
    (6, "RTX 3060"),
    (8, "RTX 4060 / RTX 3060 Ti"),
    (10, "RTX 4070"),
    (12, "RTX 4070 Ti / RX 7800 XT"),
    (16, "RTX 4080 / RTX 4070 Ti Super / RX 7900 XT"),
    (24, "RTX 4090 / A100"),
    (40, "A100 40GB / L40"),
    (80, "H100 / A100 80GB"),
    (141, "H200 / B200"),
]


def gpu_class_for_vram(vram_required: float) -> str:
    """Clase de GPU que cubre comodamente la VRAM requerida."""
    for threshold, label in _GPU_CLASSES:
        if vram_required <= threshold:
            return label
    return "H100 / B200 (datacenter)"


def required_hardware(model: dict, quant_name: str | None = None) -> dict:
    """Hardware minimo para correr el modelo comodo (estilo canirun).

    Devuelve la VRAM, RAM de sistema y clase de GPU necesarias, utiles para el
    mensaje 'tu hardware no lo corre; necesitas...'.
    """
    params = float(model.get("paramsBillions", 0) or 0)
    quants = make_quants(params)
    quant = next((q for q in quants if q["name"] == quant_name), None) or quants[2]  # Q4_K_M
    vram = quant["vramGB"]
    gpu_vram_required = round(vram / 0.85, 1)          # correr comodo <= 85% VRAM
    ram_required = round(max(vram * 1.5, 2.0), 1)       # RAM de sistema utilizable
    min_ram_total = round(ram_required / 0.7, 1)        # RAM total necesaria
    return {
        "quantization": quant["name"],
        "vramRequiredGb": round(vram, 1),
        "gpuVramRecommendedGb": gpu_vram_required,
        "gpuClass": gpu_class_for_vram(gpu_vram_required),
        "ramRequiredGb": ram_required,
        "systemRamTotalGb": min_ram_total,
        "bandwidthRecommendedGbps": round(max(vram * 40, 50), 0),
        "diskRequiredGb": round(max(params * 0.55, 0.5), 1),
    }


def status_to_canirun(status: ModelStatus) -> str:
    """Mapea el status RANDI al vocabulario canirun.ai."""
    return {
        "can-run": "comfortable",
        "tight": "tight",
        "can-run-slow": "cpu-offload",
        "cannot-run": "insufficient",
        "unknown": "unknown",
    }.get(status, "unknown")


def notes_for(model: dict, ev: ModelEvaluation, hw: HardwareInfo) -> list[str]:
    """Notas humanas explicando la evaluacion (paridad canirun)."""
    notes = [f"Modelo {model.get('name')} ({model.get('paramsBillions')}B, q{ev.quant or 'auto'})"]
    status = status_to_canirun(ev.status)
    if ev.status == "cannot-run":
        req = required_hardware(model, ev.quant)
        notes.append(
            f"Tu hardware no alcanza: necesitas GPU con {req['gpuVramRecommendedGb']}GB "
            f"de VRAM ({req['gpuClass']}) y {req['systemRamTotalGb']}GB de RAM."
        )
    elif ev.status == "can-run-slow":
        if hw.gpu_vram_gb:
            notes.append(
                f"El modelo excede tu VRAM ({hw.gpu_vram_gb}GB): se descarga parte a RAM "
                f"de sistema y la velocidad sera baja."
            )
        else:
            notes.append("Solo correra en CPU: sin GPU dedicada la velocidad es muy baja.")
    elif ev.status == "tight":
        notes.append("Ajustado: corre pero sin margen para otras apps.")
    else:
        if ev.toks_per_sec:
            notes.append(f"Velocidad estimada ~{ev.toks_per_sec} tok/s.")
        else:
            notes.append("El modelo deberia caber comodo en tu memoria.")
    return notes
