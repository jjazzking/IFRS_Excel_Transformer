import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Plus, Star, X } from 'lucide-react';
import { RateRowMeta } from '../types';
import { Chip, TierButton, toggle } from './TierControls';
import { PURPOSES, PURPOSE_BY_VALUE, RatePurpose, quarterEnds, termLabel } from '../utils/ratesQuery';
import { isIsoDate } from '../utils/dateRange';
import { RatingLookup } from './RatingLookup';

export interface RatesQueryState {
  purpose: RatePurpose | null;
  /** 고른 기준일. 고시가 없는 날이면 직전 고시일 표를 쓴다 */
  date: string | null;
  rowCodes: string[];
  termIdx: number[];
  /** 보간할 잔존기간 (년) */
  customTerms: number[];
  /** 신용등급 찾기로 행을 골랐을 때 조서 각주에 남기는 문장 */
  ratingNote?: string;
}

interface RatesQueryBuilderProps {
  query: RatesQueryState;
  onChange: (patch: Partial<RatesQueryState>) => void;
  terms: string[];
  rows: RateRowMeta[];
  bounds: { from: string; to: string };
}

/**
 * 왼쪽 위 — 용도 → 기준일 → 종류·등급(행) → 만기(열) 순으로 좁혀 간다.
 *
 * 환율 작업대와 같은 규칙이다. 한 단계를 고르면 다음 단계가 열리고, 고른 단계 버튼을
 * 다시 누르면 취소된다 (아래 단계에 고른 것이 남아 있으면 취소하지 않는다).
 */
export const RatesQueryBuilder: React.FC<RatesQueryBuilderProps> = ({ query, onChange, terms, rows, bounds }) => {
  const [blockedNote, setBlockedNote] = useState<string | null>(null);
  const noteTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(noteTimer.current), []);
  const showBlocked = (step: string) => {
    setBlockedNote(step);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setBlockedNote(null), 2500);
  };

  const guide = query.purpose ? PURPOSE_BY_VALUE.get(query.purpose) : undefined;

  const steps: { key: string; title: string; done: boolean; body: React.ReactNode }[] = [];

  steps.push({
    key: 'purpose',
    title: '용도',
    done: query.purpose !== null,
    body: (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-1.5">
        {PURPOSES.map(p => (
          <TierButton
            key={p.value}
            id={`btn-rates-purpose-${p.value}`}
            active={query.purpose === p.value}
            label={p.label}
            hint={p.hint}
            locked={query.purpose === p.value && query.date !== null}
            onClick={() => {
              if (query.purpose === p.value) {
                if (query.date !== null) showBlocked('purpose');
                else onChange({ purpose: null });
                return;
              }
              // 용도를 바꾸면 그 용도의 권장 행을 미리 칠한다. 권장 행이 없는 용도(리스 —
              // 회사 등급마다 다르다)면 이미 고른 행을 그대로 둔다.
              onChange({ purpose: p.value, ...(p.presetRows.length ? { rowCodes: p.presetRows } : {}) });
            }}
          />
        ))}
      </div>
    ),
  });

  steps.push({
    key: 'date',
    title: '기준일',
    done: query.date !== null,
    body: <DatePicker date={query.date} bounds={bounds} onChange={date => onChange({ date })} />,
  });

  steps.push({
    key: 'rows',
    title: guide?.rowAdvice ? `종류·등급 (행) — ${guide.rowAdvice}` : '종류·등급 (행, 여러 개 가능)',
    done: query.rowCodes.length > 0,
    body: (
      <>
        <RatingLookup
          rows={rows}
          pickedRows={query.rowCodes}
          asOf={query.date ?? bounds.to}
          note={query.ratingNote}
          onPick={(code, ratingNote) =>
            onChange({ rowCodes: query.rowCodes.includes(code) ? query.rowCodes : [...query.rowCodes, code], ratingNote })
          }
          onClearNote={() => onChange({ ratingNote: undefined })}
        />
        <RowPicker
          rows={rows}
          picked={query.rowCodes}
          suggest={guide?.suggestRow}
          onChange={rowCodes => onChange({ rowCodes })}
        />
      </>
    ),
  });

  steps.push({
    key: 'terms',
    title: guide?.termAdvice ? `만기 (열) — ${guide.termAdvice}` : '만기 (열, 여러 개 가능)',
    done: query.termIdx.length + query.customTerms.length > 0,
    body: (
      <TermPicker
        terms={terms}
        picked={query.termIdx}
        custom={query.customTerms}
        onChange={onChange}
      />
    ),
  });

  const firstOpen = steps.findIndex(s => !s.done);
  const visible = firstOpen === -1 ? steps : steps.slice(0, firstOpen + 1);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex-1 min-h-0 overflow-auto">
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
                {!s.done && <ChevronRight className="w-3 h-3 text-emerald-500 shrink-0" />}
              </p>
              {s.body}
              {blockedNote === s.key && (
                <p role="status" className="mt-1 text-[10px] text-amber-600">
                  아래 단계에서 고른 것을 먼저 해제해야 취소됩니다.
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};

// ---------------------------------------------------------------------------

const DatePicker: React.FC<{
  date: string | null;
  bounds: { from: string; to: string };
  onChange: (date: string | null) => void;
}> = ({ date, bounds, onChange }) => {
  const presets = useMemo(() => quarterEnds(bounds), [bounds]);
  const groups = useMemo(() => {
    const map = new Map<string, typeof presets>();
    for (const p of presets) map.set(p.group, [...(map.get(p.group) ?? []), p]);
    return [...map.entries()];
  }, [presets]);
  // 같은 버튼을 다시 누르면 취소 — 기준일 하나만 고른다.
  const pick = (value: string) => onChange(date === value ? null : value);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={date === bounds.to} onClick={() => pick(bounds.to)} title="받아 둔 자료 중 가장 최근 고시일">
          최근 고시일 <span className="font-normal opacity-70 tabular-nums">{bounds.to}</span>
        </Chip>
        <input
          id="input-rates-date"
          type="date"
          value={date ?? ''}
          min={bounds.from}
          max={bounds.to}
          onChange={e => onChange(isIsoDate(e.target.value) ? e.target.value : null)}
          className="px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      {groups.map(([group, list]) => (
        <div key={group} className="flex items-start gap-2">
          <span className="w-11 shrink-0 pt-1 text-[11px] text-slate-500 tabular-nums">{group}</span>
          <div className="flex flex-wrap gap-1">
            {list.map(p => (
              <Chip key={p.date} active={date === p.date} onClick={() => pick(p.date)} title={p.date}>
                {p.label}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-slate-400">
        주말·공휴일이면 직전 고시일 표를 쓰고 각주에 남깁니다. 자료 구간 {bounds.from} ~ {bounds.to}
      </p>
    </div>
  );
};

/** 행 이름 — 종류명과 신용등급을 붙인다 ('무보증 AA-', '국고채권') */
export function rowShortLabel(r: RateRowMeta): string {
  return [r.type, r.grade].filter(Boolean).join(' ') || r.category;
}

const RowPicker: React.FC<{
  rows: RateRowMeta[];
  picked: string[];
  suggest?: (row: RateRowMeta) => boolean;
  onChange: (codes: string[]) => void;
}> = ({ rows, picked, suggest, onChange }) => {
  const groups = useMemo(() => {
    const map = new Map<string, RateRowMeta[]>();
    for (const r of rows) map.set(r.category, [...(map.get(r.category) ?? []), r]);
    return [...map.entries()];
  }, [rows]);

  return (
    <div className="space-y-1">
      {groups.map(([category, list]) => (
        <div key={category} className="flex items-start gap-2">
          <span className="w-28 shrink-0 pt-1 text-[11px] text-slate-500 leading-tight">{category}</span>
          <div className="flex flex-wrap gap-1">
            {list.map(r => (
              <Chip
                key={r.code}
                active={picked.includes(r.code)}
                onClick={() => onChange(toggle(picked, r.code))}
                title={`${r.category} · ${rowShortLabel(r)}${suggest?.(r) ? ' — 이 용도에 권장' : ''}`}
              >
                {suggest?.(r) && <Star className="inline w-2.5 h-2.5 -mt-0.5 mr-0.5 fill-amber-400 text-amber-400" />}
                {rowShortLabel(r)}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      {picked.length > 0 && (
        <button onClick={() => onChange([])} className="text-[10px] text-slate-400 hover:text-slate-700 cursor-pointer">
          {picked.length}개 선택 · 모두 해제
        </button>
      )}
    </div>
  );
};

/** '4.5', '4년6월', '54개월', '54m' 를 년으로 */
export function parseTermInput(text: string): number | null {
  const t = text.trim().replace(/\s+/g, '');
  if (!t) return null;
  let years: number | null = null;
  const ym = /^(?:(\d+)년)?(?:(\d+)(?:개월|월))?$/.exec(t);
  if (ym && (ym[1] || ym[2])) years = Number(ym[1] ?? 0) + Number(ym[2] ?? 0) / 12;
  else if (/^\d+(?:\.\d+)?m$/i.test(t)) years = parseFloat(t) / 12;
  else if (/^\d+(?:\.\d+)?$/.test(t)) years = parseFloat(t);
  if (years === null || !(years > 0)) return null;
  // 개월 단위로 맞춘다 — 열 이름이 '4년6월' 꼴이라 그보다 잘게 나눌 일이 없다.
  return Math.round(years * 12) / 12;
}

const TermPicker: React.FC<{
  terms: string[];
  picked: number[];
  custom: number[];
  onChange: (patch: Partial<RatesQueryState>) => void;
}> = ({ terms, picked, custom, onChange }) => {
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  const add = () => {
    const years = parseTermInput(text);
    if (years === null) {
      setError(true);
      return;
    }
    setError(false);
    setText('');
    onChange({ customTerms: [...new Set([...custom, years])].sort((a, b) => a - b) });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {terms.map((t, i) => (
          <Chip
            key={t}
            active={picked.includes(i)}
            onClick={() =>
              onChange({ termIdx: picked.includes(i) ? picked.filter(x => x !== i) : [...picked, i].sort((a, b) => a - b) })
            }
          >
            {t}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-500">선형보간</span>
        <input
          id="input-rates-interp"
          type="text"
          value={text}
          placeholder="예: 4.5 · 4년6월 · 54개월"
          onChange={e => {
            setText(e.target.value);
            setError(false);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') add();
          }}
          className={`w-40 px-2 py-1 bg-slate-50 border rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
            error ? 'border-rose-400' : 'border-slate-300'
          }`}
        />
        <button
          onClick={add}
          className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px] text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          보간 열 추가
        </button>
        {custom.map(y => (
          <span
            key={y}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-900 tabular-nums"
          >
            {termLabel(y)}
            <button
              onClick={() => onChange({ customTerms: custom.filter(x => x !== y) })}
              className="text-amber-500 hover:text-amber-800 cursor-pointer"
              aria-label={`${termLabel(y)} 보간 빼기`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      {error && <p className="text-[10px] text-rose-600">잔존기간을 년(4.5) 또는 년·개월(4년6월, 54개월)로 적어 주세요.</p>}
      <p className="text-[10px] text-slate-400">
        표에 없는 잔존기간은 앞뒤 만기의 수익률을 기간 비례로 잇습니다. 표 양 끝(3월 미만, 50년 초과)은 늘리지 않습니다.
      </p>
    </div>
  );
};
