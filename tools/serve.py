"""Local dev server with caching disabled, so edits show up on reload.
Run from the project folder: python3 tools/serve.py   (then open http://localhost:8123)
"""
import http.server, os, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

NoCache.extensions_map[".webmanifest"] = "application/manifest+json"
http.server.ThreadingHTTPServer(("", PORT), NoCache).serve_forever()
