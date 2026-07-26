// POST /api/integrations/connect   { provider, secret } -> { status, webhookUrl, maskedKey }
// DELETE /api/integrations/connect { provider }         -> { status }
//
// Секрет никогда не идёт напрямую в Supabase из браузера — только сюда, по HTTPS,
// с JWT залогиненного владельца. Здесь секрет передаётся в Postgres RPC вместе с
// ключом шифрования (из Vercel env), Postgres шифрует его pgp_sym_encrypt и хранит
// как bytea. Мы никогда не логируем secret и не возвращаем его обратно в браузер.
'use strict';

const { getSupabaseAsUser, getEncryptionKey } = require('../_lib/supabaseAdmin');

function maskKey(key) {
    if (!key || key.length < 4) return '••••••••';
    return '••••••••' + key.slice(-4);
}

module.exports = async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!accessToken) {
        res.status(401).json({ error: 'missing_auth' });
        return;
    }

    let encryptionKey;
    try {
        encryptionKey = getEncryptionKey();
    } catch (err) {
        // Миграция может быть применена, но ключ ещё не добавлен в Vercel — сообщаем понятно, не падаем молча.
        res.status(503).json({ error: 'integrations_backend_not_configured' });
        return;
    }

    let supabase;
    try {
        supabase = getSupabaseAsUser(accessToken);
    } catch (err) {
        res.status(503).json({ error: 'integrations_backend_not_configured' });
        return;
    }

    if (req.method === 'POST') {
        const { provider, secret } = req.body || {};
        if (!provider || !secret) { res.status(400).json({ error: 'missing_fields' }); return; }

        try {
            const { data, error } = await supabase.rpc('save_integration_secret', {
                p_provider: provider,
                p_secret: secret,
                p_key: encryptionKey
            });
            if (error) throw error;
            const row = Array.isArray(data) ? data[0] : data;
            const webhookUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/integrations/webhook/${provider}/${row.webhook_token}`;
            res.status(200).json({ status: row.status, webhookUrl, maskedKey: maskKey(secret) });
        } catch (err) {
            console.error('[integrations/connect] save_integration_secret failed:', err.message || err);
            res.status(500).json({ error: 'save_failed' });
        }
        return;
    }

    if (req.method === 'DELETE') {
        const { provider } = req.body || {};
        if (!provider) { res.status(400).json({ error: 'missing_fields' }); return; }
        try {
            const { error } = await supabase.rpc('disconnect_integration', { p_provider: provider });
            if (error) throw error;
            res.status(200).json({ status: 'disconnected' });
        } catch (err) {
            console.error('[integrations/connect] disconnect failed:', err.message || err);
            res.status(500).json({ error: 'disconnect_failed' });
        }
        return;
    }

    res.status(405).json({ error: 'method_not_allowed' });
};
