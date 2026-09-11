/* ─────────────────────────────────────────────────────────────
   indi.tools: image worker
   Decoding, resizing and encoding run off the main thread so the
   page stays responsive while a batch is processing.
   ───────────────────────────────────────────────────────────── */

let heifReady = null;

/* The caller wants a determinate progress bar, and this pipeline has real
   stages to report: decode, then each step of the quality search, then the
   final encode. Nothing here is interpolated to look busy. */
function reporter(id) {
  let last = -1;
  return p => {
    p = Math.max(0, Math.min(1, p));
    // one message per whole percent is plenty; the rest is just chatter
    if (p - last < 0.01 && p < 1) return;
    last = p;
    self.postMessage({ id, progress: p });
  };
}

/* libheif is ~1.2 MB, so it is only fetched the first time someone
   actually drops a HEIC/HEIF file. */
function loadHeif() {
  if (heifReady) return heifReady;
  heifReady = new Promise((resolve, reject) => {
    try {
      importScripts('/assets/vendor/libheif-bundle.js');
      const factory = self.libheif;
      if (!factory) return reject(new Error('libheif failed to load'));
      resolve(typeof factory === 'function' ? factory() : factory);
    } catch (e) { reject(e); }
  });
  return heifReady;
}

function isHeic(file) {
  const n = (file.name || '').toLowerCase();
  return /image\/hei[cf]/.test(file.type || '') || /\.(heic|heif|hif)$/.test(n);
}

/* ── decode ─────────────────────────────────────────────────── */
async function decode(file) {
  if (isHeic(file)) {
    const heif = await loadHeif();
    const buf = await file.arrayBuffer();
    const dec = new heif.HeifDecoder();
    const imgs = dec.decode(buf);
    if (!imgs || !imgs.length) throw new Error('No image found in HEIC file');
    const img = imgs[0];
    const w = img.get_width(), h = img.get_height();
    const out = new ImageData(w, h);
    await new Promise((res, rej) => img.display(out, d => d ? res(d) : rej(new Error('HEIC decode failed'))));
    return { bitmap: await createImageBitmap(out), w, h };
  }
  // Native path. from-image applies the EXIF rotation so phone photos
  // are not delivered sideways.
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return { bitmap: bmp, w: bmp.width, h: bmp.height };
}

/* ── draw at a given scale ──────────────────────────────────── */
function drawScaled(bitmap, scale, bg) {
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const cv = new OffscreenCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }  // flatten alpha for JPEG
  ctx.drawImage(bitmap, 0, 0, w, h);
  return cv;
}

async function encode(canvas, type, quality) {
  const opts = { type };
  if (type !== 'image/png') opts.quality = quality;
  return canvas.convertToBlob(opts);
}

/* ── find the largest quality that still fits the target ────── */
async function searchQuality(bitmap, scale, type, targetBytes, bg, report, from, to) {
  const cv = drawScaled(bitmap, scale, bg);
  let lo = 0.05, hi = 0.96, best = null;
  // 9 iterations narrows quality to ~0.002, well past what is visible
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2;
    const blob = await encode(cv, type, mid);
    if (blob.size <= targetBytes) { best = { blob, quality: mid }; lo = mid; }
    else { hi = mid; }
    if (report) report(from + (to - from) * ((i + 1) / 9));
  }
  if (!best) {
    const floor = await encode(cv, type, 0.05);
    return { blob: floor, quality: 0.05, hitFloor: true };
  }
  return best;
}

/* ── main pipeline ─────────────────────────────────────────── */
async function process(job, report) {
  const { file, type, mode, targetBytes, percent, quality, maxW, maxH, bg } = job;
  /* Two kinds of source. A File, which needs decoding, or an already
     decoded ImageBitmap, which is how rendered PDF pages arrive. */
  const bitmap = job.bitmap || (await decode(file)).bitmap;
  const sourceSize = job.sourceSize || (file ? file.size : 0);
  // decoding is the slow part for a large HEIC or a 50 MP JPEG
  report(0.25);

  // fit within any requested dimension cap
  let scale = 1;
  if (maxW && bitmap.width  > maxW) scale = Math.min(scale, maxW / bitmap.width);
  if (maxH && bitmap.height > maxH) scale = Math.min(scale, maxH / bitmap.height);

  const flatten = (type === 'image/jpeg') ? (bg || '#FFFFFF') : null;

  // ── fixed quality ──
  if (mode === 'quality') {
    const blob = await encode(drawScaled(bitmap, scale, flatten), type, quality);
    report(1);
    return done(blob, bitmap, scale, quality, false);
  }

  // ── size target (absolute KB, or a percentage of the original) ──
  const target = mode === 'percent'
    ? Math.max(1024, Math.round(sourceSize * (percent / 100)))
    : targetBytes;

  // PNG ignores the quality argument entirely: it is lossless: so the
  // only lever is dimensions. Shrink until it fits, then report honestly.
  if (type === 'image/png') {
    let s = scale, blob = await encode(drawScaled(bitmap, s, null), type, 1);
    let guard = 0;
    report(0.4);
    while (blob.size > target && s > 0.06 && guard++ < 24) {
      s *= 0.85;
      blob = await encode(drawScaled(bitmap, s, null), type, 1);
      report(0.4 + 0.6 * (guard / 24));
    }
    report(1);
    return done(blob, bitmap, s, null, blob.size > target, blob.size > target
      ? 'PNG is lossless, so size can only be reduced by shrinking. This is as small as it goes without going below 6% scale.'
      : (s < scale ? 'PNG has no quality setting, so it was resized to reach the target.' : ''));
  }

  // Lossy: search quality first, then shrink if quality alone cannot get there.
  let s = scale, res = await searchQuality(bitmap, s, type, target, flatten, report, 0.25, 0.9), guard = 0;
  while (res.hitFloor && res.blob.size > target && s > 0.06 && guard++ < 14) {
    s *= 0.85;
    res = await searchQuality(bitmap, s, type, target, flatten, report, 0.9, 0.98);
  }
  report(1);
  return done(res.blob, bitmap, s, res.quality, res.blob.size > target,
    res.blob.size > target ? 'Could not reach the target without dropping below 6% of the original dimensions.' : '');

  function done(blob, bmp, sc, q, missed, note) {
    return {
      blob,
      width:  Math.round(bmp.width  * sc),
      height: Math.round(bmp.height * sc),
      origWidth: bmp.width, origHeight: bmp.height,
      quality: q, missedTarget: !!missed, note: note || ''
    };
  }
}

self.onmessage = async (e) => {
  const { id, job } = e.data;
  try {
    const r = await process(job, reporter(id));
    if (job.wantBytes) {
      // The PDF writer needs the raw bytes, not a Blob it would have to
      // re-read on the main thread.
      r.bytes = new Uint8Array(await r.blob.arrayBuffer());
      self.postMessage({ id, ok: true, ...r }, [r.bytes.buffer]);
    } else {
      self.postMessage({ id, ok: true, ...r });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: err && err.message ? err.message : String(err) });
  } finally {
    if (job.bitmap && job.bitmap.close) job.bitmap.close();
  }
};
