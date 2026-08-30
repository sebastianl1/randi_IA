"""Cliente de chat para Ollama (async, streaming NDJSON)."""
from __future__ import annotations

import json
import os
from typing import AsyncIterator

import httpx

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")


async def server_up() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{OLLAMA_HOST}/api/tags")
            return r.status_code == 200
    except Exception:
        return False


async def tags() -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{OLLAMA_HOST}/api/tags")
            r.raise_for_status()
            return [m["name"] for m in r.json().get("models", [])]
    except Exception:
        return []


async def stream_chat(model: str, messages: list[dict], system: str = "",
                      options: dict | None = None) -> AsyncIterator[str]:
    """Genera tokens del modelo. Se interrumpe cancelando la tarea."""
    payload: dict = {
        "model": model,
        "stream": True,
        "messages": messages,
        "options": options or {},
    }
    if system:
        payload["system"] = system
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", f"{OLLAMA_HOST}/api/chat", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if obj.get("done"):
                    return
                token = (obj.get("message") or {}).get("content") or ""
                if token:
                    yield token
