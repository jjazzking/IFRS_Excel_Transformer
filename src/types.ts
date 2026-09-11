// 문단이 기준서의 어느 부분에 속하는지. JSON 에 적지 않아도 문단번호에서 추론한다.
//   main: 1, 35, 한2.1  /  appendix: B34, AG1, D1  /  ig: IG5A  /  bc: BC13T, 한BC104.1
export type ParagraphPart = 'main' | 'appendix' | 'ig' | 'bc';

// 기준서 체계. JSON 에 적지 않으면 code 에서 추론하며 기본값은 'K-IFRS' 이다.
export type StandardFramework = 'K-IFRS' | 'K-GAAP' | '기타';

export interface StandardParagraph {
  id: string; // e.g. "1115-31"
  number: string; // e.g. "31", "35", "B34", "AG1"
  part?: ParagraphPart; // 생략 시 number 에서 추론
  standardId?: string; // e.g. "k-ifrs-1115"
  standardCode?: string; // e.g. "K-IFRS 제1115호"
  standardTitle?: string; // e.g. "고객과의 계약에서 생기는 수익"
  sectionTitle?: string; // e.g. "수행의무의 이행 (문단 31~38)"
  subTitle?: string; // e.g. "기간에 걸쳐 이행하는 수행의무"
  content: string; // 원문 텍스트
  keywords?: string[];
}

export interface AccountingStandard {
  id: string; // e.g. "k-ifrs-1115"
  code: string; // e.g. "K-IFRS 제1115호"
  framework?: StandardFramework; // 생략 시 code 에서 추론
  number?: string; // e.g. "1115" — 목록에서 번호만 따로 보여줄 때 사용. 생략 시 code 에서 추출
  title: string; // e.g. "고객과의 계약에서 생기는 수익"
  effectiveDate?: string; // e.g. "2018년 1월 1일 이후"
  category: '수익/비용' | '자산/부채' | '금융상품' | '표시/공시' | '특수회계';
  paragraphs: StandardParagraph[];
}

/** 수정 모드에서 문단을 고칠 때 바꿀 수 있는 부분 */
export interface ParagraphEditFields {
  content: string;
  sectionTitle?: string;
  subTitle?: string;
}

/**
 * 수정 기록 한 건. 앱은 원본 JSON 을 건드리지 않고 이 기록만 쌓아 두고,
 * 화면에는 기록을 덧씌워 보여준다. 내보낸 기록을 검토한 뒤에야 원본에 반영한다.
 */
export interface ParagraphEdit {
  editId: string; // 기록 고유 id
  paragraphId: string; // e.g. "1116-2"
  standardId: string;
  standardCode: string;
  standardTitle: string;
  paragraphNumber: string;
  editor: string; // 수정자 이름
  editedAt: string; // ISO 8601
  note?: string; // 왜 고쳤는지
  before: ParagraphEditFields;
  after: ParagraphEditFields;
}

export type ParagraphNumberFormat = 'raw' | 'bracket' | 'korean' | 'hash'; 
// 'raw': 38, 'bracket': [38], 'korean': 제38호, 'hash': #38

// 문단제목 행에 무엇을 넣을지: 대분류(sectionTitle) / 소분류(subTitle) / 둘 다
export type SectionTitleLevel = 'section' | 'sub' | 'both';

export type TableTheme = 'standard' | 'minimal' | 'audit_gray' | 'audit_blue' | 'classic_accounting';

export interface ExportConfig {
  maxCharsPerLine: number; // 1행당 최대 글자 수 (기본 45~50자, 0이면 제한 없이 문장 단위로 분할)
  includeStandardTitle: boolean; // A1에 기준서명 삽입 여부
  includeSectionTitle: boolean; // 문단제목 행 삽입 여부
  sectionTitleLevel: SectionTitleLevel; // 대분류만 / 소분류만 / '대분류 > 소분류'
  paragraphNumberFormat: ParagraphNumberFormat;
  theme: TableTheme;
  customHeaderTitle?: string;
  addBlankLineBetweenParagraphs: boolean;
  alignNumberToTop: boolean;
}

export interface FormattedCell {
  relativeRow: number; // 1-indexed relative row
  colA: string; // 기준서명 / 섹션명 / 문단번호
  colB: string; // 본문 텍스트 (분할된 라인)
  isHeaderRow?: boolean;
  isStandardTitle?: boolean;
  isSectionTitle?: boolean;
  isParagraphStart?: boolean;
  paragraphId?: string;
}

export interface ClipboardExportResult {
  tsv: string;
  html: string;
  rowCount: number;
  cells: FormattedCell[];
}

// ---------------------------------------------------------------------------
// 여러 열짜리 표 — 환율처럼 문단이 아닌 자료를 조서에 붙일 때 쓴다.
// 기준서 문단은 '문단번호 | 본문' 두 열로 굳어 있지만, 환율은 날짜·환율·전일대비처럼
// 열이 여럿이고 통화마다 개수도 다르다. 그래서 열을 데이터로 들고 다닌다.
// ---------------------------------------------------------------------------

export interface SheetColumn {
  key: string;
  label: string;
  /** 숫자 열은 오른쪽으로 붙이고, 엑셀에 문자열이 아니라 숫자로 넘긴다 */
  numeric?: boolean;
  /** 소수 자릿수 — 환율은 통화마다 다르다 (USD 2자리, JPY Cross Rate 5자리) */
  digits?: number;
  /** 엑셀 열 너비 (문자 수) */
  width?: number;
}

export interface SheetRow {
  cells: (string | number | null)[];
  /** 합계·평균처럼 눈에 띄어야 하는 행 */
  emphasis?: 'total';
}

export interface SheetTable {
  /** 표 맨 위에 열 전체를 가로질러 들어가는 제목. 없으면 넣지 않는다 */
  title?: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  /** 표 아래 각주 — 자료 출처와 받은 시각. 조서에는 출처가 반드시 남아야 한다 */
  footnote?: string;
}

// ---------------------------------------------------------------------------
// 환율
// ---------------------------------------------------------------------------

/** 하루치 고시 환율. 통화에 따라 있는 값만 채워진다. */
export interface FxRateRow {
  date: string; // 'YYYY-MM-DD'
  rate: number; // 매매기준율
  change?: number; // 전일대비 (오르면 +, 내리면 -)
  open?: number;
  high?: number;
  low?: number;
  close1530?: number;
  close0600?: number;
  volume?: number;
  crossRate?: number;
}

export interface FxCurrencyMeta {
  code: string; // 'USD'
  name: string; // '미국 달러'
  /** 1 또는 100. JPY·IDR·VND 는 100단위로 고시된다 */
  unit: number;
  from: string;
  to: string;
  count: number;
}

export interface FxCurrencyData extends FxCurrencyMeta {
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  rows: FxRateRow[];
}

export interface FxIndex {
  source: string;
  updatedAt: string;
  currencies: FxCurrencyMeta[];
}
