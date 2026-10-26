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
 * 시험: /hello → "hello". /api/... 는 찾붙머신 화면에서 부를 때만 열린다 (주소창에서는 forbidden).
 */

// 찾붙머신 배포 주소와 로컬 개발 서버만 받는다.
const ALLOWED_ORIGINS = ['https://jjazzking.github.io', 'http://localhost:3000'];

// 쓸 API 만 연다 — 키로 아무 API 나 부르지 못하게.
const ALLOWED_APIS = new Set(['corpCode.xml', 'company.json', 'list.json', 'document.xml']);

// OpenDART 원문 ZIP 에 빠지는 첨부(분·반기 검토보고서, 정정 공시의 첨부)는 DART 사이트 화면에서 읽는다.
// 키가 필요 없는 공개 화면이고, 보고서 화면(목차·첨부 목록)과 본문 조각 두 곳만 연다.
const WEB_PAGES = {
  'main.do': 'https://dart.fss.or.kr/dsaf001/main.do',
  'viewer.do': 'https://dart.fss.or.kr/report/viewer.do',
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');

    if (url.pathname === '/hello') return new Response('hello');

    // 주소가 사이트 JS 에 드러나므로 찾붙머신 화면에서 온 요청만 받는다.
    // shortcut: Origin 은 curl 로 꾸밀 수 있다 — 남이 키 한도를 쓰기 시작하면 비밀 토큰을 요구한다.
    if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
      return new Response('forbidden', { status: 403 });
    }
    const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };

    const query = new URLSearchParams(url.search);
    let target;
    const [, kind, name] = url.pathname.match(/^\/(api|web)\/([\w.]+)$/) ?? [];
    if (kind === 'api' && ALLOWED_APIS.has(name)) {
      if (!env.DART_KEY) return new Response('DART_KEY 가 설정되지 않았습니다', { status: 500, headers: cors });
      query.set('crtfc_key', env.DART_KEY);
      target = `https://opendart.fss.or.kr/api/${name}?${query}`;
    } else if (kind === 'web' && Object.hasOwn(WEB_PAGES, name)) {
      target = `${WEB_PAGES[name]}?${query}`;
    } else {
      return new Response('not found', { status: 404, headers: cors });
    }

    let res;
    try {
      // Worker 의 fetch 는 User-Agent 를 안 붙이는데, DART 는 그런 요청을 error1.html 로 돌려보낸다.
      // 리다이렉트는 따라가지 않는다 — error1.html 이 자기 자신으로 끝없이 돌려보낸다.
      res = await fetch(target, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        redirect: 'manual',
      });
    } catch (e) {
      // 오류 문구에 요청 주소(=키)가 들어 있으므로 그대로 내보내지 않는다.
      return new Response(`DART 접속 실패: ${e.name}`, { status: 502, headers: cors });
    }
    if (res.status >= 300 && res.status < 400) {
      const to = (res.headers.get('Location') ?? '').replace(/crtfc_key=[^&]*/, 'crtfc_key=***');
      return new Response(`DART 가 요청을 돌려보냄 (${res.status} → ${to})`, { status: 502, headers: cors });
    }
    return new Response(res.body, {
      status: res.status,
      headers: { ...cors, 'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream' },
    });
  },
};
