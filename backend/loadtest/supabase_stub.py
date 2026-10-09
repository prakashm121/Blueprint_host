"""
supabase_stub.py — Stands in for Supabase's GET /auth/v1/user during the load test,
so the real app.api.deps.get_current_user code path (token verification, the 60s
cache, JIT user lookup) runs exactly as in production, without a single request
reaching the real Supabase project.

Not imported through bootstrap.py on purpose: it only reads a local JSON file and
needs nothing from `app`. Run standalone:  python -m loadtest.supabase_stub [port]
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
TOKENS_PATH = DATA_DIR / "tokens.json"


class Handler(BaseHTTPRequestHandler):
    tokens: dict = {}

    def log_message(self, fmt, *args):  # quiet: Locust will generate a lot of traffic
        pass

    def do_GET(self):
        if self.path != "/auth/v1/user":
            self.send_response(404)
            self.end_headers()
            return

        auth = self.headers.get("Authorization", "")
        token = auth.split(" ", 1)[1] if auth.lower().startswith("bearer ") else None
        user = self.tokens.get(token) if token else None

        if not user:
            self.send_response(401)
            self.end_headers()
            return

        body = json.dumps(user).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8977
    Handler.tokens = json.loads(TOKENS_PATH.read_text(encoding="utf-8"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"[supabase_stub] serving {len(Handler.tokens)} tokens on 127.0.0.1:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
