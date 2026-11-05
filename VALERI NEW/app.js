/* ============================================================
   VALERI — Main Application (i18n edition)
   State machine, routing, project management, all 11 steps
   DIN EN 17463:2021 + A1:2024
   ============================================================ */

/* ────────────────────────────────────────────────────────────
   STATE MANAGEMENT
   ──────────────────────────────────────────────────────────── */

const State = (() => {
  let projectsCache = null;
  const ACTIVE_KEY  = 'valeri_active_project';

  async function init() {
    const res = await fetch('/api/valerinew/projects', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Not authenticated');
    projectsCache = await res.json();
  }

  function loadAll() {
    return projectsCache || {};
  }

  function saveAll(projects) {
    projectsCache = projects;
  }

  function getActive() {
    const id = localStorage.getItem(ACTIVE_KEY);
    if (!id) return null;
    return loadAll()[id] || null;
  }

  function setActive(id) {
    localStorage.setItem(ACTIVE_KEY, id);
  }

  async function apiSave(project) {
    try {
      await fetch('/api/valerinew/projects/' + project.meta.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
        credentials: 'same-origin'
      });
    } catch (e) {
      console.error('Failed to save to server', e);
      if (typeof toast === 'function') toast('Fehler beim Speichern auf dem Server', 'error');
    }
  }

  async function apiDelete(id) {
    try {
      await fetch('/api/valerinew/projects/' + id, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
    } catch (e) {
      console.error('Failed to delete from server', e);
    }
  }

  function save(project) {
    project.meta.modified = new Date().toISOString();
    projectsCache[project.meta.id] = project;
    apiSave(project);
    return project;
  }

  function del(id) {
    delete projectsCache[id];
    if (localStorage.getItem(ACTIVE_KEY) === id) {
      localStorage.removeItem(ACTIVE_KEY);
    }
    apiDelete(id);
  }

  async function clearAll() {
    projectsCache = {};
    localStorage.removeItem(ACTIVE_KEY);
    try {
      await fetch('/api/valerinew/projects', {
        method: 'DELETE',
        credentials: 'same-origin'
      });
    } catch (e) {
      console.error('Failed to clear projects from server', e);
    }
  }

  function create(name, evaluator, company, lang) {
    const id = 'VALERI-' + new Date().getFullYear() + '-' + String(Object.keys(projectsCache || {}).length + 1).padStart(3, '0');
    const project = createBlankProject(id, name, evaluator, company, lang);
    save(project);
    setActive(id);
    return project;
  }

  return { init, loadAll, getActive, setActive, save, del, clearAll, create };
})();

/* ────────────────────────────────────────────────────────────
   BLANK PROJECT TEMPLATE
   ──────────────────────────────────────────────────────────── */

function createBlankProject(id, name, evaluator, company, lang) {
  return {
    meta: {
      id, name, evaluator, company,
      lang: lang || Lang.get(),
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      currentStep: 1
    },
    phase_a: {
      step1: { completed: false, eri_description: '', impacts: [] },
      step2: { completed: false, quantities: {} },
      step3: { completed: false, cashflows: {}, global: { epr: 0.03, pr: 0.02, degradation: 0 } },
      step4: { completed: false, lifetime_T: 15, residual_value: 0, residual_value_timing: 'tT' },
      step5: { completed: false, risk_applicable: false, R_loss: 0, p_loss: 0, f_ded_risk: 0 },
      step6: { completed: false, S_eq: 0.6, r_eq: 0.08, S_debt: 0.4, r_debt: 0.045, WACC: 0.066 }
    },
    phase_b: {
      step7: { completed: false, cashflow_table: [], NPV: null },
      step8: { completed: false, parameters_varied: [], range_pct: 50, results: [] },
      step9: {
        completed: false,
        worst_case:  { NPV: null, overrides: {}, label: 'Worst-Case' },
        most_likely: { NPV: null, overrides: {}, label: 'Most Likely' },
        best_case:   { NPV: null, overrides: {}, label: 'Best-Case'  }
      }
    },
    phase_c: { step10: { completed: false, ai_evaluation: '', qualitative_notes: '' } },
    phase_d: { step11: { completed: false, report_html: '' } }
  };
}

/* ────────────────────────────────────────────────────────────
   PER-PROJECT LANGUAGE HELPER
   Use project language when inside a step; fall back to global
   ──────────────────────────────────────────────────────────── */
function PT(key, ...args) {
  const lang = currentProject?.meta?.lang || Lang.get();
  const dict = Translations[lang] || Translations['de'];
  let str = dict[key] ?? Translations['de'][key] ?? key;
  args.forEach((val, i) => { str = str.replace(`{${i}}`, val); });
  return str;
}

/* ────────────────────────────────────────────────────────────
   DEMO PROJECT (Pumpenaustausch / Pump Replacement)
   ──────────────────────────────────────────────────────────── */

function createDemoProject(lang) {
  lang = lang || Lang.get();
  const isEN = lang === 'en';
  const id = 'VALERI-2024-DEMO';

  const p = createBlankProject(
    id,
    isEN ? 'Pump Replacement Plant 2 (Demo)' : 'Pumpenaustausch Werk 2 (Demo)',
    'Max Mustermann',
    isEN ? 'Sample Company Ltd.' : 'Musterfirma GmbH',
    lang
  );

  p.phase_a.step1 = {
    completed: true,
    eri_description: isEN
      ? 'Replacement of 5 outdated pumps with IE4 high-efficiency pumps in the production area of Plant 2.'
      : 'Austausch von 5 veralteten Pumpen durch IE4-Hocheffizienzpumpen im Produktionsbereich Werk 2.',
    impacts: [
      { id: 'imp-001', category: 'energy_flow',         type: 'benefit', description: isEN ? 'Electricity savings through higher pump efficiency'    : 'Stromeinsparung durch höhere Pumpenwirkungsgrade', monetizable: true,  unit: 'kWh/a',     timing: 'annual', price_variation_type: 'epr',  ai_generated: true,  user_overridden: false },
      { id: 'imp-002', category: 'additional_financial', type: 'burden',  description: isEN ? 'Investment costs (CAPEX)'                              : 'Investitionskosten (CAPEX)',                        monetizable: true,  unit: '€',         timing: 't0',     price_variation_type: 'none', ai_generated: false, user_overridden: false },
      { id: 'imp-003', category: 'additional_financial', type: 'burden',  description: isEN ? 'Annual maintenance costs (OPEX)'                       : 'Jährliche Wartungskosten (OPEX)',                   monetizable: true,  unit: '€/a',       timing: 'annual', price_variation_type: 'pr',   ai_generated: true,  user_overridden: false },
      { id: 'imp-004', category: 'additional_financial', type: 'benefit', description: isEN ? 'Residual value at project end'                         : 'Restwert am Projektende',                           monetizable: true,  unit: '€',         timing: 'tT',     price_variation_type: 'none', ai_generated: true,  user_overridden: false },
      { id: 'imp-005', category: 'other',               type: 'benefit', description: isEN ? 'Noise reduction from 90 dB to 65 dB'                   : 'Lärmreduzierung von 90 dB auf 65 dB',               monetizable: false, unit: 'dB',        timing: 'annual', price_variation_type: 'none', ai_generated: true,  user_overridden: false },
      { id: 'imp-006', category: 'other',               type: 'benefit', description: isEN ? 'CO₂ reduction through lower power consumption'          : 'CO₂-Reduktion durch geringeren Stromverbrauch',     monetizable: false, unit: 't CO₂/a',   timing: 'annual', price_variation_type: 'none', ai_generated: true,  user_overridden: false }
    ]
  };
  p.phase_a.step2 = {
    completed: true,
    quantities: {
      'imp-001': { quantity: 150000, unit: 'kWh/a' },
      'imp-002': { quantity: 60000,  unit: '€'     },
      'imp-003': { quantity: 1500,   unit: '€/a'   },
      'imp-004': { quantity: 5000,   unit: '€'     },
      'imp-005': { quantity: 25,     unit: 'dB'    },
      'imp-006': { quantity: 60,     unit: 't CO₂/a' }
    }
  };
  p.phase_a.step3 = {
    completed: true,
    cashflows: {
      'imp-001': { unit_price: 0.18, annual_amount: 27000,  timing: 'annual', price_variation_type: 'epr'  },
      'imp-002': { unit_price: 1,    annual_amount: -60000, timing: 't0',     price_variation_type: 'none' },
      'imp-003': { unit_price: 1,    annual_amount: -1500,  timing: 'annual', price_variation_type: 'pr'   },
      'imp-004': { unit_price: 1,    annual_amount: 5000,   timing: 'tT',     price_variation_type: 'none' },
    },
    global: { epr: 0.03, pr: 0.02, degradation: 0.0 }
  };
  p.phase_a.step4 = { completed: true, lifetime_T: 15, residual_value: 5000, residual_value_timing: 'tT' };
  p.phase_a.step5 = { completed: true, risk_applicable: true,  R_loss: 0.20, p_loss: 0.15, f_ded_risk: 0.03 };
  p.phase_a.step6 = { completed: true, S_eq: 0.60, r_eq: 0.08, S_debt: 0.40, r_debt: 0.045, WACC: 0.066 };

  const { table, NPV } = ValeriMath.buildCashFlowTable(p);
  p.phase_b.step7 = { completed: true, cashflow_table: table, NPV };

  const sensParams = ValeriMath.getStandardSensParams(p);
  const sensResults = ValeriMath.sensitivityAnalysis(p, sensParams, 50);
  p.phase_b.step8 = { completed: true, parameters_varied: sensParams.map(x=>x.key), range_pct: 50, results: sensResults };

  const scenDefs = buildDefaultScenarios(p);
  const scenResults = ValeriMath.scenarioAnalysis(p, scenDefs);
  p.phase_b.step9 = {
    completed: true,
    worst_case:  { NPV: scenResults.worst.NPV, overrides: scenDefs.worst, label: isEN ? 'Worst-Case' : 'Worst-Case' },
    most_likely: { NPV, overrides: {},                                     label: isEN ? 'Most Likely' : 'Basisfall'  },
    best_case:   { NPV: scenResults.best.NPV,  overrides: scenDefs.best,  label: isEN ? 'Best-Case'  : 'Best-Case'  }
  };

  p.meta.currentStep = 10;
  return p;
}

function buildDefaultScenarios(project) {
  const T    = project.phase_a.step4.lifetime_T;
  const WACC = project.phase_a.step6.WACC;
  const epr  = project.phase_a.step3.global.epr;
  return {
    worst: { 'phase_a.step4.lifetime_T': Math.max(3, T-3), 'phase_a.step6.WACC': WACC+0.02, 'phase_a.step3.global.epr': Math.max(0, epr-0.02) },
    best:  { 'phase_a.step4.lifetime_T': T+3,              'phase_a.step6.WACC': Math.max(0.01, WACC-0.015), 'phase_a.step3.global.epr': epr+0.02 }
  };
}

/* ────────────────────────────────────────────────────────────
   UI HELPERS
   ──────────────────────────────────────────────────────────── */

function toast(msg, type = 'info', duration = 3500) {
  const icons = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function showModal({ title, body, confirmText, cancelText, danger = false, onConfirm }) {
  confirmText = confirmText || T('btn_confirm');
  cancelText  = cancelText  || T('btn_cancel');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-title">${title}</div>
      <div class="modal-body">${body}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">${cancelText}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm">${confirmText}</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#modal-cancel').onclick  = () => backdrop.remove();
  backdrop.querySelector('#modal-confirm').onclick = () => { onConfirm?.(); backdrop.remove(); };
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
}

function withAILoading(container, fn) {
  container.innerHTML = `<div class="ai-loading"><div class="ai-dots"><span></span><span></span><span></span></div> ${T('ai_loading')}</div>`;
  return fn().catch(err => {
    toast(T('ai_err', err.message), 'error', 5000);
    container.innerHTML = '';
    throw err;
  });
}

function fmtEUR(v)     { return ValeriMath.fmtEUR(v); }
function fmtPct(v)     { return ValeriMath.fmtPct(v); }
function fmtNum(v, dp) { return ValeriMath.fmtNum(v, dp); }

/* ────────────────────────────────────────────────────────────
   STEP METADATA (localised)
   ──────────────────────────────────────────────────────────── */

function getSteps() {
  return [
    { id:1,  phase:'A', phaseName: PT('phase_a_name'), title: PT('step1_title'),  badge:'phase-a-badge' },
    { id:2,  phase:'A', phaseName: PT('phase_a_name'), title: PT('step2_title'),  badge:'phase-a-badge' },
    { id:3,  phase:'A', phaseName: PT('phase_a_name'), title: PT('step3_title'),  badge:'phase-a-badge' },
    { id:4,  phase:'A', phaseName: PT('phase_a_name'), title: PT('step4_title'),  badge:'phase-a-badge' },
    { id:5,  phase:'A', phaseName: PT('phase_a_name'), title: PT('step5_title'),  badge:'phase-a-badge' },
    { id:6,  phase:'A', phaseName: PT('phase_a_name'), title: PT('step6_title'),  badge:'phase-a-badge' },
    { id:7,  phase:'B', phaseName: PT('phase_b_name'), title: PT('step7_title'),  badge:'phase-b-badge' },
    { id:8,  phase:'B', phaseName: PT('phase_b_name'), title: PT('step8_title'),  badge:'phase-b-badge' },
    { id:9,  phase:'B', phaseName: PT('phase_b_name'), title: PT('step9_title'),  badge:'phase-b-badge' },
    { id:10, phase:'C', phaseName: PT('phase_c_name'), title: PT('step10_title'), badge:'phase-c-badge' },
    { id:11, phase:'D', phaseName: PT('phase_d_name'), title: PT('step11_title'), badge:'phase-d-badge' },
  ];
}

function getPhaseGroups() {
  return {
    'A': { label: PT('phase_a_label'), steps:[1,2,3,4,5,6] },
    'B': { label: PT('phase_b_label'), steps:[7,8,9]       },
    'C': { label: PT('phase_c_label'), steps:[10]           },
    'D': { label: PT('phase_d_label'), steps:[11]           }
  };
}

/* ────────────────────────────────────────────────────────────
   ROUTER
   ──────────────────────────────────────────────────────────── */

let currentView    = 'home';
let currentStep    = 1;
let currentProject = null;

function navigate(view, step) {
  currentView = view;
  if (step) currentStep = step;
  render();
}

function render() {
  renderHeader();
  renderSidebar();
  renderMain();
}

/* ────────────────────────────────────────────────────────────
   HEADER
   ──────────────────────────────────────────────────────────── */

function renderHeader() {
  const hdr  = document.getElementById('app-header');
  const proj = currentProject;
  const lang = Lang.get();

  const showProj = proj && currentView === 'step';

  hdr.innerHTML = `
    <a class="app-logo" href="#" onclick="navigate('home');return false;">
      <div class="app-logo-icon">V</div>
      <div>
        <span class="app-logo-text">VALERI</span>
        <span class="app-logo-sub">${T('app_subtitle')}</span>
      </div>
    </a>
    <div class="header-project-info">
      ${showProj ? `<span class="header-project-badge">${proj.meta.id}</span>
        <span class="header-project-name">${proj.meta.name}</span>` : ''}
    </div>
    <div class="header-actions">
      ${showProj ? `<button class="btn btn-secondary btn-sm" onclick="navigate('home')">${T('nav_projects')}</button>` : ''}
      <div class="lang-switcher" title="Switch language / Sprache wechseln">
        <button class="lang-btn ${lang==='de'?'active':''}" onclick="switchLang('de')">DE</button>
        <button class="lang-btn ${lang==='en'?'active':''}" onclick="switchLang('en')">EN</button>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="navigate('settings')">${T('nav_settings')}</button>
      <a href="/accesspoint" class="btn btn-ghost btn-sm" style="text-decoration:none;">${lang==='de' ? 'Access Point' : 'Access Point'}</a>
    </div>`;
}

function switchLang(lang) {
  Lang.set(lang);
  render();
  toast(lang === 'de' ? 'Sprache: Deutsch' : 'Language: English', 'info', 2000);
}

/* ────────────────────────────────────────────────────────────
   SIDEBAR
   ──────────────────────────────────────────────────────────── */

function renderSidebar() {
  const sb = document.getElementById('sidebar');
  if (currentView === 'home' || currentView === 'settings' || !currentProject) {
    sb.innerHTML = '';
    sb.style.display = 'none';
    return;
  }
  sb.style.display = '';

  const proj          = currentProject;
  const highestUnlocked = getHighestUnlockedStep(proj);
  const STEPS         = getSteps();
  const PHASE_GROUPS  = getPhaseGroups();

  let html = '';
  Object.entries(PHASE_GROUPS).forEach(([phase, group]) => {
    html += `<div class="phase-group phase-${phase.toLowerCase()}">
      <div class="phase-label">${group.label}</div>`;
    group.steps.forEach(stepId => {
      const step    = STEPS.find(s => s.id === stepId);
      const isDone  = isStepDone(proj, stepId);
      const isActive= currentStep === stepId;
      const isLocked= stepId > highestUnlocked;
      const cls = ['step-nav-item', isDone?'done':'', isActive?'active':'', isLocked?'locked':''].filter(Boolean).join(' ');
      html += `<div class="${cls}" onclick="goToStep(${stepId})">
        <div class="step-num">${isDone && !isActive ? '✓' : stepId}</div>
        <div class="step-nav-label">${step.title}</div>
      </div>`;
    });
    html += `</div>`;
  });

  const done = STEPS.filter(s => isStepDone(proj, s.id)).length;
  const pct  = Math.round(done / 11 * 100);
  html += `<div style="margin-top:1.5rem;padding:0 0.5rem;">
    <div class="flex justify-between text-xs text-muted mb-1">
      <span>${PT('progress_label')}</span><span>${PT('progress_steps', done)}</span>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" style="width:${pct}%"></div>
    </div>
  </div>`;

  sb.innerHTML = html;
}

function isStepDone(proj, stepId) {
  if (stepId <= 6)  return proj.phase_a[`step${stepId}`]?.completed === true;
  if (stepId <= 9)  return proj.phase_b[`step${stepId}`]?.completed === true;
  if (stepId === 10)return proj.phase_c?.step10?.completed === true;
  if (stepId === 11)return proj.phase_d?.step11?.completed === true;
  return false;
}

function getHighestUnlockedStep(proj) {
  let highest = 1;
  for (let i = 1; i <= 11; i++) {
    if (isStepDone(proj, i)) highest = i + 1;
    else break;
  }
  return Math.min(highest, 11);
}

function goToStep(stepId) {
  if (!currentProject) return;
  const maxAllowed = getHighestUnlockedStep(currentProject);
  if (stepId > maxAllowed) return;
  
  currentProject.meta.currentStep = stepId;
  State.save(currentProject);
  navigate('step', stepId);
}

/* ────────────────────────────────────────────────────────────
   MAIN CONTENT ROUTER
   ──────────────────────────────────────────────────────────── */

function renderMain() {
  const main = document.getElementById('main-content');
  if (currentView === 'home')     { renderHome(main);     return; }
  if (currentView === 'settings') { renderSettings(main); return; }
  if (currentView === 'step')     { renderStep(main);     return; }
}

/* ────────────────────────────────────────────────────────────
   HOME SCREEN
   ──────────────────────────────────────────────────────────── */

function renderHome(main) {
  const projects = State.loadAll();
  const projList = Object.values(projects);

  main.innerHTML = `
    <div class="welcome-hero">
      <div class="welcome-logo">V</div>
      <h1 class="welcome-title">${T('home_title')}</h1>
      <p class="welcome-sub">${T('home_sub').replace('\n','<br>')}</p>
      <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
        <button class="btn btn-primary btn-lg" onclick="openNewProjectModal()">${T('home_new_project')}</button>
        ${projList.length === 0 ? `<button class="btn btn-amber btn-lg" onclick="loadDemoProject()">${T('home_load_demo')}</button>` : ''}
      </div>
    </div>

    <div class="project-cards-grid">
      ${projList.length === 0 ? `
        <div class="card" style="grid-column:1/-1;text-align:center;padding:3rem 2rem;">
          <p class="text-muted">${T('home_no_projects').replace('\n','<br>')}</p>
        </div>` : ''}
      ${projList.map(p => {
        const npv = p.phase_b.step7.NPV;
        const npvLabel = npv !== null
          ? (npv >= 0 ? T('proj_npv_pos', fmtEUR(npv)) : T('proj_npv_neg', fmtEUR(Math.abs(npv))))
          : T('home_in_progress');
        const badgeCls = npv !== null ? (npv >= 0 ? 'badge-green' : 'badge-red') : 'badge-gray';
        const pl = p.meta.lang || 'de';
        const lastDate = new Date(p.meta.modified).toLocaleDateString(pl === 'en' ? 'en-GB' : 'de-DE');
        return `
        <div class="project-card" onclick="openProject('${p.meta.id}')">
          <div class="flex justify-between items-center mb-2">
            <span class="badge ${badgeCls}">${npvLabel}</span>
            <div style="display:flex;gap:0.25rem;align-items:center;">
              <span class="badge badge-gray" style="font-size:0.62rem;">${(p.meta.lang||'de').toUpperCase()}</span>
              <button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();deleteProject('${p.meta.id}')" title="Delete">🗑</button>
            </div>
          </div>
          <div class="project-card-title">${p.meta.name}</div>
          <div class="project-card-meta">
            ${p.meta.id} · ${p.meta.evaluator || T('proj_no_evaluator')} · ${p.meta.company || ''}<br>
            ${T('home_step_of', p.meta.currentStep || 1)} · ${T('home_last_modified', lastDate)}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function openNewProjectModal() {
  showModal({
    title: T('new_proj_title'),
    body: `
      <div class="form-group mt-3">
        <label class="form-label">${T('new_proj_name_label')} <span class="required">*</span></label>
        <input id="np-name" class="form-control" placeholder="${T('new_proj_name_ph')}" value="">
      </div>
      <div class="form-group">
        <label class="form-label">${T('new_proj_eval_label')}</label>
        <input id="np-eval" class="form-control" placeholder="${T('new_proj_eval_ph')}">
      </div>
      <div class="form-group">
        <label class="form-label">${T('new_proj_co_label')}</label>
        <input id="np-co" class="form-control" placeholder="${T('new_proj_co_ph')}">
      </div>
      <div class="form-group">
        <label class="form-label">${T('new_proj_lang_label')}</label>
        <div class="toggle-group" style="margin-top:0.25rem;">
          <button class="toggle-btn ${Lang.isDE()?'active':''}" id="np-lang-de" onclick="npLangSelect('de')">🇩🇪 Deutsch</button>
          <button class="toggle-btn ${Lang.isEN()?'active':''}" id="np-lang-en" onclick="npLangSelect('en')">🇬🇧 English</button>
        </div>
        <p class="form-hint" style="margin-top:0.375rem;">${Lang.isDE() ? 'Sprache für Berichtstexte und KI-Ausgaben' : 'Language for report texts and AI outputs'}</p>
      </div>`,
    confirmText: T('new_proj_create'),
    onConfirm: () => {
      const name = document.getElementById('np-name')?.value?.trim();
      if (!name) { toast(T('new_proj_err_name'), 'error'); return openNewProjectModal(); }
      const eval_ = document.getElementById('np-eval')?.value?.trim() || '';
      const co    = document.getElementById('np-co')?.value?.trim()   || '';
      const lang  = document.getElementById('np-lang-en')?.classList.contains('active') ? 'en' : 'de';
      currentProject = State.create(name, eval_, co, lang);
      toast(T('toast_proj_created', name), 'success');
      navigate('step', 1);
    }
  });
}

function npLangSelect(lang) {
  document.getElementById('np-lang-de')?.classList.toggle('active', lang === 'de');
  document.getElementById('np-lang-en')?.classList.toggle('active', lang === 'en');
}

function openProject(id) {
  const all = State.loadAll();
  currentProject = all[id];
  if (!currentProject) { toast(T('toast_proj_not_found'), 'error'); return; }
  State.setActive(id);
  navigate('step', currentProject.meta.currentStep || 1);
}

function deleteProject(id) {
  const all  = State.loadAll();
  const name = all[id]?.meta?.name || id;
  showModal({
    title:       T('del_title'),
    body:        T('del_body', name),
    confirmText: T('del_confirm'),
    danger: true,
    onConfirm: () => {
      State.del(id);
      if (currentProject?.meta?.id === id) currentProject = null;
      toast(T('del_toast'), 'warning');
      navigate('home');
    }
  });
}

function loadDemoProject() {
  const all = State.loadAll();
  if (all['VALERI-2024-DEMO']) {
    openProject('VALERI-2024-DEMO');
  } else {
    const demo = createDemoProject(Lang.get());
    State.save(demo);
    openProject(demo.meta.id);
    toast(T('demo_toast'), 'success');
  }
}

/* ────────────────────────────────────────────────────────────
   SETTINGS
   ──────────────────────────────────────────────────────────── */

function renderSettings(main) {
  const lang   = Lang.get();
  main.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-step-badge phase-d-badge">⚙</div>
        <div class="card-title-group">
          <div class="card-phase-tag">${T('settings_config')}</div>
          <div class="card-title">${T('settings_title')}</div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">${T('settings_lang_title')}</div>
        <div class="form-group">
          <label class="form-label">${T('settings_lang_label')}</label>
          <div class="toggle-group mt-1">
            <button class="toggle-btn ${lang==='de'?'active':''}" onclick="switchLang('de')">🇩🇪 Deutsch</button>
            <button class="toggle-btn ${lang==='en'?'active':''}" onclick="switchLang('en')">🇬🇧 English</button>
          </div>
          <p class="form-hint">${lang==='de' ? 'Betrifft die gesamte Oberfläche. Die Berichtssprache wird pro Projekt festgelegt.' : 'Applies to the entire interface. Report language is set per project.'}</p>
        </div>
      </div>



      <div class="settings-section">
        <div class="settings-section-title">${T('settings_data_title')}</div>
        <button class="btn btn-danger" onclick="clearAllData()">${T('btn_delete_all')}</button>
      </div>
    </div>`;
}


function clearAllData() {
  showModal({
    title:       T('settings_clear_title'),
    body:        T('settings_clear_body'),
    confirmText: T('settings_clear_btn'),
    danger: true,
    onConfirm: () => {
      State.clearAll();
      currentProject = null;
      toast(T('settings_cleared'), 'warning');
      navigate('home');
    }
  });
}

/* ────────────────────────────────────────────────────────────
   STEP RENDERER DISPATCH
   ──────────────────────────────────────────────────────────── */

function renderStep(main) {
  if (!currentProject) { navigate('home'); return; }
  const renderers = {
    1:renderStep1, 2:renderStep2, 3:renderStep3,
    4:renderStep4, 5:renderStep5, 6:renderStep6,
    7:renderStep7, 8:renderStep8, 9:renderStep9,
    10:renderStep10, 11:renderStep11
  };
  const fn = renderers[currentStep];
  if (fn) fn(main, currentProject);
  else main.innerHTML = `<div class="card"><p>Step ${currentStep} not found.</p></div>`;
}

/* ────────────────────────────────────────────────────────────
   STEP 1: Identify Benefits & Burdens
   ──────────────────────────────────────────────────────────── */

function renderStep1(main, proj) {
  const s = proj.phase_a.step1;
  const impacts = s.impacts || [];

  main.innerHTML = stepHeader(1,'A',PT('phase_a_name'),PT('step1_title'),PT('step1_sub'), 'Nach DIN EN 17463 müssen Energiebezogene Investitionen (ERI) klar definiert und ihre Auswirkungen erfasst werden.') + `
    <div class="card">
      <div class="form-group">
        <label class="form-label">${PT('s1_eri_label')} <span class="required">*</span></label>
        <textarea id="s1-eri-desc" class="form-control" rows="3"
          placeholder="${PT('s1_eri_ph')}">${s.eri_description || ''}</textarea>
        <p class="form-hint">${PT('s1_eri_hint')}</p>
      </div>
      <div id="ai-suggest-area"></div>
      <button class="btn btn-amber" onclick="step1_aiSuggest()">${PT('btn_ai_impacts')}</button>
    </div>

    <div class="card">
      <div class="section-header">
        <div class="section-title">${PT('s1_impacts_title')}</div>
        <button class="btn btn-secondary btn-sm" onclick="step1_addImpact()">${PT('btn_add_manual')}</button>
      </div>
      ${impacts.length === 0 ? `<p id="s1-empty-msg" class="text-muted text-sm" style="padding:1rem 0;">${PT('s1_no_impacts')}</p>` : ''}
      <div id="impacts-list">${impacts.map(imp => renderImpactRow(imp, proj)).join('')}</div>
    </div>

    <div class="step-footer">
      <div class="step-footer-left"></div>
      <div class="step-footer-right">
        <button class="btn btn-primary" onclick="step1_save()">${PT('btn_next')}</button>
      </div>
    </div>`;
}

function renderImpactRow(imp, proj) {
  proj = proj || currentProject;
  const catLabels = {
    energy_flow:         PT('cat_energy_label'),
    additional_financial:PT('cat_financial_label'),
    other:               PT('cat_other_label')
  };
  const catCss = { energy_flow:'cat-energy', additional_financial:'cat-financial', other:'cat-other' };
  return `<div class="impact-row" id="irow-${imp.id}" style="border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:0.875rem;margin-bottom:0.625rem;display:flex;gap:0.75rem;align-items:flex-start;">
    <div style="flex:1;">
      <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-bottom:0.375rem;">
        <span class="category-pill ${catCss[imp.category]}">${catLabels[imp.category]}</span>
        <span class="badge ${imp.type==='benefit'?'badge-green':'badge-red'}">${imp.type==='benefit'?PT('badge_benefit'):PT('badge_burden')}</span>
        <span class="badge ${imp.monetizable?'badge-blue':'badge-gray'}">${imp.monetizable?PT('badge_monetizable'):PT('badge_non_mon')}</span>
        ${imp.ai_generated && !imp.user_overridden ? `<span class="badge badge-amber">${PT('badge_ai')}</span>` : ''}
        ${imp.user_overridden ? `<span class="badge badge-purple">${PT('badge_manual')}</span>` : ''}
      </div>
      <div style="font-size:0.875rem;color:var(--text-primary);font-weight:500;">${imp.description}</div>
      <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.2rem;">
        ${PT('s1_edit_unit')}: ${imp.unit || '—'} · ${imp.timing==='t0'?PT('badge_t0'):imp.timing==='tT'?PT('badge_tT'):PT('badge_annual')}
      </div>
    </div>
    <div style="display:flex;gap:0.375rem;flex-shrink:0;">
      <button class="btn btn-secondary btn-sm btn-icon" onclick="step1_editImpact('${imp.id}')" title="Edit">✏</button>
      <button class="btn btn-danger btn-sm btn-icon"    onclick="step1_deleteImpact('${imp.id}')" title="Delete">✕</button>
    </div>
  </div>`;
}

async function step1_aiSuggest() {
  const desc = document.getElementById('s1-eri-desc').value.trim();
  if (!desc) { toast(PT('toast_warn_desc'), 'warning'); return; }
  const area = document.getElementById('ai-suggest-area');
  try {
    await withAILoading(area, async () => {
      const result = await ValeriAI.suggestImpacts(desc);
      const newImpacts = result.impacts.map((imp, i) => ({
        ...imp, id:'imp-'+Date.now()+'-'+i, ai_generated:true, user_overridden:false
      }));
      currentProject.phase_a.step1.eri_description = desc;
      currentProject.phase_a.step1.impacts = [...(currentProject.phase_a.step1.impacts||[]), ...newImpacts];
      State.save(currentProject);
      area.innerHTML = `<div class="ai-suggestion mb-3"><div class="ai-suggestion-header">${PT('s1_ai_applied')}</div>
        <div class="ai-suggestion-content">${PT('s1_ai_applied_msg', newImpacts.length)}</div></div>`;
      document.getElementById('impacts-list').innerHTML = currentProject.phase_a.step1.impacts.map(imp => renderImpactRow(imp)).join('');
      const emptyMsg = document.getElementById('s1-empty-msg');
      if (emptyMsg) emptyMsg.remove();
      toast(PT('s1_toast_added', newImpacts.length), 'success');
    });
  } catch(e) {}
}

function step1_deleteImpact(id) {
  currentProject.phase_a.step1.impacts = currentProject.phase_a.step1.impacts.filter(i => i.id !== id);
  State.save(currentProject);
  document.getElementById('impacts-list').innerHTML = currentProject.phase_a.step1.impacts.map(imp => renderImpactRow(imp)).join('');
  toast(PT('s1_toast_deleted'), 'info');
}

function step1_editImpact(id) {
  const imp = currentProject.phase_a.step1.impacts.find(i => i.id === id);
  if (!imp) return;
  const catOpts = [
    {v:'energy_flow',         l:PT('s1_cat_energy')},
    {v:'additional_financial',l:PT('s1_cat_financial')},
    {v:'other',               l:PT('s1_cat_other')}
  ];
  const timingOpts = [
    {v:'t0',    l:PT('s1_timing_t0')},
    {v:'annual',l:PT('s1_timing_annual')},
    {v:'tT',    l:PT('s1_timing_tT')}
  ];
  const varOpts = [
    {v:'epr', l:PT('s1_pv_epr')},
    {v:'pr',  l:PT('s1_pv_pr')},
    {v:'none',l:PT('s1_pv_none')}
  ];
  showModal({
    title: PT('s1_edit_title'),
    body: `
      <div class="form-group mt-3">
        <label class="form-label">${PT('s1_edit_desc')}</label>
        <input id="edit-desc" class="form-control" value="${imp.description}">
      </div>
      <div class="form-row form-row-2 mt-2">
        <div class="form-group">
          <label class="form-label">${PT('s1_edit_cat')}</label>
          <select id="edit-cat" class="form-control">
            ${catOpts.map(o=>`<option value="${o.v}" ${imp.category===o.v?'selected':''}>${o.l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${PT('s1_edit_type')}</label>
          <select id="edit-type" class="form-control">
            <option value="benefit" ${imp.type==='benefit'?'selected':''}>${PT('s1_type_benefit')}</option>
            <option value="burden"  ${imp.type==='burden'?'selected':''}>${PT('s1_type_burden')}</option>
          </select>
        </div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">${PT('s1_edit_unit')}</label>
          <input id="edit-unit" class="form-control" value="${imp.unit||''}">
        </div>
        <div class="form-group">
          <label class="form-label">${PT('s1_edit_monetizable')}</label>
          <select id="edit-mon" class="form-control">
            <option value="true"  ${imp.monetizable?'selected':''}>${PT('s1_yes')}</option>
            <option value="false" ${!imp.monetizable?'selected':''}>${PT('s1_no')}</option>
          </select>
        </div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">${PT('s1_edit_timing')}</label>
          <select id="edit-timing" class="form-control">
            ${timingOpts.map(o=>`<option value="${o.v}" ${imp.timing===o.v?'selected':''}>${o.l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${PT('s1_edit_pricevar')}</label>
          <select id="edit-pv" class="form-control">
            ${varOpts.map(o=>`<option value="${o.v}" ${imp.price_variation_type===o.v?'selected':''}>${o.l}</option>`).join('')}
          </select>
        </div>
      </div>`,
    confirmText: PT('s1_edit_save'),
    onConfirm: () => {
      const idx = currentProject.phase_a.step1.impacts.findIndex(i => i.id === id);
      if (idx < 0) return;
      currentProject.phase_a.step1.impacts[idx] = {
        ...imp,
        description:          document.getElementById('edit-desc').value,
        category:             document.getElementById('edit-cat').value,
        type:                 document.getElementById('edit-type').value,
        unit:                 document.getElementById('edit-unit').value,
        monetizable:          document.getElementById('edit-mon').value === 'true',
        timing:               document.getElementById('edit-timing').value,
        price_variation_type: document.getElementById('edit-pv').value,
        user_overridden:      true
      };
      State.save(currentProject);
      document.getElementById('impacts-list').innerHTML = currentProject.phase_a.step1.impacts.map(imp => renderImpactRow(imp)).join('');
      const emptyMsg = document.getElementById('s1-empty-msg');
      if (emptyMsg) emptyMsg.remove();
      toast(PT('s1_toast_updated'), 'success');
    }
  });
}

function step1_addImpact() {
  const newImp = { id:'imp-manual-'+Date.now(), category:'energy_flow', type:'benefit',
    description:'', unit:'kWh/a', monetizable:true, timing:'annual',
    price_variation_type:'epr', ai_generated:false, user_overridden:false };
  currentProject.phase_a.step1.impacts.push(newImp);
  step1_editImpact(newImp.id);
}

function step1_save() {
  const desc = document.getElementById('s1-eri-desc').value.trim();
  if (!desc) { toast(PT('s1_err_desc'), 'error'); return; }
  if (!currentProject.phase_a.step1.impacts.length) { toast(PT('s1_err_impacts'), 'error'); return; }
  currentProject.phase_a.step1.eri_description = desc;
  currentProject.phase_a.step1.completed = true;
  currentProject.meta.currentStep = Math.max(currentProject.meta.currentStep||1, 2);
  State.save(currentProject);
  toast(PT('s1_toast_saved'), 'success');
  navigate('step', 2);
}

/* ────────────────────────────────────────────────────────────
   STEP 2: Quantify
   ──────────────────────────────────────────────────────────── */

function renderStep2(main, proj) {
  const s1 = proj.phase_a.step1;
  const s2 = proj.phase_a.step2;
  const monetizableImpacts = s1.impacts.filter(i => i.monetizable);
  const otherImpacts       = s1.impacts.filter(i => !i.monetizable);

  main.innerHTML = stepHeader(2,'A',PT('phase_a_name'),PT('step2_title'),PT('step2_sub'), 'Sammlung aller relevanten Daten (z. B. Lastgänge, Preise) nach DIN EN 17463 als Basis für die Cashflow-Berechnung.') + `
    <div class="card">
      <div class="section-title mb-3">${PT('s2_monetizable')}</div>
      ${monetizableImpacts.map(imp => {
        const q = s2.quantities?.[imp.id] || {};
        return `<div style="display:flex;gap:1rem;align-items:center;padding:0.75rem 0;border-bottom:1px solid var(--border-subtle);">
          <div style="flex:1;">
            <div style="font-size:0.875rem;font-weight:500;">${imp.description}</div>
            <span class="badge ${imp.type==='benefit'?'badge-green':'badge-red'} mt-1">${imp.type==='benefit'?PT('badge_benefit'):PT('badge_burden')}</span>
          </div>
          <div style="display:flex;gap:0.5rem;align-items:center;">
            <input type="number" step="any" id="qty-${imp.id}" class="form-control" style="width:150px;text-align:right;"
              value="${q.quantity??''}" placeholder="${PT('s2_qty_ph')}">
            <input type="text" id="unit-${imp.id}" class="form-control" style="width:100px;"
              value="${q.unit||imp.unit||''}" placeholder="${PT('s2_unit_ph')}">
          </div>
        </div>`;
      }).join('')}
      ${otherImpacts.length ? `
        <div class="section-title mt-4 mb-3">${PT('s2_other')}</div>
        ${otherImpacts.map(imp => {
          const q = s2.quantities?.[imp.id] || {};
          return `<div style="display:flex;gap:1rem;align-items:center;padding:0.75rem 0;border-bottom:1px solid var(--border-subtle);">
            <div style="flex:1;">
              <div style="font-size:0.875rem;font-weight:500;">${imp.description}</div>
              <span class="badge badge-gray mt-1">${PT('badge_non_mon')}</span>
            </div>
            <div style="display:flex;gap:0.5rem;align-items:center;">
              <input type="number" step="any" id="qty-${imp.id}" class="form-control" style="width:150px;text-align:right;"
                value="${q.quantity??''}" placeholder="${PT('s2_qty_ph')} (opt.)">
              <input type="text" id="unit-${imp.id}" class="form-control" style="width:100px;"
                value="${q.unit||imp.unit||''}" placeholder="${PT('s2_unit_ph')}">
            </div>
          </div>`;
        }).join('')}` : ''}
    </div>
    <div class="step-footer">
      <div class="step-footer-left"><button class="btn btn-secondary" onclick="navigate('step',1)">${PT('btn_back')}</button></div>
      <div class="step-footer-right"><button class="btn btn-primary" onclick="step2_save()">${PT('btn_next')}</button></div>
    </div>`;
}

function step2_save() {
  const impacts = currentProject.phase_a.step1.impacts;
  const quantities = {};
  impacts.forEach(imp => {
    const qEl = document.getElementById(`qty-${imp.id}`);
    const uEl = document.getElementById(`unit-${imp.id}`);
    if (qEl) quantities[imp.id] = { quantity: parseFloat(qEl.value)||0, unit: uEl?.value?.trim()||imp.unit||'' };
  });
  currentProject.phase_a.step2.quantities = quantities;
  currentProject.phase_a.step2.completed  = true;
  currentProject.meta.currentStep = Math.max(currentProject.meta.currentStep||1, 3);
  State.save(currentProject);
  toast(PT('s2_toast'), 'success');
  navigate('step', 3);
}

/* ────────────────────────────────────────────────────────────
   STEP 3: Monetization & Price Variations
   ──────────────────────────────────────────────────────────── */

function renderStep3(main, proj) {
  const s1 = proj.phase_a.step1;
  const s2 = proj.phase_a.step2;
  const s3 = proj.phase_a.step3;
  const monetizableImpacts = s1.impacts.filter(i => i.monetizable);
  const timingOpts = [{v:'t0',l:PT('timing_t0')},{v:'annual',l:PT('timing_annual')},{v:'tT',l:PT('timing_tT')}];
  const varOpts    = [{v:'epr',l:PT('pv_epr')},{v:'pr',l:PT('pv_pr')},{v:'none',l:PT('pv_none')}];

  main.innerHTML = stepHeader(3,'A',PT('phase_a_name'),PT('step3_title'),PT('step3_sub'), 'Gemäß DIN EN 17463 beinhalten Cashflows sowohl Energieeinsparungen als auch Zusatzkosten. Diese werden mit epr (Energiepreissteigerung) und pr (allg. Preissteigerung) dynamisiert.') + `
    <div class="card">
      <div class="flex justify-between items-center mb-3">
        <div class="section-title">${PT('s3_cashflows_title')}</div>
        <button class="btn btn-amber btn-sm" onclick="step3_aiSuggest()">${PT('btn_ai_suggest')}</button>
      </div>
      <div id="step3-ai-area"></div>
      ${monetizableImpacts.map(imp => {
        const q  = s2.quantities?.[imp.id] || {};
        const cf = s3.cashflows?.[imp.id]  || {};
        return `<div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:1rem;margin-bottom:0.75rem;">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;flex-wrap:wrap;">
            <span class="badge ${imp.type==='benefit'?'badge-green':'badge-red'}">${imp.type==='benefit'?PT('badge_benefit'):PT('badge_burden')}</span>
            <span style="font-size:0.875rem;font-weight:500;">${imp.description}</span>
            ${q.quantity ? `<span class="text-muted text-xs">${fmtNum(q.quantity,0)} ${q.unit}</span>` : ''}
          </div>
          <div class="form-row form-row-4">
            <div class="form-group">
              <label class="form-label">${PT('s3_unit_price')}</label>
              <div class="input-group">
                <input type="number" step="any" id="cf-price-${imp.id}" class="form-control" value="${cf.unit_price??''}"
                  placeholder="0,00" onchange="step3_recalc('${imp.id}')">
                <span class="input-addon input-addon-right">€</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">${PT('s3_annual_amount')}</label>
              <div class="input-group">
                <input type="number" step="any" id="cf-amount-${imp.id}" class="form-control"
                  value="${cf.annual_amount??''}" placeholder="0,00"
                  style="background:rgba(59,130,246,0.04);" onchange="markOverride('cf-amount-${imp.id}')">
                <span class="input-addon input-addon-right">€</span>
              </div>
              <p class="form-hint">${PT('s3_annual_hint')}</p>
            </div>
            <div class="form-group">
              <label class="form-label">${PT('s3_timing')}</label>
              <select id="cf-timing-${imp.id}" class="form-control">
                ${timingOpts.map(o=>`<option value="${o.v}" ${(cf.timing||imp.timing)===o.v?'selected':''}>${o.l}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">${PT('s3_price_var')}</label>
              <select id="cf-pv-${imp.id}" class="form-control">
                ${varOpts.map(o=>`<option value="${o.v}" ${(cf.price_variation_type||imp.price_variation_type)===o.v?'selected':''}>${o.l}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="card">
      <div class="section-title mb-3">${PT('s3_global_title')}</div>
      <p class="text-sm text-muted mb-3">${PT('s3_global_hint')}</p>
      <div class="form-row form-row-3">
        <div class="form-group">
          <label class="form-label">${PT('s3_epr_label')}</label>
          <div class="input-group">
            <input type="number" step="0.1" id="s3-epr" class="form-control" value="${((s3.global?.epr??0.03)*100).toFixed(1)}">
            <span class="input-addon input-addon-right">%/a</span>
          </div>
          <p class="form-hint">${PT('s3_epr_hint')}</p>
        </div>
        <div class="form-group">
          <label class="form-label">${PT('s3_pr_label')}</label>
          <div class="input-group">
            <input type="number" step="0.1" id="s3-pr" class="form-control" value="${((s3.global?.pr??0.02)*100).toFixed(1)}">
            <span class="input-addon input-addon-right">%/a</span>
          </div>
          <p class="form-hint">${PT('s3_pr_hint')}</p>
        </div>
        <div class="form-group">
          <label class="form-label">${PT('s3_degrad_label')}</label>
          <div class="input-group">
            <input type="number" step="0.1" id="s3-degrad" class="form-control" value="${((s3.global?.degradation??0)*100).toFixed(1)}">
            <span class="input-addon input-addon-right">%/a</span>
          </div>
          <p class="form-hint">${PT('s3_degrad_hint')}</p>
        </div>
      </div>
      <div class="formula-box">${PT('s3_formula')}</div>
    </div>

    <div class="step-footer">
      <div class="step-footer-left"><button class="btn btn-secondary" onclick="navigate('step',2)">${PT('btn_back')}</button></div>
      <div class="step-footer-right"><button class="btn btn-primary" onclick="step3_save()">${PT('btn_next')}</button></div>
    </div>`;
}

function step3_recalc(impId) {
  const imp = currentProject.phase_a.step1.impacts.find(i => i.id === impId);
  const q   = currentProject.phase_a.step2.quantities?.[impId];
  const priceEl  = document.getElementById(`cf-price-${impId}`);
  const amountEl = document.getElementById(`cf-amount-${impId}`);
  if (!priceEl || !amountEl || !q) return;
  const price = parseFloat(priceEl.value)||0;
  const sign  = imp.type==='benefit'?1:-1;
  amountEl.value = (price * (q.quantity||0) * sign).toFixed(2);
}

async function step3_aiSuggest() {
  const area = document.getElementById('step3-ai-area');
  try {
    await withAILoading(area, async () => {
      const result = await ValeriAI.suggestMonetization(currentProject);
      if (result.cashflows) {
        Object.entries(result.cashflows).forEach(([id, cf]) => {
          const priceEl  = document.getElementById(`cf-price-${id}`);
          const amountEl = document.getElementById(`cf-amount-${id}`);
          const timingEl = document.getElementById(`cf-timing-${id}`);
          if (priceEl)  { priceEl.value  = cf.unit_price;    priceEl.classList.add('ai-filled'); }
          if (amountEl) { amountEl.value = cf.annual_amount; amountEl.classList.add('ai-filled'); }
          if (timingEl && cf.timing) timingEl.value = cf.timing;
        });
      }
      if (result.global) {
        const eprEl = document.getElementById('s3-epr');
        const prEl  = document.getElementById('s3-pr');
        const dgEl  = document.getElementById('s3-degrad');
        if (eprEl) eprEl.value = (result.global.epr*100).toFixed(1);
        if (prEl)  prEl.value  = (result.global.pr*100).toFixed(1);
        if (dgEl)  dgEl.value  = (result.global.degradation*100).toFixed(1);
      }
      area.innerHTML = `<div class="ai-suggestion mb-3"><div class="ai-suggestion-header">${PT('s3_ai_applied')}</div>
        <div class="ai-suggestion-content">${PT('s3_ai_msg')}</div></div>`;
      toast(PT('s3_toast_ai'), 'success');
    });
  } catch(e) {}
}

function step3_save() {
  const impacts = currentProject.phase_a.step1.impacts.filter(i => i.monetizable);
  const cashflows = {};
  impacts.forEach(imp => {
    const priceEl  = document.getElementById(`cf-price-${imp.id}`);
    const amountEl = document.getElementById(`cf-amount-${imp.id}`);
    const timingEl = document.getElementById(`cf-timing-${imp.id}`);
    const pvEl     = document.getElementById(`cf-pv-${imp.id}`);
    cashflows[imp.id] = {
      unit_price:           parseFloat(priceEl?.value)||0,
      annual_amount:        parseFloat(amountEl?.value)||0,
      timing:               timingEl?.value||imp.timing||'annual',
      price_variation_type: pvEl?.value||imp.price_variation_type||'none'
    };
  });
  currentProject.phase_a.step3.cashflows = cashflows;
  currentProject.phase_a.step3.global = {
    epr:        parseFloat(document.getElementById('s3-epr').value)/100   ||0.03,
    pr:         parseFloat(document.getElementById('s3-pr').value)/100    ||0.02,
    degradation:parseFloat(document.getElementById('s3-degrad').value)/100||0
  };
  currentProject.phase_a.step3.completed = true;
  currentProject.meta.currentStep = Math.max(currentProject.meta.currentStep||1, 4);
  State.save(currentProject);
  toast(PT('s3_toast'), 'success');
  navigate('step', 4);
}

/* ────────────────────────────────────────────────────────────
   STEP 4: Investment Lifetime
   ──────────────────────────────────────────────────────────── */

function renderStep4(main, proj) {
  const s4 = proj.phase_a.step4;
  main.innerHTML = stepHeader(4,'A',PT('phase_a_name'),PT('step4_title'),PT('step4_sub'), 'Die Investitionslebensdauer ist der Bewertungszeitraum (T) gemäß DIN EN 17463. Sie entspricht meist der wirtschaftlichen Nutzungsdauer.') + `
    <div class="card">
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">${PT('s4_T_label')} <span class="required">*</span></label>
          <div class="input-group">
            <input type="number" min="1" max="50" id="s4-T" class="form-control" value="${s4.lifetime_T??15}">
            <span class="input-addon input-addon-right">${PT('rpt_years')}</span>
          </div>
          <p class="form-hint">${PT('s4_T_hint')}</p>
        </div>
        <div class="form-group">
          <label class="form-label">${PT('s4_rv_label')}</label>
          <div class="input-group">
            <input type="number" step="any" id="s4-rv" class="form-control" value="${s4.residual_value??0}">
            <span class="input-addon input-addon-right">€</span>
          </div>
          <p class="form-hint">${PT('s4_rv_hint')}</p>
        </div>
      </div>
      <div class="formula-box">${PT('s4_formula')}</div>
    </div>
    <div class="step-footer">
      <div class="step-footer-left"><button class="btn btn-secondary" onclick="navigate('step',3)">${PT('btn_back')}</button></div>
      <div class="step-footer-right"><button class="btn btn-primary" onclick="step4_save()">${PT('btn_next')}</button></div>
    </div>`;
}

function step4_save() {
  const T  = parseInt(document.getElementById('s4-T').value)||15;
  const rv = parseFloat(document.getElementById('s4-rv').value)||0;
  currentProject.phase_a.step4.lifetime_T = T;
  currentProject.phase_a.step4.residual_value = rv;
  if (rv !== 0) {
    currentProject.phase_a.step3.cashflows['residual'] = { unit_price:1, annual_amount:rv, timing:'tT', price_variation_type:'none' };
    const impIdx = currentProject.phase_a.step1.impacts.findIndex(i => i.id==='residual');
    if (impIdx < 0) {
      currentProject.phase_a.step1.impacts.push({
        id:'residual', category:'additional_financial', type: rv>=0?'benefit':'burden',
        description: PT('s4_residual_desc'), monetizable:true, unit:'€', timing:'tT',
        price_variation_type:'none', ai_generated:false, user_overridden:false
      });
      currentProject.phase_a.step2.quantities['residual'] = { quantity:Math.abs(rv), unit:'€' };
    }
  }
  currentProject.phase_a.step4.completed = true;
  currentProject.meta.currentStep = Math.max(currentProject.meta.currentStep||1, 5);
  State.save(currentProject);
  toast(PT('s4_toast'), 'success');
  navigate('step', 5);
}

/* ────────────────────────────────────────────────────────────
   STEP 5: Risk
   ──────────────────────────────────────────────────────────── */

function renderStep5(main, proj) {
  const s5 = proj.phase_a.step5;
  const applicable = s5.risk_applicable;
  main.innerHTML = stepHeader(5,'A',PT('phase_a_name'),PT('step5_title'),PT('step5_sub'), 'Risikoabschläge (f_ded,risk) nach DIN EN 17463 mindern die erwarteten Cashflows, um Unsicherheiten quantitativ abzubilden.') + `
    <div class="card">
      <div class="form-group">
        <label class="form-label">${PT('s5_apply_label')}</label>
        <div class="toggle-group mt-1">
          <button class="toggle-btn ${applicable?'active':''}" id="risk-yes" onclick="step5_toggleRisk(true)">${PT('s5_yes')}</button>
          <button class="toggle-btn ${!applicable?'active':''}" id="risk-no"  onclick="step5_toggleRisk(false)">${PT('s5_no')}</button>
        </div>
      </div>
      <div id="risk-inputs" style="${applicable?'':'display:none;'}">
        <hr class="divider">
        <div class="form-row form-row-2">
          <div class="form-group">
            <label class="form-label">${PT('s5_Rloss_label')}</label>
            <div class="input-group">
              <input type="number" step="1" min="0" max="100" id="s5-Rloss" class="form-control"
                value="${((s5.R_loss??0.2)*100).toFixed(0)}">
              <span class="input-addon input-addon-right">%</span>
            </div>
            <p class="form-hint">${PT('s5_Rloss_hint')}</p>
          </div>
          <div class="form-group">
            <label class="form-label">${PT('s5_ploss_label')}</label>
            <div class="input-group">
              <input type="number" step="1" min="0" max="100" id="s5-ploss" class="form-control"
                value="${((s5.p_loss??0.15)*100).toFixed(0)}">
              <span class="input-addon input-addon-right">%</span>
            </div>
            <p class="form-hint">${PT('s5_ploss_hint')}</p>
          </div>
        </div>
        <div class="formula-box">
          f_ded_risk = R_loss × p_loss = <span id="risk-result">${fmtPct(s5.f_ded_risk)}</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="step5_calcRisk()">${PT('btn_recalculate')}</button>
      </div>
    </div>
    <div class="step-footer">
      <div class="step-footer-left"><button class="btn btn-secondary" onclick="navigate('step',4)">${PT('btn_back')}</button></div>
      <div class="step-footer-right"><button class="btn btn-primary" onclick="step5_save()">${PT('btn_next')}</button></div>
    </div>`;
}

function step5_toggleRisk(on) {
  document.getElementById('risk-yes').classList.toggle('active', on);
  document.getElementById('risk-no').classList.toggle('active', !on);
  document.getElementById('risk-inputs').style.display = on ? '' : 'none';
}

function step5_calcRisk() {
  const R = parseFloat(document.getElementById('s5-Rloss').value)/100||0;
  const p = parseFloat(document.getElementById('s5-ploss').value)/100||0;
  const f = ValeriMath.calcRiskFactor({R_loss:R, p_loss:p});
  document.getElementById('risk-result').textContent = fmtPct(f);
}

function step5_save() {
  const applicable = document.getElementById('risk-yes').classList.contains('active');
  let R=0, p=0, f=0;
  if (applicable) {
    R = parseFloat(document.getElementById('s5-Rloss').value)/100||0;
    p = parseFloat(document.getElementById('s5-ploss').value)/100||0;
    f = ValeriMath.calcRiskFactor({R_loss:R,p_loss:p});
  }
  currentProject.phase_a.step5 = {completed:true, risk_applicable:applicable, R_loss:R, p_loss:p, f_ded_risk:f};
  currentProject.meta.currentStep = Math.max(currentProject.meta.currentStep||1, 6);
  State.save(currentProject);
  toast(PT('s5_toast'), 'success');
  navigate('step', 6);
}

/* ────────────────────────────────────────────────────────────
   STEP 6: WACC
   ──────────────────────────────────────────────────────────── */

function renderStep6(main, proj) {
  const s6 = proj.phase_a.step6;
  main.innerHTML = stepHeader(6,'A',PT('phase_a_name'),PT('step6_title'),PT('step6_sub'), 'Der Diskontierungssatz (oft WACC) wird nach DIN EN 17463 genutzt, um zukünftige Zahlungen auf den heutigen Barwert (NPV) abzuzinsen.') + `
    <div class="card">
      <div class="flex justify-between items-center mb-3">
        <div class="section-title">${PT('s6_title')}</div>
        <button class="btn btn-amber btn-sm" onclick="step6_aiSuggest()">${PT('btn_ai_wacc')}</button>
      </div>
      <div id="step6-ai-area"></div>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">${PT('s6_seq_label')}</label>
          <div class="input-group">
            <input type="number" step="1" min="0" max="100" id="s6-seq" class="form-control"
              value="${((s6.S_eq??0.6)*100).toFixed(0)}" onchange="step6_calc()">
            <span class="input-addon input-addon-right">%</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${PT('s6_req_label')}</label>
          <div class="input-group">
            <input type="number" step="0.1" id="s6-req" class="form-control"
              value="${((s6.r_eq??0.08)*100).toFixed(1)}" onchange="step6_calc()">
            <span class="input-addon input-addon-right">%/a</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${PT('s6_sdebt_label')}</label>
          <div class="input-group">
            <input type="number" step="1" min="0" max="100" id="s6-sdebt" class="form-control"
              value="${((s6.S_debt??0.4)*100).toFixed(0)}" onchange="step6_calc()">
            <span class="input-addon input-addon-right">%</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${PT('s6_rdebt_label')}</label>
          <div class="input-group">
            <input type="number" step="0.1" id="s6-rdebt" class="form-control"
              value="${((s6.r_debt??0.045)*100).toFixed(1)}" onchange="step6_calc()">
            <span class="input-addon input-addon-right">%/a</span>
          </div>
        </div>
      </div>
      <div class="formula-box">WACC = S_eq × r_eq + S_debt × r_debt</div>
      <div class="result-highlight positive mt-3">
        <div class="result-label">${PT('s6_result_label')}</div>
        <div class="result-value" id="wacc-result">${fmtPct(s6.WACC)}</div>
      </div>
      <button class="btn btn-secondary btn-sm mt-2" onclick="step6_calc()">${PT('btn_recalculate')}</button>
    </div>
    <div class="step-footer">
      <div class="step-footer-left"><button class="btn btn-secondary" onclick="navigate('step',5)">${PT('btn_back')}</button></div>
      <div class="step-footer-right"><button class="btn btn-primary" onclick="step6_save()">${PT('btn_next')}</button></div>
    </div>`;
}

function step6_calc() {
  const S_eq   = parseFloat(document.getElementById('s6-seq').value)/100||0;
  const r_eq   = parseFloat(document.getElementById('s6-req').value)/100||0;
  const S_debt = parseFloat(document.getElementById('s6-sdebt').value)/100||0;
  const r_debt = parseFloat(document.getElementById('s6-rdebt').value)/100||0;
  const wacc   = ValeriMath.calcWACC({S_eq,r_eq,S_debt,r_debt});
  const el = document.getElementById('wacc-result');
  if (el) el.textContent = fmtPct(wacc);
}

async function step6_aiSuggest() {
  const area = document.getElementById('step6-ai-area');
  try {
    await withAILoading(area, async () => {
      const result = await ValeriAI.suggestWACC(currentProject);
      document.getElementById('s6-seq').value   = (result.S_eq  *100).toFixed(0);
      document.getElementById('s6-req').value   = (result.r_eq  *100).toFixed(1);
      document.getElementById('s6-sdebt').value = (result.S_debt*100).toFixed(0);
      document.getElementById('s6-rdebt').value = (result.r_debt*100).toFixed(1);
      step6_calc();
      area.innerHTML = `<div class="ai-suggestion mb-3">
        <div class="ai-suggestion-header">${PT('ai_suggestion')}</div>
        <div class="ai-suggestion-content">${result.explanation||''}</div></div>`;
      toast(PT('s6_ai_msg'), 'success');
    });
  } catch(e) {}
}

function step6_save() {
  const S_eq   = parseFloat(document.getElementById('s6-seq').value)/100||0;
  const r_eq   = parseFloat(document.getElementById('s6-req').value)/100||0;
  const S_debt = parseFloat(document.getElementById('s6-sdebt').value)/100||0;
  const r_debt = parseFloat(document.getElementById('s6-rdebt').value)/100||0;
  const WACC   = ValeriMath.calcWACC({S_eq,r_eq,S_debt,r_debt});
  currentProject.phase_a.step6 = {completed:true, S_eq,r_eq,S_debt,r_debt,WACC};
  currentProject.meta.currentStep = Math.max(currentProject.meta.currentStep||1, 7);
  State.save(currentProject);
  toast(PT('s6_toast', fmtPct(WACC)), 'success');
  navigate('step', 7);
}

/* ────────────────────────────────────────────────────────────
   STEP 7: NPV Calculation
   ──────────────────────────────────────────────────────────── */

function renderStep7(main, proj) {
  const {table, NPV, T, WACC, f_risk} = ValeriMath.buildCashFlowTable(proj);
  proj.phase_b.step7.cashflow_table = table;
  proj.phase_b.step7.NPV = NPV;
  proj.phase_b.step7.completed = true;
  proj.meta.currentStep = Math.max(proj.meta.currentStep||1, 7);
  State.save(proj);
  const npvPos = NPV >= 0;

  main.innerHTML = stepHeader(7,'B',PT('phase_b_name'),PT('step7_title'),PT('step7_sub'), 'Der Kapitalwert (Net Present Value, NPV) berechnet sich nach DIN EN 17463 durch Summierung aller abgezinsten zukünftigen Cashflows.') + `
    <div class="kpi-grid">
      <div class="kpi-card ${npvPos?'blue':'red'}">
        <div class="kpi-label">${PT('s7_kpi_npv')}</div>
        <div class="kpi-value ${npvPos?'blue':'red'}">${fmtEUR(NPV)}</div>
        <div class="kpi-sub">${npvPos?PT('s7_npv_positive'):PT('s7_npv_negative')}</div>
      </div>
      <div class="kpi-card cyan">
        <div class="kpi-label">${PT('s7_kpi_horizon')}</div>
        <div class="kpi-value cyan">${T} ${PT('rpt_years')}</div>
        <div class="kpi-sub">${PT('s7_horizon_sub', T)}</div>
      </div>
      <div class="kpi-card amber">
        <div class="kpi-label">${PT('s7_kpi_wacc')}</div>
        <div class="kpi-value amber">${fmtPct(WACC)}</div>
        <div class="kpi-sub">${PT('s7_wacc_sub', fmtNum(1+WACC,4))}</div>
      </div>
      <div class="kpi-card ${f_risk>0?'red':'green'}">
        <div class="kpi-label">${PT('s7_kpi_risk')}</div>
        <div class="kpi-value ${f_risk>0?'red':'green'}">${fmtPct(f_risk)}</div>
        <div class="kpi-sub">${f_risk>0?PT('s7_risk_on'):PT('s7_risk_off')}</div>
      </div>
    </div>
    <div class="formula-box mb-4" style="font-size:0.9rem;">
      NPV = Σ(t=0 ${PT('rpt_ann1_t0').includes('to')?'to':'bis'} ${T}) [ P_t / (1 + ${(WACC*100).toFixed(2)}%)ᵗ ] = <strong>${fmtEUR(NPV)}</strong>
    </div>
    <div class="card">
      <div class="section-title mb-3">${PT('s7_table_title', T)}</div>
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>${PT('s7_col_period')}</th>
            <th class="text-right">${PT('s7_col_discount')}</th>
            <th class="text-right">${PT('s7_col_inflows')}</th>
            <th class="text-right">${PT('s7_col_outflows')}</th>
            <th class="text-right">${PT('s7_col_netcf')}</th>
            <th class="text-right">${PT('s7_col_pv')}</th>
          </tr></thead>
          <tbody>
            ${table.map(r => `<tr>
              <td><strong>t = ${r.t}</strong></td>
              <td class="num">${fmtNum(r.discountFactor,4)}</td>
              <td class="num positive">${r.inflows  ? fmtEUR(r.inflows)  : '—'}</td>
              <td class="num negative">${r.outflows ? fmtEUR(r.outflows) : '—'}</td>
              <td class="num ${r.netCashFlow>=0?'positive':'negative'}">${fmtEUR(r.netCashFlow)}</td>
              <td class="num ${r.presentValue>=0?'positive':'negative'}">${fmtEUR(r.presentValue)}</td>
            </tr>`).join('')}
            <tr class="total-row">
              <td colspan="5"><strong>${PT('s7_npv_row')}</strong></td>
              <td class="num ${npvPos?'positive':'negative'}"><strong>${fmtEUR(NPV)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="step-footer">
      <div class="step-footer-left"><button class="btn btn-secondary" onclick="navigate('step',6)">${PT('btn_back')}</button></div>
      <div class="step-footer-right"><button class="btn btn-primary" onclick="navigate('step',8)">${PT('s7_btn_next')}</button></div>
    </div>`;
}

/* ────────────────────────────────────────────────────────────
   STEP 8: Sensitivity Analysis
   ──────────────────────────────────────────────────────────── */

function renderStep8(main, proj) {
  const defRange   = proj.phase_b.step8?.range_pct||50;
  const sensParams = ValeriMath.getStandardSensParams(proj);
  const results    = ValeriMath.sensitivityAnalysis(proj, sensParams, defRange);
  proj.phase_b.step8 = {completed:true, parameters_varied:sensParams.map(x=>x.key), range_pct:defRange, results};
  State.save(proj);

  main.innerHTML = stepHeader(8,'B',PT('phase_b_name'),PT('step8_title'),PT('step8_sub'), 'Die Sensitivitätsanalyse nach DIN EN 17463 identifiziert die kritischsten Parameter, indem sie z.B. um ±50% variiert werden.') + `
    <div class="card">
      <div class="flex justify-between items-center mb-3">
        <div class="section-title">${PT('s8_chart_title')}</div>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <input type="number" id="s8-range" class="form-control" style="width:80px;" value="${defRange}" min="5" max="100">
          <span class="text-muted text-sm">${PT('s8_range_label')}</span>
          <button class="btn btn-secondary btn-sm" onclick="step8_recalc()">${PT('s8_recalc')}</button>
        </div>
      </div>
      <div class="chart-container">
        <div class="chart-canvas-wrap"><canvas id="chart-tornado"></canvas></div>
      </div>
      <div class="data-table-wrapper mt-3">
        <table class="data-table">
          <thead><tr>
            <th>${PT('s8_col_param')}</th>
            <th class="text-right">${PT('s8_col_base')}</th>
            <th class="text-right">${PT('s8_col_low', defRange)}</th>
            <th class="text-right">${PT('s8_col_base_npv')}</th>
            <th class="text-right">${PT('s8_col_high', defRange)}</th>
            <th class="text-right">${PT('s8_col_slope')}</th>
          </tr></thead>
          <tbody>
            ${results.map(r => `<tr>
              <td><strong>${r.label}</strong></td>
              <td class="num">${r.key.includes('T')||r.key.includes('lifetime') ? fmtNum(r.baseVal,0)+' '+PT('s8_unit_years') : r.key==='WACC'||r.key.includes('epr')||r.key.includes('pr') ? fmtPct(r.baseVal) : fmtNum(r.baseVal,2)}</td>
              <td class="num ${r.npvLow>=0?'positive':'negative'}">${fmtEUR(r.npvLow)}</td>
              <td class="num">${fmtEUR(r.baseNPV)}</td>
              <td class="num ${r.npvHigh>=0?'positive':'negative'}">${fmtEUR(r.npvHigh)}</td>
              <td class="num ${r.slope>=0?'positive':'negative'}">${fmtEUR(r.slope)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div id="sens-ai-interp" class="mt-3"></div>
      <button class="btn btn-amber btn-sm mt-2" onclick="step8_aiInterpret()">${PT('s8_ai_interp')}</button>
    </div>
    <div class="step-footer">
      <div class="step-footer-left"><button class="btn btn-secondary" onclick="navigate('step',7)">${PT('btn_back')}</button></div>
      <div class="step-footer-right"><button class="btn btn-primary" onclick="navigate('step',9)">${PT('s8_btn_next')}</button></div>
    </div>`;

  setTimeout(() => drawTornadoChart(results, proj.phase_b.step7.NPV), 50);
}

function step8_recalc() {
  const range = parseFloat(document.getElementById('s8-range').value)||50;
  currentProject.phase_b.step8.range_pct = range;
  State.save(currentProject);
  renderStep8(document.getElementById('main-content'), currentProject);
}

async function step8_aiInterpret() {
  const area = document.getElementById('sens-ai-interp');
  if (!area) return;
  try {
    await withAILoading(area, async () => {
      const text = await ValeriAI.interpretSensitivity(currentProject, currentProject.phase_b.step8.results);
      area.innerHTML = `<div class="ai-suggestion"><div class="ai-suggestion-header">${PT('s8_ai_interp')}</div>
        <div class="ai-suggestion-content">${text.replace(/\n/g,'<br>')}</div></div>`;
    });
  } catch(e) {}
}

function drawTornadoChart(results, baseNPV) {
  const canvas = document.getElementById('chart-tornado');
  if (!canvas || !window.Chart) return;
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: results.map(r => r.label),
      datasets: [
        { label: PT('s8_legend_low'),  data: results.map(r => r.npvLow-baseNPV),  backgroundColor:'rgba(239,68,68,0.6)',  borderColor:'#ef4444', borderWidth:1, barPercentage:0.6 },
        { label: PT('s8_legend_high'), data: results.map(r => r.npvHigh-baseNPV), backgroundColor:'rgba(16,185,129,0.6)', borderColor:'#10b981', borderWidth:1, barPercentage:0.6 }
      ]
    },
    options: {
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins: {
        legend: { labels:{ color:'#94a3b8', font:{size:11} } },
        tooltip: { callbacks:{ label: ctx => `${ctx.dataset.label}: ${ValeriMath.fmtEUR(ctx.raw)}` } }
      },
      scales: {
        x: { grid:{color:'rgba(255,255,255,0.06)'}, ticks:{color:'#94a3b8',font:{size:10},callback:v=>ValeriMath.fmtEUR(v)} },
        y: { grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#cbd5e1',font:{size:11}} }
      }
    }
  });
}

/* ────────────────────────────────────────────────────────────
   STEP 9: Scenario Analysis
   ──────────────────────────────────────────────────────────── */

function renderStep9(main, proj) {
  const s9      = proj.phase_b.step9;
  const baseNPV = proj.phase_b.step7.NPV||0;
  const defs    = buildDefaultScenarios(proj);
  const scenData= ValeriMath.scenarioAnalysis(proj, {
    worst:  s9.worst_case?.overrides  || defs.worst,
    likely: {},
    best:   s9.best_case?.overrides   || defs.best
  });
  const worstNPV = scenData.worst?.NPV??0;
  const bestNPV  = scenData.best?.NPV??0;
  proj.phase_b.step9 = {
    completed:true,
    worst_case:  {NPV:worstNPV, overrides:s9.worst_case?.overrides||defs.worst, label:PT('s9_worst')},
    most_likely: {NPV:baseNPV,  overrides:{},                                   label:PT('s9_likely')},
    best_case:   {NPV:bestNPV,  overrides:s9.best_case?.overrides||defs.best,   label:PT('s9_best')}
  };
  proj.meta.currentStep = Math.max(proj.meta.currentStep||1, 10);
  State.save(proj);

  const T    = proj.phase_a.step4.lifetime_T;
  const WACC = proj.phase_a.step6.WACC;
  const epr  = proj.phase_a.step3.global.epr;

  main.innerHTML = stepHeader(9,'B',PT('phase_b_name'),PT('step9_title'),PT('step9_sub'), 'Es sind realistische Best-Case- und Worst-Case-Szenarien zu bilden, um die Bandbreite des Kapitalwerts aufzuzeigen.') + `
    <div class="scenario-grid">
      <div class="scenario-card worst">
        <div class="scenario-label">${PT('s9_worst')}</div>
        <div class="scenario-npv" style="color:#b91c1c;">${fmtEUR(worstNPV)}</div>
        <div class="text-xs text-muted mt-2">${PT('s9_worst_sub')}</div>
      </div>
      <div class="scenario-card likely">
        <div class="scenario-label">${PT('s9_likely')}</div>
        <div class="scenario-npv" style="color:#1e40af;">${fmtEUR(baseNPV)}</div>
        <div class="text-xs text-muted mt-2">${PT('s9_likely_sub')}</div>
      </div>
      <div class="scenario-card best">
        <div class="scenario-label">${PT('s9_best')}</div>
        <div class="scenario-npv" style="color:#047857;">${fmtEUR(bestNPV)}</div>
        <div class="text-xs text-muted mt-2">${PT('s9_best_sub')}</div>
      </div>
    </div>
    <div class="chart-container">
      <div class="chart-title">${PT('s9_chart_title')}</div>
      <div class="chart-canvas-wrap"><canvas id="chart-scenario"></canvas></div>
    </div>
    <div class="card">
      <div class="section-title mb-3">${PT('s9_params_title')} <span class="info-tooltip" data-tooltip="Nach DIN EN 17463 müssen die Auswirkungen von Best-Case- und Worst-Case-Szenarien auf den Kapitalwert (NPV) quantifiziert werden.">?</span></div>
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>${PT('s9_col_param')}</th>
            <th class="text-right">${PT('s9_worst')}</th>
            <th class="text-right">${PT('s9_likely')}</th>
            <th class="text-right">${PT('s9_best')}</th>
          </tr></thead>
          <tbody>
            <tr>
              <td>${PT('s9_row_T')}</td>
              <td><div class="edit-group"><input type="number" class="cell-edit" id="sc-T-worst"    value="${proj.phase_b.step9.worst_case.overrides['phase_a.step4.lifetime_T']||Math.max(3,T-3)}"> <span class="unit">${PT('s9_years')}</span></div></td>
              <td class="num">${T} ${PT('rpt_years')}</td>
              <td><div class="edit-group"><input type="number" class="cell-edit" id="sc-T-best"     value="${proj.phase_b.step9.best_case.overrides['phase_a.step4.lifetime_T']||T+3}"> <span class="unit">${PT('s9_years')}</span></div></td>
            </tr>
            <tr>
              <td>${PT('s9_row_wacc')}</td>
              <td><div class="edit-group"><input type="number" step="0.1" class="cell-edit" id="sc-WACC-worst" value="${((proj.phase_b.step9.worst_case.overrides['phase_a.step6.WACC']||WACC+0.02)*100).toFixed(1)}"> <span class="unit">%</span></div></td>
              <td class="num">${fmtPct(WACC)}</td>
              <td><div class="edit-group"><input type="number" step="0.1" class="cell-edit" id="sc-WACC-best"  value="${((proj.phase_b.step9.best_case.overrides['phase_a.step6.WACC']||Math.max(0.01,WACC-0.015))*100).toFixed(1)}"> <span class="unit">%</span></div></td>
            </tr>
            <tr>
              <td>${PT('s9_row_epr')}</td>
              <td><div class="edit-group"><input type="number" step="0.1" class="cell-edit" id="sc-epr-worst"  value="${((proj.phase_b.step9.worst_case.overrides['phase_a.step3.global.epr']||Math.max(0,epr-0.02))*100).toFixed(1)}"> <span class="unit">%/a</span></div></td>
              <td class="num">${fmtPct(epr)}/a</td>
              <td><div class="edit-group"><input type="number" step="0.1" class="cell-edit" id="sc-epr-best"   value="${((proj.phase_b.step9.best_case.overrides['phase_a.step3.global.epr']||epr+0.02)*100).toFixed(1)}"> <span class="unit">%/a</span></div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="display:flex; gap:10px; margin-top:1rem;">
        <button class="btn btn-secondary btn-sm" onclick="step9_recalc()">${PT('s9_btn_recalc')}</button>
        <button class="btn btn-primary btn-sm" onclick="step9_aiPredict()" id="btn-s9-ai">🤖 KI-Vorhersagen generieren</button>
      </div>
    </div>
    <div class="step-footer">
      <div class="step-footer-left"><button class="btn btn-secondary" onclick="navigate('step',8)">${PT('btn_back')}</button></div>
      <div class="step-footer-right"><button class="btn btn-primary" onclick="navigate('step',10)">${PT('s9_btn_next')}</button></div>
    </div>`;

  setTimeout(() => drawScenarioChart(worstNPV, baseNPV, bestNPV), 50);
}

function step9_recalc() {
  const T    = currentProject.phase_a.step4.lifetime_T;
  const WACC = currentProject.phase_a.step6.WACC;
  const epr  = currentProject.phase_a.step3.global.epr;
  currentProject.phase_b.step9.worst_case.overrides = {
    'phase_a.step4.lifetime_T': parseInt(document.getElementById('sc-T-worst')?.value)||Math.max(3,T-3),
    'phase_a.step6.WACC':       parseFloat(document.getElementById('sc-WACC-worst')?.value)/100||WACC+0.02,
    'phase_a.step3.global.epr': parseFloat(document.getElementById('sc-epr-worst')?.value)/100||Math.max(0,epr-0.02)
  };
  currentProject.phase_b.step9.best_case.overrides = {
    'phase_a.step4.lifetime_T': parseInt(document.getElementById('sc-T-best')?.value)||T+3,
    'phase_a.step6.WACC':       parseFloat(document.getElementById('sc-WACC-best')?.value)/100||Math.max(0.01,WACC-0.015),
    'phase_a.step3.global.epr': parseFloat(document.getElementById('sc-epr-best')?.value)/100||epr+0.02
  };
  State.save(currentProject);
  renderStep9(document.getElementById('main-content'), currentProject);
  toast(PT('s9_toast'), 'success');
}

async function step9_aiPredict() {
  const btn = document.getElementById('btn-s9-ai');
  if (!btn) return;
  const oldText = btn.innerHTML;
  btn.innerHTML = '<div class="ai-loader" style="width:14px;height:14px;border-width:2px;"></div> Lädt...';
  btn.disabled = true;

  try {
    const res = await ValeriAI.generateScenarioPredictions(currentProject);
    document.getElementById('sc-T-worst').value = res.worst.T;
    document.getElementById('sc-WACC-worst').value = (res.worst.WACC * 100).toFixed(1);
    document.getElementById('sc-epr-worst').value = (res.worst.epr * 100).toFixed(1);

    document.getElementById('sc-T-best').value = res.best.T;
    document.getElementById('sc-WACC-best').value = (res.best.WACC * 100).toFixed(1);
    document.getElementById('sc-epr-best').value = (res.best.epr * 100).toFixed(1);

    step9_recalc();
    toast('KI-Szenarien erfolgreich geladen', 'success');
  } catch (err) {
    console.error(err);
    toast('Fehler bei der KI-Vorhersage', 'error');
  } finally {
    btn.innerHTML = oldText;
    btn.disabled = false;
  }
}

function drawScenarioChart(worst, base, best) {
  const canvas = document.getElementById('chart-scenario');
  if (!canvas || !window.Chart) return;
  new Chart(canvas, {
    type:'bar',
    data: {
      labels: [PT('s9_worst'), PT('s9_likely'), PT('s9_best')],
      datasets: [{ label:'NPV', data:[worst,base,best],
        backgroundColor:['rgba(239,68,68,0.7)','rgba(59,130,246,0.7)','rgba(16,185,129,0.7)'],
        borderColor:['#ef4444','#3b82f6','#10b981'], borderWidth:2, borderRadius:6, barPercentage:0.5
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{display:false}, tooltip:{callbacks:{label:ctx=>'NPV: '+ValeriMath.fmtEUR(ctx.raw)}} },
      scales: {
        x:{ grid:{display:false}, ticks:{color:'#cbd5e1',font:{size:12,weight:'600'}} },
        y:{ grid:{color:'rgba(255,255,255,0.06)'}, ticks:{color:'#94a3b8',callback:v=>ValeriMath.fmtEUR(v)} }
      }
    }
  });
}

/* ────────────────────────────────────────────────────────────
   STEP 10: Evaluation (AI)
   ──────────────────────────────────────────────────────────── */

function renderStep10(main, proj) {
  const s10         = proj.phase_c.step10;
  const qualImpacts = proj.phase_a.step1.impacts.filter(i => !i.monetizable);
  const npv         = proj.phase_b.step7.NPV;

  main.innerHTML = stepHeader(10,'C',PT('phase_c_name'),PT('step10_title'),PT('step10_sub'), 'Qualitative Effekte müssen berücksichtigt werden, um die quantitativen Ergebnisse richtig zu interpretieren.') + `
    <div class="kpi-grid">
      <div class="kpi-card ${npv>=0?'blue':'red'}">
        <div class="kpi-label">${PT('s10_kpi_base')}</div>
        <div class="kpi-value ${npv>=0?'blue':'red'}">${fmtEUR(npv)}</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-label">${PT('s10_kpi_worst')}</div>
        <div class="kpi-value red">${fmtEUR(proj.phase_b.step9?.worst_case?.NPV)}</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">${PT('s10_kpi_best')}</div>
        <div class="kpi-value green">${fmtEUR(proj.phase_b.step9?.best_case?.NPV)}</div>
      </div>
    </div>
    <div class="card">
      <div class="flex justify-between items-center mb-3">
        <div class="section-title">${PT('s10_eval_title')}</div>
        <button class="btn btn-amber" onclick="step10_aiEval()">${PT('btn_ai_eval')}</button>
      </div>
      <div id="step10-eval-area">
        ${s10.ai_evaluation
          ? `<div style="white-space:pre-line;font-size:0.875rem;line-height:1.7;color:var(--text-secondary);">${s10.ai_evaluation}</div>`
          : `<p class="text-muted text-sm">${PT('s10_eval_ph')}</p>`}
      </div>
    </div>
    <div class="card">
      <div class="flex justify-between items-center mb-3">
        <div class="section-title">${PT('s10_qual_title')}</div>
        ${qualImpacts.length > 0 ? `<button class="btn btn-amber btn-sm" onclick="step10_aiQual()" id="btn-s10-qual">🤖 KI-Antworten generieren</button>` : ''}
      </div>
      ${qualImpacts.length > 0 ? qualImpacts.map(imp => `
        <div style="display:flex;gap:0.75rem;padding:0.75rem 0;border-bottom:1px solid var(--border-subtle);align-items:flex-start;">
          <span class="badge badge-purple mt-1">${PT('badge_qualitative')}</span>
          <div style="flex:1;">
            <div style="font-size:0.875rem;font-weight:500;margin-bottom:0.25rem;">${imp.description}</div>
            <textarea id="qual-note-${imp.id}" class="form-control" style="min-height:56px;"
              placeholder="${PT('s10_qual_ph')}">${s10[`qual_${imp.id}`]||''}</textarea>
          </div>
        </div>`).join('') : `<p class="text-muted text-sm">${PT('s10_qual_none')}</p>`}
    </div>
    <div class="step-footer">
      <div class="step-footer-left"><button class="btn btn-secondary" onclick="navigate('step',9)">${PT('btn_back')}</button></div>
      <div class="step-footer-right"><button class="btn btn-primary" onclick="step10_save()">${PT('s10_btn_next')}</button></div>
    </div>`;
}

async function step10_aiEval() {
  const area = document.getElementById('step10-eval-area');
  try {
    await withAILoading(area, async () => {
      const text = await ValeriAI.generateEvaluation(currentProject);
      currentProject.phase_c.step10.ai_evaluation = text;
      State.save(currentProject);
      area.innerHTML = `<div style="white-space:pre-line;font-size:0.875rem;line-height:1.7;color:var(--text-secondary);">${text}</div>`;
      toast(PT('s10_ai_toast'), 'success');
    });
  } catch(e) {}
}

async function step10_aiQual() {
  const btn = document.getElementById('btn-s10-qual');
  if (!btn) return;
  const qualImpacts = currentProject.phase_a.step1.impacts.filter(i => !i.monetizable);
  if (!qualImpacts.length) return;

  const oldText = btn.innerHTML;
  btn.innerHTML = '<div class="ai-loader" style="width:14px;height:14px;border-width:2px;"></div> Lädt...';
  btn.disabled = true;

  try {
    const answers = await ValeriAI.generateQualitativeAnswers(currentProject, qualImpacts);
    for (const id in answers) {
      const el = document.getElementById(`qual-note-${id}`);
      if (el) el.value = answers[id];
    }
    step10_save(); // Auto-save after generating
    toast('Qualitative Antworten erfolgreich generiert', 'success');
  } catch (err) {
    console.error(err);
    toast('Fehler bei der KI-Generierung', 'error');
  } finally {
    btn.innerHTML = oldText;
    btn.disabled = false;
  }
}

function step10_save() {
  const qualImpacts = currentProject.phase_a.step1.impacts.filter(i => !i.monetizable);
  qualImpacts.forEach(imp => {
    const el = document.getElementById(`qual-note-${imp.id}`);
    if (el) currentProject.phase_c.step10[`qual_${imp.id}`] = el.value;
  });
  currentProject.phase_c.step10.completed = true;
  currentProject.meta.currentStep = Math.max(currentProject.meta.currentStep||1, 11);
  State.save(currentProject);
  toast(PT('s10_toast'), 'success');
  navigate('step', 11);
}

/* ────────────────────────────────────────────────────────────
   STEP 11: Final Report
   ──────────────────────────────────────────────────────────── */

function renderStep11(main, proj) {
  main.innerHTML = stepHeader(11,'D',PT('phase_d_name'),PT('step11_title'),PT('step11_sub'), 'Der finale Report fasst die Analyse nach DIN EN 17463 zusammen und liefert eine begründete Handlungsempfehlung.') + `
    <div class="card">
      <div class="section-title mb-3">${PT('s11_gen_title')}</div>
      <p class="text-sm text-secondary mb-3">${PT('s11_gen_body')}</p>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
        <button class="btn btn-amber" id="gen-ai-btn" onclick="step11_generateWithAI()">${PT('btn_ai_report')}</button>
        <button class="btn btn-primary" onclick="step11_generateBasic()">${PT('btn_basic_report')}</button>
      </div>
      <div id="step11-status" class="mt-3"></div>
    </div>
    <div id="report-preview-area"></div>
    <div class="step-footer">
      <div class="step-footer-left"><button class="btn btn-secondary" onclick="navigate('step',10)">${PT('btn_back')}</button></div>
    </div>`;
}

async function step11_generateWithAI() {
  const statusEl  = document.getElementById('step11-status');
  const previewEl = document.getElementById('report-preview-area');
  statusEl.innerHTML = `<div class="ai-loading"><div class="ai-dots"><span></span><span></span><span></span></div> ${PT('ai_creating')}</div>`;
  try {
    const aiSections = await ValeriAI.generateReportSections(currentProject);
    const html = ValeriReport.buildReport(currentProject, aiSections);
    currentProject.phase_d.step11.report_html = html;
    currentProject.phase_d.step11.completed = true;
    State.save(currentProject);
    statusEl.innerHTML = `<span class="badge badge-green">${PT('s11_generated')}</span>`;
    showReportPreview(html, previewEl);
    toast(PT('s11_toast'), 'success');
  } catch(e) {
    statusEl.innerHTML = `<span class="badge badge-red">${PT('ai_err', e.message)}</span>`;
  }
}

function step11_generateBasic() {
  const html = ValeriReport.buildReport(currentProject, {});
  currentProject.phase_d.step11.report_html = html;
  currentProject.phase_d.step11.completed = true;
  State.save(currentProject);
  showReportPreview(html, document.getElementById('report-preview-area'));
  toast(PT('s11_toast_basic'), 'success');
}

function showReportPreview(html, container) {
  container.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden;">
      <div style="background:var(--bg-card);padding:0.875rem 1.25rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-subtle);">
        <span class="section-title">${PT('s11_preview_title')}</span>
        <div style="display:flex;gap:0.5rem;">
          <button class="btn btn-secondary btn-sm" onclick="openReportFullscreen()">${PT('btn_fullscreen')}</button>
          <button class="btn btn-primary btn-sm" onclick="printReport()">${PT('btn_print')}</button>
        </div>
      </div>
      <iframe id="report-iframe" srcdoc="${html.replace(/"/g,'&quot;')}" style="width:100%;height:700px;border:none;"></iframe>
    </div>`;
}

function printReport() {
  const html = currentProject?.phase_d?.step11?.report_html;
  if (!html) { toast(PT('s11_err_nohtml'), 'warning'); return; }
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 800);
}

function openReportFullscreen() {
  const html = currentProject?.phase_d?.step11?.report_html;
  if (!html) { toast(PT('s11_err_nohtml'), 'warning'); return; }
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

/* ────────────────────────────────────────────────────────────
   STEP HEADER HELPER
   ──────────────────────────────────────────────────────────── */

function stepHeader(num, phase, phaseName, title, subtitle, tooltipText = '') {
  const badgeCls = `phase-${phase.toLowerCase()}-badge`;
  const tooltipHtml = tooltipText ? `<span class="info-tooltip" data-tooltip="${tooltipText}">?</span>` : '';
  return `<div class="card">
    <div class="card-header">
      <div class="card-step-badge ${badgeCls}">${num}</div>
      <div class="card-title-group">
        <div class="card-phase-tag">${phaseName}</div>
        <div class="card-title">${title} ${tooltipHtml}</div>
        ${subtitle ? `<div class="card-subtitle">${subtitle}</div>` : ''}
      </div>
    </div>
  </div>`;
}

function markOverride(inputId) {
  const el = document.getElementById(inputId);
  if (el) el.classList.add('ai-filled');
}

/* ────────────────────────────────────────────────────────────
   BOOT
   ──────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await State.init();
  } catch (e) {
    window.location.href = '../login.htm';
    return;
  }
  document.documentElement.lang = Lang.get();
  currentProject = State.getActive();
  if (currentProject) {
    navigate('step', currentProject.meta.currentStep || 1);
  } else {
    navigate('home');
  }
});
