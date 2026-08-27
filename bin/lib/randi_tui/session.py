"""Sesiones del TUI (JSON, compatible con el formato historico RANDI)."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

CONFIG_DIR = Path.home() / ".config" / "randi"
SESSIONS_DIR = CONFIG_DIR / "sessions"
CONFIG_FILE = CONFIG_DIR / "config.json"


def _sdir() -> Path:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    return SESSIONS_DIR


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


def list_sessions() -> list[tuple[str, str]]:
    """[(nombre, fecha)] ordenado por fecha desc."""
    out = []
    for f in sorted(_sdir().glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        meta = ""
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            meta = d.get("saved_at", "")[:16]
        except Exception:
            meta = ""
        out.append((f.stem, meta))
    return out


def save_session(name: str, messages: list[dict]) -> None:
    safe = name.replace("/", "_").replace(":", "_")
    data = {
        "name": safe,
        "saved_at": datetime.now().isoformat(timespec="seconds"),
        "messages": messages,
    }
    (_sdir() / f"{safe}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_session(name: str) -> list[dict] | None:
    path = _sdir() / f"{name}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("messages", [])
    except Exception:
        return None


def delete_session(name: str) -> None:
    path = _sdir() / f"{name}.json"
    if path.exists():
        path.unlink()
