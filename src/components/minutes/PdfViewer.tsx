import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileWarning, ImageOff, ScanLine } from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist/types/src/display/api';
import type { Page } from '../../lib/minutes/text';
import { Evidence } from '../../lib/minutes/types';

interface PdfViewerProps {
  pdf: PDFDocumentProxy;
  pages: Page[];
  /** 지금 고른 필드의 근거. 그 자리를 칠하고 그 자리로 스크롤한다. */
  highlight: Evidence | null;
  /**
   * 고른 횟수. 같은 근거를 다시 누르면 값은 그대로라 `highlight` 만으로는
   * 아무 일도 일어나지 않는다. 이 숫자가 바뀌므로 다시 가운데로 데려간다.
   */
  focusKey?: number;
}

/** 한 쪽을 캔버스에 그리고, 그 위에 근거 사각형을 덮는다. */
const PdfPage: React.FC<{
  pdf: PDFDocumentProxy;
  page: Page;
  total: number;
  scale: number;
  highlight: Evidence | null;
}> = ({ pdf, page, total, scale, highlight }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // 배율이 바뀌면 다시 그린다. 앞 시도가 남긴 실패 표시까지 같이 지운다 —
    // 안 지우면 취소된 첫 그리기의 표시가 성공한 그림 위에 그대로 남는다.
    setFailed(false);

    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // 같은 캔버스에 두 그리기가 겹치면 pdf.js 가 거부한다. 앞의 것을 확실히
      // 끝내고 시작한다.
      const previous = taskRef.current;
      if (previous) {
        previous.cancel();
        await previous.promise.catch(() => undefined);
        taskRef.current = null;
      }
      if (cancelled) return;

      try {
        const proxy = await pdf.getPage(page.index + 1);
        if (cancelled) return;

        const viewport = proxy.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const task = proxy.render({ canvas, viewport });
        taskRef.current = task;
        await task.promise;
        taskRef.current = null;
      } catch {
        // 취소는 오류가 아니다 — 취소된 경우 `cancelled` 가 서 있다.
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      taskRef.current?.cancel();
    };
  }, [pdf, page.index, scale]);

  const width = page.width * scale;
  const height = page.height * scale;
  const boxes = highlight?.page === page.index + 1 ? highlight.bbox : [];

  return (
    <div
      data-page={page.index + 1}
      className="relative mx-auto bg-white shadow-sm border border-slate-300"
      style={{ width, height }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {page.kind === 'scan' && (
        page.ocrRotation === undefined ? (
          <div className="absolute inset-x-0 top-0 flex items-center gap-1.5 bg-amber-100/90 border-b border-amber-300 px-2 py-1 text-[11px] text-amber-900">
            <ImageOff className="w-3.5 h-3.5 shrink-0" />
            이미지 페이지 — 글자를 읽지 못했습니다. 이 쪽의 값은 비어 있습니다.
          </div>
        ) : (
          <div className="absolute inset-x-0 top-0 flex items-center gap-1.5 bg-sky-100/90 border-b border-sky-300 px-2 py-1 text-[11px] text-sky-900">
            <ScanLine className="w-3.5 h-3.5 shrink-0" />
            이미지 페이지 — OCR 로 읽었습니다
            {page.ocrRotation ? ` (${page.ocrRotation}° 돌려서)` : ''}
            {page.ocrConfidence !== undefined && ` · 평균 신뢰도 ${page.ocrConfidence.toFixed(0)}`}
            . 원문 그대로가 아닙니다.
          </div>
        )
      )}

      {failed && (
        <div className="absolute inset-0 grid place-items-center text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <FileWarning className="w-4 h-4" /> 이 쪽을 그리지 못했습니다
          </span>
        </div>
      )}

      {boxes.map((b, i) => (
        <div
          key={i}
          className="absolute bg-emerald-400/30 border border-emerald-500 rounded-[2px] pointer-events-none"
          style={{
            left: b[0] * scale,
            top: b[1] * scale,
            width: Math.max(2, (b[2] - b[0]) * scale),
            height: Math.max(2, (b[3] - b[1]) * scale),
          }}
        />
      ))}

      <span className="absolute -bottom-5 right-0 text-[10px] text-slate-400 tabular-nums">
        {page.index + 1} / {total}
      </span>
    </div>
  );
};

export const PdfViewer: React.FC<PdfViewerProps> = ({ pdf, pages, highlight, focusKey = 0 }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 마지막으로 데려간 자리. 배율만 바뀐 것인지(폭 조절) 사람이 새로 고른 것인지
  // 가른다 — 폭을 끄는 동안 부드럽게 흐르면 화면이 따라붙지 못한다.
  const focusRef = useRef<string | null>(null);
  // 0 은 '아직 재지 않았다' 는 뜻이다. 폭을 재기 전에 임의의 배율로 한 번 그리면
  // 그 그림은 곧바로 버려지고, 취소된 그리기가 화면에 잔상을 남긴다.
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 가장 넓은 쪽을 기준으로 해야 쪽마다 크기가 들쭉날쭉하지 않는다.
    const widest = pages.reduce((w, p) => Math.max(w, p.width), 1);
    const fit = () => {
      const next = Math.max(0.2, (el.clientWidth - 32) / widest);
      // 1px 미만의 흔들림으로 전부 다시 그리지 않는다.
      setScale(prev => (Math.abs(prev - next) * widest < 1 ? prev : next));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pages]);

  // 근거를 고르면 **그 줄이** 화면 가운데 오게 데려간다. 쪽 단위로만 맞추면
  // 한 쪽이 화면보다 길 때 정작 칠해진 자리가 화면 밖에 남는다. 배율이 바뀌어도
  // (패널 폭 조절 등) 같은 자리를 다시 가운데로 잡아 준다.
  useEffect(() => {
    if (!highlight || scale <= 0) return;
    const container = scrollRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-page="${highlight.page}"]`);
    if (!container || !target) return;

    // 쪽이 스크롤 안쪽 어디에 놓였는지. 캔버스가 아직 안 그려졌어도 크기는
    // 배율에서 정해 두었으므로 이 값은 이미 맞다.
    const pageTop =
      target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;

    const boxes = highlight.bbox;
    // 근거 사각형이 없으면(OCR 이 자리를 못 준 경우) 쪽 전체를 가운데로 본다.
    const top = boxes.length > 0 ? Math.min(...boxes.map(b => b[1])) * scale : 0;
    const bottom = boxes.length > 0 ? Math.max(...boxes.map(b => b[3])) * scale : target.clientHeight;

    const view = container.clientHeight;
    const height = bottom - top;
    // 의안 본문처럼 화면보다 긴 구간은 가운데를 맞추면 시작이 위로 밀려 나간다.
    // 그럴 때는 **구간의 머리**를 화면 위쪽 1/6 지점에 둔다.
    const offset = height > view * 0.8 ? top - view / 6 : top + height / 2 - view / 2;

    const token = `${focusKey}:${highlight.page}:${highlight.start}:${highlight.end}`;
    const behavior: ScrollBehavior = focusRef.current === token ? 'auto' : 'smooth';
    focusRef.current = token;

    container.scrollTo({ top: Math.max(0, pageTop + offset), behavior });
  }, [highlight, focusKey, scale]);

  return (
    <div ref={scrollRef} className="h-full overflow-auto bg-slate-200 rounded-xl p-4">
      <div className="flex flex-col gap-7">
        {scale > 0 &&
          pages.map(page => (
            <PdfPage
              key={page.index}
              pdf={pdf}
              page={page}
              total={pages.length}
              scale={scale}
              highlight={highlight}
            />
          ))}
      </div>
    </div>
  );
};
