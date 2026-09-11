import React from 'react';
import { Check, Minus, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { FxRateRow } from '../types';
import { formatNumber } from '../utils/sheetExport';

/** 결산기 모드일 때, 지금 보는 구간이 어느 결산기인지와 어느 날 고시가 쓰였는지. */
export interface PeriodNote {
  label: string;
  closingDate: string;
  /** 결산일에 고시가 없으면 직전 고시일. 결산일과 다르면 그 사실을 알린다 */
  appliedDate?: string;
  /** 결산일이 아직 오지 않았다 — 휴장과는 다른 상황이다 */
  pending?: boolean;
}

interface FxRateTableProps {
  rows: FxRateRow[];
  pickedDates: ReadonlySet<string>;
  onTogglePick: (date: string) => void;
  onPickAll: () => void;
  onClearPicks: () => void;
  digits: number;
  /** 이 통화에 시가·고가·저가가 있는지 (USD 에만 있다) */
  hasOhlc: boolean;
  loading: boolean;
  periodNote?: PeriodNote;
}

export const FxRateTable: React.FC<FxRateTableProps> = ({
  rows,
  pickedDates,
  onTogglePick,
  onPickAll,
  onClearPicks,
  digits,
  hasOhlc,
  loading,
  periodNote,
}) => {
  if (loading) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center bg-white rounded-xl border border-slate-200 shadow-sm">
        <p className="text-sm text-slate-500">환율을 불러오는 중입니다…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <p className="text-sm text-slate-500 text-center leading-relaxed">
          이 기간에는 고시된 환율이 없습니다.
          <br />
          주말과 공휴일에는 고시가 없으니 기간을 넓혀 보세요.
        </p>
      </div>
    );
  }

  const allPicked = rows.every(r => pickedDates.has(r.date));

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-200 shrink-0">
        <span className="text-[11px] text-slate-600">
          고시 <span className="font-semibold text-slate-800">{rows.length}일</span>
          {periodNote ? (
            <span className="text-emerald-700"> · 평균환율이 이 {rows.length}일로 계산됩니다</span>
          ) : (
            pickedDates.size > 0 && (
              <span className="text-emerald-700 font-semibold"> · 담은 날 {pickedDates.size}일</span>
            )
          )}
        </span>
        <div className="flex items-center gap-1">
          <button
            id="btn-fx-pick-all"
            onClick={allPicked ? onClearPicks : onPickAll}
            className="text-[11px] px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            {allPicked ? '모두 빼기' : '보이는 날 모두 담기'}
          </button>
        </div>
      </div>

      {/* 결산일 사정을 화면에서도 알린다 — 미도래와 휴장은 다른 상황이다. */}
      {periodNote?.pending && (
        <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900 shrink-0">
          <span className="font-semibold">{periodNote.closingDate}</span> 결산일이 아직 오지
          않았습니다. 마감환율은 비워 두고, 평균환율만 지금까지로 계산합니다.
        </div>
      )}
      {periodNote &&
        !periodNote.pending &&
        periodNote.appliedDate &&
        periodNote.appliedDate !== periodNote.closingDate && (
          <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900 shrink-0">
            {periodNote.closingDate} 은 고시가 없어 직전 고시일{' '}
            <span className="font-semibold">{periodNote.appliedDate}</span> 을 마감환율로 씁니다.
          </div>
        )}

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-100 text-slate-600 z-10">
            <tr>
              <th className="w-8 px-1 py-1.5 border-b border-slate-200" />
              <th className="px-2 py-1.5 text-left font-semibold border-b border-slate-200">일자</th>
              <th className="px-2 py-1.5 text-right font-semibold border-b border-slate-200">매매기준율</th>
              <th className="px-2 py-1.5 text-right font-semibold border-b border-slate-200">전일대비</th>
              {hasOhlc && (
                <>
                  <th className="px-2 py-1.5 text-right font-semibold border-b border-slate-200">시가</th>
                  <th className="px-2 py-1.5 text-right font-semibold border-b border-slate-200">고가</th>
                  <th className="px-2 py-1.5 text-right font-semibold border-b border-slate-200">저가</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const picked = pickedDates.has(r.date);
              const isClosing = periodNote?.appliedDate === r.date;
              return (
                <tr
                  key={r.date}
                  className={`border-b border-slate-100 ${
                    isClosing
                      ? 'bg-emerald-100/80 ring-1 ring-inset ring-emerald-400'
                      : picked
                        ? 'bg-emerald-50/70'
                        : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="px-1 py-1 text-center">
                    {periodNote ? (
                      isClosing ? (
                        <span
                          className="text-[9px] font-bold text-emerald-800"
                          title={`${periodNote.label} 마감환율`}
                        >
                          마감
                        </span>
                      ) : null
                    ) : (
                    <button
                      onClick={() => onTogglePick(r.date)}
                      className={`w-5 h-5 rounded grid place-items-center transition cursor-pointer ${
                        picked
                          ? 'bg-emerald-600 text-white'
                          : 'border border-slate-300 text-slate-400 hover:border-emerald-500 hover:text-emerald-600'
                      }`}
                      title={picked ? '조서에서 빼기' : '조서에 담기'}
                      aria-label={picked ? `${r.date} 빼기` : `${r.date} 담기`}
                    >
                      {picked ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                    </button>
                    )}
                  </td>
                  <td className="px-2 py-1 text-slate-700 tabular-nums whitespace-nowrap">{r.date}</td>
                  <td className="px-2 py-1 text-right font-semibold text-slate-900 tabular-nums">
                    {formatNumber(r.rate, digits)}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {r.change === undefined ? (
                      <span className="text-slate-300">–</span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-0.5 ${
                          r.change > 0 ? 'text-rose-600' : r.change < 0 ? 'text-blue-600' : 'text-slate-400'
                        }`}
                      >
                        {r.change > 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : r.change < 0 ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : (
                          <Minus className="w-3 h-3" />
                        )}
                        {formatNumber(Math.abs(r.change), digits)}
                      </span>
                    )}
                  </td>
                  {hasOhlc && (
                    <>
                      <td className="px-2 py-1 text-right text-slate-500 tabular-nums">
                        {r.open === undefined ? '' : formatNumber(r.open, digits)}
                      </td>
                      <td className="px-2 py-1 text-right text-slate-500 tabular-nums">
                        {r.high === undefined ? '' : formatNumber(r.high, digits)}
                      </td>
                      <td className="px-2 py-1 text-right text-slate-500 tabular-nums">
                        {r.low === undefined ? '' : formatNumber(r.low, digits)}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
