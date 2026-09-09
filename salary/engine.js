/* ═══════════════════════════════════════════════════════════════
   Tax engine. Pure functions, no DOM. All amounts are annual rupees.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function slabTax(income, slabs) {
    let tax = 0, prev = 0;
    for (const [upTo, rate] of slabs) {
      const ceiling = upTo === null ? Infinity : upTo;
      if (income > prev) tax += (Math.min(income, ceiling) - prev) * rate;
      prev = ceiling;
      if (income <= ceiling) break;
    }
    return tax;
  }

  function surchargeRate(income, bands) {
    let prev = 0;
    for (const [upTo, rate] of bands) {
      const ceiling = upTo === null ? Infinity : upTo;
      if (income <= ceiling) return rate;
      prev = ceiling;
    }
    return bands[bands.length - 1][1];
  }

  /* Surcharge, with marginal relief. Without relief, ₹1 over ₹50 lakh
     would add far more than ₹1 of tax; the Act caps the extra at the
     extra income. */
  function surchargeWithRelief(totalIncome, normalTax, specialTax, regime, R) {
    const bands = R.surcharge[regime];
    const rate = surchargeRate(totalIncome, bands);
    if (rate === 0) return { surcharge: 0, rate: 0, relief: 0 };

    // The enhanced (25%/37%) rate never applies to 111A/112/112A income.
    const specialRate = Math.min(rate, R.surcharge.capOnSpecialRateIncome);
    let surcharge = normalTax * rate + specialTax * specialRate;

    let relief = 0;
    const thresholds = R.surcharge.thresholds[regime];
    for (let i = thresholds.length - 1; i >= 0; i--) {
      const T = thresholds[i];
      if (totalIncome > T) {
        const taxAtT = taxAtIncome(T, regime, R);
        const excess = totalIncome - T;
        const payable = normalTax + specialTax + surcharge;
        if (payable > taxAtT + excess) {
          relief = payable - (taxAtT + excess);
          surcharge = Math.max(0, surcharge - relief);
        }
        break;
      }
    }
    return { surcharge, rate, relief };
  }

  /* Tax at exactly a threshold, used only by marginal relief. Uses the
     regime's own slabs with no deductions, which is how relief is
     computed in practice. */
  function taxAtIncome(income, regime, R) {
    const slabs = regime === 'new' ? R.slabs.new : R.slabs.old.below60;
    return slabTax(income, slabs);
  }

  /* Rebate 87A, and its own marginal relief just past the limit: tax
     cannot exceed the income earned above the rebate threshold. */
  function applyRebate(taxableIncome, tax, regime, R) {
    const cfg = R.rebate87A[regime];
    if (taxableIncome <= cfg.limit) return { tax: Math.max(0, tax - Math.min(tax, cfg.max)), rebate: Math.min(tax, cfg.max), marginal: 0 };
    if (regime === 'new') {
      const over = taxableIncome - cfg.limit;
      if (tax > over) return { tax: over, rebate: 0, marginal: tax - over };
    }
    return { tax, rebate: 0, marginal: 0 };
  }

  function hraExemption(basic, da, hraReceived, annualRent, isMetro, R) {
    if (!hraReceived || !annualRent) return 0;
    const base = basic + da;
    const a = hraReceived;
    const b = Math.max(0, annualRent - R.hra.rentMinusPercentOfBasic * base);
    const c = base * (isMetro ? R.hra.metroRate : R.hra.nonMetroRate);
    return Math.max(0, Math.min(a, b, c));
  }

  function capitalGains(sales, R) {
    let ltcgListed = 0, stcgListed = 0, ltcgOther = 0, stcgOther = 0;
    for (const s of sales || []) {
      const gain = (s.salePrice - s.fmvAtVest) * s.shares;
      if (!gain) continue;
      const kind = s.market === 'listedIndian' ? 'listedIndian' : 'foreignUnlisted';
      const cfg = R.capitalGains[kind];
      const isLong = s.holdingMonths >= cfg.longTermMonths;
      if (kind === 'listedIndian') { isLong ? (ltcgListed += gain) : (stcgListed += gain); }
      else { isLong ? (ltcgOther += gain) : (stcgOther += gain); }
    }
    const L = R.capitalGains.listedIndian, F = R.capitalGains.foreignUnlisted;
    const ltcgListedTaxable = Math.max(0, ltcgListed - L.ltcgExempt);
    const specialTax = ltcgListedTaxable * L.ltcgRate
                     + Math.max(0, stcgListed) * L.stcgRate
                     + Math.max(0, ltcgOther) * F.ltcgRate;
    return {
      ltcgListed, stcgListed, ltcgOther,
      stcgOther,                       // added to slab income, not taxed here
      ltcgListedExemptUsed: Math.min(Math.max(0, ltcgListed), L.ltcgExempt),
      specialTax,
      specialIncome: ltcgListedTaxable + Math.max(0, stcgListed) + Math.max(0, ltcgOther)
    };
  }

  /* ── the main computation ─────────────────────────────────── */
  function compute(inp, regime, R) {
    const basic = inp.basic || 0, da = inp.da || 0;
    const ageBand = inp.ageBand || 'below60';

    // Gross salary before exemptions
    const grossSalary = basic + da + (inp.hra || 0) + (inp.special || 0) + (inp.lta || 0)
      + (inp.bonus || 0) + (inp.otherAllow || 0) + (inp.rsuPerquisite || 0);

    // Employer contributions above the combined cap are a perquisite
    const employerContribs = (inp.employerPF || 0) + (inp.employerNPS || 0) + (inp.superannuation || 0);
    const excessEmployerContrib = Math.max(0, employerContribs - R.employerContributionExemptCap);

    // Exemptions (old regime only)
    const hraEx = regime === 'old'
      ? hraExemption(basic, da, inp.hra || 0, inp.annualRent || 0, !!inp.isMetro, R) : 0;
    const ltaEx = regime === 'old' ? Math.min(inp.lta || 0, inp.ltaClaimed || 0) : 0;

    const stdDed = R.standardDeduction[regime];
    const profTax = regime === 'old' ? Math.min(inp.professionalTax || 0, R.professionalTaxCap) : 0;

    // 80CCD(2) employer NPS works in both regimes
    const npsCapRate = regime === 'new' ? R.employerNPS.newCap : R.employerNPS.oldCap;
    const nps80CCD2 = Math.min(inp.employerNPS || 0, (basic + da) * npsCapRate);

    let chapterVIA = 0, breakdown = {};
    if (regime === 'old') {
      const D = R.deductions;
      const seniorish = ageBand !== 'below60';
      // Employee PF is an 80C investment. Counting it only when the user
      // remembers to type it again loses up to the whole cap.
      const c80 = (inp.s80C || 0) + (inp.pfCountsIn80C ? (inp.employeePF || 0) : 0);
      breakdown.s80C = Math.min(c80, D.s80C.cap);
      breakdown.s80CCD1B = Math.min(inp.s80CCD1B || 0, D.s80CCD1B.cap);
      breakdown.s80D_self = Math.min(inp.s80D_self || 0, seniorish ? D.s80D_self.capSenior : D.s80D_self.cap);
      breakdown.s80D_parents = Math.min(inp.s80D_parents || 0, inp.parentsSenior ? D.s80D_parents.capSenior : D.s80D_parents.cap);
      // Both bands read the same field; only the cap differs. Reading a
      // separate interestIncome key here meant seniors silently lost 80TTB.
      breakdown.s80TT = Math.min(inp.savingsInterest || 0,
        seniorish ? D.s80TTB.cap : D.s80TTA.cap);
      breakdown.s24b = Math.min(inp.homeLoanInterest || 0, D.s24b.cap);
      breakdown.s80E = inp.s80E || 0;
      breakdown.s80G = inp.s80G || 0;
      chapterVIA = Object.values(breakdown).reduce((a, b) => a + b, 0);
    }

    const otherIncome = (inp.otherIncome || 0);
    const cg = capitalGains(inp.rsuSales, R);

    const salaryAfterExemptions = grossSalary + excessEmployerContrib - hraEx - ltaEx - stdDed - profTax;
    const slabIncome = Math.max(0, salaryAfterExemptions + otherIncome + Math.max(0, cg.stcgOther)
      - chapterVIA - nps80CCD2);

    const slabs = regime === 'new' ? R.slabs.new : R.slabs.old[ageBand];
    let normalTax = slabTax(slabIncome, slabs);

    const totalIncome = slabIncome + cg.specialIncome;
    const reb = applyRebate(totalIncome, normalTax + cg.specialTax, regime, R);
    // The rebate applies to total tax; split the reduction back out.
    const reducedTotal = reb.tax;
    const preRebateTotal = normalTax + cg.specialTax;
    const scale = preRebateTotal > 0 ? reducedTotal / preRebateTotal : 0;
    const normalTaxAfterRebate = normalTax * scale;
    const specialTaxAfterRebate = cg.specialTax * scale;

    const sur = surchargeWithRelief(totalIncome, normalTaxAfterRebate, specialTaxAfterRebate, regime, R);
    const taxPlusSurcharge = normalTaxAfterRebate + specialTaxAfterRebate + sur.surcharge;
    const cess = taxPlusSurcharge * R.cess;
    const totalTax = taxPlusSurcharge + cess;

    // Take-home: what actually reaches the bank. Employee PF and
    // professional tax are deducted from salary; employer contributions
    // never were part of it.
    const employeePF = inp.employeePF || 0;
    const inHandAnnual = grossSalary - employeePF - (inp.professionalTax || 0) - totalTax;

    const oneTime = (inp.bonus || 0) + (inp.rsuPerquisite || 0) + (inp.lta || 0);
    const recurringGross = grossSalary - oneTime;

    const ctc = grossSalary + (inp.employerPF || 0) + (inp.employerNPS || 0)
              + (inp.superannuation || 0) + (inp.gratuity || 0);

    return {
      regime, grossSalary, oneTime, recurringGross, ctc,
      employerPF: inp.employerPF || 0, employerNPS: inp.employerNPS || 0,
      gratuity: inp.gratuity || 0,
      hraEx, ltaEx, stdDed, profTax, chapterVIA, deductionBreakdown: breakdown,
      nps80CCD2, excessEmployerContrib,
      slabIncome, totalIncome, capitalGains: cg,
      normalTax, rebate: reb.rebate, rebateMarginal: reb.marginal,
      surcharge: sur.surcharge, surchargeRate: sur.rate, marginalRelief: sur.relief,
      cess, totalTax,
      inHandAnnual,
      inHandMonthly: (recurringGross - employeePF - (inp.professionalTax || 0)
                      - totalTax * (recurringGross / (grossSalary || 1))) / 12,
      employeePF
    };
  }

  global.TaxEngine = { compute, slabTax, hraExemption, capitalGains, surchargeWithRelief, applyRebate };
})(window);
