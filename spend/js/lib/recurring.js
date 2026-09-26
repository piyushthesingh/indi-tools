/* Recurring transactions.

   A rule:
   { id, template: { type, amount, accountId, toAccountId, categoryId, payee, note },
     frequency: "monthly" | "weekly" | "yearly",
     dayOfMonth (monthly, yearly), weekday (weekly, 0 = Sunday),
     startDate, endDate | null, lastGeneratedDate | null,
     mode: "confirm" | "auto", paused: boolean,
     pending: ["YYYY-MM-DD", …] }   occurrences waiting in the "To log" list

   Yearly rules repeat on the month of startDate, on dayOfMonth.

   Never twice, by two locks:
   1. lastGeneratedDate: each run only looks at dates after it, and moves it
      forward to today.
   2. Every occurrence has a fixed transaction id, rec:<ruleId>:<date>, so
      even a repeated write replaces rather than duplicates. */

import { addDays, daysInMonth, makeDateStr, parseDateStr, weekday, monthKey, addMonths, monthStart } from './dates.js';

/* At most this many occurrences per rule per run. When a rule starts far in
   the past, the most recent ones are kept (the oldest are dropped). */
export const MAX_CATCH_UP = 120;
const SAFETY_STOP = 20000; // guards the loops against a corrupt rule

export function occurrenceId(ruleId, date) {
  return `rec:${ruleId}:${date}`;
}

const clampDay = (y, m, d) => makeDateStr(y, m, Math.min(d, daysInMonth(y, m)));

/* Occurrence dates in (after, upTo], also within [startDate, endDate]. */
export function occurrencesBetween(rule, after, upTo) {
  const from = [addDays(after, 1), rule.startDate].sort().at(-1);
  const to = rule.endDate && rule.endDate < upTo ? rule.endDate : upTo;
  const out = [];
  if (from > to) return out;

  if (rule.frequency === 'weekly') {
    let d = addDays(from, (rule.weekday - weekday(from) + 7) % 7);
    for (; d <= to && out.length < SAFETY_STOP; d = addDays(d, 7)) out.push(d);
    return out;
  }
  if (rule.frequency === 'yearly') {
    const month = parseDateStr(rule.startDate).m;
    for (let y = +from.slice(0, 4); y <= +to.slice(0, 4) && out.length < SAFETY_STOP; y++) {
      const d = clampDay(y, month, rule.dayOfMonth);
      if (d >= from && d <= to) out.push(d);
    }
    return out;
  }
  // monthly
  for (let k = monthKey(from); monthStart(k) <= to && out.length < SAFETY_STOP; k = addMonths(k, 1)) {
    const d = clampDay(+k.slice(0, 4), +k.slice(5, 7), rule.dayOfMonth);
    if (d >= from && d <= to) out.push(d);
  }
  return out;
}

/* The next date this rule will fire on or after `date` (for display). */
export function nextOccurrence(rule, date) {
  return occurrencesBetween(rule, addDays(date, -1), addDays(date, 400))[0] ?? null;
}

/* Build the transaction for one occurrence. */
export function occurrenceTransaction(rule, date, now = new Date().toISOString()) {
  const t = rule.template;
  return {
    id: occurrenceId(rule.id, date),
    type: t.type,
    amount: t.amount,
    date,
    accountId: t.accountId,
    toAccountId: t.type === 'transfer' ? t.toAccountId : null,
    categoryId: t.type === 'transfer' ? null : t.categoryId,
    payee: t.payee || '',
    note: t.note || '',
    recurringId: rule.id,
    createdAt: now,
    updatedAt: now,
  };
}

/* One app-open pass over every rule. Pure: returns what to write.
   - auto rules: transactions to save;
   - confirm rules: dates added to the rule's pending list;
   - every touched rule: lastGeneratedDate moved to today.
   Paused rules still advance lastGeneratedDate, so un-pausing does not
   flood the list with everything missed while paused. */
export function generate(rules, today, existingIds = new Set(), now) {
  const transactions = [];
  const updatedRules = [];
  for (const rule of rules) {
    const after = rule.lastGeneratedDate || addDays(rule.startDate, -1);
    if (after >= today) continue; // already done today (or the clock went backwards)
    const dates = rule.paused ? [] : occurrencesBetween(rule, after, today).slice(-MAX_CATCH_UP);
    let pending = rule.pending || [];
    if (rule.mode === 'auto') {
      for (const d of dates) {
        const t = occurrenceTransaction(rule, d, now);
        if (!existingIds.has(t.id)) transactions.push(t);
      }
    } else if (dates.length) {
      pending = [...new Set([...pending, ...dates.filter((d) => !existingIds.has(occurrenceId(rule.id, d)))])].sort();
    }
    updatedRules.push({ ...rule, pending, lastGeneratedDate: today });
  }
  return { transactions, rules: updatedRules };
}

/* When an existing rule's start date moves earlier, only the new gap
   (newStart … the day before the old start, and not past what was already
   generated) is filled in. Dates after the old start were already offered
   and may have been skipped on purpose, so they are not brought back. */
export function backfill(rule, oldStart, existingIds = new Set(), now) {
  if (!rule.lastGeneratedDate || rule.startDate >= oldStart) return { transactions: [], pending: rule.pending || [] };
  const gapEnd = [addDays(oldStart, -1), rule.lastGeneratedDate, rule.endDate || '9999-12-31'].sort()[0];
  const gapRule = { ...rule, endDate: gapEnd, lastGeneratedDate: null, pending: [] };
  const out = generate([gapRule], rule.lastGeneratedDate, existingIds, now);
  const pending = [...new Set([...(rule.pending || []), ...out.rules[0].pending])].sort();
  return { transactions: out.transactions, pending };
}

/* How many recurring rules point at an account or category id. */
export function ruleUsage(id, rules) {
  return rules.filter((r) => r.template && (r.template.accountId === id || r.template.toAccountId === id || r.template.categoryId === id)).length;
}

/* Everything waiting in "To log", oldest first. */
export function pendingItems(rules) {
  const out = [];
  for (const r of rules) for (const date of r.pending || []) out.push({ rule: r, date });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function describeFrequency(rule) {
  const ord = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  if (rule.frequency === 'weekly') return 'Every ' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][rule.weekday];
  if (rule.frequency === 'yearly') {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseDateStr(rule.startDate).m - 1];
    return `Every year on ${rule.dayOfMonth} ${m}`;
  }
  return rule.dayOfMonth >= 31 ? 'Monthly on the last day' : `Monthly on the ${ord(rule.dayOfMonth)}`;
}

export function validateRule(r) {
  if (!['monthly', 'weekly', 'yearly'].includes(r.frequency)) return 'Pick how often.';
  if (r.frequency === 'weekly' && !(r.weekday >= 0 && r.weekday <= 6)) return 'Pick a weekday.';
  if (r.frequency !== 'weekly' && !(r.dayOfMonth >= 1 && r.dayOfMonth <= 31)) return 'Pick a day of the month.';
  if (!r.startDate) return 'Pick a start date.';
  if (r.endDate && r.endDate < r.startDate) return 'The end date is before the start date.';
  if (!(Number.isInteger(r.template?.amount) && r.template.amount > 0)) return 'Enter an amount.';
  if (!r.template.accountId) return 'Pick a payment method.';
  if (r.template.type === 'transfer') {
    if (!r.template.toAccountId || r.template.toAccountId === r.template.accountId) return 'Pick where the money goes.';
  } else if (!r.template.categoryId) return 'Pick a category.';
  return null;
}

