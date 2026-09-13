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
  AttendanceGroup,
  Evidence,
  FlagLevel,
  MinutesDocument,
  ReviewFlag,
} from './types';
import { MinutesText } from './text';
import {
  AttendanceKey,
  AttendanceResult,
  RuleHit,
  findAttendancePair,
  findDate,
  findPlace,
  findTimes,
} from './rules';

const SCHEMA_VERSION = 1;

/** 파이썬 판과 같은 규칙을 옮겼으므로 같은 판 번호를 쓴다. 두 산출물을 견줄 수 있어야 한다. */
const RULE_VERSION = '2026-09-11';

/** 필수 항목 중 문서 레벨에 해당하는 것. 비어 있으면 검토 대상이다. */
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

export function parseMinutes(text: MinutesText): MinutesDocument {
  const body = text.text;

  const date = findDate(body);
  const [opened, closed] = findTimes(body);
  const place = findPlace(body);
  const counts = findAttendancePair(body);

  const doc: MinutesDocument = {
    schemaVersion: SCHEMA_VERSION,
    extraction: {
      method: 'rules',
      llmUsed: false,
      ruleVersion: RULE_VERSION,
      scope: 'document',
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
    agenda: [],
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

  // 의안 검증(AGENDA_NONE·RESOLUTION_MISSING·VOTE_SUM·AGENDA_SEQ·SPAN_OVERLAP)은
  // 의안 규칙을 옮긴 뒤에 켠다. 규칙이 없는 채로 `의안을 못 찾았다` 고 말하면
  // 읽기 실패처럼 보여 사람을 엉뚱한 곳으로 보낸다.

  return {
    flags,
    needsReviewCount: flags.length,
    p1Count: flags.filter(f => f.level === 'P1').length,
  };
}
