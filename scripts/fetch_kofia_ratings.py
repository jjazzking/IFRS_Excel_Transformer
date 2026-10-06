#!/usr/bin/env python3
"""
금투협 채권정보센터 신용등급 속보를 받아 `src/data/ratings/` 아래 JSON 으로 저장한다.

이자율 · 환율과 같은 이유로 미리 받아 둔다 — 브라우저는 kofiabond 를 직접 부를 수 없다(CORS).

    python3 scripts/fetch_kofia_ratings.py               # 최근 3년
    python3 scripts/fetch_kofia_ratings.py --days 40     # 최근 40일 (정기 실행)
    python3 scripts/fetch_kofia_ratings.py --from 2025-01-01 --to 2025-12-31

저장 형태
  events-YYYY.json  평정 한 건이 한 줄. 받은 기간은 통째로 새로 받은 것으로 바꾼다
                    (사이트가 정정하거나 지운 평정도 따라간다).
  latest.json       회사 · 평가사마다 가장 최근 평정 — 앱은 이 파일만 읽는다.

등급은 채권(회사채 탭) 신용등급이다. 기업신용등급(ICR)이 아니다 — 앱이 둘을 구별해
보여 주도록 latest.json 의 평정마다 kind 를 적는다 (지금은 모두 'bond').
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import time
from collections import Counter, defaultdict
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kofia import AGENCIES, KofiaError, RatingEvent, fetch_rating_flash  # noqa: E402

OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "data" / "ratings"
SOURCE = "금융투자협회 채권정보센터 — 신용등급 속보 (채권)"
SOURCE_URL = "https://www.kofiabond.or.kr/"
POLITE_DELAY_SEC = 0.8
# 한 달 응답이 중간에 끊기면(_call 이 이미 몇 번 다시 묻는다) 그 달만 빼고 계속한다.
MAX_CONSECUTIVE_FAILURES = 4

# 높은 등급이 앞. 같은 날 같은 평가사가 종목마다 다른 등급을 줬을 때(후순위 · 신종자본증권 등)
# 가장 많은 종목에 준 등급을 대표로 하고, 개수가 같으면 높은 쪽을 고른다.
GRADE_ORDER = [
    "AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-",
    "BB+", "BB", "BB-", "B+", "B", "B-", "CCC", "CC", "C", "D",
]


# 지급보증 · 신용공여가 붙은 종목은 보증한 회사의 등급을 받는다 — 회사 자신의 등급이 아니다.
# 회차 칸에 '(…지주 지급보증)', '(㈜메리츠금융지주 …' 처럼 적혀 온다. '무보증사채' 는 보증이 아니다.
GUARANTEED = re.compile(r"(?<!무)보증|신용공여|\((?:㈜|\(주\))?[^)]*(?:지주|㈜|\(주\))")


def is_guaranteed(issue: str) -> bool:
    return bool(GUARANTEED.search(issue))


def grade_rank(g: str) -> int:
    return GRADE_ORDER.index(g) if g in GRADE_ORDER else len(GRADE_ORDER)


def month_windows(start: dt.date, end: dt.date):
    d = start
    while d <= end:
        nxt = (d.replace(day=1) + dt.timedelta(days=32)).replace(day=1)
        yield d, min(nxt - dt.timedelta(days=1), end)
        d = nxt


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def dump_events(doc: dict) -> str:
    """머리말은 들여쓰고 events 는 한 줄에 한 건 — diff 로 무엇이 바뀌었는지 보이게."""
    head = {k: v for k, v in doc.items() if k != "events"}
    lines = [json.dumps(head, ensure_ascii=False, indent=1)[:-2] + ",", ' "events": [']
    rows = doc["events"]
    for i, row in enumerate(rows):
        comma = "," if i < len(rows) - 1 else ""
        lines.append("  " + json.dumps(row, ensure_ascii=False, separators=(",", ":")) + comma)
    lines.append(" ]")
    lines.append("}")
    return "\n".join(lines) + "\n"


def summarize(events: list[dict]) -> list[dict]:
    """회사 · 평가사마다 가장 최근 평정일의 등급 하나와, 그날 다른 종목에 준 다른 등급."""
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for e in events:
        groups[(e["company"], e["agency"])].append(e)

    companies: dict[str, list[dict]] = defaultdict(list)
    for (company, agency), evs in groups.items():
        last = max(e["date"] for e in evs)
        day = [e for e in evs if e["date"] == last]
        # 대표 등급은 보증 없는 종목에서 고른다. 그날 보증 종목뿐이면 그 등급을 쓰고 표시한다.
        own = [e for e in day if not is_guaranteed(e["issue"])] or day
        counts = Counter(e["grade"] for e in own)
        grade = sorted(counts, key=lambda g: (-counts[g], grade_rank(g)))[0]
        main = next(e for e in own if e["grade"] == grade)
        others = []
        seen = {(grade, is_guaranteed(main["issue"]))}
        for e in sorted(day, key=lambda e: grade_rank(e["grade"])):
            key = (e["grade"], is_guaranteed(e["issue"]))
            if key in seen:
                continue
            seen.add(key)
            others.append({"grade": e["grade"], "issue": e["issue"], **({"guaranteed": True} if key[1] else {})})
        companies[company].append({
            "kind": "bond",
            "agency": agency,
            "grade": grade,
            "date": last,
            "outlook": main["outlook"],
            "watch": main["watch"],
            "issue": main["issue"],
            "issues": len(day),
            **({"guaranteed": True} if is_guaranteed(main["issue"]) else {}),
            **({"others": others} if others else {}),
        })
    out = []
    for name in sorted(companies):
        ratings = sorted(companies[name], key=lambda r: (r["date"], r["agency"]), reverse=True)
        out.append({"name": name, "ratings": ratings})
    return out


def main() -> int:
    today = dt.date.today()
    ap = argparse.ArgumentParser(description="금투협 신용등급 속보(채권) 내려받기")
    ap.add_argument("--years", type=int, default=3, help="최근 몇 년치 (기본 3)")
    ap.add_argument("--days", type=int, help="최근 며칠치. --years 보다 우선한다")
    ap.add_argument("--from", dest="date_from", help="시작일 YYYY-MM-DD")
    ap.add_argument("--to", dest="date_to", help="종료일 YYYY-MM-DD")
    ap.add_argument("--out", default=str(OUT_DIR), help="저장 폴더")
    args = ap.parse_args()

    end = dt.date.fromisoformat(args.date_to) if args.date_to else today
    if args.date_from:
        start = dt.date.fromisoformat(args.date_from)
    elif args.days:
        start = end - dt.timedelta(days=args.days)
    else:
        start = end.replace(year=end.year - args.years)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"기간 {start} ~ {end}")

    # 연도별 파일을 모두 읽어 둔다 — latest.json 은 받아 둔 평정 전부로 다시 만든다.
    by_year: dict[int, list[dict]] = {}
    for p in sorted(out_dir.glob("events-*.json")):
        by_year[int(p.stem.split("-")[1])] = load_json(p).get("events", [])
    touched: set[int] = set()

    got = 0
    failures: list[str] = []
    consecutive = 0
    for w_start, w_end in month_windows(start, end):
        try:
            events = fetch_rating_flash(w_start, w_end)
            consecutive = 0
        except KofiaError as exc:
            failures.append(f"{w_start} ~ {w_end}: {exc}")
            consecutive += 1
            print(f"  {w_start:%Y-%m} 실패: {exc}")
            if consecutive >= MAX_CONSECUTIVE_FAILURES:
                print(f"{consecutive}번 잇달아 실패 — 여기서 멈추고 받은 데까지 저장한다.")
                break
            continue
        finally:
            time.sleep(POLITE_DELAY_SEC)

        # 받은 기간은 통째로 바꾼다. 기간이 해를 넘지 않으므로 한 해 파일만 건드린다.
        lo, hi = w_start.isoformat(), w_end.isoformat()
        y = w_start.year
        kept = [e for e in by_year.get(y, []) if not (lo <= e["date"] <= hi)]
        fresh = [asdict(e) for e in events]
        by_year[y] = sorted(kept + fresh, key=lambda e: (e["date"], e["company"], e["agency"], e["issue"]))
        touched.add(y)
        got += len(fresh)
        print(f"  {w_start:%Y-%m}: {len(fresh)}건")

    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    for y in sorted(touched):
        evs = by_year[y]
        (out_dir / f"events-{y}.json").write_text(
            dump_events({"year": y, "source": SOURCE, "fetchedAt": now, "count": len(evs), "events": evs}),
            encoding="utf-8",
        )

    all_events = [e for y in sorted(by_year) for e in by_year[y]]
    if not all_events:
        print("받아 둔 평정이 없다.")
        return 1
    companies = summarize(all_events)
    (out_dir / "latest.json").write_text(
        json.dumps(
            {
                "source": SOURCE,
                "sourceUrl": SOURCE_URL,
                "updatedAt": now,
                "from": min(e["date"] for e in all_events),
                "to": max(e["date"] for e in all_events),
                "agencies": AGENCIES,
                "companies": companies,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ) + "\n",
        encoding="utf-8",
    )

    print(f"\n새로 받은 평정 {got}건 · 저장된 평정 전체 {len(all_events)}건 · 회사 {len(companies)}곳 → {out_dir}")
    if failures:
        print(f"받지 못한 달 {len(failures)}개 — 같은 기간으로 다시 돌리면 채워진다:")
        for f in failures:
            print(f"  {f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
