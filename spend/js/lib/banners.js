/* Home banners, in the spec's priority order. At most `max` are shown.
   1. recurring items waiting to be logged
   2. a card due within 5 days with billed due > 0 (overdue ones first)
   3. a card whose statement closes within 3 days
   4. budget at 80% or over (overall, then categories)
   5. backup older than 7 days, or never backed up once there are 10+
      transactions
   Pure: takes plain numbers, returns plain objects. */

import { diffDays } from './dates.js';

export function computeBanners({
  pendingCount = 0,
  cardSummaries = [], // [{ card, summary }]
  budget = null, // budgetStatus()
  categoryBudgets = [], // categoryStatus() rows, with name
  lastBackupAt = null, // ISO timestamp or null
  transactionCount = 0,
  today,
  todayFromIso = (iso) => iso.slice(0, 10),
}, max = 2) {
  const out = [];

  if (pendingCount > 0) out.push({ kind: 'recurring', priority: 1, count: pendingCount });

  const due = cardSummaries
    .filter(({ summary: s }) => s.billedDue > 0 && s.daysToDue <= 5)
    .sort((a, b) => a.summary.daysToDue - b.summary.daysToDue);
  for (const { card, summary } of due) out.push({ kind: 'due', priority: 2, card, summary });

  const closing = cardSummaries
    .filter(({ summary: s }) => s.daysToStatement >= 0 && s.daysToStatement <= 3)
    .sort((a, b) => a.summary.daysToStatement - b.summary.daysToStatement);
  for (const { card, summary } of closing) out.push({ kind: 'statement', priority: 3, card, summary });

  if (budget && budget.pct >= 0.8) out.push({ kind: 'budget', priority: 4, budget });
  for (const c of categoryBudgets) if (c.pct >= 0.8) out.push({ kind: 'categoryBudget', priority: 4, category: c });

  const days = lastBackupAt ? diffDays(todayFromIso(lastBackupAt), today) : null;
  if ((days != null && days > 7) || (days == null && transactionCount >= 10)) {
    out.push({ kind: 'backup', priority: 5, days });
  }

  return out.sort((a, b) => a.priority - b.priority).slice(0, max);
}
