#!/usr/bin/env python3
"""
금투협 채권정보센터(kofiabond) 정찰 — 화면 정의 XML 을 훑어 조회 서비스 이름을 찾는다.

kofiabond 는 WebSquare 로 만든 사이트라 화면마다 `/xml/...xml` 정의 파일이 있고,
그 안에 서버에 보내는 요청(pfmSvcName · pfmFnName · DTO 이름)이 적혀 있다.
이 컨테이너에서는 사이트가 막혀 있어 GitHub Actions 에서 돌려 로그로 본다.
"""
from __future__ import annotations

import re
import sys
import urllib.request
from collections import deque
from pathlib import Path

BASE = "https://www.kofiabond.or.kr"
DUMP = Path(__file__).resolve().parent.parent / ".probe" / "kofia"
UA = "Mozilla/5.0 AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
SEEDS = [
    "/websquare/websquare.html",
    "/index.html",
    "/",
    "/xml/main/main.xml",
    "/xml/Main.xml",
    "/xml/main.xml",
    "/xml/bondint/lastrop/BISLastAskPrcDay.xml",
]
KEYWORDS = ("시가평가", "기준수익률", "매트릭스", "Mtrx", "Matrix", "CompEval", "Eval", "수익률")


def get(path: str) -> str | None:
    url = path if path.startswith("http") else BASE + path
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": BASE + "/"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
            ctype = r.headers.get("Content-Type", "")
    except Exception as e:  # noqa: BLE001
        print(f"  ! {path}: {e}")
        return None
    for enc in ("utf-8", "euc-kr", "cp949"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def main() -> int:
    seen: set[str] = set()
    queue = deque(SEEDS)
    hits = []
    while queue and len(seen) < 600:
        path = queue.popleft()
        if path in seen:
            continue
        seen.add(path)
        text = get(path)
        if text is None:
            continue
        print(f"== {path} ({len(text)} chars)")
        out = DUMP / path.lstrip("/").replace("?", "_")
        if out.name == "" or path.endswith("/"):
            out = out / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        svcs = set(re.findall(r"pfmSvcName[^A-Za-z0-9]{0,40}([A-Za-z0-9_]+)", text))
        fns = set(re.findall(r"pfmFnName[^A-Za-z0-9]{0,40}([A-Za-z0-9_]+)", text))
        dtos = set(re.findall(r"<(BIS[A-Za-z0-9]*DTO)", text))
        if svcs or fns:
            print(f"   svc={sorted(svcs)} fn={sorted(fns)} dto={sorted(dtos)}")
        title = re.search(r"<title>([^<]*)</title>", text)
        if title:
            print(f"   title={title.group(1).strip()}")
        if any(k in text for k in KEYWORDS) and (svcs or fns):
            hits.append((path, sorted(svcs), sorted(fns)))
        for m in re.findall(r"(/xml/[A-Za-z0-9_/\-]+\.xml)", text):
            if m not in seen:
                queue.append(m)
        for m in re.findall(r"w2xPath=([A-Za-z0-9_/\-]+\.xml)", text):
            if m not in seen:
                queue.append(m)
    print("\n### 키워드가 있는 화면")
    for h in hits:
        print(h)
    # 시가평가가 보이는 화면은 본문을 통째로 찍는다 — 요청 양식을 그대로 베끼려고.
    print("\n### 시가평가 관련 화면 원문")
    for path in sorted(seen):
        if re.search(r"(?i)eval|mtrx|matrix|compev|sigap|bondevl", path):
            text = get(path)
            if text:
                print(f"\n----- {path}\n{text[:12000]}")
    # 메뉴와 화면 하나를 원문 그대로 — 요청 양식과 메뉴 경로를 읽으려고.
    for path in ("/xml/main.xml", "/xml/header.xml", "/xml/bondint/lastrop/BISLastAskPrcDay.xml"):
        text = get(path)
        if text:
            print(f"\n----- RAW {path}\n{text}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
