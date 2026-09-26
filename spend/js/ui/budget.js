/* Budget editor and the budget summary used in Settings. */

import { h, mount } from './dom.js';
import { openSheet } from './sheet.js';
import { toast } from './toast.js';
import { state, byOrder, saveBudget, categoryById } from '../state.js';
import { formatINR, parseAmount, paiseToInput } from '../lib/money.js';
import { todayStr, monthKey, monthName } from '../lib/dates.js';
import { budgetFor, budgetStatus, categoryStatus } from '../lib/budgets.js';

export function openBudgetEditor() {
  const key = monthKey(todayStr());
  const byId = (id) => state.budgets.find((b) => b.id === id);
  let scope = byId(key) ? key : 'default';
  const draft = {};
  const load = () => {
    const b = byId(scope) || (scope === key ? byId('default') : null);
    draft.totalLimit = b?.totalLimit ?? null;
    draft.categoryLimits = { ...(b?.categoryLimits || {}) };
  };
  load();

  const body = h('div');
  function render() {
    const cats = state.categories.filter((c) => c.type === 'expense' && (!c.archived || draft.categoryLimits[c.id])).sort(byOrder);
    mount(body,
      h('div', { class: 'seg small', role: 'radiogroup', 'aria-label': 'Applies to' },
        [['default', 'Every month'], [key, 'Only ' + monthName(key)]].map(([v, label]) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(scope === v), class: scope === v ? 'on' : '', text: label,
          onclick: () => { scope = v; load(); render(); },
        }))),
      h('p', { class: 'hint', text: scope === 'default'
        ? 'Used for every month that has no budget of its own.'
        : `Just for ${monthName(key)}. Other months keep the every-month budget.` }),
      h('div', { class: 'field' },
        h('label', { for: 'bd-total', text: 'Monthly limit' }),
        h('div', { class: 'amount-input' }, h('span', { class: 'cur', text: '₹' }),
          h('input', {
            id: 'bd-total', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'No limit',
            value: draft.totalLimit ? paiseToInput(draft.totalLimit) : '',
            onchange: (e) => { draft.totalLimit = e.target.value.trim() ? parseAmount(e.target.value) : null; },
          }))),
      h('h3', { class: 'label', style: { marginTop: '20px' }, text: 'Category limits (optional)' }),
      h('ul', { class: 'rows' }, cats.map((c) => h('li', { class: 'row budget-row' },
        h('label', { for: 'bd-' + c.id, class: 'row-main' }, h('span', { 'aria-hidden': 'true', text: c.icon + ' ' }), c.name),
        h('input', {
          id: 'bd-' + c.id, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'No limit', class: 'mini-amount',
          value: draft.categoryLimits[c.id] ? paiseToInput(draft.categoryLimits[c.id]) : '',
          onchange: (e) => {
            const v = e.target.value.trim() ? parseAmount(e.target.value) : null;
            if (v > 0) draft.categoryLimits[c.id] = v; else delete draft.categoryLimits[c.id];
          },
        })))),
    );
  }
  render();

  const save = async () => {
    document.activeElement?.blur?.(); // commit the field being typed in
    await saveBudget({ month: scope, ...draft });
    sheet.close({ restoreFocus: false });
    toast(draft.totalLimit || Object.keys(draft.categoryLimits).length ? 'Budget saved' : 'Budget removed');
  };
  const sheet = openSheet({
    title: 'Budget',
    body,
    footer: h('div', { class: 'qa-foot' }, h('button', { type: 'button', class: 'btn primary', text: 'Save', onclick: save })),
  });
  return sheet;
}

export function budgetSummary() {
  const today = todayStr();
  const key = monthKey(today);
  const b = budgetFor(state.budgets, key);
  const st = budgetStatus(b, state.transactions, today);
  const cats = categoryStatus(b, state.transactions, key);
  return h('div', {},
    !b && h('p', { class: 'hint', text: 'No budget yet. Set a monthly limit to see how much you can spend each day.' }),
    st && progressRow('Overall', st.spent, st.limit),
    cats.length > 0 && h('ul', { class: 'rows' }, cats.map((c) => {
      const cat = categoryById(c.categoryId);
      return h('li', { class: 'row' }, progressRow(`${cat?.icon ?? ''} ${cat?.name ?? 'Category'}`, c.spent, c.limit));
    })),
    h('div', { class: 'add-row' }, h('button', { type: 'button', class: 'btn block', text: b ? 'Edit budget' : 'Set a budget', onclick: openBudgetEditor })),
  );
}

export function progressRow(label, spent, limit) {
  const pct = limit ? spent / limit : 0;
  const tone = pct >= 1 ? 'danger' : pct >= 0.8 ? 'warn' : '';
  return h('div', { class: 'progress ' + tone },
    h('div', { class: 'util-text' },
      h('span', { text: label }),
      h('span', { text: `${formatINR(Math.max(0, spent))} of ${formatINR(limit)}` })),
    h('div', { class: 'bar', role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, Math.round(pct * 100))) },
      h('span', { style: { width: Math.min(100, Math.max(0, pct * 100)) + '%' } })));
}
