#!/usr/bin/env python3
"""기준서 DB footing(정합성) 1차 자동 검증 및 검수 워크시트 생성.

사람이 40개 기준서 3,661개 문단을 전수로 읽는 대신, 기계가 잡을 수 있는 결함을
먼저 걸러 검수자에게 '확인이 필요한 지점'만 넘긴다. 판정은 사람이 한다 —
이 스크립트는 볼 곳을 좁히고, 누가 얼마나 볼지를 나눌 뿐이다.

    python3 scripts/audit_standards.py                       # 요약
    python3 scripts/audit_standards.py --assign 4            # 검수자 4명 배분(예상시간 기준)
    python3 scripts/audit_standards.py --worksheet f.csv --assign 4
                                                             # Notion 가져오기용 검수 워크시트
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

DEFAULT_DIR = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'standards'

# 심각도: P1 배포 전 반드시 해소 / P2 사람이 원문과 대조해 판정 / P3 참고
SEVERITY = {
    'NUM_GAP': 'P1',
    'DUP_BODY': 'P1',
    'TOO_SHORT': 'P1',
    'HEADING_LEAK': 'P2',
    'OVERSIZE': 'P2',
    'TAIL_NOISE': 'P2',
    'NO_TERMINAL': 'P3',
    'NO_SECTION': 'P3',
}

RULE_DESC = {
    'NUM_GAP': '본문 문단번호가 중간에 비어 있음(파싱 누락 또는 삭제문단 미표기)',
    'DUP_BODY': '같은 기준서 안에서 본문이 통째로 중복됨',
    'TOO_SHORT': '본문이 15자 미만 — 내용이 잘렸을 가능성',
    'HEADING_LEAK': '마지막 줄이 본문이 아니라 다음 절의 제목으로 보임',
    'OVERSIZE': '2,500자 초과 — 여러 문단이 하나로 붙었을 가능성',
    'TAIL_NOISE': '마지막 줄이 쪽번호·머리말 등 본문이 아닌 흔적으로 보임',
    'NO_TERMINAL': '문장이 종결부호 없이 끝남',
    'NO_SECTION': '문단제목(sectionTitle)이 없어 조서에 제목 행을 넣을 수 없음',
    'SETUP': '원문을 열고 이 기준서의 범위를 확인한다',
    'SAMPLE': '자동검증에 걸리지 않은 문단 — 원문과 그대로 대조한다',
}

# 확인지점 1건을 판정하는 데 걸리는 시간(분). 실측 아니라 계획용 가정이며,
# 1차 검수 결과가 나오면 실제 소요시간으로 갱신한다.
MINUTES = {
    'HEADING_LEAK': 2, 'OVERSIZE': 6, 'TAIL_NOISE': 2, 'DUP_BODY': 4,
    'TOO_SHORT': 3, 'NO_TERMINAL': 1, 'NO_SECTION': 1,
    'SETUP': 5, 'SAMPLE': 3,
}
NUM_GAP_BASE = 10          # 번호 결손은 목차 대조가 필요해 기본 10분,
NUM_GAP_PER_10 = 5         # 누락번호 10개마다 5분을 더한다.

# ⑴ ㈎ ① (1) (가) 가. 1) 등 하위 항목 표지
SUBITEM = re.compile(r'^\s*(?:[⑴-⒇]|[㈀-㈜]|[㉠-㉻]|[①-⑳]|\(\d+\)|\([가-힣a-zA-Z]\)|[가-하]\.|\d+\)|[-·※])')
DELETED = re.compile(r'^\[.*삭제.*\]$')
TERMINAL = ('.', '다', '음', '임', ')', ']', '”', '"', '?', '!', ':', '등')
MAIN_NUM = re.compile(r'^(\d+)([A-Z]*)$')


def load(path: Path) -> list[tuple[Path, dict]]:
    files = sorted(path.glob('*.json')) if path.is_dir() else [path]
    out = []
    for f in files:
        data = json.loads(f.read_text(encoding='utf-8'))
        for std in data if isinstance(data, list) else [data]:
            out.append((f, std))
    return out


def row_minutes(rule: str, evidence: str) -> int:
    if rule == 'NUM_GAP':
        missing = int(evidence.split('개')[0]) if evidence[:1].isdigit() else 10
        return NUM_GAP_BASE + (missing // 10) * NUM_GAP_PER_10
    return MINUTES.get(rule, 2)


def audit_standard(std: dict) -> list[dict]:
    findings: list[dict] = []
    paragraphs = std.get('paragraphs', [])

    def add(rule, para, evidence):
        findings.append({
            'standardId': std.get('id', ''),
            'standardCode': std.get('code', ''),
            'standardTitle': std.get('title', ''),
            'paragraph': para,
            'rule': rule,
            'severity': SEVERITY[rule],
            'evidence': evidence,
        })

    # 이 기준서가 쓰는 제목 집합 — '(문단 31~38)' 같은 범위 표기는 떼고 비교한다.
    titles = set()
    for p in paragraphs:
        for key in ('sectionTitle', 'subTitle'):
            if p.get(key):
                titles.add(re.sub(r'\s*\(문단[^)]*\)\s*$', '', p[key]).strip())

    # 1) 본문 문단번호 결손
    nums = sorted({int(m.group(1)) for p in paragraphs
                   if (m := MAIN_NUM.fullmatch(p.get('number', '')))})
    if nums:
        missing = [n for n in range(nums[0], nums[-1] + 1) if n not in nums]
        if missing:
            preview = ', '.join(map(str, missing[:20])) + (' …' if len(missing) > 20 else '')
            add('NUM_GAP', f'{nums[0]}~{nums[-1]}', f'{len(missing)}개 누락: {preview}')

    seen: dict[str, str] = {}
    for p in paragraphs:
        num = p.get('number', '?')
        body = (p.get('content') or '').strip()
        lines = [l.strip() for l in body.split('\n') if l.strip()]
        last = lines[-1] if lines else ''

        if len(body) < 15:
            add('TOO_SHORT', num, body[:60])
        # 2) 본문 중복 — '[…삭제…]' 표기는 여러 문단에 정상적으로 반복된다.
        if len(body) > 80 and not DELETED.match(body):
            if body in seen:
                add('DUP_BODY', num, f'문단 {seen[body]} 과(와) 동일: {body[:60]}…')
            seen[body] = num
        if len(body) > 2500:
            add('OVERSIZE', num, f'{len(body):,}자')
        # 3) 제목 유입 — 여러 줄 문단의 마지막 줄이 짧고, 항목 표지도 종결부호도 없을 때
        if len(lines) > 1 and last and len(last) <= 25 and not SUBITEM.match(last) \
                and not last.endswith(TERMINAL):
            if re.fullmatch(r'[\d\s.·\-]+', last):
                add('TAIL_NOISE', num, last)
            else:
                known = ' (다른 문단의 제목과 일치)' if last in titles else ''
                add('HEADING_LEAK', num, last + known)
        elif body and not body.endswith(TERMINAL) and not DELETED.match(body):
            add('NO_TERMINAL', num, body[-40:])
        if not p.get('sectionTitle'):
            add('NO_SECTION', num, body[:40])
    return findings


def sample_rows(std: dict, flagged: set[str], count: int, rng: random.Random) -> list[dict]:
    """자동검증에 걸리지 않은 문단에서 무작위 표본을 뽑는다.

    자동검증 규칙이 놓치는 유형의 결함이 있는지 보는 것이 목적이므로,
    이미 검출된 문단은 표본에서 제외한다."""
    pool = [p for p in std.get('paragraphs', []) if p.get('number') not in flagged]
    picked = rng.sample(pool, min(count, len(pool)))
    picked.sort(key=lambda p: std['paragraphs'].index(p))
    rows = []
    for p in picked:
        rows.append({
            'standardId': std['id'], 'standardCode': std.get('code', ''),
            'standardTitle': std.get('title', ''), 'paragraph': p.get('number', '?'),
            'rule': 'SAMPLE', 'severity': '표본',
            'evidence': (p.get('content') or '').strip()[:60].replace('\n', ' ') + '…',
        })
    return rows


def build_rows(standards, limit: set[str], sample: int, seed: int):
    """기준서별 (행 목록, 예상시간) 을 만든다. 행에는 착수·검출·표본이 모두 들어간다."""
    rng = random.Random(seed)
    per_std: dict[str, dict] = {}
    for _, std in standards:
        found = [f for f in audit_standard(std) if f['severity'] in limit]
        rows = [{
            'standardId': std['id'], 'standardCode': std.get('code', ''),
            'standardTitle': std.get('title', ''), 'paragraph': '—',
            'rule': 'SETUP', 'severity': '착수', 'evidence': RULE_DESC['SETUP'],
        }] + found
        if sample:
            rows += sample_rows(std, {f['paragraph'] for f in found}, sample, rng)
        for r in rows:
            r['minutes'] = row_minutes(r['rule'], r['evidence'])
        per_std[std['id']] = {
            'code': std.get('code', ''), 'title': std.get('title', ''),
            'paras': len(std.get('paragraphs', [])), 'rows': rows,
            'minutes': sum(r['minutes'] for r in rows),
            'checks': len(found),
            'p1': sum(1 for f in found if f['severity'] == 'P1'),
            'p2': sum(1 for f in found if f['severity'] == 'P2'),
        }
    return per_std


def assign(per_std: dict, n: int) -> dict[str, int]:
    """예상시간이 큰 기준서부터, 아직 여유가 있는 담당자 중 가장 한가한 쪽에 붙인다.

    담당 기준서 수는 정확히 균등하게(40 ÷ n) 맞추면서 시간 편차를 줄인다."""
    cap = -(-len(per_std) // n)
    load = [0] * n
    count = [0] * n
    out = {}
    for sid, s in sorted(per_std.items(), key=lambda kv: -kv[1]['minutes']):
        i = min((j for j in range(n) if count[j] < cap), key=lambda j: load[j])
        out[sid] = i + 1
        load[i] += s['minutes']
        count[i] += 1
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description='기준서 DB footing 1차 자동 검증')
    ap.add_argument('path', nargs='?', default=str(DEFAULT_DIR), help='기준서 JSON 파일 또는 폴더')
    ap.add_argument('--worksheet', help='검수 워크시트 CSV 경로 (Notion 가져오기용)')
    ap.add_argument('--json', dest='json_out', help='검출 결과 JSON 저장 경로')
    ap.add_argument('--assign', type=int, metavar='N', default=0, help='검수자 N명에게 배분')
    ap.add_argument('--sample', type=int, default=5, metavar='N',
                    help='기준서당 표본 문단 수 (기본 5, 0이면 표본 없음)')
    ap.add_argument('--seed', type=int, default=20260908,
                    help='표본 추출 난수 시드 — 같은 값이면 같은 표본이 나온다')
    ap.add_argument('--severity', default='P2', choices=['P1', 'P2', 'P3'],
                    help='이 심각도까지 검수 대상에 포함 (기본 P2)')
    args = ap.parse_args()

    path = Path(args.path)
    if not path.exists():
        print(f'경로를 찾을 수 없습니다: {path}', file=sys.stderr)
        return 1

    limit = {'P1': {'P1'}, 'P2': {'P1', 'P2'}, 'P3': {'P1', 'P2', 'P3'}}[args.severity]
    standards = load(path)
    per_std = build_rows(standards, limit, args.sample, args.seed)
    owner = assign(per_std, args.assign) if args.assign else {}

    all_rows = [r for s in per_std.values() for r in s['rows']]
    by_rule = Counter(r['rule'] for r in all_rows if r['rule'] not in ('SETUP', 'SAMPLE'))
    total_p = sum(s['paras'] for s in per_std.values())
    total_min = sum(s['minutes'] for s in per_std.values())

    print(f'기준서 {len(per_std)}건 / 문단 {total_p:,}건 검사 (검수 대상 {args.severity} 이상)\n')
    print(f'{"규칙":<14}{"심각도":<7}{"건수":>6}  설명')
    print('-' * 96)
    for rule in sorted(by_rule, key=lambda r: (SEVERITY[r], -by_rule[r])):
        print(f'{rule:<14}{SEVERITY[rule]:<7}{by_rule[rule]:>6}  {RULE_DESC[rule]}')
    print('-' * 96)
    checks = sum(s['checks'] for s in per_std.values())
    p1 = sum(s['p1'] for s in per_std.values())
    print(f'확인지점 {checks:,}곳 (P1 {p1} · 전체 문단의 {checks / total_p:.1%})'
          f' + 표본 {args.sample * len(per_std):,}문단')
    print(f'예상 소요 {total_min:,}분 = {total_min / 60:.1f}시간', end='')
    if args.assign:
        print(f' → {args.assign}명이면 1인 {total_min / args.assign / 60:.1f}시간')
    else:
        print()

    if args.assign:
        print(f'\n검수자 {args.assign}명 배분')
        buckets = defaultdict(list)
        for sid, who in owner.items():
            buckets[who].append(sid)
        for who in sorted(buckets):
            sids = sorted(buckets[who], key=lambda s: -per_std[s]['minutes'])
            mins = sum(per_std[s]['minutes'] for s in sids)
            names = ', '.join(s.replace('k-ifrs-', '제') + '호' for s in sids)
            print(f'  검수자 {who}: 기준서 {len(sids)}건 / 확인지점 '
                  f'{sum(per_std[s]["checks"] for s in sids):>3}곳 / '
                  f'{mins}분 ({mins / 60:.1f}시간)\n    {names}')

    if args.worksheet:
        with open(args.worksheet, 'w', encoding='utf-8-sig', newline='') as fh:
            w = csv.writer(fh)
            w.writerow(['항목', '상태', '담당자', '심각도', '기준서', '기준서명', '문단',
                        '규칙', '검출근거', '예상시간(분)', '판정', '수정내용', '대조출처', '비고'])
            order = {'착수': 0, 'P1': 1, 'P2': 2, 'P3': 3, '표본': 4}
            rows = sorted(all_rows, key=lambda r: (owner.get(r['standardId'], 0),
                                                   r['standardId'], order[r['severity']]))
            for r in rows:
                num = r['standardCode'].replace('K-IFRS ', '')
                w.writerow([
                    f'{num} {r["paragraph"]} · {r["rule"]}',
                    '미착수',
                    f'검수자 {owner[r["standardId"]]}' if owner else '',
                    r['severity'], num, r['standardTitle'], r['paragraph'], r['rule'],
                    r['evidence'], r['minutes'], '', '', '', '',
                ])
        print(f'\n검수 워크시트: {args.worksheet} ({len(all_rows):,}행)')

    if args.json_out:
        Path(args.json_out).write_text(
            json.dumps([{k: v for k, v in r.items()} for r in all_rows],
                       ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'검출 결과 JSON: {args.json_out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
