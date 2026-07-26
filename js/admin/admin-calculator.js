/* ============================================
   PROVISIO — Calculator Module
   ============================================ */
(function() {
    const P = window.Provisio;
    if(!P) { console.error('[admin-calculator] Provisio core not loaded'); return; }

    let calcIngredients = []; // Array of { id, name, qty, unit }

    let isInitialized = false;

    function syncInputsToState() {
        const list = document.getElementById('calcIngredientList');
        if (!list) return;
        const rows = list.querySelectorAll('.ingredient-row-editable');
        rows.forEach(row => {
            const id = row.dataset.id;
            const ing = calcIngredients.find(x => x.id == id);
            if (ing) {
                ing.name = row.querySelector('.ing-name-select').value;
                ing.qty = parseFloat(row.querySelector('.ing-qty-input').value) || 0;
                ing.unit = row.querySelector('.ing-unit-select').value;
            }
        });
    }

    function init() {
        if (isInitialized) {
            renderIngredients();
            calculateTotals();
            return;
        }

        console.log('[PROVISIO] Initializing Calculator...');
        const dishInput = document.getElementById('calcDishName');
        const addBtn = document.getElementById('addCalcIngredientBtn');

        if(!dishInput) return;

        // 3. Add Ingredient Row
        addBtn?.addEventListener('click', () => {
            syncInputsToState();
            calcIngredients.push({ id: Date.now(), name: '', qty: 0, unit: 'г' });
            renderIngredients();
            calculateTotals();
        });

        // 4. Global recalculate listeners
        ['calcPortionWeight', 'calcSellPrice', 'calcCurrency', 'calcDishName', 'calcCategory'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const eventType = el.tagName === 'SELECT' ? 'change' : 'input';
            el.addEventListener(eventType, calculateTotals);
        });

        // 5. Smart Save to Recipes
        const saveBtn = document.getElementById('saveCalcToRecipesBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const dishName = document.getElementById('calcDishName').value.trim();
                if (!dishName) { P.showToast('Введите название блюда', 'error'); return; }

                const category = document.getElementById('calcCategory').value;
                const weight = parseFloat(document.getElementById('calcPortionWeight').value) || 0;
                const price = parseFloat(document.getElementById('calcSellPrice').value) || 0;
                
                // Collect results from calculation
                const summary = calculateTotals(true); // Call silently to get data
                if (!summary) return;

                const recipeData = {
                    name: dishName,
                    category: category,
                    finished_weight: weight,
                    sale_price: price,
                    calculated_cost: summary.totalCost,
                    ingredients: calcIngredients.map(i => ({ name: i.name, qty: i.qty, unit: i.unit, price: 0 })), // Price populated by ReactiveEngine on load
                    nutrition: summary.nutrition,
                    yield_quantity: 1,
                    yield_unit: 'порция'
                };

                const existing = P.recipes.find(r => r.name.toLowerCase() === dishName.toLowerCase());

                if (existing) {
                    P.confirmAction('Обновить рецепт?', `Рецепт «${dishName}» уже существует. Обновить его данные?`, async () => {
                        saveBtn.disabled = true;
                        saveBtn.innerHTML = '<i class="ph ph-circle-notch animate-spin"></i> Сохранение...';
                        try {
                            await P.DB.recipes.update({ ...recipeData, id: existing.id });
                            P.showToast('Рецепт успешно обновлен', 'success');
                            if (typeof window.switchTab === 'function') window.switchTab('recipes');
                        } catch (e) { P.showToast('Ошибка при обновлении', 'error'); }
                        finally { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> Сохранить в рецепты'; }
                    });
                } else {
                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '<i class="ph ph-circle-notch animate-spin"></i> Сохранение...';
                    try {
                        await P.DB.recipes.create(recipeData);
                        P.showToast('Рецепт создан и сохранен', 'success');
                        if (typeof window.switchTab === 'function') window.switchTab('recipes');
                    } catch (e) { P.showToast('Ошибка при создании', 'error'); }
                    finally { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> Сохранить в рецепты'; }
                }
            });
        }

        isInitialized = true;
        renderIngredients();
        calculateTotals();
    }

    function loadIngredientsFromRecipe(recipe) {
        let ings = recipe.ingredients;
        if(typeof ings === 'string') { try { ings = JSON.parse(ings); } catch(e) { ings = []; } }
        if(Array.isArray(ings)) {
            calcIngredients = ings.map(i => ({
                id: Math.random(),
                name: i.name || i.ingredient || '',
                qty: parseFloat(i.qty) || 0,
                unit: i.unit || 'г'
            }));
            syncInputsToState();
            renderIngredients();
            calculateTotals();
        }
    }

    function renderIngredients() {
        const list = document.getElementById('calcIngredientList');
        if(!list) return;

        if(calcIngredients.length === 0) {
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--chocolate-light); font-size: 0.875rem; border: 1px dashed var(--cream-dark); border-radius: 8px;">Список пуст. Добавьте ингредиент.</div>`;
            return;
        }

        list.innerHTML = calcIngredients.map(ing => {
            return `
                <div class="ingredient-row-editable" data-id="${ing.id}">
                    <div class="form-group" style="margin-bottom: 0;">
                        <select class="admin-input ing-name-select" style="font-size: 0.8125rem;">
                            <option value="" disabled ${!ing.name ? 'selected' : ''}>Выберите...</option>
                            ${P.ingredients.sort((a,b) => a.name.localeCompare(b.name)).map(mi => 
                                `<option value="${mi.name}" ${mi.name === ing.name ? 'selected' : ''}>${mi.name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <input type="number" class="admin-input ing-qty-input" value="${ing.qty}" placeholder="0">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <select class="admin-input ing-unit-select" style="font-size: 0.8125rem;">
                            ${['г', 'кг', 'мл', 'л', 'шт'].map(u => `<option value="${u}" ${u === ing.unit ? 'selected' : ''}>${u}</option>`).join('')}
                        </select>
                    </div>
                    <div class="ing-cell" style="display: flex; align-items: center; font-size: 0.9375rem; color: var(--chocolate-light); font-weight: 500;">
                        <span class="ing-row-price">0.00</span>
                    </div>
                    <div class="ing-cell" style="display: flex; align-items: center; font-size: 0.9375rem; color: var(--olive-dark); font-weight: 700;">
                        <span class="ing-row-kcal">0 ккал</span>
                    </div>
                    <button class="ph ph-trash ing-remove-btn" style="border:none; background:none; cursor:pointer; font-size: 1.125rem; color: var(--chocolate-light);"></button>
                </div>
            `;
        }).join('');

        // Listeners for rows
        list.querySelectorAll('.ingredient-row-editable').forEach(row => {
            const id = row.dataset.id;
            const ing = calcIngredients.find(x => x.id == id);
            
            row.querySelector('.ing-name-select').addEventListener('change', (e) => {
                syncInputsToState();
                const val = e.target.value;
                ing.name = val;
                
                // Auto-fill unit from master ingredient
                const dbIng = P.ingredients.find(it => it.name === val);
                if (dbIng && (dbIng.base_unit || dbIng.baseUnit)) {
                    ing.unit = dbIng.base_unit || dbIng.baseUnit;
                    renderIngredients(); // Re-render to show new unit
                }
                
                calculateTotals();
            });
            row.querySelector('.ing-qty-input').addEventListener('input', (e) => {
                ing.qty = parseFloat(e.target.value) || 0;
                calculateTotals();
            });
            row.querySelector('.ing-unit-select').addEventListener('change', (e) => {
                ing.unit = e.target.value;
                calculateTotals();
            });
            row.querySelector('.ing-remove-btn').addEventListener('click', () => {
                syncInputsToState();
                calcIngredients = calcIngredients.filter(x => x.id != id);
                renderIngredients();
                calculateTotals();
            });
        });
    }

    function calculateTotals() {
        if (!window.ReactiveEngine) return;
        
        try {
            let totalCost = 0;
            let totalKcal = 0;
            let totalProt = 0;
            let totalFat = 0;
            let totalCarbs = 0;
            let calculatedWeight = 0;

            calcIngredients.forEach(ing => {
                if (!ing) return;
                const itemName = (ing.name || '').trim().toLowerCase();
                const dbIng = (P.ingredients || []).find(i => i && i.name && i.name.toLowerCase() === itemName);
                const rowEl = document.querySelector(`.ingredient-row-editable[data-id="${ing.id}"]`);
                
                let rowPrice = 0;
                let rowKcal = 0;
                let rowP = 0, rowF = 0, rowC = 0;

                const factor = P.getConversionFactor(dbIng, ing.unit || 'г', 'г');
                const q = parseFloat(ing.qty) || 0;
                const normalizedQty = q * factor;
                calculatedWeight += normalizedQty;

                if(dbIng) {
                    const pricePerBase = window.ReactiveEngine.resolveIngredientPrice(ing.name) || 0;
                    rowPrice = pricePerBase * normalizedQty;
                    
                    const n = dbIng.nutrition || {};
                    const kcalPer100 = parseFloat(n.kcal || n.kcal_per_100) || 0;
                    rowKcal = (kcalPer100 / 100) * normalizedQty;
                    rowP = ((parseFloat(n.protein) || 0) / 100) * normalizedQty;
                    rowF = ((parseFloat(n.fat) || 0) / 100) * normalizedQty;
                    rowC = ((parseFloat(n.carbs) || 0) / 100) * normalizedQty;
                }

                totalCost += (rowPrice || 0);
                totalKcal += (rowKcal || 0);
                totalProt += (rowP || 0);
                totalFat += (rowF || 0);
                totalCarbs += (rowC || 0);

                if(rowEl) {
                    const priceEl = rowEl.querySelector('.ing-row-price');
                    const kcalEl = rowEl.querySelector('.ing-row-kcal');
                    if (priceEl) priceEl.textContent = Number(rowPrice || 0).toFixed(2);
                    if (kcalEl) kcalEl.textContent = Math.round(rowKcal || 0) + ' ккал';
                    
                    // Show warning if Master Ingredient not linked
                    rowEl.style.opacity = dbIng ? '1' : '0.6';
                    if (!dbIng && itemName) {
                         if (kcalEl) kcalEl.innerHTML = '<i class="ph ph-warning" title="Мастер-ингредиент не найден!"></i>';
                    }
                }
            });

            const weightInput = document.getElementById('calcPortionWeight');
            if (weightInput) weightInput.value = Math.round(calculatedWeight || 0);

            const sellPriceInput = document.getElementById('calcSellPrice');
            const sellPrice = sellPriceInput ? (parseFloat(sellPriceInput.value) || 0) : 0;
            const margin = sellPrice - totalCost;
            const foodCostPct = sellPrice > 0 ? (totalCost / sellPrice) * 100 : 0;

            const summary = document.getElementById('calcSummary');
            if(summary) {
                summary.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding: 2px 0;">
                        <span style="color: var(--chocolate-light); font-size: 0.8125rem;">Себестоимость:</span>
                        <span style="font-weight: 700; font-size: 1.125rem; color: var(--chocolate);">${P.formatMoney(totalCost)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding: 2px 0;">
                        <span style="color: var(--chocolate-light); font-size: 0.8125rem;">Прибыль (наценка):</span>
                        <span style="font-weight: 700; font-size: 1rem; color: var(--olive);">${P.formatMoney(margin)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px dashed var(--border-color);">
                        <span style="color: var(--chocolate-light); font-size: 0.8125rem;">Фуд-кост <span class="tooltip-trigger" data-tooltip="Доля себестоимости в цене продажи. Здоровый показатель — 25–35%. Чем выше — тем меньше вы зарабатываете на блюде." style="vertical-align:middle;"><i class="ph ph-question"></i></span>:</span>
                        <span style="font-weight: 800; font-size: 1.25rem; color: ${foodCostPct > 50 ? 'var(--danger)' : foodCostPct > 35 ? 'var(--peach-dark)' : 'var(--olive-dark)'}">${foodCostPct.toFixed(1)}%</span>
                    </div>
                `;
                if (typeof window.initTooltips === 'function') window.initTooltips();
            }

            const fill = document.getElementById('gaugeFill');
            if(fill) {
                fill.style.width = Math.min(foodCostPct || 0, 100) + '%';
                if(foodCostPct > 50) fill.style.background = 'var(--danger)';
                else if(foodCostPct > 35) fill.style.background = 'var(--peach-dark)';
                else fill.style.background = 'var(--olive)';
            }

            const nutC = document.getElementById('nutCalories');
            const nutP = document.getElementById('nutProtein');
            const nutF = document.getElementById('nutFat');
            const nutCb = document.getElementById('nutCarbs');
            if (nutC) nutC.textContent = Math.round(totalKcal || 0);
            if (nutP) nutP.textContent = (totalProt || 0).toFixed(1);
            if (nutF) nutF.textContent = (totalFat || 0).toFixed(1);
            if (nutCb) nutCb.textContent = (totalCarbs || 0).toFixed(1);
            
            return {
                totalCost,
                totalKcal,
                nutrition: {
                    kcal: Math.round(totalKcal),
                    protein: totalProt.toFixed(1),
                    fat: totalFat.toFixed(1),
                    carbs: totalCarbs.toFixed(1)
                }
            };

        } catch (err) {
            console.error('[PROVISIO CALC] Internal Error:', err);
            if (!silent && window.showToast) window.showToast('Ошибка расчета: ' + err.message, 'error');
            return null;
        }
    }
    
    // Expose globally for tab switching
    window.renderCalculator = function() {
        init();
    };

    // Auto-init if tab is active on load
    document.addEventListener('DOMContentLoaded', () => {
        // Run init to bind listeners anyway
        init();
    });

})();
