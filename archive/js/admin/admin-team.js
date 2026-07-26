/* ============================================
   PROVISIO — Team Module
   Team members list and invites
   ============================================ */

(function () {
    const P = window.Provisio;
    if (!P) return;

    window.renderTeamList = function () {
        const grid = document.getElementById('teamGrid');
        if (!grid) return;
        if (!P.team.length) {
            grid.innerHTML = `<div class="empty-state empty-state-card" style="grid-column: 1 / -1;">
                <div class="empty-state-icon"><i class="ph ph-users"></i></div>
                <h3>Команда пока пуста</h3>
                <p>Пригласите сотрудников, чтобы вместе управлять рестораном</p>
            </div>`;
            return;
        }
        grid.innerHTML = P.team.map(t => `
            <div class="team-card">
                <div class="team-card-header">
                    <div class="team-avatar" style="background-color: ${t.color}">${t.initials}</div>
                    <div class="team-info">
                        <div class="team-name">${t.name}</div>
                        <div class="team-role">${t.roleLabel}</div>
                    </div>
                </div>
                <div class="team-card-body">
                    <div style="font-size: 0.8125rem; color: var(--chocolate-light); margin-bottom: 8px;">
                        <i class="ph ph-envelope-simple"></i> ${t.email || '-'}
                    </div>
                    <div style="font-size: 0.8125rem; color: var(--chocolate-light);">
                        <i class="ph ph-clock"></i> Был(а): ${t.last_active || 'Недавно'}
                    </div>
                </div>
            </div>`).join('');
    };

    document.getElementById('inviteTeamBtn')?.addEventListener('click', () => P.openModal('inviteModal'));
    document.getElementById('inviteModalCancel')?.addEventListener('click', () => P.closeAllModals());
    document.getElementById('inviteModalClose')?.addEventListener('click', () => P.closeAllModals());

    document.getElementById('generateInviteBtn')?.addEventListener('click', async () => {
        const role = document.getElementById('inviteRole').value;
        const linkInput = document.getElementById('inviteLink');
        try {
            const data = await P.DB.team.generateInvite(role);
            if (data && data.link) {
                linkInput.value = data.link;
                document.getElementById('inviteLinkContainer').style.display = 'block';
                P.showToast('Ссылка сгенерирована', 'success');
            } else { linkInput.value = window.location.origin + '/register.html?invite=demo-' + role + '&venue=' + P.AppStore.venueId; document.getElementById('inviteLinkContainer').style.display = 'block'; }
        } catch (e) {
            linkInput.value = window.location.origin + '/register.html?invite=demo-' + role + '&venue=' + P.AppStore.venueId;
            document.getElementById('inviteLinkContainer').style.display = 'block';
        }
    });

    document.getElementById('copyInviteBtn')?.addEventListener('click', () => {
        const linkInput = document.getElementById('inviteLink');
        navigator.clipboard.writeText(linkInput.value).then(() => {
            P.showToast('Скопировано в буфер обмена', 'success');
            P.closeAllModals();
        });
    });

    // Sub-tab toggling
    document.querySelectorAll('.team-subtab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.team-subtab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.team-subtab-content').forEach(c => c.style.display = 'none');
            btn.classList.add('active');
            let targetId = btn.dataset.subtab === 'members' ? 'teamMembersContent' : 'teamRolesContent';
            const target = document.getElementById(targetId);
            if (target) target.style.display = 'block';
            if (btn.dataset.subtab === 'members') renderTeamList();
        });
    });

    // Make loadTeam available for boot
    window.loadTeam = async function() {
        try {
            await P.DB.team.list();
            const el = document.getElementById('kpiTeamCount');
            if (el) el.textContent = P.team.length;
            
            // Also update the Team Tab Header count
            const teamCountHeader = document.getElementById('teamCount');
            if (teamCountHeader) teamCountHeader.textContent = P.team.length;

            if (typeof renderTeamList === 'function') renderTeamList();
        } catch (err) { console.log('Team API not available yet'); }
    };

    // Init render
    renderTeamList();

    console.log('%c[PROVISIO]%c Team module loaded', 'color: #8A9A83; font-weight: bold;', 'color: inherit;');
})();
