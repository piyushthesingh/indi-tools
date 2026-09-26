import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [relative(root, p)];
  });
}

test('SHELL lists exactly the files the app needs offline', () => {
  const block = /const SHELL = \[([\s\S]*?)\];/.exec(sw)[1];
  const listed = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((f) => f !== './');
  const onDisk = [
    'index.html', 'manifest.webmanifest',
    ...walk(join(root, 'css')), ...walk(join(root, 'js')), ...walk(join(root, 'icons')),
  ].filter((f) => !f.endsWith('.DS_Store')).map((f) => f.split('\\').join('/'));

  const missing = onDisk.filter((f) => !listed.includes(f));
  const extra = listed.filter((f) => !onDisk.includes(f));
  assert.deepEqual(missing, [], 'add these to SHELL in sw.js');
  assert.deepEqual(extra, [], 'these are in SHELL but not on disk');
});

test('VERSION is set', () => {
  assert.match(sw, /const VERSION = '[^']+';/);
});
