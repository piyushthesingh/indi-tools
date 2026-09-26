/* Short phrases shared by the Home card tiles, card detail and Manage. */

import { formatINR } from '../lib/money.js';
import { formatShort } from '../lib/dates.js';

export function statementPhrase(days) {
  if (days === 0) return 'statement today';
  if (days === 1) return 'statement tomorrow';
  return `statement in ${days} days`;
}

/* The billed line: what is due and when, or null when nothing is billed.
   tone: "danger" when overdue, "warn" when due within 5 days. */
export function dueLine(s, today) {
  if (s.billedDue <= 0) return null;
  const amt = formatINR(s.billedDue);
  let when, tone = '';
  if (s.overdue) { when = `overdue since ${formatShort(s.dueDate, today)}`; tone = 'danger'; }
  else if (s.daysToDue === 0) { when = 'due today'; tone = 'warn'; }
  else if (s.daysToDue === 1) { when = 'due tomorrow'; tone = 'warn'; }
  else { when = `due ${formatShort(s.dueDate, today)}`; if (s.daysToDue <= 5) tone = 'warn'; }
  return { text: `${amt} ${when}`, when, tone };
}
