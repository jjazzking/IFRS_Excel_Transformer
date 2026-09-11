#!/usr/bin/env python3
"""
이사회 의사록 PDF 를 정규 데이터 스키마 JSON 으로 옮긴다. (1단계 PoC)

    python3 scripts/parse_minutes.py samples/minutes           # 폴더 통째로
    python3 scripts/parse_minutes.py a.pdf -o out --print      # 한 건, 화면에도 출력

**모델을 부르지 않는다.** API 키도, 네트워크도, 비용도 없다. 한국 이사회 의사록의
서식이 강한 덕분에 대부분의 필드가 규칙으로 잡힌다 (`scripts/minutes_rules.py`).
규칙으로 안 되는 자리는 값을 지어내지 않고 `검토 필요` 로 남긴다.

규칙이 못 하는 일은 둘뿐이다.
  1. 스캔 페이지의 글자 읽기 — OCR 이 필요하다. 해당 페이지는 `scanPages` 로 보고한다.
  2. 의안 요약 문장 쓰기 — 여기서는 결의 문장을 **발췌**한다 (`method: extractive`).

무엇이 규칙만으로 되고 무엇이 안 되는지는 돌려 보면 숫자로 나온다. 그 숫자를 보고
모델을 붙일지 정하면 된다. `scripts/eval_minutes.py` 가 그 채점을 한다.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import minutes_rules as rules  # noqa: E402
from minutes_text import MinutesText  # noqa: E402

SCHEMA_VERSION = 1
RULE_VERSION = "2026-09-11"

# 필수 12항목 중 대화전문을 뺀 것. 비어 있으면 검토 대상이다.
REQUIRED_FIELDS = [
    ("meeting.heldAt.date", "일시"),
    ("meeting.place", "장소"),
    ("attendance.directors.total", "총 이사 수"),
    ("attendance.directors.present", "출석 이사 수"),
    ("attendance.auditCommittee.total", "총 감사위원 수"),
    ("attendance.auditCommittee.present", "출석 감사위원 수"),
]


def _v(hit) -> object:
    return hit.value if hit is not None else None


def _j(hit, text) -> dict | None:
    return hit.to_json(text) if hit is not None else None


# ---------------------------------------------------------------- 뽑기


def parse(path: Path) -> dict:
    text = MinutesText(path)
    body = text.text

    date = rules.find_date(body)
    opened, closed = rules.find_times(body)
    place = rules.find_place(body)
    directors = rules.find_attendance(body, "directors")
    audit = rules.find_attendance(body, "auditCommittee")

    agenda = []
    for item in rules.find_agenda(body):
        start, end = item["bodyRange"]
        resolution = rules.find_resolution(body, start, end, item["kind"])
        summary = rules.extractive_summary(body, start, end)
        impact = rules.find_impact(body, item["title"].value, start, end)

        agenda.append(
            {
                "number": {"ordinal": item["number"], **(_j(item["marker"], text) or {})},
                "kind": item["kind"],
                "title": _j(item["title"], text),
                "body": text.evidence(start, end).to_json(),
                "summary": {
                    "method": "extractive",
                    **( _j(summary, text) or {"value": None, "rule": "SUMMARY_NONE", "evidence": None}),
                },
                "resolution": {
                    "value": _v(resolution["resolution"]),
                    "evidence": (_j(resolution["resolution"], text) or {}).get("evidence"),
                    "votes": {k: _v(h) for k, h in resolution["votes"].items()},
                    "unanimous": bool(_v(resolution["unanimous"])),
                },
                "fsImpact": {
                    "hasImpact": impact["hasImpact"],
                    "reasoning": " · ".join(impact["reasons"]) or None,
                    "standards": impact["standards"],
                    "amounts": [
                        {
                            "raw": a["raw"],
                            "value": a["value"],
                            "unit": a["unit"],
                            "evidence": text.evidence(a["start"], a["end"]).to_json(),
                        }
                        for a in impact["amounts"]
                    ],
                    "note": "규칙이 고른 검토 후보다. 영향 여부는 사람이 판단한다.",
                },
                "_range": (start, end),
            }
        )

    doc = {
        "schemaVersion": SCHEMA_VERSION,
        "extraction": {"method": "rules", "llmUsed": False, "ruleVersion": RULE_VERSION},
        "source": text.summary(),
        "meeting": {
            "heldAt": {
                "date": _v(date),
                "startTime": _v(opened),
                "endTime": _v(closed),
                "evidence": (_j(date, text) or {}).get("evidence"),
            },
            "place": _j(place, text),
        },
        "attendance": {
            "directors": {
                "total": _v(directors["total"]),
                "present": _v(directors["present"]),
                "evidence": (_j(directors["total"], text) or {}).get("evidence"),
            },
            "auditCommittee": {
                "total": _v(audit["total"]),
                "present": _v(audit["present"]),
                "evidence": (_j(audit["total"], text) or {}).get("evidence"),
            },
        },
        "agenda": agenda,
    }

    doc["review"] = validate(doc, text, {"directors": directors, "auditCommittee": audit})
    for item in doc["agenda"]:
        item.pop("_range", None)
    return doc


# ---------------------------------------------------------------- 검증

def _flag(flags: list, code: str, level: str, message: str, where: str | None = None) -> None:
    flags.append({"code": code, "level": level, "message": message, "where": where})


def validate(doc: dict, text: MinutesText, counts: dict) -> dict:
    """모델 없이 도는 교차검증. 값싸고, 재현되고, 실제로 잘 잡는다.

    스스로 매긴 신뢰도는 쓰지 않는다 — 근거가 없는 숫자다. 대신 서로 맞아야 하는
    값들을 맞춰 본다 (`docs/minutes-plan.md` 5장).
    """
    flags: list[dict] = []

    if text.scan_pages:
        _flag(flags, "SCAN_PAGE", "P1",
              f"이미지 페이지 {text.scan_pages} — 규칙으로 읽지 못한다. OCR 이 필요하다.",
              "source")

    for path, label in REQUIRED_FIELDS:
        node: object = doc
        for key in path.split("."):
            node = (node or {}).get(key) if isinstance(node, dict) else None
        if node is None:
            _flag(flags, "EMPTY_REQUIRED", "P2", f"{label} 을(를) 찾지 못했다.", path)

    for key, label in (("directors", "이사"), ("auditCommittee", "감사위원")):
        group = doc["attendance"][key]
        total, present = group["total"], group["present"]
        if counts[key]["conflicts"]:
            _flag(flags, "COUNT_CONFLICT", "P1",
                  f"{label} 인원이 문서 안에서 여러 값으로 읽힌다: {counts[key]['conflicts']}",
                  f"attendance.{key}")
        if total is not None and present is not None:
            if present > total:
                _flag(flags, "QUORUM_RANGE", "P1",
                      f"출석 {label} {present}명이 총 {label} {total}명보다 많다.", f"attendance.{key}")
            elif key == "directors" and present * 2 <= total:
                _flag(flags, "QUORUM_LEGAL", "P1",
                      f"이사 {total}명 중 {present}명 출석 — 과반수에 못 미친다(상법 391조). "
                      "정관이 요건을 가중했거나, 읽기가 틀렸을 수 있다.", f"attendance.{key}")

    if not doc["agenda"]:
        _flag(flags, "AGENDA_NONE", "P1", "의안을 하나도 찾지 못했다. 서식이 다르거나 스캔본이다.", "agenda")
    else:
        for kind in ("결의", "보고"):
            nums = [a["number"]["ordinal"] for a in doc["agenda"] if a["kind"] == kind]
            if nums and nums != list(range(1, len(nums) + 1)):
                _flag(flags, "AGENDA_SEQ", "P2",
                      f"{kind} 의안번호가 이어지지 않는다: {nums} — 페이지 누락일 수 있다.", "agenda")

    for a in doc["agenda"]:
        where = f"agenda[{a['number']['ordinal']}]"
        if a["resolution"]["value"] is None:
            _flag(flags, "RESOLUTION_MISSING", "P1", "가결 여부를 읽지 못했다.", where)
        votes = a["resolution"]["votes"]
        present = doc["attendance"]["directors"]["present"]
        if votes and present is not None and sum(votes.values()) > present:
            _flag(flags, "VOTE_SUM", "P1",
                  f"찬반 합계 {sum(votes.values())}명이 출석 이사 {present}명을 넘는다.", where)
        if not a["title"]["value"]:
            _flag(flags, "EMPTY_REQUIRED", "P2", "의안제목이 비어 있다.", where)

    heldAt = doc["meeting"]["heldAt"]
    if heldAt["startTime"] and heldAt["endTime"] and heldAt["endTime"] < heldAt["startTime"]:
        _flag(flags, "TIME_ORDER", "P2",
              f"폐회({heldAt['endTime']})가 개회({heldAt['startTime']})보다 앞선다.", "meeting.heldAt")

    ranges = [a.get("_range") for a in doc["agenda"] if a.get("_range")]
    for (s1, e1), (s2, _) in zip(ranges, ranges[1:]):
        if e1 > s2:
            _flag(flags, "SPAN_OVERLAP", "P2", "의안 구간이 겹친다.", "agenda")

    return {
        "flags": flags,
        "needsReviewCount": len(flags),
        "p1Count": sum(1 for f in flags if f["level"] == "P1"),
    }


# ---------------------------------------------------------------- CLI


def _report(name: str, doc: dict) -> None:
    m, att = doc["meeting"], doc["attendance"]
    print(f"\n── {name}")
    print(f"   일시 {m['heldAt']['date'] or '?'} {m['heldAt']['startTime'] or ''}"
          f"~{m['heldAt']['endTime'] or ''}   장소 {(m['place'] or {}).get('value') or '?'}")
    print(f"   이사 {att['directors']['present']}/{att['directors']['total']}   "
          f"감사위원 {att['auditCommittee']['present']}/{att['auditCommittee']['total']}   "
          f"의안 {len(doc['agenda'])}건   페이지 {doc['source']['pageCount']}"
          f"{' (스캔 ' + str(doc['source']['scanPages']) + ')' if doc['source']['scanPages'] else ''}")
    for a in doc["agenda"]:
        print(f"   [{a['kind']} 제{a['number']['ordinal']}호] {a['title']['value']}"
              f" → {a['resolution']['value'] or '?'}"
              f"{'  ' + ','.join(a['fsImpact']['standards']) if a['fsImpact']['standards'] else ''}")
    for f in doc["review"]["flags"]:
        print(f"   ! {f['level']} {f['code']}: {f['message']}")


def main() -> int:
    ap = argparse.ArgumentParser(description="이사회 의사록 PDF → 정규 스키마 JSON (규칙 전용)")
    ap.add_argument("target", type=Path, help="PDF 파일 또는 PDF 가 든 폴더")
    ap.add_argument("-o", "--out", type=Path, default=Path("out/minutes"), help="JSON 을 쓸 폴더")
    ap.add_argument("--print", dest="show", action="store_true", help="요약을 화면에도 출력")
    args = ap.parse_args()

    if args.target.is_dir():
        pdfs = sorted(args.target.glob("*.pdf"))
    elif args.target.exists():
        pdfs = [args.target]
    else:
        print(f"없는 경로: {args.target}", file=sys.stderr)
        return 1
    if not pdfs:
        print(f"PDF 가 없다: {args.target}", file=sys.stderr)
        return 1

    args.out.mkdir(parents=True, exist_ok=True)
    total_flags = 0
    for pdf in pdfs:
        doc = parse(pdf)
        (args.out / f"{pdf.stem}.json").write_text(
            json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        total_flags += doc["review"]["needsReviewCount"]
        if args.show:
            _report(pdf.name, doc)

    print(f"\n{len(pdfs)}건 → {args.out}/  ·  검토 필요 표시 {total_flags}건")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
