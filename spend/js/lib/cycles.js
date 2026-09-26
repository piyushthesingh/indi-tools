/* Credit card statement cycles.

   For a card with statement day S and due day D:
   - effectiveDay clamps a day to the month (S = 31 in February → 28 or 29).
   - A statement closes at the end of its statement date, so a transaction
     dated on the statement date belongs to that statement.
   - Next statement = first statement date on or after today.
   - Last statement = most recent statement date strictly before today.
   - Current cycle = day after the last statement … next statement, inclusive.
   - Due date = first date after the statement date whose day equals
     effectiveDay(D): same month when that is later than the statement
     date, otherwise the following month. */

import { daysInMonth, makeDateStr, parseDateStr, addDays, diffDays, addMonths, monthKey, todayStr } from './dates.js';

export function effectiveDay(y, m, day) {
  return Math.min(day, daysInMonth(y, m));
}

/* The statement date for S inside a given month ("YYYY-MM"). */
export function statementDateInMonth(key, S) {
  const y = +key.slice(0, 4), m = +key.slice(5, 7);
  return makeDateStr(y, m, effectiveDay(y, m, S));
}

export function nextStatementDate(S, today = todayStr()) {
  const here = statementDateInMonth(monthKey(today), S);
  return here >= today ? here : statementDateInMonth(addMonths(monthKey(today), 1), S);
}

/* Most recent statement date strictly before `date`. */
export function statementBefore(S, date) {
  const here = statementDateInMonth(monthKey(date), S);
  return here < date ? here : statementDateInMonth(addMonths(monthKey(date), -1), S);
}

export function lastStatementDate(S, today = todayStr()) {
  return statementBefore(S, today);
}

/* The cycle that closes on a given statement date. */
export function cycleEndingOn(S, statementDate) {
  return { from: addDays(statementBefore(S, statementDate), 1), to: statementDate };
}

export function currentCycle(S, today = todayStr()) {
  return cycleEndingOn(S, nextStatementDate(S, today));
}

export function previousCycle(S, today = todayStr()) {
  return cycleEndingOn(S, lastStatementDate(S, today));
}

export function dueDateFor(statementDate, D) {
  const { y, m, d } = parseDateStr(statementDate);
  const same = effectiveDay(y, m, D);
  if (same > d) return makeDateStr(y, m, same);
  const key = addMonths(monthKey(statementDate), 1);
  return statementDateInMonth(key, D);
}

/* ─── amounts ─── */

const onCard = (t, id) => t.accountId === id;

/* Expenses minus refunds on the card, dated within [from, to]. */
export function netSpend(cardId, txns, from, to) {
  let sum = 0;
  for (const t of txns) {
    if (!onCard(t, cardId) || t.date < from || t.date > to) continue;
    if (t.type === 'expense') sum += t.amount;
    else if (t.type === 'refund') sum -= t.amount;
  }
  return sum;
}

/* Amount owed on the card as of `upTo` (inclusive).
   opening + expenses + transfers out − refunds − transfers in − income
   landing on the card (cashback credits). Transactions after `upTo`
   (future-dated) are left out so they cannot inflate the billed amount. */
export function outstanding(card, txns, upTo = '9999-12-31') {
  let sum = card.openingOutstanding || 0;
  for (const t of txns) {
    if (t.date > upTo) continue;
    if (t.accountId === card.id) {
      if (t.type === 'expense' || t.type === 'transfer') sum += t.amount;
      else if (t.type === 'refund' || t.type === 'income') sum -= t.amount;
    }
    if (t.type === 'transfer' && t.toAccountId === card.id) sum -= t.amount;
  }
  return sum;
}

/* Everything the Home tile and card detail need, in one place. */
export function cardSummary(card, txns, today = todayStr()) {
  const S = card.statementDay, D = card.dueDay;
  const cycle = currentCycle(S, today);
  const prev = previousCycle(S, today);
  const owed = outstanding(card, txns, cycle.to);
  const unbilled = netSpend(card.id, txns, cycle.from, cycle.to);
  const billedDue = Math.max(0, owed - unbilled);
  const dueDate = dueDateFor(prev.to, D);
  const daysToDue = diffDays(today, dueDate);
  return {
    cycle,
    previousCycle: prev,
    nextStatement: cycle.to,
    lastStatement: prev.to,
    daysToStatement: diffDays(today, cycle.to),
    nextDueDate: dueDateFor(cycle.to, D),
    dueDate,
    daysToDue,
    unbilled,
    outstanding: owed,
    billedDue,
    credit: owed < 0 ? -owed : 0,
    overdue: billedDue > 0 && daysToDue < 0,
    utilisation: card.limit ? Math.max(0, owed) / card.limit : null,
  };
}
