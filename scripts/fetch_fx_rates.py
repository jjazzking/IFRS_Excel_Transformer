#!/usr/bin/env python3
"""
서울외국환중개 고시 환율을 받아 `src/data/fx/` 아래 JSON 으로 저장한다.

왜 미리 받아 두는가 — 이 앱은 GitHub Pages 정적 호스팅이다. 브라우저가 smbs.biz 를
직접 부르면 CORS 에 막히고, 사이트가 http 라 https 페이지에서는 아예 차단된다.
그래서 기준서 JSON 과 같은 방식을 쓴다. 정해진 시각에 여기서 받아 커밋하고,
앱은 저장소 안의 JSON 만 읽는다.

    python3 scripts/fetch_fx_rates.py                     # 기본 통화, 최근 3년
    python3 scripts/fetch_fx_rates.py --currencies USD,JPY --years 1
    python3 scripts/fetch_fx_rates.py --from 2024-01-01 --to 2024-12-31
    python3 scripts/fetch_fx_rates.py --all-currencies    # 고시되는 통화 전부

이미 받아 둔 날짜는 그대로 두고 새 날짜만 덧붙인다. 같은 날짜가 다시 오면
새로 받은 값으로 바꾼다 — 사이트가 값을 정정하는 경우가 있다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from smbs import Currency, NoTableError, fetch_period, list_currencies, parse_currency_label  # noqa: E402

# 국내 감사 실무에서 외화환산 조서에 자주 오르는 통화부터 담는다.
# 위안은 CNH(역외) 만 담는다 — 선택 목록에 CNY 도 있지만 고시 자료가 비어 있다.
# 전부 받고 싶으면 --all-currencies 를 쓴다.
DEFAULT_CURRENCIES = [
    "USD", "JPY", "EUR", "CNH", "HKD", "GBP", "AUD",
    "SGD", "VND", "THB", "IDR", "MYR", "PHP", "INR", "CAD", "CHF", "TWD",
]

OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "data" / "fx"

# 한 번에 묻는 기간.
#
# 사이트의 화면에는 12개월 버튼이 있지만, 긴 기간을 물으면 표가 통째로 비어 오는
# 일이 잦다. 통화마다 다르고 같은 통화도 그때그때 다르다 — 서버 사정으로 보인다.
# 90일쯤으로 끊으면 거의 어긋나지 않는다. 요청 수는 늘지만 빠진 날이 없는 편이 낫다.
CHUNK_DAYS = 90

# 빈 표가 와도 곧바로 포기하지 않는다. 잠깐 쉬었다 다시 묻는다.
EMPTY_RETRIES = 3
RETRY_DELAY_SEC = [3.0, 7.0, 15.0]

# 남의 서버다. 요청 사이에 잠깐씩 쉰다.
POLITE_DELAY_SEC = 1.2

# 고시가 이만큼 끊기면 공휴일이 아니라 못 받은 것으로 본다.
#
# 국내 연휴가 가장 길게 붙는 때는 추석에 개천절·한글날이 겹칠 때다. 2025년 10월이
# 그랬고 고시가 달력 기준 8일 끊겼다. 그보다 하루 더 잡아 두어야 진짜 연휴에
# 헛경보가 울리지 않는다. 못 받은 구간은 보통 90일 단위라 이 문턱으로도 잡힌다.
GAP_DAYS = 10


def date_chunks(start: dt.date, end: dt.date):
    cur = start
    while cur <= end:
        stop = min(cur + dt.timedelta(days=CHUNK_DAYS), end)
        yield cur, stop
        cur = stop + dt.timedelta(days=1)


def dump_doc(doc: dict) -> str:
    """
    한 줄에 하루씩 적는다.

    기본 들여쓰기로 적으면 하루가 열 줄이 되어 diff 로 무엇이 바뀌었는지 볼 수 없고
    파일도 두 배가 된다. 머리말만 들여쓰고 rows 는 한 줄에 한 날짜씩 적는다.
    """
    head = {k: v for k, v in doc.items() if k != "rows"}
    lines = [json.dumps(head, ensure_ascii=False, indent=1)[:-2] + ",", ' "rows": [']
    rows = doc["rows"]
    for i, row in enumerate(rows):
        comma = "," if i < len(rows) - 1 else ""
        lines.append("  " + json.dumps(row, ensure_ascii=False) + comma)
    lines.append(" ]")
    lines.append("}")
    return "\n".join(lines) + "\n"


def load_existing(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def merge_rows(old: list[dict], new: list[dict]) -> list[dict]:
    """날짜를 열쇠로 합친다. 같은 날짜는 새로 받은 값이 이긴다."""
    by_date = {r["date"]: r for r in old if r.get("date")}
    for r in new:
        if r.get("date"):
            by_date[r["date"]] = r
    return [by_date[d] for d in sorted(by_date)]


def fetch_span(code: str, start: dt.date, end: dt.date, notes: list[str]):
    """
    한 구간을 받는다. 표가 비어 오면 쉬었다 다시 묻는다.

    빈 표는 두 가지를 뜻할 수 있다 — 그 기간에 고시가 없거나, 서버가 이번에
    주지 않았거나. 미리 가릴 수 없으므로 몇 번 다시 물어보고, 그래도 비면
    그 구간만 비워 둔 채 넘어가되 무엇이 비었는지 기록한다.
    """
    last: NoTableError | None = None
    for attempt in range(EMPTY_RETRIES + 1):
        try:
            result = fetch_period(code, start.isoformat(), end.isoformat())
            time.sleep(POLITE_DELAY_SEC)
            return result.currency, result.rows
        except NoTableError as exc:
            last = exc
            if attempt < EMPTY_RETRIES:
                time.sleep(RETRY_DELAY_SEC[attempt])

    notes.append(f"{start}~{end} 비어 있음 ({EMPTY_RETRIES + 1}번 물었다): {last.excerpt if last else ''}")
    return None, []


def fetch_currency(code: str, start: dt.date, end: dt.date) -> tuple[Currency | None, list[dict], list[str]]:
    currency: Currency | None = None
    rows: list[dict] = []
    notes: list[str] = []
    for chunk_start, chunk_end in date_chunks(start, end):
        cur, chunk_rows = fetch_span(code, chunk_start, chunk_end, notes)
        currency = currency or cur
        rows = merge_rows(rows, chunk_rows)
    return currency, rows, notes


def find_gaps(rows: list[dict]) -> list[str]:
    """고시가 길게 끊긴 자리. 공휴일이 아니라 못 받은 것일 수 있어 눈에 보여야 한다."""
    gaps = []
    for a, b in zip(rows, rows[1:]):
        days = (dt.date.fromisoformat(b["date"]) - dt.date.fromisoformat(a["date"])).days
        if days >= GAP_DAYS:
            gaps.append(f"{a['date']}~{b['date']}({days}일)")
    return gaps


def main() -> int:
    today = dt.date.today()
    ap = argparse.ArgumentParser(description="서울외국환중개 고시 환율 내려받기")
    ap.add_argument("--currencies", help="쉼표로 구분한 통화 코드 (예: USD,JPY,EUR)")
    ap.add_argument("--all-currencies", action="store_true", help="고시되는 통화 전부")
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

    catalog = {c.code: c for c in list_currencies()}
    if args.all_currencies:
        codes = list(catalog)
    elif args.currencies:
        codes = [c.strip().upper() for c in args.currencies.split(",") if c.strip()]
    else:
        codes = DEFAULT_CURRENCIES

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"기간 {start} ~ {end} · 통화 {len(codes)}개")
    index: list[dict] = []
    failed: list[tuple[str, str]] = []
    incomplete: list[tuple[str, list[str]]] = []

    for code in codes:
        path = out_dir / f"{code}.json"
        existing = load_existing(path)
        try:
            currency, rows, notes = fetch_currency(code, start, end)
            for note in notes[:3]:
                print(f"       · {note}")
        except Exception as exc:  # noqa: BLE001 - 한 통화가 막혀도 나머지는 계속한다
            print(f"  {code:4s} 실패: {type(exc).__name__} {exc}")
            failed.append((code, f"{type(exc).__name__}: {exc}"))
            if existing:
                index.append({k: existing[k] for k in ("code", "name", "unit", "from", "to", "count") if k in existing})
            continue

        meta = catalog.get(code) or currency or parse_currency_label(code) or Currency(code=code, name=code)
        merged = merge_rows(existing.get("rows", []), rows)
        if not merged:
            print(f"  {code:4s} 자료 없음")
            failed.append((code, "빈 결과"))
            continue

        doc = {
            "code": meta.code,
            "name": meta.name,
            "unit": meta.unit,
            "source": "서울외국환중개 (www.smbs.biz)",
            "sourceUrl": "http://www.smbs.biz/ExRate/StdExRate.jsp",
            "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "from": merged[0]["date"],
            "to": merged[-1]["date"],
            "count": len(merged),
            "rows": merged,
        }
        path.write_text(dump_doc(doc), encoding="utf-8")
        added = len(merged) - len(existing.get("rows", []))
        gaps = find_gaps(merged)
        gap_note = f"  ⚠ 끊긴 자리 {len(gaps)}곳: {' '.join(gaps[:3])}" if gaps else ""
        print(
            f"  {code:4s} {meta.name:14s} {len(merged):5d}일 "
            f"({merged[0]['date']}~{merged[-1]['date']}) 새로 {added}일{gap_note}"
        )
        if gaps:
            incomplete.append((code, gaps))
        index.append({k: doc[k] for k in ("code", "name", "unit", "from", "to", "count")})

    (out_dir / "index.json").write_text(
        json.dumps(
            {
                "source": "서울외국환중개 (www.smbs.biz)",
                "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                "currencies": sorted(index, key=lambda c: DEFAULT_CURRENCIES.index(c["code"])
                                     if c["code"] in DEFAULT_CURRENCIES else 999),
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )

    print(f"\n통화 {len(index)}개 저장 → {out_dir}")
    if failed:
        print("받지 못한 통화:")
        for code, why in failed:
            print(f"  {code}: {why}")
    if incomplete:
        print("\n중간이 끊긴 통화 — 같은 기간으로 한 번 더 돌리면 채워진다:")
        for code, gaps in incomplete:
            print(f"  {code}: {len(gaps)}곳  {' '.join(gaps[:5])}")
    return 1 if not index else 0


if __name__ == "__main__":
    sys.exit(main())
