/* Boot, router and the persistent chrome (bottom nav, update prompt). */

import { h, mount, icon } from './ui/dom.js';
import { state, load, onChange, runRecurring } from './state.js';
import { todayStr } from './lib/dates.js';
import { hasDeepLink, parseDeepLink } from './lib/deeplink.js';
import { renderOnboarding } from './ui/onboarding.js';
import { renderHome } from './ui/home.js';
import { renderManage } from './ui/manage.js';
import { renderDetail } from './ui/detail.js';
import { renderInsights } from './ui/insights.js';
import { renderSettings, applyTheme } from './ui/settings.js';
import { renderActivity } from './ui/activity.js';
import { openQuickAdd } from './ui/quickadd.js';
import { toast } from './ui/toast.js';

const app = document.getElementById('app');

const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'activity', label: 'Activity', icon: 'list' },
  { id: 'insights', label: 'Insights', icon: 'chart' },
  { id: 'accounts', label: 'Manage', icon: 'wallet' },
];

const ROUTES = {
  home: renderHome,
  activity: renderActivity,
  insights: renderInsights,
  accounts: renderManage,
  account: renderDetail,
  settings: (_p, query) => renderSettings(render, query),
};

/* #/name/param/param?query */
function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const [name, ...rest] = path.split('/');
  return { name: ROUTES[name] ? name : 'home', params: rest, query };
}

let view, nav;
let navigated = false; // no heading focus on the very first render

function renderShell() {
  view = h('main', { id: 'view', class: 'view', tabindex: '-1' });
  nav = h('nav', { class: 'tabbar', 'aria-label': 'Main' });
  mount(app, view, nav);
}

function renderNav(active) {
  const tab = (t) => h('a', {
    href: '#/' + t.id, class: 'tab' + (active === t.id ? ' on' : ''),
    'aria-current': active === t.id ? 'page' : null,
  }, icon(t.icon), h('span', { text: t.label }));
  mount(nav,
    tab(TABS[0]), tab(TABS[1]),
    h('button', {
      type: 'button', class: 'fab', 'aria-label': 'Add transaction',
      onclick: () => openQuickAdd(),
    }, icon('plus')),
    tab(TABS[2]), tab(TABS[3]));
}

function render() {
  // nothing to draw into until onboarding has built the shell
  if (!state.settings.onboarded || !view) return;
  const { name, params, query } = currentRoute();
  const sameScreen = view.dataset.route === name + '?' + query;
  const y = window.scrollY;
  mount(view, ROUTES[name](params, query));
  view.dataset.route = name + '?' + query;
  // data changes re-render in place; navigating starts at the top and moves
  // focus to the new screen's heading so screen readers announce it
  window.scrollTo(0, sameScreen ? y : 0);
  if (!sameScreen && navigated) {
    const h1 = view.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  }
  navigated = true;
  renderNav({ settings: 'home', account: 'accounts' }[name] ?? name);
}

async function boot() {
  try {
    await load();
  } catch (err) {
    mount(app, h('div', { class: 'boot error' },
      h('p', { text: 'Worthday could not open its storage.' }),
      h('p', { class: 'hint', text: String(err.message || err) })));
    return;
  }
  applyTheme(state.settings.theme === 'dark' ? 'dark' : 'light');
  await runRecurring().catch((e) => console.error('recurring', e));

  // an installed app can stay open across midnight: when it comes back on a
  // new day, catch up recurring items and redraw "today"
  let day = todayStr();
  const onWake = async () => {
    if (document.visibilityState !== 'visible' || todayStr() === day) return;
    day = todayStr();
    await runRecurring().catch(() => {});
    render();
  };
  document.addEventListener('visibilitychange', onWake);
  addEventListener('focus', onWake);

  if (!state.settings.onboarded) {
    renderOnboarding(app, () => {
      location.hash = '#/home';
      renderShell();
      render();
      openDeepLink();
    });
  } else {
    renderShell();
    render();
    openDeepLink();
  }

  addEventListener('hashchange', render);
  // a message left by the page before a reload (e.g. after a restore)
  try {
    const msg = sessionStorage.getItem('spend_toast');
    if (msg) { sessionStorage.removeItem('spend_toast'); toast(msg, { duration: 4000 }); }
  } catch { /* ignore */ }
  onChange(() => {
    // another tab deleted all data: this one must not keep showing (or writing) the old screens
    if (view && !state.settings.onboarded) { location.reload(); return; }
    if (view) render();
  });
  registerServiceWorker();
}

/* ─── deep links: /spend/?amt=250&via=hdfc&cat=food… ─── */

/* Opens quick add pre-filled, never saves. The query is removed from the
   address first so a reload or going back does not open it again. */
function openDeepLink() {
  const search = location.search;
  if (!hasDeepLink(search)) return;
  const keep = new URLSearchParams(search);
  for (const k of ['amt', 'via', 'cat', 'payee', 'note', 'type', 'to']) keep.delete(k);
  const rest = keep.toString();
  history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + (location.hash || '#/home'));
  const { prefill, notes } = parseDeepLink(search, state);
  openQuickAdd({ prefill, fromLink: true });
  if (notes.length) toast(notes.join('. ') + '.', { duration: 6000 });
}

/* ─── service worker and update prompt ─── */

const LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/* On localhost the worker is network-first so edits always show. Open
   ?sw=prod once to switch this browser to the real cache-first worker and
   update prompt (to test updates and offline), ?sw=dev to switch back. */
const SW_MODE = (() => {
  const q = new URLSearchParams(location.search).get('sw');
  try {
    if (q === 'prod' || q === 'dev') localStorage.setItem('spend_sw_mode', q);
    return localStorage.getItem('spend_sw_mode') || 'dev';
  } catch { return 'dev'; }
})();
const IS_LOCAL = LOCALHOST && SW_MODE !== 'prod';

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // on localhost the worker is network-first and swaps itself in, so the
    // page is already current: no prompt, no surprise reload
    if (reloading || !hadController || IS_LOCAL) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register(LOCALHOST && SW_MODE === 'prod' ? 'sw.js?mode=prod' : 'sw.js', { scope: './' }).then((reg) => {
    const offer = () => {
      if (reg.waiting && navigator.serviceWorker.controller && !IS_LOCAL) showUpdate(reg.waiting);
    };
    offer();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(); });
    });
    // installed apps can stay open for days; look for updates now and then
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => { /* offline first load or unsupported: the app still runs */ });
}

function showUpdate(worker) {
  if (document.querySelector('.update')) return;
  document.body.append(h('div', { class: 'update', role: 'status' },
    h('span', { text: 'Update available' }),
    h('button', {
      type: 'button', class: 'btn primary sm', text: 'Reload',
      onclick: () => worker.postMessage('skipWaiting'),
    })));
}

boot();
