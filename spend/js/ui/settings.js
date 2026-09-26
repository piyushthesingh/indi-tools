import { h, icon } from './dom.js';
import { state, setSetting } from '../state.js';
import { budgetSummary } from './budget.js';
import { recurringList } from './recurring.js';
import { backupSection, storageSection, shortcutsSection, dangerSection } from './backup.js';

export function applyTheme(theme) {
  const light = theme === 'light';
  if (light) document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  document.querySelector('meta[name=theme-color]').content = light ? '#EEF3F0' : '#0C1410';
  // white status-bar text on a light page is unreadable; iOS applies this on next launch
  document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]').content = light ? 'default' : 'black-translucent';
  try { localStorage.setItem('spend_theme', light ? 'light' : 'dark'); } catch { /* private mode */ }
}

export function renderSettings(rerender, query = '') {
  const theme = state.settings.theme === 'light' ? 'light' : 'dark';
  const setTheme = async (t) => {
    applyTheme(t);
    await setSetting('theme', t);
    rerender();
  };
  const section = new URLSearchParams(query).get('section');
  if (section) setTimeout(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }), 0);
  return h('div', { class: 'screen' },
    h('header', { class: 'top' },
      h('a', { class: 'icon-btn', href: '#/home', 'aria-label': 'Back to home' }, icon('back')),
      h('h1', { class: 'title', text: 'Settings' }),
      h('span', { class: 'icon-btn-spacer' })),

    h('section', { class: 'group', id: 'budget' },
      h('h2', { class: 'label', text: 'Budget' }),
      budgetSummary()),

    h('section', { class: 'group', id: 'recurring' },
      h('h2', { class: 'label', text: 'Recurring' }),
      recurringList()),

    h('section', { class: 'group', id: 'backup' },
      h('h2', { class: 'label', text: 'Backup and restore' }),
      backupSection()),

    h('section', { class: 'group' },
      h('h2', { class: 'label', text: 'Payment methods and categories' }),
      h('ul', { class: 'rows' },
        h('li', {}, h('a', { class: 'row-link pad', href: '#/accounts' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: 'Payment methods' })), icon('chevron', 'ico sm dim'))),
        h('li', {}, h('a', { class: 'row-link pad', href: '#/accounts?view=categories' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: 'Categories' })), icon('chevron', 'ico sm dim'))))),

    h('section', { class: 'group' },
      h('h2', { class: 'label', id: 'theme-label', text: 'Theme' }),
      h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': 'theme-label' },
        ['dark', 'light'].map((t) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(theme === t),
          class: theme === t ? 'on' : '', text: t === 'dark' ? 'Dark' : 'Light',
          onclick: () => setTheme(t),
        })))),

    h('section', { class: 'group', id: 'shortcuts' },
      h('h2', { class: 'label', text: 'Shortcut links' }),
      shortcutsSection()),

    h('section', { class: 'group', id: 'storage' },
      h('h2', { class: 'label', text: 'Storage' }),
      storageSection()),

    h('section', { class: 'group', id: 'danger' },
      h('h2', { class: 'label', text: 'Danger zone' }),
      dangerSection()),
  );
}
