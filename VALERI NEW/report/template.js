/* ============================================================
   VALERI — Report Generator (Step 11)
   Bilingual: uses project.meta.lang (de | en)
   DIN EN 17463:2021 format
   ============================================================ */

const ValeriReport = (() => {

  const { fmtEUR, fmtPct, fmtNum } = ValeriMath;

  /* Per-report translation helper using project language */
  function R(project, key, ...args) {
    const lang = project?.meta?.lang || 'de';
    const dict = Translations[lang] || Translations['de'];
    let str = dict[key] ?? Translations['de'][key] ?? key;
    args.forEach((val, i) => { str = str.replace(`{${i}}`, val); });
    return str;
  }

  function buildReport(project, aiSections = {}) {
    const meta   = project.meta;
    const s1     = project.phase_a.step1;
    const s3     = project.phase_a.step3;
    const s4     = project.phase_a.step4;
    const s5     = project.phase_a.step5;
    const s6     = project.phase_a.step6;
    const s7     = project.phase_b.step7;
    const s9     = project.phase_b?.step9 || {};
    const s10    = project.phase_c?.step10 || {};

    const npv     = s7.NPV ?? 0;
    const wacc    = s6.WACC ?? 0;
    const T       = s4.lifetime_T ?? 0;
    const worst   = s9.worst_case?.NPV;
    const best    = s9.best_case?.NPV;
    const table   = s7.cashflow_table || [];

    const lang    = meta.lang || 'de';
    const locale  = lang === 'en' ? 'en-GB' : 'de-DE';

    const dateStr = new Date().toLocaleDateString(locale, {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const npvPositive = npv >= 0;
    const npvColor    = npvPositive ? '#10b981' : '#ef4444';

    // ── Sections ──
    const annexI   = buildAnnexI(project);
    const annexII  = buildAnnexII(project, table);
    const annexIII = buildAnnexIII(project);
    const qualItems = (s1.impacts || []).filter(i => !i.monetizable);

    const decisionText = aiSections.decision_proposal ||
      (npvPositive
        ? R(project, 'rpt_decision_pos', fmtEUR(npv))
        : R(project, 'rpt_decision_neg', fmtEUR(Math.abs(npv))));

    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VALERI ${R(project,'rpt_no',meta.id)}</title>
<meta name="author" content="VALERI AI">
<meta name="generator" content="VALERI AI System (Fully compliant with EU AI Act)">
<meta name="description" content="This document is AI-generated and fully compliant with the EU AI Act.">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  :root {
    --blue: #1d4ed8; --green: #065f46; --red: #991b1b; --amber: #92400e;
    --gray-50: #f8fafc; --gray-100: #f1f5f9; --gray-200: #e2e8f0;
    --gray-400: #94a3b8; --gray-600: #475569; --gray-800: #1e293b; --gray-900: #0f172a;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
    font-size: 10pt; color: #1e293b; background: #fff; line-height: 1.5;
  }

  .report-wrap { max-width: 900px; margin: 0 auto; padding: 2rem; }

  /* ── Cover ── */
  .cover { border-bottom: 3px solid #1d4ed8; padding-bottom: 1.5rem; margin-bottom: 2rem; }
  .cover-logo { display: inline-flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem; }
  .cover-logo-box {
    width: 40px; height: 40px;
    background: linear-gradient(135deg, #1d4ed8, #7c3aed);
    border-radius: 8px; display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 800; font-size: 1rem;
  }
  .cover-logo-text { font-size: 1.1rem; font-weight: 700; color: #0f172a; }
  .cover-logo-sub  { font-size: 0.6rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; display: block; }
  .cover-title { font-size: 1.6rem; font-weight: 800; color: #0f172a; letter-spacing: -0.03em; margin-bottom: 0.375rem; }
  .cover-subtitle { font-size: 0.85rem; color: #64748b; }
  .cover-meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-top: 1.5rem; }
  .cover-meta-item { font-size: 0.78rem; }
  .cover-meta-label { color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.68rem; margin-bottom: 0.2rem; }
  .cover-meta-value { color: #0f172a; font-weight: 500; }

  /* ── Sections ── */
  .section { margin-bottom: 2rem; }
  h2 { font-size: 0.95rem; font-weight: 700; color: #1d4ed8; text-transform: uppercase;
    letter-spacing: 0.05em; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 0.5rem; margin-bottom: 1rem; }
  h3 { font-size: 0.875rem; font-weight: 600; color: #0f172a; margin-bottom: 0.5rem; }
  p  { margin-bottom: 0.75rem; font-size: 0.875rem; line-height: 1.65; color: #334155; }

  /* ── Decision Box ── */
  .decision-box {
    background: ${npvPositive ? '#f0fdf4' : '#fef2f2'};
    border: 2px solid ${npvColor};
    border-radius: 10px; padding: 1.25rem 1.5rem; margin-bottom: 1.25rem;
  }
  .decision-label { font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: ${npvColor}; margin-bottom: 0.375rem; }
  .decision-text { font-size: 0.9rem; color: #0f172a; font-weight: 500; line-height: 1.5; }

  /* ── KPI Row ── */
  .kpi-row { display: flex; gap: 1rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
  .kpi-box { flex: 1; min-width: 140px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.875rem 1rem; position: relative; }
  .kpi-box::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 8px 8px 0 0; }
  .kpi-box.blue::before  { background: #1d4ed8; }
  .kpi-box.green::before { background: #059669; }
  .kpi-box.red::before   { background: #dc2626; }
  .kpi-box.amber::before { background: #d97706; }
  .kpi-box-label { font-size: 0.67rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: #64748b; margin-bottom: 0.375rem; }
  .kpi-box-value { font-size: 1.25rem; font-weight: 800; letter-spacing: -0.03em; font-family: 'JetBrains Mono', monospace; }
  .kpi-box.blue  .kpi-box-value { color: #1d4ed8; }
  .kpi-box.green .kpi-box-value { color: #059669; }
  .kpi-box.red   .kpi-box-value { color: #dc2626; }
  .kpi-box.amber .kpi-box-value { color: #d97706; }
  .kpi-box-sub { font-size: 0.7rem; color: #94a3b8; margin-top: 0.2rem; }

  /* ── Tables ── */
  .table-responsive { width: 100%; overflow-x: auto; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.72rem; min-width: 600px; }
  th { background: #f1f5f9; color: #475569; font-weight: 600; font-size: 0.62rem;
    text-transform: uppercase; letter-spacing: 0.04em; padding: 0.4rem 0.5rem;
    text-align: left; border-bottom: 1.5px solid #e2e8f0; }
  td { padding: 0.35rem 0.5rem; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #fafafa; }
  td.num, th.num { text-align: right; font-family: 'JetBrains Mono', monospace; }
  .total-row td { font-weight: 700; background: #eff6ff; border-top: 1.5px solid #bfdbfe; }
  .positive { color: #059669; }
  .negative { color: #dc2626; }

  /* ── Qualitative List ── */
  .qual-list { list-style: none; }
  .qual-list li { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.5rem 0;
    border-bottom: 1px solid #f1f5f9; font-size: 0.82rem; color: #334155; }
  .qual-list li::before { content: '•'; color: #1d4ed8; font-weight: 700; flex-shrink: 0; margin-top: 0.05rem; }

  /* ── Parameters Grid ── */
  .param-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; }
  .param-item { display: flex; justify-content: space-between; align-items: baseline;
    padding: 0.35rem 0.5rem; background: #f8fafc; border-radius: 4px; font-size: 0.8rem; }
  .param-label { color: #64748b; }
  .param-value { font-weight: 600; color: #0f172a; font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; }

  /* ── Footer ── */
  .report-footer { border-top: 1.5px solid #e2e8f0; padding-top: 1rem; margin-top: 3rem;
    display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; color: #94a3b8; }

  /* ── Page breaks ── */
  .page-break { page-break-before: always; }
  @page { margin: 2cm; }
  @media print { .no-print { display: none !important; } body { font-size: 9pt; }
    .report-wrap { max-width: 100%; padding: 0; }
    .cover-meta-grid { grid-template-columns: 1fr 1fr; } }
  @media screen { body { background: #e2e8f0; }
    .report-wrap { background: #fff; margin: 2rem auto; border-radius: 12px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.12); } }
</style>
</head>
<body>
<div class="report-wrap">

  <!-- Cover -->
  <div class="cover">
    <div class="cover-logo">
      <div class="cover-logo-box">V</div>
      <div>
        <span class="cover-logo-text">VALERI</span>
        <span class="cover-logo-sub">DIN EN 17463:2021</span>
      </div>
    </div>

    <h1 class="cover-title">${R(project,'rpt_no',meta.id)}</h1>
    <p class="cover-subtitle">${R(project,'rpt_subtitle')}</p>

    <div class="cover-meta-grid">
      <div class="cover-meta-item">
        <div class="cover-meta-label">${R(project,'rpt_proj_name')}</div>
        <div class="cover-meta-value">${meta.name || '—'}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">${R(project,'rpt_evaluator')}</div>
        <div class="cover-meta-value">${meta.evaluator || '—'}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">${R(project,'rpt_company')}</div>
        <div class="cover-meta-value">${meta.company || '—'}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">${R(project,'rpt_date')}</div>
        <div class="cover-meta-value">${dateStr}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">${R(project,'rpt_horizon')}</div>
        <div class="cover-meta-value">${T} ${R(project,'rpt_years')}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">${R(project,'rpt_status')}</div>
        <div class="cover-meta-value" style="color:${npvPositive?'#059669':'#dc2626'};font-weight:700;">
          ${npvPositive ? R(project,'rpt_npv_pos') : R(project,'rpt_npv_neg')}
        </div>
      </div>
    </div>
  </div>

  <!-- 1. Executive Summary -->
  <div class="section">
    <h2>${R(project,'rpt_s1_title')}</h2>

    <div class="decision-box">
      <div class="decision-label">${R(project,'rpt_s1_decision')}</div>
      <div class="decision-text">${decisionText}</div>
    </div>

    <h3>${R(project,'rpt_s1_desc')}</h3>
    <p>${aiSections.brief_description || s1.eri_description || '—'}</p>

    <h3>${R(project,'rpt_s1_eval')}</h3>
    <p>${aiSections.final_evaluation || s10.ai_evaluation || '—'}</p>
  </div>

  <!-- 2. Quantitative Results -->
  <div class="section">
    <h2>${R(project,'rpt_s2_title')}</h2>

    <div class="kpi-row">
      <div class="kpi-box ${npvPositive ? 'blue' : 'red'}">
        <div class="kpi-box-label">${R(project,'rpt_npv_base')}</div>
        <div class="kpi-box-value">${fmtEUR(npv)}</div>
        <div class="kpi-box-sub">${R(project,'rpt_kpv_sub')}</div>
      </div>
      ${worst !== undefined ? `<div class="kpi-box red">
        <div class="kpi-box-label">${R(project,'rpt_npv_worst')}</div>
        <div class="kpi-box-value">${fmtEUR(worst)}</div>
        <div class="kpi-box-sub">${R(project,'rpt_worst_sub')}</div>
      </div>` : ''}
      ${best !== undefined ? `<div class="kpi-box green">
        <div class="kpi-box-label">${R(project,'rpt_npv_best')}</div>
        <div class="kpi-box-value">${fmtEUR(best)}</div>
        <div class="kpi-box-sub">${R(project,'rpt_best_sub')}</div>
      </div>` : ''}
      <div class="kpi-box amber">
        <div class="kpi-box-label">${R(project,'rpt_discount')}</div>
        <div class="kpi-box-value">${fmtPct(wacc)}</div>
        <div class="kpi-box-sub">WACC</div>
      </div>
    </div>

    <h3>${R(project,'rpt_s2_sens')}</h3>
    <p>${aiSections.sensitivity_summary || R(project,'rpt_sens_default')}</p>
  </div>

  <!-- 3. Qualitative Effects -->
  <div class="section">
    <h2>${R(project,'rpt_s3_title')}</h2>
    ${qualItems.length > 0 ? `
    <ul class="qual-list">
      ${qualItems.map(e => `<li>${e.description}</li>`).join('')}
    </ul>` : `<p>${R(project,'rpt_s3_none')}</p>`}
  </div>

  <!-- 4. Parameters -->
  <div class="section">
    <h2>${R(project,'rpt_s4_title')}</h2>
    <div class="param-grid">
      <div class="param-item"><span class="param-label">${R(project,'rpt_param_T')}</span><span class="param-value">${T} ${R(project,'rpt_years')}</span></div>
      <div class="param-item"><span class="param-label">${R(project,'rpt_param_wacc')}</span><span class="param-value">${fmtPct(wacc)}</span></div>
      <div class="param-item"><span class="param-label">${R(project,'rpt_param_epr')}</span><span class="param-value">${fmtPct(s3.global.epr)}/a</span></div>
      <div class="param-item"><span class="param-label">${R(project,'rpt_param_pr')}</span><span class="param-value">${fmtPct(s3.global.pr)}/a</span></div>
      <div class="param-item"><span class="param-label">${R(project,'rpt_param_degrad')}</span><span class="param-value">${fmtPct(s3.global.degradation)}/a</span></div>
      <div class="param-item"><span class="param-label">${R(project,'rpt_param_risk')}</span><span class="param-value">${s5.risk_applicable ? fmtPct(s5.f_ded_risk) : R(project,'rpt_param_no_risk')}</span></div>
      <div class="param-item"><span class="param-label">${R(project,'rpt_param_seq')}</span><span class="param-value">${fmtPct(s6.S_eq)}</span></div>
      <div class="param-item"><span class="param-label">${R(project,'rpt_param_req')}</span><span class="param-value">${fmtPct(s6.r_eq)}/a</span></div>
      <div class="param-item"><span class="param-label">${R(project,'rpt_param_sdebt')}</span><span class="param-value">${fmtPct(s6.S_debt)}</span></div>
      <div class="param-item"><span class="param-label">${R(project,'rpt_param_rdebt')}</span><span class="param-value">${fmtPct(s6.r_debt)}/a</span></div>
    </div>
  </div>

  <!-- Annex I -->
  <div class="section page-break">
    <h2>${R(project,'rpt_ann1_title')}</h2>
    ${annexI}
  </div>

  <!-- Annex II -->
  <div class="section page-break">
    <h2>${R(project,'rpt_ann2_title',T)}</h2>
    ${annexII}
  </div>

  <!-- Annex III -->
  <div class="section page-break">
    <h2>${R(project,'rpt_ann3_title')}</h2>
    ${annexIII}
  </div>

  <!-- Footer -->
  <div class="report-footer">
    <div>${R(project,'rpt_footer')} <br><span style="font-size: 0.6rem; color: #cbd5e1;">Generated by AI (Compliant with EU AI Act)</span></div>
    <div>${R(project,'rpt_no',meta.id)} | ${dateStr}</div>
  </div>

</div>
</body>
</html>`;
  }

  /* ── Annex I ── */
  function buildAnnexI(project) {
    const s1 = project.phase_a.step1;
    const s2 = project.phase_a.step2;
    const s3 = project.phase_a.step3;
    const impacts = s1.impacts || [];
    if (!impacts.length) return `<p>${R(project,'rpt_ann1_none')}</p>`;

    const catLabel = {
      energy_flow:          R(project,'rpt_ann1_cat1'),
      additional_financial: R(project,'rpt_ann1_cat2'),
      other:                R(project,'rpt_ann1_cat3')
    };
    const timingLabel = {
      t0:     R(project,'rpt_ann1_t0'),
      annual: R(project,'rpt_ann1_annual'),
      tT:     R(project,'rpt_ann1_tT')
    };
    const varLabel = { epr:'epr', pr:'pr', none:'—', custom:'ind.' };

    const rows = impacts.map(imp => {
      const qty = s2.quantities?.[imp.id];
      const cf  = s3.cashflows?.[imp.id];
      return `<tr>
        <td>${imp.description}</td>
        <td>${catLabel[imp.category] || imp.category}</td>
        <td>${imp.type === 'benefit' ? R(project,'rpt_ann1_benefit') : R(project,'rpt_ann1_burden')}</td>
        <td class="num">${qty ? fmtNum(qty.quantity, 0) : '—'}</td>
        <td>${qty?.unit || imp.unit || '—'}</td>
        <td>${imp.monetizable ? R(project,'rpt_ann1_yes') : R(project,'rpt_ann1_no')}</td>
        <td class="num">${cf?.unit_price !== undefined ? fmtEUR(cf.unit_price) : '—'}</td>
        <td class="num ${cf?.annual_amount >= 0 ? 'positive' : 'negative'}">${cf?.annual_amount !== undefined ? fmtEUR(cf.annual_amount) : '—'}</td>
        <td>${timingLabel[cf?.timing || imp.timing] || '—'}</td>
        <td>${varLabel[cf?.price_variation_type || imp.price_variation_type] || '—'}</td>
        <td class="num">${s3.global?.degradation !== undefined ? fmtPct(s3.global.degradation) : '—'}</td>
      </tr>`;
    }).join('');

    return `<div class="table-responsive">
      <table>
        <thead><tr>
          <th>${R(project,'rpt_ann1_col1')}</th>
          <th>${R(project,'rpt_ann1_col2')}</th>
          <th>${R(project,'rpt_ann1_col3')}</th>
          <th class="num">${R(project,'rpt_ann1_col4')}</th>
          <th>${R(project,'rpt_ann1_col5')}</th>
          <th>${R(project,'rpt_ann1_col6')}</th>
          <th class="num">${R(project,'rpt_ann1_col7')}</th>
          <th class="num">${R(project,'rpt_ann1_col8')}</th>
          <th>${R(project,'rpt_ann1_col9')}</th>
          <th>${R(project,'rpt_ann1_col10')}</th>
          <th class="num">${R(project,'rpt_ann1_col11')}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  /* ── Annex II ── */
  function buildAnnexII(project, table) {
    if (!table || !table.length) return `<p>${R(project,'rpt_ann2_none')}</p>`;

    const headerRow = `<tr>
      <th>${R(project,'rpt_ann2_col1')}</th>
      <th class="num">${R(project,'rpt_ann2_col2')}</th>
      <th class="num">${R(project,'rpt_ann2_col3')}</th>
      <th class="num">${R(project,'rpt_ann2_col4')}</th>
      <th class="num">${R(project,'rpt_ann2_col5')}</th>
      <th class="num">${R(project,'rpt_ann2_col6')}</th>
    </tr>`;

    const rows = table.map(r => `<tr>
      <td><strong>t = ${r.t}</strong></td>
      <td class="num">${fmtNum(r.discountFactor, 4)}</td>
      <td class="num positive">${r.inflows  ? fmtEUR(r.inflows)  : '—'}</td>
      <td class="num negative">${r.outflows ? fmtEUR(r.outflows) : '—'}</td>
      <td class="num ${r.netCashFlow  >= 0 ? 'positive' : 'negative'}">${fmtEUR(r.netCashFlow)}</td>
      <td class="num ${r.presentValue >= 0 ? 'positive' : 'negative'}">${fmtEUR(r.presentValue)}</td>
    </tr>`).join('');

    const npv = table.reduce((s, r) => s + r.presentValue, 0);
    const totalRow = `<tr class="total-row">
      <td colspan="5"><strong>${R(project,'rpt_ann2_npv')}</strong></td>
      <td class="num ${npv >= 0 ? 'positive' : 'negative'}"><strong>${fmtEUR(npv)}</strong></td>
    </tr>`;

    return `<div class="table-responsive">
      <table>
        <thead>${headerRow}</thead>
        <tbody>${rows}${totalRow}</tbody>
      </table>
    </div>`;
  }

  /* ── Annex III ── */
  function buildAnnexIII(project) {
    const s9 = project.phase_b?.step9;
    if (!s9) return `<p>${R(project,'rpt_ann3_none')}</p>`;

    const scenarios = [
      { key: 'worst_case',  label: R(project,'s9_worst'), color: '#dc2626' },
      { key: 'most_likely', label: R(project,'s9_likely'), color: '#1d4ed8' },
      { key: 'best_case',   label: R(project,'s9_best'),  color: '#059669' }
    ];

    const paramKeys = [
      { key: 'phase_a.step3.global.epr',  label: R(project,'rpt_ann3_row1') },
      { key: 'phase_a.step3.global.pr',   label: R(project,'rpt_ann3_row2') },
      { key: 'phase_a.step4.lifetime_T',  label: R(project,'rpt_ann3_row3') },
      { key: 'phase_a.step6.WACC',        label: R(project,'rpt_ann3_row4') }
    ];

    function getNestedVal(obj, path) {
      return path.split('.').reduce((o, k) => o?.[k], obj);
    }

    const headerRow = `<tr>
      <th>${R(project,'rpt_ann3_col1')}</th>
      ${scenarios.map(s => `<th class="num" style="color:${s.color}">${s.label}</th>`).join('')}
    </tr>`;

    const paramRows = paramKeys.map(({ key, label }) => {
      const vals = scenarios.map(sc => {
        const ovr  = s9[sc.key]?.overrides || {};
        const base = getNestedVal(project, key);
        const val  = ovr[key] !== undefined ? ovr[key] : base;
        const fmt  = key.includes('lifetime')
          ? `${val} ${R(project,'rpt_years')}`
          : key.includes('WACC') || key.includes('epr') || key.includes('pr')
          ? fmtPct(val)
          : fmtEUR(val);
        return `<td class="num">${fmt}</td>`;
      }).join('');
      return `<tr><td>${label}</td>${vals}</tr>`;
    });

    const npvRow = `<tr class="total-row">
      <td><strong>${R(project,'rpt_ann3_npv')}</strong></td>
      ${scenarios.map(sc => {
        const npv = s9[sc.key]?.NPV;
        return `<td class="num ${npv >= 0 ? 'positive' : 'negative'}"><strong>${fmtEUR(npv)}</strong></td>`;
      }).join('')}
    </tr>`;

    return `<div class="table-responsive">
      <table>
        <thead>${headerRow}</thead>
        <tbody>${paramRows.join('')}${npvRow}</tbody>
      </table>
    </div>`;
  }

  return { buildReport };
})();

window.ValeriReport = ValeriReport;
