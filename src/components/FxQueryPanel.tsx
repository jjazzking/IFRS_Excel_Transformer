import React from 'react';
import { CalendarRange, Coins } from 'lucide-react';
import { FxCurrencyMeta } from '../types';

interface FxQueryPanelProps {
  currencies: FxCurrencyMeta[];
  code: string;
  onChangeCode: (code: string) => void;
  from: string;
  to: string;
  onChangeRange: (from: string, to: string) => void;
  /** 고른 통화에 실제로 자료가 있는 구간 — 달력을 그 밖으로 나가지 않게 막는다 */
  bounds?: { from: string; to: string };
}

/** 기말 조서를 만들 때 실제로 쓰는 구간들. */
const PRESETS: { label: string; months: number }[] = [
  { label: '1개월', months: 1 },
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
  { label: '1년', months: 12 },
];

function shiftMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() - months);
  // 말일에서 뒤로 갈 때 달을 넘겨 버리는 경우(3월 31일 → 3월 3일)를 막는다.
  return d.toISOString().slice(0, 10);
}

export const FxQueryPanel: React.FC<FxQueryPanelProps> = ({
  currencies,
  code,
  onChangeCode,
  from,
  to,
  onChangeRange,
  bounds,
}) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 shrink-0">
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <label className="flex flex-col gap-1 min-w-[190px] flex-1">
        <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
          <Coins className="w-3 h-3 text-emerald-600" />
          통화
        </span>
        <select
          id="select-fx-currency"
          value={code}
          onChange={e => onChangeCode(e.target.value)}
          className="px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        >
          {currencies.map(c => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.code}){c.unit !== 1 ? ` · ${c.unit}단위` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
          <CalendarRange className="w-3 h-3 text-emerald-600" />
          기간
        </span>
        <div className="flex items-center gap-1">
          <input
            id="input-fx-from"
            type="date"
            value={from}
            min={bounds?.from}
            max={to}
            onChange={e => onChangeRange(e.target.value, to)}
            className="px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <span className="text-slate-400 text-xs">~</span>
          <input
            id="input-fx-to"
            type="date"
            value={to}
            min={from}
            max={bounds?.to}
            onChange={e => onChangeRange(from, e.target.value)}
            className="px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </label>

      <div className="flex rounded-lg border border-slate-300 overflow-hidden text-[11px] font-medium">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => onChangeRange(shiftMonths(to, p.months), to)}
            className="px-2 py-1.5 bg-white text-slate-600 hover:bg-slate-100 transition cursor-pointer whitespace-nowrap border-r border-slate-200 last:border-r-0"
            title={`종료일에서 ${p.label} 거슬러 올라간다`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);
