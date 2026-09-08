#!/usr/bin/env python3
"""기준서 DB footing(정합성) 자동 검증 — 어디를 봐야 하는지 짚어 준다.

3,661개 문단을 전수로 읽는 대신, 기계가 잡을 수 있는 결함만 먼저 걸러낸다.
판정과 수정은 사람이 앱의 수정 모드에서 직접 한다.

    python3 scripts/audit_standards.py                # 전체 요약
    python3 scripts/audit_standards.py --severity P1  # 배포 차단 항목만
    python3 scripts/audit_standards.py --json out.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
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
}

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


def main() -> int:
    ap = argparse.ArgumentParser(description='기준서 DB footing 자동 검증')
    ap.add_argument('path', nargs='?', default=str(DEFAULT_DIR), help='기준서 JSON 파일 또는 폴더')
    ap.add_argument('--json', dest='json_out', help='검출 결과 JSON 저장 경로')
    ap.add_argument('--severity', default='P2', choices=['P1', 'P2', 'P3'],
                    help='이 심각도까지 출력 (기본 P2)')
    args = ap.parse_args()

    path = Path(args.path)
    if not path.exists():
        print(f'경로를 찾을 수 없습니다: {path}', file=sys.stderr)
        return 1

    limit = {'P1': {'P1'}, 'P2': {'P1', 'P2'}, 'P3': {'P1', 'P2', 'P3'}}[args.severity]
    standards = load(path)
    per_std: dict[str, dict] = {}
    findings: list[dict] = []
    for _, std in standards:
        found = [f for f in audit_standard(std) if f['severity'] in limit]
        per_std[std['id']] = {'paras': len(std.get('paragraphs', [])), 'found': found}
        findings.extend(found)

    total_p = sum(v['paras'] for v in per_std.values())
    by_rule = Counter(f['rule'] for f in findings)

    print(f'기준서 {len(per_std)}건 / 문단 {total_p:,}건 검사\n')
    print(f'{"규칙":<14}{"심각도":<7}{"건수":>6}  설명')
    print('-' * 96)
    for rule in sorted(by_rule, key=lambda r: (SEVERITY[r], -by_rule[r])):
        print(f'{rule:<14}{SEVERITY[rule]:<7}{by_rule[rule]:>6}  {RULE_DESC[rule]}')
    print('-' * 96)
    p1 = sum(1 for f in findings if f['severity'] == 'P1')
    print(f'확인지점 {len(findings):,}곳 (P1 {p1} · 전체 문단의 {len(findings) / total_p:.1%})')

    ranked = sorted(per_std.items(), key=lambda kv: -len(kv[1]['found']))
    print('\n확인지점이 많은 기준서 — 여기부터 보면 된다')
    for sid, info in ranked[:12]:
        if not info['found']:
            continue
        rules = Counter(f['rule'] for f in info['found'])
        detail = ' '.join(f'{r} {c}' for r, c in rules.most_common())
        print(f'  {sid:<16} 문단 {info["paras"]:>4}  확인지점 {len(info["found"]):>3}  {detail}')
    clean = [sid for sid, info in per_std.items() if not info['found']]
    if clean:
        print(f'\n확인지점 없음 ({len(clean)}건): ' +
              ', '.join(s.replace('k-ifrs-', '제') + '호' for s in sorted(clean)))

    if args.json_out:
        Path(args.json_out).write_text(
            json.dumps(findings, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'\n검출 결과 JSON: {args.json_out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
