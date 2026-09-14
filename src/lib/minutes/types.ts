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

/** OCR 로 읽은 쪽 하나 — 어느 방향으로 읽었고 그때 평균 신뢰도가 얼마였는지. */
export interface OcrPageReport {
  page: number;
  rotation: number;
  meanConfidence: number;
}

export interface MinutesSource {
  fileName: string;
  pageCount: number;
  pageKinds: PageKind[];
  charCount: number;
  scanPages: number[];
  /** 읽지 못한 쪽. OCR 을 켜면 여기가 빈다. */
  unreadPages: number[];
  ocr: OcrPageReport[];
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

export type AgendaKind = '결의' | '보고';

/** 가결 여부. `해당없음` 은 보고사항이라 결의가 없는 경우다. */
export type ResolutionValue =
  | '원안가결'
  | '수정가결'
  | '부결'
  | '보류'
  | '해당없음';

export interface AgendaVotes {
  for?: number;
  against?: number;
  abstain?: number;
}

/** 의안에서 잡은 금액 하나. 조서에 옮길 때 쓰는 값이라 단위까지 남긴다. */
export interface ImpactAmount {
  raw: string;
  value: number | null;
  unit: string;
  evidence: Evidence;
}

/**
 * 재무제표 영향 — **사전 검토 후보만** 담는다.
 *
 * `hasImpact` 에 `있음`/`없음` 이 없는 것이 핵심이다. 규칙은 어느 기준서를 펴
 * 볼지까지만 좁히고, 영향 여부는 사람이 판단한다.
 */
export interface FsImpact {
  hasImpact: '판단필요' | '확인불가';
  reasoning: string | null;
  standards: string[];
  amounts: ImpactAmount[];
  note: string;
}

export interface AgendaItem {
  number: { ordinal: number; value: number; rule: string; evidence: Evidence };
  kind: AgendaKind;
  title: Hit<string>;
  /** 의안내용 원문 — 구간을 잘라낸 것이지 다시 쓴 것이 아니다. */
  body: Evidence;
  summary: {
    method: 'extractive';
    value: string | null;
    rule: string;
    evidence: Evidence | null;
  };
  resolution: {
    value: ResolutionValue | null;
    evidence: Evidence | null;
    votes: AgendaVotes;
    unanimous: boolean;
  };
  fsImpact: FsImpact;
}

/**
 * `extraction.scope` 가 이 판만의 필드다.
 *
 * `'full'` 이면 문서 레벨과 의안 규칙을 모두 돌린 것이고, `'document'` 면 일시·
 * 장소·인원까지만 본 것이다. 범위를 스키마에 적어 두어야 `agenda` 가 비었을 때
 * **못 찾은 것인지 아직 안 본 것인지** 구분된다.
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
  agenda: AgendaItem[];
  review: MinutesReview;
}
