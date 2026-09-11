"""
서울외국환중개(www.smbs.biz) 고시 환율 읽기.

이 사이트는 표의 글자를 그대로 두지 않는다. 모든 셀이 `d1( '%u_Zc77c...' )` 같은
자바스크립트 호출로 들어 있고, 브라우저가 그 함수를 돌려야 글자가 나온다.
난독화 방식은 간단하다 — `%` 또는 `%u` 뒤에 의미 없는 표식 한 글자가 끼어 있고,
그것만 떼면 자바스크립트 unescape 와 같은 형식이다.

  %_Z32%_Z30%_Z32%_Z36  →  2026
  %u_Zc77c%u_Zbcf8      →  일본

페이지는 EUC-KR 이다. 응답 헤더가 그렇게 말하고, 실제로도 그렇다.
"""
from __future__ import annotations

import re
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from html.parser import HTMLParser

BASE = "http://www.smbs.biz/ExRate/"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

_TOKEN = re.compile(r"%u_?[A-Z]?([0-9a-fA-F]{4})|%_?[A-Z]?([0-9a-fA-F]{2})|%_?[A-Z]?([0-9a-fA-F])")
_CALL = re.compile(r"d\d?\(\s*'([^']*)'\s*\)")
_TAG = re.compile(r"<[^>]+>")


def unobfuscate(s: str) -> str:
    """난독화된 조각 하나를 원래 글자로 되돌린다."""
    return _TOKEN.sub(lambda m: chr(int(m.group(1) or m.group(2) or m.group(3), 16)), s)


def cell_text(raw_html: str) -> str:
    """
    셀 하나의 글자. d(...) 호출을 모두 풀어 이어붙인 뒤 태그를 걷어낸다.

    전일대비 셀에는 오르내림을 나타내는 아이콘이 함께 들어 있다. 숫자만 남기면
    방향이 사라지므로 부호로 바꿔 붙인다 — 조서에서는 방향이 곧 의미다.
    """
    calls = _CALL.findall(raw_html)
    decoded = "".join(unobfuscate(c) for c in calls) if calls else raw_html

    sign = ""
    if "환율하락" in decoded or "ico_down" in decoded or "ico_dw" in decoded:
        sign = "-"
    elif "환율상승" in decoded or "ico_up" in decoded:
        sign = "+"

    text = _TAG.sub(" ", decoded)
    text = re.sub(r"\s+", " ", text).strip()
    return f"{sign}{text}" if sign and text else text


class _Tables(HTMLParser):
    """표를 행·셀의 문자열로만 거둔다. 중첩 표는 이 사이트에 없다."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.tables.append([])
        elif tag == "tr":
            self._row = []
        elif tag in ("td", "th"):
            self._cell = []
        elif self._cell is not None:
            # 아이콘 img 의 alt 에 오르내림이 적혀 있어 셀 안에 남겨 둔다.
            self._cell.append(" " + " ".join(v or "" for _, v in attrs) + " ")

    def handle_endtag(self, tag):
        if tag == "tr" and self._row is not None:
            if self.tables:
                self.tables[-1].append(self._row)
            self._row = None
        elif tag in ("td", "th") and self._cell is not None:
            if self._row is not None:
                self._row.append(cell_text("".join(self._cell)))
            self._cell = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


def fetch(path: str, params: dict | None = None, timeout: int = 30) -> str:
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": BASE + path})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read().decode("euc-kr", "replace")


def parse_tables(html: str) -> list[list[list[str]]]:
    p = _Tables()
    p.feed(html)
    return p.tables


# --- 통화 ---------------------------------------------------------------

_NAME_UNIT = re.compile(r"^(.*?)\s*\(([A-Z]{3})\)(?:\s*\((\d+)\))?\s*$")


@dataclass
class Currency:
    code: str
    """'미국 달러' — 통화 코드와 단위를 뗀 이름"""
    name: str
    """1 또는 100. JPY·IDR·VND 는 100 단위로 고시된다 — 조서에 반드시 드러나야 한다."""
    unit: int = 1

    @property
    def label(self) -> str:
        return f"{self.name} ({self.code})" + (f" ({self.unit})" if self.unit != 1 else "")


def parse_currency_label(label: str) -> Currency | None:
    """'일본 엔 (JPY) (100)' → Currency(code='JPY', name='일본 엔', unit=100)"""
    m = _NAME_UNIT.match(label.strip())
    if not m:
        return None
    name, code, unit = m.groups()
    return Currency(code=code, name=name.strip(), unit=int(unit) if unit else 1)


def list_currencies() -> list[Currency]:
    """기간 조회 화면의 통화 선택 목록."""
    html = fetch("StdExRate.jsp")
    out: list[Currency] = []
    seen: set[str] = set()
    for raw in _CALL.findall(html):
        decoded = unobfuscate(raw)
        if "<option" not in decoded:
            continue
        for code, label in re.findall(r"value='([A-Z]{3})'>([^<]+)<", decoded):
            cur = parse_currency_label(label)
            if cur and cur.code not in seen:
                seen.add(cur.code)
                out.append(cur)
    return out


# --- 기간 조회 ----------------------------------------------------------

_NUM = re.compile(r"^[+-]?[\d,]+(?:\.\d+)?$")


def to_number(s: str) -> float | None:
    s = (s or "").strip()
    if not _NUM.match(s):
        return None
    return float(s.replace(",", ""))


def to_iso_date(s: str) -> str | None:
    m = re.match(r"(\d{4})\.(\d{2})\.(\d{2})", (s or "").strip())
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


# 화면의 열 이름을 그대로 키로 쓰지 않는다. USD 는 열이 열 개, 나머지 통화는
# 다섯 개라서, 열 이름을 보고 자리를 찾아야 한다.
COLUMN_KEYS = {
    "날짜": "date",
    "통화명": "currency",
    "환율": "rate",
    "전일대비": "change",
    "시가": "open",
    "고가": "high",
    "저가": "low",
    "15:30 환율": "close1530",
    "06:00 종가": "close0600",
    "당사 거래량 (Mio)": "volume",
    "Cross Rate": "crossRate",
}

DATE_KEYS = {"date"}
TEXT_KEYS = {"currency"}


@dataclass
class PeriodResult:
    currency: Currency
    rows: list[dict] = field(default_factory=list)
    """사이트가 직접 계산해 보여주는 요약 — 평균환율·최저·최고·등락폭"""
    summary: dict = field(default_factory=dict)


def fetch_period(code: str, start: str, end: str) -> PeriodResult:
    """
    한 통화의 일자별 고시 환율. start·end 는 'YYYY-MM-DD'.

    영업일만 돌아온다. 주말·공휴일은 애초에 고시가 없다.
    """
    sy, sm, sd = start.split("-")
    ey, em, ed = end.split("-")
    html = fetch(
        "StdExRate.jsp",
        {
            "tongwha_code": code,
            "StrSch_sYear": sy, "StrSch_sMonth": sm, "StrSch_sDay": sd,
            "StrSch_eYear": ey, "StrSch_eMonth": em, "StrSch_eDay": ed,
            "StrSchFull": start,
            "StrSchFull2": end,
        },
    )
    tables = parse_tables(html)

    # 표를 자리(index)가 아니라 머리글로 찾는다. 페이지가 바뀌어도 덜 깨진다.
    header_row: list[str] = []
    data_rows: list[list[str]] = []
    summary: dict = {}
    for rows in tables:
        if not rows:
            continue
        head = [c.strip() for c in rows[0]]
        if "날짜" in head and "환율" in head:
            header_row, data_rows = head, rows[1:]
        elif "평균환율" in head and len(rows) > 1:
            summary = {
                k: (to_number(v) if k not in ("최저기록일", "최고기록일") else to_iso_date(v))
                for k, v in zip(
                    ["평균환율", "최저치", "최저기록일", "최고치", "최고기록일", "등락폭", "crossRate"],
                    rows[1],
                )
            }

    if not header_row:
        raise ValueError(f"{code}: 일자별 표를 찾지 못했다 (응답 {len(html)}바이트)")

    keys = [COLUMN_KEYS.get(h, "") for h in header_row]
    currency: Currency | None = None
    out: list[dict] = []
    for raw_row in data_rows:
        rec: dict = {}
        for key, value in zip(keys, raw_row):
            if not key:
                continue
            if key in DATE_KEYS:
                rec[key] = to_iso_date(value)
            elif key in TEXT_KEYS:
                currency = currency or parse_currency_label(value)
            else:
                num = to_number(value)
                if num is not None:
                    rec[key] = num
        if rec.get("date") and rec.get("rate") is not None:
            out.append(rec)

    return PeriodResult(
        currency=currency or Currency(code=code, name=code),
        rows=out,
        summary=summary,
    )
