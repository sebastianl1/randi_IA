"""Composer multilinea de la TUI (TextArea)."""
from __future__ import annotations

from textual.binding import Binding
from textual.widgets import TextArea


class Composer(TextArea):
    """Caja de escritura separada: Enter envia, Ctrl+J salta linea."""

    BINDINGS = [
        Binding("ctrl+j", "newline", "Salto"),
        Binding("ctrl+k", "palette", "Paleta"),
        Binding("ctrl+d", "quit_app", "Salir"),
        Binding("ctrl+y", "copy_last", "Copiar"),
    ]

    async def _on_key(self, event):
        keys = (event.key or "").split("+")
        if "enter" in keys and not any(m in keys for m in ("ctrl", "alt")):
            if self.app.suggestions_visible() and self.app.maybe_complete():
                event.stop()
                event.prevent_default()
                return
            self.action_send()
            event.stop()
            event.prevent_default()
            return
        if len(keys) == 1 and keys[0] in ("up", "down") and self.app.suggestions_visible():
            self.app.move_suggestion(-1 if keys[0] == "up" else 1)
            event.stop()
            event.prevent_default()
            return
        await super()._on_key(event)

    def action_send(self) -> None:
        text = self.text.strip("\n")
        self.clear()
        self.app.submit_composer(text)

    def action_newline(self) -> None:
        self.insert("\n")

    def action_palette(self) -> None:
        self.app.action_palette()

    def action_quit_app(self) -> None:
        self.app.action_quit()

    def action_copy_last(self) -> None:
        self.app.action_copy_last()

    @property
    def lines_count(self) -> int:
        return len(self.text.splitlines()) if self.text else 0
