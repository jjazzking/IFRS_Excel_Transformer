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
