// GET /api/integrations/test?provider=frontpad -> { connected, status, lastEventAt }
// Не звонит в саму кассу (у Frontpad нет подтверждённого метода "проверить связь" —
// см. tz-sklad-frontpad-draft.html, раздел про открытый риск). Честно показывает,
// что реально знает Provisio: сохранён ли код доступа и приходили ли уже события.
'use strict';

const { getSupabaseAsUser } = require('../_lib/supabaseAdmin');

module.exports = async (req, res) => {
    if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }

    const authHeader = req.headers.authorization || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const provider = req.query.provider;
    if (!accessToken || !provider) { res.status(400).json({ error: 'missing_fields' }); return; }

    try {
        const supabase = getSupabaseAsUser(accessToken);
        const { data: app, error } = await supabase
            .from('applications')
            .select('status, updated_at')
            .eq('provider', provider)
            .maybeSingle();
        if (error) throw error;
        if (!app || app.status !== 'connected') {
            res.status(200).json({ connected: false, status: app?.status || 'disconnected' });
            return;
        }

        const { data: lastEvent } = await supabase
            .from('integration_events')
            .select('created_at')
            .eq('provider', provider)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        res.status(200).json({ connected: !!lastEvent, status: 'connected', lastEventAt: lastEvent?.created_at || null });
    } catch (err) {
        console.error('[integrations/test] failed:', err.message || err);
        res.status(503).json({ error: 'integrations_backend_not_configured' });
    }
};
