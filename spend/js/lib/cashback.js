/* Estimated cashback for a card over one statement cycle.

   card.cashback = { defaultPct, categoryPct: { categoryId: pct },
                     excludedCategoryIds: [], capPerCycle: paise | null }

   Each expense earns its category's rate (or the default); excluded
   categories earn nothing. A refund takes back cashback at the rate of its
   own category, which is "proportional" to what that spend earned. The
   total never goes below zero, and is capped per cycle. Result in whole
   paise, rounded down. Always shown as an estimate. */

export function rateFor(cb, categoryId) {
  if (!cb) return 0;
  if ((cb.excludedCategoryIds || []).includes(categoryId)) return 0;
  const specific = cb.categoryPct?.[categoryId];
  return specific != null ? specific : (cb.defaultPct || 0);
}

export function estimateCashback(card, txns, from, to) {
  const cb = card.cashback;
  if (!cb) return null;
  let earned = 0; // in paise × 100 (pct), to keep integer maths until the end
  for (const t of txns) {
    if (t.accountId !== card.id || t.date < from || t.date > to) continue;
    const rate = rateFor(cb, t.categoryId);
    if (!rate) continue;
    if (t.type === 'expense') earned += t.amount * rate;
    else if (t.type === 'refund') earned -= t.amount * rate;
  }
  let paise = Math.max(0, Math.floor(earned / 100 + 1e-9));
  const capped = cb.capPerCycle != null && paise > cb.capPerCycle;
  if (capped) paise = cb.capPerCycle;
  return { amount: paise, capped };
}

export function hasCashback(card) {
  const cb = card.cashback;
  return !!cb && ((cb.defaultPct || 0) > 0 || Object.values(cb.categoryPct || {}).some((v) => v > 0));
}
