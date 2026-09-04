import {
  AccountingStandard,
  ParagraphPart,
  StandardFramework,
  StandardParagraph,
} from '../types';

/**
 * 기준서 JSON 을 앱이 기대하는 형태로 보정한다.
 *
 * `part` / `framework` / `number` 는 JSON 에 적지 않아도 되도록 여기서 추론한다.
 * 기준서를 추가할 때 폴더에 JSON 만 넣으면 된다는 규칙을 유지하기 위한 것이고,
 * 사내 DB 임포트로 들어온 데이터도 같은 경로를 지난다.
 */

// BC 는 B 로 시작하므로 부록(B34)보다 먼저 판정해야 한다.
const BC_RE = /^한?BC\d/;
const IG_RE = /^IG\d/;
// B34, AG1, D1, BA.1 처럼 대문자로 시작하는 부록 문단
const APPENDIX_RE = /^[A-Z]{1,2}[\d.]/;

export function inferPart(number: string): ParagraphPart {
  const n = (number || '').trim();
  if (BC_RE.test(n)) return 'bc';
  if (IG_RE.test(n)) return 'ig';
  if (APPENDIX_RE.test(n)) return 'appendix';
  return 'main';
}

export const PART_LABEL: Record<ParagraphPart, string> = {
  main: '본문',
  appendix: '부록',
  ig: '실무적용지침',
  bc: '결론도출근거',
};

// 목차·필터에서 항상 이 순서로 보여준다.
export const PART_ORDER: ParagraphPart[] = ['main', 'appendix', 'ig', 'bc'];

export function inferFramework(code: string): StandardFramework {
  const c = (code || '').toUpperCase();
  if (c.includes('K-IFRS')) return 'K-IFRS';
  if (c.includes('K-GAAP')) return 'K-GAAP';
  return '기타';
}

/** 'K-IFRS 제1115호' → '1115'. 번호를 못 찾으면 빈 문자열. */
export function extractStandardNumber(code: string): string {
  const m = /제\s*(\d+)\s*호/.exec(code || '');
  if (m) return m[1];
  const digits = /(\d{3,})/.exec(code || '');
  return digits ? digits[1] : '';
}

function normalizeParagraph(
  p: StandardParagraph,
  standard: AccountingStandard
): StandardParagraph {
  return {
    ...p,
    part: p.part || inferPart(p.number),
    // 문단만 따로 들고 다녀도(선택 목록 등) 출처를 알 수 있도록 기준서 정보를 채운다.
    standardId: p.standardId || standard.id,
    standardCode: p.standardCode || standard.code,
    standardTitle: p.standardTitle || standard.title,
  };
}

export function normalizeStandard(standard: AccountingStandard): AccountingStandard {
  const withMeta: AccountingStandard = {
    ...standard,
    framework: standard.framework || inferFramework(standard.code),
    number: standard.number || extractStandardNumber(standard.code),
    paragraphs: [],
  };
  withMeta.paragraphs = (standard.paragraphs || []).map(p =>
    normalizeParagraph(p, standard)
  );
  return withMeta;
}

export function normalizeStandards(standards: AccountingStandard[]): AccountingStandard[] {
  return standards.map(normalizeStandard);
}
