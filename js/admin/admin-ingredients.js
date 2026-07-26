/* ============================================
   PROVISIO — Ingredients Module
   Ingredients table, modal with tabs
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) return;

    let currentEditingIngredientId = null;
    const ingModal = document.getElementById('ingredientModal');

    // ========================================
    // INGREDIENTS TABLE
    // ========================================
    window.renderIngredientsTable = function () {
        const tbody = document.getElementById('ingredientsTableBody');
        if (!tbody) return;
        const q = (document.getElementById('ingredientsSearch')?.value || '').toLowerCase().trim();
        const list = q ? P.ingredients.filter(ing => ing.name.toLowerCase().includes(q)) : P.ingredients;
        if (!P.ingredients.length) {
            tbody.innerHTML = `<tr><td colspan="6">
                <div class="empty-state empty-state-table">
                    <div class="empty-state-icon"><i class="ph ph-flask"></i></div>
                    <h3>Список ингредиентов пуст</h3>
                    <p>Добавьте мастер-ингредиенты для управления нутриентами, нормами отходов и автоматической связью со складскими позициями</p>
                    <button class="btn btn-accent" onclick="document.getElementById('addIngredientBtn')?.click()">
                        <i class="ph ph-plus-circle"></i> Создать первый ингредиент
                    </button>
                </div>
            </td></tr>`;
            return;
        }
        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--chocolate-light);"><i class="ph ph-magnifying-glass" style="display:block;font-size:24px;margin-bottom:8px;opacity:0.4;"></i>Ничего не найдено</td></tr>`;
            return;
        }
        tbody.innerHTML = list.map(ing => {
            const syncErrorHtml = ing._syncError ? `
                <div class="sync-error-wrapper">
                    <i class="ph ph-warning-octagon sync-error-icon"></i>
                    <div class="sync-error-tooltip">Это изменение не сохранилось на наших серверах из-за ошибки сети или сервера.</div>
                </div>
            ` : '';

            return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center;">
                        <strong>${ing.name}</strong> ${syncErrorHtml}
                    </div>
                </td>
                <td><span class="badge badge-outline">${ing.category || 'Без категории'}</span></td>
                <td>${ing.ep_percent || ing.edible_portion || 100}%</td>
                <td>${ing.density || 1.0}</td>
                <td>${ing.nutrition?.kcal || 0}</td>
                <td><div class="table-actions">
                    <button class="table-action-btn edit-ingredient-btn" data-id="${ing.id}" title="Редактировать"><i class="ph ph-pencil-simple"></i></button>
                    <button class="table-action-btn table-action-danger delete-ingredient-btn" data-id="${ing.id}" title="Удалить"><i class="ph ph-trash"></i></button>
                </div></td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.edit-ingredient-btn').forEach(btn => btn.addEventListener('click', () => openIngredientModal(btn.dataset.id)));
        tbody.querySelectorAll('.delete-ingredient-btn').forEach(btn => btn.addEventListener('click', () => {
            P.confirmAction('Удалить', 'Точно удалить ингредиент?', () => P.DB.ingredients.delete(btn.dataset.id));
        }));
    };

    // ========================================
    // MODAL TABS
    // ========================================
    ingModal?.querySelectorAll('.modal-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            ingModal.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
            ingModal.querySelectorAll('.modal-tab-content').forEach(c => c.style.display = 'none');
            tab.classList.add('active');
            const targetId = 'modalTab' + tab.dataset.modaltab.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
            const content = document.getElementById(targetId);
            if (content) content.style.display = 'block';
        });
    });

    // ========================================
    // OPEN INGREDIENT MODAL
    // ========================================
    function openIngredientModal(arg = null) {
        let tag = null;
        if (typeof arg === 'string' || typeof arg === 'number') {
            tag = P.ingredients.find(i => i.id == arg);
        } else {
            tag = arg;
        }

        currentEditingIngredientId = tag ? tag.id : null;
        document.getElementById('ingredientModalTitle').textContent = tag ? 'Редактировать ингредиент' : 'Новый ингредиент';

        // Populate Categories from P.inventoryCategories
        const ingCategorySelect = document.getElementById('ingCategory');
        if (ingCategorySelect) {
            const cats = P.inventoryCategories || ['Молочные', 'Мясо', 'Сухие', 'Овощи', 'Яйца', 'Специи', 'Напитки'];
            ingCategorySelect.innerHTML = '<option value="">Без категории</option>' +
                cats.map(c => `<option value="${c}">${c}</option>`).join('');
        }

        // Reset tabs
        ingModal?.querySelector('.modal-tab[data-modaltab="ing-general"]')?.click();

        // Fill data
        document.getElementById('ingName').value = tag ? tag.name : '';
        document.getElementById('ingCategory').value = tag ? (tag.category || '') : '';
        document.getElementById('ingBaseUnit').value = tag ? (tag.base_unit || tag.baseUnit || 'кг') : 'кг';
        document.getElementById('ingEpPercent').value = tag ? (tag.ep_percent || tag.edible_portion || 100) : 100;
        document.getElementById('ingDensity').value = tag ? tag.density : 1.0;

        const n = tag ? (tag.nutrition || {}) : {};
        document.getElementById('ingKcal').value = n.kcal || '';
        document.getElementById('ingProtein').value = n.protein || '';
        document.getElementById('ingFat').value = n.fat || '';
        document.getElementById('ingCarbs').value = n.carbs || '';

        renderIngredientConversions(tag ? tag.conversions : []);
        P.openModal('ingredientModal');
    }

    // ========================================
    // CONVERSIONS
    // ========================================
    function renderIngredientConversions(list) {
        const container = document.getElementById('ingConversionsList');
        if (!container) return;
        container.innerHTML = (Array.isArray(list) ? list : []).map((c, idx) => `
            <div class="conversion-row" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
                <span>1</span>
                <input type="text" class="admin-input conv-unit" value="${c.unit}" placeholder="стакан" style="flex:1;">
                <span>=</span>
                <input type="number" class="admin-input conv-qty" value="${c.qty}" placeholder="240" style="width: 80px;">
                <select class="admin-input conv-base-unit" style="width: 70px;">
                    <option ${c.baseUnit === 'г' ? 'selected' : ''}>г</option>
                    <option ${c.baseUnit === 'мл' ? 'selected' : ''}>мл</option>
                </select>
                <button class="btn-icon-inline conv-del-btn" data-idx="${idx}"><i class="ph ph-trash"></i></button>
            </div>`).join('');

        container.querySelectorAll('.conv-del-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                const currentList = getIngredientConversionsFromUI();
                currentList.splice(idx, 1);
                renderIngredientConversions(currentList);
            });
        });
    }

    function getIngredientConversionsFromUI() {
        const container = document.getElementById('ingConversionsList');
        if (!container) return [];
        const rows = container.querySelectorAll('.conversion-row');
        return Array.from(rows).map(row => ({
            unit: row.querySelector('.conv-unit').value.trim().toLowerCase(),
            qty: parseFloat(row.querySelector('.conv-qty').value) || 0,
            baseUnit: row.querySelector('.conv-base-unit').value
        })).filter(c => c.unit && c.qty);
    }

    document.getElementById('ingAddConversionBtn')?.addEventListener('click', () => {
        const currentList = getIngredientConversionsFromUI();
        currentList.push({ unit: '', qty: 0, baseUnit: 'г' });
        renderIngredientConversions(currentList);
    });

    // ========================================
    // SAVE INGREDIENT
    // ========================================
    document.getElementById('ingModalSave')?.addEventListener('click', async () => {
        const name = document.getElementById('ingName').value.trim();
        if (!name) { P.showToast('Введите название', 'error'); return; }

        // Duplicate name check - skip if we are editing the same item OR if the existing item had a sync error
        const existing = P.ingredients.find(i => i.name.toLowerCase() === name.toLowerCase());
        if (existing && existing.id !== currentEditingIngredientId && !existing._syncError) {
            P.showToast('Ингредиент с таким названием уже существует', 'error');
            return;
        }

        const data = {
            id: currentEditingIngredientId,
            name,
            category: document.getElementById('ingCategory').value,
            base_unit: document.getElementById('ingBaseUnit').value,
            edible_portion_pc: parseFloat(document.getElementById('ingEpPercent').value) || 100,
            density: parseFloat(document.getElementById('ingDensity').value) || 1.0,
            nutrition: {
                kcal: parseFloat(document.getElementById('ingKcal').value) || 0,
                protein: parseFloat(document.getElementById('ingProtein').value) || 0,
                fat: parseFloat(document.getElementById('ingFat').value) || 0,
                carbs: parseFloat(document.getElementById('ingCarbs').value) || 0
            },
            conversions: getIngredientConversionsFromUI()
        };

        try {
            if (currentEditingIngredientId) {
                await P.DB.ingredients.update(data);
                P.showToast('Данные ингредиента обновлены');
                P.logAction('Обновлен', 'Ингредиент', name, 'Изменены параметры или КБЖУ');
            } else {
                await P.DB.ingredients.create(data);
                P.showToast('Ингредиент создан');
                P.logAction('Создан', 'Ингредиент', name, 'Добавлен в реестр');
            }
            P.closeAllModals();
            if (window.ReactiveEngine) window.ReactiveEngine.recalculateAll(true);
        } catch (e) { console.error('Save ingredient error:', e); P.showToast('Ошибка при сохранении', 'error'); }
    });

    document.getElementById('ingModalCancel')?.addEventListener('click', () => P.closeAllModals());
    document.getElementById('ingredientModalClose')?.addEventListener('click', () => P.closeAllModals());
    document.getElementById('addIngredientBtn')?.addEventListener('click', () => openIngredientModal());

    // ========================================
    // HELPERS (global)
    // ========================================
    window.openIngredientModal = openIngredientModal;

    window.openIngredientModalByName = function (name) {
        const ing = P.ingredients.find(i => i.name.toLowerCase() === name.toLowerCase());
        if (ing) openIngredientModal(ing);
        else P.showToast('Мастер-ингредиент не найден', 'info');
    };

    window.createIngredientFromName = async function (name) {
        if (!confirm(`Создать мастер-ингредиент «${name}» для расширенной аналитики (КБЖУ, EP%)?`)) return;
        try {
            await P.DB.ingredients.create({ name, ep_percent: 100, density: 1.0 });
            P.showToast('Мастер-ингредиент создан');
            if (typeof renderInventoryTable === 'function') renderInventoryTable();
            window.openIngredientModalByName(name);
        } catch (e) { console.error('Failed to auto-create ingredient', e); P.showToast('Ошибка при создании', 'error'); }
    };

    document.getElementById('ingredientsSearch')?.addEventListener('input', renderIngredientsTable);

    // Init render
    renderIngredientsTable();

    console.log('%c[PROVISIO]%c Ingredients module loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
