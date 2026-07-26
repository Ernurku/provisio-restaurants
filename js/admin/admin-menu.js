/* ============================================
   PROVISIO — Menu Module
   Menu items table, modal, CRUD
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) return;

    let editMenuId = null;

    // ========================================
    // MENU TABLE
    // ========================================
    function populateMenuFilter() {
        const sel = document.getElementById('menuFilter');
        if (!sel) return;
        const cats = [...new Set(P.menuItems.map(i => i.category).filter(Boolean))].sort();
        const current = sel.value;
        sel.innerHTML = '<option value="all">Все категории</option>' +
            cats.map(c => `<option value="${c}">${c}</option>`).join('');
        if (cats.includes(current)) sel.value = current;
    }

    window.renderMenuItemsTable = function () {
        const tbody = document.getElementById('menuItemsTableBody');
        if (!tbody) return;
        populateMenuFilter();
        const q = (document.getElementById('menuSearch')?.value || '').toLowerCase().trim();
        const cat = document.getElementById('menuFilter')?.value || 'all';
        if (!P.menuItems.length) {
            tbody.innerHTML = `<tr><td colspan="8">
                <div class="empty-state empty-state-table">
                    <div class="empty-state-icon"><i class="ph ph-bowl-food"></i></div>
                    <h3>Меню пока не заполнено</h3>
                    <p>Добавьте позиции вашего меню и привяжите их к рецептам для мониторинга маржинальности и прибыли в реальном времени</p>
                    <button class="btn btn-accent" onclick="document.getElementById('addMenuItemBtn')?.click()">
                        <i class="ph ph-plus-circle"></i> Добавить позицию в меню
                    </button>
                </div>
            </td></tr>`;
            return;
        }
        let filtered = P.menuItems;
        if (q) filtered = filtered.filter(item => item.name.toLowerCase().includes(q));
        if (cat !== 'all') filtered = filtered.filter(item => item.category === cat);
        if (!filtered.length) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--chocolate-light);"><i class="ph ph-magnifying-glass" style="display:block;font-size:24px;margin-bottom:8px;opacity:0.4;"></i>Ничего не найдено</td></tr>`;
            return;
        }
        tbody.innerHTML = filtered.map(item => {
            const recipe = P.recipes.find(r => r.id == item.recipe_id);
            const cost = recipe ? (parseFloat(recipe.calculated_cost) || 0) : 0;
            const price = parseFloat(item.price) || 0;
            const profit = price - cost;
            const margin = price > 0 ? (profit / price * 100).toFixed(1) : 0;
            const marginClass = margin > 50 ? 'text-olive' : (margin < 30 ? 'text-danger' : '');

            const syncErrorHtml = item._syncError ? `
                <div class="sync-error-wrapper">
                    <i class="ph ph-warning-octagon sync-error-icon"></i>
                    <div class="sync-error-tooltip">Это изменение не сохранилось на наших серверах из-за ошибки сети или сервера.</div>
                </div>
            ` : '';

            return `<tr>
                <td>
                    <div style="display: flex; align-items: center;">
                        <strong>${item.name}</strong> ${syncErrorHtml}
                    </div>
                </td>
                <td><span class="badge badge-outline">${item.category || 'Без категории'}</span></td>
                <td>${recipe ? recipe.name : '<span class="text-danger">Не привязан</span>'}</td>
                <td>${P.formatMoney(price)}</td>
                <td>${P.formatMoney(cost)}</td>
                <td class="${marginClass}"><strong>${margin}%</strong></td>
                <td>${P.formatMoney(profit)}</td>
                <td><div class="table-actions">
                    <button class="table-action-btn edit-menu-btn" data-id="${item.id}" title="Редактировать"><i class="ph ph-pencil-simple"></i></button>
                    <button class="table-action-btn table-action-danger delete-menu-btn" data-id="${item.id}" title="Удалить"><i class="ph ph-trash"></i></button>
                </div></td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.edit-menu-btn').forEach(btn => btn.addEventListener('click', () => openMenuModal(btn.dataset.id)));
        tbody.querySelectorAll('.delete-menu-btn').forEach(btn => btn.addEventListener('click', () => {
            P.confirmAction('Удалить', 'Точно удалить пункт меню?', () => P.DB.menuItems.delete(btn.dataset.id));
        }));
    };

    // ========================================
    // MENU MODAL
    // ========================================
    function openMenuModal(id = null) {
        editMenuId = id;
        document.getElementById('menuItemModalTitle').textContent = id ? 'Редактировать меню' : 'Добавить позицию';
        const rSelect = document.getElementById('modalMenuRecipe');
        rSelect.innerHTML = '<option value="">Выберите рецепт</option>' + P.recipes.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

        if (id) {
            const item = P.menuItems.find(i => i.id == id);
            document.getElementById('modalMenuName').value = item.name || '';
            document.getElementById('modalMenuRecipe').value = item.recipe_id || '';
            document.getElementById('modalMenuCategory').value = item.category || '';
            document.getElementById('modalMenuPrice').value = item.price || 0;
        } else {
            document.getElementById('modalMenuName').value = '';
            document.getElementById('modalMenuRecipe').value = '';
            document.getElementById('modalMenuCategory').value = '';
            document.getElementById('modalMenuPrice').value = '';
        }
        P.openModal('menuItemModal');
    }

    document.getElementById('addMenuItemBtn')?.addEventListener('click', () => openMenuModal());
    document.getElementById('menuItemModalCancel')?.addEventListener('click', () => P.closeAllModals());
    document.getElementById('menuItemModalClose')?.addEventListener('click', () => P.closeAllModals());

    document.getElementById('menuItemModalSave')?.addEventListener('click', async () => {
        const name = document.getElementById('modalMenuName').value.trim();
        if (!name) { P.showToast('Введите название', 'error'); return; }
        const rId = document.getElementById('modalMenuRecipe').value;
        const data = {
            id: editMenuId, name,
            recipe_id: rId || null,
            category: document.getElementById('modalMenuCategory').value.trim(),
            price: parseFloat(document.getElementById('modalMenuPrice').value) || 0
        };
        try {
            if (editMenuId) await P.DB.menuItems.update(data);
            else await P.DB.menuItems.create(data);
            P.closeAllModals(); P.showToast('Пункт меню сохранён', 'success');
        } catch (e) { P.showToast(e.message, 'error'); }
    });

    document.getElementById('menuSearch')?.addEventListener('input', renderMenuItemsTable);
    document.getElementById('menuFilter')?.addEventListener('change', renderMenuItemsTable);

    // Init render
    renderMenuItemsTable();

    console.log('%c[PROVISIO]%c Menu module loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
