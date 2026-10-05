#!/usr/bin/env python3
"""
금융투자협회 채권시가평가수익률(평가사 평균)을 받아 `src/data/rates/` 아래 JSON 으로 저장한다.

왜 미리 받아 두는가 — 환율과 같다. 브라우저는 kofiabond 를 직접 부를 수 없다(CORS).
GitHub Actions 에서 받아 커밋하고, 앱은 저장소 안의 JSON 만 읽는다.

    python3 scripts/fetch_kofia_rates.py               # 최근 3년, 매 영업일
    python3 scripts/fetch_kofia_rates.py --days 14     # 최근 2주 (정기 실행)
    python3 scripts/fetch_kofia_rates.py --from 2025-01-01 --to 2025-12-31

저장 형태
  index.json      열(만기) 머리글 · 행 목록(코드 → 종류 · 종류명 · 신용등급) · 연도별 파일 목록
  avg-YYYY.json   한 줄에 하루씩. {"date": ..., "v": {행코드: [만기별 수익률 …]}}

행 이름을 날마다 되풀이하지 않으려고 index 에 한 번만 적는다. 이미 받아 둔 날짜는 그대로 두고,
같은 날짜가 다시 오면 새로 받은 값으로 바꾼다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kofia import KofiaError, YieldRow, fetch_day_average, fetch_terms  # noqa: E402

OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "data" / "rates"
SOURCE = "금융투자협회 채권정보센터 — 채권시가평가수익률 (평가사 평균)"
SOURCE_URL = "https://www.kofiabond.or.kr/"

# 남의 서버다. 요청 사이에 잠깐씩 쉰다.
POLITE_DELAY_SEC = 0.8

# 한 날짜가 끝내 오지 않아도 나머지는 계속 받는다. 다만 이만큼 잇달아 실패하면
# 사이트가 막힌 것으로 보고 멈춘다 — 받은 데까지는 저장한다.
MAX_CONSECUTIVE_FAILURES = 8


def business_days(start: dt.date, end: dt.date):
    d = start
    while d <= end:
        if d.weekday() < 5:
            yield d
        d += dt.timedelta(days=1)


def dump_year(doc: dict) -> str:
    """머리말은 들여쓰고 rows 는 한 줄에 하루씩 — diff 로 무엇이 바뀌었는지 보이게."""
    head = {k: v for k, v in doc.items() if k != "rows"}
    lines = [json.dumps(head, ensure_ascii=False, indent=1)[:-2] + ",", ' "rows": [']
    rows = doc["rows"]
    for i, row in enumerate(rows):
        comma = "," if i < len(rows) - 1 else ""
        lines.append("  " + json.dumps(row, ensure_ascii=False, separators=(",", ":")) + comma)
    lines.append(" ]")
    lines.append("}")
    return "\n".join(lines) + "\n"


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def snapshot(rows: list[YieldRow]) -> dict[str, list[float | None]]:
    return {r.code: r.values for r in rows}


def main() -> int:
    today = dt.date.today()
    ap = argparse.ArgumentParser(description="금투협 채권시가평가수익률(평가사 평균) 내려받기")
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
    index = load_json(out_dir / "index.json")
    catalog: dict[str, dict] = {r["code"]: r for r in index.get("rows", [])}
    row_order: list[str] = [r["code"] for r in index.get("rows", [])]

    # 머리글은 날짜와 상관없이 같지만, 주말·휴일을 넣으면 비어 올 수 있어 며칠 거슬러 묻는다.
    terms: list[str] = []
    for back in range(7):
        terms = fetch_terms((end - dt.timedelta(days=back)).strftime("%Y%m%d"))
        if terms:
            break
    if not terms:
        print("열 머리글(잔존만기)을 받지 못했다 — 사이트 응답이 바뀌었는지 확인해야 한다.")
        return 1
    if index.get("terms") and index["terms"] != terms:
        # 만기 열이 바뀌면 지난 자료와 열이 어긋난다. 조용히 섞지 않는다.
        print(f"만기 열이 바뀌었다: {index['terms']} → {terms}")
        return 1
    print(f"기간 {start} ~ {end} · 만기 {len(terms)}개: {' '.join(terms)}")

    # 연도별 파일을 열어 두고 날짜를 열쇠로 합친다.
    years: dict[int, dict[str, dict]] = {}
    touched: set[int] = set()

    def year_rows(y: int) -> dict[str, dict]:
        if y not in years:
            doc = load_json(out_dir / f"avg-{y}.json")
            years[y] = {r["date"]: r for r in doc.get("rows", [])}
        return years[y]

    got = skipped_empty = skipped_same = 0
    failures: list[str] = []
    consecutive = 0
    prev: dict[str, list[float | None]] | None = None
    for day in business_days(start, end):
        key = day.strftime("%Y%m%d")
        try:
            rows = fetch_day_average(key, len(terms))
            consecutive = 0
        except KofiaError as exc:
            failures.append(f"{day}: {exc}")
            consecutive += 1
            print(f"  {day} 실패: {exc}")
            if consecutive >= MAX_CONSECUTIVE_FAILURES:
                print(f"{consecutive}번 잇달아 실패 — 여기서 멈추고 받은 데까지 저장한다.")
                break
            continue
        finally:
            time.sleep(POLITE_DELAY_SEC)

        if not rows:
            skipped_empty += 1
            continue
        snap = snapshot(rows)
        # 휴일에 직전 영업일 표가 그대로 오는 경우를 거른다. 43행 × 16만기가 하루 사이에
        # 한 칸도 안 바뀌는 일은 실제로는 없다.
        if prev is not None and snap == prev:
            skipped_same += 1
            continue
        prev = snap

        for r in rows:
            if r.code not in catalog:
                row_order.append(r.code)
            catalog[r.code] = {"code": r.code, "category": r.category, "type": r.type, "grade": r.grade}
        year_rows(day.year)[day.isoformat()] = {"date": day.isoformat(), "v": snap}
        touched.add(day.year)
        got += 1
        if got % 50 == 0:
            print(f"  … {day} 까지 {got}일")

    files = []
    for y in sorted(set(years) | {int(p.stem.split("-")[1]) for p in out_dir.glob("avg-*.json")}):
        by_date = year_rows(y)
        if not by_date:
            continue
        ordered = [by_date[d] for d in sorted(by_date)]
        doc = {
            "year": y,
            "source": SOURCE,
            "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "from": ordered[0]["date"],
            "to": ordered[-1]["date"],
            "count": len(ordered),
            "rows": ordered,
        }
        if y in touched:
            (out_dir / f"avg-{y}.json").write_text(dump_year(doc), encoding="utf-8")
        files.append({k: doc[k] for k in ("year", "from", "to", "count")})

    # 행 순서는 처음 본 순서, 곧 사이트 표의 순서다. 코드 순과는 다르다 — 사이트는 보증
    # 회사채(702…)를 무보증(701…)보다 앞에 둔다.
    (out_dir / "index.json").write_text(
        json.dumps(
            {
                "source": SOURCE,
                "sourceUrl": SOURCE_URL,
                "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                "unit": "%",
                "terms": terms,
                "rows": [catalog[c] for c in row_order],
                "files": files,
            },
            ensure_ascii=False,
            indent=1,
        ) + "\n",
        encoding="utf-8",
    )

    total = sum(f["count"] for f in files)
    print(f"\n새로 받은 날 {got}일 · 빈 날 {skipped_empty}일 · 앞날과 같아 거른 날 {skipped_same}일")
    print(f"저장된 날짜 전체 {total}일 · 행 {len(row_order)}개 → {out_dir}")
    if failures:
        print(f"받지 못한 날 {len(failures)}일 — 같은 기간으로 다시 돌리면 채워진다:")
        for f in failures[:20]:
            print(f"  {f}")
    return 0 if total else 1


if __name__ == "__main__":
    sys.exit(main())
