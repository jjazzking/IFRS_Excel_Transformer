/**
 * 스캔 페이지의 글자를 읽는다. `scripts/minutes_ocr.py` 의 브라우저 판이다 —
 * 같은 Tesseract 를 WebAssembly 로 돌린다.
 *
 * 텍스트 레이어가 있는 페이지에는 쓰지 않는다. 거기서는 pdf.js 가 글자와 좌표를
 * 정확히 주므로 OCR 은 돈과 정확도를 동시에 버리는 일이다 (`docs/minutes-ocr.md`
 * 0장: 깨끗한 스캔을 OCR 로 읽으면 94.1%, 같은 문서를 본문으로 읽으면 100%).
 *
 * 이 모듈이 지키는 약속은 파이썬 판과 같다 — **텍스트 경로와 똑같은 모양을
 * 내놓는다.** 낱말 하나에 글자·PDF 좌표·줄 번호·신뢰도. 그러면 그 뒤의 좌표계와
 * 규칙은 한 줄도 바뀌지 않는다. 클라우드 엔진을 붙일 때도 이 모양만 맞추면 된다.
 *
 * **엔진도 모델도 우리 origin 에서 받는다.** 기본값인 CDN 을 쓰지 않는 이유는
 * 속도가 아니라, 의사록을 연 페이지가 바깥으로 아무것도 부르지 않아야 하기
 * 때문이다 (`docs/minutes-plan.md` 0장 벽 2).
 */
import { OEM, PSM, createWorker } from 'tesseract.js';
import type { Worker } from 'tesseract.js';
import type { PDFPageProxy } from 'pdfjs-dist/types/src/display/api';

/** 낱말 하나. bbox 는 **배율 1 화면 좌표**다 — 픽셀 변환은 이 모듈 안에서 끝낸다. */
export interface OcrWord {
  text: string;
  bbox: [number, number, number, number];
  line: number;
  confidence: number; // 0~100
}

/**
 * 해상도를 올려도 좋아지지 않는다. 글자 간격이 벌어져 낱말이 더 잘게 쪼개진다
 * (`docs/minutes-ocr.md` 2-2). 150dpi 가 가장 깨끗했고 파일도 제일 작다.
 */
const DEFAULT_DPI = 150;

/**
 * 스캔 PDF 는 페이지 크기를 **픽셀 그대로** 잡아 두는 경우가 많다. 300dpi 로 뜬
 * A4 가 595×842 가 아니라 2481×3508 포인트로 들어온다. 여기에 dpi 를 그대로
 * 곱하면 네 배 크게 그려져 OCR 이 네 배 느려지고 낱말은 더 잘게 쪼개진다.
 * 그래서 배율이 아니라 **목표 가로 픽셀**로 맞춘다. A4 를 150dpi 로 뜬 크기다.
 */
const TARGET_WIDTH_PX = 1240;

/**
 * 페이지 평균 신뢰도가 이 아래면 방향이 틀어졌다고 보고 돌려 가며 다시 읽는다.
 * 방향 감지(OSD)는 쓰지 않는다 — 한국어 페이지에서 90도를 180도라고 답했다
 * (`docs/minutes-ocr.md` 2-3).
 */
export const ORIENTATION_THRESHOLD = 70;

const ROTATIONS = [0, 90, 180, 270] as const;

/** 이 아래로 떨어진 낱말은 실제로 틀린 낱말이었다. 검증에서 필드를 내리는 데 쓴다. */
export const LOW_CONFIDENCE = 60;

/** 곁자료가 놓인 자리. `vite.config.ts` 의 `sideAssetsPlugin` 이 깔아 둔다. */
const ASSETS = new URL('tesseract/', document.baseURI).href;

export interface OcrOptions {
  /** 모델을 다른 자리에서 받고 싶을 때 (모델 비교에 쓴다). 기본은 `tesseract/lang/`. */
  langPath?: string;
  /**
   * 받아 둔 모델을 브라우저에 쟁여 둘지. 기본은 쟁여 둔다 — 다음 의사록부터는
   * 내려받기가 없다. **모델을 견줄 때는 꺼야 한다.** 쟁여 둔 것이 이름(`kor`)으로
   * 집히므로, 켜 둔 채 두 모델을 재면 뒤엣것이 앞엣것 결과를 그대로 베낀다.
   */
  cache?: boolean;
  /** 한 페이지를 읽을 때마다 부른다. OCR 은 느려서 화면이 진행을 말해 줘야 한다. */
  onProgress?: (message: string) => void;
}

export class TesseractEngine {
  readonly name = 'tesseract';

  /** 마지막으로 읽은 페이지에서 고른 방향과 그때의 평균 신뢰도. */
  lastRotation = 0;
  lastMeanConfidence = 0;

  private worker: Worker | null = null;
  private hint = 0;
  private settled = false;

  constructor(private readonly options: OcrOptions = {}) {}

  private async ready(): Promise<Worker> {
    if (this.worker) return this.worker;
    this.options.onProgress?.('OCR 엔진을 받는 중…');

    this.worker = await createWorker('kor', OEM.LSTM_ONLY, {
      corePath: ASSETS + 'core',
      workerPath: ASSETS + 'worker.min.js',
      langPath: this.options.langPath ?? ASSETS + 'lang',
      cacheMethod: this.options.cache === false ? 'none' : 'write',
      gzip: true,
    });
    // 파이썬 판의 `--psm 6` 과 같다 — 페이지를 하나의 글 덩어리로 본다.
    await this.worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      user_defined_dpi: String(DEFAULT_DPI),
    });
    return this.worker;
  }

  /**
   * 방향 찾기를 처음 상태로 되돌린다. 방향은 **한 문서 안에서만** 같으므로,
   * 워커를 여러 문서에 걸쳐 쓸 때는 문서가 바뀔 때마다 불러야 한다.
   */
  reset(): void {
    this.hint = 0;
    this.settled = false;
    this.lastRotation = 0;
    this.lastMeanConfidence = 0;
  }

  /** 워커를 놓아 준다. 스레드와 받아 둔 모델이 함께 풀린다. */
  async destroy(): Promise<void> {
    await this.worker?.terminate();
    this.worker = null;
  }

  /**
   * 한 페이지를 읽는다.
   *
   * 방향은 한 문서 안에서 같다. 한 번 정해지면 그다음 페이지는 찾지 않는다 —
   * 열화가 심한 스캔본은 바로 놓여 있어도 평균 신뢰도가 문턱에 못 미쳐, 페이지마다
   * 네 방향을 다 돌면 비용이 네 배가 된다.
   */
  async read(page: PDFPageProxy): Promise<OcrWord[]> {
    await this.ready();

    let best = await this.attempt(page, this.hint);

    if (best.mean < ORIENTATION_THRESHOLD && !this.settled) {
      for (const rotation of ROTATIONS) {
        if (rotation === this.hint) continue;
        const other = await this.attempt(page, rotation);
        if (other.mean > best.mean) best = other;
        if (other.mean >= ORIENTATION_THRESHOLD) break;
      }
      this.settled = true;
    } else if (best.mean >= ORIENTATION_THRESHOLD) {
      this.settled = true;
    }

    this.lastMeanConfidence = best.mean;
    this.lastRotation = best.rotation;
    this.hint = best.rotation;
    return best.words;
  }

  // ------------------------------------------------------------------ 내부

  private async attempt(
    page: PDFPageProxy,
    rotation: number
  ): Promise<{ words: OcrWord[]; mean: number; rotation: number }> {
    const worker = await this.ready();
    this.options.onProgress?.(
      `${page.pageNumber}쪽을 읽는 중…${rotation ? ` (${rotation}° 돌려서)` : ''}`
    );

    // 화면이 쓰는 좌표계 — 뽑은 낱말의 자리는 결국 여기로 돌아와야 한다.
    const display = page.getViewport({ scale: 1 });
    const zoom = Math.min(DEFAULT_DPI / 72, TARGET_WIDTH_PX / Math.max(display.width, 1));
    // `rotation` 은 페이지가 이미 가진 회전에 **덧붙인다**.
    const shot = page.getViewport({ scale: zoom, rotation: (page.rotate + rotation) % 360 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(shot.width);
    canvas.height = Math.floor(shot.height);
    await page.render({ canvas, viewport: shot }).promise;

    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
    canvas.width = canvas.height = 0; // 캔버스 뒤의 그림 메모리를 바로 놓아 준다

    const words: OcrWord[] = [];
    let line = 0;
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const row of paragraph.lines ?? []) {
          let used = false;
          for (const word of row.words ?? []) {
            const text = word.text.trim();
            if (!text) continue;
            used = true;
            words.push({
              text,
              bbox: toDisplayBox(word.bbox, shot, display),
              line,
              confidence: word.confidence,
            });
          }
          if (used) line += 1;
        }
      }
    }
    return { words, mean: meanConfidence(words), rotation };
  }
}

/**
 * OCR 이 답한 픽셀 자리를 화면 좌표계로 되돌린다.
 *
 * 두 걸음이다 — 찍을 때 쓴 뷰포트로 **PDF 좌표**까지 되돌리고, 화면 뷰포트로 다시
 * 내린다. 이렇게 해야 페이지가 가진 회전과 우리가 덧붙인 회전이 한꺼번에 풀린다.
 * 이 변환을 밖으로 흘리면 근거 하이라이트가 페이지마다 어긋난다.
 */
function toDisplayBox(
  bbox: { x0: number; y0: number; x1: number; y1: number },
  shot: { convertToPdfPoint(x: number, y: number): number[] },
  display: { convertToViewportPoint(x: number, y: number): number[] }
): [number, number, number, number] {
  const corners = [
    [bbox.x0, bbox.y0],
    [bbox.x1, bbox.y1],
  ].map(([x, y]) => {
    const [px, py] = shot.convertToPdfPoint(x, y);
    return display.convertToViewportPoint(px, py);
  });

  const xs = corners.map(c => c[0]);
  const ys = corners.map(c => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function meanConfidence(words: OcrWord[]): number {
  if (words.length === 0) return 0;
  return words.reduce((sum, w) => sum + w.confidence, 0) / words.length;
}
