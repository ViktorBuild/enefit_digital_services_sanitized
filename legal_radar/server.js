const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { scanFeeds } = require('./scanner');
const { 
    getRecentLaws, 
    addSubscriber, 
    getSubscribers, 
    getUnsentLaws, 
    markLawsAsSent,
    getSetting,
    setSetting,
    factoryReset,
    deleteSubscriber,
    connectDB
} = require('./db');
const { sendPersonalizedDigests } = require('./mailer');

const app = express.Router();

// Middleware to protect admin routes
const isAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, error: 'Unauthorized: Admin access required.' });
    }
};

// Connect to DB once at startup
let currentCronTask = null;

async function initCron() {
    if (currentCronTask) {
        currentCronTask.stop();
    }
    
    const cronExpr = await getSetting('cron_expression', '0 0 * * *');
    
    currentCronTask = cron.schedule(cronExpr, async () => {
        const isAutoEnabled = await getSetting('auto_enabled', 'false');
        if (isAutoEnabled !== 'true') return;
        
        console.log(`Cron: Running scheduled auto scan and send (Schedule: ${cronExpr})...`);
        try {
            await scanFeeds();
            const subscribers = await getSubscribers();
            const unsentLaws = await getUnsentLaws();
            if (unsentLaws.length > 0) {
                await sendPersonalizedDigests(subscribers, unsentLaws);
                await markLawsAsSent();
                console.log("Cron: Successfully dispatched emails.");
            } else {
                console.log("Cron: No new laws to send.");
            }
        } catch (e) {
            console.error("Cron Error:", e);
        }
    });
    console.log(`Cron initialized with expression: ${cronExpr}`);
}

connectDB().then(() => {
    initCron();
}).catch(console.error);

// Routes for Pages (Optional if served statically by main server, but kept for completeness)
app.get('/legal_radar', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/legal_radar/admin', isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API: Settings
app.get('/api/settings', isAdmin, async (req, res) => {
    try {
        const auto_enabled = await getSetting('auto_enabled', 'false');
        const cron_expression = await getSetting('cron_expression', '0 0 * * *');
        res.json({
            success: true,
            settings: {
                auto_enabled: auto_enabled === 'true',
                cron_expression: cron_expression
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/settings', isAdmin, async (req, res) => {
    try {
        const { auto_enabled, cron_expression } = req.body;
        if (auto_enabled !== undefined) await setSetting('auto_enabled', auto_enabled.toString());
        if (cron_expression !== undefined) await setSetting('cron_expression', cron_expression.toString());
        
        await initCron(); // Re-initialize cron with new settings
        
        res.json({ success: true, message: 'Settings saved.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// API: Subscribe a user
app.post('/api/subscribe', async (req, res) => {
    try {
        const { email, categories } = req.body;
        if (!email || !categories || !Array.isArray(categories)) {
            return res.status(400).json({ success: false, error: 'Invalid data' });
        }
        await addSubscriber(email, categories);
        res.json({ success: true, message: 'Subscribed successfully' });
    } catch (error) {
        console.error("Error subscribing:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Trigger scan (Admin)
app.post('/api/scan', isAdmin, async (req, res) => {
    try {
        const result = await scanFeeds();
        res.json({ success: true, newItems: result });
    } catch (error) {
        console.error("Error during scan:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Get laws (Admin)
app.get('/api/laws', isAdmin, async (req, res) => {
    try {
        let laws = await getRecentLaws(50);
        laws = laws.map(law => {
            try {
                if (typeof law.category === 'string') {
                    law.category = JSON.parse(law.category);
                }
            } catch(e) {
                law.category = [law.category];
            }
            return law;
        });
        res.json({ success: true, laws });
    } catch (error) {
        console.error("Error fetching laws:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Get subscribers and stats (Admin)
app.get('/api/stats', isAdmin, async (req, res) => {
    try {
        const subscribers = await getSubscribers();
        const unsentLaws = await getUnsentLaws();
        res.json({ 
            success: true, 
            subscribers: subscribers, 
            unsentCount: unsentLaws.length 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Send digest (Admin)
app.post('/api/send-digest', isAdmin, async (req, res) => {
    try {
        const subscribers = await getSubscribers();
        const unsentLaws = await getUnsentLaws();

        if (unsentLaws.length === 0) {
            return res.json({ success: true, message: 'No new laws to send.', urls: [] });
        }

        if (subscribers.length === 0) {
            return res.json({ success: true, message: 'No subscribers found.', urls: [] });
        }

        const emailUrls = await sendPersonalizedDigests(subscribers, unsentLaws);
        await markLawsAsSent();
        
        res.json({ success: true, message: `Successfully sent ${emailUrls.length} personalized digests.`, urls: emailUrls });
    } catch (error) {
        console.error("Error sending digest:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/subscribers/:email', isAdmin, async (req, res) => {
    try {
        await deleteSubscriber(req.params.email);
        res.json({ success: true, message: 'Subscriber deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/legal_radar/unsubscribe', async (req, res) => {
    try {
        const token = req.query.token;
        if (!token) return res.status(400).send("Invalid token.");
        const email = Buffer.from(token, 'base64').toString('utf-8');
        await deleteSubscriber(email);
        res.send(`
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center; padding: 20px;">
                <h1 style="color: #2c3e50;">Erfolgreich abgemeldet</h1>
                <p style="color: #666; font-size: 16px;">Ihre E-Mail-Adresse (<b>${email}</b>) wurde erfolgreich aus unserem Legal Radar Verteiler entfernt.</p>
                <a href="/accesspoint.html" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #dff45e; color: #1a1a1a; text-decoration: none; border-radius: 8px; font-weight: bold;">Zurück zur Startseite</a>
            </div>
        `);
    } catch (error) {
        res.status(500).send("Fehler beim Abmelden.");
    }
});

app.post('/api/reset', isAdmin, async (req, res) => {
    try {
        await factoryReset();
        res.json({ success: true, message: 'Factory reset successful' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// If run directly (legacy standalone mode)
if (require.main === module) {
    const standaloneApp = express();
    const PORT = process.env.PORT || 3000;
    standaloneApp.use(express.static(path.join(__dirname, 'public')));
    standaloneApp.use(express.json());
    standaloneApp.use('/', app);
    standaloneApp.listen(PORT, () => {
        console.log(`Legal Radar Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
