-- ============================================
-- PROVISIO migration v10: Склад (норматив/факт) + self-service Интеграции
-- ============================================
-- Аддитивная миграция — ничего не удаляет и не переписывает существующие данные.
-- Безопасно запускать один раз в Supabase SQL Editor проекта.
-- Ничего из этого файла не применяется автоматически — только вручную, тобой.
--
-- Что делает:
--   1. Порог расхождения (Настройки → Склад и сверка) — новая колонка в user_settings.
--   2. Таблица stocktake_submissions — заявки повара с фактическим остатком (слепой ввод).
--   3. Таблица pos_item_mappings — сопоставление "блюдо кассы" → "рецепт Provisio",
--      сделано провайдеро-агностично (не привязано к одному Frontpad).
--   4. Таблица integration_events — сырые события от кассы (вебхук), включая ещё не
--      разобранные (пока формат вебхука Frontpad не подтверждён на реальном клиенте).
--   5. Расширение applications: колонки под self-service интеграции с шифрованием секрета
--      (pgcrypto). Секрет никогда не хранится и не читается в открытом виде через обычный
--      RLS-доступ — только через RPC-функции ниже, вызываемые исключительно с сервера.
-- ============================================

-- ---- 1. Порог расхождения ----
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS variance_threshold_pct NUMERIC DEFAULT 5;

-- ---- 2. Заявки на ввод фактических остатков (Ввод остатков → Сверка) ----
CREATE TABLE IF NOT EXISTS stocktake_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID DEFAULT get_tenant_id() NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submitted_by TEXT NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    locked BOOLEAN DEFAULT true,
    -- entries: [{ inventory_id, ingredient_id, name, unit, expected_quantity, actual_quantity }]
    entries JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stocktake_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for stocktake_submissions" ON stocktake_submissions;
CREATE POLICY "Tenant isolation for stocktake_submissions" ON stocktake_submissions FOR ALL USING (user_id = get_tenant_id());

-- ---- 3. Сопоставление "блюдо кассы" → рецепт Provisio (провайдеро-агностично) ----
CREATE TABLE IF NOT EXISTS pos_item_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID DEFAULT get_tenant_id() NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    external_name TEXT,
    recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider, external_id)
);

ALTER TABLE pos_item_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for pos_item_mappings" ON pos_item_mappings;
CREATE POLICY "Tenant isolation for pos_item_mappings" ON pos_item_mappings FOR ALL USING (user_id = get_tenant_id());

-- ---- 4. Сырые события от кассы (вебхук) — стейджинг, терпимый к неизвестному формату ----
CREATE TABLE IF NOT EXISTS integration_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    parsed_status TEXT DEFAULT 'unparsed', -- 'unparsed' | 'parsed' | 'error'
    sale_events JSONB DEFAULT '[]',        -- разобранные позиции, если формат распознан
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

ALTER TABLE integration_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for integration_events" ON integration_events;
CREATE POLICY "Tenant isolation for integration_events" ON integration_events FOR ALL USING (user_id = get_tenant_id());
-- Примечание: строки сюда пишет только серверная функция вебхука (service role,
-- обходит RLS сознательно) — обычные пользователи это делать не могут (нет прямого INSERT из браузера).

-- ---- 5. Self-service интеграции: applications + шифрование секрета ----
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS webhook_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
ADD COLUMN IF NOT EXISTS api_key_encrypted BYTEA,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Старая колонка applications.api_key (открытый текст) намеренно НЕ используется для новых
-- интеграций — оставлена как есть (не удаляем, чтобы не сломать то, что могло на неё опираться),
-- но с этой миграции секрет пишем только в api_key_encrypted через RPC ниже.

-- Один провайдер на клиента (повторное подключение — обновление той же строки)
CREATE UNIQUE INDEX IF NOT EXISTS applications_user_provider_uidx ON applications(user_id, provider);

-- save_integration_secret: вызывается ТОЛЬКО с сервера (Vercel function), в контексте JWT
-- залогиненного владельца — get_tenant_id() сам определит, чья это строка. Ключ шифрования
-- (p_key) передаётся из переменных окружения сервера при каждом вызове и нигде не хранится.
CREATE OR REPLACE FUNCTION save_integration_secret(p_provider TEXT, p_secret TEXT, p_key TEXT)
RETURNS TABLE(webhook_token TEXT, status TEXT) AS $$
BEGIN
    RETURN QUERY
    INSERT INTO applications (user_id, provider, name, api_key_encrypted, status, updated_at)
    VALUES (get_tenant_id(), p_provider, p_provider, pgp_sym_encrypt(p_secret, p_key), 'connected', NOW())
    ON CONFLICT (user_id, provider) DO UPDATE
        SET api_key_encrypted = EXCLUDED.api_key_encrypted, status = 'connected', updated_at = NOW()
    RETURNING applications.webhook_token, applications.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Обычные пользователи (anon/authenticated) не должны звать эту функцию напрямую с произвольным
-- ключом шифрования — вызывать её может только наша серверная функция, знающая p_key.
REVOKE ALL ON FUNCTION save_integration_secret(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_integration_secret(TEXT, TEXT, TEXT) TO authenticated;

-- get_integration_secret_by_token: вызывается ТОЛЬКО обработчиком входящего вебхука
-- (service role) — ищет секрет по непредсказуемому webhook_token, а не по user_id,
-- потому что входящий запрос от кассы не имеет JWT нашего пользователя.
CREATE OR REPLACE FUNCTION get_integration_secret_by_token(p_token TEXT, p_key TEXT)
RETURNS TABLE(user_id UUID, provider TEXT, secret TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT a.user_id, a.provider, pgp_sym_decrypt(a.api_key_encrypted, p_key)
    FROM applications a
    WHERE a.webhook_token = p_token AND a.status = 'connected';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION get_integration_secret_by_token(TEXT, TEXT) FROM PUBLIC;
-- Ничего не выдаём ни anon, ни authenticated — эту функцию вызывает только service role
-- (он обходит REVOKE/GRANT, так как service role игнорирует RLS и права ролей по умолчанию).

CREATE OR REPLACE FUNCTION disconnect_integration(p_provider TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE applications SET status = 'disconnected', api_key_encrypted = NULL, updated_at = NOW()
    WHERE user_id = get_tenant_id() AND provider = p_provider;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION disconnect_integration(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION disconnect_integration(TEXT) TO authenticated;

-- ============================================
-- После применения этой миграции нужно ещё (см. README_DEPLOY_SKLAD.md):
--   1. Добавить переменную окружения INTEGRATION_ENCRYPTION_KEY в Vercel (сгенерирована
--      автоматически, лежит в .env.local на этом компьютере — см. инструкцию).
--   2. Добавить переменную окружения SUPABASE_SERVICE_ROLE_KEY в Vercel — это значение
--      берётся ТОЛЬКО из Supabase Dashboard → Project Settings → API → service_role.
--      Я не могу его ни увидеть, ни сгенерировать сам.
-- ============================================
