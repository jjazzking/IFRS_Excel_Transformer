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
  renderDart,
  searchCorps,
} from '../utils/dart';

interface DartWorkspaceProps {
  onBackHome: () => void;
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
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  // 회사·보고서를 빠르게 바꿔 누르면 늦게 온 옛 응답이 새 화면을 덮지 않게 한다.
  const latest = useRef(0);

  const hits = useMemo(() => (corps ? searchCorps(corps, query) : []), [corps, query]);

  useEffect(() => {
    loadCorps().then(setCorps, e => setError(`회사 목록을 받지 못했습니다 — ${message(e)}`));
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.replaceChildren(node ? renderDart(node.els) : '');
    el.scrollTop = 0;
  }, [node]);

  const run = async <T,>(label: string, job: () => Promise<T>, done: (v: T) => void) => {
    const id = ++latest.current;
    setLoading(label);
    setError('');
    try {
      const v = await job();
      if (id === latest.current) done(v);
    } catch (e) {
      if (id === latest.current) setError(message(e));
    } finally {
      if (id === latest.current) setLoading('');
    }
  };

  const pickCorp = (c: Corp) => {
    setCorp(c);
    setReports(null);
    setReport(null);
    setFiles(null);
    setNode(null);
    run('공시 목록을 받는 중…', () => loadReports(c.code), setReports);
  };

  const pickReport = (r: Report) => {
    setReport(r);
    setFiles(null);
    setNode(null);
    run('공시 원문을 받는 중…', () => loadDocument(r.rcept_no), fs => {
      setFiles(fs);
      setFileIdx(0);
      setNode(fs[0]?.toc[0] ?? null);
    });
  };

  const pickFile = (i: number) => {
    setFileIdx(i);
    setNode(files?.[i]?.toc[0] ?? null);
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
                onChange={e => pickFile(Number(e.target.value))}
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
            {loading && <span className="text-[11px] text-slate-500">{loading}</span>}
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
              {file?.toc.map(n => <TocItem key={n.id} node={n} depth={0} selected={node} onSelect={setNode} />)}
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
