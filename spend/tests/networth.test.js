import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { investedToDate, moneyNow } from '../js/lib/networth.js';
import { accountBalance, validateAccount } from '../js/lib/accounts.js';
import { makeAccount, groupOf } from '../js/lib/defaults.js';
import { monthSpend } from '../js/lib/totals.js';

const r = (x) => x * 100;
const bank = makeAccount({ id: 'bank', name: 'HDFC Savings', kind: 'bank', shortCode: 'bank', trackBalance: true, openingBalance: r(100000) });
const upi = makeAccount({ id: 'upi', name: 'UPI', kind: 'upi', shortCode: 'upi' }); // not tracked
const card = makeAccount({ id: 'card', name: 'Amex', kind: 'credit_card', shortCode: 'amex', statementDay: 15, dueDay: 5 });
const sip = makeAccount({
  id: 'sip', name: 'Nifty 50 SIP', kind: 'investment', shortCode: 'nifty',
  history: [{ date: '2024-01-10', amount: r(50000) }, { date: '2026-09-26', amount: r(20000) }],
});
const ppf = makeAccount({ id: 'ppf', name: 'PPF', kind: 'investment', shortCode: 'ppf' });

const tx = (type, date, rupees, extra = {}) => ({ id: Math.random().toString(36), type, date, amount: r(rupees), categoryId: type === 'transfer' ? null : 'cat-food', ...extra });
const txns = [
  tx('expense', '2026-09-02', 3000, { accountId: 'bank' }),
  tx('expense', '2026-09-03', 5000, { accountId: 'card' }),
  tx('transfer', '2026-09-05', 10000, { accountId: 'bank', toAccountId: 'sip' }), // SIP
  tx('transfer', '2026-09-06', 2000, { accountId: 'bank', toAccountId: 'ppf' }),
  tx('transfer', '2026-09-20', 1000, { accountId: 'sip', toAccountId: 'bank' }), // redemption
  tx('transfer', '2026-10-05', 10000, { accountId: 'bank', toAccountId: 'sip' }), // future
];

describe('investments', () => {
  test('makeAccount keeps history with ids; investments are their own group', () => {
    assert.equal(sip.history.length, 2);
    assert.ok(sip.history.every((e) => e.id));
    assert.equal(groupOf('investment'), 'investments');
    assert.equal(sip.trackBalance, undefined);
  });

  test('invested to date = past + transfers in − redemptions, at cost, up to today', () => {
    assert.equal(investedToDate(sip, txns, '2026-09-26'), r(50000 + 20000 + 10000 - 1000));
    assert.equal(investedToDate(sip, txns, '2025-01-01'), r(50000), 'history respects its dates');
    assert.equal(investedToDate(ppf, txns, '2026-09-26'), r(2000));
  });

  test('investing is never spend', () => {
    assert.equal(monthSpend(txns, '2026-09'), r(8000));
  });

  test('validation of past investments', () => {
    assert.equal(validateAccount(sip), null);
    assert.match(validateAccount({ ...sip, history: [{ date: '2026-01-01', amount: 0 }] }), /past investment/);
    assert.match(validateAccount({ ...sip, history: [{ date: '', amount: 100 }] }), /past investment/);
  });
});

describe('money now', () => {
  test('cash − card dues, investments apart, total of both', () => {
    const m = moneyNow([bank, upi, card, sip, ppf], txns, '2026-09-26');
    // bank: 1,00,000 − 3,000 − 10,000 − 2,000 + 1,000 redemption = 86,000
    assert.equal(accountBalance(bank, txns, '2026-09-26'), r(86000));
    assert.equal(m.cash, r(86000));
    assert.equal(m.cardsOwed, r(5000));
    assert.equal(m.moneyNow, r(81000));
    assert.equal(m.invested, r(79000 + 2000));
    assert.equal(m.total, r(81000 + 81000));
    assert.deepEqual(m.untracked.map((a) => a.id), ['upi']);
  });

  test('a card in credit adds to money now; archived accounts are left out', () => {
    const pay = tx('transfer', '2026-09-10', 6000, { accountId: 'bank', toAccountId: 'card' });
    const m = moneyNow([bank, card, { ...ppf, archived: true }], [...txns, pay], '2026-09-26');
    assert.equal(m.cardsOwed, r(-1000));
    assert.equal(m.moneyNow, r(80000 + 1000));
    assert.equal(m.investRows.length, 0);
  });
});

import { parseDeepLink } from '../js/lib/deeplink.js';
test('deep links never pay for an expense from an investment', () => {
  const ctx = { accounts: [bank, sip], categories: [] };
  assert.equal(parseDeepLink('?via=nifty&type=expense', ctx).prefill.accountId, undefined);
  assert.equal(parseDeepLink('?via=bank&to=nifty&type=transfer', ctx).prefill.toAccountId, 'sip');
});

test('money now splits digital cash from cash in hand', () => {
  const wallet = makeAccount({ id: 'cash', name: 'Cash', kind: 'cash', shortCode: 'cash', trackBalance: true, openingBalance: r(2000) });
  const m = moneyNow([bank, wallet, card], txns, '2026-09-26');
  assert.equal(m.digital, r(86000));
  assert.equal(m.cashInHand, r(2000));
  assert.equal(m.cash, r(88000));
});
