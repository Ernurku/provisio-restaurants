// Общий helper для серверных функций Provisio (api/*.js).
// Файлы в _lib/ не становятся публичными маршрутами (Vercel игнорирует папки с "_").
//
// Два разных клиента с двумя разными назначениями:
//   - getSupabaseAdmin(): service-role клиент, обходит RLS. Используется ТОЛЬКО там,
//     где личность пользователя уже проверена другим способом (JWT в verifyUser,
//     либо непредсказуемый webhook_token при приёме вебхука от кассы).
//   - getEncryptionKey(): ключ шифрования секретов интеграций. Живёт только в переменных
//     окружения Vercel, никогда не попадает в код, репозиторий или ответ клиенту.
'use strict';

const { createClient } = require('@supabase/supabase-js');

// Публичный URL проекта — не секрет, тот же самый уже используется в браузере (js/supabase-client.js).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nihdpvvwafnmnttsuzcd.supabase.co';

function getSupabaseAdmin() {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
        const err = new Error('missing_service_role_key');
        err.code = 'MISSING_ENV';
        throw err;
    }
    return createClient(SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Клиент "от имени пользователя" — использует anon key + JWT из Authorization header.
// RLS/get_tenant_id() продолжают действовать как обычно; это НЕ service role.
function getSupabaseAsUser(accessToken) {
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!anonKey) {
        const err = new Error('missing_anon_key');
        err.code = 'MISSING_ENV';
        throw err;
    }
    return createClient(SUPABASE_URL, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
}

function getEncryptionKey() {
    const key = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!key) {
        const err = new Error('missing_encryption_key');
        err.code = 'MISSING_ENV';
        throw err;
    }
    return key;
}

module.exports = { getSupabaseAdmin, getSupabaseAsUser, getEncryptionKey, SUPABASE_URL };
