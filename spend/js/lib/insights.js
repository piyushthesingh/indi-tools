/* Numbers behind the Insights screen. Every figure uses the same spend
   rule as Home (expenses − refunds, never transfers or income), so the
   chart total for a month always equals Home's number for that month. */

import { monthStart, monthEnd, addMonths } from './dates.js';
import { groupOf } from './defaults.js';
import { spendOf, monthSpend, incomeTotal, spendBy } from './totals.js';

const inMonth = (txns, key) => {
  const from = monthStart(key), to = monthEnd(key);
  return txns.filter((t) => t.date >= from && t.date <= to);
};

export const VIEWS = ['category', 'account', 'group'];

/* Spend for a month split three ways:
   category → categoryId, account → the account money left, group → that
   account's group. Returns rows sorted by amount (largest first) and the
   total. Rows can be negative when refunds beat spending in a bucket. */
export function breakdown(txns, key, view, accountsById = new Map()) {
  const month = inMonth(txns, key);
  const keyFn = {
    category: (t) => t.categoryId,
    account: (t) => t.accountId,
    group: (t) => groupOf(accountsById.get(t.accountId)?.kind),
  }[view];
  const rows = [...spendBy(month, keyFn)]
    .filter(([, amount]) => amount !== 0)
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return { rows, total };
}

/* Donut slices: positive rows only, the first `max - 1` kept and the rest
   folded into one "other" slice so the chart never has more than `max`
   segments. Shares are of the positive total. */
export function slices(rows, max = 6) {
  const pos = rows.filter((r) => r.amount > 0);
  const positiveTotal = pos.reduce((s, r) => s + r.amount, 0);
  let kept = pos;
  let other = null;
  if (pos.length > max) {
    kept = pos.slice(0, max - 1);
    const rest = pos.slice(max - 1);
    other = { id: '__other', amount: rest.reduce((s, r) => s + r.amount, 0), ids: rest.map((r) => r.id) };
  }
  const out = other ? [...kept, other] : kept;
  return { slices: out.map((s) => ({ ...s, share: positiveTotal ? s.amount / positiveTotal : 0 })), positiveTotal };
}

/* Total spend for the `n` months ending with `key`, oldest first. */
export function monthlyTotals(txns, key, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = addMonths(key, -i);
    out.push({ month: k, spend: monthSpend(txns, k) });
  }
  return out;
}

/* Payees by net spend for the month, grouped case-insensitively, showing
   the most recent spelling. Payees whose net is zero or less are left out. */
export function topPayees(txns, key, n = 5) {
  const map = new Map();
  for (const t of inMonth(txns, key)) {
    const v = spendOf(t);
    const name = (t.payee || '').trim();
    if (!v || !name) continue;
    const k = name.toLowerCase();
    const cur = map.get(k) || { name, amount: 0, count: 0, last: '' };
    cur.amount += v;
    cur.count += t.type === 'expense' ? 1 : 0;
    const stamp = t.date + (t.createdAt || '');
    if (stamp > cur.last) { cur.last = stamp; cur.name = name; }
    map.set(k, cur);
  }
  return [...map.values()]
    .filter((p) => p.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, n)
    .map(({ name, amount, count }) => ({ name, amount, count }));
}

export function monthSummary(txns, key) {
  const spend = monthSpend(txns, key);
  const income = incomeTotal(txns, monthStart(key), monthEnd(key));
  return { spend, income, net: income - spend };
}

/* Whole-number percentages that add up to exactly 100 (largest remainder),
   so a legend never reads 78% + 23%. Zero or negative amounts get null. */
export function wholePercents(amounts) {
  const pos = amounts.map((a) => (a > 0 ? a : 0));
  const total = pos.reduce((s, a) => s + a, 0);
  if (!total) return amounts.map(() => null);
  const raw = pos.map((a) => (a / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((s, a) => s + a, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).filter(([, i]) => pos[i] > 0).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; out[i]++; left--; }
  return out.map((v, i) => (pos[i] > 0 ? v : null));
}
