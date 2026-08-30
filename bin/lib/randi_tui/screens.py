"""Pantallas de la TUI: Onboarding, Sesiones, Configuracion."""
from __future__ import annotations

import time

from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Button, Input, Label, ListItem, ListView, Static

from . import chat as rchat
from . import session as rs
from .slash import COMMANDS


def _hon(desc_: str) -> str:
    return f"\n  · {desc_}"


class _Back(Screen):
    BINDINGS = [("escape", "close", "Volver")]
    CSS = """
    #h { padding: 1 2; text-style: bold; color: #fafafa;
         background: #101010; border-bottom: solid #262626; }
    .hw, #info { padding: 1 2; }
    ListView { background: #0a0a0a; }
    ListItem { padding: 0 1; }
    ListItem:focus { background: #1b1b22; }
    Input { border: round #262626; background: #14141b; color: #fafafa; height: 3; padding: 0 1; }
    Input:focus { border: round #e5484d; }
    Button { margin: 1 2 0 2; }
    """

    def go_back(self) -> None:
        self.dismiss()

    def action_close(self) -> None:
        self.go_back()


class SetupScreen(_Back):
    """Onboarding: hardware -> clase -> recomendaciones -> instalar."""

    def compose(self) -> ComposeResult:
        yield Static(self.app.tr("onboarding_h"), id="h")
        yield VerticalScroll(Static("Cargando hardware...", id="info"), id="body")
        yield Button(self.app.tr("ok_installed", "Instalar el recomendado"), id="setup-install", variant="primary")
        yield Button(self.app.tr("onboarding_done", "Seguir al chat"), id="setup-done")

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


class ModelPickerScreen(_Back):
    """Lista de modelos seleccionable (flechas + Enter), con filtro."""

    BINDINGS = [("escape", "close", "Volver"), ("i", "install_pending", "Instalar")]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._all: list = []
        self._rows: list = []
        self._pending: str | None = None

    def compose(self) -> ComposeResult:
        yield Static("", id="h")
        yield Input(id="mp-filter", placeholder="/", value="")
        yield ListView(id="mp-list")
        yield Button(self.app.tr("back", "← Volver"), id="back")

    def on_mount(self) -> None:
        try:
            self.query_one("#h", Static).update(self.app.tr("models_title"))
        except Exception:
            pass
        self.app.run_worker(self._load())

    async def _load(self) -> None:
        import catalog as _cat
        import compat as _compat
        import hardware as _hw

        lv = self.query_one("#mp-list", ListView)
        try:
            mods = await rchat.tags()
            hw = _hw.detect_hardware(cache=True)
            rows = []
            for m in _cat.get_models():
                mid = m.get("ollamaId") or m["id"]
                ev = _compat.evaluate_model_best(m, hw)
                rows.append((mid, m.get("size", ""), f"q{ev.quant}", ev.grade, mid in mods))
            self._all = sorted(rows, key=lambda x: (x[4], x[0]))
        except Exception as e:
            self._all = []
            lv.append(ListItem(Label(f"error: {e}")))
            return
        self._rows = self._all
        self._render_rows()

    def _render_rows(self) -> None:
        try:
            lv = self.query_one("#mp-list", ListView)
        except Exception:
            return
        lv.clear()
        rows = getattr(self, "_rows", None) or []
        for i, (mid, size, quant, grade, inst) in enumerate(rows):
            mark = "✓" if inst else "  "
            label = f"{mark} {mid:<26} {size:>7} · {quant:<6} [{grade}]"
            lv.append(ListItem(Label(label), id=f"m-{i}"))

    async def on_input_changed(self, event: Input.Changed) -> None:
        q = event.value.strip().lower()
        if not q:
            self._rows = self._all
        else:
            self._rows = [r for r in self._all if q in r[0].lower() or q in r[3].lower()]
        self._render_rows()

    async def on_list_view_selected(self, event: ListView.Selected) -> None:
        item = event.item
        if not item or not item.id:
            return
        try:
            i = int(item.id.split("-", 1)[1])
            mid, size, quant, grade, inst = self._rows[i]
        except (ValueError, IndexError):
            return
        if inst:
            self.dismiss()
            self.app.set_model(mid)
            return
        # dos pasos: pedir confirmacion de instalacion (evita pulls accidentales/crash)
        self._pending = mid
        self.notify(f"{mid} [{grade}] {size} · {quant} — {self.app.tr('no_installed_hint')}")

    def action_install_pending(self) -> None:
        if self._pending:
            name = self._pending
            self._pending = None
            self.dismiss()
            self.app.install_model_cmd(name)


class SessionsScreen(_Back):
    """Gestion de sesiones: abrir, borrar, renombrar, guardar."""

    def compose(self) -> ComposeResult:
        yield Static("", id="h")
        yield ListView(id="sess-list")
        with VerticalScroll(id="actions"):
            yield Input(id="sess-rename", placeholder="nuevo nombre")
            yield Button("Abrir seleccionada", id="sess-open")
            yield Button("Borrar seleccionada", id="sess-del", variant="error")
            yield Button("Guardar actual como...", id="sess-save", variant="primary")
            yield Button("Renombrar a 'nuevo nombre'", id="sess-ren")
            yield Button(self.app.tr("back", "← Volver"), id="back")

    def on_mount(self) -> None:
        self.query_one("#h", Static).update(self.app.tr("sessions"))
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
    """Configuracion de la sesion (tema, temperatura, idioma, modos)."""

    def compose(self) -> ComposeResult:
        yield Static(self.app.tr("settings_title"), id="h")
        with VerticalScroll(id="body"):
            yield Input(id="cfg-temp", placeholder=self.app.tr("temp_set", "temperatura 0.0-2.0"),
                        value=str(self.app.temp))
            yield Button(f"{self.app.tr('theme')}: dark/light", id="cfg-theme", variant="primary")
            yield Button(f"{self.app.tr('lang')}: {self.app.tr('lang')}", id="cfg-lang")
            yield Button(self.app.tr("settings_saved"), id="cfg-save")
            yield Button(self.app.tr("back", "← Volver"), id="back")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        bid = event.button.id
        if bid == "back":
            self.go_back()
        elif bid == "cfg-theme":
            self.app.toggle_theme()
            self.notify(f"{self.app.tr('theme')}: {self.app.theme}")
        elif bid == "cfg-lang":
            self.app.change_lang("en" if self.app.lang == "es" else "es")
        elif bid == "cfg-save":
            val = self.query_one("#cfg-temp", Input).value.strip()
            if val:
                self.app.set_temp(val)
            self.app.notice(self.app.tr("settings_saved"))
            self.go_back()


class HelpScreen(_Back):
    """Ayuda de comandos y atajos en overlay."""

    def compose(self) -> ComposeResult:
        from .i18n import slash_desc

        lines = [self.app.tr("help_title"), "=" * 24, ""]
        lines.append(self.app.tr("hint"))
        lines.append("")
        lines.append("Slash:")
        for name in COMMANDS:
            lines.append(f"  {name:<12} {slash_desc(self.app.lang, name)}")
        yield Static("\n".join(lines), id="h")
        yield Button(self.app.tr("back", "← Volver"), id="back")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "back":
            self.go_back()
