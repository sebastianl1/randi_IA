#!/usr/bin/env python3
"""RANDI CLI nativo (Python).

Alternativa multiplataforma a bin/randi (bash): funciona en PowerShell de
Windows sin Git Bash/dependencias extra. Requiere solo Python 3 + Ollama.
Mantiene paridad de comandos con el CLI bash (chat, serve, pull, setup,
install, doctor, web, recommend, tier, compare, ...).
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

BIN_DIR = Path(__file__).resolve().parent
LIB_DIRS = [BIN_DIR / "lib",
            Path(os.environ.get("RANDI_DIR", str(Path.home() / ".local" / "share" / "randi"))) / "lib"]
for _d in LIB_DIRS:
    if str(_d) not in sys.path:
        sys.path.insert(0, str(_d))

try:  # modulos del motor (compat/hardware/recommend)
    import compat as randi_compat
    import hardware as randi_hardware
    import recommend as randi_recommend
    HAVE_LIB = True
except Exception:  # pragma: no cover
    HAVE_LIB = False

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
RANDI_VERSION = "2.0.8"
RANDI_REPO = "https://github.com/sebastianl1/randi_IA.git"

B = "\033[1m"; D = "\033[2m"; GRN = "\033[0;32m"; YLW = "\033[1;33m"
BLU = "\033[0;34m"; CY = "\033[0;36m"; RED = "\033[0;31m"; R = "\033[0m"


def info(m): print(f"  {BLU}{B}::{R} {m}")
def ok(m):   print(f"  {GRN}{B}::{R} {m}")
def warn(m): print(f"  {YLW}{B}::{R} {m}")
def err(m):  print(f"  {RED}{B}::{R} {m}")


def detect_platform() -> str:
    if os.path.isdir("/data/data/com.termux"):
        return "termux"
    if os.environ.get("MSYSTEM") or os.environ.get("MINGW_PREFIX"):
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    if os.environ.get("WSL_DISTRO_NAME"):
        return "wsl"
    return "linux"


def server_running() -> bool:
    try:
        urllib.request.urlopen(f"{OLLAMA_HOST}/api/tags", timeout=3)
        return True
    except Exception:
        return False


def py(cmd): return shutil.which(cmd) or ""
def python_exe() -> str:
    for c in ("python3", "python", "py"):
        if py(c):
            return c
    return "python3"


def find_lib(name: str) -> Path | None:
    for d in LIB_DIRS:
        if (d / name).is_file():
            return d / name
    return None


def find_web() -> Path | None:
    cands = [
        BIN_DIR.parent / "web" / "server.py",
        Path(os.environ.get("RANDI_DIR", str(Path.home() / ".local" / "share" / "randi"))) / "web" / "server.py",
    ]
    for c in cands:
        if c.is_file():
            return c
    return None


# ── Comandos ──────────────────────────────────────────────────────────────

def cmd_serve():
    if server_running():
        ok(f"Servidor Ollama ya esta corriendo en {OLLAMA_HOST}")
        return 0
    if not py("ollama"):
        err("Ollama no esta instalado. Ejecuta: 'randi ensure'")
        return 1
    if detect_platform() == "windows":
        info("Ollama corre como servicio de Windows; verificando...")
        for _ in range(10):
            time.sleep(2)
            if server_running():
                ok("Servidor Ollama activo (servicio de Windows)")
                return 0
        err("El servicio Ollama no responde. Inicialo desde la bandeja del sistema.")
        return 1
    info("Iniciando servidor Ollama...")
    subprocess.Popen(["ollama", "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(15):
        time.sleep(1)
        if server_running():
            ok("Servidor Ollama iniciado")
            return 0
    err("No se pudo iniciar el servidor")
    return 1


def cmd_stop():
    if detect_platform() == "windows":
        info("En Windows Ollama es un servicio; detenelo desde la bandeja o:")
        info("  net stop ollama  (o via Administrador de servicios)")
        return 0
    subprocess.call("pkill -f 'ollama serve' 2>/dev/null || true", shell=True)
    ok("Servidor detenido")
    return 0


def _run_tui(args: list) -> int:
    try:
        import randi_tui  # noqa: F401
    except ImportError:
        err("Falta la interfaz randi_tui. Ejecuta: randi ensure  (pip install textual httpx)")
        return 1
    from randi_tui.app import RandiApp

    model = ""
    if args and args[0] in ("chat",):
        args = args[1:]
    if args and not args[0].startswith("-"):
        model = args[0]
    if "-m" in args:
        i = args.index("-m")
        if i + 1 < len(args):
            model = args[i + 1]
    RandiApp(initial_model=model).run()
    return 0


def cmd_run(model: str = ""):
    if not server_running() and cmd_serve() != 0:
        return 1
    if not model:
        lst = _ollama_list()
        if not lst:
            err("No hay modelos instalados. Usa: randi pull")
            return 1
        print("Selecciona un modelo:")
        for i, m in enumerate(lst, 1):
            print(f"  {i}) {m}")
        try:
            sel = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            return 0
        if sel.isdigit() and 0 < int(sel) <= len(lst):
            model = lst[int(sel) - 1]
        elif sel.strip():
            model = sel.strip()
        else:
            return 0
    return subprocess.call(["ollama", "run", model])


def _ollama_list() -> list:
    if not server_running():
        return []
    try:
        with urllib.request.urlopen(f"{OLLAMA_HOST}/api/tags", timeout=3) as r:
            return [m["name"] for m in json.loads(r.read()).get("models", [])]
    except Exception:
        return []


def cmd_list():
    lst = _ollama_list()
    if not lst:
        warn("No hay modelos o servidor no disponible (randi serve)")
        return 0
    print(f"\n{BLU}{B}Modelos instalados:{R}\n" + "-" * 32)
    for m in lst:
        print(f"  {m}")
    return 0


def cmd_ps():
    if not server_running():
        warn("Servidor no disponible")
        return 0
    try:
        with urllib.request.urlopen(f"{OLLAMA_HOST}/api/ps", timeout=3) as r:
            models = json.loads(r.read()).get("models", [])
        print(f"\n{BLU}{B}Modelos en RAM:{R}\n" + "-" * 32)
        if not models:
            print("  (ninguno)")
        for m in models:
            print(f"  {m.get('name')}")
    except Exception:
        warn("No se pudo consultar /api/ps")
    return 0


def cmd_pull(args: list):
    if args:
        for a in args:
            if subprocess.call(["ollama", "pull", a]) != 0:
                return 1
        return 0
    if not server_running() and cmd_serve() != 0:
        return 1
    pull_lib = find_lib("pull.py")
    if not pull_lib:
        err("No se encuentra pull.py")
        return 1
    return subprocess.call([python_exe(), str(pull_lib)])


def cmd_models():
    if not HAVE_LIB:
        err("Modulo catalog no disponible")
        return 1
    cat_lib = find_lib("catalog.py")
    if not cat_lib:
        err("No se encuentra catalog.py")
        return 1
    for sub in ("models", "media"):
        print(f"\n{'=' * 46}\n{sub.upper()}\n{'=' * 46}")
        out = subprocess.run([python_exe(), str(cat_lib), sub], capture_output=True, text=True)
        print(out.stdout or out.stderr)
    return 0


def cmd_doctor():
    print(f"\n{BLU}{B}Diagnostico de RANDI v{RANDI_VERSION}{R}\n" + "-" * 32)
    fail = 0
    if python_exe() and py(python_exe()):
        ver = subprocess.run([python_exe(), "-V"], capture_output=True, text=True)
        ok(f"Python: {ver.stdout.strip() or ver.stderr.strip()}")
    else:
        err("Python no encontrado (randi ensure)"); fail = 1
    if py("ollama"):
        ver = subprocess.run(["ollama", "--version"], capture_output=True, text=True)
        ok(f"Ollama: {ver.stdout.strip().splitlines()[0] or ver.stderr.strip()}")
    else:
        err("Ollama no instalado (randi ensure)"); fail = 1
    if server_running():
        ok(f"Servidor Ollama: activo ({OLLAMA_HOST})")
        n = len(_ollama_list())
        ok(f"Modelos instalados: {n}") if n else warn("No hay modelos instalados (randi pull)")
    else:
        warn("Servidor Ollama: detenido (randi serve)")
    if detect_platform() == "termux" and _is_pkg("ollama-backend-vulkan"):
        ok("Backend Vulkan: instalado (GPU acelerada)")
    elif detect_platform() == "termux":
        warn("Backend Vulkan: no instalado. pkg install ollama-backend-vulkan")
    print()
    ok("Todo en orden.") if not fail else err("Se encontraron problemas: revisa 'randi ensure'")
    return 0 if not fail else 1


def _is_pkg(name: str) -> bool:
    try:
        return name in subprocess.run(["pkg", "list-installed"], capture_output=True, text=True).stdout
    except Exception:
        return False


def cmd_config():
    print("\nConfiguracion RANDI:")
    print("  RANDI_DIR:   ", os.environ.get("RANDI_DIR", str(Path.home() / ".local" / "share" / "randi")))
    print("  OLLAMA_HOST: ", OLLAMA_HOST)
    print("  Version:     ", RANDI_VERSION)
    cfg = Path.home() / ".config" / "randi" / "config.json"
    if cfg.exists():
        print("  Config JSON:")
        print(cfg.read_text(encoding="utf-8"))
    return 0


def cmd_status():
    print(f"\n{BLU}{B}Estado de RANDI:{R}\n" + "-" * 32)
    if server_running():
        ok(f"Servidor Ollama activo en {OLLAMA_HOST}")
        n = len(_ollama_list())
        print(f"  Modelos instalados: {n}")
        cmd_ps()
    else:
        err("Servidor Ollama no disponible")
        warn("Ejecuta: randi serve")
    return 0


def cmd_web(port: str = "8080"):
    server = find_web()
    if not server:
        err("No se encuentra web/server.py (reinstala RANDI)")
        return 1
    info(f"Servidor web RANDI en http://localhost:{port} (Ctrl+C para detener)")
    return subprocess.call([python_exe(), str(server), "--port", port])


def cmd_img(prompt: str):
    if not prompt:
        print("Uso: randi img \"descripcion\"  (requiere A1111 en 127.0.0.1:7860)")
        return 1
    url = "http://127.0.0.1:7860/sdapi/v1/txt2img"
    payload = json.dumps({"prompt": prompt, "steps": 25, "width": 512, "height": 512, "cfg_scale": 7}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    info("Generando imagen...")
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.loads(r.read())
        out_dir = Path(os.environ.get("RANDI_DIR", str(Path.home() / ".local" / "share" / "randi")))
        png = out_dir / "imagen_generada.png"
        import base64
        png.write_bytes(base64.b64decode(data["images"][0]))
        ok(f"Imagen guardada en {png}")
        return 0
    except Exception as e:
        err(f"No se pudo conectar con A1111: {e}")
        return 1


def cmd_update():
    if not py("git"):
        err("'randi update' requiere git. En Windows instala Git o clona manualmente.")
        return 1
    tmp = Path(__file__).parent.parent / ".update-tmp"
    import shutil as _sh
    _sh.rmtree(tmp, ignore_errors=True)
    if subprocess.call(["git", "clone", "--depth", "1", RANDI_REPO, str(tmp)]) != 0:
        err("No se pudo clonar el repositorio")
        _sh.rmtree(tmp, ignore_errors=True)
        return 1
    # copiar scripts a RANDI_DIR
    dest = Path(os.environ.get("RANDI_DIR", str(Path.home() / ".local" / "share" / "randi")))
    _sh.copytree(tmp / "bin" / "lib", dest / "lib", dirs_exist_ok=True)
    _sh.copytree(tmp / "web", dest / "web", dirs_exist_ok=True)
    _sh.rmtree(tmp, ignore_errors=True)
    ok("Actualizacion completada.")
    return 0


def _with_libs():
    if not HAVE_LIB:
        err("Modulos RANDI no disponibles (reinstala)")
        return None
    return randi_hardware.detect_hardware()


def cmd_hardware():
    hw = _with_libs()
    if hw is None:
        return 1
    print(json.dumps(randi_hardware.to_dict(hw), ensure_ascii=False, indent=2))
    return 0


def cmd_recommend(use_case: str = "", limit: int = 5):
    if not HAVE_LIB:
        return 1
    hw = randi_hardware.detect_hardware()
    recs = randi_recommend.rank_models(randi_recommend.get_models(), hw, use_case=use_case or None, limit=limit)
    print()
    for r in recs:
        m, ev = r["model"], r["evaluation"]
        print(f"  [{ev.grade}] {m['id']:<24} {ev.status:<12} q{ev.quant or '-'} tok/s={ev.toks_per_sec or '-'} score={ev.score}")
    return 0


def cmd_tier():
    if not HAVE_LIB:
        return 1
    hw = randi_hardware.detect_hardware()
    tiers = randi_recommend.tier_list(randi_recommend.get_models(), hw)
    for grade in "SABCDF?":
        items = tiers.get(grade, [])
        if not items:
            continue
        print(f"\n[{grade}]")
        for it in items:
            print(f"     {it['model']['id']}")
    return 0


def cmd_compare(a: str, b: str):
    if not HAVE_LIB:
        return 1
    hw = randi_hardware.detect_hardware()
    models = randi_recommend.get_models()
    for target in (a, b):
        model = next((m for m in models if m["id"] == target), None)
        if not model:
            print(f"  Modelo no encontrado: {target}")
            continue
        ev = randi_compat.evaluate_model_best(model, hw)
        print(f"  {model['id']:<26} [{ev.grade}] {ev.status:<12} q{ev.quant} tok/s={ev.toks_per_sec} score={ev.score}")
    return 0


def cmd_install_py(sub: str, args: list):
    lib = find_lib("install.py")
    if not lib:
        err("No se encuentra install.py (reinstala RANDI)")
        return 1
    return subprocess.call([python_exe(), str(lib), sub, *args])


def usage():
    print(f"""{BLU}{B}RANDI v{RANDI_VERSION}{R} - {GRN}Asistente IA local multiplataforma{R}
{D}Creado por Sebastian Laguna{R}
Uso: randi <comando> [opciones]
  randi                Menu interactivo
  randi setup          Onboarding por hardware
  randi install <m>    Descarga y configura un modelo
  randi requirements <m>  Hardware minimo que necesita un modelo
  randi ensure         Verifica/instala dependencias nativas (winget en Windows)
  randi chat [m]       Chat TUI con streaming
  randi run [m]        Ejecuta modelo directo
  randi serve | stop   Inicia/Detiene servidor Ollama
  randi pull [m]       Descarga modelo(s)
  randi list | ps      Modelos instalados / en RAM
  randi models         Catalogo recomendado
  randi status         Estado del sistema
  randi config         Ver configuracion
  randi update         Actualizar RANDI (requiere git)
  randi web [p]        Interfaz web local
  randi img "p"        Generar imagen (A1111/GPU)
  randi doctor         Diagnostico
  randi hardware       Detecta CPU/GPU/RAM
  randi recommend [uc] Mejores modelos para TU equipo
  randi tier | compare a b  Tier list / comparar modelos""")
    return 0


def main(argv: list) -> int:
    if not argv:
        return _run_tui([])
    cmd, rest = argv[0], argv[1:]
    table = {
        "serve": lambda: cmd_serve(),
        "stop": lambda: cmd_stop(),
        "chat": lambda: _run_tui(rest),
        "run": lambda: cmd_run(rest[0] if rest else ""),
        "list": lambda: cmd_list(),
        "ps": lambda: cmd_ps(),
        "pull": lambda: cmd_pull(rest),
        "models": lambda: cmd_models(),
        "status": lambda: cmd_status(),
        "config": lambda: cmd_config(),
        "update": lambda: cmd_update(),
        "web": lambda: cmd_web(rest[0] if rest else "8080"),
        "img": lambda: cmd_img(" ".join(rest)),
        "doctor": lambda: cmd_doctor(),
        "hardware": lambda: cmd_hardware(),
        "recommend": lambda: cmd_recommend(" ".join(rest) if rest else "", 5),
        "tier": lambda: cmd_tier(),
        "compare": lambda: cmd_compare(rest[0] if rest else "", rest[1] if len(rest) > 1 else ""),
        "install": lambda: cmd_install_py("install", rest),
        "setup": lambda: cmd_install_py("setup", rest),
        "requirements": lambda: cmd_install_py("requirements", rest),
        "ensure": lambda: cmd_install_py("ensure", rest),
    }
    if cmd in ("help", "-h", "--help"):
        return usage()
    fn = table.get(cmd)
    if not fn:
        print(f"  Comando desconocido: {cmd}")
        return usage()
    return fn() or 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
