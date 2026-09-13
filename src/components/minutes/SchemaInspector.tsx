import React, { useMemo, useState } from 'react';
import { AlertTriangle, Crosshair, Filter, Info, ListTree } from 'lucide-react';
import { Evidence, MinutesDocument, ReviewFlag } from '../../lib/minutes/types';

interface SchemaInspectorProps {
  doc: MinutesDocument;
  /** 지금 고른 필드 경로. 왼쪽 PDF 의 하이라이트와 짝이다. */
  selected: string | null;
  onSelect: (path: string, evidence: Evidence | null) => void;
}

interface Row {
  path: string;
  label: string;
  /** 값을 못 읽었으면 null — 화면은 **비어 있고 표시된 값**으로 사람을 안내한다. */
  value: string | null;
  rule: string | null;
  evidence: Evidence | null;
}

const LEVEL_STYLE: Record<ReviewFlag['level'], string> = {
  P1: 'bg-rose-50 text-rose-700 border-rose-200',
  P2: 'bg-amber-50 text-amber-800 border-amber-200',
};

function countLabel(present: number | null, total: number | null): string | null {
  if (present === null && total === null) return null;
  return `${present ?? '?'} / ${total ?? '?'} 명 출석`;
}

function buildRows(doc: MinutesDocument): Row[] {
  const { heldAt, place } = doc.meeting;
  const time = [heldAt.startTime, heldAt.endTime].some(Boolean)
    ? ` ${heldAt.startTime ?? '?'} ~ ${heldAt.endTime ?? '?'}`
    : '';

  return [
    {
      path: 'meeting.heldAt',
      label: '일시',
      value: heldAt.date ? heldAt.date + time : null,
      rule: null,
      evidence: heldAt.evidence,
    },
    {
      path: 'meeting.place',
      label: '장소',
      value: place?.value ?? null,
      rule: place?.rule ?? null,
      evidence: place?.evidence ?? null,
    },
    {
      path: 'attendance.directors',
      label: '이사',
      value: countLabel(doc.attendance.directors.present, doc.attendance.directors.total),
      rule: null,
      evidence: doc.attendance.directors.evidence,
    },
    {
      path: 'attendance.auditCommittee',
      label: '감사위원',
      value: countLabel(doc.attendance.auditCommittee.present, doc.attendance.auditCommittee.total),
      rule: null,
      evidence: doc.attendance.auditCommittee.evidence,
    },
  ];
}

export const SchemaInspector: React.FC<SchemaInspectorProps> = ({ doc, selected, onSelect }) => {
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const rows = useMemo(() => buildRows(doc), [doc]);

  // 표시는 `where` 경로에 매달려 온다. `attendance.directors.total` 은
  // `attendance.directors` 줄의 것이므로 앞부분이 같으면 그 줄에 붙인다.
  const flagsFor = (path: string) =>
    doc.review.flags.filter(f => f.where === path || f.where?.startsWith(path + '.'));

  const sourceFlags = doc.review.flags.filter(f => f.where === 'source');
  const visible = onlyFlagged
    ? rows.filter(r => r.value === null || flagsFor(r.path).length > 0)
    : rows;

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[11px] font-semibold text-slate-700">정규 스키마</span>
        <span className="text-[11px] text-slate-500 tabular-nums">
          검토 필요 {doc.review.needsReviewCount}건
          {doc.review.p1Count > 0 && <span className="text-rose-600"> (P1 {doc.review.p1Count})</span>}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
          <input
            id="check-minutes-flagged"
            type="checkbox"
            checked={onlyFlagged}
            onChange={e => setOnlyFlagged(e.target.checked)}
            className="accent-emerald-600 cursor-pointer"
          />
          <Filter className="w-3.5 h-3.5" />
          검토 필요만 보기
        </label>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-white rounded-xl border border-slate-200 shadow-sm p-3 space-y-4">
        <section className="space-y-1.5">
          <h3 className="text-[11px] font-semibold text-slate-500 tracking-tight">원본</h3>
          <p className="text-xs text-slate-700 break-all">{doc.source.fileName}</p>
          <p className="text-[11px] text-slate-500 tabular-nums">
            {doc.source.pageCount}쪽 · 글자 {doc.source.charCount.toLocaleString()}자
            {doc.source.scanPages.length > 0 && ` · 이미지 쪽 ${doc.source.scanPages.join(', ')}`}
          </p>
          {sourceFlags.map((f, i) => <FlagLine key={i} flag={f} />)}
        </section>

        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold text-slate-500 tracking-tight">회의</h3>
          {visible.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">검토가 필요한 항목이 없습니다.</p>
          ) : (
            visible.map(row => (
              <FieldRow
                key={row.path}
                row={row}
                flags={flagsFor(row.path)}
                active={selected === row.path}
                onSelect={() => onSelect(row.path, row.evidence)}
              />
            ))
          )}
        </section>

        <section className="space-y-1.5">
          <h3 className="text-[11px] font-semibold text-slate-500 tracking-tight flex items-center gap-1.5">
            <ListTree className="w-3.5 h-3.5" /> 의안
          </h3>
          <div className="flex gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 leading-relaxed">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
            <span>
              의안 규칙은 아직 브라우저로 옮기기 전입니다 (지금은{' '}
              <code className="bg-slate-200 px-1 rounded">scripts/parse_minutes.py</code> 에만
              있습니다). <span className="text-slate-500">의안이 없는 문서라는 뜻이 아닙니다.</span>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};

const FieldRow: React.FC<{
  row: Row;
  flags: ReviewFlag[];
  active: boolean;
  onSelect: () => void;
}> = ({ row, flags, active, onSelect }) => (
  <div
    className={`rounded-lg border px-2.5 py-2 transition ${
      active ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
    }`}
  >
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] font-medium text-slate-500 w-14 shrink-0">{row.label}</span>
      {row.value === null ? (
        <span className="text-xs text-slate-400 italic">검토 필요 — 규칙이 읽지 못했습니다</span>
      ) : (
        <span className="text-sm text-slate-900 font-medium break-all">{row.value}</span>
      )}
      {row.evidence && (
        <button
          onClick={onSelect}
          title="원문에서 이 값이 나온 자리 보기"
          className="ml-auto shrink-0 flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded px-1.5 py-0.5 transition cursor-pointer"
        >
          <Crosshair className="w-3.5 h-3.5" />
          {row.evidence.page}쪽
        </button>
      )}
    </div>

    {row.evidence && (
      <p className="mt-1 text-[11px] text-slate-500 break-all">
        <span className="text-slate-400">근거 </span>
        “{row.evidence.text}”
        {row.rule && <span className="ml-1 text-slate-400">· {row.rule}</span>}
      </p>
    )}

    {flags.map((f, i) => <FlagLine key={i} flag={f} />)}
  </div>
);

const FlagLine: React.FC<{ flag: ReviewFlag }> = ({ flag }) => (
  <p
    className={`mt-1 flex gap-1.5 items-start text-[11px] border rounded px-1.5 py-1 leading-relaxed ${
      LEVEL_STYLE[flag.level]
    }`}
  >
    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
    <span>
      <span className="font-semibold">{flag.level} {flag.code}</span> — {flag.message}
    </span>
  </p>
);
