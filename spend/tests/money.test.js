import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPaise, formatINR, formatCompact, parseAmount, paiseToRupeesString, paiseToInput, isExpression } from '../js/lib/money.js';

test('toPaise rounds to whole paise', () => {
  assert.equal(toPaise(1), 100);
  assert.equal(toPaise(0.1 + 0.2), 30);
  assert.equal(toPaise(1.005), 101);
  assert.equal(toPaise(19.99), 1999);
  assert.equal(toPaise(-2.5), -250);
  assert.equal(toPaise('abc'), null);
});

test('formatINR uses lakh grouping and hides .00', () => {
  assert.equal(formatINR(0), '₹0');
  assert.equal(formatINR(42000), '₹420');
  assert.equal(formatINR(12345600), '₹1,23,456');
  assert.equal(formatINR(12345650), '₹1,23,456.50');
  assert.equal(formatINR(1000000000), '₹1,00,00,000');
  assert.equal(formatINR(5), '₹0.05');
  assert.equal(formatINR(-42000), '−₹420');
  assert.equal(formatINR(42000, { signed: true }), '+₹420');
});

test('formatCompact', () => {
  assert.equal(formatCompact(95000), '₹950');
  assert.equal(formatCompact(920000), '₹9.2k');
  assert.equal(formatCompact(1000000), '₹10k');
  assert.equal(formatCompact(12000000), '₹1.2L');
  assert.equal(formatCompact(340000000), '₹34L');
  assert.equal(formatCompact(3400000000), '₹3.4Cr');
});

test('paiseToRupeesString and paiseToInput', () => {
  assert.equal(paiseToRupeesString(123450), '1234.50');
  assert.equal(paiseToRupeesString(5), '0.05');
  assert.equal(paiseToRupeesString(-105), '-1.05');
  assert.equal(paiseToInput(42000), '420');
  assert.equal(paiseToInput(42050), '420.50');
});

test('parseAmount handles plain numbers, commas and ₹', () => {
  assert.equal(parseAmount('250'), 25000);
  assert.equal(parseAmount('₹1,250.5'), 125050);
  assert.equal(parseAmount(' 99.99 '), 9999);
  assert.equal(parseAmount('.5'), 50);
  assert.equal(parseAmount('5.'), 500);
});

test('parseAmount does simple maths', () => {
  assert.equal(parseAmount('120+80'), 20000);
  assert.equal(parseAmount('1000-250'), 75000);
  assert.equal(parseAmount('3*40'), 12000);
  assert.equal(parseAmount('100/3'), 3333);
  assert.equal(parseAmount('2+3*4'), 1400);
  assert.equal(parseAmount('(2+3)*4'), 2000);
  assert.equal(parseAmount('120+'), 12000, 'trailing operator while typing');
  assert.equal(parseAmount('10×3'), 3000);
});

test('parseAmount rejects junk', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('1..2'), null);
  assert.equal(parseAmount('5/0'), null);
  assert.equal(parseAmount('(1+2'), null);
  assert.equal(parseAmount('alert(1)'), null);
});

test('isExpression', () => {
  assert.equal(isExpression('120+80'), true);
  assert.equal(isExpression('120'), false);
  assert.equal(isExpression('-120'), false);
});

test('QA regression: comma as decimal separator, without breaking Indian grouping', () => {
  assert.equal(parseAmount('12,5'), 1250);
  assert.equal(parseAmount('12,50'), 1250);
  assert.equal(parseAmount('₹ 99,9'), 9990);
  assert.equal(parseAmount('1,250'), 125000, 'three digits after the comma is grouping');
  assert.equal(parseAmount('1,25,000'), 12500000);
  assert.equal(parseAmount('1,250.75'), 125075);
});
