#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한국채택국제회계기준(K-IFRS) 기준서 HWP(한글 5.0) 파일을
애플리케이션의 기준서 DB 스키마(src/types.ts 의 AccountingStandard[])에
맞는 JSON으로 변환한다.

사용법:
    python3 scripts/parse_kifrs_hwp.py <입력.hwp> -o src/data/standards/1001.json
    python3 scripts/parse_kifrs_hwp.py <입력.hwp> --include-ig   # 실무적용지침(IG)도 별도 기준서로 추가
    python3 scripts/parse_kifrs_hwp.py <입력.hwp> --dump-text out.txt  # 추출 원문 확인용

의존성: olefile (pip install olefile)
"""

from __future__ import annotations

import argparse
import json
import re
import struct
import sys
import zlib
from dataclasses import dataclass, field

try:
    import olefile
except ImportError:  # pragma: no cover
    sys.exit("olefile 이 필요합니다.  pip install olefile")


# ---------------------------------------------------------------------------
# 1. HWP 5.0 본문 텍스트 추출
# ---------------------------------------------------------------------------

HWPTAG_BEGIN = 0x10
HWPTAG_PARA_HEADER = HWPTAG_BEGIN + 50
HWPTAG_PARA_TEXT = HWPTAG_BEGIN + 51

# HWP 본문 문자 코드: 확장(8 wchar) 제어문자와 인라인(1 wchar) 제어문자 구분
EXTENDED_CTRL = {1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23}
INLINE_CTRL = {4, 5, 6, 7, 8, 19, 20}


def extract_hwp_text(path: str) -> str:
    """HWP 5.0 파일의 BodyText 스트림에서 문단 텍스트를 순서대로 추출한다."""
    ole = olefile.OleFileIO(path)
    try:
        header = ole.openstream("FileHeader").read()
        compressed = bool(struct.unpack("<I", header[36:40])[0] & 1)

        sections = sorted(
            ("/".join(s) for s in ole.listdir() if s[0] == "BodyText"),
            key=lambda name: int(re.search(r"(\d+)$", name).group(1)),
        )

        out: list[str] = []
        for name in sections:
            data = ole.openstream(name).read()
            if compressed:
                data = zlib.decompress(data, -15)
            out.extend(_parse_section(data))
        return "".join(out)
    finally:
        ole.close()


def _parse_section(data: bytes) -> list[str]:
    """레코드 스트림을 순회하며 문단 텍스트만 뽑아낸다."""
    chunks: list[str] = []
    i, n = 0, len(data)
    while i + 4 <= n:
        (hdr,) = struct.unpack("<I", data[i : i + 4])
        tag = hdr & 0x3FF
        size = (hdr >> 20) & 0xFFF
        i += 4
        if size == 0xFFF:  # 확장 길이
            (size,) = struct.unpack("<I", data[i : i + 4])
            i += 4
        payload = data[i : i + size]
        i += size

        if tag == HWPTAG_PARA_HEADER:
            chunks.append("\n")
        elif tag == HWPTAG_PARA_TEXT:
            chunks.append(_decode_para_text(payload))
    return chunks


def _decode_para_text(payload: bytes) -> str:
    buf: list[str] = []
    j, m = 0, len(payload) - 1
    while j < m:
        (c,) = struct.unpack("<H", payload[j : j + 2])
        if c == 0:
            j += 2
        elif c in (10, 13):
            buf.append("\n")
            j += 2
        elif c == 9:  # tab
            buf.append("\t")
            j += 16
        elif c in EXTENDED_CTRL:
            j += 16
        elif c in INLINE_CTRL:
            j += 2
        elif c == 24:  # hyphen
            buf.append("-")
            j += 2
        elif c in (30, 31):  # 묶음 빈칸 / 고정폭 빈칸
            buf.append(" ")
            j += 2
        else:
            buf.append(chr(c))
            j += 2
    return "".join(buf)


# ---------------------------------------------------------------------------
# 2. 문서 구조 파싱
# ---------------------------------------------------------------------------

# 문단번호 예시:
#   1 / 8A / 30A / 76ZA / 한2.1 / 한138.6            (제1001호 등 일반 기준서)
#   5.7.5 / 3.2.4 / B3.1.1 / BA.1                    (제1109호처럼 다단계 번호를 쓰는 기준서)
#   IG5A / BC13T / 한BC104.1                          (실무적용지침 · 결론도출근거)
PARA_NO = (
    r"(?:"
    r"한?BC\d+[A-Z]*(?:\.\d+)*"          # BC13T, 한BC104.1
    r"|IG\d+[A-Z]*"                       # IG5A
    r"|한?[A-Z]{0,2}\d+(?:\.\d+)*[A-Z]*"  # 1, 8A, 76ZA, 한2.1, 5.7.5, B3.1.1
    r"|[A-Z]{1,2}\.\d+(?:\.\d+)*"       # BA.1
    r")"
)
PARA_START_RE = re.compile(rf"^({PARA_NO})[ \t]+(?=\S)(.*)$")

# 하위 항목: ⑴ ⒜ ① (1) 가. 등
SUBITEM_RE = re.compile(r"^\s*(?:[⑴-⒇]|[①-⑳]|[㈎-㈜]|[⒜-⒵]|\(\d+\)|\d+\)|[가-힣]\.)\s")

STANDARD_TITLE_RE = re.compile(r"기업회계기준서\s*제(\d{4})호\s*[‘'\"]?([^’'\"\n]+)?")
RESOLUTION_DATE_RE = re.compile(r"의결\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.")

# 본문 종료 지점(제·개정 의결 내역부터는 기준서 본문이 아님)
BODY_END_RE = re.compile(r"제·개정 등에 대한 회계기준위원회의 의결|^결론도출근거$|^적용사례$")

CATEGORY_BY_CODE = {
    "1001": "표시/공시", "1007": "표시/공시", "1008": "표시/공시",
    "1010": "표시/공시", "1024": "표시/공시", "1027": "표시/공시",
    "1033": "표시/공시", "1034": "표시/공시", "1108": "표시/공시",
    "1112": "표시/공시", "1002": "자산/부채", "1016": "자산/부채",
    "1023": "자산/부채", "1036": "자산/부채", "1037": "자산/부채",
    "1038": "자산/부채", "1040": "자산/부채", "1116": "자산/부채",
    "1012": "수익/비용", "1019": "수익/비용", "1020": "수익/비용",
    "1102": "수익/비용", "1115": "수익/비용",
    "1032": "금융상품", "1039": "금융상품", "1107": "금융상품", "1109": "금융상품",
    "1101": "특수회계", "1103": "특수회계", "1104": "특수회계",
    "1105": "특수회계", "1106": "특수회계", "1110": "특수회계",
    "1111": "특수회계", "1113": "특수회계", "1117": "특수회계",
    "1028": "특수회계", "1029": "특수회계", "1041": "특수회계",
}

# 키워드 후보 사전(회계 도메인 용어). 본문에 등장하는 것만 빈도순으로 채택한다.
GLOSSARY = [
    "재무제표", "재무상태표", "포괄손익계산서", "손익계산서", "자본변동표", "현금흐름표",
    "주석", "연결재무제표", "별도재무제표", "중간재무보고", "비교정보", "회계정책",
    "회계추정", "오류수정", "소급적용", "공정가치", "장부금액", "상각후원가",
    "당기손익", "기타포괄손익", "총포괄손익", "재분류조정", "당기순손익",
    "자산", "부채", "자본", "수익", "비용", "이익잉여금", "납입자본", "비지배지분",
    "유동자산", "유동부채", "비유동자산", "비유동부채", "정상영업주기", "결제",
    "계속기업", "발생기준", "중요성", "통합표시", "상계", "보고빈도", "표시의 계속성",
    "공정한 표시", "한국채택국제회계기준", "공시", "인식", "측정", "분류", "표시",
    "재무성과", "재무상태", "현금및현금성자산", "법인세", "영업활동", "중단영업",
    "지배기업", "종속기업", "관계기업", "공동기업", "가상자산", "배당금", "주당이익",
    "추정 불확실성", "판단", "자본유지요건", "풋가능 금융상품", "약정사항",
]


@dataclass
class TocEntry:
    title: str
    rng: str
    level: int = 1
    start: str = ""
    end: str = ""


@dataclass
class Paragraph:
    number: str
    lines: list[str] = field(default_factory=list)
    path: list[str] = field(default_factory=list)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _key(s: str) -> str:
    """제목 대조용 키. 목차와 본문의 띄어쓰기가 달라도 같은 제목으로 인식시킨다."""
    return re.sub(r"\s+", "", s)


def split_document(text: str) -> tuple[list[str], int, int]:
    lines = [ln.rstrip() for ln in text.split("\n")]
    return lines, 0, len(lines)


def parse_toc(lines: list[str]) -> list[TocEntry]:
    """목차 영역(제목 목록 + '문단번호' 이후의 범위 목록)을 짝지어 반환한다."""
    try:
        toc_start = next(i for i, ln in enumerate(lines) if _norm(ln) in ("목 차", "목차"))
    except StopIteration:
        return []
    try:
        num_head = next(
            i for i, ln in enumerate(lines[toc_start:], toc_start) if _norm(ln) == "문단번호"
        )
    except StopIteration:
        return []

    titles: list[str] = []
    for ln in lines[toc_start + 1 : num_head]:
        t = _norm(ln)
        if not t or t == "목 차":
            continue
        if STANDARD_TITLE_RE.search(t) and "‘" in t:  # 목차 상단의 기준서 표제
            continue
        titles.append(t)

    ranges: list[str] = []
    for ln in lines[num_head + 1 :]:
        t = _norm(ln)
        if not t:
            continue
        if re.fullmatch(rf"{PARA_NO}(?:\s*[~∼～-]\s*{PARA_NO})?", t):
            ranges.append(t)
        else:
            break

    entries: list[TocEntry] = []
    for title, rng in zip(titles, ranges):
        parts = re.split(r"\s*[~∼～-]\s*", rng)
        entries.append(TocEntry(title=title, rng=rng, start=parts[0], end=parts[-1]))
    return entries


def assign_levels(entries: list[TocEntry], order: dict[str, int]) -> None:
    """문단번호 등장 순서를 기준으로 목차 항목의 포함관계 → 계층(level)을 계산한다."""

    def span(e: TocEntry) -> tuple[int, int]:
        s = order.get(e.start)
        t = order.get(e.end)
        if s is None:
            s = -1
        if t is None:
            t = s
        return (s, t)

    stack: list[tuple[TocEntry, tuple[int, int]]] = []
    for e in entries:
        sp = span(e)
        while stack:
            parent, psp = stack[-1]
            contained = psp[0] <= sp[0] and sp[1] <= psp[1] and sp != psp
            if contained:
                break
            stack.pop()
        e.level = len(stack) + 1
        stack.append((e, sp))


def parse_body(lines: list[str], toc: list[TocEntry]) -> list[Paragraph]:
    """본문을 순회하며 제목 계층과 문단을 수집한다."""
    headings = {_key(e.title): (e.level, _norm(e.title)) for e in toc}

    # 본문 시작: 목차의 범위 목록이 끝난 뒤 첫 번째 최상위 제목
    try:
        num_head = next(i for i, ln in enumerate(lines) if _norm(ln) == "문단번호")
    except StopIteration:
        num_head = 0

    body_start = num_head
    for i in range(num_head + 1, len(lines)):
        m = PARA_START_RE.match(lines[i].strip())
        # 목차 뒤 첫 문단이 본문 시작. 제1109호처럼 '1' 이 아니라 '1.1' 로
        # 시작하는 기준서도 있으므로 번호를 특정하지 않는다.
        if m:
            body_start = i
            # 문단 1 바로 앞의 제목(예: '목적')부터 읽어야 계층이 유실되지 않는다
            seen = 0
            for j in range(i - 1, max(num_head, i - 15) - 1, -1):
                if not lines[j].strip():
                    continue
                seen += 1
                if _key(lines[j]) in headings:
                    body_start = j
                    break
                if seen >= 6:
                    break
            break

    paragraphs: list[Paragraph] = []
    path: list[str] = []
    current: Paragraph | None = None

    for raw in lines[body_start:]:
        line = raw.strip()
        if not line:
            continue
        if BODY_END_RE.search(line):
            break

        hit = headings.get(_key(line))
        if hit is not None:
            lv, name = hit
            path = path[: lv - 1]
            path.append(name)
            current = None
            continue

        m = PARA_START_RE.match(line)
        if m and not SUBITEM_RE.match(line):
            current = Paragraph(number=m.group(1), lines=[m.group(2).strip()], path=list(path))
            paragraphs.append(current)
            continue

        if current is not None:
            current.lines.append(re.sub(r"\t+", " ", line).strip())

    return paragraphs


# ---------------------------------------------------------------------------
# 3. DB 스키마로 변환
# ---------------------------------------------------------------------------


def make_keywords(content: str, path: list[str], limit: int = 6) -> list[str]:
    scored: list[tuple[int, int, str]] = []
    for term in GLOSSARY:
        cnt = content.count(term)
        if cnt:
            scored.append((cnt, len(term), term))
    scored.sort(key=lambda x: (-x[0], -x[1]))

    picked: list[str] = []
    for _, _, term in scored:
        # 이미 채택한 더 긴 용어에 포함되는 단어는 건너뛴다(예: 자산 vs 유동자산)
        if any(term in p for p in picked):
            continue
        picked.append(term)
        if len(picked) >= limit:
            break

    for title in reversed(path):
        if len(picked) >= limit + 1:
            break
        t = _norm(title)
        if t and t not in picked:
            picked.append(t)
    return picked


def build_standard(text: str, include_ig: bool = False) -> list[dict]:
    lines, _, _ = split_document(text)

    m = None
    for ln in lines[:60]:
        m = STANDARD_TITLE_RE.search(ln)
        if m:
            break
    if not m:
        sys.exit("기준서 번호를 찾지 못했습니다.")
    code_no = m.group(1)

    title = ""
    for ln in lines[:60]:
        t = _norm(ln)
        if t and not STANDARD_TITLE_RE.search(t) and "회계기준원" not in t and "의결" not in t:
            title = t
            break
    quoted = re.search(rf"제{code_no}호\s*[‘']([^’']+)[’']", text)
    if quoted:
        title = _norm(quoted.group(1))

    effective = ""
    dm = RESOLUTION_DATE_RE.search(text[:4000])
    if dm:
        effective = f"{dm.group(1)}.{int(dm.group(2)):02d}.{int(dm.group(3)):02d}"

    toc = parse_toc(lines)

    # 1차 파싱으로 문단 등장 순서를 얻고, 그것으로 목차 계층을 계산한 뒤 재파싱
    first_pass = parse_body(lines, [TocEntry(title=e.title, rng=e.rng) for e in toc])
    order = {p.number: i for i, p in enumerate(first_pass)}
    assign_levels(toc, order)
    paragraphs = parse_body(lines, toc)

    std_id = f"k-ifrs-{code_no}"
    std_code = f"K-IFRS 제{code_no}호"

    def to_dict(p: Paragraph) -> dict:
        content = "\n".join(x for x in p.lines if x).strip()
        path = p.path
        section = path[-2] if len(path) >= 2 else (path[-1] if path else "")
        sub = path[-1] if len(path) >= 2 else ""
        out = {
            "id": f"{code_no}-{p.number}",
            "number": p.number,
            "standardId": std_id,
            "standardCode": std_code,
            "standardTitle": title,
            "content": content,
        }
        if section:
            out["sectionTitle"] = section
        if sub:
            out["subTitle"] = sub
        kw = make_keywords(content, path)
        if kw:
            out["keywords"] = kw
        return out

    body = [to_dict(p) for p in paragraphs if p.lines and "".join(p.lines).strip()]

    standard: dict = {
        "id": std_id,
        "code": std_code,
        "title": title,
        "category": CATEGORY_BY_CODE.get(code_no, "표시/공시"),
    }
    if effective:
        # 회계기준위원회 의결일(해당 개정판을 식별하는 날짜)
        standard["effectiveDate"] = effective
    standard["paragraphs"] = body

    result = [standard]

    if include_ig:
        ig = parse_ig(lines, std_id, std_code, title, code_no)
        if ig["paragraphs"]:
            result.append(ig)
    return result


def parse_ig(lines: list[str], std_id: str, std_code: str, title: str, code_no: str) -> dict:
    """실무적용지침(IG) 문단을 별도 기준서 항목으로 수집한다.

    일부 기준서(예: 제1101호)는 실무적용지침 본문이 문서 안에 두 번 실려 있고,
    그 사이에 대조표 같은 대형 표가 끼어 있다. 이미 나온 IG 번호가 다시 등장하면
    두 번째 사본이 시작된 것으로 보고 수집을 멈춘다. 또한 표가 문단 본문으로
    빨려 들어가지 않도록 이어붙이는 분량에 상한을 둔다.
    """
    # 한 문단이 표를 통째로 삼키는 것을 막는 상한.
    # 정상적인 예시 문단(제1001호 IG6 ≈ 7,800자)은 보존하면서
    # 제1101호 IG206 이 삼킨 4만 자짜리 대조표 같은 경우만 잘라낸다.
    MAX_CONTENT = 15000

    paragraphs: list[dict] = []
    seen: set[str] = set()
    current: dict | None = None
    started = False

    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if re.fullmatch(r"결론도출근거", line):
            break

        m = PARA_START_RE.match(line)
        if m and m.group(1).startswith("IG") and not SUBITEM_RE.match(line):
            number = m.group(1)
            if number in seen:
                break  # 같은 지침이 다시 시작됨 → 중복 사본이므로 여기서 종료
            seen.add(number)
            started = True
            current = {
                "id": f"{code_no}-{number}",
                "number": number,
                "standardId": f"{std_id}-ig",
                "standardCode": std_code,
                "standardTitle": f"{title} (실무적용지침)",
                "sectionTitle": "실무적용지침",
                "content": m.group(2).strip(),
            }
            paragraphs.append(current)
            continue

        if not started or current is None:
            continue
        if len(current["content"]) >= MAX_CONTENT:
            continue
        if len(line) >= 400 or re.fullmatch(r"[\d,.\s()▲△%-]+", line):
            continue  # 표의 숫자 행 등은 본문으로 보지 않는다
        current["content"] += "\n" + re.sub(r"\t+", " ", line).strip()

    for p in paragraphs:
        p["content"] = p["content"].strip()
        kw = make_keywords(p["content"], ["실무적용지침"])
        if kw:
            p["keywords"] = kw

    return {
        "id": f"{std_id}-ig",
        "code": std_code,
        "title": f"{title} (실무적용지침)",
        "category": CATEGORY_BY_CODE.get(code_no, "표시/공시"),
        "paragraphs": paragraphs,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="K-IFRS 기준서 HWP → 기준서 DB JSON 변환기")
    ap.add_argument("hwp", help="입력 HWP 파일 경로")
    ap.add_argument("-o", "--output", help="출력 JSON 경로 (미지정 시 stdout)")
    ap.add_argument("--include-ig", action="store_true", help="실무적용지침(IG)도 별도 기준서로 포함")
    ap.add_argument("--dump-text", help="추출한 원문 텍스트를 저장(디버깅용)")
    args = ap.parse_args()

    text = extract_hwp_text(args.hwp)
    if args.dump_text:
        with open(args.dump_text, "w", encoding="utf-8") as fp:
            fp.write(text)

    data = build_standard(text, include_ig=args.include_ig)
    payload = json.dumps(data, ensure_ascii=False, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as fp:
            fp.write(payload + "\n")
        total = sum(len(s["paragraphs"]) for s in data)
        print(f"{args.output} 저장 완료 — 기준서 {len(data)}건 / 문단 {total}건", file=sys.stderr)
    else:
        print(payload)


if __name__ == "__main__":
    main()
