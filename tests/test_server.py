import http.client
import importlib.util
import socket
import threading
from pathlib import Path

WEB_DIR = Path(__file__).parent.parent / "web"
spec = importlib.util.spec_from_file_location("randi_server", WEB_DIR / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class Fixture:
    def __init__(self, token=""):
        server.RANDI_TOKEN = token
        self.port = free_port()
        self.httpd = server.HTTPServer(("127.0.0.1", self.port), server.ProxyHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request(method, path, body=body, headers=headers or {})
        resp = conn.getresponse()
        data = resp.read()
        conn.close()
        return resp.status, data

    def close(self):
        self.httpd.shutdown()
        server.RANDI_TOKEN = ""


def make(token=""):
    f = Fixture(token)
    return f


def test_index_served():
    f = make()
    status, body = f.request("GET", "/")
    f.close()
    assert status == 200
    assert b"RANDI" in body and b"js/main.js" in body


def test_bad_host_blocked():
    f = make()
    status, _ = f.request("GET", "/", headers={"Host": "evil.com"})
    f.close()
    assert status == 403


def test_bad_origin_blocked():
    f = make()
    status, _ = f.request(
        "POST", "/api/imagegen",
        body=b'{"prompt":"x"}',
        headers={"Origin": "http://evil.com", "Content-Type": "application/json"},
    )
    f.close()
    assert status == 403


def test_options_bad_origin_blocked():
    f = make()
    status, _ = f.request("OPTIONS", "/api/chat", headers={"Origin": "http://evil.com"})
    f.close()
    assert status == 403


def test_delete_non_api_404():
    f = make()
    status, _ = f.request("DELETE", "/foo")
    f.close()
    assert status == 404


def test_health_endpoint():
    f = make()
    status, body = f.request("GET", "/api/health")
    f.close()
    assert status == 200
    assert b"status" in body


def test_proxy_502_when_ollama_down():
    f = make()
    status, _ = f.request("GET", "/api/tags")
    f.close()
    assert status == 502


def test_token_required():
    f = make(token="supersecreto")
    try:
        status, _ = f.request("GET", "/api/health")
        assert status == 403
        status, _ = f.request("GET", "/api/health", headers={"X-RANDI-Token": "malo"})
        assert status == 403
        status, body = f.request("GET", "/api/health", headers={"X-RANDI-Token": "supersecreto"})
        assert status == 200
        assert b"status" in body
    finally:
        f.close()


def test_token_injected_in_index():
    f = make(token="supersecreto")
    try:
        status, body = f.request("GET", "/")
        assert status == 200
        assert b'name="randi-token"' in body
    finally:
        f.close()
