require('dotenv').config();
const express = require('express');

// Remove fallback API key logic and rely solely on env variable
// Previous code set a hardcoded fallback API key when missing
// Now we only read from process.env and log status without exposing the key
if (process.env.ENEFIT_API_KEY) {
    console.log('API key loaded from environment');
} else {
    console.warn('Warning: ENEFIT_API_KEY is not set');
}
console.log('Initial API key set:', !!process.env.ENEFIT_API_KEY);
const cors = require('cors');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const session = require('express-session');
const app = express();

// Email configuration
// Force IONOS SMTP configuration - remove service fallback
console.log('SMTP Configuration Debug:');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_PORT:', process.env.SMTP_PORT);
console.log('SMTP_SECURE:', process.env.SMTP_SECURE);
console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('SMTP_PASS:', process.env.SMTP_PASS ? '***SET***' : 'NOT SET');
console.log('EMAIL_FROM:', process.env.EMAIL_FROM);
console.log('EMAIL_FROM_NAME:', process.env.EMAIL_FROM_NAME);

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ionos.de',
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    // IONOS specific settings
    tls: {
        rejectUnauthorized: false
    }
});

// Compute from/reply-to once from environment
const EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_NAME
    ? `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`
    : (process.env.EMAIL_FROM || process.env.SMTP_USER);
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO;

// Verify SMTP connection at startup (logs only)
console.log('Attempting SMTP verification with config:', {
    host: process.env.SMTP_HOST || 'smtp.ionos.de',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    tls: { rejectUnauthorized: false }
});

transporter.verify()
    .then(() => console.log('SMTP server is ready to take our messages'))
    .catch(err => console.error('SMTP verification failed:', err));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'enefit-dev-session-secret-fallback-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('.'));

// Mount Legal Radar
try {
    const legalRadarRouter = require('./legal_radar/server.js');
    // Mount the API routes at the root, so /api/subscribe works natively
    app.use('/', legalRadarRouter);
    console.log('Legal Radar module loaded successfully.');
} catch (e) {
    console.error('Failed to load Legal Radar module:', e);
}

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.MONGODB_URI;

let mongoClient = null;
let db = null;

if (uri) {
  try {
    mongoClient = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });
  } catch (err) {
    console.warn('Warning: Invalid MONGODB_URI configuration:', err.message);
  }
} else {
  console.warn('Notice: MONGODB_URI is not set. Operating in local JSON fallback storage mode.');
}

// Data storage files
const APPLICATIONS_FILE = 'data/applications.json';
const COMPANIES_FILE = 'data/companies.json';
const USERS_FILE = 'data/users.json';
const EVENTS_FILE = 'data/events.json';
const CHATS_FILE = 'data/chats.json';
const PHASE7_RESULTS_FILE = 'data/phase7_results.json';
const VALERI_PROJECTS_FILE = 'data/valeri_projects.json';
const PHASE1_SESSIONS = new Map();

function getCollectionName(filename) {
    if (filename === APPLICATIONS_FILE) return 'applications';
    if (filename === COMPANIES_FILE) return 'companies';
    if (filename === USERS_FILE) return 'users';
    if (filename === EVENTS_FILE) return 'events';
    if (filename === CHATS_FILE) return 'chats';
    if (filename === PHASE7_RESULTS_FILE) return 'phase7_results';
    if (filename === VALERI_PROJECTS_FILE) return 'valeri_projects';
    if (filename.includes('valeri_projects') && filename.endsWith('.json')) return 'valeri_projects_detailed';
    if (filename.includes('valerinew_projects') && filename.endsWith('.json')) return 'valerinew_projects_detailed';
    return null;
}

// Ensure data directory exists
async function ensureDataDirectory() {
    try {
        if (!db && mongoClient) {
            await mongoClient.connect();
            db = mongoClient.db("valeri_db");
            console.log('Successfully connected to MongoDB!');
        }
    } catch (error) {
        console.warn('Notice: MongoDB connection not active, using local file persistence:', error.message);
    }
}

// Load data from MongoDB with local JSON fallback
async function loadData(filename, defaultData = []) {
    try {
        if (!db) await ensureDataDirectory();
        const collName = getCollectionName(filename);
        if (db && collName) {
            if (collName === 'valeri_projects_detailed' || collName === 'valerinew_projects_detailed') {
                const projectId = filename.split('/').pop().replace('.json', '');
                const doc = await db.collection(collName).findOne({ projectId });
                if (doc) {
                    delete doc._id;
                    return doc;
                }
                return defaultData;
            }

            const data = await db.collection(collName).find().toArray();
            if (data.length > 0) {
                data.forEach(d => delete d._id);
                if (collName === 'chats') {
                    const chatsObj = {};
                    data.forEach(c => {
                        const cid = c.companyId;
                        delete c.companyId;
                        if (!chatsObj[cid]) chatsObj[cid] = [];
                        chatsObj[cid].push(c);
                    });
                    return chatsObj;
                }
                return data;
            }
        }
    } catch (error) {
        // Fall back to local file
    }

    try {
        const filePath = path.join(__dirname, filename);
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return defaultData;
    }
}

// Save data to MongoDB and local JSON fallback
async function saveData(filename, data) {
    try {
        const filePath = path.join(__dirname, filename);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (fsErr) {
        console.warn(`Local file save notice (${filename}):`, fsErr.message);
    }

    try {
        if (!db) await ensureDataDirectory();
        if (!db) return;
        const collName = getCollectionName(filename);
        if (!collName) return;

        if (collName === 'valeri_projects_detailed' || collName === 'valerinew_projects_detailed') {
            const projectId = filename.split('/').pop().replace('.json', '');
            const companyId = filename.split('/')[filename.split('/').length - 2];
            await db.collection(collName).updateOne(
                { projectId }, 
                { $set: { ...data, companyId } }, 
                { upsert: true }
            );
            return;
        }

        const collection = db.collection(collName);

        if (collName === 'chats') {
            const chatsToInsert = [];
            for (const [companyId, chatsArray] of Object.entries(data)) {
                for (const chat of chatsArray) {
                    chatsToInsert.push({ companyId, ...chat });
                }
            }
            await collection.deleteMany({});
            if (chatsToInsert.length > 0) {
                await collection.insertMany(chatsToInsert);
            }
        } else {
            await collection.deleteMany({});
            if (Array.isArray(data) && data.length > 0) {
                const cleanData = data.map(d => {
                    const copy = { ...d };
                    delete copy._id;
                    return copy;
                });
                await collection.insertMany(cleanData);
            }
        }
    } catch (error) {
        console.warn(`MongoDB sync notice (${filename}):`, error.message);
    }
}

function safeParseJsonFromModel(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        const maybeJson = String(text || '').match(/\{[\s\S]*\}/);
        if (!maybeJson) throw new Error('Model did not return valid JSON');
        return JSON.parse(maybeJson[0]);
    }
}

function compactText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function assessPhase1IdeaQuality(ideaRaw) {
    const idea = compactText(ideaRaw);
    const lettersOnly = idea.toLowerCase().replace(/[^a-zA-Z\u00C0-\u017F\s]/g, ' ');
    const tokens = lettersOnly.split(/\s+/).filter(Boolean);
    const uniqueTokens = new Set(tokens);
    const tokenCount = tokens.length;
    const uniqueRatio = tokenCount ? uniqueTokens.size / tokenCount : 0;
    const longTokenCount = tokens.filter(t => t.length >= 4).length;
    const hasRepeatedGibberish = /(bla){2,}|(test){3,}|(asdf){2,}|(qwer){2,}/i.test(idea);
    const hasCoreKeywords = /(invest|anlage|kessel|waermepumpe|heat pump|energie|strom|gas|produktion|capex|opex|kwh|co2|emission|effizienz|wacc|standort|betrieb)/i.test(idea);

    const issues = [];
    if (tokenCount < 8) issues.push('Too few meaningful words');
    if (longTokenCount < 4) issues.push('Not enough descriptive terms');
    if (uniqueRatio < 0.45) issues.push('Very low lexical diversity');
    if (hasRepeatedGibberish) issues.push('Detected repeated gibberish patterns');
    if (!hasCoreKeywords) issues.push('Missing investment/energy context keywords');

    const qualityScore = Math.max(0, 100 - issues.length * 22);
    return {
        isUsable: issues.length <= 1,
        qualityScore,
        issues,
        tokenCount,
        uniqueRatio
    };
}

function assessPhase1InputQuality(inputs) {
    const {
        idea,
        boundaries,
        capex,
        opex,
        lifetime,
        subsidies,
        qualitative
    } = inputs || {};

    const ideaQuality = assessPhase1IdeaQuality(idea);
    const fields = {
        idea: (idea || '').trim(),
        boundaries: (boundaries || '').trim(),
        capex: (capex || '').trim(),
        opex: (opex || '').trim(),
        lifetime: (lifetime || '').trim(),
        subsidies: (subsidies || '').trim(),
        qualitative: (qualitative || '').trim()
    };

    const missingFields = Object.entries(fields)
        .filter(([k, v]) => !v || v.length < 15)
        .map(([k]) => k);

    const totalFilledLength = Object.values(fields).reduce((sum, v) => sum + v.length, 0);
    const requiredMinLength = 300; // At least 300 chars across all fields
    const avgQualityScore = ideaQuality.qualityScore + (missingFields.length === 0 ? 30 : missingFields.length * -10);

    const isUsable = ideaQuality.isUsable && missingFields.length <= 1 && totalFilledLength >= requiredMinLength;

    return {
        isUsable,
        qualityScore: Math.max(0, Math.min(100, avgQualityScore)),
        missingFields,
        totalLength: totalFilledLength,
        ideaQuality
    };
}

function makePhase1KnowledgePack() {
    return [
        {
            id: 'DIN_EN_17463_VALERI_CORE',
            title: 'DIN EN 17463 (VALERI) - Core Principle',
            note: 'Investment decisions should account for all benefits and burdens, not only direct CAPEX/OPEX.'
        },
        {
            id: 'ISO_50001_ENERGY_PERFORMANCE',
            title: 'ISO 50001 - Energy Performance Improvement',
            note: 'Energy management should track relevant energy uses and measurable performance indicators.'
        },
        {
            id: 'IPMVP_MEASUREMENT_VERIFICATION',
            title: 'IPMVP - Measurement and Verification',
            note: 'Define baselines, boundaries, and verifiable assumptions early to avoid biased savings claims.'
        },
        {
            id: 'LCOE_TOTAL_COST_VIEW',
            title: 'Total Cost / Lifecycle Perspective',
            note: 'Include lifecycle effects like maintenance, downtime, training, and replacement timing.'
        },
        {
            id: 'EU_ETS_CO2_COST_SIGNAL',
            title: 'EU ETS and Carbon Cost Signals',
            note: 'Carbon exposure and compliance can materially affect long-term project economics.'
        },
        {
            id: 'SUPPLY_SECURITY_RESILIENCE',
            title: 'Energy Supply Security & Operational Resilience',
            note: 'Resilience effects include outage risk, peak demand exposure, and production continuity.'
        }
    ];
}

// ==================== VALERI Project Management Functions ====================

/**
 * Creates a new VALERI project structure
 */
function createNewValeriProject(projectId, userId, companyId, name, idea) {
    return {
        projectId,
        userId,
        companyId,
        name,
        idea,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentPhase: 0, // 0=not started, 1=phase1, 2=phase2, etc.
        phaseLocked: false,
        phases: {
            phase1: {
                status: 'not_started', // not_started, in_progress, completed
                sessionId: null,
                inputData: null,
                questions: [],
                answers: [], // Array of {id, answer, timestamp}
                projectBrief: {},
                effectsMatrix: {},
                synthesis: {},
                completedAt: null
            },
            phase2: {
                status: 'locked',
                data: {},
                completedAt: null
            },
            phase3: {
                status: 'locked',
                data: {},
                completedAt: null
            },
            phase7: {
                status: 'locked',
                scenarios: {
                    most_likely: null,
                    best_case: null,
                    worst_case: null
                },
                sensitivity: null,
                completedAt: null
            },
            phase8: {
                status: 'locked',
                data: {},
                completedAt: null
            }
        }
    };
}

/**
 * Gets the file path for a VALERI project
 */
function getValeriProjectFilePath(userId, companyId, projectId) {
    return `data/valeri_projects/${companyId}/${projectId}.json`;
}

/**
 * Loads a VALERI project from file
 */
async function loadValeriProject(userId, companyId, projectId) {
    try {
        const filePath = getValeriProjectFilePath(userId, companyId, projectId);
        const data = await loadData(filePath, null);
        if (!data || data.userId !== userId || data.companyId !== companyId) {
            return null;
        }
        return data;
    } catch (error) {
        console.error('Error loading VALERI project:', error.message);
        return null;
    }
}

/**
 * Saves a VALERI project to file
 */
async function saveValeriProject(project) {
    try {
        const filePath = getValeriProjectFilePath(project.userId, project.companyId, project.projectId);
        project.updatedAt = new Date().toISOString();
        await saveData(filePath, project);
        return true;
    } catch (error) {
        console.error('Error saving VALERI project:', error.message);
        return false;
    }
}

/**
 * Validates phase transition
 * Returns { allowed: boolean, reason?: string }
 */
function validatePhaseTransition(project, targetPhase) {
    const phaseOrder = [0, 1, 2, 3, 7, 8];
    const currentPhase = project.currentPhase || 0;
    
    // Can only go to next phase sequentially
    if (targetPhase !== currentPhase && targetPhase !== currentPhase + 1) {
        return {
            allowed: false,
            reason: `Forbidden: Cannot jump from phase ${currentPhase} to phase ${targetPhase}. Must complete phases sequentially.`
        };
    }
    
    // If moving forward, must complete current phase
    if (targetPhase > currentPhase) {
        const currentPhaseName = `phase${currentPhase === 0 ? 'Start' : currentPhase}`;
        if (currentPhase > 0) {
            const phaseData = project.phases[`phase${currentPhase}`];
            if (phaseData && phaseData.status !== 'completed') {
                return {
                    allowed: false,
                    reason: `Cannot advance: Phase ${currentPhase} must be completed first.`
                };
            }
        }
    }
    
    return { allowed: true };
}

/**
 * Updates a project's phase data
 */
async function updateValeriProjectPhase(project, phase, phaseData) {
    project.currentPhase = phase;
    project.phases[`phase${phase}`] = {
        ...project.phases[`phase${phase}`],
        ...phaseData
    };
    return await saveValeriProject(project);
}

function toNumberOr(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function calcPhase7MostLikelyNPV(inputs) {
    const capexEquipment = toNumberOr(inputs.capexEquipment, 0);
    const capexInstallation = toNumberOr(inputs.capexInstallation, 0);
    const capexPlanning = toNumberOr(inputs.capexPlanning, 0);
    const capexOtherInitial = toNumberOr(inputs.capexOtherInitial, 0);
    const I0 = capexEquipment + capexInstallation + capexPlanning + capexOtherInitial;

    // Shares and costs are provided in percent; convert to decimals.
    const equitySharePct = toNumberOr(inputs.equitySharePct, 0);
    const costOfEquityPct = toNumberOr(inputs.costOfEquityPct, 0);
    const debtSharePct = toNumberOr(inputs.debtSharePct, 0);
    const interestRateDebtPct = toNumberOr(inputs.interestRateDebtPct, 0);

    const equityShare = clamp(equitySharePct / 100, 0, 1);
    const debtShare = clamp(debtSharePct / 100, 0, 1);
    const costOfEquity = costOfEquityPct / 100;
    const interestRateDebt = interestRateDebtPct / 100;

    const wacc = equityShare * costOfEquity + debtShare * interestRateDebt;
    const i = wacc;
    if (!(i >= 0)) throw new Error('Invalid WACC (discount rate).');

    const n = Math.max(1, Math.floor(toNumberOr(inputs.lifespanYears, 0)));

    // Energy benefit inputs
    const annualEnergySavedKwh = toNumberOr(inputs.annualEnergySavedKwh, 0);
    const energyPriceBase = toNumberOr(inputs.energyPriceBase, 0);
    const priceTrendPct = toNumberOr(inputs.priceTrendPct, 0);
    const degradationPct = toNumberOr(inputs.technicalDegradationPct, 0);

    const priceTrend = priceTrendPct / 100;
    const degradation = degradationPct / 100;

    // Treat degradation as efficiency/savings loss per year (e.g., 0.01 => 1% reduction).
    const savingsRetention = 1 - clamp(degradation, -0.5, 0.95); // allow small negative (improvement) but avoid extreme.

    const maintenanceSavingsPerYear = toNumberOr(inputs.maintenanceSavingsPerYear, 0);
    const subsidyYear1 = toNumberOr(inputs.subsidyYear1, 0);

    const replacementCost = toNumberOr(inputs.replacementCost, 0);
    const replacementYear = Math.max(1, Math.min(n, Math.floor(toNumberOr(inputs.replacementYear, n))));
    const scrapValue = toNumberOr(inputs.scrapValue, 0);

    const cashflowRows = [];
    let npv = -I0;
    let cumulative = -I0;

    for (let t = 1; t <= n; t++) {
        // t=1 => base year: pow(...,0) = 1
        const energyQuantityFactor = Math.pow(savingsRetention, t - 1);
        const energyPriceFactor = Math.pow(1 + priceTrend, t - 1);

        const kwhSavedT = annualEnergySavedKwh * energyQuantityFactor;
        const energyBenefitT = kwhSavedT * energyPriceBase * energyPriceFactor;

        const maintenanceBenefitT = maintenanceSavingsPerYear; // assume constant in Most Likely
        const subsidyT = t === 1 ? subsidyYear1 : 0;
        const replacementCostT = t === replacementYear ? replacementCost : 0;
        const scrapValueT = t === n ? scrapValue : 0;

        const Ct = energyBenefitT + maintenanceBenefitT + subsidyT - replacementCostT + scrapValueT;
        const discounted = Ct / Math.pow(1 + i, t);
        npv += discounted;
        cumulative += Ct; // non-discounted cumulative

        cashflowRows.push({
            year: t,
            kwhSaved: kwhSavedT,
            energyBenefit: energyBenefitT,
            maintenanceSavings: maintenanceBenefitT,
            subsidy: subsidyT,
            replacementCost: replacementCostT,
            scrapValue: scrapValueT,
            totalCashFlow: Ct,
            discountedCashFlow: discounted,
            cumulativeNPV: npv
        });
    }

    const decision =
        npv > 0 ? 'NPV > 0: Invest (worthwhile)' :
        npv < 0 ? 'NPV < 0: Do not invest (not worthwhile)' :
        'NPV = 0: Indifferent (break-even)';

    const decisionRule = npv > 0 ? 'invest' : (npv < 0 ? 'do_not_invest' : 'indifferent');

    return {
        I0,
        wacc,
        discountRate: i,
        lifespanYears: n,
        cashflowRows,
        npv,
        decision,
        decisionRule
    };
}

// Clear LightRAG cache (safe, non-blocking)
async function clearLightRagCacheSafe() {
    try {
        if (!process.env.ENEFIT_API_KEY) {
            console.warn('LightRAG cache clear skipped: ENEFIT_API_KEY not set');
            return;
        }
        console.log('Attempting LightRAG cache clear...');
        const response = await axios.post('https://viktor.thws.education/documents/clear_cache', {
            modes: ["mix", "naive"]
        }, {
            headers: {
                'accept': 'application/json',
                'X-API-Key': process.env.ENEFIT_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        console.log('LightRAG cache clear response:', response.status);
    } catch (e) {
        console.warn('LightRAG cache clear failed:', e.message);
    }
}

// Generate unique credentials
function generateCredentials() {
    const username = 'company_' + crypto.randomBytes(4).toString('hex');
    const password = crypto.randomBytes(6).toString('hex');
    return { username, password };
}

// Send login credentials email
async function sendLoginCredentials(email, companyName, credentials, baseUrl = 'http://localhost:3000') {
    try {
        const mailOptions = {
            from: EMAIL_FROM_ADDRESS,
            to: email,
            replyTo: EMAIL_REPLY_TO,
            subject: 'Ihre Zugangsdaten für das enefit Dashboard',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #4d65ff 0%, #3546b1 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="margin: 0; font-size: 24px;">Willkommen bei enefit!</h1>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Ihre Registrierung wurde genehmigt</p>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                        <h2 style="color: #333; margin-bottom: 20px;">Hallo ${companyName},</h2>
                        
                        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                            Ihre Registrierung bei enefit wurde erfolgreich genehmigt. Sie können sich jetzt in unser Dashboard einloggen.
                        </p>
                        
                        <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #4d65ff; margin: 20px 0;">
                            <h3 style="color: #333; margin-top: 0;">Ihre Zugangsdaten:</h3>
                            <p style="margin: 10px 0;"><strong>Benutzername:</strong> <span style="background: #e9ecef; padding: 5px 10px; border-radius: 4px; font-family: monospace;">${credentials.username}</span></p>
                            <p style="margin: 10px 0;"><strong>Passwort:</strong> <span style="background: #e9ecef; padding: 5px 10px; border-radius: 4px; font-family: monospace;">${credentials.password}</span></p>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${baseUrl}/chat" style="background: linear-gradient(135deg, #4d65ff 0%, #3546b1 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
                                Zum Chat
                            </a>
                        </div>
                        
                        <p style="color: #666; font-size: 14px; margin-top: 30px;">
                            <strong>Wichtiger Hinweis:</strong> Bewahren Sie diese Zugangsdaten sicher auf. Sie können Ihr Passwort später im Dashboard ändern.
                        </p>
                        
                        <hr style="border: none; border-top: 1px solid #e9ecef; margin: 30px 0;">
                        
                        <p style="color: #999; font-size: 12px; text-align: center;">
                            Bei Fragen wenden Sie sich bitte an unser Support-Team.<br>
                            © 2024 enefit - THWS
                        </p>
                    </div>
                </div>
            `
        };

        console.log('Sending login credentials email with options:', {
            from: mailOptions.from,
            to: mailOptions.to,
            replyTo: mailOptions.replyTo,
            subject: mailOptions.subject
        });

        await transporter.sendMail(mailOptions);
        console.log('Login credentials email sent to:', email);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}

// Send event notification email
async function sendEventNotification(email, eventData) {
    try {
        const eventDate = new Date(eventData.date).toLocaleDateString('de-DE', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const mailOptions = {
            from: EMAIL_FROM_ADDRESS,
            to: email,
            replyTo: EMAIL_REPLY_TO,
            subject: `Bestätigung: ${eventData.title}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #4d65ff 0%, #3546b1 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="margin: 0; font-size: 24px;">enefit Event</h1>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Ihre Anmeldung ist bestätigt!</p>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                        <h2 style="color: #333; margin-bottom: 20px;">${eventData.title}</h2>
                        
                        <div style="background: #d4edda; padding: 20px; border-radius: 8px; border-left: 4px solid #28a745; margin: 20px 0;">
                            <h3 style="color: #155724; margin-top: 0;">✅ Anmeldung erfolgreich!</h3>
                            <p style="color: #155724; margin: 10px 0;">Ihre Anmeldung für dieses Event wurde erfolgreich bestätigt. Wir freuen uns auf Ihr Kommen!</p>
                        </div>
                        
                        <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #4d65ff; margin: 20px 0;">
                            <h3 style="color: #333; margin-top: 0;">Event Details:</h3>
                            <p style="margin: 10px 0;"><strong>Datum & Zeit:</strong> ${eventDate}</p>
                            ${eventData.description ? `<p style="margin: 10px 0;"><strong>Beschreibung:</strong> ${eventData.description}</p>` : ''}
                            ${eventData.location ? `<p style="margin: 10px 0;"><strong>Ort:</strong> ${eventData.location}</p>` : ''}
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="https://enefit.ai" style="background: linear-gradient(135deg, #4d65ff 0%, #3546b1 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
                                enefit Website
                            </a>
                        </div>
                        
                        <p style="color: #666; font-size: 14px; margin-top: 30px;">
                            <strong>Wichtiger Hinweis:</strong> Bitte notieren Sie sich die Event-Details. Weitere Informationen finden Sie auf unserer Website.
                        </p>
                        
                        <hr style="border: none; border-top: 1px solid #e9ecef; margin: 30px 0;">
                        
                        <p style="color: #999; font-size: 12px; text-align: center;">
                            Bei Fragen wenden Sie sich bitte an unser Event-Team.<br>
                            © 2024 enefit - THWS
                        </p>
                    </div>
                </div>
            `
        };

        console.log('Sending event notification email with options:', {
            from: mailOptions.from,
            to: mailOptions.to,
            replyTo: mailOptions.replyTo,
            subject: mailOptions.subject
        });

        await transporter.sendMail(mailOptions);
        console.log('Event confirmation email sent to:', email);
        return true;
    } catch (error) {
        console.error('Error sending event email:', error);
        return false;
    }
}

// Update existing event URLs to use relative paths
async function updateEventUrls() {
    try {
        const events = await loadData(EVENTS_FILE);
        let updated = false;
        
        events.forEach(event => {
            if (event.registrationUrl && (event.registrationUrl.includes('http') || event.registrationUrl.includes('localhost'))) {
                // Extract event ID from current URL
                const eventId = event.id;
                // Update URL to use relative path (will be resolved by client)
                event.registrationUrl = `/api/event-registration/${eventId}`;
                updated = true;
            }
        });
        
        if (updated) {
            await saveData(EVENTS_FILE, events);
            console.log('Updated existing event URLs to use relative paths');
        }
    } catch (error) {
        console.error('Error updating event URLs:', error);
    }
}

// Initialize data files
async function initializeData() {
    await ensureDataDirectory();
    await loadData(APPLICATIONS_FILE, []);
    await loadData(COMPANIES_FILE, []);
    await loadData(USERS_FILE, []);
    await loadData(EVENTS_FILE, []);
    await loadData(CHATS_FILE, {});
}

// API endpoint for chat
app.post('/api/chat', async (req, res) => {
    try {
        console.log('Received request:', req.body);
        console.log('Using API key:', process.env.ENEFIT_API_KEY ? 'API key is set' : 'API key is missing');
        
        // Transform the request to match the expected API format
        const { message, history = [] } = req.body;
        
        // Create the payload according to API documentation with input wrapper
        const payload = {
            input: {
                query: message,
                mode: "mix",
                only_need_context: false,
                only_need_prompt: false,
                response_type: "string",
                top_k: 10,
                chunk_top_k: 10,
                max_entity_tokens: 1000,
                max_relation_tokens: 1000,
                max_total_tokens: 2000,
                conversation_history: history.map(msg => ({
                    role: 'user',
                    content: msg
                })),
                history_turns: Math.min(history.length, 10),
                ids: [],
                user_prompt: "",
                enable_rerank: false
            }
        };
        
        console.log('Sending payload to API:', payload);
        console.log('API Key being used:', process.env.ENEFIT_API_KEY);
        console.log('API Key length:', process.env.ENEFIT_API_KEY ? process.env.ENEFIT_API_KEY.length : 0);
        
        // Send request to API
        const response = await axios.post('https://viktor.thws.education/query', payload, {
            headers: {
                'accept': 'application/json',
                'X-API-Key': process.env.ENEFIT_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('API Response status:', response.status);
        console.log('API Response data:', response.data);
        
        // Handle different possible response formats
        let responseText = 'No response available';
        
        if (response.data) {
            // Try different possible response fields
            responseText = response.data.response || 
                          response.data.answer || 
                          response.data.result || 
                          response.data.content || 
                          response.data.message || 
                          response.data.text ||
                          JSON.stringify(response.data);
        }
        
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json({ response: responseText });
    } catch (error) {
        console.error('Detailed error:', {
            message: error.message,
            response: error.response ? {
                status: error.response.status,
                data: error.response.data,
                detail: error.response.data.detail,
                detailString: JSON.stringify(error.response.data.detail),
                headers: error.response.headers
            } : 'No response data',
            config: error.config ? {
                url: error.config.url,
                method: error.config.method,
                headers: error.config.headers
            } : 'No config data'
        });
        
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message
        });
    }
});

/** Proxy LightRAG /query/stream (NDJSON) for authenticated company users — used by newchat.html */
const LIGHTRAG_STREAM_URL = 'https://viktor.thws.education/query/stream';
app.post('/api/lightrag-query', requireAuth, requireCompany, async (req, res) => {
    try {
        if (!process.env.ENEFIT_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }
        const payload = { ...req.body };
        if (payload.stream === undefined) {
            payload.stream = true;
        }

        const upstream = await axios({
            method: 'POST',
            url: LIGHTRAG_STREAM_URL,
            data: payload,
            headers: {
                'Accept': 'application/x-ndjson, application/json',
                'X-API-Key': process.env.ENEFIT_API_KEY,
                'Content-Type': 'application/json'
            },
            responseType: 'stream',
            validateStatus: () => true
        });

        if (upstream.status >= 400) {
            const chunks = [];
            for await (const chunk of upstream.data) {
                chunks.push(chunk);
            }
            const body = Buffer.concat(chunks).toString('utf8');
            res.status(upstream.status);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            try {
                res.json(body ? JSON.parse(body) : { detail: 'Upstream error' });
            } catch {
                res.json({ detail: body || 'Upstream error' });
            }
            return;
        }

        res.status(upstream.status);
        const ct = upstream.headers['content-type'];
        if (ct) {
            res.setHeader('Content-Type', ct);
        }
        upstream.data.on('error', (err) => {
            console.error('LightRAG upstream stream error:', err.message);
            if (!res.writableEnded) {
                res.end();
            }
        });
        upstream.data.pipe(res);
    } catch (error) {
        console.error('LightRAG proxy error:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'LightRAG request failed' });
        }
    }
});

// --- Chats Storage API ---
// Structure in CHATS_FILE: { [companyId]: [ { id, title, messages: [ { role, content, ts } ] } ] }

function requireCompany(req, res, next) {
    if (req.session.user && req.session.user.role === 'company') return next();
    return res.status(403).json({ error: 'Company access required' });
}

app.get('/api/chats', requireAuth, requireCompany, async (req, res) => {
    try {
        const store = await loadData(CHATS_FILE, {});
        const companyId = req.session.user.companyId;
        res.json(store[companyId] || []);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load chats' });
    }
});

app.post('/api/chats', requireAuth, requireCompany, async (req, res) => {
    try {
        const store = await loadData(CHATS_FILE, {});
        const companyId = req.session.user.companyId;
        const id = Date.now().toString();
        const index = (store[companyId]?.length || 0) + 1;
        const title = (req.body && req.body.title) || `Neuer Chat ${index}`;
        const chat = { id, title, messages: [] };
        if (!store[companyId]) store[companyId] = [];
        store[companyId].unshift(chat);
        await saveData(CHATS_FILE, store);
        // Trigger LightRAG cache clear (non-blocking)
        clearLightRagCacheSafe();
        res.json({ success: true, chat });
    } catch (e) {
        res.status(500).json({ error: 'Failed to create chat' });
    }
});

app.get('/api/chats/:id', requireAuth, requireCompany, async (req, res) => {
    try {
        const store = await loadData(CHATS_FILE, {});
        const companyId = req.session.user.companyId;
        const chats = store[companyId] || [];
        const chat = chats.find(c => c.id === req.params.id);
        if (!chat) return res.status(404).json({ error: 'Chat not found' });
        res.json(chat);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load chat' });
    }
});

// Rename chat (update title)
app.patch('/api/chats/:id', requireAuth, requireCompany, async (req, res) => {
    try {
        const { title } = req.body || {};
        if (!title || !String(title).trim()) {
            return res.status(400).json({ error: 'Title is required' });
        }
        const store = await loadData(CHATS_FILE, {});
        const companyId = req.session.user.companyId;
        const chats = store[companyId] || [];
        const idx = chats.findIndex(c => c.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Chat not found' });
        chats[idx].title = String(title).trim();
        await saveData(CHATS_FILE, store);
        res.json({ success: true, chat: chats[idx] });
    } catch (e) {
        res.status(500).json({ error: 'Failed to update chat' });
    }
});

// Delete chat
app.delete('/api/chats/:id', requireAuth, requireCompany, async (req, res) => {
    try {
        const store = await loadData(CHATS_FILE, {});
        const companyId = req.session.user.companyId;
        const chats = store[companyId] || [];
        const idx = chats.findIndex(c => c.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Chat not found' });
        chats.splice(idx, 1);
        store[companyId] = chats;
        await saveData(CHATS_FILE, store);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete chat' });
    }
});

app.post('/api/chats/:id/messages', requireAuth, requireCompany, async (req, res) => {
    try {
        const { role, content } = req.body || {};
        if (!role || !content) return res.status(400).json({ error: 'role and content are required' });
        const store = await loadData(CHATS_FILE, {});
        const companyId = req.session.user.companyId;
        const chats = store[companyId] || [];
        const idx = chats.findIndex(c => c.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Chat not found' });
        const message = { role, content, ts: new Date().toISOString() };
        chats[idx].messages.push(message);
        await saveData(CHATS_FILE, store);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to append message' });
    }
});

app.delete('/api/chats/:id/messages', requireAuth, requireCompany, async (req, res) => {
    try {
        const store = await loadData(CHATS_FILE, {});
        const companyId = req.session.user.companyId;
        const chats = store[companyId] || [];
        const idx = chats.findIndex(c => c.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Chat not found' });
        chats[idx].messages = [];
        await saveData(CHATS_FILE, store);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to clear messages' });
    }
});

// Clear cache endpoint
app.post('/api/clear-cache', requireAdmin, async (req, res) => {
    try {
        console.log('Cache clear request received');
        // For now, just return success since we don't have actual cache to clear
        res.json({ success: true, message: 'Cache cleared successfully' });
    } catch (error) {
        console.error('Error clearing cache:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

// Submit company application
app.post('/api/submit-application', async (req, res) => {
    try {
        const application = {
            id: Date.now().toString(),
            ...req.body,
            status: 'pending',
            submittedAt: new Date().toISOString(),
            reviewedAt: null,
            reviewedBy: null
        };

        const applications = await loadData(APPLICATIONS_FILE);
        applications.push(application);
        await saveData(APPLICATIONS_FILE, applications);

        // Notify admin about new application
        try {
            const mailOptions = {
                from: EMAIL_FROM_ADDRESS,
                to: 'info@enefit.ai',
                replyTo: EMAIL_REPLY_TO,
                subject: `Neue Registrierungsanfrage: ${application.companyName || application.contactPerson || application.contactEmail}`,
                html: `
                    <div style="font-family: Arial, sans-serif; color: #333;">
                        <div style="max-width: 640px; margin: 0 auto; padding: 20px;">
                            <h2 style="margin:0 0 10px;">Neue Registrierungsanfrage</h2>
                            <p style="margin:0 0 16px;">Es wurde soeben eine neue Anfrage zur Registrierung eingereicht.</p>
                            <div style="background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:16px;">
                                <p style="margin:6px 0;"><strong>Unternehmen:</strong> ${application.companyName || '-'}</p>
                                <p style="margin:6px 0;"><strong>Branche:</strong> ${application.industry || '-'}</p>
                                <p style="margin:6px 0;"><strong>Kontaktperson:</strong> ${application.contactPerson || '-'}</p>
                                <p style="margin:6px 0;"><strong>E-Mail:</strong> ${application.contactEmail || '-'}</p>
                                <p style="margin:6px 0;"><strong>Telefon:</strong> ${application.contactPhone || '-'}</p>
                                <p style="margin:6px 0;"><strong>Adresse:</strong> ${application.address || '-'}</p>
                                <p style="margin:6px 0;"><strong>Mitarbeiter:</strong> ${application.employees || '-'}</p>
                                <p style="margin:6px 0;"><strong>Beschreibung:</strong> ${application.description || '-'}</p>
                            </div>
                            <p style="margin:16px 0 0; font-size:12px; color:#6b7280;">Anfrage-ID: ${application.id}</p>
                        </div>
                    </div>
                `
            };
            await transporter.sendMail(mailOptions);
        } catch (mailErr) {
            console.warn('Failed to send admin notification email:', mailErr);
        }

        console.log('New application submitted:', application.id);
        res.json({ success: true, applicationId: application.id });
    } catch (error) {
        console.error('Error submitting application:', error);
        res.status(500).json({ error: 'Failed to submit application' });
    }
});



// Approve application
app.post('/api/approve-application/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { adminUser } = req.body;

        const applications = await loadData(APPLICATIONS_FILE);
        const companies = await loadData(COMPANIES_FILE);
        const users = await loadData(USERS_FILE);

        const application = applications.find(app => app.id === id);
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        // Generate credentials
        const credentials = generateCredentials();
        // Use applicant email as the login username
        credentials.username = application.contactEmail;

        // Create company record
        const company = {
            id: Date.now().toString(),
            name: application.companyName,
            industry: application.industry,
            contactEmail: application.contactEmail,
            contactPhone: application.contactPhone,
            address: application.address,
            description: application.description,
            employees: application.employees,
            website: application.website || '',
            status: 'active',
            registeredAt: new Date().toISOString(),
            credentials: credentials
        };

        // Create user record
        const user = {
            id: Date.now().toString(),
            username: credentials.username,
            password: credentials.password,
            companyId: company.id,
            role: 'company',
            createdAt: new Date().toISOString()
        };

        // Update application status
        application.status = 'approved';
        application.reviewedAt = new Date().toISOString();
        application.reviewedBy = adminUser;

        // Save all changes
        await saveData(APPLICATIONS_FILE, applications);
        companies.push(company);
        await saveData(COMPANIES_FILE, companies);
        users.push(user);
        await saveData(USERS_FILE, users);

        // Get the current domain dynamically
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const baseUrl = `${protocol}://${host}`;

        // Send email with login credentials
        const emailSent = await sendLoginCredentials(
            application.contactEmail,
            application.companyName,
            credentials,
            baseUrl
        );

        console.log('Application approved:', id);
        res.json({ 
            success: true, 
            company: company,
            credentials: credentials,
            emailSent: emailSent
        });
    } catch (error) {
        console.error('Error approving application:', error);
        res.status(500).json({ error: 'Failed to approve application' });
    }
});

// Reject application
app.post('/api/reject-application/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { adminUser, reason } = req.body;

        const applications = await loadData(APPLICATIONS_FILE);
        const application = applications.find(app => app.id === id);
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        application.status = 'rejected';
        application.reviewedAt = new Date().toISOString();
        application.reviewedBy = adminUser;
        application.rejectionReason = reason;

        await saveData(APPLICATIONS_FILE, applications);

        console.log('Application rejected:', id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error rejecting application:', error);
        res.status(500).json({ error: 'Failed to reject application' });
    }
});



// Get applications chart data
app.get('/api/applications-chart', async (req, res) => {
    try {
        const applications = await loadData(APPLICATIONS_FILE);
        
        // Group by month for the last 6 months
        const months = [];
        const data = [];
        
        for (let i = 5; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const monthKey = date.toISOString().slice(0, 7); // YYYY-MM format
            months.push(date.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' }));
            
            const count = applications.filter(app => 
                app.submittedAt.startsWith(monthKey)
            ).length;
            data.push(count);
        }

        res.json({ months, data });
    } catch (error) {
        console.error('Error loading chart data:', error);
        res.status(500).json({ error: 'Failed to load chart data' });
    }
});

// Get industry distribution
app.get('/api/industry-distribution', async (req, res) => {
    try {
        const companies = await loadData(COMPANIES_FILE);
        
        const distribution = {};
        companies.forEach(company => {
            distribution[company.industry] = (distribution[company.industry] || 0) + 1;
        });

        const labels = Object.keys(distribution);
        const data = Object.values(distribution);

        res.json({ labels, data });
    } catch (error) {
        console.error('Error loading industry distribution:', error);
        res.status(500).json({ error: 'Failed to load industry distribution' });
    }
});

// Activate company
app.post('/api/companies/:id/activate', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const companies = await loadData(COMPANIES_FILE);
        
        const company = companies.find(comp => comp.id === id);
        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        company.status = 'active';
        await saveData(COMPANIES_FILE, companies);

        console.log('Company activated:', id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error activating company:', error);
        res.status(500).json({ error: 'Failed to activate company' });
    }
});

// Deactivate company
app.post('/api/companies/:id/deactivate', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const companies = await loadData(COMPANIES_FILE);
        
        const company = companies.find(comp => comp.id === id);
        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        company.status = 'inactive';
        await saveData(COMPANIES_FILE, companies);

        console.log('Company deactivated:', id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deactivating company:', error);
        res.status(500).json({ error: 'Failed to deactivate company' });
    }
});

// Authentication endpoints
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Check for admin login using environment variables
        const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
        if (ADMIN_USERNAME && ADMIN_PASSWORD && username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            req.session.user = {
                id: 'admin',
                username: ADMIN_USERNAME,
                role: 'admin',
                name: 'Administrator'
            };
            return res.json({ 
                success: true, 
                user: req.session.user,
                message: 'Admin login successful'
            });
        }

        // Check for company login
        const users = await loadData(USERS_FILE);
        const companies = await loadData(COMPANIES_FILE);
        
        const user = users.find(u => u.username === username && u.password === password);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const company = companies.find(c => c.id === user.companyId);
        
        if (!company || company.status !== 'active') {
            return res.status(403).json({ error: 'Company account is not active' });
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            role: 'company',
            companyId: user.companyId,
            companyName: company.name
        };

        res.json({ 
            success: true, 
            user: req.session.user,
            message: 'Company login successful',
            redirectTo: '/accesspoint'
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

app.get('/api/check-auth', (req, res) => {
    if (req.session.user) {
        res.json({ 
            authenticated: true, 
            user: req.session.user 
        });
    } else {
        res.json({ authenticated: false });
    }
});

// Middleware to check authentication
function requireAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
}

// Middleware to check admin role
function requireAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Admin access required' });
    }
}

// Protected routes
app.get('/api/dashboard-stats', requireAdmin, async (req, res) => {
    try {
        const applications = await loadData(APPLICATIONS_FILE);
        const companies = await loadData(COMPANIES_FILE);

        const stats = {
            totalApplications: applications.length,
            pendingApplications: applications.filter(app => app.status === 'pending').length,
            approvedApplications: applications.filter(app => app.status === 'approved').length,
            rejectedApplications: applications.filter(app => app.status === 'rejected').length,
            totalCompanies: companies.length,
            activeCompanies: companies.filter(comp => comp.status === 'active').length,
            newThisWeek: applications.filter(app => {
                const appDate = new Date(app.submittedAt);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return appDate >= weekAgo;
            }).length
        };

        res.json(stats);
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        res.status(500).json({ error: 'Failed to load statistics' });
    }
});

app.get('/api/applications', requireAdmin, async (req, res) => {
    try {
        const applications = await loadData(APPLICATIONS_FILE);
        res.json(applications);
    } catch (error) {
        console.error('Error loading applications:', error);
        res.status(500).json({ error: 'Failed to load applications' });
    }
});

app.get('/api/companies', requireAdmin, async (req, res) => {
    try {
        const companies = await loadData(COMPANIES_FILE);
        res.json(companies);
    } catch (error) {
        console.error('Error loading companies:', error);
        res.status(500).json({ error: 'Failed to load companies' });
    }
});

// Company self-profile (company-only)
app.get('/api/company/profile', requireAuth, requireCompany, async (req, res) => {
    try {
        const companies = await loadData(COMPANIES_FILE);
        const company = companies.find(c => c.id === req.session.user.companyId);
        if (!company) return res.status(404).json({ error: 'Company not found' });
        res.json({
            id: company.id,
            name: company.name,
            email: company.contactEmail,
            profileInfo: company.profileInfo || '',
            profilePlans: company.profilePlans || '',
            profileGoals: company.profileGoals || '',
            profileIndustry: company.profileIndustry || ''
        });
    } catch (error) {
        console.error('Error loading company profile:', error);
        res.status(500).json({ error: 'Failed to load company profile' });
    }
});

// Update company self-profile (company-only)
app.post('/api/company/profile', requireAuth, requireCompany, async (req, res) => {
    try {
        const { profileInfo = '', profilePlans = '', profileGoals = '', profileIndustry = '' } = req.body || {};
        const companies = await loadData(COMPANIES_FILE);
        const idx = companies.findIndex(c => c.id === req.session.user.companyId);
        if (idx === -1) return res.status(404).json({ error: 'Company not found' });
        companies[idx].profileInfo = String(profileInfo);
        companies[idx].profilePlans = String(profilePlans);
        companies[idx].profileGoals = String(profileGoals);
        companies[idx].profileIndustry = String(profileIndustry);
        await saveData(COMPANIES_FILE, companies);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating company profile:', error);
        res.status(500).json({ error: 'Failed to update company profile' });
    }
});

// Change password endpoint (company-only)
app.post('/api/change-password', requireAuth, requireCompany, async (req, res) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body;
        
        // Validate input
        if (!oldPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Neues Passwort muss mindestens 6 Zeichen haben' });
        }
        
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: 'Neue Passwörter stimmen nicht überein' });
        }
        
        // Load users data
        const users = await loadData(USERS_FILE);
        const companies = await loadData(COMPANIES_FILE);
        
        // Find current user
        const userIndex = users.findIndex(u => u.id === req.session.user.id);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }
        
        const user = users[userIndex];
        
        // Verify old password
        if (user.password !== oldPassword) {
            return res.status(401).json({ error: 'Altes Passwort ist falsch' });
        }
        
        // Update password in users array
        users[userIndex].password = newPassword;
        await saveData(USERS_FILE, users);
        
        // Also update password in company credentials if it exists
        const companyIndex = companies.findIndex(c => c.id === user.companyId);
        if (companyIndex !== -1 && companies[companyIndex].credentials) {
            companies[companyIndex].credentials.password = newPassword;
            await saveData(COMPANIES_FILE, companies);
        }
        
        console.log('Password changed successfully for user:', user.username);
        
        // Send confirmation email
        try {
            const company = companies.find(c => c.id === user.companyId);
            if (company && company.contactEmail) {
                const mailOptions = {
                    from: EMAIL_FROM_ADDRESS,
                    to: company.contactEmail,
                    replyTo: EMAIL_REPLY_TO,
                    subject: 'Passwort erfolgreich geändert - enefit Dashboard',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                            <div style="background: linear-gradient(135deg, #4d65ff 0%, #3546b1 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                                <h1 style="margin: 0; font-size: 24px;">Passwort geändert</h1>
                                <p style="margin: 10px 0 0 0; opacity: 0.9;">Ihr Passwort wurde erfolgreich aktualisiert</p>
                            </div>
                            
                            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                                <h2 style="color: #333; margin-bottom: 20px;">Hallo ${company.name},</h2>
                                
                                <div style="background: #d4edda; padding: 20px; border-radius: 8px; border-left: 4px solid #28a745; margin: 20px 0;">
                                    <h3 style="color: #155724; margin-top: 0;">✅ Passwort erfolgreich geändert!</h3>
                                    <p style="color: #155724; margin: 10px 0;">Ihr Passwort wurde am ${new Date().toLocaleDateString('de-DE')} um ${new Date().toLocaleTimeString('de-DE')} erfolgreich geändert.</p>
                                </div>
                                
                                <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #4d65ff; margin: 20px 0;">
                                    <h3 style="color: #333; margin-top: 0;">Sicherheitshinweise:</h3>
                                    <ul style="color: #666; line-height: 1.6;">
                                        <li>Bewahren Sie Ihr neues Passwort sicher auf</li>
                                        <li>Verwenden Sie ein starkes, einzigartiges Passwort</li>
                                        <li>Teilen Sie Ihre Zugangsdaten nicht mit anderen</li>
                                        <li>Melden Sie sich bei verdächtigen Aktivitäten sofort bei uns</li>
                                    </ul>
                                </div>
                                
                                <div style="text-align: center; margin: 30px 0;">
                                    <a href="https://enefit.ai/chat" style="background: linear-gradient(135deg, #4d65ff 0%, #3546b1 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
                                        Zum Dashboard
                                    </a>
                                </div>
                                
                                <p style="color: #666; font-size: 14px; margin-top: 30px;">
                                    <strong>Wichtiger Hinweis:</strong> Falls Sie diese Änderung nicht vorgenommen haben, kontaktieren Sie uns bitte umgehend.
                                </p>
                                
                                <hr style="border: none; border-top: 1px solid #e9ecef; margin: 30px 0;">
                                
                                <p style="color: #999; font-size: 12px; text-align: center;">
                                    Bei Fragen wenden Sie sich bitte an unser Support-Team.<br>
                                    © 2024 enefit - THWS
                                </p>
                            </div>
                        </div>
                    `
                };
                
                await transporter.sendMail(mailOptions);
                console.log('Password change confirmation email sent to:', company.contactEmail);
            }
        } catch (emailError) {
            console.warn('Failed to send password change confirmation email:', emailError);
            // Don't fail the password change if email fails
        }
        
        res.json({ 
            success: true, 
            message: 'Passwort erfolgreich geändert' 
        });
        
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ error: 'Fehler beim Ändern des Passworts' });
    }
});
// Event management endpoints
app.post('/api/events', requireAdmin, async (req, res) => {
    try {
        const { title, date, description, location } = req.body;
        
        if (!title || !date) {
            return res.status(400).json({ error: 'Title and date are required' });
        }

        const events = await loadData(EVENTS_FILE);
        const eventId = Date.now().toString();
        
        const newEvent = {
            id: eventId,
            title,
            date,
            description: description || '',
            location: location || '',
            registrationUrl: `/api/event-registration/${eventId}`,
            createdAt: new Date().toISOString(),
            createdBy: req.session.user.username
        };

        events.push(newEvent);
        await saveData(EVENTS_FILE, events);

        console.log('New event created:', eventId);
        res.json({ 
            success: true, 
            event: newEvent,
            message: 'Event created successfully'
        });
    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({ error: 'Failed to create event' });
    }
});

app.get('/api/events', requireAdmin, async (req, res) => {
    try {
        const events = await loadData(EVENTS_FILE);
        res.json(events);
    } catch (error) {
        console.error('Error loading events:', error);
        res.status(500).json({ error: 'Failed to load events' });
    }
});

app.delete('/api/events/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const events = await loadData(EVENTS_FILE);
        
        const eventIndex = events.findIndex(event => event.id === id);
        if (eventIndex === -1) {
            return res.status(404).json({ error: 'Event not found' });
        }

        events.splice(eventIndex, 1);
        await saveData(EVENTS_FILE, events);

        console.log('Event deleted:', id);
        res.json({ success: true, message: 'Event deleted successfully' });
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

// Event registration endpoint (public, no auth required)
app.post('/api/event-registration/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        
        // Log the request for debugging
        console.log('Event registration request:', {
            eventId,
            body: req.body,
            headers: req.headers['content-type']
        });
        
        // Handle different content types and data structures
        let email;
        if (req.headers['content-type'] === 'application/json') {
            // Handle Webflow JSON structure
            if (req.body.payload && req.body.payload.data && req.body.payload.data.Email) {
                email = req.body.payload.data.Email;
            } else if (req.body.email) {
                // Fallback for simple JSON structure
                email = req.body.email;
            }
        } else if (req.headers['content-type'] === 'application/x-www-form-urlencoded') {
            email = req.body.email;
        } else {
            // Try to parse as form data
            email = req.body.email;
        }
        
        if (!email) {
            return res.status(400).json({ 
                error: 'Email is required',
                receivedData: req.body,
                contentType: req.headers['content-type']
            });
        }

        const events = await loadData(EVENTS_FILE);
        const event = events.find(e => e.id === eventId);
        
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        // Send event confirmation email
        const emailSent = await sendEventNotification(email, event);

        console.log('Event registration confirmed:', { eventId, email, emailSent });
        res.json({ 
            success: true, 
            message: 'Registration confirmed - confirmation email sent',
            emailSent: emailSent
        });
    } catch (error) {
        console.error('Error processing event registration:', error);
        res.status(500).json({ error: 'Failed to process registration' });
    }
});

// Clear cache endpoint
app.post('/api/clear-cache', requireAdmin, async (req, res) => {
    try {
        console.log('Received clear cache request');
        console.log('Using API key:', process.env.ENEFIT_API_KEY ? 'API key is set' : 'API key is missing');
        
        const response = await axios.post('https://viktor.thws.education/documents/clear_cache', {
            modes: [
                "mix",
                "naive"
            ]
        }, {
            headers: {
                'accept': 'application/json',
                'X-API-Key': process.env.ENEFIT_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Clear cache API Response status:', response.status);
        console.log('Clear cache API Response data:', response.data);
        
        res.json(response.data);
    } catch (error) {
        console.error('Clear cache error:', {
            message: error.message,
            response: error.response ? {
                status: error.response.status,
                data: error.response.data,
                headers: error.response.headers
            } : 'No response data',
            config: error.config ? {
                url: error.config.url,
                method: error.config.method,
                headers: error.config.headers
            } : 'No config data'
        });
        
        res.status(500).json({ 
            error: 'Failed to clear cache',
            details: error.message
        });
    }
});

// ============= PROTECTED API ENDPOINTS FOR EXTERNAL SERVICES =============

// Flowise AI Agent Endpoint (Förderung Finder)
app.post('/api/flowise-query', requireAuth, requireCompany, async (req, res) => {
    try {
        const { question } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }
        
        const flowisPredictionId = process.env.FLOWISE_PREDICTION_ID;
        const flowiseBaseUrl = process.env.FLOWISE_BASE_URL || 'https://flowise.thws.education';
        
        if (!flowisPredictionId) {
            console.error('FLOWISE_PREDICTION_ID not configured');
            return res.status(500).json({ error: 'Flowise service not configured' });
        }
        
        const flowiseUrl = `${flowiseBaseUrl}/api/v1/prediction/${flowisPredictionId}`;
        
        const response = await axios.post(flowiseUrl, { question }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('Flowise query error:', error.message);
        res.status(500).json({ 
            error: 'Failed to process Flowise query',
            message: error.message 
        });
    }
});

// Azure OpenAI Thinking Process Endpoint
app.post('/api/azure-thinking', requireAuth, requireCompany, async (req, res) => {
    try {
        const { userMessage, language } = req.body;
        
        if (!userMessage) {
            return res.status(400).json({ error: 'User message is required' });
        }
        
        const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://enefit-llm.openai.azure.com/';
        const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-nano';
        const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';
        const azureKey = process.env.AZURE_OPENAI_KEY || process.env.AZURE_API_KEY;
        
        if (!azureKey) {
            console.error('AZURE_OPENAI_KEY or AZURE_API_KEY not configured');
            return res.status(500).json({ error: 'Azure service not configured' });
        }
        
        const lang = language === 'German' ? 'German' : 'English';
        const url = `${azureEndpoint}openai/deployments/${azureDeployment}/chat/completions?api-version=${azureApiVersion}`;
        
        const response = await axios.post(url, {
            messages: [
                {
                    role: 'system',
                    content: `Generate a natural thinking process in 3-4 short phrases separated by "...", like "Analyzing your query... Considering relevant information... Preparing a thoughtful response...". Keep it under 50 words total, make it sound like real AI thinking. Respond in ${lang}.`
                },
                {
                    role: 'user',
                    content: 'Simulate thinking for this query: ' + userMessage
                }
            ],
            max_tokens: 60,
            temperature: 0.7
        }, {
            headers: {
                'Content-Type': 'application/json',
                'api-key': azureKey
            },
            timeout: 30000
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('Azure thinking error:', error.message);
        res.status(500).json({ 
            error: 'Failed to generate thinking process',
            message: error.message 
        });
    }
});

// Azure OpenAI Configuration for Multi-Query Concept
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://enefit-llm.openai.azure.com/';
const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-nano';
const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';
const azureSubscriptionKey = process.env.AZURE_OPENAI_KEY || process.env.AZURE_API_KEY; // ⚠️ CRITICAL: Must be set in .env, never hardcode!

// Multi-Query Keywords
const hl_keywords_mq = [
  "Energieeffizienz", "Energieoptimierung", "CO2-Emissionen", "Energiegesez",
  "Erneuerbare Energien", "Nachhaltigkeit", "Energieeinsparung",
  "Klimaschutz", "Energieaudits", "Energieverbrauch"
];

const ll_keywords_mq = [
  "Industrie 4.0", "Energiequellen", "gesetzliche Vorschriften",
  "Emissionsreduzierung", "Energiepolitik", "Smart Grids",
  "CO2-Reduktionsstrategien", "Energieberatung", "Energiepreise", "Energiegesetzgebung"
];

// Multi-Query Prompt Templates
const MQ_VARIATIONS_PROMPT = `Rewrite the following question into exactly 5 high-quality variations. Each variation should:
- Be clear and grammatically correct
- Maintain the original intent and meaning
- Use different wording and phrasing
- Be suitable for search queries

Return ONLY a valid JSON object with this exact structure:
{
  "variations": [
    "variation 1",
    "variation 2",
    "variation 3",
    "variation 4",
    "variation 5"
  ]
}

Question: {{QUESTION}}`;

const MQ_SUPER_QUESTION_PROMPT = `You are analyzing answers from a knowledge base chatbot. Based on the first 5 answers provided below, create ONE comprehensive and intelligent question that:

1. Contains ALL mentioned sources/references from the answers
2. Collects and integrates all important topics and themes from the 5 answers
3. Forms a unified, comprehensive question that would allow getting a complete answer covering all aspects
4. Is clear, well-structured, and suitable for querying a knowledge base

The question should be in the same language as the original questions.

Return ONLY a valid JSON object with this exact structure:
{
  "super_question": "your comprehensive question here",
  "sources_mentioned": ["source1", "source2", ...],
  "topics_collected": ["topic1", "topic2", ...]
}

First 5 Answers:
{{ANSWERS}}`;

// Multi-Query API Routes
app.post('/api/variations', async (req, res) => {
    try {
        const { question } = req.body;
        if (!question) return res.status(400).json({ error: 'Question is required' });

        const prompt = MQ_VARIATIONS_PROMPT.replace('{{QUESTION}}', question);
        const url = `${azureEndpoint}openai/deployments/${azureDeployment}/chat/completions?api-version=${azureApiVersion}`;

        const response = await axios.post(url, {
            messages: [
                { role: 'system', content: 'You are a helpful assistant that rewrites user questions into multiple high-quality variations.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 512
        }, {
            headers: {
                'Content-Type': 'application/json',
                'api-key': azureSubscriptionKey
            }
        });

        const modelText = response.data?.choices?.[0]?.message?.content;
        let parsed;
        try {
            parsed = JSON.parse(modelText);
        } catch (e) {
            const maybeJson = modelText.match(/\{[\s\S]*\}/);
            if (maybeJson) parsed = JSON.parse(maybeJson[0]);
            else throw new Error('Model did not return valid JSON');
        }

        res.json({ variations: parsed.variations });
    } catch (err) {
        console.error('Error in /api/variations:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/chatbot', async (req, res) => {
    try {
        const { questions } = req.body;
        if (!questions || !Array.isArray(questions)) return res.status(400).json({ error: 'Questions array is required' });

        const responses = [];
        for (const question of questions) {
            const payload = {
                query: question,
                mode: 'mix',
                only_need_context: false,
                only_need_prompt: false,
                response_type: 'string',
                top_k: 10,
                hl_keywords: hl_keywords_mq,
                ll_keywords: ll_keywords_mq,
                conversation_history: [{"role": "user", "content": question}],
                history_turns: 1
            };

            try {
                console.log(`Querying chatbot API for: "${question.substring(0, 50)}..."`);
                const response = await axios.post('https://viktor.thws.education/query', payload, {
                    headers: {
                        'accept': 'application/json',
                        'X-API-Key': process.env.ENEFIT_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    timeout: 120000
                });

                let answer = 'No response';
                if (response.data) {
                    answer = response.data.response || response.data.answer || response.data.result || response.data.content || JSON.stringify(response.data);
                }

                responses.push({ question, answer, success: true });
            } catch (err) {
                console.error('Chatbot API error:', err.response?.status, JSON.stringify(err.response?.data, null, 2) || err.message);
                responses.push({ question, answer: 'Error: ' + (err.response?.data?.message || err.message), success: false });
            }
        }
        res.json({ responses });
    } catch (err) {
        console.error('Error in /api/chatbot:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/super-question', async (req, res) => {
    try {
        const { answers } = req.body;
        if (!answers || !Array.isArray(answers)) return res.status(400).json({ error: 'Answers array is required' });

        const answersText = answers.map((ans, idx) => `Answer ${idx + 1}:\n${ans}`).join('\n\n---\n\n');
        const prompt = MQ_SUPER_QUESTION_PROMPT.replace('{{ANSWERS}}', answersText);
        const url = `${azureEndpoint}openai/deployments/${azureDeployment}/chat/completions?api-version=${azureApiVersion}`;

        const response = await axios.post(url, {
            messages: [
                { role: 'system', content: 'You are an expert at analyzing information and creating comprehensive questions.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 1024
        }, {
            headers: {
                'Content-Type': 'application/json',
                'api-key': azureSubscriptionKey
            }
        });

        const modelText = response.data?.choices?.[0]?.message?.content;
        let parsed;
        try {
            parsed = JSON.parse(modelText);
        } catch (e) {
            const maybeJson = modelText.match(/\{[\s\S]*\}/);
            if (maybeJson) parsed = JSON.parse(maybeJson[0]);
            else throw new Error('Model did not return valid JSON');
        }

        res.json(parsed);
    } catch (err) {
        console.error('Error in /api/super-question:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// VALERI Phase 1 pipeline endpoints
app.post('/api/valeri/phase1/init', requireAuth, requireCompany, async (req, res) => {
    try {
        const {
            idea,
            boundaries,
            capex,
            opex,
            lifetime,
            subsidies,
            qualitative
        } = req.body || {};

        const inputData = { idea, boundaries, capex, opex, lifetime, subsidies, qualitative };
        const quality = assessPhase1InputQuality(inputData);

        if (!quality.isUsable) {
            // Создаём сессию даже при плохом качестве, чтобы пользователь мог уточнить
            const knowledgePack = makePhase1KnowledgePack();
            const sessionId = `p1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const session = {
                sessionId,
                companyId: req.session.user.companyId,
                idea,
                boundaries,
                capex,
                opex,
                lifetime,
                subsidies,
                qualitative,
                knowledgePack,
                status: 'awaiting_input_clarification',
                clarificationAttempt: 1,
                loopCount: 0,
                maxLoops: 3,
                projectBrief: {},
                currentEffects: {},
                unresolvedGaps: [],
                history: [{ type: 'init', status: 'requires_better_input', quality }]
            };
            PHASE1_SESSIONS.set(sessionId, session);

            const clarificationQuestions = [
                { id: 'CQ1', question: 'Welche Systemgrenzen sollen bewertet werden? (z.B. nur eine Maschine, ganze Produktionslinie oder ganzes Gebaeude)?', why_it_matters: 'Definiert den genauen Perimeter der Bewertung für korrekte Effekt-Identifikation', category: 'energy' },
                { id: 'CQ2', question: 'Welche CAPEX-Positionen sind enthalten? (Anschaffung, Planung, Montage, Inbetriebnahme, Schulung, Entsorgung alter Anlagen)', why_it_matters: 'Vollstaendige Investitionskosten sind essentiell fuer die Bewertung', category: 'financial' },
                { id: 'CQ3', question: 'Wie veraendern sich die jaehrlichen Betriebskosten konkret? (Bitte mit Zahlen: Wartung, Personal, Materialien, Energie)', why_it_matters: 'OPEX-Veraenderungen sind der Kern der Rentabilitaetsberechnung', category: 'financial' },
                { id: 'CQ4', question: 'Welche qualitativen Vorteile erwarten Sie? (z.B. Zuverlässigkeit, weniger Ausfallzeiten, bessere Arbeitsbedingungen, ESG-Compliance)', why_it_matters: 'Nicht-monetäre Effekte sind zentral fuer vollstaendige Bewertung nach VALERI', category: 'other' }
            ];

            return res.status(422).json({
                sessionId,
                error: 'Eingabequalitaet zu niedrig fuer zuverlaessige Phase 1 Analyse. Bitte beant worten Sie folgende Klaerungsfragen:',
                status: 'requires_better_input',
                quality,
                guidance: [
                    'Alle 7 Eingabefelder sollten mit mindestens 15 Zeichen gefuellt sein.',
                    'Systemgrenzen: Definieren Sie klar, was in die Bewertung einbezogen wird.',
                    'CAPEX: Alle Kostenpositionen aufzaehlen (Beschaffung, Planung, Montage, Schulung).',
                    'OPEX: Veraenderungen bei Wartung, Personal, Materialkosten quantifizieren.',
                    'Lebensdauer: Technische Lebensdauer und Inbetriebnahmezeitpunkt angeben.',
                    'Subventionen: Erwartete Foerderungen und Steuererleichterungen aufzaehlen.',
                    'Qualitativ: Nicht-monetaere Effekte wie Zuverlaessigkeit, Sicherheit, ESG nennen.'
                ],
                followUpQuestions: clarificationQuestions
            });
        }

        const knowledgePack = makePhase1KnowledgePack();
        const url = `${azureEndpoint}openai/deployments/${azureDeployment}/chat/completions?api-version=${azureApiVersion}`;
        
        const completeInput = `
**Projektidee (Kurzbeschreibung):**
${idea || '(nicht angegeben)'}

**Systemgrenzen (System Boundaries):**
${boundaries || '(nicht angegeben)'}

**Investitionskosten (CAPEX) - komplette Struktur:**
${capex || '(nicht angegeben)'}

**Betriebskostenänderungen (OPEX):**
${opex || '(nicht angegeben)'}

**Lebensdauer und Zeitintervalle:**
${lifetime || '(nicht angegeben)'}

**Steuern, Subventionen und Quoten:**
${subsidies || '(nicht angegeben)'}

**Qualitative (nicht-monetäre) Effekte:**
${qualitative || '(nicht angegeben)'}
`;

        const prompt = `Sie sind der Phase 1 Analyst fuer VALERI (Identifikation von Vorteilen & Belastungen).

Aufgabe:
1) Strukturieren Sie die Projektidee in ein kuerzeres Projektbriefing.
2) Identifizieren Sie Effekte in genau drei Kategorien:
   - energy_flow_effects (Energiefluss-Effekte)
   - additional_financial_effects (Zusaetzliche Finanzeffekte)
   - other_effects (Sonstige Effekte)
3) Finden Sie Informationslücken und erstellen Sie Rückfragen für Unklarheiten.
4) Referenzen: Nutzen Sie nur IDs aus dem Knowledge Pack.

Regeln:
- Unterscheiden Sie deutlich Vorteile vs. Belastungen.
- "other_effects" muss über direkte finanzielle Auswirkungen hinausgehen.
- Nutzen Sie die bereitgestellten Eingaben vollständig.
- Fragen Sie praktische Fragen, die ein KMU beantworten kann.
- IMMER DEUTSCH ANTWORTEN!

Knowledge Pack:
${JSON.stringify(knowledgePack, null, 2)}

Vollständige Projektinformationen:
${completeInput}

Antwortelaboriertes JSON mit folgendem Schema:
{
  "project_brief": {
    "investment_objective": "string",
    "current_state": "string",
    "target_state": "string",
    "system_boundaries": "string",
    "assumptions": ["string"]
  },
  "initial_effects": {
    "energy_flow_effects": [{"name":"string","type":"benefit|burden","reason":"string"}],
    "additional_financial_effects": [{"name":"string","type":"benefit|burden","reason":"string"}],
    "other_effects": [{"name":"string","type":"benefit|burden","reason":"string"}]
  },
  "gaps": ["string"],
  "follow_up_questions": [{"id":"Q1","question":"string","why_it_matters":"string","category":"energy|financial|other"}],
  "references": [{"id":"DIN_EN_17463_VALERI_CORE","reason":"string"}]
}`;

        const response = await axios.post(url, {
            messages: [
                { role: 'system', content: 'Sie antworten ausschliesslich in gueltigem JSON auf Deutsch.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.25,
            max_tokens: 2200
        }, {
            headers: {
                'Content-Type': 'application/json',
                'api-key': azureSubscriptionKey
            }
        });

        const parsed = safeParseJsonFromModel(response.data?.choices?.[0]?.message?.content);
        const sessionId = `p1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        // Hard-coded follow-up questions
        const hardcodedFollowUpQuestions = [
            {
                id: 'Q1',
                question: 'Wie definieren Sie die physischen und technischen Grenzen dieser Bewertung? (Bezieht sich die Maßnahme nur auf eine einzelne Maschine, eine gesamte Produktionslinie oder das komplette Gebäude?)',
                why_it_matters: 'Systemgrenzen (Systemgrenzen) - Um den direkten Einfluss der Investition präzise zu bestimmen',
                category: 'energy'
            },
            {
                id: 'Q2',
                question: 'Wie hoch sind die Anschaffungskosten für die Hauptkomponenten/Anlagen?',
                why_it_matters: 'Investitionskosten (CAPEX) - Vollständige Erfassung aller einmaligen Ausgaben',
                category: 'financial'
            },
            {
                id: 'Q3',
                question: 'Welche Kosten fallen für die Projektierung, Planung und Genehmigung an?',
                why_it_matters: 'Investitionskosten (CAPEX) - Vollständige Erfassung aller einmaligen Ausgaben',
                category: 'financial'
            },
            {
                id: 'Q4',
                question: 'Wie hoch sind die Kosten für Montage, Installation und die Inbetriebnahme?',
                why_it_matters: 'Investitionskosten (CAPEX) - Vollständige Erfassung aller einmaligen Ausgaben',
                category: 'financial'
            },
            {
                id: 'Q5',
                question: 'Welche Kosten entstehen durch den Rückbau und die fachgerechte Entsorgung von Altanlagen?',
                why_it_matters: 'Investitionskosten (CAPEX) - Vollständige Erfassung aller einmaligen Ausgaben',
                category: 'financial'
            },
            {
                id: 'Q6',
                question: 'Sind Budgetmittel für die Schulung des Personals im Umgang mit der neuen Technik eingeplant?',
                why_it_matters: 'Investitionskosten (CAPEX) - Vollständige Erfassung aller einmaligen Ausgaben',
                category: 'financial'
            },
            {
                id: 'Q7',
                question: 'Wie verändern sich die jährlichen Kosten für Instandhaltung, Wartung und Ersatzteile? (Steigen oder sinken diese im Vergleich zum Ist-Zustand?)',
                why_it_matters: 'Betriebliche Änderungen (OPEX) - Vergleich der jährlichen Betriebskosten gegenüber dem Referenzfall (Business-as-usual)',
                category: 'financial'
            },
            {
                id: 'Q8',
                question: 'Welche Auswirkungen hat die Investition auf die Personalkosten? (Wird mehr/weniger Personal benötigt oder ist eine höhere Qualifikationsstufe erforderlich?)',
                why_it_matters: 'Betriebliche Änderungen (OPEX) - Vergleich der jährlichen Betriebskosten gegenüber dem Referenzfall (Business-as-usual)',
                category: 'financial'
            },
            {
                id: 'Q9',
                question: 'Gibt es Veränderungen bei den Kosten für Hilfs- und Betriebsstoffe? (z. B. Schmierstoffe, Filter, chemische Reagenzien)',
                why_it_matters: 'Betriebliche Änderungen (OPEX) - Vergleich der jährlichen Betriebskosten gegenüber dem Referenzfall (Business-as-usual)',
                category: 'financial'
            },
            {
                id: 'Q10',
                question: 'Wie hoch ist die kalkulatorische Nutzungsdauer der Investition (technische Lebensdauer)?',
                why_it_matters: 'Nutzungsdauer und Zeitplan (Nutzungsdauer & Zeiträume) - Grundlage für die Berechnung der Wirtschaftlichkeit',
                category: 'financial'
            },
            {
                id: 'Q11',
                question: 'Wann ist der voraussichtliche Zeitpunkt der Inbetriebnahme (Start des Betrachtungszeitraums)?',
                why_it_matters: 'Nutzungsdauer und Zeitplan (Nutzungsdauer & Zeiträume) - Grundlage für die Berechnung der Wirtschaftlichkeit',
                category: 'financial'
            },
            {
                id: 'Q12',
                question: 'Werden für dieses Projekt staatliche Fördermittel oder Zuschüsse erwartet oder beantragt?',
                why_it_matters: 'Steuern, Förderungen und Quoten (Steuern & Förderungen) - Externe finanzielle Einflussfaktoren',
                category: 'financial'
            },
            {
                id: 'Q13',
                question: 'Hat das Projekt Auswirkungen auf CO2-Abgaben oder andere umweltbezogene Steuern und Zertifikate?',
                why_it_matters: 'Steuern, Förderungen und Quoten (Steuern & Förderungen) - Externe finanzielle Einflussfaktoren',
                category: 'financial'
            },
            {
                id: 'Q14',
                question: 'Führt die Maßnahme zu einer höheren Ausfallsicherheit und einer Reduzierung von Stillstandsrisiken?',
                why_it_matters: 'Qualitative (nicht-monetäre) Effekte - Bewertung von Faktoren, die schwer direkt in Euro auszudrücken sind',
                category: 'other'
            },
            {
                id: 'Q15',
                question: 'Wie verbessern sich die Arbeitsbedingungen durch die Investition? (z. B. Reduzierung von Lärm, bessere Beleuchtung, Optimierung der Raumtemperatur)',
                why_it_matters: 'Qualitative (nicht-monetäre) Effekte - Bewertung von Faktoren, die schwer direkt in Euro auszudrücken sind',
                category: 'other'
            },
            {
                id: 'Q16',
                question: 'Welchen positiven Einfluss hat das Projekt auf das Unternehmensimage oder das ESG-Rating (Umwelt, Soziales, Unternehmensführung)?',
                why_it_matters: 'Qualitative (nicht-monetäre) Effekte - Bewertung von Faktoren, die schwer direkt in Euro auszudrücken sind',
                category: 'other'
            }
        ];
        
        const session = {
            sessionId,
            companyId: req.session.user.companyId,
            idea,
            boundaries,
            capex,
            opex,
            lifetime,
            subsidies,
            qualitative,
            knowledgePack,
            loopCount: 1,
            maxLoops: 3,
            projectBrief: parsed.project_brief || {},
            currentEffects: parsed.initial_effects || {},
            unresolvedGaps: parsed.gaps || [],
            history: [{ type: 'init', input: inputData, output: parsed }]
        };
        PHASE1_SESSIONS.set(sessionId, session);

        return res.json({
            sessionId,
            loopCount: session.loopCount,
            maxLoops: session.maxLoops,
            projectBrief: session.projectBrief,
            currentEffects: session.currentEffects,
            gaps: session.unresolvedGaps,
            followUpQuestions: hardcodedFollowUpQuestions,
            references: parsed.references || []
        });
    } catch (error) {
        console.error('Error in /api/valeri/phase1/init:', error.message);
        return res.status(500).json({ error: 'Phase 1 Initialisierung fehlgeschlagen', details: error.message });
    }
});

app.post('/api/valeri/phase1/refine', requireAuth, requireCompany, async (req, res) => {
    try {
        const { sessionId, answers } = req.body || {};
        if (!sessionId || !Array.isArray(answers) || answers.length === 0) {
            return res.status(400).json({ error: 'sessionId und nicht-leere answers[] erforderlich' });
        }

        const session = PHASE1_SESSIONS.get(sessionId);
        if (!session || session.companyId !== req.session.user.companyId) {
            return res.status(404).json({ error: 'Phase 1 Sitzung nicht gefunden' });
        }

        // Спец-обработка для "awaiting_input_clarification" статуса
        if (session.status === 'awaiting_input_clarification') {
            // Обновляем исходные поля на основе ответов на уточняющие вопросы
            const answerMap = {};
            answers.forEach(a => {
                answerMap[compactText(a.id).toLowerCase()] = compactText(a.answer);
            });

            // Применяем ответы к соответствующим полям
            if (answerMap.cq1) session.boundaries = answerMap.cq1;
            if (answerMap.cq2) session.capex = answerMap.cq2;
            if (answerMap.cq3) session.opex = answerMap.cq3;
            if (answerMap.cq4) session.qualitative = answerMap.cq4;

            // Пересчитываем качество с обновленными полями
            const updatedQuality = assessPhase1InputQuality({
                idea: session.idea,
                boundaries: session.boundaries,
                capex: session.capex,
                opex: session.opex,
                lifetime: session.lifetime,
                subsidies: session.subsidies,
                qualitative: session.qualitative
            });

            session.clarificationAttempt = (session.clarificationAttempt || 0) + 1;
            session.history.push({
                type: 'clarification_attempt',
                attempt: session.clarificationAttempt,
                answers,
                qualityAfter: updatedQuality
            });

            // Если качество ВСЕ ЕЩЕ плохо И не превышен лимит попыток
            if (!updatedQuality.isUsable && session.clarificationAttempt < 2) {
                // Генерируем НОВЫЕ, более конкретные вопросы (не те же самые!)
                const followUpQuestions = [
                    { id: 'CQ1B', question: 'Beschreiben Sie bitte detaillierter: Welche GENAUEN Geraete/Anlagen sind betroffenen? (Modell, Hersteller, Jahrgang?)', why_it_matters: 'Präzise Spezifikation ermöglicht genaue Effekt-Bewertung', category: 'energy' },
                    { id: 'CQ2B', question: 'Bitte ALLE CAPEX-Kostengruppen einzeln aufzaehlen mit Betraegen (EUR): Beschaffung | Planung | Montage | Inbetriebnahme | Schulung | Entsorgung | Sonstiges', why_it_matters: 'Jeder EUR-Betrag beeinflusst NPV und Rentabilitaet', category: 'financial' },
                    { id: 'CQ3B', question: 'Wie hoch sind KONKRET die jaehrlichen Einsparungen / Mehrkosten? (z.B. Stromkosten: -50.000 EUR/Jahr, Wartung: +2.000 EUR/Jahr)', why_it_matters: 'Quantifizierung ist zwingend fuer Feasibility', category: 'financial' },
                    { id: 'CQ4B', question: 'Neben Betriebskosten: Gibt es Produkt-Qualitaetsverbesserungen, weniger Ausfallzeiten, bessere Arbeitssicherheit, oder ESG-Vorteile?', why_it_matters: 'Diese "Other Effects" sind oft unterschaetzt in Investitionsrechnungen', category: 'other' }
                ];

                PHASE1_SESSIONS.set(sessionId, session);

                return res.status(422).json({
                    sessionId,
                    error: 'Eingabequalitaet bisher noch nicht ausreichend. Bitte noch konkreter antworten:',
                    status: 'requires_better_input_retry',
                    clarificationAttempt: session.clarificationAttempt,
                    quality: updatedQuality,
                    followUpQuestions
                });
            }

            // Если качество ТЕПЕРЬ ausreichend ODER max попыток достигнуто
            // -> Начинаем нормальный Phase 1 анализ с обновленными данными
            session.status = 'analyzing'; // Переходим к нормальному анализу
        }

        // Это либо нормальный refine, либо мы уже обновили данные выше
        const normalizedAnswers = answers
            .map(a => ({ id: compactText(a.id), answer: compactText(a.answer) }))
            .filter(a => a.id && a.answer);
        if (!normalizedAnswers.length) {
            return res.status(400).json({ error: 'Keine gültigen Antworten bereitgestellt.' });
        }

        const url = `${azureEndpoint}openai/deployments/${azureDeployment}/chat/completions?api-version=${azureApiVersion}`;
        
        // Собираем историю уже заданных вопросов  (включая hard-coded clarification вопросы)
        const previousQuestions = [];
        
        // Если это clearification попытка - добавляем hard-coded clarification вопросы
        if (session.clarificationAttempt) {
            if (session.clarificationAttempt === 1) {
                previousQuestions.push(
                    'CQ1: Welche Systemgrenzen sollen bewertet werden?',
                    'CQ2: Welche zusaetzlichen CAPEX-Kostengruppen?',
                    'CQ3: Wie viel OPEX-Vorteil pro Jahr konkret?',
                    'CQ4: Welche nicht-monetaeren Vorteile erwarten Sie?'
                );
            } else if (session.clarificationAttempt >= 2) {
                previousQuestions.push(
                    'CQ1: Welche Systemgrenzen sollen bewertet werden?',
                    'CQ2: Welche zusaetzlichen CAPEX-Kostengruppen?',
                    'CQ3: Wie viel OPEX-Vorteil pro Jahr konkret?',
                    'CQ4: Welche nicht-monetaeren Vorteile erwarten Sie?',
                    'CQ1B: Beschreiben Sie detaillierter: Welche GENAUEN Geraete/Anlagen sind betroffenen?',
                    'CQ2B: Bitte ALLE CAPEX-Kostengruppen einzeln aufzaehlen mit Betraegen',
                    'CQ3B: Wie hoch sind KONKRET die jaehrlichen Einsparungen / Mehrkosten?',
                    'CQ4B: Neben Betriebskosten: Gibt es Produkt-Qualitaetsverbesserungen?'
                );
            }
        }
        
        // Добавляем вопросы из истории
        session.history.forEach(h => {
            if (h.output && h.output.follow_up_questions) {
                previousQuestions.push(...h.output.follow_up_questions.map(q => `${q.id}: ${q.question}`));
            }
        });
        
        const previousQuestionsStr = previousQuestions.length > 0 
            ? `\n\nBEREITS GESTELLTE FRAGEN (NICHT WIEDERHOLEN - VOLLIG NEUE FRAGEN GENERIEREN!):\n${previousQuestions.join('\n')}`
            : '';
        
        const completeInput = `
**Projektidee:**
${session.idea || '(nicht angegeben)'}

**Systemgrenzen:**
${session.boundaries || '(nicht angegeben)'}

**Investitionskosten (CAPEX):**
${session.capex || '(nicht angegeben)'}

**Betriebskostenänderungen (OPEX):**
${session.opex || '(nicht angegeben)'}

**Lebensdauer:**
${session.lifetime || '(nicht angegeben)'}

**Steuern, Subventionen:**
${session.subsidies || '(nicht angegeben)'}

**Qualitative Effekte:**
${session.qualitative || '(nicht angegeben)'}
`;

        const prompt = `Sie setzen eine VALERI Phase 1 Analyse fort (Schleife ${session.loopCount} / ${session.maxLoops}).

WICHTIGSTE REGEL: Wenn Sie next_questions generieren, MÜSSEN diese VOLLIG ANDERS sein als die bereits gestellten Fragen!

Aufgabe:
1) Aktualisieren Sie die Effekte basierend auf den neuen Antworten und markieren Sie Konfidenz.
2) Identifizieren Sie, ob weitere Klarungen notwendig sind - ABER NUR FRAGEN DIE NOCH NICHT GESTELLT WURDEN.
3) Wenn nötig: Erstellen Sie gezielt (kurz, hoher Wert) NEUE Folgefragen - NICHT DIE ALTER WIEDERHOLEN.
4) Wenn keine kritischen Lücken ODER max. Schleife erreicht: Produzieren Sie finale konsolidierte Ausgabe.
5) Referenzen: Nutzen Sie nur IDs aus dem Knowledge Pack.

WICHTIG ZUM GENERIEREN VON "next_questions":
- Fokus auf Informationen die NICHT durch die folgenden Fragen abgedeckt wurden:
  - System Boundaries Definition
  - CAPEX-Kostengruppen Zerlegung
  - OPEX Kostenveraenderungen Quantifizierung
  - Qualitative nicht-monetaere Effekte
- Stattdessen fragen Sie nach: technischen Details, Risikoanalyse, Abhängigkeiten, Timing, regulatorischen Aspekten, Markteinflüssen, Konkurrenzeffekten, Supply-Chain, etc.${previousQuestionsStr}

Knowledge Pack:
${JSON.stringify(session.knowledgePack || makePhase1KnowledgePack(), null, 2)}

Komplette Projektinformationen:
${completeInput}

Aktuelles Projektbriefing:
${JSON.stringify(session.projectBrief, null, 2)}

Aktuelle Effekte:
${JSON.stringify(session.currentEffects, null, 2)}

Bekannte Lücken:
${JSON.stringify(session.unresolvedGaps, null, 2)}

Neue Antworten auf Rückfragen:
${JSON.stringify(normalizedAnswers, null, 2)}

Antwort in JSON mit diesem Schema (AUF DEUTSCH):
{
  "status": "needs_more_info|final",
  "updated_project_brief": {
    "investment_objective": "string",
    "current_state": "string",
    "target_state": "string",
    "system_boundaries": "string",
    "assumptions": ["string"]
  },
  "effects_matrix": {
    "energy_flow_effects": [{"name":"string","type":"benefit|burden","reason":"string","confidence":"low|medium|high"}],
    "additional_financial_effects": [{"name":"string","type":"benefit|burden","reason":"string","confidence":"low|medium|high"}],
    "other_effects": [{"name":"string","type":"benefit|burden","reason":"string","confidence":"low|medium|high"}]
  },
  "remaining_gaps": ["string"],
  "next_questions": [{"id":"QX","question":"string (VALLIG ANDERS ALS BEREITS GESTELLTE FRAGEN!)","why_it_matters":"string","category":"energy|financial|other"}],
  "synthesis": {
    "top_benefits": ["string"],
    "top_burdens": ["string"],
    "other_effects_highlights": ["string"],
    "recommended_next_data_to_collect": ["string"]
  },
  "references": [{"id":"string","reason":"string"}]
}`;

        const response = await axios.post(url, {
            messages: [
                { role: 'system', content: 'Sie antworten ausschliesslich in gueltigem JSON auf Deutsch.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 2400
        }, {
            headers: {
                'Content-Type': 'application/json',
                'api-key': azureSubscriptionKey
            }
        });

        const parsed = safeParseJsonFromModel(response.data?.choices?.[0]?.message?.content);

        session.loopCount += 1;
        session.projectBrief = parsed.updated_project_brief || session.projectBrief;
        session.currentEffects = parsed.effects_matrix || session.currentEffects;
        session.unresolvedGaps = parsed.remaining_gaps || [];
        session.history.push({ type: 'refine', input: normalizedAnswers, output: parsed });
        PHASE1_SESSIONS.set(sessionId, session);

        const forceFinal = session.loopCount > session.maxLoops;
        const status = forceFinal ? 'final' : (parsed.status || 'needs_more_info');
        
        // Hard-coded follow-up questions for deeper clarification in refinement rounds
        const hardcodedRefinementQuestions = [];
        if (status !== 'final' && session.loopCount < session.maxLoops) {
            hardcodedRefinementQuestions.push(
                {
                    id: 'RQ1',
                    question: 'Gibt es Abhängigkeiten zwischen verschiedenen Kostenelementen? (z.B. höhere Montagekosten beeinflussen Schulungskosten)',
                    why_it_matters: 'Risiken und Abhängigkeiten - Potenzielle Wechselwirkungen können Gesamtrentabilität erheblich beeinflussen',
                    category: 'financial'
                },
                {
                    id: 'RQ2',
                    question: 'Wie stabil ist die Energiepreisannahme? Was sind Best-Case und Worst-Case Szenarien?',
                    why_it_matters: 'Sensitivität und Risiken - Energiepreisvolatilität ist ein Haupttreiber für die Investitionsrentabilität',
                    category: 'financial'
                },
                {
                    id: 'RQ3',
                    question: 'Welche externen Risiken könnten das Projekt beeinflussen? (Lieferketten, Regulierung, Marktveränderungen)',
                    why_it_matters: 'Externe Risiken - Ermolicht robuste und realistische Finanzprognosen',
                    category: 'other'
                }
            );
        }

        return res.json({
            sessionId,
            loopCount: session.loopCount,
            maxLoops: session.maxLoops,
            status,
            projectBrief: session.projectBrief,
            effectsMatrix: session.currentEffects,
            remainingGaps: session.unresolvedGaps,
            nextQuestions: status === 'final' ? [] : hardcodedRefinementQuestions,
            synthesis: parsed.synthesis || {},
            references: parsed.references || []
        });
    } catch (error) {
        console.error('Error in /api/valeri/phase1/refine:', error.message);
        return res.status(500).json({ error: 'Phase 1 Verfeinerung fehlgeschlagen', details: error.message });
    }
});

app.post('/api/valeri/phase1/generate-examples', requireAuth, requireCompany, async (req, res) => {
    try {
        const { sessionId, questions } = req.body || {};
        if (!sessionId || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'sessionId and non-empty questions[] are required' });
        }

        const session = PHASE1_SESSIONS.get(sessionId);
        if (!session || session.companyId !== req.session.user.companyId) {
            return res.status(404).json({ error: 'Phase 1 session not found' });
        }

        // Fallback examples by category - generated locally if API fails
        const fallbackExamples = {
            energy: 'Aktuell betreiben wir zwei gasbeheizte Oefen mit ca. 420.000 kWh/Jahr und planen den Ersatz durch eine Waermepumpe. Laufzeit 4.500 h/Jahr, erwartete Stromeinsparung in Spitzenzeiten und geringerer Gasverbrauch.',
            financial: 'Investition ca. 320.000 EUR, jaehrliche Wartung +8.000 EUR, erwartete Energiekosteneinsparung 55.000 EUR/Jahr, moegliche Produktionsunterbrechung waehrend Umbau 3 Tage.',
            other: 'Wir erwarten bessere Versorgungssicherheit, weniger Stoerfaelle, stabilere Produktqualitaet, geringere CO2-Emissionen und positive Wirkung auf Kundenanforderungen und ESG-Reporting.'
        };

        try {
            const url = `${azureEndpoint}openai/deployments/${azureDeployment}/chat/completions?api-version=${azureApiVersion}`;
            const questionsStr = questions.map(q => `- [${q.category || 'other'}] ${q.id}: ${q.question}`).join('\n');

            const projectBriefStr = session.projectBrief ? JSON.stringify(session.projectBrief, null, 2) : '{}';
            const currentEffectsStr = session.currentEffects ? JSON.stringify(session.currentEffects, null, 2) : '{}';
            const ideaStr = session.idea || 'Keine Idee angegeben';

            const prompt = `Sie sind ein Berater, der realistische Beispielantworten fuer einen VALERI Phase 1 Fragebogen bereitstellt.

Basierend auf dem Projektbriefing und den aktuell verstandenen Effekten, geben Sie praktische, realistische Beispielantworten, die ein KMU-Manager geben könnte. Machen Sie sie spezifisch, aber generisch genug, um das erwartete Format zu zeigen.

Projektbriefing:
${projectBriefStr}

Aktuelle Effekte:
${currentEffectsStr}

Fragen, fuer die Sie Beispiele bereitstellen sollten:
${questionsStr}

Antworten in JSON mit diesem Schema (AUF DEUTSCH):
{
  "examples": [
    {"id": "Q1", "exampleAnswer": "string - eine realistische, praktische Beispielantwort"},
    {"id": "Q2", "exampleAnswer": "string"},
    ...
  ]
}

Machen Sie Antworten:
- Konkret und spezifisch (mit Zahlen/Zeitrahmen wo relevant)
- Realistisch fuer ein typisches Industrie-/Gewerbe-KMU
- Direkt responsiv auf die Frage
- Max 1-2 Saetze`;

            const response = await axios.post(url, {
                messages: [
                    { role: 'system', content: 'Sie antworten ausschliesslich in gueltigem JSON auf Deutsch.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.25,
                max_tokens: 1400
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': azureSubscriptionKey
                }
            });

            const parsed = safeParseJsonFromModel(response.data?.choices?.[0]?.message?.content);
            if (parsed?.examples && Array.isArray(parsed.examples) && parsed.examples.length > 0) {
                return res.json({
                    examples: parsed.examples
                });
            }
            throw new Error('Invalid response from AI');
        } catch (aiError) {
            console.warn('Azure OpenAI failed, using fallback examples:', aiError.message);
            // Use fallback: generate examples based on category
            const examples = questions.map(q => ({
                id: q.id,
                exampleAnswer: fallbackExamples[q.category?.toLowerCase()] || fallbackExamples.other
            }));
            return res.json({ examples });
        }
    } catch (error) {
        console.error('Error in /api/valeri/phase1/generate-examples:', error.message);
        return res.status(500).json({ error: 'Fehler beim Generieren von Beispielantworten', details: error.message });
    }
});

// Route handlers for clean URLs
app.get('/', (req, res) => {
    return res.redirect('/accesspoint');
});

app.get('/home', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.htm'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.htm'));
});

app.get('/accesspoint', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.role === 'admin') {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'accesspoint.html'));
});

// VALERI Phase 7 pipeline endpoint: hard-coded Most Likely NPV + AI explanation
app.post('/api/valeri/phase7/calc-most-likely', requireAuth, requireCompany, async (req, res) => {
    try {
        const inputs = req.body || {};
        const calculation = calcPhase7MostLikelyNPV(inputs);

        // Summarize cashflows for the AI (keep prompt compact).
        const first3 = calculation.cashflowRows.slice(0, 3).map(r => ({
            year: r.year,
            totalCashFlow: Number(r.totalCashFlow.toFixed(2)),
            discountedCashFlow: Number(r.discountedCashFlow.toFixed(2))
        }));
        const last = calculation.cashflowRows[calculation.cashflowRows.length - 1];

        const decisionText = calculation.decision;
        const waccPct = (calculation.wacc * 100);
        const prompt = `You are a senior energy investment financial analyst.

Compute and interpret a VALERI Phase 7 valuation for the "Most Likely" case.

Hard inputs and calculation results (already computed):
- Initial investment I0: EUR ${calculation.I0.toFixed(2)}
- Discount rate (WACC): ${waccPct.toFixed(2)}% (decimal used in discounting: ${calculation.wacc})
- Service life (n): ${calculation.lifespanYears} years
- Decision rule: ${decisionText}
- NPV (EUR): ${calculation.npv.toFixed(2)}

Cash flow summary:
- First years: ${JSON.stringify(first3)}
- Last year: year ${last.year}, totalCashFlow EUR ${last.totalCashFlow.toFixed(2)}, discountedCashFlow EUR ${last.discountedCashFlow.toFixed(2)}

Explain the result for a KMU user in German engineering/consultancy tone:
1) What does the sign of NPV mean (based on the decision rule)?
2) Which drivers matter most (discount rate, energy price trend, degradation, CAPEX, maintenance savings, replacement, scrap/subsidy).
3) Provide a short recommendation statement aligned to the decision rule.
4) Be precise and avoid fabricating numbers not given.

Return ONLY plain text (no JSON).`;

        const url = `${azureEndpoint}openai/deployments/${azureDeployment}/chat/completions?api-version=${azureApiVersion}`;
        const response = await axios.post(url, {
            messages: [
                { role: 'system', content: 'You provide concise, professional financial interpretation for investment decisions.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.25,
            max_tokens: 750
        }, {
            headers: {
                'Content-Type': 'application/json',
                'api-key': azureSubscriptionKey
            }
        });

        const explanation = response.data?.choices?.[0]?.message?.content || '';
        return res.json({
            inputs,
            calculation,
            explanation
        });
    } catch (error) {
        console.error('Error in /api/valeri/phase7/calc-most-likely:', error.message);
        return res.status(400).json({ error: 'Phase 7 calculation failed', details: error.message });
    }
});

// Phase 8: Sensitivity Analysis
app.post('/api/valeri/phase8/sensitivity-analysis', requireAuth, requireCompany, async (req, res) => {
    try {
        const {
            baselineInputs,
            baselineCalculation,
            energyPriceLow,
            energyPriceHigh,
            discountRateLow,
            discountRateHigh,
            energySavingsLow,
            energySavingsHigh,
            priceTrendLow,
            priceTrendHigh,
            degradationLow,
            degradationHigh,
            capexLow,
            capexHigh
        } = req.body;

        const baseNpv = baselineCalculation.npv;
        const tornadoData = [];
        const detailedResults = [];

        // 1. Energy Price Sensitivity
        const energyPriceBase = baselineInputs.energyPriceBase || 0.25;
        const calcWithEnergyPrice = (newPrice) => {
            const modifiedInputs = { ...baselineInputs, energyPriceBase: newPrice };
            return calcPhase7MostLikelyNPV(modifiedInputs).npv;
        };
        const npvLowEnergy = calcWithEnergyPrice(energyPriceLow);
        const npvHighEnergy = calcWithEnergyPrice(energyPriceHigh);
        tornadoData.push({
            parameter: 'Energiepreis',
            negativeImpact: baseNpv - npvLowEnergy,
            positiveImpact: npvHighEnergy - baseNpv,
            totalImpact: npvHighEnergy - npvLowEnergy
        });
        detailedResults.push({
            parameter: 'Energiepreis (EUR/kWh)',
            baselineValue: energyPriceBase.toFixed(4),
            lowValue: energyPriceLow.toFixed(4),
            lowNpvDelta: npvLowEnergy - baseNpv,
            highValue: energyPriceHigh.toFixed(4),
            highNpvDelta: npvHighEnergy - baseNpv,
            totalImpact: npvHighEnergy - npvLowEnergy
        });

        // 2. Discount Rate (WACC) Sensitivity
        const calcWithDiscountRate = (discountRatePct) => {
            const discountRateDecimal = discountRatePct / 100;
            const modifiedInputs = { ...baselineInputs };
            // Recalculate WACC components to achieve target discount rate
            // For simplicity, we vary equitySharePct * costOfEquityPct + debtSharePct * interestRateDebtPct
            const n = baselineCalculation.lifespanYears;
            const I0 = baselineCalculation.I0;
            let npv = -I0;
            
            for (let t = 1; t <= n; t++) {
                const energyQuantityFactor = Math.pow(1 - (baselineInputs.technicalDegradationPct || 0) / 100, t - 1);
                const energyPriceFactor = Math.pow(1 + (baselineInputs.priceTrendPct || 0) / 100, t - 1);
                const kwhSavedT = (baselineInputs.annualEnergySavedKwh || 0) * energyQuantityFactor;
                const energyBenefitT = kwhSavedT * (baselineInputs.energyPriceBase || 0) * energyPriceFactor;
                const maintenanceBenefitT = baselineInputs.maintenanceSavingsPerYear || 0;
                const subsidyT = t === 1 ? (baselineInputs.subsidyYear1 || 0) : 0;
                const replacementCostT = t === (baselineInputs.replacementYear || 10) ? (baselineInputs.replacementCost || 0) : 0;
                const scrapValueT = t === n ? (baselineInputs.scrapValue || 0) : 0;
                
                const Ct = energyBenefitT + maintenanceBenefitT + subsidyT - replacementCostT + scrapValueT;
                const discounted = Ct / Math.pow(1 + discountRateDecimal, t);
                npv += discounted;
            }
            return npv;
        };
        const npvLowRate = calcWithDiscountRate(discountRateLow);
        const npvHighRate = calcWithDiscountRate(discountRateHigh);
        const currentDiscountRatePct = baselineCalculation.wacc * 100;
        tornadoData.push({
            parameter: 'Diskontierungssatz',
            negativeImpact: npvHighRate - baseNpv,
            positiveImpact: baseNpv - npvLowRate,
            totalImpact: baseNpv - npvLowRate + (npvHighRate - baseNpv)
        });
        detailedResults.push({
            parameter: 'Diskontierungssatz (% p.a.)',
            baselineValue: currentDiscountRatePct.toFixed(2) + '%',
            lowValue: discountRateLow.toFixed(2) + '%',
            lowNpvDelta: npvLowRate - baseNpv,
            highValue: discountRateHigh.toFixed(2) + '%',
            highNpvDelta: npvHighRate - baseNpv,
            totalImpact: Math.abs(npvHighRate - npvLowRate)
        });

        // 3. Energy Savings Sensitivity
        const calcWithEnergySavings = (newKwh) => {
            const modifiedInputs = { ...baselineInputs, annualEnergySavedKwh: newKwh };
            return calcPhase7MostLikelyNPV(modifiedInputs).npv;
        };
        const npvLowSavings = calcWithEnergySavings(energySavingsLow);
        const npvHighSavings = calcWithEnergySavings(energySavingsHigh);
        const baselineEnergy = baselineInputs.annualEnergySavedKwh || 1000;
        tornadoData.push({
            parameter: 'Energieeinsparung',
            negativeImpact: baseNpv - npvLowSavings,
            positiveImpact: npvHighSavings - baseNpv,
            totalImpact: npvHighSavings - npvLowSavings
        });
        detailedResults.push({
            parameter: 'Energieeinsparung (kWh/Jahr)',
            baselineValue: baselineEnergy.toFixed(0),
            lowValue: energySavingsLow.toFixed(0),
            lowNpvDelta: npvLowSavings - baseNpv,
            highValue: energySavingsHigh.toFixed(0),
            highNpvDelta: npvHighSavings - baseNpv,
            totalImpact: npvHighSavings - npvLowSavings
        });

        // 4. Price Trend Sensitivity
        const calcWithPriceTrend = (newTrendPct) => {
            const modifiedInputs = { ...baselineInputs, priceTrendPct: newTrendPct };
            return calcPhase7MostLikelyNPV(modifiedInputs).npv;
        };
        const npvLowTrend = calcWithPriceTrend(priceTrendLow);
        const npvHighTrend = calcWithPriceTrend(priceTrendHigh);
        const baselineTrend = baselineInputs.priceTrendPct || 2;
        tornadoData.push({
            parameter: 'Preistrend',
            negativeImpact: baseNpv - npvLowTrend,
            positiveImpact: npvHighTrend - baseNpv,
            totalImpact: npvHighTrend - npvLowTrend
        });
        detailedResults.push({
            parameter: 'Energiepreistrend (% p.a.)',
            baselineValue: baselineTrend.toFixed(2) + '%',
            lowValue: priceTrendLow.toFixed(2) + '%',
            lowNpvDelta: npvLowTrend - baseNpv,
            highValue: priceTrendHigh.toFixed(2) + '%',
            highNpvDelta: npvHighTrend - baseNpv,
            totalImpact: npvHighTrend - npvLowTrend
        });

        // 5. Technical Degradation Sensitivity
        const calcWithDegradation = (newDegradationPct) => {
            const modifiedInputs = { ...baselineInputs, technicalDegradationPct: newDegradationPct };
            return calcPhase7MostLikelyNPV(modifiedInputs).npv;
        };
        const npvLowDegradation = calcWithDegradation(degradationLow);
        const npvHighDegradation = calcWithDegradation(degradationHigh);
        const baselineDegradation = baselineInputs.technicalDegradationPct || 0.5;
        tornadoData.push({
            parameter: 'Degradation',
            negativeImpact: baseNpv - npvHighDegradation,
            positiveImpact: baseNpv - npvLowDegradation,
            totalImpact: (baseNpv - npvHighDegradation) + (baseNpv - npvLowDegradation)
        });
        detailedResults.push({
            parameter: 'Technische Degradation (% p.a.)',
            baselineValue: baselineDegradation.toFixed(2) + '%',
            lowValue: degradationLow.toFixed(2) + '%',
            lowNpvDelta: npvLowDegradation - baseNpv,
            highValue: degradationHigh.toFixed(2) + '%',
            highNpvDelta: npvHighDegradation - baseNpv,
            totalImpact: (baseNpv - npvLowDegradation) - (baseNpv - npvHighDegradation)
        });

        // 6. CAPEX Sensitivity
        const calcWithCapex = (newCapex) => {
            const modifiedInputs = { ...baselineInputs };
            // Adjust CAPEX by modifying equipment cost (simplified)
            const currentCapex = baselineCalculation.I0 || 20000;
            const capexRatio = newCapex / currentCapex;
            modifiedInputs.capexEquipment = (baselineInputs.capexEquipment || 0) * capexRatio;
            return calcPhase7MostLikelyNPV(modifiedInputs).npv;
        };
        const npvLowCapex = calcWithCapex(capexLow);
        const npvHighCapex = calcWithCapex(capexHigh);
        const baselineCapex = baselineCalculation.I0;
        tornadoData.push({
            parameter: 'Anfangsinvestition',
            negativeImpact: baseNpv - npvHighCapex,
            positiveImpact: baseNpv - npvLowCapex,
            totalImpact: (baseNpv - npvLowCapex) + (baseNpv - npvHighCapex)
        });
        detailedResults.push({
            parameter: 'Anfangsinvestition (EUR)',
            baselineValue: baselineCapex.toFixed(0),
            lowValue: capexLow.toFixed(0),
            lowNpvDelta: npvLowCapex - baseNpv,
            highValue: capexHigh.toFixed(0),
            highNpvDelta: npvHighCapex - baseNpv,
            totalImpact: Math.abs(npvHighCapex - npvLowCapex)
        });

        // Generate interpretation
        const mostSensitiveIdx = tornadoData.reduce((maxIdx, item, idx, arr) => 
            item.totalImpact > arr[maxIdx].totalImpact ? idx : maxIdx, 0);
        const mostSensitive = tornadoData[mostSensitiveIdx];

        const formatEur = (n) => '€ ' + n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        const worstCaseNpv = Math.min(npvLowRate, npvLowSavings, npvHighDegradation, npvHighCapex, npvLowTrend);
        const bestCaseNpv = Math.max(npvHighRate, npvHighSavings, npvLowDegradation, npvLowCapex, npvHighTrend);

        const interpretation = `Die Sensitivitätsanalyse zeigt, dass ${mostSensitive.parameter.toLowerCase()} den größten Einfluss auf den NPV hat, mit einer Spannweite von ${formatEur(mostSensitive.totalImpact)}. 

Die Ergebnisse deuten darauf hin, dass:
1. Der NPV bei ungünstigen Szenarien bis zu ${formatEur(worstCaseNpv)} betragen könnte.
2. Der NPV bei günstigen Szenarien bis zu ${formatEur(bestCaseNpv)} erreichen könnte.
3. Die kritischsten Treiber sind diejenigen, die die größten Spannweiten zeigen.

Empfehlung: Fokussieren Sie Ihre Risikominderungsmaßnahmen auf die Parameter mit den höchsten Sensitivitäten, insbesondere ${mostSensitive.parameter}. Sammeln Sie bessere Daten für diese Unsicherheiten und erwägen Sie Hedging-Strategien.`;

        return res.json({
            tornadoData,
            detailedResults,
            interpretation
        });
    } catch (error) {
        console.error('Error in /api/valeri/phase8/sensitivity-analysis:', error.message);
        return res.status(400).json({ error: 'Sensitivity analysis failed', details: error.message });
    }
});

// Save Phase 7 result to user account
app.post('/api/valeri/phase7/save-result', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const companyId = req.session.user.companyId;
        const { name, inputs, calculation, explanation } = req.body;

        if (!name || !inputs || !calculation) {
            return res.status(400).json({ error: 'Missing required fields: name, inputs, calculation' });
        }

        // Load existing phase 7 results
        let results = await loadData(PHASE7_RESULTS_FILE, []);

        // Create new result entry
        const resultEntry = {
            id: crypto.randomUUID(),
            userId,
            companyId,
            name,
            inputs,
            calculation,
            explanation: explanation || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Add to results array
        results.push(resultEntry);

        // Save to file
        await saveData(PHASE7_RESULTS_FILE, results);

        return res.json({
            success: true,
            resultId: resultEntry.id,
            message: 'Phase 7 result saved successfully'
        });
    } catch (error) {
        console.error('Error saving Phase 7 result:', error.message);
        return res.status(400).json({ error: 'Failed to save Phase 7 result', details: error.message });
    }
});

// Get all Phase 7 results for logged-in user
app.get('/api/valeri/phase7/user-results', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const results = await loadData(PHASE7_RESULTS_FILE, []);

        // Filter results for current user
        const userResults = results.filter(r => r.userId === userId);

        return res.json({
            success: true,
            count: userResults.length,
            results: userResults
        });
    } catch (error) {
        console.error('Error retrieving Phase 7 results:', error.message);
        return res.status(400).json({ error: 'Failed to retrieve Phase 7 results', details: error.message });
    }
});

// Get specific Phase 7 result by ID
app.get('/api/valeri/phase7/result/:resultId', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const resultId = req.params.resultId;
        const results = await loadData(PHASE7_RESULTS_FILE, []);

        // Find result and verify ownership
        const result = results.find(r => r.id === resultId && r.userId === userId);

        if (!result) {
            return res.status(404).json({ error: 'Result not found or access denied' });
        }

        return res.json({
            success: true,
            result
        });
    } catch (error) {
        console.error('Error retrieving Phase 7 result:', error.message);
        return res.status(400).json({ error: 'Failed to retrieve Phase 7 result', details: error.message });
    }
});

// Update Phase 7 result
app.put('/api/valeri/phase7/result/:resultId', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const resultId = req.params.resultId;
        const { name, inputs, calculation, explanation } = req.body;

        let results = await loadData(PHASE7_RESULTS_FILE, []);

        // Find and update result
        const resultIndex = results.findIndex(r => r.id === resultId && r.userId === userId);

        if (resultIndex === -1) {
            return res.status(404).json({ error: 'Result not found or access denied' });
        }

        // Update fields
        results[resultIndex].name = name || results[resultIndex].name;
        results[resultIndex].inputs = inputs || results[resultIndex].inputs;
        results[resultIndex].calculation = calculation || results[resultIndex].calculation;
        results[resultIndex].explanation = explanation !== undefined ? explanation : results[resultIndex].explanation;
        results[resultIndex].updatedAt = new Date().toISOString();

        // Save updates
        await saveData(PHASE7_RESULTS_FILE, results);

        return res.json({
            success: true,
            message: 'Phase 7 result updated successfully'
        });
    } catch (error) {
        console.error('Error updating Phase 7 result:', error.message);
        return res.status(400).json({ error: 'Failed to update Phase 7 result', details: error.message });
    }
});

// Delete Phase 7 result
app.delete('/api/valeri/phase7/result/:resultId', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const resultId = req.params.resultId;

        let results = await loadData(PHASE7_RESULTS_FILE, []);

        // Check if result exists and belongs to user
        const resultIndex = results.findIndex(r => r.id === resultId && r.userId === userId);

        if (resultIndex === -1) {
            return res.status(404).json({ error: 'Result not found or access denied' });
        }

        // Remove result
        results.splice(resultIndex, 1);

        // Save updates
        await saveData(PHASE7_RESULTS_FILE, results);

        return res.json({
            success: true,
            message: 'Phase 7 result deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting Phase 7 result:', error.message);
        return res.status(400).json({ error: 'Failed to delete Phase 7 result', details: error.message });
    }
});

// ==================== VALERI Projects Management Endpoints ====================

// Helper: Generate project name using AI
async function generateProjectName(idea, companyContext) {
    try {
        const prompt = `You are a project naming expert. Generate a concise, professional German project name for the following investment idea. 
        
Company Context: ${companyContext || 'Small/Medium Enterprise'}
Investment Idea: ${idea}
Current Date: ${new Date().toLocaleDateString('de-DE')}

Generate ONLY a short project name (max 60 characters) that combines the theme and date. Format: "Thema/Beschreibung (${new Date().getFullYear()})"
Respond with ONLY the project name, nothing else.`;

        const response = await openAiClient.createChatCompletion({
            model: process.env.OPENAI_DEPLOYMENT_ID || 'gpt-4',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 100
        });

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error generating project name:', error.message);
        // Fallback to simple naming scheme
        const dateStr = new Date().toLocaleDateString('de-DE');
        return `${idea.substring(0, 40)} (${dateStr})`.substring(0, 60);
    }
}

// POST /api/valeri/projects - Create new project from Phase 1
app.post('/api/valeri/projects', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const companyId = req.session.user.companyId;
        const { idea, phase1Data, companyName } = req.body;

        if (!idea || !phase1Data) {
            return res.status(400).json({ error: 'Missing required fields: idea, phase1Data' });
        }

        // Generate project name using AI
        const projectName = await generateProjectName(idea, companyName);

        // Create project ID
        const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create new project with structured format
        const project = createNewValeriProject(projectId, userId, companyId, projectName, idea);
        
        // Update phase1 with the completed data
        project.phases.phase1 = {
            status: 'completed',
            sessionId: phase1Data.sessionId || null,
            inputData: phase1Data.inputData || null,
            questions: phase1Data.questions || [],
            answers: phase1Data.answers || [],
            projectBrief: phase1Data.projectBrief || {},
            effectsMatrix: phase1Data.effectsMatrix || {},
            synthesis: phase1Data.synthesis || {},
            completedAt: new Date().toISOString()
        };
        
        // Unlock phase2 for next work
        project.phases.phase2.status = 'ready';
        project.currentPhase = 1; // Phase 1 completed
        
        // Save project to individual file
        const saveSuccess = await saveValeriProject(project);
        if (!saveSuccess) {
            return res.status(500).json({ error: 'Failed to save project' });
        }

        res.json({
            success: true,
            projectId,
            projectName,
            message: 'Project created and Phase 1 completed'
        });
    } catch (error) {
        console.error('Error creating project:', error.message);
        res.status(400).json({ error: 'Failed to create project', details: error.message });
    }
});

// POST /api/valeri/projects/:projectId/phase1/save-answers - Save Phase 1 answers
app.post('/api/valeri/projects/:projectId/phase1/save-answers', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const companyId = req.session.user.companyId;
        const projectId = req.params.projectId;
        const { questions, answers, projectBrief, effectsMatrix, synthesis } = req.body;

        const project = await loadValeriProject(userId, companyId, projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Validate phase - must be on phase 1
        if (project.currentPhase !== 0 && project.currentPhase !== 1) {
            return res.status(403).json({ error: 'Cannot modify Phase 1 data after moving to next phase' });
        }

        // Update phase 1 data
        project.phases.phase1.questions = questions || [];
        project.phases.phase1.answers = answers || [];
        project.phases.phase1.projectBrief = projectBrief || {};
        project.phases.phase1.effectsMatrix = effectsMatrix || {};
        project.phases.phase1.synthesis = synthesis || {};
        project.phases.phase1.status = 'in_progress';

        if (!project.currentPhase) {
            project.currentPhase = 1;
        }

        await saveValeriProject(project);

        res.json({
            success: true,
            message: 'Phase 1 answers saved successfully'
        });
    } catch (error) {
        console.error('Error saving Phase 1 answers:', error.message);
        res.status(400).json({ error: 'Failed to save answers', details: error.message });
    }
});

// POST /api/valeri/projects/:projectId/complete-phase - Complete current phase and move to next
app.post('/api/valeri/projects/:projectId/complete-phase/:phaseNumber', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const companyId = req.session.user.companyId;
        const projectId = req.params.projectId;
        const phaseNumber = parseInt(req.params.phaseNumber);

        const project = await loadValeriProject(userId, companyId, projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Validate that user is completing the current phase
        if (project.currentPhase !== phaseNumber) {
            return res.status(403).json({ 
                error: `Cannot complete phase ${phaseNumber}. Currently on phase ${project.currentPhase}.` 
            });
        }

        // Mark current phase as completed
        const phaseName = `phase${phaseNumber}`;
        if (project.phases[phaseName]) {
            project.phases[phaseName].status = 'completed';
            project.phases[phaseName].completedAt = new Date().toISOString();
        }

        // Unlock next phase (if exists)
        const nextPhaseNum = getNextPhaseNumber(phaseNumber);
        if (nextPhaseNum) {
            const nextPhaseName = `phase${nextPhaseNum}`;
            if (project.phases[nextPhaseName]) {
                project.phases[nextPhaseName].status = 'ready';
            }
        }

        project.currentPhase = phaseNumber + 1;
        await saveValeriProject(project);

        res.json({
            success: true,
            message: `Phase ${phaseNumber} completed. Moved to phase ${nextPhaseNum}`,
            nextPhase: nextPhaseNum,
            project: project
        });
    } catch (error) {
        console.error('Error completing phase:', error.message);
        res.status(400).json({ error: 'Failed to complete phase', details: error.message });
    }
});

// Helper function to get next phase number
function getNextPhaseNumber(currentPhase) {
    const phaseOrder = [1, 2, 3, 7, 8];
    const currentIndex = phaseOrder.indexOf(currentPhase);
    if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
        return null;
    }
    return phaseOrder[currentIndex + 1];
}

// GET /api/valeri/projects/:projectId/can-access-phase/:phaseNumber - Check if user can access phase
app.get('/api/valeri/projects/:projectId/can-access-phase/:phaseNumber', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const companyId = req.session.user.companyId;
        const projectId = req.params.projectId;
        const phaseNumber = parseInt(req.params.phaseNumber);

        const project = await loadValeriProject(userId, companyId, projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const phaseName = `phase${phaseNumber}`;
        const phaseData = project.phases[phaseName];

        if (!phaseData) {
            return res.status(404).json({ error: 'Phase does not exist' });
        }

        // Check if can access
        const canAccess = phaseData.status === 'ready' || phaseData.status === 'in_progress' || phaseData.status === 'completed';
        
        res.json({
            success: true,
            canAccess,
            phaseStatus: phaseData.status,
            currentPhase: project.currentPhase,
            message: canAccess ? 'Can access' : `Phase ${phaseNumber} is locked. Must complete previous phases first.`
        });
    } catch (error) {
        console.error('Error checking phase access:', error.message);
        res.status(400).json({ error: 'Failed to check access', details: error.message });
    }
});

// PHASE 2 ENDPOINTS - Quantification of Effects
// Helper function to extract quantifiable effects from Phase 1 effects matrix
function extractQuantifiableEffects(effectsMatrix) {
    const quantifiableUnits = [
        'kWh', 'MWh', 'GWh', 'kW', 'MW', 'W', 'Watt', 'kWh/a', 'kWh/year', 'MWh/a', 'MWh/year',
        'hours', 'hour', 'h/year', 'h/a', 'h', 'days', 'day', 'years', 'year', 'minutes', 'minute',
        'units', 'unit', 'pieces', 'piece', 'items', 'item', 'number', 'numbers', 'count',
        'tons', 'ton', 't', 'kg', 'kilogram', 'grams', 'g', 'liters', 'liter', 'l', 'm³', 'm3',
        '%', 'percent', 'percentage', 'ratio', 'ratio', 'times', 'times/year',
        'employees', 'employee', 'person', 'persons', 'staff', 'workers', 'worker'
    ];
    
    const quantifiableEffects = [];
    
    // Process each category
    ['energy_flow_effects', 'additional_financial_effects', 'other_effects'].forEach(category => {
        if (effectsMatrix[category] && Array.isArray(effectsMatrix[category])) {
            effectsMatrix[category].forEach((effect, index) => {
                // Check if effect name or reason contains quantifiable units
                const text = `${effect.name} ${effect.reason}`.toLowerCase();
                const hasUnit = quantifiableUnits.some(unit => text.includes(unit.toLowerCase()));
                
                if (hasUnit) {
                    quantifiableEffects.push({
                        id: `${category}_${index}`,
                        category,
                        name: effect.name,
                        reason: effect.reason,
                        type: effect.type,
                        confidence: effect.confidence,
                        value: null,  // To be filled by user
                        unit: '',     // User specifies unit
                        notes: ''
                    });
                }
            });
        }
    });
    
    return quantifiableEffects;
}

// GET /api/valeri/projects/:projectId/phase2/init - Load Phase 1 data and extract quantities
app.get('/api/valeri/projects/:projectId/phase2/init', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const companyId = req.session.user.companyId;
        const projectId = req.params.projectId;

        const project = await loadValeriProject(userId, companyId, projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Verify Phase 1 is completed
        if (project.phases.phase1.status !== 'completed') {
            return res.status(403).json({ 
                error: 'Phase 1 must be completed before accessing Phase 2',
                phaseStatus: project.phases.phase1.status
            });
        }

        // Extract quantifiable effects from Phase 1
        const effectsMatrix = project.phases.phase1.effectsMatrix || {};
        const quantifiableEffects = extractQuantifiableEffects(effectsMatrix);

        // Prepare Phase 2 data
        const phase2Data = {
            projectId,
            projectName: project.name,
            projectBrief: project.phases.phase1.projectBrief,
            quantifiableEffects,
            totalEffectsIdentified: quantifiableEffects.length,
            phase1Summary: {
                benefits: (project.phases.phase1.synthesis?.top_benefits || []).slice(0, 3),
                burdens: (project.phases.phase1.synthesis?.top_burdens || []).slice(0, 3)
            }
        };

        // Mark Phase 2 as in_progress if not already
        if (project.phases.phase2.status === 'ready') {
            project.phases.phase2.status = 'in_progress';
            await saveValeriProject(project);
        }

        res.json({
            success: true,
            data: phase2Data
        });
    } catch (error) {
        console.error('Error loading Phase 2:', error.message);
        res.status(400).json({ error: 'Failed to load Phase 2 data', details: error.message });
    }
});

// POST /api/valeri/projects/:projectId/phase2/save-quantifications - Save quantified values
app.post('/api/valeri/projects/:projectId/phase2/save-quantifications', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const companyId = req.session.user.companyId;
        const projectId = req.params.projectId;
        const { quantifications, summary } = req.body;

        if (!Array.isArray(quantifications)) {
            return res.status(400).json({ error: 'Quantifications must be an array' });
        }

        const project = await loadValeriProject(userId, companyId, projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Verify Phase 2 is accessible
        if (project.phases.phase2.status === 'locked') {
            return res.status(403).json({ error: 'Phase 2 is not yet unlocked' });
        }

        // Save quantifications to Phase 2
        project.phases.phase2 = {
            status: 'in_progress',
            data: {
                quantifiedEffects: quantifications,
                summary: summary || {},
                quantificationDate: new Date().toISOString()
            }
        };

        project.updatedAt = new Date().toISOString();
        await saveValeriProject(project);

        res.json({
            success: true,
            message: 'Phase 2 quantifications saved successfully',
            effectsQuantified: quantifications.length
        });
    } catch (error) {
        console.error('Error saving Phase 2:', error.message);
        res.status(400).json({ error: 'Failed to save quantifications', details: error.message });
    }
});

// GET /api/valeri/projects - List all user's projects
app.get('/api/valeri/projects', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const companyId = req.session.user.companyId;

        if (!db) await ensureDataDirectory();
        const docs = await db.collection('valeri_projects_detailed').find({ companyId, userId }).toArray();

        const summaries = docs.map(project => ({
            projectId: project.projectId,
            name: project.name,
            idea: project.idea,
            currentPhase: project.currentPhase,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt
        }));

        res.json({
            success: true,
            projects: summaries,
            total: summaries.length
        });
    } catch (error) {
        console.error('Error fetching projects:', error.message);
        res.status(400).json({ error: 'Failed to fetch projects', details: error.message });
    }
});

// GET /api/valeri/projects/:projectId - Get full project
app.get('/api/valeri/projects/:projectId', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const companyId = req.session.user.companyId;
        const projectId = req.params.projectId;

        const project = await loadValeriProject(userId, companyId, projectId);

        if (!project) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }

        res.json({
            success: true,
            project
        });
    } catch (error) {
        console.error('Error fetching project:', error.message);
        res.status(400).json({ error: 'Failed to fetch project', details: error.message });
    }
});

// PUT /api/valeri/projects/:projectId - Update project (name, metadata)
app.put('/api/valeri/projects/:projectId', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const companyId = req.session.user.companyId;
        const projectId = req.params.projectId;
        const { name } = req.body;

        const project = await loadValeriProject(userId, companyId, projectId);

        if (!project) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }

        // Update only allowed fields
        if (name) project.name = name;
        project.updatedAt = new Date().toISOString();

        await saveValeriProject(project);

        res.json({
            success: true,
            message: 'Project updated successfully'
        });
    } catch (error) {
        console.error('Error updating project:', error.message);
        res.status(400).json({ error: 'Failed to update project', details: error.message });
    }
});

// DELETE /api/valeri/projects/:projectId - Delete entire project
app.delete('/api/valeri/projects/:projectId', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const companyId = req.session.user.companyId;
        const projectId = req.params.projectId;

        const project = await loadValeriProject(userId, companyId, projectId);

        if (!project) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }

        if (!db) await ensureDataDirectory();
        await db.collection('valeri_projects_detailed').deleteOne({ projectId, companyId });

        res.json({
            success: true,
            message: 'Project deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting project:', error.message);
        res.status(400).json({ error: 'Failed to delete project', details: error.message });
    }
});

// POST /api/valeri/projects/:projectId/scenarios - Add Phase 7 scenario to project
app.post('/api/valeri/projects/:projectId/scenarios', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const companyId = req.session.user.companyId;
        const projectId = req.params.projectId;
        const { scenarioType, inputs, calculation, explanation } = req.body;

        if (!['best_case', 'worst_case', 'most_likely'].includes(scenarioType)) {
            return res.status(400).json({ error: 'Invalid scenario type. Must be: best_case, worst_case, most_likely' });
        }

        const project = await loadValeriProject(userId, companyId, projectId);

        if (!project) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }

        // Validate phase transition - can only go to phase 7 sequentially
        const phaseValidation = validatePhaseTransition(project, 7);
        if (!phaseValidation.allowed) {
            return res.status(403).json({ error: phaseValidation.reason });
        }

        // Update phase 7 with scenario
        project.phases.phase7.status = 'in_progress';
        project.phases.phase7.scenarios[scenarioType] = {
            scenarioType,
            inputs,
            calculation,
            explanation,
            savedAt: new Date().toISOString()
        };

        await saveValeriProject(project);

        res.json({
            success: true,
            message: `Scenario "${scenarioType}" saved successfully`,
            completedScenarios: Object.keys(project.phases.phase7.scenarios).filter(k => project.phases.phase7.scenarios[k] !== null).length
        });
    } catch (error) {
        console.error('Error saving scenario:', error.message);
        res.status(400).json({ error: 'Failed to save scenario', details: error.message });
    }
});

// GET /api/valeri/projects/:projectId/scenarios - Get all scenarios for a project
app.get('/api/valeri/projects/:projectId/scenarios', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const projectId = req.params.projectId;

        let projects = await loadData(VALERI_PROJECTS_FILE, []);

        const project = projects.find(p => p.projectId === projectId && p.userId === userId);

        if (!project) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }

        res.json({
            success: true,
            scenarios: project.phase7Scenarios || [],
            total: (project.phase7Scenarios || []).length
        });
    } catch (error) {
        console.error('Error fetching scenarios:', error.message);
        res.status(400).json({ error: 'Failed to fetch scenarios', details: error.message });
    }
});

// DELETE /api/valeri/projects/:projectId/scenarios/:scenarioId - Delete a scenario
app.delete('/api/valeri/projects/:projectId/scenarios/:scenarioId', requireAuth, requireCompany, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const projectId = req.params.projectId;
        const scenarioId = req.params.scenarioId;

        let projects = await loadData(VALERI_PROJECTS_FILE, []);

        const project = projects.find(p => p.projectId === projectId && p.userId === userId);

        if (!project) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }

        const scenarioIndex = project.phase7Scenarios.findIndex(s => s.scenarioId === scenarioId);

        if (scenarioIndex === -1) {
            return res.status(404).json({ error: 'Scenario not found' });
        }

        project.phase7Scenarios.splice(scenarioIndex, 1);
        project.updatedAt = new Date().toISOString();

        await saveData(VALERI_PROJECTS_FILE, projects);

        res.json({
            success: true,
            message: 'Scenario deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting scenario:', error.message);
        res.status(400).json({ error: 'Failed to delete scenario', details: error.message });
    }
});

app.get('/valeri/phase-1', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.role === 'admin') {
        return res.redirect('/dashboard');
    }
    return res.sendFile(path.join(__dirname, 'phase1.html'));
});

app.get('/valeri/phase-2', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.role === 'admin') {
        return res.redirect('/dashboard');
    }
    return res.sendFile(path.join(__dirname, 'phase2.html'));
});

app.get('/valeri/phase-7', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.role === 'admin') {
        return res.redirect('/dashboard');
    }
    return res.sendFile(path.join(__dirname, 'phase7.html'));
});

app.get('/valeri/phase-8', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.role === 'admin') {
        return res.redirect('/dashboard');
    }
    return res.sendFile(path.join(__dirname, 'phase8.html'));
});

app.get('/valeri/projects', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.role === 'admin') {
        return res.redirect('/dashboard');
    }
    return res.sendFile(path.join(__dirname, 'valeri-projects.html'));
});

app.get('/chat', async (req, res) => {
    // Check if user is authenticated and is not admin
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.role === 'admin') {
        return res.redirect('/dashboard');
    }
    try {
        let html = await fs.readFile(path.join(__dirname, 'newchat.html'), 'utf8');
        html = html.replace(/'<your-api-key>'/g, `'${azureSubscriptionKey}'`);
        res.send(html);
    } catch (error) {
        console.error('Error serving newchat.html:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/chat.htm', async (req, res) => {
    // Check if user is authenticated and is not admin
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.role === 'admin') {
        return res.redirect('/dashboard');
    }
    try {
        let html = await fs.readFile(path.join(__dirname, 'newchat.html'), 'utf8');
        html = html.replace(/'<your-api-key>'/g, `'${azureSubscriptionKey}'`);
        res.send(html);
    } catch (error) {
        console.error('Error serving newchat.html:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/dashboard', (req, res) => {
    // Check if user is authenticated and is admin
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'company-registration.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.get('/kontakt', (req, res) => {
    res.sendFile(path.join(__dirname, 'kontakt.html'));
});

app.get('/uber-enefit', (req, res) => {
    res.sendFile(path.join(__dirname, 'uber-enefit.html'));
});

app.get('/events', (req, res) => {
    res.sendFile(path.join(__dirname, 'events.html'));
});

app.get('/datenschutz', (req, res) => {
    res.sendFile(path.join(__dirname, 'datenschutz.html'));
});

app.get('/impressum', (req, res) => {
    res.sendFile(path.join(__dirname, 'impressum.html'));
});

app.get('/info', (req, res) => {
    res.sendFile(path.join(__dirname, 'info.html'));
});

app.get('/start', (req, res) => {
    res.sendFile(path.join(__dirname, 'demo-chat.html'));
});

app.get('/test-urls', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-urls.html'));
});

app.get('/news', (req, res) => {
    res.sendFile(path.join(__dirname, 'news.html'));
});

// ==================== VALERI NEW Project Management Functions ====================

app.get('/api/valerinew/projects', requireAuth, requireCompany, async (req, res) => {
    try {
        const companyId = req.session.user.companyId;
        
        if (!db) await ensureDataDirectory();
        const docs = await db.collection('valerinew_projects_detailed').find({ companyId }).toArray();
        
        const projects = {};
        for (const doc of docs) {
            delete doc._id;
            if (doc.meta && doc.meta.id) {
                projects[doc.meta.id] = doc;
            } else if (doc.projectId) {
                projects[doc.projectId] = doc;
            }
        }
        res.json(projects);
    } catch (error) {
        console.error('Error fetching valerinew projects:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

app.put('/api/valerinew/projects/:projectId', requireAuth, requireCompany, async (req, res) => {
    try {
        const companyId = req.session.user.companyId;
        const projectId = req.params.projectId;
        
        if (!db) await ensureDataDirectory();
        await db.collection('valerinew_projects_detailed').updateOne(
            { projectId },
            { $set: { ...req.body, companyId } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving valerinew project:', error);
        res.status(500).json({ error: 'Failed to save project' });
    }
});

app.delete('/api/valerinew/projects', requireAuth, requireCompany, async (req, res) => {
    try {
        const companyId = req.session.user.companyId;
        
        if (!db) await ensureDataDirectory();
        await db.collection('valerinew_projects_detailed').deleteMany({ companyId });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting all valerinew projects:', error);
        res.status(500).json({ error: 'Failed to delete projects' });
    }
});

app.delete('/api/valerinew/projects/:projectId', requireAuth, requireCompany, async (req, res) => {
    try {
        const companyId = req.session.user.companyId;
        const projectId = req.params.projectId;
        
        if (!db) await ensureDataDirectory();
        await db.collection('valerinew_projects_detailed').deleteOne({ projectId, companyId });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting valerinew project:', error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

app.post('/api/valerinew/azure-openai', requireAuth, requireCompany, async (req, res) => {
    try {
        const apiKey = process.env.AZURE_API_KEY || process.env.AZURE_OPENAI_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'AZURE_API_KEY is not configured on the server. Please ensure the environment variable is set and restart the Node.js server.' });
        }
        
        const endpoint = 'https://enefit-llm.openai.azure.com';
        const deployment = req.body.model || 'gpt-4.1';
        const apiVersion = '2024-12-01-preview';
        const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
        
        const response = await axios.post(url, req.body, {
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
            }
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('Azure OpenAI error:', error.message);
        res.status(500).send(error.response ? error.response.data : error.message);
    }
});

// Initialize data on startup
initializeData().then(() => {
    console.log('Data files initialized');
    return updateEventUrls();
}).then(() => {
    console.log('Event URLs updated');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Environment check:', {
        nodeEnv: process.env.NODE_ENV,
        apiKeySet: !!process.env.ENEFIT_API_KEY
    });
}); 