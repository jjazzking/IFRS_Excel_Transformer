import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

// pdf.js 가 필요할 때만 받아 가는 곁자료.
//   cmaps          — CID 폰트의 글자 대응표. **한국어 PDF 는 이게 없으면 본문이
//                    통째로 빈다** (pdf.js 가 글자를 하나도 못 뽑는다).
//   standard_fonts — 문서에 폰트가 박혀 있지 않을 때 대신 그릴 기본 폰트.
// 번들에 합치지 않고 파일 그대로 둔다. 169개 중 문서가 쓰는 한둘만 받아 간다.
const PDFJS_ASSET_DIRS = ['cmaps', 'standard_fonts'];
const PDFJS_ASSET_PREFIX = '/pdfjs/';

function pdfjsAssets(): Plugin {
  const dirOf = (name: string) => path.resolve(__dirname, 'node_modules/pdfjs-dist', name);

  return {
    name: 'pdfjs-assets',

    // 개발 서버에서도 배포본과 같은 주소로 집힌다.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith(PDFJS_ASSET_PREFIX)) return next();
        const [dir, name] = url.slice(PDFJS_ASSET_PREFIX.length).split('/');
        if (!PDFJS_ASSET_DIRS.includes(dir) || !name) return next();
        const file = path.join(dirOf(dir), path.basename(decodeURIComponent(name)));
        if (!fs.existsSync(file)) return next();
        res.setHeader('Content-Type', 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },

    generateBundle() {
      for (const dir of PDFJS_ASSET_DIRS) {
        for (const name of fs.readdirSync(dirOf(dir))) {
          this.emitFile({
            type: 'asset',
            fileName: `pdfjs/${dir}/${name}`,
            source: fs.readFileSync(path.join(dirOf(dir), name)),
          });
        }
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
    plugins: [react(), tailwindcss(), pdfjsAssets()],
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
