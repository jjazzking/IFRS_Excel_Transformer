import React, { useMemo, useState } from 'react';
import { Check, ChevronRight, Plus, X } from 'lucide-react';
import { Chip, StepReset, TierButton, toggle } from './TierControls';
import { FxCurrencyMeta } from '../types';
import {
  FX_BASES,
  FX_DAILY_PRESETS,
  FX_KINDS,
  FxBasis,
  FxDailyPreset,
  FxKind,
  FxPeriod,
  dailyPresetRange,
} from '../utils/fxQuery';
import { isIsoDate } from '../utils/dateRange';

export interface FxQueryState {
  kind: FxKind | null;
  basis: FxBasis | null;
  periodIds: string[];
  spotDates: string[];
  dailyPreset: FxDailyPreset | null;
  range: { from: string; to: string };
  codes: string[];
}

interface FxQueryBuilderProps {
  query: FxQueryState;
  onChange: (patch: Partial<FxQueryState>) => void;
  /** 지금 유형·기준에서 고를 수 있는 시점들 (기말·평균환율일 때만) */
  periods: FxPeriod[];
  currencies: FxCurrencyMeta[];
  /** 자료가 있는 구간 — 달력이 그 밖으로 나가지 않게 */
  bounds: { from: string; to: string };
}

/**
 * 왼쪽 위 — 찾을 자료를 단계별 버튼으로 좁혀 간다.
 *
 * 한 단계를 고르면 다음 단계가 열린다. 앞 단계는 그대로 남아 있어 언제든 바꿀 수 있고,
 * 바꾸면 그 뒤 단계 중 의미가 달라지는 것만 비운다 (통화는 유지한다).
 * 단계마다 제목 옆 '초기화'로 그 단계를 비울 수 있다 — 아래 단계를 먼저 풀 필요가 없다.
 */
export const FxQueryBuilder: React.FC<FxQueryBuilderProps> = ({
  query,
  onChange,
  periods,
  currencies,
  bounds,
}) => {
  const { kind, basis } = query;

  // 단계마다 '골랐는가'. 다음 단계는 앞 단계가 모두 골라졌을 때만 연다.
  // reset 은 그 단계에서 고른 것이 있을 때만 둔다. 그 단계에 딸린 값(유형의 기준·시점,
  // 기준의 시점)은 함께 비우고, 유형과 상관없이 이어지는 값(거래일·기간·통화)은 남긴다.
  const steps: { key: string; title: string; done: boolean; reset?: () => void; body: React.ReactNode }[] = [];

  steps.push({
    key: 'kind',
    title: '찾는 자료',
    done: kind !== null,
    reset: kind !== null ? () => onChange({ kind: null, basis: null, periodIds: [] }) : undefined,
    body: (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-1.5">
        {FX_KINDS.map(k => (
          <TierButton
            key={k.value}
            id={`btn-fx-kind-${k.value}`}
            active={kind === k.value}
            label={k.label}
            hint={k.hint}
            onClick={() => {
              if (kind === k.value) return;
              onChange({
                kind: k.value,
                basis: null,
                periodIds: [],
                // 일자별 추이는 한 통화만 본다. 여럿 골라 두었으면 맨 앞 하나만 남긴다.
                ...(k.value === 'daily' && query.codes.length > 1 ? { codes: query.codes.slice(0, 1) } : {}),
              });
            }}
          />
        ))}
      </div>
    ),
  });

  if (kind === 'closing' || kind === 'average') {
    steps.push({
      key: 'basis',
      title: kind === 'closing' ? '기준 시점' : '평균 기간',
      done: basis !== null,
      reset: basis !== null ? () => onChange({ basis: null, periodIds: [] }) : undefined,
      body: (
        <div className="flex flex-wrap gap-1.5">
          {FX_BASES[kind].map(b => (
            <TierButton
              key={b.value}
              id={`btn-fx-basis-${b.value}`}
              active={basis === b.value}
              label={b.label}
              hint={b.hint}
              onClick={() => {
                if (basis !== b.value) onChange({ basis: b.value, periodIds: [] });
              }}
            />
          ))}
        </div>
      ),
    });
    steps.push({
      key: 'period',
      title: '시점 (여러 개 고르면 비교표)',
      done: query.periodIds.length > 0,
      reset: query.periodIds.length > 0 ? () => onChange({ periodIds: [] }) : undefined,
      body: (
        <PeriodPicker
          periods={periods}
          picked={query.periodIds}
          onChange={periodIds => onChange({ periodIds })}
        />
      ),
    });
  } else if (kind === 'spot') {
    steps.push({
      key: 'spot',
      title: '거래일',
      done: query.spotDates.length > 0,
      reset: query.spotDates.length > 0 ? () => onChange({ spotDates: [] }) : undefined,
      body: (
        <SpotDatePicker
          dates={query.spotDates}
          bounds={bounds}
          onChange={spotDates => onChange({ spotDates })}
        />
      ),
    });
  } else if (kind === 'daily') {
    steps.push({
      key: 'range',
      title: '기간',
      done: query.dailyPreset !== null,
      reset: query.dailyPreset !== null ? () => onChange({ dailyPreset: null }) : undefined,
      body: (
        <DailyRangePicker
          preset={query.dailyPreset}
          range={query.range}
          bounds={bounds}
          onChange={onChange}
        />
      ),
    });
  }

  if (kind !== null) {
    steps.push({
      key: 'currency',
      title: kind === 'daily' ? '통화 (하나)' : '통화 (여러 개 가능)',
      done: query.codes.length > 0,
      reset: query.codes.length > 0 ? () => onChange({ codes: [] }) : undefined,
      body: (
        <CurrencyPicker
          currencies={currencies}
          picked={query.codes}
          single={kind === 'daily'}
          onChange={codes => onChange({ codes })}
        />
      ),
    });
  }

  // 아직 고르지 않은 첫 단계까지만 보인다.
  const firstOpen = steps.findIndex(s => !s.done);
  const visible = firstOpen === -1 ? steps : steps.slice(0, firstOpen + 1);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 shrink-0 max-h-[55%] overflow-auto">
      <ol className="space-y-3">
        {visible.map((s, i) => (
          <li key={s.key} className="flex gap-2.5">
            <span
              className={`mt-0.5 w-5 h-5 shrink-0 rounded-full grid place-items-center text-[10px] font-bold ${
                s.done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600 ring-2 ring-emerald-400/60'
              }`}
            >
              {s.done ? <Check className="w-3 h-3" /> : i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                {s.title}
                {!s.done && <ChevronRight className="w-3 h-3 text-emerald-500" />}
                {s.reset && <StepReset id={`btn-fx-reset-${s.key}`} onClick={s.reset} />}
              </p>
              {s.body}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};

// ---------------------------------------------------------------------------

const PeriodPicker: React.FC<{
  periods: FxPeriod[];
  picked: string[];
  onChange: (ids: string[]) => void;
}> = ({ periods, picked, onChange }) => {
  const groups = useMemo(() => {
    const map = new Map<string, FxPeriod[]>();
    for (const p of periods) {
      const list = map.get(p.group) ?? [];
      list.push(p);
      map.set(p.group, list);
    }
    return [...map.entries()];
  }, [periods]);

  if (periods.length === 0) {
    return <p className="text-[11px] text-slate-400">이 기준으로 고를 수 있는 기간이 자료에 없습니다.</p>;
  }

  return (
    <div className="space-y-1">
      {groups.map(([group, list]) => (
        <div key={group || 'all'} className="flex items-start gap-2">
          {group && <span className="w-11 shrink-0 pt-1 text-[11px] text-slate-500 tabular-nums">{group}</span>}
          <div className="flex flex-wrap gap-1">
            {list.map(p => (
              <Chip key={p.id} active={picked.includes(p.id)} onClick={() => onChange(toggle(picked, p.id))} title={p.header}>
                {p.label}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      {picked.length > 0 && <p className="text-[10px] text-slate-400">{picked.length}개 선택</p>}
    </div>
  );
};

/** '2025-03-15', '2025.3.15', '2025/03/15', '20250315' 를 ISO 날짜로 */
function parseDates(text: string): string[] {
  const out: string[] = [];
  const re = /(\d{4})[-./]?\s*(\d{1,2})[-./]?\s*(\d{1,2})/g;
  for (const m of text.matchAll(re)) {
    const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    if (isIsoDate(iso)) out.push(iso);
  }
  return out;
}

const SpotDatePicker: React.FC<{
  dates: string[];
  bounds: { from: string; to: string };
  onChange: (dates: string[]) => void;
}> = ({ dates, bounds, onChange }) => {
  const [text, setText] = useState('');
  const [picker, setPicker] = useState('');

  const add = (values: string[]) => {
    if (values.length === 0) return;
    onChange([...new Set([...dates, ...values])].sort());
  };

  const commitText = () => {
    add(parseDates(text));
    setText('');
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          id="input-fx-spot-date"
          type="date"
          value={picker}
          min={bounds.from}
          max={bounds.to}
          onChange={e => setPicker(e.target.value)}
          className="px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          onClick={() => {
            if (isIsoDate(picker)) add([picker]);
          }}
          className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px] text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          추가
        </button>
        <input
          id="input-fx-spot-paste"
          type="text"
          value={text}
          placeholder="엑셀에서 날짜 여러 개 붙여넣기"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitText();
          }}
          onPaste={e => {
            e.preventDefault();
            add(parseDates(e.clipboardData.getData('text')));
          }}
          className="flex-1 min-w-[160px] px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      {dates.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {dates.map(d => (
            <span
              key={d}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 tabular-nums"
            >
              {d}
              <button
                onClick={() => onChange(dates.filter(x => x !== d))}
                className="text-emerald-500 hover:text-emerald-800 cursor-pointer"
                aria-label={`${d} 빼기`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-[10px] text-slate-400">
        주말·공휴일이면 직전 고시일 환율을 씁니다. 자료 구간 {bounds.from} ~ {bounds.to}
      </p>
    </div>
  );
};

const DailyRangePicker: React.FC<{
  preset: FxDailyPreset | null;
  range: { from: string; to: string };
  bounds: { from: string; to: string };
  onChange: (patch: Partial<FxQueryState>) => void;
}> = ({ preset, range, bounds, onChange }) => (
  <div className="space-y-1.5">
    <div className="flex flex-wrap gap-1">
      {FX_DAILY_PRESETS.map(p => (
        <Chip
          key={p.value}
          active={preset === p.value}
          onClick={() => {
            const next = dailyPresetRange(p.value, bounds.to);
            onChange({
              dailyPreset: p.value,
              // 자료가 시작하기 전으로는 넘어가지 않는다.
              ...(next ? { range: { from: next.from < bounds.from ? bounds.from : next.from, to: next.to } } : {}),
            });
          }}
        >
          {p.label}
        </Chip>
      ))}
    </div>
    {preset !== null && (
      <div className="flex items-center gap-1">
        <input
          id="input-fx-from"
          type="date"
          value={range.from}
          min={bounds.from}
          max={range.to}
          onChange={e => onChange({ dailyPreset: 'custom', range: { ...range, from: e.target.value } })}
          className="px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <span className="text-slate-400 text-xs">~</span>
        <input
          id="input-fx-to"
          type="date"
          value={range.to}
          min={range.from}
          max={bounds.to}
          onChange={e => onChange({ dailyPreset: 'custom', range: { ...range, to: e.target.value } })}
          className="px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
    )}
  </div>
);

const CurrencyPicker: React.FC<{
  currencies: FxCurrencyMeta[];
  picked: string[];
  single: boolean;
  onChange: (codes: string[]) => void;
}> = ({ currencies, picked, single, onChange }) => (
  <div className="flex flex-wrap gap-1">
    {currencies.map(c => (
      <Chip
        key={c.code}
        active={picked.includes(c.code)}
        title={`${c.name}${c.unit !== 1 ? ` · ${c.unit}단위 고시` : ''}`}
        onClick={() => onChange(single ? [c.code] : toggle(picked, c.code))}
      >
        {c.code}
        {c.unit !== 1 && <span className="opacity-70"> ({c.unit})</span>}
        <span className="ml-1 font-normal opacity-70">{c.name}</span>
      </Chip>
    ))}
  </div>
);
