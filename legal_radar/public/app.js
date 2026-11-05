document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('subscribeForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const loader = submitBtn.querySelector('.loader');
    const successMessage = document.getElementById('successMessage');
    const langToggle = document.getElementById('langToggle');

    let currentLang = 'de';

    const translations = {
        de: {
            alertSelect: 'Bitte wählen Sie mindestens eine Branche aus.',
            subscribing: 'Abonnieren...',
            subscribeBtn: 'Jetzt abonnieren',
            failSub: 'Abonnement fehlgeschlagen: ',
            failConn: 'Fehler bei der Verbindung zum Server.',
            redirecting: 'Abonniert! Weiterleitung...'
        },
        en: {
            alertSelect: 'Please select at least one industry.',
            subscribing: 'Subscribing...',
            subscribeBtn: 'Subscribe to Alerts',
            failSub: 'Subscription failed: ',
            failConn: 'Error connecting to the server.',
            redirecting: 'Subscribed! Redirecting...'
        }
    };

    function updateLanguage() {
        document.querySelectorAll('[data-lang-de]').forEach(el => {
            el.textContent = el.getAttribute('data-lang-' + currentLang);
        });
        document.querySelectorAll('[data-lang-placeholder-de]').forEach(el => {
            el.placeholder = el.getAttribute('data-lang-placeholder-' + currentLang);
        });
        if (!submitBtn.disabled) {
            btnText.textContent = translations[currentLang].subscribeBtn;
        }
        langToggle.textContent = currentLang === 'de' ? 'EN' : 'DE';
    }

    if(langToggle) {
        langToggle.addEventListener('click', (e) => {
            e.preventDefault();
            currentLang = currentLang === 'de' ? 'en' : 'de';
            updateLanguage();
        });
    }

    updateLanguage();

    // --- Radar SVG Interaction ---
    const radarSlices = document.querySelectorAll('.radar-slice');
    const checkboxes = document.querySelectorAll('.radar-legend-item input[type="checkbox"]');

    if (radarSlices.length > 0) {
        radarSlices.forEach(slice => {
            slice.addEventListener('click', () => {
                const index = slice.getAttribute('data-index');
                const checkbox = document.querySelector(`.radar-legend-item[data-index="${index}"] input`);
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });
        });

        checkboxes.forEach((checkbox, i) => {
            checkbox.addEventListener('change', () => {
                const slice = document.querySelector(`.radar-slice[data-index="${i}"]`);
                if (slice) {
                    if (checkbox.checked) {
                        slice.classList.add('active');
                    } else {
                        slice.classList.remove('active');
                    }
                }
            });
        });
    }

    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const checkboxes = document.querySelectorAll('input[name="category"]:checked');
            
            if (checkboxes.length === 0) {
                alert(translations[currentLang].alertSelect);
                return;
            }

            const categories = Array.from(checkboxes).map(cb => cb.value);

            // Loading state
            submitBtn.disabled = true;
            btnText.textContent = translations[currentLang].subscribing;
            loader.classList.remove('hidden');
            successMessage.style.display = 'none';

            try {
                const response = await fetch('/api/subscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, categories })
                });

                const data = await response.json();

                if (data.success) {
                    form.style.display = 'none';
                    successMessage.textContent = translations[currentLang].redirecting;
                    successMessage.style.display = 'block';
                    
                    setTimeout(() => {
                        window.location.href = '/accesspoint.html';
                    }, 2000);
                } else {
                    alert(translations[currentLang].failSub + data.error);
                }
            } catch (error) {
                alert(translations[currentLang].failConn);
            } finally {
                submitBtn.disabled = false;
                if(form.style.display !== 'none') {
                    btnText.textContent = translations[currentLang].subscribeBtn;
                }
                loader.classList.add('hidden');
            }
        });
    }
});
