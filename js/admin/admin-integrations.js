/* ============================================
   PROVISIO — Integrations Module (Настройки → Интеграции)
   Self-service подключение кассы (Frontpad сейчас, другие провайдеры позже).
   Секрет уходит на сервер (api/integrations/connect.js) и шифруется там —
   этот файл никогда не хранит и не показывает секрет в открытом виде после сохранения.
   Пока сервер интеграций не развёрнут (нужен supabase_migration_v10 + Vercel env),
   экран работает в демо-режиме — честно помечен как демо, а не выдаётся за рабочее подключение.
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) return;

    const PROVIDERS = ['frontpad'];

    function localKey(provider) { return 'pv_ui_integration_' + provider; }
    function loadLocalState(provider) {
        try { return JSON.parse(localStorage.getItem(localKey(provider)) || 'null'); } catch (e) { return null; }
    }
    function saveLocalState(provider, state) {
        try { localStorage.setItem(localKey(provider), JSON.stringify(state)); } catch (e) { }
    }
    function clearLocalState(provider) {
        try { localStorage.removeItem(localKey(provider)); } catch (e) { }
    }

    function maskKey(key) {
        if (!key || key.length < 4) return '••••••••';
        return '••••••••' + key.slice(-4);
    }
    function randomToken() {
        try {
            return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) { return 'demo' + Date.now(); }
    }

    function setStatusBadge(provider, mode) {
        const badge = document.getElementById(`integStatusBadge_${provider}`);
        if (!badge) return;
        badge.classList.remove('status-ok', 'status-low', 'status-draft');
        if (mode === 'connected') { badge.textContent = 'Подключено'; badge.classList.add('status-ok'); }
        else if (mode === 'demo') { badge.textContent = 'Демо-режим'; badge.classList.add('status-low'); }
        else { badge.textContent = 'Не подключено'; badge.classList.add('status-draft'); }
    }

    function renderDisconnected(provider) {
        setStatusBadge(provider, 'disconnected');
        document.getElementById(`integBody_${provider}`).style.display = 'block';
        document.getElementById(`integConnected_${provider}`).style.display = 'none';
        const keyInput = document.getElementById(`integKeyInput_${provider}`);
        if (keyInput) keyInput.value = '';
    }

    function renderConnected(provider, mode, maskedKey, webhookUrl) {
        setStatusBadge(provider, mode);
        document.getElementById(`integBody_${provider}`).style.display = 'none';
        const connectedBlock = document.getElementById(`integConnected_${provider}`);
        connectedBlock.style.display = 'block';
        document.getElementById(`integMaskedKey_${provider}`).value = maskedKey;
        document.getElementById(`integWebhookUrl_${provider}`).value = webhookUrl;
    }

    function initProvider(provider) {
        const state = loadLocalState(provider);
        if (state && state.mode) {
            renderConnected(provider, state.mode, state.maskedKey, state.webhookUrl);
        } else {
            renderDisconnected(provider);
        }

        // Показать/скрыть код доступа при вводе
        document.getElementById(`integKeyToggle_${provider}`)?.addEventListener('click', () => {
            const input = document.getElementById(`integKeyInput_${provider}`);
            const icon = document.querySelector(`#integKeyToggle_${provider} i`);
            if (input.type === 'password') { input.type = 'text'; icon.className = 'ph ph-eye-slash'; }
            else { input.type = 'password'; icon.className = 'ph ph-eye'; }
        });

        // Подключить
        document.getElementById(`integConnectBtn_${provider}`)?.addEventListener('click', async () => {
            const input = document.getElementById(`integKeyInput_${provider}`);
            const key = input.value.trim();
            if (!key) { P.showToast('Введите код доступа', 'error'); return; }
            const btn = document.getElementById(`integConnectBtn_${provider}`);
            btn.disabled = true; btn.textContent = 'Подключение...';

            try {
                const result = await P.DB.apps.connect(provider, key);
                const masked = result.maskedKey || maskKey(key);
                const url = result.webhookUrl || (location.origin + '/api/integrations/webhook/' + provider);
                saveLocalState(provider, { mode: 'connected', maskedKey: masked, webhookUrl: url });
                renderConnected(provider, 'connected', masked, url);
                P.showToast('Подключено', 'success');
            } catch (err) {
                console.warn(`[Provisio] Реальный сервер интеграций пока недоступен (${err.message || err}) — включаю демо-режим.`, err);
                const masked = maskKey(key);
                const url = `${location.origin}/api/integrations/webhook/${provider}/${randomToken()}`;
                saveLocalState(provider, { mode: 'demo', maskedKey: masked, webhookUrl: url });
                renderConnected(provider, 'demo', masked, url);
                P.showToast('Показан демо-режим — сервер интеграций ещё не развёрнут (Phase 3/4)', 'info');
            } finally {
                btn.disabled = false; btn.innerHTML = '<i class="ph ph-link"></i> Подключить';
            }
        });

        // Копировать ссылку
        document.getElementById(`integCopyBtn_${provider}`)?.addEventListener('click', () => {
            const url = document.getElementById(`integWebhookUrl_${provider}`).value;
            if (!url) return;
            navigator.clipboard?.writeText(url).then(() => P.showToast('Ссылка скопирована')).catch(() => P.showToast('Не удалось скопировать', 'error'));
        });

        // Проверить подключение
        document.getElementById(`integTestBtn_${provider}`)?.addEventListener('click', async () => {
            const btn = document.getElementById(`integTestBtn_${provider}`);
            btn.disabled = true; btn.textContent = 'Проверка...';
            const state = loadLocalState(provider);
            try {
                const { data: sessionData } = await window.supabase.auth.getSession();
                const accessToken = sessionData?.session?.access_token;
                const res = await fetch(`/api/integrations/test?provider=${provider}`, {
                    method: 'GET',
                    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
                });
                if (!res.ok) throw new Error('not_ready');
                const body = await res.json();
                if (body.connected) P.showToast('Подключение работает', 'success');
                else P.showToast('Код доступа сохранён, но событий от кассы пока не было', 'info');
            } catch (err) {
                if (state && state.mode === 'demo') {
                    P.showToast('Это демо-режим — реальную проверку можно будет сделать после запуска сервера интеграций', 'info');
                } else {
                    P.showToast('Не удалось проверить подключение', 'error');
                }
            } finally {
                btn.disabled = false; btn.innerHTML = '<i class="ph ph-plug-charging"></i> Проверить подключение';
            }
        });

        // Отключить
        document.getElementById(`integDisconnectBtn_${provider}`)?.addEventListener('click', () => {
            P.confirmAction('Отключить интеграцию', `Отключить ${provider}? Ссылка перестанет работать.`, async () => {
                try { await P.DB.apps.disconnect(provider); } catch (err) { /* демо-режим — нечего отключать на сервере */ }
                clearLocalState(provider);
                renderDisconnected(provider);
                P.showToast('Интеграция отключена');
            });
        });
    }

    PROVIDERS.forEach(initProvider);

    // ========================================
    // Загрузка продаж файлом (CSV) — временный/постоянный равноправный источник
    // событий продажи, пока или вместо вебхука кассы.
    // ========================================
    document.getElementById('salesCsvInput')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const resultEl = document.getElementById('salesCsvResult');
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result || '');
            const rows = text.split(/\r?\n/).filter(r => r.trim().length > 0);
            const dataRows = Math.max(0, rows.length - 1); // минус заголовок
            resultEl.innerHTML = `<i class="ph ph-check-circle" style="color: var(--olive);"></i> Файл получен: ${dataRows} ${P.getNoun(dataRows, 'строка', 'строки', 'строк')}. Сопоставление с рецептами и списание остатков подключим на следующем шаге (Phase 3).`;
            P.showToast('Файл получен', 'success');
        };
        reader.onerror = () => { resultEl.textContent = 'Не удалось прочитать файл'; };
        reader.readAsText(file, 'utf-8');
    });

    console.log('%c[PROVISIO]%c Integrations module loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
