import React from 'react';
import { CalendarRange, Coins, Zap } from 'lucide-react';
import { FxCurrencyMeta } from '../types';
import { monthsBefore } from '../utils/dateRange';
import { FISCAL_PERIODS, FiscalPeriodKey } from '../utils/fiscalPeriod';

interface FxQueryPanelProps {
  currencies: FxCurrencyMeta[];
  code: string;
  onChangeCode: (code: string) => void;

  /** 결산기 바로 담기 */
  closingMonth: number;
  onChangeClosingMonth: (month: number) => void;
  year: number;
  onChangeYear: (year: number) => void;
  years: number[];
  activePeriod: FiscalPeriodKey | null;
  onPickPeriod: (key: FiscalPeriodKey) => void;
  /** 결산일이 아직 오지 않은 결산기 — 눌러 볼 수는 있되 미리 알려 준다 */
  unarrived: Set<FiscalPeriodKey>;

  /** 직접 기간 지정 */
  from: string;
  to: string;
  onChangeRange: (from: string, to: string) => void;
  /** 고른 통화에 실제로 자료가 있는 구간 — 달력을 그 밖으로 나가지 않게 막는다 */
  bounds?: { from: string; to: string };
}

/** 직접 조회할 때 쓰는 구간. */
const MONTH_PRESETS: { label: string; months: number }[] = [
  { label: '1개월', months: 1 },
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
  { label: '1년', months: 12 },
];

// 12월 결산이 대부분이지만 3월·6월 결산 법인도 있다.
const CLOSING_MONTHS = [12, 3, 6, 9];

export const FxQueryPanel: React.FC<FxQueryPanelProps> = ({
  currencies,
  code,
  onChangeCode,
  closingMonth,
  onChangeClosingMonth,
  year,
  onChangeYear,
  years,
  activePeriod,
  onPickPeriod,
  unarrived,
  from,
  to,
  onChangeRange,
  bounds,
}) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm shrink-0 divide-y divide-slate-100">
    {/* 결산기 — 감사에서 환율이 필요한 자리는 정해져 있다. 한 번에 담는다. */}
    <div className="p-3 flex flex-wrap items-end gap-x-3 gap-y-2">
      <label className="flex flex-col gap-1 min-w-[170px] flex-1">
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
        <span className="text-[11px] font-semibold text-slate-500">결산월</span>
        <select
          id="select-fx-closing-month"
          value={closingMonth}
          onChange={e => onChangeClosingMonth(Number(e.target.value))}
          className="px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {CLOSING_MONTHS.map(m => (
            <option key={m} value={m}>
              {m}월
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-slate-500">회계연도</span>
        <select
          id="select-fx-year"
          value={year}
          onChange={e => onChangeYear(Number(e.target.value))}
          className="px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {years.map(y => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
          <Zap className="w-3 h-3 text-emerald-600" />
          결산기 바로 담기
        </span>
        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs font-medium">
          {FISCAL_PERIODS.map(p => {
            const pending = unarrived.has(p.key);
            return (
              <button
                key={p.key}
                id={`btn-fx-period-${p.key}`}
                onClick={() => onPickPeriod(p.key)}
                className={`px-2.5 py-1.5 transition cursor-pointer whitespace-nowrap border-r border-slate-200 last:border-r-0 ${
                  activePeriod === p.key
                    ? 'bg-emerald-700 text-white font-semibold'
                    : pending
                      ? 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                      : 'bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-800'
                }`}
                title={
                  pending
                    ? `${p.label} 결산일이 아직 오지 않았습니다. 진행 중인 평균환율만 볼 수 있습니다.`
                    : `${p.label} 마감환율과 평균환율을 전기 비교까지 한 번에 담습니다`
                }
              >
                {p.label}{' '}
                {pending && (
                  <span className="ml-1 text-[9px] align-middle text-slate-400">미도래</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>

    {/* 직접 조회 — 결산기에 없는 구간이 필요할 때 */}
    <div className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
        <CalendarRange className="w-3 h-3 text-slate-400" />
        직접 조회
      </span>
      <div className="flex items-center gap-1">
        <input
          id="input-fx-from"
          type="date"
          value={from}
          min={bounds?.from}
          max={to}
          onChange={e => onChangeRange(e.target.value, to)}
          className="px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <span className="text-slate-400 text-xs">~</span>
        <input
          id="input-fx-to"
          type="date"
          value={to}
          min={from}
          max={bounds?.to}
          onChange={e => onChangeRange(from, e.target.value)}
          className="px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div className="flex rounded-lg border border-slate-300 overflow-hidden text-[11px] font-medium">
        {MONTH_PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => onChangeRange(monthsBefore(to, p.months), to)}
            className="px-2 py-1 bg-white text-slate-600 hover:bg-slate-100 transition cursor-pointer whitespace-nowrap border-r border-slate-200 last:border-r-0"
            title={`종료일에서 ${p.label} 거슬러 올라간다`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);
