const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 November", in the phone's local time. */
export function dayMonth(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${LONG[d.getMonth()]}`;
}

/** "November 2026". */
export function monthTitle(year: number, month: number): string {
  return `${LONG[month]} ${year}`;
}

/** "1 Oct to 9 Nov" (one date for a same-day jar). The year is added only when the jar spans years or is not from this year. */
export function jarRange(startedAt: number, sealedAt: number): string {
  const a = new Date(startedAt);
  const b = new Date(sealedAt);
  const part = (d: Date, year: boolean) => `${d.getDate()} ${SHORT[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ''}`;
  const year = a.getFullYear() !== b.getFullYear() || b.getFullYear() !== new Date().getFullYear();
  if (a.toDateString() === b.toDateString()) return part(a, year);
  return `${part(a, year)} to ${part(b, year)}`;
}
