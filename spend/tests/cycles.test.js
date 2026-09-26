import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveDay, nextStatementDate, lastStatementDate, currentCycle, previousCycle,
  dueDateFor, netSpend, outstanding, cardSummary,
} from '../js/lib/cycles.js';

const r = (rupees) => rupees * 100;
let n = 0;
const exp = (date, rupees, accountId = 'c') => ({ id: 't' + n++, type: 'expense', date, amount: r(rupees), accountId });
const refund = (date, rupees, accountId = 'c') => ({ id: 't' + n++, type: 'refund', date, amount: r(rupees), accountId });
const pay = (date, rupees, to = 'c', from = 'bank') => ({ id: 't' + n++, type: 'transfer', date, amount: r(rupees), accountId: from, toAccountId: to });
const card = (S, D, extra = {}) => ({ id: 'c', kind: 'credit_card', statementDay: S, dueDay: D, openingOutstanding: 0, limit: null, ...extra });

describe('effectiveDay', () => {
  test('clamps to the month length', () => {
    assert.equal(effectiveDay(2025, 2, 31), 28);
    assert.equal(effectiveDay(2024, 2, 31), 29);
    assert.equal(effectiveDay(2025, 4, 31), 30);
    assert.equal(effectiveDay(2025, 1, 31), 31);
    assert.equal(effectiveDay(2025, 2, 15), 15);
  });
});

describe('statement day 31 in February', () => {
  test('non-leap year closes on 28 Feb', () => {
    assert.equal(nextStatementDate(31, '2025-02-10'), '2025-02-28');
    assert.equal(lastStatementDate(31, '2025-02-10'), '2025-01-31');
    assert.deepEqual(currentCycle(31, '2025-02-10'), { from: '2025-02-01', to: '2025-02-28' });
    // the next cycle starts on 1 March and runs to 31 March
    assert.deepEqual(currentCycle(31, '2025-03-01'), { from: '2025-03-01', to: '2025-03-31' });
    assert.equal(lastStatementDate(31, '2025-03-01'), '2025-02-28');
  });

  test('leap year closes on 29 Feb', () => {
    assert.equal(nextStatementDate(31, '2024-02-10'), '2024-02-29');
    assert.equal(nextStatementDate(31, '2024-02-29'), '2024-02-29');
    assert.deepEqual(currentCycle(31, '2024-02-29'), { from: '2024-02-01', to: '2024-02-29' });
    assert.deepEqual(currentCycle(31, '2024-03-01'), { from: '2024-03-01', to: '2024-03-31' });
  });

  test('statement day 30 skips to 1 March after a short February', () => {
    assert.deepEqual(currentCycle(30, '2025-02-10'), { from: '2025-01-31', to: '2025-02-28' });
    assert.deepEqual(currentCycle(30, '2025-03-01'), { from: '2025-03-01', to: '2025-03-30' });
  });

  test('a spend on 28 Feb (non-leap) is in the February statement', () => {
    const txns = [exp('2025-02-28', 500), exp('2025-03-01', 200)];
    const onFeb28 = cardSummary(card(31, 20), txns, '2025-02-28');
    assert.equal(onFeb28.unbilled, r(500), 'future-dated 1 Mar is not counted yet');
    const onMar1 = cardSummary(card(31, 20), txns, '2025-03-01');
    assert.equal(onMar1.unbilled, r(200));
    assert.equal(onMar1.billedDue, r(500));
    assert.equal(onMar1.dueDate, '2025-03-20');
  });
});

describe('today relative to the statement date', () => {
  const txns = [exp('2026-08-20', 1000), exp('2026-09-15', 300)];

  test('today is exactly the statement date: that day is still unbilled', () => {
    const s = cardSummary(card(15, 5), txns, '2026-09-15');
    assert.equal(s.nextStatement, '2026-09-15');
    assert.equal(s.lastStatement, '2026-08-15');
    assert.deepEqual(s.cycle, { from: '2026-08-16', to: '2026-09-15' });
    assert.equal(s.daysToStatement, 0);
    assert.equal(s.unbilled, r(1300));
    assert.equal(s.billedDue, 0);
  });

  test('today is the day after the statement date: it is now billed', () => {
    const s = cardSummary(card(15, 5), txns, '2026-09-16');
    assert.equal(s.nextStatement, '2026-10-15');
    assert.equal(s.lastStatement, '2026-09-15');
    assert.deepEqual(s.cycle, { from: '2026-09-16', to: '2026-10-15' });
    assert.deepEqual(s.previousCycle, { from: '2026-08-16', to: '2026-09-15' });
    assert.equal(s.daysToStatement, 29);
    assert.equal(s.unbilled, 0);
    assert.equal(s.billedDue, r(1300));
    assert.equal(s.dueDate, '2026-10-05');
    assert.equal(s.daysToDue, 19);
  });
});

describe('due dates', () => {
  test('due day smaller than statement day falls next month', () => {
    assert.equal(dueDateFor('2026-09-20', 8), '2026-10-08');
    assert.equal(dueDateFor('2026-09-15', 15), '2026-10-15', 'equal days also roll to next month');
  });

  test('due day larger than statement day falls the same month', () => {
    assert.equal(dueDateFor('2026-09-05', 25), '2026-09-25');
    const s = cardSummary(card(5, 25), [], '2026-09-10');
    assert.equal(s.lastStatement, '2026-09-05');
    assert.equal(s.dueDate, '2026-09-25');
  });

  test('due day clamps in short months', () => {
    assert.equal(dueDateFor('2025-01-31', 30), '2025-02-28');
    assert.equal(dueDateFor('2025-01-10', 31), '2025-01-31');
    assert.equal(dueDateFor('2025-02-10', 31), '2025-02-28');
  });

  test('year boundary: December statement, January due', () => {
    assert.equal(dueDateFor('2026-12-20', 10), '2027-01-10');
    const s = cardSummary(card(20, 10), [exp('2026-12-01', 4000)], '2026-12-25');
    assert.equal(s.lastStatement, '2026-12-20');
    assert.equal(s.dueDate, '2027-01-10');
    assert.equal(s.nextStatement, '2027-01-20');
    assert.deepEqual(s.cycle, { from: '2026-12-21', to: '2027-01-20' });
    assert.equal(s.billedDue, r(4000));
    assert.equal(s.daysToDue, 16);
  });

  test('year boundary going back: January looks at the December statement', () => {
    assert.equal(lastStatementDate(20, '2026-01-05'), '2025-12-20');
    assert.deepEqual(previousCycle(20, '2026-01-05'), { from: '2025-11-21', to: '2025-12-20' });
    assert.equal(nextStatementDate(31, '2026-12-31'), '2026-12-31');
    assert.deepEqual(currentCycle(31, '2027-01-01'), { from: '2027-01-01', to: '2027-01-31' });
  });

  test('overdue once the due date passes with billed amount left', () => {
    const s = cardSummary(card(15, 5), [exp('2026-09-01', 100)], '2026-10-06');
    assert.equal(s.dueDate, '2026-10-05');
    assert.equal(s.overdue, true);
  });
});

describe('payments and refunds', () => {
  // S=15, D=5, today 26 Sep: billed cycle 16 Aug–15 Sep, current 16 Sep–15 Oct
  const base = [exp('2026-09-01', 10000), exp('2026-09-20', 2000)];
  const today = '2026-09-26';

  test('baseline: billed and unbilled split on the statement date', () => {
    const s = cardSummary(card(15, 5), base, today);
    assert.equal(s.outstanding, r(12000));
    assert.equal(s.unbilled, r(2000));
    assert.equal(s.billedDue, r(10000));
    assert.equal(s.dueDate, '2026-10-05');
  });

  test('partial payment reduces billed due, not unbilled', () => {
    const s = cardSummary(card(15, 5), [...base, pay('2026-09-22', 4000)], today);
    assert.equal(s.outstanding, r(8000));
    assert.equal(s.unbilled, r(2000));
    assert.equal(s.billedDue, r(6000));
  });

  test('paying exactly the billed amount clears it', () => {
    const s = cardSummary(card(15, 5), [...base, pay('2026-09-22', 10000)], today);
    assert.equal(s.billedDue, 0);
    assert.equal(s.unbilled, r(2000));
  });

  test('payment larger than billed: billed due floors at 0, then credit', () => {
    const more = cardSummary(card(15, 5), [...base, pay('2026-09-22', 11000)], today);
    assert.equal(more.billedDue, 0);
    assert.equal(more.outstanding, r(1000));
    assert.equal(more.credit, 0);

    const overpaid = cardSummary(card(15, 5), [...base, pay('2026-09-22', 15000)], today);
    assert.equal(overpaid.billedDue, 0);
    assert.equal(overpaid.outstanding, r(-3000));
    assert.equal(overpaid.credit, r(3000));
    assert.equal(overpaid.unbilled, r(2000));
  });

  test('carry-over: unpaid billed amount stays due into the next cycle', () => {
    // nothing paid for the September statement; now it is November
    const s = cardSummary(card(15, 5), [...base, pay('2026-10-01', 3000)], '2026-11-10');
    // cycle 16 Oct–15 Nov has no spends; everything owed is billed
    assert.equal(s.unbilled, 0);
    assert.equal(s.outstanding, r(9000));
    assert.equal(s.billedDue, r(9000));
  });

  test('refund in the current cycle reduces unbilled and outstanding', () => {
    const s = cardSummary(card(15, 5), [...base, refund('2026-09-24', 500)], today);
    assert.equal(s.unbilled, r(1500));
    assert.equal(s.outstanding, r(11500));
    assert.equal(s.billedDue, r(10000));
  });

  test('refund bigger than this cycle\'s spend shows as a credit on unbilled, billed stays', () => {
    // matches a bank: the refund lands on the next statement, the issued bill is unchanged
    const s = cardSummary(card(15, 5), [...base, refund('2026-09-24', 3000)], today);
    assert.equal(s.unbilled, r(-1000));
    assert.equal(s.outstanding, r(9000));
    assert.equal(s.billedDue, r(10000));
  });

  test('refunds and spends on other accounts are ignored', () => {
    const s = cardSummary(card(15, 5), [...base, exp('2026-09-21', 999, 'other'), refund('2026-09-21', 5, 'other')], today);
    assert.equal(s.unbilled, r(2000));
  });

  test('transfer out of the card counts as owed', () => {
    const cashWithdrawal = { type: 'transfer', date: '2026-09-21', amount: r(1000), accountId: 'c', toAccountId: 'cash' };
    const s = cardSummary(card(15, 5), [...base, cashWithdrawal], today);
    assert.equal(s.outstanding, r(13000));
    assert.equal(s.unbilled, r(2000), 'a transfer is not spend');
    assert.equal(s.billedDue, r(11000));
  });

  test('income credited to the card (cashback) reduces outstanding', () => {
    const cb = { type: 'income', date: '2026-09-21', amount: r(200), accountId: 'c' };
    const s = cardSummary(card(15, 5), [...base, cb], today);
    assert.equal(s.outstanding, r(11800));
  });
});

describe('opening outstanding, limit and future dates', () => {
  test('opening outstanding counts as billed', () => {
    const s = cardSummary(card(15, 5, { openingOutstanding: r(5000) }), [exp('2026-09-20', 100)], '2026-09-26');
    assert.equal(s.outstanding, r(5100));
    assert.equal(s.billedDue, r(5000));
    assert.equal(s.unbilled, r(100));
  });

  test('utilisation only when a limit is set', () => {
    const txns = [exp('2026-09-20', 12000)];
    assert.equal(cardSummary(card(15, 5), txns, '2026-09-26').utilisation, null);
    assert.equal(cardSummary(card(15, 5, { limit: r(100000) }), txns, '2026-09-26').utilisation, 0.12);
  });

  test('transactions after the current cycle do not inflate billed due', () => {
    const txns = [exp('2026-09-20', 100), exp('2026-11-01', 9999)];
    const s = cardSummary(card(15, 5), txns, '2026-09-26');
    assert.equal(s.unbilled, r(100));
    assert.equal(s.billedDue, 0);
  });

  test('netSpend over an explicit range', () => {
    const txns = [exp('2026-09-01', 100), exp('2026-09-10', 200), refund('2026-09-10', 50), pay('2026-09-10', 1000)];
    assert.equal(netSpend('c', txns, '2026-09-01', '2026-09-10'), r(250));
    assert.equal(netSpend('c', txns, '2026-09-02', '2026-09-30'), r(150));
  });

  test('outstanding with an upTo date', () => {
    const txns = [exp('2026-09-01', 100), exp('2026-10-01', 200)];
    assert.equal(outstanding(card(15, 5), txns), r(300));
    assert.equal(outstanding(card(15, 5), txns, '2026-09-30'), r(100));
  });
});
