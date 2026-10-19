/**
 * 국내 상장주식 일별 시세 — 금융위원회 주식시세정보 V2 (공공데이터포털). docs/stocks-plan.md
 *
 * 브라우저에서 바로 부른다. 값은 그날 거래소에 찍힌 실제 가격이고 수정주가가 아니다.
 */
import { parsePastedRows } from './pasteRows';

// 저장소에 두지 않고 배포 워크플로우가 Secrets(STOCK_KEY)에서 빌드에 넣는다.
const STOCK_KEY = import.meta.env?.VITE_STOCK_KEY ?? '';
export const STOCK_READY = Boolean(STOCK_KEY);

const ENDPOINT = 'https://apis.data.go.kr/1160100/GetStockSecuritiesInfoService_V2/getStockPriceInfo_V2';

export interface Quote {
  /** 'YYYY-MM-DD' */
  date: string;
  close: number;
  high: number;
  low: number;
  /** 거래량 (주) */
  volume: number;
  /** 거래대금 (원) */
  value: number;
  /** 상장주식수 */
  shares: number;
  /** 시가총액 (원) */
  marketCap: number;
}

interface Item {
  basDt: string;
  srtnCd: string;
  itmsNm: string;
  mrktCtg: string;
  clpr: string;
  hipr: string;
  lopr: string;
  trqu: string;
  trPrc: string;
  lstgStCnt: string;
  mrktTotAmt: string;
}

const compact = (iso: string) => iso.replace(/-/g, '');
const toIso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

export function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 6자리 종목코드(영문 섞인 신형 코드 포함)면 코드로, 아니면 종목명으로 찾는다 */
const isCode = (s: string) => /^[0-9A-Z]{6}$/i.test(s);

async function fetchItems(filter: Record<string, string>, from: string, to: string): Promise<Item[]> {
  const items: Item[] = [];
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({
      serviceKey: STOCK_KEY,
      resultType: 'json',
      numOfRows: '1000',
      pageNo: String(page),
      beginBasDt: compact(from),
      // endBasDt 는 '미만' 이라 하루 뒤로 잡는다
      endBasDt: compact(shiftDays(to, 1)),
      ...filter,
    });
    const res = await fetch(`${ENDPOINT}?${q}`);
    const text = await res.text();
    // 키 오류 등은 XML 로, 또는 JSON 이라도 response 대신 OpenAPI_ServiceResponse 로 온다
    if (!text.trim().startsWith('{')) throw new Error(text.match(/<returnAuthMsg>([^<]*)/)?.[1] ?? `조회 실패 (${res.status})`);
    const json = JSON.parse(text);
    const fault = json.OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (fault) throw new Error(fault.returnAuthMsg || fault.errMsg);
    const body = json.response?.body;
    const got: Item[] = [body?.items?.item ?? []].flat();
    items.push(...got);
    if (got.length === 0 || items.length >= Number(body?.totalCount ?? 0)) return items;
  }
}

// ---------------------------------------------------------------------------
// 종목 확인 — 조서의 회사 이름을 종목코드로
// ---------------------------------------------------------------------------

export type ResolveStatus = 'ok' | 'renamed' | 'partial' | 'multiple' | 'notFound' | 'error' | 'blank';

export interface Resolution {
  input: string;
  status: ResolveStatus;
  /** 실제로 찾은 이름 (정리한 검색어 또는 API 의 종목명) */
  query?: string;
  code?: string;
  name?: string;
  market?: string;
  /** 후보가 여럿일 때 나머지 */
  others?: string[];
  message?: string;
}

/** 조서의 회사 이름에 붙는 법인 표기·주식 종류를 떼어 검색어로 만든다 */
export function cleanCompanyName(raw: string): string {
  return raw
    .replace(/\(\s*주\s*\)|㈜|주식회사|\(\s*유\s*\)|보통주$/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

/** 엑셀에서 회사 이름 열을 복사해 붙인 것을 행마다 이름 하나로. 여러 열이면 첫 번째로 채워진 칸 */
export function parseStockInputs(text: string): string[] {
  return parsePastedRows(text).map(cells => cells.find(Boolean) ?? '');
}

/** 최근 2주 시세에서 종목을 찾는다 — 2주 넘게 거래가 없으면 상장폐지·이름 변경을 의심한다 */
const RECENT_DAYS = 14;

const distinct = (items: Item[]) => [...new Map(items.map(i => [i.srtnCd, i])).values()];

export async function resolveStock(input: string, today: string): Promise<Resolution> {
  if (!input) return { input, status: 'blank' };
  const from = shiftDays(today, -RECENT_DAYS);
  const pick = (i: Item) => ({ code: i.srtnCd, name: i.itmsNm, market: i.mrktCtg });
  try {
    if (isCode(input)) {
      const hit = distinct(await fetchItems({ likeSrtnCd: input.toUpperCase() }, from, today)).find(
        i => i.srtnCd === input.toUpperCase()
      );
      return hit
        ? { input, status: 'ok', query: input.toUpperCase(), ...pick(hit) }
        : { input, status: 'notFound', message: `최근 ${RECENT_DAYS}일 거래 없는 코드` };
    }
    const query = cleanCompanyName(input);
    const exact = distinct(await fetchItems({ itmsNm: query }, from, today));
    if (exact.length > 0) {
      return { input, status: query === input.trim() ? 'ok' : 'renamed', query, ...pick(exact[0]) };
    }
    const like = distinct(await fetchItems({ likeItmsNm: query }, from, today));
    if (like.length === 0) {
      return { input, status: 'notFound', query, message: '종목을 찾지 못함 (상장폐지·이름 변경?)' };
    }
    // 이름이 짧은 것부터 — '삼성' 이면 '삼성전자' 보다 '삼성물산' 같은 긴 이름이 뒤로 간다
    like.sort((a, b) => a.itmsNm.length - b.itmsNm.length);
    return {
      input,
      status: like.length === 1 ? 'partial' : 'multiple',
      query,
      ...pick(like[0]),
      others: like.slice(1, 6).map(i => `${i.itmsNm}(${i.srtnCd})`),
      message: like.length === 1 ? '이름 일부만 일치 — 확인 필요' : `후보 ${like.length}개 — 확인 필요`,
    };
  } catch (e) {
    return { input, status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// 시세
// ---------------------------------------------------------------------------

export async function fetchQuotes(code: string, from: string, to: string): Promise<Quote[]> {
  const items = await fetchItems({ likeSrtnCd: code }, from, to);
  return items
    .filter(i => i.srtnCd === code)
    .map(i => ({
      date: toIso(i.basDt),
      close: Number(i.clpr),
      high: Number(i.hipr),
      low: Number(i.lopr),
      volume: Number(i.trqu),
      value: Number(i.trPrc),
      shares: Number(i.lstgStCnt),
      marketCap: Number(i.mrktTotAmt),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 입력 순서를 지킨 채 5건씩 나눠 부른다 — 한꺼번에 수십 건을 쏘지 않게 */
export async function inChunks<T, R>(
  list: T[],
  fn: (item: T) => Promise<R>,
  onProgress: (done: (R | null)[]) => void
): Promise<R[]> {
  const out: (R | null)[] = list.map(() => null);
  for (let i = 0; i < list.length; i += 5) {
    const chunk = await Promise.all(list.slice(i, i + 5).map(fn));
    chunk.forEach((r, k) => (out[i + k] = r));
    onProgress([...out]);
  }
  return out as R[];
}
