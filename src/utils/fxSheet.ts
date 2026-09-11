import { FxCurrencyData, FxRateRow, SheetColumn, SheetRow, SheetTable } from '../types';

/**
 * 고른 환율을 조서에 붙일 표로 바꾼다.
 *
 * 조서에 오르는 순간 출처와 단위가 함께 있어야 한다. 100단위로 고시되는 통화를
 * 1단위로 적으면 100배 틀리고, 출처 없는 환율은 리뷰에서 되돌아온다.
 */

export type FxColumnKey = 'rate' | 'change' | 'ohlc' | 'crossRate';

export interface FxTableOptions {
  /** 일자별 표에 어떤 열을 넣을지 */
  columns: FxColumnKey[];
  /** 기간 평균환율·기말환율 행을 덧붙일지 */
  includeSummary: boolean;
}

/** 값에 실제로 쓰인 소수 자릿수. 통화마다 다르므로 자료에서 읽는다. */
export function decimalsOf(values: number[], fallback = 2): number {
  let max = 0;
  for (const v of values) {
    const dot = String(v).indexOf('.');
    if (dot >= 0) max = Math.max(max, String(v).length - dot - 1);
  }
  return Math.max(fallback, Math.min(max, 6));
}

/**
 * 기간 평균환율 — 고시된 날의 단순평균.
 *
 * 자릿수를 맞춰 둔다. 맞추지 않으면 화면에는 866.60 이 보이는데 붙여넣기에는
 * 866.5988888888888 이 들어가, 조서와 화면이 어긋난다.
 */
export function averageRate(rows: FxRateRow[], digits = 2): number | null {
  if (rows.length === 0) return null;
  const mean = rows.reduce((sum, r) => sum + r.rate, 0) / rows.length;
  return Number(mean.toFixed(digits));
}

/** 통화 한 줄 이름 — 파일명과 표 제목에 함께 쓴다. */
export function currencyLabel(data: Pick<FxCurrencyData, 'code' | 'name'>): string {
  return `${data.name} (${data.code})`;
}

export function buildFxTable(
  data: FxCurrencyData,
  rows: FxRateRow[],
  options: FxTableOptions
): SheetTable {
  const rateDigits = decimalsOf(rows.map(r => r.rate));
  const crossDigits = decimalsOf(rows.map(r => r.crossRate ?? 0).filter(Boolean), 4);

  const columns: SheetColumn[] = [{ key: 'date', label: '일자', width: 12 }];
  if (options.columns.includes('rate')) {
    columns.push({ key: 'rate', label: '매매기준율', numeric: true, digits: rateDigits, width: 13 });
  }
  if (options.columns.includes('change')) {
    columns.push({ key: 'change', label: '전일대비', numeric: true, digits: rateDigits, width: 11 });
  }
  if (options.columns.includes('ohlc')) {
    columns.push(
      { key: 'open', label: '시가', numeric: true, digits: rateDigits, width: 11 },
      { key: 'high', label: '고가', numeric: true, digits: rateDigits, width: 11 },
      { key: 'low', label: '저가', numeric: true, digits: rateDigits, width: 11 }
    );
  }
  if (options.columns.includes('crossRate')) {
    columns.push({ key: 'crossRate', label: 'Cross Rate', numeric: true, digits: crossDigits, width: 13 });
  }

  const sheetRows: SheetRow[] = rows.map(r => ({
    cells: columns.map(c => (c.key === 'date' ? r.date : (r[c.key as keyof FxRateRow] as number) ?? null)),
  }));

  if (options.includeSummary && rows.length > 0) {
    const last = rows[rows.length - 1];
    const blank = columns.slice(2).map(() => null);
    // 하루만 담았으면 평균과 기말이 같은 값이다. 같은 숫자를 두 줄 적지 않는다.
    if (rows.length > 1) {
      sheetRows.push({
        cells: [`기간 평균환율 (${rows[0].date}~${last.date}, ${rows.length}일)`,
                averageRate(rows, rateDigits), ...blank],
        emphasis: 'total',
      });
    }
    sheetRows.push({
      cells: [`기말환율 (${last.date})`, last.rate, ...blank],
      emphasis: 'total',
    });
  }

  // 100단위 고시는 제목에 한 번만 적는다. 빠지면 100배 틀리고, 두 번 적으면 읽기 나쁘다.
  const unitNote = data.unit !== 1 ? ` (${data.unit}단위 고시)` : '';
  return {
    title: `${currencyLabel(data)} 매매기준율${unitNote}`,
    columns,
    rows: sheetRows,
    footnote: `출처: ${data.source} · 자료 기준 ${data.fetchedAt.slice(0, 10)}`,
  };
}

// ---------------------------------------------------------------------------
// 결산기 요약 — 감사에서 환율이 필요한 자리는 정해져 있다.
//   마감환율(재무상태표 환산) · 평균환율(손익 환산) · 그리고 비교표시를 위한 전기.
// 날짜를 손으로 넣는 대신 결산기를 고르면 이 네 값이 한 번에 선다.
// ---------------------------------------------------------------------------

export type RateLookupStatus =
  /** 결산일에 고시가 있었다 */
  | 'exact'
  /** 결산일이 휴장이라 직전 고시를 쓴다 */
  | 'previous'
  /** 결산일이 자료 시작보다 앞선다 */
  | 'beforeData'
  /** 결산일이 아직 오지 않았거나 자료가 거기까지 들어오지 않았다 */
  | 'afterData';

export interface RateLookup {
  status: RateLookupStatus;
  /** 실제로 고시된 날. 결산일이 휴장이면 그 이전의 마지막 고시일이다 */
  date?: string;
  rate?: number;
}

/**
 * 결산일의 마감환율.
 *
 * 결산일이 주말이나 휴장일이면 고시가 없다. 그때는 직전 고시를 쓰되, **어느 날
 * 고시를 썼는지 함께 돌려준다.** 조서에서 12월 31일이라고만 적고 실제로는 29일
 * 고시를 쓴 것이 드러나지 않으면 리뷰에서 되돌아온다.
 *
 * 결산일이 자료의 마지막 날보다 뒤면 값을 주지 않는다. 그 경우는 휴장이 아니라
 * **결산일이 아직 오지 않은 것**이고, 직전 고시를 마감환율이라고 내주면 오늘 환율이
 * 기말환율로 조서에 오른다. 빈 칸이 틀린 숫자보다 낫다.
 */
export function rateOn(rows: FxRateRow[], date: string): RateLookup {
  if (rows.length === 0) return { status: 'beforeData' };
  if (date < rows[0].date) return { status: 'beforeData' };
  if (date > rows[rows.length - 1].date) return { status: 'afterData' };

  let found = rows[0];
  for (const r of rows) {
    if (r.date > date) break; // rows 는 날짜순이다
    found = r;
  }
  return {
    status: found.date === date ? 'exact' : 'previous',
    date: found.date,
    rate: found.rate,
  };
}

export interface AverageResult {
  value: number;
  /** 평균을 낸 고시 일수 */
  count: number;
  /** 실제로 자료가 있었던 구간 */
  from: string;
  to: string;
  /** 요구한 기간의 앞쪽이 자료에 없어 평균이 그만큼 짧은 경우 */
  short: boolean;
  /** 기간이 아직 끝나지 않아 평균이 진행 중인 경우 */
  inProgress: boolean;
}

/**
 * 기간 평균환율 — 그 기간에 고시된 날의 단순평균.
 *
 * 자료가 요구한 시작일보다 늦게 시작하면 평균이 짧은 기간으로 계산된다.
 * 조용히 넘기면 조서에 틀린 평균이 오르므로 `short` 로 알린다.
 */
export function averageOver(
  rows: FxRateRow[],
  from: string,
  to: string,
  digits = 2
): AverageResult | null {
  const inRange = rows.filter(r => r.date >= from && r.date <= to);
  if (inRange.length === 0) return null;
  const mean = inRange.reduce((sum, r) => sum + r.rate, 0) / inRange.length;
  return {
    value: Number(mean.toFixed(digits)),
    count: inRange.length,
    from: inRange[0].date,
    to: inRange[inRange.length - 1].date,
    short: rows[0].date > from,
    inProgress: rows[rows.length - 1].date < to,
  };
}

export interface FxPeriodOptions {
  /** 당분기만의 평균환율도 넣을지 (누적 평균과 별개) */
  includeQuarterAverage: boolean;
  /** 전기 비교 행을 넣을지 */
  includePriorYear: boolean;
}

/** 평균이 실제로 어느 구간으로 계산됐는지. 요구한 기간과 다르면 그 자리에 적는다. */
function averageBasis(from: string, to: string, avg: AverageResult | null): string {
  if (!avg) return `${from}~${to} (자료 없음)`;
  if (avg.inProgress) return `${from}~${avg.to} (${to} 까지 중, 진행)`;
  if (avg.short) return `${avg.from}~${to} (자료 ${avg.from} 부터)`;
  return `${from}~${to}`;
}

function averageWarn(
  label: string,
  from: string,
  to: string,
  avg: AverageResult | null
): string | undefined {
  if (!avg) return `${label}: ${from}~${to} 에 고시가 없다`;
  if (avg.inProgress) return `${label}은 ${to} 까지가 아니라 ${avg.to} 까지의 평균이다`;
  if (avg.short) return `${label}은 ${from} 이 아니라 ${avg.from} 부터 계산됐다`;
  return undefined;
}

interface PeriodSpec {
  label: string;
  end: string;
  cumulativeStart: string;
  quarterStart: string;
}

function periodBlock(
  rows: FxRateRow[],
  spec: PeriodSpec,
  prefix: string,
  digits: number,
  options: FxPeriodOptions
): { cells: (string | number | null)[]; emphasis?: 'total'; warn?: string }[] {
  const out: { cells: (string | number | null)[]; emphasis?: 'total'; warn?: string }[] = [];
  const emphasis = prefix === '당기' ? ('total' as const) : undefined;

  const closing = rateOn(rows, spec.end);
  const closingBasis: Record<RateLookupStatus, string> = {
    exact: spec.end,
    previous: `${closing.date} (${spec.end} 고시 없음)`,
    beforeData: `${spec.end} (자료 없음)`,
    afterData: `${spec.end} (결산일 미도래)`,
  };
  out.push({
    cells: [`${prefix} 마감환율`, closingBasis[closing.status], closing.rate ?? null, null],
    emphasis,
    warn:
      closing.status === 'afterData'
        ? `${prefix} 마감환율: ${spec.end} 이 아직 오지 않아 비워 뒀다`
        : closing.status === 'beforeData'
          ? `${prefix} 마감환율: ${spec.end} 이전 고시가 자료에 없다`
          : undefined,
  });

  const cumulative = averageOver(rows, spec.cumulativeStart, spec.end, digits);
  out.push({
    cells: [
      `${prefix} 평균환율 (누적)`,
      averageBasis(spec.cumulativeStart, spec.end, cumulative),
      cumulative ? cumulative.value : null,
      cumulative ? cumulative.count : null,
    ],
    emphasis,
    warn: averageWarn(`${prefix} 평균환율(누적)`, spec.cumulativeStart, spec.end, cumulative),
  });

  // 누적과 같은 구간이면 같은 숫자를 두 줄 적지 않는다 (1분기말이 그렇다).
  if (options.includeQuarterAverage && spec.quarterStart !== spec.cumulativeStart) {
    const quarter = averageOver(rows, spec.quarterStart, spec.end, digits);
    out.push({
      cells: [
        `${prefix} 평균환율 (당분기)`,
        averageBasis(spec.quarterStart, spec.end, quarter),
        quarter ? quarter.value : null,
        quarter ? quarter.count : null,
      ],
      emphasis,
      warn: averageWarn(`${prefix} 평균환율(당분기)`, spec.quarterStart, spec.end, quarter),
    });
  }

  return out;
}

export function buildFxPeriodTable(
  data: FxCurrencyData,
  current: PeriodSpec,
  prior: PeriodSpec | null,
  options: FxPeriodOptions
): SheetTable {
  const digits = decimalsOf(data.rows.map(r => r.rate));
  const columns: SheetColumn[] = [
    { key: 'label', label: '구분', width: 22 },
    { key: 'basis', label: '적용 기준일 / 기간', width: 30 },
    { key: 'rate', label: '환율', numeric: true, digits, width: 13 },
    { key: 'days', label: '고시일수', numeric: true, digits: 0, width: 10 },
  ];

  const blocks = [
    ...periodBlock(data.rows, current, '당기', digits, options),
    ...(options.includePriorYear && prior
      ? periodBlock(data.rows, prior, '전기', digits, options)
      : []),
  ];

  const warnings = blocks.map(b => b.warn).filter(Boolean) as string[];
  const unitNote = data.unit !== 1 ? ` (${data.unit}단위 고시)` : '';

  return {
    title: `${currencyLabel(data)} ${current.label} 환율${unitNote}`,
    columns,
    rows: blocks.map(({ cells, emphasis }) => ({ cells, emphasis })),
    footnote:
      `출처: ${data.source} · 자료 기준 ${data.fetchedAt.slice(0, 10)}` +
      (warnings.length ? ` · ⚠ ${warnings.join(' / ')}` : ''),
  };
}
