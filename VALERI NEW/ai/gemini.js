/* ============================================================
   VALERI — Azure OpenAI AI Client
   All AI prompts for suggestions, evaluation, and report drafting
   ============================================================ */

const ValeriAI = (() => {

  const CONFIG = {
    endpoint:   'https://enefit-llm.openai.azure.com',
    deployment: 'gpt-4.1',
    apiVersion: '2024-12-01-preview',
    maxTokens:  2048,
    temperature: 0.4
  };

  // API key logic removed; now securely proxied via backend

  async function callAzureOpenAI(systemPrompt, userPrompt, maxTokens = CONFIG.maxTokens) {
    const url = '/api/valerinew/azure-openai';

    const body = {
      model: CONFIG.deployment,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ],
      max_tokens:  maxTokens,
      temperature: CONFIG.temperature
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Azure OpenAI Fehler (${resp.status}): ${err}`);
    }

    const data = await resp.json();
    return data.choices[0].message.content.trim();
  }

  // Helper: Adds zero-width watermark to text
  function applyWatermark(text) {
    if (typeof text !== 'string' || !text.trim()) return text;
    // Watermark: "Created by AI" encoded in zero-width chars (U+200B for 0, U+200C for 1)
    const wm = "Created by AI";
    const invisible = wm.split('').map(c => 
      c.charCodeAt(0).toString(2).padStart(8, '0').split('').map(b => b === '1' ? '\u200C' : '\u200B').join('')
    ).join('\u200D'); // U+200D as char separator
    
    // Insert randomly into the text
    const words = text.split(' ');
    if (words.length > 2) {
      const pos = Math.floor(Math.random() * (words.length - 1)) + 1;
      words[pos] = invisible + words[pos];
      return words.join(' ');
    }
    return text + invisible;
  }

  function applyWatermarkDeep(obj) {
    if (typeof obj === 'string') return applyWatermark(obj);
    if (Array.isArray(obj)) return obj.map(applyWatermarkDeep);
    if (obj !== null && typeof obj === 'object') {
      const res = {};
      for (const key in obj) {
        res[key] = applyWatermarkDeep(obj[key]);
      }
      return res;
    }
    return obj;
  }

  /* ── SYSTEM PROMPT (shared context) ── */
  const SYSTEM_BASE = `Du bist VALERI, ein KI-Assistent für die Bewertung energiebezogener Investitionen nach DIN EN 17463:2021 und der Erweiterung A1:2024 für deutsche KMU.
Du antwortest stets auf Deutsch, präzise, fachlich korrekt und praxisorientiert.
Deine Ausgaben sind direkte, strukturierte Empfehlungen — keine langen Einleitungen, kein Fachjargon ohne Erklärung.
Alle Geldbeträge in Euro (€), alle Prozentsätze im deutschen Format (z.B. 3,0 %/a).
Du weißt: NPV > 0 bedeutet, die Investition schafft Mehrwert über die Diskontierungsalternative hinaus.`;

  /* ── Step 1: Suggest impacts from description ── */
  async function suggestImpacts(eriDescription) {
    const user = `
Eine energiebezogene Investition (ERI) wurde wie folgt beschrieben:
"${eriDescription}"

Erstelle eine strukturierte Liste der wahrscheinlichen Auswirkungen dieser Investition gemäß DIN EN 17463:2021.
Teile sie in drei Kategorien ein:
1. Energieflusseffekte (z.B. Stromeinsparungen, Wärmeeinsparungen)
2. Weitere finanzielle Effekte (z.B. CAPEX, OPEX-Änderungen, Restwert)
3. Sonstige Effekte (z.B. Lärmreduzierung, Platzbedarf, CO2-Reduktion, Zuverlässigkeit)

Antworte **ausschließlich** in diesem JSON-Format (kein Markdown drumherum):
{
  "impacts": [
    {
      "category": "energy_flow" | "additional_financial" | "other",
      "type": "benefit" | "burden",
      "description": "kurze deutsche Beschreibung",
      "monetizable": true | false,
      "unit": "typische Einheit (z.B. kWh/a, €, dB, t CO2/a)",
      "timing": "t0" | "annual" | "tT",
      "price_variation_type": "epr" | "pr" | "none"
    }
  ]
}
Maximal 12 Einträge. Realistisch und spezifisch für die beschriebene Investition.`;

    const raw = await callAzureOpenAI(SYSTEM_BASE, user, 1200);
    // Extract JSON even if model adds extra text
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Ungültige KI-Antwort: kein JSON gefunden');
    return applyWatermarkDeep(JSON.parse(match[0]));
  }

  /* ── Step 3: Suggest unit prices and rates ── */
  async function suggestMonetization(project) {
    const impacts = project.phase_a.step1.impacts;
    const quantities = project.phase_a.step2.quantities;
    const eriDesc = project.phase_a.step1.eri_description;

    const itemsText = impacts.map(imp => {
      const qty = quantities[imp.id];
      return `- ID: ${imp.id}, Beschreibung: "${imp.description}", Menge: ${qty?.quantity ?? '?'} ${qty?.unit ?? imp.unit}, Kategorie: ${imp.category}`;
    }).join('\n');

    const user = `
ERI: "${eriDesc}"

Folgende Auswirkungen wurden quantifiziert:
${itemsText}

Schlage für jede Auswirkung plausible Einzelpreise/Kostensätze vor (Stand Deutschland ${new Date().getFullYear()}).
Schlage außerdem globale Szenario-Parameter vor:
- epr: jährliche Energiepreissteigerung (%)
- pr: allgemeine Preissteigerung (%)
- degradation: jährliche Leistungsminderung (%)

Antworte **ausschließlich** in JSON (kein Markdown drumherum):
{
  "cashflows": {
    "[id]": {
      "unit_price": number,
      "unit_price_explanation": "kurze Begründung",
      "annual_amount": number,
      "timing": "t0"|"annual"|"tT"
    }
  },
  "global": {
    "epr": number,
    "pr": number,
    "degradation": number,
    "epr_explanation": "Begründung",
    "pr_explanation": "Begründung"
  }
}
annual_amount = positiv für Nutzen (Einsparungen), negativ für Lasten (Kosten).`;

    const raw = await callAzureOpenAI(SYSTEM_BASE, user, 1400);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Ungültige KI-Antwort: kein JSON gefunden');
    return applyWatermarkDeep(JSON.parse(match[0]));
  }

  /* ── Step 6: Suggest WACC ── */
  async function suggestWACC(project) {
    const eriDesc = project.phase_a.step1.eri_description;
    const company = project.meta.company;
    const user = `
Unternehmen: "${company || 'Deutsches KMU'}"
Investition: "${eriDesc}"

Schlage einen realistischen WACC für diese Investitionsbewertung vor.
Berücksichtige: Eigenkapitalrendite typischer KMU, aktuelle Fremdkapitalzinsen (Stand ${new Date().getFullYear()}, Deutschland), typische Kapitalstruktur.

Antworte **ausschließlich** in JSON:
{
  "S_eq": 0.6,
  "r_eq": 0.08,
  "S_debt": 0.4,
  "r_debt": 0.045,
  "WACC": 0.066,
  "explanation": "kurze Begründung (2-3 Sätze)"
}`;

    const raw = await callAzureOpenAI(SYSTEM_BASE, user, 600);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Ungültige KI-Antwort');
    return applyWatermarkDeep(JSON.parse(match[0]));
  }

  /* ── Step 8: Sensitivity interpretation ── */
  async function interpretSensitivity(project, sensitivityResults) {
    const npv = project.phase_b.step7.NPV;
    const topParams = sensitivityResults.slice(0, 5).map(r => {
      const valFmt = (r.key === 'WACC' || r.key === 'epr' || r.key === 'pr') ? ValeriMath.fmtPct(r.baseVal) : ValeriMath.fmtNum(r.baseVal);
      return `- ${r.label} (Aktueller Wert im Projekt: ${valFmt}): NPV-Spanne ${ValeriMath.fmtEUR(r.npvLow)} bis ${ValeriMath.fmtEUR(r.npvHigh)}, Steigung ${ValeriMath.fmtEUR(r.slope)}/Δ%`;
    }).join('\n');

    const user = `
Investitionsprojekt: "${project.phase_a.step1.eri_description}"
Basisfall-NPV: ${ValeriMath.fmtEUR(npv)}

Top-5 Sensitivitätsparameter (nach Einfluss sortiert), wie in der Tabelle oben dargestellt:
${topParams}

Erstelle eine prägnante, praxisorientierte Sensitivitätsanalyse-Interpretation (max. 200 Wörter). 
WICHTIG: Du MUSST die konkreten Zahlenwerte aus der obigen Tabelle in deinen Text einbauen (die aktuellen Werte, die NPV-Spannen und/oder die Steigung), um deine Argumentation mathematisch zu stützen! Beantworte dabei:
1. Welcher Parameter aus der Tabelle hat den größten Einfluss auf den NPV und warum?
2. Was bedeutet die NPV-Spanne dieses Parameters für das Investitionsrisiko (Worst-Case vs Best-Case)?
3. Welche Parameter-Werte sollten in der Praxis am genauesten überwacht werden?

Antworte in fließendem Deutsch, professionell, 2-3 Absätze. Keine Aufzählungslisten.`;

    return applyWatermark(await callAzureOpenAI(SYSTEM_BASE, user, 400));
  }

  /* ── Step 10: Full AI Evaluation ── */
  async function generateEvaluation(project) {
    const npv      = project.phase_b.step7.NPV;
    const worst    = project.phase_b.step9.worst_case?.NPV;
    const best     = project.phase_b.step9.best_case?.NPV;
    const WACC     = project.phase_a.step6.WACC;
    const T        = project.phase_a.step4.lifetime_T;
    const eriDesc  = project.phase_a.step1.eri_description;
    
    // Calculate intermediate info for deeper insights
    const { table } = ValeriMath.buildCashFlowTable(project);
    const capex = Math.abs(table[0]?.outflows || 0);
    const avgInflows = (table.slice(1).reduce((sum, r) => sum + r.inflows, 0) / T) || 0;
    const avgOutflows = (table.slice(1).reduce((sum, r) => sum + Math.abs(r.outflows), 0) / T) || 0;
    
    const sensResults = ValeriMath.sensitivityAnalysis(project, ValeriMath.getStandardSensParams(project));
    const mostSensitive = sensResults[0]?.label || 'Keine signifikante Sensitivität';

    const qualEffects = (project.phase_a.step1.impacts || [])
      .filter(i => !i.monetizable)
      .map(i => i.description).join(', ');

    const user = `
Investitionsprojekt: "${eriDesc}"
Planungshorizont: ${T} Jahre
WACC: ${ValeriMath.fmtPct(WACC)}
CAPEX (Anfangsinvestition): ${ValeriMath.fmtEUR(capex)}
Durchschnittliche jährliche Einsparungen/Nutzen: ${ValeriMath.fmtEUR(avgInflows)}
Durchschnittliche jährliche Kosten/Lasten: ${ValeriMath.fmtEUR(avgOutflows)}
Am stärksten beeinflussender Parameter (Sensitivität): ${mostSensitive}

NPV Basisfall: ${ValeriMath.fmtEUR(npv)}
NPV Worst-Case: ${ValeriMath.fmtEUR(worst)}
NPV Best-Case: ${ValeriMath.fmtEUR(best)}
Nicht-monetarisierbare Effekte: ${qualEffects || 'keine angegeben'}

Erstelle eine vollständige VALERI-Bewertung (gemäß DIN EN 17463) mit folgenden Abschnitten:

**1. Gesamtbewertung NPV & Cashflows**
Interpretiere den NPV im Verhältnis zum CAPEX und den laufenden Cashflows. Erkläre detailliert, warum die Investition finanziell sinnvoll ist oder nicht.

**2. Risikobewertung & Sensitivität**
Bewerte die Bandbreite zwischen Worst-Case und Best-Case. Gehe speziell darauf ein, welcher Parameter (z.B. ${mostSensitive}) das größte Risiko darstellt.

**3. Qualitative Effekte**
Wie beeinflussen die nicht-monetarisierbaren Effekte die Gesamtentscheidung? Können sie ein finanzielles Risiko abmildern oder einen negativen NPV rechtfertigen?

**4. Empfehlung**
Klare, tiefgehend begründete Investitionsempfehlung (max. 2 Sätze).

Antworte auf Deutsch, professionell, ohne Markdown-Überschriften (verwende **Fettschrift** für Abschnittstitel). Max. 350 Wörter.`;

    return applyWatermark(await callAzureOpenAI(SYSTEM_BASE, user, 700));
  }

  /* ── Step 11: Executive Summary & Decision Proposal ── */
  async function generateReportSections(project) {
    const npv     = project.phase_b.step7.NPV;
    const eriDesc = project.phase_a.step1.eri_description;
    const T       = project.phase_a.step4.lifetime_T;
    const WACC    = project.phase_a.step6.WACC;
    const worst   = project.phase_b.step9?.worst_case?.NPV;
    const best    = project.phase_b.step9?.best_case?.NPV;

    const user = `
Du erstellst einen offiziellen VALERI-Bewertungsbericht nach DIN EN 17463:2021.

Projektdaten:
- Beschreibung: "${eriDesc}"
- Planungshorizont: ${T} Jahre
- WACC: ${ValeriMath.fmtPct(WACC)}
- NPV (Basisfall): ${ValeriMath.fmtEUR(npv)}
- NPV Worst-Case: ${ValeriMath.fmtEUR(worst)}
- NPV Best-Case: ${ValeriMath.fmtEUR(best)}

Erstelle folgende Report-Textbausteine in JSON:
{
  "brief_description": "2-3 Sätze technische Beschreibung der Investition",
  "decision_proposal": "1-2 Sätze klare Investitionsempfehlung mit NPV-Begründung",
  "final_evaluation": "2-3 Sätze Gesamtbewertung inkl. qualitativer Aspekte",
  "sensitivity_summary": "1-2 Sätze zu den kritischsten Sensitivitätsparametern"
}

Antworte **ausschließlich** in JSON, kein Markdown.`;

    const raw = await callAzureOpenAI(SYSTEM_BASE, user, 800);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Ungültige KI-Antwort');
    return applyWatermarkDeep(JSON.parse(match[0]));
  }

  async function generateScenarioPredictions(project) {
    const T       = project.phase_a.step4.lifetime_T;
    const WACC    = project.phase_a.step6.WACC;
    const epr     = project.phase_a.step3.global.epr;
    const eriDesc = project.phase_a.step1.eri_description;

    const user = `
Projekt: "${eriDesc}"
Basisfall:
- Lebensdauer (T): ${T} Jahre
- WACC: ${ValeriMath.fmtPct(WACC)}
- Energiepreissteigerung (epr): ${ValeriMath.fmtPct(epr)}

Generiere realistische Vorhersagen für den Worst-Case und Best-Case für diese 3 Parameter basierend auf typischen Risiken dieses Projekts.
Regeln:
- T (Lebensdauer): Worst-Case sollte kürzer sein, Best-Case länger. (Ganze Zahlen)
- WACC (Diskontsatz): Worst-Case sollte höher sein, Best-Case niedriger. (Dezimalwert, z.B. 0.10 für 10%)
- epr (Energiepreissteigerung): Hängt vom Projekt ab. Wenn das Projekt Energie einspart, ist ein niedrigerer epr ein Worst-Case (weniger Einsparungen wert). Gib den Wert als Dezimalwert (z.B. 0.03 für 3%).

Antworte **ausschließlich** in folgendem JSON Format, kein Markdown:
{
  "worst": { "T": 8, "WACC": 0.10, "epr": 0.02 },
  "best": { "T": 15, "WACC": 0.05, "epr": 0.08 }
}`;

    const raw = await callAzureOpenAI(SYSTEM_BASE, user, 800);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Ungültige KI-Antwort');
    return applyWatermarkDeep(JSON.parse(match[0]));
  }

  async function generateQualitativeAnswers(project, qualImpacts) {
    const eriDesc = project.phase_a.step1.eri_description;
    
    const impactsList = qualImpacts.map(i => `- ID ${i.id}: ${i.description}`).join('\n');

    const user = `
Projekt: "${eriDesc}"

Folgende qualitative (nicht-monetarisierbare) Aspekte wurden identifiziert:
${impactsList}

Generiere für jeden Aspekt eine kurze, professionelle Bewertung (1-2 Sätze), wie sich dieses Projekt positiv oder negativ darauf auswirken wird.

Antworte **ausschließlich** in folgendem JSON Format, kein Markdown:
{
  "answers": {
    "impact_id_1": "Bewertungstext...",
    "impact_id_2": "Bewertungstext..."
  }
}`;

    const raw = await callAzureOpenAI(SYSTEM_BASE, user, 800);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Ungültige KI-Antwort');
    return applyWatermarkDeep(JSON.parse(match[0]).answers);
  }

  return {
    suggestImpacts,
    suggestMonetization,
    suggestWACC,
    interpretSensitivity,
    generateEvaluation,
    generateReportSections,
    generateScenarioPredictions,
    generateQualitativeAnswers
  };
})();

window.ValeriAI = ValeriAI;
