#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
WEB_DIR = Path(__file__).parent.resolve()

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
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)

class ProxyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

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
                if "access-control-allow-origin" not in [k.lower() for k in src.headers.keys()]:
                    self.send_header("Access-Control-Allow-Origin", "*")
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
            self.send_header("Access-Control-Allow-Origin", "*")
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
                self.send_header("Access-Control-Allow-Origin", "*")
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
                self.send_header("Access-Control-Allow-Origin", "*")
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

    def do_GET(self):
        if self.path.startswith("/api/tts"):
            self.handle_tts()
        elif self.path.startswith("/api/"):
            self._proxy_request("GET")
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/stt"):
            self.handle_stt()
        elif self.path.startswith("/api/imagegen"):
            self.handle_imagegen()
        elif self.path.startswith("/api/"):
            self._proxy_request("POST")
        else:
            super().do_POST()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self._proxy_request("DELETE")

    def log_message(self, format, *args):
        msg = format % args
        if "/api/" in msg:
            print(f"  {msg}")

def shutdown_server(signum, frame):
    global server_instance
    if server_instance:
        print("\n  Deteniendo servidor...")
        server_instance.shutdown()
    sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description="RANDI Web Server")
    parser.add_argument("--port", type=int, default=8080, help="Puerto inicial")
    args = parser.parse_args()

    port = find_port(args.port)
    if port is None:
        print(f"\033[0;31m◆ No se encontro puerto disponible ({args.port}-8099)\033[0m")
        sys.exit(1)

    server_addr = ("", port)
    global server_instance
    server_instance = HTTPServer(server_addr, ProxyHandler)

    url = f"http://localhost:{port}"
    print(f"\033[0;32m◆ Servidor web RANDI en \033[1m{url}\033[0m")
    print(f"\033[0;2m  Presiona Ctrl+C para detener\033[0m")
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
