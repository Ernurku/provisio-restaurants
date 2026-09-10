// Supabase Initialization
// SUPABASE_URL / SUPABASE_ANON_KEY are defined in js/supabase-config.js,
// which is gitignored — copy js/supabase-config.example.js to create it locally.

// The local supabase.js UMD bundle sets window.supabase to the library namespace { createClient, ... }.
// We replace it here with the actual client instance that has .auth, .from(), etc.
try {
    var _lib = window.supabase;
    if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined') {
        console.error('[Provisio] Missing Supabase config. Copy js/supabase-config.example.js to js/supabase-config.js and fill in your project values.');
    } else if (_lib && typeof _lib.createClient === 'function') {
        window.supabase = _lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.error('[Provisio] Supabase library not found or missing createClient. Check that js/supabase.js loaded correctly.');
    }
} catch (e) {
    console.error('[Provisio] Supabase client initialization failed:', e);
}
