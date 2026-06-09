#!/usr/bin/env python3
"""Serve Radar Hunt on your local network."""

import http.server
import socket
import socketserver
import webbrowser
from pathlib import Path

PORT = 8080
ROOT = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {args[0]}")


def local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def main():
    ip = local_ip()

    print()
    print("  Radar Hunt — local server")
    print("  " + "=" * 32)
    print(f"  This device:  http://localhost:{PORT}")
    print(f"  Other devices: http://{ip}:{PORT}")
    print()
    print("  Use the network URL on phones/tablets on the same Wi-Fi.")
    print("  Note: GPS needs HTTPS — use Netlify Drop for mobile GPS.")
    print("  Press Ctrl+C to stop.")
    print()

    webbrowser.open(f"http://localhost:{PORT}")

    with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
