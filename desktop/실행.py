#!/usr/bin/env python3
"""기준서 데스크를 연다. 설치할 것도, 받을 것도 없다.

    python 실행.py

**파이썬 표준 라이브러리만 쓴다.** `pip install` 이 필요 없다 — 설치 권한이 없는
노트북에서도 돌아야 하기 때문이다. 실행파일(.exe)을 못 돌리는 곳이 있어서 이 길을 둔다.

무엇을 하는가 — 옆에 있는 `dist/` 를 **내 컴퓨터 안에서만** 열어 주고 브라우저를 띄운다.
`127.0.0.1` 에만 붙으므로 같은 망의 다른 사람은 열 수 없고, 바깥으로 나가는 것도 없다.
의사록 파일은 브라우저 안에서만 읽힌다 (`docs/minutes-plan.md` 0장 벽 2).

끝낼 때는 이 창에서 Ctrl+C 를 누른다.
"""
from __future__ import annotations

import http.server
import mimetypes
import os
import socket
import socketserver
import sys
import threading
import webbrowser
from pathlib import Path

HOST = "127.0.0.1"          # 바깥에 열지 않는다. 같은 망의 다른 기계는 붙을 수 없다.
PREFERRED_PORT = 7010       # 막혀 있으면 빈 자리를 찾아 쓴다.

# 파이썬이 기본으로 모르는 갈래들. 갈래가 틀리면 브라우저가 파일을 실행하지 않고
# **화면이 하얗게 뜬다** — 무엇이 잘못됐는지 알기 어려운 고장이다.
EXTRA_TYPES = {
    ".wasm": "application/wasm",
    ".mjs": "text/javascript",
    ".js": "text/javascript",
    ".json": "application/json",
    ".bcmap": "application/octet-stream",   # pdf.js 한국어 대응표
    ".traineddata": "application/octet-stream",
    ".gz": "application/gzip",              # OCR 모델. **압축을 풀어 주면 안 된다**
    ".pfb": "application/octet-stream",     # pdf.js 기본 글꼴
    ".ttf": "font/ttf",
}


def dist_dir() -> Path:
    """`dist/` 를 찾는다. 배포본(옆에 둠)과 저장소(한 단계 위) 양쪽을 본다."""
    here = Path(__file__).resolve().parent
    for candidate in (here / "dist", here.parent / "dist"):
        if (candidate / "index.html").is_file():
            return candidate
    print("화면 파일(dist)을 못 찾았다.", file=sys.stderr)
    print(f"  찾아본 곳: {here / 'dist'}", file=sys.stderr)
    print(f"           {here.parent / 'dist'}", file=sys.stderr)
    print("\n받은 폴더를 통째로 풀었는지 확인한다 — `실행.py` 옆에 `dist` 폴더가 있어야 한다.",
          file=sys.stderr)
    raise SystemExit(1)


class Handler(http.server.SimpleHTTPRequestHandler):
    """`dist/` 만 낸다. 폴더 목록은 보이지 않는다."""

    def __init__(self, *args, directory: str, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def guess_type(self, path):  # noqa: A003
        ext = Path(path).suffix.lower()
        if ext in EXTRA_TYPES:
            return EXTRA_TYPES[ext]
        return super().guess_type(path)

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        # 화면 코드는 파일 이름에 지문이 박혀 나오므로 마음껏 캐시해도 되지만,
        # `index.html` 은 갱신했을 때 바로 보여야 한다.
        if self.path in ("/", "/index.html"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 창을 요청 기록으로 채우지 않는다. 오류는 아래에서 따로 알린다.

    def log_error(self, fmt, *args):
        sys.stderr.write("  ! " + (fmt % args) + "\n")


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    """**여러 요청을 동시에 받아야 한다.**

    OCR 은 워커에서 엔진(wasm)과 모델을 받아 오는데, 그동안 화면도 자기 몫을 받는다.
    한 번에 하나씩만 받으면 서로를 기다리다 멈춘다.
    """

    daemon_threads = True
    allow_reuse_address = True


def pick_port() -> int:
    for port in (PREFERRED_PORT, *range(PREFERRED_PORT + 1, PREFERRED_PORT + 20)):
        with socket.socket() as probe:
            try:
                probe.bind((HOST, port))
                return port
            except OSError:
                continue
    with socket.socket() as probe:      # 다 막혔으면 아무 빈 자리나
        probe.bind((HOST, 0))
        return probe.getsockname()[1]


def main() -> int:
    if sys.version_info < (3, 7):
        print("파이썬 3.7 이상이 필요하다. 지금은", sys.version.split()[0], file=sys.stderr)
        return 1

    # 윈도우 콘솔이 한글을 깨뜨리는 경우가 있다.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, OSError):
            pass

    root = dist_dir()
    for ext, kind in EXTRA_TYPES.items():
        mimetypes.add_type(kind, ext)

    port = pick_port()
    url = f"http://{HOST}:{port}/index.html"

    def build(*args, **kwargs):
        return Handler(*args, directory=str(root), **kwargs)

    with Server((HOST, port), build) as httpd:
        print("기준서 데스크")
        print("─" * 52)
        print(f"  주소   {url}")
        print(f"  화면   {root}")
        print("  범위   이 컴퓨터 안에서만 열린다. 바깥으로 나가는 것은 없다.")
        print("─" * 52)
        print("  브라우저가 저절로 안 열리면 위 주소를 복사해서 붙여넣는다.")
        print("  끝낼 때는 이 창에서 Ctrl+C.\n")

        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n닫았다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
