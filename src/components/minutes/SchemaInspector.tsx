import React, { useMemo, useState } from 'react';
import { AlertTriangle, Crosshair, Filter, ListTree, ScanLine } from 'lucide-react';
import {
  AgendaItem,
  Evidence,
  MinutesDocument,
  ResolutionValue,
  ReviewFlag,
} from '../../lib/minutes/types';

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

/** 가결 여부는 조서에서 가장 먼저 보는 값이라 색으로도 구분한다. */
const RESOLUTION_STYLE: Record<ResolutionValue, string> = {
  원안가결: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  수정가결: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  부결: 'bg-rose-50 text-rose-700 border-rose-200',
  보류: 'bg-amber-50 text-amber-800 border-amber-200',
  해당없음: 'bg-slate-100 text-slate-600 border-slate-200',
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
  const agendaFlags = doc.review.flags.filter(f => f.where === 'agenda');

  const visibleRows = onlyFlagged
    ? rows.filter(r => r.value === null || flagsFor(r.path).length > 0)
    : rows;

  const needsReview = (item: AgendaItem) =>
    item.resolution.value === null
    || !item.title.value
    || flagsFor(`agenda[${item.number.ordinal}]`).length > 0;

  const visibleAgenda = onlyFlagged ? doc.agenda.filter(needsReview) : doc.agenda;

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
          {doc.source.ocr.map(o => (
            <p key={o.page} className="text-[11px] text-sky-700 tabular-nums">
              <ScanLine className="w-3 h-3 inline-block mr-1 align-[-2px]" />
              {o.page}쪽을 OCR 로 읽었습니다
              {o.rotation ? ` (${o.rotation}° 돌려서)` : ''} · 평균 신뢰도 {o.meanConfidence}
            </p>
          ))}
          {sourceFlags.map((f, i) => <FlagLine key={i} flag={f} />)}
        </section>

        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold text-slate-500 tracking-tight">회의</h3>
          {visibleRows.length === 0 ? (
            <p className="text-xs text-slate-500 py-1">검토가 필요한 항목이 없습니다.</p>
          ) : (
            visibleRows.map(row => (
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

        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold text-slate-500 tracking-tight flex items-center gap-1.5">
            <ListTree className="w-3.5 h-3.5" />
            의안 {doc.agenda.length}건
          </h3>
          {agendaFlags.map((f, i) => <FlagLine key={i} flag={f} />)}
          {visibleAgenda.length === 0 ? (
            <p className="text-xs text-slate-500 py-1">
              {doc.agenda.length === 0 ? '의안을 찾지 못했습니다.' : '검토가 필요한 의안이 없습니다.'}
            </p>
          ) : (
            visibleAgenda.map(item => (
              <AgendaCard
                key={`${item.kind}-${item.number.ordinal}`}
                item={item}
                flags={flagsFor(`agenda[${item.number.ordinal}]`)}
                selected={selected}
                onSelect={onSelect}
              />
            ))
          )}
        </section>
      </div>
    </div>
  );
};

const AgendaCard: React.FC<{
  item: AgendaItem;
  flags: ReviewFlag[];
  selected: string | null;
  onSelect: (path: string, evidence: Evidence | null) => void;
}> = ({ item, flags, selected, onSelect }) => {
  const path = `agenda[${item.number.ordinal}]`;
  // 안쪽의 좁은 자리(제목·발췌·금액)를 골라도 이 카드는 고른 것으로 남는다.
  const active = selected === path || Boolean(selected?.startsWith(path + '.'));
  const { fsImpact, resolution, summary } = item;

  // 카드 아무 데나 누르면 이 의안의 본문 구간으로 데려간다. 안쪽의 제목·발췌·
  // 금액은 더 좁은 자리를 가리키므로 그쪽이 이기게 둔다.
  const pick = (e: React.MouseEvent, at: string, evidence: Evidence | null) => {
    e.stopPropagation();
    onSelect(at, evidence);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      title="누르면 원문에서 이 의안이 나온 자리로 갑니다"
      onClick={() => onSelect(path, item.body)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(path, item.body);
        }
      }}
      className={`rounded-lg border px-2.5 py-2 space-y-1.5 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
        active ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
          {item.kind} 제{item.number.ordinal}호
        </span>
        {resolution.value ? (
          <span
            className={`shrink-0 text-[10px] font-medium border rounded px-1.5 py-0.5 ${
              RESOLUTION_STYLE[resolution.value]
            }`}
          >
            {resolution.value}
          </span>
        ) : (
          <span className="shrink-0 text-[10px] font-medium border border-rose-200 bg-rose-50 text-rose-700 rounded px-1.5 py-0.5">
            가결 여부 불명
          </span>
        )}
        <span className="ml-auto shrink-0 flex items-center gap-1 text-[11px] text-emerald-700">
          <Crosshair className="w-3.5 h-3.5" />
          {item.body.page}쪽
        </span>
      </div>

      {item.title.value ? (
        <button
          onClick={e => pick(e, path, item.title.evidence)}
          title="원문에서 이 제목이 나온 자리 보기"
          className="block text-left text-sm text-slate-900 font-medium break-all hover:text-emerald-800 cursor-pointer"
        >
          {item.title.value}
          {item.title.evidence.source === 'ocr' && <span className="ml-1"><OcrMark /></span>}
        </button>
      ) : (
        <p className="text-xs text-slate-400 italic">의안제목이 비어 있습니다</p>
      )}

      {summary.value && (
        <button
          onClick={e => pick(e, `${path}.summary`, summary.evidence)}
          title="원문에서 이 문장이 나온 자리 보기"
          className={`block w-full text-left text-[11px] text-slate-600 leading-relaxed break-all rounded px-1 -mx-1 py-0.5 transition ${
            selected === `${path}.summary` ? 'bg-emerald-50' : 'hover:bg-emerald-50/60'
          } cursor-pointer`}
        >
          <span className="text-slate-400">발췌 </span>
          “{summary.value}”
          {summary.evidence?.source === 'ocr' && <span className="ml-1"><OcrMark /></span>}
        </button>
      )}

      {(resolution.unanimous || Object.keys(resolution.votes).length > 0) && (
        <p className="text-[11px] text-slate-500 tabular-nums">
          {resolution.unanimous && <span className="text-slate-600">만장일치</span>}
          {Object.keys(resolution.votes).length > 0 && (
            <span className={resolution.unanimous ? 'ml-2' : ''}>
              찬성 {resolution.votes.for ?? '-'} · 반대 {resolution.votes.against ?? '-'} · 기권{' '}
              {resolution.votes.abstain ?? '-'}
            </span>
          )}
        </p>
      )}

      {(fsImpact.standards.length > 0 || fsImpact.amounts.length > 0) && (
        <div className="pt-1 border-t border-slate-100 space-y-1">
          {fsImpact.amounts.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {fsImpact.amounts.map((a, i) => (
                <button
                  key={i}
                  onClick={e => pick(e, `${path}.amount[${i}]`, a.evidence)}
                  title="원문에서 이 금액이 나온 자리 보기"
                  className="text-[10px] font-medium tabular-nums text-slate-700 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 hover:border-emerald-400 hover:text-emerald-800 transition cursor-pointer"
                >
                  {a.raw}
                </button>
              ))}
            </div>
          )}
          {fsImpact.standards.length > 0 && (
            <p className="text-[10px] text-slate-500 leading-relaxed">
              <span className="text-slate-400">기준서 후보 </span>
              {fsImpact.standards.map(c => c.replace('k-ifrs-', '제') + '호').join(' · ')}
              {fsImpact.reasoning && <span className="text-slate-400"> — {fsImpact.reasoning}</span>}
              <br />
              <span className="text-slate-400">{fsImpact.note}</span>
            </p>
          )}
        </div>
      )}

      {flags.map((f, i) => <FlagLine key={i} flag={f} />)}
    </div>
  );
};

const FieldRow: React.FC<{
  row: Row;
  flags: ReviewFlag[];
  active: boolean;
  onSelect: () => void;
}> = ({ row, flags, active, onSelect }) => (
  // 칸 어디를 눌러도 원문 자리로 간다. 근거가 없는 칸은 갈 데가 없으므로 누를
  // 수 없게 둔다 — 눌리는데 아무 일도 없는 것이 더 나쁘다.
  <div
    role={row.evidence ? 'button' : undefined}
    tabIndex={row.evidence ? 0 : undefined}
    title={row.evidence ? '누르면 원문에서 이 값이 나온 자리로 갑니다' : undefined}
    onClick={row.evidence ? onSelect : undefined}
    onKeyDown={
      row.evidence
        ? e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect();
            }
          }
        : undefined
    }
    className={`rounded-lg border px-2.5 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
      row.evidence ? 'cursor-pointer' : ''
    } ${
      active
        ? 'border-emerald-400 bg-emerald-50/60'
        : `border-slate-200 bg-white ${row.evidence ? 'hover:border-slate-300 hover:bg-slate-50' : ''}`
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
        <span className="ml-auto shrink-0 flex items-center gap-1 text-[11px] text-emerald-700">
          <Crosshair className="w-3.5 h-3.5" />
          {row.evidence.page}쪽
        </span>
      )}
    </div>

    {row.evidence && (
      <p className="mt-1 text-[11px] text-slate-500 break-all">
        <span className="text-slate-400">근거 </span>
        “{row.evidence.text}”
        {row.evidence.source === 'ocr' && <span className="ml-1"><OcrMark /></span>}
        {row.rule && <span className="ml-1 text-slate-400">· {row.rule}</span>}
      </p>
    )}

    {flags.map((f, i) => <FlagLine key={i} flag={f} />)}
  </div>
);

/**
 * OCR 로 읽은 근거에는 표를 단다. 화면에서 달라야 하는 이유는 하나다 —
 * **그 글자는 원문 그대로가 아니다.** 사람이 한 번 봐야 할 자리라는 뜻이다.
 */
const OcrMark: React.FC = () => (
  <span
    title="OCR 로 읽은 글자입니다 — 원문 그대로가 아닙니다"
    className="inline-flex items-center gap-0.5 align-middle text-[10px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded px-1 py-px"
  >
    <ScanLine className="w-2.5 h-2.5" />
    OCR
  </span>
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
