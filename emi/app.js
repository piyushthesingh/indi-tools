/* ─────────────────────────────────────────────────────────────
   indi.tools: EMI calculator
   State is {principal, annualRate, months}. EMI is derived from those,
   so the EMI control and the tenure control are two views of the same
   variable: move either and the other follows, exactly.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);

  const MIN_MONTHS = 1, MAX_MONTHS = 360;
  const state = { P: 1000000, rate: 6.5, months: 60 };
  let unit = 'y', amortMode = 'year', lastRows = [];
  const openYears = new Set();

  const el = {
    amtN: $('#amt-n'), amtR: $('#amt-r'), amtHelp: $('#amt-help'),
    rateN: $('#rate-n'), rateR: $('#rate-r'),
    tenN: $('#ten-n'), tenR: $('#ten-r'), tenUnit: $('#ten-unit'), tenHelp: $('#ten-help'),
    emiN: $('#emi-n'), emiR: $('#emi-r'), emiMin: $('#emi-min'), emiMax: $('#emi-max'),
    emiAlert: $('#emi-alert'), emiFlag: $('#emi-flag'),
    outEmi: $('#out-emi'), outTenure: $('#out-tenure'),
    outP: $('#out-p'), outI: $('#out-i'), outT: $('#out-t'), outRatio: $('#out-ratio'),
    lgP: $('#lg-p'), lgI: $('#lg-i'), arcP: $('#arc-p'), arcI: $('#arc-i'),
    body: $('#amort-body'), live: $('#live'),
    details: $('#amort-details'), amortMeta: $('#amort-meta')
  };

  /* ── money ─────────────────────────────────────────────────── */
  const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money  = n => '₹' + inr0.format(Math.round(n));
  const money2 = n => '₹' + inr2.format(n);
  function words(n) {
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(n % 1e7 ? 2 : 0) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(n % 1e5 ? 2 : 0) + ' Lakh';
    if (n >= 1e3) return '₹' + (n / 1e3).toFixed(0) + ' K';
    return '₹' + n;
  }
  function tenureWords(m) {
    const y = Math.floor(m / 12), mo = m % 12;
    if (!y) return mo + (mo === 1 ? ' month' : ' months');
    if (!mo) return y + (y === 1 ? ' year' : ' years');
    return y + 'y ' + mo + 'm';
  }

  /* ── the maths ─────────────────────────────────────────────── */
  const monthly = r => r / 12 / 100;

  function emiFor(P, rate, n) {
    const r = monthly(rate);
    if (r === 0) return P / n;
    const f = Math.pow(1 + r, n);
    return P * r * f / (f - 1);
  }

  /* Inverse: how many months does a given EMI take to clear the loan?
     If the instalment does not exceed one month's interest, the balance
     never falls and the loan is never repaid, so this returns null. */
  function monthsFor(P, rate, emi) {
    const r = monthly(rate);
    if (r === 0) return P / emi;
    if (emi <= P * r) return null;
    return -Math.log(1 - (P * r) / emi) / Math.log(1 + r);
  }

  function schedule(P, rate, n) {
    const r = monthly(rate);
    const emi = emiFor(P, rate, n);
    const rows = [];
    let bal = P, paid = 0;
    for (let m = 1; m <= n; m++) {
      const interest = bal * r;
      let principal = emi - interest;
      let payment = emi;
      if (m === n || principal > bal) {   // last instalment absorbs the rounding
        principal = bal;
        payment = bal + interest;
      }
      bal = Math.max(0, bal - principal);
      paid += principal;
      rows.push({ m, principal, interest, payment, balance: bal, pctPaid: (paid / P) * 100 });
      if (bal <= 0) break;
    }
    return rows;
  }

  /* ── EMI control maps to months on a reversed log scale, so every
        slider position is a tenure that actually exists ───────── */
  /* The control is linear in months and reversed, so dragging right
     shortens the loan and raises the EMI. Linear in rupees would put
     every tenure over a year into the leftmost 2% of the track. */
  const SLIDER_MAX = MAX_MONTHS - MIN_MONTHS;
  function monthsFromSlider(v) { return clampNum(MAX_MONTHS - Math.round(+v), MIN_MONTHS, MAX_MONTHS); }
  function sliderFromMonths(m) { return MAX_MONTHS - m; }
  function clampNum(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /* ── render ────────────────────────────────────────────────── */
  let syncing = false;

  function render(source) {
    syncing = true;
    const { P, rate, months } = state;
    const emi = emiFor(P, rate, months);
    const rows = schedule(P, rate, months);
    const totalPaid = rows.reduce((a, r) => a + r.payment, 0);
    const totalInterest = totalPaid - P;

    // inputs
    if (source !== 'amtN') el.amtN.value = Math.round(P);
    if (source !== 'amtR') el.amtR.value = Math.min(+el.amtR.max, P);
    if (source !== 'rateN') el.rateN.value = rate;
    if (source !== 'rateR') el.rateR.value = Math.min(+el.rateR.max, rate);
    if (source !== 'tenN') el.tenN.value = unit === 'y' ? +(months / 12).toFixed(2).replace(/\.00$/, '') : months;
    if (source !== 'tenR') el.tenR.value = months;
    if (source !== 'emiN') el.emiN.value = Math.round(emi);
    if (source !== 'emiR') el.emiR.value = sliderFromMonths(months);

    el.tenUnit.textContent = unit === 'y' ? 'Yr' : 'Mo';
    el.amtHelp.textContent = words(P);
    el.tenHelp.textContent = tenureWords(months);
    el.emiMin.textContent = money(emiFor(P, rate, MAX_MONTHS)) + ' (30 yr)';
    el.emiMax.textContent = money(emiFor(P, rate, MIN_MONTHS)) + ' (1 mo)';

    // results
    el.outEmi.textContent = money(emi);
    el.outTenure.textContent = 'over ' + tenureWords(months) + ' · ' + months + ' instalments';
    el.outP.textContent = money(P);
    el.outI.textContent = money(totalInterest);
    el.outT.textContent = money(totalPaid);
    el.outRatio.textContent = Math.round((totalInterest / P) * 100) + '%';
    el.lgP.textContent = money(P);
    el.lgI.textContent = money(totalInterest);

    const pPct = totalPaid > 0 ? (P / totalPaid) * 100 : 100;
    el.arcP.setAttribute('stroke-dasharray', pPct.toFixed(2) + ' ' + (100 - pPct).toFixed(2));
    el.arcP.setAttribute('stroke-dashoffset', '25');
    el.arcI.setAttribute('stroke-dasharray', (100 - pPct).toFixed(2) + ' ' + pPct.toFixed(2));
    el.arcI.setAttribute('stroke-dashoffset', (25 - pPct).toFixed(2));

    el.live.textContent = 'EMI ' + money(emi) + ' over ' + tenureWords(months);

    // One line of summary is enough while the schedule is closed. Building
    // up to 360 rows on every slider tick is both visually noisy and slow,
    // so the table is only rendered when the section is actually open.
    el.amortMeta.textContent = months + (months === 1 ? ' instalment · ' : ' instalments · ')
      + money(totalInterest) + ' interest';
    lastRows = rows;
    if (el.details.open) renderAmort(rows);

    syncing = false;
  }

  function renderAmort(rows) {
    const frag = document.createDocumentFragment();
    const cell = (v, cls) => { const td = document.createElement('td'); td.textContent = v; if (cls) td.className = cls; return td; };

    function pctCell(pct) {
      const td = document.createElement('td');
      td.className = 'pctcell';
      td.textContent = pct.toFixed(1) + '%';
      const bar = document.createElement('div'); bar.className = 'pctbar';
      const i = document.createElement('i'); i.style.width = Math.min(100, pct) + '%';
      bar.appendChild(i); td.appendChild(bar);
      return td;
    }

    if (amortMode === 'month') {
      for (const r of rows) {
        const tr = document.createElement('tr');
        tr.appendChild(cell('Month ' + r.m));
        tr.appendChild(cell(money2(r.principal)));
        tr.appendChild(cell(money2(r.interest)));
        tr.appendChild(cell(money2(r.payment)));
        tr.appendChild(cell(money2(r.balance)));
        tr.appendChild(pctCell(r.pctPaid));
        frag.appendChild(tr);
      }
    } else {
      const years = {};
      for (const r of rows) {
        const y = Math.ceil(r.m / 12);
        (years[y] = years[y] || []).push(r);
      }
      Object.keys(years).map(Number).sort((a, b) => a - b).forEach(y => {
        const g = years[y];
        const sum = k => g.reduce((a, r) => a + r[k], 0);
        const last = g[g.length - 1];
        const tr = document.createElement('tr');
        tr.className = 'year' + (openYears.has(y) ? ' open' : '');
        tr.tabIndex = 0;
        const first = document.createElement('td');
        first.innerHTML = '<span class="chev">›</span> Year ' + y;
        tr.appendChild(first);
        tr.appendChild(cell(money(sum('principal'))));
        tr.appendChild(cell(money(sum('interest'))));
        tr.appendChild(cell(money(sum('payment'))));
        tr.appendChild(cell(money(last.balance)));
        tr.appendChild(pctCell(last.pctPaid));
        const toggle = () => {
          openYears.has(y) ? openYears.delete(y) : openYears.add(y);
          render();
        };
        tr.addEventListener('click', toggle);
        tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        frag.appendChild(tr);

        if (openYears.has(y)) {
          for (const r of g) {
            const mtr = document.createElement('tr');
            mtr.className = 'month';
            const mn = new Date(2000, (r.m - 1) % 12, 1).toLocaleString('en-IN', { month: 'short' });
            mtr.appendChild(cell(mn + ' · month ' + r.m));
            mtr.appendChild(cell(money2(r.principal)));
            mtr.appendChild(cell(money2(r.interest)));
            mtr.appendChild(cell(money2(r.payment)));
            mtr.appendChild(cell(money2(r.balance)));
            mtr.appendChild(pctCell(r.pctPaid));
            frag.appendChild(mtr);
          }
        }
      });
    }
    el.body.replaceChildren(frag);
  }

  /* ── input handling ────────────────────────────────────────── */
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function setAmount(v, src) { state.P = clamp(v || 0, 1000, 1e9); render(src); }
  function setRate(v, src)   { state.rate = clamp(v || 0, 0, 40); render(src); }
  function setMonths(v, src) { state.months = clamp(Math.round(v) || 1, MIN_MONTHS, MAX_MONTHS); hideAlert(); render(src); }

  function setEmi(v, src) {
    const wanted = +v;
    if (!wanted || wanted <= 0) return;
    const n = monthsFor(state.P, state.rate, wanted);
    if (n === null) {
      const floor = state.P * monthly(state.rate);
      showAlert('At ' + money(wanted) + ' a month you would not even cover the interest of '
        + money2(floor) + ', so the loan would never be repaid. Tenure has been held at 30 years.');
      state.months = MAX_MONTHS;
      render(src);
      return;
    }
    if (n > MAX_MONTHS) {
      showAlert('That EMI would need ' + tenureWords(Math.round(n)) + ', beyond the 30 year maximum. Tenure capped at 30 years.');
      state.months = MAX_MONTHS;
    } else if (n < MIN_MONTHS) {
      showAlert('That EMI clears the loan in under a month. Tenure set to 1 month.');
      state.months = MIN_MONTHS;
    } else {
      const rounded = Math.max(MIN_MONTHS, Math.round(n));
      state.months = rounded;
      const actual = emiFor(state.P, state.rate, rounded);
      // Loans run in whole months, so the instalment lands on the nearest
      // month rather than matching the typed figure exactly.
      if (Math.abs(actual - wanted) >= 1) {
        showNote(money(wanted) + ' works out to ' + n.toFixed(1) + ' months. Rounded to '
          + rounded + ', the instalment is ' + money(actual) + '.');
      } else hideAlert();
    }
    render(src);
  }

  function showAlert(msg) { el.emiAlert.textContent = msg; el.emiAlert.hidden = false; el.emiAlert.className = 'alert'; }
  function showNote(msg)  { el.emiAlert.textContent = msg; el.emiAlert.hidden = false; el.emiAlert.className = 'note'; }
  function hideAlert() { el.emiAlert.hidden = true; }

  const on = (node, ev, fn) => node.addEventListener(ev, e => { if (!syncing) fn(e); });

  on(el.amtR, 'input', () => setAmount(+el.amtR.value, 'amtR'));
  on(el.amtN, 'input', () => setAmount(+el.amtN.value, 'amtN'));
  on(el.rateR, 'input', () => setRate(+el.rateR.value, 'rateR'));
  on(el.rateN, 'input', () => setRate(+el.rateN.value, 'rateN'));
  on(el.tenR, 'input', () => setMonths(+el.tenR.value, 'tenR'));
  on(el.tenN, 'input', () => setMonths(unit === 'y' ? (+el.tenN.value) * 12 : +el.tenN.value, 'tenN'));
  on(el.emiR, 'input', () => { hideAlert(); state.months = monthsFromSlider(+el.emiR.value); flagEmi(); render('emiR'); });
  on(el.emiN, 'input', () => { flagEmi(); setEmi(el.emiN.value, 'emiN'); });

  let flagTimer;
  function flagEmi() {
    el.emiFlag.hidden = false;
    clearTimeout(flagTimer);
    flagTimer = setTimeout(() => { el.emiFlag.hidden = true; }, 1800);
  }

  document.querySelectorAll('.seg [data-u]').forEach(b => b.addEventListener('click', () => {
    unit = b.dataset.u;
    document.querySelectorAll('.seg [data-u]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    el.tenN.step = unit === 'y' ? '0.5' : '1';
    render();
  }));

  document.querySelectorAll('#amort-mode button').forEach(b => b.addEventListener('click', () => {
    amortMode = b.dataset.v;
    document.querySelectorAll('#amort-mode button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));

  // build the table the first time it is opened
  el.details.addEventListener('toggle', () => {
    // Opening always rebuilds from the current numbers, so there is nothing
    // to gain from keeping up to 360 rows in the DOM while it is shut.
    if (el.details.open) renderAmort(lastRows);
    else el.body.replaceChildren();
  });

  el.emiR.max = String(SLIDER_MAX);
  el.emiR.min = '0';
  render();

  // exposed for testing
  window.__emi = { emiFor, monthsFor, schedule, state };
})();
