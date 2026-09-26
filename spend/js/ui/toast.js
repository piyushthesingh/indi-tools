import { h } from './dom.js';

/* Short message at the bottom, above the nav, with optional action buttons
   (e.g. "Undo", "Add another"). Returns a function that dismisses it.
   Pass either { action, onAction } or { actions: [{ label, run }] }. */
export function toast(message, { action, onAction, actions = [], duration = 3000 } = {}) {
  if (action) actions = [{ label: action, run: onAction }, ...actions];
  const host = document.getElementById('toasts');
  host.querySelectorAll('.toast').forEach((t) => t.remove());
  let timer;
  const close = () => {
    clearTimeout(timer);
    el.classList.add('out');
    setTimeout(() => el.remove(), 200);
  };
  const el = h('div', { class: 'toast' },
    h('span', { class: 'toast-msg', text: message }),
    actions.map((a) => h('button', {
      class: 'toast-action', type: 'button', text: a.label,
      onclick: () => { close(); a.run?.(); },
    })),
  );
  host.append(el);
  timer = setTimeout(close, duration);
  // keep it up while a finger or pointer is on it, so Undo is reachable
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', () => { timer = setTimeout(close, 1500); });
  return close;
}
