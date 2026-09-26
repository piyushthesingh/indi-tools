import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { breakdown, slices, monthlyTotals, topPayees, monthSummary, VIEWS } from '../js/lib/insights.js';
import { monthSpend, monthToDate, summarize } from '../js/lib/totals.js';
import { applyFilters } from '../js/lib/filters.js';

const r = (x) => x * 100;
let n = 0;
const tx = (type, date, rupees, extra = {}) => ({
  id: 't' + ++n, type, date, amount: r(rupees), accountId: 'hdfc', toAccountId: null,
  categoryId: type === 'transfer' ? null : 'cat-food', payee: '', note: '',
  createdAt: `2026-09-01T00:00:${String(n % 60).padStart(2, '0')}Z`, ...extra,
});

const accounts = new Map([
  ['hdfc', { id: 'hdfc', kind: 'credit_card' }],
  ['axis', { id: 'axis', kind: 'credit_card' }],
  ['upi', { id: 'upi', kind: 'upi' }],
  ['bank', { id: 'bank', kind: 'bank' }],
  ['cash', { id: 'cash', kind: 'cash' }],
]);

const txns = [
  tx('expense', '2026-09-01', 1200, { payee: 'Swiggy' }),
  tx('expense', '2026-09-02', 800, { payee: 'swiggy', accountId: 'upi' }),
  tx('expense', '2026-09-03', 3000, { categoryId: 'cat-shopping', payee: 'Amazon', accountId: 'axis' }),
  tx('refund', '2026-09-10', 1000, { categoryId: 'cat-shopping', payee: 'Amazon', accountId: 'axis' }),
  tx('refund', '2026-09-11', 500, { categoryId: 'cat-gifts', accountId: 'upi' }), // refund with no spend: negative bucket
  tx('expense', '2026-09-12', 250, { categoryId: 'cat-transport', accountId: 'cash', payee: 'Uber' }),
  tx('income', '2026-09-01', 90000, { categoryId: 'cat-salary', accountId: 'bank' }),
  tx('transfer', '2026-09-05', 20000, { accountId: 'bank', toAccountId: 'hdfc' }),
  tx('transfer', '2026-09-06', 2000, { accountId: 'bank', toAccountId: 'cash' }),
  tx('expense', '2026-08-15', 4000, { payee: 'Swiggy' }),
  tx('expense', '2026-10-01', 999),
];

describe('chart totals equal Home totals', () => {
  for (const view of VIEWS) {
    test(`by ${view}`, () => {
      const b = breakdown(txns, '2026-09', view, accounts);
      assert.equal(b.total, monthSpend(txns, '2026-09'));
      assert.equal(b.total, monthToDate(txns, '2026-09-26').current, 'same number as Home');
    });
  }

  test('expected split', () => {
    assert.equal(monthSpend(txns, '2026-09'), r(1200 + 800 + 3000 - 1000 - 500 + 250));
    const byCat = breakdown(txns, '2026-09', 'category', accounts);
    assert.deepEqual(byCat.rows.map((x) => [x.id, x.amount / 100]), [
      ['cat-food', 2000], ['cat-shopping', 2000], ['cat-transport', 250], ['cat-gifts', -500],
    ]);
    const byGroup = breakdown(txns, '2026-09', 'group', accounts);
    assert.deepEqual(Object.fromEntries(byGroup.rows.map((x) => [x.id, x.amount / 100])), { cards: 3200, digital: 300, cash: 250 });
  });

  test('every legend row opens an Activity list with the same spend', () => {
    const param = { category: 'categoryId', account: 'accountId', group: 'group' };
    for (const view of VIEWS) {
      for (const row of breakdown(txns, '2026-09', view, accounts).rows) {
        const list = applyFilters(txns, { month: '2026-09', [param[view]]: row.id }, accounts);
        assert.equal(summarize(list).spend, row.amount, `${view} ${row.id}`);
      }
    }
  });
});

describe('slices', () => {
  test('negative rows stay out of the donut', () => {
    const s = slices(breakdown(txns, '2026-09', 'category', accounts).rows);
    assert.equal(s.slices.length, 3);
    assert.equal(s.positiveTotal, r(4250));
    assert.ok(Math.abs(s.slices.reduce((a, x) => a + x.share, 0) - 1) < 1e-9);
  });

  test('more than 6 fold into Other', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ id: 'c' + i, amount: (9 - i) * 100 }));
    const s = slices(rows, 6);
    assert.equal(s.slices.length, 6);
    assert.equal(s.slices[5].id, '__other');
    assert.equal(s.slices[5].amount, 400 + 300 + 200 + 100);
    assert.deepEqual(s.slices[5].ids, ['c5', 'c6', 'c7', 'c8']);
  });

  test('empty month', () => {
    assert.deepEqual(slices([]), { slices: [], positiveTotal: 0 });
  });
});

describe('monthlyTotals', () => {
  test('six months, oldest first, across a year boundary', () => {
    const m = monthlyTotals(txns, '2026-02', 6);
    assert.deepEqual(m.map((x) => x.month), ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
    const s = monthlyTotals(txns, '2026-09', 6);
    assert.equal(s.at(-1).spend, monthSpend(txns, '2026-09'));
    assert.equal(s.at(-2).spend, r(4000));
  });
});

describe('topPayees', () => {
  test('grouped case-insensitively, net of refunds', () => {
    assert.deepEqual(topPayees(txns, '2026-09'), [
      { name: 'swiggy', amount: r(2000), count: 2 },
      { name: 'Amazon', amount: r(2000), count: 1 },
      { name: 'Uber', amount: r(250), count: 1 },
    ].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)));
  });
  test('limit', () => {
    assert.equal(topPayees(txns, '2026-09', 1).length, 1);
  });
});

test('monthSummary: income, spend and net', () => {
  assert.deepEqual(monthSummary(txns, '2026-09'), { spend: r(3750), income: r(90000), net: r(86250) });
});

import { wholePercents } from '../js/lib/insights.js';
test('wholePercents add to 100', () => {
  assert.deepEqual(wholePercents([1550, 450, -200]), [78, 22, null], 'a tie goes to the larger row');
  assert.deepEqual(wholePercents([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(wholePercents([0, 0]), [null, null]);
  const p = wholePercents([7, 13, 29, 51, 3]);
  assert.equal(p.reduce((a, b) => a + b, 0), 100);
});
