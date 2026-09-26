import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toDateStr, isDateStr, daysInMonth, addDays, diffDays, weekday, addMonths,
  monthStart, monthEnd, sameDayLastMonth, formatDayHeader, formatShort, monthName,
} from '../js/lib/dates.js';

test('toDateStr uses local fields, not UTC', () => {
  // 23:30 local on 31 Dec must stay 31 Dec whatever the machine's zone
  assert.equal(toDateStr(new Date(2025, 11, 31, 23, 30)), '2025-12-31');
  assert.equal(toDateStr(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
});

test('isDateStr validates real calendar dates', () => {
  assert.equal(isDateStr('2024-02-29'), true);
  assert.equal(isDateStr('2025-02-29'), false);
  assert.equal(isDateStr('2025-13-01'), false);
  assert.equal(isDateStr('2025-1-01'), false);
});

test('daysInMonth', () => {
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2025, 2), 28);
  assert.equal(daysInMonth(1900, 2), 28);
  assert.equal(daysInMonth(2000, 2), 29);
  assert.equal(daysInMonth(2025, 12), 31);
  assert.equal(daysInMonth(2025, 4), 30);
});

test('addDays and diffDays cross months and years', () => {
  assert.equal(addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(addDays('2025-03-30', 2), '2025-04-01');
  assert.equal(diffDays('2025-12-25', '2026-01-05'), 11);
  assert.equal(diffDays('2026-01-05', '2025-12-25'), -11);
});

test('weekday', () => {
  assert.equal(weekday('2026-09-26'), 6); // Saturday
  assert.equal(weekday('2026-09-27'), 0);
});

test('month helpers', () => {
  assert.equal(addMonths('2025-12', 1), '2026-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-03', -14), '2025-01');
  assert.equal(monthStart('2024-02'), '2024-02-01');
  assert.equal(monthEnd('2024-02'), '2024-02-29');
  assert.equal(sameDayLastMonth('2025-03-31'), '2025-02-28');
  assert.equal(sameDayLastMonth('2026-01-15'), '2025-12-15');
  assert.equal(monthName('2026-09'), 'September');
  assert.equal(monthName('2026-09', { short: true, withYear: true }), 'Sep 2026');
});

test('display formats', () => {
  assert.equal(formatDayHeader('2026-09-26', '2026-09-26'), 'Today');
  assert.equal(formatDayHeader('2026-09-25', '2026-09-26'), 'Yesterday');
  assert.equal(formatDayHeader('2026-09-21', '2026-09-26'), 'Mon, 21 Sep');
  assert.equal(formatShort('2025-12-05', '2026-09-26'), '5 Dec 2025');
});
