/* ─── QR generator: UI ───────────────────────────────────────── */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const P = window.QRPayloads;

  let type = 'url', ecc = 'M', logoImg = null, current = null;

  const FIELDS = ['url','text','upiId','upiName','upiAmount','upiNote','ssid','wifiPass','wifiAuth',
    'vName','vPhone','vEmail','vOrg','vTitle','vUrl','to','subject','body','smsTo','smsBody','tel','lat','lng'];

  function values() {
    const v = {};
    FIELDS.forEach(f => { const el = $('#' + f); if (el) v[f] = el.value; });
    v.wifiHidden = $('#wifiHidden').checked;
    return v;
  }

  /* ── contrast: a pale code on a pale background will not scan ── */
  function lum(hex) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  /* ── build ─────────────────────────────────────────────────── */
  function build() {
    const data = P.BUILD[type](values());
    const warn = $('#warn');

    if (!data) {
      $('#qr-out').innerHTML = '<p class="empty">Fill something in and the code appears here.</p>';
      $('#meta').textContent = ''; $('#dl').hidden = true; $('#payload').hidden = true;
      warn.hidden = true; current = null;
      return;
    }

    const fg = $('#fg').value, bg = $('#bg').value;
    const level = logoImg ? 'H' : ecc;

    // typeNumber 0 lets the library pick the smallest version that fits
    let qr;
    try {
      qr = qrcode(0, level);
      qr.addData(data);
      qr.make();
    } catch (e) {
      $('#qr-out').innerHTML = '<p class="empty">That is too much data for one QR code. Shorten it, or drop the error correction to L.</p>';
      $('#meta').textContent = ''; $('#dl').hidden = true; current = null;
      warn.hidden = true;
      return;
    }

    const n = qr.getModuleCount();
    const quiet = $('#quiet').checked ? 4 : 0;
    const size = n + quiet * 2;

    let rects = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) rects += '<rect x="' + (c + quiet) + '" y="' + (r + quiet) + '" width="1" height="1"/>';
      }
    }

    let logoSvg = '';
    if (logoImg) {
      // 22% of the width is comfortably inside what level H can lose
      const lw = size * 0.22, off = (size - lw) / 2, pad = lw * 0.1;
      logoSvg = '<rect x="' + (off - pad) + '" y="' + (off - pad) + '" width="' + (lw + pad * 2) +
                '" height="' + (lw + pad * 2) + '" rx="' + (lw * 0.12) + '" fill="' + bg + '"/>' +
                '<image x="' + off + '" y="' + off + '" width="' + lw + '" height="' + lw +
                '" href="' + logoImg + '" preserveAspectRatio="xMidYMid slice"/>';
    }

    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size +
      '" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="' + size + '" height="' + size +
      '" fill="' + bg + '"/><g fill="' + fg + '">' + rects + '</g>' + logoSvg + '</svg>';

    $('#qr-out').innerHTML = '<div class="qrframe" style="background:' + bg + '">' + svg + '</div>';
    current = { svg, size, modules: n, data, level };

    const advice = P.printAdvice(n);
    $('#meta').innerHTML = 'Version ' + ((n - 17) / 4) + ' · ' + n + '×' + n + ' modules · level ' + level +
      '<br>' + data.length + ' characters · print at least ' + advice.minPrintMm + 'mm wide';

    // warnings that actually affect whether it scans
    const ratio = contrast(fg, bg);
    const msgs = [];
    if (ratio < 3) msgs.push('Not enough contrast between the two colours (' + ratio.toFixed(1) + ':1). Many scanners will fail. Aim for 7:1 or more.');
    else if (ratio < 7) msgs.push('Contrast is a little low (' + ratio.toFixed(1) + ':1). It will usually scan, but darker is safer.');
    if (lum(fg) > lum(bg)) msgs.push('The code is lighter than its background. Most scanners expect dark on light and some will refuse to read this.');
    if (!$('#quiet').checked) msgs.push('Without the quiet border, scanners often miss the edges of the code.');
    if (n > 57) msgs.push('This is a large code. Keep it big when printing, or shorten the data.');
    warn.innerHTML = msgs.join('<br>');
    warn.hidden = !msgs.length;
    warn.className = 'warn' + (ratio < 3 || lum(fg) > lum(bg) ? ' bad' : '');

    $('#payload').textContent = data;
    $('#payload').hidden = false;
    $('#dl').hidden = false;
    $('#ecc-hint').textContent = logoImg
      ? 'Forced to H while a logo is in the middle.'
      : { L:'Survives about 7% damage. Smallest code.', M:'Survives about 15%. A good default.',
          Q:'Survives about 25%. For stickers and labels that get scuffed.',
          H:'Survives about 30%. Needed if you cover the middle with a logo.' }[ecc];
    $('#contrast-note').textContent = ratio.toFixed(1) + ':1';
    $('#live').textContent = 'QR code ready, ' + n + ' by ' + n + ' modules.';
  }

  /* ── downloads ─────────────────────────────────────────────── */
  function svgBlob() { return new Blob([current.svg], { type: 'image/svg+xml' }); }

  function save(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function toPng(px) {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(current.svg)));
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; });
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(img, 0, 0, px, px);
    return new Promise(r => c.toBlob(r, 'image/png'));
  }

  $('#dl-svg').addEventListener('click', () => { if (current) save(svgBlob(), 'qr-code.svg'); });
  $('#dl-png').addEventListener('click', async () => {
    if (!current) return;
    // round up to a whole number of pixels per module so edges stay crisp
    const px = Math.max(512, Math.ceil(1024 / current.size) * current.size);
    save(await toPng(px), 'qr-code.png');
  });
  $('#copy').addEventListener('click', async () => {
    if (!current) return;
    const btn = $('#copy');
    try {
      const blob = await toPng(1024);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      btn.textContent = 'Copied';
    } catch (e) { btn.textContent = 'Copy failed'; }
    setTimeout(() => { btn.textContent = 'Copy image'; }, 1600);
  });

  /* ── wiring ────────────────────────────────────────────────── */
  $('#types').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    type = b.dataset.t;
    document.querySelectorAll('#types button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    document.querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== type);
    build();
  });

  $('#ecc').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    ecc = b.dataset.e;
    document.querySelectorAll('#ecc button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    build();
  });

  FIELDS.forEach(f => { const el = $('#' + f); if (el) el.addEventListener('input', build); });
  ['wifiAuth'].forEach(f => $('#' + f).addEventListener('change', build));
  ['wifiHidden','quiet'].forEach(f => $('#' + f).addEventListener('change', build));
  ['fg','bg'].forEach(f => $('#' + f).addEventListener('input', build));

  $('#logo').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) { logoImg = null; build(); return; }
    const fr = new FileReader();
    fr.onload = () => {
      logoImg = fr.result;
      document.querySelectorAll('#ecc button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.e === 'H')));
      ecc = 'H';
      build();
    };
    fr.readAsDataURL(file);
  });

  build();
})();
