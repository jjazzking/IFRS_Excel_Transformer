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
from smbs import Currency, fetch_period, list_currencies, parse_currency_label  # noqa: E402

# 국내 감사 실무에서 외화환산 조서에 자주 오르는 통화부터 담는다.
# 전부 받고 싶으면 --all-currencies 를 쓴다.
DEFAULT_CURRENCIES = [
    "USD", "JPY", "EUR", "CNY", "CNH", "HKD", "GBP", "AUD",
    "SGD", "VND", "THB", "IDR", "MYR", "PHP", "INR", "CAD", "CHF", "TWD",
]

OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "data" / "fx"

# 사이트의 기간 조회는 12개월까지가 한 번에 눌러 볼 수 있는 최대다.
# 그보다 긴 기간은 잘라서 여러 번 묻는다.
CHUNK_DAYS = 330

# 남의 서버다. 요청 사이에 잠깐씩 쉰다.
POLITE_DELAY_SEC = 1.2


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


def fetch_currency(code: str, start: dt.date, end: dt.date) -> tuple[Currency | None, list[dict]]:
    currency: Currency | None = None
    rows: list[dict] = []
    for chunk_start, chunk_end in date_chunks(start, end):
        result = fetch_period(code, chunk_start.isoformat(), chunk_end.isoformat())
        currency = currency or result.currency
        rows = merge_rows(rows, result.rows)
        time.sleep(POLITE_DELAY_SEC)
    return currency, rows


def main() -> int:
    today = dt.date.today()
    ap = argparse.ArgumentParser(description="서울외국환중개 고시 환율 내려받기")
    ap.add_argument("--currencies", help="쉼표로 구분한 통화 코드 (예: USD,JPY,EUR)")
    ap.add_argument("--all-currencies", action="store_true", help="고시되는 통화 전부")
    ap.add_argument("--years", type=int, default=3, help="최근 몇 년치 (기본 3)")
    ap.add_argument("--from", dest="date_from", help="시작일 YYYY-MM-DD")
    ap.add_argument("--to", dest="date_to", help="종료일 YYYY-MM-DD")
    ap.add_argument("--out", default=str(OUT_DIR), help="저장 폴더")
    args = ap.parse_args()

    end = dt.date.fromisoformat(args.date_to) if args.date_to else today
    if args.date_from:
        start = dt.date.fromisoformat(args.date_from)
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

    for code in codes:
        path = out_dir / f"{code}.json"
        existing = load_existing(path)
        try:
            currency, rows = fetch_currency(code, start, end)
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
        print(f"  {code:4s} {meta.name:14s} {len(merged):5d}일 ({merged[0]['date']}~{merged[-1]['date']}) 새로 {added}일")
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
        print("실패:")
        for code, why in failed:
            print(f"  {code}: {why}")
    return 1 if not index else 0


if __name__ == "__main__":
    sys.exit(main())
