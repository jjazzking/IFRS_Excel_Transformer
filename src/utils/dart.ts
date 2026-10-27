/**
 * 주석 찾기 — OpenDART 공시 원문을 받아 DART 뷰어처럼 목차·본문으로 보여준다.
 *
 * 브라우저는 OpenDART 를 직접 부를 수 없어(CORS) `worker/dart-proxy.js` 중계 서버를 거친다.
 * 중계 서버는 키만 붙여 넘기고, ZIP 풀기·XML 읽기·화면 그리기는 모두 여기서 한다.
 */
import * as XLSX from 'xlsx';

// 중계 서버 주소. 배포된 사이트의 JS 에 그대로 보이므로 비밀이 아니다 — 키는 중계 서버에만 있다.
const PROXY = 'https://dart-proxy.neojw990223.workers.dev';

export interface Corp {
  code: string;
  name: string;
  /** 상장사면 종목코드, 아니면 빈 문자열 */
  stock: string;
}

export interface Report {
  rcept_no: string;
  report_nm: string;
  rcept_dt: string;
  flr_nm: string;
}

/** 목차의 한 줄. 장·절이면 요소 하나, 주석 번호로 나눈 것이면 형제 요소 여러 개를 가리킨다. */
export interface TocNode {
  id: string;
  title: string;
  els: Element[];
  children: TocNode[];
  /** DART 사이트에서 읽는 첨부의 목차면 본문 조각(viewer.do) 주소 — 처음 누를 때 받아 `els` 를 채운다. */
  src?: string;
}

/** 문서 하나 — 원문 ZIP 안의 XML(본문·첨부), 또는 DART 사이트에서 읽는 첨부. */
export interface DartFile {
  name: string;
  title: string;
  toc: TocNode[];
  /** DART 사이트에서 읽는 첨부면 그 문서 번호 — 처음 고를 때 목차를 받는다. */
  web?: { rcpNo: string; dcmNo: string };
}

async function getBytes(api: string, params: Record<string, string>): Promise<Uint8Array> {
  const res = await fetch(`${PROXY}/api/${api}?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(`중계 서버 오류 (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** ZIP 이면 안의 파일들을, 아니면 DART 가 돌려준 오류 문구를 던진다. */
function unzip(bytes: Uint8Array): { name: string; bytes: Uint8Array }[] {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    const text = new TextDecoder().decode(bytes);
    const msg = text.match(/<message>([^<]*)/)?.[1] ?? text.match(/"message"\s*:\s*"([^"]*)/)?.[1] ?? text.slice(0, 200);
    throw new Error(`DART: ${msg}`);
  }
  const cfb = XLSX.CFB.read(bytes, { type: 'array' });
  return cfb.FileIndex.flatMap((f: { type: number; name: string; content?: Uint8Array }) =>
    f.type === 2 && f.content && /\.xml$/i.test(f.name) ? [{ name: f.name, bytes: f.content }] : []
  );
}

/**
 * UTF-8 로 읽어 보고, 깨지면 EUC-KR(CP949) 로 읽는다. 옛 공시(2022년 초 이전)는 EUC-KR 인데
 * XML 선언의 encoding 이 실제와 다른 경우가 있어 선언은 믿지 않는다.
 */
export function decodeXml(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('euc-kr').decode(bytes);
  }
}

const unescape = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

// DART 가 회사 목록·원문을 만들어 보내는 데 수 초씩 걸려서, 한 번 받은 것은 브라우저 캐시에 둔다.
const CACHE = 'dart-v1';

async function cacheGet(key: string, maxDays: number): Promise<Response | undefined> {
  try {
    const hit = await (await caches.open(CACHE)).match(`/${key}`);
    if (hit && Date.now() - Number(hit.headers.get('x-saved')) < maxDays * 864e5) return hit;
  } catch {
    // 캐시를 못 쓰는 브라우저(사생활 보호 창 등)면 매번 받는다.
  }
}

async function cachePut(key: string, body: Blob): Promise<void> {
  try {
    await (await caches.open(CACHE)).put(`/${key}`, new Response(body, { headers: { 'x-saved': String(Date.now()) } }));
  } catch {
    // 위와 같다 — 담지 못해도 화면은 그대로 쓴다.
  }
}

let corpsPromise: Promise<Corp[]> | null = null;

/** 전체 회사 목록 (상장·비상장 약 10만 곳). 새로 생긴 회사가 보이도록 7일마다 다시 받는다. */
export function loadCorps(): Promise<Corp[]> {
  corpsPromise ??= (async () => {
    const hit = await cacheGet('corps', 7);
    if (hit) return (await hit.json()) as Corp[];
    const xml = decodeXml(unzip(await getBytes('corpCode.xml', {}))[0].bytes);
    const corps = xml.split('<list>').slice(1).map(chunk => ({
      code: chunk.match(/<corp_code>([^<]*)/)?.[1] ?? '',
      name: unescape(chunk.match(/<corp_name>([^<]*)/)?.[1] ?? '').trim(),
      stock: (chunk.match(/<stock_code>([^<]*)/)?.[1] ?? '').trim(),
    }));
    await cachePut('corps', new Blob([JSON.stringify(corps)]));
    return corps;
  })().catch(e => {
      corpsPromise = null; // 실패는 기억하지 않는다 — 다음에 다시 시도
      throw e;
    });
  return corpsPromise;
}

/** 이름이 같은 회사 → 이름이 그 말로 시작하는 회사 → 상장사 → 이름이 짧은 순. */
export function searchCorps(corps: Corp[], query: string, limit = 50): Corp[] {
  const q = query.replace(/\s+/g, '').toLowerCase();
  if (!q) return [];
  const norm = (s: string) => s.replace(/\s+/g, '').replace(/\(주\)|주식회사/g, '').toLowerCase();
  const rank = (c: Corp) => {
    const n = norm(c.name);
    return (n === q ? 0 : n.startsWith(q) ? 1 : 2) * 2 + (c.stock ? 0 : 1);
  };
  return corps
    .filter(c => norm(c.name).includes(q) || c.stock === q)
    .sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length)
    .slice(0, limit);
}

/** 정기공시(사업·반기·분기보고서)와 외부감사 관련 공시(감사보고서), 최근 것부터 100건씩. */
export async function loadReports(corpCode: string): Promise<Report[]> {
  const lists = await Promise.all(
    ['A', 'F'].map(async ty => {
      const res = await fetch(
        `${PROXY}/api/list.json?${new URLSearchParams({
          corp_code: corpCode,
          bgn_de: '19990101',
          pblntf_ty: ty,
          page_count: '100',
        })}`
      );
      if (!res.ok) throw new Error(`중계 서버 오류 (${res.status})`);
      const json = await res.json();
      if (json.status === '013') return []; // 조회된 데이터가 없음
      if (json.status !== '000') throw new Error(`DART: ${json.message}`);
      return json.list as Report[];
    })
  );
  return lists.flat().sort((a, b) => b.rcept_no.localeCompare(a.rcept_no));
}

/** 공시 원문 ZIP 을 받아 본문과 첨부를 각각 목차로 읽는다. 본문이 맨 앞. */
export async function loadDocument(rceptNo: string): Promise<DartFile[]> {
  // 한 번 낸 공시 원문은 바뀌지 않으므로(정정은 새 접수번호) 기한 없이 둔다.
  const key = `doc-${rceptNo}`;
  const hit = await cacheGet(key, Infinity);
  const bytes = hit ? new Uint8Array(await hit.arrayBuffer()) : await getBytes('document.xml', { rcept_no: rceptNo });
  const files = unzip(bytes); // DART 오류 응답이면 여기서 던져 캐시에 담기지 않는다
  if (!hit) await cachePut(key, new Blob([bytes]));
  return files
    .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))
    .map(f => parseDartXml(f.name, decodeXml(f.bytes)));
}

/**
 * DART XML 은 `&` 를 그대로 두는 등 XML 로는 자주 깨져서, 관대한 HTML 파서로 읽는다.
 * 그 전에 HTML 파서가 다르게 다루는 태그만 이름을 바꿔 둔다.
 */
export function parseDartXml(name: string, xml: string): DartFile {
  const prepared = xml
    .replace(/<\?xml[^>]*>/, '')
    .replace(/&cr;/g, '<br>')
    // 표 안에서 모르는 태그는 표 밖으로 쫓겨나므로 칸 태그는 TD 로 맞춘다.
    .replace(/<(\/?)(TE|TU)\b/gi, '<$1TD')
    // TITLE 은 안의 태그를 글자로 읽고, IMG·IMAGE 는 빈 태그로 다룬다.
    .replace(/<(\/?)(TITLE|IMG|IMAGE)\b/gi, '<$1D$2')
    .replace(/<PGBRK[^>]*>/gi, '')
    // HTML 에서는 `<X/>` 가 닫히지 않는다.
    .replace(/<([A-Za-z][\w-]*)([^<>]*?)\/>/g, '<$1$2></$1>');
  const doc = new DOMParser().parseFromString(prepared, 'text/html');

  let seq = 0;
  const section = (el: Element): TocNode => {
    const title = el.querySelector(':scope > DTITLE')?.textContent?.trim() || '(제목 없음)';
    const subs = [...el.children].filter(c => /^SECTION-\d$/i.test(c.tagName));
    return {
      id: `${name}#${seq++}`,
      title,
      els: [el],
      children: subs.length > 0 ? subs.map(section) : /주석/.test(title) ? splitNotes(el, `${name}#${seq++}`) : [],
    };
  };

  const cover = doc.getElementsByTagName('COVER')[0];
  const toc = [...doc.getElementsByTagName('SECTION-1')].map(section);
  if (cover) toc.unshift({ id: `${name}#cover`, title: '표지', els: [cover], children: [] });

  return {
    name,
    title: doc.getElementsByTagName('DOCUMENT-NAME')[0]?.textContent?.trim() || name,
    toc,
  };
}

/**
 * 주석 절은 대개 절 하나에 주석 전부가 문단으로 들어 있다. "1. 일반사항" 처럼 번호가
 * 1, 2, 3… 차례로 이어지는 문단을 주석 머리로 보고 그 사이를 주석 하나로 묶는다.
 * shortcut: 번호가 건너뛰거나 표 안에 머리를 둔 보고서는 나뉘지 않는다 — 그런 회사가 나오면 규칙을 늘린다.
 */
function splitNotes(el: Element, idPrefix: string): TocNode[] {
  // DART 사이트 본문 조각은 문단들을 감싸개 하나로 싼다 — 문단이 보일 때까지 들어간다.
  while (el.children.length === 1 && !/^(P|TABLE)$/.test(el.children[0].tagName)) el = el.children[0];
  const notes: TocNode[] = [];
  let next = 1;
  for (const child of el.children) {
    if (child.tagName === 'DTITLE') continue;
    const m = child.tagName === 'P' && firstLine(child).match(/^(\d{1,3})\s*\.\s*(\S.*)$/);
    const n = m ? Number(m[1]) : 0;
    // 번호를 건너뛰는 회사가 있다 (진로발효 반기: 3 → 5). 굵은 제목이면 몇 번 건너뛰어도 받는다 —
    // 본문 속 "4. …" 같은 목록을 주석 머리로 잘못 잡지 않게, 차례가 아니면 굵은 글씨만.
    if (m && (n === next || (n > next && n <= next + 3 && isBold(child)))) {
      next = n + 1;
      notes.push({ id: `${idPrefix}.${n}`, title: `${n}. ${m[2]}`.slice(0, 60), els: [], children: [] });
    }
    notes.at(-1)?.els.push(child);
  }
  return notes.length > 1 ? notes : [];
}

/** 첫 줄바꿈 전까지의 글자. 주석 머리와 본문이 한 문단에 `<BR>` 로만 나뉜 회사가 있다. */
function firstLine(el: Element): string {
  let text = '';
  const walk = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) text += n.textContent;
    else if ((n as Element).tagName === 'BR' && text.trim()) break;
  }
  return text.replace(/\s+/g, ' ').trim();
}

const isBold = (el: Element) =>
  [el, el.querySelector(':scope > span')].some(e => /bold/i.test(e?.getAttribute('style') ?? '')) ||
  el.querySelector(':scope > b') !== null;

async function getPage(page: 'main.do' | 'viewer.do', params: string): Promise<string> {
  const res = await fetch(`${PROXY}/web/${page}?${params}`);
  if (!res.ok) throw new Error(`DART 화면을 받지 못했습니다 (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.text();
}

/**
 * DART 보고서 화면의 '첨부' 선택 상자. 분·반기 검토보고서처럼 원문 ZIP 에 빠지는 첨부도 여기에는 있다.
 * 표지 날짜("2026.08.14")는 떼고 이름만 남긴다.
 */
export async function loadWebAttachments(rceptNo: string): Promise<DartFile[]> {
  const html = await getPage('main.do', `rcpNo=${rceptNo}`);
  const select = html.match(/<select id="att"[\s\S]*?<\/select>/)?.[0] ?? '';
  return [...select.matchAll(/<option value="rcpNo=(\d+)&(?:amp;)?dcmNo=(\d+)"[^>]*>([\s\S]*?)<\/option>/g)].map(m => ({
    name: `web-${m[2]}`,
    title: m[3].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/^\s*\d{4}\.\d{2}\.\d{2}\s*/, '').trim(),
    toc: [],
    web: { rcpNo: m[1], dcmNo: m[2] },
  }));
}

/**
 * 첨부 화면의 목차. DART 는 목차를 `var node1 = {}; node1['text'] = "…";` 같은 스크립트로 싣는다.
 * 숫자가 깊이다 (node1 = 맨 위, node2 = 그 아래).
 */
export function parseWebToc(html: string, dcmNo: string): TocNode[] {
  const start = html.indexOf('function makeToc');
  const script = html.slice(start, html.indexOf('.jstree(', start));
  const roots: TocNode[] = [];
  const last: (TocNode & { props: Record<string, string> })[] = [];
  for (const m of script.matchAll(/var node(\d+) = \{\};|node(\d+)\['(\w+)'\] *= *"((?:[^"\\]|\\.)*)"/g)) {
    if (m[1]) {
      const depth = Number(m[1]);
      const node = { id: '', title: '', els: [], children: [], props: {} };
      (depth === 1 ? roots : (last[depth - 2]?.children ?? roots)).push(node);
      last[depth - 1] = node;
    } else {
      const node = last[Number(m[2]) - 1];
      if (node) node.props[m[3]] = m[4].replace(/\\(.)/g, '$1');
    }
  }
  const finish = (n: TocNode & { props?: Record<string, string> }): TocNode => {
    const p = n.props ?? {};
    return {
      id: `web-${dcmNo}#${p.id}`,
      title: (p.text ?? '').replace(/\s+/g, ' ').trim() || '(제목 없음)',
      els: [],
      children: n.children.map(finish),
      src: new URLSearchParams({
        rcpNo: p.rcpNo ?? '',
        dcmNo: p.dcmNo ?? dcmNo,
        eleId: p.eleId ?? '',
        offset: p.offset ?? '',
        length: p.length ?? '',
        dtd: p.dtd ?? 'dart4.xsd',
      }).toString(),
    };
  };
  return roots.map(finish);
}

export async function loadWebToc(file: DartFile): Promise<TocNode[]> {
  const { rcpNo, dcmNo } = file.web!;
  return parseWebToc(await getPage('main.do', `rcpNo=${rcpNo}&dcmNo=${dcmNo}`), dcmNo);
}

/** 첨부 목차 한 줄의 본문 조각을 받아 `els` 를 채운다. 주석이면 번호별로 나눠 아래에 단다. */
export async function loadWebSection(node: TocNode): Promise<void> {
  const doc = new DOMParser().parseFromString(await getPage('viewer.do', node.src!), 'text/html');
  node.els = [doc.body];
  if (node.children.length === 0 && /주석/.test(node.title)) node.children = splitNotes(doc.body, node.id);
}

// 엑셀에 붙여넣어도 테두리·정렬이 남도록 모양은 모두 인라인 스타일로 단다.
const CELL_STYLE = 'border:.5pt solid #999;padding:2px 6px;vertical-align:middle;';

/**
 * DART 요소를 화면용 HTML 로 옮긴다. 아는 태그와 속성만 새로 만들어 담으므로
 * 원문에 무엇이 들어 있든 스크립트나 링크가 딸려 오지 않는다.
 */
export function renderDart(els: Element[]): DocumentFragment {
  const out = document.createDocumentFragment();
  for (const el of els) out.append(...convert(el));
  return out;
}

function convert(node: Node): Node[] {
  if (node.nodeType === Node.TEXT_NODE) return [document.createTextNode(node.textContent ?? '')];
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as Element;
  const tag = el.tagName.toUpperCase();
  const kids = () => [...el.childNodes].flatMap(convert);
  const make = (t: string, style = '') => {
    const e = document.createElement(t);
    if (style) e.setAttribute('style', style);
    e.append(...kids());
    return e;
  };
  const align = (el.getAttribute('align') ?? '').toLowerCase();
  const alignStyle = /^(left|right|center|justify)$/.test(align) ? `text-align:${align};` : '';

  switch (tag) {
    case 'DTITLE': {
      const level = Number(el.parentElement?.tagName.match(/^SECTION-(\d)$/i)?.[1] ?? 0);
      return [make(level ? `h${Math.min(level + 1, 6)}` : 'p', level ? '' : 'font-weight:bold;')];
    }
    case 'P':
      return [make('p', alignStyle)];
    case 'BR':
      return [document.createElement('br')];
    case 'TABLE': {
      const t = make('table', 'border-collapse:collapse;margin:6px 0;');
      if (el.getAttribute('border') === '0') t.querySelectorAll('td,th').forEach(c => ((c as HTMLElement).style.border = 'none'));
      return [t];
    }
    case 'THEAD':
    case 'TBODY':
    case 'TR':
    case 'COLGROUP':
      return [make(tag.toLowerCase())];
    case 'COL': {
      const c = document.createElement('col');
      const w = el.getAttribute('width');
      if (w && /^\d+$/.test(w)) c.setAttribute('width', w);
      return [c];
    }
    case 'TD':
    case 'TH': {
      const c = make(tag.toLowerCase(), CELL_STYLE + alignStyle + (tag === 'TH' ? 'background:#f1f5f9;font-weight:bold;' : ''));
      for (const a of ['rowspan', 'colspan']) {
        const v = el.getAttribute(a);
        if (v && /^\d+$/.test(v)) c.setAttribute(a, v);
      }
      return [c];
    }
    case 'SCRIPT':
    case 'STYLE':
    case 'HEAD':
    case 'TITLE':
    case 'NOSCRIPT':
      return [];
    case 'DIMAGE':
    case 'DIMG':
    case 'IMG':
      return [Object.assign(document.createElement('span'), { textContent: '[이미지]', style: 'color:#94a3b8' })];
    default:
      // 장·절·표 묶음 같은 감싸개는 안의 내용만 꺼낸다. 덩어리 태그면 줄을 나눠 준다.
      return /^(SECTION-\d|TABLE-GROUP|LIBRARY|COVER|BODY|DOCUMENT|DIV)$/.test(tag) ? [make('div')] : kids();
  }
}
