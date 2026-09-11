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

export function averageRate(rows: FxRateRow[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((sum, r) => sum + r.rate, 0) / rows.length;
}

/** 통화 한 줄 이름. 100단위 고시는 반드시 드러나야 한다. */
export function currencyLabel(data: Pick<FxCurrencyData, 'code' | 'name' | 'unit'>): string {
  return `${data.name} (${data.code})` + (data.unit !== 1 ? ` ${data.unit}단위` : '');
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
    const avg = averageRate(rows);
    const last = rows[rows.length - 1];
    const blank = columns.slice(2).map(() => null);
    sheetRows.push(
      { cells: ['기간 평균환율', avg, ...blank], emphasis: 'total' },
      { cells: [`기말환율 (${last.date})`, last.rate, ...blank], emphasis: 'total' }
    );
  }

  const unitNote = data.unit !== 1 ? ` · ${data.unit}단위 고시` : '';
  return {
    title: `${currencyLabel(data)} 매매기준율${unitNote}`,
    columns,
    rows: sheetRows,
    footnote: `출처: ${data.source} · 자료 기준 ${data.fetchedAt.slice(0, 10)}`,
  };
}
