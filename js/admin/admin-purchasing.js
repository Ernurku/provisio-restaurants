/* ============================================
   PROVISIO — Purchasing Module (Закупки)
   Считает закупки по ожидаемым продажам:
   меню -> рецепты (+полуфабрикаты) -> ингредиенты -> поставщик.
   Переиспользует:
     P.getConversionFactor()                          (admin-core.js)
     ReactiveEngine.resolveIngredientPriceWithSupplier (admin-reactive.js)
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) { console.error('[admin-purchasing] Provisio core not loaded'); return; }

    let currentPeriod = 1; // дней (1 = день, 7 = неделя)
    const saveTimers = {};

    function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function roundNice(v) { return Math.round(v * 100) / 100; }

    // ========================================
    // CORE: expand a recipe into base-ingredient grams.
    // Mirrors ReactiveEngine.calculateRecipeCost recursion, but for QUANTITY.
    // - sub-recipes (nested recipes) are expanded down to base ingredients
    // - EP% (edible portion) grosses up the raw quantity to buy
    // ========================================
    function expandRecipe(recipeId, multiplier, stack, acc) {
        if (stack.includes(recipeId)) {
            console.warn('[purchasing] Cyclic recipe skipped:', recipeId);
            return;
        }
        const recipe = (P.recipes || []).find(r => r.id == recipeId);
        if (!recipe) return;

        let ingArray = recipe.ingredients;
        if (typeof ingArray === 'string') { try { ingArray = JSON.parse(ingArray); } catch (e) { ingArray = []; } }
        if (!Array.isArray(ingArray)) return;

        ingArray.forEach(item => {
            const itemName = (item.name || item.ingredient || '').trim();
            if (!itemName) return;
            const lower = itemName.toLowerCase();
            const itemQty = num(item.qty);

            // Is this line actually another recipe (a sub-recipe / полуфабрикат)?
            const subRecipe = (P.recipes || []).find(r => r.name.toLowerCase() === lower && r.id != recipeId);
            if (subRecipe) {
                const yieldQty = num(subRecipe.yield_quantity) || num(subRecipe.finished_weight) || 1;
                expandRecipe(subRecipe.id, multiplier * (itemQty / yieldQty), [...stack, recipeId], acc);
                return;
            }

            // Base ingredient: convert to grams, then gross up by EP% waste.
            const dbIng = (P.ingredients || []).find(i => i.name.toLowerCase() === lower);
            const factor = P.getConversionFactor(dbIng, item.unit || 'г', 'г');
            let grams = itemQty * factor * multiplier;

            const ep = dbIng ? (num(dbIng.ep_percent) || 100) : 100;
            if (ep < 100 && ep > 0) grams = grams / (ep / 100);

            if (!acc[lower]) acc[lower] = { name: itemName, grams: 0, dbIng: dbIng || null };
            acc[lower].grams += grams;
        });
    }

    // Переводит выбранный период продаж в делитель для дневной ставки.
    function periodDivisor(period) {
        if (period === 'week') return 7;
        if (period === 'month') return 30;
        return 1; // 'day'
    }

    // Build the totals map across ALL menu items for the given period.
    function computeTotals(periodDays) {
        const acc = {};
        (P.menuItems || []).forEach(mi => {
            if (!mi.recipe_id) return;                 // нет рецепта -> пропускаем
            const recipe = (P.recipes || []).find(r => r.id == mi.recipe_id);
            if (!recipe) return;
            const raw = num(mi.expected_daily_sales);  // сырое введённое число
            // Нормализуем к продажам в день: "в неделю" ÷ 7, "в месяц" ÷ 30, "в день" как есть.
            const dailyRate = raw / periodDivisor(mi.expected_sales_period || 'day');
            if (dailyRate <= 0) return;                // нет продаж -> 0
            expandRecipe(recipe.id, dailyRate * periodDays, [], acc);
        });
        return acc;
    }

    // Format grams into the ingredient's natural base unit (kg/l/шт...).
    function formatQty(grams, dbIng) {
        const baseUnit = (dbIng && dbIng.base_unit) ? dbIng.base_unit : 'кг';
        const factor = P.getConversionFactor(dbIng, 'г', baseUnit); // grams -> baseUnit
        return { value: grams * factor, unit: baseUnit };
    }

    // ========================================
    // RENDER: expected-sales input table
    // ========================================
    function renderSalesTable() {
        const tbody = document.getElementById('purchasingSalesBody');
        if (!tbody) return;
        const items = P.menuItems || [];

        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="3">
                <div class="empty-state empty-state-table">
                    <div class="empty-state-icon"><i class="ph ph-fork-knife"></i></div>
                    <h3>Меню пока пустое</h3>
                    <p>Сначала добавьте позиции в разделе «Меню» и привяжите их к рецептам.</p>
                </div>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = items.map(mi => {
            const recipe = (P.recipes || []).find(r => r.id == mi.recipe_id);
            const recipeCell = recipe ? escapeHtml(recipe.name) : '<span class="text-danger">Не привязан</span>';
            const sales = mi.expected_daily_sales != null ? mi.expected_daily_sales : 0;
            const period = mi.expected_sales_period || 'day';
            return `<tr>
                <td><strong>${escapeHtml(mi.name)}</strong></td>
                <td>${recipeCell}</td>
                <td>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="number" min="0" step="1" class="admin-input purchasing-sales-input"
                            data-id="${mi.id}" value="${sales}" style="max-width: 90px;">
                        <select class="admin-input purchasing-period-input" data-id="${mi.id}" style="max-width: 140px;">
                            <option value="day"${period === 'day' ? ' selected' : ''}>в день</option>
                            <option value="week"${period === 'week' ? ' selected' : ''}>в неделю</option>
                            <option value="month"${period === 'month' ? ' selected' : ''}>в месяц</option>
                        </select>
                    </div>
                </td>
            </tr>`;
        }).join('');

        // Число: мгновенный пересчёт + сохранение с задержкой (чтобы не дёргать сервер на каждую цифру).
        tbody.querySelectorAll('.purchasing-sales-input').forEach(inp => {
            inp.addEventListener('input', () => {
                const id = inp.dataset.id;
                applyLocal(id);
                recalcPurchasing();
                clearTimeout(saveTimers[id]);
                saveTimers[id] = setTimeout(() => persistSales(id), 600);
            });
        });
        // Период: мгновенный пересчёт и сохранение сразу.
        tbody.querySelectorAll('.purchasing-period-input').forEach(sel => {
            sel.addEventListener('change', () => {
                const id = sel.dataset.id;
                applyLocal(id);
                recalcPurchasing();
                persistSales(id);
            });
        });
    }

    // Читает текущие значения строки (число + период) из DOM.
    function readRow(id) {
        const numInp = document.querySelector(`.purchasing-sales-input[data-id="${id}"]`);
        const perInp = document.querySelector(`.purchasing-period-input[data-id="${id}"]`);
        let val = num(numInp ? numInp.value : 0);
        if (val < 0) { val = 0; if (numInp) numInp.value = 0; }
        const period = perInp ? perInp.value : 'day';
        return { val, period };
    }

    // Обновляет модель в памяти сразу, чтобы пересчёт был мгновенным.
    function applyLocal(id) {
        const { val, period } = readRow(id);
        const mi = (P.menuItems || []).find(m => m.id == id);
        if (mi) { mi.expected_daily_sales = val; mi.expected_sales_period = period; }
    }

    // Сохраняет в БД сырое число и выбранный период.
    async function persistSales(id) {
        const { val, period } = readRow(id);
        try {
            await P.DB.menuItems.update({ id, expected_daily_sales: val, expected_sales_period: period });
        } catch (e) {
            if (P.showToast) P.showToast('Не удалось сохранить продажи: ' + (e.message || e), 'error');
        }
    }

    // ========================================
    // RENDER: purchasing result table
    // ========================================
    function recalcPurchasing() {
        const tbody = document.getElementById('purchasingResultBody');
        const totalCell = document.getElementById('purchasingGrandTotal');
        if (!tbody) return;

        const acc = computeTotals(currentPeriod);
        const keys = Object.keys(acc);

        if (!keys.length) {
            tbody.innerHTML = `<tr><td colspan="5">
                <div class="empty-state empty-state-table">
                    <div class="empty-state-icon"><i class="ph ph-shopping-cart"></i></div>
                    <h3>Пока нечего закупать</h3>
                    <p>Укажите ожидаемые продажи в таблице выше — список закупки появится здесь.</p>
                </div>
            </td></tr>`;
            if (totalCell) totalCell.innerHTML = '<strong>—</strong>';
            return;
        }

        keys.sort((a, b) => acc[a].name.localeCompare(acc[b].name, 'ru'));

        let grandTotal = 0;
        const rows = keys.map(key => {
            const entry = acc[key];
            const dbIng = entry.dbIng;
            const q = formatQty(entry.grams, dbIng);
            const qtyStr = `${roundNice(q.value)} ${escapeHtml(q.unit)}`;

            const priceInfo = (window.ReactiveEngine && window.ReactiveEngine.resolveIngredientPriceWithSupplier)
                ? window.ReactiveEngine.resolveIngredientPriceWithSupplier(entry.name)
                : null;

            if (!priceInfo) {
                // Нет цены: показываем количество, но НЕ включаем в итог.
                return `<tr>
                    <td><strong>${escapeHtml(entry.name)}</strong></td>
                    <td>${qtyStr}</td>
                    <td colspan="2"><span class="badge badge-outline text-danger">нет цены</span></td>
                    <td>—</td>
                </tr>`;
            }

            const gramsPerBase = P.getConversionFactor(dbIng, q.unit, 'г'); // baseUnit -> grams
            const pricePerBaseUnit = priceInfo.pricePerGram * gramsPerBase;
            const lineCost = priceInfo.pricePerGram * entry.grams;
            grandTotal += lineCost;

            return `<tr>
                <td><strong>${escapeHtml(entry.name)}</strong></td>
                <td>${qtyStr}</td>
                <td>${escapeHtml(priceInfo.supplier || '—')}</td>
                <td>${P.formatMoney(pricePerBaseUnit)} / ${escapeHtml(q.unit)}</td>
                <td><strong>${P.formatMoney(lineCost)}</strong></td>
            </tr>`;
        }).join('');

        tbody.innerHTML = rows;
        if (totalCell) totalCell.innerHTML = `<strong>${P.formatMoney(grandTotal)}</strong>`;
    }

    // ========================================
    // PERIOD TOGGLE (День / Неделя)
    // ========================================
    function updatePeriodLabel() {
        const lbl = document.getElementById('purchasingPeriodLabel');
        if (lbl) lbl.textContent = currentPeriod === 7 ? 'на неделю (7 дней)' : 'на 1 день';
    }

    function setupPeriodToggle() {
        const btns = document.querySelectorAll('.purchasing-period-btn');
        btns.forEach(b => b.addEventListener('click', () => {
            btns.forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            currentPeriod = parseInt(b.dataset.days, 10) || 1;
            updatePeriodLabel();
            recalcPurchasing();
        }));
        updatePeriodLabel();
    }

    // ========================================
    // PUBLIC ENTRY (called by switchTab in admin-ui.js)
    // ========================================
    window.renderPurchasing = function () {
        renderSalesTable();
        recalcPurchasing();
    };

    setupPeriodToggle();
    // Первый рендер (данные могут ещё грузиться — switchTab перерисует при открытии вкладки)
    renderPurchasing();

    console.log('%c[PROVISIO]%c Purchasing module loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
