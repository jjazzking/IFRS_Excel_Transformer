#!/usr/bin/env python3
"""
`minutes_generator` 가 만든 모의 의사록으로 **규칙을 대량 채점**한다.

    python3 scripts/bench_minutes.py <생성기 출력 폴더> [--limit 200] [--show 5]

왜 별도의 도구인가 — `eval_minutes.py` 는 PDF 를 거친 결과를 채점한다. 여기서는
생성기의 본문 텍스트를 규칙에 바로 먹인다. **시험 대상이 규칙 자체이기 때문**이다.
PDF 읽기에서 생긴 문제와 규칙에서 생긴 문제가 섞이면 어느 쪽을 고쳐야 할지 모른다.

정답셋은 생성기가 같은 시드에서 함께 낸 것을 쓴다 (`minutes_XXXX.json`).
내가 만든 표본이 아니므로 서식 분포가 내 정규식에 맞춰져 있지 않다. 그래서
여기 숫자가 지금까지 중 가장 정직하다 — 다만 여전히 합성이다.

**주의**: 이 폴더로 규칙을 고쳤다면, 그 뒤 이 폴더에서 나온 점수는 성능이 아니다.
봉인해 둔 다른 시드 범위에서 마지막에 한 번 재야 한다.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import minutes_rules as rules  # noqa: E402

# 생성기 정답셋의 제목에는 조사 자리표가 남아 있다 (`주식회사(으)로부터의`).
# 본문에는 조사가 골라져 찍히므로, 채점할 때만 자리표를 지운다.
JOSA_MARK = re.compile(r"\((으|이|가|과|와|을|를|은|는|로|랑)\)")


def fold(value: object) -> str:
    """공백을 접는다. OCR 이 낱자를 벌려 놓아도 같게 본다."""
    return re.sub(r"\s+", "", str(value or "")).strip()


def same_title(got: object, want: object) -> bool:
    """정답셋의 조사 자리표 `(으)로` 는 본문에서 `으로` 또는 `로` 로 찍힌다.

    어느 쪽으로 찍혔는지는 앞 글자의 받침이 정한다. 채점은 둘 다 정답으로 본다 —
    규칙이 틀린 게 아니라 정답셋의 표기가 열려 있는 것이다.
    """
    a, b = fold(got), fold(want)
    if a == b:
        return True
    pattern = re.escape(b)
    for mark in set(JOSA_MARK.findall(b)):
        pattern = pattern.replace(re.escape(f"({mark})"), f"(?:{re.escape(mark)})?")
    return re.fullmatch(pattern, a) is not None


def golden_of(gt: dict) -> dict:
    """생성기 정답셋을 이 저장소의 채점 형식으로 옮긴다."""
    m = gt["meeting"]
    return {
        "date": m.get("date"),
        "startTime": m.get("start_time"),
        "endTime": m.get("end_time"),
        "place": m.get("place"),
        "directors": (m.get("total_directors"), m.get("present_directors")),
        "auditors": (m.get("total_auditors"), m.get("present_auditors")),
        "agenda": [(a["index"], a["title"], a["vote"]["result"]) for a in gt.get("agenda", [])],
        "reportCount": len(gt.get("reports", [])),
    }


def extract(text: str) -> dict:
    """규칙만으로 뽑는다. `parse_minutes.py` 와 같은 순서, PDF 단계만 뺀 것."""
    date = rules.find_date(text)
    opened, closed = rules.find_times(text)
    place = rules.find_place(text)
    pair = rules.find_attendance_pair(text)
    directors, audit = pair["directors"], pair["auditCommittee"]

    resolved, reports = [], 0
    for item in rules.find_agenda(text):
        if item["kind"] == "보고":
            reports += 1
            continue
        res = rules.find_resolution(text, *item["bodyRange"], item["kind"])["resolution"]
        resolved.append((item["number"], item["title"].value, res.value if res else None))

    v = lambda h: h.value if h is not None else None  # noqa: E731
    return {
        "date": v(date),
        "startTime": v(opened),
        "endTime": v(closed),
        "place": v(place),
        "directors": (v(directors["total"]), v(directors["present"])),
        "auditors": (v(audit["total"]), v(audit["present"])),
        "agenda": resolved,
        "reportCount": reports,
    }


FIELDS = ["일시", "개회시각", "폐회시각", "장소", "이사 수", "감사 수", "의안 경계", "의안제목", "가결 여부"]


def score(got: dict, want: dict, misses: dict, name: str) -> dict:
    """필드별 (맞음, 전체). 의안제목·가결 여부는 정답 의안 수만큼 자리가 있다."""
    out: dict[str, list[int]] = {f: [0, 0] for f in FIELDS}

    def check(field: str, ok: bool, note: str = "") -> None:
        out[field][1] += 1
        if ok:
            out[field][0] += 1
        elif len(misses[field]) < 400:
            misses[field].append((name, note))

    check("일시", got["date"] == want["date"], f"{want['date']} → {got['date']}")
    check("개회시각", got["startTime"] == want["startTime"], f"{want['startTime']} → {got['startTime']}")
    check("폐회시각", got["endTime"] == want["endTime"], f"{want['endTime']} → {got['endTime']}")
    check("장소", fold(got["place"]) == fold(want["place"]), f"{want['place']} → {got['place']}")
    check("이사 수", got["directors"] == want["directors"], f"{want['directors']} → {got['directors']}")
    check("감사 수", got["auditors"] == want["auditors"], f"{want['auditors']} → {got['auditors']}")

    want_idx = [a[0] for a in want["agenda"]]
    got_idx = [a[0] for a in got["agenda"]]
    check("의안 경계", want_idx == got_idx, f"{want_idx} → {got_idx}")

    got_by = {a[0]: a for a in got["agenda"]}
    for idx, title, result in want["agenda"]:
        hit = got_by.get(idx)
        check("의안제목", bool(hit) and same_title(hit[1], title),
              f"{title} → {hit[1] if hit else '(못 찾음)'}")
        check("가결 여부", bool(hit) and hit[2] == result,
              f"{result} → {hit[2] if hit else '(못 찾음)'}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="모의 의사록으로 규칙 대량 채점")
    ap.add_argument("gen_dir", type=Path, help="minutes_generator 출력 폴더 (.txt + .json)")
    ap.add_argument("--limit", type=int, default=0, help="앞에서 N건만")
    ap.add_argument("--show", type=int, default=4, help="필드마다 실패 예시 몇 개")
    args = ap.parse_args()

    pairs = []
    for jf in sorted(args.gen_dir.glob("*.json")):
        tf = jf.with_suffix(".txt")
        if tf.exists():
            pairs.append((tf, jf))
    if args.limit:
        pairs = pairs[: args.limit]
    if not pairs:
        print(f"표본이 없다: {args.gen_dir}/*.json + .txt", file=sys.stderr)
        return 1

    tally = {f: [0, 0] for f in FIELDS}
    misses: dict[str, list] = {f: [] for f in FIELDS}
    report_gap = Counter()

    for tf, jf in pairs:
        want = golden_of(json.loads(jf.read_text(encoding="utf-8")))
        got = extract(tf.read_text(encoding="utf-8"))
        for field, (ok, n) in score(got, want, misses, tf.stem).items():
            tally[field][0] += ok
            tally[field][1] += n
        report_gap[got["reportCount"] - want["reportCount"]] += 1

    print(f"\n표본 {len(pairs)}건 · 규칙 전용 · 생성기 정답셋 대비\n")
    print(f"{'필드':<12}{'정확도':>9}{'맞음/전체':>14}")
    print("─" * 36)
    tot_ok = tot_n = 0
    for field in FIELDS:
        ok, n = tally[field]
        tot_ok, tot_n = tot_ok + ok, tot_n + n
        print(f"{field:<12}{ok / n:>8.1%}{f'{ok}/{n}':>14}")
    print("─" * 36)
    print(f"{'전체':<12}{tot_ok / tot_n:>8.1%}{f'{tot_ok}/{tot_n}':>14}")

    gaps = ", ".join(f"{k:+d}건 {v}" for k, v in sorted(report_gap.items()) if k)
    print(f"\n보고사항 검출 차이: 정확 {report_gap[0]}건" + (f" · {gaps}" if gaps else ""))

    print("\n실패 예시 (정답 → 뽑은 값)")
    for field in FIELDS:
        bad = misses[field]
        if not bad:
            continue
        print(f"\n  [{field}] {tally[field][1] - tally[field][0]}건 실패")
        for name, note in bad[: args.show]:
            print(f"    {name}  {note[:110]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
