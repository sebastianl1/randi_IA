"""Tests de la interfaz interactiva (randi_tui / Textual)."""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
BIN_LIB = ROOT / "bin" / "lib"
for p in (BIN_LIB,):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import pytest  # noqa: E402

from randi_tui import session as tsession  # noqa: E402
from randi_tui.slash import COMMANDS  # noqa: E402


def test_slash_commands_present():
    for name in ("/help", "/model", "/system", "/temp", "/clear", "/save", "/load",
                 "/eco", "/code", "/tts", "/image", "/exit", "/install", "/recommend"):
        assert name in COMMANDS, f"falta {name}"


def test_session_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(tsession, "SESSIONS_DIR", tmp_path)
    messages = [{"role": "user", "content": "hola"}, {"role": "assistant", "content": "hola!"}]
    tsession.save_session("prueba", messages)
    assert tsession.load_session("prueba") == messages
    items = tsession.list_sessions()
    assert any(n == "prueba" for n, _ in items)


def test_tui_mounts_and_commands(tmp_path, monkeypatch):
    from randi_tui.app import RandiApp

    # aislar config/sesiones del home real
    monkeypatch.setattr(tsession, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(tsession, "SESSIONS_DIR", tmp_path)

    async def scenario():
        app = RandiApp(initial_model="qwen3:8b")
        async with app.run_test(size=(100, 30)) as pilot:
            await pilot.pause(0.2)
            # primer arranque -> pantalla de onboarding apilada
            assert len(app.screen_stack) >= 2
            while len(app.screen_stack) > 1:
                await pilot.press("escape")
                await pilot.pause(0.1)
            app.input().focus()
            await pilot.press("/help")
            await pilot.press("enter")
            await pilot.pause(0.3)
            # paleta: se apila una pantalla mas
            before = len(app.screen_stack)
            app.action_palette()
            await pilot.pause(0.3)
            assert len(app.screen_stack) == before + 1
            await pilot.press("escape")
            await pilot.pause(0.2)
            await pilot.press("/clear")
            await pilot.press("enter")
            await pilot.pause(0.2)
        return app

    app = asyncio.run(scenario())
    assert app.model == "qwen3:8b"
    assert app.messages == []