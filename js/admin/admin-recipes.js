/* ============================================
   PROVISIO — Recipes Module
   Recipes table, modal, PDF, AI, filter
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) return;

    const categoryMap = {
        hot: 'Горячие', salads: 'Салаты', desserts: 'Десерты', drinks: 'Напитки', soups: 'Супы', prep: 'Заготовка',
        'Goryachie': 'Горячие блюда', 'Zavtraki': 'Завтраки', 'Salaty': 'Салаты', 'Deserty': 'Десерты', 'Napitki': 'Напитки', 'Garniry': 'Гарниры'
    };
    const badgeMap = {
        hot: 'badge-hot', salads: 'badge-salad', desserts: 'badge-dessert', drinks: 'badge-drink', soups: 'badge-soup',
        'Goryachie': 'badge-hot', 'Zavtraki': 'badge-dessert', 'Salaty': 'badge-salad', 'Deserty': 'badge-dessert', 'Napitki': 'badge-drink', 'Garniry': 'badge-salad'
    };

    let editingRecipeId = null;
    let modalIngredients = [];
    let modalLabor = [];

    function renderRecipesTable() {
        const tbody = document.getElementById('recipesTableBody');
        if (!P.recipes.length) {
            tbody.innerHTML = `<tr><td colspan="6">
                <div class="empty-state empty-state-table">
                    <div class="empty-state-icon"><i class="ph ph-book-open-text"></i></div>
                    <h3>Рецептов пока нет</h3>
                    <p>Создайте свой первый рецепт вручную или загрузите технологическую карту с помощью AI</p>
                    <button class="btn btn-accent" onclick="document.getElementById('addRecipeBtn')?.click()">
                        <i class="ph ph-plus-circle"></i> Создать первый рецепт
                    </button>
                    <div class="empty-state-hint"><i class="ph ph-lightbulb"></i> Или загрузите PDF/фото техкарты через кнопку «AI: Загрузить техкарту»</div>
                </div>
            </td></tr>`;
            document.getElementById('kpiRecipeCount').textContent = 0;
            return;
        }
        tbody.innerHTML = P.recipes.map(r => {
            const price = parseFloat(r.sale_price || r.price) || 0;
            const cost = parseFloat(r.calculated_cost || r.cost) || 0;
            const fcNum = price > 0 ? ((cost / price) * 100) : null;
            const fc = fcNum !== null ? fcNum.toFixed(0) : '—';
            const fcClass = fcNum === null ? '' : (fcNum <= 30 ? 'foodcost-good' : fcNum <= 40 ? 'foodcost-warning' : 'foodcost-danger');
            const categoryLabel = r.label_tag || r.label || categoryMap[r.category] || r.category || 'Без категории';
            const badgeClass = badgeMap[r.category] || 'badge-hot';

            const syncErrorHtml = r._syncError ? `
                <div class="sync-error-wrapper">
                    <i class="ph ph-warning-octagon sync-error-icon"></i>
                    <div class="sync-error-tooltip">Это изменение не сохранилось на наших серверах из-за ошибки сети или сервера.</div>
                </div>
            ` : '';

            return `<tr data-id="${r.id}">
                <td>
                    <div class="table-dish">
                        <strong>${r.name || 'Без названия'}</strong>
                        ${syncErrorHtml}
                    </div>
                </td>
                <td><span class="table-badge ${badgeClass}">${categoryLabel}</span></td>
                <td>${P.formatMoney(cost)}</td>
                <td><span class="${fcClass}">${fc === '—' ? '—' : fc + '%'}</span></td>
                <td>${r.finished_weight || r.weight || 0} ${r.unit || 'г'}</td>
                <td><div class="table-actions">
                    <button class="table-action-btn recipe-edit-btn" title="Редактировать" data-id="${r.id}"><i class="ph ph-pencil-simple"></i></button>
                    <button class="table-action-btn recipe-copy-btn" title="Копировать" data-id="${r.id}"><i class="ph ph-copy"></i></button>
                    <button class="table-action-btn recipe-export-btn" title="Скачать PDF" data-id="${r.id}"><i class="ph ph-file-pdf"></i></button>
                    <button class="table-action-btn table-action-danger recipe-delete-btn" title="Удалить" data-id="${r.id}"><i class="ph ph-trash"></i></button>
                </div></td>
            </tr>`;
        }).join('');
        attachRecipeActions();
        const kpiEl = document.getElementById('kpiRecipeCount');
        if (kpiEl) kpiEl.textContent = P.recipes.length;
    }

    function attachRecipeActions() {
        document.querySelectorAll('.recipe-edit-btn').forEach(btn => btn.addEventListener('click', () => editRecipe(btn.dataset.id)));
        document.querySelectorAll('.recipe-copy-btn').forEach(btn => btn.addEventListener('click', () => copyRecipe(btn.dataset.id)));
        document.querySelectorAll('.recipe-export-btn').forEach(btn => btn.addEventListener('click', () => exportRecipeToPDF(btn.dataset.id)));
        document.querySelectorAll('.recipe-delete-btn').forEach(btn => btn.addEventListener('click', () => deleteRecipe(btn.dataset.id)));
    }

    async function exportRecipeToPDF(id) {
        const r = P.recipes.find(x => x.id == id);
        if (!r) return;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(22); doc.setTextColor(74, 59, 50); doc.text("Технологическая карта", 14, 22);
        doc.setFontSize(16); doc.text(r.name || "Без названия", 14, 32);
        doc.setFontSize(10); doc.setTextColor(138, 154, 131);
        doc.text(`Категория: ${categoryMap[r.category] || r.category}`, 14, 40);
        doc.text(`Выход: ${r.yield_quantity || r.yield_qty || 1} ${r.yield_unit || 'порция'}`, 14, 45);
        doc.text(`Дата печати: ${new Date().toLocaleDateString('ru-RU')}`, 150, 45);
        const ingData = (r.ingredients || []).map(ing => [ing.name, ing.qty, ing.unit, P.formatMoney(parseFloat(ing.price || 0))]);
        doc.autoTable({ startY: 55, head: [['Ингредиент', 'Кол-во', 'Ед.', 'Стоимость']], body: ingData, theme: 'striped', headStyles: { fillColor: [138, 154, 131] } });
        const finalY = doc.lastAutoTable.finalY + 10;
        if (r.labor && r.labor.length > 0) {
            doc.setFontSize(14); doc.setTextColor(74, 59, 50); doc.text("Трудозатраты:", 14, finalY);
            const laborData = r.labor.map(l => [l.employee || 'Сотрудник', P.formatMoney(parseFloat(l.cost || 0))]);
            doc.autoTable({ startY: finalY + 5, head: [['Роль/Сотрудник', 'Стоимость']], body: laborData, theme: 'plain', headStyles: { fillColor: [239, 166, 148] } });
        }
        const summaryY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : finalY) + 15;
        doc.setTextColor(74, 59, 50); doc.setFontSize(14);
        doc.text(`Итого себестоимость: ${P.formatMoney(parseFloat(r.calculated_cost || r.cost || 0))}`, 14, summaryY);
        doc.save(`Recipe_${r.name.replace(/\s+/g, '_')}.pdf`);
        P.showToast('PDF техкарта скачана', 'success');
    }

    document.getElementById('addRecipeBtn')?.addEventListener('click', () => {
        editingRecipeId = null;
        document.getElementById('recipeModalTitle').textContent = 'Создать рецепт';
        document.getElementById('modalRecipeName').value = '';
        document.getElementById('modalRecipeCategory').value = '';
        document.getElementById('modalRecipeYieldQty').value = '1';
        document.getElementById('modalRecipeYieldUnit').value = 'порция';
        document.getElementById('modalRecipeWeight').value = '0';
        modalIngredients = [{ name: '', qty: '', unit: 'г', price: 0 }];
        modalLabor = [];
        renderModalIngredients();
        renderModalLabor();
        updateModalCost();
        P.openModal('recipeModal');
    });

    function editRecipe(id) {
        const r = P.recipes.find(x => x.id == id);
        if (!r) return;
        editingRecipeId = id;
        document.getElementById('recipeModalTitle').textContent = 'Редактировать рецепт';
        document.getElementById('modalRecipeName').value = r.name || '';
        document.getElementById('modalRecipeCategory').value = r.category || '';
        document.getElementById('modalRecipeYieldQty').value = r.yield_quantity || r.yield_qty || '1';
        document.getElementById('modalRecipeYieldUnit').value = r.yield_unit || 'порция';
        document.getElementById('modalRecipeWeight').value = r.finished_weight || r.weight || '0';
        modalIngredients = (r.ingredients || []).map(i => ({ ...i }));
        if (!modalIngredients.length) modalIngredients = [{ name: '', qty: '', unit: 'г', price: 0 }];
        modalLabor = (r.labor || []).map(l => ({ ...l }));
        renderModalIngredients();
        renderModalLabor();
        updateModalCost();
        P.openModal('recipeModal');
    }

    async function copyRecipe(id) {
        const r = P.recipes.find(x => x.id == id);
        if (!r) return;
        try {
            P.showToast('Копирование рецепта...', 'info');
            const copyData = {
                name: r.name + ' (копия)',
                category: r.category,
                sale_price: r.sale_price || r.price || 0,
                calculated_cost: r.calculated_cost || r.cost || 0,
                finished_weight: r.finished_weight || r.weight || 0,
                yield_quantity: r.yield_quantity || r.yield_qty || 1,
                yield_unit: r.yield_unit || r.unit || 'порция',
                ingredients: r.ingredients || []
            };
            await P.DB.recipes.create(copyData);
            if (typeof renderHighMarginDishes === 'function') renderHighMarginDishes();
            P.showToast(`Рецепт «${r.name}» скопирован`);
        } catch (err) { P.showToast('Не удалось скопировать рецепт', 'error'); }
    }

    function deleteRecipe(id) {
        const r = P.recipes.find(x => x.id == id);
        P.confirmAction('Удалить рецепт', `Вы уверены, что хотите удалить «${r?.name}»?`, async () => {
            try {
                await P.DB.recipes.delete(id);
                if (typeof renderHighMarginDishes === 'function') renderHighMarginDishes();
                if (typeof renderFoodcostChart === 'function') renderFoodcostChart(30);
                P.showToast('Рецепт удалён');
            } catch (err) { P.showToast('Не удалось удалить рецепт', 'error'); }
        });
    }

    function renderModalIngredients() {
        const list = document.getElementById('modalIngredientList');
        const units = ['г', 'кг', 'мл', 'л', 'шт', 'порция', 'стакан', 'щепотка', 'пучок', 'зубчик', 'упаковка'];
        list.innerHTML = modalIngredients.map((ing, i) => {
            const itemName = (ing.name || '').trim().toLowerCase();
            const subRecipe = P.recipes.find(r => r.name.toLowerCase() === itemName && r.id != editingRecipeId);
            const badge = subRecipe ? '<span class="badge badge-primary" style="font-size: 10px; padding: 2px 4px;">Подрецепт</span>' : '';
            const matchedSuppliers = getSuppliersForIngredient(ing.name);
            const supplierOptions = matchedSuppliers.map(ms => `<option value="${ms.supplierId}" ${ing.supplierId === ms.supplierId ? 'selected' : ''}>${ms.supplierName}</option>`).join('');
            const qtyNum = parseFloat(ing.qty) || 0;
            const stock = getStockStatus(ing.name, qtyNum);
            const stockBadge = stock.status === 'danger' ? `<span class="stock-danger">${stock.text}</span>` : stock.status === 'warning' ? `<span class="stock-warning">${stock.text}</span>` : '';

            return `<div class="modal-ingredient-row" data-index="${i}">
                <div class="ing-cell">
                    <select class="admin-input ing-name" style="width: 100%;">
                        ${P.ingredients.map(it => `<option value="${it.name}" ${it.name === ing.name ? 'selected' : ''}>${it.name}</option>`).join('')}
                    </select>
                    ${stockBadge}
                </div>
                <input type="number" class="admin-input ing-qty" placeholder="Кол-во" value="${ing.qty || ''}" step="0.1">
                <select class="admin-input ing-unit">${units.map(u => `<option ${u === ing.unit ? 'selected' : ''}>${u}</option>`).join('')}</select>
                <div class="input-with-currency">
                    <input type="number" class="admin-input ing-price ${ing.supplierId ? 'ing-price-auto' : ''}" placeholder="Цена" value="${ing.price || 0}" step="0.01">
                    <span class="currency-label">${P.currencySymbols[P.AppStore.currency] || '₸'}</span>
                </div>
                <select class="ing-supplier-select modal-ing-supplier" title="Поставщик">
                    <option value="">Выберите поставщика...</option>
                    ${supplierOptions}
                </select>
                <button class="btn-icon-inline ing-remove" title="Удалить"><i class="ph ph-trash"></i></button>
            </div>`;
        }).join('');

        list.querySelectorAll('.ing-name').forEach((el, i) => {
            el.addEventListener('input', (e) => { modalIngredients[i].name = e.target.value; modalIngredients[i].supplierId = null; });
            el.addEventListener('change', (e) => {
                const val = e.target.value;
                modalIngredients[i].name = val;
                
                // Auto-fill unit from master ingredient
                const ing = P.ingredients.find(it => it.name === val);
                if (ing && (ing.base_unit || ing.baseUnit)) {
                    modalIngredients[i].unit = ing.base_unit || ing.baseUnit;
                }
                
                renderModalIngredients(); 
                updateModalCost(); 
            });
        });
        list.querySelectorAll('.ing-qty').forEach((el, i) => el.addEventListener('input', (e) => {
            modalIngredients[i].qty = parseFloat(e.target.value) || 0;
            if (modalIngredients[i].supplierId) {
                const autoPrice = calcPriceFromSupplier(modalIngredients[i].supplierId, modalIngredients[i].name, modalIngredients[i].qty, modalIngredients[i].unit);
                if (autoPrice !== null) { modalIngredients[i].price = autoPrice; renderModalIngredients(); }
            }
            updateModalCost();
        }));
        list.querySelectorAll('.ing-unit').forEach((el, i) => el.addEventListener('change', (e) => {
            modalIngredients[i].unit = e.target.value;
            if (modalIngredients[i].supplierId) {
                const autoPrice = calcPriceFromSupplier(modalIngredients[i].supplierId, modalIngredients[i].name, modalIngredients[i].qty, modalIngredients[i].unit);
                if (autoPrice !== null) { modalIngredients[i].price = autoPrice; renderModalIngredients(); }
            }
        }));
        list.querySelectorAll('.ing-price').forEach((el, i) => el.addEventListener('input', (e) => { modalIngredients[i].price = parseFloat(e.target.value) || 0; updateModalCost(); }));
        list.querySelectorAll('.modal-ing-supplier').forEach((el, i) => el.addEventListener('change', (e) => {
            const suppId = e.target.value || null;
            modalIngredients[i].supplierId = suppId;
            if (suppId) {
                const autoPrice = calcPriceFromSupplier(suppId, modalIngredients[i].name, modalIngredients[i].qty, modalIngredients[i].unit);
                if (autoPrice !== null) modalIngredients[i].price = autoPrice;
                renderModalIngredients();
            }
            updateModalCost();
        }));
        list.querySelectorAll('.ing-remove').forEach((el, i) => el.addEventListener('click', () => {
            P.confirmAction('Удалить ингредиент', `Удалить «${modalIngredients[i].name || 'Без названия'}» из рецепта?`, () => {
                modalIngredients.splice(i, 1); renderModalIngredients(); updateModalCost();
            });
        }));
    }

    function renderModalLabor() {
        const list = document.getElementById('modalLaborList');
        if (!list) return;
        list.innerHTML = modalLabor.map((lab, i) => `
            <div class="modal-ingredient-row labor-row" data-index="${i}">
                <input type="text" class="admin-input labor-name" placeholder="Сотрудник/Роль" value="${lab.employee || ''}" style="flex: 2;">
                <div class="input-with-currency" style="flex: 1;">
                    <input type="number" class="admin-input labor-cost" placeholder="Стоимость" value="${lab.cost || 0}" step="0.01">
                    <span class="currency-label">${P.currencySymbols[P.AppStore.currency] || '₸'}</span>
                </div>
                <button class="btn-icon-inline labor-remove" title="Удалить"><i class="ph ph-trash"></i></button>
            </div>`).join('');
        list.querySelectorAll('.labor-name').forEach((el, i) => el.addEventListener('input', (e) => { modalLabor[i].employee = e.target.value; }));
        list.querySelectorAll('.labor-cost').forEach((el, i) => el.addEventListener('input', (e) => { modalLabor[i].cost = parseFloat(e.target.value) || 0; updateModalCost(); }));
        list.querySelectorAll('.labor-remove').forEach((el, i) => el.addEventListener('click', () => { modalLabor.splice(i, 1); renderModalLabor(); updateModalCost(); }));
    }

    document.getElementById('modalAddLaborBtn')?.addEventListener('click', () => { modalLabor.push({ employee: '', cost: 0 }); renderModalLabor(); });
    document.getElementById('modalAddIngredientBtn')?.addEventListener('click', () => { modalIngredients.push({ name: '', qty: '', unit: 'г', price: '' }); renderModalIngredients(); });

    function updateModalCost() {
        let ingredientsCost = 0, totalWeight = 0;
        modalIngredients.forEach(ing => {
            const itemName = (ing.name || '').trim().toLowerCase();
            const dbIng = P.ingredients.find(i => i && i.name && i.name.toLowerCase() === itemName);
            const subRecipe = P.recipes.find(r => r && r.name && r.name.toLowerCase() === itemName && r.id != editingRecipeId);
            let itemPrice = 0;
            if (subRecipe) {
                const subCost = parseFloat(subRecipe.calculated_cost || subRecipe.cost) || 0;
                const subYield = parseFloat(subRecipe.yield_quantity || subRecipe.yield_qty) || parseFloat(subRecipe.finished_weight || subRecipe.weight) || 1;
                itemPrice = (subCost / subYield) * (parseFloat(ing.qty) || 0);
            } else {
                const vendorPrice = window.ReactiveEngine.resolveIngredientPrice(itemName);
                if (vendorPrice !== null) {
                    const factor = P.getConversionFactor(dbIng, ing.unit || 'г', 'г');
                    itemPrice = vendorPrice * ((parseFloat(ing.qty) || 0) * factor);
                } else {
                    itemPrice = parseFloat(ing.price) || 0;
                }
                
                if (dbIng && (dbIng.ep_percent || dbIng.edible_portion)) {
                    const ep = parseFloat(dbIng.ep_percent || dbIng.edible_portion) || 100;
                    if (ep > 0 && ep < 100) itemPrice = itemPrice / (ep / 100);
                }
            }
            ingredientsCost += itemPrice;
            const weightFactor = P.getConversionFactor(dbIng, ing.unit || 'г', 'г');
            totalWeight += (parseFloat(ing.qty) || 0) * weightFactor;
        });
        const laborCost = modalLabor.reduce((sum, lab) => sum + (parseFloat(lab.cost) || 0), 0);
        const totalCost = ingredientsCost + laborCost;
        document.getElementById('modalRecipeWeight').value = Math.round(totalWeight);
        document.getElementById('modalCostValue').textContent = P.formatMoney(totalCost);
        const editingRecipe = editingRecipeId ? P.recipes.find(r => r.id == editingRecipeId) : null;
        const modalSalePrice = editingRecipe ? (parseFloat(editingRecipe.sale_price || editingRecipe.price) || 0) : 0;
        const modalFc = modalSalePrice > 0 ? ((totalCost / modalSalePrice) * 100).toFixed(1) + '%' : '— %';
        document.getElementById('modalFoodcostValue').textContent = modalFc;
    }

    document.getElementById('modalRecipeYieldQty')?.addEventListener('input', updateModalCost);
    document.getElementById('modalRecipeYieldUnit')?.addEventListener('change', updateModalCost);

    // Save recipe
    document.getElementById('recipeModalSave')?.addEventListener('click', async () => {
        const name = document.getElementById('modalRecipeName').value.trim();
        const category = document.getElementById('modalRecipeCategory').value;
        const yieldQty = parseFloat(document.getElementById('modalRecipeYieldQty').value) || 1;
        const yieldUnit = document.getElementById('modalRecipeYieldUnit').value;
        if (!name || !category) { P.showToast('Заполните название и категорию', 'error'); return; }
        const validIngs = modalIngredients.filter(i => i.name && (parseFloat(i.qty) > 0));
        const subRecipes = [];
        validIngs.forEach(ing => {
            const itemName = (ing.name || '').trim().toLowerCase();
            const found = P.recipes.find(r => r.name.toLowerCase() === itemName && r.id != editingRecipeId);
            if (found) subRecipes.push({ recipe_id: found.id, qty: parseFloat(ing.qty) || 0 });
        });
        let ingredientsCost = 0;
        validIngs.forEach(ing => {
            const itemName = (ing.name || '').trim().toLowerCase();
            const subRecipe = P.recipes.find(r => r.name.toLowerCase() === itemName && r.id != editingRecipeId);
            let itemPrice = 0;
            if (subRecipe) { 
                const sc = parseFloat(subRecipe.calculated_cost || subRecipe.cost) || 0; 
                const sy = parseFloat(subRecipe.yield_quantity || subRecipe.yield_qty) || parseFloat(subRecipe.finished_weight || subRecipe.weight) || 1; 
                itemPrice = (sc / sy) * (parseFloat(ing.qty) || 0); 
            }
            else { const vp = window.ReactiveEngine.resolveIngredientPrice(itemName); if (vp !== null) { let m = (['кг', 'л'].includes((ing.unit || '').toLowerCase())) ? 1000 : 1; itemPrice = vp * ((parseFloat(ing.qty) || 0) * m); } else { itemPrice = parseFloat(ing.price) || 0; } }
            ingredientsCost += itemPrice;
        });
        const laborCost = modalLabor.reduce((sum, lab) => sum + (parseFloat(lab.cost) || 0), 0);
        const totalCost = ingredientsCost + laborCost;
        const recipeData = {
            name,
            category,
            yield_quantity: yieldQty,
            yield_unit: yieldUnit,
            finished_weight: parseInt(document.getElementById('modalRecipeWeight').value) || 0,
            calculated_cost: totalCost,
            ingredients: validIngs,
            labor: modalLabor,
            sub_recipes: subRecipes
        };
        const saveBtn = document.getElementById('recipeModalSave');
        saveBtn.disabled = true; saveBtn.textContent = 'Сохранение...';
        try {
            if (editingRecipeId) { recipeData.id = editingRecipeId; await P.DB.recipes.update(recipeData); P.showToast('Рецепт обновлён'); }
            else { await P.DB.recipes.create(recipeData); P.showToast('Рецепт создан'); }
            if (window.ReactiveEngine) window.ReactiveEngine.recalculateAll(true);
            renderRecipesTable();
            if (typeof renderHighMarginDishes === 'function') renderHighMarginDishes();
            P.closeAllModals();
        } catch (err) { console.error('Failed to save recipe:', err); P.showToast('Ошибка при сохранении рецепта', 'error'); }
        finally { saveBtn.disabled = false; saveBtn.textContent = 'Сохранить рецепт'; }
    });

    // Scaling
    document.getElementById('recipeScaleBtn')?.addEventListener('click', () => {
        const factor = prompt('Введите множитель масштабирования (напр. 2 для удвоения):', '1');
        const f = parseFloat(factor);
        if (!f || isNaN(f) || f <= 0) return;
        modalIngredients.forEach(ing => { if (ing.qty) ing.qty = (parseFloat(ing.qty) * f).toFixed(2); });
        const yQty = document.getElementById('modalRecipeYieldQty');
        if (yQty) yQty.value = (parseFloat(yQty.value) * f).toFixed(2);
        P.showToast(`Рецепт масштабирован в ${f} раз`);
        renderModalIngredients(); updateModalCost();
    });
    document.getElementById('recipeModalCancel')?.addEventListener('click', () => P.closeAllModals());

    // AI Parse
    const aiParseMenuBtn = document.getElementById('aiParseMenuBtn');
    const aiMenuFileInput = document.getElementById('aiMenuFileInput');
    aiParseMenuBtn?.addEventListener('click', () => aiMenuFileInput?.click());
    aiMenuFileInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { P.showToast('Пожалуйста, выберите изображение', 'error'); return; }
        if (file.size > 10 * 1024 * 1024) { P.showToast('Файл слишком большой (макс. 10 МБ)', 'error'); return; }
        try {
            aiParseMenuBtn.disabled = true;
            aiParseMenuBtn.innerHTML = '<i class="ph ph-circle-notch" style="animation: spin 1s linear infinite;"></i> AI анализирует...';
            const result = await P.parseMenuWithAI(file);
            editingRecipeId = null;
            document.getElementById('recipeModalTitle').textContent = 'Новый рецепт (AI)';
            document.getElementById('modalRecipeName').value = result.dish_name || result.name || '';
            document.getElementById('modalRecipeCategory').value = '';
            document.getElementById('modalRecipeWeight').value = '';
            document.getElementById('modalRecipePrice').value = '';
            const parsedIngredients = result.ingredients || [];
            if (parsedIngredients.length > 0) { modalIngredients = parsedIngredients.map(ing => ({ name: ing.name || '', qty: ing.qty || ing.quantity || 0, unit: ing.unit || 'г', price: ing.price || 0 })); }
            else { modalIngredients = [{ name: '', qty: '', unit: 'г', price: '' }]; }
            renderModalIngredients(); updateModalCost(); P.openModal('recipeModal');
            P.showToast(`AI распознал ${parsedIngredients.length} ингредиентов`, 'success');
        } catch (err) { P.showToast('AI не смог распознать техкарту. Попробуйте другое изображение.', 'error'); }
        finally { aiParseMenuBtn.disabled = false; aiParseMenuBtn.innerHTML = '<i class="ph ph-brain"></i> AI: Загрузить техкарту'; aiMenuFileInput.value = ''; }
    });

    // Search/filter
    document.getElementById('recipeSearch')?.addEventListener('input', filterRecipes);
    document.getElementById('recipeFilter')?.addEventListener('change', filterRecipes);
    function filterRecipes() {
        const q = document.getElementById('recipeSearch').value.toLowerCase();
        const cat = document.getElementById('recipeFilter').value;
        document.querySelectorAll('#recipesTableBody tr').forEach(row => {
            const name = row.querySelector('td:first-child')?.textContent.toLowerCase() || '';
            const badge = row.querySelector('.table-badge')?.textContent || '';
            row.style.display = (name.includes(q) && (cat === 'all' || badge === categoryMap[cat])) ? '' : 'none';
        });
    }

    // Helper functions from suppliers module (will be overridden if suppliers loads later)
    function getSuppliersForIngredient(ingredientName) {
        const result = [];
        if (!ingredientName) return result;
        P.suppliers.forEach(s => {
            s.prices.forEach(p => {
                if (p.ingredient.toLowerCase().trim() === ingredientName.toLowerCase().trim()) {
                    result.push({ supplierId: s.id, supplierName: s.name, price: p.price, qty: p.qty, unit: p.unit });
                }
            });
        });
        return result;
    }

    function calcPriceFromSupplier(supplierId, ingredientName, qty, unit) {
        const s = P.suppliers.find(x => x.id == supplierId);
        if (!s) return null;
        const p = s.prices.find(x => x.ingredient.toLowerCase().trim() === ingredientName.toLowerCase().trim());
        if (!p) return null;
        let supplierBaseQty = parseFloat(p.qty);
        if (['кг', 'л'].includes(p.unit.toLowerCase())) supplierBaseQty *= 1000;
        const pricePerBase = parseFloat(p.price) / supplierBaseQty;
        let requestedBase = parseFloat(qty) || 0;
        if (['кг', 'л'].includes(unit.toLowerCase())) requestedBase *= 1000;
        return pricePerBase * requestedBase;
    }

    function getStockStatus(ingredientName, qtyPerPortion) {
        // PHASE 2 ARCHIVED: Склад (inventory) tab removed.
        // Always return OK so no "Нет на складе" / "Мало" warnings appear in the recipe editor.
        // Restore full logic when Склад is re-enabled in Phase 2.
        return { status: 'ok', text: '', qty: 0 };
    }

    // Init render
    renderRecipesTable();

    // Expose
    window.renderRecipesTable = renderRecipesTable;
    window.renderModalIngredients = renderModalIngredients;
    window.updateModalCost = updateModalCost;
    window.getSuppliersForIngredient = getSuppliersForIngredient;
    window.calcPriceFromSupplier = calcPriceFromSupplier;
    window.getStockStatus = getStockStatus;
    window.getAllSupplierIngredients = function () {
        const result = [];
        P.suppliers.forEach(s => { s.prices.forEach(p => { result.push({ name: p.ingredient, supplierName: s.name, supplierId: s.id, price: p.price, qty: p.pack_qty || p.qty, unit: p.pack_unit || p.unit }); }); });
        return result;
    };

    console.log('%c[PROVISIO]%c Recipes module loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
