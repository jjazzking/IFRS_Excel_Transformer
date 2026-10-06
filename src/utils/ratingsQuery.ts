import { CompanyRating, RateRowMeta, RatedCompany, RatingKind } from '../types';

/**
 * 신용등급 찾기 — 회사명 검색, 등급 종류 표시, 등급에 맞는 이자율 표 행.
 *
 * 공시된 등급이 없으면 '없음'에서 멈춘다. 재무비율로 추정하거나 비슷한 회사 등급을
 * 끌어오지 않는다 (docs/ratings-plan.md).
 */

export const KIND_LABEL: Record<RatingKind, { short: string; long: string; help: string }> = {
  bond: {
    short: '채권등급',
    long: '채권 신용등급',
    help: '회사채 한 건에 매긴 등급이다. 회사 자체의 등급(기업신용등급)과 다를 수 있다 — 보증·담보·후순위 여부에 따라 달라진다.',
  },
  icr: {
    short: '기업신용등급',
    long: '기업신용등급 (ICR)',
    help: '회사 자체의 채무상환능력에 매긴 등급이다. 특정 채권의 보증·담보 조건을 반영하지 않는다.',
  },
};

/** '(주)삼성카드', '삼성카드㈜', '주식회사 삼성카드' → '삼성카드' */
export function normalizeName(name: string): string {
  return name
    .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|\(재\)|재단법인|\(사\)|사단법인/g, '')
    .replace(/[\s·.,\-()]/g, '')
    .toLowerCase();
}

/** 이름이 같으면 맨 앞, 앞부분이 같으면 그다음, 중간에 들어 있으면 그다음 */
export function searchCompanies(companies: RatedCompany[], query: string, limit = 30): RatedCompany[] {
  const q = normalizeName(query);
  if (!q) return [];
  const scored: { c: RatedCompany; score: number }[] = [];
  for (const c of companies) {
    const n = normalizeName(c.name);
    const at = n.indexOf(q);
    if (at < 0) continue;
    scored.push({ c, score: n === q ? 0 : at === 0 ? 1 : 2 });
  }
  scored.sort((a, b) => a.score - b.score || a.c.name.localeCompare(b.c.name, 'ko'));
  return scored.slice(0, limit).map(s => s.c);
}

/** 평정일이 기준일보다 1년 넘게 앞서면 오래된 등급으로 본다 */
export function isStale(rating: CompanyRating, asOf: string): boolean {
  const d = new Date(rating.date);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10) < asOf;
}

// 금투협 표는 플러스·마이너스가 없는 등급을 'AA0' 처럼 적는다.
const ROW_GRADE: Record<string, string> = { AA: 'AA0', A: 'A0', BBB: 'BBB0' };

/**
 * 신용등급에 맞는 회사채(공모 · 무보증) 행. 표에 없는 등급(BBB- 미만 등)이면 undefined.
 * 금융회사도 회사채 행을 준다 — 금융채 행이 맞는 경우는 사용자가 표에서 바꾼다.
 */
export function rateRowForGrade(rows: RateRowMeta[], grade: string): RateRowMeta | undefined {
  const g = ROW_GRADE[grade] ?? grade;
  return rows.find(r => r.category.startsWith('회사채 I(') && r.type === '무보증' && r.grade === g);
}

/** 조서 각주 — '신용등급: 삼성카드(주) AA+ (채권 신용등급, 한국기업평가 2026-09-30 평정)' */
export function ratingNote(company: string, rating: CompanyRating, agencyName: string): string {
  return `신용등급: ${company} ${rating.grade} (${KIND_LABEL[rating.kind].long}, ${agencyName} ${rating.date} 평정${
    rating.outlook ? `, ${rating.outlook}` : ''
  })`;
}
