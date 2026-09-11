"""
서울외국환중개(smbs.biz) 페이지가 실제로 어떤 모양인지 확인하는 일회성 probe.

개발 환경에서는 이 호스트로 나갈 수 없어서, GitHub Actions 러너에서 한 번 돌려
응답 인코딩과 표 구조를 로그로 본 뒤 파서를 쓴다. 파서가 자리를 잡으면 지운다.
"""
from __future__ import annotations

import re
import sys
import urllib.request
from html.parser import HTMLParser

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

CANDIDATES = [
    "http://www.smbs.biz/ExRate/TodayExRate.jsp",
    "http://www.smbs.biz/ExRate/StdExRate.jsp",
    "http://www.smbs.biz/ExRate/ExRateList.jsp",
    "http://www.smbs.biz/ExRate/TodayExRate_p.jsp",
]


def fetch(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ko"})
    with urllib.request.urlopen(req, timeout=30) as res:
        raw = res.read()
        return res.status, res.headers.get("Content-Type", ""), raw


def decode(raw: bytes, content_type: str) -> tuple[str, str]:
    """한국 관공서/중개사 페이지는 EUC-KR 인 경우가 많다. 무엇으로 읽혔는지 같이 돌려준다."""
    m = re.search(r"charset=([\w-]+)", content_type, re.I)
    declared = m.group(1) if m else None
    m2 = re.search(rb"charset=[\"']?([\w-]+)", raw[:4000], re.I)
    meta = m2.group(1).decode("ascii", "ignore") if m2 else None
    for enc in [declared, meta, "utf-8", "euc-kr", "cp949"]:
        if not enc:
            continue
        try:
            return raw.decode(enc), enc
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("utf-8", "replace"), "utf-8(replace)"


class TableDumper(HTMLParser):
    """표마다 앞 몇 줄의 셀 텍스트만 뽑는다. 열 구성을 보려는 것이다."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self.depth = 0
        self.row: list[str] | None = None
        self.cell: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.depth += 1
            self.tables.append([])
        elif tag == "tr" and self.depth:
            self.row = []
        elif tag in ("td", "th") and self.depth:
            self.cell = []

    def handle_endtag(self, tag):
        if tag == "table" and self.depth:
            self.depth -= 1
        elif tag == "tr" and self.row is not None:
            if self.tables:
                self.tables[-1].append(self.row)
            self.row = None
        elif tag in ("td", "th") and self.cell is not None:
            text = re.sub(r"\s+", " ", "".join(self.cell)).strip()
            if self.row is not None:
                self.row.append(text)
            self.cell = None

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)


def main() -> int:
    for url in CANDIDATES:
        print("=" * 70)
        print("URL:", url)
        try:
            status, ctype, raw = fetch(url)
        except Exception as exc:  # noqa: BLE001 - probe 라 원인을 그대로 본다
            print("  실패:", type(exc).__name__, exc)
            continue

        text, enc = decode(raw, ctype)
        print(f"  status={status} content-type={ctype!r} bytes={len(raw)} decoded_as={enc}")

        forms = re.findall(r"<form[^>]*>", text, re.I)
        print("  form 태그:", forms[:5])
        selects = re.findall(r'<select[^>]*name=["\']?([\w]+)', text, re.I)
        print("  select name:", selects[:10])
        inputs = re.findall(r'<input[^>]*name=["\']?([\w]+)[^>]*>', text, re.I)
        print("  input name:", inputs[:15])

        d = TableDumper()
        d.feed(text)
        print(f"  표 {len(d.tables)}개")
        for i, rows in enumerate(d.tables):
            if not rows:
                continue
            print(f"  --- table[{i}] rows={len(rows)}")
            for r in rows[:4]:
                print("      ", r[:12])
    return 0


if __name__ == "__main__":
    sys.exit(main())
