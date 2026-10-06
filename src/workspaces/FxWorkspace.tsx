import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, PanelRightClose, Table } from 'lucide-react';
import { FxQueryBuilder, FxQueryState } from '../components/FxQueryBuilder';
import { FxRateTable } from '../components/FxRateTable';
import { FxResultMatrix } from '../components/FxResultMatrix';
import { SheetPreview } from '../components/SheetPreview';
import { CollapsedRail, Splitter } from '../components/LayoutControls';
import { useResizableLayout } from '../hooks/useResizableLayout';
import { FxCurrencyData, FxRateRow, TableTheme } from '../types';
import { FX_INDEX, FX_READY, FX_SOURCE, FX_UPDATED_AT, loadCurrency } from '../data/fxData';
import { buildFxTable, currencyLabel, decimalsOf } from '../utils/fxSheet';
import {
  FX_KINDS,
  FxOrientation,
  FxPeriod,
  buildFxMatrixTable,
  listPeriods,
  spotPeriod,
} from '../utils/fxQuery';
import { isIsoDate, monthsBefore, todayIso } from '../utils/dateRange';
import { UsageGuideButton } from '../components/UsageGuideButton';

interface FxWorkspaceProps {
  onBackHome: () => void;
}

/**
 * 고를 수 있는 날짜의 바깥 경계 — 통화마다 받은 구간이 조금씩 다를 수 있어 합집합으로 잡는다.
 * 통화별로 구간 밖인 칸은 계산 단계에서 빈칸이 된다.
 *
 * 자료를 아직 한 번도 받지 않았으면 기준일이 없다. 그때도 화면은 떠야 하므로
 * 오늘로 대신한다 — 어차피 `FX_READY` 가 안내 화면을 대신 보여 준다.
 */
function dataBounds(): { from: string; to: string } {
  if (FX_INDEX.length === 0) {
    const today = todayIso();
    return { from: monthsBefore(today, 12), to: today };
  }
  const from = FX_INDEX.reduce((m, c) => (c.from < m ? c.from : m), FX_INDEX[0].from);
  const to = FX_INDEX.reduce((m, c) => (c.to > m ? c.to : m), FX_INDEX[0].to);
  return { from, to: isIsoDate(to) ? to : todayIso() };
}

export default function FxWorkspace({ onBackHome }: FxWorkspaceProps) {
  // 이 작업대는 2존이다 — 왼쪽에서 찾고(위: 단계별 조건, 아래: 결과), 오른쪽에 엑셀 미리보기.
  // 폭은 기준서 작업대와 따로 기억한다.
  const { containerRef, state: layout, dragging, startDrag, resetSide, toggleSide } =
    useResizableLayout({ storageKey: 'workpaper.layout.fx.v1', hasLeft: false });

  const bounds = useMemo(dataBounds, []);

  const [query, setQuery] = useState<FxQueryState>(() => ({
    kind: null,
    basis: null,
    periodIds: [],
    spotDates: [],
    dailyPreset: null,
    range: { from: monthsBefore(bounds.to, 1), to: bounds.to },
    // 가장 많이 찾는 통화는 미리 골라 둔다. 바로 지울 수 있다.
    codes: FX_INDEX.some(c => c.code === 'USD') ? ['USD'] : FX_INDEX.slice(0, 1).map(c => c.code),
  }));
  const updateQuery = useCallback(
    (patch: Partial<FxQueryState>) => setQuery(prev => ({ ...prev, ...patch })),
    []
  );

  const [datasets, setDatasets] = useState<Record<string, FxCurrencyData>>({});
  const [loading, setLoading] = useState(false);
  const [pickedDates, setPickedDates] = useState<Set<string>>(new Set());
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeOhlc, setIncludeOhlc] = useState(false);
  const [orientation, setOrientation] = useState<FxOrientation>('currencyRows');
  const [theme, setTheme] = useState<TableTheme>('audit_gray');

  // 고른 통화 중 아직 안 읽은 것만 가져온다. 한 번 읽은 통화는 fxData 가 기억한다.
  useEffect(() => {
    const missing = query.codes.filter(c => !datasets[c]);
    if (missing.length === 0) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(missing.map(loadCurrency)).then(loaded => {
      if (cancelled) return;
      setDatasets(prev => {
        const next = { ...prev };
        loaded.forEach(d => {
          if (d) next[d.code] = d;
        });
        return next;
      });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [query.codes, datasets]);

  const { kind } = query;
  const isMatrix = kind === 'closing' || kind === 'average' || kind === 'spot';

  // 통화는 고른 순서가 아니라 목록 순서로 늘어놓는다 — 조서마다 순서가 달라지지 않게.
  const currencies = useMemo(
    () => FX_INDEX.filter(c => query.codes.includes(c.code)).map(c => datasets[c.code]).filter(Boolean),
    [query.codes, datasets]
  );

  const periodOptions = useMemo<FxPeriod[]>(
    () =>
      (kind === 'closing' || kind === 'average') && query.basis
        ? listPeriods(kind, query.basis, bounds)
        : [],
    [kind, query.basis, bounds]
  );

  // 통화가 행이면 최근 시점이 왼쪽(당기·전기 순, 주석 표 모양), 시점이 행이면 위에서 아래로 시간순.
  const selectedPeriods = useMemo<FxPeriod[]>(() => {
    const list =
      kind === 'spot'
        ? query.spotDates.map(spotPeriod)
        : periodOptions.filter(p => query.periodIds.includes(p.id));
    return [...list].sort((a, b) =>
      orientation === 'currencyRows' ? b.to.localeCompare(a.to) : a.to.localeCompare(b.to)
    );
  }, [kind, query.spotDates, query.periodIds, periodOptions, orientation]);

  // --- 일자별 추이 (한 통화) -----------------------------------------------
  const dailyCode = kind === 'daily' ? query.codes[0] : undefined;
  const data = dailyCode ? datasets[dailyCode] ?? null : null;

  // 통화나 기간을 바꾸면 담은 날짜를 비운다. 통화가 섞인 표는 조서에 쓸 수 없다.
  useEffect(() => setPickedDates(new Set()), [dailyCode]);

  const visibleRows = useMemo<FxRateRow[]>(
    () =>
      query.dailyPreset
        ? (data?.rows ?? []).filter(r => r.date >= query.range.from && r.date <= query.range.to)
        : [],
    [data, query.range, query.dailyPreset]
  );

  const pickedRows = useMemo(
    () => visibleRows.filter(r => pickedDates.has(r.date)),
    [visibleRows, pickedDates]
  );

  const digits = useMemo(() => decimalsOf(visibleRows.map(r => r.rate)), [visibleRows]);
  const hasOhlc = useMemo(() => visibleRows.some(r => r.open !== undefined), [visibleRows]);
  const hasCross = useMemo(() => visibleRows.some(r => r.crossRate !== undefined), [visibleRows]);

  const table = useMemo(() => {
    if (isMatrix && kind) return buildFxMatrixTable(kind, selectedPeriods, currencies, orientation);
    if (!data) return { columns: [], rows: [] };
    return buildFxTable(data, pickedRows, {
      columns: [
        'rate',
        'change',
        ...(includeOhlc && hasOhlc ? (['ohlc'] as const) : []),
        ...(hasCross ? (['crossRate'] as const) : []),
      ],
      includeSummary,
    });
  }, [isMatrix, kind, selectedPeriods, currencies, orientation, data, pickedRows, includeOhlc, hasOhlc, hasCross, includeSummary]);

  const togglePick = useCallback((date: string) => {
    setPickedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  const pickAll = useCallback(
    () => setPickedDates(new Set(visibleRows.map(r => r.date))),
    [visibleRows]
  );
  const clearPicks = useCallback(() => setPickedDates(new Set()), []);

  const kindLabel = FX_KINDS.find(k => k.value === kind)?.label ?? '환율';
  const sheetName = isMatrix ? kindLabel : data ? currencyLabel(data) : '환율';

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
        {/* 왼쪽: 찾기 — 위에서 단계별로 고르고, 아래에서 결과를 확인한다 */}
        <section className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
          <FxQueryBuilder
            query={query}
            onChange={updateQuery}
            periods={periodOptions}
            currencies={FX_INDEX}
            bounds={bounds}
          />

          {kind === 'daily' ? (
            query.dailyPreset ? (
              <FxRateTable
                rows={visibleRows}
                pickedDates={pickedDates}
                onTogglePick={togglePick}
                onPickAll={pickAll}
                onClearPicks={clearPicks}
                digits={digits}
                hasOhlc={hasOhlc}
                loading={loading && !data}
              />
            ) : (
              <EmptyResult text="기간을 고르면 그 기간의 고시 환율이 날짜별로 나타납니다." />
            )
          ) : (
            <FxResultMatrix
              kind={kind ?? 'closing'}
              periods={selectedPeriods}
              currencies={currencies}
              loading={loading}
              emptyHint={
                kind === null
                  ? '위에서 찾을 자료의 유형부터 고르세요. 단계를 하나씩 고르면 다음 단계가 열립니다.'
                  : kind === 'spot'
                    ? '거래일을 넣으면 그날의 고시 환율이 나타납니다. 휴일이면 직전 고시일 것을 씁니다.'
                    : '기준과 시점을 고르면 결과가 여기에 나타납니다. 시점을 여러 개 고르면 비교표가 됩니다.'
              }
            />
          )}
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
                {isMatrix ? (
                  <div className="flex rounded-md border border-slate-300 overflow-hidden text-[11px]">
                    {(
                      [
                        ['currencyRows', '통화를 행으로'],
                        ['periodRows', '시점을 행으로'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setOrientation(value)}
                        aria-pressed={orientation === value}
                        className={`px-2 py-0.5 transition cursor-pointer border-r border-slate-200 last:border-r-0 ${
                          orientation === value ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
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
                  name={sheetName}
                  theme={theme}
                  onChangeTheme={setTheme}
                  onClearAll={isMatrix ? () => updateQuery({ periodIds: [], spotDates: [] }) : clearPicks}
                  emptyHint={
                    isMatrix || kind === null
                      ? '왼쪽에서 단계를 끝까지 고르면 조서에 붙여넣을 표가 여기에 그대로 나타납니다.'
                      : '왼쪽 표에서 조서에 넣을 날짜를 담으면 여기에 붙여넣을 모습 그대로 나타납니다.'
                  }
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

const EmptyResult: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex-1 min-h-0 grid place-items-center bg-white rounded-xl border border-slate-200 shadow-sm p-6">
    <p className="text-sm text-slate-500 text-center leading-relaxed max-w-sm">{text}</p>
  </div>
);

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
            찾붙머신
          </button>
          <span className="text-slate-600 text-xs">/</span>
          <h1 className="font-bold text-lg text-slate-100 tracking-tight truncate">환율 찾기</h1>
        </div>
        <p className="text-xs text-slate-400 truncate">{subtitle}</p>
      </div>
      <div className="ml-auto">
        <UsageGuideButton />
      </div>
    </div>
  </header>
);
