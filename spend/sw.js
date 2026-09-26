/* Spend service worker, scoped to /spend/.

   Production: cache-first for the app shell. Each release gets its own
   cache, named from VERSION, so an update installs as one consistent set
   of files. The page shows "Update available" while a new version waits.

   Bump VERSION on every deploy. tests/sw.test.js fails if SHELL is missing
   a file, or lists one that does not exist.

   On localhost it goes to the network first (with the HTTP cache bypassed)
   and only falls back to the cache when offline, so edits always show and
   offline mode can still be tested. Open the app with ?sw=prod to get the
   production behaviour on localhost (and ?sw=dev to go back).

   Never cache or serve a redirected response: Safari refuses one for a page
   load ("Response served by service worker has redirections"). Cloudflare
   redirects /spend/index.html to /spend/, so the shell is cached as './'
   only, and every stored response is copied without its redirect flag. */

const VERSION = '2026-09-26.10';
const CACHE = 'spend-' + VERSION;

const SHELL = [
  './',
  'manifest.webmanifest',
  'css/app.css',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon.svg',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'js/app.js',
  'js/db.js',
  'js/state.js',
  'js/lib/accounts.js',
  'js/lib/backup.js',
  'js/lib/banners.js',
  'js/lib/budgets.js',
  'js/lib/cashback.js',
  'js/lib/categories.js',
  'js/lib/cycles.js',
  'js/lib/dates.js',
  'js/lib/deeplink.js',
  'js/lib/defaults.js',
  'js/lib/filters.js',
  'js/lib/insights.js',
  'js/lib/money.js',
  'js/lib/recurring.js',
  'js/lib/suggest.js',
  'js/lib/totals.js',
  'js/lib/transactions.js',
  'js/ui/activity.js',
  'js/ui/backup.js',
  'js/ui/budget.js',
  'js/ui/cardtext.js',
  'js/ui/detail.js',
  'js/ui/dom.js',
  'js/ui/editors.js',
  'js/ui/home.js',
  'js/ui/insights.js',
  'js/ui/manage.js',
  'js/ui/onboarding.js',
  'js/ui/quickadd.js',
  'js/ui/recurring.js',
  'js/ui/settings.js',
  'js/ui/sheet.js',
  'js/ui/sortable.js',
  'js/ui/toast.js',
];

// registered as sw.js?mode=prod when testing the real behaviour on localhost
const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(self.location.hostname) && !self.location.search.includes('mode=prod');

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // on localhost files are always fresh, so a new version just takes over;
    // a release replacing a broken one (redirected shell) also takes over at
    // once, because the broken one cannot even open the page to offer it
    if (DEV || await hasBrokenShell()) self.skipWaiting();
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (url) => {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      await cache.put(url, await clean(res));
    }));
  })());
});

/* A copy of the response without the "redirected" flag. */
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function hasBrokenShell() {
  for (const key of await caches.keys()) {
    if (!key.startsWith('spend-') || key === CACHE) continue;
    const c = await caches.open(key);
    for (const u of ['index.html', './']) {
      const hit = await c.match(u);
      if (hit?.redirected) return true;
    }
  }
  return false;
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('spend-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL('./', self.location).pathname)) return;

  // any navigation inside the scope is the app shell; deep-link queries
  // like ?amt=250 are read by the page, so they must not miss the cache
  const isNav = req.mode === 'navigate';
  const key = isNav ? './' : req;

  event.respondWith(DEV ? networkFirst(req, key) : cacheFirst(req, key));
});

async function cacheFirst(req, key) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key, { ignoreSearch: typeof key === 'string' });
  if (hit) return clean(hit);
  return fetch(req);
}

async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok) cache.put(key, await clean(res.clone()));
    return res;
  } catch (err) {
    const hit = await cache.match(key, { ignoreSearch: typeof key === 'string' });
    if (hit) return clean(hit);
    throw err;
  }
}
