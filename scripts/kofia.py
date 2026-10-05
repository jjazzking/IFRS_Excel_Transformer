"""
금융투자협회 채권정보센터(www.kofiabond.or.kr) 채권시가평가수익률 읽기.

사이트는 WebSquare 로 만든 화면이고, 화면 뒤에서 ProFrame XML 서비스를 부른다.
그 서비스를 그대로 부른다 — 요청과 응답 모두 XML 이다.

  메뉴: 시가평가 › 채권시가평가수익률 › 일자별   (/xml/startest/BISBndSrtPrcDay.xml)
  서비스: BIS-KOFIABOND / BISBndSrtPrcSrchSO / selectDay   (열 머리글은 getHeadList)

응답 한 행이 표의 한 줄(종류 · 종류명 · 신용등급)이고, val1…val16 이 잔존만기별 수익률(%)이다.
조사한 내용은 docs/rates-plan.md 에 있다.

이 컨테이너나 브라우저에서는 사이트에 닿지 않는다. GitHub Actions 러너에서 돌린다.
"""
from __future__ import annotations

import http.client
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from xml.etree import ElementTree as ET

SERVICE_URL = "https://www.kofiabond.or.kr/proframeWeb/XMLSERVICES/"
SCREEN_URL = "https://www.kofiabond.or.kr/websquare/websquare.html?w2xPath=/xml/startest/BISBndSrtPrcDay.xml"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# 평가사 평균. 2023-01-09 부터 평균에 넣을 평가사를 골라 묻고, 그 전은 코드가 따로 있다.
AVG_SINCE = "20230109"
AVG_CODE = "A20000"
AVG_CODE_OLD = "A10000"
# 나이스피앤아이 · 한국자산평가 · KIS자산평가 · 에프앤자산평가 · 이지자산평가 — 화면의 체크박스 다섯 개
AVG_MEMBERS = ["A10002", "A10003", "A10004", "A10005", "A10006"]

# 응답이 중간에 끊겨 오는 일(IncompleteRead)이 잦다. 몇 번 다시 묻는다.
RETRIES = 4
RETRY_DELAY_SEC = [2.0, 5.0, 10.0, 20.0]


class KofiaError(RuntimeError):
    pass


@dataclass
class YieldRow:
    code: str          # sigaBrnCd — 표의 한 줄을 가리키는 코드 (예: 7010123 = 회사채 공모 무보증 AA-)
    category: str      # 종류 (예: 회사채 I(공모사채))
    type: str          # 종류명 (예: 무보증)
    grade: str         # 신용등급 (예: AA-)
    values: list[float | None]


def _call(svc: str, fn: str, dto_xml: str) -> ET.Element:
    body = (
        '<?xml version="1.0" encoding="utf-8"?><message><proframeHeader>'
        f"<pfmAppName>BIS-KOFIABOND</pfmAppName><pfmSvcName>{svc}</pfmSvcName><pfmFnName>{fn}</pfmFnName>"
        "</proframeHeader><systemHeader></systemHeader>" + dto_xml + "</message>"
    ).encode("utf-8")
    req = urllib.request.Request(
        SERVICE_URL,
        data=body,
        headers={
            "User-Agent": UA,
            "Content-Type": "application/xml; charset=UTF-8",
            "Referer": SCREEN_URL,
            "Origin": "https://www.kofiabond.or.kr",
        },
    )
    last: Exception | None = None
    for attempt in range(RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                raw = r.read()
            return ET.fromstring(raw)
        except (http.client.IncompleteRead, urllib.error.URLError, TimeoutError, ConnectionError, ET.ParseError) as exc:
            last = exc
            if attempt < RETRIES:
                time.sleep(RETRY_DELAY_SEC[attempt])
    raise KofiaError(f"{svc}.{fn}: {type(last).__name__} {last}")


def _text(el: ET.Element, tag: str) -> str:
    found = el.find(tag)
    return (found.text or "").strip() if found is not None else ""


def _num(s: str) -> float | None:
    """빈 칸과 0 은 '고시 없음'이다 — 화면도 '-' 로 바꿔 보여준다."""
    try:
        v = float(s)
    except ValueError:
        return None
    return v if v != 0 else None


def fetch_terms(day: str) -> list[str]:
    """열 머리글 — 잔존만기 (3월, 6월, … 50년)."""
    root = _call(
        "BISBndSrtPrcSrchSO", "getHeadList",
        f"<BISBndSrtPrcDayDTO><standardDt>{day}</standardDt><applyGbCd>C00</applyGbCd></BISBndSrtPrcDayDTO>",
    )
    return [_text(e, "remainTrmCtgy") for e in root.iter("BISBndSrtPrcDayDTO") if _text(e, "remainTrmCtgy")]


def fetch_day_average(day: str, n_terms: int) -> list[YieldRow]:
    """
    한 날짜의 평가사 평균 표. day 는 YYYYMMDD.

    고시가 없는 날(주말·휴일)에는 빈 표가 오거나, 서버에 따라 직전 영업일 표가 온다.
    뒤쪽은 여기서 가릴 수 없으므로 부르는 쪽에서 앞날과 똑같은지로 거른다.
    """
    if day >= AVG_SINCE:
        members = "".join(f"<val{i + 1}>{c}</val{i + 1}>" for i, c in enumerate(AVG_MEMBERS))
        comp = AVG_CODE
    else:
        members = ""
        comp = AVG_CODE_OLD
    root = _call(
        "BISBndSrtPrcSrchSO", "selectDay",
        f"<BISBndSrtPrcDayDTO><standardDt>{day}</standardDt><reportCompCd>{comp}</reportCompCd>"
        f"<applyGbCd>C00</applyGbCd>{members}</BISBndSrtPrcDayDTO>",
    )
    rows: list[YieldRow] = []
    for e in root.iter("BISBndSrtPrcDayDTO"):
        code = _text(e, "sigaBrnCd")
        if not code:
            continue
        values = [_num(_text(e, f"val{i}")) for i in range(1, n_terms + 1)]
        if all(v is None for v in values):
            continue
        rows.append(YieldRow(
            code=code,
            category=_clean(_text(e, "largeCategoryMrk")),
            type=_clean(_text(e, "typeNmMrk")),
            grade=_clean(_text(e, "creditRnkMrk")),
            values=values,
        ))
    return rows


def _clean(s: str) -> str:
    """'**금융채 II(금융기관채)', '***보증' 처럼 화면 각주 표시로 붙은 별표를 뗀다. '-' 는 빈 칸."""
    s = re.sub(r"^\*+", "", s).strip()
    return "" if s == "-" else s
