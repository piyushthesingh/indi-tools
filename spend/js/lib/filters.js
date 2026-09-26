/* Activity filters. A filter object:
   { month: "YYYY-MM" | null, from, to, type, categoryId, accountId, group, q }
   `month` wins over from/to; month "all" means no date limit. Empty values
   mean "any". */

import { monthStart, monthEnd } from './dates.js';
import { groupOf } from './defaults.js';
import { summarize } from './totals.js';

export const FILTER_KEYS = ['month', 'from', 'to', 'type', 'categoryId', 'accountId', 'group'];
const PARAM = { month: 'month', from: 'from', to: 'to', type: 'type', categoryId: 'cat', accountId: 'acct', group: 'group' };

export function dateRange(f) {
  if (f.month === 'all') return { from: null, to: null };
  if (f.month) return { from: monthStart(f.month), to: monthEnd(f.month) };
  return { from: f.from || null, to: f.to || null };
}

export function applyFilters(txns, f, accountsById = new Map()) {
  const { from, to } = dateRange(f);
  const q = (f.q || '').trim().toLowerCase();
  const kindOf = (id) => accountsById.get(id)?.kind;
  return txns.filter((t) => {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.accountId && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
    if (f.group) {
      const g = [t.accountId, t.toAccountId].filter(Boolean).map((id) => groupOf(kindOf(id)));
      if (!g.includes(f.group)) return false;
    }
    if (q && !`${t.payee || ''}\n${t.note || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/* [{ date, items, spend, income }] in the order given (callers sort first). */
export function groupByDate(txns) {
  const groups = [];
  let cur = null;
  for (const t of txns) {
    if (!cur || cur.date !== t.date) {
      cur = { date: t.date, items: [] };
      groups.push(cur);
    }
    cur.items.push(t);
  }
  for (const g of groups) Object.assign(g, summarize(g.items));
  return groups;
}

/* Filters live in the URL hash (#/activity?month=2026-09&cat=…) so other
   screens can link straight to a filtered list. */
export function filtersToQuery(f) {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) if (f[k]) p.set(PARAM[k], f[k]);
  return p.toString();
}

export function filtersFromQuery(query) {
  const p = new URLSearchParams(query);
  const f = {};
  for (const k of FILTER_KEYS) {
    const v = p.get(PARAM[k]);
    if (v) f[k] = v;
  }
  return f;
}
