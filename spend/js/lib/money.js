/* Money is always integer paise. Floats appear only while parsing what the
   user typed, and are rounded to paise straight away. */

const fmtWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0,
});
const fmtPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function isPaise(n) {
  return Number.isInteger(n);
}

/* Rupees (number) to paise, rounding half away from zero. */
export function toPaise(rupees) {
  const n = Number(rupees);
  if (!Number.isFinite(n)) return null;
  const sign = n < 0 ? -1 : 1;
  // toFixed first so 1.005 style float noise rounds the way a person expects
  return sign * Math.round(Number((Math.abs(n) * 100).toFixed(4)));
}

/* ₹1,23,456 or ₹1,23,456.50. Whole amounts hide .00. */
export function formatINR(paise, { signed = false } = {}) {
  if (!Number.isFinite(paise)) return '';
  const abs = Math.abs(paise);
  const body = abs % 100 === 0 ? fmtWhole.format(abs / 100) : fmtPaise.format(abs / 100);
  if (paise < 0) return '−' + body;
  if (signed && paise > 0) return '+' + body;
  return body;
}

/* Short form for tight spaces: ₹950, ₹9.2k, ₹1.2L, ₹3.4Cr. */
export function formatCompact(paise) {
  if (!Number.isFinite(paise)) return '';
  const sign = paise < 0 ? '−' : '';
  const r = Math.abs(paise) / 100;
  const trim = (x) => {
    const s = x >= 100 ? String(Math.round(x)) : x.toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  };
  if (r < 1000) return sign + formatINR(Math.abs(Math.round(paise / 100) * 100));
  if (r < 100000) return sign + '₹' + trim(r / 1000) + 'k';
  if (r < 10000000) return sign + '₹' + trim(r / 100000) + 'L';
  return sign + '₹' + trim(r / 10000000) + 'Cr';
}

/* "1234.50" for CSV and form fields. */
export function paiseToRupeesString(paise) {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return sign + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
}

/* Plain value for an amount input: whole rupees drop the decimals. */
export function paiseToInput(paise) {
  if (!Number.isFinite(paise)) return '';
  return paise % 100 === 0 ? String(paise / 100) : paiseToRupeesString(paise);
}

/* Parse what the user typed into paise. Accepts commas, a leading ₹ and
   simple maths: + - * / and brackets, e.g. "120+80" or "1,200 / 3".
   Returns null for anything that is not a valid expression. */
export function parseAmount(input) {
  if (input == null) return null;
  let raw = String(input);
  // a keypad in some regions types "12,5" for 12.5; Indian grouping always
  // has 3 digits after its last comma, so 1–2 digits at the end is a decimal
  if (!raw.includes('.') && /^\s*[₹]?\s*\d+,\d{1,2}\s*$/.test(raw)) raw = raw.replace(',', '.');
  let s = raw.replace(/[₹,\s]/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  if (!s) return null;
  // a trailing operator while typing ("120+") is ignored rather than an error
  s = s.replace(/[+\-*/]+$/, '');
  if (!/^[0-9.+\-*/()]+$/.test(s)) return null;

  let i = 0;
  const peek = () => s[i];
  function number() {
    const m = /^\d+\.?\d*|^\.\d+/.exec(s.slice(i));
    if (!m) throw new Error('num');
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function factor() {
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') throw new Error('paren');
      i++;
      return v;
    }
    return number();
  }
  function term() {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const r = factor();
      if (op === '/' && r === 0) throw new Error('div0');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  try {
    const v = expr();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return toPaise(v);
  } catch {
    return null;
  }
}

/* True when the text contains an operator, so the UI can show "= ₹200". */
export function isExpression(input) {
  return /\d\s*[+\-*/×÷]\s*[\d(]/.test(String(input || ''));
}
