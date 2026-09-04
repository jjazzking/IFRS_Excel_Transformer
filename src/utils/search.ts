import { AccountingStandard, ParagraphPart, StandardParagraph } from '../types';

/**
 * 전 기준서 통합검색.
 *
 * 기준서를 먼저 고르지 않아도 3,600여 개 문단 전체에서 찾을 수 있어야 하므로,
 * 앱 시작 시 소문자로 접어둔 색인을 한 번 만들고 검색은 그 위에서만 돈다.
 * (문단 수가 만 단위로 늘기 전까지는 이 정도로 충분히 즉답이 나온다.)
 */

export interface SearchHit {
  paragraph: StandardParagraph;
  score: number;
  /** 본문에서 검색어 주변을 잘라낸 미리보기 */
  snippet: string;
  /** 미리보기가 문단 처음부터 시작하지 않으면 true (앞에 '…' 을 붙인다) */
  snippetTruncatedStart: boolean;
  snippetTruncatedEnd: boolean;
}

export interface SearchGroup {
  standard: AccountingStandard;
  hits: SearchHit[];
}

export interface SearchResult {
  groups: SearchGroup[];
  totalHits: number;
  tokens: string[];
  /** 모든 낱말을 만족하는 문단이 없어 일부만 맞는 결과로 대체했는지 */
  partial: boolean;
}

interface IndexEntry {
  paragraph: StandardParagraph;
  standard: AccountingStandard;
  number: string;
  section: string;
  sub: string;
  content: string;
  keywords: string;
  standardTitle: string;
}

export interface SearchIndex {
  entries: IndexEntry[];
}

export function buildSearchIndex(standards: AccountingStandard[]): SearchIndex {
  const entries: IndexEntry[] = [];
  for (const standard of standards) {
    for (const paragraph of standard.paragraphs) {
      entries.push({
        paragraph,
        standard,
        number: paragraph.number.toLowerCase(),
        section: (paragraph.sectionTitle || '').toLowerCase(),
        sub: (paragraph.subTitle || '').toLowerCase(),
        content: paragraph.content.toLowerCase(),
        keywords: (paragraph.keywords || []).join(' ').toLowerCase(),
        standardTitle: `${standard.code} ${standard.title}`.toLowerCase(),
      });
    }
  }
  return { entries };
}

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);
}

/** 한 토큰이 문단의 어느 필드에 걸렸는지에 따라 점수를 매긴다. 0 이면 불일치. */
function scoreToken(entry: IndexEntry, token: string): number {
  let score = 0;
  if (entry.number === token) score += 120;
  else if (entry.number.startsWith(token)) score += 45;

  if (entry.sub.includes(token)) score += 25;
  if (entry.section.includes(token)) score += 20;
  if (entry.keywords.includes(token)) score += 15;
  if (entry.standardTitle.includes(token)) score += 8;

  if (entry.content.includes(token)) {
    // 여러 번 나오면 조금 더 관련 있다고 보되, 긴 문단이 과대평가되지 않게 상한을 둔다.
    const occurrences = entry.content.split(token).length - 1;
    score += 10 + Math.min(occurrences - 1, 5) * 2;
  }
  return score;
}

const SNIPPET_RADIUS = 70;

interface Snippet {
  snippet: string;
  start: boolean;
  end: boolean;
}

function makeSnippet(content: string, lower: string, tokens: string[]): Snippet {
  // 본문에서 가장 먼저 걸린 토큰 위치를 기준으로 앞뒤를 잘라낸다.
  let at = -1;
  for (const t of tokens) {
    const idx = lower.indexOf(t);
    if (idx !== -1 && (at === -1 || idx < at)) at = idx;
  }
  const flat = content.replace(/\s*\n\s*/g, ' ');
  if (at === -1) {
    return {
      snippet: flat.slice(0, SNIPPET_RADIUS * 2),
      start: false,
      end: flat.length > SNIPPET_RADIUS * 2,
    };
  }
  // 줄바꿈을 공백으로 바꾸면서 길이가 달라질 수 있어, 원문 기준 위치를 그대로 쓰되 범위를 넉넉히 잡는다.
  const from = Math.max(0, at - SNIPPET_RADIUS);
  const to = Math.min(content.length, at + SNIPPET_RADIUS);
  const raw = content.slice(from, to).replace(/\s*\n\s*/g, ' ');
  return { snippet: raw, start: from > 0, end: to < content.length };
}

export interface SearchOptions {
  /** 특정 기준서로 한정 (기준서 내 검색) */
  standardId?: string;
  /** 본문/부록/실무적용지침 등으로 한정 */
  parts?: ParagraphPart[];
  /** 그룹당 최대 결과 수 */
  maxHitsPerStandard?: number;
}

export function searchAll(
  index: SearchIndex,
  query: string,
  options: SearchOptions = {}
): SearchResult {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { groups: [], totalHits: 0, tokens, partial: false };

  // 먼저 모든 낱말이 다 들어간 문단을 찾고, 하나도 없으면 일부만 맞는 문단이라도 보여준다.
  // 기준서가 쓰는 말(사용권자산)과 실무에서 쓰는 말(이용권자산)이 어긋날 때
  // 빈 화면 대신 근처 문단이라도 나와야 찾아갈 수 있다.
  const strict = collectHits(index, tokens, options, true);
  if (strict.totalHits > 0 || tokens.length < 2) {
    return { ...finalize(strict, options), tokens, partial: false };
  }
  const loose = collectHits(index, tokens, options, false);
  return { ...finalize(loose, options), tokens, partial: loose.totalHits > 0 };
}

interface RawHits {
  byStandard: Map<string, SearchGroup>;
  totalHits: number;
}

function collectHits(
  index: SearchIndex,
  tokens: string[],
  options: SearchOptions,
  requireAll: boolean
): RawHits {
  const partSet = options.parts && options.parts.length > 0 ? new Set(options.parts) : null;
  const byStandard = new Map<string, SearchGroup>();
  let totalHits = 0;

  for (const entry of index.entries) {
    if (options.standardId && entry.standard.id !== options.standardId) continue;
    if (partSet && !partSet.has(entry.paragraph.part || 'main')) continue;

    let score = 0;
    let matchedCount = 0;
    for (const token of tokens) {
      const s = scoreToken(entry, token);
      if (s === 0) {
        if (requireAll) {
          score = 0;
          break;
        }
        continue;
      }
      matchedCount += 1;
      score += s;
    }
    if (score === 0 || matchedCount === 0) continue;
    // 여러 낱말이 걸린 문단이 위로 오도록 가산한다.
    score += (matchedCount - 1) * 30;

    const { snippet, start, end } = makeSnippet(entry.paragraph.content, entry.content, tokens);
    let group = byStandard.get(entry.standard.id);
    if (!group) {
      group = { standard: entry.standard, hits: [] };
      byStandard.set(entry.standard.id, group);
    }
    group.hits.push({
      paragraph: entry.paragraph,
      score,
      snippet,
      snippetTruncatedStart: start,
      snippetTruncatedEnd: end,
    });
    totalHits += 1;
  }

  return { byStandard, totalHits };
}

function finalize(raw: RawHits, options: SearchOptions): { groups: SearchGroup[]; totalHits: number } {
  const limit = options.maxHitsPerStandard ?? 50;
  const groups = Array.from(raw.byStandard.values());
  for (const g of groups) {
    g.hits.sort((a, b) => b.score - a.score);
    if (g.hits.length > limit) g.hits.length = limit;
  }
  // 가장 잘 맞는 기준서를 위로. 점수가 같으면 결과가 많은 쪽, 그 다음은 기준서 번호 순.
  groups.sort((a, b) => {
    const sa = a.hits[0]?.score ?? 0;
    const sb = b.hits[0]?.score ?? 0;
    if (sb !== sa) return sb - sa;
    if (b.hits.length !== a.hits.length) return b.hits.length - a.hits.length;
    return a.standard.id.localeCompare(b.standard.id);
  });

  return { groups, totalHits: raw.totalHits };
}

/** 검색어에 걸린 구간을 표시하기 위해 문자열을 조각으로 쪼갠다. */
export function highlightParts(text: string, tokens: string[]): { text: string; hit: boolean }[] {
  if (tokens.length === 0 || !text) return [{ text, hit: false }];
  const lower = text.toLowerCase();

  // 겹치는 구간을 합치기 위해 먼저 모든 매치 범위를 모은다.
  const ranges: [number, number][] = [];
  for (const token of tokens) {
    if (!token) continue;
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(token, from);
      if (idx === -1) break;
      ranges.push([idx, idx + token.length]);
      from = idx + token.length;
    }
  }
  if (ranges.length === 0) return [{ text, hit: false }];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }

  const parts: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const [from, to] of merged) {
    if (from > cursor) parts.push({ text: text.slice(cursor, from), hit: false });
    parts.push({ text: text.slice(from, to), hit: true });
    cursor = to;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
  return parts;
}
