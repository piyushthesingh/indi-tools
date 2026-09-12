/* ─── Rent vs Buy: UI ────────────────────────────────────────── */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const RB = window.RentBuy;

  const IDS = ['price','downPct','buyCostPct','loanRate','tenureYears','upkeepPct','sellCostPct',
               'rentMonthly','rentInflation','hraExemptAnnual','appreciation','investReturn','horizon'];

  const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const money = n => '₹' + inr.format(Math.round(n || 0));
  function big(n) {
    const a = Math.abs(n);
    if (a >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (a >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L';
    return money(n);
  }

  const num = el => +String(el.value).replace(/[^\d.-]/g, '') || 0;

  function read() {
    const o = {};
    IDS.forEach(id => o[id] = num($('#' + id)));
    o.regime = $('#regime').value;
    o.marginalRate = +$('#marginalRate').value;
    o.cap24b = 200000;
    o.cap80C = +$('#c80').value;
    o.horizon = Math.max(1, Math.min(40, o.horizon));
    o.tenureYears = Math.max(1, Math.min(40, o.tenureYears));
    o.downPct = Math.min(100, Math.max(0, o.downPct));
    return o;
  }

  /* ── chart ─────────────────────────────────────────────────── */
  let lastRows = null, lastBreakEven = null;

  function drawChart(rows, breakEven) {
    lastRows = rows; lastBreakEven = breakEven;
    const el = $('#chart');

    /* Size the viewBox to the box the SVG actually occupies, so one unit
       is one CSS pixel and font-size 10 renders at 10px. With the old
       fixed 720-wide viewBox, a 306px-wide phone scaled everything by
       0.425 and the axis labels came out 5px tall. */
    const W = Math.max(260, Math.round(el.getBoundingClientRect().width) || 720);
    /* 2.4:1 reads well wide, but at phone widths that is a 127px sliver,
       so the chart is allowed to get proportionally taller as it narrows. */
    const H = Math.round(Math.min(300, Math.max(200, W * 0.42)));
    el.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    const PAD = { l: 58, r: 14, t: 14, b: 26 };
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    const maxY = Math.max(...rows.map(r => Math.max(r.buyNet, r.rentNet)), 1);
    const minY = Math.min(...rows.map(r => Math.min(r.buyNet, r.rentNet)), 0);
    const x = i => PAD.l + (rows.length === 1 ? 0 : (i / (rows.length - 1)) * iw);
    const y = v => PAD.t + ih - ((v - minY) / (maxY - minY || 1)) * ih;
    const path = key => rows.map((r, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(r[key]).toFixed(1)).join(' ');

    let g = '';
    // horizontal guides
    for (let k = 0; k <= 4; k++) {
      const v = minY + (maxY - minY) * (k / 4), yy = y(v);
      g += '<line x1="' + PAD.l + '" y1="' + yy.toFixed(1) + '" x2="' + (W - PAD.r) + '" y2="' + yy.toFixed(1) +
           '" stroke="var(--line)" stroke-width="1"/>' +
           '<text x="' + (PAD.l - 8) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end" font-size="10" ' +
           'font-family="var(--mono)" fill="var(--faint)">' + big(v) + '</text>';
    }
    // year ticks
    const step = Math.max(1, Math.round(rows.length / 6));
    for (let i = 0; i < rows.length; i += step) {
      g += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" ' +
           'font-family="var(--mono)" fill="var(--faint)">' + rows[i].year + '</text>';
    }
    if (breakEven) {
      const bx = x(breakEven - 1);
      g += '<line x1="' + bx.toFixed(1) + '" y1="' + PAD.t + '" x2="' + bx.toFixed(1) + '" y2="' + (PAD.t + ih) +
           '" stroke="var(--t4-ink)" stroke-width="1.5" stroke-dasharray="4 4"/>';
    }
    g += '<path d="' + path('rentNet') + '" fill="none" stroke="var(--t2-ink)" stroke-width="2.5" stroke-linejoin="round"/>';
    g += '<path d="' + path('buyNet')  + '" fill="none" stroke="var(--t3-ink)" stroke-width="2.5" stroke-linejoin="round"/>';
    $('#chart').innerHTML = g;
  }

  /* ── the sticky answer bar (phone only) ────────────────────── */
  /* The card version is a sentence and a half, which does not fit a
     44px bar, so the same fact is said in a few words. */
  function setPeek(text, emi) {
    const v = $('#peek-v');
    if (!v) return;
    v.textContent = emi ? text + '  \u00b7  EMI ' + emi : text;
  }

  /* Hide the bar whenever the real verdict is on screen, since two copies
     of the same answer at once is just clutter.

     This reads the position directly on scroll rather than observing the
     card. An IntersectionObserver's first callback fired before the chart
     and the year-by-year table had rendered, while the page was still
     short enough that the verdict genuinely was on screen, so it hid the
     bar and then had no scroll event to correct itself. The bar never
     appeared on load, which was the one thing it existed to do. */
  function syncPeek() {
    const bar = $('#peek'), card = $('#verdict');
    if (!bar || !card) return;
    const r = card.getBoundingClientRect();
    bar.hidden = r.top < window.innerHeight * 0.9 && r.bottom > 0;
  }

  function initPeek() {
    const bar = $('#peek'), card = $('#verdict');
    if (!bar || !card) return;
    bar.addEventListener('click', () => card.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    window.addEventListener('scroll', syncPeek, { passive: true });
  }

  /* ── render ────────────────────────────────────────────────── */
  function recalc() {
    const inp = read();
    const r = RB.project(inp);
    const last = r.final;

    $('#down-abs').textContent = money(r.down);
    $('#price-words').textContent = big(inp.price);
    $('#upkeep-abs').textContent = 'About ' + money(inp.price * inp.upkeepPct / 100)
      + ' in year one: society charges, repairs, property tax and insurance';
    const yieldPct = inp.price ? (inp.rentMonthly * 12 / inp.price) * 100 : 0;
    $('#yield-hint').textContent = yieldPct.toFixed(1) + '% rental yield';
    $('#regime-hint').textContent = inp.regime === 'new'
      ? 'The new regime allows no 24(b) or 80C benefit on a self-occupied home, so the deduction is worth nothing here.'
      : 'Interest up to ₹2 lakh under 24(b) and principal within the ₹1.5 lakh 80C limit.';

    $('#k-emi').textContent = money(r.emi);
    $('#k-upfront').textContent = big(r.down + r.buyCosts);
    $('#k-tax').textContent = big(r.totals.taxSaved)
      + (r.totals.rentTaxSaved ? '  vs ' + big(r.totals.rentTaxSaved) : '');
    $('#k-int').textContent = big(r.totals.interest);

    const box = $('#verdict');
    const gap = last ? last.advantage : 0;

    // An empty or zero price is a normal state while typing, and every
    // figure is zero, so say nothing rather than declaring a winner.
    if (!inp.price || !inp.rentMonthly) {
      box.classList.remove('rent');
      $('#head').textContent = 'Enter a property price and a rent to compare.';
      $('#why').textContent = !inp.price
        ? 'Nothing to work out yet.'
        : 'Add what you would pay in rent for something similar.';
      setPeek(!inp.price ? 'Enter a property price' : 'Add a monthly rent', '');
      drawChart(r.rows, null);
      $('#sens').textContent = '';
      renderTable(r);
      return;
    }

    if (r.breakEven) {
      box.classList.remove('rent');
      const rentYears = r.breakEven - 1;
      $('#head').innerHTML = rentYears <= 0
        ? 'Buying is ahead from <b>the first year</b>.'
        : 'Renting wins for the first <b>' + rentYears + (rentYears === 1 ? ' year' : ' years')
          + '</b>. After that, buying pulls ahead.';
      $('#why').textContent = 'From year ' + r.breakEven + ' onwards the house is the better financial call, and by year '
        + inp.horizon + ' buying is ahead by ' + big(Math.abs(gap)) + '. Sell before then and the '
        + Math.round(inp.buyCostPct + inp.sellCostPct) + '% lost to stamp duty and selling costs will not have been earned back.';
      setPeek(rentYears <= 0 ? 'Buying wins from year 1'
        : 'Renting wins to year ' + rentYears, money(r.emi));
    } else {
      box.classList.add('rent');
      $('#head').innerHTML = 'Renting stays ahead for all <b>' + inp.horizon + ' years</b>.';
      $('#why').textContent = 'Buying never catches up here, mostly because your money compounds at '
        + inp.investReturn + '% invested against ' + inp.appreciation + '% in the property. By year ' + inp.horizon
        + ' renting and investing leaves you ' + big(Math.abs(gap)) + ' better off. Close that '
        + (inp.investReturn - inp.appreciation).toFixed(1) + ' point gap and the answer changes quickly.';
      setPeek('Renting stays ahead ' + inp.horizon + ' yrs', money(r.emi));
    }

    drawChart(r.rows, r.breakEven);
    renderSensitivity(inp, r);
    renderTable(r);
    $('#live').textContent = r.breakEven ? 'Buying overtakes renting in year ' + r.breakEven
                                         : 'Renting stays ahead for the whole period.';
    syncPeek();
  }

  /* How far one assumption has to move before the answer flips. */
  function renderSensitivity(inp, r) {
    const bits = [];
    const appn = RB.sensitivity(inp, 'appreciation', Math.max(0, inp.appreciation - 3), inp.appreciation + 3, 1);
    const flip = appn.find(a => a.breakEven && (!r.breakEven || a.breakEven < r.breakEven));
    if (!r.breakEven) {
      const first = appn.find(a => a.breakEven);
      bits.push(first
        ? 'Property growth would need to reach about <b>' + first.value + '%</b> a year before buying breaks even inside ' + inp.horizon + ' years.'
        : 'Even at ' + (inp.appreciation + 3) + '% property growth, buying does not catch up over this period.');
      const ret = RB.sensitivity(inp, 'investReturn', Math.max(1, inp.investReturn - 5), inp.investReturn, 1);
      const rf = ret.find(a => a.breakEven);
      if (rf) bits.push('Or your investments would have to return <b>' + rf.value + '%</b> or less.');
    } else {
      if (flip && flip.value !== inp.appreciation)
        bits.push('At <b>' + flip.value + '%</b> property growth the break-even moves to year <b>' + flip.breakEven + '</b>.');
      const worse = appn.filter(a => a.value < inp.appreciation);
      const gone = worse.find(a => !a.breakEven);
      if (gone) bits.push('Drop property growth to <b>' + gone.value + '%</b> and buying never catches up.');
      const other = inp.regime === 'old' ? 'new' : 'old';
      const alt = RB.project({ ...inp, regime: other });
      if (alt.breakEven !== r.breakEven)
        bits.push('Under the ' + other + ' regime it would be year <b>' + (alt.breakEven || 'never') + '</b>.');
    }
    bits.push('These projections are only as good as the two growth rates you typed. Treat the direction as the answer, not the exact year.');
    $('#sens').innerHTML = bits.join(' ');
  }

  function renderTable(r) {
    const head = '<thead><tr><th>Year</th><th>EMI + upkeep</th><th>Rent</th><th>Tax saved</th>' +
                 '<th>Net worth buying</th><th>Net worth renting</th></tr></thead>';
    const body = r.rows.map(x =>
      '<tr' + (x.year === r.breakEven ? ' class="flip"' : '') + '><td>' + x.year + '</td>' +
      '<td>' + money(x.emiPaid + x.upkeep) + '</td><td>' + money(x.rentPaid) + '</td>' +
      '<td>' + (x.taxSaved ? money(x.taxSaved) : '—') + '</td>' +
      '<td>' + big(x.buyNet) + '</td><td>' + big(x.rentNet) + '</td></tr>').join('');
    $('#tbl').innerHTML = head + '<tbody>' + body + '</tbody>';
  }


  /* Eight digits in a row are unreadable, so the money fields carry Indian
     grouping as you type. The caret is measured from the end of the string,
     which keeps it in place as separators appear and disappear. */
  function formatCommas(el) {
    const digits = el.value.replace(/[^\d]/g, '');
    const fromEnd = el.value.length - (el.selectionStart || 0);
    el.value = digits ? Number(digits).toLocaleString('en-IN') : '';
    const pos = Math.max(0, el.value.length - fromEnd);
    try { el.setSelectionRange(pos, pos); } catch (e) {}
  }

  document.querySelectorAll('[data-comma]').forEach(el => {
    el.addEventListener('input', () => formatCommas(el));
    el.addEventListener('blur', () => formatCommas(el));
  });

  IDS.forEach(id => $('#' + id).addEventListener('input', recalc));
  ['regime','marginalRate','c80'].forEach(id => $('#' + id).addEventListener('change', recalc));

  /* The viewBox now depends on the rendered width, so a rotation or a
     window resize has to redraw. Nothing else on the page needs it. */
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (lastRows) drawChart(lastRows, lastBreakEven); syncPeek(); }, 150);
  });

  initPeek();
  recalc();
  /* The chart and table change the page height after the first render, so
     settle the bar once layout is final. */
  window.addEventListener('load', syncPeek);
  setTimeout(syncPeek, 0);
})();
