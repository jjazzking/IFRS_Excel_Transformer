import React from 'react';
import { FxCurrencyData } from '../types';
import { FxKind, FxPeriod, computeCell } from '../utils/fxQuery';
import { formatNumber } from '../utils/sheetExport';

interface FxResultMatrixProps {
  kind: FxKind;
  periods: FxPeriod[];
  currencies: FxCurrencyData[];
  loading: boolean;
  /** 아직 단계를 다 고르지 않았을 때 보여 줄 말 */
  emptyHint: string;
}

/**
 * 왼쪽 아래 — 고른 시점 × 통화의 값을 근거와 함께 보여 준다.
 *
 * 조서 표(오른쪽)에는 숫자만 오르지만, 여기서는 그 숫자가 어디서 왔는지를 같이 본다.
 * 기준일이 휴일이라 직전 고시일을 썼는지, 평균에 며칠이 들어갔는지.
 */
export const FxResultMatrix: React.FC<FxResultMatrixProps> = ({
  kind,
  periods,
  currencies,
  loading,
  emptyHint,
}) => {
  if (periods.length === 0 || currencies.length === 0) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <p className="text-sm text-slate-500 text-center leading-relaxed max-w-sm">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 shrink-0 text-[11px] text-slate-600">
        시점 <span className="font-semibold text-slate-800">{periods.length}</span> × 통화{' '}
        <span className="font-semibold text-slate-800">{currencies.length}</span>
        {loading && <span className="ml-2 text-slate-400">불러오는 중…</span>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-100 text-slate-600 z-10">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold border-b border-slate-200 whitespace-nowrap">
                {kind === 'average' ? '기간' : '기준일'}
              </th>
              {currencies.map(d => (
                <th
                  key={d.code}
                  className="px-2 py-1.5 text-right font-semibold border-b border-slate-200 whitespace-nowrap"
                  title={d.name}
                >
                  {d.code}
                  {d.unit !== 1 && <span className="font-normal text-slate-400"> ({d.unit})</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map(p => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 align-top">
                <td className="px-2 py-1 whitespace-nowrap">
                  <div className="text-slate-800 font-medium">{p.header}</div>
                  <div className="text-[10px] text-slate-400 tabular-nums">
                    {kind === 'average' ? `${p.from} ~ ${p.to}` : p.to}
                  </div>
                </td>
                {currencies.map(d => {
                  const cell = computeCell(kind, d, p);
                  if (!cell) {
                    return (
                      <td key={d.code} className="px-2 py-1 text-right text-slate-300" title="자료 구간 밖">
                        –
                      </td>
                    );
                  }
                  const shifted = cell.appliedDate && cell.appliedDate !== p.to;
                  return (
                    <td key={d.code} className="px-2 py-1 text-right tabular-nums">
                      <div className="font-semibold text-slate-900">{formatNumber(cell.rate, 2)}</div>
                      {cell.days != null && <div className="text-[10px] text-slate-400">{cell.days}일 평균</div>}
                      {shifted && (
                        <div className="text-[10px] text-amber-600" title="기준일에 고시가 없어 직전 고시일 환율">
                          {cell.appliedDate} 고시
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
