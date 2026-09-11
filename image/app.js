/* ─────────────────────────────────────────────────────────────
   indi.tools: Image & PDF Converter & Compressor
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const items = [];
  let seq = 0;
  let combined = null;              // one output built from several inputs
  /* The output choice follows whatever was dropped, until the user makes
     it themselves. After that it is theirs and nothing reassigns it. */
  const picked = { fmt: false, op: false };
  const DEFAULT_FMT = 'image/jpeg';
  const DEFAULT_OP = 'compress';

  const els = {
    drop: $('#drop'), picker: $('#picker'), list: $('#items'), empty: $('#empty'),
    summary: $('#summary'), zip: $('#btn-zip'), clear: $('#btn-clear'), merge: $('#btn-merge'),
    fmt: $('#fmt'), mode: $('#mode'), target: $('#target'), unit: $('#unit'),
    pct: $('#pct'), pctVal: $('#pct-val'), q: $('#q'), qVal: $('#q-val'),
    maxw: $('#maxw'), maxh: $('#maxh'), bg: $('#bg'), bghex: $('#bghex'),
    bgCard: $('#bg-card'), pngWarn: $('#png-warn'), fmtHint: $('#fmt-hint'),
    live: $('#live'),
    /* PDF */
    pdfop: $('#pdfop'), pdfopHint: $('#pdfop-hint'),
    dpi: $('#dpi'), dpiVal: $('#dpi-val'), range: $('#range'), rangeMax: $('#range-max'),
    gray: $('#gray'), grayWrap: $('#gray-wrap'),
    ptool: $('#ptool'), trange: $('#trange'), trangeMax: $('#trange-max'),
    rot: $('#rot'), rotWrap: $('#rot-wrap'), ptoolHint: $('#ptool-hint'),
    psize: $('#psize'), porient: $('#porient'), porientWrap: $('#porient-wrap'),
    pmargin: $('#pmargin'), pmarginVal: $('#pmargin-val'), pmarginWrap: $('#pmargin-wrap'),
    pcombine: $('#pcombine'), pdfHint: $('#pdf-hint'),
    /* cards */
    cFmt: $('#card-fmt'), cPageset: $('#card-pageset'), cPdfop: $('#card-pdfop'),
    cRender: $('#card-render'), cPagetools: $('#card-pagetools'),
    cComp: $('#card-comp'), cResize: $('#card-resize'),
    fmtOf: $('#fmt-of'), pdfOf: $('#pdf-of'),
    /* combined */
    combined: $('#combined'), cTitle: $('#c-title'), cMeta: $('#c-meta'), cDl: $('#c-dl')
  };

  /* ── helpers ───────────────────────────────────────────────── */
  const fmtBytes = b => b < 1024 ? b + ' B'
    : b < 1048576 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB'
    : (b / 1048576).toFixed(2) + ' MB';
  const extFor = t => ({
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/avif': 'avif', 'application/pdf': 'pdf', 'text/plain': 'txt'
  }[t] || 'img');
  const baseName = n => n.replace(/\.[^.]+$/, '');
  const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
  const pad = (n, w) => String(n).padStart(w, '0');

  /* Run at most `limit` of these at once. Rendering a PDF page holds a
     full-size bitmap, so an unbounded map over a 200 page document is a
     reliable way to run out of memory. */
  async function mapLimit(arr, limit, fn) {
    const out = new Array(arr.length);
    let i = 0;
    const workers = new Array(Math.min(limit, arr.length)).fill(0).map(async () => {
      while (true) {
        const k = i++;
        if (k >= arr.length) return;
        out[k] = await fn(arr[k], k);
      }
    });
    await Promise.all(workers);
    return out;
  }

  /* A small pool, so a batch is not processed strictly one at a time.
     Capped at 4: each worker holds a full-size canvas, and more threads
     than cores just adds memory pressure. */
  const POOL_SIZE = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const RENDER_LIMIT = Math.max(1, Math.min(3, POOL_SIZE));
  const MAX_RENDER_PAGES = 300;
  const pending = new Map();
  const pool = [];
  let nextWorker = 0;

  function getWorker() {
    if (pool.length < POOL_SIZE) {
      const w = new Worker('/assets/img-worker.js');
      w.onmessage = e => {
        const h = pending.get(e.data.id);
        if (h) { pending.delete(e.data.id); h(e.data); }
      };
      w.onerror = err => {
        // fail every job on this worker rather than hanging forever
        pending.forEach((h, id) => { h({ id, ok: false, error: err.message || 'Worker crashed' }); pending.delete(id); });
      };
      pool.push(w);
      return w;
    }
    const w = pool[nextWorker % pool.length];
    nextWorker++;
    return w;
  }

  function run(job, transfer) {
    return new Promise(resolve => {
      const id = ++seq;
      pending.set(id, resolve);
      getWorker().postMessage({ id, job }, transfer || []);
    });
  }

  /* ── settings ──────────────────────────────────────────────── */
  function segValue(group) {
    const b = group.querySelector('[aria-pressed="true"]');
    return b ? b.dataset.v : null;
  }
  function settings() {
    return {
      type: segValue(els.fmt),
      op: segValue(els.pdfop),
      mode: segValue(els.mode),
      targetBytes: Math.max(1024, Math.round((+els.target.value || 100) * (+els.unit.value))),
      percent: +els.pct.value,
      quality: (+els.q.value) / 100,
      maxW: +els.maxw.value || 0,
      maxH: +els.maxh.value || 0,
      bg: els.bg.value,
      dpi: +els.dpi.value || 150,
      range: els.range.value,
      gray: els.gray.checked,
      ptool: els.ptool.value,
      trange: els.trange.value,
      rot: +els.rot.value || 90,
      psize: els.psize.value,
      porient: els.porient.value,
      marginPt: (+els.pmargin.value || 0) * 72 / 25.4,   // mm to points
      combine: els.pcombine.checked
    };
  }

  const FMT_HINTS = {
    'image/jpeg': 'Widest compatibility. No transparency, so it is filled with the colour below.',
    'image/png': 'Lossless, keeps transparency, and produces much larger files for photographs.',
    'image/avif': 'Smallest files, but not every browser can create AVIF.',
    'application/pdf': 'Each image becomes a page. JPEG is used inside the PDF, since PNG pages are many times larger.'
  };
  const OP_HINTS = {
    compress: 'Every page is redrawn as an image, which is where the saving comes from. The text stops being selectable.',
    'image/jpeg': 'One JPG per page, and a size target applies to each page rather than to the set.',
    'image/png': 'One PNG per page, and a size target applies to each page. Sharper on diagrams than JPG, and much larger.',
    pages: 'Nothing is re-encoded here. Pages are copied across as they are.',
    text: 'Only works if the PDF has a text layer. A scan of a printed page has none.'
  };

  function counts() {
    const img = items.filter(i => i.kind === 'image').length;
    const pdf = items.filter(i => i.kind === 'pdf').length;
    return { img, pdf, any: items.length };
  }

  function syncUI() {
    const s = settings();
    const c = counts();
    const hasImg = c.img > 0, hasPdf = c.pdf > 0, empty = c.any === 0;
    const pdfRaster = s.op === 'compress' || s.op === 'image/jpeg' || s.op === 'image/png';

    /* which panels are relevant to what is actually in the queue */
    els.cFmt.hidden = !(hasImg || empty);
    els.cPageset.hidden = !(hasImg && s.type === 'application/pdf');
    els.cPdfop.hidden = !hasPdf;
    els.cRender.hidden = !(hasPdf && pdfRaster);
    els.cPagetools.hidden = !(hasPdf && s.op === 'pages');

    const needComp = empty || hasImg || (hasPdf && pdfRaster);
    const needResize = empty || hasImg || (hasPdf && (s.op === 'image/jpeg' || s.op === 'image/png'));
    els.cComp.hidden = !needComp;
    els.cResize.hidden = !needResize;

    els.fmtOf.textContent = hasImg ? c.img + (c.img === 1 ? ' image' : ' images') : '';
    els.pdfOf.textContent = hasPdf ? c.pdf + (c.pdf === 1 ? ' PDF' : ' PDFs') : '';

    /* compression mode */
    $('#f-size').hidden = s.mode !== 'size';
    $('#f-percent').hidden = s.mode !== 'percent';
    $('#f-quality').hidden = s.mode !== 'quality';

    /* a PNG target can only be met by shrinking; say so, but only where it applies */
    const pngOut = (hasImg && s.type === 'image/png') || (hasPdf && s.op === 'image/png');
    els.pngWarn.hidden = !(pngOut && s.mode !== 'quality');

    els.bgCard.hidden = !(hasImg && (s.type === 'image/jpeg' || s.type === 'application/pdf'));

    els.fmtHint.textContent = FMT_HINTS[s.type] || '';
    els.pdfopHint.textContent = OP_HINTS[s.op] || '';

    /* page setup: orientation and margin mean nothing when the page is
       cut to the image */
    els.porientWrap.hidden = s.psize === 'fit';
    els.pmarginWrap.hidden = s.psize === 'fit';
    els.pdfHint.textContent = s.combine
      ? 'A size target applies to the finished PDF, not to each page.'
      : 'Each image becomes its own single page PDF, and a size target applies to each one.';

    els.rotWrap.hidden = s.ptool !== 'rotate';
    els.trange.placeholder = s.ptool === 'drop' ? 'e.g. 2,5-7' : 'all pages';
    els.ptoolHint.textContent =
      s.ptool === 'keep' ? 'Keeping pages also reorders them: 3,1,2 comes out in that order. Nothing is re-encoded, so quality is untouched.'
      : s.ptool === 'drop' ? 'Everything not listed is kept, in its original order.'
      : s.ptool === 'split' ? 'One PDF per page, named after the page number.'
      : 'Only the pages you list are turned. The rest are copied unchanged.';

    /* page counts, once a PDF has been opened */
    const first = items.find(i => i.kind === 'pdf' && i.pages);
    const label = first ? '(1 to ' + first.pages + (c.pdf > 1 ? ', per file' : '') + ')' : '';
    els.rangeMax.textContent = label;
    els.trangeMax.textContent = label;

    els.pctVal.textContent = els.pct.value;
    els.qVal.textContent = els.q.value;
    els.dpiVal.textContent = els.dpi.value;
    els.pmarginVal.textContent = els.pmargin.value;

    els.merge.hidden = !(c.pdf > 1);
  }

  /* ── adding files ──────────────────────────────────────────── */
  function kindOf(f) {
    const n = (f.name || '').toLowerCase();
    if ((f.type || '') === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
    if (/^image\//i.test(f.type || '') || /\.(heic|heif|hif|jpe?g|png|webp|avif|gif|bmp)$/i.test(n)) return 'image';
    return null;
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList).map(f => ({ f, kind: kindOf(f) })).filter(x => x.kind);
    if (!incoming.length) return;
    for (const { f, kind } of incoming) {
      const it = {
        id: ++seq, file: f, kind, name: f.name || (kind === 'pdf' ? 'document.pdf' : 'image'),
        origSize: f.size, status: 'queued', result: null, outputs: [], error: '',
        srcUrl: null, el: null, showCmp: false, showText: '',
        doc: null, pages: 0, password: '', needPw: false, note: ''
      };
      items.push(it);
      renderItem(it);
    }
    if (incoming.some(x => x.kind === 'pdf')) {
      IndiPDF.prefetch('both');
      // a PDF going in almost always means a PDF coming out
      if (!picked.op) setSeg(els.pdfop, DEFAULT_OP);
    }
    if (incoming.some(x => x.kind === 'image') && !picked.fmt) setSeg(els.fmt, DEFAULT_FMT);
    els.empty.hidden = true;
    els.zip.hidden = false; els.clear.hidden = false;
    syncUI();
    processAll();
  }

  /* ── processing ────────────────────────────────────────────── */
  /* Changing a setting starts a new generation. Results from an older
     generation are dropped, otherwise a slow job from the previous
     settings lands last and overwrites the current result. */
  let generation = 0;

  function processAll() {
    const s = settings();
    const gen = ++generation;
    clearCombined();
    for (const it of items) {
      it.status = 'queued'; it.error = ''; it.note = ''; it.showText = '';
      paint(it);
    }

    /* Images go through the worker pool. PDFs are rendered on this
       thread by pdf.js, so they are taken one file at a time. */
    (async () => {
      const imgs = items.filter(i => i.kind === 'image');
      const pdfs = items.filter(i => i.kind === 'pdf');

      const imgTask = imgs.length ? processImages(imgs, s, gen) : Promise.resolve();
      const pdfTask = (async () => {
        for (const it of pdfs) {
          if (gen !== generation) return;
          await processPdf(it, s, gen);
        }
      })();
      await Promise.all([imgTask, pdfTask]);
      if (gen !== generation) return;
      updateSummary();
    })();
  }

  const reprocess = debounce(() => { if (items.length) processAll(); }, 350);
  function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

  /* ── images ────────────────────────────────────────────────── */
  async function processImages(imgs, s, gen) {
    const toPdf = s.type === 'application/pdf';
    /* Inside a PDF we embed JPEG. PNG pages are several times larger for
       no visible gain on a photograph, and PDF has no WebP or AVIF. */
    const encodeType = toPdf ? 'image/jpeg' : s.type;

    if (toPdf && s.combine) {
      const n = imgs.length;
      const target = s.mode === 'percent'
        ? Math.max(8192, Math.round(imgs.reduce((a, i) => a + i.origSize, 0) * s.percent / 100))
        : s.targetBytes;
      const perPage = s.mode === 'quality' ? 0 : Math.max(3072, Math.floor(target * 0.93 / n));

      const encoded = await mapLimit(imgs, POOL_SIZE, async (it) => {
        it.status = 'working'; paint(it);
        const res = await run({
          file: it.file, type: encodeType,
          mode: s.mode === 'quality' ? 'quality' : 'size',
          targetBytes: perPage, quality: s.quality,
          maxW: s.maxW, maxH: s.maxH, bg: s.bg, wantBytes: true
        });
        if (gen !== generation) return null;
        if (!res.ok) { fail(it, res.error); return null; }
        it.result = res; it.status = 'done'; it.outputs = [];
        it.note = 'page in the combined PDF';
        paint(it);
        return { bytes: res.bytes, type: encodeType };
      });
      if (gen !== generation) return;
      const pages = encoded.filter(Boolean);
      if (!pages.length) return;
      try {
        const bytes = await IndiPDF.pdfFromImages(pages, {
          size: s.psize, orientation: s.porient, marginPt: s.marginPt, dpiFit: 96
        });
        if (gen !== generation) return;
        setCombined(new Blob([bytes], { type: 'application/pdf' }),
          'indi-tools.pdf', pages.length + (pages.length === 1 ? ' page' : ' pages'),
          s.mode !== 'quality' ? target : 0);
      } catch (e) {
        imgs.forEach(it => fail(it, e.message || 'Could not build the PDF'));
      }
      return;
    }

    await mapLimit(imgs, POOL_SIZE, async (it) => {
      it.status = 'working'; paint(it);
      const res = await run({
        file: it.file, type: encodeType, mode: s.mode,
        targetBytes: s.targetBytes, percent: s.percent, quality: s.quality,
        maxW: s.maxW, maxH: s.maxH, bg: s.bg, wantBytes: toPdf
      });
      if (gen !== generation) return;
      if (!res.ok) { fail(it, res.error); return; }
      it.result = res;

      if (toPdf) {
        try {
          const bytes = await IndiPDF.pdfFromImages([{ bytes: res.bytes, type: encodeType }], {
            size: s.psize, orientation: s.porient, marginPt: s.marginPt, dpiFit: 96
          });
          if (gen !== generation) return;
          setOutputs(it, [{ name: baseName(it.name) + '.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) }]);
        } catch (e) { fail(it, e.message || 'Could not build the PDF'); return; }
      } else {
        setOutputs(it, [{ name: baseName(it.name) + '.' + extFor(encodeType), blob: res.blob }]);
      }
      it.status = 'done';
      paint(it); updateSummary();
    });
  }

  /* ── PDFs ──────────────────────────────────────────────────── */
  async function openIfNeeded(it) {
    if (it.doc) return true;
    try {
      const r = await IndiPDF.openDoc(it.file, it.password);
      it.doc = r.doc; it.pages = r.pages; it.needPw = false;
      syncUI();
      return true;
    } catch (e) {
      if (e.indiCode === IndiPDF.PASSWORD_NEEDED || e.indiCode === IndiPDF.PASSWORD_WRONG) {
        it.needPw = true; it.status = 'error';
        it.error = e.indiCode === IndiPDF.PASSWORD_WRONG ? 'That password did not work' : 'Password needed';
      } else {
        fail(it, e.message || 'Could not open this PDF');
      }
      paint(it);
      return false;
    }
  }

  async function processPdf(it, s, gen) {
    it.status = 'working'; paint(it);
    try {
      if (s.op === 'pages') { await pdfPageTools(it, s, gen); return; }
      if (!(await openIfNeeded(it))) return;
      if (gen !== generation) return;
      makePdfThumb(it);
      if (s.op === 'text') { await pdfToText(it, s, gen); return; }
      if (s.op === 'compress') { await pdfCompress(it, s, gen); return; }
      await pdfToImages(it, s, gen);
    } catch (e) {
      if (gen === generation) fail(it, e.message || 'Could not process this PDF');
    }
  }

  /* Render the chosen pages and encode each one, reusing the image
     worker's size search. Bitmaps are transferred away and closed
     immediately, so only a few are ever alive at once. */
  async function renderAndEncode(it, pages, dpi, s, perPageBytes, type, gen) {
    return mapLimit(pages, RENDER_LIMIT, async (n) => {
      if (gen !== generation) return null;
      const r = await IndiPDF.renderBitmap(it.doc, n, dpi, s.gray);
      if (gen !== generation) { r.bitmap.close(); return null; }
      const res = await run({
        bitmap: r.bitmap, sourceSize: 0, type,
        mode: perPageBytes ? 'size' : 'quality',
        targetBytes: perPageBytes || 0, quality: s.quality,
        maxW: s.maxW, maxH: s.maxH, bg: '#FFFFFF', wantBytes: true
      }, [r.bitmap]);
      if (gen !== generation) return null;
      if (!res.ok) throw new Error(res.error);
      return {
        page: n, bytes: res.bytes, type,
        ptWidth: r.ptWidth, ptHeight: r.ptHeight,
        width: res.width, height: res.height,
        quality: res.quality, missedTarget: res.missedTarget
      };
    });
  }

  function pageSelection(it, rangeStr) {
    const pages = IndiPDF.parseRange(rangeStr, it.pages);
    if (!pages.length) throw new Error('That range selects no pages. This PDF has ' + it.pages + '.');
    if (pages.length > MAX_RENDER_PAGES) {
      throw new Error(pages.length + ' pages is more than this can render at once. Use the page field to take them in batches of ' + MAX_RENDER_PAGES + '.');
    }
    return pages;
  }

  async function pdfCompress(it, s, gen) {
    const pages = pageSelection(it, s.range);
    const target = s.mode === 'percent'
      ? Math.max(8192, Math.round(it.origSize * s.percent / 100))
      : s.targetBytes;
    const RESERVE = 0.93;            // leaves room for the PDF's own structure
    let budget = s.mode === 'quality' ? 0 : Math.max(2048, Math.floor(target * RESERVE / pages.length));
    let dpi = s.dpi, out = null, missed = false;

    /* One pass usually lands close. A second corrects for pages that
       came in well under their share; a third is the last attempt
       before we report the real number honestly. */
    for (let pass = 0; pass < 3; pass++) {
      it.note = pages.length > 8 ? 'rendering ' + pages.length + ' pages, pass ' + (pass + 1) : '';
      paint(it);
      const enc = (await renderAndEncode(it, pages, dpi, s, budget, 'image/jpeg', gen)).filter(Boolean);
      if (gen !== generation) return;
      if (!enc.length) throw new Error('No pages were rendered.');
      const bytes = await IndiPDF.pdfFromRasterPages(enc);
      if (gen !== generation) return;
      out = { bytes, dpi, pages: enc.length, quality: avg(enc.map(e => e.quality)) };
      if (!budget) break;                                   // fixed quality: one pass only
      if (bytes.length <= target) { missed = false; break; }
      missed = true;
      const ratio = (target * RESERVE) / bytes.length;
      if (ratio > 0.97) break;                              // as close as this loop gets
      budget = Math.max(1536, Math.floor(budget * ratio));
      // When quality alone is clearly not enough, take pixels out too.
      if (ratio < 0.55) dpi = Math.max(50, Math.round(dpi * 0.72));
    }

    const blob = new Blob([out.bytes], { type: 'application/pdf' });
    it.note = out.pages + (out.pages === 1 ? ' page' : ' pages') + ' at ' + out.dpi + ' DPI' +
      (out.quality ? ' · q' + Math.round(out.quality * 100) : '') +
      (s.gray ? ' · grey' : '') + ' · text is no longer selectable';
    if (missed) it.note += ' · target not reached';
    /* A text-only PDF is mostly instructions, not pixels. Redrawing it as
       images makes it bigger, every time. Say so rather than leaving the
       user to work out why compressing grew the file. */
    if (blob.size > it.origSize) {
      it.note += ' · this PDF was already smaller than its rendered pages, so nothing here will shrink it';
    } else if (out.quality && out.quality < 0.35) {
      it.note += ' · the pages are heavily degraded at this target: raise it, or drop the DPI instead';
    }
    setOutputs(it, [{ name: baseName(it.name) + '-compressed.pdf', blob }]);
    it.status = 'done';
    paint(it); updateSummary();
  }

  async function pdfToImages(it, s, gen) {
    const pages = pageSelection(it, s.range);
    const type = s.op;
    const perPage = s.mode === 'quality' ? 0
      : s.mode === 'percent' ? Math.max(2048, Math.round(it.origSize * s.percent / 100 / pages.length))
      : s.targetBytes;
    it.note = pages.length > 8 ? 'rendering ' + pages.length + ' pages' : '';
    paint(it);
    const enc = (await renderAndEncode(it, pages, s.dpi, s, perPage, type, gen)).filter(Boolean);
    if (gen !== generation) return;
    const ext = extFor(type);
    const width = String(it.pages).length;
    setOutputs(it, enc.map(e => ({
      name: baseName(it.name) + '-p' + pad(e.page, Math.max(2, width)) + '.' + ext,
      blob: new Blob([e.bytes], { type }),
      label: 'p' + e.page
    })));
    const dims = enc.length ? enc[0].width + '×' + enc[0].height : '';
    it.note = enc.length + (enc.length === 1 ? ' page' : ' pages') + ' at ' + s.dpi + ' DPI' +
      (dims ? ' · ' + dims + 'px' : '') +
      (enc.some(e => e.missedTarget) ? ' · some pages missed the target' : '');
    it.status = 'done';
    paint(it); updateSummary();
  }

  async function pdfToText(it, s, gen) {
    const pages = IndiPDF.parseRange(s.range, it.pages);
    let out = '';
    for (const n of pages) {
      if (gen !== generation) return;
      const t = await IndiPDF.pageText(it.doc, n);
      out += (pages.length > 1 ? '\n\n───── page ' + n + ' ─────\n\n' : '') + t;
    }
    out = out.trim();
    if (!out) {
      fail(it, 'No text layer in this PDF. It is most likely a scan, and there is no OCR here.');
      return;
    }
    it.showText = out;
    setOutputs(it, [{ name: baseName(it.name) + '.txt', blob: new Blob([out], { type: 'text/plain;charset=utf-8' }) }]);
    it.note = out.length.toLocaleString('en-IN') + ' characters from ' + pages.length +
      (pages.length === 1 ? ' page' : ' pages');
    it.status = 'done';
    paint(it); updateSummary();
  }

  async function pdfPageTools(it, s, gen) {
    /* pdf-lib reads the file directly, so the page count has to come
       from pdf.js first for the range to mean anything. */
    if (!(await openIfNeeded(it))) return;
    if (gen !== generation) return;
    makePdfThumb(it);
    const total = it.pages;
    const asked = IndiPDF.parseRange(s.trange, total);
    if (!asked.length) throw new Error('That range selects no pages. This PDF has ' + total + '.');
    const all = Array.from({ length: total }, (_, i) => i + 1);
    const bytes = new Uint8Array(await it.file.arrayBuffer());

    if (s.ptool === 'split') {
      const parts = await IndiPDF.splitEach(bytes, asked);
      if (gen !== generation) return;
      const w = Math.max(2, String(total).length);
      setOutputs(it, parts.map(p => ({
        name: baseName(it.name) + '-p' + pad(p.page, w) + '.pdf',
        blob: new Blob([p.bytes], { type: 'application/pdf' }),
        label: 'p' + p.page
      })));
      it.note = parts.length + (parts.length === 1 ? ' file' : ' files') + ', nothing re-encoded';
    } else {
      let keep = asked, rotate = 0, only = null, suffix = 'pages';
      if (s.ptool === 'drop') {
        if (!String(s.trange).trim()) throw new Error('List the pages to remove, for example 2,5-7');
        const rm = new Set(asked);
        keep = all.filter(n => !rm.has(n));
        if (!keep.length) throw new Error('That would remove every page.');
        suffix = 'trimmed';
      } else if (s.ptool === 'rotate') {
        keep = all; rotate = s.rot; only = new Set(asked); suffix = 'rotated';
      }
      const outBytes = await IndiPDF.rebuild(bytes, keep, rotate, only);
      if (gen !== generation) return;
      setOutputs(it, [{
        name: baseName(it.name) + '-' + suffix + '.pdf',
        blob: new Blob([outBytes], { type: 'application/pdf' })
      }]);
      it.note = s.ptool === 'rotate'
        ? asked.length + ' of ' + total + ' pages turned by ' + rotate + '°, nothing re-encoded'
        : keep.length + ' of ' + total + ' pages kept, nothing re-encoded';
    }
    it.status = 'done';
    paint(it); updateSummary();
  }

  function avg(a) { const v = a.filter(x => typeof x === 'number'); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : 0; }

  /* ── outputs ───────────────────────────────────────────────── */
  function setOutputs(it, outs) {
    it.outputs.forEach(o => { if (o.url) URL.revokeObjectURL(o.url); });
    it.outputs = outs.map(o => ({ ...o, url: URL.createObjectURL(o.blob) }));
  }
  function outSize(it) { return it.outputs.reduce((a, o) => a + o.blob.size, 0); }

  function fail(it, msg) {
    it.status = 'error';
    it.error = msg || 'Could not process this file';
    it.outputs.forEach(o => { if (o.url) URL.revokeObjectURL(o.url); });
    it.outputs = [];
    paint(it); updateSummary();
  }

  function clearCombined() {
    if (combined && combined.url) URL.revokeObjectURL(combined.url);
    combined = null;
    els.combined.hidden = true;
  }
  function setCombined(blob, name, meta, target) {
    clearCombined();
    combined = { blob, name, url: URL.createObjectURL(blob) };
    els.cTitle.textContent = name;
    els.cMeta.textContent = meta + ' · ' + fmtBytes(blob.size) +
      (target && blob.size > target ? ' · target of ' + fmtBytes(target) + ' not reached' : '');
    els.cDl.href = combined.url;
    els.cDl.download = name;
    els.cDl.hidden = false;
    els.combined.hidden = false;
  }
  function setCombinedError(title, msg) {
    clearCombined();
    els.cTitle.textContent = title;
    els.cMeta.textContent = msg;
    els.cDl.hidden = true;
    els.combined.hidden = false;
  }

  /* ── rendering ─────────────────────────────────────────────── */
  function renderItem(it) {
    const li = document.createElement('li');
    li.className = 'item';
    li.innerHTML =
      '<img class="thumb" alt="">' +
      '<div class="meta"><div class="fname"></div><div class="sizes"></div><div class="dims"></div>' +
      '<div class="prog"><i></i></div></div>' +
      '<div class="acts"></div>';
    it.el = li;
    els.list.appendChild(li);
    li.querySelector('.fname').innerHTML = esc(it.name) +
      '<span class="kind">' + (it.kind === 'pdf' ? 'PDF' : 'IMAGE') + '</span>';
    if (it.kind === 'image') {
      // thumbnail from the original (HEIC will not preview natively; that is fine)
      it.srcUrl = URL.createObjectURL(it.file);
      const img = li.querySelector('.thumb');
      img.src = it.srcUrl;
      img.onerror = () => { img.removeAttribute('src'); };
    } else {
      li.querySelector('.thumb').classList.add('doc');
    }
    paint(it);
  }

  /* First page at a low DPI, purely so the row is recognisable. */
  async function makePdfThumb(it) {
    if (it.srcUrl || !it.doc) return;
    try {
      const r = await IndiPDF.renderBitmap(it.doc, 1, 24, false);
      const cv = new OffscreenCanvas(r.width, r.height);
      cv.getContext('2d').drawImage(r.bitmap, 0, 0);
      r.bitmap.close();
      const blob = await cv.convertToBlob({ type: 'image/png' });
      it.srcUrl = URL.createObjectURL(blob);
      const img = it.el && it.el.querySelector('.thumb');
      if (img) img.src = it.srcUrl;
    } catch (e) { /* a missing thumbnail is not worth failing the job over */ }
  }

  function paint(it) {
    if (!it.el) return;
    const sizes = it.el.querySelector('.sizes');
    const dims = it.el.querySelector('.dims');
    const acts = it.el.querySelector('.acts');
    const bar = it.el.querySelector('.prog i');
    it.el.classList.toggle('failed', it.status === 'error');
    const pw = it.el.querySelector('.pw'); if (pw) pw.remove();
    const pl = it.el.querySelector('.pages'); if (pl) pl.remove();
    const tx = it.el.querySelector('.txt'); if (tx) tx.remove();

    // 'queued' must be handled too: without it this fell through to the
    // done branch and dereferenced a null result.
    if (it.status === 'queued' || it.status === 'working') {
      const label = it.status === 'queued' ? 'waiting…' : (it.note || 'working…');
      sizes.innerHTML = fmtBytes(it.origSize) + ' <span class="status">· ' + esc(label) + '</span>';
      dims.textContent = it.kind === 'pdf' && it.pages ? it.pages + (it.pages === 1 ? ' page' : ' pages') : '';
      bar.style.width = it.status === 'queued' ? '8%' : '45%';
      acts.innerHTML = ''; addRemove(acts, it);
      return;
    }

    if (it.status === 'error') {
      sizes.innerHTML = fmtBytes(it.origSize) + ' <span class="status err">· ' + esc(it.error) + '</span>';
      dims.textContent = ''; bar.style.width = '0'; acts.innerHTML = '';
      addRemove(acts, it);
      if (it.needPw) renderPassword(it);
      return;
    }

    /* an image folded into a combined PDF has no file of its own */
    if (!it.outputs.length) {
      sizes.innerHTML = fmtBytes(it.origSize) +
        (it.result ? ' → ' + fmtBytes(it.result.blob.size) : '') +
        ' <span class="status">· ' + esc(it.note || 'ready') + '</span>';
      dims.textContent = it.result ? it.result.origWidth + '×' + it.result.origHeight : '';
      bar.style.width = '100%';
      acts.innerHTML = ''; addRemove(acts, it);
      return;
    }

    const after = outSize(it);
    const pct = Math.round((1 - after / it.origSize) * 100);
    const grew = after >= it.origSize;
    sizes.innerHTML = fmtBytes(it.origSize) + ' → ' + fmtBytes(after) +
      (it.outputs.length > 1 ? ' across ' + it.outputs.length + ' files' : '') +
      ' <span class="' + (grew ? 'grew' : 'save') + '">' +
      (grew ? '+' + Math.abs(pct) + '% larger' : pct + '% smaller') + '</span>';

    const r = it.result;
    let d = '';
    if (it.kind === 'image' && r) {
      d = r.origWidth + '×' + r.origHeight +
        (r.width !== r.origWidth ? ' → ' + r.width + '×' + r.height : '') +
        (r.quality ? ' · q' + Math.round(r.quality * 100) : '') +
        (r.missedTarget ? ' · target not reached' : '');
      if (r.note) d += ' · ' + r.note;
    } else if (it.note) d = it.note;
    dims.textContent = d;
    bar.style.width = Math.max(0, Math.min(100, grew ? 100 : pct)) + '%';

    acts.innerHTML = '';
    if (it.outputs.length === 1) {
      const dl = document.createElement('a');
      dl.className = 'btn-action'; dl.textContent = 'Download';
      dl.href = it.outputs[0].url; dl.download = it.outputs[0].name;
      acts.appendChild(dl);
    } else {
      const z = document.createElement('button');
      z.className = 'btn-action';
      z.textContent = 'Download ' + it.outputs.length + ' as .zip';
      z.onclick = () => zipOutputs(it.outputs, baseName(it.name) + '.zip', z);
      acts.appendChild(z);
    }

    /* the compare slider only means anything for a single image */
    if (it.kind === 'image' && r && r.blob && it.outputs.length === 1 && /^image\//.test(it.outputs[0].blob.type)) {
      const cmp = document.createElement('button');
      cmp.className = 'btn-action'; cmp.textContent = it.showCmp ? 'Hide' : 'Compare';
      cmp.onclick = () => { it.showCmp = !it.showCmp; renderCompare(it); cmp.textContent = it.showCmp ? 'Hide' : 'Compare'; };
      acts.appendChild(cmp);
    }
    addRemove(acts, it);

    if (it.outputs.length > 1) renderPageLinks(it);
    if (it.showText) renderText(it);
    if (it.showCmp) renderCompare(it);
  }

  function renderPageLinks(it) {
    const box = document.createElement('div');
    box.className = 'pages';
    it.outputs.forEach(o => {
      const a = document.createElement('a');
      a.href = o.url; a.download = o.name;
      a.textContent = o.label || o.name;
      a.title = o.name + ' · ' + fmtBytes(o.blob.size);
      box.appendChild(a);
    });
    it.el.appendChild(box);
  }

  function renderText(it) {
    const box = document.createElement('div');
    box.className = 'txt';
    const ta = document.createElement('textarea');
    ta.readOnly = true; ta.spellcheck = false; ta.value = it.showText;
    ta.setAttribute('aria-label', 'Text from ' + it.name);
    box.appendChild(ta);
    it.el.appendChild(box);
  }

  function renderPassword(it) {
    const box = document.createElement('div');
    box.className = 'pw';
    box.innerHTML = '<label class="lbl">This PDF is protected. The password stays in this tab.</label>' +
      '<div class="row"><input type="password" autocomplete="off" placeholder="password">' +
      '<button class="btn-action" type="button">Unlock</button></div>';
    const input = box.querySelector('input');
    const go = () => {
      const v = input.value;
      if (!v) return;
      it.password = v; it.doc = null; it.needPw = false;
      it.status = 'working'; paint(it);
      processPdf(it, settings(), generation);
    };
    box.querySelector('button').onclick = go;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    it.el.appendChild(box);
    input.focus();
  }

  function addRemove(acts, it) {
    const rm = document.createElement('button');
    rm.className = 'btn-action'; rm.textContent = 'Remove';
    rm.onclick = () => {
      const i = items.indexOf(it); if (i > -1) items.splice(i, 1);
      if (it.srcUrl) URL.revokeObjectURL(it.srcUrl);
      it.outputs.forEach(o => { if (o.url) URL.revokeObjectURL(o.url); });
      if (it.doc) { try { it.doc.destroy(); } catch (e) { /* already gone */ } }
      it.el.remove(); updateSummary(); syncUI();
      if (!items.length) { els.empty.hidden = false; els.zip.hidden = true; els.clear.hidden = true; clearCombined(); }
    };
    acts.appendChild(rm);
  }

  function renderCompare(it) {
    let box = it.el.querySelector('.cmp');
    if (!it.showCmp) { if (box) box.remove(); return; }
    if (box) box.remove();
    box = document.createElement('div');
    box.className = 'cmp';
    box.innerHTML =
      '<div class="cmpwrap"><img class="base" alt="Original"><div class="after"><img alt="Compressed"></div><div class="handle"></div></div>' +
      '<div class="cmplabels"><span>ORIGINAL ' + fmtBytes(it.origSize) + '</span><span>COMPRESSED ' + fmtBytes(outSize(it)) + '</span></div>';
    it.el.appendChild(box);
    const wrap = box.querySelector('.cmpwrap');
    wrap.querySelector('.base').src = it.srcUrl;
    const afterImg = box.querySelector('.after img');
    afterImg.src = it.outputs[0].url;
    const after = box.querySelector('.after'), handle = box.querySelector('.handle');
    function set(p) {
      p = Math.max(0, Math.min(1, p));
      after.style.width = (p * 100) + '%';
      afterImg.style.width = wrap.clientWidth + 'px';
      handle.style.left = (p * 100) + '%';
    }
    const move = e => {
      const rect = wrap.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      set(x / rect.width);
    };
    wrap.addEventListener('mousemove', move);
    wrap.addEventListener('touchmove', move, { passive: true });
    wrap.querySelector('.base').onload = () => set(0.5);
    set(0.5);
  }

  function updateSummary() {
    if (!items.length) { els.summary.textContent = ''; return; }
    const done = items.filter(i => i.status === 'done');
    const withFiles = done.filter(i => i.outputs.length);
    const before = withFiles.reduce((a, i) => a + i.origSize, 0);
    const after = withFiles.reduce((a, i) => a + outSize(i), 0);
    const files = withFiles.reduce((a, i) => a + i.outputs.length, 0);
    const pct = before ? Math.round((1 - after / before) * 100) : 0;
    let txt = done.length + ' of ' + items.length + ' ready';
    if (files) {
      txt += ' · ' + files + (files === 1 ? ' file' : ' files') + ' · ' +
        fmtBytes(before) + ' → ' + fmtBytes(after) + ' · <b>' +
        (pct < 0 ? Math.abs(pct) + '% larger' : pct + '% smaller') + '</b>';
    } else if (combined) {
      txt += ' · one combined PDF · ' + fmtBytes(combined.blob.size);
    }
    els.summary.innerHTML = txt;
    els.live.textContent = done.length + ' of ' + items.length + ' files ready' +
      (files ? ', ' + Math.abs(pct) + ' percent ' + (pct < 0 ? 'larger.' : 'smaller.') : '.');
  }

  /* ── ZIP (store method, no dependency) ─────────────────────── */
  const CRC = (() => { const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
    return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  function buildZip(files) {
    const enc = new TextEncoder(), chunks = [], central = [];
    let offset = 0;
    const u16 = n => [n & 255, (n >> 8) & 255];
    const u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), len = f.data.length;
      const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(crc), ...u32(len), ...u32(len), ...u16(name.length), ...u16(0)]);
      chunks.push(local, name, f.data);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(crc), ...u32(len), ...u32(len), ...u16(name.length),
        ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      offset += local.length + name.length + len;
    }
    const cdStart = offset;
    let cdSize = 0; for (const c of central) cdSize += c.length;
    const eocd = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0),
      ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(cdStart), ...u16(0)]);
    return new Blob([...chunks, ...central, eocd], { type: 'application/zip' });
  }

  async function zipOutputs(outputs, zipName, btn) {
    if (!outputs.length) return;
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Packaging…'; }
    try {
      const seen = new Map();
      const files = [];
      for (const o of outputs) {
        let n = o.name;
        if (seen.has(n)) {
          const k = seen.get(n) + 1; seen.set(n, k);
          n = baseName(o.name) + '-' + k + '.' + (o.name.split('.').pop());
        } else seen.set(n, 1);
        files.push({ name: n, data: new Uint8Array(await o.blob.arrayBuffer()) });
      }
      const blob = buildZip(files);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = zipName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
  }

  function downloadAll() {
    const outs = [];
    items.forEach(i => i.outputs.forEach(o => outs.push(o)));
    if (combined) outs.push({ name: combined.name, blob: combined.blob });
    if (!outs.length) return;
    zipOutputs(outs, 'indi-tools.zip', els.zip);
  }

  async function mergeAll() {
    const pdfs = items.filter(i => i.kind === 'pdf');
    if (pdfs.length < 2) return;
    const label = els.merge.textContent;
    els.merge.disabled = true; els.merge.textContent = 'Merging…';
    try {
      const buffers = [];
      for (const it of pdfs) buffers.push(new Uint8Array(await it.file.arrayBuffer()));
      const bytes = await IndiPDF.merge(buffers);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      setCombined(blob, 'indi-tools-merged.pdf', pdfs.length + ' PDFs joined, nothing re-encoded', 0);
      updateSummary();
    } catch (e) {
      setCombinedError('Could not merge these PDFs', e.message || 'Unknown error');
    } finally {
      els.merge.disabled = false; els.merge.textContent = label;
    }
  }

  /* ── presets ───────────────────────────────────────────────── */
  const PRESETS = {
    email:    { mode: 'size', target: 5,   unit: 1048576, maxw: '', maxh: '' },
    web:      { mode: 'size', target: 200, unit: 1024, maxw: 1920, maxh: '' },
    thumb:    { mode: 'size', target: 60,  unit: 1024, maxw: 400,  maxh: 400 },
    avatar:   { mode: 'size', target: 80,  unit: 1024, maxw: 512,  maxh: 512 },
    whatsapp: { mode: 'size', target: 100, unit: 1024, maxw: 1600, maxh: '' },
    form200:  { mode: 'size', target: 200, unit: 1024, maxw: '', maxh: '', dpi: 150 },
    form100:  { mode: 'size', target: 100, unit: 1024, maxw: '', maxh: '', dpi: 120 },
    scan:     { mode: 'size', target: 500, unit: 1024, maxw: '', maxh: '', dpi: 150, gray: true }
  };

  function setSeg(group, val) {
    group.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === val)));
  }

  /* ── wiring ────────────────────────────────────────────────── */
  els.drop.addEventListener('click', () => els.picker.click());
  els.drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.picker.click(); } });
  els.picker.addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => els.drop.addEventListener(ev, e => { e.preventDefault(); els.drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => els.drop.addEventListener(ev, e => { e.preventDefault(); els.drop.classList.remove('over'); }));
  els.drop.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
  window.addEventListener('paste', e => {
    if (!e.clipboardData) return;
    // never swallow a paste aimed at a field the user is typing in
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
    const f = Array.from(e.clipboardData.files || []);
    if (f.length) addFiles(f);
  });

  [els.fmt, els.mode, els.pdfop].forEach(group => group.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (group === els.fmt) picked.fmt = true;
    if (group === els.pdfop) picked.op = true;
    setSeg(group, b.dataset.v);
    if (group === els.fmt && b.dataset.v === 'application/pdf') IndiPDF.prefetch('write');
    syncUI(); reprocess();
  }));

  const liveInputs = [els.target, els.unit, els.pct, els.q, els.maxw, els.maxh, els.bg,
    els.dpi, els.range, els.gray, els.ptool, els.trange, els.rot,
    els.psize, els.porient, els.pmargin, els.pcombine];
  liveInputs.forEach(el => el.addEventListener('input', () => {
    syncUI();
    if (el === els.bg) els.bghex.value = els.bg.value.toUpperCase();
    reprocess();
  }));
  // selects and checkboxes fire change more reliably across browsers
  [els.unit, els.gray, els.ptool, els.rot, els.psize, els.porient, els.pcombine]
    .forEach(el => el.addEventListener('change', () => { syncUI(); reprocess(); }));

  els.bghex.addEventListener('change', () => {
    const v = els.bghex.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) { els.bg.value = v; reprocess(); }
    else els.bghex.value = els.bg.value.toUpperCase();
  });

  document.querySelectorAll('.presets button').forEach(b => b.addEventListener('click', () => {
    const p = PRESETS[b.dataset.preset]; if (!p) return;
    setSeg(els.mode, p.mode);
    els.target.value = p.target; els.unit.value = p.unit;
    els.maxw.value = p.maxw; els.maxh.value = p.maxh;
    if (p.dpi) els.dpi.value = p.dpi;
    els.gray.checked = !!p.gray;
    syncUI(); reprocess();
  }));

  els.zip.addEventListener('click', downloadAll);
  els.merge.addEventListener('click', mergeAll);
  els.clear.addEventListener('click', () => {
    items.forEach(i => {
      if (i.srcUrl) URL.revokeObjectURL(i.srcUrl);
      i.outputs.forEach(o => { if (o.url) URL.revokeObjectURL(o.url); });
      if (i.doc) { try { i.doc.destroy(); } catch (e) { /* already gone */ } }
      i.el.remove();
    });
    items.length = 0; clearCombined();
    picked.fmt = false; picked.op = false;
    setSeg(els.fmt, DEFAULT_FMT); setSeg(els.pdfop, DEFAULT_OP);
    els.empty.hidden = false; els.zip.hidden = true; els.clear.hidden = true;
    updateSummary(); syncUI();
  });

  // AVIF encoding is not available everywhere; only offer it if it works.
  (function detectAvif() {
    const c = document.createElement('canvas'); c.width = c.height = 4;
    if (c.toDataURL('image/avif').startsWith('data:image/avif')) $('#fmt-avif').hidden = false;
  })();

  syncUI();
})();
