#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한국채택국제회계기준(K-IFRS) 기준서 HWP(한글 5.0) 파일을
애플리케이션의 기준서 DB 스키마(src/types.ts 의 AccountingStandard[])에
맞는 JSON으로 변환한다.

사용법:
    python3 scripts/parse_kifrs_hwp.py <입력.hwp> -o src/data/standards/1001.json
    python3 scripts/parse_kifrs_hwp.py <입력.hwp> --include-ig   # 실무적용지침(IG)도 같은 기준서의 문단으로 추가
    python3 scripts/parse_kifrs_hwp.py <입력.hwp> --dump-text out.txt  # 추출 원문 확인용

의존성: olefile (pip install olefile)
"""

from __future__ import annotations

import argparse
import glob
import json
import os
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

# 부록 표제(예: '부록 A. 용어의 정의'). 목차의 문단번호 범위와 짝이 맞지 않아
# 목차 기반 제목 목록에서 빠지는 경우가 있어 본문에서 직접 최상위 제목으로 잡는다.
APPENDIX_RE = re.compile(r"^부\s*록\s*[A-Z]\b")

# 본문의 첫 문단으로 인정할 번호: 1 / 1A / 1.1 / 한1.1 / B1 ...
FIRST_PARA_RE = re.compile(r"한?[A-Z]{0,2}1(?:\.\d+)*[A-Z]*")

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


RANGE_ONLY_RE = re.compile(rf"^\s*{PARA_NO}(?:\s*[~∼～-]\s*{PARA_NO})?\s*$")

# '용어의 정의<TAB>4~8A' 처럼 제목과 문단범위가 한 줄에 있는 목차 형식
INLINE_TOC_RE = re.compile(
    rf"^(?P<title>\S.*?)[ \t]+(?P<rng>{PARA_NO}(?:\s*[~∼～-]\s*{PARA_NO})?)\s*$"
)

# 목차가 끝났다고 볼 수 있는 표제들
TOC_END_RE = re.compile(r"^(?:결론도출근거|적용사례|소수의견|문단비교표)$")


def parse_toc(lines: list[str]) -> list[TocEntry]:
    """목차에서 (제목, 문단범위) 쌍을 뽑는다.

    기준서마다 목차 조판이 다르다.
      (a) '제목<TAB>문단범위' 가 한 줄에 있는 형식 (제1027·1033호 등)
      (b) 제목 목록이 먼저 나오고 '문단번호' 뒤에 범위 목록이 따로 오는 형식 (제1001호 등)
    (a) 가 짝을 잘못 맞출 여지가 없으므로 우선 시도하고, 없으면 (b) 로 넘어간다.
    """
    # 목차 표제는 '목  차' 일 때도 있고 표 머리글과 붙어 '내   용목  차' 일 때도 있다.
    toc_start = None
    for i, ln in enumerate(lines[:400]):
        if _key(ln).endswith("목차"):
            toc_start = i
            break
    if toc_start is None:
        return []

    # 목차 영역의 끝. 표제(결론도출근거 등)로 끊기지 않는 문서도 있으므로
    # 본문 첫 문단이 시작되는 지점을 상한으로 함께 둔다. 이 경계가 없으면
    # 뒤쪽 결론도출근거의 'IAS 7' 같은 줄을 목차 항목으로 오인한다.
    toc_end = len(lines)
    for i in range(toc_start + 1, min(len(lines), toc_start + 400)):
        if TOC_END_RE.match(_norm(lines[i])):
            toc_end = i
            break
    for i in range(toc_start + 1, len(lines)):
        m = PARA_START_RE.match(lines[i].strip())
        if m and FIRST_PARA_RE.fullmatch(m.group(1)):
            toc_end = min(toc_end, i)
            break

    # (a) 한 줄 형식
    inline: list[tuple[str, str]] = []
    seen_titles: set[str] = set()
    for ln in lines[toc_start + 1 : toc_end]:
        t = _norm(ln)
        if not t or RANGE_ONLY_RE.match(t):
            continue
        m = INLINE_TOC_RE.match(t)
        if not m:
            continue
        title = _norm(m.group("title"))
        if not title or _key(title) in seen_titles:
            continue
        seen_titles.add(_key(title))
        inline.append((title, _norm(m.group("rng"))))

    if len(inline) >= 3:
        return [_make_entry(title, rng) for title, rng in inline]

    # (b) 분리 형식
    try:
        num_head = next(
            i for i, ln in enumerate(lines[toc_start:], toc_start) if _key(ln) == "문단번호"
        )
    except StopIteration:
        return []

    titles: list[str] = []
    for ln in lines[toc_start + 1 : num_head]:
        t = _norm(ln)
        if not t or _key(t).endswith("목차"):
            continue
        if STANDARD_TITLE_RE.search(t) and "‘" in t:  # 목차 상단의 기준서 표제
            continue
        titles.append(t)

    ranges: list[str] = []
    for ln in lines[num_head + 1 :]:
        t = _norm(ln)
        if not t:
            continue
        if RANGE_ONLY_RE.match(t):
            ranges.append(t)
        else:
            break

    # 목차의 긴 제목은 줄바꿈으로 쪼개져 제목 수가 범위 수보다 많아진다.
    # 쪼개진 조각은 본문에 그대로 나타나지 않으므로, 다음 줄과 이어붙였을 때
    # 본문의 제목 줄과 일치하면 하나의 제목으로 합친다.
    body_lines = {_key(ln) for ln in lines[num_head:] if ln.strip()}
    merged: list[str] = []
    i = 0
    while i < len(titles):
        t = titles[i]
        if (
            len(merged) + (len(titles) - i) > len(ranges)
            and i + 1 < len(titles)
            and _key(t) not in body_lines
            and _key(f"{t} {titles[i + 1]}") in body_lines
        ):
            merged.append(f"{t} {titles[i + 1]}")
            i += 2
            continue
        merged.append(t)
        i += 1

    return [_make_entry(title, rng) for title, rng in zip(merged, ranges)]


def _make_entry(title: str, rng: str) -> TocEntry:
    parts = re.split(r"\s*[~∼～-]\s*", rng)
    return TocEntry(title=title, rng=rng, start=parts[0], end=parts[-1])


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
        num_head = next(i for i, ln in enumerate(lines) if _key(ln) == "문단번호")
    except StopIteration:
        num_head = 0

    body_start = num_head
    for i in range(num_head + 1, len(lines)):
        m = PARA_START_RE.match(lines[i].strip())
        # 본문의 첫 문단(1 / 1.1 / 한1.1 / 1A ...)을 본문 시작으로 본다.
        # 번호를 특정하지 않으면 저작권 안내의 '7 Westferry Circus...' 같은
        # 줄을 문단으로 오인해 본문 전체를 놓친다(제1101호에서 실제 발생).
        if m and FIRST_PARA_RE.fullmatch(m.group(1)):
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

        if APPENDIX_RE.match(line):
            path = [_norm(line)]
            current = None
            continue

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
    if include_ig:
        # 실무적용지침은 별도 기준서가 아니라 같은 기준서의 뒷부분으로 이어붙인다.
        body.extend(parse_ig(lines, std_id, std_code, title, code_no))

    standard["paragraphs"] = body
    return [standard]


def parse_ig(lines: list[str], std_id: str, std_code: str, title: str, code_no: str) -> list[dict]:
    """실무적용지침(IG) 문단을 상위 기준서의 문단으로 수집한다.

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
                "standardId": std_id,
                "standardCode": std_code,
                "standardTitle": title,
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

    return paragraphs


def main() -> None:
    ap = argparse.ArgumentParser(
        description="K-IFRS 기준서 HWP → 기준서 DB JSON 변환기",
        epilog="폴더를 주면 그 안의 *.hwp 를 모두 변환한다. "
               "이때 -o 는 출력 폴더로 해석되고 파일명은 k-ifrs-<번호>.json 으로 자동 결정된다.",
    )
    ap.add_argument("hwp", help="입력 HWP 파일 또는 HWP 가 들어있는 폴더")
    ap.add_argument("-o", "--output", help="출력 JSON 경로(파일 입력) 또는 출력 폴더(폴더 입력)")
    ap.add_argument("--include-ig", action="store_true", help="실무적용지침(IG)도 같은 기준서의 문단으로 포함")
    ap.add_argument("--dump-text", help="추출한 원문 텍스트를 저장(파일 입력일 때만, 디버깅용)")
    args = ap.parse_args()

    if os.path.isdir(args.hwp):
        convert_directory(args.hwp, args.output, args.include_ig)
        return

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


def convert_directory(src_dir: str, out_dir: str | None, include_ig: bool) -> None:
    """폴더 안의 HWP 를 모두 변환한다. 한 건이 실패해도 나머지는 계속 진행한다."""
    out_dir = out_dir or "parsed_json"
    os.makedirs(out_dir, exist_ok=True)

    files = sorted(
        f for f in glob.glob(os.path.join(src_dir, "*"))
        if f.lower().endswith((".hwp", ".hwpx"))
    )
    if not files:
        sys.exit(f"{src_dir} 에서 HWP 파일을 찾지 못했습니다.")

    ok = 0
    failed: list[tuple[str, str]] = []
    for path in files:
        name = os.path.basename(path)
        try:
            data = build_standard(extract_hwp_text(path), include_ig=include_ig)
            code_no = re.sub(r"\D", "", data[0]["code"])[:4]
            dst = os.path.join(out_dir, f"k-ifrs-{code_no}.json")
            with open(dst, "w", encoding="utf-8") as fp:
                fp.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
            total = sum(len(s["paragraphs"]) for s in data)
            print(f"  OK   {os.path.basename(dst):<20} 기준서 {len(data)}건 / 문단 {total:>4}건  ← {name[:40]}")
            ok += 1
        except Exception as e:  # 한 파일의 실패가 전체를 막지 않도록 한다
            print(f"  실패 {name[:60]}: {e}")
            failed.append((name, str(e)))

    print(f"\n{ok}/{len(files)}건 변환 완료 → {out_dir}/")
    if failed:
        print("실패 목록:")
        for name, err in failed:
            print(f"  - {name}: {err}")


if __name__ == "__main__":
    main()
