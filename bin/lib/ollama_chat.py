#!/usr/bin/env python3
import argparse
import base64
import json
import os
import readline
import shutil
import signal
import subprocess
import sys
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: Se requiere la libreria 'requests'.")
    print("  Ejecuta: pip install requests")
    sys.exit(1)

try:
    from rich.console import Console
    from rich.markdown import Markdown
    from rich.panel import Panel
    from rich.table import Table
    from rich.text import Text
    from rich.live import Live
    from rich import box
    from rich.theme import Theme
except ImportError:
    print("Error: Se requiere la libreria 'rich'.")
    print("  Ejecuta: pip install rich")
    sys.exit(1)

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
CONFIG_DIR = Path.home() / ".config" / "randi"
SESSIONS_DIR = CONFIG_DIR / "sessions"
CONFIG_FILE = CONFIG_DIR / "config.json"
HISTORY_FILE = CONFIG_DIR / ".chat_history"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from catalog import get_models as _catalog_get_models
except ImportError:
    _catalog_get_models = None

_MODEL_CACHE = {}

def _catalog():
    global _MODEL_CACHE
    if not _MODEL_CACHE and _catalog_get_models is not None:
        try:
            for m in _catalog_get_models():
                _MODEL_CACHE[m["id"]] = m
        except Exception:
            _MODEL_CACHE = {}
    return _MODEL_CACHE

def _match_model(model_name):
    if not model_name:
        return None
    for key, m in _catalog().items():
        if model_name.startswith(key) or key.startswith(model_name):
            return m
    return None

console = Console(
    theme=Theme({
        "user":        "bold bright_green",
        "assistant":   "bold bright_cyan",
        "info":        "bold bright_yellow",
        "dim":         "dim white",
        "error":       "bold bright_red",
        "success":     "green",
        "warning":     "bold yellow",
        "ctx_ok":      "green",
        "ctx_warn":    "yellow",
        "ctx_crit":    "red",
        "timestamp":   "dim white",
    }),
    highlight=False,
)

def get_ram_info():
    try:
        with open("/proc/meminfo") as f:
            data = f.read()
        total_kb = 0; available_kb = 0
        for line in data.splitlines():
            if line.startswith("MemTotal:"):
                total_kb = int(line.split()[1])
            elif line.startswith("MemAvailable:"):
                available_kb = int(line.split()[1])
        return total_kb/1024/1024, available_kb/1024/1024
    except Exception:
        return 0, 0

def ram_warning(model_name):
    total_gb, available_gb = get_ram_info()
    if total_gb == 0: return
    m = _match_model(model_name)
    needed = m.get("ram", 4) if m else 4
    if available_gb < needed * 0.8:
        console.print(Panel(
            f"[warning]RAM disponible: ~{available_gb:.1f}GB de {total_gb:.1f}GB\n"
            f"[warning]'{model_name}' puede necesitar ~{needed}GB de RAM\n"
            f"[dim]Prueba con: randi chat -m gemma3:1b  (1.5GB)  o  randi chat -m deepseek-r1:1.5b  (1.1GB)[/dim]",
            border_style="yellow",
            padding=(0, 1),
        ))

def model_info_str(name):
    m = _match_model(name)
    if not m:
        return "?"
    ram = m.get("ram", 4)
    icon = "🟢" if ram < 2 else "🟡" if ram < 4 else "🔴"
    return f"{icon} {ram:.1f}GB"

def suggest_best_model():
    _, available_gb = get_ram_info()
    if available_gb == 0:
        return "gemma3:1b"
    if available_gb < 1.5:
        return "qwen2.5-coder:0.5b"
    elif available_gb < 2.5:
        return "qwen2.5-coder:1.5b"
    elif available_gb < 3.5:
        return "llama3.2:3b"
    elif available_gb < 5:
        return "qwen3:4b"
    else:
        return "qwen3:8b"

def optimal_context(model_name, avail_gb=None):
    if avail_gb is None:
        _, avail_gb = get_ram_info()
    if avail_gb == 0:
        return None
    m = _match_model(model_name)
    if not m:
        return None
    needed = m.get("ram", 4)
    ctx = m.get("ctx", 4096)
    if avail_gb < needed * 0.7:
        return max(1024, ctx // 4)
    elif avail_gb < needed * 0.9:
        return max(2048, ctx // 2)
    return None

class Completer:
    def __init__(self):
        self.commands = [
            "/help", "/model", "/system", "/clear", "/save",
            "/load", "/temp", "/models", "/tokens", "/info",
            "/image", "/eco", "/code", "/general", "/tts",
            "/exit", "/quit",
        ]
        self.models = []

    def complete(self, text, state):
        if state == 0:
            if text.startswith("/"):
                self.matches = [c for c in self.commands if c.startswith(text)]
            else:
                self.matches = []
        try:
            return self.matches[state]
        except IndexError:
            return None

class ChatSession:
    def __init__(self, model: str, temperature: float = 0.7):
        self.model = model
        self.temperature = temperature
        self.messages: list = []
        self.system_prompt = (
            "Eres RANDI, un asistente AI util, amigable y preciso. "
            "Respondes en el mismo idioma en que te hablan. "
            "Das respuestas claras, concisas y bien estructuradas."
        )
        self.code_mode = False
        self.eco = False
        self.tts = False
        self.pending_image = None
        self.current_request = None
        self._setup_readline()

    def _setup_readline(self):
        completer = Completer()
        completer.models = list_models()
        readline.set_completer(completer.complete)
        readline.set_completer_delims(" \t\n")
        try:
            if readline.__doc__ and "libedit" in readline.__doc__:
                readline.parse_and_bind("bind ^I rl_complete")
            else:
                readline.parse_and_bind("tab: complete")
        except Exception:
            readline.parse_and_bind("tab: complete")
        try:
            readline.read_history_file(str(HISTORY_FILE))
        except FileNotFoundError:
            pass
        readline.set_history_length(1000)

    def _save_history(self):
        try:
            readline.write_history_file(str(HISTORY_FILE))
        except Exception:
            pass

    def add_message(self, role: str, content: str):
        self.messages.append({"role": role, "content": content})

    def _ctx_tokens(self):
        total_chars = sum(len(m["content"]) for m in self.messages)
        return int(total_chars * 0.3)

    def _ctx_limit(self):
        m = _match_model(self.model)
        if m:
            return m.get("ctx", 4096)
        return 4096

    def _context_display(self):
        ctx = self._ctx_tokens()
        limit = self._ctx_limit()
        pct = min(100, int(ctx / limit * 100)) if limit else 0
        bar_w = 10
        filled = int(bar_w * pct / 100)
        bar = "●" * filled + "○" * (bar_w - filled)
        if pct < 50:
            style = "ctx_ok"
        elif pct < 80:
            style = "ctx_warn"
        else:
            style = "ctx_crit"
        return f"[dim]ctx[/dim] [{style}]{bar}[/] [dim]{ctx:,}/{limit:,}[/dim]"

    def _render_stats(self, data):
        td = data.get("total_duration", 0) / 1e9
        tps = data.get("tokens_per_second", 0)
        eval_count = data.get("eval_count", 0)
        parts = []
        if tps:
            parts.append(f"{tps:.1f} tok/s")
        if td:
            parts.append(f"{td:.1f}s")
        if eval_count:
            parts.append(f"{eval_count} tok")
        if parts:
            return f"[dim]╰─ {' · '.join(parts)}[/dim]"
        return ""

    def chat(self, user_input: str, images: list = None):
        sys_prompt = self.system_prompt
        if self.code_mode:
            sys_prompt = (
                "Eres RANDI en modo programador. Das respuestas de codigo "
                "precisas, con explicaciones breves y ejemplos funcionales. "
                "Usas el lenguaje de la pregunta."
            )
        msgs = [{"role": "system", "content": sys_prompt}]
        msgs.extend(self.messages)
        msgs.append({"role": "user", "content": user_input})
        if images:
            msgs[-1]["images"] = images

        options = {"temperature": self.temperature}

        opt_ctx = optimal_context(self.model)
        if opt_ctx is not None:
            options["num_ctx"] = opt_ctx

        raw = self.model.lower()
        if any(x in raw for x in ("70b", "13b")):
            if "num_ctx" not in options or options["num_ctx"] > 2048:
                options["num_ctx"] = 2048

        if self.eco:
            _, avail_gb = get_ram_info()
            eco_ctx = 2048 if avail_gb == 0 else max(1024, min(4096, int(avail_gb * 512)))
            options["num_ctx"] = min(options.get("num_ctx", eco_ctx), eco_ctx)
            options["num_predict"] = options.get("num_predict", 512)

        payload = {
            "model": self.model,
            "messages": msgs,
            "stream": True,
            "options": options,
        }

        try:
            response = requests.post(
                f"{OLLAMA_HOST}/api/chat",
                json=payload,
                stream=True,
                timeout=300,
            )
            response.raise_for_status()
            self.current_request = response

            full_content = ""
            final_data = {}

            initial = Panel(
                Text("▊", style="dim"),
                title="RANDI",
                title_align="left",
                border_style="bright_cyan",
                padding=(0, 1),
            )

            with Live(initial, console=console, refresh_per_second=12) as live:
                for line in response.iter_lines():
                    if line:
                        try:
                            line_str = line.decode("utf-8") if isinstance(line, bytes) else line
                            data = json.loads(line_str)
                            content = data.get("message", {}).get("content", "")
                            if content:
                                full_content += content
                                try:
                                    md = Markdown(full_content)
                                except Exception:
                                    md = Text(full_content)
                                live.update(Panel(
                                    md,
                                    title="RANDI",
                                    title_align="left",
                                    border_style="bright_cyan",
                                    padding=(0, 1),
                                ))
                            if data.get("done"):
                                final_data = data
                        except json.JSONDecodeError:
                            continue
                        except Exception as e:
                            console.print(f"\n[error]Error: {e}[/]")
                            return full_content, {}

            if final_data:
                stats_str = self._render_stats(final_data)
                if stats_str:
                    console.print(stats_str)

            return full_content, final_data

        except requests.exceptions.ConnectionError:
            console.print(f"\n[error]Error de conexion con Ollama.[/]")
            console.print("[dim]  Verifica: randi serve[/dim]")
            return "", {}
        except requests.exceptions.Timeout:
            console.print(f"\n[error]Tiempo de espera agotado.[/]")
            return "", {}
        except requests.RequestException as e:
            console.print(f"\n[error]Error de red: {e}[/]")
            return "", {}
        except Exception as e:
            console.print(f"\n[error]Error: {e}[/]")
            return "", {}
        finally:
            self.current_request = None

    def handle_command(self, cmd: str) -> bool:
        parts = cmd.strip().split(maxsplit=1)
        command = parts[0].lower()
        arg = parts[1] if len(parts) > 1 else ""

        if command in ("/exit", "/quit"):
            return False

        elif command == "/help":
            self._show_help()

        elif command == "/clear":
            self.messages.clear()
            console.print("[success]  ── Conversacion limpiada ──[/]")

        elif command == "/model":
            models = list_models()
            if arg:
                if arg in models:
                    self.model = arg
                    config["model"] = arg
                    save_config()
                    mi = model_info_str(self.model)
                    console.print(f"[success]Modelo cambiado a:[/] [bold]{self.model}[/] {mi}")
                else:
                    console.print(f"[error]Modelo '{arg}' no encontrado.[/]")
                    console.print(f"[dim]Disponibles: {', '.join(models)}[/dim]")
            else:
                mi = model_info_str(self.model)
                console.print(f"[info]Modelo actual:[/] [bold]{self.model}[/] {mi}")

        elif command == "/system":
            if arg:
                self.system_prompt = arg
                console.print("[success]System prompt actualizado.[/]")
            else:
                console.print(f"[info]System prompt:[/] {self.system_prompt[:80]}...")

        elif command == "/temp":
            try:
                val = float(arg)
                self.temperature = max(0.0, min(2.0, val))
                config["temperature"] = self.temperature
                save_config()
                console.print(f"[success]Temperature: {self.temperature}[/]")
            except (ValueError, IndexError):
                console.print(f"[info]Temperature actual: {self.temperature}[/]")

        elif command == "/models":
            models = list_models()
            if models:
                table = Table(show_header=False, box=box.SIMPLE, border_style="dim")
                table.add_column(style="bold", no_wrap=True)
                table.add_column(style="dim")
                table.add_column(style="dim")
                for m in models:
                    marker = "▸" if m == self.model else " "
                    sz = model_info_str(m)
                    table.add_row(f" {marker} {m}", sz, "")
                console.print("[info]Modelos instalados:[/]")
                console.print(table)
            else:
                console.print("[error]No hay modelos instalados.[/]")

        elif command == "/info":
            ctx = self._ctx_tokens()
            limit = self._ctx_limit()
            pct = min(100, int(ctx / limit * 100)) if limit else 0
            table = Table(show_header=False, box=box.SIMPLE, border_style="dim")
            table.add_column(style="bold dim", no_wrap=True)
            table.add_column(style="")
            table.add_row("Modelo", self.model)
            table.add_row("RAM", model_info_str(self.model))
            table.add_row("Temperature", str(self.temperature))
            table.add_row("Contexto", f"{ctx:,}/{limit:,} ({pct}%)")
            table.add_row("Mensajes", str(len(self.messages)))
            table.add_row("Eco", "ON" if self.eco else "OFF")
            table.add_row("Codigo", "ON" if self.code_mode else "OFF")
            table.add_row("TTS", "ON" if self.tts else "OFF")
            table.add_row("System prompt", self.system_prompt[:60] + "...")
            console.print(Panel(table, title="Sesion", border_style="blue", padding=(0, 1)))

        elif command == "/tokens":
            ctx = self._ctx_tokens()
            limit = self._ctx_limit()
            pct = min(100, int(ctx / limit * 100)) if limit else 0
            bar_w = 20
            filled = int(bar_w * pct / 100)
            bar = "█" * filled + "░" * (bar_w - filled)
            color = "green" if pct < 50 else ("yellow" if pct < 80 else "red")
            console.print(f"[info]Contexto:[/] [{color}]{bar}[/] {ctx:,}/{limit:,} ({pct}%)")
            console.print(f"[dim]Mensajes en contexto: {len(self.messages)}[/dim]")

        elif command == "/save":
            name = arg or f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            self._save_session(name)

        elif command == "/load":
            self._load_session(arg)

        elif command == "/image":
            self._handle_image(arg)

        elif command == "/eco":
            self._toggle_eco(arg)

        elif command == "/code":
            self.code_mode = True
            console.print("[success]Modo programador activado. (/general para volver)[/]")

        elif command == "/general":
            self.code_mode = False
            console.print("[success]Modo general activado.[/]")

        elif command == "/tts":
            self._toggle_tts(arg)

        else:
            console.print(f"[error]Comando desconocido: {command}[/]")
            console.print("[dim]/help para comandos disponibles.[/dim]")

        return True

    def _show_help(self):
        table = Table(show_header=False, box=box.ROUNDED, border_style="bright_cyan", padding=(0, 1))
        table.add_column(style="bold", no_wrap=True)
        table.add_column(style="dim")
        cmds = [
            ("/help", "Mostrar esta ayuda"),
            ("/model <m>", "Cambiar modelo activo"),
            ("/system <p>", "Cambiar system prompt"),
            ("/temp <n>", "Ajustar temperatura (0-2)"),
            ("/image <ruta>", "Adjuntar imagen (modelos vision)"),
            ("/eco", "Modo eco: menos RAM (on/off)"),
            ("/code", "Modo programador"),
            ("/general", "Volver al modo general"),
            ("/tts", "Texto a voz (on/off)"),
            ("/clear", "Limpiar conversacion"),
            ("/save <nom>", "Guardar sesion"),
            ("/load <nom>", "Cargar sesion"),
            ("/models", "Listar modelos instalados"),
            ("/tokens", "Mostrar contexto usado"),
            ("/info", "Info detallada de la sesion"),
            ("/exit", "Salir del chat"),
        ]
        for cmd, desc in cmds:
            table.add_row(cmd, desc)
        console.print(Panel(
            table,
            title="Comandos",
            border_style="bright_cyan",
            padding=(0, 1),
        ))
        console.print("[dim]Tab: autocompletar     Ctrl+C: cancelar     Ctrl+D: salir[/dim]")

    def _save_session(self, name: str):
        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        filepath = SESSIONS_DIR / f"{name}.json"
        data = {
            "model": self.model,
            "temperature": self.temperature,
            "system_prompt": self.system_prompt,
            "messages": self.messages,
            "saved_at": datetime.now().isoformat(),
        }
        filepath.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        console.print(f"[success]Sesion guardada: '{name}' ({len(self.messages)} mensajes)[/]")
        config["last_session"] = name
        save_config()

    def _load_session(self, name: str):
        if not name:
            if SESSIONS_DIR.exists():
                sessions = sorted(SESSIONS_DIR.glob("*.json"))
                if sessions:
                    table = Table(show_header=False, box=box.SIMPLE, border_style="dim")
                    table.add_column(style="bold", no_wrap=True)
                    table.add_column(style="dim")
                    table.add_column(style="dim")
                    for s in sessions:
                        d = json.loads(s.read_text())
                        table.add_row(
                            f"  {s.stem}",
                            f"({d.get('model','?')})",
                            f"{len(d.get('messages',[]))} msgs"
                        )
                    console.print("[info]Sesiones guardadas:[/]")
                    console.print(table)
                else:
                    console.print("[error]No hay sesiones guardadas.[/]")
            else:
                console.print("[error]No hay sesiones guardadas.[/]")
            return

        filepath = SESSIONS_DIR / f"{name}.json"
        if not filepath.exists():
            console.print(f"[error]Sesion '{name}' no encontrada.[/]")
            return

        try:
            data = json.loads(filepath.read_text())
            self.model = data.get("model", self.model)
            self.temperature = data.get("temperature", self.temperature)
            self.system_prompt = data.get("system_prompt", self.system_prompt)
            self.messages = data.get("messages", [])
            console.print(f"[success]Sesion '{name}' cargada ({len(self.messages)} mensajes).[/]")
        except Exception as e:
            console.print(f"[error]Error al cargar sesion: {e}[/]")

    def _handle_image(self, arg):
        if not arg:
            vision = [m["id"] for m in _catalog().values() if m.get("type") == "vision"]
            console.print("[info]Uso:[/] [bold]/image <ruta>[/]")
            console.print("[dim]Modelos de vision disponibles:[/]")
            for vid in vision:
                console.print(f"  [dim]{vid}[/dim]")
            console.print("[dim]Cambia con: /model <id>[/dim]")
            return
        path = Path(arg).expanduser()
        if not path.is_file():
            console.print(f"[error]Archivo no encontrado: {arg}[/]")
            return
        try:
            data = base64.b64encode(path.read_bytes()).decode()
            self.pending_image = data
            console.print(f"[success]Imagen adjuntada:[/] [bold]{path.name}[/]")
            m = _match_model(self.model)
            if not m or m.get("type") != "vision":
                console.print("[warning]El modelo actual no es de vision.[/]")
                console.print("[dim]  Usa /model gemma3:1b, gemma3:4b, llava:7b o qwen2.5vl:7b[/dim]")
            console.print("[dim]Escribe tu pregunta y se enviara junto a la imagen.[/dim]")
        except Exception as e:
            console.print(f"[error]No se pudo leer la imagen: {e}[/]")

    def _toggle_eco(self, arg):
        arg = (arg or "").lower()
        if arg in ("on", "1", "si", "s"):
            self.eco = True
        elif arg in ("off", "0", "no", "n"):
            self.eco = False
        else:
            self.eco = not self.eco
        state = "ON" if self.eco else "OFF"
        console.print(f"[info]Modo eco:[/] [bold]{state}[/]")
        if self.eco:
            console.print("[dim]Contexto y tokens reducidos para ahorrar RAM.[/dim]")

    def _toggle_tts(self, arg):
        arg = (arg or "").lower()
        if arg in ("on", "1", "si", "s"):
            self.tts = True
        elif arg in ("off", "0", "no", "n"):
            self.tts = False
        else:
            self.tts = not self.tts
        state = "ON" if self.tts else "OFF"
        console.print(f"[info]Texto a voz:[/] [bold]{state}[/]")
        if self.tts:
            if not (shutil.which("espeak-ng") or shutil.which("espeak") or shutil.which("piper")):
                console.print("[warning]No se encontro espeak-ng/espeak/piper. Instala uno para voz.[/]")

    def _speak(self, text):
        if not self.tts or not text:
            return
        text = text[:500]
        for cmd in (["espeak-ng", "-v", "es"], ["espeak", "-v", "es"]):
            if shutil.which(cmd[0]):
                try:
                    subprocess.Popen(cmd + [text], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except Exception:
                    pass
                return
        if shutil.which("piper"):
            try:
                p = subprocess.Popen(["piper", "--output_raw"],
                                     stdin=subprocess.PIPE,
                                     stdout=subprocess.DEVNULL,
                                     stderr=subprocess.DEVNULL)
                p.communicate(text.encode(), timeout=60)
            except Exception:
                pass

    def run(self):
        signal.signal(signal.SIGINT, self._signal_handler)

        mi = model_info_str(self.model)
        console.print()
        console.print(Panel(
            f"[bold]{self.model}[/]  {mi}",
            title="RANDI Chat",
            title_align="left",
            border_style="bright_cyan",
            subtitle="/help para comandos, /exit para salir",
            subtitle_align="right",
        ))

        ram_warning(self.model)

        last_session = config.get("last_session", "")
        if last_session:
            sess_path = SESSIONS_DIR / f"{last_session}.json"
            if sess_path.exists():
                console.print(f"[dim]Ultima sesion: '{last_session}'  (/load {last_session} para cargar)[/dim]")
                console.print()

        while True:
            try:
                ctx_str = self._context_display()
                console.print(ctx_str)
                user_input = input("  > ").strip()
                if not user_input:
                    continue

                readline.add_history(user_input)

                if user_input.startswith("/"):
                    if not self.handle_command(user_input):
                        break
                    continue

                self.add_message("user", user_input)

                ts = datetime.now().strftime("%H:%M")
                console.print(Panel(
                    Markdown(user_input),
                    title=f"Tú  [dim]{ts}[/dim]",
                    title_align="left",
                    border_style="bright_green",
                    padding=(0, 1),
                ))

                images = None
                if self.pending_image:
                    images = [self.pending_image]
                    self.pending_image = None

                response, stats = self.chat(user_input, images=images)

                if response:
                    self.add_message("assistant", response)
                    self._speak(response)

            except EOFError:
                console.print()
                break
            except KeyboardInterrupt:
                if self.current_request:
                    self.current_request.close()
                    self.current_request = None
                    console.print("[dim][cancelado][/dim]")
                else:
                    console.print()
                    break

        self._save_history()
        console.print("\n[dim]Hasta luego![/dim]")

    def _signal_handler(self, sig, frame):
        if self.current_request:
            self.current_request.close()
            self.current_request = None
            console.print(f"\r[dim][cancelado][/dim]")
        else:
            console.print()

config = {"model": "", "temperature": 0.7, "last_session": ""}

def load_config():
    global config
    if CONFIG_FILE.exists():
        try:
            config.update(json.loads(CONFIG_FILE.read_text()))
        except Exception:
            pass

def save_config():
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, indent=2))

def api_get(path):
    try:
        r = requests.get(f"{OLLAMA_HOST}{path}", timeout=5)
        return r.json() if r.status_code == 200 else None
    except requests.RequestException:
        return None

def server_running():
    return api_get("/api/tags") is not None

def list_models():
    data = api_get("/api/tags")
    if data and "models" in data:
        return [m["name"] for m in data["models"]]
    return []

def main():
    parser = argparse.ArgumentParser(
        description="RANDI Chat - Interfaz de chat para Ollama",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("-m", "--model", help="Modelo a usar")
    parser.add_argument("--host", help="URL del servidor Ollama")
    parser.add_argument("--list-models", action="store_true", help="Listar modelos instalados")
    parser.add_argument("--list-sessions", action="store_true", help="Listar sesiones guardadas")

    args = parser.parse_args()

    if args.host:
        global OLLAMA_HOST
        OLLAMA_HOST = args.host

    load_config()

    if args.list_models:
        models = list_models()
        if models:
            table = Table(show_header=False, box=box.SIMPLE, border_style="dim")
            table.add_column(style="bold", no_wrap=True)
            table.add_column(style="dim")
            for m in models:
                sz = model_info_str(m)
                table.add_row(f"  {m}", sz)
            console.print(table)
        else:
            console.print("[error]No hay modelos instalados.[/]")
        sys.exit(0)

    if args.list_sessions:
        if SESSIONS_DIR.exists():
            sessions = sorted(SESSIONS_DIR.glob("*.json"))
            if sessions:
                table = Table(show_header=False, box=box.SIMPLE, border_style="dim")
                table.add_column(style="bold", no_wrap=True)
                table.add_column(style="dim")
                table.add_column(style="dim")
                for s in sessions:
                    d = json.loads(s.read_text())
                    table.add_row(
                        f"  {s.stem}",
                        f"({d.get('model','?')})",
                        f"{len(d.get('messages',[]))} msgs"
                    )
                console.print(table)
            else:
                console.print("[error]No hay sesiones guardadas.[/]")
        else:
            console.print("[error]No hay sesiones guardadas.[/]")
        sys.exit(0)

    if not server_running():
        console.print(f"[error]Ollama no esta corriendo en {OLLAMA_HOST}[/]")
        console.print("[dim]  Ejecuta: randi serve[/dim]")
        sys.exit(1)

    models = list_models()
    if not models:
        console.print("[error]No hay modelos instalados.[/]")
        console.print("[dim]  Ejecuta: randi pull[/dim]")
        sys.exit(1)

    model = args.model or config.get("model") or ""

    if not model or model not in models:
        suggested = suggest_best_model()
        if model and model not in models:
            console.print(f"[warning]Modelo '{model}' no encontrado.[/]")
        if suggested in models:
            model = suggested
            console.print(f"[dim]Usando modelo recomendado: {model} ({model_info_str(model)})[/dim]")
        else:
            model = models[0]
            console.print(f"[dim]Usando: {model}[/dim]")

    if model not in models:
        model = models[0]
        console.print(f"[dim]Usando: {model}[/dim]")

    session = ChatSession(model=model, temperature=config.get("temperature", 0.7))
    session.run()

if __name__ == "__main__":
    main()
