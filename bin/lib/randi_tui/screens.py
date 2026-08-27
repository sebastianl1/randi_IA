"""Pantallas de la TUI: Onboarding, Sesiones, Configuracion."""
from __future__ import annotations

import time

from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Button, Input, Label, ListItem, ListView, Static

from . import session as rs


def _hon(desc_: str) -> str:
    return f"\n  · {desc_}"


class _Back(Screen):
    BINDINGS = [("escape", "close", "Volver")]

    def go_back(self) -> None:
        self.dismiss()

    def action_close(self) -> None:
        self.go_back()


class SetupScreen(_Back):
    """Onboarding: hardware -> clase -> recomendaciones -> instalar."""

    def compose(self) -> ComposeResult:
        yield Static("Onboarding · analiza tu equipo", id="h")
        yield VerticalScroll(Static("Cargando hardware...", id="info"), id="body")
        yield Button("Instalar el recomendado", id="setup-install", variant="primary")
        yield Button("Seguir al chat", id="setup-done")

    def on_mount(self) -> None:
        self.app.run_worker(self._load())

    async def _load(self) -> None:
        info = self.query_one("#info", Static)
        try:
            import hardware as _hw
            import recommend as _rec

            hw = _hw.detect_hardware(cache=True)
            prof = _hw.hardware_profile(hw)
            recs = _rec.rank_models(_rec.get_models(), hw, limit=3)
            lines = [f"Clase: {prof['class']}", prof["summary"],
                     f"RAM {hw.ram_gb}GB · CPU {hw.cpu_cores} nucleos"]
            if hw.gpu_vram_gb:
                lines.append(f"GPU {hw.gpu_name} · VRAM {hw.gpu_vram_gb}GB")
            lines.append("")
            lines.append("Mejores para tu equipo:")
            for r in recs:
                ev = r["evaluation"]
                lines.append(f"  [{ev.grade}] {r['model']['id']}  q{ev.quant} · ~{ev.toks_per_sec} tok/s")
            self._recs = recs
            info.update("\n".join(lines))
            self.query_one("#setup-install", Button).disabled = not bool(self._recs)
        except Exception as e:
            info.update(f"error: {e}")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        bid = event.button.id
        if bid == "setup-install":
            self.dismiss()
            if getattr(self, "_recs", None):
                top = self._recs[0]["model"]
                self.app.notice(f"Instalando {top['id']}...")
                self.app.run_palette_action(f"/install {top['id']}")
            self.app.mark_onboarded()
        elif bid == "setup-done":
            self.dismiss()
            self.app.mark_onboarded()


class SessionsScreen(_Back):
    """Gestion de sesiones: abrir, borrar, renombrar, guardar."""

    def compose(self) -> ComposeResult:
        yield Static("Sesiones", id="h")
        yield ListView(id="sess-list")
        with VerticalScroll(id="actions"):
            yield Input(id="sess-rename", placeholder="nuevo nombre")
            yield Button("Abrir seleccionada", id="sess-open")
            yield Button("Borrar seleccionada", id="sess-del", variant="error")
            yield Button("Guardar actual como...", id="sess-save", variant="primary")
            yield Button("Renombrar a 'nuevo nombre'", id="sess-ren")
            yield Button("← Volver", id="back")

    def on_mount(self) -> None:
        self._refresh_list()

    def _refresh_list(self) -> None:
        lv = self.query_one("#sess-list", ListView)
        lv.clear()
        self._items = rs.list_sessions()
        for i, (name, date) in enumerate(self._items):
            lv.append(ListItem(Label(f"{name}  ({date})"), id=f"s-{i}"))

    def selected_name(self) -> str | None:
        lv = self.query_one("#sess-list", ListView)
        sel = lv.highlighted_child
        if not sel or not sel.id:
            return None
        try:
            return self._items[int(sel.id.split("-", 1)[1])][0]
        except (ValueError, IndexError):
            return None

    def on_button_pressed(self, event: Button.Pressed) -> None:
        bid = event.button.id
        if bid == "back":
            self.go_back()
        elif bid == "sess-open":
            name = self.selected_name()
            if name:
                self.go_back()
                self.app.load_session(name)
        elif bid == "sess-del":
            name = self.selected_name()
            if name:
                rs.delete_session(name)
                self.notify(f"Borrada: {name}")
                self._refresh_list()
        elif bid == "sess-save":
            name = self.query_one("#sess-rename", Input).value.strip() or f"sesion-{time.strftime('%Y%m%d-%H%M')}"
            self.app.save_session(name)
            self._refresh_list()
        elif bid == "sess-ren" and self.selected_name():
            new = self.query_one("#sess-rename", Input).value.strip()
            old = self.selected_name()
            if new and old != new:
                data = rs.load_session(old)
                if data is not None:
                    rs.save_session(new, data)
                    rs.delete_session(old)
                    self._refresh_list()


class SettingsScreen(_Back):
    """Configuracion de la sesion (tema, temperatura, modos)."""

    def compose(self) -> ComposeResult:
        yield Static("Configuracion", id="h")
        with VerticalScroll(id="body"):
            yield Input(id="cfg-temp", placeholder="temperatura 0.0-2.0", value=str(self.app.temp))
            yield Button("Cambiar tema (dark/light)", id="cfg-theme", variant="primary")
            yield Button("Alternar modo eco", id="cfg-eco")
            yield Button("Alternar modo programador", id="cfg-code")
            yield Button("Guardar y volver", id="cfg-save")
            yield Button("← Volver", id="back")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        bid = event.button.id
        if bid == "back":
            self.go_back()
        elif bid == "cfg-theme":
            self.app.toggle_theme()
            self.notify(f"Tema: {self.app.theme}")
        elif bid == "cfg-eco":
            self.app.toggle_eco()
        elif bid == "cfg-code":
            self.app.toggle_code()
        elif bid == "cfg-save":
            val = self.query_one("#cfg-temp", Input).value.strip()
            if val:
                self.app.set_temp(val)
            self.app.notice("Configuracion guardada")
            self.go_back()


class HelpScreen(_Back):
    """Ayuda de comandos y atajos en overlay."""

    def compose(self) -> ComposeResult:
        from .slash import COMMANDS

        lines = ["RANDI — ayuda", "=" * 24, ""]
        lines.append("Comandos: / o Ctrl+K → paleta · Tab → panel · Ctrl+C → cancelar · Ctrl+D → salir")
        lines.append("")
        lines.append("Slash:")
        for name, (desc, _h) in COMMANDS.items():
            lines.append(f"  {name:<12} {desc}")
        yield Static("\n".join(lines), id="h")
        yield Button("Cerrar", id="back")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "back":
            self.go_back()
