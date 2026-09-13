/**
 * 의사록 PDF 를 '글자 위치를 되찾을 수 있는 본문' 으로 바꾼다.
 * `scripts/minutes_text.py` 의 브라우저 판이다 — PyMuPDF 자리에 pdf.js 가 들어간다.
 *
 * 좌표계가 여기서 정해지고 이후 모든 근거가 거기 매달린다. 규칙은 값을 뽑을 때
 * `(start, end)` 문자 구간 하나로만 원문을 가리키고, 그 구간을 페이지·사각형으로
 * 되돌리는 일은 전부 이 파일이 한다 (`docs/minutes-plan.md` 1장).
 *
 * **본문 문자열을 낱말 목록에서 직접 쌓는다.** 페이지 텍스트를 따로 받아 오면
 * 공백 처리가 미세하게 달라 문자 오프셋과 bbox 가 한두 글자씩 어긋난다.
 */
// **legacy 빌드를 쓴다.** 최신 빌드는 `Map.prototype.getOrInsertComputed` 를 부르는데
// 이 메서드는 아직 어느 브라우저에도 없어서(Chrome 141 에도 없다) 페이지를 그리는
// 순간 터진다. legacy 빌드는 그 자리를 스스로 채워 넣는다.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  TextItem,
} from 'pdfjs-dist/types/src/display/api';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

import { Evidence, MinutesSource, PageKind } from './types';

// 워커를 번들에 포함시킨다. CDN 을 쓰지 않는 이유는 이 앱이 GitHub Pages 정적
// 호스팅이고, 무엇보다 **의사록 파일이 브라우저 밖으로 나가지 않아야** 하기
// 때문이다 (`docs/minutes-plan.md` 0장 벽 2).
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * CID 폰트 대응표와 기본 폰트가 놓인 자리. `vite.config.ts` 의 `pdfjsAssets` 가
 * 개발 서버와 배포본 양쪽에 같은 주소로 깔아 둔다.
 *
 * **한국어 의사록에는 이게 없으면 본문이 통째로 빈다.** 한글 PDF 는 거의 모두
 * CID 폰트를 쓰는데, 대응표가 없으면 pdf.js 는 오류 없이 글자 0개를 돌려준다 —
 * 스캔본과 구분이 안 되는 조용한 실패라 특히 나쁘다.
 */
const PDFJS_ASSETS = new URL('pdfjs/', document.baseURI).href;

/** 이 글자 수에 못 미치는 페이지는 이미지로 본다. 날인·서명 페이지가 여기 걸린다. */
const SCAN_PAGE_CHAR_THRESHOLD = 40;

/** 페이지 사이 구분자. 길이가 바뀌면 오프셋 계산도 같이 바뀐다. */
const PAGE_SEPARATOR = '\n\n';

/**
 * 낱말을 가르는 빈틈 — 글자 높이에 대한 비율이다.
 *
 * pdf.js 는 글자를 **낱자로** 준다 (`이` `사` `회`). 그대로 두면 낱말이 한 글자씩
 * 쪼개져 `2026` 이 `2 0 2 6` 이 되고 규칙이 전부 헛돈다. 그래서 가로 빈틈을 보고
 * 도로 붙인다 — 같은 낱말 안의 글자는 빈틈이 거의 0 이고, 띄어쓰기는 글자 폭의
 * 1/4 이상 벌어진다.
 */
const WORD_GAP_RATIO = 0.25;

/**
 * 기준선 아래로 더 잡아 주는 몫 — 글자 크기에 대한 비율이다.
 *
 * pdf.js 가 주는 자리는 기준선까지다. 그대로 칠하면 `ㅗ`·`ㅜ`·`g` 의 아랫부분이
 * 하이라이트 밖으로 삐져나온다. PyMuPDF 의 낱말 상자와 맞춰 둔 값이라 파이썬 판이
 * 내놓은 좌표와 같은 자리를 가리킨다.
 */
const DESCENT_RATIO = 0.2;

export interface Word {
  start: number; // 문서 전체 본문에서의 시작 오프셋
  end: number;
  bbox: [number, number, number, number]; // 배율 1 · 좌상단 원점
  page: number; // 0-based
  line: number;
}

export interface Page {
  index: number; // 0-based
  kind: PageKind;
  start: number; // 본문에서 이 페이지가 시작하는 오프셋
  end: number;
  width: number; // 배율 1 에서의 크기
  height: number;
}

/** 공백으로 자른 글자 조각 하나와 그 자리. */
interface Piece {
  text: string;
  left: number;
  right: number;
  baseline: number;
  /** 글자 크기. 줄바꿈·낱말 경계 판정의 자 노릇을 한다. */
  size: number;
}

const topOf = (p: { baseline: number; size: number }) => p.baseline - p.size;
const bottomOf = (p: { baseline: number; size: number }) => p.baseline + p.size * DESCENT_RATIO;

function isTextItem(item: unknown): item is TextItem {
  return typeof (item as TextItem)?.str === 'string';
}

const DECIMAL_DIGIT = /\p{Nd}/u;

/**
 * ASCII 가 아닌 십진 숫자를 `0`~`9` 로 옮긴다 (전각 `２`, 아라비아-인도 `٣` 등).
 *
 * 파이썬 판은 `unicodedata.digit` 으로 **모든** 십진 숫자를 옮긴다. 여기서도 같은
 * 범위를 덮어야, `\d` 가 유니코드인 파이썬 정규식과 ASCII 인 JS 정규식이 결국
 * 같은 글자를 보게 된다. 유니코드의 십진 숫자는 0~9 가 잇달아 놓이므로, 몇 칸
 * 내려가야 숫자가 아닌 글자가 나오는지가 곧 그 숫자의 값이다.
 */
function asciiDigit(ch: string): string | null {
  const code = ch.codePointAt(0)!;
  for (let value = 0; value < 10; value++) {
    if (!DECIMAL_DIGIT.test(String.fromCodePoint(code - value - 1))) return String(value);
  }
  return null;
}

/**
 * 길이를 보존하는 정규화만 한다 — 오프셋이 밀리면 근거 추적이 전부 무너진다.
 * 파이썬 판의 `_normalize_keeping_length` 와 같은 일을 한다.
 */
function normalizeKeepingLength(word: string): string {
  let out = '';
  for (const ch of word) {
    const code = ch.codePointAt(0)!;
    if (ch === ' ' || ch === ' ' || ch === ' ' || ch === ' '
        || ch === '​' || ch === '　' || ch === '\t') {
      out += ' ';
    } else if (code >= 0x80 && DECIMAL_DIGIT.test(ch)) {
      // 숫자를 전각 기호 변환보다 **먼저** 본다 (전각 숫자는 두 범위에 겹친다).
      out += asciiDigit(ch) ?? ch;
    } else if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCharCode(code - 0xfee0); // 전각 영문·기호
    } else {
      out += ch;
    }
  }
  return out;
}

/** 글자 덩어리 하나를 조각들로 자른다. 조각의 가로 자리는 글자 수에 비례해 나눈다. */
function piecesOf(item: TextItem, transform: number[]): Piece[] {
  const size = Math.hypot(transform[1], transform[3]);
  const baseline = transform[5];
  const left = transform[4];
  const perChar = item.str.length > 0 ? item.width / item.str.length : 0;

  const out: Piece[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(item.str)) !== null) {
    out.push({
      text: m[0],
      left: left + m.index * perChar,
      right: left + (m.index + m[0].length) * perChar,
      baseline,
      size,
    });
  }
  return out;
}

export class MinutesText {
  readonly pages: Page[] = [];
  readonly words: Word[] = [];
  text = '';

  private constructor(
    readonly fileName: string,
    readonly pdf: PDFDocumentProxy,
    private readonly task: PDFDocumentLoadingTask
  ) {}

  static async load(file: File): Promise<MinutesText> {
    // pdf.js 는 넘겨받은 버퍼를 워커로 넘기면서 비워 버린다. 사본을 준다.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const task = pdfjs.getDocument({
      data: bytes,
      cMapUrl: PDFJS_ASSETS + 'cmaps/',
      cMapPacked: true,
      standardFontDataUrl: PDFJS_ASSETS + 'standard_fonts/',
    });
    const pdf = await task.promise;
    const self = new MinutesText(file.name, pdf, task);
    await self.build();
    return self;
  }

  /** 워커와 내려받은 본문을 놓아 준다. 여러 건을 이어 볼 때 쌓이지 않게 한다. */
  destroy(): Promise<void> {
    return this.task.destroy();
  }

  private async build(): Promise<void> {
    const chunks: string[] = [];
    let cursor = 0;

    for (let pageNo = 0; pageNo < this.pdf.numPages; pageNo++) {
      if (chunks.length > 0) {
        chunks.push(PAGE_SEPARATOR);
        cursor += PAGE_SEPARATOR.length;
      }
      const pageStart = cursor;

      const page = await this.pdf.getPage(pageNo + 1);
      // 페이지 회전을 반영한 배율 1 좌표계. 화면은 여기에 배율만 곱해서 그린다.
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      const pieces: Piece[] = [];
      for (const item of content.items) {
        if (!isTextItem(item) || item.str.length === 0) continue;
        pieces.push(...piecesOf(item, pdfjs.Util.transform(viewport.transform, item.transform)));
      }

      const nativeChars = pieces.reduce((n, p) => n + p.text.length, 0);
      const kind: PageKind = nativeChars >= SCAN_PAGE_CHAR_THRESHOLD ? 'text' : 'scan';

      if (kind === 'text') {
        cursor = this.appendPage(pieces, chunks, cursor, pageNo);
      }
      // 스캔 페이지는 읽지 않는다. `SCAN_PAGE` 로 표시하고 넘어간다 (OCR 미이식).

      this.pages.push({
        index: pageNo,
        kind,
        start: pageStart,
        end: cursor,
        width: viewport.width,
        height: viewport.height,
      });
    }

    this.text = chunks.join('');
  }

  /** 한 페이지의 조각들을 읽는 차례대로 줄 세우고, 낱말로 도로 붙여 본문에 잇는다. */
  private appendPage(pieces: Piece[], chunks: string[], cursor: number, pageNo: number): number {
    // 위에서 아래로, 같은 줄 안에서는 왼쪽에서 오른쪽으로.
    const sorted = [...pieces].sort((a, b) =>
      Math.abs(a.baseline - b.baseline) > 1 ? a.baseline - b.baseline : a.left - b.left
    );

    let line = -1;
    let lineBaseline: number | null = null;
    let word: (Piece & { line: number; top: number; bottom: number }) | null = null;
    let first = true;

    const flush = () => {
      if (!word) return;
      const sep = first ? '' : this.words[this.words.length - 1].line === word.line ? ' ' : '\n';
      if (sep) {
        chunks.push(sep);
        cursor += sep.length;
      }
      first = false;

      const norm = normalizeKeepingLength(word.text);
      chunks.push(norm);
      this.words.push({
        start: cursor,
        end: cursor + norm.length,
        bbox: [word.left, word.top, word.right, word.bottom],
        page: pageNo,
        line: word.line,
      });
      cursor += norm.length;
      word = null;
    };

    for (const piece of sorted) {
      const size = Math.max(1, piece.size);
      // 기준선이 글자 크기의 절반 넘게 벌어지면 다음 줄로 본다.
      if (lineBaseline === null || Math.abs(piece.baseline - lineBaseline) > size * 0.6) {
        flush();
        line += 1;
        lineBaseline = piece.baseline;
      }

      if (word && word.line === line && piece.left - word.right <= size * WORD_GAP_RATIO) {
        // 같은 낱말이다 — 도로 붙인다.
        word.text += piece.text;
        word.right = Math.max(word.right, piece.right);
        word.top = Math.min(word.top, topOf(piece));
        word.bottom = Math.max(word.bottom, bottomOf(piece));
      } else {
        flush();
        word = { ...piece, line, top: topOf(piece), bottom: bottomOf(piece) };
      }
    }
    flush();
    return cursor;
  }

  // ---------------------------------------------------------------- 되찾기

  /** 문자 오프셋이 몇 쪽인지 (1-based). */
  pageOf(offset: number): number {
    for (const page of this.pages) {
      if (page.start <= offset && offset <= page.end) return page.index + 1;
    }
    return this.pages.length > 0 ? this.pages[this.pages.length - 1].index + 1 : 1;
  }

  wordsIn(start: number, end: number): Word[] {
    return this.words.filter(w => w.start < end && w.end > start);
  }

  /** 구간에 걸친 낱말들의 좌표를 줄 단위로 묶는다. 하이라이트 사각형이 된다. */
  bboxesFor(start: number, end: number): number[][] {
    const merged = new Map<string, number[]>();
    for (const w of this.wordsIn(start, end)) {
      const key = `${w.page}:${w.line}`;
      const box = merged.get(key);
      if (!box) {
        merged.set(key, [...w.bbox]);
      } else {
        box[0] = Math.min(box[0], w.bbox[0]);
        box[1] = Math.min(box[1], w.bbox[1]);
        box[2] = Math.max(box[2], w.bbox[2]);
        box[3] = Math.max(box[3], w.bbox[3]);
      }
    }
    return [...merged.values()].map(b => b.map(v => Math.round(v * 10) / 10));
  }

  /** 구간 하나를 근거로 만든다. 글자는 여기서 원문을 잘라 담는다. */
  evidence(start: number, end: number): Evidence {
    const lo = Math.max(0, start);
    const hi = Math.min(this.text.length, end);
    return {
      page: this.pageOf(lo),
      start: lo,
      end: hi,
      text: this.text.slice(lo, hi).trim(),
      bbox: this.bboxesFor(lo, hi),
      source: 'text',
    };
  }

  // ---------------------------------------------------------------- 요약 정보

  get scanPages(): number[] {
    return this.pages.filter(p => p.kind === 'scan').map(p => p.index + 1);
  }

  /** 읽지 못한 쪽번호. 브라우저 판은 OCR 이 없어 스캔 페이지가 그대로 여기 남는다. */
  get unreadPages(): number[] {
    return this.scanPages;
  }

  summary(): MinutesSource {
    return {
      fileName: this.fileName,
      pageCount: this.pages.length,
      pageKinds: this.pages.map(p => p.kind),
      charCount: this.text.length,
      scanPages: this.scanPages,
      unreadPages: this.unreadPages,
    };
  }
}
