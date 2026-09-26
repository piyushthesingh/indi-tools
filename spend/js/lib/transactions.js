/* Building and checking transaction records. Pure, so it can be tested. */

import { uuid } from './defaults.js';
import { isDateStr } from './dates.js';

export const TYPES = ['expense', 'income', 'refund', 'transfer'];

export const TYPE_LABELS = { expense: 'Expense', income: 'Income', refund: 'Refund', transfer: 'Transfer' };

/* Refunds are filed under expense categories, so they subtract from them. */
export function categoryTypeFor(txType) {
  return txType === 'income' ? 'income' : 'expense';
}

/* Returns an error message, or null when the fields make a valid record. */
export function validateTransaction(t) {
  if (!TYPES.includes(t.type)) return 'Pick a type.';
  if (!Number.isInteger(t.amount) || t.amount <= 0) return 'Enter an amount.';
  if (!isDateStr(t.date)) return 'Pick a date.';
  if (!t.accountId) return t.type === 'transfer' ? 'Pick where the money came from.' : 'Pick how you paid.';
  if (t.type === 'transfer') {
    if (!t.toAccountId) return 'Pick where the money went.';
    if (t.toAccountId === t.accountId) return 'From and to must be different.';
  } else if (!t.categoryId) {
    return 'Pick a category.';
  }
  return null;
}

/* A complete record. Fields that do not apply to the type are cleared, so a
   transfer never carries a category and an expense never a toAccountId. */
export function makeTransaction(fields, existing = null, now = new Date().toISOString()) {
  const type = fields.type;
  const t = {
    id: existing?.id ?? fields.id ?? uuid(),
    type,
    amount: fields.amount,
    date: fields.date,
    accountId: fields.accountId,
    toAccountId: type === 'transfer' ? fields.toAccountId : null,
    categoryId: type === 'transfer' ? null : fields.categoryId,
    payee: String(fields.payee ?? '').trim(),
    note: String(fields.note ?? '').trim(),
    recurringId: fields.recurringId ?? existing?.recurringId ?? null,
    createdAt: existing?.createdAt ?? fields.createdAt ?? now,
    updatedAt: now,
  };
  const err = validateTransaction(t);
  if (err) throw new Error(err);
  return t;
}

/* Newest first: by date, then by when it was entered. */
export function byNewest(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}
