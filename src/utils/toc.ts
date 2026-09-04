import { AccountingStandard, ParagraphPart, StandardParagraph } from '../types';
import { PART_LABEL, PART_ORDER } from '../data/normalize';

/**
 * 기준서의 목차 트리를 문단 메타데이터에서 만들어낸다.
 *
 * 별도의 목차 데이터를 두지 않고 `part` → `sectionTitle` → `subTitle` 의
 * 3단으로 묶는다. 문단은 원문 순서대로 들어 있으므로 같은 제목이 연달아
 * 나오는 구간(run)을 하나의 노드로 본다. 제목이 떨어져서 다시 등장하면
 * 원문이 실제로 그런 것이므로 노드도 따로 만든다.
 */

export interface TocNode {
  key: string;
  title: string;
  level: 0 | 1 | 2; // 0: 본문/부록/지침, 1: 대분류(sectionTitle), 2: 소분류(subTitle)
  part: ParagraphPart;
  firstNumber: string;
  lastNumber: string;
  /** 이 노드(하위 포함)에 속한 문단 id */
  paragraphIds: string[];
  /** 클릭했을 때 이동할 문단 */
  anchorId: string;
  children: TocNode[];
}

/** '1' 또는 '2 ~ 7' 형태의 범위 표기 */
export function rangeLabel(node: TocNode): string {
  return node.firstNumber === node.lastNumber
    ? node.firstNumber
    : `${node.firstNumber} ~ ${node.lastNumber}`;
}

interface Run<T> {
  key: string;
  items: T[];
}

/** 연속으로 같은 키를 갖는 항목들을 하나로 묶는다. */
function runsOf<T>(items: T[], keyOf: (item: T) => string): Run<T>[] {
  const runs: Run<T>[] = [];
  for (const item of items) {
    const key = keyOf(item);
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.items.push(item);
    else runs.push({ key, items: [item] });
  }
  return runs;
}

function makeNode(
  key: string,
  title: string,
  level: 0 | 1 | 2,
  part: ParagraphPart,
  paragraphs: StandardParagraph[],
  children: TocNode[] = []
): TocNode {
  return {
    key,
    title,
    level,
    part,
    firstNumber: paragraphs[0]?.number ?? '',
    lastNumber: paragraphs[paragraphs.length - 1]?.number ?? '',
    paragraphIds: paragraphs.map(p => p.id),
    anchorId: paragraphs[0]?.id ?? '',
    children,
  };
}

export function buildToc(standard: AccountingStandard | undefined): TocNode[] {
  if (!standard) return [];

  // 1) 본문 / 부록 / 실무적용지침 / 결론도출근거로 나눈다.
  const byPart = new Map<ParagraphPart, StandardParagraph[]>();
  for (const p of standard.paragraphs) {
    const part = p.part || 'main';
    const bucket = byPart.get(part);
    if (bucket) bucket.push(p);
    else byPart.set(part, [p]);
  }

  const roots: TocNode[] = [];
  for (const part of PART_ORDER) {
    const paragraphs = byPart.get(part);
    if (!paragraphs || paragraphs.length === 0) continue;

    // 2) 대분류로 묶고, 그 안에서 다시 소분류로 묶는다.
    const sectionRuns = runsOf(paragraphs, p => p.sectionTitle || '');
    const sections: TocNode[] = sectionRuns.map((run, i) => {
      const subRuns = runsOf(run.items, p => p.subTitle || '');
      const hasSub = subRuns.some(r => r.key !== '');
      const children = hasSub
        ? subRuns
            .filter(r => r.key !== '')
            .map((r, j) =>
              makeNode(`${part}:${i}:${j}`, r.key, 2, part, r.items)
            )
        : [];
      return makeNode(
        `${part}:${i}`,
        run.key || '(제목 없음)',
        1,
        part,
        run.items,
        children
      );
    });

    // 3) 지침처럼 대분류가 하나뿐이고 그 이름이 파트 이름과 같으면 한 단계를 접는다.
    const redundant =
      sections.length === 1 &&
      sections[0].children.length === 0 &&
      sections[0].title === PART_LABEL[part];

    roots.push(
      makeNode(
        part,
        PART_LABEL[part],
        0,
        part,
        paragraphs,
        redundant ? [] : sections
      )
    );
  }

  return roots;
}

/** 특정 문단을 품고 있는 노드의 key 들 (트리에서 현재 위치를 펼치고 강조하는 데 쓴다). */
export function nodeKeysForParagraph(roots: TocNode[], paragraphId: string): Set<string> {
  const keys = new Set<string>();
  const walk = (node: TocNode): boolean => {
    // 부모의 paragraphIds 는 자식 것을 모두 품고 있으므로, 자식을 먼저 훑어야
    // 단축평가 때문에 하위 노드의 key 가 빠지는 일이 없다.
    const childHit = node.children.map(walk).some(Boolean);
    const hit = childHit || node.paragraphIds.includes(paragraphId);
    if (hit) keys.add(node.key);
    return hit;
  };
  roots.forEach(walk);
  return keys;
}
