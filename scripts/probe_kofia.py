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
    for _ in range(3):
        text = _get(path)
        if text is not None:
            return text
    return None


def _get(path: str) -> str | None:
    url = path if path.startswith("http") else BASE + path
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": BASE + "/"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
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
        # 대소문자만 다른 경로·디렉터리와 이름이 겹치지 않게 평평하게 저장한다.
        out = DUMP / (path.strip("/").replace("/", "__").replace("?", "_") or "root")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        calls = re.findall(r'callProFrame\w*\(\s*"BIS-KOFIABOND"\s*,\s*"(\w+)"\s*,\s*"(\w+)"', text)
        svcs = {c[0] for c in calls}
        fns = {f"{c[0]}.{c[1]}" for c in calls}
        dtos = set(re.findall(r"<(BIS[A-Za-z0-9]*DTO)", text))
        if svcs or fns:
            print(f"   svc={sorted(svcs)} fn={sorted(fns)} dto={sorted(dtos)}")
        title = re.search(r"<title>([^<]*)</title>", text)
        if title:
            print(f"   title={title.group(1).strip()}")
        if any(k in text for k in KEYWORDS) and (svcs or fns):
            hits.append((path, sorted(svcs), sorted(fns)))
        for m in re.findall(r"(/?xml/[A-Za-z0-9_/\-]+\.xml)", text):
            m = "/" + m.lstrip("/")
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




# ── 2단계: 메뉴 서비스를 불러 시가평가 화면을 찾는다 ──────────────────────────
SVC_URL = BASE + "/proframeWeb/XMLSERVICES/"


def call(app: str, svc: str, fn: str, dto_xml: str) -> str | None:
    body = (
        '<?xml version="1.0" encoding="utf-8"?><message><proframeHeader>'
        f"<pfmAppName>{app}</pfmAppName><pfmSvcName>{svc}</pfmSvcName><pfmFnName>{fn}</pfmFnName>"
        "</proframeHeader><systemHeader></systemHeader>" + dto_xml + "</message>"
    )
    req = urllib.request.Request(
        SVC_URL,
        data=body.encode("utf-8"),
        headers={
            "User-Agent": UA,
            "Content-Type": "application/xml; charset=UTF-8",
            "Referer": BASE + "/websquare/websquare.html?w2xPath=/xml/main.xml",
            "Origin": BASE,
        },
    )
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print(f"  ! {svc}.{fn}: {e}")
    return None


def stage2() -> None:
    print("\n### 시가평가 화면")
    paths = [
        "/xml/Com/Common_TabMnuDsp.xml",
        "/xml/Com/Common_GnrDsp.xml",
        "/xml/bondint/avgrop/BISSrtPrcEstMtrxWhtAvg.xml",
        "/xml/bondint/avgrop/BISTypRemTrmWhtAvg.xml",
    ]
    print(f"메뉴 안 화면 경로 {len(paths)}개")
    for path in paths:
        text = get(path)
        if text is None:
            continue
        out = DUMP / ("screen__" + path.strip("/").replace("/", "__"))
        out.write_text(text, encoding="utf-8")
        calls = sorted(set(re.findall(r'callProFrame\w*\(\s*"([\w-]+)"\s*,\s*"(\w+)"\s*,\s*"(\w+)"', text)))
        title = re.search(r'<w2:caption[^>]*>([^<]*)<', text)
        print(f"{path} | {title.group(1).strip() if title else ''} | {calls}")



def stage3() -> None:
    """채권시가평가수익률(시가평가 메뉴) — 메타정보로 탭별 조회 서비스와 조건 화면을 알아낸다."""
    print("\n### 시가평가 메타정보")
    for div in ("MBIS01070010000000",):
        meta = call("BIS-COM", "BISComStatisticsLinkSO", "selectMetaInfoAdvanced",
                    f"<BISComMetaDataDTO><divisionId>{div}</divisionId></BISComMetaDataDTO>")
        if not meta:
            continue
        (DUMP / f"meta_{div}.xml").write_text(meta, encoding="utf-8")
        print(f"{div}: {len(meta)} chars")
        objs = sorted(set(re.findall(r"<objNm>([^<]+)</objNm>", meta)))
        print("objNm:", objs)
        for path in sorted(set(re.findall(r"(/xml/[A-Za-z0-9_/\-]+\.xml)", meta))):
            text = get(path)
            if text:
                (DUMP / ("meta_screen__" + path.strip("/").replace("/", "__"))).write_text(text, encoding="utf-8")
                print("  화면", path, len(text))
        # 조회 서비스를 기준일 하나로 그대로 불러 본다.
        for obj in objs:
            parts = obj.split("^")
            if len(parts) < 3:
                continue
            for dto in ("<BISComDspDatDTO><val1>20260930</val1></BISComDspDatDTO>",
                        "<BISComDspDatDTO><val1>DD</val1><val2>20260930</val2><val3>20260930</val3></BISComDspDatDTO>"):
                r = call(parts[0], parts[1], parts[2], dto)
                name = f"data_{parts[1]}_{parts[2]}_{len(dto)}.xml"
                if r:
                    (DUMP / name).write_text(r, encoding="utf-8")
                    print("  자료", obj, len(r), r[:300].replace("\n", " "))


if __name__ == "__main__":
    main()
    stage2()
    stage3()
