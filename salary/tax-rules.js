/* ═══════════════════════════════════════════════════════════════
   Indian income tax rules, keyed by financial year.

   To add a year, copy the block and edit the numbers. Nothing else
   in the calculator hard-codes a rate.

   FY 2025-26 (AY 2026-27) figures below were taken from
   incometax.gov.in "Salaried Individuals for AY 2026-27" on
   10 Sep 2026. Slabs, surcharge, rebate and cess are quoted there
   directly. Standard deduction and the 80-series caps are from the
   Act and should be re-checked when you add a new year.
   ═══════════════════════════════════════════════════════════════ */

window.TAX_RULES = {
  '2025-26': {
    label: 'FY 2025-26 (AY 2026-27)',
    verifiedOn: '10 September 2026',
    source: 'https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1',

    /* Slabs are [upTo, rate]. null upTo means "and above". */
    slabs: {
      old: {
        below60: [[250000, 0], [500000, 0.05], [1000000, 0.20], [null, 0.30]],
        senior:  [[300000, 0], [500000, 0.05], [1000000, 0.20], [null, 0.30]],  // 60-79
        superSenior: [[500000, 0], [1000000, 0.20], [null, 0.30]]               // 80+
      },
      // The new regime does not vary by age.
      new: [[400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15],
            [2000000, 0.20], [2400000, 0.25], [null, 0.30]]
    },

    standardDeduction: { old: 50000, new: 75000 },

    /* Rebate u/s 87A: 100% of tax up to the cap, if taxable income
       is within the limit. */
    rebate87A: {
      old: { limit: 500000,  max: 12500 },
      new: { limit: 1200000, max: 60000 }
    },

    cess: 0.04,   // health & education, on tax + surcharge, both regimes

    /* Surcharge on the tax amount. The top 37% band exists only in the
       old regime; the new regime is capped at 25%. */
    surcharge: {
      old: [[5000000, 0], [10000000, 0.10], [20000000, 0.15], [50000000, 0.25], [null, 0.37]],
      new: [[5000000, 0], [10000000, 0.10], [20000000, 0.15], [50000000, 0.25], [null, 0.25]],
      /* Enhanced surcharge (above 15%) does not apply to income taxed
         under 111A, 112, 112A or to dividends. */
      capOnSpecialRateIncome: 0.15,
      /* Marginal relief thresholds, used so the surcharge can never
         exceed the extra income that crossed the threshold. */
      thresholds: { old: [5000000, 10000000, 20000000, 50000000],
                    new: [5000000, 10000000, 20000000] }
    },

    /* Deductions available only under the old regime, with statutory caps. */
    deductions: {
      s80C:        { cap: 150000, label: '80C: PF, ELSS, LIC, PPF, home loan principal, tuition' },
      s80CCD1B:    { cap: 50000,  label: '80CCD(1B): additional NPS' },
      s80D_self:   { cap: 25000,  capSenior: 50000, label: '80D: health insurance, self and family' },
      s80D_parents:{ cap: 25000,  capSenior: 50000, label: '80D: health insurance, parents' },
      s80TTA:      { cap: 10000,  label: '80TTA: savings account interest' },
      s80TTB:      { cap: 50000,  label: '80TTB: interest income, 60 and over' },
      s24b:        { cap: 200000, label: '24(b): home loan interest, self-occupied' },
      s80E:        { cap: null,   label: '80E: education loan interest, no cap' },
      s80G:        { cap: null,   label: '80G: donations, varies by institution' }
    },

    /* 80CCD(2), employer NPS, is one of the few deductions that works
       in BOTH regimes. */
    employerNPS: { oldCap: 0.10, newCap: 0.14, base: 'basicPlusDA' },

    /* Employer contributions to PF + NPS + superannuation above this
       combined annual figure are a taxable perquisite. */
    employerContributionExemptCap: 750000,

    hra: {
      metroRate: 0.50,
      nonMetroRate: 0.40,
      rentMinusPercentOfBasic: 0.10,
      metros: ['Delhi', 'Mumbai', 'Kolkata', 'Chennai']
    },

    professionalTaxCap: 2500,

    /* Capital gains. Foreign-listed shares (most Indian tech RSUs) are
       NOT 112A/111A: they are unlisted for Indian purposes, so the
       holding period is 24 months and there is no ₹1.25L exemption. */
    capitalGains: {
      listedIndian:   { longTermMonths: 12, ltcgRate: 0.125, ltcgExempt: 125000, stcgRate: 0.20, section: '112A / 111A' },
      foreignUnlisted:{ longTermMonths: 24, ltcgRate: 0.125, ltcgExempt: 0,      stcgRate: null, section: '112 / slab' }
      // stcgRate null means short-term gains are added to slab income.
    },

    pf: { employeeRate: 0.12, employerRate: 0.12, base: 'basicPlusDA',
          employeeInterestTaxableAbove: 250000 }
  }
};
