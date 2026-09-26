/* Spend totals. The rules:
   - expenses add to spend, refunds subtract from it;
   - transfers are never spend (card bills, moving money, cash withdrawals);
   - income is counted on its own and never mixed into spend. */

import { monthStart, monthEnd, monthKey, sameDayLastMonth } from './dates.js';

/* What one transaction contributes to spend. */
export function spendOf(t) {
  if (t.type === 'expense') return t.amount;
  if (t.type === 'refund') return -t.amount;
  return 0;
}

export function inRange(t, from, to) {
  return (!from || t.date >= from) && (!to || t.date <= to);
}

export function spendTotal(txns, from, to) {
  let sum = 0;
  for (const t of txns) if (inRange(t, from, to)) sum += spendOf(t);
  return sum;
}

export function incomeTotal(txns, from, to) {
  let sum = 0;
  for (const t of txns) if (t.type === 'income' && inRange(t, from, to)) sum += t.amount;
  return sum;
}

export function monthSpend(txns, key) {
  return spendTotal(txns, monthStart(key), monthEnd(key));
}

/* Totals for any already-filtered list (Activity's header, CSV, …). */
export function summarize(txns) {
  let spend = 0, income = 0, transfers = 0;
  for (const t of txns) {
    spend += spendOf(t);
    if (t.type === 'income') income += t.amount;
    if (t.type === 'transfer') transfers += t.amount;
  }
  return { spend, income, transfers, count: txns.length };
}

/* Spend per key (category, account…). keyFn returns the bucket id. */
export function spendBy(txns, keyFn) {
  const out = new Map();
  for (const t of txns) {
    const v = spendOf(t);
    if (!v) continue;
    const k = keyFn(t);
    out.set(k, (out.get(k) || 0) + v);
  }
  return out;
}

/* Home's big number and its comparison line: this month's spend against
   last month up to the same day (31 Mar compares with all of February).
   hasHistory is false until there is spend before this month, so a new
   user is not told they spent "₹X more than last month". */
export function monthToDate(txns, today) {
  const key = monthKey(today);
  const current = monthSpend(txns, key);
  const prevDay = sameDayLastMonth(today);
  const previous = spendTotal(txns, monthStart(monthKey(prevDay)), prevDay);
  const start = monthStart(key);
  const hasHistory = txns.some((t) => t.date < start && spendOf(t) !== 0);
  return { current, previous, diff: current - previous, hasHistory };
}
