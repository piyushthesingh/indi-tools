/* ─────────────────────────────────────────────────────────────
   indi.tools: Image Converter & Compressor
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const items = [];
  let seq = 0;

  const els = {
    drop: $('#drop'), picker: $('#picker'), list: $('#items'), empty: $('#empty'),
    summary: $('#summary'), zip: $('#btn-zip'), clear: $('#btn-clear'),
    fmt: $('#fmt'), mode: $('#mode'), target: $('#target'), unit: $('#unit'),
    pct: $('#pct'), pctVal: $('#pct-val'), q: $('#q'), qVal: $('#q-val'),
    maxw: $('#maxw'), maxh: $('#maxh'), bg: $('#bg'), bghex: $('#bghex'),
    bgCard: $('#bg-card'), pngWarn: $('#png-warn'), fmtHint: $('#fmt-hint'),
    live: $('#live')
  };

  /* ── helpers ───────────────────────────────────────────────── */
  const fmtBytes = b => b < 1024 ? b + ' B'
    : b < 1048576 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB'
    : (b / 1048576).toFixed(2) + ' MB';
  const extFor = t => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }[t] || 'img');
  const baseName = n => n.replace(/\.[^.]+$/, '');

  /* A small pool, so a batch is not processed strictly one at a time.
     Capped at 4: each worker holds a full-size canvas, and more threads
     than cores just adds memory pressure. */
  const POOL_SIZE = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
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

  function run(job) {
    return new Promise(resolve => {
      const id = ++seq;
      pending.set(id, resolve);
      getWorker().postMessage({ id, job });
    });
  }

  /* ── settings ──────────────────────────────────────────────── */
  function segValue(group) {
    const b = group.querySelector('[aria-pressed="true"]');
    return b ? b.dataset.v : null;
  }
  function settings() {
    const type = segValue(els.fmt);
    return {
      type,
      mode: segValue(els.mode),
      targetBytes: Math.max(1024, Math.round((+els.target.value || 100) * (+els.unit.value))),
      percent: +els.pct.value,
      quality: (+els.q.value) / 100,
      maxW: +els.maxw.value || 0,
      maxH: +els.maxh.value || 0,
      bg: els.bg.value
    };
  }

  function syncUI() {
    const s = settings();
    $('#f-size').hidden = s.mode !== 'size';
    $('#f-percent').hidden = s.mode !== 'percent';
    $('#f-quality').hidden = s.mode !== 'quality';
    els.bgCard.hidden = s.type !== 'image/jpeg';
    els.pngWarn.hidden = !(s.type === 'image/png' && s.mode !== 'quality');
    els.fmtHint.textContent =
      s.type === 'image/webp' ? 'WebP is roughly half the size of JPEG at the same quality, and every current browser reads it.'
      : s.type === 'image/jpeg' ? 'Widest compatibility. No transparency, so it is filled with the colour below.'
      : s.type === 'image/png' ? 'Lossless, keeps transparency, and produces much larger files for photographs.'
      : 'Smallest files, but not every browser can create AVIF.';
    els.pctVal.textContent = els.pct.value;
    els.qVal.textContent = els.q.value;
  }

  /* ── adding files ──────────────────────────────────────────── */
  const ACCEPT = /^image\//i;
  function accepted(f) {
    return ACCEPT.test(f.type) || /\.(heic|heif|hif|jpe?g|png|webp|avif|gif|bmp)$/i.test(f.name || '');
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList).filter(accepted);
    if (!incoming.length) return;
    for (const file of incoming) {
      const it = {
        id: ++seq, file, name: file.name || 'image', origSize: file.size,
        status: 'queued', result: null, error: '', srcUrl: null, outUrl: null, el: null, showCmp: false
      };
      items.push(it);
      renderItem(it);
    }
    els.empty.hidden = true;
    els.zip.hidden = false; els.clear.hidden = false;
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
    for (const it of items) {
      it.status = 'working'; it.error = ''; paint(it);
      (async () => {
        const res = await run({ file: it.file, ...s });
        if (gen !== generation) return;            // superseded
        if (res.ok) {
          if (it.outUrl) URL.revokeObjectURL(it.outUrl);
          it.result = res;
          it.outUrl = URL.createObjectURL(res.blob);
          it.status = 'done';
        } else {
          it.status = 'error';
          it.error = res.error || 'Could not process this file';
        }
        paint(it); updateSummary();
      })();
    }
  }

  const reprocess = debounce(() => { if (items.length) processAll(); }, 350);
  function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

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
    li.querySelector('.fname').textContent = it.name;
    // thumbnail from the original (HEIC will not preview natively; that is fine)
    it.srcUrl = URL.createObjectURL(it.file);
    const img = li.querySelector('.thumb');
    img.src = it.srcUrl;
    img.onerror = () => { img.removeAttribute('src'); };
    paint(it);
  }

  function paint(it) {
    if (!it.el) return;
    const sizes = it.el.querySelector('.sizes');
    const dims = it.el.querySelector('.dims');
    const acts = it.el.querySelector('.acts');
    const bar = it.el.querySelector('.prog i');
    it.el.classList.toggle('failed', it.status === 'error');

    // 'queued' must be handled too: without it this fell through to the
    // done branch and dereferenced a null result.
    if (it.status === 'queued' || it.status === 'working') {
      const label = it.status === 'queued' ? 'waiting…' : 'working…';
      sizes.innerHTML = fmtBytes(it.origSize) + ' <span class="status">· ' + label + '</span>';
      dims.textContent = '';
      bar.style.width = it.status === 'queued' ? '8%' : '45%';
      acts.innerHTML = ''; addRemove(acts, it);
      return;
    }
    if (!it.result) { sizes.textContent = fmtBytes(it.origSize); return; }
    if (it.status === 'error') {
      sizes.innerHTML = fmtBytes(it.origSize) + ' <span class="status err">· ' + esc(it.error) + '</span>';
      dims.textContent = ''; bar.style.width = '0'; acts.innerHTML = '';
      addRemove(acts, it);
      return;
    }

    const r = it.result;
    const pct = Math.round((1 - r.blob.size / it.origSize) * 100);
    const grew = r.blob.size >= it.origSize;
    sizes.innerHTML = fmtBytes(it.origSize) + ' → ' + fmtBytes(r.blob.size) +
      ' <span class="' + (grew ? 'grew' : 'save') + '">' +
      (grew ? '+' + Math.abs(pct) + '% larger' : pct + '% smaller') + '</span>';
    dims.textContent = r.origWidth + '×' + r.origHeight +
      (r.width !== r.origWidth ? ' → ' + r.width + '×' + r.height : '') +
      (r.quality ? ' · q' + Math.round(r.quality * 100) : '') +
      (r.missedTarget ? ' · target not reached' : '');
    if (r.note) dims.textContent += ' · ' + r.note;
    bar.style.width = Math.max(0, Math.min(100, grew ? 100 : pct)) + '%';

    acts.innerHTML = '';
    const dl = document.createElement('a');
    dl.className = 'btn-action'; dl.textContent = 'Download';
    dl.href = it.outUrl; dl.download = baseName(it.name) + '.' + extFor(settings().type);
    acts.appendChild(dl);
    const cmp = document.createElement('button');
    cmp.className = 'btn-action'; cmp.textContent = it.showCmp ? 'Hide' : 'Compare';
    cmp.onclick = () => { it.showCmp = !it.showCmp; renderCompare(it); cmp.textContent = it.showCmp ? 'Hide' : 'Compare'; };
    acts.appendChild(cmp);
    addRemove(acts, it);
    if (it.showCmp) renderCompare(it);
  }

  function addRemove(acts, it) {
    const rm = document.createElement('button');
    rm.className = 'btn-action'; rm.textContent = 'Remove';
    rm.onclick = () => {
      const i = items.indexOf(it); if (i > -1) items.splice(i, 1);
      if (it.srcUrl) URL.revokeObjectURL(it.srcUrl);
      if (it.outUrl) URL.revokeObjectURL(it.outUrl);
      it.el.remove(); updateSummary();
      if (!items.length) { els.empty.hidden = false; els.zip.hidden = true; els.clear.hidden = true; }
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
      '<div class="cmplabels"><span>ORIGINAL ' + fmtBytes(it.origSize) + '</span><span>COMPRESSED ' + fmtBytes(it.result.blob.size) + '</span></div>';
    it.el.appendChild(box);
    const wrap = box.querySelector('.cmpwrap');
    wrap.querySelector('.base').src = it.srcUrl;
    const afterImg = box.querySelector('.after img');
    afterImg.src = it.outUrl;
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
    const done = items.filter(i => i.status === 'done' && i.result);
    if (!items.length) { els.summary.textContent = ''; return; }
    const before = done.reduce((a, i) => a + i.origSize, 0);
    const after = done.reduce((a, i) => a + i.result.blob.size, 0);
    const pct = before ? Math.round((1 - after / before) * 100) : 0;
    els.summary.innerHTML = done.length + ' of ' + items.length + ' ready · ' +
      fmtBytes(before) + ' → ' + fmtBytes(after) + ' · <b>' + pct + '% smaller</b>';
    els.live.textContent = done.length + ' of ' + items.length + ' images ready, ' + pct + ' percent smaller.';
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

  async function downloadZip() {
    const done = items.filter(i => i.status === 'done' && i.result);
    if (!done.length) return;
    els.zip.disabled = true; els.zip.textContent = 'Packaging…';
    const ext = extFor(settings().type), seen = {};
    const files = [];
    for (const it of done) {
      let n = baseName(it.name) + '.' + ext;
      if (seen[n]) { n = baseName(it.name) + '-' + (++seen[baseName(it.name)]) + '.' + ext; }
      else { seen[n] = 1; seen[baseName(it.name)] = 1; }
      files.push({ name: n, data: new Uint8Array(await it.result.blob.arrayBuffer()) });
    }
    const blob = buildZip(files);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'indi-tools-images.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    els.zip.disabled = false; els.zip.textContent = 'Download all (.zip)';
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  /* ── presets ───────────────────────────────────────────────── */
  const PRESETS = {
    email:    { mode: 'size', target: 5,   unit: 1048576, maxw: '', maxh: '' },
    web:      { mode: 'size', target: 200, unit: 1024, maxw: 1920, maxh: '' },
    thumb:    { mode: 'size', target: 60,  unit: 1024, maxw: 400,  maxh: 400 },
    avatar:   { mode: 'size', target: 80,  unit: 1024, maxw: 512,  maxh: 512 },
    whatsapp: { mode: 'size', target: 100, unit: 1024, maxw: 1600, maxh: '' }
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
    const f = Array.from(e.clipboardData.files || []);
    if (f.length) addFiles(f);
  });

  [els.fmt, els.mode].forEach(group => group.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    setSeg(group, b.dataset.v); syncUI(); reprocess();
  }));
  [els.target, els.unit, els.pct, els.q, els.maxw, els.maxh, els.bg].forEach(el =>
    el.addEventListener('input', () => { syncUI(); if (el === els.bg) els.bghex.value = els.bg.value.toUpperCase(); reprocess(); }));
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
    syncUI(); reprocess();
  }));

  els.zip.addEventListener('click', downloadZip);
  els.clear.addEventListener('click', () => {
    items.forEach(i => { if (i.srcUrl) URL.revokeObjectURL(i.srcUrl); if (i.outUrl) URL.revokeObjectURL(i.outUrl); i.el.remove(); });
    items.length = 0; els.empty.hidden = false; els.zip.hidden = true; els.clear.hidden = true; updateSummary();
  });

  // AVIF encoding is not available everywhere; only offer it if it works.
  (function detectAvif() {
    const c = document.createElement('canvas'); c.width = c.height = 4;
    if (c.toDataURL('image/avif').startsWith('data:image/avif')) $('#fmt-avif').hidden = false;
  })();

  syncUI();
})();
