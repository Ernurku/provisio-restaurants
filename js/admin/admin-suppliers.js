/* ============================================
   PROVISIO — Suppliers Module
   Supplier list, profile, prices, groups,
   schedules, notes, delivery days
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) return;

    let selectedSupplierId = null;
    let supplierFilterActive = [];

    // ========================================
    // LOAD SUPPLIERS
    // ========================================
    async function loadSuppliers() {
        try {
            const data = await P.DB.suppliers.list();
            if (Array.isArray(data) && data.length > 0) {
                const allGroups = new Set(P.supplierGroups);
                P.suppliers.forEach(s => (s.tags || s.groups || []).forEach(g => allGroups.add(g)));
                P.supplierGroups = [...allGroups];
            }
        } catch (err) { console.warn('Provisio: Suppliers API unavailable'); }
        renderSuppliersList();
    }

    async function saveSupplierToServer(supplier) {
        try { 
            const payload = { ...supplier };
            delete payload.notes;
            await P.DB.suppliers.upsert(payload); 
        }
        catch (err) { console.warn('Provisio: Could not sync supplier to server:', err.message); }
    }

    // ========================================
    // SUPPLIERS LIST
    // ========================================
    function renderSuppliersList() {
        const list = document.getElementById('suppliersList');
        const q = (document.getElementById('supplierSearch')?.value || '').toLowerCase();
        let filtered = P.suppliers;
        if (q) filtered = filtered.filter(s => s.name.toLowerCase().includes(q));
        if (supplierFilterActive.length > 0) filtered = filtered.filter(s => (s.tags || s.groups || []).some(g => supplierFilterActive.includes(g)));

        if (filtered.length === 0 && P.suppliers.length === 0) {
            list.innerHTML = `<div class="empty-state empty-state-sidebar">
                <div class="empty-state-icon"><i class="ph ph-truck"></i></div>
                <h3>Нет поставщиков</h3>
                <p>Добавьте поставщиков и их прайсы для автоматического расчёта себестоимости</p>
                <button class="btn btn-accent" onclick="document.getElementById('createSupplierBtn')?.click()"><i class="ph ph-plus-circle"></i> Добавить</button>
            </div>`;
            return;
        }
        if (filtered.length === 0) {
            list.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--chocolate-light); font-size: 0.8125rem;">
                <i class="ph ph-magnifying-glass" style="font-size: 24px; display: block; margin-bottom: 8px; opacity: 0.4;"></i>Поставщики не найдены</div>`;
            return;
        }

        list.innerHTML = filtered.map(s => `
            <div class="supplier-list-item ${s.id === selectedSupplierId ? 'active' : ''}" data-id="${s.id}">
                <span class="supplier-list-item-name">${s.name}</span>
                <span class="supplier-list-item-count">${(s.prices || []).filter(p => p.type !== 'metadata').length}</span>
            </div>`).join('');
        list.querySelectorAll('.supplier-list-item').forEach(el => el.addEventListener('click', () => selectSupplier(el.dataset.id)));
    }

    // ========================================
    // SELECT SUPPLIER (Detail View)
    // ========================================
    function selectSupplier(id) {
        selectedSupplierId = id;
        const s = P.suppliers.find(x => x.id == id);
        if (!s) return;
        document.getElementById('suppliersEmpty').style.display = 'none';
        document.getElementById('supplierDetail').style.display = 'flex';
        document.getElementById('supplierDetailName').textContent = s.name;
        renderSupplierPrices(s);
        renderSupplierNotes(s);
        renderSupplierGroups(s);
        renderSupplierDeliveryDays(s);
        renderSuppliersList();
        const actionsDrop = document.getElementById('supplierActionsDropdown');
        const addDrop = document.getElementById('supplierAddDropdown');
        if (actionsDrop) actionsDrop.style.display = 'none';
        if (addDrop) addDrop.style.display = 'none';
    }

    // ========================================
    // DELIVERY DAYS DISPLAY
    // ========================================
    function renderSupplierDeliveryDays(s) {
        const display = document.getElementById('supplierDeliveryDaysDisplay');
        if (!display) return;
        const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        const now = new Date();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
        monday.setHours(0, 0, 0, 0);

        const getIsActive = (dayName, dayIdx) => {
            const date = new Date(monday); date.setDate(monday.getDate() + dayIdx);
            if (!s.schedule || s.schedule.length === 0) return false;
            return s.schedule.some(item => {
                const freq = item.frequency || 'weekly';
                if (freq === 'daily') return true;
                if (freq === 'weekly') return item.day === dayName;
                if (freq === '2days' || freq === '3days') { const step = freq === '2days' ? 2 : 3; const ref = new Date('2024-01-01T00:00:00'); const diffDays = Math.floor((date - ref) / (1000 * 60 * 60 * 24)); return diffDays % step === 0; }
                if (freq === 'monthly') return item.day === dayName && date.getDate() <= 7;
                return false;
            });
        };

        let html = `<div style="width: 100%; margin-bottom: 8px; font-weight: 600; font-size: 0.8125rem; color: var(--chocolate);">Дни доставки на этой неделе:</div>`;
        html += days.map((d, i) => `<span class="schedule-day-pill ${getIsActive(d, i) ? 'active' : ''}" data-day="${d}" style="cursor:pointer;" title="Нажмите, чтобы переключить">${d}</span>`).join('');
        const timeMeta = (s.schedule || []).find(item => item.type === 'time_meta');
        const timeFlexible = timeMeta ? timeMeta.flexible : (s.delivery_time_flexible || false);
        const timeVal = timeMeta ? (timeMeta.time || '') : (s.delivery_time || '');
        const timeStr = timeFlexible ? 'Гибкое время' : (timeVal || 'Не указано');
        html += `<div id="supplierTimeDisplay" style="width: 100%; margin-top: 12px; font-size: 0.75rem; color: var(--chocolate-light); cursor: pointer;" title="Нажмите, чтобы изменить время">
            <i class="ph ph-clock" style="vertical-align: middle; margin-right: 4px;"></i> Время (общее): <strong>${timeStr}</strong> <i class="ph ph-pencil-simple" style="opacity:0.4; font-size:0.7rem;"></i>
        </div>`;
        display.innerHTML = html;

        display.querySelectorAll('.schedule-day-pill[data-day]').forEach(pill => {
            pill.addEventListener('click', () => {
                const day = pill.dataset.day;
                s.schedule = s.schedule || [];
                const idx = s.schedule.findIndex(item => (item.frequency || 'weekly') === 'weekly' && item.day === day);
                if (idx >= 0) {
                    s.schedule.splice(idx, 1);
                } else {
                    s.schedule.push({ frequency: 'weekly', day });
                }
                renderSupplierDeliveryDays(s);
                saveSupplierToServer(s);
            });
        });

        const timeDisplayEl = display.querySelector('#supplierTimeDisplay');
        if (timeDisplayEl) {
            timeDisplayEl.addEventListener('click', (e) => {
                // Guard: if editor already rendered, ignore bubbled clicks
                if (display.querySelector('#timeValInput')) return;

                timeDisplayEl.innerHTML = `
                    <i class="ph ph-clock" style="vertical-align:middle; margin-right:4px;"></i> Время (общее):
                    <label style="margin-left:8px; cursor:pointer;"><input type="checkbox" id="timeFlexCheck" ${timeFlexible ? 'checked' : ''}> Гибкое</label>
                    <input type="time" id="timeValInput" value="${timeVal}" style="margin-left:8px; font-size:0.75rem;" ${timeFlexible ? 'disabled' : ''}>
                    <button id="saveTimeBtn" style="margin-left:8px; font-size:0.7rem; padding:2px 8px;" class="btn btn-accent btn-sm">OK</button>
                    <button id="cancelTimeBtn" style="margin-left:4px; font-size:0.7rem; padding:2px 8px;" class="btn btn-outline btn-sm">✕</button>
                `;

                // Stop clicks on inner controls from re-triggering the outer handler
                timeDisplayEl.querySelectorAll('input, button, label').forEach(el => {
                    el.addEventListener('click', ev => ev.stopPropagation());
                });

                const flexCheck = document.getElementById('timeFlexCheck');
                const timeInput = document.getElementById('timeValInput');
                flexCheck.addEventListener('change', () => { timeInput.disabled = flexCheck.checked; });

                document.getElementById('saveTimeBtn').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    s.schedule = s.schedule || [];
                    const tMeta = s.schedule.find(item => item.type === 'time_meta');
                    const newFlexible = document.getElementById('timeFlexCheck').checked;
                    const newTime = document.getElementById('timeValInput').value;
                    if (tMeta) { tMeta.flexible = newFlexible; tMeta.time = newTime; }
                    else s.schedule.push({ type: 'time_meta', flexible: newFlexible, time: newTime });
                    renderSupplierDeliveryDays(s);
                    saveSupplierToServer(s);
                });
                document.getElementById('cancelTimeBtn').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    renderSupplierDeliveryDays(s);
                });
            });
        }
    }

    // ========================================
    // SUPPLIER PRICES & SCHEDULE TABLE
    // ========================================
    const frequencyLabels = { daily: 'Ежедневно', every_2_days: 'Каждые 2 дня', every_3_days: 'Каждые 3 дня', weekly: 'Раз в неделю', monthly: 'Раз в месяц' };
    const dayLabels = { 0: 'Воскресенье', 1: 'Понедельник', 2: 'Вторник', 3: 'Среда', 4: 'Четверг', 5: 'Пятница', 6: 'Суббота' };

    function renderSupplierPrices(s) {
        const tbody = document.getElementById('supplierPricesBody');
        const empty = document.getElementById('supplierPricesEmpty');
        const table = document.getElementById('supplierPricesTable');

        const displayPrices = s.prices.filter(p => p.type !== 'metadata');
        if (!displayPrices.length) {
            table.style.display = 'none'; empty.style.display = 'block';
            const btn = document.getElementById('emptyStateAddPriceBtn');
            if (btn && !btn.getAttribute('data-has-listener')) {
                btn.addEventListener('click', () => openAddPriceModal());
                btn.setAttribute('data-has-listener', 'true');
            }
            return;
        }
        table.style.display = ''; empty.style.display = 'none';
        tbody.innerHTML = displayPrices.map(p => `
            <tr data-price-id="${p.id}">
                <td><strong>${p.ingredient}</strong></td>
                <td>${P.formatMoney(p.price)}</td>
                <td>${p.pack_qty || p.qty} ${p.pack_unit || p.unit}</td>
                <td>
                    ${p.delivery_frequency ? `<span class="schedule-freq-badge">${frequencyLabels[p.delivery_frequency] || p.delivery_frequency}</span>` : '<span class="text-muted">—</span>'}
                </td>
                <td>
                    ${['daily', 'every_2_days', 'every_3_days'].includes(p.delivery_frequency) ? '<span class="text-muted">—</span>' : (p.delivery_frequency === 'monthly' ? (p.delivery_day ? p.delivery_day + ' число' : '<span class="text-muted">—</span>') : (p.delivery_frequency && p.delivery_day !== undefined && dayLabels[p.delivery_day] ? dayLabels[p.delivery_day] : '<span class="text-muted">—</span>'))}
                </td>
                <td>
                    ${p.delivery_qty ? `${p.delivery_qty} ${p.pack_unit || p.unit}` : '<span class="text-muted">—</span>'}
                </td>
                <td><div class="table-actions">
                    <button class="table-action-btn sp-edit-btn" data-id="${p.id}" title="Редактировать"><i class="ph ph-pencil-simple"></i></button>
                    <button class="table-action-btn table-action-danger sp-delete-btn" data-id="${p.id}" title="Удалить"><i class="ph ph-trash"></i></button>
                </div></td>
            </tr>`).join('');

        tbody.querySelectorAll('.sp-edit-btn').forEach(btn => btn.addEventListener('click', () => editSupplierPrice(s, btn.dataset.id)));
        tbody.querySelectorAll('.sp-delete-btn').forEach(btn => btn.addEventListener('click', () => {
            P.confirmAction('Удалить', 'Удалить этот ингредиент из прайс-листа и графика?', () => {
                s.prices = s.prices.filter(p => p.id != btn.dataset.id);
                renderSupplierPrices(s); renderSuppliersList(); saveSupplierToServer(s);
                P.showToast('Удалено');
            });
        }));
    }

    function editSupplierPrice(s, priceId) {
        const p = s.prices.find(x => x.id == priceId);
        if (!p) return;
        const row = document.querySelector(`tr[data-price-id="${priceId}"]`);
        if (!row) return;
        const units = ['г', 'кг', 'мл', 'л', 'шт', 'коробка', 'ящик', 'упаковка', 'банка', 'бутылка', 'пучок'];
        const freqs = ['daily', 'every_2_days', 'every_3_days', 'weekly', 'monthly'];
        const days = [1, 2, 3, 4, 5, 6, 0];
        
        row.classList.add('supplier-price-editing');
        row.innerHTML = `
            <td><select class="admin-input sp-edit-name" style="width: 100%;">
                ${P.ingredients.map(it => `<option value="${it.name}" ${it.name === p.ingredient ? 'selected' : ''}>${it.name}</option>`).join('')}
            </select></td>
            <td><input type="number" class="admin-input sp-edit-price" value="${p.price}" step="0.01" style="width: 70px;"></td>
            <td style="display:flex; gap:4px;">
                <input type="number" class="admin-input sp-edit-qty" value="${p.pack_qty || p.qty}" step="0.1" style="width: 60px;">
                <select class="admin-input sp-edit-unit">${units.map(u => `<option ${u === (p.pack_unit || p.unit) ? 'selected' : ''}>${u}</option>`).join('')}</select>
            </td>
            <td><select class="admin-input sp-edit-freq" style="width: 100%;">
                <option value="">Без доставки</option>
                ${freqs.map(f => `<option value="${f}" ${f === p.delivery_frequency ? 'selected' : ''}>${frequencyLabels[f]}</option>`).join('')}
            </select></td>
            <td><select class="admin-input sp-edit-day" style="width: 100%;">
                ${(p.delivery_frequency === 'monthly' ? Array.from({length: 31}, (_, i) => i + 1) : days).map(d => `<option value="${d}" ${d == p.delivery_day ? 'selected' : ''}>${p.delivery_frequency === 'monthly' ? d + ' число' : dayLabels[d]}</option>`).join('')}
            </select></td>
            <td><input type="number" class="admin-input sp-edit-delqty" value="${p.delivery_qty || ''}" step="0.1" style="width: 60px;" placeholder="Объем"></td>
            <td><div class="table-actions">
                <button class="table-action-btn sp-save-btn" title="Сохранить" style="background: var(--olive); color: var(--white);"><i class="ph ph-check"></i></button>
                <button class="table-action-btn sp-cancel-btn" title="Отмена"><i class="ph ph-x"></i></button>
            </div></td>`;
        
        row.querySelector('.sp-edit-name').addEventListener('change', (e) => {
            const ing = P.ingredients.find(it => it.name === e.target.value);
            if (ing && (ing.base_unit || ing.baseUnit)) {
                row.querySelector('.sp-edit-unit').value = ing.base_unit || ing.baseUnit;
            }
        });
        row.querySelector('.sp-save-btn').addEventListener('click', () => {
            p.ingredient = row.querySelector('.sp-edit-name').value;
            p.price = parseFloat(row.querySelector('.sp-edit-price').value) || 0;
            const newQty = parseFloat(row.querySelector('.sp-edit-qty').value) || 0;
            const newUnit = row.querySelector('.sp-edit-unit').value;
            const newFreq = row.querySelector('.sp-edit-freq').value;
            const newDay = parseInt(row.querySelector('.sp-edit-day').value);
            const newDelQty = parseFloat(row.querySelector('.sp-edit-delqty').value) || 0;
            
            if (p.pack_qty !== undefined) p.pack_qty = newQty; else p.qty = newQty;
            if (p.pack_unit !== undefined) p.pack_unit = newUnit; else p.unit = newUnit;
            p.delivery_frequency = newFreq || null;
            p.delivery_day = newFreq ? newDay : null;
            p.delivery_qty = newFreq ? newDelQty : null;
            
            renderSupplierPrices(s);
            if (window.ReactiveEngine) window.ReactiveEngine.recalculateAll(false);
            saveSupplierToServer(s);
            P.showToast('Обновлено');
            P.logAction('Изменена цена/график', 'Ингредиент', p.ingredient, `(Поставщик: ${s.name})`);
        });
        row.querySelector('.sp-cancel-btn').addEventListener('click', () => renderSupplierPrices(s));
    }

    function openAddPriceModal() {
        const sel = document.getElementById('supplierPriceIngredient');
        if (sel) {
            const options = P.ingredients.map(ing => `<option value="${ing.name}">${ing.name}</option>`).join('');
            sel.innerHTML = options || '<option disabled>Сначала добавьте ингредиенты</option>';
        }
        const curLabels = document.querySelectorAll('.supplier-price-currency');
        curLabels.forEach(l => l.textContent = (P.currencySymbols[P.AppStore.currency] || '₸'));
        P.openModal('addSupplierPriceModal');
    }

    // ========================================
    // SUPPLIER NOTES
    // ========================================
    function renderSupplierNotes(s) {
        const display = document.getElementById('supplierNotesDisplay');
        if (!display) return;
        const meta = (s.prices || []).find(p => p.type === 'metadata');
        const notes = meta ? meta.notes : (s.notes || '');
        display.innerHTML = notes
            ? `<div class="supplier-notes-text" style="padding: 12px; background: var(--surface-hover); border-radius: 8px; cursor: pointer; border: 1px dashed transparent;" title="Кликните, чтобы редактировать">${notes}</div>`
            : `<div class="supplier-notes-placeholder" style="color: var(--chocolate-light); font-size: 0.875rem; padding: 12px; background: var(--surface-hover); border-radius: 8px; cursor: pointer; border: 1px dashed var(--border-color);" title="Кликните, чтобы добавить">Нет примечаний. Кликните, чтобы добавить условия поставки...</div>`;
        display.onclick = () => {
            display.innerHTML = `<textarea class="admin-input" id="tempNotesInput" style="width:100%; min-height: 100px; margin-bottom: 8px;">${notes || ''}</textarea>
                <div style="display:flex; gap: 8px; justify-content: flex-end;"><button class="btn btn-outline btn-sm" id="cancelNotesBtn">Отмена</button><button class="btn btn-accent btn-sm" id="saveNotesBtn">Сохранить</button></div>`;
            display.onclick = null;
            document.getElementById('saveNotesBtn').onclick = (e) => { 
                e.stopPropagation(); 
                const newNotes = document.getElementById('tempNotesInput').value.trim(); 
                s.notes = newNotes; 
                s.prices = s.prices || [];
                let m = s.prices.find(p => p.type === 'metadata');
                if (m) m.notes = newNotes;
                else s.prices.push({ id: Date.now(), type: 'metadata', notes: newNotes });
                saveSupplierToServer(s); 
                renderSupplierNotes(s); 
                P.showToast('Примечание сохранено'); 
                P.logAction('Изменил примечание', 'Поставщик', s.name, 'Вписал новые условия'); 
            };
            document.getElementById('cancelNotesBtn').onclick = (e) => { e.stopPropagation(); renderSupplierNotes(s); };
        };
    }

    // ========================================
    // SUPPLIER GROUPS
    // ========================================
    function renderSupplierGroups(s) {
        const tbody = document.getElementById('supplierGroupsBody');
        const empty = document.getElementById('supplierGroupsEmpty');
        const table = document.getElementById('supplierGroupsTable');
        const tags = s.tags || s.groups || [];
        if (!tags.length) { table.style.display = 'none'; empty.style.display = 'block'; return; }
        table.style.display = ''; empty.style.display = 'none';
        tbody.innerHTML = tags.map(g => {
            const count = (s.prices || []).filter(p => p.type !== 'metadata').length;
            return `<tr><td><strong>${g}</strong></td><td>${count}</td>
                <td><button class="table-action-btn table-action-danger sg-remove-btn" data-group="${g}" title="Удалить из группы"><i class="ph ph-trash"></i></button></td></tr>`;
        }).join('');
        tbody.querySelectorAll('.sg-remove-btn').forEach(btn => btn.addEventListener('click', () => {
            P.confirmAction('Исключить из группы', `Исключить поставщика из группы «${btn.dataset.group}»?`, () => {
                s.groups = s.groups.filter(g => g !== btn.dataset.group);
                renderSupplierGroups(s); saveSupplierToServer(s);
                P.showToast(`Поставщик исключён из группы «${btn.dataset.group}»`);
            });
        }));
    }

    // Schedule module merged into Prices

    // ========================================
    // DROPDOWNS
    // ========================================
    document.getElementById('supplierActionsBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const drop = document.getElementById('supplierActionsDropdown');
        if (drop) { drop.style.display = drop.style.display === 'block' ? 'none' : 'block'; }
        const addDrop = document.getElementById('supplierAddDropdown');
        if (addDrop) addDrop.style.display = 'none';
    });
    document.getElementById('supplierAddBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const drop = document.getElementById('supplierAddDropdown');
        if (drop) { drop.style.display = drop.style.display === 'block' ? 'none' : 'block'; }
        const actionsDrop = document.getElementById('supplierActionsDropdown');
        if (actionsDrop) actionsDrop.style.display = 'none';
    });
    document.addEventListener('click', () => {
        const actionsDrop = document.getElementById('supplierActionsDropdown');
        const addDrop = document.getElementById('supplierAddDropdown');
        if (actionsDrop) actionsDrop.style.display = 'none';
        if (addDrop) addDrop.style.display = 'none';
    });

    // ========================================
    // RENAME / DELETE SUPPLIER
    // ========================================
    document.getElementById('renameSupplierBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const actionsDrop = document.getElementById('supplierActionsDropdown');
        if (actionsDrop) actionsDrop.style.display = 'none';

        const s = P.suppliers.find(x => x.id == selectedSupplierId);
        if (!s) return;
        const nameEl = document.getElementById('supplierDetailName');
        if (!nameEl) return;

        const oldName = s.name;
        nameEl.innerHTML = `<input type="text" id="renameInput" class="admin-input" value="${oldName.replace(/"/g, '&quot;')}" style="font-family:var(--font-serif);font-size:inherit;padding:4px 10px;width:auto;min-width:200px;display:inline-block;"><button id="renameOkBtn" class="btn btn-accent btn-sm" style="margin-left:8px;vertical-align:middle;">Сохранить</button><button id="renameCancelBtn" class="btn btn-outline btn-sm" style="margin-left:4px;vertical-align:middle;">Отмена</button>`;

        const input = document.getElementById('renameInput');
        input.focus(); input.select();

        const doSave = async () => {
            const newName = (document.getElementById('renameInput')?.value || '').trim();
            if (!newName || newName === oldName) { nameEl.textContent = oldName; return; }
            s.name = newName;
            nameEl.textContent = newName;
            await saveSupplierToServer(s);
            renderSuppliersList();
            P.logAction('Переименован', 'Поставщик', s.name, `Старое имя: ${oldName}`);
            P.showToast('Поставщик переименован');
        };

        document.getElementById('renameOkBtn').addEventListener('click', doSave);
        document.getElementById('renameCancelBtn').addEventListener('click', () => { nameEl.textContent = oldName; });
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); doSave(); }
            if (ev.key === 'Escape') nameEl.textContent = oldName;
        });
    });

    document.getElementById('deleteSupplierBtn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const s = P.suppliers.find(x => x.id == selectedSupplierId);
        if (!s) return;
        P.confirmAction('Удалить поставщика', `Вы уверены, что хотите удалить «${s.name}»? Все цены и расписания будут стерты.`, async () => {
            await P.DB.suppliers.delete(s.id);
            selectedSupplierId = null;
            document.getElementById('supplierDetail').style.display = 'none';
            document.getElementById('suppliersEmpty').style.display = 'block';
            renderSuppliersList();
            P.logAction('Удалено', 'Поставщик', s.name, 'Карточка поставщика полностью удалена');
            P.showToast('Поставщик удален');
        });
    });

    // ========================================
    // ADD PRICE
    // ========================================
    document.getElementById('addSupplierPriceBtn')?.addEventListener('click', (e) => { e.preventDefault(); openAddPriceModal(); });
    
    document.getElementById('supplierPriceIngredient')?.addEventListener('change', (e) => {
        const ing = P.ingredients.find(it => it.name === e.target.value);
        if (ing && (ing.base_unit || ing.baseUnit)) {
            const unitSelect = document.getElementById('supplierPriceUnit');
            if (unitSelect) unitSelect.value = ing.base_unit || ing.baseUnit;
        }
    });

    document.getElementById('addSupplierPriceSave')?.addEventListener('click', () => {
        const s = P.suppliers.find(x => x.id == selectedSupplierId);
        if (!s) return;
        const ingredient = document.getElementById('supplierPriceIngredient').value.trim();
        const price = parseFloat(document.getElementById('supplierPriceValue').value) || 0;
        const qty = parseFloat(document.getElementById('supplierPriceQty').value) || 0;
        const unit = document.getElementById('supplierPriceUnit').value;
        if (!ingredient || !price || !qty) { P.showToast('Заполните все поля', 'error'); return; }
        const newId = (s.prices.length ? Math.max(...s.prices.map(p => p.id || 0)) : 0) + 1;
        
        const hasDelivery = document.getElementById('supplierPriceFreq')?.value !== "";
        const freq = document.getElementById('supplierPriceFreq')?.value || null;
        const day = hasDelivery ? parseInt(document.getElementById('supplierPriceDay')?.value) : null;
        const delQty = hasDelivery ? (parseFloat(document.getElementById('supplierPriceDelQty')?.value) || 0) : null;

        s.prices.push({ 
            id: newId, 
            ingredient, 
            price, 
            qty, 
            unit,
            delivery_frequency: freq,
            delivery_day: day,
            delivery_qty: delQty
        });
        P.closeAllModals(); renderSupplierPrices(s); renderSuppliersList(); saveSupplierToServer(s);
        P.showToast(`«${ingredient}» добавлен в ассортимент`);
    });
    document.getElementById('addSupplierPriceCancel')?.addEventListener('click', () => P.closeAllModals());
    document.getElementById('addSupplierPriceModalClose')?.addEventListener('click', () => P.closeAllModals());

    document.getElementById('supplierPriceFreq')?.addEventListener('change', (e) => {
        const val = e.target.value;
        const dayLabel = document.getElementById('supplierPriceDayLabel');
        const daySelect = document.getElementById('supplierPriceDay');
        if (!dayLabel || !daySelect) return;
        
        if (val === 'monthly') {
            dayLabel.textContent = 'Число месяца';
            daySelect.innerHTML = Array.from({length: 31}, (_, i) => `<option value="${i+1}">${i+1} число</option>`).join('');
        } else {
            dayLabel.textContent = 'День недели';
            daySelect.innerHTML = `
                <option value="1">Понедельник</option>
                <option value="2">Вторник</option>
                <option value="3">Среда</option>
                <option value="4">Четверг</option>
                <option value="5">Пятница</option>
                <option value="6">Суббота</option>
                <option value="0">Воскресенье</option>
            `;
        }
        
        if (['daily', 'every_2_days', 'every_3_days'].includes(val)) {
            daySelect.disabled = true;
            daySelect.style.opacity = '0.5';
        } else {
            daySelect.disabled = false;
            daySelect.style.opacity = '1';
        }
    });

    // ========================================
    // NOTES (old buttons)
    // ========================================
    document.getElementById('editSupplierNotesBtn')?.addEventListener('click', () => {
        const s = P.suppliers.find(x => x.id == selectedSupplierId); if (!s) return;
        const meta = (s.prices || []).find(p => p.type === 'metadata');
        const currentNote = meta ? (meta.notes || '') : (s.notes || '');
        document.getElementById('supplierNotesDisplay').style.display = 'none';
        document.getElementById('supplierNotesEdit').style.display = 'block';
        document.getElementById('supplierNotesTextarea').value = currentNote;
        document.getElementById('editSupplierNotesBtn').style.display = 'none';
    });
    document.getElementById('saveSupplierNotesBtn')?.addEventListener('click', () => {
        const s = P.suppliers.find(x => x.id == selectedSupplierId); if (!s) return;
        const newNotes = document.getElementById('supplierNotesTextarea').value.trim();
        s.notes = newNotes;
        s.prices = s.prices || [];
        let m = s.prices.find(p => p.type === 'metadata');
        if (m) m.notes = newNotes;
        else s.prices.push({ id: Date.now(), type: 'metadata', notes: newNotes });
        document.getElementById('supplierNotesDisplay').style.display = 'block';
        document.getElementById('supplierNotesEdit').style.display = 'none';
        document.getElementById('editSupplierNotesBtn').style.display = '';
        renderSupplierNotes(s); saveSupplierToServer(s); P.showToast('Примечание сохранено');
    });
    document.getElementById('cancelSupplierNotesBtn')?.addEventListener('click', () => {
        document.getElementById('supplierNotesDisplay').style.display = 'block';
        document.getElementById('supplierNotesEdit').style.display = 'none';
        document.getElementById('editSupplierNotesBtn').style.display = '';
    });

    // ========================================
    // FILTER BY GROUPS
    // ========================================
    document.getElementById('supplierFilterBtn')?.addEventListener('click', () => { renderSupplierFilterModal(); P.openModal('supplierFilterModal'); });
    function renderSupplierFilterModal() {
        const list = document.getElementById('supplierFilterGroupsList');
        const q = (document.getElementById('supplierFilterSearch')?.value || '').toLowerCase();
        const filtered = q ? P.supplierGroups.filter(g => g.toLowerCase().includes(q)) : P.supplierGroups;
        list.innerHTML = filtered.map(g => `<label class="supplier-filter-group-item"><input type="checkbox" value="${g}" ${supplierFilterActive.includes(g) ? 'checked' : ''}> ${g}</label>`).join('');
    }
    document.getElementById('supplierFilterSearch')?.addEventListener('input', renderSupplierFilterModal);
    document.getElementById('supplierFilterSelectAll')?.addEventListener('click', () => { document.querySelectorAll('#supplierFilterGroupsList input[type="checkbox"]').forEach(cb => cb.checked = true); });
    document.getElementById('supplierFilterDeselectAll')?.addEventListener('click', () => { document.querySelectorAll('#supplierFilterGroupsList input[type="checkbox"]').forEach(cb => cb.checked = false); });
    document.getElementById('supplierFilterApply')?.addEventListener('click', () => {
        supplierFilterActive = [];
        document.querySelectorAll('#supplierFilterGroupsList input[type="checkbox"]:checked').forEach(cb => supplierFilterActive.push(cb.value));
        P.closeAllModals(); renderSuppliersList();
        if (supplierFilterActive.length > 0) P.showToast(`Фильтр: ${supplierFilterActive.join(', ')}`);
    });
    document.getElementById('supplierFilterCancel')?.addEventListener('click', () => P.closeAllModals());
    document.getElementById('supplierFilterModalClose')?.addEventListener('click', () => P.closeAllModals());

    // ========================================
    // ADD TO GROUPS MODAL
    // ========================================
    document.getElementById('addSupplierGroupBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        const s = P.suppliers.find(x => x.id == selectedSupplierId); if (!s) return;
        const list = document.getElementById('addGroupCheckboxList');
        list.innerHTML = P.supplierGroups.map(g => `<label class="supplier-filter-group-item"><input type="checkbox" value="${g}" ${s.groups.includes(g) ? 'checked' : ''}> ${g}</label>`).join('');
        document.getElementById('newGroupName').value = '';
        P.openModal('addSupplierGroupModal');
    });
    document.getElementById('createNewGroupBtn')?.addEventListener('click', () => {
        const name = document.getElementById('newGroupName').value.trim(); if (!name) return;
        if (!P.supplierGroups.includes(name)) P.supplierGroups.push(name);
        const s = P.suppliers.find(x => x.id == selectedSupplierId);
        const list = document.getElementById('addGroupCheckboxList');
        list.innerHTML = P.supplierGroups.map(g => `<label class="supplier-filter-group-item"><input type="checkbox" value="${g}" ${(s?.groups.includes(g) || g === name) ? 'checked' : ''}> ${g}</label>`).join('');
        document.getElementById('newGroupName').value = '';
        P.showToast(`Группа «${name}» создана`);
    });
    document.getElementById('addSupplierGroupSave')?.addEventListener('click', () => {
        const s = P.suppliers.find(x => x.id == selectedSupplierId); if (!s) return;
        s.groups = [];
        document.querySelectorAll('#addGroupCheckboxList input[type="checkbox"]:checked').forEach(cb => s.groups.push(cb.value));
        P.closeAllModals(); renderSupplierGroups(s); saveSupplierToServer(s); P.showToast('Группы обновлены');
    });
    document.getElementById('addSupplierGroupCancel')?.addEventListener('click', () => P.closeAllModals());
    document.getElementById('addSupplierGroupModalClose')?.addEventListener('click', () => P.closeAllModals());

    // ========================================
    // CREATE SUPPLIER
    // ========================================
    document.getElementById('supplierSearch')?.addEventListener('input', renderSuppliersList);
    document.getElementById('createSupplierBtn')?.addEventListener('click', () => {
        document.getElementById('newSupplierName').value = '';
        const timeInput = document.getElementById('newSupplierTime');
        const flexCheck = document.getElementById('newSupplierTimeFlexible');
        if (timeInput) timeInput.value = '09:00';
        if (flexCheck) flexCheck.checked = false;
        document.querySelectorAll('#newSupplierDays .day-bubble').forEach(b => b.classList.remove('active'));
        P.openModal('createSupplierModal');
        setTimeout(() => document.getElementById('newSupplierName')?.focus(), 100);
    });

    // Day bubble toggle
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('day-bubble')) {
            const freq = document.getElementById('newSupplierFrequency')?.value;
            if (freq === 'monthly') { document.querySelectorAll('#newSupplierDays .day-bubble').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); }
            else e.target.classList.toggle('active');
        }
    });
    document.getElementById('newSupplierFrequency')?.addEventListener('change', (e) => {
        const row = document.getElementById('supplierDaySelectionRow');
        const label = document.getElementById('supplierDayLabel');
        const val = e.target.value;
        if (['daily', '2days', '3days'].includes(val)) row.style.display = 'none';
        else { row.style.display = 'block'; label.textContent = (val === 'monthly') ? 'Основной день (1)' : 'Дни доставки'; if (val === 'monthly') document.querySelectorAll('#newSupplierDays .day-bubble').forEach(b => b.classList.remove('active')); }
    });

    document.getElementById('createSupplierSave')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('button') || e.target;
        if (btn.disabled) return;
        const name = document.getElementById('newSupplierName').value.trim();
        const notes = document.getElementById('newSupplierNotes')?.value.trim() || '';
        if (!name) { P.showToast('Введите имя поставщика', 'error'); return; }

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-circle-notch" style="animation: spin 1s linear infinite;"></i> Выполнение...';

        try {
            try {
                const initPrices = [];
                if (notes) {
                    initPrices.push({ id: Date.now(), type: 'metadata', notes: notes });
                }
                const payload = { 
                    name: name, 
                    prices: initPrices, 
                    groups: [] 
                };
                const result = await P.DB.suppliers.upsert(payload);
                
                const searchInput = document.getElementById('supplierSearch');
                if (searchInput) searchInput.value = '';
                supplierFilterActive = [];
                
                renderSuppliersList(); 
                if (result && result.id) selectSupplier(result.id);
                P.closeAllModals(); 
                P.showToast(`Поставщик «${name}» добавлен`);
                if (typeof updateDebugState === 'function') updateDebugState('LOCAL_CREATE');
            } catch (apiErr) { 
                console.warn('Sync failed:', apiErr.message); 
                P.showToast('Ошибка при сохранении в базу', 'error');
            }

            P.logAction('Создан', 'Поставщик', name, 'Новый контрагент добавлен в базу');
        } catch (err) { console.error('Failed to create supplier:', err); P.showToast('Ошибка при создании поставщика', 'error'); }
        finally { btn.disabled = false; btn.innerHTML = originalText; }
    });

    document.getElementById('newSupplierName')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('createSupplierSave')?.click(); });
    document.getElementById('createSupplierCancel')?.addEventListener('click', () => P.closeAllModals());
    document.getElementById('createSupplierModalClose')?.addEventListener('click', () => P.closeAllModals());

    // ========================================
    // ADD SCHEDULE (Removed, merged with prices)
    // ========================================

    // ========================================
    // REACTIVE: SYNC SUPPLIER PRICES → INVENTORY
    // ========================================
    if (window.ReactiveEngine) {
        const origRecalculateAll = window.ReactiveEngine.recalculateAll.bind(window.ReactiveEngine);
        window.ReactiveEngine.recalculateAll = function (silent = false) {
            P.suppliers.forEach(s => {
                s.prices.forEach(p => {
                    const invItem = P.inventory.find(x => x.name.toLowerCase().trim() === p.ingredient.toLowerCase().trim());
                    if (invItem) {
                        const dbIng = P.ingredients.find(i => i.name.toLowerCase() === p.ingredient.toLowerCase());
                        
                        // Price per base unit (g/ml)
                        const supplierFactor = P.getConversionFactor(dbIng, p.unit, 'г');
                        const supplierBaseQty = (parseFloat(p.qty) || 1) * supplierFactor;
                        const pricePerBase = parseFloat(p.price) / supplierBaseQty;
                        
                        // Convert base price to inventory unit price
                        const invUnitMultiplier = P.getConversionFactor(dbIng, invItem.unit, 'г');
                        const newPrice = pricePerBase * invUnitMultiplier;
                        
                        if (Math.abs(invItem.price - newPrice) > 0.01) invItem.price = newPrice;
                    }
                });
            });
            origRecalculateAll(silent);
            if (typeof renderInventoryTable === 'function') renderInventoryTable();
        };
    }

    // Init
    renderSuppliersList();

    // Expose
    window.renderSuppliersList = renderSuppliersList;
    window.loadSuppliers = loadSuppliers;
    window.selectSupplier = selectSupplier;
    window.saveSupplierToServer = saveSupplierToServer;

    console.log('%c[PROVISIO]%c Suppliers module loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
