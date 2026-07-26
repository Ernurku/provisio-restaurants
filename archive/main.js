/* ============================================
   PROVISIO — Main JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ---- Mobile Menu Toggle ----
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');

    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('active');
            const icon = mobileMenuBtn.querySelector('i');
            if (mobileMenu.classList.contains('active')) {
                icon.className = 'ph ph-x';
            } else {
                icon.className = 'ph ph-list';
            }
        });

        // Close menu on link click
        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('active');
                mobileMenuBtn.querySelector('i').className = 'ph ph-list';
            });
        });
    }

    // ---- Header scroll effect ----
    const header = document.getElementById('header');
    if (header) {
        let lastScrollY = 0;
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            if (scrollY > 80) {
                header.style.boxShadow = '0 4px 20px rgba(74, 59, 50, 0.06)';
            } else {
                header.style.boxShadow = 'none';
            }
            lastScrollY = scrollY;
        });
    }

    // ---- Scroll Reveal Animations ----
    const revealElements = document.querySelectorAll('.feature-card, .story-card, .stat-item, .platform-item, .pricing-card, .blog-card, .related-feature-card, .content-section, .docs-card');

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, index * 80);
                revealObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        revealObserver.observe(el);
    });

    // ---- Animated Counters ----
    const statNumbers = document.querySelectorAll('.stat-number[data-count]');

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseInt(el.dataset.count);
                animateCounter(el, target);
                counterObserver.unobserve(el);
            }
        });
    }, { threshold: 0.5 });

    statNumbers.forEach(el => counterObserver.observe(el));

    function animateCounter(element, target) {
        const duration = 2000;
        const start = performance.now();

        const tick = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(eased * target);

            element.textContent = current.toLocaleString('ru-RU');

            if (progress < 1) {
                requestAnimationFrame(tick);
            }
        };

        requestAnimationFrame(tick);
    }

    // ---- FAQ Accordion ----
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (question) {
            question.addEventListener('click', () => {
                const isOpen = item.classList.contains('open');
                // Close all
                faqItems.forEach(i => i.classList.remove('open'));
                // Toggle current
                if (!isOpen) {
                    item.classList.add('open');
                }
            });
        }
    });

    // ---- Pricing Toggle ----
    const toggleSwitch = document.querySelector('.toggle-switch');
    if (toggleSwitch) {
        // Cache DOM elements outside event listener to eliminate layout thrashing
        const priceElements = document.querySelectorAll('.pricing-amount');
        const periodElements = document.querySelectorAll('.pricing-period');
        const savingsBadge = document.getElementById('savingsBadge');

        toggleSwitch.addEventListener('click', () => {
            requestAnimationFrame(() => {
                toggleSwitch.classList.toggle('active');
                const isAnnual = toggleSwitch.classList.contains('active');
                
                priceElements.forEach(el => {
                    const monthly = el.dataset.monthly;
                    const annual = el.dataset.annual;
                    if (monthly && annual) {
                        el.textContent = isAnnual ? annual : monthly;
                    }
                });

                periodElements.forEach(el => {
                    el.textContent = isAnnual ? '/ мес (при оплате за год)' : '/ мес';
                });

                if (savingsBadge) {
                    savingsBadge.style.display = isAnnual ? 'flex' : 'none';
                }
            });
        });
    }

    // ---- Smooth scroll for anchor links ----
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const target = this.getAttribute('href');
            if (target === '#') return;
            
            const el = document.querySelector(target);
            if (el) {
                e.preventDefault();
                const offset = 80;
                const top = el.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({ top, behavior: 'smooth' });
            }
        });
    });

});
