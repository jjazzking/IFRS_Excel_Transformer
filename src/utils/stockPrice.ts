/**
 * 국내 상장주식 일별 종가 — 금융위원회 주식시세정보 (공공데이터포털).
 *
 * 브라우저에서 바로 부른다. 값은 그날 거래소에 찍힌 실제 종가이고 수정주가가 아니다.
 * 기말 공정가치 평가에 쓰는 값이 이것이다.
 */
import { SheetTable } from '../types';

// 저장소에 두지 않고 배포 워크플로우가 Secrets(STOCK_KEY)에서 빌드에 넣는다.
const STOCK_KEY = import.meta.env?.VITE_STOCK_KEY ?? '';
export const STOCK_READY = Boolean(STOCK_KEY);

export interface Quote {
  /** 'YYYY-MM-DD' */
  date: string;
  close: number;
}

export interface StockSeries {
  input: string;
  code?: string;
  name?: string;
  market?: string;
  /** 날짜 오름차순 */
  quotes: Quote[];
  error?: string;
}

interface Item {
  basDt: string;
  srtnCd: string;
  itmsNm: string;
  mrktCtg: string;
  clpr: string;
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

/** 종목 칸을 줄·탭·쉼표로 나눈다. 엑셀에서 열을 복사해 붙여도, 쉼표로 이어 써도 된다 */
export function parseStockInputs(text: string): string[] {
  return text
    .split(/[\r\n\t,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

async function fetchItems(input: string, from: string, to: string): Promise<Item[]> {
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
      ...(isCode(input) ? { likeSrtnCd: input.toUpperCase() } : { itmsNm: input }),
    });
    const res = await fetch(
      'https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?' + q
    );
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

export async function fetchSeries(input: string, from: string, to: string): Promise<StockSeries> {
  try {
    const items = await fetchItems(input, from, to);
    if (items.length === 0) return { input, quotes: [], error: '종목 또는 그 기간 시세 없음' };
    // likeSrtnCd 는 앞자리 일치라 다른 코드가 섞일 수 있다 — 입력과 같은 코드(이름이면 첫 종목)만 남긴다
    const code = isCode(input) ? input.toUpperCase() : items[0].srtnCd;
    const mine = items.filter(i => i.srtnCd === code);
    if (mine.length === 0) return { input, quotes: [], error: '종목 또는 그 기간 시세 없음' };
    return {
      input,
      code,
      name: mine[0].itmsNm,
      market: mine[0].mrktCtg,
      quotes: mine
        .map(i => ({ date: toIso(i.basDt), close: Number(i.clpr) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  } catch (e) {
    return { input, quotes: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** 입력 순서를 지킨 채 5건씩 나눠 부른다 */
export async function fetchAll(
  inputs: string[],
  from: string,
  to: string,
  onProgress: (series: (StockSeries | null)[]) => void
): Promise<StockSeries[]> {
  const out: (StockSeries | null)[] = inputs.map(() => null);
  for (let i = 0; i < inputs.length; i += 5) {
    const chunk = await Promise.all(inputs.slice(i, i + 5).map(s => fetchSeries(s, from, to)));
    chunk.forEach((s, k) => (out[i + k] = s));
    onProgress([...out]);
  }
  return out as StockSeries[];
}

/** 특정일이 휴장일이면 직전 거래일 종가를 쓴다. 2주 앞까지 거슬러 받아 둔다 */
export const SPOT_LOOKBACK_DAYS = 14;

export function closeOn(series: StockSeries, date: string): Quote | undefined {
  return series.quotes.filter(q => q.date <= date).pop();
}

const FOOTNOTE = '출처: 금융위원회 주식시세정보 (공공데이터포털) · 실제 종가(수정주가 아님)';

export function buildSpotTable(list: StockSeries[], date: string): SheetTable {
  return {
    columns: [
      { key: 'name', label: '종목명', width: 18 },
      { key: 'code', label: '종목코드', width: 10 },
      { key: 'market', label: '시장', width: 8 },
      { key: 'date', label: '기준일', width: 12 },
      { key: 'close', label: '종가(원)', numeric: true, digits: 0, width: 14 },
      { key: 'note', label: '비고', width: 28 },
    ],
    rows: list.map(s => {
      const q = closeOn(s, date);
      const note = s.error ?? (!q ? `${date} 이전 시세 없음` : q.date !== date ? '휴장일 — 직전 거래일 종가' : '');
      return {
        cells: [s.name ?? s.input, s.code ?? '', s.market ?? '', q?.date ?? '', q?.close ?? null, note],
        shades: note ? [null, null, null, 'soft', 'soft', 'soft'] : undefined,
      };
    }),
    footnote: FOOTNOTE,
  };
}

/** 날짜를 행, 종목을 열로. 맨 아래에 기간 단순평균 행 */
export function buildPeriodTable(list: StockSeries[]): SheetTable {
  const ok = list.filter(s => s.quotes.length > 0);
  const dates = [...new Set(ok.flatMap(s => s.quotes.map(q => q.date)))].sort();
  const byDate = ok.map(s => new Map(s.quotes.map(q => [q.date, q.close])));
  const average = (s: StockSeries) => s.quotes.reduce((a, q) => a + q.close, 0) / s.quotes.length;
  return {
    columns: [
      { key: 'date', label: '일자', width: 12 },
      ...ok.map(s => ({ key: s.code!, label: `${s.name}(${s.code})`, numeric: true, digits: 0, width: 16 })),
    ],
    rows: dates.length
      ? [
          ...dates.map(d => ({ cells: [d, ...byDate.map(m => m.get(d) ?? null)] })),
          { cells: ['평균', ...ok.map(average)], emphasis: 'total' as const },
        ]
      : [],
    footnote: `${FOOTNOTE} · 평균은 거래일 종가의 단순평균(원 미만 반올림 표시)`,
  };
}
