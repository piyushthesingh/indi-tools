/* In-memory copy of the database. Screens read from `state` synchronously
   and change it only through the functions here, which write to IndexedDB
   first and update memory once the write has committed. */

import * as db from './db.js';
import { makeAccount, uuid } from './lib/defaults.js';
import { makeTransaction } from './lib/transactions.js';
import { validateAccount, usageCount } from './lib/accounts.js';
import { makeCategory, validateCategory, categoryUsage } from './lib/categories.js';
import { generate, occurrenceTransaction, occurrenceId, validateRule, backfill, ruleUsage } from './lib/recurring.js';
import { todayStr } from './lib/dates.js';

export const state = {
  accounts: [],
  categories: [],
  transactions: [],
  recurring: [],
  budgets: [],
  settings: {},
};

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* Other open tabs (or the installed app and a browser tab) are told about
   every change and reload their copy, so a stale tab never writes old data
   back, for example regenerating a recurring item another tab edited. */
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('indi-spend') : null;
channel?.addEventListener('message', async () => {
  await load();
  for (const fn of listeners) fn();
});

function emit() {
  for (const fn of listeners) fn();
  channel?.postMessage('changed');
}

export async function load() {
  const all = await db.readAll();
  state.accounts = all.accounts;
  state.categories = all.categories;
  state.transactions = all.transactions;
  state.recurring = all.recurring;
  state.budgets = all.budgets;
  state.settings = Object.fromEntries(all.settings.map((r) => [r.key, r.value]));
}

export const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name);

export function activeAccounts() {
  return state.accounts.filter((a) => !a.archived).sort(byOrder);
}

export function cards({ includeArchived = false } = {}) {
  return state.accounts.filter((a) => a.kind === 'credit_card' && (includeArchived || !a.archived)).sort(byOrder);
}

export function accountById(id) {
  return state.accounts.find((a) => a.id === id);
}

export async function setSetting(key, value) {
  await db.setSetting(key, value);
  state.settings[key] = value;
  emit();
}

export function categoryById(id) {
  return state.categories.find((c) => c.id === id);
}

/* ─── transactions ─── */

export async function addTransaction(fields) {
  const t = makeTransaction(fields);
  await db.put('transactions', t);
  state.transactions.push(t);
  emit();
  return t;
}

export async function updateTransaction(existing, fields) {
  const t = makeTransaction(fields, existing);
  await db.put('transactions', t);
  const i = state.transactions.findIndex((x) => x.id === t.id);
  if (i >= 0) state.transactions[i] = t;
  emit();
  return t;
}

export async function deleteTransaction(id) {
  const t = state.transactions.find((x) => x.id === id);
  if (!t) return null;
  await db.remove('transactions', id);
  state.transactions = state.transactions.filter((x) => x.id !== id);
  emit();
  return t;
}

/* Undo for a delete: puts the exact record back, same id and timestamps. */
export async function restoreTransaction(t) {
  await db.put('transactions', t);
  if (!state.transactions.some((x) => x.id === t.id)) state.transactions.push(t);
  emit();
}

/* ─── accounts ─── */

export async function saveAccount(fields, existing = null) {
  if ('name' in fields && !String(fields.name ?? '').trim()) throw new Error('Give it a name.');
  const order = existing ? existing.order : Math.max(-1, ...state.accounts.map((a) => a.order ?? 0)) + 1;
  const rec = makeAccount({ ...(existing || {}), ...fields, order, createdAt: existing?.createdAt });
  const err = validateAccount(rec, state.accounts);
  if (err) throw new Error(err);
  await db.put('accounts', rec);
  replaceIn(state.accounts, rec);
  emit();
  return rec;
}

export async function setAccountArchived(id, archived) {
  const a = accountById(id);
  if (!a) return;
  return saveAccount({ archived }, a);
}

/* Hard delete only while nothing refers to the account; otherwise archive. */
export async function deleteAccount(id) {
  if (usageCount(id, state.transactions)) throw new Error('This account has transactions. Archive it instead.');
  if (ruleUsage(id, state.recurring)) throw new Error('A recurring item uses this account. Change or delete that first.');
  await db.remove('accounts', id);
  state.accounts = state.accounts.filter((a) => a.id !== id);
  emit();
}

/* ─── categories ─── */

export async function saveCategory(fields, existing = null) {
  const order = existing ? existing.order
    : Math.max(-1, ...state.categories.filter((c) => c.type === fields.type).map((c) => c.order ?? 0)) + 1;
  const rec = makeCategory({ ...fields, order }, existing);
  const err = validateCategory(rec, state.categories);
  if (err) throw new Error(err);
  await db.put('categories', rec);
  replaceIn(state.categories, rec);
  emit();
  return rec;
}

export async function setCategoryArchived(id, archived) {
  const c = categoryById(id);
  if (c) return saveCategory({ ...c, archived }, c);
}

export async function deleteCategory(id) {
  if (categoryUsage(id, state.transactions)) throw new Error('This category has transactions. Archive it instead.');
  if (ruleUsage(id, state.recurring)) throw new Error('A recurring item uses this category. Change or delete it first.');
  // drop it from any budget limits too
  const budgets = state.budgets.filter((b) => b.categoryLimits && id in b.categoryLimits)
    .map((b) => { const categoryLimits = { ...b.categoryLimits }; delete categoryLimits[id]; return { ...b, categoryLimits }; });
  await db.write(['categories', 'budgets'], (s) => {
    s.categories.delete(id);
    for (const b of budgets) s.budgets.put(b);
  });
  state.categories = state.categories.filter((c) => c.id !== id);
  for (const b of budgets) replaceIn(state.budgets, b);
  emit();
}

/* Saves a new order for accounts or categories: ids in their new order. */
export async function reorder(storeName, ids) {
  const list = state[storeName];
  const changed = [];
  ids.forEach((id, i) => {
    const rec = list.find((x) => x.id === id);
    if (rec && rec.order !== i) { rec.order = i; changed.push(rec); }
  });
  if (!changed.length) return;
  await db.write([storeName], (s) => { for (const r of changed) s[storeName].put(r); });
  emit();
}

function replaceIn(list, rec) {
  const i = list.findIndex((x) => x.id === rec.id);
  if (i >= 0) list[i] = rec; else list.push(rec);
}

/* ─── recurring ─── */

/* Runs on every app open (and when the date changes while open). One
   IndexedDB transaction writes the new transactions and the advanced
   rules together, so a crash cannot leave one without the other. */
export async function runRecurring(today = todayStr()) {
  if (!state.recurring.length) return 0;
  const existing = new Set(state.transactions.map((t) => t.id));
  const out = generate(state.recurring, today, existing);
  if (!out.rules.length) return 0;
  await db.write(['transactions', 'recurring'], (st) => {
    for (const t of out.transactions) st.transactions.put(t);
    for (const r of out.rules) st.recurring.put(r);
  });
  for (const t of out.transactions) if (!existing.has(t.id)) state.transactions.push(t);
  for (const r of out.rules) replaceIn(state.recurring, r);
  emit();
  return out.transactions.length;
}

export async function saveRule(fields, existing = null) {
  const rule = {
    id: existing?.id ?? uuid(),
    pending: existing?.pending ?? [],
    lastGeneratedDate: existing?.lastGeneratedDate ?? null,
    paused: false,
    mode: 'confirm',
    endDate: null,
    ...existing,
    ...fields,
  };
  const err = validateRule(rule);
  if (err) throw new Error(err);
  // start date moved earlier: fill in just the new gap
  let extra = [];
  if (existing && rule.startDate < existing.startDate) {
    const gap = backfill(rule, existing.startDate, new Set(state.transactions.map((t) => t.id)));
    rule.pending = gap.pending;
    extra = gap.transactions;
  }
  await db.write(['recurring', 'transactions'], (st) => {
    st.recurring.put(rule);
    for (const t of extra) st.transactions.put(t);
  });
  replaceIn(state.recurring, rule);
  for (const t of extra) replaceIn(state.transactions, t);
  await runRecurring();
  emit();
  return rule;
}

export async function deleteRule(id) {
  await db.remove('recurring', id);
  state.recurring = state.recurring.filter((r) => r.id !== id);
  emit();
}

/* "To log" item: save it (optionally with edited fields) or skip it. Both
   take the date off the rule's pending list in the same transaction. */
export async function resolvePending(ruleId, date, { save = false, fields = null } = {}) {
  const rule = state.recurring.find((r) => r.id === ruleId);
  if (!rule) return null;
  const updated = { ...rule, pending: (rule.pending || []).filter((d) => d !== date) };
  let t = null;
  if (save) {
    const base = occurrenceTransaction(rule, date);
    t = makeTransaction({ ...base, ...(fields || {}), id: occurrenceId(ruleId, date), recurringId: ruleId });
  }
  await db.write(['transactions', 'recurring'], (st) => {
    if (t) st.transactions.put(t);
    st.recurring.put(updated);
  });
  if (t) replaceIn(state.transactions, t);
  replaceIn(state.recurring, updated);
  emit();
  return t;
}

/* ─── budgets ─── */

export async function saveBudget({ month = 'default', totalLimit = null, categoryLimits = {} }) {
  const clean = Object.fromEntries(Object.entries(categoryLimits).filter(([, v]) => Number.isInteger(v) && v > 0));
  const b = { id: month, month, totalLimit: totalLimit > 0 ? totalLimit : null, categoryLimits: clean };
  if (!b.totalLimit && !Object.keys(clean).length) {
    await db.remove('budgets', b.id);
    state.budgets = state.budgets.filter((x) => x.id !== b.id);
  } else {
    await db.put('budgets', b);
    replaceIn(state.budgets, b);
  }
  emit();
  return b;
}

/* ─── backup and delete ─── */

/* Everything, synchronously from memory, so an export can start inside the
   tap that asked for it (iOS only allows the share sheet from a tap). */
export function snapshot() {
  return {
    accounts: state.accounts, categories: state.categories, transactions: state.transactions,
    recurring: state.recurring, budgets: state.budgets, settings: { ...state.settings },
  };
}

export async function replaceAllData(data) {
  await db.replaceAll(data);
  await load();
  emit();
}

export async function deleteAllData() {
  await db.deleteAll();
  await load();
}

/* Onboarding's final step: all accounts, the optional budget and the
   onboarded flag go in one transaction. */
export async function finishOnboarding({ accounts, budgetLimit }) {
  const now = new Date().toISOString();
  const records = accounts.map((a, i) => makeAccount({ ...a, order: i }, now));
  const budget = budgetLimit ? { id: 'default', month: 'default', totalLimit: budgetLimit, categoryLimits: {} } : null;
  await db.write(['accounts', 'budgets', 'settings'], (s) => {
    for (const r of records) s.accounts.put(r);
    if (budget) s.budgets.put(budget);
    s.settings.put({ key: 'onboarded', value: true });
  });
  state.accounts.push(...records);
  if (budget) state.budgets.push(budget);
  state.settings.onboarded = true;
  emit();
}

/* Ask the browser not to evict our data. Safari grants it to Home Screen
   apps; Chrome decides from engagement. The result is shown in Settings. */
export async function requestPersistence() {
  let granted = false;
  try {
    if (navigator.storage?.persist) granted = await navigator.storage.persist();
  } catch { /* unsupported */ }
  await db.setSettings({ persistRequested: true, persistGranted: granted });
  state.settings.persistRequested = true;
  state.settings.persistGranted = granted;
  emit();
  return granted;
}
