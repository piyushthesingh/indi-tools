/* Category records: building, validating and emoji handling. */

import { uuid } from './defaults.js';

/* First user-perceived character, so "👨‍👩‍👧 family" keeps the whole family
   emoji and not just its first code point. */
export function firstGrapheme(s) {
  const str = String(s ?? '').trim();
  if (!str) return '';
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(str)[Symbol.iterator]().next();
    return seg.value?.segment ?? '';
  }
  return Array.from(str)[0];
}

export function validateCategory(c, others = []) {
  const name = String(c.name || '').trim();
  if (!name) return 'Give it a name.';
  if (name.length > 40) return 'Keep the name under 40 characters.';
  if (!c.icon) return 'Pick an emoji.';
  if (c.type !== 'expense' && c.type !== 'income') return 'Pick expense or income.';
  const clash = others.find((o) => o.id !== c.id && o.type === c.type && o.name.trim().toLowerCase() === name.toLowerCase());
  if (clash) return `There is already a category called ${clash.name}${clash.archived ? ' (archived)' : ''}.`;
  return null;
}

export function makeCategory(fields, existing = null) {
  const c = {
    id: existing?.id ?? uuid(),
    name: String(fields.name ?? '').trim(),
    icon: firstGrapheme(fields.icon),
    color: fields.color ?? existing?.color ?? '#7C8B84',
    type: fields.type ?? existing?.type ?? 'expense',
    order: fields.order ?? existing?.order ?? 0,
    archived: fields.archived ?? existing?.archived ?? false,
  };
  return c;
}

export function categoryUsage(categoryId, txns) {
  let n = 0;
  for (const t of txns) if (t.categoryId === categoryId) n++;
  return n;
}

/* A few to tap instead of hunting through the emoji keyboard. */
export const EMOJI_SUGGESTIONS = [
  '🍽️', '🍔', '☕', '🍺', '🛒', '🥦', '🚕', '🚇', '⛽', '🚗', '🛵', '✈️',
  '🏨', '🛍️', '👕', '👟', '💄', '💇', '💊', '🏥', '🏋️', '🧘', '🎬', '🎮',
  '🎵', '📺', '📱', '💻', '🔁', '💡', '💧', '🔥', '📶', '🏠', '🧹', '🛠️',
  '📚', '🎓', '🧸', '🐶', '🎁', '💐', '🙏', '🏦', '💳', '🧾', '💼', '📈',
  '💰', '🪙', '🎉', '🌴', '⚽', '🚬', '🍷', '📦',
];
