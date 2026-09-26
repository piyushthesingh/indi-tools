import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeTransaction, validateTransaction, byNewest } from '../js/lib/transactions.js';
import { spendOf, spendTotal, incomeTotal, monthSpend, summarize, spendBy } from '../js/lib/totals.js';
import { applyFilters, groupByDate, filtersToQuery, filtersFromQuery, dateRange } from '../js/lib/filters.js';
import { rankCategories, lastUsedAccountId, payeeList, lastCategoryForPayee } from '../js/lib/suggest.js';
import { DEFAULT_CATEGORIES } from '../js/lib/defaults.js';

const r = (x) => x * 100;
let seq = 0;
const tx = (type, date, rupees, extra = {}) => ({
  id: 't' + ++seq, type, date, amount: r(rupees), accountId: 'hdfc', toAccountId: null,
  categoryId: type === 'transfer' ? null : type === 'income' ? 'cat-salary' : 'cat-food',
  payee: '', note: '', createdAt: `2026-09-01T00:00:${String(seq).padStart(2, '0')}.000Z`, ...extra,
});

const accounts = new Map([
  ['hdfc', { id: 'hdfc', kind: 'credit_card' }],
  ['upi', { id: 'upi', kind: 'upi' }],
  ['bank', { id: 'bank', kind: 'bank' }],
  ['cash', { id: 'cash', kind: 'cash' }],
]);

describe('makeTransaction', () => {
  test('builds a clean expense', () => {
    const t = makeTransaction({ type: 'expense', amount: 42000, date: '2026-09-26', accountId: 'hdfc', categoryId: 'cat-food', payee: ' Swiggy ', toAccountId: 'x' });
    assert.equal(t.payee, 'Swiggy');
    assert.equal(t.toAccountId, null, 'expenses never carry a to-account');
    assert.ok(t.id && t.createdAt && t.updatedAt);
    assert.equal(t.recurringId, null);
  });

  test('a transfer drops any category', () => {
    const t = makeTransaction({ type: 'transfer', amount: 100, date: '2026-09-26', accountId: 'bank', toAccountId: 'hdfc', categoryId: 'cat-food' });
    assert.equal(t.categoryId, null);
  });

  test('editing keeps id and createdAt', () => {
    const a = makeTransaction({ type: 'expense', amount: 100, date: '2026-09-26', accountId: 'hdfc', categoryId: 'cat-food' }, null, '2026-09-26T10:00:00.000Z');
    const b = makeTransaction({ ...a, amount: 200 }, a, '2026-09-27T10:00:00.000Z');
    assert.equal(b.id, a.id);
    assert.equal(b.createdAt, '2026-09-26T10:00:00.000Z');
    assert.equal(b.updatedAt, '2026-09-27T10:00:00.000Z');
  });

  test('rejects invalid records', () => {
    const base = { type: 'expense', amount: 100, date: '2026-09-26', accountId: 'hdfc', categoryId: 'cat-food' };
    assert.equal(validateTransaction(base), null);
    assert.match(validateTransaction({ ...base, amount: 0 }), /amount/);
    assert.match(validateTransaction({ ...base, amount: 1.5 }), /amount/, 'paise must be whole');
    assert.match(validateTransaction({ ...base, date: '2026-02-30' }), /date/);
    assert.match(validateTransaction({ ...base, categoryId: null }), /category/);
    assert.match(validateTransaction({ ...base, type: 'transfer', toAccountId: 'hdfc' }), /different/);
    assert.match(validateTransaction({ ...base, type: 'transfer' }), /went/);
    assert.throws(() => makeTransaction({ ...base, amount: -5 }));
  });
});

describe('totals: transfers are never spend', () => {
  const txns = [
    tx('expense', '2026-09-02', 1000),
    tx('refund', '2026-09-03', 200),
    tx('income', '2026-09-04', 50000),
    tx('transfer', '2026-09-05', 30000, { accountId: 'bank', toAccountId: 'hdfc' }),
    tx('transfer', '2026-09-06', 2000, { accountId: 'bank', toAccountId: 'cash' }),
    tx('expense', '2026-10-01', 999),
  ];

  test('spendOf', () => {
    assert.equal(spendOf(txns[0]), r(1000));
    assert.equal(spendOf(txns[1]), r(-200));
    assert.equal(spendOf(txns[2]), 0);
    assert.equal(spendOf(txns[3]), 0);
  });

  test('month spend = expenses − refunds, no transfers, no income', () => {
    assert.equal(monthSpend(txns, '2026-09'), r(800));
    assert.equal(spendTotal(txns, '2026-09-01', '2026-10-31'), r(1799));
    assert.equal(incomeTotal(txns, '2026-09-01', '2026-09-30'), r(50000));
  });

  test('summarize keeps transfers apart', () => {
    const s = summarize(txns.slice(0, 5));
    assert.deepEqual(s, { spend: r(800), income: r(50000), transfers: r(32000), count: 5 });
  });

  test('a list of only transfers totals zero spend', () => {
    assert.equal(summarize(txns.slice(3, 5)).spend, 0);
  });

  test('spendBy buckets, with refunds subtracting', () => {
    const m = spendBy(txns, (t) => t.categoryId);
    assert.equal(m.get('cat-food'), r(1799));
    assert.equal(m.has('cat-salary'), false);
    assert.equal(m.has(null), false, 'transfers are not a bucket');
  });
});

describe('filters', () => {
  const txns = [
    tx('expense', '2026-09-02', 420, { payee: 'Swiggy', note: 'dinner' }),
    tx('expense', '2026-09-02', 80, { accountId: 'upi', payee: 'Chai point' }),
    tx('refund', '2026-09-10', 100, { payee: 'Amazon' }),
    tx('transfer', '2026-09-15', 5000, { accountId: 'bank', toAccountId: 'hdfc', note: 'card bill' }),
    tx('expense', '2026-08-30', 999, { categoryId: 'cat-fuel', accountId: 'cash' }),
  ];

  test('month and custom range', () => {
    assert.equal(applyFilters(txns, { month: '2026-09' }, accounts).length, 4);
    assert.equal(applyFilters(txns, { from: '2026-08-30', to: '2026-09-02' }, accounts).length, 3);
    assert.equal(applyFilters(txns, { from: '2026-09-10' }, accounts).length, 2);
    assert.deepEqual(dateRange({ month: '2024-02', from: '2000-01-01' }), { from: '2024-02-01', to: '2024-02-29' });
    assert.equal(applyFilters(txns, { month: 'all' }, accounts).length, 5);
  });

  test('type, category, account, group', () => {
    assert.equal(applyFilters(txns, { type: 'expense' }, accounts).length, 3);
    assert.equal(applyFilters(txns, { categoryId: 'cat-fuel' }, accounts).length, 1);
    // a card's list includes payments into it
    assert.deepEqual(applyFilters(txns, { accountId: 'hdfc' }, accounts).map((t) => t.type), ['expense', 'refund', 'transfer']);
    assert.equal(applyFilters(txns, { group: 'digital' }, accounts).length, 2, 'UPI spend and the bank transfer');
    assert.equal(applyFilters(txns, { group: 'cash' }, accounts).length, 1);
  });

  test('search covers payee and note, case-insensitive', () => {
    assert.equal(applyFilters(txns, { q: 'swig' }, accounts).length, 1);
    assert.equal(applyFilters(txns, { q: 'DINNER' }, accounts).length, 1);
    assert.equal(applyFilters(txns, { q: 'card bill' }, accounts).length, 1);
    assert.equal(applyFilters(txns, { q: 'nothing' }, accounts).length, 0);
  });

  test('group by date with daily totals, newest first', () => {
    const groups = groupByDate(applyFilters(txns, { month: '2026-09' }, accounts).sort(byNewest));
    assert.deepEqual(groups.map((g) => g.date), ['2026-09-15', '2026-09-10', '2026-09-02']);
    assert.equal(groups[0].spend, 0, 'transfer day spends nothing');
    assert.equal(groups[1].spend, r(-100));
    assert.equal(groups[2].spend, r(500));
  });

  test('query string round trip', () => {
    const f = { month: '2026-09', categoryId: 'cat-food', accountId: 'hdfc', group: '', type: 'expense' };
    const q = filtersToQuery(f);
    assert.equal(q, 'month=2026-09&type=expense&cat=cat-food&acct=hdfc');
    assert.deepEqual(filtersFromQuery(q), { month: '2026-09', type: 'expense', categoryId: 'cat-food', accountId: 'hdfc' });
  });
});

describe('suggestions', () => {
  const txns = [
    tx('expense', '2026-09-01', 100, { categoryId: 'cat-groceries', payee: 'BigBasket', createdAt: '2026-09-01T10:00:00Z' }),
    tx('expense', '2026-09-02', 100, { categoryId: 'cat-groceries', createdAt: '2026-09-02T10:00:00Z' }),
    tx('expense', '2026-09-03', 100, { categoryId: 'cat-food', payee: 'swiggy', createdAt: '2026-09-03T10:00:00Z' }),
    tx('expense', '2026-09-04', 100, { categoryId: 'cat-shopping', payee: 'Swiggy', accountId: 'upi', createdAt: '2026-09-04T10:00:00Z' }),
    tx('income', '2026-09-05', 100, { categoryId: 'cat-salary', accountId: 'bank', payee: 'Acme', createdAt: '2026-09-05T10:00:00Z' }),
  ];

  test('most used categories first, filtered by type', () => {
    const ranked = rankCategories(DEFAULT_CATEGORIES, txns, 'expense');
    assert.equal(ranked[0].id, 'cat-groceries');
    assert.ok(ranked.every((c) => c.type === 'expense'));
    assert.equal(rankCategories(DEFAULT_CATEGORIES, txns, 'refund')[0].id, 'cat-groceries', 'refunds use expense categories');
    assert.equal(rankCategories(DEFAULT_CATEGORIES, txns, 'income')[0].id, 'cat-salary');
  });

  test('archived categories are left out', () => {
    const cats = DEFAULT_CATEGORIES.map((c) => (c.id === 'cat-groceries' ? { ...c, archived: true } : c));
    assert.ok(!rankCategories(cats, txns, 'expense').some((c) => c.id === 'cat-groceries'));
  });

  test('last used account', () => {
    assert.equal(lastUsedAccountId(txns, ['hdfc', 'upi', 'bank'], 'expense'), 'upi');
    assert.equal(lastUsedAccountId(txns, ['hdfc', 'bank'], 'expense'), 'hdfc', 'skips archived');
    assert.equal(lastUsedAccountId(txns, ['hdfc', 'upi', 'bank'], 'income'), 'bank');
    assert.equal(lastUsedAccountId([], ['cash', 'upi']), 'cash');
  });

  test('payees: distinct, newest spelling first', () => {
    assert.deepEqual(payeeList(txns), ['Acme', 'Swiggy', 'BigBasket']);
  });

  test("a known payee brings back its last category", () => {
    assert.equal(lastCategoryForPayee(txns, 'SWIGGY'), 'cat-shopping');
    assert.equal(lastCategoryForPayee(txns, 'bigbasket '), 'cat-groceries');
    assert.equal(lastCategoryForPayee(txns, 'Acme', 'expense'), null, 'income payee does not leak into expenses');
    assert.equal(lastCategoryForPayee(txns, 'Acme', 'income'), 'cat-salary');
    assert.equal(lastCategoryForPayee(txns, 'Unknown'), null);
  });
});

test('QA regression: auto-logged recurring items do not change the last used account', () => {
  const txns = [
    { id: '1', type: 'expense', accountId: 'upi', createdAt: '2026-09-01T10:00:00Z' },
    { id: 'rec:r:2026-09-05', type: 'expense', accountId: 'hdfc', recurringId: 'r', createdAt: '2026-09-26T08:00:00Z' },
  ];
  assert.equal(lastUsedAccountId(txns, ['hdfc', 'upi'], 'expense'), 'upi');
});

test('audit regression: bad months and dates in links are ignored', () => {
  assert.deepEqual(filtersFromQuery('month=2026-13&from=2026-02-30&to=2026-09-01'), { to: '2026-09-01' });
  assert.deepEqual(filtersFromQuery('month=all'), { month: 'all' });
  assert.deepEqual(filtersFromQuery('month=2026-09'), { month: '2026-09' });
});
