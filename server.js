// 정적 빌드 결과(dist)를 서비스하는 최소 서버.
// Cloud Run / AI Studio 등 컨테이너 배포에서는 PORT 환경변수로 들어오는 포트를
// 0.0.0.0에 바인딩해야 하며, 그러지 않으면 컨테이너가 트래픽을 받지 못한다.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import express from 'express';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = Number(process.env.PORT) || 8080;

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error(
    `[server] ${distDir}/index.html 이 없습니다. 먼저 "npm run build"를 실행하세요.`,
  );
  process.exit(1);
}

const app = express();

app.use(
  express.static(distDir, {
    index: false,
    // 해시가 붙은 자산은 장기 캐시, index.html은 캐시하지 않는다.
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// SPA 폴백
app.use((_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[server] listening on http://0.0.0.0:${port}`);
});
