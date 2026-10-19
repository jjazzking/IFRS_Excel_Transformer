import { SheetColumn, SheetRow, SheetTable } from '../types';
import { ParagraphRef } from './ratesQuery';
import { monthsBefore } from './dateRange';
import { Quote, Resolution, shiftDays } from './stockPrice';

/**
 * 주가 작업대의 용도 — 무엇을 왜 뽑는지와 조서 표 만들기. docs/stocks-plan.md
 *
 * 이자율 작업대처럼 용도를 먼저 고르고, 용도에 맞는 기준일·기간을 고른 뒤 종목을 넣는다.
 */

export type StockPurpose = 'fairValue' | 'sbp' | 'eps' | 'impairment' | 'benchmark';

export interface StockPurposeGuide {
  value: StockPurpose;
  label: string;
  hint: string;
  summary: string;
  cautions: string[];
  refs: ParagraphRef[];
}

export const STOCK_PURPOSES: StockPurposeGuide[] = [
  {
    value: 'fairValue',
    label: '기말 공정가치',
    hint: '상장주식 기준일 종가',
    summary:
      '활성시장의 공시가격(수준 1)을 구할 수 있으면 조정하지 않고 그 가격으로 공정가치를 측정한다. 보유 주식수 × 보고기간 말 종가.',
    cautions: [
      '보고기간 말이 휴장일이면 직전 거래일 종가를 쓴다 — 표에 노랗게 표시된다.',
      '대량 보유라도 보유 규모를 이유로 할인·할증하지 않는다 (문단 80).',
    ],
    refs: [{ standardId: 'k-ifrs-1113', short: '제1113호', numbers: ['76', '77', '80'] }],
  },
  {
    value: 'sbp',
    label: '주식보상',
    hint: '측정기준일까지 일별 종가',
    summary:
      '주식결제형은 측정기준일(부여일) 공정가치로, 현금결제형은 보고기간 말마다 공정가치로 다시 측정한다. 시장가격이 없으면 옵션가격결정모형을 쓰고, 측정기준일 주가와 기대변동성이 주요 입력값이다.',
    cautions: [
      '기대변동성은 보통 기대존속기간만큼의 과거 일별 주가로 계산한다 — 과거 기간을 존속기간에 맞춘다.',
      '수정주가가 아니다. 기간 중 액면분할·무상증자가 있었으면 그 전후 주가를 조정해야 변동성이 왜곡되지 않는다.',
      '현금결제형은 보고기간 말마다 다시 측정하므로 기말 종가도 필요하다 (기말 공정가치 용도).',
    ],
    refs: [{ standardId: 'k-ifrs-1102', short: '제1102호', numbers: ['16', '17', '30', '47'] }],
  },
  {
    value: 'eps',
    label: 'EPS 주석',
    hint: '회계기간 평균시장가격',
    summary:
      '희석주당이익에서 옵션·주식매입권은 행사된 것으로 보고, 그 대가로 회계기간 평균시장가격에 보통주를 발행한 것으로 본다. 평균시장가격이 행사가격보다 높을 때만 희석효과가 있다.',
    cautions: [
      '주·월 단위 단순평균도 쓸 수 있다 (A4) — 월별 평균 행을 함께 보여 준다.',
      '보통 종가를 쓰되, 변동폭이 크면 고가·저가 평균이 더 대표성 있을 수 있다 (A5). 고른 방법은 계속 적용한다.',
    ],
    refs: [{ standardId: 'k-ifrs-1033', short: '제1033호', numbers: ['45', '46', '47', 'A4', 'A5'] }],
  },
  {
    value: 'impairment',
    label: '손상징후',
    hint: '시가총액 · 상장주식수',
    summary:
      '기업 순자산의 장부금액이 시가총액보다 크면 외부 손상징후다. 징후가 있으면 회수가능액을 추정해야 한다.',
    cautions: [
      '시가총액은 그 종목(보통주) 기준이다 — 우선주가 있으면 우선주 시가총액도 함께 볼지 판단한다.',
      '비교하는 순자산이 연결인지 별도인지, 지배기업 소유주 지분인지 맞춘다.',
    ],
    refs: [{ standardId: 'k-ifrs-1036', short: '제1036호', numbers: ['12'] }],
  },
  {
    value: 'benchmark',
    label: '기준주가',
    hint: '1개월·1주·최근일 가중평균',
    summary:
      '전환사채 전환가액·리픽싱, 유상증자 발행가액, 합병가액은 기산일 기준 1개월·1주·최근일 가중산술평균주가와 그 산술평균에서 출발한다. 회계기준이 아니라 자본시장법령과 증권의 발행 및 공시 등에 관한 규정을 따른다.',
    cautions: [
      '이 계산은 출발점이다 — 적용 규정 원문으로 기산일·기간·가중방식을 확인한다.',
      '기산일은 거래마다 다르다 (이사회 결의일 전일, 청약일 전 제3거래일 등).',
      '가중방식: 거래대금 ÷ 거래량(증권발행공시규정) 또는 종가를 거래량으로 가중(합병) — 위에서 고른다.',
      '할인·할증률과 원 단위 처리는 따로 적용한다. 수정주가가 아니므로 권리락·액면분할이 끼면 조정한다.',
    ],
    refs: [],
  },
];

export const STOCK_PURPOSE_BY_VALUE = new Map(STOCK_PURPOSES.map(p => [p.value, p]));

export interface StockParams {
  /** 기준일 · 측정기준일 · 기산일 */
  date: string;
  /** 주식보상 — 측정기준일부터 거슬러 올라갈 햇수 */
  years: number;
  /** EPS — 회계기간 */
  from: string;
  to: string;
  /** EPS — 종가 / (고가+저가)/2 */
  epsPrice: 'close' | 'hilo';
  /** 기준주가 — 거래대금÷거래량 / 종가×거래량 가중 */
  weighting: 'value' | 'close';
}

/** 용도마다 받아 올 기간. 기준일이 휴장일이면 직전 거래일을 쓰도록 2주 앞부터 받는다 */
export function windowOf(purpose: StockPurpose, p: StockParams): [string, string] {
  switch (purpose) {
    case 'sbp':
      return [monthsBefore(p.date, 12 * p.years), p.date];
    case 'eps':
      return [p.from, p.to];
    case 'benchmark':
      return [shiftDays(monthsBefore(p.date, 1), -14), p.date];
    default:
      return [shiftDays(p.date, -14), p.date];
  }
}

export interface StockEntry {
  res: Resolution;
  quotes: Quote[];
  error?: string;
}

const FOOTNOTE = '출처: 금융위원회 주식시세정보 (공공데이터포털) · 실제 가격(수정주가 아님)';

const lastOnOrBefore = (quotes: Quote[], date: string) => quotes.filter(q => q.date <= date).pop();

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const nameCols: SheetColumn[] = [
  { key: 'input', label: '조서 이름', width: 18 },
  { key: 'name', label: '종목명', width: 16 },
  { key: 'code', label: '종목코드', width: 9 },
];
const nameCells = (e: StockEntry) => [e.res.input, e.res.name ?? '', e.res.code ?? ''];

/** 종목 한 줄씩 — 기준일 값. 붙여넣은 순서·빈 행을 그대로 지켜 조서에 다시 붙일 수 있게 */
function perStockTable(
  entries: StockEntry[],
  date: string,
  extra: SheetColumn[],
  cells: (q: Quote) => (number | null)[]
): SheetTable {
  return {
    columns: [...nameCols, { key: 'date', label: '기준일', width: 12 }, ...extra, { key: 'note', label: '비고', width: 26 }],
    rows: entries.map(e => {
      if (e.res.status === 'blank') return { cells: ['', '', '', '', ...extra.map(() => null), ''] };
      const q = lastOnOrBefore(e.quotes, date);
      const note =
        e.error ?? e.res.message ?? (!q ? `${date} 이전 시세 없음` : q.date !== date ? '휴장일 — 직전 거래일 값' : '');
      return {
        cells: [...nameCells(e), q?.date ?? '', ...(q ? cells(q) : extra.map(() => null)), note],
        shades: note ? [null, null, null, 'soft', ...extra.map(() => 'soft' as const), 'soft'] : undefined,
      };
    }),
    footnote: FOOTNOTE,
  };
}

/** 날짜 × 종목 표. 찾은 종목만, 같은 종목은 한 번만 열로 */
function matrix(entries: StockEntry[], firstLabel: string, rows: { label: string; values: (e: StockEntry) => number | null; total?: boolean }[], digits: number): SheetTable {
  const ok = [...new Map(entries.filter(e => e.quotes.length > 0).map(e => [e.res.code, e])).values()];
  return {
    columns: [
      { key: 'label', label: firstLabel, width: 12 },
      ...ok.map(e => ({ key: e.res.code!, label: `${e.res.name}(${e.res.code})`, numeric: true, digits, width: 16 })),
    ],
    rows: ok.length
      ? rows.map<SheetRow>(r => ({ cells: [r.label, ...ok.map(r.values)], ...(r.total ? { emphasis: 'total' as const } : {}) }))
      : [],
    footnote: FOOTNOTE,
  };
}

const dailyPrice = (q: Quote, how: StockParams['epsPrice']) => (how === 'hilo' ? (q.high + q.low) / 2 : q.close);

/** 거래량 가중평균 — 거래가 한 번도 없으면 null */
export function weightedAverage(quotes: Quote[], how: StockParams['weighting']): number | null {
  const volume = quotes.reduce((a, q) => a + q.volume, 0);
  if (volume === 0) return null;
  const amount = quotes.reduce((a, q) => a + (how === 'value' ? q.value : q.close * q.volume), 0);
  return amount / volume;
}

export function buildStockTable(purpose: StockPurpose, entries: StockEntry[], p: StockParams): SheetTable {
  switch (purpose) {
    case 'fairValue':
      return perStockTable(entries, p.date, [{ key: 'close', label: '종가(원)', numeric: true, digits: 0, width: 13 }], q => [q.close]);

    case 'impairment':
      return perStockTable(
        entries,
        p.date,
        [
          { key: 'close', label: '종가(원)', numeric: true, digits: 0, width: 12 },
          { key: 'shares', label: '상장주식수', numeric: true, digits: 0, width: 15 },
          { key: 'cap', label: '시가총액(원)', numeric: true, digits: 0, width: 20 },
        ],
        q => [q.close, q.shares, q.marketCap]
      );

    case 'sbp': {
      const dates = [...new Set(entries.flatMap(e => e.quotes.map(q => q.date)))].sort();
      const table = matrix(
        entries,
        '일자',
        dates.map(d => ({ label: d, values: e => e.quotes.find(q => q.date === d)?.close ?? null })),
        0
      );
      return { ...table, title: `측정기준일 ${p.date} · 과거 ${p.years}년 일별 종가` };
    }

    case 'eps': {
      const inRange = (e: StockEntry) => e.quotes.filter(q => q.date >= p.from && q.date <= p.to);
      const months = [...new Set(entries.flatMap(e => inRange(e).map(q => q.date.slice(0, 7))))].sort();
      const avg = (e: StockEntry, month?: string) =>
        mean(inRange(e).filter(q => !month || q.date.startsWith(month)).map(q => dailyPrice(q, p.epsPrice)));
      const table = matrix(
        entries,
        '월',
        [
          ...months.map(m => ({ label: m, values: (e: StockEntry) => avg(e, m) })),
          { label: '기간 평균', values: (e: StockEntry) => avg(e), total: true },
        ],
        2
      );
      const how = p.epsPrice === 'hilo' ? '(고가+저가)/2' : '종가';
      return {
        ...table,
        title: `${p.from} ~ ${p.to} 평균시장가격 (일별 ${how}의 단순평균)`,
      };
    }

    case 'benchmark': {
      const how = p.weighting === 'value' ? '거래대금÷거래량' : '종가×거래량 가중';
      const oneMonth = monthsBefore(p.date, 1);
      const oneWeek = shiftDays(p.date, -7);
      const numCol = (key: string, label: string): SheetColumn => ({ key, label, numeric: true, digits: 2, width: 13 });
      return {
        title: `기산일 ${p.date} 기준주가 (${how})`,
        columns: [
          ...nameCols,
          { key: 'date', label: '최근일', width: 12 },
          numCol('m1', '1개월'),
          numCol('w1', '1주'),
          numCol('d1', '최근일'),
          numCol('avg', '산술평균'),
          { key: 'note', label: '비고', width: 26 },
        ],
        rows: entries.map(e => {
          if (e.res.status === 'blank') return { cells: ['', '', '', '', null, null, null, null, ''] };
          const upto = e.quotes.filter(q => q.date <= p.date);
          const last = upto[upto.length - 1];
          const m1 = weightedAverage(upto.filter(q => q.date > oneMonth), p.weighting);
          const w1 = weightedAverage(upto.filter(q => q.date > oneWeek), p.weighting);
          const d1 = last ? weightedAverage([last], p.weighting) : null;
          const all = [m1, w1, d1];
          const avg = all.every(v => v !== null) ? mean(all as number[]) : null;
          const note =
            e.error ?? e.res.message ?? (!last ? '기간 중 시세 없음' : last.date !== p.date ? '기산일 휴장 — 직전 거래일까지' : '');
          return {
            cells: [...nameCells(e), last?.date ?? '', m1, w1, d1, avg, note],
            shades: note ? [null, null, null, 'soft', null, null, null, null, 'soft'] : undefined,
          };
        }),
        footnote: `${FOOTNOTE} · 1개월 = ${oneMonth} 다음 날부터, 1주 = ${oneWeek} 다음 날부터 기산일까지`,
      };
    }
  }
}
