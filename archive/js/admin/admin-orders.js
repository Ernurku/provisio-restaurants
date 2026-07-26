/* ============================================
   PROVISIO — Orders Module
   Orders table, creation modal, items, receiving
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) return;

    let editOrderId = null;
    let modalOrderItems = [];

    // ========================================
    // ORDERS TABLE
    // ========================================
    window.renderOrdersTable = function () {
        const tbody = document.getElementById('ordersTableBody');
        if (!tbody) return;
        if (!P.orders.length) {
            tbody.innerHTML = `<tr><td colspan="6">
                <div class="empty-state empty-state-table">
                    <div class="empty-state-icon"><i class="ph ph-shopping-cart"></i></div>
                    <h3>У вас пока нет заказов</h3>
                    <p>Создавайте заказы поставщикам, отслеживайте их статусы и автоматически пополняйте склад при получении товаров</p>
                    <button class="btn btn-accent" onclick="document.getElementById('addOrderBtn')?.click()">
                        <i class="ph ph-plus-circle"></i> Создать первый заказ
                    </button>
                </div>
            </td></tr>`;
            return;
        }
        tbody.innerHTML = P.orders.map(ord => {
            const supplier = P.suppliers.find(s => String(s.id) === String(ord.supplier_id));
            const statusMap = { draft: 'Черновик', sent: 'Отправлен', received: 'Получен' };
            
            let badgeClass = 'status-badge ';
            if (ord.status === 'received') badgeClass += 'status-received';
            else if (ord.status === 'sent') badgeClass += 'status-sent';
            else badgeClass += 'status-draft';

            const syncErrorHtml = ord._syncError ? `
                <div class="sync-error-wrapper">
                    <i class="ph ph-warning-octagon sync-error-icon"></i>
                    <div class="sync-error-tooltip">Это изменение не сохранилось на наших серверах из-за ошибки сети или сервера.</div>
                </div>
            ` : '';

            const supplierHtml = supplier 
                ? `<a href="#" class="supplier-nav-link" data-id="${supplier.id}" style="color: var(--olive); font-weight: 600; text-decoration: none; border-bottom: 1px dashed var(--olive);">${supplier.name}</a>` 
                : '<span style="color: var(--chocolate-light); opacity: 0.6;">Неизвестно</span>';

            return `<tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <strong>#${ord.order_number || (ord.id ? ord.id.toString().substring(0,8) : '?')}</strong> ${syncErrorHtml}
                    </div>
                </td>
                <td>${supplierHtml}</td>
                <td>${new Date(ord.created_at || Date.now()).toLocaleDateString('ru-RU')}</td>
                <td><strong>${P.currentCurrency}${parseFloat(ord.total_amount || ord.total || 0).toFixed(2)}</strong></td>
                <td><span class="${badgeClass}">${statusMap[ord.status] || ord.status}</span></td>
                <td><div class="table-actions">
                    <button class="table-action-btn edit-order-btn" data-id="${ord.id}" title="Просмотр/Правка"><i class="ph ph-pencil-simple"></i></button>
                </div></td>
            </tr>`;
        }).join('');

        // Listeners for editing
        tbody.querySelectorAll('.edit-order-btn').forEach(btn => btn.addEventListener('click', () => openOrderModal(btn.dataset.id)));
        
        // Listeners for supplier navigation
        tbody.querySelectorAll('.supplier-nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const sid = link.dataset.id;
                if (window.switchTab) window.switchTab('suppliers');
                if (window.selectSupplier) window.selectSupplier(sid);
            });
        });
    };

    // ========================================
    // ORDER ITEMS
    // ========================================
    function renderModalOrderItems() {
        const list = document.getElementById('modalOrderItemsList');
        if (!list) return;

        let total = 0;
        if (modalOrderItems.length === 0) {
            list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Нет позиций</div>';
            document.getElementById('modalOrderTotal').textContent = `0.00 ${P.currentCurrency}`;
            return;
        }

        list.innerHTML = `
            <div class="order-items-header order-items-grid">
                <span>Ингредиент</span>
                <span style="text-align:center;">Кол-во</span>
                <span style="text-align:center;">Ед.</span>
                <span style="text-align:center;">Цена за ед.</span>
                <span style="text-align:right;">Сумма</span>
                <span></span>
            </div>
            ` + modalOrderItems.map((it, i) => {
                const cost = (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0);
                total += cost;
                return `
                <div class="order-item-edit-row order-items-grid" data-index="${i}">
                    <select class="admin-input ord-name">
                        <option value="">Выберите...</option>
                        ${P.ingredients.map(ing => `<option value="${ing.name}" ${ing.name === it.ingredient ? 'selected' : ''}>${ing.name}</option>`).join('')}
                    </select>
                    <input type="number" class="admin-input ord-qty" value="${it.qty}" step="0.1" placeholder="0">
                    <select class="admin-input ord-unit">
                        ${['кг', 'г', 'л', 'мл', 'шт', 'упак', 'порт'].map(u => `<option value="${u}" ${it.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
                    </select>
                    <input type="number" class="admin-input ord-price" value="${it.price}" step="0.01" placeholder="0.00">
                    <div class="row-subtotal-container">
                        <span class="row-subtotal">${cost.toFixed(2)}</span> ${P.currentCurrency}
                    </div>
                    <button class="btn-icon-inline ord-remove" data-idx="${i}"><i class="ph ph-trash"></i></button>
                </div>`;
            }).join('');

        document.getElementById('modalOrderTotal').textContent = `${total.toFixed(2)} ${P.currentCurrency}`;

        list.querySelectorAll('.order-item-edit-row').forEach(row => {
            const idx = parseInt(row.dataset.index);
            const updateUI = () => {
                modalOrderItems[idx].ingredient = row.querySelector('.ord-name').value;
                modalOrderItems[idx].qty = parseFloat(row.querySelector('.ord-qty').value) || 0;
                modalOrderItems[idx].price = parseFloat(row.querySelector('.ord-price').value) || 0;
                modalOrderItems[idx].unit = row.querySelector('.ord-unit').value;
                renderModalOrderItems(); // Re-render for safety and subtotal updates
            };
            
            row.querySelector('.ord-name').addEventListener('change', (e) => {
                const ingName = e.target.value;
                const suppId = document.getElementById('modalOrderSupplier').value;
                let autoPrice = null;
                let autoUnit = null;
                
                if (suppId && ingName) {
                    const supp = P.suppliers.find(s => s.id == suppId);
                    if (supp && supp.prices) {
                        const priceInfo = supp.prices.find(p => p.ingredient.toLowerCase() === ingName.toLowerCase());
                        if (priceInfo) {
                            autoPrice = priceInfo.price || 0;
                            autoUnit = priceInfo.pack_unit || priceInfo.unit || 'шт';
                        }
                    }
                }
                
                modalOrderItems[idx].ingredient = ingName;
                modalOrderItems[idx].qty = parseFloat(row.querySelector('.ord-qty').value) || 0;
                
                if (autoPrice !== null) modalOrderItems[idx].price = autoPrice;
                else modalOrderItems[idx].price = parseFloat(row.querySelector('.ord-price').value) || 0;
                
                if (autoUnit !== null) modalOrderItems[idx].unit = autoUnit;
                else modalOrderItems[idx].unit = row.querySelector('.ord-unit').value;
                
                renderModalOrderItems();
            });
            row.querySelector('.ord-qty').addEventListener('input', updateUI);
            row.querySelector('.ord-price').addEventListener('input', updateUI);
            row.querySelector('.ord-unit').addEventListener('change', updateUI);
            row.querySelector('.ord-remove').addEventListener('click', () => { modalOrderItems.splice(idx, 1); renderModalOrderItems(); });
        });
    }

    // ========================================
    // ORDER MODAL & CRUD
    // ========================================
    function openOrderModal(id = null) {
        editOrderId = id;
        document.getElementById('orderModalTitle').textContent = id ? `Заказ # ${id}` : 'Создать заказ';
        const suppSelect = document.getElementById('modalOrderSupplier');
        suppSelect.innerHTML = '<option value="">Выберите поставщика</option>' + P.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

        if (id) {
            const ord = P.orders.find(o => o.id == id);
            document.getElementById('modalOrderSupplier').value = ord.supplier_id || '';
            document.getElementById('modalOrderStatus').value = ord.status || 'draft';
            try { modalOrderItems = typeof ord.items === 'string' ? JSON.parse(ord.items) : (ord.items || []); } catch (e) { modalOrderItems = []; }
        } else {
            document.getElementById('modalOrderSupplier').value = '';
            document.getElementById('modalOrderStatus').value = 'draft';
            modalOrderItems = [];
        }
        renderModalOrderItems();
        P.openModal('orderModal');
    }

    document.getElementById('addOrderBtn')?.addEventListener('click', () => openOrderModal());
    document.getElementById('orderModalCancel')?.addEventListener('click', () => P.closeAllModals());
    document.getElementById('orderModalClose')?.addEventListener('click', () => P.closeAllModals());

    document.getElementById('modalAddOrderItemBtn')?.addEventListener('click', () => {
        modalOrderItems.push({ ingredient: '', qty: 1, unit: 'шт', price: 0 });
        renderModalOrderItems();
    });

    document.getElementById('orderModalSave')?.addEventListener('click', async () => {
        const suppId = document.getElementById('modalOrderSupplier').value;
        if (!suppId) { P.showToast('Выберите поставщика', 'error'); return; }

        let total = modalOrderItems.reduce((acc, it) => acc + (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0), 0);
        let oldStatus = 'draft';
        if (editOrderId) {
            const ord = P.orders.find(o => o.id == editOrderId);
            if (ord) oldStatus = ord.status;
        }

        const data = {
            id: editOrderId,
            supplier_id: suppId,
            status: document.getElementById('modalOrderStatus').value,
            items: modalOrderItems,
            total_amount: total,
            order_number: editOrderId ? (P.orders.find(o => o.id == editOrderId)?.order_number || 'ORD-' + Date.now().toString().slice(-6)) : 'ORD-' + Date.now().toString().slice(-6)
        };

        try {
            if (editOrderId) await P.DB.orders.update(data);
            else await P.DB.orders.create(data);

            if (oldStatus !== 'received' && data.status === 'received') {
                try {
                    await processReceivedOrder(data);
                    P.showToast('Склад и цены обновлены!', 'success');
                } catch(err) { console.error("Оприходование провалилось:", err); }
            }
            P.closeAllModals(); P.showToast('Заказ сохранён', 'success');
        } catch (e) { P.showToast(e.message, 'error'); }
    });

    // ========================================
    // PROCESS RECEIVED ORDER (Automatic Stock Entry)
    // ========================================
    async function processReceivedOrder(orderData) {
        if (!orderData || !Array.isArray(orderData.items)) return;
        for (const item of orderData.items) {
            if (!item.ingredient || !item.qty) continue;
            const ingName = item.ingredient.toLowerCase().trim();

            let invItem = P.inventory.find(i => i.name.toLowerCase().trim() === ingName);
            const masterIng = P.ingredients.find(ing => ing.name.toLowerCase().trim() === ingName);

            let addedQty = parseFloat(item.qty);
            let actualPricePerUnit = parseFloat(item.price) || 0; // The row item.price should already be unit price

            if (invItem) {
                if (window.ReactiveEngine) {
                    const factorFrom = window.ReactiveEngine.getConversionFactor(item.unit, masterIng);
                    const factorTo = window.ReactiveEngine.getConversionFactor(invItem.unit, masterIng);
                    if (factorFrom > 0 && factorTo > 0) {
                        addedQty = (addedQty * factorFrom) / factorTo;
                        actualPricePerUnit = parseFloat(item.qty) * parseFloat(item.price) / addedQty;
                    }
                }
                invItem.qty = parseFloat(invItem.qty || 0) + addedQty;
                invItem.price = actualPricePerUnit;
                await P.DB.inventory.update(invItem).catch(e => console.warn('Silent inventory update error', e));
            } else {
                await P.DB.inventory.add({
                    name: item.ingredient, qty: addedQty, unit: item.unit, minStock: 0, price: actualPricePerUnit
                }).catch(e => console.warn('Silent inventory add error', e));
            }
        }

        // Update supplier prices
        const supplier = P.suppliers.find(s => s.id == orderData.supplier_id);
        if (supplier) {
            let changed = false;
            orderData.items.forEach(item => {
                supplier.prices = supplier.prices || [];
                const priceEntry = supplier.prices.find(p => p.ingredient.toLowerCase().trim() === item.ingredient.toLowerCase().trim());
                if (priceEntry) {
                    if (parseFloat(priceEntry.price) !== parseFloat(item.price * item.qty) || priceEntry.unit !== item.unit) {
                        priceEntry.price = parseFloat(item.price * item.qty); // Supplier price is total for pack
                        priceEntry.qty = parseFloat(item.qty);
                        priceEntry.unit = item.unit;
                        changed = true;
                    }
                } else {
                    supplier.prices.push({ ingredient: item.ingredient, price: parseFloat(item.price * item.qty), qty: parseFloat(item.qty), unit: item.unit });
                    changed = true;
                }
            });
            if (changed) await P.DB.suppliers.upsert(supplier).catch(e => console.warn('Silent supplier price update error', e));
        }

        if (window.ReactiveEngine) window.ReactiveEngine.recalculateAll(true);
    }

    // Init render
    renderOrdersTable();

    console.log('%c[PROVISIO]%c Orders module loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
