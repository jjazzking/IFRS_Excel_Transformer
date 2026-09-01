#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
파싱된 기준서 JSON을 src/data/standards/ 에 검증 후 배치한다.

사용법:
    python3 scripts/ingest_standards.py <JSON이_있는_디렉터리|파일...> [--check-only]

파일명은 끝에 4자리 기준서 번호가 있어야 한다(예: 1d3507f4-1001.json → k-ifrs-1001.json).
검증 항목: 배열 형식 / 기준서·문단 필수 필드 / category 유효값 /
          기준서·문단 id 중복 / 빈 content / 문단 메타(standardId 등) 일치 여부.
문제가 하나라도 있으면 아무 파일도 배치하지 않고 종료한다.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import shutil
import sys

DEST = "src/data/standards"
DATA_TS = "src/data/standardsData.ts"
VALID_CATEGORIES = {"수익/비용", "자산/부채", "금융상품", "표시/공시", "특수회계"}
NUM_RE = re.compile(r"(\d{4})\.json$")


def collect(paths: list[str]) -> list[str]:
    found: list[str] = []
    for p in paths:
        if os.path.isdir(p):
            found.extend(glob.glob(os.path.join(p, "*.json")))
        else:
            found.append(p)
    return sorted(found)


def hand_written_ids() -> set[str]:
    """standardsData.ts 에 손으로 적어둔 샘플 기준서 id (중복 감지용)."""
    if not os.path.exists(DATA_TS):
        return set()
    src = open(DATA_TS, encoding="utf-8").read()
    return set(re.findall(r"^    id: '([^']+)'", src, re.M))


def existing_ids(skip_numbers: set[str]) -> dict[str, str]:
    """이미 배치된 JSON 의 기준서 id → 파일명. 이번에 교체될 파일은 제외한다."""
    out: dict[str, str] = {}
    for f in sorted(glob.glob(os.path.join(DEST, "*.json"))):
        m = NUM_RE.search(f)
        if m and m.group(1) in skip_numbers:
            continue
        for s in json.load(open(f, encoding="utf-8")):
            out[s["id"]] = os.path.basename(f)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="기준서 JSON 검증 및 배치")
    ap.add_argument("paths", nargs="+", help="JSON 파일 또는 디렉터리")
    ap.add_argument("--check-only", action="store_true", help="검증만 하고 배치하지 않음")
    args = ap.parse_args()

    files = collect(args.paths)
    if not files:
        sys.exit("처리할 JSON 파일이 없습니다.")

    numbers = {m.group(1) for f in files if (m := NUM_RE.search(f))}
    hand_ids = hand_written_ids()
    repo_ids = existing_ids(numbers)

    problems: list[tuple] = []
    rows: list[tuple] = []
    plan: list[tuple[str, str]] = []
    seen: dict[str, str] = {}

    for f in files:
        base = os.path.basename(f)
        m = NUM_RE.search(f)
        if not m:
            problems.append((base, "파일명 끝에서 4자리 기준서 번호를 찾지 못했습니다"))
            continue
        no = m.group(1)

        try:
            data = json.load(open(f, encoding="utf-8"))
        except json.JSONDecodeError as e:
            problems.append((base, f"JSON 파싱 실패: {e}"))
            continue
        if not isinstance(data, list):
            problems.append((base, "최상위가 기준서 배열([...])이 아닙니다"))
            continue

        for s in data:
            for k in ("id", "code", "title", "category", "paragraphs"):
                if k not in s:
                    problems.append((base, "기준서 필수 필드 누락", k))
            if "id" not in s or "paragraphs" not in s:
                continue
            if s.get("category") not in VALID_CATEGORIES:
                problems.append((base, "category 가 유효하지 않음", s.get("category")))
            if s["id"] in seen:
                problems.append((base, "업로드분끼리 기준서 id 중복", s["id"], seen[s["id"]]))
            seen[s["id"]] = base
            if s["id"] in hand_ids:
                problems.append((base, "standardsData.ts 샘플과 기준서 id 중복", s["id"]))
            if s["id"] in repo_ids:
                problems.append((base, "기존 JSON과 기준서 id 중복", s["id"], repo_ids[s["id"]]))

            empty = badmeta = 0
            pids: set[str] = set()
            for p in s["paragraphs"]:
                for k in ("id", "number", "content"):
                    if k not in p:
                        problems.append((base, "문단 필수 필드 누락", p.get("number"), k))
                if not p.get("content", "").strip():
                    empty += 1
                meta = (p.get("standardId"), p.get("standardCode"), p.get("standardTitle"))
                if meta != (s["id"], s["code"], s["title"]):
                    badmeta += 1
                if p.get("id") in pids:
                    problems.append((base, "문단 id 중복", p.get("id")))
                pids.add(p.get("id"))
            if empty:
                problems.append((base, "content 가 빈 문단", empty))
            if badmeta:
                problems.append((base, "문단의 standardId/Code/Title 불일치", badmeta))

            dst = os.path.join(DEST, f"k-ifrs-{no}.json")
            rows.append((no, s["id"], s["title"], s["category"], len(s["paragraphs"]),
                         s.get("effectiveDate", "-"),
                         "교체" if os.path.exists(dst) else "신규"))
        plan.append((f, os.path.join(DEST, f"k-ifrs-{no}.json")))

    for r in sorted(rows):
        print(f"{r[1]:<14} {r[2][:26]:<28} {r[3]:<8} 문단 {r[4]:>4}  eff={r[5]:<11} {r[6]}")
    print(f"\n기준서 {len(rows)}건 / 문단 {sum(r[4] for r in rows)}건")

    if problems:
        print("\n문제가 있어 배치하지 않았습니다:")
        for p in problems:
            print("  -", *p)
        sys.exit(1)
    print("검증 통과 — 문제 없음")

    if args.check_only:
        return
    os.makedirs(DEST, exist_ok=True)
    for src, dst in plan:
        shutil.copyfile(src, dst)
        os.chmod(dst, 0o644)
    print(f"{len(plan)}개 파일을 {DEST}/ 에 배치했습니다.")


if __name__ == "__main__":
    main()
