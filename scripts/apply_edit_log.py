#!/usr/bin/env python3
"""앱에서 내보낸 수정 기록을 검토 문서로 정리하고, 승인되면 원본 JSON 에 반영한다.

수정 모드에서 고친 내용은 브라우저에만 있고 원본 파일은 그대로다. 이 스크립트가
그 사이를 잇는다 — 먼저 검토 문서를 만들어 사람이 보고, 괜찮으면 --apply 로 반영한다.

    python3 scripts/apply_edit_log.py ~/Downloads/standards-edit-log-*.json
        → docs/edit-log.md 생성 + 검증 결과 출력

    python3 scripts/apply_edit_log.py ~/Downloads/*.json --apply
        → 검증을 통과한 기록만 src/data/standards/*.json 에 반영
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'src' / 'data' / 'standards'
DEFAULT_DOC = ROOT / 'docs' / 'edit-log.md'

try:  # 수정한 문단이 자동검증에 걸렸던 지점인지 함께 보여주기 위해
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from audit_standards import audit_standard
except Exception:  # pragma: no cover - 스크립트가 없어도 문서는 만들 수 있다
    audit_standard = None


def load_logs(paths: list[Path]) -> list[dict]:
    """여러 사람이 각자 내보낸 기록을 하나로 모은다. 같은 문단은 마지막 수정만 남긴다."""
    records: list[dict] = []
    for path in paths:
        data = json.loads(path.read_text(encoding='utf-8'))
        edits = data.get('edits', data if isinstance(data, list) else [])
        for e in edits:
            e['_source'] = path.name
            records.append(e)

    latest: dict[str, dict] = {}
    conflicts: dict[str, list[dict]] = defaultdict(list)
    for e in sorted(records, key=lambda r: r.get('editedAt', '')):
        pid = e['paragraphId']
        if pid in latest:
            conflicts[pid].append(latest[pid])
        latest[pid] = e
    for pid, losers in conflicts.items():
        latest[pid]['_superseded'] = [
            f"{l['editor']} ({l.get('editedAt', '')[:16].replace('T', ' ')}, {l['_source']})"
            for l in losers
        ]
    return sorted(latest.values(), key=lambda e: (e['standardId'], e['paragraphNumber']))


def load_standards() -> tuple[dict[str, dict], dict[str, Path]]:
    """문단 id → 문단, 기준서 id → 파일 경로"""
    paragraphs: dict[str, dict] = {}
    files: dict[str, Path] = {}
    for f in sorted(DATA_DIR.glob('*.json')):
        for std in json.loads(f.read_text(encoding='utf-8')):
            files[std['id']] = f
            for p in std['paragraphs']:
                paragraphs[p['id']] = p
    return paragraphs, files


def verify(edit: dict, paragraphs: dict[str, dict]) -> tuple[str, str]:
    """수정 기록이 지금 원본에 그대로 적용 가능한지 본다."""
    p = paragraphs.get(edit['paragraphId'])
    if p is None:
        return 'MISSING', '원본에 이 문단이 없습니다 (기준서가 바뀌었을 수 있음)'
    current = p.get('content', '')
    if current == edit['before']['content']:
        return 'OK', ''
    if current == edit['after']['content']:
        return 'DONE', '이미 반영되어 있습니다'
    return 'STALE', '원본이 수정 기록의 "수정 전"과 다릅니다 — 다른 판본에서 고쳤을 수 있습니다'


def flagged_rules(std_id: str, paragraph_number: str, cache: dict) -> str:
    """이 문단이 자동검증에 걸렸던 지점인지"""
    if audit_standard is None:
        return ''
    if std_id not in cache:
        found = {}
        for f in DATA_DIR.glob('*.json'):
            for std in json.loads(f.read_text(encoding='utf-8')):
                if std['id'] == std_id:
                    for item in audit_standard(std):
                        found.setdefault(item['paragraph'], []).append(item['rule'])
        cache[std_id] = found
    return ', '.join(cache[std_id].get(paragraph_number, []))


def summarize(edit: dict) -> str:
    before, after = edit['before']['content'], edit['after']['content']
    parts = []
    if before != after:
        if before.startswith(after):
            removed = before[len(after):].strip().replace('\n', ' ')
            parts.append(f'끝부분 {len(before) - len(after)}자 삭제 ("{removed[:40]}")')
        elif after.startswith(before):
            added = after[len(before):].strip().replace('\n', ' ')
            parts.append(f'끝에 {len(after) - len(before)}자 추가 ("{added[:40]}")')
        else:
            parts.append(f'본문 수정 ({len(after) - len(before):+d}자)')
    for key, label in (('sectionTitle', '대분류 제목'), ('subTitle', '소분류 제목')):
        b, a = edit['before'].get(key) or '', edit['after'].get(key) or ''
        if b != a:
            parts.append(f'{label} "{b or "(없음)"}" → "{a or "(없음)"}"')
    return ' · '.join(parts) or '변경 없음'


def build_document(edits: list[dict], checks: dict[str, tuple[str, str]]) -> str:
    status_label = {'OK': '반영 가능', 'DONE': '이미 반영됨', 'STALE': '확인 필요',
                    'MISSING': '문단 없음'}
    lines = ['# 기준서 수정 로그 (검토용)', '']
    editors = Counter(e['editor'] for e in edits)
    lines.append(f'- 수정 문단 **{len(edits)}개**')
    lines.append('- 수정자: ' + ', '.join(f'{n} {c}건' for n, c in editors.most_common()))
    counts = Counter(checks[e['paragraphId']][0] for e in edits)
    lines.append('- 상태: ' + ', '.join(f'{status_label[k]} {v}건' for k, v in counts.items()))
    lines.append('')
    lines.append('> 이 문서는 `scripts/apply_edit_log.py` 가 앱에서 내보낸 수정 기록으로 만듭니다.')
    lines.append('> 아래를 확인한 뒤 `--apply` 로 원본에 반영합니다.')
    lines.append('')

    lines += ['## 한눈에 보기', '',
              '| 상태 | 기준서 | 문단 | 수정자 | 무엇이 바뀌었나 | 자동검증 |',
              '| --- | --- | --- | --- | --- | --- |']
    cache: dict = {}
    for e in edits:
        state, _ = checks[e['paragraphId']]
        rules = flagged_rules(e['standardId'], e['paragraphNumber'], cache)
        cell = summarize(e).replace('|', r'\|')
        lines.append(
            f"| {status_label[state]} | {e['standardCode']} | {e['paragraphNumber']} | "
            f"{e['editor']} | {cell} | {rules or '—'} |"
        )
    lines.append('')

    warn = [e for e in edits if checks[e['paragraphId']][0] in ('STALE', 'MISSING')]
    if warn:
        lines += ['## 먼저 확인할 것', '']
        for e in warn:
            lines.append(f"- **{e['standardCode']} 문단 {e['paragraphNumber']}** "
                         f"({e['editor']}): {checks[e['paragraphId']][1]}")
        lines.append('')

    by_std: dict[str, list[dict]] = defaultdict(list)
    for e in edits:
        by_std[f"{e['standardCode']} {e['standardTitle']}"].append(e)

    for std, group in by_std.items():
        lines += [f'## {std}', '']
        for e in group:
            state, reason = checks[e['paragraphId']]
            lines.append(f"### 문단 {e['paragraphNumber']} (`{e['paragraphId']}`)")
            lines.append('')
            lines.append(f"- 수정자: **{e['editor']}** · "
                         f"{e.get('editedAt', '')[:16].replace('T', ' ')}")
            lines.append(f'- 요약: {summarize(e)}')
            if e.get('note'):
                lines.append(f"- 사유: {e['note']}")
            lines.append(f'- 상태: {status_label[state]}' + (f' — {reason}' if reason else ''))
            if e.get('_superseded'):
                lines.append('- 덮어쓴 기록: ' + ', '.join(e['_superseded']))
            lines += ['', '**수정 전**', '', '```text', e['before']['content'], '```', '',
                      '**수정 후**', '', '```text', e['after']['content'], '```', '']
    return '\n'.join(lines)


def apply_edits(edits: list[dict], checks: dict[str, tuple[str, str]]) -> int:
    """검증을 통과한(OK) 기록만 원본 JSON 에 반영한다."""
    targets = [e for e in edits if checks[e['paragraphId']][0] == 'OK']
    by_file: dict[Path, list[dict]] = defaultdict(list)
    _, files = load_standards()
    for e in targets:
        path = files.get(e['standardId'])
        if path:
            by_file[path].append(e)

    for path, group in by_file.items():
        data = json.loads(path.read_text(encoding='utf-8'))
        wanted = {e['paragraphId']: e for e in group}
        for std in data:
            for p in std['paragraphs']:
                e = wanted.get(p['id'])
                if not e:
                    continue
                p['content'] = e['after']['content']
                for key in ('sectionTitle', 'subTitle'):
                    value = e['after'].get(key)
                    if value:
                        p[key] = value
                    else:
                        p.pop(key, None)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'  {path.name}: {len(group)}개 문단 반영')
    return len(targets)


def main() -> int:
    ap = argparse.ArgumentParser(description='앱에서 내보낸 수정 기록을 검토 문서로 정리하고 반영한다')
    ap.add_argument('logs', nargs='+', help='앱에서 내보낸 수정 기록 JSON 파일들')
    ap.add_argument('--doc', default=str(DEFAULT_DOC), help=f'검토 문서 경로 (기본 {DEFAULT_DOC})')
    ap.add_argument('--apply', action='store_true', help='검증을 통과한 기록을 원본 JSON 에 반영')
    args = ap.parse_args()

    paths = [Path(p) for p in args.logs]
    missing = [p for p in paths if not p.exists()]
    if missing:
        print('파일을 찾을 수 없습니다: ' + ', '.join(map(str, missing)), file=sys.stderr)
        return 1

    edits = load_logs(paths)
    if not edits:
        print('수정 기록이 비어 있습니다.')
        return 0

    paragraphs, _ = load_standards()
    checks = {e['paragraphId']: verify(e, paragraphs) for e in edits}
    counts = Counter(state for state, _ in checks.values())

    print(f'수정 기록 {len(edits)}개 문단 / 파일 {len(paths)}개')
    for state, label in (('OK', '반영 가능'), ('DONE', '이미 반영됨'),
                         ('STALE', '확인 필요'), ('MISSING', '문단 없음')):
        if counts.get(state):
            print(f'  {label}: {counts[state]}건')

    doc = Path(args.doc)
    doc.parent.mkdir(parents=True, exist_ok=True)
    doc.write_text(build_document(edits, checks), encoding='utf-8')
    print(f'\n검토 문서: {doc}')

    if args.apply:
        if counts.get('STALE') or counts.get('MISSING'):
            print('\n확인이 필요한 기록이 있어 그 건은 건너뜁니다. 검토 문서의 '
                  '"먼저 확인할 것" 을 보세요.')
        print('\n원본에 반영합니다.')
        applied = apply_edits(edits, checks)
        print(f'총 {applied}개 문단을 반영했습니다. '
              '`python3 scripts/audit_standards.py` 로 다시 검증하세요.')
    else:
        print('반영하려면 같은 명령에 --apply 를 붙이세요.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
