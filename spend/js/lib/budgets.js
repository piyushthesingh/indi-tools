/* Monthly budgets. A budget with month "default" applies to every month
   that has no budget of its own. */

import { monthKey, monthStart, monthEnd, daysInMonth, parseDateStr } from './dates.js';
import { monthSpend, spendBy } from './totals.js';

export function budgetFor(budgets, key) {
  return budgets.find((b) => b.month === key) || budgets.find((b) => b.month === 'default') || null;
}

/* Overall budget for the month containing `today`:
   safe per day = (limit − spent) / days left including today, floored at 0
   and rounded down to whole rupees. null when there is no overall limit. */
export function budgetStatus(budget, txns, today) {
  if (!budget?.totalLimit) return null;
  const key = monthKey(today);
  const { y, m, d } = parseDateStr(today);
  const daysLeft = daysInMonth(y, m) - d + 1;
  const spent = monthSpend(txns, key);
  const left = budget.totalLimit - spent;
  const perDay = left > 0 ? Math.floor(left / daysLeft / 100) * 100 : 0;
  return { limit: budget.totalLimit, spent, left, pct: spent / budget.totalLimit, daysLeft, perDay };
}

/* Per-category limits for the month: [{ categoryId, limit, spent, pct }],
   most used first. */
export function categoryStatus(budget, txns, key) {
  const limits = budget?.categoryLimits || {};
  const ids = Object.keys(limits).filter((id) => limits[id] > 0);
  if (!ids.length) return [];
  const from = monthStart(key), to = monthEnd(key);
  const spentBy = spendBy(txns.filter((t) => t.date >= from && t.date <= to), (t) => t.categoryId);
  return ids
    .map((id) => {
      const spent = spentBy.get(id) || 0;
      return { categoryId: id, limit: limits[id], spent, pct: spent / limits[id] };
    })
    .sort((a, b) => b.pct - a.pct);
}
