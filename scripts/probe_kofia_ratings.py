#!/usr/bin/env python3
"""
금투협 채권정보센터 신용등급 정찰 (임시) — 회사 신용등급을 어느 서비스로 받을 수 있는지 찾는다.

이자율 정찰(docs/rates-plan.md)에서 받아 둔 메뉴에 신용평가정보 화면이 있다.

  신용등급 비교공시  /xml/cdttest/BISRnkAnn.xml      (MBIS01050010000000)
  신용등급 속보      /xml/cdttest/BISCdtRnkHot.xml   (MBIS01050020000000)
  등급별 통계        /xml/cdttest/BISRnkStatis.xml   (MBIS01050030000000)

1단계  화면 정의 XML 과 메타정보를 받아 ProFrame 호출(앱 · 서비스 · 함수)과 조회 조건(DTO 칸)을 뽑는다.
2단계  찾은 호출을 조회 조건을 비운 채 / 기간·회사명을 넣어 불러 보고 응답을 그대로 남긴다.

결과는 .probe/cdt/ 에 저장하고 워크플로우가 브랜치에 커밋한다. 정찰이 끝나면 통째로 지운다.
이 컨테이너에서는 사이트에 닿지 않는다 — GitHub Actions 에서 돌린다.
"""
from __future__ import annotations

import re
import sys
import time
import urllib.request
from pathlib import Path

BASE = "https://www.kofiabond.or.kr"
SVC_URL = BASE + "/proframeWeb/XMLSERVICES/"
DUMP = Path(__file__).resolve().parent.parent / ".probe" / "cdt"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

SCREENS = {
    "MBIS01050010000000": "/xml/cdttest/BISRnkAnn.xml",
    "MBIS01050020000000": "/xml/cdttest/BISCdtRnkHot.xml",
    "MBIS01050030000000": "/xml/cdttest/BISRnkStatis.xml",
}
# 2단계에서 조회 조건 칸에 넣어 볼 값. 칸 이름을 보고 고른다.
FROM_DT, TO_DT = "20260901", "20260930"
COMPANY = "삼성전자"
POLITE_DELAY_SEC = 0.8


def save(name: str, text: str) -> None:
    DUMP.mkdir(parents=True, exist_ok=True)
    (DUMP / name).write_text(text, encoding="utf-8")


def flat(path: str) -> str:
    return path.strip("/").replace("/", "__").replace("?", "_")


def get(path: str) -> str | None:
    url = path if path.startswith("http") else BASE + path
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": BASE + "/"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                raw = r.read()
            for enc in ("utf-8", "euc-kr", "cp949"):
                try:
                    return raw.decode(enc)
                except UnicodeDecodeError:
                    continue
            return raw.decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print(f"  ! GET {path} ({attempt + 1}): {e}")
            time.sleep(2 * (attempt + 1))
    return None


def call(app: str, svc: str, fn: str, dto_xml: str, referer: str) -> str | None:
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
            "Referer": BASE + "/websquare/websquare.html?w2xPath=" + referer,
            "Origin": BASE,
        },
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print(f"  ! {svc}.{fn} ({attempt + 1}): {e}")
            time.sleep(2 * (attempt + 1))
    return None


def calls_in(text: str) -> list[tuple[str, str, str]]:
    """화면 스크립트의 callProFrame("앱", "서비스", "함수", …) 과 메타정보의 objNm(앱^서비스^함수)."""
    found = set(re.findall(r'callProFrame\w*\(\s*["\']([\w-]+)["\']\s*,\s*["\'](\w+)["\']\s*,\s*["\'](\w+)["\']', text))
    for obj in re.findall(r"<objNm>([^<]+)</objNm>", text):
        parts = obj.split("^")
        if len(parts) >= 3:
            found.add((parts[0], parts[1], parts[2]))
    # pfmSvcName 을 문자열로 따로 적어 두는 화면도 있다.
    for svc, fn in re.findall(r'["\'](BIS\w+SO)["\']\s*,\s*["\'](\w+)["\']', text):
        found.add(("BIS-KOFIABOND", svc, fn))
    return sorted(found)


def dto_fields(text: str) -> dict[str, list[str]]:
    """WebSquare dataMap/dataList 정의 — id 와 그 안의 key/column id. 요청 DTO 이름과 칸을 짐작하려고."""
    out: dict[str, list[str]] = {}
    for m in re.finditer(r'<w2:(dataMap|dataList)[^>]*\bid="([^"]+)"(.*?)</w2:\1>', text, re.S):
        keys = re.findall(r'<w2:(?:key|column)[^>]*\bid="([^"]+)"', m.group(3))
        out[m.group(2)] = keys
    for name in set(re.findall(r"<(BIS[A-Za-z0-9]*DTO)\b", text)):
        out.setdefault(name, [])
    return out


def guess_value(field: str) -> str:
    f = field.lower()
    if re.search(r"(start|from|strt|fr|bgn)\w*dt|dt\w*(start|from|fr)", f):
        return FROM_DT
    if re.search(r"(end|to)\w*dt|dt\w*(end|to)", f):
        return TO_DT
    if f.endswith("dt") or "date" in f:
        return TO_DT
    if re.search(r"(nm|name|kor)", f) and re.search(r"(comp|ent|isu|issu|corp|cmp|krn)", f):
        return COMPANY
    return ""


def stage1() -> list[tuple[tuple[str, str, str], str, dict[str, list[str]]]]:
    print("### 1단계 — 화면과 메타정보")
    todo: list[tuple[tuple[str, str, str], str, dict[str, list[str]]]] = []
    seen_paths: set[str] = set()
    for div, path in SCREENS.items():
        meta = call("BIS-COM", "BISComStatisticsLinkSO", "selectMetaInfoAdvanced",
                    f"<BISComMetaDataDTO><divisionId>{div}</divisionId></BISComMetaDataDTO>", path)
        texts: list[tuple[str, str]] = []
        if meta:
            save(f"meta_{div}.xml", meta)
            texts.append((f"meta {div}", meta))
        # 화면 본문과, 화면이 불러 쓰는 하위 화면(탭 · 팝업 · 조건 영역)을 한 겹 더 받는다.
        queue = [path] + sorted(set(re.findall(r"(/xml/[A-Za-z0-9_/\-]+\.xml)", meta or "")))
        while queue:
            p = queue.pop(0)
            if p in seen_paths:
                continue
            seen_paths.add(p)
            text = get(p)
            time.sleep(POLITE_DELAY_SEC)
            if text is None:
                continue
            save("screen__" + flat(p), text)
            texts.append((p, text))
            if p.startswith("/xml/cdttest") or p.startswith("/xml/pop"):
                for sub in re.findall(r"(/?xml/[A-Za-z0-9_/\-]+\.xml)", text):
                    sub = "/" + sub.lstrip("/")
                    if sub not in seen_paths and (sub.startswith("/xml/cdttest") or sub.startswith("/xml/pop")):
                        queue.append(sub)
        for label, text in texts:
            cs = calls_in(text)
            fields = dto_fields(text)
            caption = re.search(r'<w2:caption[^>]*>([^<]*)<', text)
            print(f"\n== {label} ({len(text)} chars) {caption.group(1).strip() if caption else ''}")
            print(f"   호출: {cs}")
            for k, v in fields.items():
                print(f"   데이터 {k}: {v}")
            for c in cs:
                todo.append((c, div if label.startswith("meta") else label, fields))
    return todo


def stage2(todo) -> None:
    print("\n### 2단계 — 찾은 호출을 불러 보기")
    done: set[tuple[str, str, str]] = set()
    for (app, svc, fn), where, fields in todo:
        if (app, svc, fn) in done or app == "BIS-COM":
            continue
        done.add((app, svc, fn))
        referer = SCREENS.get(where, where if where.startswith("/xml") else "/xml/main.xml")
        # 요청 DTO 이름 — 화면 데이터 정의 중 DTO 로 끝나는 것. 없으면 서비스 이름에서 짐작한다.
        dto_names = [k for k in fields if k.endswith("DTO")] or [svc.replace("SrchSO", "DTO").replace("SO", "DTO")]
        for dto in dto_names[:4]:
            # dataMap id 는 'dma_search' 꼴이라 DTO 이름과 다르다. 칸이 없으면 화면의 조회 조건 칸을 모두 넣는다.
            keys = fields.get(dto) or sorted({k for name, ks in fields.items() if not name.endswith("DTO") for k in ks})
            variants = {
                "empty": f"<{dto}></{dto}>",
                "guess": f"<{dto}>" + "".join(f"<{k}>{guess_value(k)}</{k}>" for k in keys) + f"</{dto}>",
            }
            for tag, body in variants.items():
                if tag == "guess" and not keys:
                    continue
                r = call(app, svc, fn, body, referer)
                time.sleep(POLITE_DELAY_SEC)
                if r is None:
                    continue
                name = f"data_{svc}_{fn}_{dto}_{tag}.xml"
                save(name, r)
                rows = len(re.findall(rf"<{dto}>", r))
                print(f"\n-- {app}/{svc}.{fn} {dto} [{tag}] {len(r)} chars, 행 {rows}")
                print("   요청:", body[:400])
                print("   응답 앞부분:", r[:1500].replace("\n", " "))


def dto(name: str, **kv: str) -> str:
    return f"<{name}>" + "".join(f"<{k}>{v}</{k}>" for k, v in kv.items()) + f"</{name}>"


def stage3() -> None:
    """2차 — 회사 찾기 팝업, 회사 한 곳의 비교공시, 평정기간별·발행기간별 전체 목록, 속보."""
    print("\n### 3단계 — 회사 찾기 팝업")
    pop = "/xml/Com/pop/BISRnkAnnIssCompPop.xml"
    text = get(pop)
    if text:
        save("screen__" + flat(pop), text)
        print("호출:", calls_in(text))
        for line in re.findall(r'.*setValue\("BIS[^)]*\).*', text):
            print("  ", line.strip())
        for line in re.findall(r'.*callProFrame\w*\(.*', text):
            print("  ", line.strip())

    ref = "/xml/cdttest/BISRnkAnn.xml"
    C = "BISCdtRnkCmpDTO"
    tries = [
        # 팝업 서비스는 화면을 보고 다시 부른다 — 우선 흔한 이름으로 한 번
        ("BIS-KOFIABOND", "BISIssCompPopSO", "select", dto("BISIssCompPopDTO", issueManNm=COMPANY), "pop_guess"),
        # 회사 한 곳 — 삼성전자 법인등록번호
        ("BIS-KOFIABOND", "BISCdtRnkCmpSrchSO", "selectData",
         dto(C, schData="1301110006246", inquiryStd="1", schField="1", val10="1"), "comp_samsung"),
        # 평정기간별 — 한 달, 한 해
        ("BIS-KOFIABOND", "BISCdtRnkCmpSrchSO", "selectData",
         dto(C, inquiryStd="1", schField="1", standardDt1="20260901", standardDt2="20260930", val10="3"), "pce_month"),
        ("BIS-KOFIABOND", "BISCdtRnkCmpSrchSO", "selectData",
         dto(C, inquiryStd="1", schField="1", standardDt1="20251001", standardDt2="20260930", val10="3"), "pce_year"),
        # 발행기간별 — 한 달
        ("BIS-KOFIABOND", "BISCdtRnkCmpSrchSO", "selectData",
         dto(C, inquiryStd="1", schField="1", standardDt1="20260901", standardDt2="20260930", val10="2"), "trm_month"),
        # 속보 — 한 달, 회사채 탭(1)
        ("BIS-KOFIABOND", "BISCdtRnkHotSrchSO", "select",
         dto("BISCdtRnkHotDTO", schField="1", creditEstCd="", companyNm="", standardDt1="20260901", standardDt2="20260930"),
         "hot_month"),
    ]
    # 팝업 화면에서 찾은 호출을 앞에 끼운다 — 이름이 무엇이든 회사명을 넣어 불러 본다.
    if text:
        names = sorted(set(re.findall(r'setValue\("(BIS\w+DTO)/(\w+)"', text)))
        for app, svc, fn in calls_in(text):
            for dname in sorted({n for n, _ in names}) or ["BISIssCompPopDTO"]:
                kv = {k: COMPANY for n, k in names if n == dname and re.search(r"(?i)nm|name|data", k)}
                tries.insert(0, (app, svc, fn, dto(dname, **kv), f"pop_{fn}_{dname}"))
    print("\n### 4단계 — 불러 보기")
    for app, svc, fn, body, tag in tries:
        r = call(app, svc, fn, body, ref)
        time.sleep(POLITE_DELAY_SEC)
        if r is None:
            continue
        save(f"r2_{tag}.xml", r)
        rows = len(re.findall(r"<BIS\w+DTO>", r))
        print(f"\n-- {tag}: {svc}.{fn} {len(r)} chars, DTO {rows}")
        print("   요청:", body)
        print("   응답 앞부분:", r[:2500].replace("\n", " "))


def stage5() -> None:
    """3차 — 팝업에 processGb, 속보에 schData, 평정기간별은 한 주로 줄여서."""
    print("\n### 5단계")
    ref = "/xml/cdttest/BISRnkAnn.xml"
    C, H = "BISCdtRnkCmpDTO", "BISCdtRnkHotDTO"
    tries = [
        ("BISIssCompPopSrchSO", "listRnkAnnComp", dto("BISIssCompPopDTO", issueManNm=COMPANY, processGb="1"), "pop_samsung"),
        ("BISIssCompPopSrchSO", "listRnkAnnComp", dto("BISIssCompPopDTO", issueManNm="에스케이", processGb="1"), "pop_sk"),
        ("BISCdtRnkHotSrchSO", "select",
         dto(H, schField="1", creditEstCd="", companyNm="", schData="1", standardDt1="20260901", standardDt2="20260930"),
         "hot_month_all"),
        ("BISCdtRnkHotSrchSO", "select",
         dto(H, schField="1", creditEstCd="", companyNm="", schData="2", standardDt1="20260901", standardDt2="20260930"),
         "hot_month_change"),
        ("BISCdtRnkHotSrchSO", "select",
         dto(H, schField="1", creditEstCd="", companyNm="삼성", schData="1", standardDt1="20230101", standardDt2="20261005"),
         "hot_samsung_3y"),
        ("BISCdtRnkCmpSrchSO", "selectData",
         dto(C, inquiryStd="1", schField="1", standardDt1="20260924", standardDt2="20260930", val10="3"), "pce_week"),
    ]
    for svc, fn, body, tag in tries:
        r = None
        for _ in range(3):  # 큰 응답은 중간에 끊기는 일이 잦다
            r = call("BIS-KOFIABOND", svc, fn, body, ref)
            if r:
                break
        time.sleep(POLITE_DELAY_SEC)
        if r is None:
            print(f"\n-- {tag}: 받지 못함")
            continue
        save(f"r3_{tag}.xml", r)
        rows = len(re.findall(r"<BIS\w+DTO>", r))
        total = re.search(r"<dbio_total_count_>(\d+)<", r)
        print(f"\n-- {tag}: {svc}.{fn} {len(r)} chars, DTO {rows}, total {total.group(1) if total else '?'}")
        print("   요청:", body)
        body_start = r.find("<dbio_affected_count_>")
        print("   응답:", r[body_start:body_start + 2500].replace("\n", " "))


def main() -> int:
    stage5()
    print("\n끝.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
