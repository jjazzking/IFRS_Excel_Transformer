import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, PanelRightClose, Table } from 'lucide-react';
import { RatesQueryBuilder, RatesQueryState } from '../components/RatesQueryBuilder';
import { RatesMatrix } from '../components/RatesMatrix';
import { RatesGuidance } from '../components/RatesGuidance';
import { SheetPreview } from '../components/SheetPreview';
import { CollapsedRail, Splitter } from '../components/LayoutControls';
import { useResizableLayout } from '../hooks/useResizableLayout';
import { RatesDay, TableTheme } from '../types';
import { RATES_BOUNDS, RATES_INDEX, RATES_READY, loadRatesOn } from '../data/ratesData';
import { PURPOSE_BY_VALUE, buildRatesTable, citeRefs, rateColumns } from '../utils/ratesQuery';

interface RatesWorkspaceProps {
  onBackHome: () => void;
}

export default function RatesWorkspace({ onBackHome }: RatesWorkspaceProps) {
  // 환율 작업대와 같은 2존 — 왼쪽에서 찾고(위: 단계, 가운데: 안내, 아래: 금투협 표), 오른쪽에 조서 표.
  const { containerRef, state: layout, dragging, startDrag, resetSide, toggleSide } =
    useResizableLayout({ storageKey: 'workpaper.layout.rates.v1', hasLeft: false });

  const [query, setQuery] = useState<RatesQueryState>({
    purpose: null,
    date: null,
    rowCodes: [],
    termIdx: [],
    customTerms: [],
  });
  const updateQuery = useCallback(
    (patch: Partial<RatesQueryState>) => setQuery(prev => ({ ...prev, ...patch })),
    []
  );

  const [day, setDay] = useState<RatesDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [cite, setCite] = useState(true);
  const [theme, setTheme] = useState<TableTheme>('audit_gray');

  // 기준일이 바뀌면 그해(연초 휴일이면 지난해까지) 파일을 읽어 그날 표를 찾는다.
  useEffect(() => {
    if (!query.date) {
      setDay(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadRatesOn(query.date).then(found => {
      if (cancelled) return;
      setDay(found);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [query.date]);

  const terms = RATES_INDEX?.terms ?? [];
  const rowsMeta = RATES_INDEX?.rows ?? [];
  const guide = query.purpose ? PURPOSE_BY_VALUE.get(query.purpose) : undefined;

  const selection = useMemo(
    () => ({ rowCodes: query.rowCodes, termIdx: query.termIdx, customTerms: query.customTerms }),
    [query.rowCodes, query.termIdx, query.customTerms]
  );

  // 왼쪽 표는 늘 전체를 보여 준다 — 고르지 않은 행·열도 보여야 비교하며 고를 수 있다.
  const matrixColumns = useMemo(() => rateColumns(terms, selection, false), [terms, selection]);

  const table = useMemo(
    () =>
      buildRatesTable(terms, rowsMeta, day, selection, {
        onlyPicked,
        citation: cite && guide && guide.refs.length > 0 ? citeRefs(guide.refs) : undefined,
        requestedDate: query.date ?? '',
        source: '금융투자협회 채권정보센터 채권시가평가수익률(평가사 평균)',
      }),
    [terms, rowsMeta, day, selection, onlyPicked, cite, guide, query.date]
  );

  const toggleRow = useCallback(
    (code: string) =>
      setQuery(prev => ({
        ...prev,
        rowCodes: prev.rowCodes.includes(code) ? prev.rowCodes.filter(c => c !== code) : [...prev.rowCodes, code],
      })),
    []
  );
  const toggleTerm = useCallback(
    (i: number) =>
      setQuery(prev => ({
        ...prev,
        termIdx: prev.termIdx.includes(i) ? prev.termIdx.filter(x => x !== i) : [...prev.termIdx, i].sort((a, b) => a - b),
      })),
    []
  );
  // 칸을 누르면 그 행과 열을 함께 고른다. 이미 둘 다 골라져 있으면 둘 다 푼다.
  const pickCell = useCallback((code: string, termIndex: number | undefined) => {
    setQuery(prev => {
      const hasRow = prev.rowCodes.includes(code);
      const hasTerm = termIndex === undefined || prev.termIdx.includes(termIndex);
      if (hasRow && hasTerm) {
        return {
          ...prev,
          rowCodes: prev.rowCodes.filter(c => c !== code),
          termIdx: termIndex === undefined ? prev.termIdx : prev.termIdx.filter(x => x !== termIndex),
        };
      }
      return {
        ...prev,
        rowCodes: hasRow ? prev.rowCodes : [...prev.rowCodes, code],
        termIdx:
          termIndex === undefined || prev.termIdx.includes(termIndex)
            ? prev.termIdx
            : [...prev.termIdx, termIndex].sort((a, b) => a - b),
      };
    });
  }, []);

  if (!RATES_READY || !RATES_BOUNDS) {
    return (
      <div className="h-screen bg-slate-100 flex flex-col text-slate-900 antialiased font-sans">
        <RatesNavbar onBackHome={onBackHome} subtitle="자료를 아직 받지 않았습니다" />
        <div className="flex-1 grid place-items-center p-6">
          <div className="max-w-lg text-sm text-slate-600 leading-relaxed space-y-2">
            <p className="font-semibold text-slate-800">이자율 자료가 아직 저장소에 없습니다.</p>
            <p>
              이자율은 <span className="font-medium">이자율 받기</span> 워크플로우가 금융투자협회
              채권정보센터에서 받아 저장소에 커밋합니다. 한 번도 돌지 않았거나 실패한 상태입니다.
            </p>
            <p className="text-slate-500">
              GitHub Actions 의 <code className="bg-slate-200 px-1 rounded">이자율 받기</code> 를 직접
              실행하면 채워집니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-100 flex flex-col text-slate-900 antialiased font-sans overflow-hidden">
      <RatesNavbar
        onBackHome={onBackHome}
        subtitle={`금융투자협회 채권시가평가수익률 (평가사 평균) · ${RATES_BOUNDS.from} ~ ${RATES_BOUNDS.to}`}
      />

      <main ref={containerRef} className="flex-1 min-h-0 flex p-3">
        <section className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
          <RatesQueryBuilder query={query} onChange={updateQuery} terms={terms} rows={rowsMeta} bounds={RATES_BOUNDS} />
          {guide && guide.refs.length > 0 && <RatesGuidance guide={guide} />}
          <RatesMatrix
            terms={terms}
            rows={rowsMeta}
            columns={matrixColumns}
            day={day}
            requestedDate={query.date}
            pickedRows={query.rowCodes}
            loading={loading}
            suggest={guide?.suggestRow}
            onToggleRow={toggleRow}
            onToggleTerm={toggleTerm}
            onPickCell={pickCell}
            emptyHint={
              query.purpose === null
                ? '위에서 용도부터 고르세요. 용도마다 쓰는 이자율과 근거 문단을 함께 보여 줍니다.'
                : query.date === null
                  ? '기준일을 고르면 그날의 금투협 시가평가수익률 표가 여기에 나타납니다.'
                  : '이 날짜 이전에 받아 둔 표가 없습니다. 자료 구간 안의 날짜를 고르세요.'
            }
          />
        </section>

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
                <div className="flex rounded-md border border-slate-300 overflow-hidden text-[11px]">
                  {(
                    [
                      [false, '표 전체 + 음영'],
                      [true, '고른 행·열만'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={label}
                      onClick={() => setOnlyPicked(value)}
                      aria-pressed={onlyPicked === value}
                      className={`px-2 py-0.5 transition cursor-pointer border-r border-slate-200 last:border-r-0 ${
                        onlyPicked === value ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {guide && guide.refs.length > 0 && (
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      id="check-rates-cite"
                      type="checkbox"
                      checked={cite}
                      onChange={e => setCite(e.target.checked)}
                      className="accent-emerald-600 cursor-pointer"
                    />
                    각주에 근거 문단
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
                  name={`시가평가수익률_${day?.date ?? ''}`}
                  fileSuffix="이자율"
                  theme={theme}
                  onChangeTheme={setTheme}
                  onClearAll={() => updateQuery({ rowCodes: [], termIdx: [], customTerms: [] })}
                  emptyHint="왼쪽에서 기준일을 고르면 금투협 표가 조서 모양 그대로 여기에 나타납니다. 고른 행·열은 노란 음영으로 칠해 붙여넣습니다."
                />
              </div>
            </aside>
          </>
        ) : (
          <>
            <div className="w-3 shrink-0" />
            <CollapsedRail icon={<Table className="w-4 h-4" />} label="조서 · 엑셀" onClick={() => toggleSide('right')} />
          </>
        )}
      </main>
    </div>
  );
}

const RatesNavbar: React.FC<{ onBackHome: () => void; subtitle: string }> = ({ onBackHome, subtitle }) => (
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
          <button onClick={onBackHome} className="text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer">
            기준서 데스크
          </button>
          <span className="text-slate-600 text-xs">/</span>
          <h1 className="font-bold text-lg text-slate-100 tracking-tight truncate">이자율 찾기</h1>
        </div>
        <p className="text-xs text-slate-400 truncate">{subtitle}</p>
      </div>
    </div>
  </header>
);
