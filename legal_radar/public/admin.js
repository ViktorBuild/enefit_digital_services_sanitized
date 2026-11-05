document.addEventListener('DOMContentLoaded', async () => {
    // Auth Check
    try {
        const authRes = await fetch('/api/check-auth');
        const authData = await authRes.json();
        if (!authData.authenticated || authData.user.role !== 'admin') {
            window.location.href = '/login';
            return;
        }
    } catch(e) {
        window.location.href = '/login';
        return;
    }

    // Nav Elements
    const navItems = document.querySelectorAll('.nav-item');
    const viewSections = document.querySelectorAll('.view-section');

    // Overview Stats
    const statSubscribers = document.getElementById('statSubscribers');
    const statUnsent = document.getElementById('statUnsent');
    const statTotalLaws = document.getElementById('statTotalLaws');

    // Settings & Actions
    const scanBtn = document.getElementById('scanBtn');
    const sendBtn = document.getElementById('sendBtn');
    const statusBanner = document.getElementById('statusBanner');
    const statusMessage = document.getElementById('statusMessage');
    const emailPreviewContainer = document.getElementById('emailPreviewContainer');
    
    const autoEnabledCheckbox = document.getElementById('autoEnabled');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const settingsStatus = document.getElementById('settingsStatus');
    const factoryResetBtn = document.getElementById('factoryResetBtn');

    // Grids & Tables
    const lawsGrid = document.getElementById('lawsGrid');
    const subscribersTableBody = document.getElementById('subscribersTableBody');

    // Templates
    const lawCardTemplate = document.getElementById('lawCardTemplate');
    const subscriberRowTemplate = document.getElementById('subscriberRowTemplate');

    // --- Navigation Logic ---
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            viewSections.forEach(sec => sec.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'view-subscribers') {
                fetchSubscribers();
            } else if (targetId === 'view-laws') {
                fetchLaws();
            }
        });
    });

    // --- Initialization ---
    fetchData();

    async function fetchData() {
        await Promise.all([fetchLaws(), fetchStats(), fetchSettings()]);
    }

    // --- Data Fetching ---
    async function fetchStats() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            if (data.success) {
                statSubscribers.textContent = data.subscribers.length;
                statUnsent.textContent = data.unsentCount;
            }
        } catch(e) { console.error(e); }
    }

    async function fetchSettings() {
        try {
            const response = await fetch('/api/settings');
            const data = await response.json();
            if (data.success) {
                autoEnabledCheckbox.checked = data.settings.auto_enabled;
                if (data.settings.cron_expression) {
                    const cronSelect = document.getElementById('cronExpression');
                    if (cronSelect) cronSelect.value = data.settings.cron_expression;
                }
            }
        } catch(e) { console.error(e); }
    }

    async function fetchLaws() {
        try {
            const response = await fetch('/api/laws');
            const data = await response.json();
            if (data.success) {
                statTotalLaws.textContent = data.laws.length;
                renderLaws(data.laws);
            }
        } catch (error) {
            console.error('Failed to fetch laws:', error);
        }
    }

    async function fetchSubscribers() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            if (data.success) {
                renderSubscribers(data.subscribers);
            }
        } catch (error) {
            console.error('Failed to fetch subscribers:', error);
        }
    }

    // --- Settings & Danger Zone ---
    saveSettingsBtn.addEventListener('click', async () => {
        saveSettingsBtn.textContent = 'Saving...';
        try {
            const cronSelect = document.getElementById('cronExpression');
            const cronValue = cronSelect ? cronSelect.value : '0 0 * * *';
            
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    auto_enabled: autoEnabledCheckbox.checked,
                    cron_expression: cronValue
                })
            });
            if (response.ok) {
                settingsStatus.classList.remove('hidden');
                setTimeout(() => settingsStatus.classList.add('hidden'), 3000);
            }
        } catch(e) { console.error(e); } finally {
            saveSettingsBtn.textContent = 'Save Settings';
        }
    });

    factoryResetBtn.addEventListener('click', async () => {
        if (confirm('Are you absolutely sure? This will wipe all laws, subscribers, and settings.')) {
            factoryResetBtn.textContent = 'Wiping...';
            try {
                const response = await fetch('/api/reset', { method: 'POST' });
                if (response.ok) {
                    alert('System reset successful.');
                    window.location.reload();
                }
            } catch(e) { 
                console.error(e); 
                factoryResetBtn.textContent = 'Wipe Database (Factory Reset)';
            }
        }
    });

    // --- Actions ---
    scanBtn.addEventListener('click', async () => {
        scanBtn.textContent = 'Scanning...';
        scanBtn.disabled = true;
        statusBanner.classList.add('hidden');
        emailPreviewContainer.innerHTML = '';

        try {
            const response = await fetch('/api/scan', { method: 'POST' });
            const data = await response.json();

            if (data.success) {
                statusMessage.textContent = `Scan complete. Found ${data.newItems.length} new laws.`;
                statusBanner.classList.remove('hidden');
                fetchData();
            }
        } catch (error) {
            alert('Scan failed.');
        } finally {
            scanBtn.textContent = '1. Scan Feeds';
            scanBtn.disabled = false;
        }
    });

    sendBtn.addEventListener('click', async () => {
        sendBtn.textContent = 'Sending...';
        sendBtn.disabled = true;
        statusBanner.classList.add('hidden');
        emailPreviewContainer.innerHTML = '';

        try {
            const response = await fetch('/api/send-digest', { method: 'POST' });
            const data = await response.json();

            if (data.success) {
                statusMessage.textContent = data.message;
                statusBanner.classList.remove('hidden');
                
                if (data.urls && data.urls.length > 0) {
                    data.urls.forEach(item => {
                        const a = document.createElement('a');
                        a.href = item.url;
                        a.target = '_blank';
                        a.textContent = `View sent email for ${item.email}`;
                        a.style.color = '#059669';
                        emailPreviewContainer.appendChild(a);
                    });
                }
                fetchData();
            }
        } catch (error) {
            alert('Send failed.');
        } finally {
            sendBtn.textContent = '2. Send Newsletters';
            sendBtn.disabled = false;
        }
    });

    // --- Render Functions ---
    function renderLaws(laws) {
        lawsGrid.innerHTML = '';
        laws.forEach(law => {
            const clone = lawCardTemplate.content.cloneNode(true);
            
            const tagsContainer = clone.querySelector('.tags-container');
            
            // Add Source Tag
            if (law.source) {
                const srcTag = document.createElement('span');
                srcTag.className = 'tag tag-source';
                srcTag.textContent = law.source;
                tagsContainer.appendChild(srcTag);
            }

            // Add Category Tags
            const categories = Array.isArray(law.category) ? law.category : [law.category];
            categories.forEach(cat => {
                const tag = document.createElement('span');
                tag.className = `tag ${getCategoryClass(cat)}`;
                tag.textContent = cat;
                tagsContainer.appendChild(tag);
            });

            const title = clone.querySelector('.law-title');
            title.textContent = law.title;
            title.href = law.link;

            const summary = clone.querySelector('.law-summary');
            summary.textContent = law.summary;
            
            const pdfLink = clone.querySelector('.pdf-link');
            if (law.pdf_url) {
                pdfLink.style.display = 'inline-flex';
                pdfLink.href = law.pdf_url;
            }
            
            const dateText = clone.querySelector('.date-text');
            const dateObj = new Date(law.pubDate);
            dateText.textContent = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            const statusTag = clone.querySelector('.status-tag');
            if (law.is_sent) {
                statusTag.textContent = 'Sent';
                statusTag.style.background = 'rgba(59, 130, 246, 0.15)';
                statusTag.style.color = '#2563eb';
            } else {
                statusTag.textContent = 'Unsent';
                statusTag.style.background = 'rgba(245, 158, 11, 0.15)';
                statusTag.style.color = '#d97706';
            }

            lawsGrid.appendChild(clone);
        });
    }

    function renderSubscribers(subscribers) {
        subscribersTableBody.innerHTML = '';
        subscribers.forEach(sub => {
            const clone = subscriberRowTemplate.content.cloneNode(true);
            
            clone.querySelector('.sub-email').textContent = sub.email;
            
            const catContainer = clone.querySelector('.cat-tags');
            const categories = Array.isArray(sub.categories) ? sub.categories : [];
            categories.forEach(cat => {
                const tag = document.createElement('span');
                tag.className = `tag ${getCategoryClass(cat)}`;
                tag.textContent = cat;
                catContainer.appendChild(tag);
            });

            const deleteBtn = clone.querySelector('.delete-sub-btn');
            deleteBtn.addEventListener('click', async () => {
                if (confirm(`Delete subscriber ${sub.email}?`)) {
                    deleteBtn.textContent = '...';
                    await fetch(`/api/subscribers/${sub.email}`, { method: 'DELETE' });
                    fetchSubscribers();
                    fetchStats();
                }
            });

            subscribersTableBody.appendChild(clone);
        });
    }

    function getCategoryClass(category) {
        const cat = category.toLowerCase();
        if (cat.includes('manufacturing') || cat.includes('produktion')) return 'tag-manufacturing';
        if (cat.includes('it') || cat.includes('telecommunications') || cat.includes('digitales')) return 'tag-it';
        if (cat.includes('logistics') || cat.includes('transport')) return 'tag-logistics';
        if (cat.includes('real estate') || cat.includes('buildings') || cat.includes('immobilien')) return 'tag-realestate';
        if (cat.includes('energy') || cat.includes('utilities') || cat.includes('energie')) return 'tag-energy';
        return 'tag-source';
    }
});
