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
    """Rutas candidatas al models.json. Prioridad: override, repo, instalado.

    Sample para no romper el flujo de datos instalado (randi update copia el
    catalogo a ~/.local/share/randi/lib/models.json).
    """
    env = os.environ.get("RANDI_MODELS")
    if env:
        yield Path(env)
    here = Path(__file__).resolve().parent
    for p in (
        here / "models.json",
        here.parent.parent / "web" / "models.json",  # repo
        Path.cwd() / "web" / "models.json",
        Path.cwd() / "models.json",
    ):
        if p.is_file():
            yield p
    randi_dir = os.environ.get("RANDI_DIR", str(Path.home() / ".local" / "share" / "randi"))
    for p in (
        Path(randi_dir) / "lib" / "models.json",
        Path(randi_dir) / "web" / "models.json",
    ):
        if p.is_file():
            yield p


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


def get_media_models():
    """Generacion de imagen/video (ComfyUI u otro motor)."""
    return load_catalog().get("media", [])


def get_webgpu_models():
    return load_catalog().get("webgpu", [])


def get_tools():
    return load_catalog().get("tools", {})


def get_categories():
    """Categorias por tipo de contenido para la clasificacion del onboarding."""
    cats = {"llm": [], "image": [], "video": []}
    for m in get_models():
        cats.setdefault(m.get("category", "llm"), []).append(m)
    for m in get_media_models():
        cats.setdefault(m.get("category", "image"), []).append(m)
    return cats


def model_info(model_id):
    for m in get_models() + get_media_models():
        if model_id.startswith(m["id"]) or m["id"].startswith(model_id):
            return m
    return None


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


def _media_table():
    lines = []
    for m in get_media_models():
        cat = m.get("category", m.get("type", ""))
        lines.append(
            f"  {m['id']:<22} {str(m.get('size', '?')):>7}  "
            f"[{cat:<5}] {m.get('desc', '')}  ({m.get('installer', '?')})"
        )
    return "\n".join(lines) if lines else "  (sin modelos media)"


def _categories_table():
    lines = [f"\n{label} ({len(items)}):" for label, items in get_categories().items() if items]
    return "\n".join(lines)


def main():
    args = sys.argv[1:]
    cmd = args[0] if args else "models"
    if cmd == "models":
        print(_table())
    elif cmd == "list":
        _lines()
    elif cmd == "media":
        print(_media_table())
    elif cmd == "categories":
        print(_categories_table())
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
        print("uso: catalog.py [models|list|media|categories|vision|path|tools]")
        sys.exit(1)


if __name__ == "__main__":
    main()
