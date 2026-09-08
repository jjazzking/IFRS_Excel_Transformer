import { AccountingStandard, StandardParagraph } from '../types';

/**
 * 기준서 데이터 정합성 자동 점검 (scripts/audit_standards.py 와 같은 규칙).
 *
 * HWP 원문을 기계적으로 파싱해 만든 데이터라, 제목이 본문에 흘러들거나 문단이 통째로
 * 누락되는 일이 생긴다. 여기서는 그런 자리를 '의심'으로 짚어 줄 뿐 판정하지 않는다 —
 * 정상인지 오류인지는 원문과 대조한 사람이 정한다.
 */
export type AuditRule =
  | 'HEADING_LEAK'
  | 'OVERSIZE'
  | 'TAIL_NOISE'
  | 'DUP_BODY'
  | 'TOO_SHORT'
  | 'NUM_GAP';

export const RULE_LABEL: Record<AuditRule, string> = {
  HEADING_LEAK: '제목 유입 의심',
  OVERSIZE: '문단 병합 의심',
  TAIL_NOISE: '쪽번호 잔재 의심',
  DUP_BODY: '본문 중복',
  TOO_SHORT: '본문 너무 짧음',
  NUM_GAP: '문단번호 누락',
};

export const RULE_HINT: Record<AuditRule, string> = {
  HEADING_LEAK: '마지막 줄이 본문이 아니라 다음 절의 제목으로 보입니다.',
  OVERSIZE: '2,500자가 넘습니다. 여러 문단이 하나로 붙었을 수 있습니다.',
  TAIL_NOISE: '마지막 줄이 쪽번호처럼 본문이 아닌 흔적으로 보입니다.',
  DUP_BODY: '같은 기준서의 다른 문단과 본문이 똑같습니다.',
  TOO_SHORT: '본문이 15자도 되지 않습니다. 내용이 잘렸을 수 있습니다.',
  NUM_GAP: '본문 문단번호가 중간에 비어 있습니다.',
};

export interface AuditFinding {
  paragraphId: string;
  paragraphNumber: string;
  rule: AuditRule;
  /** 무엇을 보고 짚었는지 (예: 흘러든 것으로 보이는 마지막 줄) */
  evidence: string;
}

export interface StandardAudit {
  standardId: string;
  findings: AuditFinding[];
  /** 비어 있는 본문 문단번호 (NUM_GAP) */
  missingNumbers: number[];
}

export interface AuditResult {
  byStandard: Map<string, StandardAudit>;
  /** 문단 id → 그 문단에 걸린 의심들 */
  byParagraph: Map<string, AuditFinding[]>;
  /** 기준서 id → 의심 지점 수. 한 문단에 여러 규칙이 걸려도 1곳으로 센다(+ 번호 누락 1건) */
  countByStandard: Map<string, number>;
  ruleCounts: Record<AuditRule, number>;
  total: number;
}

// ⑴ ㈎ ① (1) (가) 가. 1) 등 하위 항목 표지
const SUBITEM = /^\s*(?:[⑴-⒇]|[㈀-㈜]|[㉠-㉻]|[①-⑳]|\(\d+\)|\([가-힣a-zA-Z]\)|[가-하]\.|\d+\)|[-·※])/;
const DELETED = /^\[.*삭제.*\]$/;
const MAIN_NUM = /^(\d+)([A-Z]*)$/;
const TERMINAL = ['.', '다', '음', '임', ')', ']', '”', '"', '?', '!', ':', '등'];
const DIGITS_ONLY = /^[\d\s.·-]+$/;

function endsWithTerminal(text: string): boolean {
  return TERMINAL.some(ch => text.endsWith(ch));
}

function auditOne(standard: AccountingStandard): StandardAudit {
  const findings: AuditFinding[] = [];
  const paragraphs = standard.paragraphs;

  // 이 기준서가 쓰는 제목 집합 — '(문단 31~38)' 같은 범위 표기는 떼고 비교한다.
  const titles = new Set<string>();
  for (const p of paragraphs) {
    for (const value of [p.sectionTitle, p.subTitle]) {
      if (value) titles.add(value.replace(/\s*\(문단[^)]*\)\s*$/, '').trim());
    }
  }

  // 본문 문단번호 결손
  const nums = Array.from(
    new Set(
      paragraphs
        .map(p => MAIN_NUM.exec(p.number)?.[1])
        .filter((n): n is string => Boolean(n))
        .map(Number)
    )
  ).sort((a, b) => a - b);
  const missingNumbers: number[] = [];
  if (nums.length > 0) {
    const present = new Set(nums);
    for (let n = nums[0]; n <= nums[nums.length - 1]; n += 1) {
      if (!present.has(n)) missingNumbers.push(n);
    }
  }

  const seen = new Map<string, string>();
  for (const p of paragraphs) {
    const body = (p.content || '').trim();
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
    const last = lines[lines.length - 1] || '';
    const add = (rule: AuditRule, evidence: string) =>
      findings.push({ paragraphId: p.id, paragraphNumber: p.number, rule, evidence });

    if (body.length < 15) add('TOO_SHORT', body);

    if (body.length > 80 && !DELETED.test(body)) {
      const twin = seen.get(body);
      if (twin) add('DUP_BODY', `문단 ${twin} 과(와) 본문이 같습니다`);
      else seen.set(body, p.number);
    }

    if (body.length > 2500) add('OVERSIZE', `${body.length.toLocaleString()}자`);

    if (lines.length > 1 && last && last.length <= 25 && !SUBITEM.test(last) && !endsWithTerminal(last)) {
      if (DIGITS_ONLY.test(last)) add('TAIL_NOISE', last);
      else add('HEADING_LEAK', titles.has(last) ? `${last} (다른 문단의 제목과 일치)` : last);
    }
  }

  return { standardId: standard.id, findings, missingNumbers };
}

const EMPTY_RULE_COUNTS = (): Record<AuditRule, number> => ({
  HEADING_LEAK: 0,
  OVERSIZE: 0,
  TAIL_NOISE: 0,
  DUP_BODY: 0,
  TOO_SHORT: 0,
  NUM_GAP: 0,
});

export const EMPTY_AUDIT: AuditResult = {
  byStandard: new Map(),
  byParagraph: new Map(),
  countByStandard: new Map(),
  ruleCounts: EMPTY_RULE_COUNTS(),
  total: 0,
};

export function auditStandards(standards: AccountingStandard[]): AuditResult {
  const byStandard = new Map<string, StandardAudit>();
  const byParagraph = new Map<string, AuditFinding[]>();
  const countByStandard = new Map<string, number>();
  const ruleCounts = EMPTY_RULE_COUNTS();
  let total = 0;

  for (const standard of standards) {
    const audit = auditOne(standard);
    byStandard.set(standard.id, audit);

    for (const f of audit.findings) {
      const list = byParagraph.get(f.paragraphId);
      if (list) list.push(f);
      else byParagraph.set(f.paragraphId, [f]);
      ruleCounts[f.rule] += 1;
    }

    // 한 문단에 규칙이 여러 개 걸려도 사람이 볼 자리는 한 곳이다.
    let count = new Set(audit.findings.map(f => f.paragraphId)).size;
    if (audit.missingNumbers.length > 0) {
      ruleCounts.NUM_GAP += 1;
      count += 1;
    }
    countByStandard.set(standard.id, count);
    total += count;
  }

  return { byStandard, byParagraph, countByStandard, ruleCounts, total };
}

/** 문단에 걸린 의심들 중 가장 먼저 보여줄 것 — 심각한 쪽을 앞세운다. */
const RULE_PRIORITY: AuditRule[] = [
  'TOO_SHORT',
  'DUP_BODY',
  'OVERSIZE',
  'HEADING_LEAK',
  'TAIL_NOISE',
  'NUM_GAP',
];

export function primaryFinding(findings: AuditFinding[]): AuditFinding {
  return [...findings].sort(
    (a, b) => RULE_PRIORITY.indexOf(a.rule) - RULE_PRIORITY.indexOf(b.rule)
  )[0];
}

/** 누락된 번호를 '5~7, 51' 처럼 묶어 읽기 쉽게 만든다. */
export function formatMissingNumbers(numbers: number[], max = 12): string {
  const ranges: string[] = [];
  let start = numbers[0];
  let prev = numbers[0];
  for (const n of numbers.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}~${prev}`);
    start = n;
    prev = n;
  }
  if (numbers.length > 0) ranges.push(start === prev ? `${start}` : `${start}~${prev}`);
  return ranges.length > max
    ? `${ranges.slice(0, max).join(', ')} 외 ${ranges.length - max}곳`
    : ranges.join(', ');
}

/** 파트 필터 등에 걸려 화면에 없는 문단인지 확인할 때 쓴다. */
export function findParagraph(
  standards: AccountingStandard[],
  paragraphId: string
): StandardParagraph | undefined {
  for (const s of standards) {
    const p = s.paragraphs.find(x => x.id === paragraphId);
    if (p) return p;
  }
  return undefined;
}
