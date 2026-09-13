/**
 * 규칙만으로 의사록에서 필드를 뽑는다. 모델 호출 없음, API 키 없음, 비용 0.
 * `scripts/minutes_rules.py` 의 문서 레벨 규칙(일시·장소·인원)을 옮긴 것이다.
 *
 * **의안 규칙은 아직 여기 없다.** 다만 인원수를 찾을 범위를 '첫 의안 앞까지' 로
 * 끊어야 하므로 의안 **머리말 판정**만 먼저 옮겨 왔다 (`agendaMarks`).
 *
 * 옮길 때 지킨 것 —
 *   - 규칙 이름(`rule`)을 파이썬 판과 똑같이 쓴다. 두 판의 산출물을 나란히 놓고
 *     비교할 수 있어야 하고, 틀렸을 때 고칠 자리도 이름으로 찾는다.
 *   - 정규식은 문법만 바꾸고 내용은 건드리지 않는다. 규칙을 '개선' 하면 파이썬
 *     판에서 잰 정확도가 이 판의 정확도가 아니게 된다.
 */

/** 뽑아낸 값 하나와 그 값이 나온 자리. 파이썬 판의 `Hit` 과 같다. */
export interface RuleHit<T> {
  value: T;
  start: number;
  end: number;
  rule: string;
}

// ---------------------------------------------------------------- 공통 도구

/** `일    시` 처럼 라벨 글자 사이를 벌려 쓰는 서식을 견디게 한다. */
const label = (...chars: string[]) => chars.join('\\s*');

/** 라벨 앞에 붙는 항목 번호. `1.` `2)` `가.` `-` 등. */
const ITEM_PREFIX = '[ \\t]*(?:\\d{1,2}\\s*[.)]|[가-힣]\\s*[.)]|[-·*])?[ \\t]*';

/** 라벨과 값을 가르는 글자. OCR 이 콜론을 `ㆍ`·`·` 로 읽는 일이 잦다. */
const COLON = '[:：ㆍ·∶;]';

/** 파이썬 `str.strip(chars)` — 주어진 글자만 양끝에서 뗀다. */
function stripChars(value: string, chars: string): string {
  let lo = 0;
  let hi = value.length;
  while (lo < hi && chars.includes(value[lo])) lo += 1;
  while (hi > lo && chars.includes(value[hi - 1])) hi -= 1;
  return value.slice(lo, hi);
}

function rstripChars(value: string, chars: string): string {
  let hi = value.length;
  while (hi > 0 && chars.includes(value[hi - 1])) hi -= 1;
  return value.slice(0, hi);
}

/** 그룹의 시작 위치가 필요하므로 어디서나 `d` 플래그를 켠다. */
function re(pattern: string, flags = ''): RegExp {
  return new RegExp(pattern, flags.includes('d') ? flags : flags + 'd');
}

function groupStart(m: RegExpExecArray, group: number): number {
  return m.indices![group]![0];
}

// ---------------------------------------------------------------- 일시

const DATE_RE = re('(\\d{4})\\s*[년.\\-/]\\s*(\\d{1,2})\\s*[월.\\-/]\\s*(\\d{1,2})\\s*일?', 'g');

const HANJA_DIGITS: Record<string, number> = {
  '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
};

const HANJA_DATE_RE = re(
  '([〇零一二三四五六七八九]{4})\\s*年'
  + '\\s*([〇零一二三四五六七八九十]{1,3})\\s*月'
  + '\\s*([〇零一二三四五六七八九十]{1,3})\\s*日',
  'g'
);

/** `十六` → 16, `二十` → 20, `三十一` → 31. */
function hanjaNumber(token: string): number | null {
  if (!token.includes('十')) {
    let value = 0;
    for (const ch of token) {
      if (!(ch in HANJA_DIGITS)) return null;
      value = value * 10 + HANJA_DIGITS[ch];
    }
    return value;
  }
  const at = token.indexOf('十');
  const head = token.slice(0, at);
  const tail = token.slice(at + 1);
  const tens = head ? HANJA_DIGITS[head] : 1;
  const ones = tail ? HANJA_DIGITS[tail] : 0;
  if (tens === undefined || ones === undefined) return null;
  return tens * 10 + ones;
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

function firstMatch(pattern: RegExp, text: string): RegExpExecArray | null {
  pattern.lastIndex = 0;
  return pattern.exec(text);
}

function* allMatches(pattern: RegExp, text: string): Generator<RegExpExecArray> {
  pattern.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    yield m;
    if (m[0].length === 0) pattern.lastIndex += 1;
  }
}

function hanjaDate(text: string, offset = 0): RuleHit<string> | null {
  const m = firstMatch(HANJA_DATE_RE, text);
  if (!m) return null;
  const year = hanjaNumber(m[1]);
  const month = hanjaNumber(m[2]);
  const day = hanjaNumber(m[3]);
  if (year === null || month === null || day === null) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return {
    value: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`,
    start: offset + m.index,
    end: offset + m.index + m[0].length,
    rule: 'DATE_HANJA',
  };
}

const TIME_RE = re('(오전|오후)?\\s*(\\d{1,2})\\s*(?:시|:)\\s*(\\d{1,2})?\\s*분?', 'g');

const LINE_LABELS: Record<string, string[]> = {
  heldAt: [label('일', '시'), label('일', '자'), label('개', '최', '일', '시')],
  place: [label('장', '소'), label('개', '최', '장', '소')],
  opened: [label('개', '회'), label('개', '의')],
  closed: [label('폐', '회'), label('산', '회'), label('폐', '의')],
};

interface LabelLine {
  start: number;
  end: number;
  value: string;
}

/** `라벨 : 값` 형태의 줄에서 값 부분의 구간을 찾는다. */
function labelLines(text: string, labels: string[]): LabelLine[] {
  const out: LabelLine[] = [];
  for (const one of labels) {
    const pattern = re('^' + ITEM_PREFIX + one + '\\s*' + COLON + '?\\s*(\\S.*)$', 'gm');
    for (const m of allMatches(pattern, text)) {
      const start = groupStart(m, 1);
      out.push({ start, end: start + m[1].length, value: m[1] });
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/** 일시. 라벨이 붙은 줄을 먼저 보고, 없으면 문서 앞부분의 첫 날짜를 쓴다. */
export function findDate(text: string): RuleHit<string> | null {
  for (const line of labelLines(text, LINE_LABELS.heldAt)) {
    const m = firstMatch(DATE_RE, line.value);
    if (m) {
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return {
        value: `${pad(y, 4)}-${pad(mo, 2)}-${pad(d, 2)}`,
        start: line.start + m.index,
        end: line.start + m.index + m[0].length,
        rule: 'DATE_LABEL',
      };
    }
    const hanja = hanjaDate(line.value, line.start);
    if (hanja) return hanja;
  }

  // 라벨이 없는 서식 — 뒤쪽 날짜(작성일·서명일)를 집지 않도록 앞부분만 본다.
  const head = text.slice(0, 1500);
  const hanja = hanjaDate(head);
  if (hanja) return hanja;

  const m = firstMatch(DATE_RE, head);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return {
      value: `${pad(y, 4)}-${pad(mo, 2)}-${pad(d, 2)}`,
      start: m.index,
      end: m.index + m[0].length,
      rule: 'DATE_HEAD',
    };
  }
  return null;
}

function parseTime(value: string, offset: number): RuleHit<string> | null {
  const m = firstMatch(TIME_RE, value);
  if (!m) return null;
  const meridiem = m[1];
  let hour = Number(m[2]);
  const minute = Number(m[3] ?? 0);
  if (meridiem === '오후' && hour < 12) hour += 12;
  if (meridiem === '오전' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return {
    value: `${pad(hour, 2)}:${pad(minute, 2)}`,
    start: offset + m.index,
    end: offset + m.index + m[0].length,
    rule: 'TIME',
  };
}

// 개회·폐회가 라벨이 아니라 문장 안에 적히는 서식. 시각이 말 앞에 온다.
const CLOCK = '((?:오전|오후)?\\s*\\d{1,2}\\s*(?:시|:)\\s*\\d{0,2}\\s*분?)';
const GAP = '[\\s\\S]{0,12}?'; // 시각과 그 말 사이에 `이사회의` 같은 몇 글자가 낀다
const JOSA = '\\s*[를을]?\\s*'; // OCR 은 조사 앞뒤에도 공백을 넣는다

const OPEN_PROSE_RE = re(
  CLOCK + '\\s*(?:부터\\s*)?' + GAP
  + '(?:' + label('개', '회') + JOSA + label('선', '언')
  + '|' + label('의', '사') + JOSA + label('진', '행') + ')',
  'g'
);
const CLOSE_PROSE_RE = re(
  CLOCK + '\\s*' + GAP
  + '(?:' + label('폐', '회') + '|' + label('산', '회') + ')'
  + JOSA + label('선', '언'),
  'g'
);

/** 개회·폐회 시각. 라벨 줄 → 문장 안 → 일시 줄 꼬리 순으로 본다. */
export function findTimes(text: string): [RuleHit<string> | null, RuleHit<string> | null] {
  let opened: RuleHit<string> | null = null;
  let closed: RuleHit<string> | null = null;

  for (const line of labelLines(text, LINE_LABELS.opened)) {
    opened = parseTime(line.value, line.start);
    if (opened) {
      opened.rule = 'TIME_OPEN_LABEL';
      break;
    }
  }
  for (const line of labelLines(text, LINE_LABELS.closed)) {
    closed = parseTime(line.value, line.start);
    if (closed) {
      closed.rule = 'TIME_CLOSE_LABEL';
      break;
    }
  }

  if (opened === null) {
    const m = firstMatch(OPEN_PROSE_RE, text);
    if (m) {
      opened = parseTime(m[1], groupStart(m, 1));
      if (opened) opened.rule = 'TIME_OPEN_PROSE';
    }
  }
  if (closed === null) {
    const m = firstMatch(CLOSE_PROSE_RE, text);
    if (m) {
      closed = parseTime(m[1], groupStart(m, 1));
      if (closed) closed.rule = 'TIME_CLOSE_PROSE';
    }
  }

  if (opened === null) {
    for (const line of labelLines(text, LINE_LABELS.heldAt)) {
      const m = firstMatch(DATE_RE, line.value);
      const tailAt = m ? m.index + m[0].length : 0;
      opened = parseTime(line.value.slice(tailAt), line.start + tailAt);
      if (opened) {
        opened.rule = 'TIME_IN_DATE_LINE';
        break;
      }
    }
  }
  return [opened, closed];
}

/** 장소. 일시와 한 줄에 붙은 서식(`일시 및 장소`)은 쉼표 뒤를 장소로 본다. */
export function findPlace(text: string): RuleHit<string> | null {
  for (const line of labelLines(text, LINE_LABELS.place)) {
    const cleaned = rstripChars(stripChars(line.value, ' \tㆍ·∶:：'), '.,');
    if (cleaned) {
      return {
        value: cleaned,
        start: line.start,
        end: line.start + line.value.replace(/\s+$/, '').length,
        rule: 'PLACE_LABEL',
      };
    }
  }

  const combined = re(
    '^' + ITEM_PREFIX + label('일', '시') + '\\s*(?:및|과)\\s*' + label('장', '소')
    + '\\s*' + COLON + '?\\s*(\\S.*)$',
    'gm'
  );
  for (const m of allMatches(combined, text)) {
    const value = m[1];
    const parts = value.split(/\s*[,，]\s*/);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const tail = rstripChars(last.trim(), '.');
      const off = groupStart(m, 1) + value.lastIndexOf(last);
      return {
        value: tail,
        start: off,
        end: off + last.replace(/\s+$/, '').length,
        rule: 'PLACE_IN_COMBINED_LINE',
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------- 인원수

/** 전체가 아닌 소집단의 수 — 이 말이 앞에 붙으면 총수로 쓰지 않는다. */
const SUBGROUP = '(?<!사외)(?<!사내)(?<!상근)(?<!비상근)(?<!기타비상무)';

const SUBJECTS: Record<AttendanceKey, string> = {
  directors: '이\\s*사',
  auditCommittee: '감\\s*사\\s*위\\s*원|감\\s*사',
};

export type AttendanceKey = 'directors' | 'auditCommittee';

const COUNT = '(\\d+)\\s*[명인]';

/** `재적이사 7명 중 6명 출석` — 총수와 출석을 한 번에 준다. 가장 믿을 만하다. */
const BOTH_RE = '(?:재적|총|전체)?\\s*{subject}\\s*(?:총\\s*수|총원)?\\s*(?:는|은)?\\s*{count}'
  + '\\s*(?:중|가운데)\\s*(?:출석\\s*(?:이사|감사위원)?\\s*)?{count2}\\s*(?:이\\s*)?(?:출석|참석)?';

/** `재적이사 7명 전원 출석` */
const ALL_RE = '(?:재적|총|전체)?\\s*{subject}\\s*{count}\\s*(?:전원|모두)\\s*(?:이\\s*)?(?:출석|참석)';

/** `이사 총수 : 7명` / `출석 이사 수 : 6명` — 표로 적힌 서식. */
const TOTAL_RE = '(?:(?:재적|총|전체)\\s*{subject}|{subject}\\s*(?:총\\s*수|총원|정\\s*원))'
  + '\\s*(?:수)?\\s*[:：]?\\s*{count}';
const PRESENT_RE = '(?:출\\s*석\\s*{subject}|{subject}\\s*출\\s*석)\\s*(?:수|인원)?\\s*[:：]?\\s*{count}';

function compile(template: string, subject: string): RegExp {
  return re(
    template
      .replaceAll('{subject}', SUBGROUP + '(?:' + subject + ')')
      .replaceAll('{count2}', COUNT)
      .replaceAll('{count}', COUNT),
    'g'
  );
}

// 출석 명단 줄. `대표이사   노명희   출석` / `상근감사   전원건   불참(사유)`
// 직함을 열거하지 않는다 — **`…이사` 또는 `…감사`로 끝난다**는 구조만 본다.
// OCR 은 직함과 이름 안에도 공백을 넣으므로 낱말이 아니라 줄의 양끝을 잡는다.
const SP = '[ \\t]*';
const TITLE = '(?:[가-힣]' + SP + '){0,10}?(?:이' + SP + '사|감' + SP + '사(?:' + SP + '위' + SP + '원)?)';
const MARK = '(?:원' + SP + '격|화' + SP + '상|서' + SP + '면|대' + SP + '리)?' + SP
  + '(?:출' + SP + '석|참' + SP + '석|불' + SP + '참|결' + SP + '석|불' + SP + '출' + SP + '석)';
const ROSTER_RE = re('^[ \\t]*(' + TITLE + ')[ \\t]+(.+?)[ \\t]*(' + MARK + ')[ \\t]*(?:[(（].*)?$', 'gm');

const ATTENDED = ['출석', '참석'];

interface RosterCount {
  total: number;
  present: number;
  span: [number, number] | null;
}

/** 명단을 세어 총원·출석을 구한다. 총수 줄이 없는 서식의 마지막 수단이다. */
export function findRoster(text: string): Record<AttendanceKey, RosterCount> {
  const out: Record<AttendanceKey, RosterCount> = {
    directors: { total: 0, present: 0, span: null },
    auditCommittee: { total: 0, present: 0, span: null },
  };
  for (const m of allMatches(ROSTER_RE, text)) {
    const title = m[1].replace(/\s+/g, '');
    const mark = m[3].replace(/\s+/g, '');
    const key: AttendanceKey = title.includes('감사') ? 'auditCommittee' : 'directors';
    const group = out[key];
    group.total += 1;
    if (ATTENDED.some(word => mark.includes(word))) group.present += 1;
    const end = m.index + m[0].length;
    if (group.span === null) group.span = [m.index, end];
    else group.span[1] = end;
  }
  return out;
}

export interface AttendanceResult {
  total: RuleHit<number> | null;
  present: RuleHit<number> | null;
  conflicts: string[];
}

/** 총 인원과 출석 인원. 규칙마다 신뢰도가 달라 우선순위대로 본다. */
export function findAttendance(text: string, key: AttendanceKey): AttendanceResult {
  const subject = SUBJECTS[key];
  let total: RuleHit<number> | null = null;
  let present: RuleHit<number> | null = null;
  const conflicts: string[] = [];

  for (const m of allMatches(compile(BOTH_RE, subject), text)) {
    const t = Number(m[1]);
    const p = Number(m[2]);
    const end = m.index + m[0].length;
    if (total === null) {
      total = { value: t, start: m.index, end, rule: 'COUNT_BOTH' };
      present = { value: p, start: m.index, end, rule: 'COUNT_BOTH' };
    } else if (total.value !== t || present?.value !== p) {
      conflicts.push(`${t}/${p}`);
    }
  }

  if (total === null) {
    for (const m of allMatches(compile(ALL_RE, subject), text)) {
      const n = Number(m[1]);
      const end = m.index + m[0].length;
      total = { value: n, start: m.index, end, rule: 'COUNT_ALL_PRESENT' };
      present = { value: n, start: m.index, end, rule: 'COUNT_ALL_PRESENT' };
      break;
    }
  }

  if (total === null) {
    const m = firstMatch(compile(TOTAL_RE, subject), text);
    if (m) {
      total = { value: Number(m[1]), start: m.index, end: m.index + m[0].length, rule: 'COUNT_TOTAL_LABEL' };
    }
  }
  if (present === null) {
    const m = firstMatch(compile(PRESENT_RE, subject), text);
    if (m) {
      present = { value: Number(m[1]), start: m.index, end: m.index + m[0].length, rule: 'COUNT_PRESENT_LABEL' };
    }
  }

  if (total === null || present === null) {
    const roster = findRoster(text)[key];
    if (roster.span && roster.total) {
      const [lo, hi] = roster.span;
      if (total === null) total = { value: roster.total, start: lo, end: hi, rule: 'COUNT_ROSTER' };
      if (present === null) present = { value: roster.present, start: lo, end: hi, rule: 'COUNT_ROSTER' };
    }
  }

  return { total, present, conflicts };
}

/**
 * 출석현황을 찾을 범위의 끝 — **첫 의안이 시작하기 전까지**다.
 *
 * 이 빗장이 없으면 의안 안의 표결 문장(`출석이사 3명 전원이 찬성하여`)을 회의
 * 전체의 출석 인원으로 잘못 읽는다. 의안마다 제척으로 수가 달라지므로 그 값은
 * 회의의 출석 인원이 아니다.
 */
export function attendanceScope(text: string): number {
  const marks = agendaMarks(text);
  return marks.length > 0 ? marks[0] : Math.min(text.length, 2000);
}

/** 이사와 감사를 함께 읽는다. **감사가 아예 없는 회사**를 여기서 판정한다. */
export function findAttendancePair(text: string): Record<AttendanceKey, AttendanceResult> {
  const head = text.slice(0, attendanceScope(text));
  const directors = findAttendance(head, 'directors');
  const audit = findAttendance(head, 'auditCommittee');

  const readDirectors = directors.total !== null && directors.present !== null;
  const noAuditWord = !re('감\\s*사(?!\\s*보고)').test(head);
  if (readDirectors && audit.total === null && audit.present === null) {
    const roster = findRoster(head).auditCommittee;
    if (roster.total === 0 || noAuditWord) {
      // 감사를 두지 않는 회사는 감사 줄 자체가 없다. 이사 쪽을 제대로 읽었을
      // 때에 한해 0 으로 보고, 읽기 실패와 구분되도록 규칙 이름을 남긴다.
      const anchor = directors.total!.start;
      audit.total = { value: 0, start: anchor, end: anchor, rule: 'COUNT_ABSENT_ZERO' };
      audit.present = { value: 0, start: anchor, end: anchor, rule: 'COUNT_ABSENT_ZERO' };
    }
  }
  return { directors, auditCommittee: audit };
}

// ---------------------------------------------------------------- 의안 머리말

// 의안 규칙 자체는 아직 옮기지 않았다. 인원수 범위를 끊는 데 필요한 **머리말
// 위치 판정**만 옮겨 온 것이다.
const AGENDA_RE = re(
  '^[\\s\\W]{0,6}?(?:'
  + '[제第]\\s*(?<n1>\\d+)\\s*(?:[호號]\\s*)?(?<kind1>의\\s*안|안\\s*건|보\\s*고\\s*사\\s*항)'
  + '|(?<kind2>의\\s*안|안\\s*건|보\\s*고\\s*사\\s*항)\\s*[제第]\\s*(?<n2>\\d+)\\s*[호號]'
  + '|(?<kind3>보\\s*고\\s*사\\s*항)\\s*(?<n3>\\d+)\\s*[.)]'
  + ')',
  'gm'
);

const BARE_AGENDA_RE = re('^[ \\t]*(\\d{1,2})[ \\t]*[.)][ \\t]*(?=\\S)', 'gm');
const AGENDA_TAIL_RE = re('건\\s*(?:[(（][^)）]*[)）])?\\s*$');
const TITLE_END_RE = re('(?:건|보고)\\s*(?:[(（][^)）]*[)）])?\\s*$');

const TITLE_MAX_LINES = 3;
const TITLE_MAX_CHARS = 200;

/** 제목이 끝나는 자리. 한 줄씩 늘려 가며 `…의 건` 으로 끝나는 지점에서 멈춘다. */
export function titleBlock(text: string, start: number, limit: number): [number, number] {
  let cap = Math.min(limit, start + TITLE_MAX_CHARS);
  const blank = text.indexOf('\n\n', start);
  if (blank !== -1) cap = Math.min(cap, blank);

  let at = start;
  let lines = 0;
  let firstEnd: number | null = null;

  while (lines < TITLE_MAX_LINES) {
    const nl = text.indexOf('\n', at);
    const lineEnd = nl === -1 || nl > cap ? cap : nl;
    if (firstEnd === null) firstEnd = lineEnd;
    if (TITLE_END_RE.test(text.slice(start, lineEnd).replace(/\s+/g, ' ').trim())) {
      return [start, lineEnd];
    }
    if (lineEnd >= cap) break;
    at = lineEnd + 1;
    lines += 1;
  }
  return [start, firstEnd ?? cap];
}

/**
 * 의안 머리말이 시작하는 오프셋들.
 *
 * 구역 머리말 없이 `1. 제목` 으로만 적는 서식은 라벨 줄(`1. 일시: …`)과 구분해야
 * 하므로, **한국 의사록에서 의안 제목이 `…의 건` 으로 끝난다는 관행**을 판별에
 * 쓴다. 내용어를 보지 않으므로 회사가 달라도 그대로 듣는다.
 */
export function agendaMarks(text: string): number[] {
  const marked = [...allMatches(AGENDA_RE, text)].map(m => m.index);
  if (marked.length > 0) return marked;

  const bare: number[] = [];
  for (const m of allMatches(BARE_AGENDA_RE, text)) {
    const [start, end] = titleBlock(text, m.index + m[0].length, text.length);
    const title = text.slice(start, end).replace(/\s+/g, ' ').trim();
    if (title.includes('：') || title.includes(':') || !AGENDA_TAIL_RE.test(title)) continue;
    bare.push(m.index);
  }
  return bare;
}
