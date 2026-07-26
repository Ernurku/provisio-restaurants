// ========================================
// GLOBAL STATE INITIALIZATION (Stability Fix)
// ========================================
window.Provisio = window.Provisio || {};
window.Provisio.debugErrors = window.Provisio.debugErrors || [];

(function () {
    function logToDebug(msg, type = 'error') {
        if (!Array.isArray(window.Provisio.debugErrors)) window.Provisio.debugErrors = [];
        const errorLog = {
            id: Date.now(),
            time: new Date().toLocaleTimeString(),
            message: msg,
            type: type
        };
        window.Provisio.debugErrors.unshift(errorLog);
        if (window.Provisio.debugErrors.length > 50) window.Provisio.debugErrors.pop();
        
        // Update debug window if visible
        const logContainer = document.getElementById('debugLog');
        if (logContainer) {
            const entry = document.createElement('div');
            entry.className = `debug-log-entry log-${type}`;
            entry.innerHTML = `<span style="opacity: 0.5;">[${errorLog.time}]</span> ${msg}`;
            logContainer.prepend(entry);
        }
    }

    window.onerror = function (msg, url, line, col, error) {
        logToDebug(`${msg} (at ${line}:${col})`, 'error');
        // Still show critical errors in toast but maybe more selectively?
        // For now, let's keep it quiet if it's a known non-breaking issue
        return false;
    };
    window.onunhandledrejection = function (event) {
        logToDebug(`Promise Rejection: ${event.reason}`, 'promise');
    };

    // ========================================
    // SESSION AUTH CHECK
    // ========================================
    const urlParams = new URLSearchParams(window.location.search);
    const authFromUrl = urlParams.get('auth') === 'true';
    if (authFromUrl) {
        try { localStorage.setItem('auth_session', 'true'); } catch (e) { }
    }

    const AppStore = {
        sessionAuth: authFromUrl || localStorage.getItem('auth_session') === 'true',
        userEmail: localStorage.getItem('user_email') || 'chef@restaurant.com',
        userName: localStorage.getItem('user_name') || 'Пользователь',
        userRole: localStorage.getItem('user_role') || 'owner',
        sidebarCollapsed: localStorage.getItem('sidebar_collapsed') === 'true',
        currency: localStorage.getItem('app_currency') || 'KZT',
        userAvatar: localStorage.getItem('user_avatar') || '',
        theme: localStorage.getItem('app_theme') || 'light',
        palette: localStorage.getItem('app_palette') || 'classic',
        effectsMode: localStorage.getItem('app_effects') || 'normal', // normal, dim, clean

        setCurrency(c) {
            this.currency = c;
            localStorage.setItem('app_currency', c);
            document.dispatchEvent(new Event('app:settings_updated'));
        },
        setTheme(t) {
            this.theme = t;
            localStorage.setItem('app_theme', t);
            document.body.classList.add('theme-transition');
            if (t === 'dark') document.body.classList.add('dark-theme');
            else document.body.classList.remove('dark-theme');
            
            // Sync Segmented Buttons
            document.querySelectorAll('.theme-selector .seg-btn').forEach(b => b.classList.remove('active'));
            const activeId = t === 'dark' ? 'segThemeDark' : 'segThemeLight';
            const activeBtn = document.getElementById(activeId);
            if (activeBtn) activeBtn.classList.add('active');

            setTimeout(() => document.body.classList.remove('theme-transition'), 300);
            logToDebug(`Theme changed to ${t}`, 'info');
        },
        setPalette(p) {
            this.palette = p;
            localStorage.setItem('app_palette', p);
            
            // Remove existing palette classes
            document.body.classList.remove('palette-classic', 'palette-emerald', 'palette-ruby', 'palette-azure');
            document.body.classList.add('palette-' + p);
            
            // Sync Segmented Buttons
            document.querySelectorAll('.palette-selector .seg-btn').forEach(b => b.classList.remove('active'));
            const paletteMap = { 'classic': 'segPalClassic', 'emerald': 'segPalEmerald', 'ruby': 'segPalRuby', 'azure': 'segPalAzure' };
            const activeBtn = document.getElementById(paletteMap[p]);
            if (activeBtn) activeBtn.classList.add('active');
            
            logToDebug(`Palette changed to ${p}`, 'info');
        },
        setEffects(mode) {
            this.effectsMode = mode;
            localStorage.setItem('app_effects', mode);
            document.body.classList.remove('no-blur', 'no-dim');
            
            if (mode === 'dim') document.body.classList.add('no-blur');
            if (mode === 'clean') document.body.classList.add('no-blur', 'no-dim');
            
            // Sync Segmented Buttons
            document.querySelectorAll('.effects-selector .seg-btn').forEach(b => b.classList.remove('active'));
            const activeId = 'segEffect' + mode.charAt(0).toUpperCase() + mode.slice(1);
            const activeBtn = document.getElementById(activeId);
            if (activeBtn) activeBtn.classList.add('active');

            logToDebug(`Visual effects: ${mode}`, 'info');
        },
        toggleSidebar() {
            this.sidebarCollapsed = !this.sidebarCollapsed;
            localStorage.setItem('sidebar_collapsed', this.sidebarCollapsed);
            document.dispatchEvent(new Event('app:sidebar_toggled'));
        },
        getAuthToken() {
            const t = localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
            return t.replace(/["']/g, '').trim();
        }
    };
    // ========================================
    // UTILITIES & GENERATORS
    // ========================================
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // ========================================
    // SYNC MANAGER (The Brain of Data Hub)
    // ========================================
    const SyncManager = {
        isDirty: false,
        isSyncing: false,
        syncTimer: null,
        lastSuccess: Date.now(),

        markDirty() {
            this.isDirty = true;
            this.updateUI('dirty');
            if (this.syncTimer) clearTimeout(this.syncTimer);
            this.syncTimer = setTimeout(() => this.syncNow(), 2000); // 2s debounce
        },

        updateUI(state) {
            const btn = document.getElementById('syncStatus');
            const icon = document.getElementById('syncStatusIcon');
            if (!btn || !icon) return;

            btn.classList.remove('syncing', 'success', 'error');
            
            if (state === 'syncing') {
                btn.classList.add('syncing');
                icon.className = 'ph ph-cloud-arrow-up';
                btn.title = 'Синхронизация данных...';
            } else if (state === 'success') {
                btn.classList.add('success');
                icon.className = 'ph ph-cloud-check';
                btn.title = 'Данные защищены в облаке';
            } else if (state === 'error') {
                btn.classList.add('error');
                icon.className = 'ph ph-cloud-warning';
                btn.title = 'Ошибка сохранения! Проверьте интернет.';
            } else if (state === 'dirty') {
                icon.className = 'ph ph-cloud-arrow-up';
                btn.title = 'Есть несохраненные изменения (нажмите для сохранения)';
            }
        },

        async syncNow() {
            if (this.isSyncing) return;
            if (this.syncTimer) clearTimeout(this.syncTimer);
            
            // Full snapshot sync is disabled. We now sync granularly to Supabase in the DB object.
            this.isDirty = false;
            this.lastSuccess = Date.now();
            this.updateUI('success');
        }
    };

    // Exit Guard
    window.addEventListener('beforeunload', (e) => {
        if (SyncManager.isDirty || SyncManager.isSyncing) {
            e.preventDefault();
            e.returnValue = 'У вас есть несохраненные изменения. Вы уверены, что хотите выйти?';
            return e.returnValue;
        }
    });

    // Cloud Button - Force Sync on click
    document.getElementById('syncStatus')?.addEventListener('click', () => {
        logToDebug('Manual Sync Triggered', 'info');
        SyncManager.syncNow();
    });

    if (!AppStore.sessionAuth) {
        window.location.href = 'login.html';
        return;
    }

    // ========================================
    // SIDEBAR USER INFO
    // ========================================
    const sidebarUserName = document.getElementById('sidebarUserName');
    const sidebarUserRole = document.getElementById('sidebarUserRole');
    const sidebarUserAvatar = document.getElementById('sidebarUserAvatar');

    try {
        if (sidebarUserName) sidebarUserName.textContent = AppStore.userName;

        if (sidebarUserRole) {
            const rolesMap = {
                'chef': 'Шеф-повар',
                'souschef': 'Су-шеф',
                'manager': 'Управляющий',
                'owner': 'Владелец',
                'cook': 'Повар',
                'accountant': 'Бухгалтер',
                'confectioner': 'Кондитер'
            };
            sidebarUserRole.textContent = rolesMap[AppStore.userRole] || AppStore.userRole || 'Владелец';
        }

        if (sidebarUserAvatar) {
            if (AppStore.userAvatar) {
                sidebarUserAvatar.innerHTML = `<img src="${AppStore.userAvatar}" alt="${AppStore.userName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                sidebarUserAvatar.style.background = 'transparent';
                sidebarUserAvatar.style.color = 'transparent';
                sidebarUserAvatar.style.padding = '0';
                sidebarUserAvatar.style.overflow = 'hidden';
            } else {
                const words = AppStore.userName.trim().split(/\s+/);
                let initials = words[0] ? words[0][0] : 'П';
                if (words.length > 1) initials += words[1][0];
                sidebarUserAvatar.textContent = initials.toUpperCase();
            }
        }
    } catch (e) {
        console.warn('Sidebar UI update failed:', e);
    }

    // ========================================
    // LOCAL PERSISTENCE HELPERS
    // ========================================
    function saveLocal(key, data) {
        try { localStorage.setItem('pv_' + key, JSON.stringify(data)); } catch (e) { }
    }
    function loadLocal(key, defaultVal = []) {
        try { 
            const val = localStorage.getItem('pv_' + key);
            if (!val) return defaultVal;
            const parsed = JSON.parse(val);
            // Type check: If default is array, parsed must be array
            if (Array.isArray(defaultVal) && !Array.isArray(parsed)) throw new Error('Type mismatch');
            return parsed;
        } catch (e) { 
            console.warn(`Provisio: Local data corrupted for [${key}]. Wiping...`);
            localStorage.removeItem('pv_' + key);
            return defaultVal; 
        }
    }
    function ensureArray(val) {
        return Array.isArray(val) ? val : [];
    }

    // Exit Guard - Prevent data loss during sync
    window.addEventListener('beforeunload', (e) => {
        if (activeRequestsCount > 0) {
            e.preventDefault();
            e.returnValue = 'У вас есть несохраненные изменения. Вы уверены, что хотите выйти?';
            return e.returnValue;
        }
    });

    // ========================================
    // SEED DEMO DATA
    // ========================================
    // Seed logic disabled to prevent confusion during backend setup
    // ========================================
    // DEBUG WINDOW DRAG LOGIC
    // ========================================
    function initDebugDrag() {
        const debugWindow = document.getElementById('debugWindow');
        const debugHeader = document.getElementById('debugHeader');
        if (!debugWindow || !debugHeader) return;

        let active = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        // Load saved position
        const savedPos = loadLocal('debug_pos');
        if (savedPos) {
            xOffset = savedPos.x;
            yOffset = savedPos.y;
            debugWindow.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0)`;
        }

        debugHeader.addEventListener("mousedown", dragStart);
        document.addEventListener("mousemove", drag);
        document.addEventListener("mouseup", dragEnd);

        function dragStart(e) {
            if (e.target === debugHeader || debugHeader.contains(e.target)) {
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
                active = true;
                debugWindow.style.transition = 'none'; // No transition during drag
            }
        }

        function drag(e) {
            if (active) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                xOffset = currentX;
                yOffset = currentY;
                debugWindow.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
            }
        }

        function dragEnd() {
            if (active) {
                initialX = currentX;
                initialY = currentY;
                active = false;
                debugWindow.style.transition = 'transform 0.2s cubic-bezier(0.17, 0.67, 0.83, 0.67)';
                saveLocal('debug_pos', { x: xOffset, y: yOffset });
            }
        }
    }

    // ========================================
    // API CONFIG & REQUEST
    // ========================================
    const API_BASE = 'https://n8n.shopluminova.online/webhook';
    const currencySymbols = { KZT: '₸', EUR: '€', USD: '$', RUB: '₽', BYN: 'Br', UZS: 'сўм', KGS: 'сом', AMD: '֏', AZN: '₼', TJS: 'смн', MDL: 'L', TMT: 'm' };
    let currentCurrency = AppStore.currency;

    function formatMoney(amount, decimals) {
        const d = (decimals === undefined) ? 2 : decimals;
        const sym = currencySymbols[currentCurrency] || currentCurrency || '₸';
        const num = Number(amount) || 0;
        const formatted = num.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
        return `${formatted} ${sym}`;
    }

    // ========================================
    // DATA STORE
    // ========================================
    let recipes = [];
    let inventoryCategories = ['Молочные', 'Мясо', 'Сухие', 'Овощи', 'Яйца', 'Специи', 'Напитки'];
    let inventory = [];
    let ingredients = [];
    let menuItems = [];
    let orders = [];
    let suppliers = [];
    let supplierGroups = ['Молочная продукция', 'Мясо', 'Овощи', 'Специи', 'Морепродукты', 'Бакалея'];
    let team = [];
    let notifications = [];
    let auditLogs = [];
    let confirmedDeliveries = [];
    let rejectedDeliveries = [];
    const foodcostData = { 7: [], 30: [], 90: [] };

    // ========================================
    // UTILITIES
    // ========================================
    function getNoun(number, one, two, five) {
        let n = Math.abs(number);
        n %= 100;
        if (n >= 5 && n <= 20) return five;
        n %= 10;
        if (n === 1) return one;
        if (n >= 2 && n <= 4) return two;
        return five;
    }

    /**
     * getConversionFactor
     * Calculates multiplier to convert from fixed units (kg, g, l, ml, pcs) 
     * or abstract units (pinch, cup) to a target unit.
     */
    function getConversionFactor(ingredient, fromUnit, toUnit) {
        if (!fromUnit || !toUnit) return 1;
        const fU = String(fromUnit).toLowerCase().trim();
        const tU = String(toUnit).toLowerCase().trim();
        if (fU === tU) return 1;

        const units = {
            'г': { type: 'weight', factor: 1 },
            'кг': { type: 'weight', factor: 1000 },
            'мл': { type: 'volume', factor: 1 },
            'л': { type: 'volume', factor: 1000 },
            'шт': { type: 'pcs', factor: 1 }
        };

        const f = units[fU];
        const t = units[tU];

        // 1. Standard Metric (e.g. g -> kg, ml -> l)
        if (f && t && f.type === t.type) {
            return f.factor / t.factor;
        }

        // 2. Custom (Abstract) Units from Master Ingredient
        if (ingredient && Array.isArray(ingredient.conversions)) {
            const conv = ingredient.conversions.find(c => c.unit.toLowerCase() === fU);
            if (conv) {
                // Conversion factor from custom unit to its base (g or ml)
                const toBaseFactor = getConversionFactor(ingredient, conv.baseUnit || 'г', tU);
                return conv.qty * toBaseFactor;
            }
            
            const convReverse = ingredient.conversions.find(c => c.unit.toLowerCase() === tU);
            if (convReverse) {
                const fromBaseFactor = getConversionFactor(ingredient, fU, convReverse.baseUnit || 'г');
                return fromBaseFactor / convReverse.qty;
            }
        }

        // 3. Density (volume <-> weight)
        if (f && t && f.type !== t.type && (f.type === 'weight' || f.type === 'volume') && (t.type === 'weight' || t.type === 'volume')) {
            const density = parseFloat(ingredient?.density) || 1.0;
            if (f.type === 'volume' && t.type === 'weight') {
                // ml to g: grams = ml * density. Then scale to target unit.
                return density * (f.factor / t.factor);
            } else {
                // g to ml: ml = grams / density. Then scale to target unit.
                return (1 / density) * (f.factor / t.factor);
            }
        }

        // 4. Global Fallbacks for common abstract units
        if (fU === 'стакан' && tU === 'мл') return parseFloat(document.getElementById('global_cup_ml')?.value || 240);
        if (fU === 'стакан' && tU === 'г') return parseFloat(document.getElementById('global_cup_ml')?.value || 240) * (parseFloat(ingredient?.density_g_ml) || 1.0);
        if (fU === 'щепотка' && tU === 'г') return parseFloat(document.getElementById('global_pinch_g')?.value || 2);

        return 1;
    }

    // ========================================
    // API & SYNC
    // ========================================
    let lastSyncTimestamp = Date.now();
    function setSyncStatus(status) {
        const wrapper = document.getElementById('syncStatus');
        const icon = document.getElementById('syncStatusIcon');
        if (!icon || !wrapper) return;

        // Reset
        wrapper.className = 'sync-status topbar-btn';
        icon.className = 'ph';
        
        if (status === 'syncing') {
            wrapper.classList.add('syncing');
            icon.classList.add('ph-arrows-clockwise');
            wrapper.title = 'Синхронизация...';
        } else if (status === 'failed') {
            wrapper.classList.add('failed');
            icon.classList.add('ph-cloud-slash');
            wrapper.title = 'Ошибка синхронизации';
        } else if (status === 'offline') {
            wrapper.classList.add('failed');
            icon.classList.add('ph-cloud-slash');
            wrapper.title = 'Офлайн режим';
        } else if (status === 'synced') {
            lastSyncTimestamp = Date.now();
            wrapper.classList.add('success');
            icon.classList.add('ph-cloud-check');
            updateSyncTooltip();
            
            // Return to cloud icon after 3s
            setTimeout(() => {
                if (wrapper.classList.contains('success')) {
                    wrapper.classList.remove('success');
                    icon.className = 'ph ph-cloud';
                }
            }, 3000);
        } else {
            wrapper.classList.remove('success', 'failed', 'syncing');
            icon.className = 'ph ph-cloud';
            updateSyncTooltip();
        }
    }

    function updateSyncTooltip() {
        const wrapper = document.getElementById('syncStatus');
        if (!wrapper) return;
        const diff = Math.floor((Date.now() - lastSyncTimestamp) / 1000);
        let timeStr = 'только что';
        if (diff >= 60) {
            const mins = Math.floor(diff / 60);
            timeStr = `${mins} мин. назад`;
        } else if (diff > 5) {
            timeStr = `${diff} сек. назад`;
        }
        wrapper.title = `Данные защищены (Сохранено ${timeStr})`;
    }

    // Update tooltip timer every 30s
    setInterval(updateSyncTooltip, 30000);

    let activeRequestsCount = 0;
    async function apiRequest(endpoint, method = 'POST', body = null, silent = false) {
        activeRequestsCount++;
        setSyncStatus('syncing');

        const MAX_RETRIES = 3; 

        const fetchLogic = async (attempt) => {
            const token = AppStore.getAuthToken();
            if (!token && !endpoint.includes('auth')) {
                throw new Error('NO_TOKEN');
            }

            // Clean URL: ensure no double slashes except protocol, and encode Special characters
            const sanitizedEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
            const fullUrl = encodeURI(`${API_BASE}${sanitizedEndpoint}`);

            console.log(`%c[DEBUG] API Request to ${fullUrl}: %o`, 'color: #3498db; font-weight: bold;', body);

            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body || {})
            };

            const res = await fetch(fullUrl, options);
            
            // Handle errors
            if (!res.ok) {
                const text = await res.text();
                let result = {};
                try { result = text ? JSON.parse(text) : {}; } catch (e) { }
                
                if (res.status === 401 || result.error === 'Сессия не найдена в базе') {
                    throw new Error('SESSION_LOST');
                }
                throw new Error(result.error || `Сервер вернул ошибку ${res.status}`);
            }

            // Safe JSON parsing
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                try {
                    return await res.json();
                } catch (e) {
                    console.warn('JSON Parse Error, possible empty response', e);
                    return { success: true };
                }
            }
            return { success: true };
        };

        try {
            let lastErr;
            for (let i = 1; i <= MAX_RETRIES; i++) {
                try {
                    const result = await fetchLogic(i);
                    activeRequestsCount--;
                    if (activeRequestsCount <= 0) {
                        activeRequestsCount = 0;
                        setTimeout(() => setSyncStatus('synced'), 500);
                    }
                    return result;
                } catch (err) {
                    lastErr = err;
                    if (err.message === 'SESSION_LOST' || err.message === 'NO_TOKEN') throw err;
                    
                    if (i < MAX_RETRIES) {
                        const delay = 1000 * i;
                        logToDebug(`Sync attempt ${i} failed for ${endpoint}. Retrying in ${delay}ms...`, 'warning');
                        await new Promise(r => setTimeout(r, delay));
                    }
                }
            }
            throw lastErr;
        } catch (err) {
            activeRequestsCount--;
            if (activeRequestsCount < 0) activeRequestsCount = 0;
            
            if (err.message === 'SESSION_LOST' || err.message === 'NO_TOKEN') {
                logToDebug(`Auth Error: Session lost.`, 'error');
                if (!silent) {
                    alert("ОШИБКА АВТОРИЗАЦИИ: Пожалуйста, войдите снова.");
                    window.location.href = 'login.html';
                }
            } else {
                logToDebug(`API FAIL [${endpoint}]: ${err.message}`, 'error');
                setSyncStatus('failed');
                // Update debug window last api status
                const lastApiEl = document.getElementById('debugLastApi');
                if (lastApiEl) {
                    lastApiEl.textContent = `ERR: ${err.message.substring(0, 20)}`;
                    lastApiEl.style.color = '#ff6b6b';
                }
            }
            throw err;
        }
    }

    // ========================================
    // CENTRALIZED DATA SERVICE (DB)
    // ========================================
    const DB = window.Provisio.DB || {};;

    // ========================================
    // LOADING STATE HELPER
    // ========================================
    function showLoadingState(tbodyId, colspan = 8) {
        const tbody = document.getElementById(tbodyId);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; padding: 48px; color: var(--text-muted);">
                <i class="ph ph-circle-notch" style="font-size: 28px; animation: spin 1s linear infinite; display: inline-block;"></i>
                <div style="margin-top: 12px; font-size: 14px;">Загрузка данных...</div>
            </td></tr>`;
        }
    }

    // ========================================
    // LOAD FUNCTIONS
    // ========================================
    async function loadRecipes() {
        try {
            showLoadingState('recipesTableBody', 6);
            await DB.recipes.list();
            if (typeof renderRecipesTable === 'function') renderRecipesTable();
            if (typeof renderHighMarginDishes === 'function') renderHighMarginDishes();
            setTimeout(() => { if (window.ReactiveEngine) window.ReactiveEngine.recalculateAll(true); }, 500);
        } catch (err) {
            console.error('Failed to load recipes:', err);
            if (typeof renderRecipesTable === 'function') renderRecipesTable();
        }
    }

    async function loadInventory() {
        try {
            showLoadingState('inventoryTableBody', 8);
            await DB.inventory.list();
            autoLinkInventoryToIngredients();
            calculateInventoryValuation();
            if (typeof renderInventoryTable === 'function') renderInventoryTable();
            if (typeof renderEditableCategories === 'function') renderEditableCategories();
        } catch (err) {
            console.error('Failed to load inventory:', err);
            if (typeof renderInventoryTable === 'function') renderInventoryTable();
        }
    }

    function autoLinkInventoryToIngredients() {
        if (!ingredients.length || !inventory.length) return;
        inventory.forEach(item => {
            const master = ingredients.find(i => i.name.toLowerCase().trim() === item.name.toLowerCase().trim());
            if (master && !item.ingredient_id) {
                item.ingredient_id = master.id;
                DB.inventory.update(item).catch(() => { });
            }
        });
    }

    function calculateInventoryValuation() {
        let total = 0;
        inventory.forEach(item => { total += (parseFloat(item.quantity || item.qty) || 0) * (parseFloat(item.average_price || item.price) || 0); });
        const valElement = document.getElementById('inventoryValuationValue');
        if (valElement) {
            valElement.textContent = formatMoney(total);
        }
    }

    async function loadIngredients() {
        try {
            showLoadingState('ingredientsTableBody', 6);
            await DB.ingredients.list();
            if (typeof renderIngredientsTable === 'function') renderIngredientsTable();
            if (typeof window.renderCalculator === 'function') window.renderCalculator();
        } catch (err) {
            console.error('Failed to load ingredients:', err);
            if (typeof renderIngredientsTable === 'function') renderIngredientsTable();
        }
    }

    async function loadMenuItems() {
        try {
            showLoadingState('menuItemsTableBody', 8);
            await DB.menuItems.list();
            if (typeof renderMenuItemsTable === 'function') renderMenuItemsTable();
        } catch (err) {
            console.error('Failed to load menu items:', err);
            if (typeof renderMenuItemsTable === 'function') renderMenuItemsTable();
        }
    }

    async function loadOrders() {
        try {
            showLoadingState('ordersTableBody', 6);
            await DB.orders.list();
            if (typeof renderOrdersTable === 'function') renderOrdersTable();
        } catch (err) {
            console.error('Failed to load orders:', err);
            if (typeof renderOrdersTable === 'function') renderOrdersTable();
        }
    }

    async function loadDashboardStats() {
        try {
            const data = await DB.dashboard.stats();
            if (data) {
                if (data.revenue !== undefined) { const el = document.querySelector('#tab-dashboard .kpi-card:first-child .kpi-value'); if (el) el.textContent = formatMoney(Number(data.revenue), 0); }
                if (data.avg_foodcost !== undefined) { const el = document.getElementById('kpiFoodcost'); if (el) el.textContent = data.avg_foodcost + '%'; }
                if (data.recipe_count !== undefined) { const el = document.getElementById('kpiRecipeCount'); if (el) el.textContent = data.recipe_count; }
                
                // Use local truth for counts to avoid mock residue
                const teamEl = document.getElementById('kpiTeamCount');
                if (teamEl) teamEl.textContent = team.length;
                
                const menuEl = document.getElementById('kpiMenuItemsCount');
                if (menuEl) menuEl.textContent = menuItems.length;
                
                const ordersEl = document.getElementById('kpiOrdersCount');
                if (ordersEl) ordersEl.textContent = orders.length;
            }
        } catch (err) { console.log('Dashboard stats unavailable'); }
    }

    async function parseMenuWithAI(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const base64 = reader.result.split(',')[1];
                    showToast('AI анализирует техкарту...', 'info');
                    const data = await apiRequest('/ai/parse-menu', 'POST', { image: base64, mimeType: file.type || 'image/jpeg' });
                    resolve(data);
                } catch (err) { reject(err); }
            };
            reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
            reader.readAsDataURL(file);
        });
    }

    // ========================================
    // AUDIT LOG
    // ========================================
    function logAction(action, objectType, objectName, details) {
        const entry = { id: Date.now(), time: new Date().toLocaleString(), user: localStorage.getItem('user_name') || 'Админ', action, objectType, objectName, details };
        auditLogs.unshift(entry);
        if (auditLogs.length > 50) auditLogs.pop();
        if (typeof renderAuditLog === 'function') renderAuditLog();
        if (typeof DB !== 'undefined' && DB.audit && DB.audit.create) {
            DB.audit.create({ action, entity_type: objectType, entity_name: objectName, details }).catch(err => console.error('Audit log persist error:', err));
        }
    }

    function renderAuditLog() {
        const tbody = document.getElementById('auditLogTableBody');
        if (!tbody) return;
        tbody.innerHTML = auditLogs.map(log => `
            <tr>
                <td><small>${log.time}</small></td>
                <td>${log.user}</td>
                <td><span class="badge ${getAuditBadgeClass(log.action)}">${log.action}</span></td>
                <td><strong>${log.objectType}</strong>: ${log.objectName}</td>
                <td><small>${log.details}</small></td>
            </tr>
        `).join('');
    }

    function getAuditBadgeClass(action) {
        if (action.includes('создан') || action.includes('Добавлен')) return 'badge-success';
        if (action.includes('Удалено') || action.includes('удалён')) return 'badge-danger';
        return 'badge-info';
    }

    document.getElementById('clearAuditLogBtn')?.addEventListener('click', () => {
        auditLogs = [];
        renderAuditLog();
        showToast('Журнал очищен');
    });

    function calculateInventoryValuation() {
        if (!Array.isArray(inventory)) return 0;
        const total = inventory.reduce((sum, item) => sum + (parseFloat(item.quantity || item.qty || 0) * parseFloat(item.average_price || item.price || 0)), 0);
        
        // Update all valuation displays
        const displays = document.querySelectorAll('.inventory-valuation, #debugInventoryValuation');
        const formatted = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'USD' }).format(total);
        
        displays.forEach(el => {
            if (el.id === 'debugInventoryValuation') el.textContent = formatted;
            else el.textContent = formatted;
        });

        // Specific fix for the top-bar valuation if it exists
        const evalEl = document.querySelector('.evaluation-value');
        if (evalEl) evalEl.textContent = formatted;

        return total;
    }

    // ========================================
    // TOAST (temporary — will be overwritten by admin-ui.js)
    // ========================================
    function showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) { console.log(`[TOAST ${type}] ${message}`); return; }
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icons = { success: 'ph-check-circle', error: 'ph-x-circle', info: 'ph-info' };
        toast.innerHTML = `<i class="ph ${icons[type] || icons.info}"></i><span>${message}</span>`;
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // ========================================
    // EXPORT VIA GLOBAL NAMESPACE
    // ========================================
    function updateDebugState(state) {
        logToDebug(`CC_STATE: ${state}`, 'info');
    }

    const ProvisioNamespace = {
        AppStore,
        DB,
        apiRequest,
        setSyncStatus,
        showLoadingState,
        getNoun,
        logAction,
        renderAuditLog,
        getAuditBadgeClass,
        parseMenuWithAI,
        autoLinkInventoryToIngredients,
        calculateInventoryValuation,
        getConversionFactor,
        
        // Data accessors
        get recipes() { return recipes; },
        set recipes(v) { recipes = v; },
        get inventory() { return inventory; },
        set inventory(v) { inventory = v; },
        get inventoryCategories() { return inventoryCategories; },
        set inventoryCategories(v) { inventoryCategories = v; },
        get ingredients() { return ingredients; },
        set ingredients(v) { ingredients = v; },
        get menuItems() { return menuItems; },
        set menuItems(v) { menuItems = v; },
        get orders() { return orders; },
        set orders(v) { orders = v; },
        get suppliers() { return suppliers; },
        set suppliers(v) { suppliers = v; },
        get supplierGroups() { return supplierGroups; },
        set supplierGroups(v) { supplierGroups = v; },
        get team() { return team; },
        set team(v) { team = v; },
        get notifications() { return notifications; },
        set notifications(v) { notifications = v; },
        get auditLogs() { return auditLogs; },
        set auditLogs(v) { auditLogs = v; },
        get confirmedDeliveries() { return confirmedDeliveries; },
        set confirmedDeliveries(v) { confirmedDeliveries = v; },
        get rejectedDeliveries() { return rejectedDeliveries; },
        set rejectedDeliveries(v) { rejectedDeliveries = v; },
        get foodcostData() { return foodcostData; },
        get currentCurrency() { return currentCurrency; },
        set currentCurrency(v) { currentCurrency = v; },
        get currencySymbols() { return currencySymbols; },
        formatMoney,
        get API_BASE() { return API_BASE; },

        // Load functions
        loadRecipes,
        loadInventory,
        loadIngredients,
        loadMenuItems,
        loadOrders,
        loadDashboardStats,

        // Debug/Maintenance
        resetLocalData,
        initDebugDrag,
        toggleDebugWindow,

        // Toast
        showToast
    };

    window.Provisio = ProvisioNamespace;
    window.showToast = showToast;
    window.resetLocalData = resetLocalData;
    window.toggleDebugWindow = toggleDebugWindow;

    // ========================================
    // GLOBAL BOOTSTRAP INITIALIZATION
    // ========================================
    window.addEventListener('load', async () => {
        logToDebug('System Bootstrap Started...', 'info');
        
        // Apply saved theme & effects
        AppStore.setTheme(AppStore.theme);
        AppStore.setEffects(AppStore.effectsMode);
        AppStore.setPalette(AppStore.palette);
        
        // Init Drag & Tools
        initDebugDrag();
        setupBlurBtn();
        setInterval(updateDebugTime, 1000);

        // Init tooltips: create popup children and use fixed positioning to escape overflow:hidden parents
        window.initTooltips = function() {
            document.querySelectorAll('.tooltip-trigger[data-tooltip]').forEach(trigger => {
                if (trigger._tooltipInited) return;
                trigger._tooltipInited = true;

                if (!trigger.querySelector('.tooltip-popup')) {
                    const popup = document.createElement('span');
                    popup.className = 'tooltip-popup';
                    popup.textContent = trigger.dataset.tooltip;
                    trigger.appendChild(popup);
                }

                const popup = trigger.querySelector('.tooltip-popup');

                trigger.addEventListener('mouseenter', () => {
                    const rect = trigger.getBoundingClientRect();
                    const popupW = 240;
                    let left = rect.left + rect.width / 2;
                    // clamp so it doesn't go off-screen
                    left = Math.max(popupW / 2 + 8, Math.min(left, window.innerWidth - popupW / 2 - 8));
                    popup.style.cssText = `position:fixed;bottom:auto;left:${left}px;top:${rect.top - 12}px;transform:translateX(-50%) translateY(-100%);z-index:9999;opacity:1;width:${popupW}px;pointer-events:none;`;
                });

                trigger.addEventListener('mouseleave', () => {
                    popup.style.opacity = '0';
                });
            });
        };
        window.initTooltips();
        
        // Initial Full Data Sync
        try {
            await Promise.allSettled([
                ProvisioNamespace.loadRecipes(),
                ProvisioNamespace.loadInventory(),
                ProvisioNamespace.loadIngredients(),
                ProvisioNamespace.loadMenuItems(),
                ProvisioNamespace.loadOrders(),
                ProvisioNamespace.loadDashboardStats(),
                (typeof window.loadSuppliers === 'function' ? window.loadSuppliers() : Promise.resolve()),
                (typeof window.loadTeam === 'function' ? window.loadTeam() : Promise.resolve())
            ]);
            logToDebug('Initial Sync Completed', 'success');
        } catch (e) {
            logToDebug('Initial Sync Failed', 'error');
        }
    });

    // ========================================
    // CONTROL CENTER TOOLS (Flattened scope)
    // ========================================
    const sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown'];
    let buffer = [];
    let timer = null;

    window.addEventListener('keydown', (e) => {
        if (buffer.length === 0) timer = setTimeout(() => { buffer = []; }, 2000);
        buffer.push(e.key);
        const isMatch = buffer.every((key, i) => key === sequence[i]);
        if (isMatch && buffer.length === sequence.length) {
            clearTimeout(timer);
            buffer = [];
            toggleDebugWindow();
        } else if (!sequence[buffer.length - 1] || e.key !== sequence[buffer.length - 1]) {
            clearTimeout(timer);
            buffer = [];
            if (e.key === sequence[0]) {
                buffer.push(e.key);
                timer = setTimeout(() => { buffer = []; }, 2000);
            }
        }
    });

    function updateDebugTime() {
        const el = document.getElementById('debugTime');
        if (el) el.textContent = new Date().toLocaleTimeString('ru-RU', { hour12: false });
    }

    async function resetLocalData() {
        if (!confirm('ВНИМАНИЕ: Это удалит ВСЕ локальные данные (кеш) и перезагрузит страницу. Данные на сервере сохранятся. Продолжить?')) return;
        
        if (email) localStorage.setItem('user_email', email);
        if (role) localStorage.setItem('user_role', role);
        localStorage.setItem('auth_session', 'true');
        
        window.location.reload();
    }

    function toggleDebugWindow() {
        const win = document.getElementById('debugWindow');
        if (!win) return;
        const isHidden = window.getComputedStyle(win).display === 'none';
        win.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) {
            updateDebugTime();
            updateDebugState('OPEN_WINDOW');
            initDebugDrag();
        }
    }

    function setupBlurBtn() {
        const blurBtn = document.getElementById('debugToggleBlur');
        if (blurBtn && !blurBtn.dataset.listener) {
            blurBtn.addEventListener('click', () => {
                document.body.classList.toggle('no-blur-mode');
                if (window.showToast) window.showToast('Режим эффектов изменен', 'info');
            });
            blurBtn.dataset.listener = 'true';
        }
    }

    console.log('%c[PROVISIO]%c Core module loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
