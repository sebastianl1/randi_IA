#!/usr/bin/env python3
"""RANDI pull - Menu interactivo de descarga de modelos.

Reemplaza los menues bash duplicados (cmd_pull / download_models).
Uso:  pull.py            -> menu interactivo
      pull.py <modelo>   -> descarga directa
"""
import os
import platform
import subprocess
import sys
import time

from catalog import get_models

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
IS_WINDOWS = platform.system() == "Windows"

GREEN = "\033[0;32m"; YELLOW = "\033[1;33m"; CYAN = "\033[0;36m"
RED = "\033[0;31m"; DIM = "\033[2m"; BOLD = "\033[1m"; R = "\033[0m"


def info(m): print(f"  {CYAN}{BOLD}:::{R} {m}")
def ok(m):   print(f"  {GREEN}{BOLD}:::{R} {m}")
def warn(m): print(f"  {YELLOW}{BOLD}:::{R} {m}")
def err(m):  print(f"  {RED}{BOLD}:::{R} {m}")


def server_running():
    try:
        import urllib.request
        urllib.request.urlopen(f"{OLLAMA_HOST}/api/tags", timeout=3)
        return True
    except Exception:
        return False


def do_pull(model_id):
    info(f"Descargando {model_id}...")
    try:
        rc = subprocess.call(["ollama", "pull", model_id])
    except FileNotFoundError:
        err("Ollama no encontrado en el PATH.")
        warn("Instala Ollama primero (bash install-ollama.sh) o agregalo al PATH.")
        return False
    if rc == 0:
        ok(f"{model_id} descargado")
    else:
        err(f"Fallo la descarga de {model_id}")
        if model_id not in [m["id"] for m in get_models()]:
            warn(f"'{model_id}' no esta en el catalogo oficial de RANDI; verifica el nombre en https://ollama.com/library")
    return rc == 0


def interactive():
    models = get_models()
    cats = {
        "bajo": ("Bajo consumo (< 2GB RAM)", GREEN),
        "medio": ("Consumo medio (2-4GB RAM)", YELLOW),
        "alto": ("Consumo alto (4-8GB RAM)", RED),
    }
    print()
    print(f"  {BOLD}Selecciona modelos para descargar:{R}")
    print(f"  {DIM}Ejemplo: 1 2 5 (separados por espacio){R}")
    entries = []
    for cat in ("bajo", "medio", "alto"):
        label, color = cats.get(cat, (cat, R))
        items = [m for m in models if m.get("cat") == cat and m.get("type") not in ("embed", "moe")]
        if not items:
            continue
        print(f"\n  {color}{label}{R}")
        for m in sorted(items, key=lambda x: x.get("ram", 99)):
            idx = len(entries) + 1
            entries.append(m)
            tag = ""
            if m.get("type") == "vision":
                tag = f" {DIM}[vision]{R}"
            print(f"  {idx:>2})  {m['id']:<26} {str(m.get('size','?')):>7}  {m.get('desc','')}{tag}")

    embed = [m for m in models if m.get("type") == "embed"]
    moe = [m for m in models if m.get("type") == "moe"]
    extras = embed + moe
    if extras:
        print(f"\n  {CYAN}Utilidades:{R}")
        for m in extras:
            idx = len(entries) + 1
            entries.append(m)
            print(f"  {idx:>2})  {m['id']:<26} {str(m.get('size','?')):>7}  {m.get('desc','')}")

    print(f"\n  {DIM}0)  Cancelar{R}")
    print()
    try:
        sel = input("  Selecciona: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        return
    if not sel:
        return

    picked = [entries[int(x) - 1] for x in sel.split() if x.strip().isdigit() and 0 < int(x) <= len(entries)]
    for m in picked:
        if not do_pull(m["id"]):
            break


def main():
    args = sys.argv[1:]
    if args:
        for a in args:
            if not do_pull(a):
                sys.exit(1)
        return

    if not server_running():
        if IS_WINDOWS:
            err("El servidor Ollama no esta respondiendo.")
            warn("En Windows, Ollama corre como servicio de Windows.")
            warn("  Verifica que este iniciado (busca 'Ollama' en la bandeja del sistema)")
            warn("  o reinicia la aplicacion Ollama desde el menu de inicio.")
            return
        info("Iniciando servidor Ollama...")
        try:
            subprocess.Popen(["ollama", "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except FileNotFoundError:
            err("Ollama no esta instalado o no esta en el PATH.")
            warn("Instala Ollama primero (bash install-ollama.sh) y vuelve a ejecutar.")
            return
        time.sleep(3)

    interactive()


if __name__ == "__main__":
    main()
