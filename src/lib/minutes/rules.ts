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
// 라벨과 값을 가르는 글자. 열화본을 대량으로 재 보니 `_` 와 `*` 도 나왔다
// (`docs/minutes-ocr.md` 4-8). 전각 `＊` 는 ③ 좌표계에서 이미 반각으로 접힌다.
const COLON = '[:：ㆍ·∶;_*]';

/**
 * 낱말 안에 공백이 끼어도 잡는다. OCR 이 낱자를 벌려 놓는 경우가 여기 걸린다.
 *
 * **앞에 한글이 붙어 있으면 잡지 않는다.** 이 빗장이 없으면 `별도의 결의` 의
 * `의 결` 이 `의결` 로 읽힌다 — 실제로 그 때문에 가결을 보류로 잘못 읽은 건이
 * 54건 있었다. 벌려쓰기는 낱말 첫 글자부터 시작한다.
 */
const loose = (...chars: string[]) => '(?<![가-힣])' + chars.join('\\s*');

/** 파이썬 `str.strip(chars)` — 주어진 글자만 양끝에서 뗀다. */
function stripChars(value: string, chars: string): string {
  let lo = 0;
  let hi = value.length;
  while (lo < hi && chars.includes(value[lo])) lo += 1;
  while (hi > lo && chars.includes(value[hi - 1])) hi -= 1;
  return value.slice(lo, hi);
}

function lstripChars(value: string, chars: string): string {
  let lo = 0;
  while (lo < value.length && chars.includes(value[lo])) lo += 1;
  return value.slice(lo);
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

// ---------------------------------------------------------------- 의안

/**
 * 파이썬 `\W` 와 같은 뜻 — **낱말 글자가 아닌 것**.
 *
 * 파이썬의 `\w` 는 유니코드라 한글·한자도 낱말 글자로 본다. JS 의 `\w` 는 ASCII
 * 뿐이라 한글이 전부 `\W` 에 걸린다. 그대로 옮기면 머리말 앞의 여섯 글자를 한글로
 * 채울 수 있게 되어 `이에 의장은 제1호 의안을 상정하였다` 같은 **문장 중간을 의안
 * 머리말로 읽는다.** 유니코드 속성으로 파이썬과 같은 뜻을 적는다.
 */
const NON_WORD = '[^\\p{L}\\p{N}_]';

const AGENDA_RE = re(
  '^' + NON_WORD + '{0,6}?(?:'
  + '[제第]\\s*(?<n1>\\d+)\\s*(?:[호號]\\s*)?(?<kind1>의\\s*안|안\\s*건|보\\s*고\\s*사\\s*항)'
  + '|(?<kind2>의\\s*안|안\\s*건|보\\s*고\\s*사\\s*항)\\s*[제第]\\s*(?<n2>\\d+)\\s*[호號]'
  + '|(?<kind3>보\\s*고\\s*사\\s*항)\\s*(?<n3>\\d+)\\s*[.)]'
  + ')',
  'gmu'
);

/** 의안 구간이 여기까지 이어지지 않게 끊는 말 */
const AGENDA_STOP_RE = re(
  '^' + NON_WORD + '{0,6}?(?:' + label('폐', '회') + '|' + label('산', '회')
  + '|이상[과와]?\\s*같이|위와\\s*같이\\s*(?:결의|의결)'
  + '|위\\s*의사의\\s*경과|위\\s*결의를\\s*명확히|본\\s*의사록을\\s*작성'
  + '|의장은\\s*이상으로써)',
  'gmu'
);

// 앞에서 떼는 것과 뒤에서 떼는 것을 나눈다. 닫는 괄호를 뒤에서 떼면
// `…의 건(상법 제398조)` 이 잘린다.
const TITLE_LEAD = ' \t:：.·-–—「『【"\'';
const TITLE_TAIL = ' \t:：.·-–—"\'';

/** 제목 덩어리의 한계. 끝을 못 찾는 서식에서 본문까지 삼키지 않도록 막는다. */
const TITLE_MAX_LINES = 3;
const TITLE_MAX_CHARS = 200;

// 의안 제목은 `…의 건` 으로, 보고 제목은 `…보고` 로 끝난다. 뒤에 괄호주가 붙기도 한다.
// **빈 줄에 기대지 않는다** — PDF 에서 뽑은 본문에는 빈 줄이 없다.
const TITLE_END_RE = re('(?:건|보고)\\s*(?:[(（][^)）]*[)）])?\\s*$');

const BARE_AGENDA_RE = re('^[ \\t]*(\\d{1,2})[ \\t]*[.)][ \\t]*(?=\\S)', 'gm');
const AGENDA_TAIL_RE = re('건\\s*(?:[(（][^)）]*[)）])?\\s*$');

/** 폐회 문단을 찾을 때 거슬러 올라가는 한계. */
const CLOSING_LOOKBACK = 150;
const CLOSING_LOOKBACK_LINES = 2;

/** 제목이 끝나는 자리. 한 줄씩 늘려 가며 `…의 건` 으로 끝나는 지점에서 멈춘다. */
function titleBlock(text: string, start: number, limit: number): [number, number] {
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
 * 제목에서 앞뒤 장식을 떼고, **뗀 뒤의 구간**을 돌려준다.
 *
 * 값과 근거 구간이 정확히 같아야 한다. 근거가 한 글자라도 값보다 넓으면 화면에서
 * 하이라이트가 엉뚱한 곳까지 덮는다.
 */
function titleIn(text: string, start: number, end: number): [string, number, number] {
  const raw = text.slice(start, end);
  const title = rstripChars(lstripChars(raw, TITLE_LEAD), TITLE_TAIL);
  if (!title) return ['', start, end];
  const at = start + raw.indexOf(title);
  return [title, at, at + title.length];
}

/** 의안 머리말 하나 — 어디서 시작하는지, 몇 호인지, 결의인지 보고인지. */
interface AgendaMarker {
  index: number;
  end: number;
  number: number;
  kind: AgendaKind;
}

export type AgendaKind = '결의' | '보고';

/**
 * 의안 머리말들.
 *
 * 구역 머리말 없이 `1. 제목` 으로만 적는 서식은 라벨 줄(`1. 일시: …`)과 구분해야
 * 하므로, **한국 의사록에서 의안 제목이 `…의 건` 으로 끝난다는 관행**을 판별에
 * 쓴다. 내용어를 보지 않으므로 회사가 달라도 그대로 듣는다.
 */
export function agendaMarkers(text: string): AgendaMarker[] {
  const marked: AgendaMarker[] = [];
  for (const m of allMatches(AGENDA_RE, text)) {
    const g = m.groups!;
    const kindRaw = (g.kind1 || g.kind2 || g.kind3 || '').replace(/ /g, '');
    marked.push({
      index: m.index,
      end: m.index + m[0].length,
      number: Number(g.n1 ?? g.n2 ?? g.n3),
      kind: kindRaw === '보고사항' ? '보고' : '결의',
    });
  }
  if (marked.length > 0) return marked;

  const bare: AgendaMarker[] = [];
  for (const m of allMatches(BARE_AGENDA_RE, text)) {
    const end = m.index + m[0].length;
    const [start, stop] = titleBlock(text, end, text.length);
    const title = text.slice(start, stop).replace(/\s+/g, ' ').trim();
    if (title.includes('：') || title.includes(':') || !AGENDA_TAIL_RE.test(title)) continue;
    bare.push({ index: m.index, end, number: Number(m[1]), kind: '결의' });
  }
  return bare;
}

/**
 * 폐회를 알리는 **문단이 시작하는 자리**. 마지막 의안의 본문은 여기서 끊는다.
 *
 * 폐회 문장은 `의장은 위 의안의 심의 및 의결을 모두 마쳤음을 확인하고 / 14:45
 * 이사회의 폐회를 선언하였다` 처럼 두 줄에 걸친다. `폐회` 라는 낱말이 나온 줄에서
 * 끊으면 앞줄의 `의결` 이 의안의 결론으로 잘못 읽힌다.
 */
function closingAt(text: string): number {
  const m = firstMatch(CLOSE_PROSE_RE, text);
  let at = m ? m.index : -1;
  for (const one of LINE_LABELS.closed) {
    const lm = firstMatch(re('^' + ITEM_PREFIX + one + '\\s*' + COLON, 'gm'), text);
    if (lm && (at === -1 || lm.index < at)) at = lm.index;
  }
  if (at === -1) return text.length;

  // 폐회 선언이 두 줄에 걸치는 서식이 있다. 앞줄까지 끊어야 그 줄의 `의결` 이
  // 의안의 결론으로 잘못 읽히지 않는다. 다만 **문장이 끝난 줄은 잇지 않는다** —
  // 잇기 시작하면 앞 의안의 결의문까지 삼킨다.
  const bound = Math.max(0, at - CLOSING_LOOKBACK);
  let start = text.lastIndexOf('\n', at - 1) + 1;
  for (let i = 0; i < CLOSING_LOOKBACK_LINES; i++) {
    if (start <= bound) break;
    const previous = text.lastIndexOf('\n', start - 2) + 1;
    if (previous >= start) break;
    const line = text.slice(previous, start - 1).replace(/\s+$/, '');
    if (line.endsWith('다.') || line.endsWith('.') || line.endsWith('。')) break;
    start = previous;
  }
  return start;
}

export interface AgendaFound {
  number: number;
  kind: AgendaKind;
  marker: RuleHit<number>;
  title: RuleHit<string>;
  bodyRange: [number, number];
}

/** 의안 경계와 제목. 본문은 다음 의안이 시작하기 직전까지로 자른다. */
export function findAgenda(text: string): AgendaFound[] {
  const marks = agendaMarkers(text);
  if (marks.length === 0) return [];

  const closing = closingAt(text);
  const items: AgendaFound[] = [];

  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    const limit = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const [blockStart, blockEnd] = titleBlock(text, mark.end, limit);
    const [rawTitle, titleStart, titleEnd] = titleIn(text, blockStart, blockEnd);
    const title = rawTitle.replace(/\s+/g, ' ');

    const bodyStart = titleEnd;
    let bodyEnd = i + 1 < marks.length ? marks[i + 1].index : text.length;
    bodyEnd = Math.max(bodyStart, Math.min(bodyEnd, closing));

    // 파이썬의 `search(text, pos, endpos)` 를 그대로 흉내 낸다 — 앞부분을 남긴 채
    // 끝만 자르면 `^` 가 여전히 진짜 줄머리에서만 걸린다.
    const scoped = text.slice(0, bodyEnd);
    AGENDA_STOP_RE.lastIndex = bodyStart;
    const stop = AGENDA_STOP_RE.exec(scoped);
    if (stop) bodyEnd = stop.index;

    items.push({
      number: mark.number,
      kind: mark.kind,
      marker: { value: mark.number, start: mark.index, end: mark.end, rule: 'AGENDA_MARK' },
      title: { value: title, start: titleStart, end: titleEnd, rule: 'AGENDA_TITLE' },
      bodyRange: [bodyStart, bodyEnd],
    });
  }
  return items;
}

/**
 * 출석현황을 찾을 범위의 끝 — **첫 의안이 시작하기 전까지**다.
 *
 * 이 빗장이 없으면 의안 안의 표결 문장(`출석이사 3명 전원이 찬성하여`)을 회의
 * 전체의 출석 인원으로 잘못 읽는다. 의안마다 제척으로 수가 달라지므로 그 값은
 * 회의의 출석 인원이 아니다.
 */
export function attendanceScope(text: string): number {
  const marks = agendaMarkers(text);
  return marks.length > 0 ? marks[0].index : Math.min(text.length, 2000);
}

// ---------------------------------------------------------------- 가결 여부

const VOTE_WORDS = ['가결', '부결', '보류', '연기', '철회', '승인', '의결', '채택'];

/** 결의 낱말. 본문에는 심의 과정의 말이 섞이므로 **마지막에 나오는 것**이 결론이다. */
const VOTE_WORD_RE = re(VOTE_WORDS.map(w => loose(...w)).join('|'), 'g');

/**
 * 결론 문장 안에서만 본다. 순서가 뜻을 가른다 — `수정하여 가결` 은 수정가결이다.
 * 수정 언급 없이 가결이면 원안가결로 본다. 상법 실무의 분류가 그렇고,
 * `이를 가결하다` 처럼 원안이라는 말이 생략되는 서식이 많다.
 */
const RESOLUTION_RULES: [string, RegExp][] = [
  ['부결', re(loose('부', '결'))],
  ['보류', re([
    loose('보', '류'),
    loose('연', '기') + '(?!한)',
    loose('철', '회'),
    loose('차', '기') + '\\s*이\\s*사\\s*회',
  ].join('|'))],
  ['수정가결', re(loose('수', '정'))],
  ['원안가결', re(['가결', '승인', '의결', '채택'].map(w => loose(...w)).join('|'))],
];

const VOTE_RE: Record<VoteKey, RegExp> = {
  for: re('찬\\s*성\\s*[:：]?\\s*(\\d+)\\s*[명인표]'),
  against: re('반\\s*대\\s*[:：]?\\s*(\\d+)\\s*[명인표]'),
  abstain: re('기\\s*권\\s*[:：]?\\s*(\\d+)\\s*[명인표]'),
};

export type VoteKey = 'for' | 'against' | 'abstain';

const UNANIMOUS_RE = re([
  loose(...'만장일치'),
  loose('전', '원') + '\\s*이?\\s*찬\\s*성',
  loose('이', '의') + '\\s*없\\s*이',
].join('|'));

/**
 * 결론 문장의 구간. 마지막 결의 낱말이 든 문장 하나만 돌려준다.
 *
 * 본문 전체를 보면 심의 과정의 `연기`·`철회` 같은 말이 결론을 덮어쓴다. 실제로
 * 그 때문에 가결을 보류로 잘못 읽은 건이 81건 있었다.
 */
function conclusion(body: string): [number, number] | null {
  let last: RegExpExecArray | null = null;
  for (const m of allMatches(VOTE_WORD_RE, body)) last = m;
  if (last === null) return null;
  const head = Math.max(
    body.lastIndexOf('다.', last.index - 2) + 2,
    body.lastIndexOf('\n\n', last.index - 2) + 2,
    0
  );
  return [head, Math.min(body.length, last.index + last[0].length + 12)];
}

export interface ResolutionFound {
  resolution: RuleHit<string> | null;
  votes: Partial<Record<VoteKey, RuleHit<number>>>;
  unanimous: RuleHit<true> | null;
}

export function findResolution(
  text: string,
  bodyStart: number,
  bodyEnd: number,
  kind: AgendaKind
): ResolutionFound {
  const body = text.slice(bodyStart, bodyEnd);
  const out: ResolutionFound = { resolution: null, votes: {}, unanimous: null };

  const span = conclusion(body);
  if (span) {
    const sentence = body.slice(span[0], span[1]);
    for (const [name, pattern] of RESOLUTION_RULES) {
      const m = firstMatch(pattern, sentence);
      if (m) {
        const at = bodyStart + span[0] + m.index;
        out.resolution = { value: name, start: at, end: at + m[0].length, rule: `RESOLUTION_${name}` };
        break;
      }
    }
  }
  if (out.resolution === null && kind === '보고') {
    out.resolution = {
      value: '해당없음',
      start: bodyStart,
      end: bodyStart,
      rule: 'RESOLUTION_REPORT_ONLY',
    };
  }

  for (const key of Object.keys(VOTE_RE) as VoteKey[]) {
    const m = firstMatch(VOTE_RE[key], body);
    if (m) {
      out.votes[key] = {
        value: Number(m[1]),
        start: bodyStart + m.index,
        end: bodyStart + m.index + m[0].length,
        rule: 'VOTE_COUNT',
      };
    }
  }

  const m = firstMatch(UNANIMOUS_RE, body);
  if (m) {
    out.unanimous = {
      value: true,
      start: bodyStart + m.index,
      end: bodyStart + m.index + m[0].length,
      rule: 'VOTE_UNANIMOUS',
    };
  }
  return out;
}

const SENTENCE_SPLIT = /(?<=[.。])\s+|\n/;
const SUMMARY_WORD_RE = re('가\\s*결|부\\s*결|승\\s*인|의\\s*결|보\\s*류|채\\s*택');

/**
 * 규칙만으로는 요약을 **쓰지 않고 고른다.** 결의 문장을 그대로 발췌한다.
 *
 * 문장을 생성하려면 모델이 필요하다 (`docs/minutes-plan.md` 3-2). 발췌는 원문이
 * 바뀌지 않는다는 장점이 있고, 사람이 검토할 때 어차피 이 문장을 본다.
 */
export function extractiveSummary(
  text: string,
  bodyStart: number,
  bodyEnd: number
): RuleHit<string> | null {
  const body = text.slice(bodyStart, bodyEnd);
  let best: [number, number] | null = null;
  let cursor = 0;

  for (const piece of body.split(SENTENCE_SPLIT)) {
    if (piece === undefined) continue;
    const at = body.indexOf(piece, cursor);
    if (at === -1) continue;
    cursor = at + piece.length;
    if (SUMMARY_WORD_RE.test(piece)) best = [at, at + piece.length];
  }
  if (best === null) return null;
  return {
    value: body.slice(best[0], best[1]).trim(),
    start: bodyStart + best[0],
    end: bodyStart + best[1],
    rule: 'SUMMARY_EXTRACTIVE',
  };
}

// ---------------------------------------------------------------- 재무제표 영향 후보

/**
 * 의안에 이 말이 나오면 어느 기준서를 펴 봐야 하는지. 판단은 사람이 하고, 규칙은
 * **어디를 볼지**까지만 좁힌다. 기준서 본문은 이미 저장소 안에 있다
 * (`src/data/standards/`, 문단 3,661건).
 */
const IMPACT_TRIGGERS: [string, string[], string][] = [
  ['유상증자|무상증자|신주\\s*발행|주식\\s*발행', ['k-ifrs-1032', 'k-ifrs-1033'], '자본 증가 · 주당이익 희석'],
  ['사채\\s*발행|회사채|전환사채|신주인수권부사채|교환사채', ['k-ifrs-1032', 'k-ifrs-1109', 'k-ifrs-1107'], '부채·자본 분류 · 상각후원가'],
  ['차\\s*입|대\\s*출|여신|한도\\s*약정|금전\\s*대여', ['k-ifrs-1107', 'k-ifrs-1109'], '차입금 인식 · 금융위험 공시'],
  ['지급\\s*보증|채무\\s*보증|담보\\s*제공', ['k-ifrs-1037', 'k-ifrs-1109'], '우발부채 · 금융보증계약'],
  ['배\\s*당|이익\\s*잉여금\\s*처분', ['k-ifrs-1001', 'k-ifrs-1010'], '미지급배당 · 보고기간후사건'],
  ['합\\s*병|분\\s*할|영업\\s*양수|주식\\s*양수|지분\\s*취득|출\\s*자', ['k-ifrs-1103', 'k-ifrs-1110', 'k-ifrs-1028'], '사업결합 · 연결범위'],
  ['리\\s*스|임대차\\s*계약', ['k-ifrs-1116'], '사용권자산 · 리스부채'],
  ['유형자산\\s*(?:취득|처분|양도)|부동산\\s*(?:취득|처분)|공장\\s*신설|설비\\s*투자', ['k-ifrs-1016', 'k-ifrs-1036'], '취득원가 · 손상'],
  ['무형자산|영업권|개발비|특허', ['k-ifrs-1038', 'k-ifrs-1036'], '무형자산 인식 · 손상'],
  ['특수\\s*관계자|계열회사\\s*거래|대주주\\s*거래', ['k-ifrs-1024'], '특수관계자 공시'],
  ['소\\s*송|분\\s*쟁|손해배상', ['k-ifrs-1037'], '충당부채 · 우발부채'],
  ['주식매수선택권|스톡옵션|성과급\\s*지급|임원\\s*보수', ['k-ifrs-1102', 'k-ifrs-1019', 'k-ifrs-1024'], '주식기준보상 · 종업원급여'],
  ['자기주식', ['k-ifrs-1032'], '자기주식 취득·처분'],
  ['재무제표\\s*승인|결산\\s*승인|감사보고', ['k-ifrs-1001', 'k-ifrs-1010'], '재무제표 승인일 · 보고기간후사건'],
];

// 자릿점은 쉼표지만, OCR 이 쉼표를 마침표로 읽는 일이 가장 잦다 — 열화본에서 센
// 오독 짝 중 1위이고 2위의 다섯 배였다 (`docs/minutes-ocr.md` 4-8). 그래서 마침표도
// 자릿점 자리에 받아 두고, 자릿점인지 소수점인지는 `toNumber` 가 모양으로 가른다.
const AMOUNT_RE = re(
  '(?:금[ \\t]*)?(\\d[\\d,.][ \\t\\d,.]*\\d|\\d)[ \\t]*'
  + '(억[ \\t]*원|백[ \\t]*만[ \\t]*원|천[ \\t]*원|만[ \\t]*원|원|USD|달러)',
  'g'
);

// 세 자리씩 끊긴 마침표 사슬은 소수점일 수 없다 — `5.000.000.000` 은 50억이다.
const DOT_GROUPED = /^\d{1,3}(?:\.\d{3})+$/;

const UNIT_SCALE: Record<string, number> = {
  '억원': 100_000_000,
  '백만원': 1_000_000,
  '천원': 1_000,
  '만원': 10_000,
  '원': 1,
};

/**
 * `5.000.000.000` 을 50억으로, `5.5` 를 5.5 로 읽는다.
 *
 * 쉼표는 언제나 자릿점이다. 마침표는 **세 자리씩 끊긴 사슬일 때만** 자릿점으로 보고,
 * 그 밖에는 소수점으로 둔다. 한국 의사록 금액에 소수점 세 자리가 오는 일은 없고
 * (`1.000억원` 이라 쓰지 않는다), 반대로 자릿점을 마침표로 읽는 오독은 흔하다.
 * 가르지 않으면 50억이 조용히 0원으로 들어간다 — 값이 비는 것보다 나쁘다.
 */
function toNumber(digits: string, unit: string): number | null {
  let plain = digits.replace(/[,\s]/g, '');
  if (DOT_GROUPED.test(plain)) plain = plain.replace(/\./g, '');
  const base = Number(plain);
  if (!Number.isFinite(base) || plain === '') return null;
  const key = unit.replace(/ /g, '');
  return key in UNIT_SCALE ? base * UNIT_SCALE[key] : base;
}

export interface ImpactAmount {
  raw: string;
  value: number | null;
  unit: string;
  start: number;
  end: number;
}

export interface ImpactFound {
  hasImpact: '판단필요' | '확인불가';
  standards: string[];
  reasons: string[];
  amounts: ImpactAmount[];
}

/** 재무제표 영향 — **사전 검토용 후보**만 만든다. 있음/없음 판단은 하지 않는다. */
export function findImpact(
  text: string,
  title: string,
  bodyStart: number,
  bodyEnd: number
): ImpactFound {
  const body = text.slice(bodyStart, bodyEnd);
  const scope = title + '\n' + body;
  const standards: string[] = [];
  const reasons: string[] = [];

  for (const [pattern, codes, why] of IMPACT_TRIGGERS) {
    if (re(pattern).test(scope)) {
      for (const code of codes) if (!standards.includes(code)) standards.push(code);
      reasons.push(why);
    }
  }

  const amounts: ImpactAmount[] = [];
  for (const m of allMatches(AMOUNT_RE, body)) {
    amounts.push({
      raw: m[0].trim(),
      value: toNumber(m[1], m[2]),
      unit: m[2].replace(/ /g, ''),
      start: bodyStart + m.index,
      end: bodyStart + m.index + m[0].length,
    });
  }

  return {
    hasImpact: standards.length > 0 ? '판단필요' : '확인불가',
    standards,
    reasons,
    amounts,
  };
}
