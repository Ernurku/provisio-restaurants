// Провайдер Frontpad — терпимый парсер вебхука.
//
// Важно: реальный формат вебхука Frontpad НЕ подтверждён (нет официального
// developer-портала — см. tz-sklad-frontpad-draft.html, раздел 04 "открытый
// технический риск"). Эта функция — лучшая догадка на основе документации
// сторонних интеграторов (DLVRY, FoodSoul), а не проверенный контракт.
//
// Поведение по дизайну: если ни одна из известных форм не подошла — вернуть
// parsed:false. Вызывающий код (webhook handler) в любом случае сохраняет сырой
// payload целиком, чтобы на реальном онбординге клиента можно было дописать сюда
// точный разбор, не потеряв ни одного события за время до этого.
'use strict';

function tryExtractItems(body) {
    if (!body || typeof body !== 'object') return null;

    const candidates = [
        body.items, body.products, body.cart,
        body.order && body.order.items,
        body.order && body.order.products,
        body.order && body.order.cart,
        body.data && body.data.items
    ];

    for (const list of candidates) {
        if (Array.isArray(list) && list.length > 0) {
            const items = list
                .map((raw) => ({
                    external_id: String(raw.product_id ?? raw.id ?? raw.item_id ?? ''),
                    external_name: raw.name ?? raw.title ?? raw.product_name ?? '',
                    qty: Number(raw.qty ?? raw.quantity ?? raw.count ?? 1) || 1
                }))
                .filter((i) => i.external_name || i.external_id);
            if (items.length > 0) return items;
        }
    }
    return null;
}

function parseWebhook(body) {
    const items = tryExtractItems(body);
    if (!items) return { parsed: false, saleEvents: [] };
    return { parsed: true, saleEvents: items };
}

module.exports = { parseWebhook };
