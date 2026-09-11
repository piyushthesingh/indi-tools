/* ─────────────────────────────────────────────────────────────
   indi.tools: PDF engine

   A thin wrapper over pdf.js (reading and rendering) and pdf-lib
   (writing and page surgery). Both are large, so neither is
   fetched until a job actually needs it.

   Everything here runs on the main thread, but the heavy lifting
   does not: pdf.js parses in its own worker, and page encoding is
   handed to the image worker pool by the caller.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const VENDOR = '/assets/vendor/';
  const PT_PER_IN = 72;

  /* ── lazy loaders ──────────────────────────────────────────── */
  let pdfjsPromise = null;
  function loadPdfjs() {
    if (pdfjsPromise) return pdfjsPromise;
    // pdf.js v4 ships as an ES module, so it has to come in via import().
    pdfjsPromise = import(VENDOR + 'pdf.min.mjs').then(mod => {
      const lib = mod.getDocument ? mod : (mod.default || mod);
      lib.GlobalWorkerOptions.workerSrc = VENDOR + 'pdf.worker.min.mjs';
      return lib;
    }).catch(e => {
      pdfjsPromise = null;
      throw new Error('Could not load the PDF reader (' + (e.message || e) + ')');
    });
    return pdfjsPromise;
  }

  let pdflibPromise = null;
  function loadPdflib() {
    if (pdflibPromise) return pdflibPromise;
    pdflibPromise = new Promise((resolve, reject) => {
      if (self.PDFLib) return resolve(self.PDFLib);
      const s = document.createElement('script');
      s.src = VENDOR + 'pdf-lib.min.js';
      s.onload = () => self.PDFLib ? resolve(self.PDFLib) : reject(new Error('pdf-lib did not register'));
      s.onerror = () => reject(new Error('Could not load the PDF writer'));
      document.head.appendChild(s);
    }).catch(e => { pdflibPromise = null; throw e; });
    return pdflibPromise;
  }

  /* Warm both up in the background once we know a PDF is in play, so
     the first job is not waiting on two sequential downloads. */
  function prefetch(kind) {
    if (kind === 'read' || kind === 'both') loadPdfjs().catch(() => {});
    if (kind === 'write' || kind === 'both') loadPdflib().catch(() => {});
  }

  /* ── reading ───────────────────────────────────────────────── */

  const PASSWORD_NEEDED = 'PDF_PASSWORD_NEEDED';
  const PASSWORD_WRONG = 'PDF_PASSWORD_WRONG';

  async function openDoc(file, password) {
    const pdfjs = await loadPdfjs();
    // pdf.js takes ownership of the buffer it is given, so each open
    // gets its own copy of the bytes.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const task = pdfjs.getDocument({
      data: bytes,
      password: password || undefined,
      standardFontDataUrl: VENDOR + 'standard_fonts/',
      isEvalSupported: false,
      useSystemFonts: true
    });
    try {
      const doc = await task.promise;
      return { doc, pages: doc.numPages, encrypted: !!password };
    } catch (e) {
      const code = e && e.name === 'PasswordException' ? e.code : null;
      // 1 = need a password, 2 = the one supplied is wrong
      if (code === 1) throw tagged(PASSWORD_NEEDED, 'This PDF is password protected.');
      if (code === 2) throw tagged(PASSWORD_WRONG, 'That password did not work.');
      if (e && e.name === 'InvalidPDFException') throw new Error('This file is not a readable PDF.');
      throw new Error(e && e.message ? e.message : 'Could not open this PDF');
    }
  }

  function tagged(code, msg) { const e = new Error(msg); e.indiCode = code; return e; }

  /* Render one page to a transferable bitmap at the given DPI.
     A hard pixel ceiling keeps a 300 DPI A0 poster from allocating a
     canvas the browser refuses to hand back. */
  const MAX_PIXELS = 40e6;

  async function renderBitmap(doc, pageNo, dpi, grayscale) {
    const page = await doc.getPage(pageNo);
    let scale = dpi / PT_PER_IN;
    let vp = page.getViewport({ scale });
    if (vp.width * vp.height > MAX_PIXELS) {
      scale *= Math.sqrt(MAX_PIXELS / (vp.width * vp.height));
      vp = page.getViewport({ scale });
    }
    const w = Math.max(1, Math.floor(vp.width));
    const h = Math.max(1, Math.floor(vp.height));

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    // PDF pages have no background of their own; without this, anything
    // transparent lands as black once it reaches JPEG.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    /* 'print' intent, not 'display', for two reasons. It is what the page
       looks like on paper, which is what a converter should produce. And
       pdf.js drives the display path with requestAnimationFrame, so a
       backgrounded tab would stall a long job until you came back to it. */
    await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;

    if (grayscale) {
      const d = ctx.getImageData(0, 0, w, h);
      const p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        // Rec. 601 luma, which is what scanners and fax pipelines use
        const y = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000;
        p[i] = p[i + 1] = p[i + 2] = y;
      }
      ctx.putImageData(d, 0, 0);
    }

    // read the media box before cleanup(), not after
    const ptWidth = page.view[2] - page.view[0];
    const ptHeight = page.view[3] - page.view[1];
    page.cleanup();
    return { bitmap: canvas.transferToImageBitmap(), width: w, height: h, ptWidth, ptHeight };
  }

  async function pageText(doc, pageNo) {
    const page = await doc.getPage(pageNo);
    const tc = await page.getTextContent();
    let out = '', lastY = null;
    for (const item of tc.items) {
      if (item.transform && lastY !== null && Math.abs(item.transform[5] - lastY) > 2) out += '\n';
      out += item.str;
      if (item.hasEOL) out += '\n';
      if (item.transform) lastY = item.transform[5];
    }
    page.cleanup();
    return out;
  }

  async function docInfo(doc) {
    let meta = {};
    try { meta = (await doc.getMetadata()) || {}; } catch (e) { /* optional */ }
    const p1 = await doc.getPage(1);
    const vp = p1.getViewport({ scale: 1 });
    p1.cleanup();
    return {
      pages: doc.numPages,
      width: Math.round(vp.width), height: Math.round(vp.height),
      producer: (meta.info && meta.info.Producer) || ''
    };
  }

  /* ── writing ───────────────────────────────────────────────── */

  const PAGE_SIZES = {
    a4:     [595.28, 841.89],
    a5:     [419.53, 595.28],
    a3:     [841.89, 1190.55],
    letter: [612, 792],
    legal:  [612, 1008]
  };

  /* Build a PDF out of already-encoded JPEG or PNG bytes.
     `pages` is [{ bytes, type, width, height }].
     `opts`: { size, orientation, marginPt, dpiFit } */
  async function pdfFromImages(pages, opts) {
    const { PDFDocument } = await loadPdflib();
    const doc = await PDFDocument.create();
    doc.setProducer('indi.tools');
    doc.setCreator('indi.tools');

    for (const p of pages) {
      const img = p.type === 'image/png' ? await doc.embedPng(p.bytes) : await doc.embedJpg(p.bytes);
      let pw, ph;

      if (opts.size === 'fit') {
        // One page exactly the size of the image, at the stated DPI
        const dpi = opts.dpiFit || 96;
        pw = (img.width / dpi) * PT_PER_IN;
        ph = (img.height / dpi) * PT_PER_IN;
        const page = doc.addPage([pw, ph]);
        page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
        continue;
      }

      const base = PAGE_SIZES[opts.size] || PAGE_SIZES.a4;
      const landscape = opts.orientation === 'landscape' ||
        (opts.orientation === 'auto' && img.width > img.height);
      pw = landscape ? base[1] : base[0];
      ph = landscape ? base[0] : base[1];

      const page = doc.addPage([pw, ph]);
      const m = Math.max(0, Math.min(Math.min(pw, ph) / 2 - 1, opts.marginPt || 0));
      const availW = pw - m * 2, availH = ph - m * 2;
      const s = Math.min(availW / img.width, availH / img.height);
      const dw = img.width * s, dh = img.height * s;
      page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
    }

    return doc.save({ useObjectStreams: true });
  }

  /* Rebuild a rasterised PDF where every page keeps its original
     point dimensions, so page count, size and orientation survive. */
  async function pdfFromRasterPages(pages) {
    const { PDFDocument } = await loadPdflib();
    const doc = await PDFDocument.create();
    doc.setProducer('indi.tools');
    for (const p of pages) {
      const img = p.type === 'image/png' ? await doc.embedPng(p.bytes) : await doc.embedJpg(p.bytes);
      const pw = p.ptWidth || (img.width * 0.75);
      const ph = p.ptHeight || (img.height * 0.75);
      const page = doc.addPage([pw, ph]);
      page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
    }
    return doc.save({ useObjectStreams: true });
  }

  /* ── page surgery (lossless: objects are copied, not re-encoded) ── */

  async function loadForEdit(bytesList) {
    const { PDFDocument } = await loadPdflib();
    const docs = [];
    for (const b of bytesList) {
      try {
        docs.push(await PDFDocument.load(b, { updateMetadata: false }));
      } catch (e) {
        if (/encrypt/i.test(e.message || '')) {
          throw new Error('Page tools cannot open a password protected PDF. Convert or compress it first.');
        }
        throw new Error('Could not read this PDF for editing (' + (e.message || e) + ')');
      }
    }
    return { PDFDocument, docs };
  }

  async function merge(bytesList) {
    const { PDFDocument, docs } = await loadForEdit(bytesList);
    const out = await PDFDocument.create();
    out.setProducer('indi.tools');
    for (const d of docs) {
      const copied = await out.copyPages(d, d.getPageIndices());
      copied.forEach(p => out.addPage(p));
    }
    return out.save({ useObjectStreams: true });
  }

  /* keep: an array of 1-based page numbers, in the order wanted.
     rotate: degrees to add, 0/90/180/270.
     only: optional Set of 1-based page numbers the rotation applies to. */
  async function rebuild(bytes, keep, rotate, only) {
    const { PDFDocument, docs } = await loadForEdit([bytes]);
    const src = docs[0];
    const out = await PDFDocument.create();
    out.setProducer('indi.tools');
    const idx = keep.map(n => n - 1).filter(i => i >= 0 && i < src.getPageCount());
    if (!idx.length) throw new Error('That page selection is empty.');
    const copied = await out.copyPages(src, idx);
    copied.forEach((p, i) => {
      if (rotate && (!only || only.has(keep[i]))) {
        const cur = p.getRotation().angle || 0;
        p.setRotation(self.PDFLib.degrees((cur + rotate + 360) % 360));
      }
      out.addPage(p);
    });
    return out.save({ useObjectStreams: true });
  }

  async function splitEach(bytes, keep) {
    const { PDFDocument, docs } = await loadForEdit([bytes]);
    const src = docs[0];
    const out = [];
    for (const n of keep) {
      const i = n - 1;
      if (i < 0 || i >= src.getPageCount()) continue;
      const d = await PDFDocument.create();
      d.setProducer('indi.tools');
      const [p] = await d.copyPages(src, [i]);
      d.addPage(p);
      out.push({ page: n, bytes: await d.save({ useObjectStreams: true }) });
    }
    return out;
  }

  /* ── page ranges: "1-3, 7, 10-" ────────────────────────────── */
  function parseRange(str, max) {
    const s = String(str || '').trim();
    if (!s) return Array.from({ length: max }, (_, i) => i + 1);
    const out = [];
    for (const part of s.split(',')) {
      const t = part.trim();
      if (!t) continue;
      const m = t.match(/^(\d+)?\s*(?:-|–|to)\s*(\d+)?$/i);
      if (m) {
        const a = Math.max(1, +(m[1] || 1));
        const b = Math.min(max, +(m[2] || max));
        for (let i = a; i <= b; i++) out.push(i);
      } else if (/^\d+$/.test(t)) {
        const n = +t;
        if (n >= 1 && n <= max) out.push(n);
      } else {
        throw new Error('Could not read the page range "' + t + '". Use something like 1-3, 7, 10-');
      }
    }
    // de-duplicate but keep the order the user asked for
    const seen = new Set();
    return out.filter(n => seen.has(n) ? false : (seen.add(n), true));
  }

  self.IndiPDF = {
    prefetch, openDoc, renderBitmap, pageText, docInfo,
    pdfFromImages, pdfFromRasterPages,
    merge, rebuild, splitEach, parseRange,
    PAGE_SIZES, PT_PER_IN,
    PASSWORD_NEEDED, PASSWORD_WRONG
  };
})();
