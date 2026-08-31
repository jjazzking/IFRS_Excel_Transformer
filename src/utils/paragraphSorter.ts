import { StandardParagraph } from '../types';

/**
 * 문단 번호 정렬을 위한 헬퍼 함수
 * 문단 번호 예시: "7", "16", "31", "35", "B34", "B35", "4.1.1", "5.5.1", "5.5.3"
 */
function parseParagraphNumber(numStr: string): { prefix: string; parts: number[]; raw: string } {
  const clean = numStr.replace(/^[제\s]+|[호\s]+$/g, '').trim();
  
  // 접두어(예: B, AG 등 알파벳)와 숫자 부분 분리
  const match = clean.match(/^([A-Za-z]*)(\d+(?:\.\d+)*)(.*)$/);
  if (!match) {
    return { prefix: clean, parts: [], raw: clean };
  }

  const prefix = match[1] || '';
  const numPart = match[2] || '';
  const parts = numPart.split('.').map(p => parseInt(p, 10)).filter(n => !isNaN(n));

  return { prefix, parts, raw: clean };
}

/**
 * 두 문단 간의 번호 비교 함수
 * 1) 접두어가 없는 일반 번호(31, 35) 우선, 그 다음 B34, AG1 등
 * 2) 접두어가 같으면 숫자(4.1.1 vs 5.5.1, 9 vs 22) 기준 수치 정렬
 */
export function compareParagraphNumbers(aNum: string, bNum: string): number {
  const aParsed = parseParagraphNumber(aNum);
  const bParsed = parseParagraphNumber(bNum);

  // 1. 접두어 비교 (접두어가 없는 것이 먼저 오도록 처리: "" < "B")
  if (aParsed.prefix !== bParsed.prefix) {
    if (!aParsed.prefix) return -1;
    if (!bParsed.prefix) return 1;
    const prefixCmp = aParsed.prefix.localeCompare(bParsed.prefix);
    if (prefixCmp !== 0) return prefixCmp;
  }

  // 2. 숫자 계층별 비교 (예: 4.1.1 vs 5.5.1)
  const maxLen = Math.max(aParsed.parts.length, bParsed.parts.length);
  for (let i = 0; i < maxLen; i++) {
    const aVal = aParsed.parts[i] ?? 0;
    const bVal = bParsed.parts[i] ?? 0;
    if (aVal !== bVal) {
      return aVal - bVal;
    }
  }

  // 3. 완전히 같으면 원문 비교
  return aParsed.raw.localeCompare(bParsed.raw, undefined, { numeric: true });
}

/**
 * 기준서별 문단 번호 오름차순/내림차순 정렬 함수
 * - standardId(또는 standardCode)별로 묶은 뒤 각 그룹 내에서 문단 번호 순서대로 정렬
 * - standardId가 없는 단일 기준서 문단들인 경우에도 문단 번호 순서대로 깔끔하게 정렬
 */
export function sortParagraphsByStandardAndNumber(
  paragraphs: StandardParagraph[],
  direction: 'asc' | 'desc' = 'asc'
): StandardParagraph[] {
  const cloned = [...paragraphs];

  return cloned.sort((a, b) => {
    // 1. 기준서 코드/ID 기준 그룹화 정렬 (여러 기준서가 섞여 있을 때)
    const stdA = a.standardCode || a.standardId || '';
    const stdB = b.standardCode || b.standardId || '';
    
    if (stdA !== stdB) {
      const stdCmp = stdA.localeCompare(stdB, undefined, { numeric: true });
      return stdCmp;
    }

    // 2. 같은 기준서 내에서 문단 번호 정렬
    const cmp = compareParagraphNumbers(a.number, b.number);
    return direction === 'asc' ? cmp : -cmp;
  });
}
