#!/usr/bin/env python3
"""Catalogo central de modelos RANDI (models.json).

Fuente unica de verdad para TUI (Python), menues bash y web.
Busca models.json en: env RANDI_MODELS, RANDI_DIR/lib, RANDI_DIR/web,
junto al script y en web/ del repositorio.
"""
import json
import os
import sys
from pathlib import Path


def catalog_paths():
    paths = []
    env = os.environ.get("RANDI_MODELS")
    if env:
        paths.append(Path(env))
    randi_dir = os.environ.get("RANDI_DIR", str(Path.home() / ".local" / "share" / "randi"))
    paths.extend([
        Path(randi_dir) / "lib" / "models.json",
        Path(randi_dir) / "web" / "models.json",
    ])
    here = Path(__file__).resolve().parent
    paths.extend([
        here / "models.json",
        here.parent / ".." / "web" / "models.json",
        here.parent / "models.json",
    ])
    return paths


def find_catalog_path():
    for p in catalog_paths():
        if p.is_file():
            return p
    return None


def load_catalog():
    p = find_catalog_path()
    if p is None:
        raise FileNotFoundError("models.json no encontrado (usa RANDI_MODELS)")
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def get_models():
    return load_catalog().get("ollama", [])


def get_webgpu_models():
    return load_catalog().get("webgpu", [])


def get_tools():
    return load_catalog().get("tools", {})


def model_info(model_id):
    for m in get_models():
        if model_id.startswith(m["id"]) or m["id"].startswith(model_id):
            return m
    return None


def format_size(size):
    s = size.get("size", "") if isinstance(size, dict) else ""
    return s


def _table():
    models = get_models()
    cat_labels = {"bajo": "Bajo consumo", "medio": "Consumo medio", "alto": "Consumo alto"}
    by_cat = {"bajo": [], "medio": [], "alto": []}
    for m in models:
        by_cat.setdefault(m.get("cat", "medio"), []).append(m)
    lines = []
    for cat in ("bajo", "medio", "alto"):
        items = by_cat.get(cat, [])
        if not items:
            continue
        lines.append(f"\n{cat_labels.get(cat, cat)}:")
        for m in sorted(items, key=lambda x: x.get("ram", 99)):
            lines.append(
                f"  {m['id']:<26} {str(m.get('size','?')):>7}  "
                f"~{m.get('ram', '?')}GB  [{m.get('type','chat')}]  {m.get('desc','')}"
            )
    return "\n".join(lines)


def _lines():
    models = get_models()
    for m in sorted(models, key=lambda x: x.get("ram", 99)):
        print(f"{m['id']}\t{m.get('size','?')}\t{m.get('cat','')}\t{m.get('type','')}\t{m.get('desc','')}")


def main():
    args = sys.argv[1:]
    cmd = args[0] if args else "models"
    if cmd == "models":
        print(_table())
    elif cmd == "list":
        _lines()
    elif cmd == "vision":
        for m in get_models():
            if m.get("type") == "vision":
                print(m["id"])
    elif cmd == "path":
        p = find_catalog_path()
        print(p if p else "")
    elif cmd == "tools":
        print(json.dumps(get_tools(), indent=2, ensure_ascii=False))
    else:
        print("uso: catalog.py [models|list|vision|path|tools]")
        sys.exit(1)


if __name__ == "__main__":
    main()
