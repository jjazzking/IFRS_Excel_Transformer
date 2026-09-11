/**
 * 날짜 계산 — 달을 거슬러 올라갈 때 말일이 넘어가지 않게 한다.
 *
 * `setMonth` 만 쓰면 3월 31일에서 한 달을 빼면 2월 31일이 되고, 자바스크립트가
 * 이를 3월 3일로 되돌린다. 기말 조서에서 '3개월 전'이 엉뚱한 날이 되면 안 된다.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

export function todayIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/** 그 해 그 달의 마지막 날. */
function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * `iso` 에서 `months` 달만큼 거슬러 올라간 날짜.
 *
 * 원래 날짜가 그 달에 없으면(31일 → 2월) 그 달의 말일로 맞춘다.
 * 날짜가 아닌 값이 오면 오늘을 기준으로 삼는다 — 기준만 바뀔 뿐 달은 그대로 뺀다.
 */
export function monthsBefore(iso: string, months: number): string {
  const [y, m, d] = (isIsoDate(iso) ? iso : todayIso()).split('-').map(Number);
  const target = new Date(y, m - 1 - months, 1);
  const day = Math.min(d, lastDayOfMonth(target.getFullYear(), target.getMonth()));
  return [
    target.getFullYear(),
    String(target.getMonth() + 1).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}
