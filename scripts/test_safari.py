"""Run the offline learning flow in the installed macOS Safari."""
import json
import subprocess
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Event, Thread

ROOT = Path(__file__).resolve().parents[1]
PAGE = b"""<!doctype html><meta charset="utf-8"><title>Safari regression test</title>
<style>body{margin:0}iframe{width:100%;height:98vh;border:0}</style>
<iframe title="Python learning platform"></iframe><script src="/scripts/safari_flow.js"></script>"""


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if fmt.startswith("code "):
            super().log_message("%s: " + fmt, self.path, *args)

    def send_error(self, code, message=None, explain=None):
        path = self.path.split("?", 1)[0]
        if code == 404 and path.endswith((".js", ".css", ".wasm", ".zip", ".ttf")):
            self.server.missing_assets.add(path)
        super().send_error(code, message, explain)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self' blob: data:; "
                         "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; "
                         "style-src 'self' 'unsafe-inline'; connect-src 'self' blob: data:")
        super().end_headers()

    def do_GET(self):
        if self.path != "/test":
            return super().do_GET()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(PAGE)

    def do_POST(self):
        if self.path != "/result" or self.headers.get("Origin") != self.server.origin:
            return self.send_error(403)
        message = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        print(message["message"], flush=True)
        self.send_response(204)
        self.end_headers()
        if "success" in message:
            self.server.success = message["success"]
            self.server.finished.set()


def main():
    if sys.platform != "darwin":
        sys.exit("This test requires macOS Safari.")
    with ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=ROOT)) as server:
        server.origin = f"http://127.0.0.1:{server.server_port}"
        server.missing_assets = set()
        server.finished = Event()
        server.success = False
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            subprocess.run(["open", "-a", "Safari", server.origin + "/test"], check=True)
            if not server.finished.wait(600):
                sys.exit("Safari test timed out.")
        finally:
            server.shutdown()
        if server.missing_assets:
            print("Missing assets:", ", ".join(sorted(server.missing_assets)))
            return 1
        return 0 if server.success else 1


if __name__ == "__main__":
    sys.exit(main())
