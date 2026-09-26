/* Backup, restore, CSV export, delete all data and the shortcut-link
   helper. Files go out through the share sheet on phones (the smoothest
   way to Files or iCloud Drive on iPhone) and as a download elsewhere. */

import { h } from './dom.js';
import { openSheet } from './sheet.js';
import { toast } from './toast.js';
import { applyTheme } from './settings.js';
import { state, snapshot, setSetting, replaceAllData, deleteAllData, accountById, categoryById, activeAccounts, requestPersistence } from '../state.js';
import { buildBackup, backupFilename, parseBackup, mergeSettings, toCSV } from '../lib/backup.js';
import { todayStr, toDateStr, formatShort, diffDays } from '../lib/dates.js';

/* ─── files out ─── */

function shareable(file) {
  try {
    return matchMedia('(pointer: coarse)').matches && !!navigator.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

/* Resolves "shared" or "downloaded"; rejects with AbortError if the user
   closes the share sheet. */
export async function saveFile(filename, text, type, title) {
  const file = new File([text], filename, { type });
  if (shareable(file)) {
    await navigator.share({ files: [file], title });
    return 'shared';
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

const isAbort = (e) => e?.name === 'AbortError';

export async function exportBackup({ quiet = false } = {}) {
  // built synchronously from memory so the share sheet opens within the tap
  const today = todayStr();
  const text = JSON.stringify(buildBackup(snapshot()), null, 1);
  try {
    const how = await saveFile(backupFilename(today), text, 'application/json', 'Spend backup');
    await setSetting('lastBackupAt', new Date().toISOString());
    if (!quiet) toast(how === 'shared' ? 'Backup saved' : 'Backup downloaded');
    return true;
  } catch (e) {
    if (!isAbort(e)) toast('Could not export: ' + (e.message || e));
    return false;
  }
}

export async function exportCSV(txns, label = '') {
  const today = todayStr();
  const csv = toCSV(txns, {
    account: (id) => accountById(id)?.name,
    category: (id) => categoryById(id)?.name,
  });
  try {
    await saveFile(label ? `spend-transactions-${label}.csv` : `spend-transactions-${today}.csv`, csv, 'text/csv', 'Spend transactions');
    toast(`Exported ${txns.length} transaction${txns.length === 1 ? '' : 's'}`);
  } catch (e) {
    if (!isAbort(e)) toast('Could not export: ' + (e.message || e));
  }
}

/* ─── restore ─── */

export function pickRestoreFile() {
  const input = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    const text = await file.text();
    const parsed = parseBackup(text);
    if (!parsed.ok) { toast(parsed.error, { duration: 6000 }); return; }
    openRestoreSheet(parsed, file.name);
  });
  input.addEventListener('cancel', () => input.remove()); // picker closed without a file
  document.body.append(input);
  input.click();
}

function openRestoreSheet(parsed, name) {
  const today = todayStr();
  const { backup, counts, fromVersion } = parsed;
  const hasData = state.transactions.length > 0 || state.accounts.length > 0;
  const when = backup.exportedAt ? formatShort(toDateStr(new Date(backup.exportedAt)), today) : 'unknown date';
  const line = (n, what) => h('li', { class: 'row' }, h('span', { class: 'row-main', text: what }), h('strong', { text: String(n) }));
  const status = h('p', { class: 'error', role: 'alert' });
  let busy = false;

  const run = async (e) => {
    if (busy) return;
    busy = true;
    const btn = e.currentTarget;
    btn.disabled = true;
    if (hasData) {
      status.textContent = '';
      // safety copy of what is here now, before anything is replaced
      const text = JSON.stringify(buildBackup(snapshot()), null, 1);
      try {
        await saveFile(backupFilename(today, 'spend-before-restore'), text, 'application/json', 'Spend safety copy');
      } catch (err) {
        busy = false;
        btn.disabled = false;
        status.textContent = isAbort(err)
          ? 'Restore cancelled: the safety copy was not saved, so nothing was changed.'
          : 'Could not save the safety copy, so nothing was changed. ' + (err.message || '');
        return;
      }
    }
    try {
      const settings = mergeSettings(backup.data.settings || {}, state.settings);
      await replaceAllData({ ...backup.data, settings });
      applyTheme(settings.theme === 'light' ? 'light' : 'dark');
      // reload into the restored data (this also works from onboarding)
      try { sessionStorage.setItem('spend_toast', `Restored ${counts.transactions} transaction${counts.transactions === 1 ? '' : 's'}`); } catch { /* ignore */ }
      location.replace(location.pathname + '#/home');
      location.reload();
    } catch (err) {
      busy = false;
      btn.disabled = false;
      status.textContent = 'Restore failed, your data is unchanged. ' + (err.message || '');
    }
  };

  const sheet = openSheet({
    title: 'Restore this backup?',
    body: h('div', {},
      h('p', { class: 'hint', text: `${name} · made ${when}${fromVersion < backup.schemaVersion ? ' · from an older version, will be upgraded' : ''}` }),
      h('ul', { class: 'rows restore-counts' },
        line(counts.transactions, 'Transactions'), line(counts.accounts, 'Payment methods'),
        line(counts.categories, 'Categories'), line(counts.recurring, 'Recurring items'), line(counts.budgets, 'Budgets')),
      h('div', { class: 'note warn-note' },
        h('p', { class: 'strong', text: 'This replaces everything on this phone.' }),
        h('p', { text: hasData
          ? 'Spend first saves a safety copy of your current data (spend-before-restore), then restores.'
          : 'There is nothing here yet, so no safety copy is needed.' })),
      status),
    footer: h('div', { class: 'qa-foot two' },
      h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => sheet.close() }),
      h('button', { type: 'button', class: 'btn primary', text: hasData ? 'Save safety copy and restore' : 'Restore', onclick: run })),
  });
}

/* ─── delete all ─── */

export function openDeleteAll() {
  const input = h('input', { id: 'del-confirm', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'DELETE' });
  const go = h('button', { type: 'button', class: 'btn danger-fill', text: 'Delete everything', disabled: true });
  input.addEventListener('input', () => { go.disabled = input.value.trim() !== 'DELETE'; });
  go.addEventListener('click', async () => {
    if (input.value.trim() !== 'DELETE') return;
    go.disabled = true;
    await deleteAllData();
    try { localStorage.removeItem('spend_theme'); } catch { /* ignore */ }
    location.replace(location.pathname); // back to onboarding
  });
  const sheet = openSheet({
    title: 'Delete all data',
    body: h('div', {},
      h('p', { text: `This removes all ${state.transactions.length} transactions, your payment methods, categories, budgets and recurring items from this phone. It cannot be undone.` }),
      h('div', { class: 'add-row' }, h('button', { type: 'button', class: 'btn block', text: 'Export backup first', onclick: () => exportBackup() })),
      h('div', { class: 'field' }, h('label', { for: 'del-confirm', text: 'Type DELETE to confirm' }), input)),
    footer: h('div', { class: 'qa-foot two' },
      h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => sheet.close() }), go),
  });
  return sheet;
}

/* ─── Settings sections ─── */

export function backupSection() {
  const today = todayStr();
  const last = state.settings.lastBackupAt;
  const lastText = last
    ? (() => { const d = toDateStr(new Date(last)); const n = diffDays(d, today); return `Last backup ${n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`} (${formatShort(d, today)}).`; })()
    : 'No backup yet. Your data only lives on this phone, so export one now and then.';
  return h('div', {},
    h('p', { class: 'hint pad-x', text: lastText }),
    h('div', { class: 'btn-stack' },
      h('button', { type: 'button', class: 'btn primary block', text: 'Export backup', onclick: () => exportBackup() }),
      h('button', { type: 'button', class: 'btn block', text: 'Restore from backup', onclick: pickRestoreFile }),
      h('button', { type: 'button', class: 'btn block', text: 'Export all transactions as CSV', onclick: () => exportCSV(state.transactions) })));
}

export function storageSection() {
  const persist = state.settings.persistGranted
    ? 'Granted. The browser will not clear your data to free up space.'
    : state.settings.persistRequested
      ? 'Not granted yet. On iPhone, add Spend to the Home Screen. Keep regular backups either way.'
      : 'Not requested yet.';
  const usage = h('span', { class: 'row-sub', text: '…' });
  navigator.storage?.estimate?.().then((e) => {
    usage.textContent = e?.usage != null ? `${(e.usage / 1024 / 1024).toFixed(1)} MB used on this device` : 'Unknown';
  }).catch(() => { usage.textContent = 'Unknown'; });
  const last = state.settings.lastBackupAt;
  const row = (title, sub, extra) => h('li', { class: 'row' }, h('div', { class: 'row-main' }, h('div', { class: 'row-title', text: title }), sub), extra);
  return h('ul', { class: 'rows' },
    row('Persistent storage', h('div', { class: 'row-sub', text: persist }),
      !state.settings.persistGranted && h('button', {
        type: 'button', class: 'btn sm', text: 'Ask again',
        onclick: async () => { const ok = await requestPersistence(); toast(ok ? 'Persistent storage granted' : 'The browser said no for now'); },
      })),
    row('Transactions', h('div', { class: 'row-sub', text: String(state.transactions.length) })),
    row('Last backup', h('div', { class: 'row-sub', text: last ? formatShort(toDateStr(new Date(last)), todayStr()) : 'Never' })),
    row('Space used', usage));
}

export function shortcutsSection() {
  const base = `${location.origin}${location.pathname}`;
  const card = activeAccounts().find((a) => a.kind === 'credit_card') || activeAccounts()[0];
  const example = `${base}?amt=250&via=${card?.shortCode || 'hdfc'}&cat=food&payee=Swiggy&note=dinner&type=expense`;
  const codes = activeAccounts().map((a) => `${a.shortCode} (${a.name})`).join(', ');
  const box = h('code', { class: 'link-box', text: example });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(example);
      toast('Link copied');
    } catch {
      const r = document.createRange(); r.selectNodeContents(box);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      toast('Select and copy the link');
    }
  };
  return h('div', {},
    h('p', { class: 'hint pad-x', text: 'Open this kind of link from an iPhone Shortcut or an Android home screen shortcut to start an entry with fields filled in. You still tap Save.' }),
    box,
    h('div', { class: 'add-row' }, h('button', { type: 'button', class: 'btn block', text: 'Copy example link', onclick: copy })),
    h('dl', { class: 'facts link-facts' },
      h('div', {}, h('dt', { text: 'amt' }), h('dd', { text: 'Amount in rupees. Maths works: 120+80' })),
      h('div', {}, h('dt', { text: 'via' }), h('dd', { text: 'Payment method code: ' + (codes || 'add one in Manage') })),
      h('div', {}, h('dt', { text: 'cat' }), h('dd', { text: 'Category name, or the start of it (food → Food and dining)' })),
      h('div', {}, h('dt', { text: 'type' }), h('dd', { text: 'expense, income, refund or transfer' })),
      h('div', {}, h('dt', { text: 'to' }), h('dd', { text: 'Transfers only: the code of the account the money goes to' })),
      h('div', {}, h('dt', { text: 'payee, note' }), h('dd', { text: 'Any text' }))));
}

export function dangerSection() {
  return h('div', {}, h('button', { type: 'button', class: 'btn danger block', text: 'Delete all data', onclick: openDeleteAll }));
}

