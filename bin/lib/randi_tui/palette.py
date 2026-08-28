"""Command palette de la TUI (estilo opencode)."""
from __future__ import annotations

from textual.app import ComposeResult
from textual.screen import Screen
from textual.widgets import Input, Label, ListItem, ListView


class PaletteScreen(Screen):
    """Paleta de comandos y acciones, filtrada mientras se escribe."""

    BINDINGS = [("escape", "close", "Cerrar")]
    CSS = """
    #pinput { border: round #262626; background: #101010; color: #fafafa; height: 3; padding: 0 1; }
    #pinput:focus { border: round #e5484d; }
    #plist { background: #0a0a0a; }
    #plist ListItem { padding: 0 1; }
    #plist ListItem:focus { background: #1b1b22; color: #fafafa; }
    """

    def compose(self) -> ComposeResult:
        yield Input(id="pinput", placeholder="Busca un comando o accion...", classes="input")
        yield ListView(id="plist")

    def on_mount(self) -> None:
        self.query_one("#pinput", Input).focus()
        self.refresh_list()

    async def on_input_changed(self, event: Input.Changed) -> None:
        self.refresh_list()

    def refresh_list(self) -> None:
        items = self.app.palette_items
        q = self.query_one("#pinput", Input).value.lower()
        if q:
            items = [i for i in items if q in i[0].lower()]
        self._pairs = items[:20]
        lv = self.query_one("#plist", ListView)
        lv.clear()
        for i, (label, _tag) in enumerate(self._pairs):
            lv.append(ListItem(Label(label), id=f"pi-{i}"))
        if not self._pairs:
            lv.append(ListItem(Label("(sin coincidencias)"), id="pi-none"))

    async def on_list_view_selected(self, event: ListView.Selected) -> None:
        item = event.item
        if not item or not item.id or item.id == "pi-none":
            return
        try:
            i = int(item.id.split("-", 1)[1])
            _label, tag = self._pairs[i]
        except (ValueError, IndexError):
            return
        if tag:
            self.app.run_palette_action(tag)
        self.dismiss()

    def action_close(self) -> None:
        self.dismiss()
