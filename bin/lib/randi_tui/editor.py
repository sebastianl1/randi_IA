"""Editor del TUI: input con historial y atajos."""
from __future__ import annotations

from textual.events import Key
from textual.widgets import Input


class EditorInput(Input):
    """Input con historial (Up/Down) y atajos enriquezidas."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.past: list[str] = []
        self._idx = 0

    def remember(self, text: str) -> None:
        if not text:
            return
        if self.past and self.past[-1] == text:
            return
        self.past.append(text)
        self.past = self.past[-200:]
        self._idx = 0

    def on_key(self, event: Key) -> None:
        if event.key == "up" and self.past:
            self._idx = min(self._idx + 1, len(self.past))
            self.value = self.past[-self._idx] if self._idx else ""
            self.cursor_position = len(self.value)
            event.stop()
        elif event.key == "down" and self.past:
            self._idx = max(self._idx - 1, 0)
            self.value = self.past[-self._idx] if self._idx else ""
            self.cursor_position = len(self.value)
            event.stop()
