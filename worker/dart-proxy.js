/**
 * OpenDART 중계 서버 (Cloudflare Worker).
 *
 * 브라우저는 OpenDART 를 직접 부를 수 없어서(CORS) 이 서버를 거친다. 하는 일은 키를
 * 붙여 DART 에 넘기고, 받은 응답을 손대지 않고 돌려주는 것뿐이다 — ZIP 풀기·화면 그리기는
 * 브라우저가 한다 (무료 요금제의 요청당 CPU 10ms 를 넘지 않으려고).
 *
 * 배포: Cloudflare 대시보드 → Workers & Pages → Create → Hello World 로 만든 뒤
 *       Edit code 에 이 파일을 붙여넣고 Deploy.
 *       Settings → Variables and Secrets 에 Secret `DART_KEY` (OpenDART 인증키) 추가.
 *
 * 시험: /hello                                → "hello" (회사 망에서 열리는지)
 *       /api/list.json?corp_code=00126380&bgn_de=20260101
 *                                             → status "000" 인 JSON (DART 가 받아 주는지)
 */

// 찾붙머신 배포 주소와 로컬 개발 서버만 받는다.
const ALLOWED_ORIGINS = ['https://jjazzking.github.io', 'http://localhost:3000'];

// 쓸 API 만 연다 — 키로 아무 API 나 부르지 못하게.
const ALLOWED_APIS = new Set(['corpCode.xml', 'company.json', 'list.json', 'document.xml']);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');

    // shortcut: Origin 이 없는 요청(주소창 직접 입력·curl)은 통과시킨다 — 회사 PC 에서 주소창으로
    // 시험하려고. 남이 키 한도를 쓰기 시작하면 여기서 막거나 비밀 토큰을 요구한다.
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response('forbidden', { status: 403 });
    }
    const cors = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};

    if (url.pathname === '/hello') return new Response('hello', { headers: cors });

    const api = url.pathname.replace(/^\/api\//, '');
    if (!url.pathname.startsWith('/api/') || !ALLOWED_APIS.has(api)) {
      return new Response('not found', { status: 404, headers: cors });
    }
    if (!env.DART_KEY) return new Response('DART_KEY 가 설정되지 않았습니다', { status: 500, headers: cors });

    const query = new URLSearchParams(url.search);
    query.set('crtfc_key', env.DART_KEY);

    let res;
    try {
      res = await fetch(`https://opendart.fss.or.kr/api/${api}?${query}`);
    } catch (e) {
      return new Response(`DART 접속 실패: ${e}`, { status: 502, headers: cors });
    }
    return new Response(res.body, {
      status: res.status,
      headers: { ...cors, 'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream' },
    });
  },
};
