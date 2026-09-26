/* Seed data and small helpers shared by the database, onboarding and
   backups. No DOM access, so it can be tested. */

export const SCHEMA_VERSION = 1;

export const KINDS = ['credit_card', 'upi', 'bank', 'wallet', 'cash', 'investment'];

/* Groups are derived from kind, never stored. */
export const GROUPS = [
  { id: 'cards', name: 'Credit cards', kinds: ['credit_card'] },
  { id: 'digital', name: 'Digital cash', kinds: ['upi', 'bank', 'wallet'] },
  { id: 'cash', name: 'Cash', kinds: ['cash'] },
  { id: 'investments', name: 'Investments', kinds: ['investment'] },
];

/* Investments only take money in or out by transfer; they are never a way
   to pay for an expense or receive income. */
export const SPENDABLE_KINDS = ['credit_card', 'upi', 'bank', 'wallet', 'cash'];

export function groupOf(kind) {
  return GROUPS.find((g) => g.kinds.includes(kind))?.id ?? 'digital';
}

export const KIND_LABELS = {
  credit_card: 'Credit card', upi: 'UPI', bank: 'Bank account', wallet: 'Wallet', cash: 'Cash', investment: 'Investment',
};

/* Colours chosen to read on both the dark and light backgrounds and to be
   told apart at a glance in chips, tiles and chart slices. */
export const ACCOUNT_COLORS = [
  '#4F8EF7', '#D6457A', '#2BB3E6', '#F08A24', '#E5484D', '#8E6CEF',
  '#A64CC2', '#3FB27F', '#8A9BA8', '#E0B423', '#A87B5D', '#2FA59A',
];

export const ACCOUNT_PRESETS = [
  { key: 'hdfc', name: 'HDFC', kind: 'credit_card', color: '#4F8EF7' },
  { key: 'axis', name: 'Axis', kind: 'credit_card', color: '#D6457A' },
  { key: 'sbi', name: 'SBI', kind: 'credit_card', color: '#2BB3E6' },
  { key: 'icici', name: 'ICICI', kind: 'credit_card', color: '#F08A24' },
  { key: 'kotak', name: 'Kotak', kind: 'credit_card', color: '#E5484D' },
  { key: 'amex', name: 'Amex', kind: 'credit_card', color: '#8E6CEF' },
  { key: 'idfc', name: 'IDFC First', kind: 'credit_card', color: '#B8A13A' },
  { key: 'upi', name: 'UPI', kind: 'upi', color: '#3FB27F' },
  { key: 'bank', name: 'Bank account', kind: 'bank', color: '#8A9BA8' },
  { key: 'wallet', name: 'Wallet', kind: 'wallet', color: '#E0B423' },
  { key: 'cash', name: 'Cash', kind: 'cash', color: '#A87B5D' },
];

const EXPENSE = [
  ['food', 'Food and dining', '🍽️', '#F08A24'],
  ['groceries', 'Groceries', '🛒', '#3FB27F'],
  ['transport', 'Transport', '🚕', '#E0B423'],
  ['fuel', 'Fuel', '⛽', '#A87B5D'],
  ['shopping', 'Shopping', '🛍️', '#D6457A'],
  ['apparel', 'Apparel', '👕', '#C06BD6'],
  ['bills', 'Bills and utilities', '💡', '#4F8EF7'],
  ['rent', 'Rent', '🏠', '#8E6CEF'],
  ['health', 'Health', '💊', '#E5484D'],
  ['entertainment', 'Entertainment', '🎬', '#F2C94C'],
  ['subscriptions', 'Subscriptions', '🔁', '#2BB3E6'],
  ['travel', 'Travel', '✈️', '#2FA59A'],
  ['education', 'Education', '📚', '#6C8CD5'],
  ['personal', 'Personal care', '💇', '#EE8AA5'],
  ['gifts', 'Gifts', '🎁', '#B57FE0'],
  ['emi', 'EMI and loans', '🏦', '#8A9BA8'],
  ['other', 'Other', '📦', '#7C8B84'],
];

const INCOME = [
  ['salary', 'Salary', '💼', '#3FB27F'],
  ['freelance', 'Freelance', '💻', '#4F8EF7'],
  ['interest', 'Interest', '📈', '#E0B423'],
  ['other-income', 'Other income', '💰', '#7C8B84'],
];

/* Default categories get stable ids so backups and deep links line up
   across devices. User-made ones get a uuid. */
export const DEFAULT_CATEGORIES = [
  ...EXPENSE.map(([key, name, icon, color], i) => ({ id: 'cat-' + key, name, icon, color, type: 'expense', order: i, archived: false })),
  ...INCOME.map(([key, name, icon, color], i) => ({ id: 'cat-' + key, name, icon, color, type: 'income', order: i, archived: false })),
];

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'acct';
}

/* "hdfc", then "hdfc2", "hdfc3"… so deep links stay unambiguous. */
export function uniqueShortCode(base, taken) {
  const set = new Set([...taken].map((x) => x.toLowerCase()));
  const root = slugify(base);
  if (!set.has(root)) return root;
  for (let i = 2; ; i++) if (!set.has(root + i)) return root + i;
}

export function nextColor(used) {
  const set = new Set(used.map((c) => c.toLowerCase()));
  return ACCOUNT_COLORS.find((c) => !set.has(c.toLowerCase())) ?? ACCOUNT_COLORS[used.length % ACCOUNT_COLORS.length];
}

/* A complete account record with every field the model defines. */
export function makeAccount(fields, now = new Date().toISOString()) {
  const kind = fields.kind ?? 'cash';
  const base = {
    id: fields.id ?? uuid(),
    name: String(fields.name ?? '').trim() || KIND_LABELS[kind],
    shortCode: fields.shortCode ?? slugify(fields.name ?? kind),
    kind,
    color: fields.color ?? ACCOUNT_COLORS[0],
    order: fields.order ?? 0,
    archived: !!fields.archived,
    createdAt: fields.createdAt ?? now,
    updatedAt: now,
  };
  if (kind === 'credit_card') {
    return {
      ...base,
      statementDay: clampDay(fields.statementDay),
      dueDay: clampDay(fields.dueDay),
      limit: fields.limit ?? null,
      openingOutstanding: fields.openingOutstanding ?? 0,
      cashback: fields.cashback ?? null,
    };
  }
  if (kind === 'investment') {
    // history: amounts invested before tracking began, each with its date
    return { ...base, history: (fields.history || []).map((e) => ({ id: e.id ?? uuid(), date: e.date, amount: e.amount })) };
  }
  return { ...base, trackBalance: !!fields.trackBalance, openingBalance: fields.openingBalance ?? 0 };
}

/* Missing stays null so validation can ask for it rather than guess day 1. */
function clampDay(d) {
  if (d == null || d === '') return null;
  const n = Math.round(Number(d));
  return Number.isFinite(n) ? Math.min(31, Math.max(1, n)) : null;
}

/* Upgrades a backup's data object from an older schema to the current one.
   Each step takes version v data and returns version v+1. */
const DATA_MIGRATIONS = {
  // 1 → 2: add future steps here, mirroring the IndexedDB upgrades in db.js
};

export function migrateData(data, fromVersion) {
  let d = data;
  for (let v = fromVersion; v < SCHEMA_VERSION; v++) {
    const step = DATA_MIGRATIONS[v];
    if (!step) throw new Error(`No migration from schema ${v}`);
    d = step(d);
  }
  return d;
}
