/* Deep links for shortcuts:
   /spend/?amt=250&via=hdfc&cat=food&payee=Swiggy&note=dinner&type=expense
   All optional. They only pre-fill quick add; the user always taps Save.

   via  matches an account's shortCode (case-insensitive, active accounts)
   cat  matches a category name case-insensitively: exact name first, then
        a name starting with it ("food" → "Food and dining"), then a name
        containing it as a word
   to   (transfers) matches the destination account's shortCode */

import { parseAmount } from './money.js';
import { TYPES, categoryTypeFor } from './transactions.js';
import { SPENDABLE_KINDS } from './defaults.js';

export const LINK_PARAMS = ['amt', 'via', 'cat', 'payee', 'note', 'type', 'to'];

export function hasDeepLink(search) {
  const p = new URLSearchParams(search);
  return LINK_PARAMS.some((k) => p.has(k));
}

export function matchCategory(categories, text, catType) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return null;
  const pool = categories.filter((c) => !c.archived && (!catType || c.type === catType));
  return pool.find((c) => c.name.toLowerCase() === q)
    || pool.find((c) => c.name.toLowerCase().startsWith(q))
    || pool.find((c) => c.name.toLowerCase().split(/[^a-z0-9]+/).includes(q))
    || null;
}

export function matchAccount(accounts, code) {
  const q = String(code || '').trim().toLowerCase();
  if (!q) return null;
  return accounts.find((a) => !a.archived && a.shortCode?.toLowerCase() === q) || null;
}

/* A query value decoded without turning "+" into a space. URLSearchParams
   follows form encoding, where "+" means space, so amt=120+80 would read
   as "120 80". For an amount, "+" is almost always meant as plus. */
export function rawParam(search, name) {
  const m = new RegExp('(?:^|[?&])' + name + '=([^&#]*)').exec(search);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

/* Returns { prefill, notes } where notes explain anything not matched. */
export function parseDeepLink(search, { accounts, categories }) {
  const p = new URLSearchParams(search);
  const prefill = {};
  const notes = [];

  const type = (p.get('type') || '').toLowerCase();
  prefill.type = TYPES.includes(type) ? type : 'expense';
  if (p.get('type') && !TYPES.includes(type)) notes.push(`Unknown type "${p.get('type')}"`);

  if (p.has('amt')) {
    const amt = parseAmount(rawParam(search, 'amt') ?? p.get('amt'));
    if (amt > 0) prefill.amount = amt;
    else notes.push(`Could not read amount "${p.get('amt')}"`);
  }
  if (p.has('via')) {
    const a = matchAccount(accounts, p.get('via'));
    // an investment can only be the source of a transfer, never how you paid
    if (a && (prefill.type === 'transfer' || SPENDABLE_KINDS.includes(a.kind))) prefill.accountId = a.id;
    else notes.push(`No payment method with code "${p.get('via')}"`);
  }
  if (p.has('to') && prefill.type === 'transfer') {
    const a = matchAccount(accounts, p.get('to'));
    if (a) prefill.toAccountId = a.id;
    else notes.push(`No payment method with code "${p.get('to')}"`);
  }
  if (p.has('cat') && prefill.type !== 'transfer') {
    const c = matchCategory(categories, p.get('cat'), categoryTypeFor(prefill.type));
    if (c) prefill.categoryId = c.id;
    else notes.push(`No category matching "${p.get('cat')}"`);
  }
  const payee = (p.get('payee') || '').trim().slice(0, 80);
  const note = (p.get('note') || '').trim().slice(0, 200);
  if (payee) prefill.payee = payee;
  if (note) prefill.note = note;
  return { prefill, notes };
}
