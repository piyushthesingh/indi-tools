import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { budgetFor, budgetStatus, categoryStatus } from '../js/lib/budgets.js';
import { occurrencesBetween, generate, pendingItems, occurrenceId, nextOccurrence, describeFrequency, validateRule, backfill, ruleUsage, MAX_CATCH_UP, recurringTotals } from '../js/lib/recurring.js';
import { estimateCashback, rateFor, hasCashback } from '../js/lib/cashback.js';
import { computeBanners } from '../js/lib/banners.js';
import { addDays } from '../js/lib/dates.js';

const r = (x) => x * 100;
const tx = (type, date, rupees, extra = {}) => ({ id: Math.random().toString(36), type, date, amount: r(rupees), accountId: 'c', categoryId: 'cat-food', ...extra });

describe('budgets', () => {
  const budgets = [
    { id: 'default', month: 'default', totalLimit: r(30000), categoryLimits: { 'cat-food': r(5000) } },
    { id: '2026-10', month: '2026-10', totalLimit: r(50000), categoryLimits: {} },
  ];
  test('month budget beats default', () => {
    assert.equal(budgetFor(budgets, '2026-10').totalLimit, r(50000));
    assert.equal(budgetFor(budgets, '2026-09').totalLimit, r(30000));
    assert.equal(budgetFor([], '2026-09'), null);
  });

  test('safe per day counts today, floors at 0 and to whole rupees', () => {
    const txns = [tx('expense', '2026-09-02', 10000), tx('refund', '2026-09-03', 1000), tx('transfer', '2026-09-04', 99999)];
    // 30 days in Sep; on the 26th, 5 days are left including today
    const s = budgetStatus(budgets[0], txns, '2026-09-26');
    assert.equal(s.spent, r(9000));
    assert.equal(s.daysLeft, 5);
    assert.equal(s.perDay, r(4200));
    assert.equal(budgetStatus(budgets[0], txns, '2026-09-30').perDay, r(21000), 'last day: all of it');
    const odd = budgetStatus({ totalLimit: r(100) }, [], '2026-09-28'); // 100 / 3 days
    assert.equal(odd.perDay, r(33));
    const over = budgetStatus(budgets[0], [tx('expense', '2026-09-01', 31000)], '2026-09-10');
    assert.equal(over.perDay, 0);
    assert.equal(over.left, r(-1000));
    assert.equal(budgetStatus({ totalLimit: null }, [], '2026-09-10'), null);
  });

  test('category status', () => {
    const txns = [tx('expense', '2026-09-02', 4500), tx('expense', '2026-08-02', 4500)];
    const [food] = categoryStatus(budgets[0], txns, '2026-09');
    assert.equal(food.spent, r(4500));
    assert.equal(food.pct, 0.9);
  });
});

describe('recurring occurrences', () => {
  const monthly = (day, extra = {}) => ({ id: 'r1', frequency: 'monthly', dayOfMonth: day, startDate: '2026-01-01', endDate: null, mode: 'confirm', template: { type: 'expense', amount: r(500), accountId: 'c', categoryId: 'cat-rent' }, ...extra });

  test('monthly on the 31st clamps to month end', () => {
    assert.deepEqual(occurrencesBetween(monthly(31), '2025-12-31', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    assert.deepEqual(occurrencesBetween(monthly(31, { startDate: '2024-01-01' }), '2024-01-31', '2024-02-29'), ['2024-02-29']);
  });

  test('bounds: after is exclusive, upTo inclusive, start and end respected', () => {
    assert.deepEqual(occurrencesBetween(monthly(5), '2026-03-05', '2026-05-05'), ['2026-04-05', '2026-05-05']);
    assert.deepEqual(occurrencesBetween(monthly(5, { startDate: '2026-04-06' }), '2026-01-01', '2026-06-30'), ['2026-05-05', '2026-06-05']);
    assert.deepEqual(occurrencesBetween(monthly(5, { endDate: '2026-05-04' }), '2026-03-31', '2026-06-30'), ['2026-04-05']);
  });

  test('weekly and yearly', () => {
    const weekly = { ...monthly(1), frequency: 'weekly', weekday: 1 }; // Mondays
    assert.deepEqual(occurrencesBetween(weekly, '2026-09-13', '2026-09-30'), ['2026-09-14', '2026-09-21', '2026-09-28']);
    const yearly = { ...monthly(29), frequency: 'yearly', startDate: '2024-02-01' };
    assert.deepEqual(occurrencesBetween(yearly, '2024-01-31', '2027-12-31'), ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28']);
  });

  test('nextOccurrence and descriptions', () => {
    assert.equal(nextOccurrence(monthly(5), '2026-09-26'), '2026-10-05');
    assert.equal(nextOccurrence(monthly(5), '2026-10-05'), '2026-10-05');
    assert.equal(describeFrequency(monthly(1)), 'Monthly on the 1st');
    assert.equal(describeFrequency(monthly(22)), 'Monthly on the 22nd');
    assert.equal(describeFrequency(monthly(31)), 'Monthly on the last day');
    assert.equal(describeFrequency({ frequency: 'weekly', weekday: 5 }), 'Every Friday');
  });

  test('validateRule', () => {
    assert.equal(validateRule(monthly(5)), null);
    assert.match(validateRule(monthly(5, { endDate: '2025-01-01' })), /end date/);
    assert.match(validateRule({ ...monthly(5), template: { ...monthly(5).template, categoryId: null } }), /category/);
  });
});

describe('recurring generation never duplicates', () => {
  const base = {
    id: 'rent', frequency: 'monthly', dayOfMonth: 1, startDate: '2026-07-01', endDate: null,
    lastGeneratedDate: null, paused: false, pending: [],
    template: { type: 'expense', amount: r(25000), accountId: 'bank', categoryId: 'cat-rent', payee: 'Landlord' },
  };

  function simulateOpens(rule, days) {
    // apply generate() on each "app open", persisting results like the app does
    let rules = [rule];
    const txns = new Map();
    for (const today of days) {
      const out = generate(rules, today, new Set(txns.keys()), '2026-01-01T00:00:00Z');
      for (const t of out.transactions) {
        assert.ok(!txns.has(t.id), `duplicate ${t.id} on ${today}`);
        txns.set(t.id, t);
      }
      rules = rules.map((x) => out.rules.find((u) => u.id === x.id) || x);
    }
    return { rules, txns };
  }

  test('auto: several opens a day, several days, one transaction per occurrence', () => {
    const days = ['2026-09-26', '2026-09-26', '2026-09-26', '2026-09-30', '2026-10-01', '2026-10-01', '2026-10-15', '2026-11-02'];
    const { rules, txns } = simulateOpens({ ...base, mode: 'auto' }, days);
    assert.deepEqual([...txns.keys()].sort(), ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01'].map((d) => occurrenceId('rent', d)));
    assert.equal(rules[0].lastGeneratedDate, '2026-11-02');
    const t = txns.get('rec:rent:2026-10-01');
    assert.equal(t.recurringId, 'rent');
    assert.equal(t.payee, 'Landlord');
  });

  test('confirm: pending list has each date once, however many opens', () => {
    const { rules, txns } = simulateOpens({ ...base, mode: 'confirm' }, ['2026-09-26', '2026-09-26', '2026-09-27', '2026-10-01', '2026-10-01']);
    assert.equal(txns.size, 0);
    assert.deepEqual(rules[0].pending, ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']);
    assert.equal(pendingItems(rules).length, 4);
  });

  test('a logged or skipped occurrence does not come back', () => {
    let rule = { ...base, mode: 'confirm' };
    let out = generate([rule], '2026-09-26');
    rule = out.rules[0];
    // log Sep 1, skip Jul 1 and Aug 1
    rule = { ...rule, pending: [] };
    const existing = new Set([occurrenceId('rent', '2026-09-01')]);
    out = generate([rule], '2026-09-28', existing);
    assert.deepEqual(out.rules[0].pending, []);
    out = generate([out.rules[0]], '2026-10-02', existing);
    assert.deepEqual(out.rules[0].pending, ['2026-10-01']);
  });

  test('a transaction already saved with the occurrence id is not re-offered or re-saved', () => {
    const existing = new Set([occurrenceId('rent', '2026-09-01')]);
    const auto = generate([{ ...base, mode: 'auto', lastGeneratedDate: '2026-08-31' }], '2026-09-26', existing);
    assert.equal(auto.transactions.length, 0);
    const confirm = generate([{ ...base, mode: 'confirm', lastGeneratedDate: '2026-08-31' }], '2026-09-26', existing);
    assert.deepEqual(confirm.rules[0].pending, []);
  });

  test('paused rules skip, and do not flood when resumed', () => {
    let out = generate([{ ...base, mode: 'auto', paused: true }], '2026-09-26');
    assert.equal(out.transactions.length, 0);
    out = generate([{ ...out.rules[0], paused: false }], '2026-10-02');
    assert.deepEqual(out.transactions.map((t) => t.date), ['2026-10-01']);
  });

  test('clock going backwards generates nothing', () => {
    const out = generate([{ ...base, mode: 'auto', lastGeneratedDate: '2026-10-05' }], '2026-10-01');
    assert.equal(out.transactions.length, 0);
    assert.equal(out.rules.length, 0);
  });

  test('a rule starting today fires today', () => {
    const out = generate([{ ...base, mode: 'auto', startDate: '2026-10-01' }], '2026-10-01');
    assert.deepEqual(out.transactions.map((t) => t.date), ['2026-10-01']);
  });
});

describe('cashback', () => {
  // the spec example: 5% default, 1% on Bills and utilities, Rent and Fuel excluded, cap ₹5,000
  const card = {
    id: 'c', cashback: {
      defaultPct: 5, categoryPct: { 'cat-bills': 1 }, excludedCategoryIds: ['cat-rent', 'cat-fuel'], capPerCycle: r(5000),
    },
  };
  const from = '2026-09-16', to = '2026-10-15';

  test('rates', () => {
    assert.equal(rateFor(card.cashback, 'cat-food'), 5);
    assert.equal(rateFor(card.cashback, 'cat-bills'), 1);
    assert.equal(rateFor(card.cashback, 'cat-rent'), 0);
    assert.equal(rateFor(card.cashback, 'cat-fuel'), 0);
    assert.ok(hasCashback(card));
    assert.ok(!hasCashback({ cashback: null }));
  });

  test('mixed spend', () => {
    const txns = [
      tx('expense', '2026-09-20', 2000), // 5% = 100
      tx('expense', '2026-09-21', 3000, { categoryId: 'cat-bills' }), // 1% = 30
      tx('expense', '2026-09-22', 25000, { categoryId: 'cat-rent' }), // 0
      tx('expense', '2026-09-23', 1500, { categoryId: 'cat-fuel' }), // 0
      tx('expense', '2026-09-10', 9999), // previous cycle
      tx('expense', '2026-09-24', 999, { accountId: 'other' }), // other card
      tx('transfer', '2026-09-25', 50000, { toAccountId: 'c', categoryId: null }), // payment
    ];
    assert.deepEqual(estimateCashback(card, txns, from, to), { amount: r(130), capped: false });
  });

  test('refunds take back at their category rate', () => {
    const txns = [tx('expense', '2026-09-20', 2000), tx('refund', '2026-09-25', 500), tx('refund', '2026-09-25', 100, { categoryId: 'cat-rent' })];
    assert.equal(estimateCashback(card, txns, from, to).amount, r(75));
  });

  test('never below zero', () => {
    assert.equal(estimateCashback(card, [tx('refund', '2026-09-25', 500)], from, to).amount, 0);
  });

  test('cap per cycle', () => {
    const big = [tx('expense', '2026-09-20', 150000)]; // 5% = 7,500
    assert.deepEqual(estimateCashback(card, big, from, to), { amount: r(5000), capped: true });
  });

  test('fractional rates round down to paise', () => {
    const c = { id: 'c', cashback: { defaultPct: 1.5, categoryPct: {}, excludedCategoryIds: [], capPerCycle: null } };
    assert.equal(estimateCashback(c, [tx('expense', '2026-09-20', 333.33)], from, to).amount, 499); // 4.99995 → 4.99
  });

  test('no config, no estimate', () => {
    assert.equal(estimateCashback({ id: 'c', cashback: null }, [], from, to), null);
  });
});

describe('banners follow the priority order', () => {
  const today = '2026-09-26';
  const card = (name) => ({ id: name, name });
  const sum = (o) => ({ billedDue: 0, daysToDue: 20, daysToStatement: 20, unbilled: 100, ...o });
  const all = {
    pendingCount: 3,
    cardSummaries: [
      { card: card('stmt'), summary: sum({ daysToStatement: 2 }) },
      { card: card('due'), summary: sum({ billedDue: r(100), daysToDue: 4 }) },
      { card: card('overdue'), summary: sum({ billedDue: r(100), daysToDue: -2 }) },
    ],
    budget: { pct: 0.85 },
    categoryBudgets: [{ categoryId: 'cat-food', pct: 0.95 }],
    lastBackupAt: '2026-09-01T10:00:00Z',
    transactionCount: 50,
    today,
  };
  const kinds = (b) => b.map((x) => x.kind + (x.card ? ':' + x.card.id : ''));

  test('top two with everything firing', () => {
    assert.deepEqual(kinds(computeBanners(all)), ['recurring', 'due:overdue']);
  });

  test('full order', () => {
    assert.deepEqual(kinds(computeBanners(all, 99)), ['recurring', 'due:overdue', 'due:due', 'statement:stmt', 'budget', 'categoryBudget', 'backup']);
  });

  test('each level surfaces when the ones above are quiet', () => {
    assert.deepEqual(kinds(computeBanners({ ...all, pendingCount: 0 })), ['due:overdue', 'due:due']);
    assert.deepEqual(kinds(computeBanners({ ...all, pendingCount: 0, cardSummaries: all.cardSummaries.slice(0, 1) })), ['statement:stmt', 'budget']);
    assert.deepEqual(kinds(computeBanners({ ...all, pendingCount: 0, cardSummaries: [] })), ['budget', 'categoryBudget']);
    assert.deepEqual(kinds(computeBanners({ ...all, pendingCount: 0, cardSummaries: [], budget: { pct: 0.5 }, categoryBudgets: [] })), ['backup']);
  });

  test('thresholds', () => {
    const quiet = { today, transactionCount: 0 };
    assert.deepEqual(computeBanners({ ...quiet, cardSummaries: [{ card: card('x'), summary: sum({ billedDue: r(1), daysToDue: 6 }) }] }), [], 'due in 6 days is not yet');
    assert.deepEqual(kinds(computeBanners({ ...quiet, cardSummaries: [{ card: card('x'), summary: sum({ billedDue: r(1), daysToDue: 5 }) }] })), ['due:x']);
    assert.deepEqual(computeBanners({ ...quiet, cardSummaries: [{ card: card('x'), summary: sum({ billedDue: 0, daysToDue: 1 }) }] }), [], 'nothing billed');
    assert.deepEqual(computeBanners({ ...quiet, cardSummaries: [{ card: card('x'), summary: sum({ daysToStatement: 4 }) }] }), []);
    assert.deepEqual(kinds(computeBanners({ ...quiet, cardSummaries: [{ card: card('x'), summary: sum({ daysToStatement: 0 }) }] })), ['statement:x']);
    assert.deepEqual(computeBanners({ ...quiet, cardSummaries: [{ card: card('x'), summary: sum({ daysToStatement: 1, unbilled: 0 }) }] }), [], 'nothing unbilled');
    assert.deepEqual(computeBanners({ ...quiet, budget: { pct: 0.79 } }), []);
    assert.deepEqual(kinds(computeBanners({ ...quiet, budget: { pct: 0.8 } })), ['budget']);
  });

  test('backup rules', () => {
    const q = { today };
    assert.deepEqual(computeBanners({ ...q, transactionCount: 9 }), [], 'never backed up, under 10');
    assert.deepEqual(kinds(computeBanners({ ...q, transactionCount: 10 })), ['backup']);
    assert.deepEqual(computeBanners({ ...q, transactionCount: 99, lastBackupAt: addDays(today, -7) + 'T09:00:00Z' }), [], 'exactly 7 days is fine');
    assert.deepEqual(kinds(computeBanners({ ...q, transactionCount: 1, lastBackupAt: addDays(today, -8) + 'T09:00:00Z' })), ['backup']);
  });
});

describe('QA regressions: recurring', () => {
  const weekly = {
    id: 'w', frequency: 'weekly', weekday: 1, startDate: '2023-09-25', endDate: null, lastGeneratedDate: null,
    mode: 'confirm', pending: [], template: { type: 'expense', amount: 100, accountId: 'a', categoryId: 'c' },
  };

  test('a rule far in the past keeps the most recent occurrences, not the oldest', () => {
    const p = generate([weekly], '2026-09-26').rules[0].pending;
    assert.equal(p.length, MAX_CATCH_UP);
    assert.equal(p.at(-1), '2026-09-21', 'latest Monday is still offered');
  });

  test('moving the start date earlier fills only the gap, skipped dates stay skipped', () => {
    // rule started 1 Jul, generated to 26 Sep; Jul and Aug were skipped, Sep logged
    const rule = { ...weekly, id: 'rent', frequency: 'monthly', dayOfMonth: 1, startDate: '2026-05-01', lastGeneratedDate: '2026-09-26', pending: [] };
    const out = backfill(rule, '2026-07-01', new Set([occurrenceId('rent', '2026-09-01')]));
    assert.deepEqual(out.pending, ['2026-05-01', '2026-06-01']);
    const auto = backfill({ ...rule, mode: 'auto' }, '2026-07-01');
    assert.deepEqual(auto.transactions.map((t) => t.date), ['2026-05-01', '2026-06-01']);
    assert.deepEqual(backfill({ ...rule, startDate: '2026-08-01' }, '2026-07-01').pending, [], 'moving later adds nothing');
    assert.deepEqual(backfill({ ...rule, lastGeneratedDate: null }, '2026-07-01').pending, [], 'never generated: the normal run handles it');
  });

  test('ruleUsage counts accounts (both sides) and categories', () => {
    const rules = [
      { template: { accountId: 'a', toAccountId: null, categoryId: 'c' } },
      { template: { accountId: 'b', toAccountId: 'a', categoryId: null } },
    ];
    assert.equal(ruleUsage('a', rules), 2);
    assert.equal(ruleUsage('c', rules), 1);
    assert.equal(ruleUsage('z', rules), 0);
  });
});

describe('recurring totals', () => {
  const rule = (type, amount, frequency, extra = {}) => ({ frequency, template: { type, amount: amount * 100, toAccountId: extra.to ?? null }, ...extra });
  const kinds = { sip: 'investment', card: 'credit_card' };
  const rules = [
    rule('expense', 25000, 'monthly'),            // rent
    rule('expense', 649, 'monthly'),              // netflix
    rule('expense', 1200, 'yearly'),              // domain
    rule('expense', 300, 'weekly'),               // maid, 300 × 52 / 12 = 1300 a month
    rule('expense', 999, 'monthly', { paused: true }),
    rule('expense', 500, 'monthly', { endDate: '2026-01-31' }),
    rule('transfer', 5000, 'monthly', { to: 'sip' }),
    rule('transfer', 10000, 'monthly', { to: 'card' }),
    rule('income', 90000, 'monthly'),
  ];
  const t = recurringTotals(rules, (id) => kinds[id], '2026-09-26');
  test('monthly and yearly run-rate for expenses', () => {
    assert.equal(t.expense.monthly, r(25000 + 649 + 1300));
    assert.equal(t.expense.yearlyOnly, r(1200));
    assert.equal(t.expense.annual, 12 * r(26949) + r(1200));
    assert.equal(t.expense.count, 4, 'paused and ended are left out');
  });
  test('SIPs, other transfers and income are kept apart', () => {
    assert.deepEqual([t.investment.monthly, t.transfer.monthly, t.income.monthly], [r(5000), r(10000), r(90000)]);
    assert.equal(t.investment.annual, r(60000));
  });
});
