import { CellShade, RateRowMeta, RatesDay, SheetColumn, SheetRow, SheetTable } from '../types';

/**
 * 이자율 작업대의 계산 — 용도별 안내, 기준일 고르기, 만기 보간, 조서 표 만들기.
 *
 * 표 모양은 금투협 화면(시가평가 › 채권시가평가수익률 › 일자별)과 같다.
 * 행 = 종류 · 종류명 · 신용등급, 열 = 잔존만기. 고른 행·열에 음영을 칠한다.
 */

// ---------------------------------------------------------------------------
// 용도
// ---------------------------------------------------------------------------

export type RatePurpose = 'lease' | 'provision' | 'pension' | 'custom';

export interface ParagraphRef {
  /** 기준서 파일 id (예: 'k-ifrs-1116') */
  standardId: string;
  /** 조서에 적는 이름 (예: '제1116호') */
  short: string;
  numbers: string[];
}

export interface PurposeGuide {
  value: RatePurpose;
  label: string;
  hint: string;
  /** 어떤 이자율을 쓰는지 한두 문장 */
  summary: string;
  /** 표에서 어느 행을 보면 되는지 */
  rowAdvice: string;
  /** 만기는 무엇에 맞추는지 */
  termAdvice: string;
  /** 실무에서 자주 틀리는 점 */
  cautions: string[];
  refs: ParagraphRef[];
  /** 고르면 미리 칠해 두는 행 (사용자가 바로 바꿀 수 있다) */
  presetRows: string[];
  /** 고르지는 않지만 '권장'으로 표시하는 행 */
  suggestRow?: (row: RateRowMeta) => boolean;
}

const isPublicUnsecuredCorp = (r: RateRowMeta) => r.category.startsWith('회사채 I(') && r.type === '무보증';

// 나중에 넣을 용도: 변동금리 차입금 검토, 보증금 현재가치할인차금 계산 (docs/rates-plan.md)
export const PURPOSES: PurposeGuide[] = [
  {
    value: 'lease',
    label: '리스',
    hint: '리스부채 할인율',
    summary:
      '리스의 내재이자율을 쉽게 산정할 수 있으면 그 이자율로, 그렇지 않으면 리스이용자의 증분차입이자율로 리스료를 할인한다. 재평가·리스변경 때는 그 시점의 수정 할인율을 다시 정한다.',
    rowAdvice: '회사(리스이용자) 신용등급에 맞는 회사채 행. 신용등급이 없으면 비슷한 회사의 등급이나 내부 신용평가를 근거로 고른다.',
    termAdvice: '리스기간. 표에 없는 기간이면 선형보간을 쓴다.',
    cautions: [
      '증분차입이자율은 리스이용자가 비슷한 기간에 걸쳐 비슷한 담보로 사용권자산과 가치가 비슷한 자산을 비슷한 경제적 환경에서 획득하는 데 필요한 자금을 차입한다면 지급해야 하는 이자율이다(부록 A). 회사채 수익률에서 담보·기간·통화 차이를 어떻게 조정했는지 조서에 남긴다.',
      '리스변경으로 별도 리스가 아니면 변경 유효일의 수정 할인율을 쓴다 — 최초 할인율을 그대로 쓰지 않는다.',
    ],
    refs: [{ standardId: 'k-ifrs-1116', short: '제1116호', numbers: ['26', '41', '45'] }],
    presetRows: [],
    suggestRow: isPublicUnsecuredCorp,
  },
  {
    value: 'provision',
    label: '충당부채',
    hint: '복구·소송 등 현재가치',
    summary:
      '화폐의 시간가치 영향이 중요하면 예상 지출액의 현재가치로 평가한다. 할인율은 화폐의 시간가치와 부채의 특유한 위험에 대한 현행 시장의 평가를 반영한 세전 이율이다.',
    rowAdvice: '미래현금흐름에 위험을 이미 반영했다면 무위험이자율(국고채)을 쓴다. 위험을 할인율로 반영하는 경우에만 위험을 더한 이율을 쓴다.',
    termAdvice: '예상 지출 시기 (복구충당부채는 복구 예정 시점까지의 기간).',
    cautions: [
      '현금흐름 추정에 반영한 위험을 할인율에 다시 넣지 않는다 (문단 47) — 이중 반영.',
      '할인액의 상각(기간 경과에 따른 증가)은 차입원가로 인식한다 (문단 60).',
    ],
    refs: [{ standardId: 'k-ifrs-1037', short: '제1037호', numbers: ['45', '46', '47', '60'] }],
    presetRows: ['1010000'],
  },
  {
    value: 'pension',
    label: '퇴직급여',
    hint: '확정급여채무 할인율',
    summary:
      '보고기간 말 현재 우량회사채의 시장수익률을 참조해 정한다. 그런 회사채의 시장이 두텁지 않으면 국공채의 시장수익률을 쓴다. 할인율에는 퇴직급여의 예상 지급 시기를 반영한다.',
    rowAdvice: '우량회사채 — 실무에서는 회사채 무보증 AA- 이상을 쓰는 경우가 많다. 계리 보고서의 할인율과 같은 행을 고른다.',
    termAdvice: '확정급여채무의 듀레이션(가중평균 지급 시기). 계리 보고서에 적힌 듀레이션에 맞추고, 사이 값은 보간한다.',
    cautions: [
      '할인율에는 기업 고유의 신용위험을 반영하지 않는다 (문단 84) — 회사 자신의 차입이자율이 아니다.',
      '계리 보고서의 할인율이 이 표의 같은 기준일·같은 행과 맞는지 대사한다.',
    ],
    refs: [{ standardId: 'k-ifrs-1019', short: '제1019호', numbers: ['83', '84', '85', '86'] }],
    presetRows: ['7010110', '7010121', '7010122', '7010123'],
  },
  {
    value: 'custom',
    label: '직접 고르기',
    hint: '용도 안내 없이',
    summary: '',
    rowAdvice: '',
    termAdvice: '',
    cautions: [],
    refs: [],
    presetRows: [],
  },
];

export const PURPOSE_BY_VALUE = new Map(PURPOSES.map(p => [p.value, p]));

/** 조서 각주에 적는 근거 — 'K-IFRS 제1116호 문단 26, 41, 45' */
export function citeRefs(refs: ParagraphRef[]): string {
  return refs.map(r => `K-IFRS ${r.short} 문단 ${r.numbers.join(', ')}`).join('; ');
}

// ---------------------------------------------------------------------------
// 기준일
// ---------------------------------------------------------------------------

export interface DatePreset {
  date: string;
  label: string;
  group: string;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * 고를 수 있는 분기말 — 자료 구간 안의 것만, 최근 것부터.
 * 휴일인 분기말도 그대로 둔다. 표는 직전 고시일 것을 쓰고 그 사실을 각주에 남긴다.
 */
export function quarterEnds(bounds: { from: string; to: string }): DatePreset[] {
  const out: DatePreset[] = [];
  const endY = Number(bounds.to.slice(0, 4));
  const startY = Number(bounds.from.slice(0, 4));
  for (let y = endY; y >= startY; y--) {
    for (const [m, d, q] of [
      [12, 31, '연말'],
      [9, 30, '3분기말'],
      [6, 30, '반기말'],
      [3, 31, '1분기말'],
    ] as const) {
      const date = iso(y, m, d);
      if (date > bounds.to || date < bounds.from) continue;
      out.push({ date, label: `${m}월 ${q}`, group: String(y) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 만기와 보간
// ---------------------------------------------------------------------------

/** '3월' → 0.25, '1년6월' → 1.5, '10년' → 10 */
export function termYears(label: string): number {
  const y = /(\d+)년/.exec(label);
  const m = /(\d+)월/.exec(label);
  return (y ? Number(y[1]) : 0) + (m ? Number(m[1]) / 12 : 0);
}

/** 4.5 → '4년6월', 0.25 → '3월'. 금투협 표의 열 이름과 같은 꼴 */
export function termLabel(years: number): string {
  const totalMonths = Math.round(years * 12);
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  return `${y ? `${y}년` : ''}${m ? `${m}월` : ''}` || '0월';
}

/**
 * 잔존기간으로 선형보간. 표 양 끝 밖으로는 늘리지 않는다(null) — 외삽한 이자율은
 * 조서에서 설명하기 어렵다. 빈 칸(고시 없음)은 건너뛰고 양옆의 값으로 잇는다.
 */
export function interpolate(
  termsYears: number[],
  values: (number | null)[],
  target: number
): { value: number | null; lower?: number; upper?: number } {
  const pts = termsYears
    .map((t, i) => ({ t, v: values[i] }))
    .filter((p): p is { t: number; v: number } => p.v !== null && p.v !== undefined);
  const exact = pts.find(p => Math.abs(p.t - target) < 1e-9);
  if (exact) return { value: exact.v, lower: exact.t, upper: exact.t };
  let lo: { t: number; v: number } | undefined;
  let hi: { t: number; v: number } | undefined;
  for (const p of pts) {
    if (p.t < target && (!lo || p.t > lo.t)) lo = p;
    if (p.t > target && (!hi || p.t < hi.t)) hi = p;
  }
  if (!lo || !hi) return { value: null };
  const v = lo.v + ((hi.v - lo.v) * (target - lo.t)) / (hi.t - lo.t);
  // 표의 값이 소수 셋째 자리까지라 보간값도 거기에 맞춘다 — 화면과 붙여넣은 값이 같아야 한다.
  return { value: Number(v.toFixed(3)), lower: lo.t, upper: hi.t };
}

// ---------------------------------------------------------------------------
// 조서 표
// ---------------------------------------------------------------------------

export interface RatesSelection {
  rowCodes: string[];
  termIdx: number[];
  /** 보간할 잔존기간 (년) */
  customTerms: number[];
}

export interface RatesTableOptions {
  /** 고른 행·열만 남긴다. 끄면 금투협 표 전체에 음영만 칠한다 */
  onlyPicked: boolean;
  /** 각주에 근거 문단을 적는다 */
  citation?: string;
  /** 사용자가 고른 기준일 — 고시일과 다르면 각주에 남긴다 */
  requestedDate: string;
  source: string;
  fetchedAt?: string;
}

/** 표의 열 하나 — 고시된 만기이거나 보간한 만기 */
export interface RateColumn {
  key: string;
  label: string;
  years: number;
  /** 고시된 열이면 index.terms 의 자리, 보간 열이면 undefined */
  termIndex?: number;
  picked: boolean;
}

export function rateColumns(terms: string[], sel: RatesSelection, onlyPicked: boolean): RateColumn[] {
  const cols: RateColumn[] = terms.map((t, i) => ({
    key: `t${i}`,
    label: t,
    years: termYears(t),
    termIndex: i,
    picked: sel.termIdx.includes(i),
  }));
  const termSet = new Set(cols.map(c => c.years));
  for (const y of sel.customTerms) {
    if (termSet.has(y)) continue; // 고시된 만기면 보간할 필요가 없다
    cols.push({ key: `c${y}`, label: `${termLabel(y)}(보간)`, years: y, picked: true });
  }
  cols.sort((a, b) => a.years - b.years);
  const anyPicked = cols.some(c => c.picked);
  return onlyPicked && anyPicked ? cols.filter(c => c.picked) : cols;
}

export function cellValue(
  terms: string[],
  values: (number | null)[] | undefined,
  col: RateColumn
): number | null {
  if (!values) return null;
  if (col.termIndex !== undefined) return values[col.termIndex] ?? null;
  return interpolate(terms.map(termYears), values, col.years).value;
}

export function shadeOf(rowPicked: boolean, colPicked: boolean): CellShade | null {
  if (rowPicked && colPicked) return 'strong';
  if (rowPicked || colPicked) return 'soft';
  return null;
}

export function buildRatesTable(
  terms: string[],
  rowsMeta: RateRowMeta[],
  day: RatesDay | null,
  sel: RatesSelection,
  options: RatesTableOptions
): SheetTable {
  if (!day) return { columns: [], rows: [] };

  const cols = rateColumns(terms, sel, options.onlyPicked);
  const present = rowsMeta.filter(r => day.v[r.code]);
  const picked = new Set(sel.rowCodes);
  const shownRows = options.onlyPicked && sel.rowCodes.length > 0 ? present.filter(r => picked.has(r.code)) : present;

  const columns: SheetColumn[] = [
    { key: 'category', label: '종류', width: 18 },
    { key: 'type', label: '종류명', width: 16 },
    { key: 'grade', label: '신용등급', width: 14 },
    ...cols.map(c => ({
      key: c.key,
      label: c.label,
      numeric: true,
      digits: 3,
      width: 9,
      shade: c.picked ? ('soft' as const) : undefined,
    })),
  ];

  // 금투협 표처럼 같은 종류가 이어지면 이름은 첫 줄에만 적는다.
  let prevCat = '';
  let prevType = '';
  const rows: SheetRow[] = shownRows.map(r => {
    const sameCat = r.category === prevCat;
    const sameType = sameCat && r.type === prevType;
    prevCat = r.category;
    prevType = r.type;
    const rowPicked = picked.has(r.code);
    const values = day.v[r.code];
    const labelShade = rowPicked ? 'soft' : null;
    return {
      cells: [
        sameCat ? '' : r.category,
        sameType ? '' : r.type,
        r.grade,
        ...cols.map(c => cellValue(terms, values, c)),
      ],
      shades: [labelShade, labelShade, labelShade, ...cols.map(c => shadeOf(rowPicked, c.picked))],
    };
  });

  const notes = [
    `출처: ${options.source}`,
    `기준일 ${day.date}`,
    '단위: %',
  ];
  if (options.requestedDate !== day.date) {
    notes.push(`${options.requestedDate} 은 고시가 없어 직전 고시일 값`);
  }
  const interp = cols.filter(c => c.termIndex === undefined);
  if (interp.length > 0) {
    notes.push(`(보간) 열은 앞뒤 고시 만기의 수익률을 잔존기간으로 선형보간`);
  }
  if (options.citation) notes.push(`근거: ${options.citation}`);

  return {
    title: `채권시가평가수익률 (평가사 평균) — ${day.date}`,
    columns,
    rows,
    footnote: notes.join(' · '),
  };
}
