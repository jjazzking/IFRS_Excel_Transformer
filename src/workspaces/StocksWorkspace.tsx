import React, { useMemo, useState } from 'react';
import { ArrowLeft, PanelRightClose, Search, Table } from 'lucide-react';
import { SheetPreview } from '../components/SheetPreview';
import { CollapsedRail, Splitter } from '../components/LayoutControls';
import { useResizableLayout } from '../hooks/useResizableLayout';
import { TableTheme } from '../types';
import { isIsoDate } from '../utils/dateRange';
import {
  SPOT_LOOKBACK_DAYS,
  STOCK_READY,
  StockSeries,
  buildPeriodTable,
  buildSpotTable,
  fetchAll,
  parseStockInputs,
  shiftDays,
} from '../utils/stockPrice';

interface StocksWorkspaceProps {
  onBackHome: () => void;
}

type Mode = 'spot' | 'period';

// 가장 많이 찾는 건 직전 회계연도 기말 종가다
const lastYear = new Date().getFullYear() - 1;

export default function StocksWorkspace({ onBackHome }: StocksWorkspaceProps) {
  const { containerRef, state: layout, dragging, startDrag, resetSide, toggleSide } =
    useResizableLayout({ storageKey: 'workpaper.layout.stocks.v1', hasLeft: false });

  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('spot');
  const [date, setDate] = useState(`${lastYear}-12-31`);
  const [from, setFrom] = useState(`${lastYear}-01-01`);
  const [to, setTo] = useState(`${lastYear}-12-31`);
  const [series, setSeries] = useState<(StockSeries | null)[]>([]);
  // 표는 조회했을 때의 조건으로 만든다 — 조회 뒤 날짜만 바꿔도 표가 거짓말하지 않게
  const [asked, setAsked] = useState<{ mode: Mode; date: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [theme, setTheme] = useState<TableTheme>('audit_gray');

  const inputs = useMemo(() => parseStockInputs(text), [text]);
  const done = useMemo(() => series.filter((s): s is StockSeries => s !== null), [series]);
  const table = useMemo(() => {
    if (!asked) return { columns: [], rows: [] };
    return asked.mode === 'spot' ? buildSpotTable(done, asked.date) : buildPeriodTable(done);
  }, [asked, done]);

  const datesValid =
    mode === 'spot' ? isIsoDate(date) : isIsoDate(from) && isIsoDate(to) && from <= to;

  const run = async () => {
    setRunning(true);
    setSeries(inputs.map(() => null));
    setAsked({ mode, date });
    const [f, t] = mode === 'spot' ? [shiftDays(date, -SPOT_LOOKBACK_DAYS), date] : [from, to];
    await fetchAll(inputs, f, t, setSeries);
    setRunning(false);
  };

  const failed = done.filter(s => s.error);

  return (
    <div className="h-screen bg-slate-100 flex flex-col text-slate-900 antialiased font-sans overflow-hidden">
      <StocksNavbar onBackHome={onBackHome} />

      <main ref={containerRef} className="flex-1 min-h-0 flex p-3">
        <section className="flex-1 min-w-0 min-h-0 flex flex-col gap-2 bg-white rounded-xl border border-slate-200 shadow-sm p-3">
          <label htmlFor="stocks-input" className="text-xs font-semibold text-slate-700">
            종목명 또는 6자리 종목코드 (여러 개는 줄바꿈·쉼표로, 엑셀 열을 그대로 붙여도 됨)
          </label>
          <textarea
            id="stocks-input"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'삼성전자\n000660\nNAVER'}
            className="flex-1 min-h-0 w-full resize-none rounded-md border border-slate-300 p-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <div className="flex rounded-md border border-slate-300 overflow-hidden text-[11px]">
              {(
                [
                  ['spot', '특정일 종가'],
                  ['period', '기간 일별·평균'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={`px-2 py-0.5 transition cursor-pointer border-r border-slate-200 last:border-r-0 ${
                    mode === value ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === 'spot' ? (
              <label className="flex items-center gap-1.5">
                기준일
                <input id="stocks-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded border border-slate-300 px-1.5 py-0.5" />
              </label>
            ) : (
              <>
                <input id="stocks-from" aria-label="시작일" type="date" value={from} onChange={e => setFrom(e.target.value)} className="rounded border border-slate-300 px-1.5 py-0.5" />
                ~
                <input id="stocks-to" aria-label="종료일" type="date" value={to} onChange={e => setTo(e.target.value)} className="rounded border border-slate-300 px-1.5 py-0.5" />
              </>
            )}
            <button
              id="btn-stocks-run"
              onClick={run}
              disabled={!STOCK_READY || running || inputs.length === 0 || !datesValid}
              className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40 cursor-pointer disabled:cursor-default"
            >
              <Search className="w-3.5 h-3.5" />
              {running ? `찾는 중… ${done.length}/${series.length}` : `${inputs.length}종목 찾기`}
            </button>
          </div>

          {!STOCK_READY && (
            <p className="text-[11px] text-rose-600">
              API 키가 빌드에 들어가지 않았습니다. 저장소 Secrets 에 STOCK_KEY 를 넣고 다시 배포하세요.
            </p>
          )}
          {failed.length > 0 && (
            <p className="text-[11px] text-rose-600">
              못 찾음: {failed.map(s => `${s.input} (${s.error})`).join(', ')}
            </p>
          )}
          <p className="text-[11px] text-slate-500 leading-relaxed">
            그날 거래소에 찍힌 실제 종가(수정주가 아님)입니다. 특정일이 휴장일이면 직전 거래일 종가를
            쓰고 표에 노랗게 표시합니다. 시세는 다음 영업일 오후에 반영됩니다.
          </p>
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
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 shrink-0 flex items-center">
                <span className="text-[11px] text-slate-600">
                  {asked?.mode === 'period' ? '기간 일별 종가' : '특정일 종가'}
                </span>
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
                  name={asked?.mode === 'period' ? '기간종가' : '종가'}
                  theme={theme}
                  onChangeTheme={setTheme}
                  onClearAll={() => {
                    setSeries([]);
                    setAsked(null);
                  }}
                  emptyHint="왼쪽에 종목을 넣고 찾기를 누르면, 조서에 붙여넣을 주가 표가 여기에 나타납니다."
                  fileSuffix="주가"
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

const StocksNavbar: React.FC<{ onBackHome: () => void }> = ({ onBackHome }) => (
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
            찾붙머신
          </button>
          <span className="text-slate-600 text-xs">/</span>
          <h1 className="font-bold text-lg text-slate-100 tracking-tight truncate">주가 찾기</h1>
        </div>
        <p className="text-xs text-slate-400 truncate">금융위원회 주식시세정보 · 실제 종가</p>
      </div>
    </div>
  </header>
);
