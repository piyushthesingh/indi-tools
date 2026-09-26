/* Home: this month so far, budget line, banners (at most two, in the
   spec's priority order), the cards strip and recent transactions. */

import { h, icon, fitStyle } from './dom.js';
import { txRow } from './activity.js';
import { statementPhrase, dueLine } from './cardtext.js';
import { state, cards, categoryById } from '../state.js';
import { formatINR } from '../lib/money.js';
import { cardSummary } from '../lib/cycles.js';
import { monthToDate } from '../lib/totals.js';
import { byNewest } from '../lib/transactions.js';
import { monthName, todayStr, monthKey, toDateStr } from '../lib/dates.js';
import { budgetFor, budgetStatus, categoryStatus } from '../lib/budgets.js';
import { computeBanners } from '../lib/banners.js';
import { pendingItems } from '../lib/recurring.js';
import { openToLog } from './recurring.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function renderHome() {
  const today = todayStr();
  const key = monthKey(today);
  const m = monthToDate(state.transactions, today);
  const recent = [...state.transactions].sort(byNewest).slice(0, 5);

  let compare = null;
  if (m.hasHistory) {
    if (m.diff === 0) compare = 'Same as this time last month';
    else compare = `${formatINR(Math.abs(m.diff))} ${m.diff < 0 ? 'less' : 'more'} than this time last month`;
  }

  const cardList = cards();
  const summaries = cardList.map((card) => ({ card, summary: cardSummary(card, state.transactions, today) }));
  const budget = budgetFor(state.budgets, key);
  const bst = budgetStatus(budget, state.transactions, today);
  const catSt = categoryStatus(budget, state.transactions, key);
  const banners = computeBanners({
    pendingCount: pendingItems(state.recurring).length,
    cardSummaries: summaries,
    budget: bst,
    categoryBudgets: catSt,
    lastBackupAt: state.settings.lastBackupAt || null,
    transactionCount: state.transactions.length,
    today,
    todayFromIso: (iso) => toDateStr(new Date(iso)),
  });

  return h('div', { class: 'screen home' },
    h('header', { class: 'top' },
      h('h1', { class: 'title', text: monthName(key) }),
      h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings' }, icon('gear'))),

    h('a', { class: 'hero', href: '#/insights?month=' + key, 'aria-label': `This month so far ${formatINR(m.current)}. ${compare ?? ''} Open insights.` },
      h('span', { class: 'label', text: 'This month so far' }),
      h('span', { class: 'big', style: fitStyle(formatINR(m.current)), text: formatINR(m.current) }),
      compare && h('span', { class: 'compare' + (m.diff > 0 ? ' up' : ''), text: compare })),

    bst && budgetLine(bst),
    banners.length > 0 && h('div', { class: 'banners' }, banners.map(banner)),

    cardList.length > 0 && h('section', { class: 'group' },
      h('h2', { class: 'label', text: 'Credit cards' }),
      h('div', { class: 'card-strip' }, summaries.map(({ card, summary }) => cardTile(card, summary, today)))),

    h('section', { class: 'group' },
      h('div', { class: 'section-head' },
        h('h2', { class: 'label', text: 'Recent' }),
        recent.length > 0 && h('a', { href: '#/activity', class: 'see-all', text: 'See all' })),
      recent.length
        ? h('ul', { class: 'rows' }, recent.map((t) => h('li', {}, txRow(t))))
        : h('p', { class: 'empty', text: 'No expenses yet. Tap + to add one.' })),
  );
}

function cardTile(c, s, today) {
  const due = dueLine(s, today);
  const pct = s.utilisation != null ? Math.round(s.utilisation * 100) : null;
  const label = [
    c.name, `unbilled ${formatINR(s.unbilled)}`, statementPhrase(s.daysToStatement),
    due?.text, s.credit ? `${formatINR(s.credit)} credit` : null, pct != null ? `${pct}% of limit used` : null,
  ].filter(Boolean).join(', ');
  return h('a', { class: 'card-tile', href: '#/account/' + c.id, style: { '--c': c.color }, 'aria-label': label },
    h('span', { class: 'tile-name', text: c.name }),
    h('span', { class: 'tile-amt', style: fitStyle(formatINR(s.unbilled)), text: formatINR(s.unbilled) }),
    h('span', { class: 'tile-sub', text: 'Unbilled · ' + statementPhrase(s.daysToStatement) }),
    due && h('span', { class: 'tile-due ' + due.tone, text: cap(due.text) }),
    !due && s.credit > 0 && h('span', { class: 'tile-due ok', text: `${formatINR(s.credit)} credit` }),
    pct != null && h('span', { class: 'tile-bar ' + (pct >= 80 ? 'danger' : pct >= 50 ? 'warn' : '') },
      h('span', { style: { width: Math.min(100, pct) + '%' } })),
  );
}

function budgetLine(b) {
  const pct = Math.min(100, Math.round(b.pct * 100));
  const tone = b.pct >= 1 ? 'danger' : b.pct >= 0.8 ? 'warn' : '';
  const note = b.left < 0
    ? `${formatINR(-b.left)} over budget`
    : `${formatINR(b.perDay)} a day left for the rest of the month`;
  return h('a', { class: 'budget-line ' + tone, href: '#/settings?section=budget', 'aria-label': `Budget: ${formatINR(b.spent)} of ${formatINR(b.limit)} spent. ${note}.` },
    h('span', { class: 'util-text' },
      h('span', { text: `${formatINR(b.spent)} of ${formatINR(b.limit)}` }),
      h('span', { class: 'per-day', text: note })),
    h('span', { class: 'bar', 'aria-hidden': 'true' }, h('span', { style: { width: pct + '%' } })));
}

function banner(b) {
  const wrap = (tone, content, href, onclick) => (href
    ? h('a', { class: 'banner ' + tone, href }, content, icon('chevron', 'ico sm'))
    : h('button', { type: 'button', class: 'banner ' + tone, onclick }, content, icon('chevron', 'ico sm')));
  const text = (strong, rest) => h('span', { class: 'banner-text' }, h('strong', { text: strong }), rest ? ' ' + rest : '');
  switch (b.kind) {
    case 'recurring':
      return wrap('info', text(`${b.count} to log`, b.count === 1 ? 'recurring item is due.' : 'recurring items are due.'), null, openToLog);
    case 'due': {
      const s = b.summary;
      const when = s.daysToDue < 0 ? `overdue by ${-s.daysToDue} day${s.daysToDue === -1 ? '' : 's'}`
        : s.daysToDue === 0 ? 'due today' : s.daysToDue === 1 ? 'due tomorrow' : `due in ${s.daysToDue} days`;
      return wrap(s.daysToDue < 0 ? 'danger' : 'warn', text(`${b.card.name} ${when}:`, formatINR(s.billedDue)), '#/account/' + b.card.id);
    }
    case 'statement': {
      const d = b.summary.daysToStatement;
      const when = d === 0 ? 'closes today' : d === 1 ? 'closes tomorrow' : `closes in ${d} days`;
      return wrap('info', text(`${b.card.name} statement ${when}.`, `${formatINR(b.summary.unbilled)} unbilled so far.`), '#/account/' + b.card.id);
    }
    case 'budget':
      return wrap(b.budget.pct >= 1 ? 'danger' : 'warn', text(`${Math.round(b.budget.pct * 100)}% of this month's budget used.`, ''), '#/settings?section=budget');
    case 'categoryBudget': {
      const c = categoryById(b.category.categoryId);
      return wrap(b.category.pct >= 1 ? 'danger' : 'warn', text(`${c?.name ?? 'A category'} at ${Math.round(b.category.pct * 100)}%`, 'of its budget.'), '#/settings?section=budget');
    }
    case 'backup':
      return wrap('info', text(b.days == null ? 'No backup yet.' : `Last backup ${b.days} days ago.`, 'Export one to keep your data safe.'), '#/settings?section=backup');
    default:
      return null;
  }
}
