/* ═══════════════════════════════════════════════════════════════
   Rent vs Buy. Pure functions, no DOM. Annual rupees throughout.

   The comparison only means anything if the renter invests what the
   buyer sinks into the house: the down payment, the transaction costs,
   and any month where owning costs more than renting. Calculators that
   skip this always conclude that buying wins.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function emiFor(P, annualRate, months) {
    if (!months || months <= 0) return P;      // nothing to amortise over
    const r = annualRate / 12 / 100;
    if (r === 0) return P / months;
    const f = Math.pow(1 + r, months);
    return P * r * f / (f - 1);
  }

  /* Interest and principal paid during one year of the loan, plus the
     balance left at the end of it. */
  function loanYear(balance, annualRate, emi) {
    const r = annualRate / 12 / 100;
    let interest = 0, principal = 0, b = balance;
    for (let m = 0; m < 12 && b > 0; m++) {
      const i = b * r;
      let p = emi - i;
      if (p > b) p = b;
      interest += i; principal += p; b -= p;
    }
    return { interest, principal, balance: Math.max(0, b) };
  }

  function project(inp) {
    const price      = Math.max(0, inp.price);
    const downPct    = Math.min(100, Math.max(0, inp.downPct));   // over 100 would gift the renter money
    const down       = price * (downPct / 100);
    const loan       = Math.max(0, price - down);
    const buyCosts   = price * (inp.buyCostPct / 100);      // stamp duty, registration, legal
    const months     = Math.max(1, Math.round(inp.tenureYears)) * 12;
    const emi        = loan > 0 ? emiFor(loan, inp.loanRate, months) : 0;

    // The renter starts by investing everything the buyer spent up front.
    let corpus  = down + buyCosts;
    let balance = loan;
    let propertyValue = price;
    let rentMonthly = inp.rentMonthly;

    const rows = [];
    let cumRent = 0, cumOwn = 0, cumTaxSaved = 0, cumInterest = 0, cumRentTaxSaved = 0;

    for (let year = 1; year <= inp.horizon; year++) {
      const ly = loanYear(balance, inp.loanRate, emi);
      balance = ly.balance;

      const emiPaid     = year * 12 <= months ? emi * 12 : Math.max(0, ly.interest + ly.principal);
      const upkeep      = propertyValue * (inp.upkeepPct / 100);   // maintenance, society, property tax
      const rentPaid    = rentMonthly * 12;

      /* A renter claiming HRA gets a deduction the owner gives up. Leaving
         it out handed every tax break to the buyer and tilted the answer.
         Capped at rent actually paid, and worth nothing in the new regime. */
      const hraExempt   = inp.regime === 'old'
        ? Math.min(inp.hraExemptAnnual || 0, rentPaid) : 0;
      const rentTaxSaved = hraExempt * (inp.marginalRate / 100);

      /* Deductions exist only in the old regime for a self-occupied home:
         interest under 24(b) up to 2 lakh, principal within the 80C limit. */
      const taxSaved = inp.regime === 'old'
        ? Math.min(ly.interest, inp.cap24b) * (inp.marginalRate / 100)
          + Math.min(ly.principal, inp.cap80C) * (inp.marginalRate / 100)
        : 0;

      const ownCost  = emiPaid + upkeep - taxSaved;
      const rentCost = rentPaid - rentTaxSaved;
      const gap      = ownCost - rentCost;      // what the renter can invest this year

      /* The renter invests the gap when owning costs more, and draws the
         corpus down when renting costs more. A negative gap is simply
         added, so both directions are handled by one line. */
      corpus = corpus * (1 + inp.investReturn / 100) + gap;

      propertyValue *= (1 + inp.appreciation / 100);
      rentMonthly   *= (1 + inp.rentInflation / 100);

      cumRent += rentCost; cumOwn += ownCost; cumRentTaxSaved += rentTaxSaved; cumTaxSaved += taxSaved; cumInterest += ly.interest;

      // Net worth if you walked away at the end of this year.
      const sellingCost = propertyValue * (inp.sellCostPct / 100);
      const buyNet  = propertyValue - balance - sellingCost;
      const rentNet = corpus;

      rows.push({
        year, emiPaid, upkeep, rentPaid, rentCost, rentTaxSaved, taxSaved, interest: ly.interest,
        principal: ly.principal, balance, propertyValue, corpus,
        buyNet, rentNet, advantage: buyNet - rentNet
      });
    }

    // First year where owning is ahead and stays ahead.
    let breakEven = null;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].advantage >= 0 && rows.slice(i).every(r => r.advantage >= 0)) { breakEven = rows[i].year; break; }
    }

    return {
      emi, loan, down, buyCosts, rows, breakEven,
      totals: { rent: cumRent, own: cumOwn, taxSaved: cumTaxSaved, interest: cumInterest, rentTaxSaved: cumRentTaxSaved },
      final: rows[rows.length - 1] || null
    };
  }

  /* How far a single assumption has to move before the answer flips. */
  function sensitivity(inp, key, lo, hi, step) {
    const out = [];
    for (let v = lo; v <= hi + 1e-9; v += step) {
      const r = project({ ...inp, [key]: +v.toFixed(2) });
      out.push({ value: +v.toFixed(2), breakEven: r.breakEven });
    }
    return out;
  }

  global.RentBuy = { project, emiFor, sensitivity };
})(window);
