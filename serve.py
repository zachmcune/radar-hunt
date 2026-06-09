#!/usr/bin/env python3
"""Serve Radar Hunt on your local network."""

import http.server
import os
import socket
import socketserver
import webbrowser
from pathlib import Path

PORTS = (8080, 3000, 5500, 8888)
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


def bind_server():
    socketserver.TCPServer.allow_reuse_address = True
    errors = []

    for port in PORTS:
        try:
            httpd = socketserver.TCPServer(("0.0.0.0", port), Handler)
            return httpd, port
        except OSError as exc:
            errors.append(f"{port}: {exc}")

    raise OSError("Could not bind a port:\n  " + "\n  ".join(errors))


def main():
    ip = local_ip()
    httpd, port = bind_server()

    print()
    print("  Radar Hunt — local server")
    print("  " + "=" * 32)
    print(f"  This device:   http://localhost:{port}")
    print(f"  Other devices: http://{ip}:{port}")
    print()
    print("  Open the network URL on phones/tablets on the same Wi-Fi.")
    print("  For GPS on mobile, use HTTPS: run .\\share.ps1 or .\\deploy.ps1")
    print("  Press Ctrl+C to stop.", flush=True)
    print(flush=True)

    if os.environ.get("RADAR_HUNT_OPEN_BROWSER", "1") == "1":
        try:
            webbrowser.open(f"http://localhost:{port}")
        except OSError:
            pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.", flush=True)
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
