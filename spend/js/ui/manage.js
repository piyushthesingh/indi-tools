/* Manage tab: payment methods and categories. Add, edit, drag to reorder,
   archive. #/accounts shows payment methods, #/accounts?view=categories the
   categories. */

import { h, icon } from './dom.js';
import { makeSortable } from './sortable.js';
import { openAccountEditor, openCategoryEditor } from './editors.js';
import { state, byOrder, reorder } from '../state.js';
import { GROUPS, KIND_LABELS } from '../lib/defaults.js';
import { formatINR } from '../lib/money.js';
import { cardSummary } from '../lib/cycles.js';
import { accountBalance } from '../lib/accounts.js';
import { investedToDate } from '../lib/networth.js';
import { categoryUsage } from '../lib/categories.js';
import { todayStr } from '../lib/dates.js';
import { statementPhrase } from './cardtext.js';

// after a keyboard reorder the screen re-renders; put focus back on the handle
let refocusId = null;

export function renderManage(_params, query) {
  const view = new URLSearchParams(query).get('view') === 'categories' ? 'categories' : 'accounts';
  const screen = h('div', { class: 'screen' },
    h('header', { class: 'top' },
      h('h1', { class: 'title', text: 'Accounts and categories' }),
      h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings' }, icon('gear'))),
    h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Manage' },
      [['accounts', 'Payment methods'], ['categories', 'Categories']].map(([v, label]) => h('button', {
        type: 'button', role: 'tab', 'aria-selected': String(view === v), class: view === v ? 'on' : '', text: label,
        onclick: () => location.replace('#/accounts' + (v === 'categories' ? '?view=categories' : '')),
      }))),
    view === 'accounts' ? accountsView() : categoriesView(),
  );
  if (refocusId) {
    const id = refocusId;
    refocusId = null;
    queueMicrotask(() => screen.querySelector(`li[data-id="${CSS.escape(id)}"] .drag-handle`)?.focus());
  }
  return screen;
}

function handle(name) {
  return h('button', {
    type: 'button', class: 'drag-handle', 'aria-label': `Move ${name}. Drag, or use the up and down arrow keys.`,
    onkeydown: (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') refocusId = e.currentTarget.closest('li').dataset.id; },
  }, h('span', { class: 'grip', 'aria-hidden': 'true' }));
}

function sortableList(items, store, renderItem) {
  const ul = h('ul', { class: 'rows sortable' }, items.map((x) => h('li', { 'data-id': x.id, class: 'sort-item' }, renderItem(x))));
  makeSortable(ul, (ids) => reorder(store, ids));
  return ul;
}

/* ─── payment methods ─── */

function accountsView() {
  const today = todayStr();
  const active = state.accounts.filter((a) => !a.archived);
  const archived = state.accounts.filter((a) => a.archived).sort(byOrder);
  const row = (a) => [
    !a.archived && handle(a.name),
    h('a', { class: 'row-link', href: '#/account/' + a.id },
      h('span', { class: 'swatch', style: { '--c': a.color } }),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title', text: a.name }),
        h('span', { class: 'row-sub', text: accountSub(a, today) })),
      icon('chevron', 'ico sm dim')),
  ];
  return h('div', {},
    GROUPS.map((g) => {
      const list = active.filter((a) => g.kinds.includes(a.kind)).sort(byOrder);
      if (!list.length) return null;
      return h('section', { class: 'group' }, h('h2', { class: 'label', text: g.name }), sortableList(list, 'accounts', row));
    }),
    !active.length && h('p', { class: 'empty', text: 'No payment methods yet. Add one to start logging.' }),
    h('div', { class: 'add-row two-btn' },
      h('button', { type: 'button', class: 'btn', onclick: () => openAccountEditor(null) }, icon('plus', 'ico sm'), 'Payment method'),
      h('button', { type: 'button', class: 'btn', onclick: () => openAccountEditor(null, { kind: 'investment' }) }, icon('plus', 'ico sm'), 'Investment')),
    archived.length > 0 && h('details', { class: 'group archived' },
      h('summary', { class: 'label', text: `Archived (${archived.length})` }),
      h('ul', { class: 'rows' }, archived.map((a) => h('li', {}, row(a))))),
  );
}

function accountSub(a, today) {
  if (a.kind === 'credit_card') {
    const s = cardSummary(a, state.transactions, today);
    return `Unbilled ${formatINR(s.unbilled)} · ${statementPhrase(s.daysToStatement)}`;
  }
  if (a.kind === 'investment') return `Invested so far ${formatINR(investedToDate(a, state.transactions, today))}`;
  if (a.trackBalance) return `${KIND_LABELS[a.kind]} · balance ${formatINR(accountBalance(a, state.transactions, today))}`;
  return KIND_LABELS[a.kind];
}

/* ─── categories ─── */

function categoriesView() {
  const cats = state.categories;
  const row = (c) => [
    !c.archived && handle(c.name),
    h('button', { type: 'button', class: 'row-link', onclick: () => openCategoryEditor(c) },
      h('span', { class: 'tx-ico', style: { '--c': c.color }, 'aria-hidden': 'true', text: c.icon }),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title', text: c.name }),
        h('span', { class: 'row-sub', text: usageText(categoryUsage(c.id, state.transactions)) })),
      icon('chevron', 'ico sm dim')),
  ];
  const archived = cats.filter((c) => c.archived).sort(byOrder);
  return h('div', {},
    [['expense', 'Expense'], ['income', 'Income']].map(([type, label]) => {
      const list = cats.filter((c) => c.type === type && !c.archived).sort(byOrder);
      return h('section', { class: 'group' },
        h('h2', { class: 'label', text: label }),
        list.length ? sortableList(list, 'categories', row) : h('p', { class: 'hint', text: 'None yet.' }),
        h('div', { class: 'add-row' },
          h('button', { type: 'button', class: 'btn block', onclick: () => openCategoryEditor(null, { type }) }, icon('plus', 'ico sm'), `Add ${type} category`)));
    }),
    archived.length > 0 && h('details', { class: 'group archived' },
      h('summary', { class: 'label', text: `Archived (${archived.length})` }),
      h('ul', { class: 'rows' }, archived.map((c) => h('li', {}, row(c))))),
  );
}

function usageText(n) {
  return n === 0 ? 'Not used yet' : n === 1 ? '1 transaction' : `${n} transactions`;
}
