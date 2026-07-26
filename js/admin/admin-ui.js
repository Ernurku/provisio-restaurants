/* ============================================
   PROVISIO — UI Module
   Tabs, Sidebar, Toast, Modal, Search, Notifs
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) { console.error('[admin-ui] Provisio core not loaded'); return; }

    // ========================================
    // TAB NAVIGATION
    // ========================================
    const sidebarLinks = document.querySelectorAll('.sidebar-link[data-tab]');
    const tabs = document.querySelectorAll('.admin-tab');
    const topbarTitle = document.getElementById('topbarTitle');
    const tabTitles = { dashboard: 'Дашборд', menu_items: 'Меню', recipes: 'Рецепты', calculation: 'Калькуляция', purchasing: 'Закупки', ingredients: 'Ингредиенты', inventory: 'Склад', orders: 'Заказы', suppliers: 'Поставщики', team: 'Команда', notifications: 'Уведомления', applications: 'Приложения', settings: 'Настройки' };

    function switchTab(tabId) {
        sidebarLinks.forEach(l => l.classList.remove('active'));
        const link = document.querySelector(`.sidebar-link[data-tab="${tabId}"]`);
        if (link) link.classList.add('active');
        tabs.forEach(tab => tab.classList.remove('active'));
        const targetTab = document.getElementById(`tab-${tabId}`);
        if (targetTab) targetTab.classList.add('active');
        if (topbarTitle && tabTitles[tabId]) topbarTitle.textContent = tabTitles[tabId];

        // Refresh Calculator data if switching to it
        if (tabId === 'calculation' && typeof window.renderCalculator === 'function') {
            window.renderCalculator();
        }

        // Refresh Purchasing data if switching to it
        if (tabId === 'purchasing' && typeof window.renderPurchasing === 'function') {
            window.renderPurchasing();
        }

        try { localStorage.setItem('active_tab', tabId); } catch (e) { }
        document.getElementById('adminSidebar')?.classList.remove('open');
        document.querySelector('.sidebar-overlay')?.classList.remove('active');
    }

    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); switchTab(link.dataset.tab); });
    });

    const savedTab = localStorage.getItem('active_tab');
    if (savedTab && document.getElementById(`tab-${savedTab}`)) {
        switchTab(savedTab);
    }

    // ========================================
    // SIDEBAR & LOGOUT
    // ========================================
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    if (P.AppStore.sidebarCollapsed && window.innerWidth > 768) {
        document.body.classList.add('sidebar-collapsed');
        updateCollapseIcon(true);
    }

    function updateCollapseIcon(collapsed) {
        const icon = sidebarCollapseBtn?.querySelector('i');
        if (icon) icon.className = collapsed ? 'ph ph-caret-right' : 'ph ph-caret-left';
        if (sidebarCollapseBtn) sidebarCollapseBtn.title = collapsed ? 'Развернуть меню' : 'Свернуть меню';
    }

    document.addEventListener('app:sidebar_toggled', () => {
        if (window.innerWidth > 768) {
            document.body.classList.toggle('sidebar-collapsed', P.AppStore.sidebarCollapsed);
            updateCollapseIcon(P.AppStore.sidebarCollapsed);
        }
    });

    sidebarCollapseBtn?.addEventListener('click', () => { if (window.innerWidth > 768) P.AppStore.toggleSidebar(); });

    sidebarToggle?.addEventListener('click', () => {
        if (window.innerWidth <= 768) { sidebar.classList.toggle('open'); overlay.classList.toggle('active'); }
        else P.AppStore.toggleSidebar();
    });
    overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('active'); });

    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('auth_session');
        localStorage.removeItem('user_email');
        localStorage.removeItem('user_name');
        window.location.href = 'login.html';
    });

    // ========================================
    // APPLICATIONS FETCHING — PHASE 2 ARCHIVED
    // ========================================
    // loadApplications and its event listener are disabled.
    // The tab-applications block and sidebar link are commented out in admin.html.
    // To restore: uncomment below AND restore archive/js/admin files AND admin.html sections.
    /*
    async function loadApplications() {
        const grid = document.getElementById('applicationsGrid');
        if (!grid) return;
        try {
            const data = await P.apiRequest('/v2/data-hub', 'POST', { action: 'list', module: 'apps' }, true).catch(() => [
                { name: '1C:Предприятие', desc: 'Автоматизация бухгалтерского и налогового учета.', icon: 'ph-calculator' },
                { name: 'iiko', desc: 'Единая система управления рестораном.', icon: 'ph-storefront' },
                { name: 'r_keeper', desc: 'Программа для автоматизации работы заведения.', icon: 'ph-laptop' },
                { name: 'Telegram Bot', desc: 'Уведомления и заказы в мессенджере.', icon: 'ph-telegram-logo' }
            ]);
            grid.innerHTML = data.map(app => `
                <div class="app-card-premium">
                    <div class="app-card-icon"><i class="ph ${app.icon || 'ph-app-window'}"></i></div>
                    <div class="app-card-content"><h3>${app.name}</h3><p>${app.desc}</p></div>
                    <div class="app-card-footer"><button class="btn btn-outline btn-sm">Подключить</button></div>
                </div>`).join('');
        } catch (err) {
            grid.innerHTML = '<div style="padding: 20px; text-align: center;">Не удалось загрузить интеграции</div>';
        }
    }
    document.querySelector('.sidebar-link[data-tab="applications"]')?.addEventListener('click', loadApplications);
    */

    // ========================================
    // TOAST (overwrite core's basic version)
    // ========================================
    function showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) { console.log(`[TOAST ${type}] ${message}`); return; }
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icons = { success: 'ph-check-circle', error: 'ph-x-circle', info: 'ph-info' };
        toast.innerHTML = `<i class="ph ${icons[type] || icons.info}"></i><span>${message}</span>`;
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // ========================================
    // MODAL SYSTEM
    // ========================================
    const modalOverlay = document.getElementById('modalOverlay');
    function openModal(modalId) {
        document.getElementById(modalId)?.classList.add('active');
        modalOverlay.classList.add('active');
    }
    function closeModal(modalId) {
        document.getElementById(modalId)?.classList.remove('active');
        modalOverlay.classList.remove('active');
    }
    function closeAllModals() {
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        modalOverlay.classList.remove('active');
    }

    function confirmAction(title, text, onConfirm) {
        document.getElementById('confirmModalTitle').textContent = title;
        document.getElementById('confirmModalText').textContent = text;
        const btnOk = document.getElementById('confirmModalOk');
        const newBtnOk = btnOk.cloneNode(true);
        btnOk.parentNode.replaceChild(newBtnOk, btnOk);

        newBtnOk.onclick = async () => {
            if (newBtnOk.disabled) return;
            const originalText = newBtnOk.innerHTML;
            newBtnOk.disabled = true;
            newBtnOk.innerHTML = '<i class="ph ph-circle-notch" style="animation: spin 1s linear infinite;"></i> Выполнение...';
            try { await onConfirm(); }
            finally { newBtnOk.innerHTML = originalText; newBtnOk.disabled = false; closeConfirm(); }
        };

        const closeConfirm = () => {
            document.getElementById('confirmModal')?.classList.remove('active');
            if (document.querySelectorAll('.modal.active').length === 0) modalOverlay.classList.remove('active');
        };

        const btnCancel = document.getElementById('confirmModalCancel');
        const newBtnCancel = btnCancel.cloneNode(true);
        btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);
        newBtnCancel.onclick = closeConfirm;

        const btnClose = document.getElementById('confirmModalClose');
        if (btnClose) {
            const newBtnClose = btnClose.cloneNode(true);
            btnClose.parentNode.replaceChild(newBtnClose, btnClose);
            newBtnClose.onclick = closeConfirm;
        }

        openModal('confirmModal');
    }
    modalOverlay?.addEventListener('click', closeAllModals);
    document.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', closeAllModals));

    // ========================================
    // EXPORT to Provisio namespace
    // ========================================
    P.showToast = showToast;
    window.showToast = showToast;
    P.switchTab = switchTab;
    P.openModal = openModal;
    P.closeModal = closeModal;
    P.closeAllModals = closeAllModals;
    P.confirmAction = confirmAction;

    // Also expose globally for onclick handlers in HTML
    window.switchTab = switchTab;
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.closeAllModals = closeAllModals;
    window.confirmAction = confirmAction;

    console.log('%c[PROVISIO]%c UI module loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
