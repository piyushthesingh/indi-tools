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

  function read() {
    const o = {};
    IDS.forEach(id => o[id] = +$('#' + id).value || 0);
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
  function drawChart(rows, breakEven) {
    const W = 720, H = 300, PAD = { l: 58, r: 14, t: 14, b: 26 };
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

  /* ── render ────────────────────────────────────────────────── */
  function recalc() {
    const inp = read();
    const r = RB.project(inp);
    const last = r.final;

    $('#down-abs').textContent = money(r.down);
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
    } else {
      box.classList.add('rent');
      $('#head').innerHTML = 'Renting stays ahead for all <b>' + inp.horizon + ' years</b>.';
      $('#why').textContent = 'Buying never catches up here, mostly because your money compounds at '
        + inp.investReturn + '% invested against ' + inp.appreciation + '% in the property. By year ' + inp.horizon
        + ' renting and investing leaves you ' + big(Math.abs(gap)) + ' better off. Close that '
        + (inp.investReturn - inp.appreciation).toFixed(1) + ' point gap and the answer changes quickly.';
    }

    drawChart(r.rows, r.breakEven);
    renderSensitivity(inp, r);
    renderTable(r);
    $('#live').textContent = r.breakEven ? 'Buying overtakes renting in year ' + r.breakEven
                                         : 'Renting stays ahead for the whole period.';
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

  IDS.forEach(id => $('#' + id).addEventListener('input', recalc));
  ['regime','marginalRate','c80'].forEach(id => $('#' + id).addEventListener('change', recalc));
  recalc();
})();
