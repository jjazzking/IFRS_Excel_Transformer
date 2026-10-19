import React, { useMemo, useState } from 'react';
import { ArrowLeft, PanelRightClose, Search, Table } from 'lucide-react';
import { SheetPreview } from '../components/SheetPreview';
import { CollapsedRail, Splitter } from '../components/LayoutControls';
import { useResizableLayout } from '../hooks/useResizableLayout';
import { TableTheme } from '../types';
import {
  LAND_PRICE_READY,
  LandPriceRow,
  buildLandPriceTable,
  defaultYear,
  lookupAll,
} from '../utils/landPrice';

interface LandPriceWorkspaceProps {
  onBackHome: () => void;
}

const STATUS_LABEL: Record<LandPriceRow['status'], string> = {
  ok: '찾음',
  ambiguous: '확인 필요',
  notFound: '주소 없음',
  noPrice: '공시지가 없음',
  error: '오류',
  blank: '빈 줄',
};

export default function LandPriceWorkspace({ onBackHome }: LandPriceWorkspaceProps) {
  const { containerRef, state: layout, dragging, startDrag, resetSide, toggleSide } =
    useResizableLayout({ storageKey: 'workpaper.layout.landprice.v1', hasLeft: false });

  const [text, setText] = useState('');
  const [year, setYear] = useState(defaultYear);
  const [rows, setRows] = useState<(LandPriceRow | null)[]>([]);
  const [running, setRunning] = useState(false);
  const [theme, setTheme] = useState<TableTheme>('audit_gray');

  // 엑셀 열을 복사하면 줄 끝에 빈 줄이 하나 붙는다. 중간 빈 줄은 순서를 지키려고 남긴다.
  const inputs = useMemo(() => text.replace(/\s+$/, '').split(/\r?\n/), [text]);
  const done = useMemo(() => rows.filter((r): r is LandPriceRow => r !== null), [rows]);
  const table = useMemo(() => buildLandPriceTable(done, year), [done, year]);

  const run = async () => {
    setRunning(true);
    setRows(inputs.map(() => null));
    await lookupAll(inputs, year, setRows);
    setRunning(false);
  };

  const counts = done.reduce<Partial<Record<LandPriceRow['status'], number>>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="h-screen bg-slate-100 flex flex-col text-slate-900 antialiased font-sans overflow-hidden">
      <LandPriceNavbar onBackHome={onBackHome} />

      <main ref={containerRef} className="flex-1 min-h-0 flex p-3">
        <section className="flex-1 min-w-0 min-h-0 flex flex-col gap-2 bg-white rounded-xl border border-slate-200 shadow-sm p-3">
          <label htmlFor="landprice-input" className="text-xs font-semibold text-slate-700">
            조서의 주소 열을 복사해 붙여넣으세요 (한 줄에 주소 하나)
          </label>
          <textarea
            id="landprice-input"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'서울특별시 중구 세종대로 110\n경기도 성남시 분당구 판교역로 235'}
            className="flex-1 min-h-0 w-full resize-none rounded-md border border-slate-300 p-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              기준연도
              <input
                id="landprice-year"
                type="number"
                min={1990}
                max={2100}
                value={year}
                onChange={e => setYear(e.target.value)}
                className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
              />
            </label>
            <button
              id="btn-landprice-run"
              onClick={run}
              disabled={!LAND_PRICE_READY || running || !text.trim() || !/^\d{4}$/.test(year)}
              className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40 cursor-pointer disabled:cursor-default"
            >
              <Search className="w-3.5 h-3.5" />
              {running ? `찾는 중… ${done.length}/${rows.length}` : `${inputs.length}건 찾기`}
            </button>
            <span className="text-[11px] text-slate-500">
              {Object.entries(counts)
                .map(([k, n]) => `${STATUS_LABEL[k as LandPriceRow['status']]} ${n}`)
                .join(' · ')}
            </span>
          </div>
          {!LAND_PRICE_READY && (
            <p className="text-[11px] text-rose-600">
              API 키가 빌드에 들어가지 않았습니다. 저장소 Secrets 에 JUSO_KEY · VWORLD_KEY 를 넣고 다시 배포하세요.
            </p>
          )}
          <p className="text-[11px] text-slate-500 leading-relaxed">
            주소마다 도로명주소 검색의 첫 번째 결과를 씁니다. 후보가 여럿이거나 값을 못 찾은 행은
            오른쪽 표에 노랗게 표시됩니다. 도로명주소는 건물의 대표지번 하나로 바뀌므로, 여러
            필지에 걸친 건물은 나머지 필지를 따로 확인해야 합니다.
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
                <span className="text-[11px] text-slate-600">{year}년 개별공시지가</span>
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
                  name={`${year}년`}
                  theme={theme}
                  onChangeTheme={setTheme}
                  onClearAll={() => setRows([])}
                  emptyHint="왼쪽에 주소를 붙여넣고 찾기를 누르면, 붙여넣은 순서 그대로 공시지가 표가 여기에 나타납니다."
                  fileSuffix="공시지가"
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

const LandPriceNavbar: React.FC<{ onBackHome: () => void }> = ({ onBackHome }) => (
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
          <h1 className="font-bold text-lg text-slate-100 tracking-tight truncate">공시지가 찾기</h1>
        </div>
        <p className="text-xs text-slate-400 truncate">국토교통부 개별공시지가 · V-World</p>
      </div>
    </div>
  </header>
);
