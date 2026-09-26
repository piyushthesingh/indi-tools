import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { accountBalance, usageCount, validateAccount } from '../js/lib/accounts.js';
import { firstGrapheme, validateCategory, makeCategory, categoryUsage } from '../js/lib/categories.js';
import { monthToDate, monthSpend } from '../js/lib/totals.js';
import { cardSummary } from '../js/lib/cycles.js';
import { makeAccount } from '../js/lib/defaults.js';

const r = (x) => x * 100;
const tx = (type, date, rupees, extra = {}) => ({ type, date, amount: r(rupees), accountId: 'a', toAccountId: null, categoryId: 'cat-food', ...extra });

describe('accountBalance', () => {
  const acct = { id: 'a', kind: 'bank', openingBalance: r(10000) };
  test('money in and out', () => {
    const txns = [
      tx('expense', '2026-09-01', 500),
      tx('income', '2026-09-02', 2000),
      tx('refund', '2026-09-03', 100),
      tx('transfer', '2026-09-04', 3000, { toAccountId: 'card' }),
      tx('transfer', '2026-09-05', 700, { accountId: 'other', toAccountId: 'a' }),
      tx('expense', '2026-09-05', 999, { accountId: 'other' }),
    ];
    assert.equal(accountBalance(acct, txns), r(10000 - 500 + 2000 + 100 - 3000 + 700));
    assert.equal(accountBalance(acct, txns, '2026-09-02'), r(11500));
  });
  test('usageCount counts both sides of transfers', () => {
    assert.equal(usageCount('card', [tx('transfer', '2026-09-04', 1, { toAccountId: 'card' }), tx('expense', '2026-09-04', 1)]), 1);
  });
});

describe('validateAccount', () => {
  const card = makeAccount({ name: 'HDFC', kind: 'credit_card', shortCode: 'hdfc', statementDay: 15, dueDay: 5 });
  test('valid card and non-card', () => {
    assert.equal(validateAccount(card), null);
    assert.equal(validateAccount(makeAccount({ name: 'Cash', kind: 'cash', shortCode: 'cash' })), null);
  });
  test('catches bad input', () => {
    assert.match(validateAccount({ ...card, name: ' ' }), /name/);
    assert.match(validateAccount({ ...card, shortCode: 'HD FC' }), /Short code/);
    assert.match(validateAccount({ ...card, statementDay: 0 }), /statement/);
    assert.match(validateAccount({ ...card, dueDay: 32 }), /due/);
    assert.match(validateAccount({ ...card, limit: 0 }), /limit/);
    assert.match(validateAccount(makeAccount({ name: 'New', kind: 'credit_card', shortCode: 'new' })), /statement/, 'missing days are not guessed');
    assert.match(validateAccount(card, [{ id: 'x', shortCode: 'hdfc' }]), /already used/);
    assert.equal(validateAccount(card, [{ id: card.id, shortCode: 'hdfc' }]), null, 'itself is not a clash');
  });
});

describe('categories', () => {
  test('firstGrapheme keeps whole emoji', () => {
    assert.equal(firstGrapheme('🍕 pizza'), '🍕');
    assert.equal(firstGrapheme('👨‍👩‍👧'), '👨‍👩‍👧');
    assert.equal(firstGrapheme('🇮🇳🇮🇳'), '🇮🇳');
    assert.equal(firstGrapheme('🏋️'), '🏋️');
    assert.equal(firstGrapheme('  A'), 'A');
    assert.equal(firstGrapheme(''), '');
  });
  test('makeCategory trims and keeps id on edit', () => {
    const c = makeCategory({ name: ' Pets ', icon: '🐶🐱', color: '#123456', type: 'expense' });
    assert.equal(c.name, 'Pets');
    assert.equal(c.icon, '🐶');
    const e = makeCategory({ ...c, name: 'Pet care' }, c);
    assert.equal(e.id, c.id);
  });
  test('validateCategory', () => {
    const others = [{ id: 'cat-food', name: 'Food and dining', type: 'expense' }, { id: 'cat-x', name: 'Bonus', type: 'income', archived: true }];
    assert.equal(validateCategory({ name: 'Pets', icon: '🐶', type: 'expense' }, others), null);
    assert.match(validateCategory({ name: 'food AND dining', icon: '🍕', type: 'expense' }, others), /already/);
    assert.equal(validateCategory({ name: 'Food and dining', icon: '🍕', type: 'income' }, others), null, 'same name in the other type is fine');
    assert.match(validateCategory({ name: 'bonus', icon: '🎉', type: 'income' }, others), /archived/);
    assert.equal(validateCategory({ id: 'cat-food', name: 'Food and dining', icon: '🍕', type: 'expense' }, others), null, 'renaming itself');
    assert.match(validateCategory({ name: 'X', icon: '', type: 'expense' }, others), /emoji/);
  });
  test('categoryUsage', () => {
    assert.equal(categoryUsage('cat-food', [tx('expense', '2026-09-01', 1), tx('transfer', '2026-09-01', 1, { categoryId: null })]), 1);
  });
});

describe('monthToDate (Home)', () => {
  test('compares with last month up to the same day', () => {
    const txns = [
      tx('expense', '2026-08-10', 3000),
      tx('expense', '2026-08-26', 500),
      tx('expense', '2026-08-27', 9999), // after the same day last month: not compared
      tx('expense', '2026-09-05', 2000),
      tx('refund', '2026-09-06', 200),
      tx('transfer', '2026-09-07', 50000, { toAccountId: 'card' }),
    ];
    const m = monthToDate(txns, '2026-09-26');
    assert.equal(m.current, r(1800));
    assert.equal(m.previous, r(3500));
    assert.equal(m.diff, r(-1700));
    assert.equal(m.hasHistory, true);
  });
  test('31 March compares with all of February', () => {
    const m = monthToDate([tx('expense', '2026-02-28', 100)], '2026-03-31');
    assert.equal(m.previous, r(100));
  });
  test('first month has no history', () => {
    assert.equal(monthToDate([tx('expense', '2026-09-01', 100)], '2026-09-26').hasHistory, false);
  });
});

describe('paying a card reduces billed due, not spend', () => {
  const card = makeAccount({ id: 'hdfc', name: 'HDFC', kind: 'credit_card', shortCode: 'hdfc', statementDay: 15, dueDay: 5 });
  const spends = [
    tx('expense', '2026-09-01', 10000, { accountId: 'hdfc' }),
    tx('expense', '2026-09-20', 2000, { accountId: 'hdfc' }),
  ];
  const payment = tx('transfer', '2026-09-26', 6000, { accountId: 'bank', toAccountId: 'hdfc', categoryId: null });

  test('before and after the payment', () => {
    const before = cardSummary(card, spends, '2026-09-26');
    const after = cardSummary(card, [...spends, payment], '2026-09-26');
    assert.equal(before.billedDue, r(10000));
    assert.equal(after.billedDue, r(4000));
    assert.equal(after.unbilled, before.unbilled);
    assert.equal(monthSpend([...spends, payment], '2026-09'), monthSpend(spends, '2026-09'));
  });
});
