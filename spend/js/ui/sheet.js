/* Bottom sheet. Sits above the on-screen keyboard on iPhone by tracking the
   visual viewport, closes on Escape or a tap on the scrim, and gives focus
   back to whatever opened it. */

import { h, icon } from './dom.js';

let openCount = 0;

export function openSheet({ title, body, footer, onClose, labelId = 'sheet-title-' + Date.now() }) {
  const opener = document.activeElement;
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': labelId },
    h('div', { class: 'sheet-head' },
      h('h2', { class: 'sheet-title', id: labelId }, title),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => close() }, icon('close'))),
    h('div', { class: 'sheet-body' }, body),
    footer && h('div', { class: 'sheet-foot' }, footer),
  );
  const wrap = h('div', { class: 'sheet-wrap' },
    h('div', { class: 'scrim', onclick: () => close() }),
    panel);

  const vv = window.visualViewport;
  const fit = () => {
    if (!vv) return;
    // height of whatever covers the bottom of the layout viewport (the keyboard)
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    wrap.style.setProperty('--kb', kb + 'px');
    wrap.style.setProperty('--vvh', vv.height + 'px');
    wrap.classList.toggle('kb-open', kb > 0);
  };
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);
  fit();

  const onKey = (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    // keep keyboard focus inside the sheet while it is open
    const items = [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items.at(-1);
    if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);

  document.body.append(wrap);
  document.body.classList.add('sheet-open');
  openCount++;

  let closed = false;
  function close({ restoreFocus = true } = {}) {
    if (closed) return;
    closed = true;
    vv?.removeEventListener('resize', fit);
    vv?.removeEventListener('scroll', fit);
    document.removeEventListener('keydown', onKey);
    wrap.classList.add('closing');
    setTimeout(() => wrap.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
    if (--openCount === 0) document.body.classList.remove('sheet-open');
    if (restoreFocus && opener?.focus && document.contains(opener)) opener.focus({ preventScroll: true });
    onClose?.();
  }

  return { el: panel, close };
}
