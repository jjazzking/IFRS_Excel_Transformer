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
    """`일    시` 처럼 라벨 글자 사이를 벌려 쓰는 서식을 견디게 한다.

    OCR 이 낱자를 벌려 놓는 경우에도 같은 관용이 그대로 듣는다.
    """
    return r"\s*".join(chars)


# 라벨 앞에 붙는 항목 번호. `1.` `2)` 뿐 아니라 `가.` `나.` 같은 한글 순서와
# 글머리표도 쓰인다. 번호 뒤에 구분점을 요구해 라벨 첫 글자를 삼키지 않게 한다.
ITEM_PREFIX = r"[ \t]*(?:\d{1,2}\s*[.)]|[가-힣]\s*[.)]|[-·*])?[ \t]*"


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
        pattern = re.compile(r"(?m)^" + ITEM_PREFIX + label + r"\s*[:：]?\s*(\S.*)$")
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


# 개회·폐회가 라벨이 아니라 문장 안에 적히는 서식. 시각이 말 앞에 온다.
#   "… 오전 11시 40분 개회를 선언하다."
#   "… 성립하였음을 선언하고 14:30부터 의사를 진행하였다."
_CLOCK = r"((?:오전|오후)?\s*\d{1,2}\s*(?:시|:)\s*\d{0,2}\s*분?)"
# 시각과 그 말 사이에 `이사회의` 같은 몇 글자가 끼는 서식이 있어 좁은 창을 둔다.
_GAP = r"[\s\S]{0,12}?"
OPEN_PROSE_RE = re.compile(_CLOCK + r"\s*(?:부터\s*)?" + _GAP + r"(?:" + _label("개", "회") + r"를?\s*" + _label("선", "언")
                           + r"|" + _label("의", "사") + r"를?\s*" + _label("진", "행") + r")")
CLOSE_PROSE_RE = re.compile(_CLOCK + r"\s*" + _GAP + r"(?:" + _label("폐", "회") + r"|" + _label("산", "회")
                            + r")를?\s*" + _label("선", "언"))


def find_times(text: str) -> tuple[Hit | None, Hit | None]:
    """개회·폐회 시각.

    서식이 세 갈래다. 라벨 줄(`폐 회 : 오전 11시`), 문장 안(`11시 40분 개회를
    선언하다`), 그리고 일시 줄에 시각이 함께 적힌 것. 앞에서부터 차례로 본다.
    """
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
        m = OPEN_PROSE_RE.search(text)
        if m:
            opened = _parse_time(m.group(1), m.start(1))
            if opened:
                opened.rule = "TIME_OPEN_PROSE"
    if closed is None:
        m = CLOSE_PROSE_RE.search(text)
        if m:
            closed = _parse_time(m.group(1), m.start(1))
            if closed:
                closed.rule = "TIME_CLOSE_PROSE"

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

    combined = re.compile(r"(?m)^" + ITEM_PREFIX + _label("일", "시") + r"\s*(?:및|과)\s*" + _label("장", "소") + r"\s*[:：]?\s*(\S.*)$")
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


# 출석 명단 줄. `대표이사   노명희   출석` / `상근감사   전원건   불참(사유)`
# 이름에 한자 병기(`서규현(徐圭賢)`)가 붙고, 출석 표기 앞에 `원격`·`서면` 이 붙는다.
ROSTER_RE = re.compile(
    r"(?m)^[ \t]*(대표이사|사내이사|사외이사|기타비상무이사|이사"
    r"|상근감사|비상근감사|감사위원|감사)[ \t]+(\S{2,16})[ \t]+"
    r"(?:원격|화상|서면|대리)?\s*(출석|참석|불참|결석|불출석)"
)

ATTENDED = {"출석", "참석"}


def find_roster(text: str) -> dict:
    """명단을 세어 총원·출석을 구한다. 총수 줄이 없는 서식의 마지막 수단이다."""
    counts = {"directors": [0, 0], "auditCommittee": [0, 0]}
    span = {"directors": None, "auditCommittee": None}
    for m in ROSTER_RE.finditer(text):
        title, _, mark = m.groups()
        key = "auditCommittee" if "감사" in title else "directors"
        counts[key][0] += 1
        counts[key][1] += int(mark in ATTENDED)
        if span[key] is None:
            span[key] = [m.start(), m.end()]
        else:
            span[key][1] = m.end()
    return {k: {"total": counts[k][0], "present": counts[k][1], "span": span[k]} for k in counts}


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

    if result["total"] is None or result["present"] is None:
        roster = find_roster(text)[key]
        if roster["span"] and roster["total"]:
            lo, hi = roster["span"]
            if result["total"] is None:
                result["total"] = Hit(roster["total"], lo, hi, "COUNT_ROSTER")
            if result["present"] is None:
                result["present"] = Hit(roster["present"], lo, hi, "COUNT_ROSTER")

    return {"total": result["total"], "present": result["present"], "conflicts": conflicts}


def find_attendance_pair(text: str) -> dict:
    """이사와 감사를 함께 읽는다. **감사가 아예 없는 회사**를 여기서 판정한다.

    감사를 두지 않는 회사는 의사록에 감사 줄 자체가 없다. 그때 `미기재` 로 두면
    필수 항목이 영영 비지만, 0 으로 단정하면 읽기 실패와 구분이 안 된다.
    그래서 **이사 쪽을 제대로 읽었을 때에 한해** 0 으로 보고 규칙 이름을 남긴다.
    """
    directors = find_attendance(text, "directors")
    audit = find_attendance(text, "auditCommittee")

    read_directors = directors["total"] is not None and directors["present"] is not None
    no_audit_word = not re.search(r"감\s*사(?!\s*보고)", text)
    if read_directors and audit["total"] is None and audit["present"] is None:
        roster = find_roster(text)["auditCommittee"]
        if roster["total"] == 0 or no_audit_word:
            anchor = directors["total"].start
            audit["total"] = Hit(0, anchor, anchor, "COUNT_ABSENT_ZERO")
            audit["present"] = Hit(0, anchor, anchor, "COUNT_ABSENT_ZERO")
    return {"directors": directors, "auditCommittee": audit}


# ---------------------------------------------------------------- 의안

AGENDA_RE = re.compile(
    r"(?m)^[\s\W]{0,6}?(?:"
    r"[제第]\s*(?P<n1>\d+)\s*(?:[호號]\s*)?(?P<kind1>의\s*안|안\s*건|보\s*고\s*사\s*항)"
    r"|(?P<kind2>의\s*안|안\s*건|보\s*고\s*사\s*항)\s*[제第]\s*(?P<n2>\d+)\s*[호號]"
    r"|(?P<kind3>보\s*고\s*사\s*항)\s*(?P<n3>\d+)\s*[.)]"
    r")"
)

# 의안 구간이 여기까지 이어지지 않게 끊는 말
AGENDA_STOP_RE = re.compile(
    r"(?m)^[\s\W]{0,6}?(?:" + _label("폐", "회") + r"|" + _label("산", "회")
    + r"|이상[과와]?\s*같이|위와\s*같이\s*(?:결의|의결)"
    + r"|위\s*의사의\s*경과|위\s*결의를\s*명확히|본\s*의사록을\s*작성"
    + r"|의장은\s*이상으로써)"
)

# 앞에서 떼는 것과 뒤에서 떼는 것을 나눈다. 닫는 괄호를 뒤에서 떼면
# `…의 건(상법 제398조)` 이 잘린다.
TITLE_LEAD = " \t:：.·-–—「『【\"'"
TITLE_TAIL = " \t:：.·-–—\"'"


# 제목 덩어리의 한계. 끝을 못 찾는 서식에서 본문까지 삼키지 않도록 막는다.
TITLE_MAX_LINES = 3
TITLE_MAX_CHARS = 200

# 의안 제목은 `…의 건` 으로, 보고 제목은 `…보고` 로 끝난다. 뒤에 괄호주가 붙기도 한다.
# **빈 줄에 기대지 않는다** — PDF 에서 뽑은 본문에는 빈 줄이 없다.
TITLE_END_RE = re.compile(r"(?:건|보고)\s*(?:[(（][^)）]*[)）])?\s*$")


def _title_block(text: str, start: int, limit: int) -> tuple[int, int]:
    """제목이 끝나는 자리.

    한 줄씩 늘려 가며 `…의 건` 으로 끝나는 지점에서 멈춘다. 긴 제목이 다음 줄로
    넘어가는 서식과, 제목이 한 줄로 끝나는 서식을 같은 규칙으로 다룬다.
    끝을 못 찾으면 첫 줄만 쓴다 — 본문을 삼키는 것보다 짧게 자르는 편이 낫다.
    """
    cap = min(limit, start + TITLE_MAX_CHARS)
    blank = text.find("\n\n", start)
    if blank != -1:
        cap = min(cap, blank)

    at, lines, first_end = start, 0, None
    while lines < TITLE_MAX_LINES:
        nl = text.find("\n", at)
        line_end = cap if nl == -1 or nl > cap else nl
        if first_end is None:
            first_end = line_end
        if TITLE_END_RE.search(re.sub(r"\s+", " ", text[start:line_end]).strip()):
            return start, line_end
        if line_end >= cap:
            break
        at, lines = line_end + 1, lines + 1
    return start, first_end if first_end is not None else cap


def _title_in(text: str, start: int, end: int) -> tuple[str, int, int]:
    """제목에서 앞뒤 장식을 떼고, **뗀 뒤의 구간**을 돌려준다.

    값과 근거 구간이 정확히 같아야 한다. 근거가 한 글자라도 값보다 넓으면 화면에서
    하이라이트가 엉뚱한 곳까지 덮는다.
    """
    raw = text[start:end]
    title = raw.lstrip(TITLE_LEAD).rstrip(TITLE_TAIL)
    if not title:
        return "", start, end
    at = start + raw.find(title)
    return title, at, at + len(title)


# 구역 머리말 없이 `1. 제목` 으로만 적는 서식. 라벨 줄(`1. 일시: …`)과 구분해야 하므로
# **한국 의사록에서 의안 제목이 `…의 건` 으로 끝난다는 관행**을 판별에 쓴다.
# 내용어를 보지 않으므로 회사가 달라도 그대로 듣는다.
BARE_AGENDA_RE = re.compile(r"(?m)^[ \t]*(\d{1,2})[ \t]*[.)][ \t]*(?=\S)")
# 의안 제목은 `…의 건` 으로 끝난다. 다만 뒤에 괄호주가 붙는 경우가 있다
# (`…승인의 건(상법 제398조)`, `…변경의 건(주주총회 부의)`).
AGENDA_TAIL_RE = re.compile(r"건\s*(?:[(（][^)）]*[)）])?\s*$")


def _bare_agenda(text: str) -> list[re.Match]:
    out = []
    for m in BARE_AGENDA_RE.finditer(text):
        start, end = _title_block(text, m.end(), len(text))
        title = re.sub(r"\s+", " ", text[start:end]).strip()
        if "：" in title or ":" in title or not AGENDA_TAIL_RE.search(title):
            continue
        out.append(m)
    return out


def find_agenda(text: str) -> list[dict]:
    """의안 경계와 제목. 본문은 다음 의안이 시작하기 직전까지로 자른다."""
    marks = list(AGENDA_RE.finditer(text))
    if not marks:
        marks = _bare_agenda(text)
    if not marks:
        return []

    items = []
    for i, m in enumerate(marks):
        if m.re is BARE_AGENDA_RE:
            number, kind = int(m.group(1)), "결의"
        else:
            number = int(m.group("n1") or m.group("n2") or m.group("n3"))
            kind_raw = (m.group("kind1") or m.group("kind2") or m.group("kind3") or "").replace(" ", "")
            kind = "보고" if kind_raw == "보고사항" else "결의"

        limit = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        block_start, block_end = _title_block(text, m.end(), limit)
        title, title_start, title_end = _title_in(text, block_start, block_end)
        title = re.sub(r"\s+", " ", title)

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

# 결의 낱말. 본문에는 심의 과정의 말이 섞이므로 **마지막에 나오는 것**이 결론이다.
VOTE_WORD_RE = re.compile(r"가\s*결|부\s*결|보\s*류|연\s*기|철\s*회|승\s*인|의\s*결|채\s*택")

# 결론 문장 안에서만 본다. 순서가 뜻을 가른다 — `수정하여 가결` 은 수정가결이다.
# 수정 언급 없이 가결이면 원안가결로 본다. 상법 실무의 분류가 그렇고,
# `이를 가결하다` 처럼 원안이라는 말이 생략되는 서식이 많다.
RESOLUTION_RULES = [
    ("부결", re.compile(r"부\s*결")),
    ("보류", re.compile(r"보\s*류|연\s*기(?!한)|철\s*회|차기\s*이사회")),
    ("수정가결", re.compile(r"수\s*정")),
    ("원안가결", re.compile(r"가\s*결|승\s*인|의\s*결|채\s*택")),
]

VOTE_RE = {
    "for": re.compile(r"찬\s*성\s*[:：]?\s*(\d+)\s*[명인표]"),
    "against": re.compile(r"반\s*대\s*[:：]?\s*(\d+)\s*[명인표]"),
    "abstain": re.compile(r"기\s*권\s*[:：]?\s*(\d+)\s*[명인표]"),
}
UNANIMOUS_RE = re.compile(r"만장일치|전원\s*찬성|이의\s*없이|전원이\s*찬성")


def _conclusion(body: str) -> tuple[int, int] | None:
    """결론 문장의 구간. 마지막 결의 낱말이 든 문장 하나만 돌려준다.

    본문 전체를 보면 심의 과정의 `연기`·`철회` 같은 말이 결론을 덮어쓴다.
    실제로 그 때문에 가결을 보류로 잘못 읽은 건이 81건 있었다.
    """
    last = None
    for m in VOTE_WORD_RE.finditer(body):
        last = m
    if last is None:
        return None
    head = max(body.rfind("다.", 0, last.start()) + 2, body.rfind("\n\n", 0, last.start()) + 2, 0)
    return head, min(len(body), last.end() + 12)


def find_resolution(text: str, body_start: int, body_end: int, kind: str) -> dict:
    body = text[body_start:body_end]
    out: dict = {"resolution": None, "votes": {}, "unanimous": None}

    span = _conclusion(body)
    if span:
        lo, hi = span
        sentence = body[lo:hi]
        for label, pattern in RESOLUTION_RULES:
            m = pattern.search(sentence)
            if m:
                at = body_start + lo + m.start()
                out["resolution"] = Hit(label, at, at + len(m.group(0)), f"RESOLUTION_{label}")
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
