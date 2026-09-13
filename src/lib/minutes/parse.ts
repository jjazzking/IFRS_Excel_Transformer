/**
 * 의사록 PDF 한 건을 정규 스키마로 옮긴다. `scripts/parse_minutes.py` 의 브라우저 판.
 *
 * **파일이 브라우저 밖으로 나가지 않는다.** 네트워크도, API 키도, 서버도 없다.
 * 이사회 의사록은 미공개 중요정보라 이 성질이 기능 하나보다 중요하다
 * (`docs/minutes-plan.md` 0장 벽 2).
 *
 * 지금 옮긴 범위는 **문서 레벨까지**다 (`extraction.scope: 'document'`).
 * 의안 규칙은 아직 파이썬 판에만 있으므로 여기서는 의안을 **비워 두고, 비었다는
 * 사실을 검증에서 따지지 않는다** — 못 찾은 것과 아직 안 본 것은 다르다.
 */
import {
  AgendaItem,
  AgendaVotes,
  AttendanceGroup,
  Evidence,
  FlagLevel,
  ImpactAmount,
  MinutesDocument,
  ResolutionValue,
  ReviewFlag,
} from './types';
import { MinutesText } from './text';
import {
  AttendanceKey,
  AttendanceResult,
  RuleHit,
  VoteKey,
  extractiveSummary,
  findAgenda,
  findAttendancePair,
  findDate,
  findImpact,
  findPlace,
  findResolution,
  findTimes,
} from './rules';

const SCHEMA_VERSION = 1;

/** 파이썬 판과 같은 규칙을 옮겼으므로 같은 판 번호를 쓴다. 두 산출물을 견줄 수 있어야 한다. */
const RULE_VERSION = '2026-09-11';

/** 필수 12항목 중 대화전문을 뺀 것. 비어 있으면 검토 대상이다. */
const REQUIRED_FIELDS: [string, string][] = [
  ['meeting.heldAt.date', '일시'],
  ['meeting.place', '장소'],
  ['attendance.directors.total', '총 이사 수'],
  ['attendance.directors.present', '출석 이사 수'],
  ['attendance.auditCommittee.total', '총 감사위원 수'],
  ['attendance.auditCommittee.present', '출석 감사위원 수'],
];

function flag(
  flags: ReviewFlag[],
  code: string,
  level: FlagLevel,
  message: string,
  where: string | null = null
): void {
  flags.push({ code, level, message, where });
}

function evidenceOf<T>(hit: RuleHit<T> | null, text: MinutesText): Evidence | null {
  return hit ? text.evidence(hit.start, hit.end) : null;
}

function group(result: AttendanceResult, text: MinutesText): AttendanceGroup {
  return {
    total: result.total?.value ?? null,
    present: result.present?.value ?? null,
    evidence: evidenceOf(result.total, text),
  };
}

/** 경로 문자열(`attendance.directors.total`)로 스키마 안의 값을 꺼낸다. */
function at(doc: MinutesDocument, path: string): unknown {
  let node: unknown = doc;
  for (const key of path.split('.')) {
    node = node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined;
  }
  return node ?? null;
}

/** 의안 하나를 스키마 모양으로 옮긴다. 구간은 전부 근거로 바꿔 담는다. */
function agendaItem(found: ReturnType<typeof findAgenda>[number], text: MinutesText): AgendaItem {
  const body = text.text;
  const [start, end] = found.bodyRange;

  const resolution = findResolution(body, start, end, found.kind);
  const summary = extractiveSummary(body, start, end);
  const impact = findImpact(body, found.title.value, start, end);

  const votes: AgendaVotes = {};
  for (const key of Object.keys(resolution.votes) as VoteKey[]) {
    votes[key] = resolution.votes[key]!.value;
  }

  const amounts: ImpactAmount[] = impact.amounts.map(a => ({
    raw: a.raw,
    value: a.value,
    unit: a.unit,
    evidence: text.evidence(a.start, a.end),
  }));

  return {
    number: {
      ordinal: found.number,
      value: found.marker.value,
      rule: found.marker.rule,
      evidence: text.evidence(found.marker.start, found.marker.end),
    },
    kind: found.kind,
    title: {
      value: found.title.value,
      rule: found.title.rule,
      evidence: text.evidence(found.title.start, found.title.end),
    },
    body: text.evidence(start, end),
    summary: summary
      ? {
          method: 'extractive',
          value: summary.value,
          rule: summary.rule,
          evidence: text.evidence(summary.start, summary.end),
        }
      : { method: 'extractive', value: null, rule: 'SUMMARY_NONE', evidence: null },
    resolution: {
      value: (resolution.resolution?.value as ResolutionValue | undefined) ?? null,
      evidence: evidenceOf(resolution.resolution, text),
      votes,
      unanimous: Boolean(resolution.unanimous?.value),
    },
    fsImpact: {
      hasImpact: impact.hasImpact,
      reasoning: impact.reasons.join(' · ') || null,
      standards: impact.standards,
      amounts,
      note: '규칙이 고른 검토 후보다. 영향 여부는 사람이 판단한다.',
    },
  };
}

export function parseMinutes(text: MinutesText): MinutesDocument {
  const body = text.text;

  const date = findDate(body);
  const [opened, closed] = findTimes(body);
  const place = findPlace(body);
  const counts = findAttendancePair(body);
  const agenda = findAgenda(body);

  const doc: MinutesDocument = {
    schemaVersion: SCHEMA_VERSION,
    extraction: {
      method: 'rules',
      llmUsed: false,
      ruleVersion: RULE_VERSION,
      scope: 'full',
    },
    source: text.summary(),
    meeting: {
      heldAt: {
        date: date?.value ?? null,
        startTime: opened?.value ?? null,
        endTime: closed?.value ?? null,
        evidence: evidenceOf(date, text),
      },
      place: place
        ? { value: place.value, rule: place.rule, evidence: text.evidence(place.start, place.end) }
        : null,
    },
    attendance: {
      directors: group(counts.directors, text),
      auditCommittee: group(counts.auditCommittee, text),
    },
    agenda: agenda.map(found => agendaItem(found, text)),
    review: { flags: [], needsReviewCount: 0, p1Count: 0 },
  };

  doc.review = validate(doc, text, counts);
  return doc;
}

/**
 * 모델 없이 도는 교차검증 (`docs/minutes-plan.md` 5장).
 * **스스로 매긴 신뢰도는 쓰지 않는다** — 근거가 없는 숫자다. 대신 서로 맞아야
 * 하는 값들을 맞춰 본다.
 */
function validate(
  doc: MinutesDocument,
  text: MinutesText,
  counts: Record<AttendanceKey, AttendanceResult>
): MinutesDocument['review'] {
  const flags: ReviewFlag[] = [];

  if (text.unreadPages.length > 0) {
    flag(flags, 'SCAN_PAGE', 'P1',
      `이미지 페이지 [${text.unreadPages.join(', ')}] — 읽지 못했다. 그 쪽의 값은 비어 있다.`,
      'source');
  }

  for (const [path, name] of REQUIRED_FIELDS) {
    if (at(doc, path) === null) {
      flag(flags, 'EMPTY_REQUIRED', 'P2', `${name} 을(를) 찾지 못했다.`, path);
    }
  }

  for (const [key, name] of [['directors', '이사'], ['auditCommittee', '감사위원']] as const) {
    const g = doc.attendance[key];
    if (counts[key].conflicts.length > 0) {
      flag(flags, 'COUNT_CONFLICT', 'P1',
        `${name} 인원이 문서 안에서 여러 값으로 읽힌다: ${counts[key].conflicts.join(', ')}`,
        `attendance.${key}`);
    }
    if (g.total !== null && g.present !== null) {
      if (g.present > g.total) {
        flag(flags, 'QUORUM_RANGE', 'P1',
          `출석 ${name} ${g.present}명이 총 ${name} ${g.total}명보다 많다.`, `attendance.${key}`);
      } else if (key === 'directors' && g.present * 2 <= g.total) {
        flag(flags, 'QUORUM_LEGAL', 'P1',
          `이사 ${g.total}명 중 ${g.present}명 출석 — 과반수에 못 미친다(상법 391조). `
          + '정관이 요건을 가중했거나, 읽기가 틀렸을 수 있다.', `attendance.${key}`);
      }
    }
  }

  const { startTime, endTime } = doc.meeting.heldAt;
  if (startTime && endTime && endTime < startTime) {
    flag(flags, 'TIME_ORDER', 'P2',
      `폐회(${endTime})가 개회(${startTime})보다 앞선다.`, 'meeting.heldAt');
  }

  if (doc.agenda.length === 0) {
    flag(flags, 'AGENDA_NONE', 'P1', '의안을 하나도 찾지 못했다. 서식이 다르거나 스캔본이다.', 'agenda');
  } else {
    for (const kind of ['결의', '보고'] as const) {
      const nums = doc.agenda.filter(a => a.kind === kind).map(a => a.number.ordinal);
      if (nums.length > 0 && nums.some((n, i) => n !== i + 1)) {
        flag(flags, 'AGENDA_SEQ', 'P2',
          `${kind} 의안번호가 이어지지 않는다: ${nums.join(', ')} — 페이지 누락일 수 있다.`, 'agenda');
      }
    }
  }

  for (const item of doc.agenda) {
    const where = `agenda[${item.number.ordinal}]`;
    if (item.resolution.value === null) {
      flag(flags, 'RESOLUTION_MISSING', 'P1', '가결 여부를 읽지 못했다.', where);
    }
    const votes = Object.values(item.resolution.votes);
    const present = doc.attendance.directors.present;
    if (votes.length > 0 && present !== null) {
      const sum = votes.reduce((a, b) => a + b, 0);
      if (sum > present) {
        flag(flags, 'VOTE_SUM', 'P1',
          `찬반 합계 ${sum}명이 출석 이사 ${present}명을 넘는다.`, where);
      }
    }
    if (!item.title.value) {
      flag(flags, 'EMPTY_REQUIRED', 'P2', '의안제목이 비어 있다.', where);
    }
  }

  // 의안 구간이 겹치면 앞 의안의 결의문이 뒤 의안의 결론으로 읽힌다.
  for (let i = 1; i < doc.agenda.length; i++) {
    if (doc.agenda[i - 1].body.end > doc.agenda[i].body.start) {
      flag(flags, 'SPAN_OVERLAP', 'P2', '의안 구간이 겹친다.', 'agenda');
      break;
    }
  }

  return {
    flags,
    needsReviewCount: flags.length,
    p1Count: flags.filter(f => f.level === 'P1').length,
  };
}
