/* Account rules that are not about card cycles: balances, validation and
   whether an account can be deleted. */

/* Balance of a non-card account (bank, UPI, wallet, cash) as of `upTo`:
   opening + money in (income, refunds, transfers in) − money out
   (expenses, transfers out). */
export function accountBalance(account, txns, upTo = '9999-12-31') {
  let sum = account.openingBalance || 0;
  for (const t of txns) {
    if (t.date > upTo) continue;
    if (t.accountId === account.id) {
      if (t.type === 'expense' || t.type === 'transfer') sum -= t.amount;
      else sum += t.amount;
    }
    if (t.type === 'transfer' && t.toAccountId === account.id) sum += t.amount;
  }
  return sum;
}

export function usageCount(accountId, txns) {
  let n = 0;
  for (const t of txns) if (t.accountId === accountId || t.toAccountId === accountId) n++;
  return n;
}

const isDay = (d) => Number.isInteger(d) && d >= 1 && d <= 31;

/* Error message, or null. `others` are the other accounts (for unique
   short codes). */
export function validateAccount(a, others = []) {
  if (!String(a.name || '').trim()) return 'Give it a name.';
  if (!/^[a-z0-9]{1,16}$/.test(a.shortCode || '')) return 'Short code: 1 to 16 lowercase letters or digits.';
  if (others.some((o) => o.id !== a.id && o.shortCode?.toLowerCase() === a.shortCode)) return `Short code "${a.shortCode}" is already used.`;
  if (a.kind === 'credit_card') {
    if (!isDay(a.statementDay)) return 'Pick a statement day.';
    if (!isDay(a.dueDay)) return 'Pick a due day.';
    if (a.limit != null && !(Number.isInteger(a.limit) && a.limit > 0)) return 'The limit must be more than zero, or left blank.';
    if (!Number.isInteger(a.openingOutstanding ?? 0)) return 'Check the amount owed.';
  } else if (a.kind === 'investment') {
    const bad = (a.history || []).find((e) => !(Number.isInteger(e.amount) && e.amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || ''));
    if (bad) return 'Each past investment needs a date and an amount above zero.';
  } else if (!Number.isInteger(a.openingBalance ?? 0)) {
    return 'Check the opening balance.';
  }
  return null;
}
