import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Plus, RotateCcw } from 'lucide-react';
import {
  AccountingStandard,
  ParagraphEditFields,
  ParagraphPart,
  StandardParagraph,
} from '../types';
import { PART_LABEL } from '../data/normalize';
import { highlightParts } from '../utils/search';

interface StandardReaderProps {
  standard?: AccountingStandard;
  selectedIds: Set<string>;
  onToggleParagraph: (paragraph: StandardParagraph) => void;
  onSelectAll: (paragraphs: StandardParagraph[]) => void;
  onDeselectAll: (paragraphIds: string[]) => void;
  /** seq 가 바뀔 때마다 id 문단으로 스크롤한다 (목차·검색결과에서 넘어올 때).
   *  같은 문단을 연달아 눌러도 다시 이동하도록 seq 를 함께 둔다. */
  scrollTarget: { id: string; seq: number };
  /** 화면 상단에 걸린 문단을 알려 목차에서 현재 위치를 강조하게 한다 */
  onActiveParagraphChange: (paragraphId: string) => void;
  /** 검색 결과에서 넘어온 경우 본문에서도 같은 말을 강조한다 */
  highlightTokens: string[];
  partFilter: ParagraphPart | 'all';
  onChangePartFilter: (part: ParagraphPart | 'all') => void;
  /** 수정 모드 — 켜져 있으면 문단마다 수정 버튼이 나온다 */
  editMode?: boolean;
  editedIds?: Set<string>;
  onSaveParagraph?: (
    paragraph: StandardParagraph,
    next: ParagraphEditFields,
    note: string
  ) => void;
  onRevertParagraph?: (paragraphId: string) => void;
}

const NO_IDS: Set<string> = new Set();

export const StandardReader: React.FC<StandardReaderProps> = ({
  standard,
  selectedIds,
  onToggleParagraph,
  onSelectAll,
  onDeselectAll,
  scrollTarget,
  onActiveParagraphChange,
  highlightTokens,
  partFilter,
  onChangePartFilter,
  editMode = false,
  editedIds = NO_IDS,
  onSaveParagraph,
  onRevertParagraph,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState('');

  // 이 기준서에 실제로 존재하는 파트만 필터로 보여준다.
  const availableParts = useMemo(() => {
    const parts = new Set<ParagraphPart>();
    standard?.paragraphs.forEach(p => parts.add(p.part || 'main'));
    return (['main', 'appendix', 'ig', 'bc'] as ParagraphPart[]).filter(p => parts.has(p));
  }, [standard]);

  const paragraphs = useMemo(() => {
    if (!standard) return [];
    if (partFilter === 'all') return standard.paragraphs;
    return standard.paragraphs.filter(p => (p.part || 'main') === partFilter);
  }, [standard, partFilter]);

  // 수정 모드를 끄면 열려 있던 편집 칸도 닫는다.
  useEffect(() => {
    if (!editMode) setEditingId('');
  }, [editMode]);

  // 목차나 검색 결과에서 넘어온 문단으로 이동
  useEffect(() => {
    if (!scrollTarget.id) return;
    const el = document.getElementById(`para-${scrollTarget.id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // 어디로 왔는지 잠깐 보이도록 강조했다가 지운다
    el.classList.add('ring-2', 'ring-amber-400');
    const timer = window.setTimeout(() => {
      el.classList.remove('ring-2', 'ring-amber-400');
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [scrollTarget, paragraphs]);

  // 스크롤 위치 → 목차 강조. 화면 위쪽에 걸친 문단을 현재 위치로 본다.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || paragraphs.length === 0) return;

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const top = visible[0]?.target.id;
        if (top) onActiveParagraphChange(top.replace(/^para-/, ''));
      },
      { root, rootMargin: '0px 0px -75% 0px', threshold: 0 }
    );

    root.querySelectorAll('[data-paragraph]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [paragraphs, onActiveParagraphChange]);

  if (!standard) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white rounded-xl border border-slate-200 text-sm text-slate-400">
        왼쪽에서 기준서를 선택하세요.
      </div>
    );
  }

  const visibleIds = paragraphs.map(p => p.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* 기준서 머리말 + 파트 필터 */}
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex-1 min-w-[150px]">
          <span className="block text-[11px] font-mono text-slate-500 truncate">{standard.code}</span>
          <h2 className="text-sm font-bold text-slate-900 truncate leading-tight">
            {standard.title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {availableParts.length > 1 && (
            <div className="flex flex-wrap gap-1 mr-1">
              <PartChip
                label="전체"
                active={partFilter === 'all'}
                onClick={() => onChangePartFilter('all')}
              />
              {availableParts.map(part => (
                <PartChip
                  key={part}
                  label={PART_LABEL[part]}
                  active={partFilter === part}
                  onClick={() => onChangePartFilter(part)}
                />
              ))}
            </div>
          )}
          <button
            onClick={() =>
              allSelected ? onDeselectAll(visibleIds) : onSelectAll(paragraphs)
            }
            className="px-2 py-1 rounded-lg text-[11px] font-medium border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 transition cursor-pointer whitespace-nowrap"
          >
            {allSelected ? '보이는 문단 담기 해제' : '보이는 문단 모두 담기'}
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {paragraphs.map((p, i) => {
          const prev = paragraphs[i - 1];
          const partChanged = (prev?.part || 'main') !== (p.part || 'main');
          const sectionChanged = prev?.sectionTitle !== p.sectionTitle;
          const subChanged = prev?.subTitle !== p.subTitle;
          return (
            <React.Fragment key={p.id}>
              {(i === 0 || partChanged) && (p.part || 'main') !== 'main' && (
                <h3 className="mt-6 mb-2 pb-1 border-b-2 border-slate-800 text-sm font-bold text-slate-900">
                  {PART_LABEL[p.part || 'main']}
                </h3>
              )}
              {(i === 0 || sectionChanged) && p.sectionTitle && (
                <h4 className="mt-5 mb-1.5 text-sm font-bold text-slate-800">{p.sectionTitle}</h4>
              )}
              {(i === 0 || sectionChanged || subChanged) && p.subTitle && (
                <h5 className="mt-3 mb-1 text-xs font-semibold text-emerald-800">{p.subTitle}</h5>
              )}
              {editMode && editingId === p.id ? (
                <ParagraphEditor
                  paragraph={p}
                  onCancel={() => setEditingId('')}
                  onSave={(next, note) => {
                    onSaveParagraph?.(p, next, note);
                    setEditingId('');
                  }}
                />
              ) : (
                <ParagraphBlock
                  paragraph={p}
                  selected={selectedIds.has(p.id)}
                  onToggle={() => onToggleParagraph(p)}
                  tokens={highlightTokens}
                  editMode={editMode}
                  edited={editedIds.has(p.id)}
                  onEdit={() => setEditingId(p.id)}
                  onRevert={() => onRevertParagraph?.(p.id)}
                />
              )}
            </React.Fragment>
          );
        })}
        {paragraphs.length === 0 && (
          <p className="text-center text-xs text-slate-400 py-12">표시할 문단이 없습니다.</p>
        )}
        <div className="h-40" aria-hidden />
      </div>
    </div>
  );
};

const PartChip: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({
  label,
  active,
  onClick,
}) => (
  <button
    onClick={onClick}
    className={`px-1.5 py-0.5 rounded text-[11px] border transition cursor-pointer whitespace-nowrap ${
      active
        ? 'bg-slate-800 text-white border-slate-800 font-medium'
        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
    }`}
  >
    {label}
  </button>
);

/**
 * 문단 하나. 읽는 것과 담는 것을 분리해 두었다 — 본문을 클릭해도 선택되지 않고,
 * 왼쪽 문단번호 옆의 담기 버튼으로만 조서에 들어간다.
 */
const ParagraphBlock: React.FC<{
  paragraph: StandardParagraph;
  selected: boolean;
  onToggle: () => void;
  tokens: string[];
  editMode: boolean;
  edited: boolean;
  onEdit: () => void;
  onRevert: () => void;
}> = ({ paragraph, selected, onToggle, tokens, editMode, edited, onEdit, onRevert }) => {
  const parts = useMemo(
    () => highlightParts(paragraph.content, tokens),
    [paragraph.content, tokens]
  );

  return (
    <div
      id={`para-${paragraph.id}`}
      data-paragraph
      className={`group relative flex gap-2.5 rounded-lg px-2 py-2 -mx-2 scroll-mt-2 transition ${
        edited
          ? 'bg-amber-50 ring-1 ring-amber-300'
          : selected
            ? 'bg-emerald-50/70'
            : 'hover:bg-slate-50'
      }`}
    >
      {/* 문단번호 + 담기 버튼 */}
      <div className="w-14 shrink-0 flex flex-col items-end gap-1 pt-0.5">
        <span
          className={`text-xs font-bold tabular-nums ${
            selected ? 'text-emerald-700' : 'text-slate-500'
          }`}
        >
          {paragraph.number}
        </span>
        <button
          onClick={onToggle}
          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border transition cursor-pointer ${
            selected
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-slate-500 border-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:border-emerald-500 hover:text-emerald-700'
          }`}
          title={selected ? '조서에서 빼기' : '조서에 담기'}
        >
          {selected ? (
            <>
              <Check className="w-2.5 h-2.5" />
              담김
            </>
          ) : (
            <>
              <Plus className="w-2.5 h-2.5" />
              담기
            </>
          )}
        </button>
        {editMode && (
          <button
            onClick={onEdit}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border bg-white text-amber-700 border-amber-300 hover:bg-amber-50 transition cursor-pointer"
            title="이 문단을 고칩니다"
          >
            <Pencil className="w-2.5 h-2.5" />
            수정
          </button>
        )}
      </div>

      {/* 본문 — 클릭해도 선택되지 않으므로 드래그해서 그대로 복사할 수 있다 */}
      <div className="flex-1 min-w-0">
        {edited && (
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 text-[10px] font-bold">
              <Pencil className="w-2.5 h-2.5" />
              수정됨
            </span>
            {editMode && (
              <button
                onClick={onRevert}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                title="원본으로 되돌리고 기록을 지웁니다"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                되돌리기
              </button>
            )}
          </div>
        )}
        <p className="text-[13px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words">
          {parts.map((part, i) =>
            part.hit ? (
              <mark key={i} className="bg-amber-200 text-slate-900 rounded-sm px-0.5">
                {part.text}
              </mark>
            ) : (
              <React.Fragment key={i}>{part.text}</React.Fragment>
            )
          )}
        </p>
      </div>
    </div>
  );
};

/** 문단 하나를 그 자리에서 고치는 칸. 본문과 문단제목을 함께 손볼 수 있다. */
const ParagraphEditor: React.FC<{
  paragraph: StandardParagraph;
  onCancel: () => void;
  onSave: (next: ParagraphEditFields, note: string) => void;
}> = ({ paragraph, onCancel, onSave }) => {
  const [content, setContent] = useState(paragraph.content);
  const [sectionTitle, setSectionTitle] = useState(paragraph.sectionTitle || '');
  const [subTitle, setSubTitle] = useState(paragraph.subTitle || '');
  const [note, setNote] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const changed =
    content !== paragraph.content ||
    sectionTitle !== (paragraph.sectionTitle || '') ||
    subTitle !== (paragraph.subTitle || '');

  return (
    <div
      id={`para-${paragraph.id}`}
      data-paragraph
      className="rounded-lg border-2 border-amber-400 bg-amber-50/50 px-3 py-2.5 -mx-2 my-1 scroll-mt-2"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-amber-900">
          문단 {paragraph.number} 수정
        </span>
        <span className="text-[10px] text-amber-700">
          Ctrl/⌘ + Enter 로 저장 · Esc 로 취소
        </span>
      </div>

      <textarea
        ref={textRef}
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && changed) {
            onSave({ content, sectionTitle, subTitle }, note);
          }
        }}
        rows={Math.min(20, Math.max(4, content.split('\n').length + 2))}
        className="w-full px-2.5 py-2 rounded-lg border border-amber-300 bg-white text-[13px] leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
      />

      <div className="grid sm:grid-cols-2 gap-2 mt-2">
        <label className="block">
          <span className="block text-[10px] font-medium text-slate-600 mb-0.5">
            대분류 제목
          </span>
          <input
            value={sectionTitle}
            onChange={e => setSectionTitle(e.target.value)}
            placeholder="(없음)"
            className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-[12px] focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-medium text-slate-600 mb-0.5">
            소분류 제목
          </span>
          <input
            value={subTitle}
            onChange={e => setSubTitle(e.target.value)}
            placeholder="(없음)"
            className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-[12px] focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </label>
      </div>

      <label className="block mt-2">
        <span className="block text-[10px] font-medium text-slate-600 mb-0.5">
          왜 고쳤나요 (검토 문서에 그대로 실립니다)
        </span>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="예: 본문 끝에 다음 절 제목 '적용' 이 붙어 있어 삭제"
          className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-[12px] focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </label>

      <div className="flex justify-end gap-2 mt-2.5">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 transition cursor-pointer"
        >
          취소
        </button>
        <button
          onClick={() => onSave({ content, sectionTitle, subTitle }, note)}
          disabled={!changed}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
        >
          저장
        </button>
      </div>
    </div>
  );
};
