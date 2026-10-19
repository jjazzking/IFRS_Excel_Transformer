import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, PanelRightClose, Search, Table } from 'lucide-react';
import { SheetPreview } from '../components/SheetPreview';
import { CollapsedRail, Splitter } from '../components/LayoutControls';
import { RatesGuidance } from '../components/RatesGuidance';
import { StepReset, TierButton } from '../components/TierControls';
import { useResizableLayout } from '../hooks/useResizableLayout';
import { TableTheme } from '../types';
import { isIsoDate, todayIso } from '../utils/dateRange';
import {
  Resolution,
  STOCK_READY,
  fetchQuotes,
  inChunks,
  parseStockInputs,
  resolveStock,
} from '../utils/stockPrice';
import {
  STOCK_PURPOSES,
  STOCK_PURPOSE_BY_VALUE,
  StockEntry,
  StockParams,
  StockPurpose,
  buildStockTable,
  windowOf,
} from '../utils/stockQuery';

interface StocksWorkspaceProps {
  onBackHome: () => void;
}

// 가장 많이 찾는 건 직전 회계연도다
const lastYear = new Date().getFullYear() - 1;

const STATUS_STYLE: Record<Resolution['status'], { label: string; className: string }> = {
  ok: { label: '확인', className: 'bg-emerald-100 text-emerald-800' },
  renamed: { label: '확인', className: 'bg-emerald-100 text-emerald-800' },
  partial: { label: '확인 필요', className: 'bg-amber-100 text-amber-800' },
  multiple: { label: '후보 여럿', className: 'bg-amber-100 text-amber-800' },
  notFound: { label: '못 찾음', className: 'bg-rose-100 text-rose-700' },
  error: { label: '오류', className: 'bg-rose-100 text-rose-700' },
  blank: { label: '', className: '' },
};

export default function StocksWorkspace({ onBackHome }: StocksWorkspaceProps) {
  const { containerRef, state: layout, dragging, startDrag, resetSide, toggleSide } =
    useResizableLayout({ storageKey: 'workpaper.layout.stocks.v1', hasLeft: false });

  const [purpose, setPurpose] = useState<StockPurpose | null>(null);
  const [params, setParams] = useState<StockParams>({
    date: `${lastYear}-12-31`,
    years: 3,
    from: `${lastYear}-01-01`,
    to: `${lastYear}-12-31`,
    epsView: 'shares',
    epsPrice: 'close',
    weighting: 'value',
  });
  const patch = (p: Partial<StockParams>) => setParams(prev => ({ ...prev, ...p }));

  const [text, setText] = useState('');
  const inputs = useMemo(() => parseStockInputs(text), [text]);

  // 종목 확인 — 이름마다 한 번만 묻고 기억한다. 붙여넣고 잠깐 멈추면 확인을 시작한다.
  const cache = useRef(new Map<string, Resolution>());
  const [, setResolvedTick] = useState(0);
  useEffect(() => {
    if (!STOCK_READY) return;
    const missing = [...new Set(inputs.filter(i => i && !cache.current.has(i)))];
    if (missing.length === 0) return;
    const timer = window.setTimeout(() => {
      const today = todayIso();
      inChunks(
        missing,
        async name => {
          const r = await resolveStock(name, today);
          cache.current.set(name, r);
          return r;
        },
        () => setResolvedTick(t => t + 1)
      );
    }, 600);
    return () => window.clearTimeout(timer);
  }, [inputs]);
  const resolutions = inputs.map<Resolution | null>(i =>
    i ? cache.current.get(i) ?? null : { input: '', status: 'blank' }
  );
  const pending = resolutions.some(r => r === null);

  const [entries, setEntries] = useState<(StockEntry | null)[]>([]);
  // 표는 조회했을 때의 조건으로 만든다 — 조회 뒤 날짜만 바꿔도 표가 거짓말하지 않게
  const [asked, setAsked] = useState<{ purpose: StockPurpose; params: StockParams } | null>(null);
  const [running, setRunning] = useState(false);
  const [theme, setTheme] = useState<TableTheme>('audit_gray');

  const done = useMemo(() => entries.filter((e): e is StockEntry => e !== null), [entries]);
  const table = useMemo(
    () => (asked ? buildStockTable(asked.purpose, done, asked.params) : { columns: [], rows: [] }),
    [asked, done]
  );

  const guide = purpose ? STOCK_PURPOSE_BY_VALUE.get(purpose) : undefined;
  const datesValid =
    purpose === 'eps'
      ? isIsoDate(params.from) && isIsoDate(params.to) && params.from <= params.to
      : isIsoDate(params.date) && (purpose !== 'sbp' || params.years > 0);
  const found = resolutions.filter(r => r?.code).length;

  const run = async () => {
    if (!purpose) return;
    setRunning(true);
    setAsked({ purpose, params });
    const [from, to] = windowOf(purpose, params);
    const list = resolutions as Resolution[];
    setEntries(list.map(() => null));
    await inChunks(
      list,
      async res => {
        if (!res.code) return { res, quotes: [] };
        try {
          return { res, quotes: await fetchQuotes(res.code, from, to) };
        } catch (e) {
          return { res, quotes: [], error: e instanceof Error ? e.message : String(e) };
        }
      },
      setEntries
    );
    setRunning(false);
  };

  const steps: { key: string; title: string; done: boolean; reset?: () => void; body: React.ReactNode }[] = [
    {
      key: 'purpose',
      title: '용도',
      done: purpose !== null,
      reset: purpose ? () => setPurpose(null) : undefined,
      body: (
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-1.5">
          {STOCK_PURPOSES.map(p => (
            <TierButton
              key={p.value}
              id={`btn-stocks-purpose-${p.value}`}
              active={purpose === p.value}
              label={p.label}
              hint={p.hint}
              onClick={() => setPurpose(p.value)}
            />
          ))}
        </div>
      ),
    },
    {
      key: 'date',
      title: purpose === 'eps' ? '회계기간' : purpose === 'benchmark' ? '기산일' : purpose === 'sbp' ? '측정기준일 · 과거 기간' : '기준일',
      done: datesValid,
      body: <ParamsPicker purpose={purpose} params={params} onChange={patch} />,
    },
    {
      key: 'stocks',
      title: '종목 — 엑셀에서 회사 이름 열을 복사해 붙여넣으세요 (종목코드도 됨)',
      done: found > 0 && !pending,
      body: (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-2">
          <textarea
            id="stocks-input"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'삼성전자\n(주)SK하이닉스\n035420'}
            className="h-40 w-full resize-y rounded-md border border-slate-300 p-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <ResolutionTable resolutions={resolutions} inputs={inputs} />
        </div>
      ),
    },
  ];
  const firstOpen = steps.findIndex(s => !s.done);
  const visible = firstOpen === -1 ? steps : steps.slice(0, firstOpen + 1);

  return (
    <div className="h-screen bg-slate-100 flex flex-col text-slate-900 antialiased font-sans overflow-hidden">
      <StocksNavbar onBackHome={onBackHome} />

      <main ref={containerRef} className="flex-1 min-h-0 flex p-3">
        <section className="flex-1 min-w-0 min-h-0 flex flex-col gap-2 overflow-auto">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 shrink-0">
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
                      {s.reset && <StepReset id={`btn-stocks-reset-${s.key}`} onClick={s.reset} />}
                    </p>
                    {s.body}
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                id="btn-stocks-run"
                onClick={run}
                disabled={!STOCK_READY || !purpose || !datesValid || running || pending || found === 0}
                className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40 cursor-pointer disabled:cursor-default"
              >
                <Search className="w-3.5 h-3.5" />
                {running ? `찾는 중… ${done.length}/${entries.length}` : `${found}종목 찾기`}
              </button>
              {pending && <span className="text-[11px] text-slate-500">종목 확인 중…</span>}
              {!STOCK_READY && (
                <span className="text-[11px] text-rose-600">
                  API 키가 빌드에 들어가지 않았습니다. 저장소 Secrets 에 STOCK_KEY 를 넣고 다시 배포하세요.
                </span>
              )}
            </div>
          </div>

          {guide && <RatesGuidance guide={guide} noun="주가" />}
          <p className="text-[11px] text-slate-500 leading-relaxed px-1">
            그날 거래소에 찍힌 실제 가격(수정주가 아님)입니다. 시세는 다음 영업일 오후에 반영됩니다.
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
                  {asked ? STOCK_PURPOSE_BY_VALUE.get(asked.purpose)?.label : '주가'}
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
                  name={asked ? STOCK_PURPOSE_BY_VALUE.get(asked.purpose)!.label : '주가'}
                  theme={theme}
                  onChangeTheme={setTheme}
                  onClearAll={() => {
                    setEntries([]);
                    setAsked(null);
                  }}
                  emptyHint="왼쪽에서 용도·기준일·종목을 고르고 찾기를 누르면, 조서에 붙여넣을 주가 표가 여기에 나타납니다."
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

const dateInput = 'rounded border border-slate-300 px-1.5 py-0.5 text-xs';

const Toggle = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) => (
  <div className="flex rounded-md border border-slate-300 overflow-hidden text-[11px]">
    {options.map(([v, label]) => (
      <button
        key={v}
        onClick={() => onChange(v)}
        aria-pressed={value === v}
        className={`px-2 py-0.5 transition cursor-pointer border-r border-slate-200 last:border-r-0 ${
          value === v ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);

const ParamsPicker: React.FC<{
  purpose: StockPurpose | null;
  params: StockParams;
  onChange: (p: Partial<StockParams>) => void;
}> = ({ purpose, params, onChange }) => (
  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
    {purpose === 'eps' ? (
      <>
        <input id="stocks-from" aria-label="시작일" type="date" value={params.from} onChange={e => onChange({ from: e.target.value })} className={dateInput} />
        ~
        <input id="stocks-to" aria-label="종료일" type="date" value={params.to} onChange={e => onChange({ to: e.target.value })} className={dateInput} />
        <Toggle
          value={params.epsView}
          options={[
            ['shares', '상장주식수 변동 (기본 EPS)'],
            ['price', '평균시장가격 (희석 EPS)'],
          ]}
          onChange={epsView => onChange({ epsView })}
        />
        {params.epsView === 'price' && (
          <Toggle
            value={params.epsPrice}
            options={[
              ['close', '종가 평균'],
              ['hilo', '(고가+저가)/2 평균'],
            ]}
            onChange={epsPrice => onChange({ epsPrice })}
          />
        )}
      </>
    ) : (
      <>
        <input id="stocks-date" aria-label="기준일" type="date" value={params.date} onChange={e => onChange({ date: e.target.value })} className={dateInput} />
        {purpose === 'sbp' && (
          <label className="flex items-center gap-1">
            과거
            <input
              id="stocks-years"
              type="number"
              min={1}
              max={10}
              value={params.years}
              onChange={e => onChange({ years: Number(e.target.value) })}
              className="w-14 rounded border border-slate-300 px-1.5 py-0.5"
            />
            년 (기대존속기간)
          </label>
        )}
        {purpose === 'benchmark' && (
          <Toggle
            value={params.weighting}
            options={[
              ['value', '거래대금÷거래량'],
              ['close', '종가×거래량 가중'],
            ]}
            onChange={weighting => onChange({ weighting })}
          />
        )}
      </>
    )}
  </div>
);

/** 붙여넣은 이름 옆에 무엇으로 찾았는지 — 줄 순서는 붙여넣은 그대로 */
const ResolutionTable: React.FC<{ resolutions: (Resolution | null)[]; inputs: string[] }> = ({ resolutions, inputs }) => (
  <div className="h-40 overflow-auto rounded-md border border-slate-200 text-[11px]">
    {inputs.length === 0 ? (
      <p className="p-2 text-slate-400">붙여넣으면 줄마다 찾은 종목명·종목코드가 여기에 나타납니다.</p>
    ) : (
      <table className="w-full">
        <thead className="sticky top-0 bg-slate-50 text-slate-500">
          <tr>
            <th className="px-1.5 py-1 text-left font-semibold">검색 이름</th>
            <th className="px-1.5 py-1 text-left font-semibold">종목명</th>
            <th className="px-1.5 py-1 text-left font-semibold">코드</th>
            <th className="px-1.5 py-1 text-left font-semibold">상태</th>
          </tr>
        </thead>
        <tbody>
          {resolutions.map((r, i) => {
            const style = r ? STATUS_STYLE[r.status] : null;
            const warn = r && r.status !== 'ok' && r.status !== 'renamed' && r.status !== 'blank';
            return (
              <tr key={i} className={`border-t border-slate-100 ${warn ? 'bg-amber-50/60' : ''}`}>
                <td className="px-1.5 py-0.5 text-slate-500">{r?.query ?? inputs[i]}</td>
                <td className="px-1.5 py-0.5 font-medium text-slate-800">{r?.name ?? ''}</td>
                <td className="px-1.5 py-0.5 font-mono">{r?.code ?? ''}</td>
                <td className="px-1.5 py-0.5" title={[r?.message, r?.others?.length ? `다른 후보: ${r.others.join(', ')}` : ''].filter(Boolean).join('\n')}>
                  {r === null ? (
                    <span className="text-slate-400">확인 중…</span>
                  ) : (
                    style?.label && <span className={`px-1 rounded ${style.className}`}>{style.label}</span>
                  )}
                  {r?.others?.length ? <span className="ml-1 text-amber-700">{r.others.slice(0, 2).join(', ')}…</span> : null}
                  {(r?.status === 'notFound' || r?.status === 'error') && <span className="ml-1 text-rose-600">{r.message}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    )}
  </div>
);

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
