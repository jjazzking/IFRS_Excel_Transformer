import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, PanelRightClose, Table } from 'lucide-react';
import { FxQueryPanel } from '../components/FxQueryPanel';
import { FxRateTable } from '../components/FxRateTable';
import { SheetPreview } from '../components/SheetPreview';
import { CollapsedRail, Splitter } from '../components/LayoutControls';
import { useResizableLayout } from '../hooks/useResizableLayout';
import { FxCurrencyData, FxRateRow, TableTheme } from '../types';
import { FX_INDEX, FX_READY, FX_SOURCE, FX_UPDATED_AT, loadCurrency } from '../data/fxData';
import { buildFxTable, currencyLabel, decimalsOf } from '../utils/fxSheet';
import { isIsoDate, monthsBefore, todayIso } from '../utils/dateRange';

interface FxWorkspaceProps {
  onBackHome: () => void;
}

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

  const meta = useMemo(() => FX_INDEX.find(c => c.code === code), [code]);

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
  const hasOhlc = useMemo(() => visibleRows.some(r => r.open !== undefined), [visibleRows]);
  const hasCross = useMemo(() => visibleRows.some(r => r.crossRate !== undefined), [visibleRows]);

  const table = useMemo(() => {
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
  }, [data, pickedRows, includeOhlc, hasOhlc, hasCross, includeSummary]);

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
            from={range.from}
            to={range.to}
            onChangeRange={(from, to) => setRange({ from, to })}
            bounds={meta && { from: meta.from, to: meta.to }}
          />

          <FxRateTable
            rows={visibleRows}
            pickedDates={pickedDates}
            onTogglePick={togglePick}
            onPickAll={pickAll}
            onClearPicks={clearPicks}
            digits={digits}
            hasOhlc={hasOhlc}
            loading={loading}
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
                  name={data ? currencyLabel(data) : code}
                  theme={theme}
                  onChangeTheme={setTheme}
                  onClearAll={clearPicks}
                  emptyHint="왼쪽 표에서 조서에 넣을 날짜를 담으면 여기에 붙여넣을 모습 그대로 나타납니다. 기말환율만 쓸 때는 그 하루만, 평균환율이 필요하면 기간 전체를 담으세요."
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
