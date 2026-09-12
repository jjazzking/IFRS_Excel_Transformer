#!/usr/bin/env python3
"""
뽑아낸 결과를 정답과 대조해 **필드별 정확도**를 낸다.

    python3 scripts/eval_minutes.py samples/minutes out/minutes

정답 파일은 PDF 옆의 `<이름>.golden.json` 이다 (`scripts/make_sample_minutes.py` 가
만드는 모양). 실제 의사록을 쓸 때는 같은 모양으로 손으로 적으면 된다.

이 숫자가 판단의 근거다 (`docs/minutes-plan.md` 8장). 규칙만으로 목표선을 넘는
필드에는 모델을 붙일 이유가 없고, 못 넘는 필드만 모델로 올리면 된다. '대충 잘 되는
것 같다'로는 이 결정을 못 한다.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

# 목표선 — 틀리면 비싼 순서대로. 숫자·날짜는 조서에 그대로 들어가므로 가장 높다.
TARGETS = {
    "일시(날짜)": 0.98,
    "개회시각": 0.90,
    "폐회시각": 0.90,
    "장소": 0.95,
    "총 이사 수": 0.98,
    "출석 이사 수": 0.98,
    "총 감사위원 수": 0.98,
    "출석 감사위원 수": 0.98,
    "의안 경계": 0.95,
    "의안제목": 0.95,
    "가결 여부": 0.95,
}


def _norm(value) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def compare(parsed: dict, golden: dict) -> list[tuple[str, bool, str, str]]:
    """(필드, 맞았나, 정답, 뽑은값) 목록."""
    got_meeting = parsed.get("meeting", {})
    want_meeting = golden.get("meeting", {})
    got_att = parsed.get("attendance", {})
    want_att = golden.get("attendance", {})

    rows: list[tuple[str, bool, str, str]] = []

    def add(field: str, want, got) -> None:
        rows.append((field, _norm(want) == _norm(got), _norm(want), _norm(got)))

    add("일시(날짜)", want_meeting.get("date"), got_meeting.get("heldAt", {}).get("date"))
    add("개회시각", want_meeting.get("startTime"), got_meeting.get("heldAt", {}).get("startTime"))
    add("폐회시각", want_meeting.get("endTime"), got_meeting.get("heldAt", {}).get("endTime"))
    add("장소", want_meeting.get("place"), (got_meeting.get("place") or {}).get("value"))

    for key, label in (("directors", "이사"), ("auditCommittee", "감사위원")):
        add(f"총 {label} 수", want_att.get(key, {}).get("total"), got_att.get(key, {}).get("total"))
        add(f"출석 {label} 수", want_att.get(key, {}).get("present"), got_att.get(key, {}).get("present"))

    want_agenda = golden.get("agenda", [])
    got_agenda = parsed.get("agenda", [])
    got_by_key = {(a["kind"], a["number"]["ordinal"]): a for a in got_agenda}

    # 의안 경계는 건별이 아니라 문서별로 본다 — 개수와 번호가 다 맞아야 맞은 것이다.
    want_keys = sorted((a["kind"], a["number"]) for a in want_agenda)
    rows.append(("의안 경계", want_keys == sorted(got_by_key), str(want_keys), str(sorted(got_by_key))))

    for want in want_agenda:
        key = (want["kind"], want["number"])
        got = got_by_key.get(key)
        tag = f"{want['kind']}제{want['number']}호"
        add(f"의안제목[{tag}]", want.get("title"), (got or {}).get("title", {}).get("value"))
        add(f"가결 여부[{tag}]", want.get("resolution"), (got or {}).get("resolution", {}).get("value"))

    return rows


def bucket(field: str) -> str:
    """`의안제목[결의제1호]` 를 `의안제목` 으로 묶는다."""
    return field.split("[")[0]


def main() -> int:
    ap = argparse.ArgumentParser(description="의사록 추출 결과 채점")
    ap.add_argument("golden_dir", type=Path, help="`*.golden.json` 이 있는 폴더")
    ap.add_argument("parsed_dir", type=Path, help="`parse_minutes.py` 가 쓴 JSON 폴더")
    ap.add_argument("--detail", action="store_true", help="틀린 항목을 전부 나열")
    args = ap.parse_args()

    goldens = sorted(args.golden_dir.glob("*.golden.json"))
    if not goldens:
        print(f"정답 파일이 없다: {args.golden_dir}/*.golden.json")
        return 1

    tally: dict[str, list[int]] = {}
    misses: list[str] = []
    flag_total = 0

    for gpath in goldens:
        stem = gpath.name[: -len(".golden.json")]
        ppath = args.parsed_dir / f"{stem}.json"
        if not ppath.exists():
            print(f"! 결과 없음: {ppath}")
            continue
        parsed = json.loads(ppath.read_text(encoding="utf-8"))
        golden = json.loads(gpath.read_text(encoding="utf-8"))
        flag_total += parsed.get("review", {}).get("needsReviewCount", 0)

        for field, ok, want, got in compare(parsed, golden):
            slot = tally.setdefault(bucket(field), [0, 0])
            slot[1] += 1
            slot[0] += int(ok)
            if not ok:
                misses.append(f"  {stem}  {field}\n      정답: {want or '(없음)'}\n      뽑음: {got or '(없음)'}")

    print(f"\n표본 {len(goldens)}건 · 검토 필요 표시 {flag_total}건\n")
    print(f"{'필드':<16}{'정확도':>9}{'맞음/전체':>12}   목표   판정")
    print("─" * 58)
    total_ok = total_n = 0
    for field in sorted(tally, key=lambda f: (tally[f][0] / tally[f][1], f)):
        ok, n = tally[field]
        total_ok, total_n = total_ok + ok, total_n + n
        rate = ok / n
        target = TARGETS.get(field)
        verdict = "" if target is None else ("통과" if rate >= target else "미달")
        print(f"{field:<16}{rate:>8.0%}{f'{ok}/{n}':>12}   {f'{target:.0%}' if target else '  -':>4}   {verdict}")
    print("─" * 58)
    print(f"{'전체':<16}{total_ok / total_n:>8.0%}{f'{total_ok}/{total_n}':>12}")

    if misses:
        print(f"\n틀린 항목 {len(misses)}건" + ("" if args.detail else " (전부 보려면 --detail)"))
        for line in (misses if args.detail else misses[:5]):
            print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
