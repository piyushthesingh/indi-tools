import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, backupFilename, mergeSettings, toCSV, countsOf } from '../js/lib/backup.js';
import { parseDeepLink, matchCategory, hasDeepLink } from '../js/lib/deeplink.js';
import { DEFAULT_CATEGORIES, SCHEMA_VERSION } from '../js/lib/defaults.js';

const accounts = [
  { id: 'a1', name: 'HDFC Millennia', shortCode: 'hdfc', kind: 'credit_card' },
  { id: 'a2', name: 'UPI', shortCode: 'upi', kind: 'upi' },
  { id: 'a3', name: 'Old card', shortCode: 'old', kind: 'credit_card', archived: true },
];
const data = {
  accounts,
  categories: DEFAULT_CATEGORIES,
  transactions: [
    { id: 't2', type: 'expense', amount: 42050, date: '2026-09-02', accountId: 'a1', toAccountId: null, categoryId: 'cat-food', payee: 'Swiggy, Koramangala', note: 'said "thanks"', createdAt: '2026-09-02T10:00:00Z' },
    { id: 't1', type: 'transfer', amount: 1000000, date: '2026-09-01', accountId: 'a2', toAccountId: 'a1', categoryId: null, payee: '', note: '=HYPERLINK("x")', createdAt: '2026-09-01T10:00:00Z' },
  ],
  recurring: [{ id: 'r1', frequency: 'monthly', dayOfMonth: 1, pending: ['2026-09-01'] }],
  budgets: [{ id: 'default', month: 'default', totalLimit: 4000000, categoryLimits: {} }],
  settings: { onboarded: true, theme: 'dark', persistGranted: true, lastBackupAt: '2026-09-01T00:00:00Z' },
};

describe('backup', () => {
  test('round trip gives back identical data', () => {
    const b = buildBackup(data, '2026-09-26T10:00:00.000Z');
    assert.equal(b.app, 'indi-spend');
    assert.equal(b.schemaVersion, SCHEMA_VERSION);
    const parsed = parseBackup(JSON.stringify(b));
    assert.ok(parsed.ok);
    // export the restored data again: byte-for-byte the same file
    const again = buildBackup(parsed.backup.data, '2026-09-26T10:00:00.000Z');
    assert.equal(JSON.stringify(again), JSON.stringify(b));
    assert.deepEqual(parsed.counts, { accounts: 3, categories: 21, transactions: 2, recurring: 1, budgets: 1 });
  });

  test('export is stable regardless of input order', () => {
    const shuffled = { ...data, transactions: [...data.transactions].reverse(), settings: { theme: 'dark', onboarded: true, lastBackupAt: data.settings.lastBackupAt, persistGranted: true } };
    assert.equal(JSON.stringify(buildBackup(shuffled, 'x')), JSON.stringify(buildBackup(data, 'x')));
  });

  test('refuses what is not a Worthday backup', () => {
    assert.match(parseBackup('nope').error, /not valid JSON/);
    assert.match(parseBackup('{"app":"other"}').error, /not a Worthday backup/);
    assert.match(parseBackup(JSON.stringify({ app: 'indi-spend', schemaVersion: SCHEMA_VERSION + 1, data: {} })).error, /newer version/);
    assert.match(parseBackup(JSON.stringify({ app: 'indi-spend', schemaVersion: 'x', data: {} })).error, /schema/);
    assert.match(parseBackup(JSON.stringify({ app: 'indi-spend', schemaVersion: 1, data: { transactions: [{ id: 'x', amount: 1.5, date: '2026-01-01' }] } })).error, /damaged/);
    assert.match(parseBackup(JSON.stringify({ app: 'indi-spend', schemaVersion: 1, data: { accounts: 'x' } })).error, /accounts/);
  });

  test('missing collections become empty', () => {
    const p = parseBackup(JSON.stringify({ app: 'indi-spend', schemaVersion: 1, exportedAt: 'x', data: { transactions: [] } }));
    assert.ok(p.ok);
    assert.deepEqual(countsOf(p.backup.data), { accounts: 0, categories: 0, transactions: 0, recurring: 0, budgets: 0 });
  });

  test('restore keeps this device\'s storage flags', () => {
    const merged = mergeSettings({ theme: 'light', persistGranted: true, lastBackupAt: 'x' }, { persistGranted: false, persistRequested: true, theme: 'dark' });
    assert.deepEqual(merged, { theme: 'light', persistGranted: false, persistRequested: true, lastBackupAt: 'x', onboarded: true });
    // a freshly wiped device has no flags of its own: the backup's stay
    assert.equal(mergeSettings({ persistGranted: true }, {}).persistGranted, true);
  });

  test('filename', () => {
    assert.equal(backupFilename('2026-09-26'), 'worthday-backup-2026-09-26.json');
  });
});

describe('CSV', () => {
  const csv = toCSV(data.transactions, {
    account: (id) => accounts.find((a) => a.id === id)?.name,
    category: (id) => DEFAULT_CATEGORIES.find((c) => c.id === id)?.name,
  });
  const lines = csv.trimEnd().split('\r\n');

  test('header and order (oldest first)', () => {
    assert.equal(lines[0], 'date,type,amount,account,to account,category,payee,note');
    assert.ok(lines[1].startsWith('2026-09-01,transfer,10000.00,UPI,HDFC Millennia,,'));
  });

  test('rupees with two decimals, quoting, formula guard', () => {
    assert.equal(lines[2], '2026-09-02,expense,420.50,HDFC Millennia,,Food and dining,"Swiggy, Koramangala","said ""thanks"""');
    assert.ok(lines[1].endsWith(`,"'=HYPERLINK(""x"")"`));
  });
});

describe('deep links', () => {
  const ctx = { accounts, categories: DEFAULT_CATEGORIES };

  test('the spec example', () => {
    const { prefill, notes } = parseDeepLink('?amt=250&via=hdfc&cat=food&payee=Swiggy&note=dinner&type=expense', ctx);
    assert.deepEqual(prefill, { type: 'expense', amount: 25000, accountId: 'a1', categoryId: 'cat-food', payee: 'Swiggy', note: 'dinner' });
    assert.deepEqual(notes, []);
  });

  test('everything optional; case-insensitive; maths in amt', () => {
    assert.deepEqual(parseDeepLink('?type=transfer', ctx).prefill, { type: 'transfer' });
    assert.deepEqual(parseDeepLink('?VIA=x', ctx).prefill, { type: 'expense' }, 'param names are case-sensitive');
    const p = parseDeepLink('?amt=120%2B80&via=HDFC&cat=GROCERIES', ctx).prefill;
    assert.equal(p.amount, 20000);
    assert.equal(p.accountId, 'a1');
    assert.equal(p.categoryId, 'cat-groceries');
  });

  test('category matching: exact, prefix, word', () => {
    assert.equal(matchCategory(DEFAULT_CATEGORIES, 'Rent')?.id, 'cat-rent');
    assert.equal(matchCategory(DEFAULT_CATEGORIES, 'bills')?.id, 'cat-bills');
    assert.equal(matchCategory(DEFAULT_CATEGORIES, 'utilities')?.id, 'cat-bills');
    assert.equal(matchCategory(DEFAULT_CATEGORIES, 'other', 'income')?.id, 'cat-other-income');
    assert.equal(matchCategory(DEFAULT_CATEGORIES, 'other', 'expense')?.id, 'cat-other');
    assert.equal(matchCategory(DEFAULT_CATEGORIES, 'xyz'), null);
  });

  test('income link picks income categories', () => {
    assert.equal(parseDeepLink('?type=income&cat=salary', ctx).prefill.categoryId, 'cat-salary');
    assert.equal(parseDeepLink('?type=expense&cat=salary', ctx).prefill.categoryId, undefined);
  });

  test('unknown values are reported, not guessed', () => {
    const { prefill, notes } = parseDeepLink('?amt=abc&via=nope&cat=zzz&type=weird', ctx);
    assert.deepEqual(prefill, { type: 'expense' });
    assert.equal(notes.length, 4);
    assert.equal(parseDeepLink('?via=old', ctx).prefill.accountId, undefined, 'archived accounts are not matched');
  });

  test('transfer with to', () => {
    assert.deepEqual(parseDeepLink('?type=transfer&via=upi&to=hdfc&amt=5000', ctx).prefill, { type: 'transfer', accountId: 'a2', toAccountId: 'a1', amount: 500000 });
  });

  test('hasDeepLink', () => {
    assert.equal(hasDeepLink('?amt=1'), true);
    assert.equal(hasDeepLink('?sw=prod'), false);
    assert.equal(hasDeepLink(''), false);
  });
});

describe('QA regressions: deep links', () => {
  const ctx = { accounts: [{ id: 'a2', shortCode: 'upi', kind: 'upi' }], categories: DEFAULT_CATEGORIES };
  test('an unencoded + in amt means plus, not a space', () => {
    assert.equal(parseDeepLink('?amt=120+80&via=upi', ctx).prefill.amount, 20000);
    assert.equal(parseDeepLink('?amt=120%2B80', ctx).prefill.amount, 20000);
    assert.equal(parseDeepLink('?amt=1%2C250', ctx).prefill.amount, 125000);
  });
  test('other fields still read + as a space', () => {
    assert.equal(parseDeepLink('?payee=Big+Basket', ctx).prefill.payee, 'Big Basket');
  });
});

import { safeColor } from '../js/lib/backup.js';
describe('audit regressions: backup colours', () => {
  test('only hex colours survive a restore', () => {
    assert.equal(safeColor('#4F8EF7'), '#4F8EF7');
    assert.equal(safeColor('url(https://evil.example/x)'), '#8A9BA8');
    assert.equal(safeColor('red; background:url(x)'), '#8A9BA8');
    assert.equal(safeColor(undefined), '#8A9BA8');
    const bad = { app: 'indi-spend', schemaVersion: 1, data: { accounts: [{ id: 'a', name: 'X', color: 'url(x)' }], categories: [{ id: 'c', name: 'Y', icon: '🍕', color: 'expression(1)' }] } };
    const p = parseBackup(JSON.stringify(bad));
    assert.equal(p.backup.data.accounts[0].color, '#8A9BA8');
    assert.equal(p.backup.data.categories[0].color, '#8A9BA8');
  });
});
