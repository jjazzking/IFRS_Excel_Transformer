import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

// 번들에 합치지 않고 **파일 그대로** 두는 곁자료들. 셋 다 필요할 때만 받아 가고,
// 받는 곳은 언제나 우리 origin 이다 — CDN 을 끼우지 않는다. 의사록을 연 페이지가
// 바깥으로 아무것도 부르지 않아야 하기 때문이다 (`docs/minutes-plan.md` 0장 벽 2).
//
//   pdfjs/cmaps          — CID 폰트의 글자 대응표. **한국어 PDF 는 이게 없으면
//                          본문이 통째로 빈다** (pdf.js 가 글자를 하나도 못 뽑는다).
//   pdfjs/standard_fonts — 문서에 폰트가 박혀 있지 않을 때 대신 그릴 기본 폰트.
//   tesseract/core       — OCR 엔진 (WebAssembly). 세 갈래를 두고 브라우저가
//                          지원하는 것 하나만 받아 간다.
//   tesseract/worker...  — OCR 을 별도 스레드에서 돌리는 스크립트.
//   tesseract/lang       — 한국어·영어 모델. 스캔 페이지를 처음 만났을 때만 받는다.

const PDFJS_ASSET_DIRS = ['cmaps', 'standard_fonts'];

/**
 * OCR 모델을 어느 것으로 낼지.
 *   fast — `4.0.0_best_int`, 1.5MB. 정수화한 모델이라 작고 빠르다.
 *   best — `4.0.0`, 6.9MB. 실수 모델이라 크고 느리지만 더 잘 읽는다.
 * 고른 근거는 `docs/minutes-ocr.md` 에 있다.
 */
const OCR_LANG_VARIANT: 'fast' | 'best' = 'fast';

const OCR_LANG_DIR = { fast: '4.0.0_best_int', best: '4.0.0' };

/**
 * 깔아 두는 모델. 기본으로 거는 것은 `kor` 하나다 (`src/lib/minutes/ocr.ts`) — 영문이
 * 한글을 훔치기 때문이다. `eng` 는 설정을 견줄 때만 쓰므로 **브라우저가 받지 않는다.**
 */
const OCR_LANGS = ['kor', 'eng'];

/** OCR 엔진은 LSTM 만 쓰므로 `-lstm` 갈래만 낸다. 한 브라우저는 그중 하나만 받는다. */
const OCR_CORE_FILES = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];

/** 내보낼 파일들 — `배포 경로 → 원본 경로`. 개발 서버와 배포본이 같은 표를 쓴다. */
function sideAssets(root: string): Map<string, string> {
  const at = (...parts: string[]) => path.resolve(root, 'node_modules', ...parts);
  const out = new Map<string, string>();

  for (const dir of PDFJS_ASSET_DIRS) {
    const from = at('pdfjs-dist', dir);
    for (const name of fs.readdirSync(from)) {
      out.set(`pdfjs/${dir}/${name}`, path.join(from, name));
    }
  }

  for (const name of OCR_CORE_FILES) {
    out.set(`tesseract/core/${name}`, at('tesseract.js-core', name));
  }
  out.set('tesseract/worker.min.js', at('tesseract.js', 'dist', 'worker.min.js'));

  // 고른 모델은 `lang/` 으로 낸다. 두 모델을 견줄 때는 개발 서버에서 아래
  // `lang-fast/`·`lang-best/` 를 직접 가리킨다 (배포본에는 안 들어간다).
  //
  // 한국어만으로는 금액·날짜·영문 약어에서 손해를 본다. 영어를 함께 건다
  // (`docs/minutes-ocr.md` 4-4).
  for (const lang of OCR_LANGS) {
    out.set(
      `tesseract/lang/${lang}.traineddata.gz`,
      at('@tesseract.js-data', lang, OCR_LANG_DIR[OCR_LANG_VARIANT], `${lang}.traineddata.gz`)
    );
  }

  return out;
}

function sideAssetsPlugin(): Plugin {
  const root = __dirname;

  return {
    name: 'side-assets',

    // 개발 서버에서도 배포본과 같은 주소로 집힌다.
    configureServer(server) {
      const table = sideAssets(root);
      // 모델 비교용 — 두 모델을 같은 서버에서 동시에 집을 수 있게 한다.
      for (const v of ['fast', 'best'] as const) {
        for (const lang of OCR_LANGS) {
          table.set(
            `tesseract/lang-${v}/${lang}.traineddata.gz`,
            path.resolve(root, 'node_modules/@tesseract.js-data', lang, OCR_LANG_DIR[v], `${lang}.traineddata.gz`)
          );
        }
      }
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0].replace(/^\//, '');
        const file = table.get(decodeURIComponent(url));
        if (!file || !fs.existsSync(file)) return next();
        res.setHeader('Content-Type', url.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },

    generateBundle() {
      for (const [fileName, from] of sideAssets(root)) {
        this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(from) });
      }
    },
  };
}

export default defineConfig(() => {
  return {
    // 상대 경로로 자산을 참조한다.
    // 절대 경로(/assets/...)로 빌드하면 하위 경로(예: https://host/IFRS_Excel_Transformer/)에
    // 배포했을 때 JS/CSS가 404가 나면서 흰 화면만 보인다.
    base: './',
    plugins: [react(), tailwindcss(), sideAssetsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
