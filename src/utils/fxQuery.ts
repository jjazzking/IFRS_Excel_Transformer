import { FxCurrencyData, FxRateRow, SheetColumn, SheetRow, SheetTable } from '../types';
import { currencyLabel, decimalsOf } from './fxSheet';
import { monthsBefore } from './dateRange';

/**
 * 환율 찾기의 계층형 질의.
 *
 * 조서에서 환율이 필요한 자리는 대체로 넷이다.
 *   - 기말환율   : 화폐성 외화항목을 보고기간말에 환산할 때 (K-IFRS 1021호 문단 23)
 *   - 평균환율   : 해외사업장 손익을 환산할 때 거래일 환율 대신 쓰는 근사치 (문단 40)
 *   - 거래일 환율 : 외화거래를 처음 인식하는 날의 현물환율 (문단 21)
 *   - 일자별 추이 : 위 셋으로 설명이 안 될 때 기간 전체를 펼쳐 본다
 *
 * 화면은 이 순서로 묻는다 — 무엇을(유형) → 어떤 기준으로(기준) → 언제(시점) → 어느 통화.
 * 앞 단계를 고르면 다음 단계가 열린다.
 */

export type FxKind = 'closing' | 'average' | 'spot' | 'daily';

/** 기말·평균환율의 기준. 반기는 따로 두지 않는다 — 반기말은 2분기말, 반기 평균은 2분기 누적이다. */
export type FxBasis = 'year' | 'quarter' | 'ytd' | 'month';

/** 일자별 추이의 기간 프리셋 */
export type FxDailyPreset = '1m' | '3m' | '6m' | '1y' | 'custom';

export const FX_KINDS: { value: FxKind; label: string; hint: string }[] = [
  { value: 'closing', label: '기말환율', hint: '보고기간말 외화자산·부채 환산' },
  { value: 'average', label: '평균환율', hint: '해외사업장 손익 환산' },
  { value: 'spot', label: '거래일 환율', hint: '특정 거래일의 고시 환율' },
  { value: 'daily', label: '일자별 추이', hint: '기간 전체를 날짜별로' },
];

export const FX_BASES: Record<'closing' | 'average', { value: FxBasis; label: string; hint: string }[]> = {
  closing: [
    { value: 'year', label: '연말', hint: '12월 31일' },
    { value: 'quarter', label: '분기말', hint: '3·6·9·12월 말 (반기말 포함)' },
    { value: 'month', label: '월말', hint: '매월 말일' },
  ],
  average: [
    { value: 'year', label: '연평균', hint: '1~12월' },
    { value: 'ytd', label: '누적평균', hint: '연초부터 분기말까지 (분·반기 보고서)' },
    { value: 'quarter', label: '분기평균', hint: '해당 3개월' },
    { value: 'month', label: '월평균', hint: '해당 월' },
  ],
};

export const FX_DAILY_PRESETS: { value: FxDailyPreset; label: string; months?: number }[] = [
  { value: '1m', label: '1개월', months: 1 },
  { value: '3m', label: '3개월', months: 3 },
  { value: '6m', label: '6개월', months: 6 },
  { value: '1y', label: '1년', months: 12 },
  { value: 'custom', label: '직접 지정' },
];

export function dailyPresetRange(preset: FxDailyPreset, to: string): { from: string; to: string } | null {
  const months = FX_DAILY_PRESETS.find(p => p.value === preset)?.months;
  return months ? { from: monthsBefore(to, months), to } : null;
}

// ---------------------------------------------------------------------------
// 시점(기간) 목록
// ---------------------------------------------------------------------------

export interface FxPeriod {
  id: string;
  /** 버튼에 쓰는 짧은 이름 ('3분기', '12월') */
  label: string;
  /** 버튼을 묶는 줄 이름 — 연도 */
  group: string;
  /** 조서 열 머리말 */
  header: string;
  /** 평균환율이면 기간 첫날. 기말환율이면 `to` 와 같다 */
  from: string;
  /** 기말환율의 기준일, 평균환율의 기간 끝날 */
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate(); // m: 1~12
const endOf = (y: number, m: number) => `${y}-${pad(m)}-${pad(lastDay(y, m))}`;

/**
 * 자료가 있는 구간 안에서 고를 수 있는 시점들. 최근 연도가 위로 온다.
 *
 * 기말환율은 기준일이 자료 구간 안에 있으면 된다. 평균환율은 기간 전체가 자료 안에
 * 들어와야 한다 — 앞이 잘린 평균을 평균이라고 적으면 조서가 틀린다. 진행 중인 기간도
 * 같은 이유로 뺀다. 올해 진행분이 필요하면 누적평균의 직전 분기를 쓴다.
 */
export function listPeriods(
  kind: 'closing' | 'average',
  basis: FxBasis,
  bounds: { from: string; to: string }
): FxPeriod[] {
  const firstYear = Number(bounds.from.slice(0, 4));
  const lastYear = Number(bounds.to.slice(0, 4));
  const out: FxPeriod[] = [];

  const push = (p: FxPeriod) => {
    const ok = kind === 'closing'
      ? p.to >= bounds.from && p.to <= bounds.to
      : p.from >= bounds.from && p.to <= bounds.to;
    if (ok) out.push(p);
  };

  for (let y = lastYear; y >= firstYear; y--) {
    const group = `${y}년`;
    if (basis === 'year') {
      push({
        id: `${y}`,
        label: `${y}년`,
        group: '',
        header: kind === 'closing' ? `${y}년말` : `${y}년 평균`,
        from: `${y}-01-01`,
        to: `${y}-12-31`,
      });
    } else if (basis === 'quarter' || basis === 'ytd') {
      for (let q = 1; q <= 4; q++) {
        const endMonth = q * 3;
        const ytd = basis === 'ytd';
        push({
          id: `${y}Q${q}${ytd ? 'ytd' : ''}`,
          label: ytd ? `${q}분기 (1~${endMonth}월)` : `${q}분기`,
          group,
          header:
            kind === 'closing'
              ? `${y}년 ${q}분기말`
              : ytd
                ? `${y}년 ${q}분기 누적 평균`
                : `${y}년 ${q}분기 평균`,
          from: ytd ? `${y}-01-01` : `${y}-${pad(endMonth - 2)}-01`,
          to: endOf(y, endMonth),
        });
      }
    } else {
      for (let m = 1; m <= 12; m++) {
        push({
          id: `${y}-${pad(m)}`,
          label: `${m}월`,
          group,
          header: kind === 'closing' ? `${y}년 ${m}월말` : `${y}년 ${m}월 평균`,
          from: `${y}-${pad(m)}-01`,
          to: endOf(y, m),
        });
      }
    }
  }
  // 기말환율이면 기준일 하나뿐이다.
  if (kind === 'closing') for (const p of out) p.from = p.to;
  return out;
}

/** 거래일 하나를 시점으로 */
export function spotPeriod(date: string): FxPeriod {
  return { id: date, label: date, group: '', header: date, from: date, to: date };
}

// ---------------------------------------------------------------------------
// 값 계산
// ---------------------------------------------------------------------------

/**
 * 기준일에 고시가 없을 때 거슬러 올라가는 한도(달력일).
 * 가장 긴 연휴는 2017년 추석이었다 — 9/29 다음 고시가 10/10 이다. 그보다 길게 비면
 * 자료가 빠진 것이다. 받기 스크립트의 GAP_DAYS 와 같은 값을 쓴다.
 */
const LOOKBACK_DAYS = 12;

export interface FxCell {
  rate: number;
  /** 실제로 쓴 고시일 — 기준일이 휴일이면 직전 고시일 */
  appliedDate?: string;
  /** 평균에 들어간 고시일 수 */
  days?: number;
}

/** `date` 이하에서 가장 늦은 고시 — 정렬된 rows 에서 이분 탐색 */
function lastOnOrBefore(rows: FxRateRow[], date: string): FxRateRow | undefined {
  let lo = 0;
  let hi = rows.length - 1;
  let found: FxRateRow | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].date <= date) {
      found = rows[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** 기준일 환율. 그날 고시가 없으면 직전 고시일 것을 쓴다. */
export function rateOn(data: FxCurrencyData, date: string): FxCell | null {
  if (date > data.to || date < data.from) return null;
  const row = lastOnOrBefore(data.rows, date);
  if (!row || daysBetween(row.date, date) > LOOKBACK_DAYS) return null;
  return { rate: row.rate, appliedDate: row.date };
}

/** 기간 평균 — 고시일 매매기준율의 단순평균. 자릿수는 화면과 조서가 같게 맞춘다. */
export function averageOver(data: FxCurrencyData, from: string, to: string): FxCell | null {
  if (from < data.from || to > data.to) return null;
  const rows = data.rows.filter(r => r.date >= from && r.date <= to);
  if (rows.length === 0) return null;
  const digits = decimalsOf(data.rows.slice(-60).map(r => r.rate));
  const mean = rows.reduce((s, r) => s + r.rate, 0) / rows.length;
  return { rate: Number(mean.toFixed(digits)), days: rows.length };
}

export function computeCell(kind: FxKind, data: FxCurrencyData, period: FxPeriod): FxCell | null {
  return kind === 'average' ? averageOver(data, period.from, period.to) : rateOn(data, period.to);
}

// ---------------------------------------------------------------------------
// 조서 표
// ---------------------------------------------------------------------------

export type FxOrientation = 'currencyRows' | 'periodRows';

const KIND_TITLE: Record<FxKind, string> = {
  closing: '기말환율',
  average: '평균환율',
  spot: '거래일 환율',
  daily: '일자별 환율',
};

function unitLabel(d: FxCurrencyData): string {
  return d.unit !== 1 ? `${d.unit} ${d.code}` : `1 ${d.code}`;
}

/**
 * 통화 × 시점 표.
 *
 * 기본은 통화가 행, 시점이 열이다 — 재무제표 주석의 '주요 환율' 표가 그 모양이다.
 * 시점이 많으면(월말 12개 등) 시점을 행으로 돌리는 편이 읽기 좋다.
 */
export function buildFxMatrixTable(
  kind: FxKind,
  periods: FxPeriod[],
  currencies: FxCurrencyData[],
  orientation: FxOrientation
): SheetTable {
  if (periods.length === 0 || currencies.length === 0) return { columns: [], rows: [] };

  const cells = currencies.map(d => periods.map(p => computeCell(kind, d, p)));
  const digits = Math.max(2, ...currencies.map(d => decimalsOf(d.rows.slice(-60).map(r => r.rate))));

  // 기준일과 실제 고시일이 다른 시점 — 각주에 남긴다. 리뷰어가 가장 먼저 묻는 대목이다.
  const substituted = periods
    .map((p, j) => {
      const applied = cells.map(row => row[j]?.appliedDate).find(Boolean);
      return applied && applied !== p.to ? `${p.to} → ${applied}` : null;
    })
    .filter(Boolean);

  let columns: SheetColumn[];
  let rows: SheetRow[];

  if (orientation === 'currencyRows') {
    columns = [
      { key: 'currency', label: '통화', width: 18 },
      { key: 'unit', label: '단위', width: 9 },
      ...periods.map(p => ({ key: p.id, label: p.header, numeric: true, digits, width: 15 })),
    ];
    rows = currencies.map((d, i) => ({
      cells: [currencyLabel(d), unitLabel(d), ...cells[i].map(c => c?.rate ?? null)],
    }));
  } else {
    const detailLabel = kind === 'average' ? '고시일수' : '적용 고시일';
    columns = [
      { key: 'period', label: '구분', width: 20 },
      { key: 'detail', label: detailLabel, width: 12 },
      ...currencies.map(d => ({
        key: d.code,
        label: d.unit !== 1 ? `${d.code} (${d.unit})` : d.code,
        numeric: true,
        digits,
        width: 12,
      })),
    ];
    rows = periods.map((p, j) => {
      const first = cells.map(row => row[j]).find(Boolean);
      const detail = kind === 'average' ? (first?.days != null ? `${first.days}일` : '') : (first?.appliedDate ?? '');
      return { cells: [p.header, detail, ...cells.map(row => row[j]?.rate ?? null)] };
    });
  }

  const notes = [`출처: ${currencies[0].source} 매매기준율 · 자료 기준 ${currencies[0].fetchedAt.slice(0, 10)}`];
  if (kind === 'average') notes.push('평균환율은 기간 중 고시일 매매기준율의 단순평균');
  if (substituted.length > 0) notes.push(`기준일에 고시가 없어 직전 고시일 적용: ${substituted.join(', ')}`);
  if (currencies.some(d => d.unit !== 1)) notes.push('100단위 고시 통화는 100단위 금액');

  return {
    title: KIND_TITLE[kind],
    columns,
    rows,
    footnote: notes.join(' · '),
  };
}
