/* #/account/<id>: card detail (cycles, billed, pay bill) or the detail of
   any other payment method (balance or this month's spend). */

import { h, icon, fitStyle } from './dom.js';
import { openQuickAdd } from './quickadd.js';
import { openAccountEditor } from './editors.js';
import { txRow } from './activity.js';
import { statementPhrase, dueLine } from './cardtext.js';
import { state, accountById, setAccountArchived } from '../state.js';
import { KIND_LABELS } from '../lib/defaults.js';
import { formatINR } from '../lib/money.js';
import { cardSummary, netSpend } from '../lib/cycles.js';
import { accountBalance } from '../lib/accounts.js';
import { groupByDate, filtersToQuery } from '../lib/filters.js';
import { byNewest } from '../lib/transactions.js';
import { todayStr, formatShort, formatDayHeader, monthKey, monthStart, monthEnd, monthName } from '../lib/dates.js';
import { spendTotal } from '../lib/totals.js';
import { estimateCashback, hasCashback } from '../lib/cashback.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function renderDetail([id], query) {
  const a = accountById(id);
  if (!a) {
    return h('div', { class: 'screen' },
      header('Not found', null),
      h('p', { class: 'empty', text: 'This payment method no longer exists.' }));
  }
  return a.kind === 'credit_card' ? cardDetail(a, query) : otherDetail(a);
}

function header(title, a) {
  return h('header', { class: 'top' },
    h('a', { class: 'icon-btn', href: '#/accounts', 'aria-label': 'Back to accounts' }, icon('back')),
    h('h1', { class: 'title', text: title }),
    a ? h('button', { type: 'button', class: 'btn sm', text: 'Edit', onclick: () => openAccountEditor(a) }) : h('span', { class: 'icon-btn-spacer' }));
}

function archivedNote(a) {
  if (!a.archived) return null;
  return h('div', { class: 'note' },
    h('p', { text: 'Archived. It is hidden from pickers but keeps its history.' }),
    h('button', { type: 'button', class: 'btn sm', text: 'Unarchive', onclick: () => setAccountArchived(a.id, false) }));
}

function txList(txns, emptyText) {
  const sorted = [...txns].sort(byNewest);
  if (!sorted.length) return h('p', { class: 'empty', text: emptyText });
  const today = todayStr();
  return groupByDate(sorted).map((g) => h('section', { class: 'day' },
    h('h2', { class: 'day-head' }, h('span', { text: formatDayHeader(g.date, today) })),
    h('ul', { class: 'rows' }, g.items.map((t) => h('li', {}, txRow(t))))));
}

/* ─── credit card ─── */

function cardDetail(a, query) {
  const today = todayStr();
  const s = cardSummary(a, state.transactions, today);
  const showPrev = new URLSearchParams(query).get('cycle') === 'prev';
  const range = showPrev ? s.previousCycle : s.cycle;
  const inCycle = state.transactions.filter((t) =>
    (t.accountId === a.id || t.toAccountId === a.id) && t.date >= range.from && t.date <= range.to);
  const cycleSpend = netSpend(a.id, state.transactions, range.from, range.to);
  const due = dueLine(s, today);

  const stat = (label, value, sub, tone = '') => h('div', { class: 'stat ' + tone },
    h('span', { class: 'label', text: label }),
    h('span', { class: 'stat-num', style: fitStyle(value), text: value }),
    sub && h('span', { class: 'row-sub', text: sub }));

  const pay = () => openQuickAdd({
    prefill: { type: 'transfer', toAccountId: a.id, amount: s.billedDue > 0 ? s.billedDue : Math.max(0, s.outstanding) || undefined },
  });

  return h('div', { class: 'screen' },
    header(a.name, a),
    archivedNote(a),
    h('div', { class: 'card-hero', style: { '--c': a.color } },
      h('div', { class: 'stats' },
        stat('Unbilled', formatINR(s.unbilled), cap(statementPhrase(s.daysToStatement)) + ` (${formatShort(s.nextStatement, today)})`),
        stat('Billed due', s.billedDue > 0 ? formatINR(s.billedDue) : '₹0',
          s.billedDue > 0 ? cap(due.when) : `Last statement ${formatShort(s.lastStatement, today)}`,
          due?.tone || '')),
      s.credit > 0 && h('p', { class: 'credit', text: `${formatINR(s.credit)} credit balance on the card` }),
      cashbackLine(a, range, showPrev),
      a.limit ? utilBar(s.utilisation, s.outstanding, a.limit) : null,
      h('dl', { class: 'facts' },
        fact('Total owed', formatINR(Math.max(0, s.outstanding))),
        fact('Next statement', formatShort(s.nextStatement, today)),
        fact('Next due date', formatShort(s.billedDue > 0 && !s.overdue ? s.dueDate : s.nextDueDate, today)),
        fact('Statement / due day', `${a.statementDay} / ${a.dueDay}`)),
      s.outstanding > 0 && h('button', { type: 'button', class: 'btn primary block', onclick: pay }, 'Pay bill')),

    h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Cycle' },
      [['cur', 'Current cycle'], ['prev', 'Previous cycle']].map(([k, label]) => {
        const on = (k === 'prev') === showPrev;
        return h('button', {
          type: 'button', role: 'tab', 'aria-selected': String(on), class: on ? 'on' : '', text: label,
          onclick: () => location.replace(`#/account/${a.id}${k === 'prev' ? '?cycle=prev' : ''}`),
        });
      })),
    h('div', { class: 'summary' },
      h('div', { class: 'summary-main' },
        h('span', { class: 'label', text: `${formatShort(range.from, today)} – ${formatShort(range.to, today)}` }),
        h('span', { class: 'summary-num', text: formatINR(cycleSpend) })),
      h('div', { class: 'summary-sub' },
        h('span', { text: showPrev ? 'Spent in the billed cycle' : 'Spent so far this cycle' }),
        h('a', { href: '#/activity?' + filtersToQuery({ from: range.from, to: range.to, accountId: a.id }), text: 'Open in Activity' }))),
    txList(inCycle, showPrev ? 'Nothing in the previous cycle.' : 'Nothing on this card this cycle yet.'),
  );
}

function cashbackLine(a, range, showPrev) {
  if (!hasCashback(a)) {
    return h('button', { type: 'button', class: 'link-btn inline', text: 'Set up cashback estimate', onclick: () => openAccountEditor(a, { focus: 'cashback' }) });
  }
  const cb = estimateCashback(a, state.transactions, range.from, range.to);
  return h('p', { class: 'cashback' },
    h('span', { class: 'label', text: 'Estimated cashback' }),
    h('span', {}, h('strong', { text: formatINR(cb.amount) }), showPrev ? ' last cycle' : ' this cycle so far', cb.capped ? ' (cap reached)' : ''));
}

function fact(label, value) {
  return h('div', {}, h('dt', { text: label }), h('dd', { text: value }));
}

function utilBar(util, owed, limit) {
  const pct = Math.round(util * 100);
  const tone = pct >= 80 ? 'danger' : pct >= 50 ? 'warn' : '';
  return h('div', { class: 'util ' + tone },
    h('div', { class: 'util-text' },
      h('span', { text: `${pct}% of limit used` }),
      h('span', { text: `${formatINR(Math.max(0, owed))} of ${formatINR(limit)}` })),
    h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, pct)), 'aria-label': 'Credit limit used' },
      h('span', { style: { width: Math.min(100, pct) + '%' } })));
}

/* ─── other payment methods ─── */

function otherDetail(a) {
  const today = todayStr();
  const key = monthKey(today);
  const mine = state.transactions.filter((t) => t.accountId === a.id || t.toAccountId === a.id);
  const thisMonth = mine.filter((t) => t.date >= monthStart(key) && t.date <= monthEnd(key));
  const spent = spendTotal(thisMonth.filter((t) => t.accountId === a.id), monthStart(key), monthEnd(key));

  return h('div', { class: 'screen' },
    header(a.name, a),
    archivedNote(a),
    h('div', { class: 'card-hero', style: { '--c': a.color } },
      h('div', { class: 'stats' },
        a.trackBalance
          ? h('div', { class: 'stat' }, h('span', { class: 'label', text: 'Balance' }), h('span', { class: 'stat-num', style: fitStyle(formatINR(accountBalance(a, state.transactions, today))), text: formatINR(accountBalance(a, state.transactions, today)) }), h('span', { class: 'row-sub', text: KIND_LABELS[a.kind] }))
          : h('div', { class: 'stat' }, h('span', { class: 'label', text: `Spent in ${monthName(key)}` }), h('span', { class: 'stat-num', style: fitStyle(formatINR(spent)), text: formatINR(spent) }), h('span', { class: 'row-sub', text: KIND_LABELS[a.kind] })),
        a.trackBalance && h('div', { class: 'stat' }, h('span', { class: 'label', text: `Spent in ${monthName(key)}` }), h('span', { class: 'stat-num', style: fitStyle(formatINR(spent)), text: formatINR(spent) })))),
    h('div', { class: 'summary-sub list-head' },
      h('span', { class: 'label', text: monthName(key) }),
      h('a', { href: '#/activity?' + filtersToQuery({ month: key, accountId: a.id }), text: 'Open in Activity' })),
    txList(thisMonth, `Nothing with ${a.name} this month yet.`),
  );
}
