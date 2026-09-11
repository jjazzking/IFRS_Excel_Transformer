import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, PanelRightClose, Table } from 'lucide-react';
import { FxQueryPanel } from '../components/FxQueryPanel';
import { FxRateTable } from '../components/FxRateTable';
import { SheetPreview } from '../components/SheetPreview';
import { CollapsedRail, Splitter } from '../components/LayoutControls';
import { useResizableLayout } from '../hooks/useResizableLayout';
import { FxCurrencyData, FxRateRow, TableTheme } from '../types';
import { FX_INDEX, FX_READY, FX_SOURCE, FX_UPDATED_AT, loadCurrency } from '../data/fxData';
import {
  buildFxPeriodTable,
  buildFxTable,
  currencyLabel,
  decimalsOf,
  rateOn,
} from '../utils/fxSheet';
import { isIsoDate, monthsBefore, todayIso } from '../utils/dateRange';
import {
  FISCAL_PERIODS,
  FiscalPeriodKey,
  defaultYear,
  fiscalPeriod,
  hasArrived,
  priorPeriod,
  selectableYears,
} from '../utils/fiscalPeriod';

interface FxWorkspaceProps {
  onBackHome: () => void;
}

/** 결산기 모드에서는 날짜를 담지 않는다. 매번 새 Set 을 만들지 않도록 하나를 돌려 쓴다. */
const EMPTY_PICKS: ReadonlySet<string> = new Set<string>();

/**
 * 기본 기간은 최근 한 달. 기말 조서를 만들 때는 프리셋이나 달력으로 옮긴다.
 *
 * 자료를 아직 한 번도 받지 않았으면 기준일이 없다. 그때도 화면은 떠야 하므로
 * 오늘로 대신한다 — 어차피 `FX_READY` 가 안내 화면을 대신 보여 준다.
 */
function defaultRange(to: string): { from: string; to: string } {
  const end = isIsoDate(to) ? to : todayIso();
  return { from: monthsBefore(end, 1), to: end };
}

export default function FxWorkspace({ onBackHome }: FxWorkspaceProps) {
  // 이 작업대는 2존이다 — 왼쪽에서 찾고(조회+일자별), 오른쪽에 엑셀 미리보기.
  // 폭은 기준서 작업대와 따로 기억한다.
  const { containerRef, state: layout, dragging, startDrag, resetSide, toggleSide } =
    useResizableLayout({ storageKey: 'workpaper.layout.fx.v1', hasLeft: false });

  const [code, setCode] = useState(FX_INDEX[0]?.code ?? 'USD');
  const [data, setData] = useState<FxCurrencyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState(() => defaultRange(FX_INDEX[0]?.to ?? ''));
  const [pickedDates, setPickedDates] = useState<Set<string>>(new Set());
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeOhlc, setIncludeOhlc] = useState(false);
  const [theme, setTheme] = useState<TableTheme>('audit_gray');

  // 조서에 담는 방식이 둘이다.
  //   'period' — 결산기를 눌러 마감환율·평균환율을 전기 비교까지 한 번에
  //   'daily'  — 날짜를 하나씩 골라 일자별로
  // 결산기 쪽이 실무에서 훨씬 자주 쓰이므로 기본값이다.
  const [mode, setMode] = useState<'period' | 'daily'>('period');
  const [closingMonth, setClosingMonth] = useState(12);
  const [periodKey, setPeriodKey] = useState<FiscalPeriodKey>('fy');
  const [includeQuarterAverage, setIncludeQuarterAverage] = useState(true);
  const [includePriorYear, setIncludePriorYear] = useState(true);

  const meta = useMemo(() => FX_INDEX.find(c => c.code === code), [code]);

  const years = useMemo(
    () =>
      meta ? selectableYears(meta.from, meta.to, closingMonth) : [],
    [meta, closingMonth]
  );
  // 처음에는 결산이 끝난 가장 최근 해를 보여 준다. 진행 중인 해를 먼저 띄우면
  // 마감환율 자리가 빈 표가 보이는데, 조서를 만들러 온 사람이 찾는 것은 직전 결산기다.
  const [year, setYear] = useState(
    () => (meta ? defaultYear(meta.from, meta.to, 12) : undefined) ?? new Date().getFullYear()
  );

  // 결산월이나 통화를 바꾸면 고를 수 있는 해가 달라진다. 지금 고른 해가
  // 그 목록에서 사라졌으면 결산이 끝난 가장 최근 해로 옮긴다.
  useEffect(() => {
    if (!meta || years.length === 0 || years.includes(year)) return;
    setYear(defaultYear(meta.from, meta.to, closingMonth) ?? years[0]);
  }, [meta, years, year, closingMonth]);

  /** 결산일이 아직 오지 않은 결산기. 눌러 볼 수는 있되 버튼에 미리 적어 둔다. */
  const unarrived = useMemo(() => {
    const out = new Set<FiscalPeriodKey>();
    if (!meta) return out;
    for (const p of FISCAL_PERIODS) {
      if (!hasArrived(fiscalPeriod(year, closingMonth, p.key), meta.to)) out.add(p.key);
    }
    return out;
  }, [meta, year, closingMonth]);

  const period = useMemo(
    () => fiscalPeriod(year, closingMonth, periodKey),
    [year, closingMonth, periodKey]
  );

  /**
   * 결산기를 누르면 그 기간이 곧바로 조서에 선다.
   * 왼쪽 표는 누적 구간으로 맞춰 둔다 — 평균이 어느 날들로 계산됐는지 눈으로 볼 수 있어야 한다.
   */
  const pickPeriod = useCallback(
    (key: FiscalPeriodKey) => {
      const next = fiscalPeriod(year, closingMonth, key);
      setPeriodKey(key);
      setMode('period');
      setRange({ from: next.cumulativeStart, to: next.end });
    },
    [year, closingMonth]
  );

  // 결산기를 고른 상태에서 연도·결산월을 바꾸면 보던 구간도 따라 움직인다.
  useEffect(() => {
    if (mode === 'period') setRange({ from: period.cumulativeStart, to: period.end });
  }, [mode, period]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadCurrency(code).then(loaded => {
      if (cancelled) return;
      setData(loaded);
      setLoading(false);
      // 통화를 바꾸면 담은 날짜를 비운다. 통화가 섞인 표는 조서에 쓸 수 없다.
      setPickedDates(new Set());
      // 새 통화의 자료가 지금 기간을 벗어나면 그 통화의 최근 한 달로 옮긴다.
      if (loaded && (range.to > loaded.to || range.from < loaded.from)) {
        setRange(defaultRange(loaded.to));
      }
    });
    return () => {
      cancelled = true;
    };
    // range 는 일부러 뺐다 — 기간을 바꿀 때마다 통화를 다시 읽을 이유가 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const visibleRows = useMemo<FxRateRow[]>(
    () => (data?.rows ?? []).filter(r => r.date >= range.from && r.date <= range.to),
    [data, range]
  );

  const pickedRows = useMemo(
    () => visibleRows.filter(r => pickedDates.has(r.date)),
    [visibleRows, pickedDates]
  );

  const digits = useMemo(() => decimalsOf(visibleRows.map(r => r.rate)), [visibleRows]);

  // 결산일에 고시가 없으면 직전 고시를 쓴다. 그 행을 표에서 짚어 준다.
  const closingRow = useMemo(
    () => (data ? rateOn(data.rows, period.end) : null),
    [data, period]
  );
  const hasOhlc = useMemo(() => visibleRows.some(r => r.open !== undefined), [visibleRows]);
  const hasCross = useMemo(() => visibleRows.some(r => r.crossRate !== undefined), [visibleRows]);

  const table = useMemo(() => {
    if (!data) return { columns: [], rows: [] };
    if (mode === 'period') {
      return buildFxPeriodTable(
        data,
        period,
        includePriorYear ? priorPeriod(period) : null,
        { includeQuarterAverage, includePriorYear }
      );
    }
    return buildFxTable(data, pickedRows, {
      columns: [
        'rate',
        'change',
        ...(includeOhlc && hasOhlc ? (['ohlc'] as const) : []),
        ...(hasCross ? (['crossRate'] as const) : []),
      ],
      includeSummary,
    });
  }, [
    data,
    mode,
    period,
    includeQuarterAverage,
    includePriorYear,
    pickedRows,
    includeOhlc,
    hasOhlc,
    hasCross,
    includeSummary,
  ]);

  /** 날짜를 직접 만지거나 날짜를 담으면 일자별 모드로 돌아간다. */
  const setRangeManually = useCallback((from: string, to: string) => {
    setMode('daily');
    setRange({ from, to });
  }, []);

  const togglePick = useCallback((date: string) => {
    setMode('daily');
    setPickedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  const pickAll = useCallback(() => {
    setMode('daily');
    setPickedDates(new Set(visibleRows.map(r => r.date)));
  }, [visibleRows]);
  const clearPicks = useCallback(() => setPickedDates(new Set()), []);

  if (!FX_READY) {
    return (
      <div className="h-screen bg-slate-100 flex flex-col text-slate-900 antialiased font-sans">
        <FxNavbar onBackHome={onBackHome} subtitle="자료를 아직 받지 않았습니다" />
        <div className="flex-1 grid place-items-center p-6">
          <div className="max-w-lg text-sm text-slate-600 leading-relaxed space-y-2">
            <p className="font-semibold text-slate-800">환율 자료가 아직 저장소에 없습니다.</p>
            <p>
              환율은 <span className="font-medium">환율 받기</span> 워크플로우가 서울외국환중개에서
              받아 저장소에 커밋합니다. 한 번도 돌지 않았거나 실패한 상태입니다.
            </p>
            <p className="text-slate-500">
              GitHub Actions 의 <code className="bg-slate-200 px-1 rounded">환율 받기</code> 를 직접
              실행하면 채워집니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-100 flex flex-col text-slate-900 antialiased font-sans overflow-hidden">
      <FxNavbar
        onBackHome={onBackHome}
        subtitle={`${FX_SOURCE} · 갱신 ${FX_UPDATED_AT.slice(0, 10)}`}
      />

      <main ref={containerRef} className="flex-1 min-h-0 flex p-3">
        {/* 왼쪽: 찾기 — 조회 조건과 일자별 고시 환율 */}
        <section className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
          <FxQueryPanel
            currencies={FX_INDEX}
            code={code}
            onChangeCode={setCode}
            closingMonth={closingMonth}
            onChangeClosingMonth={setClosingMonth}
            year={year}
            onChangeYear={setYear}
            years={years}
            activePeriod={mode === 'period' ? periodKey : null}
            onPickPeriod={pickPeriod}
            unarrived={unarrived}
            from={range.from}
            to={range.to}
            onChangeRange={setRangeManually}
            bounds={meta && { from: meta.from, to: meta.to }}
          />

          <FxRateTable
            rows={visibleRows}
            pickedDates={mode === 'period' ? EMPTY_PICKS : pickedDates}
            onTogglePick={togglePick}
            onPickAll={pickAll}
            onClearPicks={clearPicks}
            digits={digits}
            hasOhlc={hasOhlc}
            loading={loading}
            periodNote={
              mode === 'period' && closingRow
                ? {
                    label: `${year}년 ${period.label}`,
                    closingDate: period.end,
                    appliedDate: closingRow.rate === undefined ? undefined : closingRow.date,
                    pending: closingRow.status === 'afterData',
                  }
                : undefined
            }
          />
        </section>

        {/* 오른쪽: 담기 — 조서에 붙일 표 */}
        {layout.rightOpen ? (
          <>
            <Splitter
              label="조서 패널 폭"
              active={dragging === 'right'}
              onPointerDown={startDrag('right')}
              onDoubleClick={() => resetSide('right')}
            />
            <aside style={{ width: layout.right }} className="shrink-0 min-h-0 flex flex-col gap-2">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {mode === 'period' ? (
                  <>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                      <input
                        id="check-fx-prior-year"
                        type="checkbox"
                        checked={includePriorYear}
                        onChange={e => setIncludePriorYear(e.target.checked)}
                        className="accent-emerald-600 cursor-pointer"
                      />
                      전기 비교
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                      <input
                        id="check-fx-quarter-avg"
                        type="checkbox"
                        checked={includeQuarterAverage}
                        onChange={e => setIncludeQuarterAverage(e.target.checked)}
                        className="accent-emerald-600 cursor-pointer"
                      />
                      당분기 평균환율도
                    </label>
                  </>
                ) : (
                  <>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                      <input
                        id="check-fx-summary"
                        type="checkbox"
                        checked={includeSummary}
                        onChange={e => setIncludeSummary(e.target.checked)}
                        className="accent-emerald-600 cursor-pointer"
                      />
                      기간 평균환율·기말환율 행 넣기
                    </label>
                    {hasOhlc && (
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                        <input
                          id="check-fx-ohlc"
                          type="checkbox"
                          checked={includeOhlc}
                          onChange={e => setIncludeOhlc(e.target.checked)}
                          className="accent-emerald-600 cursor-pointer"
                        />
                        시가·고가·저가도
                      </label>
                    )}
                  </>
                )}
                <button
                  onClick={() => toggleSide('right')}
                  className="ml-auto p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  title="조서 패널 접기"
                >
                  <PanelRightClose className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 min-h-0">
                <SheetPreview
                  table={table}
                  name={
                    data
                      ? `${currencyLabel(data)}${mode === 'period' ? ` ${year}년 ${period.label}` : ''}`
                      : code
                  }
                  theme={theme}
                  onChangeTheme={setTheme}
                  onClearAll={mode === 'daily' ? clearPicks : undefined}
                  emptyHint="왼쪽에서 결산기를 누르면 마감환율과 평균환율이 전기 비교까지 한 번에 섭니다. 결산기에 없는 구간이 필요하면 직접 조회로 날짜를 골라 담으세요."
                />
              </div>
            </aside>
          </>
        ) : (
          <>
            <div className="w-3 shrink-0" />
            <CollapsedRail
              icon={<Table className="w-4 h-4" />}
              label="조서 · 엑셀"
              onClick={() => toggleSide('right')}
            />
          </>
        )}
      </main>
    </div>
  );
}

const FxNavbar: React.FC<{ onBackHome: () => void; subtitle: string }> = ({
  onBackHome,
  subtitle,
}) => (
  <header className="bg-slate-900 text-white border-b border-slate-800 shrink-0">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3">
      <button
        id="btn-back-home"
        onClick={onBackHome}
        className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center transition cursor-pointer shrink-0"
        title="작업대 고르기로 돌아가기"
        aria-label="작업대 고르기로 돌아가기"
      >
        <ArrowLeft className="w-4.5 h-4.5 text-slate-300" />
      </button>
      <div className="min-w-0">
        <div className="flex items-center space-x-2">
          <button
            onClick={onBackHome}
            className="text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            기준서 데스크
          </button>
          <span className="text-slate-600 text-xs">/</span>
          <h1 className="font-bold text-lg text-slate-100 tracking-tight truncate">환율 찾기</h1>
        </div>
        <p className="text-xs text-slate-400 truncate">{subtitle}</p>
      </div>
    </div>
  </header>
);
