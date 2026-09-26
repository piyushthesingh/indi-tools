/* First run: welcome → payment methods → card details → optional budget. */

import { h, mount, icon } from './dom.js';
import { ACCOUNT_PRESETS, uniqueShortCode, nextColor } from '../lib/defaults.js';
import { parseAmount, formatINR, paiseToInput } from '../lib/money.js';
import { finishOnboarding, requestPersistence } from '../state.js';
import { pickRestoreFile } from './backup.js';

export function renderOnboarding(root, onDone) {
  const cashPreset = ACCOUNT_PRESETS.find((p) => p.key === 'cash');
  const picked = [{ ...cashPreset, presetKey: 'cash' }];
  let customCount = 0;
  let budgetText = '';
  let step = 1;

  const go = (n) => { step = n; render(); window.scrollTo(0, 0); };
  const pickedCards = () => picked.filter((p) => p.kind === 'credit_card');

  function render() {
    const body = [welcome, methods, cardDetails, budget][step - 1]();
    mount(root, h('main', { class: 'onb' },
      step > 1 && h('div', { class: 'onb-top' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back', onclick: () => go(step === 4 && !pickedCards().length ? 2 : step - 1) }, icon('back')),
        h('div', { class: 'dots', 'aria-label': `Step ${step} of 4` },
          [1, 2, 3, 4].map((i) => h('span', { class: i <= step ? 'on' : '' }))),
      ),
      body,
    ));
    root.querySelector('[data-autofocus]')?.focus();
  }

  function welcome() {
    return h('section', { class: 'onb-step onb-welcome' },
      h('img', { src: 'icons/icon-192.png', alt: '', width: 72, height: 72, class: 'onb-logo' }),
      h('h1', { text: 'Spend' }),
      h('p', { class: 'lead', text: 'See what you have spent this month, and what each card will bill, the moment you open it.' }),
      h('div', { class: 'note' },
        h('p', { class: 'strong', text: 'Your data stays on this phone. No account, no sync.' }),
        h('p', { text: 'That also means backups are up to you. Export one from Settings now and then, so a lost phone or cleared browser does not take your history with it.' }),
      ),
      h('p', { class: 'restore-link' }, 'Moving from another phone? ',
        h('button', { class: 'link-btn inline', type: 'button', text: 'Restore from a backup', onclick: pickRestoreFile })),
      h('div', { class: 'actions-bottom' },
        h('button', { class: 'btn primary block', type: 'button', text: 'Get started', onclick: () => go(2) })),
    );
  }

  function methods() {
    const isPicked = (key) => picked.some((p) => p.presetKey === key);
    const toggle = (preset) => {
      const i = picked.findIndex((p) => p.presetKey === preset.key);
      if (i >= 0) picked.splice(i, 1);
      else picked.push({ ...preset, presetKey: preset.key });
      render();
    };
    const chip = (preset) => h('button', {
      type: 'button', class: 'chip' + (isPicked(preset.key) ? ' on' : ''),
      'aria-pressed': String(isPicked(preset.key)), style: { '--c': preset.color },
      onclick: () => toggle(preset),
    }, h('span', { class: 'dot' }), preset.name);

    const customs = picked.filter((p) => p.presetKey.startsWith('custom'));
    const input = h('input', { id: 'custom-name', type: 'text', placeholder: 'Card name, e.g. OneCard', autocomplete: 'off', maxlength: 40 });
    const addCustom = (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      picked.push({ presetKey: 'custom' + ++customCount, name, kind: 'credit_card', color: null });
      render();
    };

    return h('section', { class: 'onb-step' },
      h('h1', { text: 'How do you pay?' }),
      h('p', { class: 'lead', text: 'Tap everything you use. You can add more later.' }),
      h('h2', { class: 'label', text: 'Credit cards' }),
      h('div', { class: 'chips wrap' },
        ACCOUNT_PRESETS.filter((p) => p.kind === 'credit_card').map(chip),
        customs.map((c) => h('button', {
          type: 'button', class: 'chip on', 'aria-pressed': 'true', 'aria-label': `Remove ${c.name}`,
          onclick: () => { picked.splice(picked.indexOf(c), 1); render(); },
        }, h('span', { class: 'dot' }), c.name, icon('close', 'ico sm'))),
      ),
      h('form', { class: 'inline-add', onsubmit: addCustom },
        h('label', { class: 'sr-only', for: 'custom-name', text: 'Custom card name' }),
        input,
        h('button', { class: 'btn', type: 'submit', text: 'Add card' }),
      ),
      h('h2', { class: 'label', text: 'Other ways you pay' }),
      h('div', { class: 'chips wrap' }, ACCOUNT_PRESETS.filter((p) => p.kind !== 'credit_card').map(chip)),
      h('div', { class: 'actions-bottom' },
        h('button', {
          class: 'btn primary block', type: 'button', text: 'Next', disabled: !picked.length,
          onclick: () => go(pickedCards().length ? 3 : 4),
        })),
    );
  }

  function cardDetails() {
    const errors = h('p', { class: 'error', role: 'alert' });
    const dayOptions = (sel) => [
      h('option', { value: '', text: 'Day', selected: !sel }),
      ...Array.from({ length: 31 }, (_, i) => h('option', { value: i + 1, text: i + 1, selected: sel === i + 1 })),
    ];

    const blocks = pickedCards().map((c, idx) => {
      const id = 'c' + idx;
      const field = (key, label, el, hint) => h('div', { class: 'field' },
        h('label', { for: id + key, text: label }), el, hint && h('p', { class: 'hint', text: hint }));
      const money = (key, placeholder) => h('input', {
        id: id + key, type: 'text', inputmode: 'decimal', placeholder, autocomplete: 'off',
        value: c[key] ? paiseToInput(c[key]) : '',
        onchange: (e) => { c[key] = parseAmount(e.target.value) || null; },
      });
      return h('fieldset', { class: 'card-setup', style: { '--c': c.color || 'var(--brand)' } },
        h('legend', {}, h('span', { class: 'dot' }), c.name),
        field('name', 'Name', h('input', {
          id: id + 'name', type: 'text', value: c.name, maxlength: 40,
          onchange: (e) => { c.name = e.target.value.trim() || c.name; },
        })),
        h('div', { class: 'row2' },
          field('statementDay', 'Statement day', h('select', {
            id: id + 'statementDay', onchange: (e) => { c.statementDay = +e.target.value || null; },
          }, dayOptions(c.statementDay))),
          field('dueDay', 'Due day', h('select', {
            id: id + 'dueDay', onchange: (e) => { c.dueDay = +e.target.value || null; },
          }, dayOptions(c.dueDay))),
        ),
        h('div', { class: 'row2' },
          field('limit', 'Credit limit', money('limit', 'Optional')),
          field('openingOutstanding', 'Owed right now', money('openingOutstanding', 'Optional')),
        ),
      );
    });

    const next = () => {
      const missing = pickedCards().filter((c) => !c.statementDay || !c.dueDay);
      if (missing.length) {
        errors.textContent = `Pick a statement day and due day for ${missing.map((c) => c.name).join(', ')}.`;
        return;
      }
      go(4);
    };

    return h('section', { class: 'onb-step' },
      h('h1', { text: 'Your cards' }),
      h('p', { class: 'lead', text: 'The statement day is the date each month your card bill is generated. It is printed on your last statement, next to the due date.' }),
      h('p', { class: 'hint', text: '"Owed right now" is the total you owe today, including anything already billed. It is fine to leave it blank.' }),
      blocks,
      errors,
      h('div', { class: 'actions-bottom' }, h('button', { class: 'btn primary block', type: 'button', text: 'Next', onclick: next })),
    );
  }

  function budget() {
    const preview = h('p', { class: 'hint' });
    const input = h('input', {
      id: 'budget', type: 'text', inputmode: 'decimal', placeholder: 'e.g. 40000', autocomplete: 'off', value: budgetText,
      'data-autofocus': true,
      oninput: (e) => {
        budgetText = e.target.value;
        const p = parseAmount(budgetText);
        preview.textContent = p ? `${formatINR(p)} a month` : '';
      },
    });
    const finish = async (withBudget) => {
      const limit = withBudget ? parseAmount(budgetText) : null;
      if (withBudget && !(limit > 0)) { preview.textContent = 'Enter an amount, or tap Skip.'; input.focus(); return; }
      const codes = [], colors = [];
      const accounts = picked.map((p) => {
        const color = p.color || nextColor([...colors, ...picked.map((x) => x.color).filter(Boolean)]);
        colors.push(color);
        const shortCode = uniqueShortCode(p.presetKey.startsWith('custom') ? p.name : p.key, codes);
        codes.push(shortCode);
        return {
          name: p.name, kind: p.kind, color, shortCode,
          statementDay: p.statementDay, dueDay: p.dueDay,
          limit: p.limit || null, openingOutstanding: p.openingOutstanding || 0,
        };
      });
      root.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      await finishOnboarding({ accounts, budgetLimit: limit });
      onDone();
      // some browsers show a permission prompt here; do not wait on it
      requestPersistence().catch(() => {});
    };
    return h('section', { class: 'onb-step' },
      h('h1', { text: 'Set a monthly budget?' }),
      h('p', { class: 'lead', text: 'Spend will show how much you can spend each day for the rest of the month. You can change it in Settings.' }),
      h('div', { class: 'field' },
        h('label', { for: 'budget', text: 'Monthly budget' }),
        h('div', { class: 'amount-input' }, h('span', { class: 'cur', text: '₹' }), input),
        preview),
      h('div', { class: 'actions-bottom two' },
        h('button', { class: 'btn', type: 'button', text: 'Skip', onclick: () => finish(false) }),
        h('button', { class: 'btn primary', type: 'button', text: 'Save budget', onclick: () => finish(true) })),
    );
  }

  render();
}
