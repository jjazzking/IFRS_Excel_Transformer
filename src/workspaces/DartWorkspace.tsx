import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, ExternalLink, Search } from 'lucide-react';
import {
  Corp,
  DartFile,
  Report,
  TocNode,
  loadCorps,
  loadDocument,
  loadReports,
  loadWebAttachments,
  loadWebSection,
  loadWebToc,
  renderDart,
  searchCorps,
} from '../utils/dart';

interface DartWorkspaceProps {
  onBackHome: () => void;
}

/** 기다리는 일의 종류. 종류마다 걸린 시간을 기억해 다음 예상 시간으로 쓴다. */
type LoadKind = 'corps' | 'reports' | 'document' | 'toc' | 'section';

const LOAD_LABEL: Record<LoadKind, string> = {
  corps: '회사 목록을 받는 중',
  reports: '공시 목록을 받는 중',
  document: '공시 원문을 받는 중',
  toc: '첨부 목차를 받는 중',
  section: '본문을 받는 중',
};

// 처음 쓰는 브라우저의 예상 시간 (ms). 실제로 걸린 시간을 반씩 섞어 고쳐 나간다.
const DEFAULT_ESTIMATE: Record<LoadKind, number> = { corps: 8000, reports: 1500, document: 4000, toc: 1500, section: 2000 };
const ESTIMATE_KEY = 'workpaper.dart.estimate.v1';

function readEstimates(): Record<LoadKind, number> {
  try {
    return { ...DEFAULT_ESTIMATE, ...JSON.parse(localStorage.getItem(ESTIMATE_KEY) ?? '{}') };
  } catch {
    return DEFAULT_ESTIMATE;
  }
}

function recordDuration(kind: LoadKind, ms: number) {
  // 캐시에서 바로 나온 것은 넣지 않는다 — 넣으면 처음 받을 때의 예상이 너무 짧아진다.
  if (ms < 300) return;
  try {
    const e = readEstimates();
    e[kind] = Math.round((e[kind] + ms) / 2);
    localStorage.setItem(ESTIMATE_KEY, JSON.stringify(e));
  } catch {
    // 저장 못 하는 브라우저면 기본 예상을 계속 쓴다.
  }
}

interface Loading {
  kind: LoadKind;
  started: number;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ymd = (d: string) => `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;

export default function DartWorkspace({ onBackHome }: DartWorkspaceProps) {
  const [corps, setCorps] = useState<Corp[] | null>(null);
  const [query, setQuery] = useState('');
  const [corp, setCorp] = useState<Corp | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [files, setFiles] = useState<DartFile[] | null>(null);
  const [fileIdx, setFileIdx] = useState(0);
  const [node, setNode] = useState<TocNode | null>(null);
  const [loading, setLoading] = useState<Loading | null>(null);
  const [corpsStarted] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  // DART 사이트에서 받은 첨부 목차·본문은 그 자리에서 채우므로, 다시 그리라고 알리는 데 쓴다.
  const [version, setVersion] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  // 회사·보고서를 빠르게 바꿔 누르면 늦게 온 옛 응답이 새 화면을 덮지 않게 한다.
  const latest = useRef(0);

  const hits = useMemo(() => (corps ? searchCorps(corps, query) : []), [corps, query]);

  useEffect(() => {
    loadCorps().then(
      cs => {
        recordDuration('corps', Date.now() - corpsStarted);
        setCorps(cs);
      },
      e => setError(`회사 목록을 받지 못했습니다 — ${message(e)}`)
    );
  }, [corpsStarted]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.replaceChildren(node ? renderDart(node.els) : '');
    el.scrollTop = 0;
  }, [node, version]);

  const run = async <T,>(kind: LoadKind, job: () => Promise<T>, done: (v: T) => void) => {
    const id = ++latest.current;
    const started = Date.now();
    setLoading({ kind, started });
    setError('');
    try {
      const v = await job();
      recordDuration(kind, Date.now() - started);
      if (id === latest.current) done(v);
    } catch (e) {
      if (id === latest.current) setError(message(e));
    } finally {
      if (id === latest.current) setLoading(null);
    }
  };

  const pickCorp = (c: Corp) => {
    setCorp(c);
    setReports(null);
    setReport(null);
    setFiles(null);
    setNode(null);
    run('reports', () => loadReports(c.code), setReports);
  };

  const pickReport = (r: Report) => {
    setReport(r);
    setFiles(null);
    setNode(null);
    run(
      'document',
      async () => {
        const [zip, web] = await Promise.all([
          loadDocument(r.rcept_no),
          loadWebAttachments(r.rcept_no).catch((e: unknown) => message(e)),
        ]);
        // 사업보고서는 원문 ZIP 에 감사보고서가 들어 있다. 분·반기 검토보고서와 정정 공시의 첨부는
        // ZIP 에 빠지므로 그때만 DART 사이트의 첨부 목록을 단다.
        if (zip.length > 1) return { fs: zip, warn: '' };
        return typeof web === 'string' ? { fs: zip, warn: `첨부 목록을 받지 못했습니다 — ${web}` } : { fs: [...zip, ...web], warn: '' };
      },
      ({ fs, warn }) => {
        setFiles(fs);
        setError(warn);
        // 주로 보는 것은 감사·검토보고서라 있으면 그것부터 연다.
        const audit = fs.findIndex(f => /감사보고서|검토보고서/.test(f.title));
        openFile(fs, Math.max(audit, 0));
      }
    );
  };

  const openFile = (fs: DartFile[], i: number) => {
    setFileIdx(i);
    const f = fs[i];
    if (!f?.web || f.toc.length > 0) return pickNode(f?.toc[0] ?? null);
    setNode(null);
    run('toc', () => loadWebToc(f), toc => {
      f.toc = toc;
      pickNode(toc[0] ?? null);
    });
  };

  const pickNode = (n: TocNode | null) => {
    setNode(n);
    if (!n?.src || n.els.length > 0) return;
    run('section', () => loadWebSection(n), () => setVersion(v => v + 1));
  };

  // HTML 로 담아야 엑셀에 붙여넣을 때 표의 칸·병합이 그대로 산다.
  const copy = async () => {
    const el = bodyRef.current;
    if (!el) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([el.innerHTML], { type: 'text/html' }),
          'text/plain': new Blob([el.innerText], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(el.innerText);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const file = files?.[fileIdx];

  return (
    <div className="h-screen bg-slate-100 flex flex-col text-slate-900 antialiased font-sans overflow-hidden">
      <DartNavbar onBackHome={onBackHome} />

      <main className="flex-1 min-h-0 flex gap-3 p-3">
        {/* 왼쪽 — 회사 검색 · 공시 목록 */}
        <section className="w-72 shrink-0 min-h-0 flex flex-col gap-2 bg-white rounded-xl border border-slate-200 shadow-sm p-3">
          <label className="relative block">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="dart-corp-search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={corps ? '회사 이름 또는 종목코드' : '회사 목록을 받는 중…'}
              disabled={!corps}
              className="w-full rounded-md border border-slate-300 py-1 pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>
          {!corps && !error && (
            <div className="space-y-1">
              <LoadingRing kind="corps" started={corpsStarted} />
              <p className="text-[10px] text-slate-400 leading-snug">
                처음 한 번만 회사 목록(약 10만 곳)을 받느라 느립니다. 다음부터는 바로 열립니다.
              </p>
            </div>
          )}

          {query.trim() && corps && (
            <ul className="max-h-60 overflow-auto rounded-md border border-slate-200 divide-y divide-slate-100 shrink-0">
              {hits.length === 0 && <li className="px-2 py-1.5 text-[11px] text-slate-500">찾는 회사가 없습니다.</li>}
              {hits.map(c => (
                <li key={c.code}>
                  <button
                    onClick={() => {
                      pickCorp(c);
                      setQuery('');
                    }}
                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-emerald-50 cursor-pointer flex items-center gap-2"
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-slate-400">{c.stock || '비상장'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {corp && (
            <div className="text-xs font-semibold text-slate-700 pt-1">
              {corp.name}
              <span className="ml-1 font-normal text-slate-400">{corp.stock || '비상장'}</span>
            </div>
          )}

          {reports && (
            <ul className="flex-1 min-h-0 overflow-auto divide-y divide-slate-100">
              {reports.length === 0 && <li className="py-2 text-[11px] text-slate-500">정기공시·감사보고서가 없습니다.</li>}
              {reports.map(r => (
                <li key={r.rcept_no}>
                  <button
                    onClick={() => pickReport(r)}
                    className={`w-full text-left px-1.5 py-1.5 rounded cursor-pointer ${
                      report?.rcept_no === r.rcept_no ? 'bg-emerald-50 text-emerald-800' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs truncate">{r.report_nm.trim()}</div>
                    <div className="text-[10px] text-slate-400">
                      {ymd(r.rcept_dt)} · {r.flr_nm}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!corp && (
            <p className="text-[11px] text-slate-500 leading-relaxed">
              회사를 고르면 사업·반기·분기보고서와 감사보고서가 나옵니다. 보고서를 누르면 오른쪽에 DART
              화면처럼 목차와 본문이 뜨고, 주석 절은 주석 번호별로 나뉩니다.
            </p>
          )}
        </section>

        {/* 오른쪽 — DART 뷰어 */}
        <section className="flex-1 min-w-0 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="shrink-0 border-b border-slate-200 px-3 py-2 flex items-center gap-2">
            <span className="text-xs font-semibold truncate">{report ? report.report_nm.trim() : '공시 원문'}</span>
            {files && files.length > 1 && (
              <select
                value={fileIdx}
                onChange={e => openFile(files, Number(e.target.value))}
                className="rounded border border-slate-300 px-1 py-0.5 text-xs"
                aria-label="본문·첨부 고르기"
              >
                {files.map((f, i) => (
                  <option key={f.name} value={i}>
                    {i === 0 ? '본문' : '첨부'} — {f.title}
                  </option>
                ))}
              </select>
            )}
            {loading && <LoadingRing kind={loading.kind} started={loading.started} />}
            {loading?.kind === 'document' && (
              <span className="text-[10px] text-slate-400">처음 여는 보고서만 느립니다 — 한 번 연 보고서는 바로 열립니다</span>
            )}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              {report && (
                <a
                  href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${report.rcept_no}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800"
                >
                  DART에서 열기 <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                id="btn-dart-copy"
                onClick={copy}
                disabled={!node}
                className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40 cursor-pointer disabled:cursor-default"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? '복사됨' : '보이는 내용 복사'}
              </button>
            </div>
          </div>
          {error && <p className="shrink-0 px-3 py-2 text-[11px] text-rose-600 bg-rose-50">{error}</p>}

          <div className="flex-1 min-h-0 flex">
            <nav className="w-64 shrink-0 overflow-auto border-r border-slate-200 bg-slate-50 py-2 text-xs">
              {file?.toc.map(n => <TocItem key={n.id} node={n} depth={0} selected={node} onSelect={pickNode} />)}
            </nav>
            <div
              ref={bodyRef}
              className="flex-1 min-w-0 overflow-auto px-6 py-4 text-[13px] leading-relaxed [&_h2]:text-base [&_h2]:font-bold [&_h2]:my-3 [&_h3]:font-bold [&_h3]:my-2 [&_h4]:font-semibold [&_h4]:my-2 [&_p]:my-1"
            />
          </div>
        </section>
      </main>
    </div>
  );
}

/**
 * 기다리는 동안 도는 동그라미. 예상 시간에 90% 까지 차고, 넘기면 99% 쪽으로 천천히 다가간다
 * (끝나기 전에 100% 가 되어 멈춰 보이지 않게).
 */
const LoadingRing: React.FC<Loading> = ({ kind, started }) => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  const estimate = useMemo(() => readEstimates()[kind], [kind]);
  const elapsed = now - started;
  const t = elapsed / estimate;
  const progress = t < 1 ? 0.9 * t : 0.9 + 0.09 * (1 - Math.exp(1 - t));
  const left = Math.ceil((estimate - elapsed) / 1000);
  const R = 7;
  const C = 2 * Math.PI * R;
  return (
    <span
      role="progressbar"
      aria-label={LOAD_LABEL[kind]}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      className="flex items-center gap-1.5 text-[11px] text-slate-500 shrink-0"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" className="-rotate-90">
        <circle cx="9" cy="9" r={R} fill="none" stroke="#e2e8f0" strokeWidth="2.5" />
        <circle
          cx="9"
          cy="9"
          r={R}
          fill="none"
          stroke="#059669"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
        />
      </svg>
      {LOAD_LABEL[kind]} · {left > 0 ? `약 ${left}초` : '거의 다 됐습니다…'}
    </span>
  );
};

const TocItem: React.FC<{
  node: TocNode;
  depth: number;
  selected: TocNode | null;
  onSelect: (n: TocNode) => void;
}> = ({ node, depth, selected, onSelect }) => (
  <>
    <button
      onClick={() => onSelect(node)}
      style={{ paddingLeft: 8 + depth * 12 }}
      className={`w-full text-left pr-2 py-1 truncate cursor-pointer ${
        selected === node ? 'bg-emerald-100 text-emerald-900 font-semibold' : 'hover:bg-slate-100'
      }`}
      title={node.title}
    >
      {node.title}
    </button>
    {node.children.map(c => (
      <TocItem key={c.id} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} />
    ))}
  </>
);

const DartNavbar: React.FC<{ onBackHome: () => void }> = ({ onBackHome }) => (
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
          <h1 className="font-bold text-lg text-slate-100 tracking-tight truncate">주석 찾기</h1>
        </div>
        <p className="text-xs text-slate-400 truncate">금융감독원 전자공시(OpenDART) 원문</p>
      </div>
    </div>
  </header>
);
