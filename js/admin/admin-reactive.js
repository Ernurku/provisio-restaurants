/* ============================================
   PROVISIO — Reactive Engine Module
   Cost calculations, unit conversions, EP%
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) { console.error('[admin-reactive] Provisio core not loaded'); return; }

    window.ReactiveEngine = {
        resolveIngredientPrice: function (ingredientName) {
            let lowestPrice = Infinity;
            let found = false;
            const ingredients = P.ingredients;
            const suppliers = P.suppliers;
            const dbIng = ingredients.find(i => i.name.toLowerCase() === ingredientName.toLowerCase());

            if (typeof suppliers !== 'undefined') {
                suppliers.forEach(s => {
                    if (s.prices) {
                        s.prices.forEach(p => {
                            const name = (p.ingredient || '').trim().toLowerCase();
                            if (name === ingredientName.toLowerCase()) {
                                // Convert p.qty in p.unit to base unit (grams/ml) for comparison
                                const factor = P.getConversionFactor(dbIng, p.unit, 'г');
                                const baseQty = factor * (parseFloat(p.qty) || 1);
                                const pricePerBase = parseFloat(p.price) / baseQty;
                                if (pricePerBase > 0 && pricePerBase < lowestPrice) {
                                    lowestPrice = pricePerBase;
                                    found = true;
                                }
                            }
                        });
                    }
                });
            }
            return found ? lowestPrice : null;
        },

        // Sister of resolveIngredientPrice: returns the cheapest price-per-gram
        // AND the name of the supplier that offers it. Used by the Закупки tab.
        resolveIngredientPriceWithSupplier: function (ingredientName) {
            let lowestPrice = Infinity;
            let bestSupplier = null;
            let found = false;
            const ingredients = P.ingredients;
            const suppliers = P.suppliers;
            const dbIng = ingredients.find(i => i.name.toLowerCase() === ingredientName.toLowerCase());

            if (typeof suppliers !== 'undefined') {
                suppliers.forEach(s => {
                    if (s.prices) {
                        s.prices.forEach(p => {
                            const name = (p.ingredient || '').trim().toLowerCase();
                            if (name === ingredientName.toLowerCase()) {
                                const factor = P.getConversionFactor(dbIng, p.unit, 'г');
                                const baseQty = factor * (parseFloat(p.qty) || 1);
                                const pricePerBase = parseFloat(p.price) / baseQty;
                                if (pricePerBase > 0 && pricePerBase < lowestPrice) {
                                    lowestPrice = pricePerBase;
                                    bestSupplier = s.name;
                                    found = true;
                                }
                            }
                        });
                    }
                });
            }
            return found ? { pricePerGram: lowestPrice, supplier: bestSupplier } : null;
        },

        calculateRecipeCost: function (recipeId, stack = []) {
            if (stack.includes(recipeId)) {
                console.error('Cyclic dependency detected in recipes: ' + stack.join(' -> ') + ' -> ' + recipeId);
                return 0;
            }

            const recipes = P.recipes;
            const ingredients = P.ingredients;
            const recipe = recipes.find(r => r.id == recipeId);
            if (!recipe) return 0;

            let totalCost = 0;

            let ingArray = recipe.ingredients;
            if (typeof ingArray === 'string') { try { ingArray = JSON.parse(ingArray); } catch (e) { ingArray = []; } }
            if (Array.isArray(ingArray) && ingArray.length > 0) {
                ingArray.forEach(item => {
                    const itemName = (item.name || item.ingredient || '').trim().toLowerCase();
                    const subRecipe = recipes.find(r => r.name.toLowerCase() === itemName && r.id != recipeId);
                    if (subRecipe) {
                        const subCost = this.calculateRecipeCost(subRecipe.id, [...stack, recipeId]);
                        const yieldQty = parseFloat(subRecipe.yield_quantity) || parseFloat(subRecipe.finished_weight) || 1;
                        let itemQty = parseFloat(item.qty) || 0;
                        totalCost += (subCost / yieldQty) * itemQty;
                        item.price = (subCost / yieldQty) * itemQty;
                        return;
                    }

                    const dbIng = ingredients.find(i => i.name.toLowerCase() === itemName);
                    const vendorPricePerBase = this.resolveIngredientPrice(itemName);

                    let itemCost = 0;
                    if (vendorPricePerBase !== null) {
                        const itemQty = parseFloat(item.qty) || 0;
                        const factor = P.getConversionFactor(dbIng, item.unit || 'г', 'г');
                        const normalizedQty = itemQty * factor;
                        itemCost = vendorPricePerBase * normalizedQty;
                    } else {
                        itemCost = parseFloat(item.price) || 0;
                    }

                    const ep = dbIng ? (parseFloat(dbIng.ep_percent) || 100) : 100;
                    if (ep < 100 && ep > 0) itemCost = itemCost / (ep / 100);

                    item.price = itemCost;
                    totalCost += itemCost;
                });
            }

            let laborArray = recipe.labor;
            if (typeof laborArray === 'string') { try { laborArray = JSON.parse(laborArray); } catch (e) { laborArray = []; } }
            if (Array.isArray(laborArray) && laborArray.length > 0) {
                laborArray.forEach(labor => { totalCost += parseFloat(labor.cost) || 0; });
            }

            return totalCost;
        },

        recalculateAll: function (silent = false) {
            let changedRecipes = false;
            const recipes = P.recipes;

            if (recipes && recipes.length > 0) {
                recipes.forEach(r => {
                    const newCost = this.calculateRecipeCost(r.id);
                    if (Math.abs((parseFloat(r.calculated_cost) || 0) - newCost) > 0.01) {
                        r.calculated_cost = newCost;
                        changedRecipes = true;
                    }
                });
            }

            if (changedRecipes) {
                if (typeof renderRecipesTable === 'function') renderRecipesTable();
                if (typeof renderHighMarginDishes === 'function') renderHighMarginDishes();
                if (typeof renderMenuItemsTable === 'function') renderMenuItemsTable();
                if (!silent && P.showToast) {
                    P.showToast('Сработала цепная реакция: себестоимость блюд и меню автоматически пересчитана!', 'info');
                }
            }
        }
    };

    console.log('%c[PROVISIO]%c Reactive Engine loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
