/* Recurring: the "To log" confirm list, the rule editor and the rule list
   shown in Settings. */

import { h, mount, icon } from './dom.js';
import { openSheet } from './sheet.js';
import { toast } from './toast.js';
import { openQuickAdd } from './quickadd.js';
import { state, activeAccounts, accountById, categoryById, byOrder, saveRule, deleteRule, resolvePending, deleteTransaction } from '../state.js';
import { GROUPS, SPENDABLE_KINDS } from '../lib/defaults.js';
import { formatINR, parseAmount, paiseToInput } from '../lib/money.js';
import { todayStr, formatShort, parseDateStr } from '../lib/dates.js';
import { pendingItems, describeFrequency, nextOccurrence, occurrenceTransaction } from '../lib/recurring.js';
import { TYPE_LABELS } from '../lib/transactions.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ruleTitle(rule) {
  const t = rule.template;
  if (t.payee) return t.payee;
  if (t.type === 'transfer' && accountById(t.toAccountId)?.kind === 'investment') return 'SIP · ' + accountById(t.toAccountId).name;
  if (t.type === 'transfer') return `${accountById(t.accountId)?.name ?? '?'} → ${accountById(t.toAccountId)?.name ?? '?'}`;
  return categoryById(t.categoryId)?.name ?? TYPE_LABELS[t.type];
}

function ruleIcon(rule) {
  const t = rule.template;
  if (t.type === 'transfer') return { emoji: accountById(t.toAccountId)?.kind === 'investment' ? '↗' : '⇄', color: accountById(t.toAccountId)?.color || 'var(--faint)' };
  const c = categoryById(t.categoryId);
  return { emoji: c?.icon || '•', color: c?.color || 'var(--faint)' };
}

/* ─── To log ─── */

export function openToLog() {
  const list = h('ul', { class: 'rows' });
  const today = todayStr();
  let sheet;
  function render() {
    const items = pendingItems(state.recurring);
    if (!items.length) { sheet?.close({ restoreFocus: false }); toast('All caught up'); return; }
    mount(list, items.map(({ rule, date }) => {
      const ic = ruleIcon(rule);
      const acc = accountById(rule.template.accountId);
      return h('li', { class: 'tolog' },
        h('div', { class: 'tolog-main' },
          h('span', { class: 'tx-ico', style: { '--c': ic.color }, 'aria-hidden': 'true', text: ic.emoji }),
          h('span', { class: 'row-main' },
            h('span', { class: 'row-title', text: ruleTitle(rule) }),
            h('span', { class: 'row-sub', text: `${formatShort(date, today)} · ${acc?.name ?? '?'}` })),
          h('span', { class: 'tx-amt ' + rule.template.type, text: formatINR(rule.template.amount) })),
        h('div', { class: 'tolog-actions' },
          h('button', { type: 'button', class: 'btn sm', text: 'Skip', onclick: async () => { await resolvePending(rule.id, date); render(); } }),
          h('button', { type: 'button', class: 'btn sm', text: 'Edit', onclick: () => editThenLog(rule, date) }),
          h('button', {
            type: 'button', class: 'btn sm primary', text: 'Log it',
            onclick: async () => {
              const t = await resolvePending(rule.id, date, { save: true });
              render();
              if (t) toast(`Logged ${formatINR(t.amount)}`, { action: 'Undo', duration: 5000, onAction: () => undoLog(rule.id, t) });
            },
          })));
    }));
  }
  function editThenLog(rule, date) {
    const base = occurrenceTransaction(rule, date);
    sheet.close({ restoreFocus: false });
    openQuickAdd({
      prefill: base,
      fromLink: true, // only Save saves: this is a review, not a fast add
      onSave: async (fields) => {
        await resolvePending(rule.id, date, { save: true, fields });
        return true;
      },
    });
  }
  sheet = openSheet({ title: 'To log', body: h('div', {}, h('p', { class: 'hint', text: 'Recurring items that are due. Log each one as it is, edit it first, or skip it.' }), list) });
  render();
  return sheet;
}

/* Undoing a logged occurrence deletes it and puts the date back on the list. */
async function undoLog(ruleId, t) {
  await deleteTransaction(t.id);
  const rule = state.recurring.find((r) => r.id === ruleId);
  if (rule) await saveRule({ pending: [...new Set([...(rule.pending || []), t.date])].sort() }, rule);
}

/* ─── rule editor ─── */

export function openRuleEditor(existing = null, { from = null, investTo = null } = {}) {
  const today = todayStr();
  const seedT = existing?.template || (from ? {
    type: from.type, amount: from.amount, accountId: from.accountId, toAccountId: from.toAccountId,
    categoryId: from.categoryId, payee: from.payee, note: from.note,
  } : investTo ? {
    // a SIP: monthly transfer from a bank (or cash) into the investment
    type: 'transfer', amount: null, toAccountId: investTo, categoryId: null, payee: '', note: '',
    accountId: activeAccounts().find((a) => a.kind === 'bank')?.id ?? activeAccounts().find((a) => SPENDABLE_KINDS.includes(a.kind) && a.kind !== 'credit_card')?.id ?? null,
  } : { type: 'expense', amount: null, accountId: activeAccounts().find((a) => SPENDABLE_KINDS.includes(a.kind))?.id, toAccountId: null, categoryId: null, payee: '', note: '' });
  const seedDate = from?.date || today;
  const r = existing ? structuredClone(existing) : {
    template: { ...seedT }, frequency: 'monthly', dayOfMonth: parseDateStr(seedDate).d, weekday: new Date(seedDate + 'T12:00').getDay(),
    startDate: seedDate, endDate: null, mode: 'confirm',
  };
  if (r.weekday == null) r.weekday = new Date(r.startDate + 'T12:00').getDay();
  if (r.dayOfMonth == null) r.dayOfMonth = parseDateStr(r.startDate).d;
  const t = r.template;
  // "Investment" is a transfer into an investment account, shown as its own type
  let uiType = t.type === 'transfer' && accountById(t.toAccountId)?.kind === 'investment' ? 'investment' : t.type;
  const errorEl = h('p', { class: 'error', role: 'alert' });
  const body = h('div');

  const field = (id, label, control, hint) => h('div', { class: 'field' }, h('label', { for: id, text: label }), control, hint && h('p', { class: 'hint', text: hint }));
  const select = (id, options, value, onchange) => h('select', { id, onchange: (e) => onchange(e.target.value) },
    options.map(([v, text]) => h('option', { value: v, text, selected: String(value ?? '') === String(v) })));
  const seg = (label, options, value, onpick) => h('div', { class: 'field' },
    h('span', { class: 'label-like', text: label }),
    h('div', { class: 'seg small', role: 'radiogroup', 'aria-label': label },
      options.map(([v, text]) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(value === v), class: value === v ? 'on' : '', text,
        onclick: () => { onpick(v); render(); },
      }))));

  const accountOptions = (exclude, keep = () => true) => {
    const accs = [...activeAccounts(), ...[t.accountId, t.toAccountId].map(accountById).filter((a) => a?.archived)].filter(keep);
    return [['', 'Pick one'], ...GROUPS.flatMap((g) => accs.filter((a) => g.kinds.includes(a.kind) && a.id !== exclude).sort(byOrder).map((a) => [a.id, a.name]))];
  };
  const spendable = (a) => SPENDABLE_KINDS.includes(a.kind);
  const isInvestment = (a) => a.kind === 'investment';

  function render() {
    const catType = t.type === 'income' ? 'income' : 'expense';
    const cats = state.categories.filter((c) => c.type === catType && (!c.archived || c.id === t.categoryId)).sort(byOrder);
    if (t.categoryId && !cats.some((c) => c.id === t.categoryId)) t.categoryId = null;
    mount(body,
      seg('Type', [['expense', 'Expense'], ['income', 'Income'], ['transfer', 'Transfer'], ['investment', 'Investment']], uiType, (v) => {
        uiType = v;
        t.type = v === 'investment' ? 'transfer' : v;
        if (v === 'investment' && !isInvestment(accountById(t.toAccountId) || {})) t.toAccountId = null;
        if (v !== 'transfer' && v !== 'investment' && !spendable(accountById(t.accountId) || {})) t.accountId = null;
      }),
      field('rr-amt', 'Amount', h('div', { class: 'amount-input' }, h('span', { class: 'cur', text: '₹' }),
        h('input', { id: 'rr-amt', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: t.amount ? paiseToInput(t.amount) : '', onchange: (e) => { t.amount = parseAmount(e.target.value); } }))),
      field('rr-acc', t.type === 'transfer' ? 'From' : t.type === 'income' ? 'Received in' : 'Paid with',
        select('rr-acc', accountOptions(t.type === 'transfer' ? t.toAccountId : null, uiType === 'transfer' ? () => true : spendable), t.accountId, (v) => { t.accountId = v || null; })),
      uiType === 'investment' && !activeAccounts().some(isInvestment)
        ? h('p', { class: 'hint', text: 'Add an investment in Manage first (e.g. Nifty 50 SIP, PPF), then set up its SIP here.' }) : null,
      t.type === 'transfer'
        ? field('rr-to', uiType === 'investment' ? 'Invest in' : 'To', select('rr-to', accountOptions(t.accountId, uiType === 'investment' ? isInvestment : () => true), t.toAccountId, (v) => { t.toAccountId = v || null; }))
        : field('rr-cat', 'Category', select('rr-cat', [['', 'Pick one'], ...cats.map((c) => [c.id, `${c.icon} ${c.name}`])], t.categoryId, (v) => { t.categoryId = v || null; })),
      h('div', { class: 'row2' },
        field('rr-payee', t.type === 'income' ? 'From' : uiType === 'investment' ? 'Title' : 'Payee', h('input', { id: 'rr-payee', type: 'text', value: t.payee || '', placeholder: uiType === 'investment' ? 'e.g. Nifty SIP' : 'e.g. Landlord', oninput: (e) => { t.payee = e.target.value; } })),
        field('rr-note', 'Note', h('input', { id: 'rr-note', type: 'text', value: t.note || '', oninput: (e) => { t.note = e.target.value; } }))),
      seg('Repeats', [['monthly', 'Monthly'], ['weekly', 'Weekly'], ['yearly', 'Yearly']], r.frequency, (v) => { r.frequency = v; }),
      r.frequency === 'weekly'
        ? field('rr-wd', 'On', select('rr-wd', WEEKDAYS.map((d, i) => [i, d]), r.weekday, (v) => { r.weekday = +v; }))
        : field('rr-dom', r.frequency === 'yearly' ? 'Day (in the start date\'s month)' : 'Day of the month',
          select('rr-dom', Array.from({ length: 31 }, (_, i) => [i + 1, i === 30 ? '31 (or the last day)' : String(i + 1)]), r.dayOfMonth, (v) => { r.dayOfMonth = +v; })),
      h('div', { class: 'row2' },
        field('rr-start', 'Starts', h('input', { id: 'rr-start', type: 'date', value: r.startDate, onchange: (e) => { if (e.target.value) r.startDate = e.target.value; } })),
        field('rr-end', 'Ends', h('input', { id: 'rr-end', type: 'date', value: r.endDate || '', onchange: (e) => { r.endDate = e.target.value || null; } }), 'Optional')),
      seg('When it is due', [['confirm', 'Ask me first'], ['auto', 'Log it for me']], r.mode, (v) => { r.mode = v; }),
      h('p', { class: 'hint', text: r.mode === 'auto' ? 'It is saved automatically when you open Spend on or after the day.' : 'It waits in "To log" on Home until you log or skip it.' }),
      existing && h('label', { class: 'switch-row' },
        h('span', {}, h('span', { class: 'row-title', text: 'Paused' }), h('span', { class: 'row-sub', text: 'Nothing is added while paused, and missed dates are not caught up later.' })),
        h('input', { type: 'checkbox', role: 'switch', checked: !!r.paused, onchange: (e) => { r.paused = e.target.checked; } })),
      errorEl,
    );
  }
  render();

  const save = async () => {
    try {
      await saveRule({ ...r, template: { ...t, payee: (t.payee || '').trim(), note: (t.note || '').trim() } }, existing);
      sheet.close({ restoreFocus: false });
      toast(existing ? 'Saved' : 'Recurring item added');
    } catch (e) { errorEl.textContent = e.message; }
  };
  let armed = false;
  const del = existing && h('button', {
    type: 'button', class: 'btn danger', text: 'Delete',
    onclick: async (e) => {
      if (!armed) { armed = true; e.currentTarget.textContent = 'Tap again to delete'; return; }
      await deleteRule(existing.id);
      sheet.close({ restoreFocus: false });
      toast('Deleted. Transactions already logged are kept.');
    },
  });
  const sheet = openSheet({
    title: uiType === 'investment' ? (existing ? 'Edit SIP' : 'New SIP') : existing ? 'Edit recurring' : 'New recurring',
    body,
    footer: h('div', { class: 'qa-foot' + (del ? ' two' : '') }, del, h('button', { type: 'button', class: 'btn primary', text: 'Save', onclick: save })),
  });
  return sheet;
}

/* ─── list for Settings ─── */

export function recurringList() {
  const today = todayStr();
  const rules = [...state.recurring].sort((a, b) => ruleTitle(a).localeCompare(ruleTitle(b)));
  const pending = pendingItems(state.recurring).length;
  return h('div', {},
    pending > 0 && h('button', { type: 'button', class: 'btn block', onclick: openToLog }, `${pending} to log`),
    rules.length
      ? h('ul', { class: 'rows' }, rules.map((rule) => {
        const ic = ruleIcon(rule);
        const next = rule.paused ? null : nextOccurrence(rule, today);
        const sub = [describeFrequency(rule), rule.mode === 'auto' ? 'logged for you' : 'asks first',
          rule.paused ? 'paused' : next ? 'next ' + formatShort(next, today) : 'ended'].join(' · ');
        return h('li', {}, h('button', { type: 'button', class: 'row-link', onclick: () => openRuleEditor(rule) },
          h('span', { class: 'tx-ico', style: { '--c': ic.color }, 'aria-hidden': 'true', text: ic.emoji }),
          h('span', { class: 'row-main' },
            h('span', { class: 'row-title', text: ruleTitle(rule) }),
            h('span', { class: 'row-sub', text: sub })),
          h('span', { class: 'tx-amt ' + rule.template.type, text: formatINR(rule.template.amount) })));
      }))
      : h('p', { class: 'hint', text: 'Rent, SIPs, subscriptions: add them once and Spend reminds you, or logs them for you.' }),
    h('div', { class: 'add-row' }, h('button', { type: 'button', class: 'btn block', onclick: () => openRuleEditor() }, icon('plus', 'ico sm'), 'Add recurring')),
  );
}
