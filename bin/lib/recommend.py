"""RANDI — Recomendacion de modelos (best-picks) por hardware y useCase."""

from __future__ import annotations

import json
import os
from pathlib import Path

from compat import HardwareInfo, evaluate_model_best


def catalog_paths():
    """Rutas candidatas al models.json. Prioridad: repo/bin/lib, luego datos."""
    here = Path(__file__).resolve().parent
    randi_dir = os.environ.get("RANDI_DIR", str(Path.home() / ".local" / "share" / "randi"))
    candidates = []
    # 1. Copia junto al modulo (la del paquete/repo) SIEMPRE primera
    candidates += [
        here / "models.json",
        here.parent.parent / "web" / "models.json",   # repo
        Path.cwd() / "web" / "models.json",
        Path.cwd() / "models.json",
    ]
    # 2. Variables de entorno override
    if os.environ.get("RANDI_MODELS"):
        candidates.insert(0, Path(os.environ["RANDI_MODELS"]))
    # 3. Datos instalados (ultimo recurso)
    candidates += [
        Path(randi_dir) / "lib" / "models.json",
        Path(randi_dir) / "web" / "models.json",
    ]
    # dedupe conservando orden
    seen = set()
    uniq = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            uniq.append(c)
    for c in uniq:
        if c.is_file():
            return c
    return None


def load_catalog() -> dict:
    path = catalog_paths()
    if not path:
        raise FileNotFoundError("models.json no encontrado")
    return json.loads(path.read_text(encoding="utf-8"))


def get_models(catalog: dict | None = None) -> list[dict]:
    catalog = catalog or load_catalog()
    return catalog.get("ollama", [])


USE_CASE_ALIASES = {
    "chat": ["chat", "general"],
    "code": ["code", "coding"],
    "reasoning": ["reasoning"],
    "vision": ["vision"],
}


def model_matches_use_case(model: dict, use_case: str | None) -> bool:
    if not use_case:
        return True
    uc = [u.lower() for u in model.get("useCase", [])]
    # retrocompat: modelos viejos solo tienen 'type'
    if not uc and model.get("type"):
        uc = [model["type"].lower()]
    for alias in USE_CASE_ALIASES.get(use_case.lower(), [use_case.lower()]):
        if alias in uc:
            return True
    return False


def evaluate_all(catalog: list[dict], hw: HardwareInfo):
    """Evalua todos los modelos contra el hardware."""
    results = []
    for model in catalog:
        ev = evaluate_model_best(model, hw)
        results.append({"model": model, "evaluation": ev})
    return results


def rank_models(catalog: list[dict], hw: HardwareInfo,
                use_case: str | None = None, limit: int = 5,
                include_cannot_run: bool = False):
    """Recomienda los mejores modelos por score, filtrados por useCase."""
    results = []
    for model in catalog:
        if not model_matches_use_case(model, use_case):
            continue
        ev = evaluate_model_best(model, hw)
        results.append({"model": model, "evaluation": ev})

    # Ordenar por score desc; los que no corren al final
    results.sort(key=lambda r: (r["evaluation"].score, r["evaluation"].grade), reverse=True)

    if not include_cannot_run:
        results = [r for r in results if r["evaluation"].status in ("can-run", "tight", "can-run-slow")]

    return results[:limit]


def best_pick_for_use_case(catalog: list[dict], hw: HardwareInfo,
                           use_case: str, limit: int = 5) -> list[dict]:
    """Best pick para un caso de uso concreto."""
    return rank_models(catalog, hw, use_case=use_case, limit=limit)


def tier_list(catalog: list[dict], hw: HardwareInfo) -> dict[str, list[dict]]:
    """Clasifica todos los modelos en tiers S/A/B/C/D/F segun tu hardware."""
    tiers = {g: [] for g in "SABCDEF?"}
    for model in catalog:
        ev = evaluate_model_best(model, hw)
        tiers.setdefault(ev.grade, []).append({"model": model, "evaluation": ev})
    return tiers
