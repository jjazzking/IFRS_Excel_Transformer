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
from minutes_ocr import engine_or_none  # noqa: E402
from minutes_text import MinutesText  # noqa: E402

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
        "agenda": [(a["index"], a["title"], a["vote"]["result"], _money(a)) for a in gt.get("agenda", [])],
        "reportCount": len(gt.get("reports", [])),
    }


# 정답셋의 사실 중 **금액인 것만.** 크기로 거르면 안 된다 — `new_shares` 는 114만
# '주'인데 금액으로 세면 그 의안이 통째로 오답이 된다. 주식 수·이율·개월 수·지분율은
# 금액이 아니다. 단가(`issue_price`·`unit_price`)도 뺀다: 본문에 늘 적히지는 않고,
# 만 원 단위라 다른 숫자와 우연히 겹친다.
MONEY_KEYS = ("limit", "amount", "total_amount")


def _money(item: dict) -> set[float]:
    facts = item.get("facts") or {}
    return {
        float(facts[k]) for k in MONEY_KEYS
        if isinstance(facts.get(k), (int, float)) and not isinstance(facts.get(k), bool)
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
        impact = rules.find_impact(text, item["title"].value, *item["bodyRange"])
        resolved.append((item["number"], item["title"].value, res.value if res else None,
                         {a["value"] for a in impact["amounts"] if a["value"] is not None}))

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


FIELDS = ["일시", "개회시각", "폐회시각", "장소", "이사 수", "감사 수", "의안 경계", "의안제목",
          "가결 여부", "금액"]


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
    for idx, title, result, cash in want["agenda"]:
        hit = got_by.get(idx)
        check("의안제목", bool(hit) and same_title(hit[1], title),
              f"{title} → {hit[1] if hit else '(못 찾음)'}")
        check("가결 여부", bool(hit) and hit[2] == result,
              f"{result} → {hit[2] if hit else '(못 찾음)'}")
        # 금액은 **그 의안 안에서** 찾아야 맞은 것이다. 다른 의안에 붙으면 조서에서
        # 엉뚱한 줄에 들어간다. 정답 금액마다 한 자리씩 준다.
        picked = hit[3] if hit else set()
        for want_won in sorted(cash):
            check("금액", want_won in picked,
                  f"{want_won:,.0f} → {', '.join(f'{v:,.0f}' for v in sorted(picked)) or '(못 찾음)'}")
    return out


def body_of(golden_path: Path, source: str, ocr) -> str | None:
    """채점에 쓸 본문. 서식 경로마다 어디서 글자가 오는지가 다르다."""
    if source == "text":
        sibling = golden_path.with_suffix(".txt")
        return sibling.read_text(encoding="utf-8") if sibling.exists() else None
    name = golden_path.stem + ("_scan.pdf" if source == "scan" else ".pdf")
    pdf = golden_path.with_name(name)
    if not pdf.exists():
        return None
    return MinutesText(pdf, ocr=ocr).text


def _measure(job: tuple[str, str, str | None]) -> tuple[str, dict] | None:
    """한 건을 읽고 뽑는다. 엔진은 문서마다 새로 만든다 — 방향 판정 상태가 섞이면 안 된다."""
    path, source, engine_name = job
    jf = Path(path)
    body = body_of(jf, source, engine_or_none(engine_name))
    if body is None:
        return None
    return jf.stem, extract(body)


def run_group(paths: list[Path], source: str, engine_name: str | None,
              tally: dict, misses: dict) -> None:
    """한 갈래를 순서대로 채점한다.

    **병렬로 돌리지 않는다.** PDF 렌더러(MuPDF)는 스레드 안전하지 않고, 이미 띄운
    상태에서 프로세스를 포크하면 멈춘다. 둘 다 겪었다. 한 건에 3초 남짓이라
    200건이 10분이면 끝나므로 나눌 이유도 없다.
    """
    results = [_measure((str(p), source, engine_name)) for p in paths]

    for jf, result in zip(paths, results):
        if result is None:
            continue
        stem, got = result
        want = golden_of(json.loads(jf.read_text(encoding="utf-8")))
        for field, (ok, n) in score(got, want, misses, stem).items():
            tally[field][0] += ok
            tally[field][1] += n


def main() -> int:
    ap = argparse.ArgumentParser(description="모의 의사록으로 규칙 대량 채점")
    ap.add_argument("gen_dir", type=Path, help="minutes_generator 출력 폴더. 하위 폴더가 있으면 폴더별로 나눠 잰다")
    ap.add_argument("--limit", type=int, default=0, help="폴더마다 앞에서 N건만")
    ap.add_argument("--show", type=int, default=4, help="필드마다 실패 예시 몇 개")
    ap.add_argument("--source", choices=("text", "pdf", "scan"), default="text",
                    help="본문을 어디서 읽나. text=생성기 본문, pdf=깨끗한 PDF, scan=열화본")
    ap.add_argument("--ocr", metavar="엔진", default=None, help="스캔본을 읽을 OCR 엔진 (tesseract)")
    args = ap.parse_args()

    groups: dict[str, list[Path]] = {}
    own = sorted(args.gen_dir.glob("*.json"))
    if own:
        groups[args.gen_dir.name] = own
    for sub in sorted(d for d in args.gen_dir.iterdir() if d.is_dir()):
        found = sorted(sub.glob("*.json"))
        if found:
            groups[sub.name] = found
    if args.limit:
        groups = {k: v[: args.limit] for k, v in groups.items()}
    if not groups:
        print(f"표본이 없다: {args.gen_dir}", file=sys.stderr)
        return 1

    tally = {f: [0, 0] for f in FIELDS}
    misses: dict[str, list] = {f: [] for f in FIELDS}
    report_gap = Counter()
    per_group: list[tuple[str, int, int, int]] = []

    for name, paths in groups.items():
        before = {f: list(v) for f, v in tally.items()}
        run_group(paths, args.source, args.ocr, tally, misses)
        ok = sum(tally[f][0] - before[f][0] for f in FIELDS)
        total = sum(tally[f][1] - before[f][1] for f in FIELDS)
        per_group.append((name, len(paths), ok, total))

    label = {"text": "생성기 본문", "pdf": "깨끗한 PDF", "scan": "스캔 열화본"}[args.source]
    engine = f" · OCR {args.ocr}" if args.ocr else ""
    if len(per_group) > 1:
        print(f"\n[갈래별] {label}{engine}\n")
        print(f"{'갈래':<16}{'건수':>6}{'정확도':>10}{'맞음/전체':>14}")
        print("─" * 48)
        for name, count, ok, total in per_group:
            if total:
                print(f"{name:<16}{count:>6}{ok / total:>9.1%}{f'{ok}/{total}':>14}")
    samples = sum(c for _, c, _, _ in per_group)
    print(f"\n표본 {samples}건 · 규칙 전용 · {label}{engine} · 생성기 정답셋 대비\n")
    print(f"{'필드':<12}{'정확도':>9}{'맞음/전체':>14}")
    print("─" * 36)
    tot_ok = tot_n = 0
    for field in FIELDS:
        ok, n = tally[field]
        tot_ok, tot_n = tot_ok + ok, tot_n + n
        print(f"{field:<12}{ok / n:>8.1%}{f'{ok}/{n}':>14}")
    print("─" * 36)
    print(f"{'전체':<12}{tot_ok / tot_n:>8.1%}{f'{tot_ok}/{tot_n}':>14}")

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
