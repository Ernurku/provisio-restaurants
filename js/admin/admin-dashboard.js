/* ============================================
   PROVISIO — Dashboard Module
   Chart, KPI, Notifications, Search
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) return;

    // ========================================
    // FOODCOST CHART
    // ========================================
    function renderFoodcostChart(period) {
        const chart = document.getElementById('foodcostChart');
        const data = P.foodcostData[period] || P.foodcostData[30] || [];

        if (!P.recipes.length || !data.length) {
            chart.innerHTML = `<div class="empty-state empty-state-card" style="width:100%;">
                <div class="empty-state-icon"><i class="ph ph-chart-bar"></i></div>
                <h3>Нет данных для графика</h3>
                <p>Создайте рецепты и настройте историю цен, чтобы увидеть динамику фудкоста</p>
            </div>`;
            const kpi = document.getElementById('kpiFoodcost');
            if (kpi) kpi.textContent = '—';
            return;
        }
        const maxVal = Math.max(...data.map(d => d.value));
        chart.innerHTML = data.map((d, i) => {
            const h = (d.value / (maxVal * 1.3)) * 100;
            const isLast = i === data.length - 1;
            return `<div class="chart-bar ${isLast ? 'active' : ''}" style="height: ${h}%;" data-label="${d.label}"><span>${d.value}%</span></div>`;
        }).join('');

        const latest = data[data.length - 1].value;
        const prev = data.length > 1 ? data[data.length - 2].value : latest;
        const diff = (latest - prev).toFixed(1);
        const kpiFoodcost = document.getElementById('kpiFoodcost');
        const kpiChange = document.getElementById('kpiFoodcostChange');
        if (kpiFoodcost) kpiFoodcost.textContent = latest + '%';
        if (kpiChange) {
            const isDown = diff <= 0;
            kpiChange.className = `kpi-change ${isDown ? 'kpi-down' : 'kpi-up'}`;
            kpiChange.innerHTML = `<i class="ph ph-trend-${isDown ? 'down' : 'up'}"></i> ${diff > 0 ? '+' : ''}${diff}%`;
        }
    }
    document.getElementById('foodcostPeriodSelect')?.addEventListener('change', (e) => renderFoodcostChart(parseInt(e.target.value)));
    renderFoodcostChart(30);

    // ========================================
    // HIGH MARGIN DISHES
    // ========================================
    function renderHighMarginDishes() {
        const sorted = [...P.recipes].sort((a, b) => (b.price - b.cost) - (a.price - a.cost));
        const container = document.getElementById('highMarginDishes');
        if (!sorted.length) {
            container.innerHTML = `<div class="empty-state empty-state-card">
                <div class="empty-state-icon"><i class="ph ph-chart-line-up"></i></div>
                <h3>Нет данных</h3>
                <p>Добавьте рецепты с ценами, чтобы увидеть самые маржинальные блюда</p>
                <button class="btn btn-accent btn-sm" onclick="document.querySelector('[data-tab=recipes]')?.click()">
                    <i class="ph ph-arrow-right"></i> Перейти к рецептам
                </button>
            </div>`;
            return;
        }
        container.innerHTML = sorted.slice(0, 5).map((d, i) => {
            const margin = (parseFloat(d.price) || 0) - (parseFloat(d.cost) || 0);
            const price = parseFloat(d.price) || 0;
            const cost = parseFloat(d.cost) || 0;
            const fc = price > 0 ? ((cost / price) * 100).toFixed(0) : '0';
            return `<div class="dish-item">
                <span class="dish-rank">${i + 1}</span>
                <div class="dish-info"><span class="dish-name">${d.name || 'Без названия'}</span><span class="dish-stats">Маржа: ${P.formatMoney(margin)} • Фудкост: ${fc}%</span></div>
            </div>`;
        }).join('');
    }
    renderHighMarginDishes();

    // ========================================
    // NOTIFICATIONS BELL
    // ========================================
    const notifBellBtn = document.getElementById('notifBellBtn');
    const notifDropdown = document.getElementById('notifDropdown');
    notifBellBtn?.addEventListener('click', (e) => { e.stopPropagation(); notifDropdown.classList.toggle('active'); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.notifications-bell-wrap')) notifDropdown?.classList.remove('active'); });

    function renderNotifications() {
        const dropdownList = document.getElementById('notifDropdownList');
        if (!dropdownList) return;
        if (!P.notifications.length) {
            dropdownList.innerHTML = `<div style="padding: 32px 20px; text-align: center; color: var(--chocolate-light); font-size: 0.8125rem;">
                <i class="ph ph-bell-slash" style="font-size: 1.5rem; display: block; margin-bottom: 8px; opacity: 0.4;"></i>
                Нет новых уведомлений
            </div>`;
            return;
        }
        dropdownList.innerHTML = P.notifications.slice(0, 5).map(n => {
            const typeClass = n.type === 'warning' ? 'notif-type-warning' : n.type === 'info' ? 'notif-type-info' : 'notif-type-success';
            return `<a href="#" class="notif-dropdown-item ${typeClass}" data-goto="${n.goto}">
                <i class="ph ${n.icon}"></i><div>${n.text}</div><span class="notification-time">${n.time}</span>
            </a>`;
        }).join('');
        dropdownList.querySelectorAll('.notif-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => { e.preventDefault(); P.switchTab(item.dataset.goto); notifDropdown.classList.remove('active'); });
        });

        // PHASE 2 ARCHIVED: full notifications tab removed — skip render
        // if (typeof renderFullNotifications === 'function') renderFullNotifications();
    }

    // Full Notifications Tab List — PHASE 2 ARCHIVED (tab-notifications removed from admin.html)
    function renderFullNotifications() {
        // Tab is archived — do nothing. Container #fullNotifList does not exist in Phase 1.
        return;
    }
    renderNotifications();

    // PHASE 2 ARCHIVED: notifications tab removed — links disabled
    // document.getElementById('viewAllNotifsLink')?.addEventListener('click', (e) => { e.preventDefault(); P.switchTab('notifications'); notifDropdown.classList.remove('active'); });
    // document.getElementById('dashNotifLink')?.addEventListener('click', (e) => { e.preventDefault(); P.switchTab('notifications'); });

    function renderDashboardNotifs() {
        const list = document.getElementById('dashboardNotifList');
        if (!P.notifications.length) {
            list.innerHTML = `<div class="empty-state empty-state-card">
                <div class="empty-state-icon"><i class="ph ph-bell-ringing"></i></div>
                <h3>Всё спокойно</h3>
                <p>Уведомления появятся здесь, когда на складе закончатся товары или появятся важные события</p>
            </div>`;
            return;
        }
        list.innerHTML = P.notifications.slice(0, 3).map(n => `
            <div class="notification-item notification-${n.type}" style="cursor:pointer" data-goto="${n.goto}">
                <i class="ph ${n.icon}"></i><div>${n.text}</div><span class="notification-time">${n.time}</span>
            </div>`).join('');
        list.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', () => P.switchTab(item.dataset.goto));
        });
    }
    renderDashboardNotifs();

    // ========================================
    // GLOBAL SEARCH
    // ========================================
    const searchToggle = document.getElementById('searchToggleBtn');
    const searchDropdown = document.getElementById('searchDropdown');
    const searchInput = document.getElementById('globalSearchInput');
    const searchResults = document.getElementById('searchResults');

    searchToggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        searchDropdown.classList.toggle('active');
        if (searchDropdown.classList.contains('active')) searchInput.focus();
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.global-search')) searchDropdown?.classList.remove('active'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') searchDropdown?.classList.remove('active'); });

    searchInput?.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (!q) { searchResults.innerHTML = '<div class="search-empty">Начните вводить для поиска...</div>'; return; }
        let results = [];
        P.recipes.forEach(r => { if (r.name.toLowerCase().includes(q)) results.push({ type: 'Рецепт', name: r.name, icon: 'ph-book-open-text', goto: 'recipes' }); });
        (P.menuItems || []).forEach(m => { if (m.name.toLowerCase().includes(q)) results.push({ type: 'Меню', name: m.name, icon: 'ph-bowl-food', goto: 'menu' }); });
        (P.ingredients || []).forEach(ing => { if (ing.name.toLowerCase().includes(q)) results.push({ type: 'Ингредиент', name: ing.name, icon: 'ph-flask', goto: 'ingredients' }); });
        (P.suppliers || []).forEach(s => { if (s.name.toLowerCase().includes(q)) results.push({ type: 'Поставщик', name: s.name, icon: 'ph-truck', goto: 'suppliers' }); });
        if (!results.length) { searchResults.innerHTML = '<div class="search-empty">Ничего не найдено</div>'; return; }
        searchResults.innerHTML = results.slice(0, 8).map(r => `
            <a href="#" class="search-result-item" data-goto="${r.goto}"><i class="ph ${r.icon}"></i><div><span class="search-result-type">${r.type}</span><span class="search-result-name">${r.name}</span></div></a>
        `).join('');
        searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', (e) => { e.preventDefault(); P.switchTab(item.dataset.goto); searchDropdown.classList.remove('active'); searchInput.value = ''; });
        });
    });

    // Expose
    window.renderFoodcostChart = renderFoodcostChart;
    window.renderHighMarginDishes = renderHighMarginDishes;
    window.renderNotifications = renderNotifications;
    window.renderFullNotifications = renderFullNotifications;
    window.renderDashboardNotifs = renderDashboardNotifs;

    // Init renders
    renderNotifications();
    renderDashboardNotifs();
    // renderFullNotifications(); // PHASE 2 ARCHIVED — tab removed

    console.log('%c[PROVISIO]%c Dashboard module loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
