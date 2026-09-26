/* Add / edit sheets for payment methods and categories. */

import { h, mount, SAFE_COLOR } from './dom.js';
import { openSheet } from './sheet.js';
import { toast } from './toast.js';
import {
  state, saveAccount, setAccountArchived, deleteAccount,
  saveCategory, setCategoryArchived, deleteCategory,
} from '../state.js';
import { KIND_LABELS, ACCOUNT_COLORS, uniqueShortCode, slugify, nextColor } from '../lib/defaults.js';
import { parseAmount, paiseToInput, formatINR } from '../lib/money.js';
import { todayStr } from '../lib/dates.js';
import { usageCount } from '../lib/accounts.js';
import { firstGrapheme, categoryUsage, EMOJI_SUGGESTIONS } from '../lib/categories.js';
import { ruleUsage } from '../lib/recurring.js';

let seq = 0;

function field(id, label, control, hint) {
  return h('div', { class: 'field' }, h('label', { for: id, text: label }), control, hint && h('p', { class: 'hint', text: hint }));
}

function daySelect(id, value, onchange) {
  return h('select', { id, onchange: (e) => onchange(+e.target.value || null) },
    h('option', { value: '', text: 'Day', selected: !value }),
    Array.from({ length: 31 }, (_, i) => h('option', { value: i + 1, text: i + 1, selected: value === i + 1 })));
}

function moneyInput(id, value, onchange, placeholder = 'Optional') {
  return h('input', {
    id, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder,
    value: value ? paiseToInput(value) : '',
    onchange: (e) => onchange(e.target.value.trim() ? parseAmount(e.target.value) : null),
  });
}

/* Colour swatches as a radio group, plus a custom colour picker. */
function colorPicker(name, value, onchange) {
  const wrap = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Colour' });
  const render = () => mount(wrap,
    ACCOUNT_COLORS.map((c) => h('button', {
      type: 'button', role: 'radio', class: 'swatch-btn' + (c.toLowerCase() === value.toLowerCase() ? ' on' : ''),
      'aria-checked': String(c.toLowerCase() === value.toLowerCase()), 'aria-label': c, style: { '--c': c },
      onclick: () => { value = c; onchange(c); render(); },
    })),
    h('label', { class: 'swatch-btn custom' + (ACCOUNT_COLORS.some((c) => c.toLowerCase() === value.toLowerCase()) ? '' : ' on'), style: { '--c': value }, title: 'Custom colour' },
      h('span', { class: 'sr-only', text: 'Custom colour' }),
      h('input', { type: 'color', value, oninput: (e) => { value = e.target.value; onchange(value); }, onchange: render })),
  );
  render();
  return wrap;
}

/* Two-tap destructive button: first tap arms it, second tap acts. */
function confirmButton(label, confirmLabel, run) {
  let armed = false;
  const b = h('button', {
    type: 'button', class: 'btn danger', text: label,
    onclick: () => {
      if (!armed) { armed = true; b.textContent = confirmLabel; setTimeout(() => { armed = false; b.textContent = label; }, 4000); return; }
      run();
    },
  });
  return b;
}

/* ─── payment methods ─── */

export function openAccountEditor(existing = null, { kind = 'credit_card', focus = null } = {}) {
  const id = 'ae' + ++seq;
  // a deep enough copy: nested lists must not be edited in place before Save
  const a = existing ? { ...existing, history: (existing.history || []).map((e) => ({ ...e })) } : {
    kind, name: '', color: nextColor(state.accounts.map((x) => x.color)), shortCode: '', history: [],
    statementDay: null, dueDay: null, limit: null, openingOutstanding: 0, trackBalance: false, openingBalance: 0,
  };
  let codeTouched = !!existing;
  // cashback is edited as a draft and folded back into the account on save
  const cb = {
    defaultPct: a.cashback?.defaultPct ?? null,
    rates: Object.entries(a.cashback?.categoryPct || {}).map(([categoryId, pct]) => ({ categoryId, pct })),
    excluded: new Set(a.cashback?.excludedCategoryIds || []),
    cap: a.cashback?.capPerCycle ?? null,
  };
  const errorEl = h('p', { class: 'error', role: 'alert' });
  const kindFields = h('div');

  const code = h('input', {
    id: id + 'code', type: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', maxlength: 16,
    value: a.shortCode, placeholder: 'e.g. hdfc',
    oninput: (e) => { codeTouched = true; a.shortCode = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''); },
  });
  const name = h('input', {
    id: id + 'name', type: 'text', value: a.name, maxlength: 40, placeholder: 'e.g. HDFC Millennia',
    oninput: (e) => {
      a.name = e.target.value;
      if (!codeTouched) code.value = a.shortCode = uniqueShortCode(slugify(a.name), state.accounts.filter((x) => x.id !== a.id).map((x) => x.shortCode));
    },
  });

  function renderKindFields() {
    if (a.kind === 'credit_card') {
      mount(kindFields,
        h('p', { class: 'hint', text: 'The statement day is the date each month your bill is generated. It is on your statement, next to the due date.' }),
        h('div', { class: 'row2' },
          field(id + 'sd', 'Statement day', daySelect(id + 'sd', a.statementDay, (v) => { a.statementDay = v; })),
          field(id + 'dd', 'Due day', daySelect(id + 'dd', a.dueDay, (v) => { a.dueDay = v; }))),
        h('div', { class: 'row2' },
          field(id + 'lim', 'Credit limit', moneyInput(id + 'lim', a.limit, (v) => { a.limit = v; })),
          field(id + 'owed', existing ? 'Owed when added' : 'Owed right now', moneyInput(id + 'owed', a.openingOutstanding, (v) => { a.openingOutstanding = v ?? 0; }))),
        cashbackEditor(id, cb, focus === 'cashback'),
      );
    } else if (a.kind === 'investment') {
      mount(kindFields, pastInvestments(id, a));
    } else {
      const bal = field(id + 'bal', 'Opening balance', moneyInput(id + 'bal', a.openingBalance, (v) => { a.openingBalance = v ?? 0; }, '0'),
        'What was in it when you started tracking. Spend adds and subtracts from here.');
      bal.hidden = !a.trackBalance;
      mount(kindFields,
        h('label', { class: 'switch-row' },
          h('span', {}, h('span', { class: 'row-title', text: 'Track balance' }),
            h('span', { class: 'row-sub', text: 'Show how much is left in it, not just what you spent.' })),
          h('input', { type: 'checkbox', role: 'switch', checked: a.trackBalance, onchange: (e) => { a.trackBalance = e.target.checked; bal.hidden = !a.trackBalance; } })),
        bal);
    }
  }
  renderKindFields();

  const editorTitle = () => (a.kind === 'investment' ? (existing ? 'Edit investment' : 'Add investment') : existing ? 'Edit payment method' : 'Add payment method');
  const titleEl = h('span', { text: editorTitle() });

  const kindControl = existing
    ? h('p', { class: 'static', text: KIND_LABELS[a.kind] })
    : h('select', { id: id + 'kind', onchange: (e) => { a.kind = e.target.value; renderKindFields(); titleEl.textContent = editorTitle(); } },
      Object.entries(KIND_LABELS).map(([k, label]) => h('option', { value: k, text: label, selected: a.kind === k })));

  const body = h('div', {},
    field(id + 'name', 'Name', name),
    field(id + 'kind', 'Type', kindControl),
    kindFields,
    h('div', { class: 'field' }, h('span', { class: 'label-like', text: 'Colour' }), colorPicker('color', a.color, (c) => { a.color = c; })),
    field(id + 'code', 'Short code', code, 'Used in shortcut links, e.g. ?' + (a.kind === 'investment' ? 'to=' : 'via=') + (a.shortCode || 'hdfc') + '.'),
    errorEl,
  );

  const save = async () => {
    try {
      if (a.kind === 'credit_card') {
        const categoryPct = Object.fromEntries(cb.rates.filter((r) => r.categoryId && r.pct != null && r.pct >= 0).map((r) => [r.categoryId, r.pct]));
        const any = (cb.defaultPct || 0) > 0 || Object.values(categoryPct).some((v) => v > 0);
        a.cashback = any ? { defaultPct: cb.defaultPct || 0, categoryPct, excludedCategoryIds: [...cb.excluded], capPerCycle: cb.cap || null } : null;
      }
      if (a.kind === 'investment') a.history = (a.history || []).filter((e) => e.amount);
      if (!a.shortCode) a.shortCode = uniqueShortCode(slugify(a.name || a.kind), state.accounts.filter((x) => x.id !== a.id).map((x) => x.shortCode));
      const rec = await saveAccount(a, existing);
      sheet.close({ restoreFocus: false });
      toast(existing ? 'Saved' : `Added ${rec.name}`);
    } catch (e) { errorEl.textContent = e.message; }
  };

  let danger = null;
  if (existing) {
    const used = usageCount(existing.id, state.transactions) + ruleUsage(existing.id, state.recurring);
    if (existing.archived) {
      danger = h('button', { type: 'button', class: 'btn', text: 'Unarchive', onclick: async () => { await setAccountArchived(existing.id, false); sheet.close({ restoreFocus: false }); toast('Unarchived'); } });
    } else if (used) {
      danger = h('button', { type: 'button', class: 'btn', text: 'Archive', onclick: async () => {
        await setAccountArchived(existing.id, true);
        sheet.close({ restoreFocus: false });
        toast(`Archived ${existing.name}. Its history stays.`, { action: 'Undo', onAction: () => setAccountArchived(existing.id, false), duration: 5000 });
      } });
    } else {
      danger = confirmButton('Delete', 'Tap again to delete', async () => {
        await deleteAccount(existing.id);
        sheet.close({ restoreFocus: false });
        if (location.hash.startsWith('#/account/' + existing.id)) location.replace('#/accounts');
        toast(`Deleted ${existing.name}`);
      });
    }
  }

  const sheet = openSheet({
    title: titleEl,
    body,
    footer: h('div', { class: 'qa-foot' + (danger ? ' two' : '') }, danger, h('button', { type: 'button', class: 'btn primary', text: 'Save', onclick: save })),
  });
  if (!existing) name.focus();
  return sheet;
}

/* Money invested before tracking began, each with its own date: one
   lumpsum dated today is fine, or backdate each one. These do not come out
   of any bank balance here (that money left the bank long ago). New
   investing is logged as a transfer from a bank. */
function pastInvestments(id, a) {
  if (!a.history) a.history = [];
  const list = h('div');
  const total = h('p', { class: 'hint' });
  const today = todayStr();
  const render = () => {
    const sum = a.history.reduce((s, e) => s + (e.amount || 0), 0);
    total.textContent = a.history.length ? `Invested before tracking: ${formatINR(sum)}` : '';
    mount(list, a.history.map((e, i) => h('div', { class: 'rate-row past-row' },
      h('input', {
        type: 'date', 'aria-label': 'Date', value: e.date || today, max: today, class: 'mini-date',
        onchange: (ev) => { e.date = ev.target.value || today; },
      }),
      h('input', {
        type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'Amount', 'aria-label': 'Amount invested', class: 'mini-amount grow',
        value: e.amount ? paiseToInput(e.amount) : '',
        onchange: (ev) => { e.amount = parseAmount(ev.target.value) || null; render(); },
      }),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove this entry', onclick: () => { a.history.splice(i, 1); render(); } }, '×'))));
  };
  render();
  return h('div', { class: 'field' },
    h('span', { class: 'label-like', text: 'Invested before tracking (optional)' }),
    h('p', { class: 'hint', text: 'Add one lumpsum dated today, or backdate each investment. Future SIPs are logged as transfers from your bank, set up from the investment page.' }),
    list,
    h('button', { type: 'button', class: 'link-btn', text: '+ Add past investment', onclick: () => { a.history.push({ date: today, amount: null }); render(); list.querySelector('.past-row:last-child .mini-amount')?.focus(); } }),
    total);
}

/* Optional cashback estimate for a card: default %, per-category %,
   excluded categories and a cap per statement cycle. */
function cashbackEditor(id, cb, open) {
  const pctInput = (value, onchange, label) => h('input', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', class: 'mini-amount', 'aria-label': label,
    value: value ?? '', onchange: (e) => {
      const v = parseFloat(e.target.value.replace(',', '.'));
      onchange(Number.isFinite(v) && v >= 0 && v <= 100 ? v : null);
      e.target.value = Number.isFinite(v) && v >= 0 && v <= 100 ? String(v) : '';
    },
  });
  const cats = state.categories.filter((c) => c.type === 'expense' && !c.archived).sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
  const ratesEl = h('div');
  const exclEl = h('div', { class: 'chips wrap' });
  const renderRates = () => mount(ratesEl,
    cb.rates.map((r, i) => h('div', { class: 'rate-row' },
      h('select', { 'aria-label': 'Category', onchange: (e) => { r.categoryId = e.target.value; } },
        h('option', { value: '', text: 'Pick a category', selected: !r.categoryId }),
        cats.map((c) => h('option', { value: c.id, text: `${c.icon} ${c.name}`, selected: r.categoryId === c.id }))),
      pctInput(r.pct, (v) => { r.pct = v; }, 'Percent'), h('span', { class: 'pct-sign', text: '%' }),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove this rate', onclick: () => { cb.rates.splice(i, 1); renderRates(); } }, '×'))),
    h('button', { type: 'button', class: 'link-btn', text: '+ Add a category rate', onclick: () => { cb.rates.push({ categoryId: '', pct: null }); renderRates(); } }));
  const renderExcl = () => mount(exclEl, cats.map((c) => h('button', {
    type: 'button', class: 'chip sm' + (cb.excluded.has(c.id) ? ' on' : ''), 'aria-pressed': String(cb.excluded.has(c.id)),
    onclick: () => { if (cb.excluded.has(c.id)) cb.excluded.delete(c.id); else cb.excluded.add(c.id); renderExcl(); },
  }, c.icon + ' ' + c.name)));
  renderRates();
  renderExcl();
  const d = h('details', { class: 'cashback-edit', open: open || (cb.defaultPct || cb.rates.length) ? true : null },
    h('summary', { class: 'label', text: 'Cashback estimate (optional)' }),
    h('div', { class: 'field' }, h('label', { for: id + 'cbd', text: 'Default rate' }),
      h('div', { class: 'rate-row' }, Object.assign(pctInput(cb.defaultPct, (v) => { cb.defaultPct = v; }, 'Default rate'), { id: id + 'cbd' }), h('span', { class: 'pct-sign', text: '%' }))),
    h('div', { class: 'field' }, h('span', { class: 'label-like', text: 'Different rate for some categories' }), ratesEl),
    h('div', { class: 'field' }, h('span', { class: 'label-like', text: 'Earns nothing on' }), exclEl),
    field(id + 'cap', 'Cap per statement cycle', moneyInput(id + 'cap', cb.cap, (v) => { cb.cap = v; }, 'No cap')),
    h('p', { class: 'hint', text: 'Spend shows this as an estimate. Refunds take back cashback at their category\'s rate.' }));
  if (open) setTimeout(() => d.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250);
  return d;
}

/* ─── categories ─── */

export function openCategoryEditor(existing = null, { type = 'expense' } = {}) {
  const id = 'ce' + ++seq;
  const c = existing ? { ...existing } : { name: '', icon: '', type, color: ACCOUNT_COLORS[(state.categories.length * 5) % ACCOUNT_COLORS.length] };
  const used = existing ? categoryUsage(existing.id, state.transactions) : 0;
  const usedByRules = existing ? ruleUsage(existing.id, state.recurring) : 0;
  const errorEl = h('p', { class: 'error', role: 'alert' });

  const preview = h('span', { class: 'emoji-preview', 'aria-hidden': 'true' });
  const renderPreview = () => {
    preview.textContent = c.icon || '?';
    if (SAFE_COLOR.test(c.color)) preview.style.setProperty('--c', c.color);
  };
  const emojiInput = h('input', {
    id: id + 'emoji', type: 'text', value: c.icon, autocomplete: 'off', class: 'emoji-input',
    placeholder: 'Type or paste any emoji',
    oninput: (e) => { c.icon = firstGrapheme(e.target.value); renderPreview(); },
    onchange: (e) => { e.target.value = c.icon; },
  });
  const grid = h('div', { class: 'emoji-grid', role: 'group', 'aria-label': 'Suggested emoji' },
    EMOJI_SUGGESTIONS.map((em) => h('button', {
      type: 'button', class: 'emoji-btn', text: em, 'aria-label': em,
      onclick: () => { c.icon = em; emojiInput.value = em; renderPreview(); },
    })));

  const typeControl = existing && used
    ? h('p', { class: 'static', text: c.type === 'income' ? 'Income' : 'Expense' })
    : h('div', { class: 'seg small', role: 'radiogroup', 'aria-label': 'Type' },
      ['expense', 'income'].map((t) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(c.type === t), class: c.type === t ? 'on' : '', text: t === 'income' ? 'Income' : 'Expense',
        onclick: (e) => {
          c.type = t;
          e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => {
            const on = b === e.currentTarget;
            b.classList.toggle('on', on);
            b.setAttribute('aria-checked', String(on));
          });
        },
      })));

  const name = h('input', { id: id + 'name', type: 'text', value: c.name, maxlength: 40, placeholder: 'e.g. Pets', oninput: (e) => { c.name = e.target.value; } });

  const body = h('div', {},
    h('div', { class: 'emoji-row' }, preview,
      h('div', { class: 'field grow' }, h('label', { for: id + 'emoji', text: 'Emoji' }), emojiInput)),
    grid,
    field(id + 'name', 'Name', name),
    h('div', { class: 'field' }, h('span', { class: 'label-like', text: 'Type' }), typeControl),
    h('div', { class: 'field' }, h('span', { class: 'label-like', text: 'Colour' }), colorPicker('ccolor', c.color, (col) => { c.color = col; renderPreview(); })),
    existing && h('p', { class: 'hint meta', text: (used === 1 ? 'Used by 1 transaction' : `Used by ${used} transactions`) + (usedByRules ? ` and ${usedByRules} recurring item${usedByRules === 1 ? '' : 's'}.` : '.') }),
    errorEl,
  );
  renderPreview();

  const save = async () => {
    try {
      const rec = await saveCategory(c, existing);
      sheet.close({ restoreFocus: false });
      toast(existing ? 'Saved' : `Added ${rec.icon} ${rec.name}`);
    } catch (e) { errorEl.textContent = e.message; }
  };

  let danger = null;
  if (existing) {
    if (existing.archived) {
      danger = h('button', { type: 'button', class: 'btn', text: 'Unarchive', onclick: async () => { await setCategoryArchived(existing.id, false); sheet.close({ restoreFocus: false }); toast('Unarchived'); } });
    } else if (used || usedByRules) {
      danger = h('button', { type: 'button', class: 'btn', text: 'Archive', onclick: async () => {
        await setCategoryArchived(existing.id, true);
        sheet.close({ restoreFocus: false });
        toast(`Archived ${existing.name}. Past transactions keep it.`, { action: 'Undo', onAction: () => setCategoryArchived(existing.id, false), duration: 5000 });
      } });
    } else {
      danger = confirmButton('Delete', 'Tap again to delete', async () => {
        await deleteCategory(existing.id);
        sheet.close({ restoreFocus: false });
        toast(`Deleted ${existing.name}`);
      });
    }
  }

  const sheet = openSheet({
    title: existing ? 'Edit category' : 'Add category',
    body,
    footer: h('div', { class: 'qa-foot' + (danger ? ' two' : '') }, danger, h('button', { type: 'button', class: 'btn primary', text: 'Save', onclick: save })),
  });
  if (!existing) emojiInput.focus();
  return sheet;
}
