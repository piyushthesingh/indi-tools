/* Backup files and CSV export. Pure: the UI reads the data, these build
   and check the files. */

import { SCHEMA_VERSION, migrateData } from './defaults.js';
import { paiseToRupeesString } from './money.js';

export const APP_ID = 'indi-spend';
export const DATA_KEYS = ['accounts', 'categories', 'transactions', 'recurring', 'budgets', 'settings'];

/* Settings that describe this device, not the data. A restore keeps the
   current device's values for these. */
export const DEVICE_SETTINGS = ['persistRequested', 'persistGranted'];

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/* data.settings is a plain object here ({ key: value }). Arrays are sorted
   by id so two exports of the same data are byte-for-byte identical. */
export function buildBackup(data, exportedAt = new Date().toISOString()) {
  const out = {};
  for (const k of DATA_KEYS) {
    out[k] = k === 'settings'
      ? Object.fromEntries(Object.entries(data.settings || {}).sort(([a], [b]) => (a < b ? -1 : 1)))
      : [...(data[k] || [])].sort(byId);
  }
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt, data: out };
}

export function backupFilename(today, prefix = 'worthday-backup') {
  return `${prefix}-${today}.json`;
}

/* Returns { ok: true, backup, counts } or { ok: false, error }. Older
   schemas are migrated; newer ones are refused. */
export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a Worthday backup (it is not valid JSON).' };
  }
  if (!obj || obj.app !== APP_ID) return { ok: false, error: 'This file is not a Worthday backup.' };
  const v = obj.schemaVersion;
  if (!Number.isInteger(v) || v < 1) return { ok: false, error: 'This backup has no valid schema version.' };
  if (v > SCHEMA_VERSION) return { ok: false, error: 'This backup was made by a newer version of Worthday. Update the app, then try again.' };
  const d = obj.data;
  if (!d || typeof d !== 'object') return { ok: false, error: 'This backup has no data in it.' };
  for (const k of DATA_KEYS) {
    if (k === 'settings') {
      if (d.settings != null && (typeof d.settings !== 'object' || Array.isArray(d.settings))) return { ok: false, error: 'The settings in this backup are damaged.' };
    } else if (!Array.isArray(d[k] ?? [])) {
      return { ok: false, error: `The ${k} in this backup are damaged.` };
    }
  }
  const bad = (d.transactions || []).find((t) => !t?.id || !Number.isInteger(t.amount) || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || ''));
  if (bad) return { ok: false, error: 'Some transactions in this backup are damaged.' };

  let data = Object.fromEntries(DATA_KEYS.map((k) => [k, d[k] ?? (k === 'settings' ? {} : [])]));
  // a hand-edited or tampered file must not smuggle CSS (url(…)) in as a colour;
  // only values that are present and invalid are replaced, so a clean backup restores unchanged
  const clean = (r) => (r && r.color != null && safeColor(r.color) !== r.color ? { ...r, color: safeColor(r.color) } : r);
  data.accounts = data.accounts.map(clean);
  data.categories = data.categories.map(clean);
  try {
    data = migrateData(data, v);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const backup = { ...obj, schemaVersion: SCHEMA_VERSION, data };
  return { ok: true, backup, counts: countsOf(data), fromVersion: v };
}

/* A colour from a file is only kept if it is a plain hex colour. */
export function safeColor(c) {
  return typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : '#8A9BA8';
}

export function countsOf(data) {
  return Object.fromEntries(DATA_KEYS.filter((k) => k !== 'settings').map((k) => [k, (data[k] || []).length]));
}

/* What to write on restore: the backup's settings, with this device's own
   values kept for DEVICE_SETTINGS when it has them. */
export function mergeSettings(backupSettings, currentSettings) {
  const out = { ...backupSettings };
  for (const k of DEVICE_SETTINGS) if (k in currentSettings) out[k] = currentSettings[k];
  out.onboarded = true;
  return out;
}

/* ─── CSV ─── */

export const CSV_COLUMNS = ['date', 'type', 'amount', 'account', 'to account', 'category', 'payee', 'note'];

function cell(v) {
  let s = String(v ?? '');
  // stop spreadsheets from running a payee or note as a formula
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* lookups: { account(id) → name, category(id) → name }. Oldest first. */
export function toCSV(txns, lookups) {
  const rows = [...txns].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1));
  const lines = [CSV_COLUMNS.join(',')];
  for (const t of rows) {
    lines.push([
      t.date, t.type, paiseToRupeesString(t.amount),
      lookups.account(t.accountId) ?? '', t.toAccountId ? lookups.account(t.toAccountId) ?? '' : '',
      t.categoryId ? lookups.category(t.categoryId) ?? '' : '', t.payee, t.note,
    ].map(cell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
