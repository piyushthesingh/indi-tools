/* A small promise wrapper over IndexedDB.

   The IndexedDB version number is the schema version. Each entry in
   UPGRADES moves the database from version v-1 to v, so a phone that
   skipped releases runs every step it missed, in order. */

import { SCHEMA_VERSION, DEFAULT_CATEGORIES } from './lib/defaults.js';

const DB_NAME = 'indi-spend';
export const STORES = ['accounts', 'categories', 'transactions', 'recurring', 'budgets', 'settings'];

const UPGRADES = {
  1(db, tx) {
    db.createObjectStore('accounts', { keyPath: 'id' });
    db.createObjectStore('categories', { keyPath: 'id' });
    const t = db.createObjectStore('transactions', { keyPath: 'id' });
    for (const idx of ['date', 'accountId', 'toAccountId', 'categoryId', 'type']) t.createIndex(idx, idx);
    db.createObjectStore('recurring', { keyPath: 'id' });
    db.createObjectStore('budgets', { keyPath: 'id' });
    db.createObjectStore('settings', { keyPath: 'key' });
    const cats = tx.objectStore('categories');
    for (const c of DEFAULT_CATEGORIES) cats.put(c);
  },
};

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      for (let v = e.oldVersion + 1; v <= SCHEMA_VERSION; v++) UPGRADES[v](db, req.transaction);
    };
    req.onsuccess = () => {
      const db = req.result;
      // another tab opened a newer version: let it upgrade, then reload into it
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Spend is open in another tab on an older version. Close it and reload.'));
  });
  return dbPromise;
}

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function getAll(name) {
  return done((await store(name)).getAll());
}

export async function get(name, key) {
  return done((await store(name)).get(key));
}

export async function count(name) {
  return done((await store(name)).count());
}

export async function put(name, value) {
  return write([name], (s) => s[name].put(value));
}

export async function remove(name, key) {
  return write([name], (s) => s[name].delete(key));
}

/* Runs fn with { storeName: objectStore } inside one readwrite
   transaction and resolves when it commits, so multi-record changes are
   all-or-nothing. */
export async function write(names, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    const stores = Object.fromEntries(names.map((n) => [n, tx.objectStore(n)]));
    let result;
    try {
      result = fn(stores);
    } catch (err) {
      tx.abort();
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

/* settings are stored as { key, value } rows */
export async function getSettings() {
  const rows = await getAll('settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(key, value) {
  return put('settings', { key, value });
}

export async function setSettings(obj) {
  return write(['settings'], (s) => {
    for (const [key, value] of Object.entries(obj)) s.settings.put({ key, value });
  });
}

/* Everything, for backups and first load. */
export async function readAll() {
  const out = {};
  for (const name of STORES) out[name] = await getAll(name);
  return out;
}

/* Restore: every store emptied and refilled in one transaction, so a
   failure part-way leaves the old data untouched. `data.settings` is a
   plain object. */
export async function replaceAll(data) {
  return write(STORES, (s) => {
    for (const name of STORES) s[name].clear();
    for (const name of STORES) {
      if (name === 'settings') {
        for (const [key, value] of Object.entries(data.settings || {})) s.settings.put({ key, value });
      } else {
        for (const row of data[name] || []) s[name].put(row);
      }
    }
  });
}

/* Delete all data: back to a fresh install (default categories only). */
export async function deleteAll() {
  return write(STORES, (s) => {
    for (const name of STORES) s[name].clear();
    for (const c of DEFAULT_CATEGORIES) s.categories.put(c);
  });
}
