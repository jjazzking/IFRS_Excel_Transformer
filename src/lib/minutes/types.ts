/**
 * 이사회 의사록 정규 스키마 — `docs/minutes-plan.md` 4장.
 *
 * 파이썬 판(`scripts/parse_minutes.py`)이 내놓는 JSON 과 **같은 모양**이다.
 * 두 판이 갈라지면 화면이 스크립트 산출물을 못 읽게 되므로, 필드를 더할 때는
 * 양쪽을 같이 고친다.
 */

/** 값 하나가 원문 어디에서 왔는지. 스키마의 모든 필드에 같은 모양으로 붙는다. */
export interface Evidence {
  page: number; // 1-based (사람이 보는 쪽번호)
  start: number; // 본문 문자열에서의 구간
  end: number;
  text: string; // 원문에서 잘라낸 것 — 누구도 다시 쓰지 않는다
  bbox: number[][]; // 줄 단위 사각형 [x0, y0, x1, y1]
  source: 'text' | 'ocr' | 'model';
}

/** 규칙이 뽑은 값 하나. `rule` 은 틀렸을 때 어느 규칙을 고칠지 알려 준다. */
export interface Hit<T> {
  value: T;
  rule: string;
  evidence: Evidence;
}

export type PageKind = 'text' | 'scan';

export interface MinutesSource {
  fileName: string;
  pageCount: number;
  pageKinds: PageKind[];
  charCount: number;
  scanPages: number[];
  unreadPages: number[];
}

export interface MinutesMeeting {
  heldAt: {
    date: string | null; // YYYY-MM-DD
    startTime: string | null; // HH:MM
    endTime: string | null;
    evidence: Evidence | null;
  };
  place: Hit<string> | null;
}

export interface AttendanceGroup {
  total: number | null;
  present: number | null;
  evidence: Evidence | null;
}

export interface MinutesAttendance {
  directors: AttendanceGroup;
  auditCommittee: AttendanceGroup;
}

export type FlagLevel = 'P1' | 'P2';

export interface ReviewFlag {
  code: string;
  level: FlagLevel;
  message: string;
  where: string | null;
}

export interface MinutesReview {
  flags: ReviewFlag[];
  needsReviewCount: number;
  p1Count: number;
}

/**
 * `extraction.scope` 가 이 판만의 필드다.
 *
 * 브라우저 판은 아직 **문서 레벨 규칙까지만** 옮겼다 (일시·장소·인원).
 * 의안 규칙은 파이썬 판에만 있다. 이 값이 `'document'` 인 동안 `agenda` 가 비어
 * 있는 것은 **읽기 실패가 아니라 아직 안 본 것**이므로, 검증도 의안을 따지지
 * 않고 화면도 그렇게 말한다. 의안 규칙을 옮기면 `'full'` 이 된다.
 */
export type ExtractionScope = 'document' | 'full';

export interface MinutesDocument {
  schemaVersion: number;
  extraction: {
    method: 'rules';
    llmUsed: false;
    ruleVersion: string;
    scope: ExtractionScope;
  };
  source: MinutesSource;
  meeting: MinutesMeeting;
  attendance: MinutesAttendance;
  agenda: never[]; // 의안 규칙을 옮기면 여기에 타입이 붙는다
  review: MinutesReview;
}
