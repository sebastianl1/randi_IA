"""Panel derecho de la TUI: contexto, modelo, actividad y fases."""
from __future__ import annotations

from textual.widgets import Static

from . import i18n
from .theme import ACCENT, MUTED


def _bar(pct: int, width: int = 14) -> str:
    pct = max(0, min(100, pct))
    filled = round(width * pct / 100)
    return "█" * filled + "░" * (width - filled)


class ContextPanel(Static):
    """Muestra de informacion relevante a la derecha del chat."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, id="context", **kwargs)
        self._activity: list[tuple[str, str]] = []
        self._model = ""
        self._grade = ""
        self._quant = ""
        self._ctx = ""
        self._ram = ""
        self._tokens = 0
        self._session = ""
        self._lang = "es"

    def set_lang(self, lang: str) -> None:
        self._lang = lang
        self.refresh_render()

    def set_model(self, model: str, grade: str, quant: str, ctx: str, ram: str) -> None:
        self._model, self._grade, self._quant = model, grade, quant
        self._ctx, self._ram = ctx, ram
        self.refresh_render()

    def set_tokens(self, tokens: int, pct: int = 0) -> None:
        self._tokens = tokens
        self._ctx_pct = pct
        self.refresh_render()

    def set_session(self, session: str) -> None:
        self._session = session
        self.refresh_render()

    def add_activity(self, kind: str, text: str) -> None:
        self._activity.append((kind, text))
        self._activity = self._activity[-8:]
        self.refresh_render()

    def refresh_render(self) -> None:
        t = i18n.T.get(self._lang, i18n.T["es"])
        lines = []
        lines.append(f"[bold {ACCENT}]{t['contact']}[/bold {ACCENT}]")
        lines.append("")
        lines.append(f"[bold {MUTED}]{t['context_model']}[/bold {MUTED}]")
        lines.append(f"  {self._model or '—'}  [b]{self._grade}[/b] {self._quant}")
        if self._ctx:
            lines.append(f"  ctx {self._ctx} · RAM {self._ram or '—'}")
        if self._session:
            lines.append(f"  [dim]{t['context_session']}: {self._session}[/dim]")
        lines.append("")
        lines.append(f"[bold {MUTED}]{t['context_context']}[/bold {MUTED}]")
        pct = getattr(self, "_ctx_pct", 0) or 0
        lines.append(f"  {_bar(pct)} {self._tokens} tok")
        lines.append("")
        lines.append(f"[bold {MUTED}]{t['context_ram']}[/bold {MUTED}]")
        lines.append(f"  {_bar(pct)}")
        lines.append("")
        lines.append(f"[bold {MUTED}]{t['context_activity']}[/bold {MUTED}]")
        if not self._activity:
            lines.append("  [dim]—[/dim]")
        for kind, text in reversed(self._activity[-6:]):
            lines.append(self._act_line(kind, text))
        self.update("\n".join(lines))

    def _act_line(self, kind: str, text: str) -> str:
        if kind == "ok":
            return f"  [green]✓[/green] {text}"
        if kind == "err":
            return f"  [red]✗[/red] {text}"
        if kind == "run":
            return f"  [#e5484d]···[/#e5484d] {text}"
        return f"  {text}"

    def clean_activity(self) -> None:
        self._activity = []
        self.refresh_render()
