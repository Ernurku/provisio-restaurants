// POST /api/integrations/webhook/:provider/:token
// Сюда касса (сейчас — Frontpad) присылает уведомление о заказе. URL уникален на
// клиента (token = applications.webhook_token) — так сервер понимает, какому
// ресторану принадлежит событие, ещё до какой-либо расшифровки секрета.
//
// Порядок действий специально в эту сторону: событие ВСЕГДА сохраняется целиком
// (raw_payload), даже если распознать построчную корзину не удалось — см.
// tz-sklad-frontpad-draft.html про терпимость к неподтверждённому формату вебхука.
// Списание склада — best-effort шаг поверх уже сохранённого события.
'use strict';

const { getSupabaseAdmin, getEncryptionKey } = require('../../../_lib/supabaseAdmin');
const { consumeSaleEvents } = require('../../../_lib/consumeSaleEvents');

const providerAdapters = {
    frontpad: require('../../providers/frontpad')
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

    const { provider, token } = req.query;
    const adapter = providerAdapters[provider];
    if (!adapter) { res.status(404).json({ error: 'unknown_provider' }); return; }

    let supabase, encryptionKey;
    try {
        supabase = getSupabaseAdmin();
        encryptionKey = getEncryptionKey();
    } catch (err) {
        // Секрет/сервис-ключ ещё не добавлены в Vercel — отвечаем понятной ошибкой,
        // но не 200, чтобы касса (если у неё есть ретраи) попробовала снова позже.
        res.status(503).json({ error: 'integrations_backend_not_configured' });
        return;
    }

    let owner;
    try {
        const { data, error } = await supabase.rpc('get_integration_secret_by_token', { p_token: token, p_key: encryptionKey });
        if (error) throw error;
        owner = Array.isArray(data) ? data[0] : data;
    } catch (err) {
        console.error('[webhook] token lookup failed:', err.message || err);
        res.status(500).json({ error: 'lookup_failed' });
        return;
    }

    if (!owner || !owner.user_id) {
        // Токен не найден/не активен — не подтверждаем и не опровергаем причину (не палим существование токенов).
        res.status(404).json({ error: 'not_found' });
        return;
    }

    const body = req.body;
    const { parsed, saleEvents } = adapter.parseWebhook(body);

    let eventRow;
    try {
        const { data, error } = await supabase.from('integration_events').insert({
            user_id: owner.user_id,
            provider,
            raw_payload: body,
            parsed_status: parsed ? 'parsed' : 'unparsed',
            sale_events: saleEvents
        }).select().single();
        if (error) throw error;
        eventRow = data;
    } catch (err) {
        console.error('[webhook] failed to store raw event:', err.message || err);
        // Даже если запись не удалась — отвечаем 200, чтобы касса не бомбардировала ретраями
        // то, что мы всё равно не готовы принять; ошибка уже залогирована для расследования.
        res.status(200).json({ received: true, stored: false });
        return;
    }

    let consumption = null;
    if (parsed && saleEvents.length > 0) {
        try {
            consumption = await consumeSaleEvents(supabase, owner.user_id, provider, saleEvents);
            await supabase.from('integration_events').update({ processed_at: new Date().toISOString() }).eq('id', eventRow.id);
        } catch (err) {
            console.error('[webhook] consumeSaleEvents failed (raw event is still safely stored):', err.message || err);
        }
    }

    res.status(200).json({ received: true, stored: true, parsed, consumption });
};
