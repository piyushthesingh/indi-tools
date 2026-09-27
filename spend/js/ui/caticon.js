/* Category glyphs. The built-in categories draw as line icons; a category
   the user has given their own emoji (or made themselves) keeps the emoji.
   The line icon is used only while the stored emoji is still the default,
   so nothing is lost and a user's choice always wins. */

import { DEFAULT_CATEGORIES } from '../lib/defaults.js';

const DEFAULT_EMOJI = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.icon]));

/* 24 × 24, stroked with currentColor. Static strings, never user data. */
const LINE = {
  'cat-food': '<path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10"/><path d="M17.5 21V3c-2.2 1.2-3.5 3.8-3.5 7v3h3.5"/>',
  'cat-groceries': '<path d="M3.5 5h2l2 10.5h10l2-7.5H7"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="16.5" cy="19.5" r="1.3"/>',
  'cat-transport': '<path d="M5 16.5V11l2-5h10l2 5v5.5"/><path d="M3.5 16.5h17"/><path d="M5 11h14"/><circle cx="8" cy="14" r=".6"/><circle cx="16" cy="14" r=".6"/><path d="M6.5 16.5V19M17.5 16.5V19"/>',
  'cat-fuel': '<path d="M4.5 21V5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 14.5 5v16"/><path d="M3 21h13"/><path d="M7 7.5h5v3.5H7z"/><path d="M14.5 10.5h2a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 0 3 0V8.5L18 5.5"/>',
  'cat-shopping': '<path d="M5 8h14l-1 12.5H6z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>',
  'cat-apparel': '<path d="M9 3.5 4 6l-1.5 4.5 3 1V20.5h13V11.5l3-1L20 6l-5-2.5a3 3 0 0 1-6 0z"/>',
  'cat-bills': '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
  'cat-rent': '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11.5h13V9"/><path d="M10 20.5v-6h4v6"/>',
  'cat-health': '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m9.5 9.5 5 5"/>',
  'cat-entertainment': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/>',
  'cat-subscriptions': '<path d="M4 11a8 8 0 0 1 14-5l2 2"/><path d="M20 3.5V8h-4.5"/><path d="M20 13a8 8 0 0 1-14 5l-2-2"/><path d="M4 20.5V16h4.5"/>',
  'cat-travel': '<path d="M10.5 13.5 4 11l1.2-1.2 7 .8 4.3-4.3a2 2 0 0 1 2.8 2.8l-4.3 4.3.8 7-1.2 1.2-2.5-6.5-3.3 3.3.3 2.6-1 1-1.6-3-3-1.6 1-1 2.6.3z"/>',
  'cat-education': '<path d="M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1v13c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6.5v13"/>',
  'cat-personal': '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="M8.5 8.5 20 18M8.5 15.5 20 6"/>',
  'cat-gifts': '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8.5h14V12M12 8v12.5"/><path d="M12 8C10 4 6.5 4.5 7 6.5 7.3 8 10 8 12 8zM12 8c2-4 5.5-3.5 5-1.5C16.7 8 14 8 12 8z"/>',
  'cat-emi': '<path d="M3 9 12 4l9 5"/><path d="M4 9h16M5.5 9v8M10 9v8M14 9v8M18.5 9v8M3 20h18M4 17h16"/>',
  'cat-other': '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  'cat-salary': '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>',
  'cat-freelance': '<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 19h19"/>',
  'cat-interest': '<path d="M3.5 17 9 11.5l4 4 7.5-8"/><path d="M15 7.5h5.5V13"/>',
  'cat-other-income': '<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  transfer: '<path d="M4 8h14.5M15 4.5 18.5 8 15 11.5"/><path d="M20 16H5.5M9 12.5 5.5 16 9 19.5"/>',
  invest: '<path d="M6 18 18 6M9 6h9v9"/>',
};

function svg(paths) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/* Line icon for a category still on its default emoji, else null. */
export function lineFor(category) {
  if (!category) return null;
  const def = DEFAULT_EMOJI.get(category.id);
  return def && category.icon === def && LINE[category.id] ? LINE[category.id] : null;
}

/* Fill `el` with the category's glyph: its line icon, or its emoji. */
export function fillGlyph(el, category, fallback = '•') {
  const line = lineFor(category);
  if (line) { el.innerHTML = svg(line); el.classList.add('line'); }
  else { el.textContent = category?.icon || fallback; el.classList.remove('line'); }
  return el;
}

/* A span with the glyph for a category, or for 'transfer' / 'invest'. */
export function glyph(category, cls = 'glyph') {
  const el = document.createElement('span');
  el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  if (category === 'transfer' || category === 'invest') { el.innerHTML = svg(LINE[category]); el.classList.add('line'); return el; }
  return fillGlyph(el, category);
}
