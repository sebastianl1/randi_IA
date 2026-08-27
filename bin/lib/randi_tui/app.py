"""RANDI TUI — Aplicacion principal (Textual).

Interfaz estilo opencode: header/status, chat con Markdown y streaming,
input `>`, command palette (`/` o Ctrl+K), sidebar (Tab) y vistas.
"""
from __future__ import annotations

import asyncio
import re
import subprocess
import sys
import time
from pathlib import Path

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, VerticalScroll
from textual.reactive import reactive
from textual.widgets import Footer, Input, Label, ListItem, ListView, Markdown, Static

from . import chat as rchat
from . import session as rsession
from .slash import COMMANDS, completions

RANDI_VERSION = "2.0.6"


APP_CSS = """
Screen { background: #0b0b0f; }
#status {
  dock: top; height: 1; padding: 0 1; color: #9aa0ac;
  background: #14141b; border-bottom: solid #2a2a35;
}
#status .b { color: #6c8cff; }
#chat { height: 1fr; padding: 0 1; }
.msg-user {
  color: #ececf1; background: #1a1a22; margin: 0 0 1 0; padding: 0 1;
  border-left: solid #6c8cff;
}
.msg-meta { color: #56565f; text-style: bold; }
Markdown { background: transparent; }
#input-row { dock: bottom; height: auto; padding: 0 1 0 0; }
#input { border: round #2a2a35; background: #14141b; color: #ececf1; }
#input:focus { border: round #6c8cff; }
#suggestions { dock: bottom; height: 6; border: solid #2a2a35; background: #14141b; }
#suggestions ListView { height: 100%; }
#info-panel { padding: 1 2; background: #14141b; border: solid #2a2a35; }
"""


class RandiApp(App):
    """Interfaz interactiva de RANDI."""

    CSS = APP_CSS
    TITLE = "RANDI"
    SUB_TITLE = f"IA local multiplataforma · v{RANDI_VERSION}"
    BINDINGS = [
        Binding("ctrl+k", "palette", "Comandos"),
        Binding("tab", "sidebar", "Panel"),
        Binding("ctrl+d", "quit", "Salir"),
        Binding("escape", "close", "Cerrar"),
    ]

    messages: list[dict] = []
    model: str = ""
    system: str = "Eres RANDI, un asistente de IA local util y conciso."
    temp: float = 0.7
    eco: bool = False
    code_mode: bool = False
    tts: bool = False
    tokens: int = 0
    server: bool = reactive(False)
    busy: bool = False
    worker: asyncio.Task | None = None

    def __init__(self, initial_model: str = ""):
        super().__init__()
        self.initial_model = initial_model
        self.palette_items: list[tuple[str, str]] = []
        self._rl = ""  # texto sin comando para completar

    # ── Composicion ──────────────────────────────────────────────────────
    def compose(self) -> ComposeResult:
        yield Static(id="status")
        yield VerticalScroll(id="chat")
        yield ListView(id="suggestions", classes="hidden")
        with Horizontal(id="input-row"):
            yield Label(" > ", classes="b")
            yield Input(id="input", placeholder="Escribe un mensaje, / para comandos (Ctrl+K: paleta)")
        yield Footer()

    def on_mount(self) -> None:
        cfg = rsession.load_config()
        self.model = self.initial_model or cfg.get("model", "")
        self.system = cfg.get("system", self.system)
        self.temp = float(cfg.get("temperature", self.temp))
        self.run_worker(self._boot())

    async def _boot(self) -> None:
        self.server = await rchat.server_up()
        if not self.model:
            mods = await rchat.tags()
            if mods:
                self.model = mods[0]
        self.update_status(f"Modelo: {self.model or 'sin modelos'} · server {'on' if self.server else 'off'}")
        last = rsession.load_config().get("last_session", "")
        if last and rsession.load_session(last):
            self.messages = rsession.load_session(last) or []
            self.load_messages_to_chat()
        if not self.messages:
            self.notice("Bienvenido a RANDI. Escribe /help para los comandos.")
        self.input().focus()
        self.refresh_status()

    # ── UI helpers ───────────────────────────────────────────────────────
    def input(self) -> Input:
        return self.query_one("#input", Input)

    def chat(self) -> VerticalScroll:
        return self.query_one("#chat", VerticalScroll)

    def status(self) -> Static:
        return self.query_one("#status", Static)

    def suggestions(self) -> ListView:
        return self.query_one("#suggestions", ListView)

    def notice(self, text: str) -> None:
        self._notice(text)

    def _notice(self, text: str) -> None:
        self.chat().mount(Static(text, classes="msg-meta"))

    def refresh_status(self) -> None:
        parts = [f"[b]RANDI[/b] v{RANDI_VERSION}", f"modelo: [b]{self.model or '—'}[/b]"]
        parts.append(f"server: {'[green]●[/green]' if self.server else '[red]○[/red]'}")
        if self.eco:
            parts.append("eco")
        if self.code_mode:
            parts.append("code")
        if self.tts:
            parts.append("tts")
        parts.append(f"temp={self.temp}")
        self.status().update("  " + "  ·  ".join(parts))

    def update_status(self, text: str) -> None:
        self.status().update(f"  {text}")

    def add_msg(self, role: str, text: str) -> Markdown | None:
        if role == "user":
            meta = Static(f"  Tú · {time.strftime('%H:%M')}", classes="msg-meta")
            body = Static(text, classes="msg-user")
            self.chat().mount(Horizontal(meta))
            self.chat().mount(body)
            return None
        meta = Static(f"  RANDI · {time.strftime('%H:%M')}", classes="msg-meta")
        md = Markdown(text or "…")
        self.chat().mount(Horizontal(meta))
        self.chat().mount(md)
        self.chat().scroll_end(animate=False)
        return md

    def load_messages_to_chat(self) -> None:
        self.chat().remove_children()
        for m in self.messages[-40:]:
            role = m.get("role", "")
            content = m.get("content", "")
            if isinstance(content, list):
                aligns = [p for p in content if isinstance(p, dict) and p.get("type") == "text"]
                content = aligns[0].get("text") if aligns else "[imagen]"
            if role == "user":
                self.add_msg("user", content)
            elif role == "assistant":
                self.add_msg("assistant", content)

    # ── Acciones ─────────────────────────────────────────────────────────
    def action_close(self) -> None:
        if len(self.screen_stack) > 1:
            self.pop_screen()
        else:
            self.input().focus()

    def action_quit(self) -> None:
        if self.busy:
            self.notify("Espera a que termine o pulsa Ctrl+C para cancelar.")
            return
        self.exit(0)

    def action_palette(self) -> None:
        from .palette import PaletteScreen

        self.palette_items = self.build_palette()
        self.push_screen(PaletteScreen())

    def action_sidebar(self) -> None:
        from .sidebar import SidebarScreen

        self.push_screen(SidebarScreen())

    def on_input_changed(self, event: Input.Changed) -> None:
        val = event.value
        if val.startswith("/"):
            sugg = completions(val)
            self._show_suggestions(sugg)
        else:
            self.suggestions().add_class("hidden")
            self.suggestions().clear()

    def _show_suggestions(self, items: list[str]) -> None:
        lv = self.suggestions()
        lv.clear()
        for it in items[:8]:
            lv.append(ListItem(Label(it)))
        lv.remove_class("hidden")

    def on_input_submitted(self, event: Input.Submitted) -> None:
        text = event.value.strip()
        self.input().value = ""
        self.suggestions().add_class("hidden")
        if not text:
            return
        if text.startswith("/"):
            self.run_command(text)
            return
        self.send(text)

    def run_command(self, text: str) -> None:
        parts = text.split(None, 1)
        name = parts[0].lower()
        arg = parts[1] if len(parts) > 1 else ""
        entry = COMMANDS.get(name) or COMMANDS.get(name + "x") or COMMANDS.get(name + "y")
        if entry:
            entry[1](self, arg)
        else:
            self.notice(f"Comando desconocido: {name}  (/help)")

    # ── Envio / streaming ────────────────────────────────────────────────
    def send(self, text: str) -> None:
        if self.busy or not self.model:
            self.notice("Modelo no seleccionado o generando. Espera o usa /model <nombre>")
            return
        img = getattr(self, "attach_image_override", None)
        content: object = text
        if img:
            content = [{"type": "text", "text": text}, *img]
            self.attach_image_override = None
        self.messages.append({"role": "user", "content": content})
        self.add_msg("user", text)
        self.busy = True
        self.refresh_status()
        md = self.add_msg("assistant", "…")
        self.worker = asyncio.ensure_future(self._stream(md))

    async def _stream(self, md: Markdown | None) -> None:
        buffer = ""
        acc = ""
        try:
            messages = list(self.messages[-12:])
            options = {
                "temperature": self.temp,
                "num_predict": 512 if self.eco else 2048,
            }
            async for token in rchat.stream_chat(
                self.model, messages, system=self._system_text(), options=options
            ):
                buffer += token
                acc += token
                if md is not None and len(buffer) >= 24:
                    md.update(buffer)
                    buffer = ""
                    self.chat().scroll_end(animate=False)
            if md is not None:
                if buffer:
                    md.update(buffer)
                self.chat().scroll_end(animate=False)
            self.messages.append({"role": "assistant", "content": acc})
            self.tokens = len(acc.split())
            self.notice(f"  · {self.tokens} tokens")
        except asyncio.CancelledError:
            self.messages.append({"role": "assistant", "content": acc or "[interrumpido]"})
            self.notice("  · respuesta interrumpida")
        except Exception as e:
            self.notice(f"  · error: {e}")
        finally:
            self.busy = False
            self.refresh_status()

    def _system_text(self) -> str:
        base = self.system
        if self.code_mode:
            base += "\nContexto: programacion; respuestas concisas con codigo."
        if self.eco:
            base += "\nContexto reducido (modo eco)."
        return base

    def action_cancel(self) -> None:
        if self.worker and not self.worker.done():
            self.worker.cancel()

    def on_focus_into_input(self) -> None:
        pass

    # ── Slash handlers expuestos ─────────────────────────────────────────
    def set_model(self, name: str) -> None:
        if name:
            self.model = name
            cfg = rsession.load_config()
            cfg["model"] = name
            rsession.save_config(cfg)
            self.notice(f"Modelo activo: {name}")
        else:
            self.notice("Uso: /model <nombre>  (randi models para ver el catalogo)")
        self.refresh_status()

    def set_system(self, text: str) -> None:
        if text:
            self.system = text
            cfg = rsession.load_config()
            cfg["system"] = text
            rsession.save_config(cfg)
            self.notice("System prompt actualizado")
        else:
            self.notice(self.system)

    def set_temp(self, arg: str) -> None:
        try:
            t = float(arg)
        except ValueError:
            self.notice("Uso: /temp 0.0-2.0")
            return
        self.temp = max(0.0, min(2.0, t))
        cfg = rsession.load_config()
        cfg["temperature"] = self.temp
        rsession.save_config(cfg)
        self.notice(f"Temperatura: {self.temp}")

    def clear_chat(self) -> None:
        self.messages = []
        self.chat().remove_children()
        self.notice("Conversacion limpiada")

    def save_session(self, name: str) -> None:
        if not name:
            name = f"session-{time.strftime('%Y%m%d-%H%M')}"
        rsession.save_session(name, self.messages)
        cfg = rsession.load_config()
        cfg["last_session"] = name
        rsession.save_config(cfg)
        self.notice(f"Sesion guardada: {name}")

    def load_session(self, name: str) -> None:
        data = rsession.load_session(name) if name else None
        if not name:
            data = rsession.load_session(rsession.load_config().get("last_session", "")) or []
        if data is None:
            self.notice(f"No existe la sesion: {name}")
            return
        self.messages = data
        self.load_messages_to_chat()
        self.notice(f"Sesion cargada: {name or 'ultima'}")

    def list_sessions_cmd(self) -> None:
        items = rsession.list_sessions()
        if not items:
            self.notice("No hay sesiones guardadas")
            return
        self.notice("Sesiones: " + ", ".join(f"{n}({d})" for n, d in items[:8]))

    def list_models_info(self) -> None:
        async def go():
            mods = await rchat.tags()
            if not mods:
                self.notice("Sin modelos instalados (randi pull)")
            else:
                self.notice("Instalados: " + ", ".join(mods[:10]))
            self.refresh_status()

        self.run_worker(go())

    def attach_image(self, path: str) -> None:
        import base64

        if not path:
            self.notice("Uso: /image <ruta>")
            return
        p = Path(path).expanduser()
        if not p.exists():
            self.notice(f"No existe: {path}")
            return
        b64 = base64.b64encode(p.read_bytes()).decode()
        self.attach_image_override = [{"type": "text", "text": "[imagen adjunta]"},
                                      {"type": "image_url", "image_url": {"url": b64}}]
        self.notice(f"Imagen adjunta ({p.name})")

    def toggle_eco(self) -> None:
        self.eco = not self.eco
        self.refresh_status()
        self.notice(f"Modo eco: {'on' if self.eco else 'off'}")

    def toggle_code(self, force: bool | None = None) -> None:
        self.code_mode = not self.code_mode if force is None else bool(force)
        self.refresh_status()
        self.notice(f"Modo programador: {'on' if self.code_mode else 'off'}")

    def toggle_tts(self) -> None:
        self.tts = not self.tts
        self.refresh_status()
        self.notice("TTS no disponible en el TUI por ahora (usa la web 🔊)")

    def toggle_theme(self) -> None:
        self.theme = "textual-light" if self.theme == "textual-dark" else "textual-dark"

    def show_tokens(self) -> None:
        self.notice(f"Tokens de la ultima respuesta: {self.tokens}")

    def show_info(self) -> None:
        self.notice(f"Modelo: {self.model} · temp={self.temp} · eco={self.eco} · "
                    f"code={self.code_mode} · mensajes={len(self.messages)}")

    def action_help(self) -> None:
        lines = ["Comandos slash:"]
        for name, (desc, _h) in COMMANDS.items():
            lines.append(f"  {name:<12} {desc}")
        lines.append("\nAtajos: / o Ctrl+K paleta · Tab panel · Ctrl+C cancelar · Ctrl+D salir")
        panel = Static("\n".join(lines))
        panel.styles.padding = (1, 2)
        self.chat().mount(panel)
        self.chat().scroll_end(animate=False)

    def exit_tui(self) -> None:
        if self.busy and self.worker and not self.worker.done():
            self.worker.cancel()
        self.exit(0)

    # ── Instalacion / recomendacion ──────────────────────────────────────
    def install_model_cmd(self, name: str) -> None:
        if not name:
            self.notice("Uso: /install <modelo>")
            return
        async def go():
            self.notice(f"Instalando {name} (puede tardar)...")
            proc = await asyncio.create_subprocess_exec(
                "ollama", "pull", name,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            await proc.wait()
            import install

            try:
                install.configure_model({"ollamaId": name, "name": name, "id": name, "type": "",
                                         "useCase": [], "ctx": None, "thinking": False, "tools": False})
            except Exception:
                pass
            self.notice(f"{'Listo' if proc.returncode == 0 else 'Fallo'} al instalar {name}")
            self.refresh_status()

        self.run_worker(go())

    def recommend_cmd(self, uc: str) -> None:
        try:
            import hardware
            import recommend

            hw = hardware.detect_hardware()
            recs = recommend.rank_models(recommend.get_models(), hw,
                                         use_case=uc or None, limit=5)
            if not recs:
                self.notice("Sin recomendaciones para ese caso de uso")
                return
            lines = ["Recomendados:"]
            for r in recs:
                m, ev = r["model"], r["evaluation"]
                lines.append(f"  [{ev.grade}] {m['id']:<24} q{ev.quant or '-'} {ev.status or ''}")
            self.chat().mount(Static("\n".join(lines)))
            self.chat().scroll_end(animate=False)
        except Exception as e:
            self.notice(f"Error: {e}")

    def view_hardware(self) -> None:
        from .views import HardwareScreen

        self.push_screen(HardwareScreen())

    def open_view(self, name: str) -> None:
        from .views import CompareScreen, ModelsScreen, TierScreen

        screen = {"models": ModelsScreen, "tier": TierScreen, "compare": CompareScreen}.get(name)
        if screen:
            self.push_screen(screen())

    # ── Palette ──────────────────────────────────────────────────────────
    def build_palette(self) -> list[tuple[str, str]]:
        items: list[tuple[str, str]] = []
        for name, (desc, _h) in COMMANDS.items():
            items.append((f"{name}  — {desc}", name))
        items.append(("Abrir catalogo de modelos", "@view models"))
        items.append(("Abrir tier list (S-F)", "@view tier"))
        items.append(("Abrir comparador de modelos", "@view compare"))
        items.append(("Ver perfil de hardware", "@view hardware"))
        items.append(("Recomendar modelos (chat code vision)", "@recommend"))
        return items

    def run_palette_action(self, tag: str) -> None:
        if tag.startswith("/"):
            fmt = re.sub(r"\s+", " ", tag)
            parts = fmt.split(" ", 1)
            cmd = parts[0]
            entry = COMMANDS.get(cmd)
            if entry:
                entry[1](self, parts[1] if len(parts) > 1 else "")
        elif tag.startswith("@view"):
            self.open_view(tag.split()[1])
        elif tag == "@recommend":
            self.recommend_cmd("")


def main(argv: list[str]) -> int:
    if not sys.stdin.isatty():
        print("RANDI TUI requiere una terminal interactiva (tty).")
        print("Usa subcomandos de texto: randi help | install <m> | setup | doctor ...")
        return 0
    model = ""
    if argv and argv[0] in ("chat",):
        argv = argv[1:]
    if argv and not argv[0].startswith("-") and not any(a == "-m" for a in argv):
        model = argv[0]
    if "-m" in argv:
        i = argv.index("-m")
        if i + 1 < len(argv):
            model = argv[i + 1]
    app = RandiApp(initial_model=model)
    app.run()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
