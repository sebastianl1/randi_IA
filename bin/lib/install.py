#!/usr/bin/env python3
"""RANDI install/setup — descarga y configuracion automatica de modelos.

Uso:
    install.py show <modelo>      -> detalle + requisitos de hardware
    install.py install <modelo>   -> pull de Ollama + auto-config
    install.py setup              -> wizard de onboarding (hardware -> picks)
    install.py requirements <m>   -> JSON con el hardware requerido

El catalogo (models.json) es la fuente unica de verdad. Los modelos de
generacion (imagen/video, ComfyUI) se muestran con instrucciones en vez de
pull automatico.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from catalog import get_media_models, get_models
from compat import evaluate_model_best, required_hardware
from hardware import detect_hardware, hardware_profile
from recommend import rank_models

GREEN = "\033[0;32m"; YELLOW = "\033[1;33m"; CYAN = "\033[0;36m"; MAG = "\033[0;35m"
RED = "\033[0;31m"; DIM = "\033[2m"; BOLD = "\033[1m"; R = "\033[0m"

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
CONFIG_DIR = Path(os.environ.get("RANDI_CONFIG_DIR", str(Path.home() / ".config" / "randi")))
CONFIG_FILE = CONFIG_DIR / "config.json"

USE_CASE_LABELS = {
    "chat": f"{CYAN}Chat{ R}",
    "code": f"{CYAN}Codigo{ R}",
    "reasoning": f"{CYAN}Razonamiento{ R}",
    "vision": f"{CYAN}Vision{ R}",
}


def info(m): print(f"  {CYAN}{BOLD}::{R} {m}")
def ok(m):   print(f"  {GREEN}{BOLD}::{R} {m}")
def warn(m): print(f"  {YELLOW}{BOLD}::{R} {m}")
def err(m):  print(f"  {RED}{BOLD}::{R} {m}")


def find_model(model_id: str) -> dict | None:
    for m in get_models() + get_media_models():
        if model_id.startswith(m["id"]) or m["id"].startswith(model_id) \
                or model_id == m.get("ollamaId"):
            return m
    return None


def server_running() -> bool:
    try:
        import urllib.request
        urllib.request.urlopen(f"{OLLAMA_HOST}/api/tags", timeout=3)
        return True
    except Exception:
        return False


def ensure_server() -> bool:
    if server_running():
        return True
    if os.environ.get("MSYSTEM") or os.environ.get("MINGW_PREFIX"):
        warn("Ollama corre como servicio en Windows: verifica que este iniciado.")
        return False
    info("Iniciando servidor Ollama...")
    try:
        subprocess.Popen(["ollama", "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        err("Ollama no encontrado. Ejecuta: bash install-ollama.sh")
        return False
    for _ in range(20):
        time.sleep(1)
        if server_running():
            return True
    err("El servidor Ollama no respondio.")
    return False


def load_config() -> dict:
    try:
        if CONFIG_FILE.exists():
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def save_config(cfg: dict):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def configure_model(model: dict):
    """Guardar como modelo por defecto en ~/.config/randi/config.json."""
    cfg = load_config()
    cfg["model"] = model.get("ollamaId") or model["id"]
    cfg["model_name"] = model.get("name")
    cfg["vision"] = bool(model.get("type") == "vision" or "vision" in (model.get("useCase") or []))
    cfg["thinking"] = bool(model.get("thinking"))
    cfg["tools"] = bool(model.get("tools"))
    cfg["context"] = model.get("ctx")
    save_config(cfg)
    ok(f"Configurado {model.get('name')} como modelo por defecto.")
    ok(f"   randi chat  ->  usa {cfg['model']}")


def pull_ollama(ollama_id: str) -> bool:
    info(f"Descargando {ollama_id} (puede tardar segun tu conexion)...")
    try:
        rc = subprocess.call(["ollama", "pull", ollama_id])
    except FileNotFoundError:
        err("Ollama no esta en el PATH.")
        return False
    if rc == 0:
        ok(f"{ollama_id} descargado e instalado.")
        return True
    err(f"Fallo la descarga de {ollama_id}.")
    return False


def show_model(model: dict):
    """Detalle de un modelo con su requisito de hardware."""
    print()
    name = model.get("name", model["id"])
    print(f"  {BOLD}{name}{R}  ({model.get('paramsBillions')}B, "
          f"{model.get('provider')}, {model.get('license')})")
    print(f"  {DIM}{model.get('desc', '')}{R}")
    if model.get("category") != "llm":
        print(f"  Tipo: {YELLOW}{model.get('category')}{R} - generacion "
              f"({model.get('installer')})")
    req = required_hardware(model)
    print(f"  Requisitos (Q4_K_M): ~{req['vramRequiredGb']}GB VRAM, "
          f"RAM recomendada {req['systemRamTotalGb']}GB, GPU tipo {req['gpuClass']}")
    install_cmd = model.get("ollamaId") or model.get("id")
    if model.get("installer") == "ollama":
        print(f"  Instalar: randi install {install_cmd}")
    else:
        print(f"  Instalar: via ComfyUI ({model.get('url', 'ver repositorio')})")


def requirements_for(model: dict) -> dict:
    req = required_hardware(model)
    return {
        "modelId": model.get("ollamaId") or model["id"],
        "name": model.get("name"),
        **req,
        "installer": model.get("installer", "ollama"),
    }


def ensure_native() -> int:
    """Instala/verifica las dependencias nativas (multiplataforma).

    En Windows nativo se usan winget (Git, Python, Ollama como servicio).
    En el resto se indica el gestor de paquetes correspondiente.
    """
    missing = []
    if shutil.which("python3") is None and shutil.which("python") is None:
        missing.append("python3")
    if shutil.which("ollama") is None:
        missing.append("ollama")
    if sys.platform == "win32" and shutil.which("bash") is None:
        missing.append("bash (Git for Windows)")
    if not missing:
        ok("Dependencias nativas presentes.")
        return 0
    warn("Faltan dependencias nativas: " + ", ".join(missing))
    if sys.platform == "win32":
        info("Instalando nativo con winget (sin WSL)...")
        cmds = []
        if shutil.which("bash") is None:
            cmds.append(["winget", "install", "--silent", "Git.Git"])
        if shutil.which("python3") is None and shutil.which("python") is None:
            cmds.append(["winget", "install", "--silent", "Python.Python.3.12"])
        if shutil.which("ollama") is None:
            cmds.append(["winget", "install", "--silent", "Ollama.Ollama"])
        for c in cmds:
            info("winget " + " ".join(c[2:]))
            subprocess.call(c)
        ok("Cierra y abre la terminal y ejecuta 'randi doctor' para verificar.")
        return 0
    print("  Usa tu gestor de paquetes: apt/brew/pacman")
    print("  python3 + el script oficial de Ollama (https://ollama.com/download)")
    return 0


def install_model(model_id: str) -> int:
    model = find_model(model_id)
    if not model:
        err(f"Modelo '{model_id}' no encontrado. Explora el catalogo: randi models")
        sys.exit(1)
    show_model(model)
    installer = model.get("installer", "ollama")
    if installer != "ollama":
        warn(f"'{model.get('name')}' no se instala con Ollama (usa {installer}).")
        warn(f"Guia: {model.get('url') or 'repositorio del modelo'} + http://localhost:8188 (ComfyUI)")
        return 0
    oid = model.get("ollamaId") or model["id"]
    if not ensure_server():
        return 1
    if not pull_ollama(oid):
        return 1
    configure_model(model)
    ok("Listo. Pruebalo con:  randi chat")
    return 0


def print_dashboard(hw, models, limit=4):
    print()
    print(f"  {BOLD}Tu equipo:{R} {hardware_profile(hw)['summary']}")
    # Picks por caso de uso (texto/LLM)
    for use_case, label in (("chat", "Chat"), ("code", "Codigo"),
                            ("reasoning", "Razonamiento"), ("vision", "Vision")):
        recs = rank_models(models, hw, use_case=use_case, limit=limit)
        if not recs:
            continue
        print(f"\n  {BOLD}{label}:{R}")
        for r in recs:
            m, ev = r["model"], r["evaluation"]
            fit = "SI" if ev.status in ("can-run", "tight", "can-run-slow") else "NO"
            print(f"   {BOLD}[{ev.grade}]{R} {m['id']:<26} "
                  f"{MAG if fit == 'SI' else DIM}{fit}{R}  "
                  f"q{ev.quant} ~{ev.toks_per_sec or '--'} tok/s  {DIM}{m.get('desc', '')}{R}")


def setup_wizard() -> int:
    hw = detect_hardware()
    models = get_models()
    print_dashboard(hw, models)

    # Separar instalables vs no-compatibles
    runs = [m for m in models if (ev := evaluate_model_best(m, hw)).status in ("can-run", "tight", "can-run-slow")]
    too = [m for m in models if evaluate_model_best(m, hw).status == "cannot-run"]
    print()
    print(f"  {GREEN}Compatibles para tu hardware: {len(runs)} modelos{R}")
    print(f"  {DIM}Mas potentes pero NO corren aqui: {len(too)} (ver 'randi install <x>' para saber que hardware necesitas){R}")

    print()
    print("  Instalables recomendados (indica los numeros separados por espacio, 0 = saltar):")
    select = []
    for m in runs[:10]:
        ev = evaluate_model_best(m, hw)
        select.append(m)
        print(f"   {len(select):>2})  {BOLD}[{ev.grade}]{R} {m['id']:<24} {m.get('size', '?')}")
    try:
        ans = input("\n  Selecciona: ").strip()
    except (EOFError, KeyboardInterrupt):
        return 0
    for token in ans.split():
        if token.strip().isdigit() and 0 < int(token) <= len(select):
            install_model(select[int(token) - 1]["id"])
    ok("Onboarding completado. Explora el resto con 'randi models' o 'randi web'.")
    return 0


def main():
    args = sys.argv[1:]
    cmd = args[0] if args else "setup"
    if cmd == "show" and len(args) > 1:
        m = find_model(args[1])
        if not m:
            err(f"Modelo '{args[1]}' no encontrado.")
            sys.exit(1)
        show_model(m)
    elif cmd == "install" and len(args) > 1:
        sys.exit(install_model(args[1]))
    elif cmd == "requirements" and len(args) > 1:
        m = find_model(args[1])
        if not m:
            err(f"Modelo '{args[1]}' no encontrado.")
            sys.exit(1)
        print(json.dumps(requirements_for(m), ensure_ascii=False, indent=2))
    elif cmd == "ensure":
        sys.exit(ensure_native())
    elif cmd == "setup":
        sys.exit(setup_wizard())
    else:
        print("uso: install.py [setup|install <m>|show <m>|requirements <m>|ensure]")
        sys.exit(1)


if __name__ == "__main__":
    main()
