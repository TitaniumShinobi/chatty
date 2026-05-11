import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}

class Handler(BaseHTTPRequestHandler):
    def _set_cors(self):
        origin = self.headers.get("Origin")
        allowed_origin = origin if origin in ALLOWED_ORIGINS else "http://localhost:5173"
        self.send_header("Access-Control-Allow-Origin", allowed_origin)
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header("Access-Control-Allow-Credentials", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors()
        self.end_headers()

    def do_POST(self):
        self.send_response(200)
        self._set_cors()
        self.end_headers()
        self.wfile.write(b'OK')

    def do_GET(self):
        self.send_response(200)
        self._set_cors()
        self.end_headers()
        self.wfile.write(b'OK')

    def log_message(self, fmt, *args):
        return

if __name__ == '__main__':
    class IPv6HTTPServer(HTTPServer):
        address_family = socket.AF_INET6

    servers = []

    ipv4_server = HTTPServer(("127.0.0.1", 7243), Handler)
    servers.append(("127.0.0.1", ipv4_server))

    try:
        ipv6_server = IPv6HTTPServer(("::1", 7243), Handler)
        servers.append(("::1", ipv6_server))
    except OSError:
        pass

    for host, server in servers:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        print(f"Ingest stub running on {host}:7243")

    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        for _, server in servers:
            server.shutdown()
