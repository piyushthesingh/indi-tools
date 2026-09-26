/* Activity: every transaction, grouped by day, with search and filters.
   Filters live in the URL (#/activity?month=…&cat=…) so Insights and
   Accounts can link straight to a filtered list. Search text stays in
   memory so typing never rebuilds the whole screen. */

import { h, mount, icon } from './dom.js';
import { openSheet } from './sheet.js';
import { openQuickAdd } from './quickadd.js';
import { exportCSV } from './backup.js';
import { state, accountById, categoryById, byOrder } from '../state.js';
import { GROUPS } from '../lib/defaults.js';
import { formatINR } from '../lib/money.js';
import { todayStr, monthKey, addMonths, monthName, formatDayHeader, formatShort } from '../lib/dates.js';
import { applyFilters, groupByDate, filtersFromQuery, filtersToQuery } from '../lib/filters.js';
import { summarize } from '../lib/totals.js';
import { byNewest, TYPE_LABELS } from '../lib/transactions.js';

let search = '';

export function currentFilters(query) {
  const f = filtersFromQuery(query || '');
  if (!f.month && !f.from && !f.to) f.month = monthKey(todayStr());
  return f;
}

export function setFilters(f) {
  location.replace('#/activity?' + filtersToQuery(f));
}

export function renderActivity(_params, query) {
  const f = currentFilters(query);
  // Insights' top payees link here with ?q=<payee>
  const q = new URLSearchParams(query || '').get('q');
  if (q != null) search = q;
  const today = todayStr();
  const accountsById = new Map(state.accounts.map((a) => [a.id, a]));

  const listEl = h('div');
  const summaryEl = h('div');

  function renderList() {
    const rows = applyFilters(state.transactions, { ...f, q: search }, accountsById).sort(byNewest);
    const s = summarize(rows);
    mount(summaryEl, h('div', { class: 'summary', 'aria-live': 'polite' },
      h('div', { class: 'summary-main' },
        h('span', { class: 'label', text: 'Spent' }),
        h('span', { class: 'summary-num', text: formatINR(s.spend) })),
      h('div', { class: 'summary-sub' },
        s.income ? h('span', { text: 'Income ' + formatINR(s.income) }) : null,
        h('span', { text: s.count === 1 ? '1 transaction' : s.count + ' transactions' }),
        s.transfers ? h('span', { text: formatINR(s.transfers) + ' in transfers, not counted' }) : null)));

    if (!rows.length) {
      const nothingAtAll = !state.transactions.length;
      mount(listEl, h('div', { class: 'empty' },
        h('p', { text: nothingAtAll ? 'No expenses yet. Tap + to add one.' : 'Nothing matches these filters.' }),
        !nothingAtAll && h('button', {
          type: 'button', class: 'btn sm', text: 'Clear filters',
          onclick: () => { search = ''; setFilters({ month: monthKey(today) }); },
        })));
      return;
    }
    mount(listEl, groupByDate(rows).map((g) => h('section', { class: 'day' },
      h('h2', { class: 'day-head' },
        h('span', { text: formatDayHeader(g.date, today) }),
        h('span', { class: 'day-total', text: dayTotal(g) })),
      h('ul', { class: 'rows' }, g.items.map((t) => h('li', {}, txRow(t)))))));
  }

  const searchInput = h('input', {
    type: 'search', id: 'act-search', placeholder: 'Search payee or note', value: search, autocomplete: 'off', enterkeyhint: 'search',
    oninput: (e) => { search = e.target.value; renderList(); },
  });

  const screen = h('div', { class: 'screen' },
    h('header', { class: 'top' },
      h('h1', { class: 'title', text: 'Activity' }),
      h('button', {
        type: 'button', class: 'btn sm', text: 'CSV', 'aria-label': 'Export these transactions as CSV',
        onclick: () => exportCSV(applyFilters(state.transactions, { ...f, q: search }, accountsById), f.month && f.month !== 'all' ? f.month : ''),
      }),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Filters', onclick: () => openFilterSheet(f) }, filterIcon())),
    periodBar(f),
    h('div', { class: 'search' },
      icon('search', 'ico sm'),
      h('label', { for: 'act-search', class: 'sr-only', text: 'Search payee or note' }),
      searchInput),
    activeChips(f),
    summaryEl,
    listEl,
  );
  renderList();
  return screen;
}

function dayTotal(g) {
  if (g.spend) return formatINR(g.spend);
  if (g.income) return '+' + formatINR(g.income);
  return '';
}

export function txRow(t, { onOpen, sign: forceSign } = {}) {
  const cat = categoryById(t.categoryId);
  const acc = accountById(t.accountId);
  let title, sub, emoji, color;
  if (t.type === 'transfer') {
    const to = accountById(t.toAccountId);
    title = t.payee || (to?.kind === 'credit_card' ? 'Card payment' : to?.kind === 'investment' ? 'Investment'
      : acc?.kind === 'investment' ? 'Redemption' : 'Transfer');
    sub = `${acc?.name ?? '?'} → ${to?.name ?? '?'}`;
    emoji = '⇄';
    color = to?.color || 'var(--faint)';
  } else {
    title = t.payee || cat?.name || TYPE_LABELS[t.type];
    sub = [t.payee ? cat?.name : null, acc?.name, t.type === 'refund' ? 'Refund' : null].filter(Boolean).join(' · ');
    emoji = cat?.icon || '•';
    color = cat?.color || 'var(--faint)';
  }
  const sign = forceSign ?? (t.type === 'income' || t.type === 'refund' ? '+' : '');
  return h('button', {
    type: 'button', class: 'tx', onclick: () => (onOpen ? onOpen(t) : openQuickAdd({ edit: t })),
    'aria-label': `${title}, ${sign}${formatINR(t.amount)}, ${sub}${t.note ? ', ' + t.note : ''}`,
  },
    h('span', { class: 'tx-ico', style: { '--c': color }, 'aria-hidden': 'true', text: emoji }),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title', text: title }),
      h('span', { class: 'row-sub', text: t.note ? `${sub} · ${t.note}` : sub })),
    h('span', { class: 'tx-amt ' + t.type, text: sign + formatINR(t.amount) }));
}

function periodBar(f) {
  const today = todayStr();
  let label;
  if (f.month === 'all') label = 'All time';
  else if (f.month) label = monthName(f.month, { withYear: f.month.slice(0, 4) !== today.slice(0, 4) });
  else label = `${f.from ? formatShort(f.from, today) : 'Start'} – ${f.to ? formatShort(f.to, today) : 'today'}`;
  const isMonth = f.month && f.month !== 'all';
  const step = (n) => setFilters({ ...f, month: addMonths(f.month, n) });
  return h('div', { class: 'period' },
    isMonth ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous month', onclick: () => step(-1) }, icon('back')) : h('span', { class: 'icon-btn-spacer' }),
    h('button', { type: 'button', class: 'period-label', text: label, 'aria-label': `Period: ${label}. Change`, onclick: () => openFilterSheet(f) }),
    isMonth ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next month', onclick: () => step(1) }, icon('chevron')) : h('span', { class: 'icon-btn-spacer' }));
}

function activeChips(f) {
  const chips = [];
  const drop = (keys) => () => {
    const next = { ...f };
    for (const k of keys) delete next[k];
    if (!next.month && !next.from && !next.to) next.month = monthKey(todayStr());
    setFilters(next);
  };
  if (!f.month) chips.push(['Custom range', ['from', 'to']]);
  if (f.month === 'all') chips.push(['All time', ['month']]);
  if (f.type) chips.push([TYPE_LABELS[f.type] ?? f.type, ['type']]);
  if (f.categoryId) chips.push([categoryById(f.categoryId)?.name ?? 'Category', ['categoryId']]);
  if (f.accountId) chips.push([accountById(f.accountId)?.name ?? 'Account', ['accountId']]);
  if (f.group) chips.push([GROUPS.find((g) => g.id === f.group)?.name ?? f.group, ['group']]);
  if (!chips.length) return null;
  return h('div', { class: 'chips active-filters', 'aria-label': 'Active filters' },
    chips.map(([label, keys]) => h('button', {
      type: 'button', class: 'chip on', 'aria-label': `Remove filter: ${label}`, onclick: drop(keys),
    }, label, icon('close', 'ico sm'))));
}

function filterIcon() {
  const span = document.createElement('span');
  span.className = 'ico';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>';
  return span;
}

function openFilterSheet(f) {
  const today = todayStr();
  const draft = { ...f };
  let mode = f.month === 'all' ? 'all' : f.month ? 'month' : 'range';

  const select = (id, label, options, value, onchange) => h('div', { class: 'field' },
    h('label', { for: id, text: label }),
    h('select', { id, onchange: (e) => onchange(e.target.value) },
      options.map(([v, text]) => h('option', { value: v, text, selected: String(value ?? '') === String(v) }))));

  const months = [];
  const earliest = state.transactions.reduce((min, t) => (t.date < min ? t.date : min), today);
  for (let k = monthKey(today); k >= monthKey(earliest) && months.length < 120; k = addMonths(k, -1)) months.push(k);
  if (draft.month && draft.month !== 'all' && !months.includes(draft.month)) months.unshift(draft.month);

  const periodEl = h('div');
  function renderPeriod() {
    mount(periodEl,
      select('f-mode', 'Period', [['month', 'A month'], ['range', 'Custom range'], ['all', 'All time']], mode, (v) => { mode = v; renderPeriod(); }),
      mode === 'month' && select('f-month', 'Month', months.map((k) => [k, monthName(k, { withYear: true })]),
        draft.month && draft.month !== 'all' ? draft.month : monthKey(today), (v) => { draft.month = v; }),
      mode === 'range' && h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', { for: 'f-from', text: 'From' }),
          h('input', { id: 'f-from', type: 'date', value: draft.from || '', onchange: (e) => { draft.from = e.target.value; } })),
        h('div', { class: 'field' }, h('label', { for: 'f-to', text: 'To' }),
          h('input', { id: 'f-to', type: 'date', value: draft.to || '', onchange: (e) => { draft.to = e.target.value; } }))),
    );
  }
  renderPeriod();

  const cats = [...state.categories].sort((a, b) => a.type.localeCompare(b.type) || byOrder(a, b));
  const accts = [...state.accounts].sort(byOrder);

  const body = h('div', {},
    periodEl,
    select('f-type', 'Type', [['', 'Any type'], ...Object.entries(TYPE_LABELS)], draft.type, (v) => { draft.type = v; }),
    select('f-cat', 'Category', [['', 'Any category'], ...cats.map((c) => [c.id, `${c.icon} ${c.name}${c.archived ? ' (archived)' : ''}`])], draft.categoryId, (v) => { draft.categoryId = v; }),
    select('f-acct', 'Payment method', [['', 'Any method'], ...accts.map((a) => [a.id, a.name + (a.archived ? ' (archived)' : '')])], draft.accountId, (v) => { draft.accountId = v; }),
    select('f-group', 'Group', [['', 'Any group'], ...GROUPS.map((g) => [g.id, g.name])], draft.group, (v) => { draft.group = v; }),
  );

  const apply = () => {
    const next = { ...draft };
    if (mode === 'all') { next.month = 'all'; delete next.from; delete next.to; }
    else if (mode === 'month') { next.month = next.month && next.month !== 'all' ? next.month : monthKey(today); delete next.from; delete next.to; }
    else {
      delete next.month;
      if (!next.from && !next.to) next.month = monthKey(today);
      if (next.from && next.to && next.from > next.to) [next.from, next.to] = [next.to, next.from];
    }
    sheet.close({ restoreFocus: false });
    setFilters(next);
  };
  const sheet = openSheet({
    title: 'Filters',
    body,
    footer: h('div', { class: 'qa-foot two' },
      h('button', { type: 'button', class: 'btn', text: 'Reset', onclick: () => { sheet.close({ restoreFocus: false }); setFilters({ month: monthKey(today) }); } }),
      h('button', { type: 'button', class: 'btn primary', text: 'Show results', onclick: apply })),
  });
}
