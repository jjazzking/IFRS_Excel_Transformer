#!/usr/bin/env python3
"""
규칙만으로 이사회 의사록에서 필드를 뽑는다. 모델 호출 없음, API 키 없음, 비용 0.

왜 규칙을 먼저 쓰는가 — 한국 이사회 의사록은 서식이 강하다. `제1호 의안`, `재적이사
7명 중 6명 출석`, `원안대로 가결` 같은 표현이 회사가 달라도 거의 같은 모양으로
나온다. 이런 자리에 모델을 쓰면 돈을 쓰고 재현성을 잃는다. 규칙은 틀리면 왜
틀렸는지 보이고, 고치면 그다음부터 항상 맞는다.

모든 추출은 값과 함께 **본문에서의 구간**을 돌려준다. 구간을 페이지·좌표로 되돌리는
일은 `minutes_text.MinutesText` 가 한다.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

# ---------------------------------------------------------------- 공통 도구


@dataclass
class Hit:
    """뽑아낸 값 하나와 그 값이 나온 자리."""

    value: object
    start: int
    end: int
    rule: str  # 어느 규칙이 잡았는지 — 틀렸을 때 어디를 고칠지 알려면 필요하다

    def to_json(self, text_obj) -> dict:
        out = {"value": self.value, "rule": self.rule}
        out["evidence"] = text_obj.evidence(self.start, self.end).to_json()
        return out


def _label(*chars: str) -> str:
    """`일    시` 처럼 라벨 글자 사이를 벌려 쓰는 서식을 견디게 한다."""
    return r"\s*".join(chars)


def _first(hits: Iterable[Hit]) -> Hit | None:
    for h in hits:
        return h
    return None


# ---------------------------------------------------------------- 일시

DATE_RE = re.compile(r"(\d{4})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})\s*일?")
TIME_RE = re.compile(r"(오전|오후)?\s*(\d{1,2})\s*(?:시|:)\s*(\d{1,2})?\s*분?")

LINE_LABELS = {
    "heldAt": [_label("일", "시"), _label("일", "자"), _label("개", "최", "일", "시")],
    "place": [_label("장", "소"), _label("개", "최", "장", "소")],
    "opened": [_label("개", "회"), _label("개", "의")],
    "closed": [_label("폐", "회"), _label("산", "회"), _label("폐", "의")],
}


def _label_lines(text: str, labels: list[str]) -> list[tuple[int, int, str]]:
    """`라벨 : 값` 형태의 줄에서 값 부분의 구간을 찾는다."""
    out = []
    for label in labels:
        pattern = re.compile(r"(?m)^[\s\d.)·\-]*" + label + r"\s*[:：]?\s*(\S.*)$")
        for m in pattern.finditer(text):
            out.append((m.start(1), m.end(1), m.group(1)))
    out.sort(key=lambda t: t[0])
    return out


def find_date(text: str) -> Hit | None:
    """일시. 라벨이 붙은 줄을 먼저 보고, 없으면 문서 앞부분의 첫 날짜를 쓴다."""
    for start, end, value in _label_lines(text, LINE_LABELS["heldAt"]):
        m = DATE_RE.search(value)
        if m:
            y, mo, d = (int(g) for g in m.groups())
            return Hit(f"{y:04d}-{mo:02d}-{d:02d}", start + m.start(), start + m.end(), "DATE_LABEL")
    # 라벨이 없는 서식 — 첫 페이지 앞쪽의 날짜를 쓴다. 뒤쪽 날짜(작성일·서명일)를
    # 집지 않도록 범위를 앞부분으로 제한한다.
    head = text[:1500]
    m = DATE_RE.search(head)
    if m:
        y, mo, d = (int(g) for g in m.groups())
        return Hit(f"{y:04d}-{mo:02d}-{d:02d}", m.start(), m.end(), "DATE_HEAD")
    return None


def _parse_time(value: str, offset: int) -> Hit | None:
    m = TIME_RE.search(value)
    if not m:
        return None
    meridiem, hour, minute = m.group(1), int(m.group(2)), int(m.group(3) or 0)
    if meridiem == "오후" and hour < 12:
        hour += 12
    if meridiem == "오전" and hour == 12:
        hour = 0
    if hour > 23 or minute > 59:
        return None
    return Hit(f"{hour:02d}:{minute:02d}", offset + m.start(), offset + m.end(), "TIME")


def find_times(text: str) -> tuple[Hit | None, Hit | None]:
    """개회·폐회 시각. 일시 줄에 시각이 같이 적힌 서식도 개회로 본다."""
    opened = closed = None

    for start, _, value in _label_lines(text, LINE_LABELS["opened"]):
        opened = _parse_time(value, start)
        if opened:
            opened.rule = "TIME_OPEN_LABEL"
            break
    for start, _, value in _label_lines(text, LINE_LABELS["closed"]):
        closed = _parse_time(value, start)
        if closed:
            closed.rule = "TIME_CLOSE_LABEL"
            break

    if opened is None:
        for start, _, value in _label_lines(text, LINE_LABELS["heldAt"]):
            m = DATE_RE.search(value)
            tail_at = m.end() if m else 0
            opened = _parse_time(value[tail_at:], start + tail_at)
            if opened:
                opened.rule = "TIME_IN_DATE_LINE"
                break
    return opened, closed


def find_place(text: str) -> Hit | None:
    """장소. 일시와 한 줄에 붙은 서식(`일시 및 장소`)은 쉼표 뒤를 장소로 본다."""
    for start, end, value in _label_lines(text, LINE_LABELS["place"]):
        cleaned = value.strip().rstrip(".,")
        if cleaned:
            return Hit(cleaned, start, start + len(value.rstrip()), "PLACE_LABEL")

    combined = re.compile(r"(?m)^[\s\d.)·\-]*" + _label("일", "시") + r"\s*(?:및|과)\s*" + _label("장", "소") + r"\s*[:：]?\s*(\S.*)$")
    for m in combined.finditer(text):
        value = m.group(1)
        parts = re.split(r"\s*[,，]\s*", value)
        if len(parts) >= 2:
            tail = parts[-1].strip().rstrip(".")
            off = m.start(1) + value.rfind(parts[-1])
            return Hit(tail, off, off + len(parts[-1].rstrip()), "PLACE_IN_COMBINED_LINE")
    return None


# ---------------------------------------------------------------- 인원수

# 전체가 아닌 소집단의 수 — 이 말이 앞에 붙으면 총수로 쓰지 않는다.
SUBGROUP = r"(?<!사외)(?<!사내)(?<!상근)(?<!비상근)(?<!기타비상무)"

SUBJECTS = {
    "directors": r"이\s*사",
    "auditCommittee": r"감\s*사\s*위\s*원|감\s*사",
}

COUNT = r"(\d+)\s*[명인]"

# `재적이사 7명 중 6명 출석` — 총수와 출석을 한 번에 준다. 가장 흔하고 가장 믿을 만하다.
BOTH_RE = "(?:재적|총|전체)?\\s*{subject}\\s*(?:총\\s*수|총원)?\\s*(?:는|은)?\\s*{count}\\s*(?:중|가운데)\\s*(?:출석\\s*(?:이사|감사위원)?\\s*)?{count2}\\s*(?:이\\s*)?(?:출석|참석)?"

# `재적이사 7명 전원 출석`
ALL_RE = "(?:재적|총|전체)?\\s*{subject}\\s*{count}\\s*(?:전원|모두)\\s*(?:이\\s*)?(?:출석|참석)"

# `이사 총수 : 7명` / `출석 이사 수 : 6명` — 표로 적힌 서식.
# 앞에 `재적/총` 이 붙거나 뒤에 `총수/정원` 이 붙어야 총수로 본다. 그냥 `이사 7명` 은
# 소집단일 수 있어 집지 않는다.
TOTAL_RE = "(?:(?:재적|총|전체)\\s*{subject}|{subject}\\s*(?:총\\s*수|총원|정\\s*원))\\s*(?:수)?\\s*[:：]?\\s*{count}"
PRESENT_RE = "(?:출\\s*석\\s*{subject}|{subject}\\s*출\\s*석)\\s*(?:수|인원)?\\s*[:：]?\\s*{count}"


def _compile(template: str, subject: str) -> re.Pattern:
    return re.compile(
        template.replace("{subject}", SUBGROUP + "(?:" + subject + ")")
        .replace("{count2}", COUNT)
        .replace("{count}", COUNT)
    )


def find_attendance(text: str, key: str) -> dict:
    """총 인원과 출석 인원. 규칙마다 신뢰도가 달라 우선순위대로 본다."""
    subject = SUBJECTS[key]
    result: dict[str, Hit | None] = {"total": None, "present": None}
    conflicts: list[str] = []

    for m in _compile(BOTH_RE, subject).finditer(text):
        total, present = int(m.group(1)), int(m.group(2))
        cand = (Hit(total, m.start(), m.end(), "COUNT_BOTH"), Hit(present, m.start(), m.end(), "COUNT_BOTH"))
        if result["total"] is None:
            result["total"], result["present"] = cand
        elif result["total"].value != total or result["present"].value != present:
            conflicts.append(f"{total}/{present}")

    if result["total"] is None:
        for m in _compile(ALL_RE, subject).finditer(text):
            n = int(m.group(1))
            result["total"] = Hit(n, m.start(), m.end(), "COUNT_ALL_PRESENT")
            result["present"] = Hit(n, m.start(), m.end(), "COUNT_ALL_PRESENT")
            break

    if result["total"] is None:
        m = _compile(TOTAL_RE, subject).search(text)
        if m:
            result["total"] = Hit(int(m.group(1)), m.start(), m.end(), "COUNT_TOTAL_LABEL")
    if result["present"] is None:
        m = _compile(PRESENT_RE, subject).search(text)
        if m:
            result["present"] = Hit(int(m.group(1)), m.start(), m.end(), "COUNT_PRESENT_LABEL")

    return {"total": result["total"], "present": result["present"], "conflicts": conflicts}


# ---------------------------------------------------------------- 의안

AGENDA_RE = re.compile(
    r"(?m)^[\s\W]{0,6}?(?:"
    r"제\s*(?P<n1>\d+)\s*호\s*(?P<kind1>의\s*안|안\s*건|보\s*고\s*사\s*항)"
    r"|(?P<kind2>의\s*안|안\s*건|보\s*고\s*사\s*항)\s*제\s*(?P<n2>\d+)\s*호"
    r"|(?P<kind3>보\s*고\s*사\s*항)\s*(?P<n3>\d+)\s*[.)]"
    r")"
)

# 의안 구간이 여기까지 이어지지 않게 끊는 말
AGENDA_STOP_RE = re.compile(r"(?m)^[\s\W]{0,6}?(?:" + _label("폐", "회") + r"|" + _label("산", "회") + r"|이상[과와]?\s*같이|위와\s*같이\s*(?:결의|의결))")

TITLE_TRIM = " \t:：.·-–—」』】\"'「『【《》()"


def _title_in(text: str, start: int, end: int) -> tuple[str, int, int]:
    """제목에서 앞뒤 장식(`:`, 따옴표 등)을 떼고, **뗀 뒤의 구간**을 돌려준다.

    값과 근거 구간이 정확히 같아야 한다. 근거가 한 글자라도 값보다 넓으면 화면에서
    하이라이트가 엉뚱한 곳까지 덮는다.
    """
    raw = text[start:end]
    title = raw.strip(TITLE_TRIM)
    if not title:
        return "", start, end
    at = start + raw.find(title)
    return title, at, at + len(title)


def find_agenda(text: str) -> list[dict]:
    """의안 경계와 제목. 본문은 다음 의안이 시작하기 직전까지로 자른다."""
    marks = list(AGENDA_RE.finditer(text))
    if not marks:
        return []

    items = []
    for i, m in enumerate(marks):
        number = int(m.group("n1") or m.group("n2") or m.group("n3"))
        kind_raw = (m.group("kind1") or m.group("kind2") or m.group("kind3") or "").replace(" ", "")
        kind = "보고" if kind_raw == "보고사항" else "결의"

        line_end = text.find("\n", m.end())
        if line_end == -1:
            line_end = len(text)
        title, title_start, title_end = _title_in(text, m.end(), line_end)
        # 제목이 다음 줄로 넘어간 서식
        if not title:
            nxt = text.find("\n", line_end + 1)
            nxt = len(text) if nxt == -1 else nxt
            title, title_start, title_end = _title_in(text, line_end, nxt)

        body_start = title_end
        body_end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        stop = AGENDA_STOP_RE.search(text, body_start, body_end)
        if stop:
            body_end = stop.start()

        items.append(
            {
                "number": number,
                "kind": kind,
                "marker": Hit(number, m.start(), m.end(), "AGENDA_MARK"),
                "title": Hit(title, title_start, title_end, "AGENDA_TITLE"),
                "bodyRange": (body_start, body_end),
            }
        )
    return items


# ---------------------------------------------------------------- 가결 여부

RESOLUTION_RULES = [
    ("부결", re.compile(r"부\s*결")),
    ("보류", re.compile(r"보\s*류|연\s*기|철\s*회|차기\s*이사회")),
    ("원안가결", re.compile(r"원안\s*(?:대로|과\s*같이)?\s*(?:가결|승인|의결|채택)|원안\s*가결")),
    ("수정가결", re.compile(r"수정\s*(?:하여|한\s*후|안\s*대로)?\s*(?:가결|승인|의결)")),
    ("가결", re.compile(r"가\s*결|승\s*인|의\s*결|채\s*택")),
]

VOTE_RE = {
    "for": re.compile(r"찬\s*성\s*[:：]?\s*(\d+)\s*[명인표]"),
    "against": re.compile(r"반\s*대\s*[:：]?\s*(\d+)\s*[명인표]"),
    "abstain": re.compile(r"기\s*권\s*[:：]?\s*(\d+)\s*[명인표]"),
}
UNANIMOUS_RE = re.compile(r"만장일치|전원\s*찬성|이의\s*없이")


def find_resolution(text: str, body_start: int, body_end: int, kind: str) -> dict:
    body = text[body_start:body_end]
    out: dict = {"resolution": None, "votes": {}, "unanimous": None}

    for label, pattern in RESOLUTION_RULES:
        m = pattern.search(body)
        if m:
            out["resolution"] = Hit(label, body_start + m.start(), body_start + m.end(), f"RESOLUTION_{label}")
            break
    if out["resolution"] is None and kind == "보고":
        out["resolution"] = Hit("해당없음", body_start, body_start, "RESOLUTION_REPORT_ONLY")

    for key, pattern in VOTE_RE.items():
        m = pattern.search(body)
        if m:
            out["votes"][key] = Hit(int(m.group(1)), body_start + m.start(), body_start + m.end(), "VOTE_COUNT")

    m = UNANIMOUS_RE.search(body)
    if m:
        out["unanimous"] = Hit(True, body_start + m.start(), body_start + m.end(), "VOTE_UNANIMOUS")
    return out


SENTENCE_SPLIT = re.compile(r"(?<=[.。])\s+|\n")


def extractive_summary(text: str, body_start: int, body_end: int) -> Hit | None:
    """규칙만으로는 요약을 **쓰지 않고 고른다.** 결의 문장을 그대로 발췌한다.

    문장을 생성하려면 모델이 필요하다 (`docs/minutes-plan.md` 3-2). 발췌는 원문이
    바뀌지 않는다는 장점이 있고, 사람이 검토할 때 어차피 이 문장을 본다.
    """
    body = text[body_start:body_end]
    best: tuple[int, int] | None = None
    cursor = 0
    for piece in SENTENCE_SPLIT.split(body):
        if piece is None:
            continue
        at = body.find(piece, cursor)
        if at == -1:
            continue
        cursor = at + len(piece)
        if re.search(r"가\s*결|부\s*결|승\s*인|의\s*결|보\s*류|채\s*택", piece):
            best = (at, at + len(piece))
    if best is None:
        return None
    return Hit(body[best[0]:best[1]].strip(), body_start + best[0], body_start + best[1], "SUMMARY_EXTRACTIVE")


# ---------------------------------------------------------------- 재무제표 영향 후보

# 의안에 이 말이 나오면 어느 기준서를 펴 봐야 하는지. 판단은 사람이 하고, 규칙은
# **어디를 볼지**까지만 좁힌다. 기준서 본문은 이미 저장소 안에 있다
# (`src/data/standards/`, 문단 3,661건).
IMPACT_TRIGGERS: list[tuple[str, list[str], str]] = [
    (r"유상증자|무상증자|신주\s*발행|주식\s*발행", ["k-ifrs-1032", "k-ifrs-1033"], "자본 증가 · 주당이익 희석"),
    (r"사채\s*발행|회사채|전환사채|신주인수권부사채|교환사채", ["k-ifrs-1032", "k-ifrs-1109", "k-ifrs-1107"], "부채·자본 분류 · 상각후원가"),
    (r"차\s*입|대\s*출|여신|한도\s*약정|금전\s*대여", ["k-ifrs-1107", "k-ifrs-1109"], "차입금 인식 · 금융위험 공시"),
    (r"지급\s*보증|채무\s*보증|담보\s*제공", ["k-ifrs-1037", "k-ifrs-1109"], "우발부채 · 금융보증계약"),
    (r"배\s*당|이익\s*잉여금\s*처분", ["k-ifrs-1001", "k-ifrs-1010"], "미지급배당 · 보고기간후사건"),
    (r"합\s*병|분\s*할|영업\s*양수|주식\s*양수|지분\s*취득|출\s*자", ["k-ifrs-1103", "k-ifrs-1110", "k-ifrs-1028"], "사업결합 · 연결범위"),
    (r"리\s*스|임대차\s*계약", ["k-ifrs-1116"], "사용권자산 · 리스부채"),
    (r"유형자산\s*(?:취득|처분|양도)|부동산\s*(?:취득|처분)|공장\s*신설|설비\s*투자", ["k-ifrs-1016", "k-ifrs-1036"], "취득원가 · 손상"),
    (r"무형자산|영업권|개발비|특허", ["k-ifrs-1038", "k-ifrs-1036"], "무형자산 인식 · 손상"),
    (r"특수\s*관계자|계열회사\s*거래|대주주\s*거래", ["k-ifrs-1024"], "특수관계자 공시"),
    (r"소\s*송|분\s*쟁|손해배상", ["k-ifrs-1037"], "충당부채 · 우발부채"),
    (r"주식매수선택권|스톡옵션|성과급\s*지급|임원\s*보수", ["k-ifrs-1102", "k-ifrs-1019", "k-ifrs-1024"], "주식기준보상 · 종업원급여"),
    (r"자기주식", ["k-ifrs-1032"], "자기주식 취득·처분"),
    (r"재무제표\s*승인|결산\s*승인|감사보고", ["k-ifrs-1001", "k-ifrs-1010"], "재무제표 승인일 · 보고기간후사건"),
]

AMOUNT_RE = re.compile(r"(?:금\s*)?([\d,]+(?:\.\d+)?)\s*(억\s*원|백만\s*원|천\s*원|만\s*원|원|USD|달러)")


def find_impact(text: str, title: str, body_start: int, body_end: int) -> dict:
    """재무제표 영향 — **사전 검토용 후보**만 만든다. 있음/없음 판단은 하지 않는다."""
    scope = title + "\n" + text[body_start:body_end]
    standards: list[str] = []
    reasons: list[str] = []
    for pattern, codes, why in IMPACT_TRIGGERS:
        if re.search(pattern, scope):
            for c in codes:
                if c not in standards:
                    standards.append(c)
            reasons.append(why)

    amounts = []
    for m in AMOUNT_RE.finditer(text[body_start:body_end]):
        amounts.append(
            {
                "raw": m.group(0).strip(),
                "value": _to_number(m.group(1), m.group(2)),
                "unit": m.group(2).replace(" ", ""),
                "start": body_start + m.start(),
                "end": body_start + m.end(),
            }
        )

    return {
        "hasImpact": "판단필요" if standards else "확인불가",
        "standards": standards,
        "reasons": reasons,
        "amounts": amounts,
    }


UNIT_SCALE = {"억원": 100_000_000, "백만원": 1_000_000, "천원": 1_000, "만원": 10_000, "원": 1}


def _to_number(digits: str, unit: str) -> float | None:
    try:
        base = float(digits.replace(",", ""))
    except ValueError:
        return None
    return base * UNIT_SCALE.get(unit.replace(" ", ""), 1) if unit.replace(" ", "") in UNIT_SCALE else base
