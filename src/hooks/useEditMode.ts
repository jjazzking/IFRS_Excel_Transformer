import { useCallback, useMemo, useState } from 'react';
import { AccountingStandard, ParagraphEdit, ParagraphEditFields, StandardParagraph } from '../types';
import {
  applyEdits,
  latestByParagraph,
  loadEditorName,
  loadEdits,
  saveEditorName,
  saveEdits,
} from '../utils/editStore';

function newEditId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function fieldsOf(p: StandardParagraph): ParagraphEditFields {
  return { content: p.content, sectionTitle: p.sectionTitle, subTitle: p.subTitle };
}

function unchanged(a: ParagraphEditFields, b: ParagraphEditFields): boolean {
  return (
    a.content === b.content &&
    (a.sectionTitle || '') === (b.sectionTitle || '') &&
    (a.subTitle || '') === (b.subTitle || '')
  );
}

/**
 * 기준서 수정 모드.
 *
 * 원본 JSON 은 건드리지 않는다. 고친 내용은 수정 기록으로 브라우저에 쌓아 두고 화면에만
 * 덧씌우며, 내보낸 기록을 검토한 뒤에야 원본에 반영한다 — 누가 무엇을 왜 고쳤는지 남기지
 * 않고 데이터가 바뀌는 일이 없도록 하기 위해서다.
 */
export function useEditMode(baseStandards: AccountingStandard[]) {
  const [enabled, setEnabled] = useState(false);
  const [editor, setEditor] = useState<string>(() => loadEditorName());
  const [edits, setEdits] = useState<ParagraphEdit[]>(() => loadEdits());

  const persist = useCallback((next: ParagraphEdit[]) => {
    setEdits(next);
    saveEdits(next);
  }, []);

  const latest = useMemo(() => latestByParagraph(edits), [edits]);

  /** 원본에 수정 기록을 덧씌운 기준서. 검색·본문·조서가 모두 이것을 본다. */
  const standards = useMemo(
    () => applyEdits(baseStandards, latest),
    [baseStandards, latest]
  );

  /** 이 문단의 원래 모습 — 여러 번 고쳐도 최초 원본을 기준으로 기록한다. */
  const originalOf = useCallback(
    (paragraphId: string): ParagraphEditFields | undefined => {
      const existing = latest.get(paragraphId);
      if (existing) return existing.before;
      for (const std of baseStandards) {
        const p = std.paragraphs.find(x => x.id === paragraphId);
        if (p) return fieldsOf(p);
      }
      return undefined;
    },
    [baseStandards, latest]
  );

  const startEditing = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      setEditor(trimmed);
      saveEditorName(trimmed);
      setEnabled(true);
      return true;
    },
    []
  );

  const stopEditing = useCallback(() => setEnabled(false), []);

  /** 문단 하나를 고친다. 원본과 같아지면 기록을 남기지 않고 지운다. */
  const saveParagraph = useCallback(
    (paragraph: StandardParagraph, next: ParagraphEditFields, note: string) => {
      const before = originalOf(paragraph.id) ?? fieldsOf(paragraph);
      const after: ParagraphEditFields = {
        content: next.content,
        sectionTitle: next.sectionTitle?.trim() || undefined,
        subTitle: next.subTitle?.trim() || undefined,
      };
      const rest = edits.filter(e => e.paragraphId !== paragraph.id);
      if (unchanged(before, after)) {
        persist(rest); // 원래대로 되돌린 것이므로 기록도 없앤다
        return;
      }
      persist([
        ...rest,
        {
          editId: newEditId(),
          paragraphId: paragraph.id,
          standardId: paragraph.standardId || '',
          standardCode: paragraph.standardCode || '',
          standardTitle: paragraph.standardTitle || '',
          paragraphNumber: paragraph.number,
          editor,
          editedAt: new Date().toISOString(),
          note: note.trim() || undefined,
          before,
          after,
        },
      ]);
    },
    [edits, editor, originalOf, persist]
  );

  /** 이 문단의 수정을 취소하고 원본으로 되돌린다 (기록도 지운다). */
  const revertParagraph = useCallback(
    (paragraphId: string) => persist(edits.filter(e => e.paragraphId !== paragraphId)),
    [edits, persist]
  );

  const clearAllEdits = useCallback(() => persist([]), [persist]);

  return {
    enabled,
    editor,
    edits,
    editedIds: useMemo(() => new Set(latest.keys()), [latest]),
    standards,
    startEditing,
    stopEditing,
    saveParagraph,
    revertParagraph,
    clearAllEdits,
  };
}
