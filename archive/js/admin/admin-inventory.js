/* ============================================
   PROVISIO — Inventory Module
   Stock table, CRUD, categories, deliveries
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) return;

    let editingInvId = null;

    // ========================================
    // INVENTORY CATEGORIES
    // ========================================
    function renderInventoryCategories() {
        const filter = document.getElementById('inventoryFilter');
        const modalCat = document.getElementById('modalInvCategory');
        filter.innerHTML = '<option value="all">Все категории</option>' + P.inventoryCategories.map(c => `<option value="${c}">${c}</option>`).join('');
        if (modalCat) modalCat.innerHTML = P.inventoryCategories.map(c => `<option>${c}</option>`).join('');
    }

    // ========================================
    // INVENTORY TABLE
    // ========================================
    function renderInventoryTable() {
        const tbody = document.getElementById('inventoryTableBody');
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

        // Calculate Alerts
        let lowStockList = P.inventory.filter(item => (item.quantity || item.qty) < (item.min_stock_level || item.minStock || 0));
        let expiredList = P.inventory.filter(item => (item.expiry_date || item.expiry) && new Date(item.expiry_date || item.expiry) < new Date());

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
            const qtyRaw = item.quantity || item.qty || 0;
            const minStockRaw = item.min_stock_level || item.minStock || 0;
            const priceRaw = item.average_price || item.price || 0;
            const expiryRaw = item.expiry_date || item.expiry || null;

            const isLow = qtyRaw < minStockRaw;
            const isExpired = expiryRaw && new Date(expiryRaw) < new Date();
            const status = isExpired ? '<span class="status-badge status-expired">Просрочен</span>' : isLow ? '<span class="status-badge status-low">Низкий</span>' : '<span class="status-badge status-ok">Норма</span>';
            const expiryDisplay = expiryRaw ? new Date(expiryRaw).toLocaleDateString('ru-RU') : '—';
            const dbIng = P.ingredients.find(i => i.name.toLowerCase() === item.name.toLowerCase());
            const linkIcon = dbIng
                ? `<i class="ph ph-link" style="color: var(--accent); margin-left: 4px; cursor: pointer;" title="Связано с ингредиентом" onclick="event.stopPropagation(); openIngredientModalByName('${item.name}')"></i>`
                : `<i class="ph ph-link-break" style="color: var(--text-muted); margin-left: 4px; cursor: pointer; opacity: 0.5;" title="Нет мастер-ингредиента" onclick="event.stopPropagation(); createIngredientFromName('${item.name}')"></i>`;

            const syncErrorHtml = item._syncError ? `
                <div class="sync-error-wrapper">
                    <i class="ph ph-warning-octagon sync-error-icon"></i>
                    <div class="sync-error-tooltip">Это изменение не сохранилось на наших серверах из-за ошибки сети или сервера.</div>
                </div>
            ` : '';

            return `<tr data-id="${item.id}">
                <td>
                    <div style="display: flex; align-items: center;">
                        <strong>${item.name}</strong> ${linkIcon} ${syncErrorHtml}
                    </div>
                </td>
                <td>${item.category}</td>
                <td>${qtyRaw} ${item.unit}</td>
                <td>${minStockRaw} ${item.unit}</td>
                <td>${item.currency || P.currentCurrency}${parseFloat(priceRaw).toFixed(2)} / ${item.unit}</td>
                <td>${expiryDisplay}</td>
                <td>${status}</td>
                <td><div class="table-actions">
                    <button class="table-action-btn inv-edit-btn" data-id="${item.id}" title="Редактировать"><i class="ph ph-pencil-simple"></i></button>
                    ${dbIng ? `<button class="table-action-btn inv-master-btn" data-name="${item.name}" title="Карточка ингредиента" style="color: var(--accent);"><i class="ph ph-flask"></i></button>` : ''}
                    <button class="table-action-btn table-action-danger inv-delete-btn" data-id="${item.id}" title="Удалить"><i class="ph ph-trash"></i></button>
                </div></td>
            </tr>`;
        }).join('');

        // Attach events
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
    }

    // ========================================
    // ADD / EDIT INVENTORY
    // ========================================
    function populateIngredientSelect(selectedName = '') {
        const select = document.getElementById('modalInvName');
        if (!select) return;
        const sorted = [...P.ingredients].sort((a,b) => a.name.localeCompare(b.name));
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
        document.getElementById('modalInvCategory').value = item.category;
        document.getElementById('modalInvQty').value = item.quantity || item.qty || 0;
        document.getElementById('modalInvUnit').value = item.unit;
        document.getElementById('modalInvMinStock').value = item.min_stock_level || item.minStock || 0;
        document.getElementById('modalInvPrice').value = item.average_price || item.price || 0;
        document.getElementById('modalInvExpiry').value = item.expiry_date || item.expiry || '';
        P.openModal('inventoryModal');
    }

    // Save
    document.getElementById('inventoryModalSave')?.addEventListener('click', async () => {
        const name = document.getElementById('modalInvName').value;
        const category = document.getElementById('modalInvCategory').value;
        const qty = parseFloat(document.getElementById('modalInvQty').value) || 0;
        const unit = document.getElementById('modalInvUnit').value;
        const minStock = parseFloat(document.getElementById('modalInvMinStock').value) || 0;
        const price = parseFloat(document.getElementById('modalInvPrice').value) || 0;
        const expiry = document.getElementById('modalInvExpiry').value || null;
        const currency = document.getElementById('modalInvCurrency')?.value || '$';

        if (!name || isNaN(qty) || isNaN(price)) { P.showToast('Заполните обязательные поля корректно', 'error'); return; }

        const itemData = { name, category, qty, unit, min_stock: minStock, price, expiry, currency };
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

    // Search/filter
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
    // INVENTORY SUB-TABS
    // ========================================
    document.querySelectorAll('.inv-subtab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.inv-subtab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.inv-subtab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const subtabId = btn.dataset.subtab === 'stock' ? 'invSubtabStock' : 'invSubtabDeliveries';
            document.getElementById(subtabId)?.classList.add('active');
            if (btn.dataset.subtab === 'deliveries') {
                renderPendingDeliveries();
                renderConfirmedDeliveriesLog();
            }
        });
    });

    // ========================================
    // PENDING DELIVERIES
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
        const pending = generatePendingDeliveries();
        document.getElementById('pendingDeliveriesCount').textContent = pending.length;

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

    // ========================================
    // DELIVERY CONFIRM MODAL
    // ========================================
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
                const currentQty = parseFloat(existingInv.quantity || existingInv.qty || 0);
                const newQty = currentQty + qty;
                await P.DB.inventory.update({ 
                    id: existingInv.id, 
                    name: existingInv.name, 
                    category: existingInv.category, 
                    qty: newQty, 
                    unit: existingInv.unit, 
                    min_stock: existingInv.min_stock_level || existingInv.minStock || 0, 
                    price: existingInv.average_price || existingInv.price || 0, 
                    expiry: existingInv.expiry_date || existingInv.expiry || null, 
                    currency: existingInv.currency || P.currentCurrency 
                });
            } else {
                await P.DB.inventory.add({ name: ingName, category: 'Без категории', qty, unit, min_stock: 1, price: 0, expiry: null, currency: P.currentCurrency });
            }
            await P.DB.inventory.logDelivery({ ingredient: ingName, supplier_name: pendingDeliveryToConfirm.supplierName, qty, unit, status: 'confirmed' }).catch(e => console.warn('Delivery log failed:', e));
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

    // ========================================
    // CONFIRMED/REJECTED DELIVERIES LOG
    // ========================================
    function renderConfirmedDeliveriesLog() {
        const list = document.getElementById('confirmedDeliveriesList');
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
    // DELIVERY NOTIFICATIONS
    // ========================================
    function generateDeliveryNotifications() {
        const pending = generatePendingDeliveries();
        const newNotifs = [];
        const maxId = P.notifications.length ? Math.max(...P.notifications.map(n => n.id)) : 100;
        let idx = 0;

        pending.forEach(d => {
            if (d.daysUntil === 0) {
                newNotifs.push({ id: maxId + (++idx), type: 'warning', category: 'delivery', icon: 'ph-truck', text: `<strong>Сегодня поставка:</strong> ${d.ingredient} (${d.qty} ${d.unit}) от «${d.supplierName}»`, time: 'сегодня', goto: 'inventory' });
            } else if (d.daysUntil === 1) {
                newNotifs.push({ id: maxId + (++idx), type: 'info', category: 'delivery', icon: 'ph-calendar-check', text: `<strong>Завтра поставка:</strong> ${d.ingredient} (${d.qty} ${d.unit}) от «${d.supplierName}»`, time: 'завтра', goto: 'inventory' });
            }
        });

        P.notifications = P.notifications.filter(n => n.category !== 'delivery');
        P.notifications.unshift(...newNotifs);
        if (typeof renderNotifications === 'function') renderNotifications();
        const dot = document.querySelector('.notification-dot');
        if (dot && newNotifs.length > 0) dot.style.display = 'block';
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
    window.generateDeliveryNotifications = generateDeliveryNotifications;

    console.log('%c[PROVISIO]%c Inventory module loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
