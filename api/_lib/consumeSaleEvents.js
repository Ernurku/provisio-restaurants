// Лучшее-из-возможного списание склада по событиям продаж (из вебхука кассы).
//
// Осознанное упрощение по сравнению с браузерным ReactiveEngine (js/admin/admin-reactive.js):
// здесь НЕ переносена полная логика пересчёта единиц измерения (getConversionFactor —
// плотность, кастомные конверсии на ингредиент). Предполагается, что единица в рецепте
// совпадает с единицей на складе; если нет — событие всё равно логируется, но список
// "requires_review" в ответе укажет на расхождение единиц для ручной проверки.
// Причина упрощения: и без этого сервер уже решает главную боль (склад больше не нужно
// обнулять руками при каждой продаже) — точную конверсию единиц можно дотянуть отдельным
// шагом, не блокируя запуск.
'use strict';

async function resolveRecipeId(supabase, userId, provider, item) {
    if (item.external_id) {
        const { data: mapping } = await supabase
            .from('pos_item_mappings')
            .select('recipe_id')
            .eq('user_id', userId)
            .eq('provider', provider)
            .eq('external_id', item.external_id)
            .maybeSingle();
        if (mapping && mapping.recipe_id) return mapping.recipe_id;
    }
    if (item.external_name) {
        const { data: recipe } = await supabase
            .from('recipes')
            .select('id')
            .eq('user_id', userId)
            .ilike('name', item.external_name)
            .maybeSingle();
        if (recipe) return recipe.id;
    }
    return null;
}

async function consumeSaleEvents(supabase, userId, provider, saleEvents) {
    const result = { consumed: [], skipped: [], requiresReview: [] };

    for (const item of saleEvents) {
        try {
            const recipeId = await resolveRecipeId(supabase, userId, provider, item);
            if (!recipeId) { result.skipped.push({ item, reason: 'no_recipe_mapping' }); continue; }

            const { data: recipe } = await supabase.from('recipes').select('id, name, ingredients').eq('id', recipeId).maybeSingle();
            if (!recipe) { result.skipped.push({ item, reason: 'recipe_not_found' }); continue; }

            let ingArray = recipe.ingredients;
            if (typeof ingArray === 'string') { try { ingArray = JSON.parse(ingArray); } catch (e) { ingArray = []; } }
            if (!Array.isArray(ingArray)) ingArray = [];

            for (const recipeIng of ingArray) {
                const ingName = (recipeIng.name || recipeIng.ingredient || '').trim();
                if (!ingName) continue;
                const recipeQtyPerPortion = parseFloat(recipeIng.qty) || 0;
                if (recipeQtyPerPortion <= 0) continue;

                const { data: invRow } = await supabase
                    .from('inventory')
                    .select('id, quantity, unit')
                    .eq('user_id', userId)
                    .ilike('name', ingName)
                    .maybeSingle();
                if (!invRow) { result.skipped.push({ item, ingredient: ingName, reason: 'no_inventory_row' }); continue; }

                const recipeUnit = recipeIng.unit || '';
                if (recipeUnit && invRow.unit && recipeUnit !== invRow.unit) {
                    result.requiresReview.push({ ingredient: ingName, recipeUnit, inventoryUnit: invRow.unit });
                }

                const { data: masterIng } = await supabase.from('ingredients').select('edible_portion_pc').eq('user_id', userId).ilike('name', ingName).maybeSingle();
                const ep = masterIng && masterIng.edible_portion_pc ? parseFloat(masterIng.edible_portion_pc) : 100;
                const epFactor = (ep > 0 && ep < 100) ? (100 / ep) : 1;

                const consumedQty = recipeQtyPerPortion * (parseFloat(item.qty) || 1) * epFactor;
                const newQty = Math.max(0, (parseFloat(invRow.quantity) || 0) - consumedQty);

                await supabase.from('inventory').update({ quantity: newQty }).eq('id', invRow.id);
                await supabase.from('storage_logs').insert({
                    user_id: userId, ingredient_id: null, change_qty: -consumedQty, reason: 'sale', ref_id: null
                });

                result.consumed.push({ ingredient: ingName, consumedQty, newQty });
            }
        } catch (err) {
            result.skipped.push({ item, reason: 'error: ' + (err.message || err) });
        }
    }

    return result;
}

module.exports = { consumeSaleEvents };
