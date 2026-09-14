import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileUp, PanelRightClose, ShieldCheck, Table2 } from 'lucide-react';
import { PdfViewer } from '../components/minutes/PdfViewer';
import { SchemaInspector } from '../components/minutes/SchemaInspector';
import { CollapsedRail, Splitter } from '../components/LayoutControls';
import { useResizableLayout } from '../hooks/useResizableLayout';
import { MinutesText } from '../lib/minutes/text';
import { TesseractEngine } from '../lib/minutes/ocr';
import { parseMinutes } from '../lib/minutes/parse';
import { Evidence, MinutesDocument } from '../lib/minutes/types';

interface MinutesWorkspaceProps {
  onBackHome: () => void;
}

interface Loaded {
  text: MinutesText;
  doc: MinutesDocument;
}

export default function MinutesWorkspace({ onBackHome }: MinutesWorkspaceProps) {
  // 2존이다 — 왼쪽에 원본 PDF, 오른쪽에 뽑아낸 스키마. 폭은 따로 기억한다.
  const { containerRef, state: layout, dragging, startDrag, resetSide, toggleSide } =
    useResizableLayout({ storageKey: 'workpaper.layout.minutes.v1', hasLeft: false });

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Evidence | null>(null);
  // 같은 자리를 다시 골랐을 때도 화면을 다시 그 자리로 데려가기 위한 셈. 근거
  // 객체는 그대로라 값만으로는 '다시 눌렀다' 를 알 수 없다.
  const [focusKey, setFocusKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const select = useCallback((path: string, evidence: Evidence | null) => {
    setSelected(path);
    setHighlight(evidence);
    setFocusKey(n => n + 1);
  }, []);

  const open = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setSelected(null);
    setHighlight(null);
    setProgress('여는 중…');

    // 엔진은 **스캔 페이지를 만났을 때만** 실제로 자기 몸을 받아 온다. 텍스트
    // 의사록만 보는 사람에게는 한 바이트도 나가지 않는다.
    const ocr = new TesseractEngine({ onProgress: setProgress });
    try {
      const text = await MinutesText.load(file, { ocr });
      setLoaded(prev => {
        // 앞 파일의 pdf.js 자원을 놓아 준다. 여러 건을 이어 볼 때 쌓인다.
        void prev?.text.destroy();
        return { text, doc: parseMinutes(text) };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      void ocr.destroy();
      setBusy(false);
      setProgress(null);
    }
  }, []);

  // 화면을 떠날 때도 놓아 준다.
  useEffect(() => () => void loaded?.text.destroy(), [loaded]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void open(file);
    // 같은 파일을 다시 고를 수 있게 비운다.
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') void open(file);
  };

  return (
    <div
      className="h-screen bg-slate-100 flex flex-col text-slate-900 antialiased font-sans overflow-hidden"
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
    >
      <MinutesNavbar
        onBackHome={onBackHome}
        subtitle={loaded ? loaded.doc.source.fileName : '규칙 전용 · 파일은 브라우저 밖으로 나가지 않습니다'}
      />

      <div className="shrink-0 px-3 pt-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <input
            ref={inputRef}
            id="input-minutes-file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={onPick}
            className="hidden"
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg px-2.5 py-1.5 hover:bg-slate-700 disabled:opacity-50 transition cursor-pointer"
          >
            <FileUp className="w-3.5 h-3.5" />
            {loaded ? '다른 의사록 열기' : '의사록 PDF 열기'}
          </button>
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-700">
            <ShieldCheck className="w-3.5 h-3.5" />
            브라우저 안에서만 읽습니다 — 파일도 본문도 서버로 보내지 않습니다
          </span>
          {busy && <span className="text-[11px] text-slate-500">{progress ?? '읽는 중…'}</span>}
          {error && <span className="text-[11px] text-rose-600">열지 못했습니다 — {error}</span>}
        </div>
      </div>

      <main ref={containerRef} className="flex-1 min-h-0 flex p-3">
        <section className="flex-1 min-w-0 min-h-0">
          {loaded ? (
            <PdfViewer
              pdf={loaded.text.pdf}
              pages={loaded.text.pages}
              highlight={highlight}
              focusKey={focusKey}
            />
          ) : (
            <EmptyState onPick={() => inputRef.current?.click()} />
          )}
        </section>

        {layout.rightOpen ? (
          <>
            <Splitter
              label="스키마 패널 폭"
              active={dragging === 'right'}
              onPointerDown={startDrag('right')}
              onDoubleClick={() => resetSide('right')}
            />
            <aside style={{ width: layout.right }} className="shrink-0 min-h-0 flex flex-col gap-2">
              {loaded ? (
                <>
                  <div className="flex justify-end shrink-0">
                    <button
                      onClick={() => toggleSide('right')}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                      title="스키마 패널 접기"
                    >
                      <PanelRightClose className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0">
                    <SchemaInspector
                      doc={loaded.doc}
                      selected={selected}
                      onSelect={select}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm grid place-items-center p-4">
                  <p className="text-xs text-slate-500 text-center leading-relaxed">
                    의사록을 열면 규칙이 뽑아낸 값과
                    <br />
                    그 값이 나온 원문 자리가 여기 나옵니다.
                  </p>
                </div>
              )}
            </aside>
          </>
        ) : (
          <>
            <div className="w-3 shrink-0" />
            <CollapsedRail
              icon={<Table2 className="w-4 h-4" />}
              label="정규 스키마"
              onClick={() => toggleSide('right')}
            />
          </>
        )}
      </main>
    </div>
  );
}

const EmptyState: React.FC<{ onPick: () => void }> = ({ onPick }) => (
  <div className="h-full rounded-xl border-2 border-dashed border-slate-300 bg-white/60 grid place-items-center p-6">
    <div className="max-w-md text-center space-y-3">
      <FileUp className="w-8 h-8 text-slate-300 mx-auto" />
      <p className="text-sm font-semibold text-slate-700">의사록 PDF 를 여기에 끌어다 놓으세요</p>
      <p className="text-xs text-slate-500 leading-relaxed">
        규칙만으로 일시·장소·출석 인원을 뽑고, 각 값이 원문 어디에서 나왔는지 표시합니다.
        확신이 없는 자리는 값을 지어내지 않고 <span className="font-medium">검토 필요</span> 로 남깁니다.
      </p>
      <button
        onClick={onPick}
        className="text-xs font-medium text-emerald-700 hover:text-emerald-900 underline underline-offset-2 cursor-pointer"
      >
        파일 고르기
      </button>
    </div>
  </div>
);

const MinutesNavbar: React.FC<{ onBackHome: () => void; subtitle: string }> = ({
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
          <h1 className="font-bold text-lg text-slate-100 tracking-tight truncate">의사록 읽기</h1>
        </div>
        <p className="text-xs text-slate-400 truncate">{subtitle}</p>
      </div>
    </div>
  </header>
);
