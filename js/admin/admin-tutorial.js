/* ============================================
   PROVISIO — Onboarding Tutorial Module
   Приветственное окно + пошаговый тур по продукту.
   Флаг "пройдено" хранится в БД (user_settings.tutorial_completed),
   НЕ в localStorage — чтобы не повторялся на других устройствах.
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) { console.error('[admin-tutorial] Provisio core not loaded'); return; }

    // Шаги тура: подсвечиваем пункт меню (data-tab) и показываем одну фразу.
    // icon — иконка Phosphor (тот же набор, что в боковом меню). Чисто визуально.
    const STEPS = [
        { tab: 'suppliers',   icon: 'ph-truck',          text: 'Начните отсюда: добавьте поставщиков и их цены на ингредиенты — на этих ценах строятся все расчёты.' },
        { tab: 'ingredients', icon: 'ph-carrot',         text: 'Здесь ваши продукты: единицы, плотность и процент отхода — чтобы расчёты были точными.' },
        { tab: 'recipes',     icon: 'ph-book-open-text', text: 'Соберите блюдо из ингредиентов — программа сама посчитает его себестоимость.' },
        { tab: 'menu_items',  icon: 'ph-fork-knife',     text: 'Добавьте позиции меню и поставьте цену продажи — сразу увидите маржу и прибыль.' },
        { tab: 'calculation', icon: 'ph-calculator',     text: 'Здесь видно себестоимость и маржу каждого блюда: где вы зарабатываете, а где теряете.' },
        { tab: 'purchasing',  icon: 'ph-shopping-cart',  text: 'Введите ожидаемые продажи — программа посчитает, что и сколько закупить и у кого дешевле.' }
    ];

    let stepIndex = -1;
    let highlightedEl = null;

    // --- DOM refs ---
    const welcomeModal = 'tutorialWelcomeModal';
    const finalModal = 'tutorialFinalModal';
    const backdrop = document.getElementById('tourBackdrop');
    const tooltip = document.getElementById('tourTooltip');
    const stepText = document.getElementById('tourStepText');
    const stepCounter = document.getElementById('tourStepCounter');
    const stepIcon = document.getElementById('tourStepIcon');
    const progressFill = document.getElementById('tourProgressFill');
    const nextBtn = document.getElementById('tourNextBtn');

    // ========================================
    // DB FLAG
    // ========================================
    async function markCompleted() {
        try {
            await P.DB.settings.save({ tutorial_completed: true });
        } catch (e) {
            console.warn('[tutorial] Failed to save tutorial_completed flag', e);
        }
    }

    // ========================================
    // HIGHLIGHT + TOOLTIP POSITIONING
    // ========================================
    function clearHighlight() {
        if (highlightedEl) { highlightedEl.classList.remove('tour-highlight'); highlightedEl = null; }
    }

    function positionTooltip(targetEl) {
        const r = targetEl.getBoundingClientRect();
        // По умолчанию — справа от пункта меню. На мобильном CSS перекинет вниз по центру.
        let left = r.right + 16;
        let top = r.top;
        // Если справа не помещается — показываем под элементом.
        const tipWidth = tooltip.offsetWidth || 300;
        if (left + tipWidth > window.innerWidth - 12) {
            left = Math.max(12, r.left);
            top = r.bottom + 12;
        }
        // Не вылезаем за низ экрана.
        const tipHeight = tooltip.offsetHeight || 160;
        if (top + tipHeight > window.innerHeight - 12) {
            top = Math.max(12, window.innerHeight - tipHeight - 12);
        }
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    function showStep(i) {
        clearHighlight();
        const step = STEPS[i];
        const link = document.querySelector(`.sidebar-link[data-tab="${step.tab}"]`);
        if (!link) {
            // На всякий случай: если пункт не найден — переходим к следующему.
            if (i < STEPS.length - 1) { showStep(i + 1); } else { finishToFinalModal(); }
            return;
        }
        link.classList.add('tour-highlight');
        highlightedEl = link;

        stepText.textContent = step.text;
        stepCounter.textContent = `Шаг ${i + 1} из ${STEPS.length}`;
        if (stepIcon) stepIcon.className = 'ph ' + step.icon;
        if (progressFill) progressFill.style.width = (((i + 1) / STEPS.length) * 100) + '%';
        nextBtn.innerHTML = (i === STEPS.length - 1)
            ? 'Завершить'
            : 'Далее';

        backdrop.classList.add('active');
        tooltip.classList.add('active');
        // Позиционируем после показа (нужны реальные размеры tooltip).
        requestAnimationFrame(() => positionTooltip(link));
    }

    function nextStep() {
        if (stepIndex < STEPS.length - 1) {
            stepIndex++;
            showStep(stepIndex);
        } else {
            finishToFinalModal();
        }
    }

    // ========================================
    // START / END
    // ========================================
    function startTour() {
        P.closeAllModals();
        // На мобильном откроем сайдбар, чтобы пункты меню были видны.
        if (window.innerWidth <= 768) {
            document.getElementById('adminSidebar')?.classList.add('open');
        }
        stepIndex = 0;
        showStep(0);
    }

    function endTour() {
        clearHighlight();
        backdrop.classList.remove('active');
        tooltip.classList.remove('active');
    }

    function finishToFinalModal() {
        endTour();
        P.openModal(finalModal);
    }

    function completeAndClose() {
        endTour();
        P.closeAllModals();
        markCompleted();
    }

    // Reposition the tooltip if the window resizes mid-tour.
    window.addEventListener('resize', () => {
        if (highlightedEl) positionTooltip(highlightedEl);
    });

    // ========================================
    // EVENT WIRING
    // ========================================
    document.getElementById('tutorialStartBtn')?.addEventListener('click', startTour);
    document.getElementById('tutorialSkipBtn')?.addEventListener('click', completeAndClose);
    document.getElementById('tutorialWelcomeClose')?.addEventListener('click', completeAndClose);

    document.getElementById('tourNextBtn')?.addEventListener('click', nextStep);
    document.getElementById('tourSkipBtn')?.addEventListener('click', completeAndClose);

    document.getElementById('tutorialFinishBtn')?.addEventListener('click', completeAndClose);
    document.getElementById('tutorialFinalClose')?.addEventListener('click', completeAndClose);

    // "Повторить туториал" в Настройках — запускает заново в любой момент.
    document.getElementById('replayTutorialBtn')?.addEventListener('click', () => {
        endTour();
        P.openModal(welcomeModal);
    });

    // ========================================
    // FIRST-LOGIN AUTO SHOW
    // ========================================
    async function maybeShowOnFirstLogin() {
        try {
            const data = await P.DB.settings.load();
            const done = data && data.tutorial_completed === true;
            if (!done) {
                // Сразу помечаем как пройдено, чтобы окно не зацикливалось,
                // даже если пользователь закроет его кликом мимо.
                markCompleted();
                P.openModal(welcomeModal);
            }
        } catch (e) {
            console.warn('[tutorial] Could not check tutorial flag', e);
        }
    }

    // Небольшая задержка, чтобы сессия Supabase успела инициализироваться.
    setTimeout(maybeShowOnFirstLogin, 1200);

    console.log('%c[PROVISIO]%c Tutorial module loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
