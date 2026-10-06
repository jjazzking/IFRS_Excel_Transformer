import React from 'react';
import { Star } from 'lucide-react';
import { CellShade, RateRowMeta, RatesDay } from '../types';
import { RateColumn, cellValue, shadeOf } from '../utils/ratesQuery';

interface RatesMatrixProps {
  terms: string[];
  rows: RateRowMeta[];
  columns: RateColumn[];
  day: RatesDay | null;
  requestedDate: string | null;
  pickedRows: string[];
  loading: boolean;
  suggest?: (row: RateRowMeta) => boolean;
  onToggleRow: (code: string) => void;
  onToggleTerm: (termIndex: number) => void;
  /** 칸을 누르면 그 행과 열을 함께 고른다 */
  onPickCell: (code: string, termIndex: number | undefined) => void;
  emptyHint: string;
}

const SHADE_BG: Record<CellShade, string> = {
  soft: 'bg-[#FFF2CC]',
  strong: 'bg-[#FFD966] font-bold',
  // 보간 열 — 고시값이 아니라 계산한 값이라 한 단계 진하게
  interp: 'bg-[#FFE699]',
  interpStrong: 'bg-[#FFC000] font-bold',
};

/**
 * 왼쪽 아래 — 금투협 표를 그대로 보여 주고, 고른 행·열에 음영을 칠한다.
 *
 * 행 이름이나 만기 머리글을 누르면 그 행·열을 고르고, 칸을 누르면 둘 다 고른다.
 * 겹치는 칸(진한 노랑)이 조서에서 실제로 쓰는 값이다.
 */
export const RatesMatrix: React.FC<RatesMatrixProps> = ({
  terms,
  rows,
  columns,
  day,
  requestedDate,
  pickedRows,
  loading,
  suggest,
  onToggleRow,
  onToggleTerm,
  onPickCell,
  emptyHint,
}) => {
  if (!day) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <p className="text-sm text-slate-500 text-center leading-relaxed max-w-sm">
          {loading ? '표를 불러오는 중…' : emptyHint}
        </p>
      </div>
    );
  }

  const picked = new Set(pickedRows);
  const present = rows.filter(r => day.v[r.code]);
  let prevCat = '';

  return (
    <div className="flex-1 min-h-[220px] flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-3 py-1.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-x-3 gap-y-1 shrink-0 text-[11px]">
        <span className="font-semibold text-slate-700">채권시가평가수익률 · 평가사 평균</span>
        <span className="tabular-nums text-slate-600">기준일 {day.date}</span>
        {requestedDate && requestedDate !== day.date && (
          <span className="text-amber-700">{requestedDate} 은 고시가 없어 직전 고시일 표입니다</span>
        )}
        <span className="ml-auto text-slate-400">단위 % · 머리글을 눌러 행·열 고르기</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="text-[11px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100">
              <th className="sticky left-0 z-20 bg-slate-100 border border-slate-300 px-2 py-1 text-left font-semibold text-slate-700 whitespace-nowrap">
                종류 · 종류명 · 신용등급
              </th>
              {columns.map(c => (
                <th
                  key={c.key}
                  onClick={() => c.termIndex !== undefined && onToggleTerm(c.termIndex)}
                  aria-pressed={c.picked}
                  title={c.termIndex === undefined ? '보간 열 — 만기 단계에서 뺄 수 있습니다' : '눌러서 이 만기 고르기'}
                  className={`border border-slate-300 px-1.5 py-1 font-semibold whitespace-nowrap ${
                    c.termIndex !== undefined ? 'cursor-pointer hover:bg-emerald-100' : 'italic'
                  } ${c.picked ? SHADE_BG[c.termIndex === undefined ? 'interp' : 'soft'] : 'bg-slate-100'} text-slate-700`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {present.map(r => {
              const rowPicked = picked.has(r.code);
              const newCat = r.category !== prevCat;
              prevCat = r.category;
              const values = day.v[r.code];
              return (
                <tr key={r.code} className={newCat ? 'border-t-2 border-slate-300' : ''}>
                  <th
                    onClick={() => onToggleRow(r.code)}
                    aria-pressed={rowPicked}
                    className={`sticky left-0 z-[5] border border-slate-300 px-2 py-0.5 text-left font-normal whitespace-nowrap cursor-pointer hover:bg-emerald-100 ${
                      rowPicked ? SHADE_BG.soft : 'bg-white'
                    }`}
                  >
                    <span className="text-slate-400">{newCat ? r.category : ''}</span>
                    {newCat && <span className="text-slate-300"> · </span>}
                    <span className="text-slate-800">
                      {[r.type, r.grade].filter(Boolean).join(' ')}
                    </span>
                    {suggest?.(r) && <Star className="inline w-2.5 h-2.5 -mt-0.5 ml-1 fill-amber-400 text-amber-400" />}
                  </th>
                  {columns.map(c => {
                    const v = cellValue(terms, values, c);
                    const shade = shadeOf(rowPicked, c.picked, c.termIndex === undefined);
                    return (
                      <td
                        key={c.key}
                        onClick={() => onPickCell(r.code, c.termIndex)}
                        className={`border border-slate-200 px-1.5 py-0.5 text-right tabular-nums cursor-pointer hover:outline hover:outline-1 hover:outline-emerald-500 ${
                          shade ? SHADE_BG[shade] : ''
                        } ${c.termIndex === undefined ? 'italic' : ''}`}
                      >
                        {v === null ? <span className="text-slate-300">-</span> : v.toFixed(3)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
