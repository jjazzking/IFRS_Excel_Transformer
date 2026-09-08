import {
  AccountingStandard,
  ParagraphEdit,
  ParagraphEditFields,
  StandardParagraph,
} from '../types';

const STORAGE_KEY = 'wpa:edits:v1';
const EDITOR_KEY = 'wpa:editor:v1';

interface StoredState {
  edits: ParagraphEdit[];
}

/** 브라우저에 쌓인 수정 기록을 읽는다. 형식이 깨졌으면 빈 목록으로 시작한다. */
export function loadEdits(): ParagraphEdit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredState;
    return Array.isArray(parsed.edits) ? parsed.edits : [];
  } catch {
    return [];
  }
}

export function saveEdits(edits: ParagraphEdit[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ edits } satisfies StoredState));
  } catch {
    // 사생활 보호 모드 등에서 저장이 막혀도 화면은 그대로 동작해야 한다.
  }
}

export function loadEditorName(): string {
  try {
    return localStorage.getItem(EDITOR_KEY) || '';
  } catch {
    return '';
  }
}

export function saveEditorName(name: string): void {
  try {
    localStorage.setItem(EDITOR_KEY, name);
  } catch {
    /* 무시 */
  }
}

/** 문단마다 가장 마지막 기록만 화면에 반영한다. */
export function latestByParagraph(edits: ParagraphEdit[]): Map<string, ParagraphEdit> {
  const map = new Map<string, ParagraphEdit>();
  for (const e of edits) map.set(e.paragraphId, e);
  return map;
}

function sameFields(p: StandardParagraph, f: ParagraphEditFields): boolean {
  return (
    p.content === f.content &&
    (p.sectionTitle || '') === (f.sectionTitle || '') &&
    (p.subTitle || '') === (f.subTitle || '')
  );
}

/**
 * 원본 기준서에 수정 기록을 덧씌운다. 기록이 없는 기준서는 원본 객체를 그대로 돌려주어
 * 검색 인덱스가 불필요하게 다시 만들어지지 않게 한다.
 */
export function applyEdits(
  standards: AccountingStandard[],
  latest: Map<string, ParagraphEdit>
): AccountingStandard[] {
  if (latest.size === 0) return standards;
  return standards.map(std => {
    const touched = std.paragraphs.some(p => latest.has(p.id));
    if (!touched) return std;
    return {
      ...std,
      paragraphs: std.paragraphs.map(p => {
        const edit = latest.get(p.id);
        if (!edit || sameFields(p, edit.after)) return p;
        return {
          ...p,
          content: edit.after.content,
          sectionTitle: edit.after.sectionTitle || undefined,
          subTitle: edit.after.subTitle || undefined,
        };
      }),
    };
  });
}

/** 무엇이 어떻게 바뀌었는지 한 줄로 요약한다. 검토 문서의 목차 역할을 한다. */
export function summarizeEdit(edit: ParagraphEdit): string {
  const before = edit.before.content;
  const after = edit.after.content;
  const parts: string[] = [];

  if (before !== after) {
    const diff = after.length - before.length;
    if (before.startsWith(after)) {
      const removed = before.slice(after.length).trim().replace(/\s+/g, ' ');
      parts.push(`끝부분 ${before.length - after.length}자 삭제${removed ? ` ("${clip(removed)}")` : ''}`);
    } else if (after.startsWith(before)) {
      const added = after.slice(before.length).trim().replace(/\s+/g, ' ');
      parts.push(`끝에 ${after.length - before.length}자 추가${added ? ` ("${clip(added)}")` : ''}`);
    } else {
      parts.push(`본문 수정 (${diff >= 0 ? '+' : ''}${diff}자)`);
    }
  }
  if ((edit.before.sectionTitle || '') !== (edit.after.sectionTitle || '')) {
    parts.push(`대분류 제목 "${edit.before.sectionTitle || '(없음)'}" → "${edit.after.sectionTitle || '(없음)'}"`);
  }
  if ((edit.before.subTitle || '') !== (edit.after.subTitle || '')) {
    parts.push(`소분류 제목 "${edit.before.subTitle || '(없음)'}" → "${edit.after.subTitle || '(없음)'}"`);
  }
  return parts.length ? parts.join(' · ') : '변경 없음';
}

function clip(text: string, max = 40): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** 원본에 반영할 때 쓰는 기계용 기록 */
export function buildEditLogJson(edits: ParagraphEdit[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      editCount: edits.length,
      paragraphCount: latestByParagraph(edits).size,
      edits,
    },
    null,
    2
  );
}

/** 사람이 읽고 판단하는 검토 문서 */
export function buildEditLogMarkdown(edits: ParagraphEdit[]): string {
  const lines: string[] = [];
  const now = new Date();
  lines.push('# 기준서 수정 로그');
  lines.push('');
  lines.push(`- 내보낸 시각: ${formatDateTime(now.toISOString())}`);
  lines.push(`- 수정 기록 ${edits.length}건 / 문단 ${latestByParagraph(edits).size}개`);
  const editors = Array.from(new Set(edits.map(e => e.editor))).filter(Boolean);
  if (editors.length) lines.push(`- 수정자: ${editors.join(', ')}`);
  lines.push('');

  const byStandard = new Map<string, ParagraphEdit[]>();
  for (const e of edits) {
    const key = `${e.standardCode} ${e.standardTitle}`;
    (byStandard.get(key) || byStandard.set(key, []).get(key)!).push(e);
  }

  lines.push('## 한눈에 보기');
  lines.push('');
  lines.push('| 기준서 | 문단 | 수정자 | 무엇이 바뀌었나 |');
  lines.push('| --- | --- | --- | --- |');
  for (const e of edits) {
    lines.push(
      `| ${e.standardCode} | ${e.paragraphNumber} | ${e.editor} | ${escapePipes(summarizeEdit(e))} |`
    );
  }
  lines.push('');

  for (const [standard, group] of byStandard) {
    lines.push(`## ${standard}`);
    lines.push('');
    for (const e of group) {
      lines.push(`### 문단 ${e.paragraphNumber} (\`${e.paragraphId}\`)`);
      lines.push('');
      lines.push(`- 수정자: **${e.editor}** · ${formatDateTime(e.editedAt)}`);
      lines.push(`- 요약: ${summarizeEdit(e)}`);
      if (e.note) lines.push(`- 사유: ${e.note}`);
      lines.push('');
      lines.push('**수정 전**');
      lines.push('');
      lines.push('```text');
      lines.push(e.before.content);
      lines.push('```');
      lines.push('');
      lines.push('**수정 후**');
      lines.push('');
      lines.push('```text');
      lines.push(e.after.content);
      lines.push('```');
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, '\\|');
}

/**
 * 브라우저에서 파일로 내려받는다. 파일명은 ASCII 로만 짓는다 —
 * 한글 파일명을 그대로 떨구면 일부 브라우저에서 확장자 없는 'download' 로 저장된다.
 */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 브라우저가 파일명을 읽어 갈 틈을 준 뒤에 정리한다. 바로 해제하면
  // 파일명이 'download' 로 떨어지는 브라우저가 있다.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
