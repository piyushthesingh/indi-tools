/* Transaction dates are local calendar dates stored as "YYYY-MM-DD".
   "Today" always comes from the device's local clock, never from UTC.
   Calendar arithmetic below uses Date.UTC purely as a day counter, which
   is safe because it never mixes in a time zone. */

const pad = (n) => String(n).padStart(2, '0');

export function toDateStr(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

export function todayStr(now = new Date()) {
  return toDateStr(now);
}

export function isDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseDateStr(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function parseDateStr(s) {
  return { y: +s.slice(0, 4), m: +s.slice(5, 7), d: +s.slice(8, 10) };
}

/* month is 1-12 */
export function makeDateStr(y, m, d) {
  return y + '-' + pad(m) + '-' + pad(d);
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function dayNumber(s) {
  const { y, m, d } = parseDateStr(s);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function fromDayNumber(n) {
  const dt = new Date(n * 86400000);
  return makeDateStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(s, n) {
  return fromDayNumber(dayNumber(s) + n);
}

/* b - a in whole days */
export function diffDays(a, b) {
  return dayNumber(b) - dayNumber(a);
}

/* 0 = Sunday … 6 = Saturday */
export function weekday(s) {
  return new Date(dayNumber(s) * 86400000).getUTCDay();
}

/* "YYYY-MM" */
export function monthKey(s) {
  return s.slice(0, 7);
}

export function addMonths(key, n) {
  const y = +key.slice(0, 4);
  const m = +key.slice(5, 7) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12 + 1;
  return yy + '-' + pad(mm);
}

export function monthStart(key) {
  return key + '-01';
}

export function monthEnd(key) {
  return key + '-' + pad(daysInMonth(+key.slice(0, 4), +key.slice(5, 7)));
}

/* Same day-of-month in the previous month, clamped (31 Mar → 29 Feb). */
export function sameDayLastMonth(s) {
  const { y, m, d } = parseDateStr(s);
  const key = addMonths(monthKey(s), -1);
  const py = +key.slice(0, 4), pm = +key.slice(5, 7);
  return makeDateStr(py, pm, Math.min(d, daysInMonth(py, pm)));
}

export function inRange(s, from, to) {
  return s >= from && s <= to;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((x) => x.slice(0, 3));
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function monthName(key, { short = false, withYear = false } = {}) {
  const name = (short ? MONTHS_SHORT : MONTHS)[+key.slice(5, 7) - 1];
  return withYear ? name + ' ' + key.slice(0, 4) : name;
}

/* "5 Oct", or "5 Oct 2025" when not in the current year */
export function formatShort(s, today = todayStr()) {
  const { y, m, d } = parseDateStr(s);
  const base = d + ' ' + MONTHS_SHORT[m - 1];
  return y === +today.slice(0, 4) ? base : base + ' ' + y;
}

/* Header label for Activity groups: Today, Yesterday, or "Mon, 5 Oct" */
export function formatDayHeader(s, today = todayStr()) {
  if (s === today) return 'Today';
  if (s === addDays(today, -1)) return 'Yesterday';
  return WEEKDAYS[weekday(s)] + ', ' + formatShort(s, today);
}

export function isoNow() {
  return new Date().toISOString();
}
