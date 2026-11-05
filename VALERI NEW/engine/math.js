/* ============================================================
   VALERI Math Engine
   DIN EN 17463:2021 + A1:2024
   All financial calculations in pure JavaScript
   ============================================================ */

const ValeriMath = (() => {

  /* ── Helpers ── */
  function round(v, dp = 2) {
    return Math.round(v * Math.pow(10, dp)) / Math.pow(10, dp);
  }

  /* ── WACC ── */
  function calcWACC({ S_eq, r_eq, S_debt, r_debt }) {
    return round(S_eq * r_eq + S_debt * r_debt, 6);
  }

  /* ── Risk Deduction Factor ── */
  function calcRiskFactor({ R_loss, p_loss }) {
    return round(R_loss * p_loss, 6);
  }

  /**
   * Build cash flow table for all periods t = 0..T
   * Returns array of row objects, one per period.
   *
   * Each impact item in step3.cashflows has:
   *   annual_amount: base amount (+ benefit / - burden, sign already applied)
   *   timing: 't0' (one-time at t=0), 'tT' (one-time at end), or 'annual'
   *   price_variation_type: 'epr' | 'pr' | 'none'
   *   custom_rate: number (optional override for per-item variation)
   *   category: 'energy_flow' | 'additional_financial' | 'other'
   */
  function buildCashFlowTable(project) {
    const s3 = project.phase_a.step3;
    const s4 = project.phase_a.step4;
    const s5 = project.phase_a.step5;
    const s6 = project.phase_a.step6;

    const T          = s4.lifetime_T;
    const epr        = s3.global.epr;        // energy price variation
    const pr         = s3.global.pr;         // non-energy price variation
    const degrad     = s3.global.degradation; // annual degradation
    const WACC       = s6.WACC;
    const q          = 1 + WACC;

    const f_risk = s5.risk_applicable ? s5.f_ded_risk : 0;

    const cashflows = s3.cashflows; // object keyed by impact id

    const table = [];

    for (let t = 0; t <= T; t++) {
      let inflows  = 0;
      let outflows = 0;
      const breakdown = {};

      Object.entries(cashflows).forEach(([id, cf]) => {
        const base = cf.annual_amount; // signed: positive = benefit/inflow, negative = burden/outflow

        // Determine variation rate
        let vRate = 0;
        if (cf.price_variation_type === 'epr') vRate = epr;
        else if (cf.price_variation_type === 'pr') vRate = pr;
        else if (cf.price_variation_type === 'custom' && cf.custom_rate !== undefined) {
          vRate = cf.custom_rate;
        }

        let amount = 0;

        if (cf.timing === 't0') {
          // One-time at t=0 only
          amount = (t === 0) ? base : 0;
        } else if (cf.timing === 'tT') {
          // One-time at end of lifetime
          amount = (t === T) ? base : 0;
        } else {
          // Annual recurring (starting t=1)
          if (t === 0) {
            amount = 0;
          } else {
            // Apply price variation and degradation
            amount = base * Math.pow(1 + vRate, t) * Math.pow(1 - degrad, t);
          }
        }

        // Apply risk deduction to recurring cash flows only (not t=0 CAPEX)
        let riskAdj = amount;
        if (cf.timing !== 't0' && t > 0) {
          riskAdj = amount * (1 - f_risk);
        }

        breakdown[id] = round(riskAdj, 2);

        if (riskAdj >= 0) {
          inflows += riskAdj;
        } else {
          outflows += riskAdj; // negative
        }
      });

      const netCF       = round(inflows + outflows, 2);
      const discFactor  = round(1 / Math.pow(q, t), 6);
      const presentVal  = round(netCF * discFactor, 2);

      table.push({
        t,
        discountFactor: discFactor,
        inflows:  round(inflows, 2),
        outflows: round(outflows, 2),
        netCashFlow: netCF,
        presentValue: presentVal,
        breakdown
      });
    }

    const NPV = round(table.reduce((acc, r) => acc + r.presentValue, 0), 2);

    return { table, NPV, T, WACC, q, f_risk, epr, pr, degrad };
  }

  /**
   * Sensitivity Analysis
   * For each parameter, vary by -range% to +range% in steps
   * Returns array of { param, label, baseNPV, low, high, slope }
   */
  function sensitivityAnalysis(project, params, rangePercent = 50, steps = 11) {
    const base = buildCashFlowTable(project);
    const results = [];

    params.forEach(({ key, label, getVal, setVal, restoreVal }) => {
      const baseVal = getVal(project);
      const delta   = rangePercent / 100;
      const low     = baseVal * (1 - delta);
      const high    = baseVal * (1 + delta);

      // Calculate NPV at low extreme
      const projLow  = deepClone(project);
      setVal(projLow, low);
      const npvLow   = buildCashFlowTable(projLow).NPV;

      // Calculate NPV at high extreme
      const projHigh = deepClone(project);
      setVal(projHigh, high);
      const npvHigh  = buildCashFlowTable(projHigh).NPV;

      // Slope: how much NPV changes per 1% change in parameter
      const slope = round((npvHigh - npvLow) / (2 * rangePercent), 0);
      const impact = Math.abs(npvHigh - npvLow);

      const points = [];
      for (let i = 0; i <= steps; i++) {
        const pct = -rangePercent + i * (2 * rangePercent / steps);
        const val = baseVal * (1 + pct / 100);
        const projT = deepClone(project);
        setVal(projT, val);
        const npv = buildCashFlowTable(projT).NPV;
        points.push({ pct: round(pct, 1), val: round(val, 4), npv });
      }

      results.push({
        key, label, baseVal,
        npvLow, npvHigh, slope, impact,
        low, high, points,
        baseNPV: base.NPV
      });
    });

    // Sort by impact descending (tornado order)
    results.sort((a, b) => b.impact - a.impact);
    return results;
  }

  /**
   * Scenario Analysis
   * Returns NPV for worst, most-likely, and best case scenarios
   */
  function scenarioAnalysis(project, scenarios) {
    const results = {};
    Object.entries(scenarios).forEach(([key, overrides]) => {
      const proj = deepClone(project);
      applyOverrides(proj, overrides);
      const { NPV } = buildCashFlowTable(proj);
      results[key] = { NPV, overrides };
    });
    return results;
  }

  /**
   * Apply a flat override map to project fields
   * Override keys use dot-notation paths, e.g.:
   *   "phase_a.step6.WACC": 0.09
   *   "phase_a.step4.lifetime_T": 12
   */
  function applyOverrides(proj, overrides) {
    Object.entries(overrides).forEach(([path, val]) => {
      setNestedValue(proj, path.split('.'), val);
    });
  }

  /* ── Standard Sensitivity Parameters ── */
  function getStandardSensParams(project) {
    return [
      {
        key: 'WACC',
        label: 'Diskontsatz (WACC)',
        getVal: p => p.phase_a.step6.WACC,
        setVal: (p, v) => { p.phase_a.step6.WACC = v; }
      },
      {
        key: 'epr',
        label: 'Energiepreisentwicklung (epr)',
        getVal: p => p.phase_a.step3.global.epr,
        setVal: (p, v) => { p.phase_a.step3.global.epr = v; }
      },
      {
        key: 'lifetime_T',
        label: 'Investitionslebensdauer (T)',
        getVal: p => p.phase_a.step4.lifetime_T,
        setVal: (p, v) => { p.phase_a.step4.lifetime_T = Math.max(1, Math.round(v)); }
      },
      {
        key: 'pr',
        label: 'Allg. Preisentwicklung (pr)',
        getVal: p => p.phase_a.step3.global.pr,
        setVal: (p, v) => { p.phase_a.step3.global.pr = v; }
      }
    ];
  }

  /* ── Deep clone (simple JSON approach) ── */
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /* ── Set nested value by path array ── */
  function setNestedValue(obj, pathArr, val) {
    let cur = obj;
    for (let i = 0; i < pathArr.length - 1; i++) {
      if (cur[pathArr[i]] === undefined) cur[pathArr[i]] = {};
      cur = cur[pathArr[i]];
    }
    cur[pathArr[pathArr.length - 1]] = val;
  }

  /* ── Format helpers ── */
  function fmtEUR(v, dp = 0) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: dp,
      maximumFractionDigits: dp
    }).format(v);
  }

  function fmtPct(v, dp = 1) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return (v * 100).toFixed(dp).replace('.', ',') + ' %';
  }

  function fmtNum(v, dp = 2) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: dp,
      maximumFractionDigits: dp
    }).format(v);
  }

  return {
    calcWACC,
    calcRiskFactor,
    buildCashFlowTable,
    sensitivityAnalysis,
    scenarioAnalysis,
    getStandardSensParams,
    deepClone,
    applyOverrides,
    fmtEUR,
    fmtPct,
    fmtNum,
    round
  };
})();

window.ValeriMath = ValeriMath;
