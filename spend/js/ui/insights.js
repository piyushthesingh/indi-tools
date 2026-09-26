/* Insights for one month: income/spend/net, a donut three ways (category,
   payment method, group) with a legend that doubles as the table view,
   six months of spend as bars, and top payees. Every slice, legend row and
   payee opens Activity filtered to it. #/insights?month=YYYY-MM&by=… */

import { h, mount, icon, fitStyle } from './dom.js';
import { state, accountById, categoryById } from '../state.js';
import { GROUPS } from '../lib/defaults.js';
import { formatINR, formatCompact } from '../lib/money.js';
import { todayStr, monthKey, addMonths, monthName } from '../lib/dates.js';
import { breakdown, slices, monthlyTotals, topPayees, monthSummary, wholePercents } from '../lib/insights.js';
import { filtersToQuery, isMonthKey } from '../lib/filters.js';
import { moneyNow } from '../lib/networth.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const VIEW_LABELS = { category: 'By category', account: 'By payment method', group: 'By group' };
const PARAM = { category: 'categoryId', account: 'accountId', group: 'group' };

function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

export function renderInsights(_params, query) {
  const p = new URLSearchParams(query);
  const current = monthKey(todayStr());
  const key = isMonthKey(p.get('month')) ? p.get('month') : current;
  const view = VIEW_LABELS[p.get('by')] ? p.get('by') : 'category';
  const go = (changes) => {
    const q = new URLSearchParams({ month: key, by: view, ...changes });
    location.replace('#/insights?' + q.toString());
  };

  const accountsById = new Map(state.accounts.map((a) => [a.id, a]));
  const sum = monthSummary(state.transactions, key);
  const b = breakdown(state.transactions, key, view, accountsById);
  const { slices: segs } = slices(b.rows);
  const labelFor = (id) => describe(view, id);
  const withYear = key.slice(0, 4) !== current.slice(0, 4);

  const screen = h('div', { class: 'screen insights' },
    h('header', { class: 'top' }, h('h1', { class: 'title', text: 'Insights' })),
    moneyNowPanel(),

    h('div', { class: 'period' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous month', onclick: () => go({ month: addMonths(key, -1) }) }, icon('back')),
      h('h2', { class: 'period-label', 'aria-live': 'polite', text: monthName(key, { withYear }) }),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next month', disabled: key >= current, onclick: () => go({ month: addMonths(key, 1) }) }, icon('chevron'))),

    h('p', { class: 'flow' },
      h('span', {}, 'Income ', h('strong', { text: formatINR(sum.income) })),
      h('span', {}, 'Spent ', h('strong', { text: formatINR(sum.spend) })),
      h('span', {}, 'Net ', h('strong', { class: sum.net < 0 ? 'neg' : 'pos', text: formatINR(sum.net, { signed: true }) }))),

    h('div', { class: 'seg small', role: 'tablist', 'aria-label': 'Split spending' },
      Object.entries(VIEW_LABELS).map(([v, label]) => h('button', {
        type: 'button', role: 'tab', 'aria-selected': String(v === view), class: v === view ? 'on' : '',
        text: { category: 'Category', account: 'Method', group: 'Group' }[v],
        'aria-label': label, onclick: () => go({ by: v }),
      }))),

    b.rows.length
      ? donutSection(view, key, b, segs, labelFor)
      : h('p', { class: 'empty', text: `No spending in ${monthName(key)}. Tap + to add an expense.` }),

    barsSection(key, current, (m) => go({ month: m })),
    payeesSection(key),
  );

  swipeMonths(screen, (dir) => {
    const next = addMonths(key, dir);
    if (next <= current) go({ month: next });
  });
  return screen;
}

/* name, colour and Activity link for a breakdown row */
function describe(view, id) {
  if (view === 'category') {
    const c = categoryById(id);
    return { name: c ? `${c.icon} ${c.name}` : 'Unknown category', color: c?.color || 'var(--faint)' };
  }
  if (view === 'account') {
    const a = accountById(id);
    return { name: a?.name || 'Unknown account', color: a?.color || 'var(--faint)' };
  }
  return { name: GROUPS.find((g) => g.id === id)?.name || id, color: `var(--g-${id})` };
}

const activityHref = (view, key, id) => '#/activity?' + filtersToQuery({ month: key, [PARAM[view]]: id });
/* ─── donut ─── */

function donutSection(view, key, b, segs, labelFor) {
  const size = 220, r = 100, inner = 64, c = size / 2;
  const centre = h('div', { class: 'donut-centre', 'aria-hidden': 'true' });
  const showTotal = () => mount(centre,
    h('span', { class: 'label', text: 'Spent' }),
    h('span', { class: 'donut-total', style: fitStyle(formatINR(b.total)), text: formatINR(b.total) }));
  const showSlice = (name, amount, pctText) => mount(centre,
    h('span', { class: 'label clamp', text: name }),
    h('span', { class: 'donut-total', style: fitStyle(formatINR(amount)), text: formatINR(amount) }),
    h('span', { class: 'row-sub', text: pctText }));
  const segPct = wholePercents(segs.map((x) => x.amount)).map((v) => (v === 0 ? '<1%' : v + '%'));
  showTotal();

  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, class: 'donut', role: 'img', 'aria-label': `Spending ${VIEW_LABELS[view].toLowerCase()}, ${formatINR(b.total)} in total. Details in the list below.` });
  let angle = -Math.PI / 2;
  segs.forEach((seg, i) => {
    const isOther = seg.id === '__other';
    const info = isOther ? { name: `Other (${seg.ids.length})`, color: 'var(--faint)' } : labelFor(seg.id);
    const sweep = seg.share * Math.PI * 2;
    const shape = seg.share >= 0.9999
      ? s('circle', { cx: c, cy: c, r: (r + inner) / 2, fill: 'none', stroke: info.color, 'stroke-width': r - inner })
      : s('path', { d: arc(c, c, r, inner, angle, angle + sweep), fill: info.color, stroke: 'var(--panel)', 'stroke-width': 2, 'stroke-linejoin': 'round' });
    angle += sweep;
    shape.append(s('title', {}, document.createTextNode(`${info.name}: ${formatINR(seg.amount)} (${segPct[i]})`)));
    const link = s('a', {
      href: isOther ? '#insights-legend' : activityHref(view, key, seg.id),
      class: 'slice', 'aria-label': `${info.name}, ${formatINR(seg.amount)}, ${segPct[i]}. ${isOther ? 'Show the list' : 'Open in Activity'}`,
    }, shape);
    if (isOther) link.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('insights-legend')?.scrollIntoView({ behavior: 'smooth' }); });
    const hi = () => { svg.classList.add('has-hover'); link.classList.add('hover'); showSlice(info.name, seg.amount, segPct[i]); };
    const lo = () => { svg.classList.remove('has-hover'); link.classList.remove('hover'); showTotal(); };
    link.addEventListener('pointerenter', hi);
    link.addEventListener('pointerleave', lo);
    link.addEventListener('focus', hi);
    link.addEventListener('blur', lo);
    svg.append(link);
  });

  const rowPct = wholePercents(b.rows.map((row) => row.amount));
  const negatives = b.rows.filter((row) => row.amount < 0);

  return h('section', { class: 'panel' },
    h('div', { class: 'donut-wrap' }, svg, centre),
    h('ul', { class: 'legend', id: 'insights-legend', 'aria-label': 'Breakdown' },
      b.rows.map((row, i) => {
        const info = labelFor(row.id);
        return h('li', {},
          h('a', { href: activityHref(view, key, row.id), class: 'legend-row' },
            h('span', { class: 'swatch', style: { '--c': info.color } }),
            h('span', { class: 'legend-name', text: info.name }),
            h('span', { class: 'legend-amt', text: formatINR(row.amount) }),
            h('span', { class: 'legend-pct', text: rowPct[i] == null ? '—' : rowPct[i] + '%' })));
      })),
    negatives.length > 0 && h('p', { class: 'hint', text: 'Rows below zero are refunds larger than that month\'s spending there. They lower the total but are not drawn in the chart.' }),
  );
}

/* ring segment from a0 to a1 (radians, clockwise from 12 o'clock offset) */
function arc(cx, cy, r, ri, a0, a1) {
  const p = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)].map((v) => v.toFixed(2)).join(' ');
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p(r, a0)} A ${r} ${r} 0 ${large} 1 ${p(r, a1)} L ${p(ri, a1)} A ${ri} ${ri} 0 ${large} 0 ${p(ri, a0)} Z`;
}

/* ─── six months ─── */

function barsSection(key, current, pick) {
  const months = monthlyTotals(state.transactions, key, 6);
  const max = Math.max(1, ...months.map((m) => m.spend));
  const W = 320, H = 150, top = 22, bottom = 22, gap = 12;
  const bw = (W - gap * 5) / 6;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bars', role: 'img', 'aria-label': 'Spending in the last six months. Values in the list below.' });
  const plotH = H - top - bottom;
  svg.append(s('line', { x1: 0, x2: W, y1: H - bottom + 0.5, y2: H - bottom + 0.5, class: 'baseline' }));
  months.forEach((m, i) => {
    const x = i * (bw + gap);
    const hgt = m.spend > 0 ? Math.max(3, (m.spend / max) * plotH) : 0;
    const y = H - bottom - hgt;
    const selected = m.month === key;
    const g = s('a', {
      href: '#', class: 'bar-hit' + (selected ? ' selected' : ''),
      'aria-label': `${monthName(m.month, { withYear: true })}: ${formatINR(m.spend)}${selected ? ', shown above' : ''}`,
    });
    g.addEventListener('click', (e) => { e.preventDefault(); if (m.month <= current) pick(m.month); });
    g.append(s('rect', { x, y: top - 4, width: bw, height: plotH + 4, class: 'hit' }));
    if (hgt > 0) g.append(s('path', { d: roundTop(x, y, bw, hgt, 4), class: 'bar' }));
    g.append(s('text', { x: x + bw / 2, y: H - 6, class: 'axis', 'text-anchor': 'middle' }, document.createTextNode(monthName(m.month, { short: true }))));
    // direct label on the selected month and on hover/focus
    g.append(s('text', { x: x + bw / 2, y: Math.max(12, y - 6), class: 'val', 'text-anchor': 'middle' }, document.createTextNode(formatCompact(m.spend))));
    g.append(s('title', {}, document.createTextNode(`${monthName(m.month, { withYear: true })}: ${formatINR(m.spend)}`)));
    svg.append(g);
  });
  return h('section', { class: 'panel' },
    h('h2', { class: 'label', text: 'Last six months' }),
    svg,
    h('table', { class: 'sr-only' },
      h('caption', { text: 'Spending by month' }),
      h('tbody', {}, months.map((m) => h('tr', {}, h('th', { text: monthName(m.month, { withYear: true }) }), h('td', { text: formatINR(m.spend) }))))));
}

function roundTop(x, y, w, hgt, rad) {
  const r = Math.min(rad, w / 2, hgt);
  return `M ${x} ${y + hgt} V ${y + r} Q ${x} ${y} ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + hgt} Z`;
}

/* ─── payees ─── */

function payeesSection(key) {
  const top = topPayees(state.transactions, key, 5);
  return h('section', { class: 'panel' },
    h('h2', { class: 'label', text: 'Top payees' }),
    top.length
      ? h('ol', { class: 'payees' }, top.map((p, i) => h('li', {},
        h('a', { class: 'legend-row', href: '#/activity?' + filtersToQuery({ month: key }) + '&q=' + encodeURIComponent(p.name) },
          h('span', { class: 'rank', text: String(i + 1) }),
          h('span', { class: 'legend-name' }, p.name, h('span', { class: 'row-sub', text: p.count === 1 ? ' · 1 payment' : ` · ${p.count} payments` })),
          h('span', { class: 'legend-amt', text: formatINR(p.amount) })))))
      : h('p', { class: 'hint', text: 'Add a payee under "More" when you log an expense to see who you spend the most with.' }));
}

/* ─── swipe left/right to change month ─── */

function swipeMonths(el, onSwipe) {
  let x0 = null, y0 = 0;
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.target.closest('.seg, input, .sheet')) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
  });
}

/* ─── money now (always as of today, not the selected month) ───
   A small card with one flat number. By default it leaves investments out
   (many people keep those private); Settings can include them. Tapping the
   card shows the breakdown. */

let moneyOpen = false; // stays open while moving between months

function moneyNowPanel() {
  const today = todayStr();
  const m = moneyNow(state.accounts, state.transactions, today);
  const withInv = state.settings.moneyIncludesInvestments === true;
  if (!m.cashRows.length && !m.investRows.length) {
    return h('a', { class: 'panel money money-empty', href: '#/accounts' },
      h('span', { class: 'label', text: 'Money now' }),
      h('span', { class: 'hint', text: 'Turn on "Track balance" for your bank accounts in Manage to see it here.' }));
  }
  const figure = withInv ? m.total : m.moneyNow;
  const detail = h('div', { class: 'money-detail', id: 'money-detail', hidden: !moneyOpen });
  const line = (label, value, cls = '') => h('div', { class: 'money-line ' + cls },
    h('span', { text: label }), h('span', { class: 'amt', text: value }));
  const row = (a, amount, sign = '') => h('li', {},
    h('a', { class: 'legend-row', href: '#/account/' + a.id },
      h('span', { class: 'swatch', style: { '--c': a.color } }),
      h('span', { class: 'legend-name', text: a.name }),
      h('span', { class: 'legend-amt', text: sign + formatINR(amount) })));
  mount(detail,
    line('Digital cash', formatINR(m.digital)),
    m.cashRows.some((r) => r.account.kind === 'cash') && line('Cash', formatINR(m.cashInHand)),
    line(m.cardsOwed >= 0 ? 'Card dues' : 'Card credit', (m.cardsOwed > 0 ? '−' : m.cardsOwed < 0 ? '+' : '') + formatINR(Math.abs(m.cardsOwed))),
    line('Money now, excluding investments', formatINR(m.moneyNow), 'sum'),
    m.investRows.length > 0 && line('Investments', formatINR(m.invested)),
    m.investRows.length > 0 && line('Including investments', formatINR(m.total), 'sum'),
    h('details', { class: 'money-accounts' },
      h('summary', { class: 'label', text: 'Accounts' }),
      h('ul', { class: 'legend' },
        m.cashRows.map((r) => row(r.account, r.amount)),
        m.cardRows.filter((r) => r.amount !== 0).map((r) => row(r.account, Math.abs(r.amount), r.amount > 0 ? '−' : '+')),
        m.investRows.map((r) => row(r.account, r.amount)))),
    m.untracked.length > 0 && h('p', { class: 'hint', text: `Not included (balance not tracked): ${m.untracked.map((a) => a.name).join(', ')}.` }),
    h('p', { class: 'hint' }, 'Investments are ', withInv ? 'included' : 'left out', ' of the headline number. ',
      h('a', { href: '#/settings?section=money', text: 'Change in Settings' })));

  const toggle = h('button', {
    type: 'button', class: 'money-card', 'aria-expanded': String(moneyOpen), 'aria-controls': 'money-detail',
    'aria-label': `Money now ${formatINR(figure)}, ${withInv ? 'including' : 'excluding'} investments. ${moneyOpen ? 'Hide' : 'Show'} details`,
    onclick: () => {
      moneyOpen = !moneyOpen;
      detail.hidden = !moneyOpen;
      toggle.setAttribute('aria-expanded', String(moneyOpen));
    },
  },
    h('span', { class: 'money-head' },
      h('span', { class: 'label', text: 'Money now' }),
      h('span', { class: 'money-note', text: withInv ? '*including investments' : '*excluding investments' })),
    h('span', { class: 'money-figure', style: fitStyle(formatINR(figure)), text: formatINR(figure) }));
  return h('section', { class: 'panel money' }, toggle, detail);
}
