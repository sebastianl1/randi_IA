#!/usr/bin/env python3
import argparse
import hmac
import html
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

# Motor de compatibilidad RANDI (skills globales, compartido con la CLI)
# Soporta el layout del repo (web/ + bin/lib/) y el instalado
# (~/.local/share/randi: web/ + lib/).
_BIN_LIB = Path(__file__).parent.parent / "bin" / "lib"
if not _BIN_LIB.is_dir():
    _BIN_LIB = Path(os.environ.get(
        "RANDI_DIR", str(Path.home() / ".local" / "share" / "randi"))) / "lib"
if str(_BIN_LIB) not in sys.path:
    sys.path.insert(0, str(_BIN_LIB))
try:
    import hardware as randi_hardware
    import compat as randi_compat
    import recommend as randi_recommend
    import install as randi_install
    _HAS_COMPAT = True
except Exception:  # pragma: no cover - fallback de CI sin bin/lib
    randi_hardware = None
    randi_compat = None
    randi_recommend = None
    randi_install = None
    _HAS_COMPAT = False

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
WEB_DIR = Path(__file__).parent.resolve()
# En produccion se sirve el build de Astro (web/dist); en desarrollo web/.
SERVE_DIR = WEB_DIR / "dist" if (WEB_DIR / "dist").is_dir() else WEB_DIR

# Seguridad: solo se aceptan peticiones dirigidas a hosts locales (anti DNS
# rebinding) y, si se define RANDI_TOKEN, se exige la cabecera X-RANDI-Token.
ALLOWED_HOSTS = {"localhost", "127.0.0.1", "[::1]"}
RANDI_TOKEN = os.environ.get("RANDI_TOKEN", "")

# Trabajos de instalacion en background (progreso consultable por el frontend).
INSTALL_JOBS: dict[str, dict] = {}
server_instance = None

def find_port(start=8080, end=8099):
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.settimeout(0.5)
                s.bind(("", port))
                return port
            except (OSError, PermissionError):
                continue
    return None

def open_browser(url):
    try:
        if sys.platform == "win32":
            os.startfile(url)
            return
        if os.path.isdir("/data/data/com.termux"):
            subprocess.Popen(
                ["am", "start", "--user", "0", "-a", "android.intent.action.VIEW", "-d", url],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return
        if sys.platform == "darwin":
            subprocess.Popen(["open", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        xdg = shutil.which("xdg-open")
        if xdg:
            subprocess.Popen([xdg, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

def _json_response(handler, code, obj):
    body = json.dumps(obj).encode()
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)

class ProxyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SERVE_DIR), **kwargs)

    # --- Seguridad -----------------------------------------------------
    def _host_ok(self):
        host = self.headers.get("Host", "")
        name = host.split(":", 1)[0].strip("[]").lower()
        return name in ALLOWED_HOSTS

    def _origin_ok(self):
        origin = self.headers.get("Origin")
        if not origin:
            return True
        expected = f"http://{self.headers.get('Host', '')}"
        return origin == expected

    def _token_ok(self):
        if not RANDI_TOKEN:
            return True
        provided = self.headers.get("X-RANDI-Token", "") or ""
        return hmac.compare_digest(provided, RANDI_TOKEN)

    def _gate(self, api=False):
        # Todo: Host valido (anti DNS rebinding).
        # Solo /api/*: Origin (CSRF) y token opcional (RANDI_TOKEN).
        if not self._host_ok():
            return False
        if api and (not self._origin_ok() or not self._token_ok()):
            return False
        return True

    def _serve_index_with_token(self):
        try:
            html_src = (SERVE_DIR / "index.html").read_text(encoding="utf-8")
        except (OSError, FileNotFoundError):
            super().do_GET()
            return
        tag = f'<meta name="randi-token" content="{html.escape(RANDI_TOKEN)}">'
        if "name=\"randi-token\"" not in html_src:
            html_src = html_src.replace("</head>", f"  {tag}\n</head>")
        body = html_src.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _proxy_request(self, method):
        path = self.path
        target_url = f"{OLLAMA_HOST}{path}"
        try:
            body = None
            content_len = self.headers.get("Content-Length")
            if content_len:
                body = self.rfile.read(int(content_len))

            req = urllib.request.Request(target_url, data=body, method=method)
            for key, val in self.headers.items():
                if key.lower() not in ("host", "content-length", "transfer-encoding"):
                    req.add_header(key, val)

            with urllib.request.urlopen(req, timeout=300) as src:
                self.send_response(src.status)
                for key, val in src.headers.items():
                    if key.lower() not in ("transfer-encoding", "content-encoding", "content-length"):
                        self.send_header(key, val)
                self.end_headers()

                content_type = src.headers.get("Content-Type", "")
                is_stream = content_type.startswith("application/x-ndjson") or self.path == "/api/chat"
                if is_stream:
                    while True:
                        line = src.readline()
                        if not line:
                            break
                        try:
                            self.wfile.write(line)
                            self.wfile.flush()
                        except (BrokenPipeError, ConnectionResetError):
                            break
                else:
                    shutil.copyfileobj(src, self.wfile)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except urllib.error.URLError:
            _json_response(self, 502, {"error": "Ollama no disponible"})

    def handle_tts(self):
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        text = (qs.get("text", [""])[0] or "")[:500]
        if not text:
            _json_response(self, 400, {"error": "text requerido"})
            return
        engine = shutil.which("espeak-ng") or shutil.which("espeak")
        if engine:
            try:
                out = subprocess.run([engine, "-v", "es", "--stdout", text],
                                     capture_output=True, timeout=60).stdout
                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)
                return
            except Exception as e:
                _json_response(self, 500, {"error": str(e)})
                return
        if shutil.which("piper"):
            try:
                p = subprocess.Popen(["piper", "--output_raw"], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                out, _ = p.communicate(text.encode(), timeout=60)
                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)
                return
            except Exception:
                pass
        _json_response(self, 501, {"error": "TTS no disponible. Instala espeak-ng (pkg install espeak-ng)"})

    def handle_stt(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            length = 0
        audio = self.rfile.read(length) if length else b""
        whisper = shutil.which("whisper-cli") or shutil.which("whisper")
        if not whisper:
            _json_response(self, 501, {"error": "Whisper no instalado (whisper.cpp). Build manual requerido."})
            return
        model = None
        randi_dir = os.environ.get("RANDI_DIR", str(Path.home() / ".local" / "share" / "randi"))
        for d in (Path(randi_dir) / "models", Path.home() / ".whisper", Path.home() / "models"):
            if d.is_dir():
                for m in sorted(d.glob("ggml-*.bin")):
                    model = str(m)
                    break
            if model:
                break
        if not model:
            _json_response(self, 501, {"error": "Modelo ggml de whisper no encontrado en ~/.whisper"})
            return
        tmp = tempfile.NamedTemporaryFile(suffix=".webm", delete=False)
        tmp.write(audio)
        tmp.close()
        outdir = tempfile.mkdtemp()
        base = os.path.join(outdir, "out")
        try:
            subprocess.run([whisper, "-m", model, "-f", tmp.name, "-oj", "-of", base, "--no-prints"],
                           capture_output=True, timeout=300)
            js = json.load(open(base + ".json"))
            text = " ".join(seg.get("text", "") for seg in js.get("transcription", [])).strip()
            if text:
                _json_response(self, 200, {"text": text})
            else:
                _json_response(self, 422, {"error": "No se pudo transcribir el audio"})
        except Exception as e:
            _json_response(self, 500, {"error": str(e)})
        finally:
            try:
                os.unlink(tmp.name)
                shutil.rmtree(outdir, ignore_errors=True)
            except Exception:
                pass

    def handle_imagegen(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
        except Exception:
            _json_response(self, 400, {"error": "body JSON requerido"})
            return
        prompt = (body.get("prompt") or "").strip()
        engine = body.get("engine", "a1111")
        if not prompt:
            _json_response(self, 400, {"error": "prompt requerido"})
            return
        if engine == "a1111":
            url = "http://127.0.0.1:7860/sdapi/v1/txt2img"
            payload = {"prompt": prompt, "steps": 25, "width": 512, "height": 512, "cfg_scale": 7}
            try:
                req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                             headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=300) as r:
                    data = json.load(r)
                image = data.get("images", [""])[0]
                if image:
                    _json_response(self, 200, {"image": image})
                else:
                    _json_response(self, 502, {"error": "A1111 no devolvio imagen"})
            except Exception:
                _json_response(self, 502, {"error": "No se pudo conectar con A1111 en 127.0.0.1:7860. Inicia el WebUI."})
        elif engine == "comfyui":
            _json_response(self, 501, {"error": "ComfyUI requiere un workflow JSON. Usa el motor A1111 (Automatic1111)."})
        else:
            _json_response(self, 400, {"error": "engine desconocido"})

    def _read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not length:
                return {}
            return json.loads(self.rfile.read(length)) if length else {}
        except Exception:
            return None

    def _hardware_from_body(self, body):
        """Convierte el perfil hardware del cliente (JSON) en HardwareInfo."""
        if not _HAS_COMPAT:
            return randi_hardware.detect_hardware() if randi_hardware else None
        hw_data = body.get("hardware") if isinstance(body, dict) else None
        if not hw_data or not isinstance(hw_data, dict):
            return randi_hardware.detect_hardware()
        return randi_hardware.hardware_from_dict(hw_data)

    def handle_api_hardware(self):
        if not _HAS_COMPAT:
            _json_response(self, 501, {"error": "modulo de hardware no disponible"})
            return
        hw = randi_hardware.detect_hardware()
        body = randi_hardware.to_dict(hw)
        body["profile"] = randi_hardware.hardware_profile(hw)
        _json_response(self, 200, body)

    def handle_api_models(self):
        if not _HAS_COMPAT:
            _json_response(self, 501, {"error": "modulo de compat no disponible"})
            return
        try:
            data = randi_recommend.load_catalog()
        except Exception:
            _json_response(self, 500, {"error": "no se pudo cargar models.json"})
            return
        models = randi_recommend.get_models(data)
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        provider = (qs.get("provider") or [None])[0]
        use_case = (qs.get("useCase") or [None])[0]
        category = (qs.get("category") or [None])[0]
        if qs.get("media") and (qs["media"][0].lower() in ("1", "true")):
            models = models + data.get("media", [])
        if category:
            models = [m for m in models if m.get("category") == category]
        if provider:
            models = [m for m in models if m.get("provider") == provider]
        if use_case:
            models = [m for m in models if randi_recommend.model_matches_use_case(m, use_case)]
        _json_response(self, 200, {"models": models})

    def handle_api_model_detail(self, model_id):
        if not _HAS_COMPAT:
            _json_response(self, 501, {"error": "modulo de compat no disponible"})
            return
        try:
            data = randi_recommend.load_catalog()
        except Exception:
            _json_response(self, 500, {"error": "no se pudo cargar models.json"})
            return
        model = None
        for m in randi_recommend.get_models(data):
            if m.get("id") == model_id or model_id in m.get("id", ""):
                model = m
                break
        if not model:
            _json_response(self, 404, {"error": f"modelo no encontrado: {model_id}"})
            return
        quants = randi_compat.make_quants(float(model.get("paramsBillions", 0) or 0))
        _json_response(self, 200, {"model": model, "quants": quants})

    def handle_api_compatibility(self):
        if not _HAS_COMPAT:
            _json_response(self, 501, {"error": "modulo de compat no disponible"})
            return
        body = self._read_json_body()
        if body is None:
            _json_response(self, 400, {"error": "body JSON invalido"})
            return
        if not body.get("modelId"):
            _json_response(self, 400, {"error": "modelId requerido"})
            return
        hw = self._hardware_from_body(body)
        try:
            data = randi_recommend.load_catalog()
        except Exception:
            _json_response(self, 500, {"error": "no se pudo cargar models.json"})
            return
        model = next((m for m in randi_recommend.get_models(data)
                      if m.get("id") == body["modelId"]), None)
        if not model:
            _json_response(self, 404, {"error": "modelo no encontrado"})
            return
        quant_name = body.get("quantization")
        quants = randi_compat.make_quants(float(model.get("paramsBillions", 0) or 0))
        quant = next((q for q in quants if q["name"] == quant_name), None)
        if quant_name and not quant:
            _json_response(self, 400, {"error": f"quant invalida: {quant_name}"})
            return
        if quant:
            ev = randi_compat.evaluate_quant(model, quant, hw)
        else:
            ev = randi_compat.evaluate_model_best(model, hw)
        _json_response(self, 200, {
            "modelId": model.get("id"),
            "grade": ev.grade,
            "score": ev.score,
            "status": ev.status,
            "quantization": ev.quant,
            "recommendedQuantization": ev.quant,
            "estimated": {
                "tokensPerSecond": ev.toks_per_sec,
                "vramRequiredGb": quant["vramGB"] if quant else None,
                "memoryHeadroomGb": None,
                "memoryPercent": ev.mem_pct,
            },
            "notes": [f"Modelo {model.get('name')} ({model.get('paramsBillions')}B)"],
        })

    def handle_api_recommend(self):
        if not _HAS_COMPAT:
            _json_response(self, 501, {"error": "modulo de compat no disponible"})
            return
        body = self._read_json_body()
        if body is None:
            _json_response(self, 400, {"error": "body JSON invalido"})
            return
        hw = self._hardware_from_body(body)
        use_case = body.get("useCase")
        limit = body.get("limit", 5)
        try:
            limit = max(1, min(int(limit), 25))
        except (TypeError, ValueError):
            limit = 5
        try:
            data = randi_recommend.load_catalog()
        except Exception:
            _json_response(self, 500, {"error": "no se pudo cargar models.json"})
            return
        recs = randi_recommend.rank_models(
            randi_recommend.get_models(data), hw,
            use_case=use_case, limit=limit,
        )
        out = []
        for r in recs:
            m, ev = r["model"], r["evaluation"]
            out.append({
                "modelId": m.get("id"),
                "name": m.get("name"),
                "params": m.get("paramsBillions"),
                "grade": ev.grade,
                "score": ev.score,
                "status": ev.status,
                "quantization": ev.quant,
                "tokensPerSecond": ev.toks_per_sec,
                "useCase": m.get("useCase", []),
                "size": m.get("size"),
            })
        _json_response(self, 200, {"hardware": randi_hardware.to_dict(hw), "recommendations": out})

    def handle_api_requirements(self):
        if not _HAS_COMPAT:
            _json_response(self, 501, {"error": "modulo de compat no disponible"})
            return
        body = self._read_json_body()
        if body is None:
            _json_response(self, 400, {"error": "body JSON invalido"})
            return
        try:
            data = randi_recommend.load_catalog()
        except Exception:
            _json_response(self, 500, {"error": "no se pudo cargar models.json"})
            return
        model = next((m for m in (data.get("ollama", []) + data.get("media", []))
                      if m.get("id") == body.get("modelId") or m.get("ollamaId") == body.get("modelId")), None)
        if not model:
            _json_response(self, 404, {"error": "modelo no encontrado"})
            return
        req = randi_compat.required_hardware(model)
        _json_response(self, 200, {"modelId": model.get("ollamaId") or model["id"],
                                    "name": model.get("name"), "installer": model.get("installer", "ollama"),
                                    **req})

    def handle_api_setup(self):
        """Onboarding: analiza el hardware y devuelve recomendaciones por categoria."""
        if not _HAS_COMPAT:
            _json_response(self, 501, {"error": "modulos RANDI no disponibles"})
            return
        hw = randi_hardware.detect_hardware()
        try:
            data = randi_recommend.load_catalog()
        except Exception:
            _json_response(self, 500, {"error": "no se pudo cargar models.json"})
            return
        models = data.get("ollama", [])
        profile = randi_hardware.hardware_profile(hw)
        categories = {"llm": [], "image": [], "video": []}
        for m in models:
            categories.setdefault(m.get("category", "llm"), []).append(m["id"])
        for m in data.get("media", []):
            categories.setdefault(m.get("category", "image"), []).append(m["id"])
        out = {}
        for use_case in ("chat", "code", "reasoning", "vision"):
            recs = randi_recommend.rank_models(models, hw, use_case=use_case, limit=4)
            out[use_case] = [{
                "modelId": r["model"].get("ollamaId") or r["model"]["id"],
                "name": r["model"].get("name"),
                "params": r["model"].get("paramsBillions"),
                "grade": r["evaluation"].grade,
                "status": r["evaluation"].status,
                "quantization": r["evaluation"].quant,
                "tokensPerSecond": r["evaluation"].toks_per_sec,
            } for r in recs]
        _json_response(self, 200, {
            "hardware": {**randi_hardware.to_dict(hw), "profile": profile},
            "categories": categories,
            "recommendations": out,
            "installed": self._installed_models(),
        })

    def _installed_models(self):
        try:
            with urllib.request.urlopen(f"{OLLAMA_HOST}/api/tags", timeout=3) as r:
                data = json.loads(r.read())
            return [m["name"] for m in data.get("models", [])]
        except Exception:
            return []

    def handle_api_install(self):
        if not _HAS_COMPAT:
            _json_response(self, 501, {"error": "modulos RANDI no disponibles"})
            return
        body = self._read_json_body()
        if body is None:
            _json_response(self, 400, {"error": "body JSON invalido"})
            return
        model_id = body.get("modelId")
        if not model_id:
            _json_response(self, 400, {"error": "modelId requerido"})
            return
        try:
            data = randi_recommend.load_catalog()
        except Exception:
            _json_response(self, 500, {"error": "no se pudo cargar models.json"})
            return
        model = next((m for m in (data.get("ollama", []) + data.get("media", []))
                      if m.get("id") == model_id or m.get("ollamaId") == model_id), None)
        if not model:
            _json_response(self, 404, {"error": f"modelo no encontrado: {model_id}"})
            return
        installer = model.get("installer", "ollama")
        if installer != "ollama":
            _json_response(self, 400, {
                "error": f"Este modelo usa '{installer}'. No se instala via Ollama.",
                "installer": installer, "guide": model.get("url", ""),
            })
            return
        if not randi_install or not randi_install.server_running():
            _json_response(self, 502, {"error": "Ollama no responde. Ejecuta: randi serve"})
            return
        job_id = f"{int(time.time() * 1000)}"
        target = model.get("ollamaId") or model["id"]
        INSTALL_JOBS[job_id] = {"status": "running", "phase": "starting", "modelId": model_id,
                                 "target": target, "detail": "", "done": False}
        threading.Thread(target=self._install_worker, args=(job_id, target, model),
                         daemon=True).start()
        _json_response(self, 200, {"jobId": job_id, "modelId": model_id, "target": target})

    def handle_api_install_status(self):
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        job_id = (qs.get("id") or [""])[0]
        job = INSTALL_JOBS.get(job_id)
        if not job:
            _json_response(self, 404, {"error": "job no encontrado"})
            return
        _json_response(self, 200, job)

    def _install_worker(self, job_id, target, model):
        try:
            INSTALL_JOBS[job_id].update(phase="pulling", detail=f"Descargando {target} (puede tardar)...")
            rc = subprocess.call(["ollama", "pull", target])
            if rc != 0:
                INSTALL_JOBS[job_id].update(status="error", phase="pulling",
                                             detail=f"Fallo la descarga de {target}.",
                                             done=True)
                return
            INSTALL_JOBS[job_id].update(phase="configuring", detail="Configurando modelo por defecto...")
            randi_install.configure_model(model)
            INSTALL_JOBS[job_id].update(status="done", phase="done",
                                         detail=f"{target} instalado y configurado. Usa 'randi chat'.",
                                         done=True)
        except Exception as e:  # pragma: no cover
            INSTALL_JOBS[job_id].update(status="error", phase="error",
                                         detail=str(e), done=True)

    def do_GET(self):
        api = self.path.startswith("/api/")
        if not self._gate(api):
            _json_response(self, 403, {"error": "Acceso denegado"})
            return
        if self.path.startswith("/api/tts"):
            self.handle_tts()
        elif self.path == "/api/health":
            _json_response(self, 200, {"status": "ok", "ollama": self._proxy_health()})
        elif self.path == "/api/hardware":
            self.handle_api_hardware()
        elif self.path == "/api/setup":
            self.handle_api_setup()
        elif self.path.startswith("/api/install/status"):
            self.handle_api_install_status()
        elif self.path.split("?", 1)[0] == "/api/models":
            self.handle_api_models()
        elif self.path.startswith("/api/models/"):
            model_id = urllib.parse.unquote(self.path[len("/api/models/"):])
            self.handle_api_model_detail(model_id)
        elif self.path == "/api/compatibility":
            _json_response(self, 405, {"error": "usa POST /api/compatibility"})
        elif self.path == "/api/recommend":
            _json_response(self, 405, {"error": "usa POST /api/recommend"})
        elif self.path.startswith("/api/"):
            self._proxy_request("GET")
        elif RANDI_TOKEN and self.path in ("/", "/index.html"):
            self._serve_index_with_token()
        else:
            super().do_GET()

    def _proxy_health(self):
        try:
            with urllib.request.urlopen(f"{OLLAMA_HOST}/api/tags", timeout=3) as r:
                return r.status == 200
        except Exception:
            return False

    def do_POST(self):
        if not self._gate(api=True):
            _json_response(self, 403, {"error": "Acceso denegado"})
            return
        if self.path.startswith("/api/stt"):
            self.handle_stt()
        elif self.path.startswith("/api/imagegen"):
            self.handle_imagegen()
        elif self.path == "/api/compatibility":
            self.handle_api_compatibility()
        elif self.path == "/api/recommend":
            self.handle_api_recommend()
        elif self.path == "/api/requirements":
            self.handle_api_requirements()
        elif self.path == "/api/install":
            self.handle_api_install()
        elif self.path.startswith("/api/"):
            self._proxy_request("POST")
        else:
            super().do_POST()

    def do_OPTIONS(self):
        if not self._gate(api=True):
            _json_response(self, 403, {"error": "Acceso denegado"})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-RANDI-Token")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_DELETE(self):
        if not self._gate(api=True):
            _json_response(self, 403, {"error": "Acceso denegado"})
            return
        if self.path.startswith("/api/"):
            self._proxy_request("DELETE")
        else:
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()

    def log_message(self, format, *args):
        msg = format % args
        if "/api/" in msg:
            print(f"  {msg}")

def shutdown_server(signum, frame):
    # No llamar a server_instance.shutdown() desde el handler: bloquea
    # esperando a serve_forever y causa deadlock. Con sys.exit basta
    # (el kernel cierra los sockets).
    print("\n  Deteniendo servidor...")
    sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description="RANDI Web Server")
    parser.add_argument("--port", type=int, default=8080, help="Puerto inicial")
    args = parser.parse_args()

    port = find_port(args.port)
    if port is None:
        print(f"\033[0;31m◆ No se encontro puerto disponible ({args.port}-8099)\033[0m")
        sys.exit(1)

    server_addr = ("127.0.0.1", port)
    global server_instance
    server_instance = HTTPServer(server_addr, ProxyHandler)

    url = f"http://localhost:{port}"
    print(f"\033[0;32m◆ Servidor web RANDI en \033[1m{url}\033[0m")
    print("\033[0;2m  Presiona Ctrl+C para detener\033[0m")
    print()

    open_browser(url)

    signal.signal(signal.SIGINT, shutdown_server)
    signal.signal(signal.SIGTERM, shutdown_server)

    try:
        server_instance.serve_forever()
    except KeyboardInterrupt:
        shutdown_server(None, None)

if __name__ == "__main__":
    main()
