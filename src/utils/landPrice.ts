/**
 * 주소 → 필지고유번호(PNU) → 개별공시지가.
 *
 * ① 행정안전부 도로명주소 검색 API 로 주소를 찾아 PNU 를 만들고,
 * ② V-World 개별공시지가속성조회(국가중점 API)로 그 해 공시지가를 받는다.
 * 서버 없이 브라우저에서 바로 부른다 — 주소 API 는 CORS 를 열어 두었고,
 * V-World 는 CORS 를 막아 JSONP 로만 된다 (public/landprice-probe.html 실험으로 확인).
 */
import { SheetTable } from '../types';
import { parsePastedRows } from './pasteRows';

// 두 키 모두 jjazzking.github.io 에 묶여 있어 다른 곳에서는 거절된다. 저장소에는 두지 않고,
// 배포 워크플로우가 GitHub Secrets(JUSO_KEY, VWORLD_KEY)에서 빌드에 넣는다.
// shortcut: 주소 키는 2026-10-19 발급 개발키라 90일 뒤(2027-01 중순) 만료, 운영키를 받으면 Secret 을 바꾼다.
const JUSO_KEY = import.meta.env?.VITE_JUSO_KEY ?? '';
const VWORLD_KEY = import.meta.env?.VITE_VWORLD_KEY ?? '';
export const LAND_PRICE_READY = Boolean(JUSO_KEY && VWORLD_KEY);

export type LandPriceStatus = 'ok' | 'ambiguous' | 'notFound' | 'noPrice' | 'error' | 'blank';

export interface LandPriceRow {
  input: string;
  status: LandPriceStatus;
  /** 찾은 지번주소 — 공시지가는 지번(필지) 단위로 매겨진다 */
  jibunAddr?: string;
  pnu?: string;
  /** 원/㎡ */
  price?: number;
  /** 'YYYY-MM-01' — 보통 1월 1일, 분할·합병 필지는 7월 1일 */
  baseDate?: string;
  announcedOn?: string;
  /** 주소 검색 결과 수. 2 이상이면 첫 번째를 썼다는 뜻 */
  candidates?: number;
  message?: string;
}

interface JusoItem {
  admCd: string;
  mtYn: string;
  lnbrMnnm: string;
  lnbrSlno: string;
  jibunAddr: string;
}

interface PriceField {
  pblntfPclnd: string;
  stdrYear: string;
  stdrMt: string;
  pblntfDe: string;
  lastUpdtDt: string;
}

const pad4 = (v: string | number) => String(v).padStart(4, '0');

/** PNU = 법정동코드 10 + 산 여부(1 일반, 2 산) + 본번 4 + 부번 4 */
export const toPnu = (j: Pick<JusoItem, 'admCd' | 'mtYn' | 'lnbrMnnm' | 'lnbrSlno'>) =>
  j.admCd + (j.mtYn === '1' ? '2' : '1') + pad4(j.lnbrMnnm) + pad4(j.lnbrSlno);

/**
 * 조서에서 긁어온 주소를 검색어로 다듬는다. 쉼표 뒤(동·호수·층)와 괄호(참고항목)는
 * 검색을 망치고, `%=<>[]` 는 주소 API 가 거절한다.
 */
export function cleanAddress(raw: string): string {
  return raw
    .split(',')[0]
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[%=<>[\]"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 엑셀에서 복사한 범위를 행마다 주소 하나로 바꾼다. 여러 열을 함께 복사했으면(번호·주소·면적 등)
 * 행마다 주소처럼 생긴 칸을 고른다. 칸 나누기·빈 행 규칙은 `parsePastedRows` 를 따른다.
 */
export function parsePastedAddresses(text: string): string[] {
  return parsePastedRows(text).map(pickAddressCell);
}

/** '세종대로 110', '태평로1가 31', '삼평동 산 5' 처럼 도로명·동리 뒤에 번지가 오는 칸 */
const ADDRESS_LIKE = /[가-힣](로|길|동|리|가)\s*(산\s*)?\d/;

function pickAddressCell(cells: string[]): string {
  return cells.find(v => ADDRESS_LIKE.test(v)) ?? cells.reduce((a, b) => (b.length > a.length ? b : a), '');
}

/** 같은 해 값이 여러 줄 오면(갱신일만 다름, 또는 1월·7월 기준) 가장 늦은 기준월·갱신일을 쓴다 */
export function pickPrice(fields: PriceField[], year: string): PriceField | undefined {
  return fields
    .filter(f => f.stdrYear === year)
    .sort((a, b) => (b.stdrMt + b.lastUpdtDt).localeCompare(a.stdrMt + a.lastUpdtDt))[0];
}

async function searchAddress(keyword: string): Promise<{ items: JusoItem[]; total: number }> {
  const q = new URLSearchParams({
    confmKey: JUSO_KEY,
    currentPage: '1',
    countPerPage: '5',
    keyword,
    resultType: 'json',
  });
  const res = await fetch('https://business.juso.go.kr/addrlink/addrLinkApi.do?' + q);
  const { results } = await res.json();
  if (results.common.errorCode !== '0') throw new Error(results.common.errorMessage);
  return { items: results.juso ?? [], total: Number(results.common.totalCount) };
}

/** V-World 는 CORS 를 막아 두어 <script> 로 부르고 callback 으로 받는다 */
function jsonp<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = 'lp' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const timer = window.setTimeout(() => done(() => reject(new Error('응답 없음 (10초)'))), 10000);
    const w = window as unknown as Record<string, unknown>;
    function done(fn: () => void) {
      window.clearTimeout(timer);
      delete w[name];
      script.remove();
      fn();
    }
    w[name] = (data: T) => done(() => resolve(data));
    script.onerror = () => done(() => reject(new Error('V-World 호출 실패')));
    script.src = `${url}&callback=${name}`;
    document.body.append(script);
  });
}

async function fetchPrices(pnu: string, year: string): Promise<PriceField[]> {
  const q = new URLSearchParams({
    key: VWORLD_KEY,
    domain: location.hostname,
    pnu,
    stdrYear: year,
    format: 'json',
    numOfRows: '20',
    pageNo: '1',
  });
  const data = await jsonp<{ indvdLandPrices?: { field?: PriceField[] } }>(
    'https://api.vworld.kr/ned/data/getIndvdLandPriceAttr?' + q
  );
  return data.indvdLandPrices?.field ?? [];
}

export async function lookupLandPrice(input: string, year: string): Promise<LandPriceRow> {
  const keyword = cleanAddress(input);
  if (!keyword) return { input, status: 'blank' };
  try {
    const { items, total } = await searchAddress(keyword);
    if (items.length === 0) return { input, status: 'notFound', message: '주소를 찾지 못함' };
    const juso = items[0];
    const pnu = toPnu(juso);
    const base = { input, jibunAddr: juso.jibunAddr, pnu, candidates: total };
    const hit = pickPrice(await fetchPrices(pnu, year), year);
    if (!hit) return { ...base, status: 'noPrice', message: `${year}년 공시지가 없음` };
    return {
      ...base,
      status: total > 1 ? 'ambiguous' : 'ok',
      price: Number(hit.pblntfPclnd),
      baseDate: `${hit.stdrYear}-${hit.stdrMt}-01`,
      announcedOn: hit.pblntfDe,
      message: total > 1 ? `주소 후보 ${total}건 중 첫 번째 — 확인 필요` : undefined,
    };
  } catch (e) {
    return { input, status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/** 붙여넣은 순서를 지킨 채, 몇 건씩 나눠 부른다 — 한꺼번에 수백 건을 쏘지 않게 */
export async function lookupAll(
  inputs: string[],
  year: string,
  onProgress: (rows: (LandPriceRow | null)[]) => void
): Promise<LandPriceRow[]> {
  const rows: (LandPriceRow | null)[] = inputs.map(() => null);
  for (let i = 0; i < inputs.length; i += 5) {
    const chunk = await Promise.all(inputs.slice(i, i + 5).map(a => lookupLandPrice(a, year)));
    chunk.forEach((r, k) => (rows[i + k] = r));
    onProgress([...rows]);
  }
  return rows as LandPriceRow[];
}

/** 공시는 보통 4월 말~5월 말. 6월 전이면 올해 값이 아직 없을 수 있어 지난해를 기본으로 한다 */
export function defaultYear(today = new Date()): string {
  return String(today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1);
}

export function buildLandPriceTable(rows: LandPriceRow[], year: string): SheetTable {
  return {
    columns: [
      { key: 'input', label: '주소', width: 40 },
      { key: 'jibun', label: '지번주소', width: 40 },
      { key: 'pnu', label: 'PNU', width: 21 },
      { key: 'price', label: '개별공시지가(원/㎡)', numeric: true, digits: 0, width: 18 },
      { key: 'base', label: '가격기준일', width: 12 },
      { key: 'announced', label: '공시일', width: 12 },
      { key: 'note', label: '비고', width: 30 },
    ],
    rows: rows.map(r => ({
      cells: [
        r.input,
        r.jibunAddr ?? '',
        r.pnu ?? '',
        r.price ?? null,
        r.baseDate ?? '',
        r.announcedOn ?? '',
        r.message ?? '',
      ],
      shades: r.status === 'ok' || r.status === 'blank' ? undefined : [null, null, null, 'soft', null, null, 'soft'],
    })),
    footnote: `출처: 국토교통부 개별공시지가 (V-World) · ${year}년 기준 · 주소 변환: 행정안전부 도로명주소`,
  };
}
