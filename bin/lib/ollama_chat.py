#!/data/data/com.termux/files/usr/bin/python3
import argparse
import json
import os
import readline
import signal
import sys
import time
import shutil
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: Se requiere la libreria 'requests'.")
    print("  Ejecuta: pip install requests")
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

class C:
    R = "\033[0m"; B = "\033[1m"; D = "\033[2m"; I = "\033[3m"
    K = "\033[30m"; R_ = "\033[31m"; G = "\033[32m"; Y = "\033[33m"
    Bu = "\033[34m"; M = "\033[35m"; C = "\033[36m"; W = "\033[37m"

    @staticmethod
    def user(t): return f"{C.G}{C.B}{t}{C.R}"
    @staticmethod
    def asst(t): return f"{C.C}{t}{C.R}"
    @staticmethod
    def sys(t): return f"{C.Y}{C.I}{t}{C.R}"
    @staticmethod
    def err(t): return f"{C.R_}{t}{C.R}"
    @staticmethod
    def dim(t): return f"{C.D}{t}{C.R}"
    @staticmethod
    def info(t): return f"{C.Bu}{C.B}{t}{C.R}"
    @staticmethod
    def bold(t): return f"{C.B}{t}{C.R}"
    @staticmethod
    def ok(t): return f"{C.G}{t}{C.R}"
    @staticmethod
    def warn(t): return f"{C.Y}{C.B}{t}{C.R}"
    @staticmethod
    def header(t): return f"{C.M}{C.B}{t}{C.R}"
    @staticmethod
    def label(t): return f"{C.W}{C.B}{t}{C.R}"

TERM_WIDTH = shutil.get_terminal_size((80, 24)).columns

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
        print(C.warn(f"  RAM disponible: ~{available_gb:.1f}GB de {total_gb:.1f}GB"))
        print(C.warn(f"  '{model_name}' puede necesitar ~{needed}GB de RAM"))
        print(C.dim("  Prueba con: randi chat -m gemma4:2b  (1.5GB)  o  randi chat -m deepseek-r1:1.5b  (1.1GB)"))
        print()

def model_info_str(name):
    for key, info in MODEL_INFO.items():
        if name.startswith(key) or key.startswith(name):
            ram = info["ram"]
            icon = "🟢" if ram < 2 else "🟡" if ram < 4 else "🔴"
            return f"{icon} {ram:.1f}GB"
    return "?"

def term_hr(char="─"):
    return char * min(TERM_WIDTH, 80)

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

    def _status_bar(self):
        ctx = self._ctx_tokens()
        limit = self._ctx_limit()
        pct = min(100, int(ctx / limit * 100)) if limit else 0
        bar_w = 14
        filled = int(bar_w * pct / 100)
        bar = "█" * filled + "░" * (bar_w - filled)
        color = C.G if pct < 50 else (C.Y if pct < 80 else C.R_)
        return f"{C.dim('ctx')} {color}{bar}{C.R} {C.dim(f'{ctx}/{limit}')}"

    def chat(self, user_input: str):
        msgs = [{"role": "system", "content": self.system_prompt}]
        msgs.extend(self.messages)
        msgs.append({"role": "user", "content": user_input})

        options = {"temperature": self.temperature}
        raw = self.model.lower()
        if any(x in raw for x in ("70b", "7b", "8b", "13b")):
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
            for line in response.iter_lines():
                if line:
                    try:
                        line_str = line.decode("utf-8") if isinstance(line, bytes) else line
                        data = json.loads(line_str)
                        content = data.get("message", {}).get("content", "")
                        if content:
                            print(content, end="", flush=True)
                            full_content += content
                        if data.get("done"):
                            td = data.get("total_duration", 0) / 1e9
                            tps = data.get("tokens_per_second", 0)
                            eval_count = data.get("eval_count", 0)
                            stats = []
                            if tps:
                                stats.append(f"{tps:.1f} tok/s")
                            if td:
                                stats.append(f"{td:.1f}s")
                            if eval_count:
                                stats.append(f"{eval_count} tok")
                            if stats:
                                print(f" {C.dim('·'.join(stats))}")
                            return full_content, data
                    except json.JSONDecodeError:
                        continue
                    except Exception as e:
                        print(f"\n{C.err(f'Error: {e}')}")
                        return full_content, {}
            return full_content, {}
        except requests.exceptions.ConnectionError:
            print(f"\n{C.err('Error de conexion con Ollama.')}")
            print(C.dim("  Verifica: randi serve"))
            return "", {}
        except requests.exceptions.Timeout:
            print(f"\n{C.err('Tiempo de espera agotado.')}")
            return "", {}
        except requests.RequestException as e:
            print(f"\n{C.err(f'Error de red: {e}')}")
            return "", {}
        except Exception as e:
            print(f"\n{C.err(f'Error: {e}')}")
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
            print(C.ok("  ── Conversacion limpiada ──"))

        elif command == "/model":
            models = list_models()
            if arg:
                if arg in models:
                    self.model = arg
                    config["model"] = arg
                    save_config()
                    print(C.ok(f"  Modelo cambiado a: {C.bold(self.model)}"))
                else:
                    print(C.err(f"  Modelo '{arg}' no encontrado."))
                    print(C.dim(f"  Disponibles: {', '.join(models)}"))
            else:
                print(C.sys(f"  Modelo actual: {C.bold(self.model)}"))

        elif command == "/system":
            if arg:
                self.system_prompt = arg
                print(C.ok("  System prompt actualizado."))
            else:
                print(C.sys(f"  System prompt: {self.system_prompt[:80]}..."))

        elif command == "/temp":
            try:
                val = float(arg)
                self.temperature = max(0.0, min(2.0, val))
                config["temperature"] = self.temperature
                save_config()
                print(C.ok(f"  Temperature: {self.temperature}"))
            except (ValueError, IndexError):
                print(C.sys(f"  Temperature actual: {self.temperature}"))

        elif command == "/models":
            models = list_models()
            if models:
                print(C.sys("  Modelos instalados:"))
                for m in models:
                    marker = "▸" if m == self.model else " "
                    sz = model_info_str(m)
                    print(f"  {marker} {m:<35} {sz:>10}")
            else:
                print(C.err("  No hay modelos instalados."))

        elif command == "/info":
            ctx = self._ctx_tokens()
            limit = self._ctx_limit()
            pct = min(100, int(ctx / limit * 100)) if limit else 0
            print(C.header("  ── Sesion ──"))
            print(f"  Modelo:         {C.bold(self.model)}")
            print(f"  RAM estimada:   {model_info_str(self.model)}")
            print(f"  Temperature:    {self.temperature}")
            print(f"  Contexto:       {ctx}/{limit} ({pct}%)")
            print(f"  Mensajes:       {len(self.messages)}")
            print(f"  System prompt:  {self.system_prompt[:60]}...")

        elif command == "/tokens":
            ctx = self._ctx_tokens()
            limit = self._ctx_limit()
            pct = min(100, int(ctx / limit * 100)) if limit else 0
            bar_w = 20
            filled = int(bar_w * pct / 100)
            bar = "█" * filled + "░" * (bar_w - filled)
            print(C.sys(f"  Contexto: [{bar}] {ctx}/{limit} ({pct}%)"))
            print(C.dim(f"  Mensajes en contexto: {len(self.messages)}"))

        elif command == "/save":
            name = arg or f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            self._save_session(name)

        elif command == "/load":
            self._load_session(arg)

        else:
            print(C.err(f"  Comando desconocido: {command}"))
            print(C.dim("  /help para comandos disponibles."))

        return True

    def _show_help(self):
        w = min(TERM_WIDTH, 72)
        h = C.header; d = C.dim; b = C.bold; R = C.R
        sys = C.sys
        print()
        print(h(f"  ╔{'═'*(w-4)}╗"))
        print(h(f"  ║  {b('RANDI Chat - Comandos')}{' '*(w-28)}║"))
        print(h(f"  ╠{'═'*(w-4)}╣"))
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
        for cmd_name, desc in cmds:
            pad = w - len(cmd_name) - len(desc) - 8
            print(h(f"  ║  {b(cmd_name):<20}{d(desc):<{w-24}}║"))
        print(h(f"  ╠{'═'*(w-4)}╣"))
        print(d(f"  ║  Tab: autocompletar     Ctrl+C: cancelar     Ctrl+D: salir{' '*(w-46)}║"))
        print(h(f"  ╚{'═'*(w-4)}╝"))
        print()

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
        print(C.ok(f"  Sesion guardada: '{name}' ({len(self.messages)} mensajes)"))
        config["last_session"] = name
        save_config()

    def _load_session(self, name: str):
        if not name:
            if SESSIONS_DIR.exists():
                sessions = sorted(SESSIONS_DIR.glob("*.json"))
                if sessions:
                    print(C.sys("  Sesiones guardadas:"))
                    for s in sessions:
                        d = json.loads(s.read_text())
                        print(f"    - {s.stem} ({d.get('model','?')}, {len(d.get('messages',[]))} msgs)")
                else:
                    print(C.err("  No hay sesiones guardadas."))
            else:
                print(C.err("  No hay sesiones guardadas."))
            return

        filepath = SESSIONS_DIR / f"{name}.json"
        if not filepath.exists():
            print(C.err(f"  Sesion '{name}' no encontrada."))
            return

        try:
            data = json.loads(filepath.read_text())
            self.model = data.get("model", self.model)
            self.temperature = data.get("temperature", self.temperature)
            self.system_prompt = data.get("system_prompt", self.system_prompt)
            self.messages = data.get("messages", [])
            print(C.ok(f"  Sesion '{name}' cargada ({len(self.messages)} mensajes)."))
        except Exception as e:
            print(C.err(f"  Error al cargar sesion: {e}"))

    def run(self):
        signal.signal(signal.SIGINT, self._signal_handler)

        w = min(TERM_WIDTH, 72)
        h = C.header; d = C.dim; b = C.bold
        mi = model_info_str(self.model)
        print()
        print(h(f"  ╔{'═'*(w-4)}╗"))
        print(h(f"  ║  {b('RANDI Chat')}  {mi}  {b(self.model):<{w-28}}║"))
        print(h(f"  ║  {d('/help para comandos, /exit para salir'):<{w-6}}║"))
        print(h(f"  ╚{'═'*(w-4)}╝"))
        print()

        ram_warning(self.model)

        last_session = config.get("last_session", "")
        if last_session:
            sess_path = SESSIONS_DIR / f"{last_session}.json"
            if sess_path.exists():
                print(d(f"  Ultima sesion: '{last_session}'  (/load {last_session} para cargar)"))
                print()

        while True:
            try:
                ctx_str = self._status_bar()
                prompt = f"{C.user('> ')}"
                user_input = input(prompt).strip()
                if not user_input:
                    continue

                readline.add_history(user_input)

                if user_input.startswith("/"):
                    if not self.handle_command(user_input):
                        break
                    continue

                self.add_message("user", user_input)

                ts = datetime.now().strftime("%H:%M:%S")
                print(f"  {C.user('┌─')} {C.label('Tú')} {C.dim(ts)}")
                for line in user_input.split("\n"):
                    print(f"  {C.user('│')} {line}")

                print(f"  {C.asst('└─')} {C.bold('RANDI')} ", end="", flush=True)
                response, stats = self.chat(user_input)
                print()

                if response:
                    self.add_message("assistant", response)

            except EOFError:
                print()
                break
            except KeyboardInterrupt:
                if self.current_request:
                    self.current_request.close()
                    self.current_request = None
                    print(f"\r  {C.dim('[cancelado]')}")
                else:
                    print()
                    break

        self._save_history()
        print(C.dim("\n  Hasta luego!"))

    def _signal_handler(self, sig, frame):
        if self.current_request:
            self.current_request.close()
            self.current_request = None
            print(f"\r  {C.dim('[cancelado]')}")
        else:
            print()

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
            print("Modelos instalados:")
            for m in models:
                sz = model_info_str(m)
                print(f"  - {m:<40} {sz:>10}")
        else:
            print("No hay modelos instalados.")
        sys.exit(0)

    if args.list_sessions:
        if SESSIONS_DIR.exists():
            sessions = sorted(SESSIONS_DIR.glob("*.json"))
            if sessions:
                print("Sesiones guardadas:")
                for s in sessions:
                    d = json.loads(s.read_text())
                    print(f"  - {s.stem} ({d.get('model','?')}, {len(d.get('messages',[]))} msgs)")
            else:
                print("No hay sesiones guardadas.")
        else:
            print("No hay sesiones guardadas.")
        sys.exit(0)

    if not server_running():
        print(C.err(f"Ollama no esta corriendo en {OLLAMA_HOST}"))
        print(C.dim("  Ejecuta: randi serve"))
        sys.exit(1)

    models = list_models()
    if not models:
        print(C.err("No hay modelos instalados."))
        print(C.dim("  Ejecuta: randi pull"))
        sys.exit(1)

    model = args.model or config.get("model") or models[0]

    if model not in models:
        print(C.err(f"Modelo '{model}' no encontrado."))
        print(C.dim(f"  Disponibles: {', '.join(models)}"))
        model = models[0]
        print(C.dim(f"  Usando: {model}"))

    session = ChatSession(model=model, temperature=config.get("temperature", 0.7))
    session.run()

if __name__ == "__main__":
    main()
