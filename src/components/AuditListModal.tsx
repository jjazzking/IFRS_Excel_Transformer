import React, { useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { AccountingStandard } from '../types';
import {
  AuditFinding,
  AuditResult,
  AuditRule,
  RULE_HINT,
  RULE_LABEL,
  formatMissingNumbers,
  primaryFinding,
} from '../utils/auditStandards';

/** 한 문단에 여러 규칙이 걸려도 칩은 하나만 — 가장 심각한 규칙으로 보여준다. */
function oneChipPerParagraph(findings: AuditFinding[]): AuditFinding[] {
  const grouped = new Map<string, AuditFinding[]>();
  for (const f of findings) {
    const list = grouped.get(f.paragraphId);
    if (list) list.push(f);
    else grouped.set(f.paragraphId, [f]);
  }
  return Array.from(grouped.values(), primaryFinding);
}

interface AuditListModalProps {
  isOpen: boolean;
  audit: AuditResult;
  standards: AccountingStandard[];
  editedIds: Set<string>;
  onClose: () => void;
  onGoToParagraph: (paragraphId: string, standardId: string) => void;
}

const RULE_ORDER: AuditRule[] = [
  'TOO_SHORT',
  'DUP_BODY',
  'NUM_GAP',
  'OVERSIZE',
  'HEADING_LEAK',
  'TAIL_NOISE',
];

export const AuditListModal: React.FC<AuditListModalProps> = ({
  isOpen,
  audit,
  standards,
  editedIds,
  onClose,
  onGoToParagraph,
}) => {
  const [ruleFilter, setRuleFilter] = useState<AuditRule | 'all'>('all');

  const rows = useMemo(
    () =>
      standards
        .map(s => ({ standard: s, result: audit.byStandard.get(s.id) }))
        .filter(row => {
          const r = row.result;
          if (!r) return false;
          if (ruleFilter === 'all') return r.findings.length > 0 || r.missingNumbers.length > 0;
          if (ruleFilter === 'NUM_GAP') return r.missingNumbers.length > 0;
          return r.findings.some(f => f.rule === ruleFilter);
        })
        .sort(
          (a, b) =>
            (audit.countByStandard.get(b.standard.id) || 0) -
            (audit.countByStandard.get(a.standard.id) || 0)
        ),
    [standards, audit, ruleFilter]
  );

  if (!isOpen) return null;

  const cleanCount = standards.length - rows.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl max-h-[85vh] bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              의심 문단 {audit.total}곳
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              기계가 짚은 자리일 뿐 오류로 확정된 것은 아닙니다. 원문과 대조해 판단하세요.
              고치면 노란 표시가 사라집니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 규칙별 필터 */}
        <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-1 shrink-0">
          <FilterChip
            label={`전체 ${audit.total}`}
            active={ruleFilter === 'all'}
            onClick={() => setRuleFilter('all')}
          />
          {RULE_ORDER.filter(rule => audit.ruleCounts[rule] > 0).map(rule => (
            <FilterChip
              key={rule}
              label={`${RULE_LABEL[rule]} ${audit.ruleCounts[rule]}`}
              title={RULE_HINT[rule]}
              active={ruleFilter === rule}
              onClick={() => setRuleFilter(rule)}
            />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {rows.map(({ standard, result }) => {
            const findings = oneChipPerParagraph(
              ruleFilter === 'all' || ruleFilter === 'NUM_GAP'
                ? result!.findings
                : result!.findings.filter(f => f.rule === ruleFilter)
            );
            const showGap =
              result!.missingNumbers.length > 0 &&
              (ruleFilter === 'all' || ruleFilter === 'NUM_GAP');
            return (
              <div key={standard.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 truncate">
                    {standard.code} <span className="font-normal text-slate-500">{standard.title}</span>
                  </span>
                  <span className="text-[10px] text-slate-500 shrink-0">
                    문단 {standard.paragraphs.length} 중 {findings.length + (showGap ? 1 : 0)}곳
                  </span>
                </div>
                <div className="p-2 space-y-1.5">
                  {showGap && (
                    <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                      <b>문단번호 누락 {result!.missingNumbers.length}개</b> — 비어 있는 번호:{' '}
                      {formatMissingNumbers(result!.missingNumbers)}. 없는 문단은 앱에서 만들 수
                      없어 파서 수정이 필요합니다.
                    </p>
                  )}
                  {findings.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {findings.map(f => {
                        const fixed = editedIds.has(f.paragraphId);
                        return (
                          <button
                            key={f.paragraphId}
                            onClick={() => {
                              onGoToParagraph(f.paragraphId, standard.id);
                              onClose();
                            }}
                            title={`${RULE_LABEL[f.rule]} — ${f.evidence}`}
                            className={`px-1.5 py-0.5 rounded text-[11px] font-medium border transition cursor-pointer tabular-nums ${
                              fixed
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 line-through'
                                : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                            }`}
                          >
                            {f.paragraphNumber}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="text-center text-xs text-slate-400 py-12">해당하는 의심 지점이 없습니다.</p>
          )}
        </div>

        {cleanCount > 0 && ruleFilter === 'all' && (
          <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 shrink-0">
            의심 지점이 없는 기준서 <b>{cleanCount}건</b>은 목록에서 뺐습니다.
          </div>
        )}
      </div>
    </div>
  );
};

const FilterChip: React.FC<{
  label: string;
  title?: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, title, active, onClick }) => (
  <button
    onClick={onClick}
    title={title}
    className={`px-2 py-1 rounded text-[11px] border transition cursor-pointer whitespace-nowrap ${
      active
        ? 'bg-slate-800 text-white border-slate-800 font-medium'
        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
    }`}
  >
    {label}
  </button>
);
