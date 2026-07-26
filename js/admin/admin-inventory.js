/* ============================================
   PROVISIO — Inventory Module (Склад)
   Layer A: basic stock table, categories, deliveries (restored from Phase 2 archive, field names fixed to v8 schema)
   Layer B/C: normative stock — blind stocktake entry (cook) + reconciliation (owner)
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) return;

    let editingInvId = null;

    // ========================================
    // LOCAL DEMO STORAGE (used only until real backend tables exist —
    // see supabase_migration_v10_sklad_integrations.sql. Safe no-op once
    // the real tables are live because P.DB.stocktake already prefers Supabase.)
    // ========================================
    function localGet(key, fallback) {
        try { const v = localStorage.getItem('pv_ui_' + key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    }
    function localSet(key, val) {
        try { localStorage.setItem('pv_ui_' + key, JSON.stringify(val)); } catch (e) { }
    }

    // ========================================
    // INVENTORY CATEGORIES
    // ========================================
    function renderInventoryCategories() {
        const filter = document.getElementById('inventoryFilter');
        const modalCat = document.getElementById('modalInvCategory');
        if (filter) filter.innerHTML = '<option value="all">Все категории</option>' + P.inventoryCategories.map(c => `<option value="${c}">${c}</option>`).join('');
        if (modalCat) modalCat.innerHTML = P.inventoryCategories.map(c => `<option>${c}</option>`).join('');
    }

    // ========================================
    // INVENTORY TABLE (canonical v8 field names: quantity, min_stock, price, expiry — no legacy aliases on write)
    // ========================================
    function renderInventoryTable() {
        const tbody = document.getElementById('inventoryTableBody');
        if (!tbody) return;
        const alertSection = document.getElementById('inventoryAlerts');
        const alertLow = document.getElementById('alertLowStock');
        const alertExp = document.getElementById('alertExpired');
        const countLow = document.getElementById('lowStockCount');
        const countExp = document.getElementById('expiredCount');

        if (!P.inventory.length) {
            if (alertSection) alertSection.style.display = 'none';
            tbody.innerHTML = `<tr><td colspan="8">
                <div class="empty-state empty-state-table">
                    <div class="empty-state-icon"><i class="ph ph-package"></i></div>
                    <h3>Склад пуст</h3>
                    <p>Добавьте первые товары на склад, чтобы отслеживать остатки, цены и сроки годности</p>
                    <button class="btn btn-accent" onclick="document.getElementById('addInventoryBtn')?.click()">
                        <i class="ph ph-plus-circle"></i> Добавить первый товар
                    </button>
                    <div class="empty-state-hint"><i class="ph ph-lightbulb"></i> Товары автоматически свяжутся с вашими рецептами</div>
                </div>
            </td></tr>`;
            return;
        }

        let lowStockList = P.inventory.filter(item => (parseFloat(item.quantity) || 0) < (parseFloat(item.min_stock) || 0));
        let expiredList = P.inventory.filter(item => item.expiry && new Date(item.expiry) < new Date());

        if (alertSection) {
            alertSection.style.display = (lowStockList.length > 0 || expiredList.length > 0) ? 'flex' : 'none';
            if (alertLow) {
                alertLow.style.display = lowStockList.length > 0 ? 'flex' : 'none';
                if (countLow) countLow.textContent = `${lowStockList.length} ${P.getNoun(lowStockList.length, 'позиция', 'позиции', 'позиций')}`;
            }
            if (alertExp) {
                alertExp.style.display = expiredList.length > 0 ? 'flex' : 'none';
                if (countExp) countExp.textContent = `${expiredList.length} ${P.getNoun(expiredList.length, 'позиция', 'позиции', 'позиций')}`;
            }
        }

        tbody.innerHTML = P.inventory.map(item => {
            const qty = parseFloat(item.quantity) || 0;
            const minStock = parseFloat(item.min_stock) || 0;
            const price = parseFloat(item.price) || 0;
            const expiry = item.expiry || null;

            const isLow = qty < minStock;
            const isExpired = expiry && new Date(expiry) < new Date();
            const status = isExpired ? '<span class="status-badge status-expired">Просрочен</span>' : isLow ? '<span class="status-badge status-low">Низкий</span>' : '<span class="status-badge status-ok">Норма</span>';
            const expiryDisplay = expiry ? new Date(expiry).toLocaleDateString('ru-RU') : '—';
            const dbIng = P.ingredients.find(i => i.name.toLowerCase() === item.name.toLowerCase());
            const linkIcon = dbIng
                ? `<i class="ph ph-link" style="color: var(--accent); margin-left: 4px; cursor: pointer;" title="Связано с ингредиентом" onclick="event.stopPropagation(); openIngredientModalByName('${item.name}')"></i>`
                : `<i class="ph ph-link-break" style="color: var(--text-muted); margin-left: 4px; cursor: pointer; opacity: 0.5;" title="Нет мастер-ингредиента" onclick="event.stopPropagation(); createIngredientFromName('${item.name}')"></i>`;

            return `<tr data-id="${item.id}">
                <td>
                    <div style="display: flex; align-items: center;">
                        <strong>${item.name}</strong> ${linkIcon}
                    </div>
                </td>
                <td>${item.category || '—'}</td>
                <td>${qty} ${item.unit || ''}</td>
                <td>${minStock} ${item.unit || ''}</td>
                <td>${item.currency || P.currentCurrency}${price.toFixed(2)} / ${item.unit || ''}</td>
                <td>${expiryDisplay}</td>
                <td>${status}</td>
                <td><div class="table-actions">
                    <button class="table-action-btn inv-edit-btn" data-id="${item.id}" title="Редактировать"><i class="ph ph-pencil-simple"></i></button>
                    ${dbIng ? `<button class="table-action-btn inv-master-btn" data-name="${item.name}" title="Карточка ингредиента" style="color: var(--accent);"><i class="ph ph-flask"></i></button>` : ''}
                    <button class="table-action-btn table-action-danger inv-delete-btn" data-id="${item.id}" title="Удалить"><i class="ph ph-trash"></i></button>
                </div></td>
            </tr>`;
        }).join('');

        document.querySelectorAll('.inv-edit-btn').forEach(btn => btn.addEventListener('click', () => editInventoryItem(btn.dataset.id)));
        document.querySelectorAll('.inv-master-btn').forEach(btn => btn.addEventListener('click', () => {
            if (typeof openIngredientModalByName === 'function') openIngredientModalByName(btn.dataset.name);
        }));
        document.querySelectorAll('.inv-delete-btn').forEach(btn => btn.addEventListener('click', () => {
            const item = P.inventory.find(x => x.id == btn.dataset.id);
            P.confirmAction('Удалить товар', `Удалить «${item?.name}»?`, async () => {
                try { await P.DB.inventory.delete(btn.dataset.id); P.showToast('Товар удалён'); }
                catch (err) { P.showToast('Не удалось удалить товар. Ошибка сервера.', 'error'); }
            });
        }));

        P.calculateInventoryValuation();
        // Держим экраны "Ввод остатков" / "Сверка" в курсе изменений списка ингредиентов склада.
        if (typeof renderStocktakeList === 'function' && document.getElementById('invSubtabStocktake')?.classList.contains('active')) renderStocktakeList();
    }

    // ========================================
    // ADD / EDIT INVENTORY (canonical fields: name, category, quantity, unit, min_stock, price, expiry)
    // ========================================
    function populateIngredientSelect(selectedName = '') {
        const select = document.getElementById('modalInvName');
        if (!select) return;
        const sorted = [...P.ingredients].sort((a, b) => a.name.localeCompare(b.name));
        select.innerHTML = '<option value="" disabled>Выберите ингредиент...</option>' +
            sorted.map(ing => `<option value="${ing.name}" ${ing.name === selectedName ? 'selected' : ''}>${ing.name}</option>`).join('');
        if (!selectedName && sorted.length > 0) select.selectedIndex = 0;
    }

    document.getElementById('addInventoryBtn')?.addEventListener('click', () => {
        editingInvId = null;
        document.getElementById('inventoryModalTitle').textContent = 'Добавить товар';
        populateIngredientSelect();
        document.getElementById('modalInvQty').value = '';
        document.getElementById('modalInvMinStock').value = '';
        document.getElementById('modalInvPrice').value = '';
        document.getElementById('modalInvExpiry').value = '';
        P.openModal('inventoryModal');
    });

    function editInventoryItem(id) {
        const item = P.inventory.find(x => x.id == id);
        if (!item) return;
        editingInvId = id;
        document.getElementById('inventoryModalTitle').textContent = 'Редактировать товар';
        populateIngredientSelect(item.name);
        document.getElementById('modalInvCategory').value = item.category || '';
        document.getElementById('modalInvQty').value = item.quantity || 0;
        document.getElementById('modalInvUnit').value = item.unit || 'кг';
        document.getElementById('modalInvMinStock').value = item.min_stock || 0;
        document.getElementById('modalInvPrice').value = item.price || 0;
        document.getElementById('modalInvExpiry').value = item.expiry || '';
        P.openModal('inventoryModal');
    }

    document.getElementById('inventoryModalSave')?.addEventListener('click', async () => {
        const name = document.getElementById('modalInvName').value;
        const category = document.getElementById('modalInvCategory').value;
        const quantity = parseFloat(document.getElementById('modalInvQty').value) || 0;
        const unit = document.getElementById('modalInvUnit').value;
        const min_stock = parseFloat(document.getElementById('modalInvMinStock').value) || 0;
        const price = parseFloat(document.getElementById('modalInvPrice').value) || 0;
        const expiry = document.getElementById('modalInvExpiry').value || null;

        if (!name || isNaN(quantity) || isNaN(price)) { P.showToast('Заполните обязательные поля корректно', 'error'); return; }

        // Ровно те колонки, что есть в таблице inventory (v8) — без currency и без legacy-имён.
        const itemData = { name, category, quantity, unit, min_stock, price, expiry };
        const saveBtn = document.getElementById('inventoryModalSave');
        saveBtn.disabled = true; saveBtn.textContent = 'Сохранение...';

        try {
            if (editingInvId) { itemData.id = editingInvId; await P.DB.inventory.update(itemData); P.showToast('Товар обновлён'); }
            else { await P.DB.inventory.add(itemData); P.showToast('Товар добавлен'); }
            P.closeAllModals();
        } catch (err) { console.error('Failed to save inventory item:', err); P.showToast('Ошибка при сохранении товара', 'error'); }
        finally { saveBtn.disabled = false; saveBtn.textContent = 'Сохранить'; }
    });
    document.getElementById('inventoryModalCancel')?.addEventListener('click', () => P.closeAllModals());

    document.getElementById('inventorySearch')?.addEventListener('input', filterInventory);
    document.getElementById('inventoryFilter')?.addEventListener('change', filterInventory);
    function filterInventory() {
        const q = document.getElementById('inventorySearch').value.toLowerCase();
        const cat = document.getElementById('inventoryFilter').value;
        document.querySelectorAll('#inventoryTableBody tr').forEach(row => {
            const name = row.querySelector('td:first-child')?.textContent.toLowerCase() || '';
            const rowCat = row.querySelectorAll('td')[1]?.textContent || '';
            row.style.display = (name.includes(q) && (cat === 'all' || rowCat === cat)) ? '' : 'none';
        });
    }

    // ========================================
    // EDITABLE CATEGORIES
    // ========================================
    document.getElementById('editCategoriesBtn')?.addEventListener('click', () => { renderEditableCategories(); P.openModal('categoriesModal'); });

    function renderEditableCategories() {
        const list = document.getElementById('editableCategoriesList');
        if (!list) return;
        list.innerHTML = P.inventoryCategories.map((c, i) => `
            <div class="editable-category-item">
                <span>${c}</span>
                <button class="btn-icon-inline" data-index="${i}" title="Удалить"><i class="ph ph-trash"></i></button>
            </div>`).join('');
        list.querySelectorAll('.btn-icon-inline').forEach(btn => btn.addEventListener('click', () => {
            P.confirmAction('Удалить категорию', 'Удалить эту категорию?', () => {
                P.inventoryCategories.splice(parseInt(btn.dataset.index), 1);
                renderEditableCategories();
            });
        }));
    }

    document.getElementById('addCategoryBtn')?.addEventListener('click', () => {
        const input = document.getElementById('newCategoryInput');
        const val = input.value.trim();
        if (val && !P.inventoryCategories.includes(val)) { P.inventoryCategories.push(val); renderEditableCategories(); input.value = ''; }
    });
    document.getElementById('categoriesModalSave')?.addEventListener('click', () => {
        renderInventoryCategories(); renderInventoryTable(); P.closeAllModals(); P.showToast('Категории обновлены');
    });
    document.getElementById('categoriesModalClose')?.addEventListener('click', () => P.closeAllModals());

    // ========================================
    // INVENTORY SUB-TABS (Остатки / Поставки / Ввод остатков / Сверка)
    // ========================================
    document.querySelectorAll('.inv-subtab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.inv-subtab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.inv-subtab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const map = { stock: 'invSubtabStock', deliveries: 'invSubtabDeliveries', stocktake: 'invSubtabStocktake', reconcile: 'invSubtabReconcile' };
            const subtabId = map[btn.dataset.subtab];
            document.getElementById(subtabId)?.classList.add('active');
            if (btn.dataset.subtab === 'deliveries') { renderPendingDeliveries(); renderConfirmedDeliveriesLog(); }
            if (btn.dataset.subtab === 'stocktake') renderStocktakeList();
            if (btn.dataset.subtab === 'reconcile') renderReconcileTable();
        });
    });

    // ========================================
    // PENDING DELIVERIES (unchanged logic from archive, field names already correct here)
    // ========================================
    const frequencyLabels = { daily: 'Ежедневно', weekly: 'Раз в неделю', every_2_weeks: 'Раз в 2 недели', monthly: 'Раз в месяц' };
    const dayLabels = { 0: 'Воскресенье', 1: 'Понедельник', 2: 'Вторник', 3: 'Среда', 4: 'Четверг', 5: 'Пятница', 6: 'Суббота' };

    function generatePendingDeliveries() {
        const pending = [];
        const today = new Date();
        const todayDay = today.getDay();

        P.suppliers.forEach(s => {
            if (!s.schedule) return;
            s.schedule.forEach(sch => {
                let daysUntil = 0, statusClass = '', statusText = '';
                if (sch.frequency === 'daily') { daysUntil = 0; statusClass = 'today'; statusText = 'Сегодня'; }
                else {
                    daysUntil = (sch.dayOfWeek - todayDay + 7) % 7;
                    if (daysUntil === 0) { statusClass = 'today'; statusText = 'Сегодня'; }
                    else if (daysUntil <= 2) { statusText = `Через ${daysUntil} дн.`; }
                    else { statusText = `${dayLabels[sch.dayOfWeek]}`; }
                }
                if (!window.processedDeliverySchedules) window.processedDeliverySchedules = new Set();
                if (!window.processedDeliverySchedules.has(sch.id)) {
                    pending.push({ ingredient: sch.ingredient, supplierName: s.name, supplierId: s.id, frequency: sch.frequency, dayOfWeek: sch.dayOfWeek, qty: sch.qty, unit: sch.unit, daysUntil, statusClass, statusText, scheduleId: sch.id });
                }
            });
        });
        pending.sort((a, b) => a.daysUntil - b.daysUntil);
        return pending;
    }

    function renderPendingDeliveries() {
        const grid = document.getElementById('pendingDeliveriesGrid');
        if (!grid) return;
        const pending = generatePendingDeliveries();
        const countEl = document.getElementById('pendingDeliveriesCount');
        if (countEl) countEl.textContent = pending.length;

        if (!pending.length) {
            grid.innerHTML = `<div class="empty-state empty-state-card" style="width: 100%;">
                <div class="empty-state-icon"><i class="ph ph-calendar-check"></i></div>
                <h3>Нет запланированных поставок</h3>
                <p>Настройте расписание в разделе «Поставщики», чтобы поставки отображались здесь</p>
                <button class="btn btn-accent btn-sm" onclick="document.querySelector('[data-tab=suppliers]')?.click()">
                    <i class="ph ph-arrow-right"></i> Перейти к поставщикам
                </button>
            </div>`;
            return;
        }

        grid.innerHTML = pending.map((d, i) => {
            const statusBadgeClass = d.statusClass === 'today' ? 'delivery-status-today' : 'delivery-status-upcoming';
            return `<div class="delivery-card ${d.statusClass}" data-index="${i}">
                <div class="delivery-card-header">
                    <span class="delivery-card-ingredient">${d.ingredient}</span>
                    <span class="delivery-card-status ${statusBadgeClass}">${d.statusText}</span>
                </div>
                <div class="delivery-card-details">
                    <div class="delivery-card-detail"><i class="ph ph-truck"></i> ${d.supplierName}</div>
                    <div class="delivery-card-detail"><i class="ph ph-calendar"></i> ${frequencyLabels[d.frequency]}</div>
                    <div class="delivery-card-detail"><i class="ph ph-package"></i> ${d.qty} ${d.unit}</div>
                </div>
                <div class="delivery-card-actions">
                    <button class="btn btn-accent btn-sm confirm-delivery-btn" data-index="${i}"><i class="ph ph-check"></i> Подтвердить</button>
                    <button class="btn btn-outline btn-sm reject-delivery-btn" data-index="${i}" style="border-color: var(--danger); color: var(--danger);"><i class="ph ph-x"></i> Отклонить</button>
                </div>
            </div>`;
        }).join('');

        grid.querySelectorAll('.confirm-delivery-btn').forEach(btn => {
            btn.addEventListener('click', () => openDeliveryConfirmModal(pending[parseInt(btn.dataset.index)]));
        });
        grid.querySelectorAll('.reject-delivery-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const d = pending[parseInt(btn.dataset.index)];
                P.confirmAction('Отклонить поставку', `Вы уверены, что хотите отклонить поставку «${d.ingredient}» от «${d.supplierName}»?`, async () => {
                    await new Promise(r => setTimeout(r, 600));
                    if (!window.processedDeliverySchedules) window.processedDeliverySchedules = new Set();
                    window.processedDeliverySchedules.add(d.scheduleId);
                    P.rejectedDeliveries.unshift({ ingredient: d.ingredient, supplier: d.supplierName, qty: d.qty, unit: d.unit, date: new Date() });
                    const card = btn.closest('.delivery-card');
                    card.style.transition = 'all 0.4s ease'; card.style.opacity = '0'; card.style.transform = 'scale(0.8)';
                    setTimeout(() => { card.style.height = card.offsetHeight + 'px'; card.style.padding = '0'; card.style.margin = '0'; card.style.borderWidth = '0'; void card.offsetHeight; card.style.height = '0px'; setTimeout(() => card.remove(), 400); }, 400);
                    P.showToast(`✗ Поставка «${d.ingredient}» от «${d.supplierName}» отклонена`);
                    renderConfirmedDeliveriesLog();
                });
            });
        });
    }

    let pendingDeliveryToConfirm = null;
    function openDeliveryConfirmModal(d) {
        pendingDeliveryToConfirm = d;
        document.getElementById('confirmDeliveryName').value = d.ingredient;
        document.getElementById('confirmDeliveryQty').value = d.qty;
        document.getElementById('confirmDeliveryUnit').value = d.unit;
        document.getElementById('confirmDeliverySupplier').value = d.supplierName;
        P.openModal('deliveryConfirmModal');
    }

    document.getElementById('deliveryConfirmSave')?.addEventListener('click', async () => {
        if (!pendingDeliveryToConfirm) return;
        const qty = parseFloat(document.getElementById('confirmDeliveryQty').value) || 0;
        if (!qty) { P.showToast('Введите количество', 'error'); return; }
        const ingName = pendingDeliveryToConfirm.ingredient;
        const unit = pendingDeliveryToConfirm.unit;

        const existingInv = P.inventory.find(x => x.name.toLowerCase() === ingName.toLowerCase());
        try {
            if (existingInv) {
                const newQty = (parseFloat(existingInv.quantity) || 0) + qty;
                await P.DB.inventory.update({
                    id: existingInv.id,
                    name: existingInv.name,
                    category: existingInv.category,
                    quantity: newQty,
                    unit: existingInv.unit,
                    min_stock: existingInv.min_stock || 0,
                    price: existingInv.price || 0,
                    expiry: existingInv.expiry || null
                });
            } else {
                await P.DB.inventory.add({ name: ingName, category: 'Без категории', quantity: qty, unit, min_stock: 1, price: 0, expiry: null });
            }
            await P.DB.inventory.logDelivery({ ingredient_id: existingInv?.ingredient_id || null, change_qty: qty, reason: 'delivery', ref_id: null }).catch(e => console.warn('Delivery log failed:', e));
        } catch (err) { console.warn('Delivery DB sync failed (keeping local):', err); }

        P.confirmedDeliveries.unshift({ ingredient: ingName, supplier: pendingDeliveryToConfirm.supplierName, qty, unit, date: new Date() });
        P.closeAllModals();
        pendingDeliveryToConfirm = null;
        renderInventoryTable();
        renderPendingDeliveries();
        renderConfirmedDeliveriesLog();
        P.showToast(`✓ Поступление «${ingName}» (${qty} ${unit}) подтверждено и добавлено на склад`);
    });
    document.getElementById('deliveryConfirmCancel')?.addEventListener('click', () => { P.closeAllModals(); pendingDeliveryToConfirm = null; });
    document.getElementById('deliveryConfirmModalClose')?.addEventListener('click', () => { P.closeAllModals(); pendingDeliveryToConfirm = null; });

    function renderConfirmedDeliveriesLog() {
        const list = document.getElementById('confirmedDeliveriesList');
        if (!list) return;
        const allEvents = [
            ...P.confirmedDeliveries.map(d => ({ ...d, type: 'confirmed' })),
            ...P.rejectedDeliveries.map(d => ({ ...d, type: 'rejected' }))
        ].sort((a, b) => b.date - a.date);

        if (!allEvents.length) {
            list.innerHTML = `<div class="empty-state empty-state-card" style="width: 100%;">
                <div class="empty-state-icon"><i class="ph ph-clipboard-text"></i></div>
                <h3>Журнал пуст</h3>
                <p>Здесь будет храниться история всех подтверждённых и отклонённых поставок</p>
            </div>`;
            return;
        }
        list.innerHTML = allEvents.slice(0, 20).map(d => {
            const dateStr = d.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            if (d.type === 'rejected') {
                return `<div class="delivery-log-item" style="border-left: 3px solid var(--danger);">
                    <i class="ph ph-x-circle" style="color: var(--danger);"></i>
                    <div><strong>${d.ingredient}</strong> — ${d.qty} ${d.unit} от «${d.supplier}» <span style="color: var(--danger); font-weight: 600;">ОТКЛОНЕНО</span></div>
                    <span class="log-time">${dateStr}</span>
                </div>`;
            }
            return `<div class="delivery-log-item">
                <i class="ph ph-check-circle"></i>
                <div><strong>${d.ingredient}</strong> — ${d.qty} ${d.unit} от «${d.supplier}»</div>
                <span class="log-time">${dateStr}</span>
            </div>`;
        }).join('');
    }

    // ========================================
    // ВВОД ОСТАТКОВ — слепой ввод факта поваром (без расчётного значения)
    // ========================================
    const STOCKTAKE_SESSION_KEY = 'stocktake_active_session';

    function getActiveStocktakeEntries() {
        const draft = localGet(STOCKTAKE_SESSION_KEY, null);
        return draft;
    }

    function isStocktakeLockedToday() {
        const submissions = localGet('stocktake_last_submission', null);
        if (!submissions) return null;
        const submittedAt = new Date(submissions.submitted_at);
        const now = new Date();
        const sameDay = submittedAt.toDateString() === now.toDateString();
        return sameDay ? submissions : null;
    }

    function renderStocktakeList() {
        const listEl = document.getElementById('stocktakeList');
        const formCard = document.getElementById('stocktakeFormCard');
        const lockedNotice = document.getElementById('stocktakeLockedNotice');
        const lockedText = document.getElementById('stocktakeLockedText');
        const reviewCard = document.getElementById('stocktakeReviewCard');
        if (!listEl) return;

        reviewCard.style.display = 'none';

        const locked = isStocktakeLockedToday();
        if (locked) {
            formCard.style.display = 'none';
            lockedNotice.style.display = 'block';
            const when = new Date(locked.submitted_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            lockedText.textContent = `Сегодня в ${when} остатки уже отправил(а) «${locked.submitted_by}». Изменить может только владелец во вкладке «Сверка».`;
            return;
        }
        formCard.style.display = 'block';
        lockedNotice.style.display = 'none';

        if (!P.inventory.length) {
            listEl.innerHTML = `<p class="section-hint">На складе пока нет ни одной позиции — сначала добавьте товары во вкладке «Остатки».</p>`;
            return;
        }

        listEl.innerHTML = P.inventory.map(item => `
            <div class="stocktake-row" data-inv-id="${item.id}">
                <div class="stocktake-row-name">${item.name}</div>
                <div class="stocktake-row-input">
                    <input type="number" class="admin-input stocktake-actual-input" data-inv-id="${item.id}" placeholder="0" step="0.01" min="0">
                    <span class="stocktake-row-unit">${item.unit || ''}</span>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('stocktakeReviewBtn')?.addEventListener('click', () => {
        const filledBy = document.getElementById('stocktakeFilledBy').value.trim();
        if (!filledBy) { P.showToast('Укажите, кто заполняет', 'error'); return; }

        const inputs = document.querySelectorAll('.stocktake-actual-input');
        const entries = [];
        let hasEmpty = false;
        inputs.forEach(inp => {
            const val = inp.value.trim();
            if (val === '') { hasEmpty = true; return; }
            const invItem = P.inventory.find(i => i.id == inp.dataset.invId);
            if (!invItem) return;
            entries.push({
                inventory_id: invItem.id,
                ingredient_id: invItem.ingredient_id || null,
                name: invItem.name,
                unit: invItem.unit,
                actual_quantity: parseFloat(val) || 0,
                expected_quantity: parseFloat(invItem.quantity) || 0
            });
        });

        if (hasEmpty || entries.length === 0) { P.showToast('Заполните остаток по каждой позиции', 'error'); return; }

        localSet('stocktake_draft', { filledBy, entries });
        renderStocktakeReview(filledBy, entries);
    });

    function renderStocktakeReview(filledBy, entries) {
        document.getElementById('stocktakeFormCard').style.display = 'none';
        const reviewCard = document.getElementById('stocktakeReviewCard');
        reviewCard.style.display = 'block';
        const list = document.getElementById('stocktakeReviewList');
        list.innerHTML = `<div class="stocktake-review-meta"><i class="ph ph-user"></i> Заполняет: <strong>${filledBy}</strong></div>` +
            entries.map(e => `<div class="stocktake-review-row"><span>${e.name}</span><strong>${e.actual_quantity} ${e.unit || ''}</strong></div>`).join('');
    }

    document.getElementById('stocktakeBackBtn')?.addEventListener('click', () => {
        document.getElementById('stocktakeReviewCard').style.display = 'none';
        document.getElementById('stocktakeFormCard').style.display = 'block';
    });

    document.getElementById('stocktakeSubmitBtn')?.addEventListener('click', async () => {
        const draft = localGet('stocktake_draft', null);
        if (!draft) return;
        const btn = document.getElementById('stocktakeSubmitBtn');
        btn.disabled = true; btn.textContent = 'Отправка...';

        const submission = {
            submitted_by: draft.filledBy,
            submitted_at: new Date().toISOString(),
            locked: true,
            entries: draft.entries
        };

        try {
            const saved = await P.DB.stocktake.submit(submission);
            // Применяем факт как новую базу для расчёта: сброс "было" на введённое значение,
            // расхождение при этом уже зафиксировано в самой заявке (entries[].expected_quantity).
            for (const entry of draft.entries) {
                const invItem = P.inventory.find(i => i.id == entry.inventory_id);
                if (invItem) {
                    invItem.quantity = entry.actual_quantity;
                    P.DB.inventory.update({
                        id: invItem.id, name: invItem.name, category: invItem.category,
                        quantity: invItem.quantity, unit: invItem.unit,
                        min_stock: invItem.min_stock || 0, price: invItem.price || 0, expiry: invItem.expiry || null
                    }).catch(e => console.warn('Не удалось сохранить сброс остатка после сверки:', e));
                }
            }
            localSet('stocktake_last_submission', saved && saved.submitted_at ? saved : submission);
            localSet('stocktake_draft', null);
            P.showToast('Остатки отправлены владельцу на сверку', 'success');
            renderInventoryTable();
            renderStocktakeList();
            renderReconcileTable();
        } catch (err) {
            console.error('Stocktake submit failed:', err);
            P.showToast('Не удалось отправить — попробуйте ещё раз', 'error');
        } finally {
            btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Отправить';
        }
    });

    document.getElementById('stocktakeNewSessionBtn')?.addEventListener('click', () => {
        P.confirmAction('Начать новый ввод', 'Текущая отправка останется в истории сверки. Начать новый ввод остатков?', () => {
            localSet('stocktake_last_submission', null);
            renderStocktakeList();
        });
    });

    // ========================================
    // СВЕРКА — расчёт vs факт (для владельца)
    // ========================================
    function getVarianceThresholdPct() {
        return parseFloat(P.varianceThresholdPct) || 5;
    }

    function renderReconcileTable() {
        const emptyState = document.getElementById('reconcileEmptyState');
        const tableWrap = document.getElementById('reconcileTableWrap');
        const tbody = document.getElementById('reconcileTableBody');
        const badge = document.getElementById('reconcileThresholdBadge');
        const alertBadge = document.getElementById('reconcileAlertBadge');
        if (!tbody) return;

        const threshold = getVarianceThresholdPct();
        if (badge) badge.textContent = `Порог расхождения: ${threshold}%`;

        const last = localGet('stocktake_last_submission', null);
        if (!last || !Array.isArray(last.entries) || !last.entries.length) {
            emptyState.style.display = 'block';
            tableWrap.style.display = 'none';
            if (alertBadge) alertBadge.style.display = 'none';
            return;
        }

        emptyState.style.display = 'none';
        tableWrap.style.display = 'block';

        const when = new Date(last.submitted_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        let overThresholdCount = 0;

        tbody.innerHTML = last.entries.map(e => {
            const expected = parseFloat(e.expected_quantity) || 0;
            const actual = parseFloat(e.actual_quantity) || 0;
            const diff = expected - actual;
            const diffPct = expected > 0 ? Math.abs(diff / expected * 100) : (actual > 0 ? 100 : 0);
            const isOver = diffPct > threshold;
            if (isOver) overThresholdCount++;
            const diffLabel = `${diff > 0 ? '−' : diff < 0 ? '+' : ''}${Math.abs(diff).toFixed(2)} ${e.unit || ''} (${diffPct.toFixed(1)}%)`;
            return `<tr>
                <td><strong>${e.name}</strong></td>
                <td>${expected.toFixed(2)} ${e.unit || ''}</td>
                <td>${actual.toFixed(2)} ${e.unit || ''}</td>
                <td>${last.submitted_by} · ${when}</td>
                <td><span class="status-badge ${isOver ? 'status-expired' : 'status-ok'}">${diffLabel}</span></td>
            </tr>`;
        }).join('');

        if (alertBadge) alertBadge.style.display = overThresholdCount > 0 ? 'inline-flex' : 'none';
    }

    // Init
    renderInventoryCategories();
    renderInventoryTable();

    // Expose
    window.renderInventoryTable = renderInventoryTable;
    window.renderInventoryCategories = renderInventoryCategories;
    window.renderEditableCategories = renderEditableCategories;
    window.renderPendingDeliveries = renderPendingDeliveries;
    window.renderConfirmedDeliveriesLog = renderConfirmedDeliveriesLog;
    window.generatePendingDeliveries = generatePendingDeliveries;
    window.renderStocktakeList = renderStocktakeList;
    window.renderReconcileTable = renderReconcileTable;

    console.log('%c[PROVISIO]%c Inventory module loaded (Склад + норматив/факт)', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
