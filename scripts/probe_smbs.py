"""
서울외국환중개(smbs.biz) 조회 방식 확인용 probe — 2차.

1차에서 알아낸 것:
  - 응답은 EUC-KR, 셀 내용은 d()/d1()~d5() 안의 난독화 문자열이다.
  - StdExRate.jsp 에 기간 조회 폼이 있다 (tongwha_code + 시작/종료 일자).
2차에서 확인할 것: 그 폼을 어떤 파라미터로 불러야 원하는 통화·기간이 나오는지.
"""
from __future__ import annotations

import re
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
BASE = "http://www.smbs.biz/ExRate/"

# 셀 내용은 %u_Zc77c / %_Z32 처럼 쓰인다. `%` 또는 `%u` 뒤의 한 글자는 의미 없는 표식이라
# 떼어내면 자바스크립트 unescape 와 같은 형식이 된다.
TOKEN = re.compile(r"%u_?[A-Z]?([0-9a-fA-F]{4})|%_?[A-Z]?([0-9a-fA-F]{2})|%_?[A-Z]?([0-9a-fA-F])")


def decode(s: str) -> str:
    return TOKEN.sub(lambda m: chr(int(m.group(1) or m.group(2) or m.group(3), 16)), s)


CALL = re.compile(r"d\d?\(\s*'([^']*)'\s*\)")


def cell_text(raw: str) -> str:
    """d1( '...' ) 호출들을 풀어 이어붙인다. 호출이 없으면 원문 그대로."""
    calls = CALL.findall(raw)
    if not calls:
        return raw.strip()
    text = "".join(decode(c) for c in calls)
    text = re.sub(r"<br\s*/?>", " ", text)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", text).strip()


class Tables(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self.row: list[str] | None = None
        self.cell: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.tables.append([])
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th"):
            self.cell = []

    def handle_endtag(self, tag):
        if tag == "tr" and self.row is not None:
            if self.tables:
                self.tables[-1].append(self.row)
            self.row = None
        elif tag in ("td", "th") and self.cell is not None:
            if self.row is not None:
                self.row.append(cell_text("".join(self.cell)))
            self.cell = None

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)


def fetch(url: str, data: dict | None = None) -> str:
    body = urllib.parse.urlencode(data).encode("ascii") if data else None
    req = urllib.request.Request(url, data=body, headers={"User-Agent": UA, "Referer": url})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("euc-kr", "replace")


def show(label: str, html: str, want: int = 3) -> None:
    t = Tables()
    t.feed(html)
    print(f"  [{label}] bytes={len(html)} 표={len(t.tables)}")
    for i, rows in enumerate(t.tables):
        if len(rows) < 2:
            continue
        print(f"    table[{i}] rows={len(rows)}")
        for r in rows[:want]:
            print("      ", r)
        if len(rows) > want:
            print("       ...")
            print("      ", rows[-1])


def main() -> int:
    print("### 1. 통화 목록 (StdExRate.jsp 의 select)")
    html = fetch(BASE + "StdExRate.jsp")
    for raw in CALL.findall(html):
        d = decode(raw)
        if "<option" in d:
            opts = re.findall(r"value='([A-Z]{3})'>([^<]+)<", d)
            print(f"  통화 {len(opts)}개")
            for code, name in opts:
                print(f"    {code}\t{name.strip()}")
            break

    print("\n### 2. 기간 조회 — 파라미터 조합 시험 (USD, 2026-08-01 ~ 2026-09-10)")
    params = {
        "tongwha_code": "USD",
        "StrSch_sYear": "2026",
        "StrSch_sMonth": "08",
        "StrSch_sDay": "01",
        "StrSch_eYear": "2026",
        "StrSch_eMonth": "09",
        "StrSch_eDay": "10",
        "StrSchFull": "2026-08-01",
        "StrSchFull2": "2026-09-10",
    }
    try:
        show("POST", fetch(BASE + "StdExRate.jsp", params))
    except Exception as exc:  # noqa: BLE001
        print("  POST 실패:", type(exc).__name__, exc)
    try:
        show("GET", fetch(BASE + "StdExRate.jsp?" + urllib.parse.urlencode(params)))
    except Exception as exc:  # noqa: BLE001
        print("  GET 실패:", type(exc).__name__, exc)

    print("\n### 3. 다른 통화로도 바뀌는지 (JPY, 같은 기간)")
    p2 = dict(params, tongwha_code="JPY")
    try:
        show("POST JPY", fetch(BASE + "StdExRate.jsp", p2), want=2)
    except Exception as exc:  # noqa: BLE001
        print("  실패:", type(exc).__name__, exc)

    print("\n### 4. 오늘의 환율 (TodayExRate.jsp) 표 구조")
    show("TODAY", fetch(BASE + "TodayExRate.jsp"), want=4)
    return 0


if __name__ == "__main__":
    sys.exit(main())
