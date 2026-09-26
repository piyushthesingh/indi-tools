/* What quick add offers first: most used categories, the last payment
   method, known payees and each payee's last category. */

import { byNewest, categoryTypeFor } from './transactions.js';

/* Active categories for a transaction type, most used first, then by the
   user's order. */
export function rankCategories(categories, txns, txType) {
  const catType = categoryTypeFor(txType);
  const uses = new Map();
  for (const t of txns) if (t.categoryId) uses.set(t.categoryId, (uses.get(t.categoryId) || 0) + 1);
  return categories
    .filter((c) => c.type === catType && !c.archived)
    .sort((a, b) => (uses.get(b.id) || 0) - (uses.get(a.id) || 0) || (a.order ?? 0) - (b.order ?? 0));
}

/* The account used by the most recently entered transaction of this kind
   (money leaving for expense/transfer, landing for income/refund). */
export function lastUsedAccountId(txns, activeIds, txType = 'expense') {
  const active = new Set(activeIds);
  // items a recurring rule logged by itself say nothing about what the user last used
  const newest = txns.filter((t) => !t.recurringId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const sameType = newest.find((t) => t.type === txType && active.has(t.accountId));
  const any = newest.find((t) => active.has(t.accountId));
  return (sameType || any)?.accountId ?? activeIds[0] ?? null;
}

/* Distinct payees, most recent first, keeping the latest spelling. */
export function payeeList(txns, limit = 200) {
  const seen = new Set();
  const out = [];
  for (const t of [...txns].sort(byNewest)) {
    const p = (t.payee || '').trim();
    const k = p.toLowerCase();
    if (!p || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/* The category last used with this payee (case-insensitive), for the given
   transaction type, or null. */
export function lastCategoryForPayee(txns, payee, txType = 'expense') {
  const k = (payee || '').trim().toLowerCase();
  if (!k) return null;
  const catType = categoryTypeFor(txType);
  const hit = [...txns].sort(byNewest).find((t) =>
    t.categoryId && (t.payee || '').trim().toLowerCase() === k && categoryTypeFor(t.type) === catType);
  return hit?.categoryId ?? null;
}
