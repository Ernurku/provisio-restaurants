/* ============================================
   PROVISIO — Database Operations Module
   Decoupled from admin-core.js
   ============================================ */

window.Provisio = window.Provisio || {};

(function () {
    let currentUserId = null;
    if (window.supabase && window.supabase.auth) {
        window.supabase.auth.getSession().then(({ data }) => {
            if (data?.session?.user) currentUserId = data.session.user.id;
        }).catch(() => {});
    }

    // ========================================
    // LOCAL STORAGE PERSISTENCE HELPERS
    // ========================================
    function saveLocal(key, data) {
        try { localStorage.setItem('pv_' + key, JSON.stringify(data)); } catch (e) { }
    }
    function loadLocal(key, defaultVal = []) {
        try { 
            const val = localStorage.getItem('pv_' + key);
            if (!val) return defaultVal;
            const parsed = JSON.parse(val);
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

    // ========================================
    // COLUMN WHITELISTS — only these fields go to Supabase
    // ========================================
    const SUPPLIER_COLS = ['id','user_id','name','prices','groups','schedule','created_at'];
    const RECIPE_COLS   = ['id','user_id','name','category','label_tag','label','ingredients','labor','sub_recipes','nutrition','yield_quantity','yield_unit','finished_weight','sale_price','price','calculated_cost','cost','instructions','created_at'];

    function sanitize(obj, whitelist) {
        const clean = {};
        for (const key of whitelist) {
            if (obj.hasOwnProperty(key)) clean[key] = obj[key];
        }
        return clean;
    }

    // ========================================
    // EXTERNAL HELPERS FALLBACKS
    // ========================================
    function apiRequest(...args) {
        if (window.Provisio && typeof window.Provisio.apiRequest === 'function') {
            return window.Provisio.apiRequest(...args);
        }
        console.error('Provisio apiRequest not initialized yet');
    }

    function updateDebugState(state) {
        if (window.Provisio && typeof window.Provisio.updateDebugState === 'function') {
            return window.Provisio.updateDebugState(state);
        }
        console.log(`[DEBUG] CC_STATE: ${state}`);
    }

    const AppStore = {
        setCurrency(c) {
            if (window.Provisio && window.Provisio.AppStore && typeof window.Provisio.AppStore.setCurrency === 'function') {
                window.Provisio.AppStore.setCurrency(c);
            }
        }
    };

    // ========================================
    // RECIPE JSONB NORMALIZER
    // Ensures ingredients/labor/sub_recipes are always arrays, not strings.
    // Applied after list(), create(), and update() so editRecipe() never sees a raw JSON string.
    // ========================================
    function normalizeRecipe(r) {
        if (typeof r.ingredients === 'string') { try { r.ingredients = JSON.parse(r.ingredients); } catch (e) { r.ingredients = []; } }
        if (!Array.isArray(r.ingredients)) r.ingredients = [];
        if (typeof r.labor === 'string') { try { r.labor = JSON.parse(r.labor); } catch (e) { r.labor = []; } }
        if (!Array.isArray(r.labor)) r.labor = [];
        if (typeof r.sub_recipes === 'string') { try { r.sub_recipes = JSON.parse(r.sub_recipes); } catch (e) { r.sub_recipes = []; } }
        if (!Array.isArray(r.sub_recipes)) r.sub_recipes = [];
        if (typeof r.nutrition === 'string') { try { r.nutrition = JSON.parse(r.nutrition); } catch (e) { r.nutrition = {}; } }
    }

    // ========================================
    // DATABASE CRUD OBJECT
    // ========================================
    const DB = {
        recipes: {
            list: async () => {
                const { data, error } = await supabase.from('recipes').select('*').order('created_at', { ascending: false });
                if (error) { console.warn('Recipes fetch fail', error); return loadLocal('recipes', []); }
                let list = data || [];
                list.forEach(normalizeRecipe);
                window.Provisio.recipes = list;
                saveLocal('recipes', window.Provisio.recipes);
                return window.Provisio.recipes;
            },
            create: async (itemData) => {
                if (!itemData.id) delete itemData.id;
                if (!itemData.user_id && currentUserId) itemData.user_id = currentUserId;
                const clean = sanitize(itemData, RECIPE_COLS);
                const { data, error } = await supabase.from('recipes').insert(clean).select().single();
                if (error) throw error;
                normalizeRecipe(data);
                window.Provisio.recipes.unshift(data);
                saveLocal('recipes', window.Provisio.recipes);
                if (typeof renderRecipesTable === 'function') renderRecipesTable();
                return { id: data.id };
            },
            update: async (itemData) => {
                const clean = sanitize(itemData, RECIPE_COLS);
                const { data, error } = await supabase.from('recipes').update(clean).eq('id', itemData.id).select().single();
                if (error) throw error;
                normalizeRecipe(data);
                const idx = window.Provisio.recipes.findIndex(r => r.id === itemData.id);
                if (idx !== -1) window.Provisio.recipes[idx] = data;
                saveLocal('recipes', window.Provisio.recipes);
                if (typeof renderRecipesTable === 'function') renderRecipesTable();
                return { success: true };
            },
            delete: async (id) => {
                const { error } = await supabase.from('recipes').delete().eq('id', id);
                if (error) throw error;
                window.Provisio.recipes = window.Provisio.recipes.filter(r => r.id !== id);
                saveLocal('recipes', window.Provisio.recipes);
                if (typeof renderRecipesTable === 'function') renderRecipesTable();
                return { success: true };
            }
        },

        inventory: {
            list: async () => {
                const { data, error } = await supabase.from('inventory').select('*').order('created_at', { ascending: false });
                if (error) { console.warn('Inventory fetch fail', error); return loadLocal('inventory', []); }
                window.Provisio.inventory = (data || []).map(item => ({ ...item, minStock: item.minStock || item.min_stock || 0 }));
                saveLocal('inventory', window.Provisio.inventory);
                return window.Provisio.inventory;
            },
            add: async (itemData) => {
                if (!itemData.id) delete itemData.id;
                if (!itemData.user_id && currentUserId) itemData.user_id = currentUserId;
                const { data, error } = await supabase.from('inventory').insert(itemData).select().single();
                if (error) throw error;
                if (!Array.isArray(window.Provisio.inventory)) window.Provisio.inventory = [];
                window.Provisio.inventory.unshift(data);
                saveLocal('inventory', window.Provisio.inventory);
                if (typeof renderInventoryTable === 'function') renderInventoryTable();
                return data;
            },
            update: async (itemData) => {
                const { data, error } = await supabase.from('inventory').update(itemData).eq('id', itemData.id).select().single();
                if (error) throw error;
                const idx = window.Provisio.inventory.findIndex(i => i.id === itemData.id);
                if (idx !== -1) window.Provisio.inventory[idx] = data;
                saveLocal('inventory', window.Provisio.inventory);
                if (typeof renderInventoryTable === 'function') renderInventoryTable();
                return data;
            },
            delete: async (id) => {
                const { error } = await supabase.from('inventory').delete().eq('id', id);
                if (error) throw error;
                window.Provisio.inventory = window.Provisio.inventory.filter(i => i.id !== id);
                saveLocal('inventory', window.Provisio.inventory);
                if (typeof renderInventoryTable === 'function') renderInventoryTable();
                return { success: true };
            },
            logDelivery: async (logData) => {
                const { data, error } = await supabase.from('storage_logs').insert(logData);
                if (error) throw error;
                return data;
            }
        },

        ingredients: {
            list: async () => {
                const { data, error } = await supabase.from('ingredients').select('*').order('created_at', { ascending: false });
                if (error) { console.warn('Ingredients fetch fail', error); return loadLocal('ingredients', []); }
                window.Provisio.ingredients = (data || []).map(i => ({
                    ...i,
                    conversions: typeof i.conversions === 'string' ? JSON.parse(i.conversions) : ensureArray(i.conversions),
                    nutrition: typeof i.nutrition === 'string' ? JSON.parse(i.nutrition) : (i.nutrition || {}),
                    ep_percent: parseFloat(i.ep_percent) || parseFloat(i.edible_portion_pc) || 100,
                    density: parseFloat(i.density) || 1.0
                }));
                saveLocal('ingredients', window.Provisio.ingredients);
                return window.Provisio.ingredients;
            },
            create: async (itemData) => {
                if (!itemData.id) delete itemData.id;
                if (!itemData.user_id && currentUserId) itemData.user_id = currentUserId;
                const { data, error } = await supabase.from('ingredients').insert(itemData).select().single();
                if (error) throw error;
                window.Provisio.ingredients.unshift(data);
                saveLocal('ingredients', window.Provisio.ingredients);
                if (typeof renderIngredientsTable === 'function') renderIngredientsTable();
                return { id: data.id };
            },
            update: async (itemData) => {
                const { data, error } = await supabase.from('ingredients').update(itemData).eq('id', itemData.id).select().single();
                if (error) throw error;
                const idx = window.Provisio.ingredients.findIndex(i => i.id === itemData.id);
                if (idx !== -1) window.Provisio.ingredients[idx] = data;
                saveLocal('ingredients', window.Provisio.ingredients);
                if (typeof renderIngredientsTable === 'function') renderIngredientsTable();
                return { success: true };
            },
            delete: async (id) => {
                const { error } = await supabase.from('ingredients').delete().eq('id', id);
                if (error) throw error;
                window.Provisio.ingredients = window.Provisio.ingredients.filter(i => i.id !== id);
                saveLocal('ingredients', window.Provisio.ingredients);
                if (typeof renderIngredientsTable === 'function') renderIngredientsTable();
                return { success: true };
            }
        },

        menuItems: {
            list: async () => {
                const { data, error } = await supabase.from('menu_items').select('*').order('created_at', { ascending: false });
                if (error) { console.warn('Menu fetch fail', error); return loadLocal('menuItems', []); }
                window.Provisio.menuItems = data || [];
                saveLocal('menuItems', window.Provisio.menuItems);
                return window.Provisio.menuItems;
            },
            create: async (itemData) => {
                if (!itemData.id) delete itemData.id;
                if (!itemData.user_id && currentUserId) itemData.user_id = currentUserId;
                const { data, error } = await supabase.from('menu_items').insert(itemData).select().single();
                if (error) throw error;
                window.Provisio.menuItems.unshift(data);
                saveLocal('menuItems', window.Provisio.menuItems);
                if (typeof renderMenuItemsTable === 'function') renderMenuItemsTable();
                return { id: data.id };
            },
            update: async (itemData) => {
                const { data, error } = await supabase.from('menu_items').update(itemData).eq('id', itemData.id).select().single();
                if (error) throw error;
                const idx = window.Provisio.menuItems.findIndex(i => i.id === itemData.id);
                if (idx !== -1) window.Provisio.menuItems[idx] = data;
                saveLocal('menuItems', window.Provisio.menuItems);
                if (typeof renderMenuItemsTable === 'function') renderMenuItemsTable();
                return { success: true };
            },
            delete: async (id) => {
                const { error } = await supabase.from('menu_items').delete().eq('id', id);
                if (error) throw error;
                window.Provisio.menuItems = window.Provisio.menuItems.filter(i => i.id !== id);
                saveLocal('menuItems', window.Provisio.menuItems);
                if (typeof renderMenuItemsTable === 'function') renderMenuItemsTable();
                return { success: true };
            }
        },

        orders: {
            list: async () => {
                const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
                if (error) { console.warn('Orders fetch fail', error); return loadLocal('orders', []); }
                window.Provisio.orders = data || [];
                saveLocal('orders', window.Provisio.orders);
                return window.Provisio.orders;
            },
            create: async (itemData) => {
                if (!itemData.user_id && currentUserId) itemData.user_id = currentUserId;
                const { data, error } = await supabase.from('orders').insert(itemData).select().single();
                if (error) throw error;
                window.Provisio.orders.unshift(data);
                saveLocal('orders', window.Provisio.orders);
                if (typeof renderOrdersTable === 'function') renderOrdersTable();
                return { id: data.id };
            },
            update: async (itemData) => {
                const { data, error } = await supabase.from('orders').update(itemData).eq('id', itemData.id).select().single();
                if (error) throw error;
                const idx = window.Provisio.orders.findIndex(i => i.id === itemData.id);
                if (idx !== -1) window.Provisio.orders[idx] = data;
                saveLocal('orders', window.Provisio.orders);
                if (typeof renderOrdersTable === 'function') renderOrdersTable();
                return { success: true };
            },
            delete: async (id) => {
                const { error } = await supabase.from('orders').delete().eq('id', id);
                if (error) throw error;
                window.Provisio.orders = window.Provisio.orders.filter(i => i.id !== id);
                saveLocal('orders', window.Provisio.orders);
                if (typeof renderOrdersTable === 'function') renderOrdersTable();
                return { success: true };
            }
        },

        suppliers: {
            list: async () => {
                const { data, error } = await supabase.from('suppliers').select('*').order('created_at', { ascending: false });
                if (error) { console.warn('Suppliers fetch fail', error); return loadLocal('suppliers', []); }
                window.Provisio.suppliers = (data || []).map(s => ({
                    ...s,
                    prices: ensureArray(s.prices),
                    groups: ensureArray(s.groups),
                    schedule: ensureArray(s.schedule)
                }));
                saveLocal('suppliers', window.Provisio.suppliers);
                if (typeof updateDebugState === 'function') updateDebugState('SUP_LIST');
                return window.Provisio.suppliers;
            },
            upsert: async (supplier) => {
                let res;
                if (!supplier.id) delete supplier.id;
                if (!supplier.user_id && currentUserId) supplier.user_id = currentUserId;
                const clean = sanitize(supplier, SUPPLIER_COLS);
                if (clean.id) {
                    res = await supabase.from('suppliers').update(clean).eq('id', clean.id).select().single();
                } else {
                    res = await supabase.from('suppliers').insert(clean).select().single();
                }
                if (res.error) throw res.error;
                
                const normalized = { ...res.data, prices: ensureArray(res.data.prices), groups: ensureArray(res.data.groups), schedule: ensureArray(res.data.schedule) };
                const idx = window.Provisio.suppliers.findIndex(s => s.id === res.data.id);
                if (idx !== -1) window.Provisio.suppliers[idx] = normalized;
                else window.Provisio.suppliers.unshift(normalized);
                
                saveLocal('suppliers', window.Provisio.suppliers);
                if (typeof renderSuppliersList === 'function') renderSuppliersList();
                return { id: res.data.id, success: true };
            },
            delete: async (id) => {
                const { error } = await supabase.from('suppliers').delete().eq('id', id);
                if (error) throw error;
                window.Provisio.suppliers = window.Provisio.suppliers.filter(s => s.id !== id);
                saveLocal('suppliers', window.Provisio.suppliers);
                if (typeof updateDebugState === 'function') updateDebugState('SUP_DELETE');
                return { success: true };
            }
        },

        audit: {
            list: async () => {
                const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50);
                if (error) return loadLocal('auditLogs', []);
                window.Provisio.auditLogs = data || [];
                saveLocal('auditLogs', window.Provisio.auditLogs);
                return window.Provisio.auditLogs;
            },
            create: async (logData) => {
                if (!Array.isArray(window.Provisio.auditLogs)) window.Provisio.auditLogs = [];
                window.Provisio.auditLogs.unshift({ ...logData, created_at: new Date().toISOString() });
                if (window.Provisio.auditLogs.length > 50) window.Provisio.auditLogs.pop();
                saveLocal('auditLogs', window.Provisio.auditLogs);
                if (window.Provisio && typeof window.Provisio.renderAuditLog === 'function') {
                    window.Provisio.renderAuditLog();
                }
                
                const dbPayload = { ...logData };
                if (dbPayload.action) {
                    dbPayload.action_type = dbPayload.action;
                    delete dbPayload.action;
                }
                if (!dbPayload.user_id && currentUserId) dbPayload.user_id = currentUserId;
                
                supabase.from('audit_logs').insert(dbPayload).then();
            }
        },

        team: {
            list: async () => {
                const { data, error } = await supabase.from('team_members').select('*').order('created_at', { ascending: false });
                if (error) { console.warn('Team fetch fail', error); return loadLocal('team', []); }
                const roleLabels = { 'owner': 'Владелец', 'manager': 'Менеджер', 'chef': 'Шеф-повар', 'cook': 'Повар' };
                window.Provisio.team = (data || []).map(t => ({
                    ...t,
                    initials: t.name ? t.name.split(' ').map(n => n[0]).join('').toUpperCase() : '??',
                    roleLabel: roleLabels[t.role] || t.role || 'Сотрудник',
                    color: t.color || 'var(--chocolate-light)'
                }));
                saveLocal('team', window.Provisio.team);
                return window.Provisio.team;
            },
            generateInvite: async (role) => {
                return await apiRequest('/v2/data-hub', 'POST', { action: 'invite', role }, true);
            }
        },

        settings: {
            load: async () => {
                let data = null;
                const { data: raw, error } = await supabase.from('user_settings').select('*').single();
                if (raw && !error) {
                    data = {
                        venueName: raw.venue_name,
                        venueType: raw.venue_type,
                        venueAddress: raw.address,
                        phone: raw.phone,
                        currency: raw.currency,
                        language: raw.language,
                        units: raw.unit_system,
                        timezone: raw.timezone,
                        notifications: typeof raw.notifications === 'string' ? JSON.parse(raw.notifications) : (raw.notifications || []),
                        inventory_categories: typeof raw.inventory_categories === 'string' ? JSON.parse(raw.inventory_categories) : (raw.inventory_categories || []),
                        tutorial_completed: raw.tutorial_completed === true
                    };
                }
                if (!data) data = loadLocal('settings');
                if (data && data.currency) AppStore.setCurrency(data.currency);
                return data;
            },
            save: async (settings) => {
                const mapped = {
                    venue_name: settings.venueName,
                    venue_type: settings.venueType,
                    address: settings.venueAddress,
                    phone: settings.phone,
                    currency: settings.currency,
                    timezone: settings.timezone,
                    unit_system: settings.units,
                    notifications: settings.notifications,
                    language: settings.language,
                    inventory_categories: settings.inventory_categories,
                    tutorial_completed: settings.tutorial_completed
                };
                // Drop undefined keys so a partial save (e.g. only the tutorial flag)
                // does not overwrite other columns.
                Object.keys(mapped).forEach(k => { if (mapped[k] === undefined) delete mapped[k]; });
                saveLocal('settings', settings);
                if (currentUserId) mapped.user_id = currentUserId;
                const { error } = await supabase.from('user_settings').upsert(mapped, { onConflict: 'user_id' });
                if (error) throw error;
                return { success: true };
            },
            // Изолировано от save()/load() выше нарочно: колонка variance_threshold_pct появляется
            // только после supabase_migration_v10 — если её включить в общий upsert() и она ещё не
            // накатана, упадёт ВЕСЬ сейв профиля (имя заведения, валюта и т.д.), а не только порог.
            saveVarianceThreshold: async (pct) => {
                try {
                    const payload = { variance_threshold_pct: pct };
                    if (currentUserId) payload.user_id = currentUserId;
                    const { error } = await supabase.from('user_settings').upsert(payload, { onConflict: 'user_id' });
                    if (error) throw error;
                    saveLocal('variance_threshold_pct', pct);
                    return { success: true, persisted: true };
                } catch (err) {
                    console.warn('[Provisio] variance_threshold_pct недоступен в БД (нужна supabase_migration_v10) — сохраняю только локально.', err);
                    saveLocal('variance_threshold_pct', pct);
                    return { success: true, persisted: false };
                }
            },
            loadVarianceThreshold: async () => {
                try {
                    const { data, error } = await supabase.from('user_settings').select('variance_threshold_pct').single();
                    if (error) throw error;
                    if (data && data.variance_threshold_pct != null) return parseFloat(data.variance_threshold_pct);
                } catch (err) { /* колонка ещё не существует — тихо переходим на локальное значение */ }
                const local = loadLocal('variance_threshold_pct', null);
                return local != null ? parseFloat(local) : 5;
            }
        },

        dashboard: {
            stats: async () => {
                return { 
                    revenue: 0, 
                    avg_foodcost: 0, 
                    recipe_count: (window.Provisio.recipes || []).length, 
                    team_count: (window.Provisio.team || []).length 
                };
            }
        },

        ai: {
            parseMenu: async (payload) => { 
                return await apiRequest('/v2/data-hub', 'POST', { action: 'ai_parse', ...payload }, true); 
            }
        },

        apps: {
            list: async () => {
                const { data, error } = await supabase.from('applications').select('id, provider, status, webhook_token, created_at, updated_at');
                if (error) return [];
                return data || [];
            },
            // Секрет шифруется на сервере (см. api/integrations/connect.js) — отсюда браузер
            // никогда напрямую не пишет api_key в таблицу applications и никогда не получает его обратно в открытом виде.
            connect: async (provider, secret) => {
                const { data: sessionData } = await supabase.auth.getSession();
                const accessToken = sessionData?.session?.access_token;
                if (!accessToken) throw new Error('no_session');
                const res = await fetch('/api/integrations/connect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
                    body: JSON.stringify({ provider, secret })
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || ('connect_failed_' + res.status));
                }
                return res.json(); // { status, webhookUrl, maskedKey }
            },
            disconnect: async (provider) => {
                const { data: sessionData } = await supabase.auth.getSession();
                const accessToken = sessionData?.session?.access_token;
                if (!accessToken) throw new Error('no_session');
                const res = await fetch('/api/integrations/connect', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
                    body: JSON.stringify({ provider })
                });
                if (!res.ok) throw new Error('disconnect_failed_' + res.status);
                return res.json();
            }
        },

        // ========================================
        // STOCKTAKE (Склад: ввод факта поваром + сверка с расчётом)
        // Таблица stocktake_submissions появляется после supabase_migration_v10 —
        // до этого работаем в локальном демо-режиме (localStorage), чтобы экран
        // оставался рабочим и презентабельным без миграции.
        // ========================================
        stocktake: {
            listRecent: async (limit = 5) => {
                try {
                    const { data, error } = await supabase.from('stocktake_submissions').select('*').order('submitted_at', { ascending: false }).limit(limit);
                    if (error) throw error;
                    return data || [];
                } catch (err) {
                    return loadLocal('stocktake_submissions', []).slice(0, limit);
                }
            },
            submit: async (submission) => {
                const payload = { ...submission };
                if (!payload.user_id && currentUserId) payload.user_id = currentUserId;
                try {
                    const { data, error } = await supabase.from('stocktake_submissions').insert(payload).select().single();
                    if (error) throw error;
                    return data;
                } catch (err) {
                    console.warn('[Provisio] stocktake_submissions недоступна (нужна supabase_migration_v10) — сохраняю локально.', err);
                    const local = loadLocal('stocktake_submissions', []);
                    const fallback = { ...payload, id: 'local-' + Date.now() };
                    local.unshift(fallback);
                    saveLocal('stocktake_submissions', local);
                    return fallback;
                }
            }
        }
    };

    // Expose the DB object on the Provisio namespace
    window.Provisio.DB = DB;

    // Helper to get active user ID if needed externally
    Object.defineProperty(window.Provisio, 'currentUserId', {
        get: () => currentUserId,
        configurable: true
    });
})();
