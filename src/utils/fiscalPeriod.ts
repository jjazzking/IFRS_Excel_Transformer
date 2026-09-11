/**
 * 결산기 계산.
 *
 * 감사에서 환율이 필요한 자리는 정해져 있다 — 분기말·반기말·기말의 **마감환율**과
 * 그 기간의 **평균환율**, 그리고 비교표시를 위한 **전기** 같은 값. 날짜를 손으로
 * 넣는 대신 결산기를 고르면 그 네 가지가 한 번에 나오도록 여기서 기간을 만든다.
 *
 * 12월 결산이 대부분이지만 3월·6월 결산 법인도 있어 결산월을 받는다.
 */

export type FiscalPeriodKey = 'q1' | 'h1' | 'q3' | 'fy';

export const FISCAL_PERIODS: { key: FiscalPeriodKey; label: string; quarters: number }[] = [
  { key: 'q1', label: '1분기말', quarters: 1 },
  { key: 'h1', label: '반기말', quarters: 2 },
  { key: 'q3', label: '3분기말', quarters: 3 },
  { key: 'fy', label: '기말', quarters: 4 },
];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** 그 해 그 달의 마지막 날 (윤년 포함). */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** `year` 회계연도의 시작일. 12월 결산이면 그 해 1월 1일이다. */
export function fiscalYearStart(year: number, closingMonth: number): string {
  if (closingMonth === 12) return iso(year, 1, 1);
  // 3월 결산이면 전년 4월 1일에 시작해 그 해 3월 31일에 끝난다.
  return iso(year - 1, closingMonth + 1, 1);
}

/** `year` 회계연도의 종료일. */
export function fiscalYearEnd(year: number, closingMonth: number): string {
  return iso(year, closingMonth, lastDayOfMonth(year, closingMonth));
}

/** 회계연도 시작에서 `months` 달 뒤의 말일. */
function endAfterMonths(year: number, closingMonth: number, months: number): string {
  const [sy, sm] = fiscalYearStart(year, closingMonth).split('-').map(Number);
  // 시작월 기준 months 달째의 마지막 달 (1분기말 = 시작 + 3개월 - 1달의 말일)
  const zero = (sy * 12 + (sm - 1)) + months - 1;
  const y = Math.floor(zero / 12);
  const m = (zero % 12) + 1;
  return iso(y, m, lastDayOfMonth(y, m));
}

export interface FiscalPeriod {
  key: FiscalPeriodKey;
  label: string;
  /** 결산일 — 마감환율의 기준일 */
  end: string;
  /** 회계연도 시작 — 누적 평균환율의 시작일 */
  cumulativeStart: string;
  /** 해당 분기의 시작 — 당분기 평균환율의 시작일 */
  quarterStart: string;
  year: number;
  closingMonth: number;
}

export function fiscalPeriod(
  year: number,
  closingMonth: number,
  key: FiscalPeriodKey
): FiscalPeriod {
  const quarters = FISCAL_PERIODS.find(p => p.key === key)!.quarters;
  const cumulativeStart = fiscalYearStart(year, closingMonth);
  const end = endAfterMonths(year, closingMonth, quarters * 3);

  // 당분기 시작 = 직전 분기말의 다음 날. 1분기면 회계연도 시작과 같다.
  const quarterStart =
    quarters === 1
      ? cumulativeStart
      : nextDay(endAfterMonths(year, closingMonth, (quarters - 1) * 3));

  return {
    key,
    label: FISCAL_PERIODS.find(p => p.key === key)!.label,
    end,
    cumulativeStart,
    quarterStart,
    year,
    closingMonth,
  };
}

export function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** 비교표시에 쓰는 전기 같은 결산기. */
export function priorPeriod(period: FiscalPeriod): FiscalPeriod {
  return fiscalPeriod(period.year - 1, period.closingMonth, period.key);
}

/**
 * 자료가 있는 구간 안에서 고를 수 있는 회계연도.
 *
 * 결산일이 자료 구간 안에 들어오는 해만 보여 준다. 자료에 없는 해를 고르면
 * 빈 표가 나올 뿐이다.
 */
export function selectableYears(
  dataFrom: string,
  dataTo: string,
  closingMonth: number
): number[] {
  const firstYear = Number(dataFrom.slice(0, 4)) - 1;
  const lastYear = Number(dataTo.slice(0, 4)) + 1;
  const years: number[] = [];
  for (let y = firstYear; y <= lastYear; y++) {
    // 그 회계연도의 1분기말이라도 자료 안에 들어오면 고를 수 있다.
    const q1 = fiscalPeriod(y, closingMonth, 'q1').end;
    if (q1 >= dataFrom && q1 <= dataTo) years.push(y);
  }
  return years.reverse();
}

/**
 * 처음 열었을 때 보여 줄 회계연도.
 *
 * **결산이 끝난 가장 최근 해**를 고른다. 진행 중인 해를 기본값으로 두면 마감환율
 * 자리가 비어 있는 표가 먼저 보이는데, 조서를 만들러 온 사람이 가장 자주 찾는 것은
 * 이미 끝난 직전 결산기다.
 */
export function defaultYear(
  dataFrom: string,
  dataTo: string,
  closingMonth: number
): number | undefined {
  const years = selectableYears(dataFrom, dataTo, closingMonth);
  return (
    years.find(y => fiscalYearEnd(y, closingMonth) <= dataTo) ?? years[0]
  );
}

/** 그 결산기의 결산일이 이미 지났는지 (자료가 거기까지 들어왔는지). */
export function hasArrived(period: FiscalPeriod, dataTo: string): boolean {
  return period.end <= dataTo;
}
