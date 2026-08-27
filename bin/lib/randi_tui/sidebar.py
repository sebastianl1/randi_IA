"""Sidebar de la TUI: Modelos / Sesiones / Hardware."""
from __future__ import annotations

from textual.app import ComposeResult
from textual.screen import Screen
from textual.widgets import Button, Label, ListItem, ListView, Static, TabbedContent, TabPane

from . import session as rs


class SidebarScreen(Screen):
    """Panel lateral con tabs (look dsh)."""

    BINDINGS = [("escape", "close", "Cerrar")]
    CSS = """
    .hint { color: #56565f; padding: 0 1; }
    .hw { padding: 1 2; }
    Tabs { height: 3; background: #101010; }
    TabbedContent { border: tall #262626; }
    TabPane { padding: 1; }
    Button { margin: 1 2 0 2; }
    ListView { background: #0a0a0a; }
    ListItem { padding: 0 1; }
    ListItem:focus { background: #1b1b22; }
    """

    def compose(self) -> ComposeResult:
        with TabbedContent(initial="models"):
            with TabPane("Modelos", id="models"):
                yield ListView(id="sb-models")
                yield Static("Enter: instalar · r refrescar", classes="hint")
            with TabPane("Sesiones", id="sessions"):
                yield ListView(id="sb-sessions")
                yield Static("Enter: cargar · d borrar · s guardar actual", classes="hint")
            with TabPane("Hardware", id="hardware"):
                yield Static(id="sb-hw", classes="hw")
        yield Button("Cerrar", id="sb-close", variant="primary")

    def on_mount(self) -> None:
        self.refresh_models()
        self.refresh_sessions()
        self.refresh_hw()

    def refresh_models(self) -> None:
        import catalog as _cat
        import compat as _compat
        import hardware as _hw

        lv = self.query_one("#sb-models", ListView)
        lv.clear()
        self._models = []
        try:
            hw = _hw.detect_hardware(cache=True)
            for m in _cat.get_models():
                ev = _compat.evaluate_model_best(m, hw)
                self._models.append((ev.grade, m.get("ollamaId") or m["id"], m.get("ram", "")))
            for i, (grade, mid, ram) in enumerate(sorted(self._models, key=lambda x: x[0])[:40]):
                lv.append(ListItem(Label(f" [{grade}] {mid:<22} ~{ram}GB RAM"), id=f"m-{i}"))
        except Exception as e:
            lv.append(ListItem(Label(f"error: {e}"), id="m-none"))

    def refresh_sessions(self) -> None:
        lv = self.query_one("#sb-sessions", ListView)
        lv.clear()
        self._sess = rs.list_sessions()
        for i, (name, date) in enumerate(self._sess):
            lv.append(ListItem(Label(f"{name}  ({date})"), id=f"s-{i}"))

    def refresh_hw(self) -> None:
        import hardware as _hw
        import recommend as _rec

        try:
            hw = _hw.detect_hardware(cache=True)
            prof = _hw.hardware_profile(hw)
            lines = [f"Clase: {prof['class']}", prof["summary"],
                     f"RAM: {hw.ram_gb}GB · CPU: {hw.cpu_cores} cores"]
            if hw.gpu_vram_gb:
                lines.append(f"GPU: {hw.gpu_name} · VRAM {hw.gpu_vram_gb}GB")
            lines.append("Recomendados:")
            for r in _rec.rank_models(_rec.get_models(), hw, limit=5)[:5]:
                lines.append(f"  [{r['evaluation'].grade}] {r['model']['id']}")
            self.query_one("#sb-hw", Static).update("\n".join(lines))
        except Exception as e:
            self.query_one("#sb-hw", Static).update(f"error: {e}")

    async def on_list_view_selected(self, event: ListView.Selected) -> None:
        item = event.item
        if not item or not item.id:
            return
        if item.id.startswith("m-") and item.id != "m-none":
            try:
                i = int(item.id.split("-", 1)[1])
                name = self._models[i][1]
            except (ValueError, IndexError):
                return
            self.dismiss()
            self.app.run_palette_action(f"/install {name}")
        elif item.id.startswith("s-"):
            try:
                i = int(item.id.split("-", 1)[1])
                name = self._sess[i][0]
            except (ValueError, IndexError):
                return
            self.dismiss()
            self.app.load_session(name)

    async def on_key(self, event) -> None:
        if event.key == "r":
            self.refresh_models()
        elif event.key == "d":
            lv = self.query_one("#sb-sessions", ListView)
            sel = lv.highlighted_child
            if sel and sel.id and sel.id.startswith("s-"):
                try:
                    i = int(sel.id.split("-", 1)[1])
                    rs.delete_session(self._sess[i][0])
                except (ValueError, IndexError):
                    pass
                self.refresh_sessions()
        elif event.key == "s":
            self.app.notice("Sesion guardada (usa /save <nombre>)")
            self.app.run_palette_action("/save sesion")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "sb-close":
            self.dismiss()

    def action_close(self) -> None:
        self.dismiss()
