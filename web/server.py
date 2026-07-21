#!/data/data/com.termux/files/usr/bin/python3
import argparse
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
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
        subprocess.Popen(
            ["am", "start", "--user", "0", "-a", "android.intent.action.VIEW", "-d", url],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        pass

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
            self.send_response(502)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Ollama no disponible"}).encode())

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._proxy_request("GET")
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
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
