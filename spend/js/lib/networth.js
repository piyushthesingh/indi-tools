/* "Money now" for Insights, always as of today.

   cash       tracked balances of bank, UPI, wallet and cash accounts
   cardsOwed  what is owed on credit cards (a credit balance counts as money)
   moneyNow   cash − cardsOwed
   invested   invested so far, at cost (no returns or interest)
   total      moneyNow + invested
   digital / cashInHand split `cash` into bank, UPI, wallet vs cash

   Accounts with "Track balance" off are listed as not included, because
   their balance is unknown. */

import { accountBalance } from './accounts.js';
import { outstanding } from './cycles.js';

/* Invested so far in one investment account, at cost, up to `upTo`:
   past investments recorded on the account + transfers in − transfers out
   (redemptions). */
export function investedToDate(account, txns, upTo = '9999-12-31') {
  let sum = 0;
  for (const e of account.history || []) if (e.date <= upTo) sum += e.amount;
  for (const t of txns) {
    if (t.type !== 'transfer' || t.date > upTo) continue;
    if (t.toAccountId === account.id) sum += t.amount;
    if (t.accountId === account.id) sum -= t.amount;
  }
  return sum;
}

export function moneyNow(accounts, txns, today) {
  const live = accounts.filter((a) => !a.archived);
  const cashRows = [], untracked = [], cardRows = [], investRows = [];
  for (const a of live) {
    if (a.kind === 'credit_card') {
      cardRows.push({ account: a, amount: outstanding(a, txns, today) });
    } else if (a.kind === 'investment') {
      investRows.push({ account: a, amount: investedToDate(a, txns, today) });
    } else if (a.trackBalance) {
      cashRows.push({ account: a, amount: accountBalance(a, txns, today) });
    } else {
      untracked.push(a);
    }
  }
  const sum = (rows) => rows.reduce((s, r) => s + r.amount, 0);
  const cash = sum(cashRows);
  const digital = sum(cashRows.filter((r) => r.account.kind !== 'cash'));
  const cardsOwed = sum(cardRows);
  const invested = sum(investRows);
  return {
    cash, digital, cashInHand: cash - digital, cardsOwed, moneyNow: cash - cardsOwed, invested, total: cash - cardsOwed + invested,
    cashRows, cardRows, investRows, untracked,
  };
}
