"""RANDI TUI — Aplicacion principal (Textual).

Layout v3: header/servicer · chat grande + panel contexto derecha · composer
separado multilinea. i18n ES/EN. `/` paleta, modelos seleccionables, etc.
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
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.reactive import reactive
from textual.widgets import Footer, Markdown, Static

from . import chat as rchat
from . import session as rsession
from .composer import Composer
from .context_panel import ContextPanel
from .i18n import lang_code, slash_desc, tr
from .slash import COMMANDS, completions

RANDI_VERSION = "2.0.9"

APP_CSS = """
Screen { background: #0a0a0a; }

/* Header */
#status { dock: top; height: 2; padding: 0 2; color: #9c9c9c;
          background: #101010; border-bottom: solid #262626; text-style: bold; }

/* Cuerpo: chat + contexto */
#body { height: 1fr; }
#chat { width: 1fr; padding: 1 2; scrollbar-color: #3a3a3a; scrollbar-background: #101010; }
#chat Markdown { border-left: solid #262626; padding-left: 1; color: #e6e6ea; }
.msg-user { background: #16161d; border-left: solid #5b7cfa;
            color: #ececf1; padding: 0 1; margin: 0 0 1 1; }
.msg-meta { color: #56565f; text-style: bold; margin: 1 0 0 0; }
.msg-panel { padding: 1 2; background: #101010; border: tall #262626; color: #d6d6da; }

/* Panel contexto (derecha) */
#context { width: 40; background: #0d0d10; border-left: solid #262626; padding: 1 1; height: 1fr; }

/* Composer separado */
#composer-box { dock: bottom; height: 7; border: round #262626; background: #101010;
                margin: 0 2 1 2; padding: 1; }
Composer { height: 5; background: #14141b; border: none; color: #fafafa; }
#hint { dock: bottom; height: 1; color: #56565f; padding: 0 2; text-align: right; }
"""


class RandiApp(App):
    CSS = APP_CSS
    TITLE = "RANDI"
    SUB_TITLE = f"IA local multiplataforma · v{RANDI_VERSION}"
    BINDINGS = [
        Binding("ctrl+k", "palette", "Comandos"),
        Binding("tab", "context", "Contexto"),
        Binding("ctrl+y", "copy_last", "Copiar"),
        Binding("ctrl+n", "new_chat", "Nuevo"),
        Binding("ctrl+e", "edit_last", "Editar"),
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
    lang: str = "es"
    server: bool = reactive(False)
    busy: bool = False
    worker: asyncio.Task | None = None
    _flush_timer: object | None = None
    _draft: str = ""
    past: list[str] = []

    def __init__(self, initial_model: str = ""):
        super().__init__()
        self.initial_model = initial_model
        self.palette_items: list[tuple[str, str]] = []

    def tr(self, key: str, default: str = "") -> str:
        return tr(self.lang, key, default)

    # ── Composicion ──────────────────────────────────────────────────────
    def compose(self) -> ComposeResult:
        yield Static(id="status")
        with Horizontal(id="body"):
            yield VerticalScroll(id="chat")
            yield ContextPanel()
        with Vertical(id="composer-box"):
            yield Composer(id="input",
                           placeholder=self.tr("input_placeholder", "Escribe un mensaje..."))
        yield Static(self.tr("hint", ""), id="hint")
        yield Footer()

    def on_mount(self) -> None:
        cfg = rsession.load_config()
        self.lang = lang_code(cfg.get("lang", "es"))
        self.model = self.initial_model or cfg.get("model", "")
        self.system = cfg.get("system", self.system)
        self.temp = float(cfg.get("temperature", self.temp))
        ctx = self.context()
        ctx.set_lang(self.lang)
        self.run_worker(self._boot_worker())

    # ── UI helpers ───────────────────────────────────────────────────────
    def input(self) -> Composer:
        return self.query_one("#input", Composer)

    def chat(self) -> VerticalScroll:
        return self.query_one("#chat", VerticalScroll)

    def status(self) -> Static:
        return self.query_one("#status", Static)

    def context(self) -> ContextPanel:
        return self.query_one("#context", ContextPanel)

    def hint(self) -> Static:
        return self.query_one("#hint", Static)

    def notice(self, text: str) -> None:
        self.chat().mount(Static(text, classes="msg-meta"))
        self.chat().scroll_end(animate=False)

    # ── Boot ─────────────────────────────────────────────────────────────
    async def _boot_worker(self) -> None:
        self.server = await rchat.server_up()
        self.context().add_activity("ok" if self.server else "err",
                                    tr(self.lang, "copy_no"))
        if not self.model:
            mods = await rchat.tags()
            if mods:
                self.model = mods[0]
        self.refresh_status()
        ctx = self.context()
        sess = rsession.load_config().get("last_session", "")
        if sess and rsession.load_session(sess):
            self.messages = rsession.load_session(sess) or []
            self.load_messages_to_chat()
            ctx.set_session(sess)
            ctx.add_activity("ok", sess)
        if not self.messages:
            self.chat().mount(Static(self.tr("welcome"), classes="msg-panel"))
        self.input().focus()
        cfg = rsession.load_config()
        if not cfg.get("onboarded"):
            self.open_view("setup")

    # ── Mensajes ─────────────────────────────────────────────────────────
    def add_msg(self, role: str, text: str) -> Markdown | None:
        stamp = time.strftime("%H:%M")
        if role == "user":
            label = self.tr("my", "Tu")
            self.chat().mount(Static(f"  {label} · {stamp}", classes="msg-meta"))
            self.chat().mount(Static(text, classes="msg-user"))
            return None
        label = self.tr("assistant", "RANDI")
        self.chat().mount(Static(f"  {label} · {stamp}", classes="msg-meta"))
        md = Markdown(text or "")
        self.chat().mount(md)
        self.chat().scroll_end(animate=False)
        return md

    def load_messages_to_chat(self) -> None:
        self.chat().remove_children()
        for m in self.messages[-40:]:
            role = m.get("role", "")
            content = m.get("content", "")
            if isinstance(content, list):
                txt = next((p.get("text", "") for p in content
                            if isinstance(p, dict) and p.get("type") == "text"), "")
                content = txt or "[imagen]"
            if role == "user":
                self.add_msg("user", content)
            elif role == "assistant":
                self.add_msg("assistant", content)

    def refresh_status(self) -> None:
        seg = []
        seg.append("[#5b7cfa]◆ RANDI[/#5b7cfa]")
        if self.model:
            seg.append(f"[b]{self.model}[/b]")
            try:
                import catalog as _cat
                import compat as _compat
                import hardware as _hw

                hw = _hw.detect_hardware(cache=True)
                m = next((x for x in _cat.get_models()
                          if (x.get("ollamaId") or x["id"]) == self.model), None)
                if m:
                    ev = _compat.evaluate_model_best(m, hw)
                    gcolor = {"S": "#22c55e", "A": "#4ade80", "B": "#a3e635", "C": "#f59e0b",
                              "D": "#f97316", "F": "#ef4444"}.get(ev.grade, "#56565f")
                    seg.append(f"[{gcolor}]{ev.grade}[/{gcolor}] [dim]q{ev.quant}[/dim]")
                    self.context().set_model(self.model, ev.grade,
                                             f"q{ev.quant}", m.get("ctx", ""),
                                             f"~{m.get('ram', '')}GB")
            except Exception:
                self.context().set_model(self.model, "", "", "", "")
        seg.append(f"{'[#22c55e]●[/#22c55e]' if self.server else '[#ef4444]○[/#ef4444]'}")
        if self.tokens:
            seg.append(f"[dim]t{self.tokens}[/dim]")
        sess = rsession.load_config().get("last_session", "")
        if sess:
            seg.append(f"[#9457eb]↺ {sess}[/#9457eb]")
        if self.eco:
            seg.append("[#f59e0b]eco[/#f59e0b]")
        if self.code_mode:
            seg.append("[#f59e0b]code[/#f59e0b]")
        seg.append(f"[dim]{self.tr('lang', 'ES')}[/dim]")
        self.status().update("  " + "  ·  ".join(seg))

    # ── Composer / submit ────────────────────────────────────────────────
    def submit_composer(self, text: str) -> None:
        if not text:
            return
        if self.past and self.past[-1] != text:
            self.past.append(text)
        self.past = self.past[-200:]
        self.hint().update(self.tr("hint"))
        if text.startswith("/"):
            self.run_command(text)
            return
        self.send(text)

    async def on_text_area_changed(self, event) -> None:
        try:
            val = event.text_area.text or ""
        except Exception:
            return
        if val.startswith("/"):
            comps = completions(val.split(None, 1)[0])
            self.hint().update("  " + "  ·  ".join(comps[:8]) if comps else "")
        else:
            self.hint().update(self.tr("hint"))

    def run_command(self, text: str) -> None:
        parts = text.split(None, 1)
        name = parts[0].lower()
        arg = parts[1] if len(parts) > 1 else ""
        entry = COMMANDS.get(name)
        if entry:
            entry[1](self, arg)
        else:
            self.notice(f"[#ef4444]✗[/#ef4444] {name}  (/help)")

    # ── Envio / streaming ────────────────────────────────────────────────
    def send(self, text: str) -> None:
        if self.busy or not self.model:
            self.notice(self.tr("busy_line"))
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
        md = self.add_msg("assistant", "")
        self._draft = ""
        if self._flush_timer is not None:
            self._flush_timer.stop()
        self._flush_timer = self.set_interval(0.08, lambda: self._flush_md(md))
        self.worker = asyncio.ensure_future(self._stream(md))

    def _flush_md(self, md: Markdown | None) -> None:
        if md is not None and self._draft:
            md.update(self._draft)
            self.chat().scroll_end(animate=False)

    async def _stream(self, md: Markdown | None) -> None:
        acc = ""
        try:
            messages = list(self.messages[-12:])
            options = {"temperature": self.temp, "num_predict": 512 if self.eco else 2048}
            async for token in rchat.stream_chat(
                self.model, messages, system=self._system_text(), options=options
            ):
                acc += token
                self._draft = acc
            self._draft = acc
            self._flush_md(md)
            self.messages.append({"role": "assistant", "content": acc})
            self.tokens = len(acc.split())
            self.context().set_tokens(self.tokens, 0)
            self.notice(f"  · {self.tokens} tok")
        except asyncio.CancelledError:
            self._draft = acc or f"[{self.tr('interrupted')}]"
            self._flush_md(md)
            self.messages.append({"role": "assistant", "content": acc or "[interrumpido]"})
            self.notice(f"  · {self.tr('interrupted')}")
        except Exception as e:
            self._draft = f"⚠ {e}"
            self._flush_md(md)
            self.notice(f"  · {self.tr('error_prefix')}: {e}")
        finally:
            if self._flush_timer is not None:
                self._flush_timer.stop()
                self._flush_timer = None
            self.busy = False
            self.refresh_status()

    def _system_text(self) -> str:
        base = self.system
        if self.code_mode:
            base += "\nContexto: programacion; respuestas concisas con codigo."
        if self.eco:
            base += "\nContexto reducido (modo eco)."
        return base

    # ── Acciones ─────────────────────────────────────────────────────────
    def action_close(self) -> None:
        if len(self.screen_stack) > 1:
            self.pop_screen()
        else:
            self.input().focus()

    def action_quit(self) -> None:
        if self.busy:
            self.notice("Espera a que termine o pulsa Ctrl+C (pendiente).")
            return
        self.exit(0)

    def action_context(self) -> None:
        ctx = self.query_one("#context", ContextPanel)
        ctx.style.display = "none" if ctx.style.display == "block" else "block"

    def action_palette(self) -> None:
        from .palette import PaletteScreen

        self.palette_items = self.build_palette()
        self.push_screen(PaletteScreen())

    def action_copy_last(self) -> None:
        last = next((m["content"] for m in reversed(self.messages)
                     if m.get("role") == "assistant" and isinstance(m.get("content"), str)), "")
        if not last:
            self.notice(self.tr("copy_no"))
            return
        try:
            self.copy_to_clipboard(last)
            self.notice(self.tr("copy_ok"))
        except Exception:
            self.notice(self.tr("copy_no"))

    def action_new_chat(self) -> None:
        if self.messages and not self.busy:
            self.save_session(f"sesion-{time.strftime('%Y%m%d-%H%M%S')}")
        self.messages = []
        self.chat().remove_children()
        self.tokens = 0
        self.notice(self.tr("new_chat"))
        self.refresh_status()

    def action_edit_last(self) -> None:
        last = next((m["content"] for m in reversed(self.messages)
                     if m.get("role") == "user" and isinstance(m.get("content"), str)), "")
        if not last:
            self.notice(self.tr("edit_none"))
            return
        self.input().load_text(last) if hasattr(self.input(), "load_text") else setattr(self.input(), "text", last)
        self.input().focus()

    # ── Slash handlers ───────────────────────────────────────────────────
    def set_model(self, name: str) -> None:
        if name:
            self.model = name
            cfg = rsession.load_config()
            cfg["model"] = name
            rsession.save_config(cfg)
            self.notice(f"{self.tr('model_set')}: {name}")
            self.context().add_activity("ok", name)
        else:
            self.notice(self.tr("model_usage"))
        self.refresh_status()

    def set_system(self, text: str) -> None:
        if text:
            self.system = text
            cfg = rsession.load_config()
            cfg["system"] = text
            rsession.save_config(cfg)
            self.notice(self.tr("system_set"))
        else:
            self.notice(self.system)

    def set_temp(self, arg: str) -> None:
        try:
            t = float(arg)
        except ValueError:
            self.notice(self.tr("temp_usage"))
            return
        self.temp = max(0.0, min(2.0, t))
        cfg = rsession.load_config()
        cfg["temperature"] = self.temp
        rsession.save_config(cfg)
        self.notice(f"{self.tr('temp_set')}: {self.temp}")

    def clear_chat(self) -> None:
        self.messages = []
        self.chat().remove_children()
        self.notice(self.tr("cleared"))

    def save_session(self, name: str) -> None:
        if not name:
            name = f"sesion-{time.strftime('%Y%m%d-%H%M')}"
        rsession.save_session(name, self.messages)
        cfg = rsession.load_config()
        cfg["last_session"] = name
        rsession.save_config(cfg)
        self.context().set_session(name)
        self.context().add_activity("ok", name)
        self.notice(f"{self.tr('session_saved')}: {name}")

    def load_session(self, name: str) -> None:
        data = rsession.load_session(name) if name else None
        if not name:
            last = rsession.load_config().get("last_session", "")
            data = rsession.load_session(last) or []
        if data is None:
            self.notice(f"{self.tr('session_not_found')}: {name}")
            return
        self.messages = data
        self.load_messages_to_chat()
        self.context().set_session(name or rsession.load_config().get("last_session", ""))
        self.notice(f"{self.tr('session_loaded')}: {name or 'última'}")

    def list_sessions_cmd(self) -> None:
        items = rsession.list_sessions()
        if not items:
            self.notice(self.tr("no_sessions"))
        else:
            self.notice(self.tr("sessions") + ": " + ", ".join(f"{n}" for n, _ in items[:8]))

    def list_models_info(self) -> None:
        async def go():
            mods = await rchat.tags()
            if not mods:
                self.notice(self.tr("no_models"))
            else:
                self.notice("✓ " + ", ".join(mods[:10]))
            self.refresh_status()

        self.run_worker(go())

    def open_models_picker(self) -> None:
        from .screens import ModelPickerScreen

        self.push_screen(ModelPickerScreen())

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
        self.context().add_activity("ok", f"eco {self.eco}")

    def toggle_code(self, force: bool | None = None) -> None:
        self.code_mode = not self.code_mode if force is None else bool(force)
        self.refresh_status()
        self.context().add_activity("ok", f"code {self.code_mode}")

    def toggle_tts(self) -> None:
        self.tts = not self.tts
        self.refresh_status()

    def toggle_theme(self) -> None:
        self.theme = "textual-light" if self.theme == "textual-dark" else "textual-dark"

    def set_lang(self, arg: str) -> None:
        if arg:
            self.change_lang(arg)

    def change_lang(self, code: str) -> None:
        self.lang = lang_code(code)
        cfg = rsession.load_config()
        cfg["lang"] = self.lang
        rsession.save_config(cfg)
        self.context().set_lang(self.lang)
        self.input().placeholder = self.tr("input_placeholder")
        self.hint().update(self.tr("hint"))
        self.notice(f"{self.tr('lang_changed')}: {self.lang.upper()}")
        self.refresh_status()

    def show_tokens(self) -> None:
        self.notice(f"{self.tr('tokens_last')}: {self.tokens}")

    def show_info(self) -> None:
        self.notice(f"{self.tr('info_model')}: {self.model} · t{self.temp} · "
                    f"eco={self.eco} · code={self.code_mode} · msgs={len(self.messages)}")

    def action_help(self) -> None:
        lines = [self.tr("help_title"), "=" * 24, ""]
        lines.append("Ctrl+K paleta · Tab contexto · Ctrl+Y copiar · Ctrl+D salir")
        lines.append("")
        lines.append("Slash:")
        for name, (_d, _h) in COMMANDS.items():
            lines.append(f"  {name:<12} {slash_desc(self.lang, name)}")
        self.chat().mount(Static("\n".join(lines), classes="msg-panel"))
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
            ctx = self.context()
            ctx.add_activity("run", f"{self.tr('installing')} {name}")
            self.notice(f"{self.tr('installing')} {name} (puede tardar)...")
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
            ok = proc.returncode == 0
            ctx.add_activity("ok" if ok else "err",
                             f"{name} → {self.tr('ok_installed') if ok else self.tr('ok_install_fail')}")
            self.notice(f"{self.tr('ok_installed') if ok else self.tr('ok_install_fail')} {name}")
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
                self.notice(self.tr("no_models"))
                return
            lines = [self.tr("recommended") + ":"]
            for r in recs:
                m, ev = r["model"], r["evaluation"]
                lines.append(f"  [{ev.grade}] {m['id']:<24} q{ev.quant or '-'} {ev.status or ''}")
            self.chat().mount(Static("\n".join(lines), classes="msg-panel"))
            self.chat().scroll_end(animate=False)
        except Exception as e:
            self.notice(f"{self.tr('error_prefix')}: {e}")

    # ── Vistas / paleta ──────────────────────────────────────────────────
    def open_view(self, name: str) -> None:
        from .screens import HelpScreen, SessionsScreen, SettingsScreen, SetupScreen
        from .views import CompareScreen, HardwareScreen, ModelsScreen, TierScreen

        screen = {"models": ModelsScreen, "tier": TierScreen, "compare": CompareScreen,
                  "hardware": HardwareScreen, "setup": SetupScreen,
                  "sessions": SessionsScreen, "settings": SettingsScreen,
                  "help": HelpScreen}.get(name)
        if screen:
            self.push_screen(screen())

    def mark_onboarded(self) -> None:
        cfg = rsession.load_config()
        cfg["onboarded"] = True
        rsession.save_config(cfg)

    def build_palette(self) -> list[tuple[str, str]]:
        items: list[tuple[str, str]] = []
        for name, (_d, _h) in COMMANDS.items():
            items.append((f"{name}  — {slash_desc(self.lang, name)}", name))
        items.append((self.tr("models_title") + " (seleccionar)", "@picker"))
        items.append((self.tr("tier_title"), "@view tier"))
        items.append((self.tr("compare_title"), "@view compare"))
        items.append((self.tr("hardware_title"), "@view hardware"))
        items.append((self.tr("onboarding_h"), "@view setup"))
        items.append((self.tr("sessions"), "@view sessions"))
        items.append((self.tr("settings_title"), "@view settings"))
        items.append((self.tr("help_title"), "@view help"))
        return items

    def run_palette_action(self, tag: str) -> None:
        if tag.startswith("/"):
            parts = re.sub(r"\s+", " ", tag).split(" ", 1)
            entry = COMMANDS.get(parts[0])
            if entry:
                entry[1](self, parts[1] if len(parts) > 1 else "")
        elif tag == "@picker":
            self.open_models_picker()
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
    if argv and argv[0] == "chat":
        argv = argv[1:]
    if argv and not argv[0].startswith("-"):
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
