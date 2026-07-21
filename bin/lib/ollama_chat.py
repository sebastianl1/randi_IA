#!/data/data/com.termux/files/usr/bin/python3
import argparse
import json
import os
import readline
import signal
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

MODEL_INFO = {
    "gemma4:2b":           {"ram": 1.5, "ctx": 8192,  "cat": "bajo"},
    "deepseek-r1:1.5b":    {"ram": 1.1, "ctx": 8192,  "cat": "bajo"},
    "qwen2.5-coder:1.5b":  {"ram": 0.9, "ctx": 16384, "cat": "bajo"},
    "qwen2.5-coder:0.5b":  {"ram": 0.4, "ctx": 8192,  "cat": "bajo"},
    "phi3:mini":           {"ram": 2.0, "ctx": 8192,  "cat": "bajo"},
    "llama3.2:3b":         {"ram": 2.0, "ctx": 8192,  "cat": "medio"},
    "qwen3:4b":            {"ram": 2.5, "ctx": 16384, "cat": "medio"},
    "phi3:3.8b":           {"ram": 2.3, "ctx": 8192,  "cat": "medio"},
    "deepseek-r1:7b":      {"ram": 4.7, "ctx": 32768, "cat": "alto"},
    "qwen2.5-coder:7b":    {"ram": 4.7, "ctx": 32768, "cat": "alto"},
    "qwen3:8b":            {"ram": 4.5, "ctx": 32768, "cat": "alto"},
    "mistral:7b":          {"ram": 4.1, "ctx": 32768, "cat": "alto"},
}

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
    needed = next((v["ram"] for k, v in MODEL_INFO.items() if model_name.startswith(k) or k.startswith(model_name)), 4)
    if available_gb < needed * 0.8:
        console.print(Panel(
            f"[warning]RAM disponible: ~{available_gb:.1f}GB de {total_gb:.1f}GB\n"
            f"[warning]'{model_name}' puede necesitar ~{needed}GB de RAM\n"
            f"[dim]Prueba con: randi chat -m gemma4:2b  (1.5GB)  o  randi chat -m deepseek-r1:1.5b  (1.1GB)[/dim]",
            border_style="yellow",
            padding=(0, 1),
        ))

def model_info_str(name):
    for key, info in MODEL_INFO.items():
        if name.startswith(key) or key.startswith(name):
            ram = info["ram"]
            icon = "🟢" if ram < 2 else "🟡" if ram < 4 else "🔴"
            return f"{icon} {ram:.1f}GB"
    return "?"

def suggest_best_model():
    _, available_gb = get_ram_info()
    if available_gb == 0:
        return "gemma4:2b"
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
    for key, info in MODEL_INFO.items():
        if model_name.startswith(key) or key.startswith(model_name):
            needed = info["ram"]
            ctx = info["ctx"]
            if avail_gb < needed * 0.7:
                return max(1024, ctx // 4)
            elif avail_gb < needed * 0.9:
                return max(2048, ctx // 2)
            return None
    return None

class Completer:
    def __init__(self):
        self.commands = [
            "/help", "/model", "/system", "/clear", "/save",
            "/load", "/temp", "/models", "/tokens", "/info", "/exit", "/quit",
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
        for key, info in MODEL_INFO.items():
            if self.model.startswith(key) or key.startswith(self.model):
                return info["ctx"]
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

    def chat(self, user_input: str):
        msgs = [{"role": "system", "content": self.system_prompt}]
        msgs.extend(self.messages)
        msgs.append({"role": "user", "content": user_input})

        options = {"temperature": self.temperature}

        opt_ctx = optimal_context(self.model)
        if opt_ctx is not None:
            options["num_ctx"] = opt_ctx

        raw = self.model.lower()
        if any(x in raw for x in ("70b", "13b")):
            if "num_ctx" not in options or options["num_ctx"] > 2048:
                options["num_ctx"] = 2048

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

                response, stats = self.chat(user_input)

                if response:
                    self.add_message("assistant", response)

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
