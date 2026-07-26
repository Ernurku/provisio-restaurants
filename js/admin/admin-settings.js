/* ============================================
   PROVISIO — Settings Module
   User preferences, global currency, logout
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) return;

    // ========================================
    // SETTINGS TAB SWITCHING
    // ========================================
    const settingsLinks = document.querySelectorAll('.settings-nav-link');
    const settingsSections = {
        profile: document.getElementById('settingsProfile'),
        notifications: document.getElementById('settingsNotifications'),
        inventoryRules: document.getElementById('settingsInventoryRules'),
        integrations: document.getElementById('settingsIntegrations'),
        billing: document.getElementById('settingsBilling')
    };

    settingsLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.dataset.settings;
            settingsLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            Object.keys(settingsSections).forEach(key => {
                const section = settingsSections[key];
                if (section) section.style.display = (key === target) ? 'block' : 'none';
            });
        });
    });

    // ========================================
    // VENUE TYPE TOGGLE
    // ========================================
    const venueTypeSelect = document.getElementById('venueType');
    const customVenueInput = document.getElementById('customVenueInput');
    venueTypeSelect?.addEventListener('change', (e) => {
        if (customVenueInput) customVenueInput.style.display = (e.target.value === 'custom') ? 'block' : 'none';
    });

    // ========================================
    // LOAD SETTINGS DATA
    // ========================================
    async function loadSettings() {
        try {
            const data = await P.DB.settings.load();
            if (!data) return;

            if (document.getElementById('venueName')) document.getElementById('venueName').value = data.venueName || '';
            if (document.getElementById('venueType')) {
                const vType = data.venueType || '';
                const isCustom = !['restaurant', 'cafe', 'bakery', 'confectionery', 'coffeeshop', 'canteen', 'bar', 'catering'].includes(vType) && vType !== '';
                if (isCustom) {
                    document.getElementById('venueType').value = 'custom';
                    if (customVenueInput) { customVenueInput.style.display = 'block'; customVenueInput.value = vType; }
                } else {
                    document.getElementById('venueType').value = vType;
                }
            }
            if (document.getElementById('venueAddress')) document.getElementById('venueAddress').value = data.venueAddress || '';
            if (document.getElementById('phoneInput')) document.getElementById('phoneInput').value = data.phone || '';
            if (document.getElementById('settingsCurrency')) document.getElementById('settingsCurrency').value = data.currency || P.currentCurrency;
            if (document.getElementById('settingsUnits')) document.getElementById('settingsUnits').value = data.units || 'metric';
            if (document.getElementById('venueTimezone')) document.getElementById('venueTimezone').value = data.timezone || 'UTC+3';
            
            // Set notifications
            if (Array.isArray(data.notifications)) {
                const checkboxes = document.querySelectorAll('#settingsNotifications input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    const saved = data.notifications.find(n => n.label === cb.parentElement.textContent.trim());
                    if (saved) cb.checked = saved.checked;
                });
            }

            P.currentCurrency = data.currency || P.currentCurrency;

            // Применяем язык интерфейса из БД (user_settings.language).
            if (window.ProvisioI18n) {
                window.ProvisioI18n.setLanguage(data.language || 'ru');
            }
        } catch (err) { console.warn('Failed to load settings from server', err); }
    }

    // ========================================
    // LANGUAGE SWITCHER (topbar)
    // ========================================
    const langBtn = document.getElementById('langSwitcherBtn');
    const langDropdown = document.getElementById('langDropdown');

    function closeLangDropdown() { langDropdown?.classList.remove('open'); }

    langBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        langDropdown?.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (langDropdown && !e.target.closest('#langSwitcherWrap')) closeLangDropdown();
    });

    document.querySelectorAll('#langDropdown .lang-option').forEach(opt => {
        opt.addEventListener('click', async (e) => {
            e.preventDefault();
            const lang = opt.getAttribute('data-lang');
            closeLangDropdown();
            if (window.ProvisioI18n) window.ProvisioI18n.setLanguage(lang);
            // Сохраняем выбор в БД (user_settings.language) — не в localStorage.
            try {
                await P.DB.settings.save({ language: lang });
            } catch (err) {
                console.warn('Failed to save language', err);
            }
        });
    });

    // ========================================
    // SAVE GLOBAL SETTINGS (Profile)
    // ========================================
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', async () => {
            saveProfileBtn.disabled = true;
            saveProfileBtn.textContent = 'Сохранение...';

            const typeVal = document.getElementById('venueType').value;
            const finalType = (typeVal === 'custom') ? customVenueInput?.value : typeVal;

            const config = {
                venueName: document.getElementById('venueName').value.trim(),
                venueType: finalType,
                venueAddress: document.getElementById('venueAddress').value.trim(),
                phone: document.getElementById('phoneInput').value.trim(),
                currency: document.getElementById('settingsCurrency').value,
                units: document.getElementById('settingsUnits').value,
                timezone: document.getElementById('venueTimezone').value
            };

            try {
                if (P.AppStore.setCurrency) P.AppStore.setCurrency(config.currency);
                P.currentCurrency = config.currency;
                
                await P.DB.settings.save(config);
                
                P.showToast('Настройки сохранены', 'success');
                P.logAction('Обновление', 'Настройки', 'Профиль', 'Данные заведения изменены');
                
                if (typeof renderInventoryTable === 'function') renderInventoryTable();
                if (typeof renderRecipesTable === 'function') renderRecipesTable();
                if (typeof P.calculateInventoryValuation === 'function') P.calculateInventoryValuation();
            } catch (err) {
                console.error('Save Settings Failed:', err);
                P.showToast('Ошибка сохранения', 'error');
            } finally {
                saveProfileBtn.disabled = false;
                saveProfileBtn.textContent = 'Сохранить изменения';
            }
        });
    }


    // ========================================
    // SAVE NOTIFICATION SETTINGS
    // ========================================
    const saveNotifSettingsBtn = document.querySelector('#settingsNotifications .btn-accent');
    if (saveNotifSettingsBtn) {
        saveNotifSettingsBtn.addEventListener('click', async () => {
            const originalText = saveNotifSettingsBtn.textContent;
            saveNotifSettingsBtn.disabled = true;
            saveNotifSettingsBtn.textContent = 'Загрузка...';

            try {
                const checkboxes = document.querySelectorAll('#settingsNotifications input[type="checkbox"]');
                const states = Array.from(checkboxes).map(cb => ({ label: cb.parentElement.textContent.trim(), checked: cb.checked }));
                
                await P.DB.settings.save({ notifications: states });
                P.showToast('Настройки уведомлений обновлены', 'success');
            } catch (err) { P.showToast('Ошибка при сохранении', 'error'); }
            finally {
                saveNotifSettingsBtn.disabled = false;
                saveNotifSettingsBtn.textContent = originalText;
            }
        });
    }

    // ========================================
    // ПОРОГ РАСХОЖДЕНИЯ (Склад и сверка)
    // ========================================
    async function loadVarianceThreshold() {
        try {
            const pct = await P.DB.settings.loadVarianceThreshold();
            P.varianceThresholdPct = pct;
            const input = document.getElementById('varianceThresholdInput');
            if (input) input.value = pct;
        } catch (err) { console.warn('Failed to load variance threshold', err); }
    }

    document.getElementById('saveVarianceThresholdBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('saveVarianceThresholdBtn');
        const input = document.getElementById('varianceThresholdInput');
        const pct = parseFloat(input.value);
        if (isNaN(pct) || pct < 0) { P.showToast('Введите число от 0 и выше', 'error'); return; }
        btn.disabled = true; btn.textContent = 'Сохранение...';
        try {
            await P.DB.settings.saveVarianceThreshold(pct);
            P.varianceThresholdPct = pct;
            P.showToast('Порог расхождения сохранён', 'success');
            if (typeof renderReconcileTable === 'function') renderReconcileTable();
        } catch (err) {
            P.showToast('Ошибка сохранения', 'error');
        } finally {
            btn.disabled = false; btn.textContent = 'Сохранить';
        }
    });

    // ========================================
    // LOGOUT
    // ========================================
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            P.confirmAction('Выйти', 'Вы уверены, что хотите выйти?', () => {
                localStorage.removeItem('auth_session');
                localStorage.removeItem('auth_token');
                window.location.href = 'login.html';
            });
        });
    }

    // React to settings changes
    document.addEventListener('app:settings_updated', () => {
        const currencySelect = document.getElementById('settingsCurrency');
        if (currencySelect && currencySelect.value !== P.AppStore.currency) {
             currencySelect.value = P.AppStore.currency;
        }
        P.currentCurrency = P.AppStore.currency;
    });

    // Init
    loadSettings();
    loadVarianceThreshold();

    console.log('%c[PROVISIO]%c Settings module loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
