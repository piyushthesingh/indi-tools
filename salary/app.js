/* ─── Take-home salary calculator: UI wiring ─────────────────── */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const FY = '2025-26';
  const R = window.TAX_RULES[FY];
  const E = window.TaxEngine;

  const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const money = n => '₹' + inr.format(Math.round(n || 0));

  /* Typical annual professional tax. It varies by income slab inside each
     state, so this is the usual maximum and the field stays editable. */
  const PT = {
    'Karnataka': 2400, 'Maharashtra': 2500, 'West Bengal': 2500, 'Tamil Nadu': 2500,
    'Telangana': 2400, 'Andhra Pradesh': 2400, 'Gujarat': 2400, 'Madhya Pradesh': 2500,
    'Kerala': 2500, 'Odisha': 2500, 'Assam': 2500, 'Bihar': 2500, 'Jharkhand': 2500,
    'Punjab': 2400, 'Delhi': 0, 'Haryana': 0, 'Uttar Pradesh': 0, 'Rajasthan': 0,
    'Uttarakhand': 0, 'Himachal Pradesh': 0, 'Goa': 0, 'Chandigarh': 0, 'Other / none': 0
  };

  const NUM_IDS = ['basic','da','hra','special','otherAllow','employeePF','employerPF','employerNPS',
                   'bonus','lta','rsuPerquisite','otherIncome','annualRent',
                   's80C','s80CCD1B','s80D_self','s80D_parents','homeLoanInterest','savingsInterest','s80E','s80G'];

  /* ── paste parsing ─────────────────────────────────────────── */
  /* Payslip wording varies endlessly, so match on a normalised form and
     keep the list generous. Anything still unmatched is surfaced in the
     mapping table below rather than silently dropped. */
  const FIELD_LABELS = {
    basic: 'Basic', da: 'Dearness allowance', hra: 'HRA received',
    special: 'Special allowance', otherAllow: 'Other allowances',
    employeePF: 'Employee PF (yours)', employerPF: 'Employer PF',
    employerNPS: 'Employer NPS', bonus: 'Bonus / variable',
    lta: 'LTA', rsuPerquisite: 'RSU value at vesting', otherIncome: 'Other income'
  };

  const SYNONYMS = [
    ['basic',        /\b(basic|base|bsc)\b|basic\s*(pay|salary|wage)|base\s*(pay|salary)/],
    ['da',           /dearness|\bd\.?a\.?\b/],
    ['hra',          /\bh\.?r\.?a\.?\b|house\s*rent|rent\s*allowance/],
    ['employerNPS',  /(employer|company|corporate|organisation).*nps|nps.*(employer|company)/],
    ['employerPF',   /(employer|company|organisation|firm).*(pf|provident|epf)|(pf|provident|epf).*(employer|company)/],
    ['employeePF',   /(employee|own|self|your|my).*(pf|provident|epf)|(pf|provident|epf).*(employee|own|self)|\b(pf|epf|provident)\b/],
    ['rsuPerquisite',/\brsu\b|\besop\b|\bespp\b|stock\s*(award|unit|option)|equity\s*(award|grant)|perquisite/],
    ['lta',          /\bl\.?t\.?[ac]\.?\b|leave\s*travel/],
    ['bonus',        /bonus|bonu\b|variable|\bvar\b|incentive|\bperf\b|performance|ex[\s-]?gratia|commission|retention|joining|\bpli\b/],
    ['otherAllow',   /conveyance|medical|telephone|mobile|fuel|petrol|food|meal|internet|broadband|uniform|books|child\s*education|hostel|shift|city\s*compensatory|transport|attire|driver/],
    ['special',      /special|\bspl\b|\bsplt?\b|flexi|flexible\s*benefit|balance|residual|other\s*allowance|adhoc|ad[\s-]?hoc|\bfbp\b/],
    ['otherIncome',  /interest\s*income|other\s*income|dividend/]
  ];

  /* Two passes: the label as written, then a singularised version. Doing it
     in one pass broke real words, because stripping a trailing "s" turns
     "bonus" into "bonu". */
  function normalise(label) {
    return label.toLowerCase().replace(/[₹()\[\]:*|,."']/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function singularise(n) {
    return n.replace(/\b(\w{2,})s\b/g, (m, w) => /(s|u|i|a)$/.test(w) ? m : w);
  }
  /* "H.R.A." and "D. A." lose their dots in normalise and become "h r a",
     which no longer matches. Collapsing to "hra" catches those. */
  function compact(n) { return n.replace(/[^a-z0-9]/g, ''); }

  let pasteRows = [];   // [{label, value, key}]

  function parsePaste(text) {
    const rows = [];
    let pfSeen = 0;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const nums = line.match(/-?[\d,]+(?:\.\d+)?/g);
      if (!nums) continue;
      const last = nums[nums.length - 1];
      const value = parseFloat(last.replace(/,/g, ''));
      if (!isFinite(value) || value === 0) continue;
      const label = line.slice(0, line.lastIndexOf(last)).trim();
      if (!label || /^[\d\s.,-]*$/.test(label)) continue;

      const n = normalise(label);
      const nSing = singularise(n);
      let key = null;
      const nComp = compact(n);
      for (const [k, re] of SYNONYMS) {
        if (re.test(n) || re.test(nSing) || re.test(nComp)) { key = k; break; }
      }

      /* A bare "PF" line is ambiguous when both halves are listed. Assume the
         first is the employee's and the second the employer's, which is the
         usual order on a payslip, and let the user reassign either. */
      if (key === 'employeePF' && !/employee|own|self|your|my/.test(n)) {
        pfSeen++;
        if (pfSeen === 2) key = 'employerPF';
      }
      rows.push({ label, value, key });
    }
    return rows;
  }

  /* A paste describes the whole salary breakup, so anything it does not
     mention is set to zero. Leaving previous values in place silently
     inflated the gross by components the user never entered. */
  function applyPasteRows() {
    const totals = {};
    for (const r of pasteRows) if (r.key) totals[r.key] = (totals[r.key] || 0) + r.value;
    if (!Object.keys(totals).length) return;      // nothing recognised: leave manual entry alone
    Object.keys(FIELD_LABELS).forEach(k => {
      const el = $('#' + k);
      if (el) el.value = Math.round(totals[k] || 0);
    });
    recalc();
  }

  function renderPasteTable() {
    const wrap = $('#paste-map');
    if (!pasteRows.length) { wrap.innerHTML = ''; wrap.hidden = true; return; }
    wrap.hidden = false;
    const opts = key => ['<option value="">(ignore)</option>']
      .concat(Object.keys(FIELD_LABELS).map(k =>
        '<option value="' + k + '"' + (k === key ? ' selected' : '') + '>' + FIELD_LABELS[k] + '</option>'))
      .join('');
    wrap.innerHTML = '<table class="maptbl"><thead><tr><th>From your paste</th><th>Amount</th><th>Goes to</th></tr></thead><tbody>' +
      pasteRows.map((r, i) =>
        '<tr' + (r.key ? '' : ' class="unmatched"') + '><td>' + escapeHtml(r.label) + '</td>' +
        '<td>' + money(r.value) + '</td>' +
        '<td><select data-i="' + i + '">' + opts(r.key) + '</select></td></tr>').join('') +
      '</tbody></table>';
    wrap.querySelectorAll('select').forEach(sel => sel.addEventListener('change', () => {
      pasteRows[+sel.dataset.i].key = sel.value || null;
      sel.closest('tr').classList.toggle('unmatched', !sel.value);
      applyPasteRows();
      updatePasteInfo();
    }));
  }

  function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  function updatePasteInfo() {
    const info = $('#paste-info');
    if (!pasteRows.length) { info.textContent = 'Or just fill the fields below.'; info.className = 'pasteinfo'; return; }
    const matched = pasteRows.filter(r => r.key).length;
    const missed = pasteRows.length - matched;
    info.textContent = 'Matched ' + matched + ' of ' + pasteRows.length + ' rows'
      + (missed ? '. ' + missed + ' could not be placed, set them below or leave them ignored.' : '.')
      + ' Components not in your paste were set to zero.';
    info.className = 'pasteinfo' + (matched ? ' ok' : '');
  }

  /* ── RSU sale rows ─────────────────────────────────────────── */
  const rsuRows = [];
  function addRsuRow(pre) {
    const row = document.createElement('div');
    row.className = 'rsu-row';
    row.innerHTML =
      '<div class="in"><label>Shares</label><input type="number" data-f="shares" value="' + ((pre && pre.shares) || 100) + '"></div>' +
      '<div class="in"><label>Value at vest (per share)</label><input type="number" data-f="fmvAtVest" value="' + ((pre && pre.fmvAtVest) || 1000) + '"></div>' +
      '<div class="in"><label>Sale price (per share)</label><input type="number" data-f="salePrice" value="' + ((pre && pre.salePrice) || 1500) + '"></div>' +
      '<div class="in"><label>Held (months)</label><input type="number" data-f="holdingMonths" value="' + ((pre && pre.holdingMonths) || 30) + '"></div>' +
      '<div class="in"><label>Market</label><select data-f="market">' +
        '<option value="foreign">Foreign / unlisted</option><option value="listedIndian">Indian listed</option></select></div>' +
      '<button class="btn-action" type="button">Remove</button>';
    row.querySelector('button').onclick = () => { row.remove(); const i = rsuRows.indexOf(row); if (i > -1) rsuRows.splice(i, 1); recalc(); };
    row.querySelectorAll('input,select').forEach(f => f.addEventListener('input', recalc));
    $('#rsu-rows').appendChild(row);
    rsuRows.push(row);
  }
  function readRsu() {
    return rsuRows.map(r => {
      const g = f => r.querySelector('[data-f="' + f + '"]');
      return { shares:+g('shares').value||0, fmvAtVest:+g('fmvAtVest').value||0,
               salePrice:+g('salePrice').value||0, holdingMonths:+g('holdingMonths').value||0,
               market:g('market').value };
    });
  }

  /* ── read the form ─────────────────────────────────────────── */
  function readInputs() {
    const o = {};
    NUM_IDS.forEach(id => { const el = $('#' + id); o[id] = el ? (+el.value || 0) : 0; });
    o.ageBand = $('#ageBand').value;
    o.isMetro = $('#metro').value === '1';
    o.parentsSenior = $('#parentsSenior').checked;
    o.professionalTax = PT[$('#state').value] || 0;
    o.ltaClaimed = $('#ltaClaimed').checked ? o.lta : 0;
    o.pfCountsIn80C = $('#pfCountsIn80C').checked;
    o.rsuSales = readRsu();
    o.superannuation = 0;
    o.gratuity = 0;
    return o;
  }

  /* ── cap hints ─────────────────────────────────────────────── */
  function capHint(elId, value, cap, note) {
    const el = $(elId); if (!el) return;
    if (cap === null) { el.textContent = note || 'No cap'; el.className = 'cap'; return; }
    const hit = value >= cap;
    el.textContent = (hit ? 'Capped at ' : 'Cap ') + money(cap);
    el.className = 'cap' + (hit ? ' hit' : '');
  }


  /* The component ladder. Showing every figure that feeds the gross lets
     someone spot a missing or duplicated line before reading any tax. */
  const COMPONENTS = [
    ['basic','Basic'], ['da','Dearness allowance'], ['hra','HRA'],
    ['special','Special allowance'], ['otherAllow','Other allowances'],
    ['bonus','Bonus / variable'], ['lta','LTA'], ['rsuPerquisite','RSU value at vesting']
  ];

  function renderPackage(inp, r) {
    $('#ctc-total').textContent = money(r.ctc);
    $('#ctc-gross').textContent = money(r.grossSalary);
    const employer = r.employerPF + r.employerNPS;
    $('#ctc-employer').textContent = money(employer);

    const rows = [];
    for (const [k, label] of COMPONENTS) {
      const v = inp[k] || 0;
      rows.push('<tr' + (v ? '' : ' class="zero"') + '><td>' + label + '</td><td>' + money(v) + '</td></tr>');
    }
    rows.push('<tr class="sum"><td>Gross salary</td><td>' + money(r.grossSalary) + '</td></tr>');
    if (inp.employerPF) rows.push('<tr class="emp"><td>+ Employer PF</td><td>' + money(inp.employerPF) + '</td></tr>');
    if (inp.employerNPS) rows.push('<tr class="emp"><td>+ Employer NPS</td><td>' + money(inp.employerNPS) + '</td></tr>');
    rows.push('<tr class="sum"><td>Total CTC</td><td>' + money(r.ctc) + '</td></tr>');
    $('#comp-rows').innerHTML = rows.join('');

    // sanity checks worth flagging at a glance
    const notes = [];
    const basicPct = r.ctc ? (inp.basic / r.ctc) * 100 : 0;
    if (!inp.basic) notes.push('<b>No basic pay entered.</b> Almost every structure has one, and HRA, PF and gratuity are all derived from it.');
    else if (basicPct < 25) notes.push('Basic is <b>' + basicPct.toFixed(0) + '% of CTC</b>, which is unusually low. Most employers keep it between 40% and 50%.');
    else if (basicPct > 60) notes.push('Basic is <b>' + basicPct.toFixed(0) + '% of CTC</b>, which is unusually high.');
    if (inp.hra && !inp.annualRent) notes.push('You receive HRA but have entered no rent, so none of it is exempt.');
    if (!inp.employeePF && inp.basic >= 180000) notes.push('No employee PF entered. Most salaried structures deduct 12% of basic.');
    if (inp.employeePF && inp.basic && inp.employeePF > (inp.basic + inp.da) * 0.5) notes.push('Employee PF looks large relative to basic. Check it is the annual figure.');
    $('#ctc-note').innerHTML = notes.length ? notes.join('<br>') : 'Everything adds up.';

    /* A warning inside a collapsed panel is a warning nobody sees, so flag
       it on the summary row and open the panel the first time one appears. */
    const warn = $('#pkg-warn');
    warn.hidden = !notes.length;
    const details = $('#pkg-details');
    if (notes.length && !warnedOnce) { details.open = true; warnedOnce = true; }
    if (!notes.length) warnedOnce = false;
  }
  let warnedOnce = false;

  /* ── render ────────────────────────────────────────────────── */
  function recalc() {
    const inp = readInputs();
    const senior = inp.ageBand !== 'below60';
    const D = R.deductions;
    capHint('#cap-80c', inp.s80C, D.s80C.cap);
    capHint('#cap-80ccd', inp.s80CCD1B, D.s80CCD1B.cap);
    capHint('#cap-80d', inp.s80D_self, senior ? D.s80D_self.capSenior : D.s80D_self.cap);
    capHint('#cap-80dp', inp.s80D_parents, inp.parentsSenior ? D.s80D_parents.capSenior : D.s80D_parents.cap);
    capHint('#cap-24b', inp.homeLoanInterest, D.s24b.cap);
    capHint('#cap-80tt', inp.savingsInterest, senior ? D.s80TTB.cap : D.s80TTA.cap);
    const npsCap = (inp.basic + inp.da) * (R.employerNPS.oldCap);
    capHint('#cap-nps', inp.employerNPS, Math.round(npsCap), null);

    const old = E.compute(inp, 'old', R);
    const nw  = E.compute(inp, 'new', R);

    renderPackage(inp, old);
    $('#gross-line').textContent = money(old.recurringGross) + ' recurring · '
      + money(old.oneTime) + ' one-time';

    fill('old', old); fill('new', nw);

    const oldWins = old.inHandAnnual > nw.inHandAnnual;
    $('#reg-old').classList.toggle('win', oldWins);
    $('#reg-new').classList.toggle('win', !oldWins);
    $('#win-old').innerHTML = oldWins ? '<span class="badge-win">BETTER</span>' : '';
    $('#win-new').innerHTML = !oldWins ? '<span class="badge-win">BETTER</span>' : '';
    const diff = Math.abs(old.inHandAnnual - nw.inHandAnnual);
    $('#verdict').innerHTML = diff < 1
      ? 'Both regimes leave you with the same amount.'
      : 'The <b>' + (oldWins ? 'old' : 'new') + ' regime</b> leaves you <b>' + money(diff)
        + '</b> more a year, about ' + money(diff / 12) + ' a month.';

    work('#work-old', old, inp); work('#work-new', nw, inp);

    const cg = old.capitalGains;
    $('#rsu-note').textContent = cg.specialIncome || cg.stcgOther
      ? 'Long-term foreign gains taxed at 12.5% with no exemption. Short-term foreign gains ('
        + money(cg.stcgOther) + ') are added to slab income. Indian listed long-term gains get the '
        + money(R.capitalGains.listedIndian.ltcgExempt) + ' exemption.'
      : '';

    $('#live').textContent = 'Monthly in-hand: old regime ' + money(old.inHandMonthly)
      + ', new regime ' + money(nw.inHandMonthly);
    saveState();
  }

  function fill(p, r) {
    $('#' + p + '-month').textContent = money(r.inHandMonthly);
    $('#' + p + '-year').textContent = money(r.inHandAnnual);
    const oneTimeShare = r.grossSalary > 0 ? r.oneTime / r.grossSalary : 0;
    $('#' + p + '-onetime').textContent = money(r.oneTime - r.totalTax * oneTimeShare);
    $('#' + p + '-tax').textContent = money(r.totalTax);
    $('#' + p + '-eff').textContent = (r.grossSalary > 0 ? (r.totalTax / r.grossSalary * 100).toFixed(1) : '0') + '%';
  }

  function work(sel, r, inp) {
    const rows = [];
    const add = (k, v, cls) => rows.push('<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + k + '</td><td>' + (typeof v === 'string' ? v : money(v)) + '</td></tr>');
    add('Gross salary', r.grossSalary, 'h');
    if (r.excessEmployerContrib) add('Employer contributions above ' + money(R.employerContributionExemptCap) + ' (taxable)', r.excessEmployerContrib);
    add('Less: HRA exemption', r.hraEx ? '−' + money(r.hraEx) : '—');
    add('Less: LTA exemption', r.ltaEx ? '−' + money(r.ltaEx) : '—');
    add('Less: standard deduction', '−' + money(r.stdDed));
    add('Less: professional tax', r.profTax ? '−' + money(r.profTax) : '—');
    add('Less: Chapter VI-A', r.chapterVIA ? '−' + money(r.chapterVIA) : '—');
    add('Less: 80CCD(2) employer NPS', r.nps80CCD2 ? '−' + money(r.nps80CCD2) : '—');
    if (inp.otherIncome) add('Add: other income', inp.otherIncome);
    if (r.capitalGains.stcgOther) add('Add: short-term foreign gains', r.capitalGains.stcgOther);
    add('Taxable income (slab)', r.slabIncome, 'h');
    add('Tax on slab income', r.normalTax);
    if (r.capitalGains.specialTax) add('Tax on capital gains (special rates)', r.capitalGains.specialTax);
    if (r.rebate) add('Less: rebate u/s 87A', '−' + money(r.rebate));
    if (r.rebateMarginal) add('Less: 87A marginal relief', '−' + money(r.rebateMarginal));
    if (r.surcharge) add('Surcharge at ' + Math.round(r.surchargeRate * 100) + '%', r.surcharge);
    if (r.marginalRelief) add('Less: surcharge marginal relief', '−' + money(r.marginalRelief));
    add('Health &amp; education cess at 4%', r.cess);
    add('Total tax', r.totalTax, 'h');
    add('Less: your PF contribution', '−' + money(r.employeePF));
    add('In-hand for the year', r.inHandAnnual, 'h');
    $(sel).innerHTML = rows.join('');
  }


  /* Saved on this device only, never sent anywhere, and clearable with the
     reset button. Without it a long form is lost on every refresh. */
  const SAVE_KEY = 'indi_salary_inputs';
  function saveState() {
    try {
      const d = {};
      NUM_IDS.forEach(id => { const el = $('#' + id); if (el) d[id] = el.value; });
      ['ageBand','metro','state'].forEach(id => d[id] = $('#' + id).value);
      ['parentsSenior','ltaClaimed','pfCountsIn80C'].forEach(id => d[id] = $('#' + id).checked);
      d.paste = $('#paste').value;
      localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    } catch (e) {}
  }
  function restoreState() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d) return false;
      NUM_IDS.forEach(id => { const el = $('#' + id); if (el && d[id] !== undefined) el.value = d[id]; });
      ['ageBand','metro','state'].forEach(id => { if (d[id] !== undefined) $('#' + id).value = d[id]; });
      ['parentsSenior','ltaClaimed','pfCountsIn80C'].forEach(id => { if (d[id] !== undefined) $('#' + id).checked = d[id]; });
      if (d.paste) $('#paste').value = d.paste;
      return true;
    } catch (e) { return false; }
  }

  /* ── wiring ────────────────────────────────────────────────── */
  const stateSel = $('#state');
  Object.keys(PT).forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s + (PT[s] ? ' · ' + money(PT[s]) : ' · no PT'); stateSel.appendChild(o); });
  stateSel.value = 'Karnataka';

  NUM_IDS.forEach(id => { const el = $('#' + id); if (el) el.addEventListener('input', recalc); });
  ['ageBand','metro','state','parentsSenior','ltaClaimed','pfCountsIn80C']
    .forEach(id => $('#' + id).addEventListener('change', recalc));

  $('#paste').addEventListener('input', e => {
    pasteRows = parsePaste(e.target.value);
    renderPasteTable();
    updatePasteInfo();
    if (pasteRows.length) applyPasteRows();
  });

  $('#add-rsu').addEventListener('click', () => { addRsuRow(); recalc(); });

  $('#reset').addEventListener('click', () => {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    location.reload();
  });

  $('#fy-label').textContent = R.label;
  $('#fy-verified').textContent = R.verifiedOn;
  restoreState();
  recalc();
})();
