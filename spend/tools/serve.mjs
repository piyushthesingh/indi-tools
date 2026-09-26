/* Local dev server for the whole indi.tools folder, so Spend opens at
   http://localhost:8787/spend/ just as it will at indi.tools/spend/.
   Every response is Cache-Control: no-store, so neither the browser's HTTP
   cache nor the service worker (network-first on localhost) can serve an
   old file.

   node spend/tools/serve.mjs [port]   (run from the repo root) */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = +(process.argv[2] || process.env.PORT || 8787);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.md': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  path = normalize(path).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  try {
    let s = await stat(file);
    if (s.isDirectory()) {
      if (!path.endsWith('/')) { res.writeHead(301, { Location: path + '/' }); return res.end(); }
      file = join(file, 'index.html');
      s = await stat(file);
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end('Not found');
  }
}).listen(port, () => console.log(`Serving ${root}\nSpend: http://localhost:${port}/spend/`));
