// Supabase Initialization
var SUPABASE_URL = 'https://nihdpvvwafnmnttsuzcd.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5paGRwdnZ3YWZubW50dHN1emNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MTUxMzcsImV4cCI6MjA5MTQ5MTEzN30.RJlVN-XMFRbO8GqZxajKf20b1QqrHDbepGjxBU2Oz6U';

// The local supabase.js UMD bundle sets window.supabase to the library namespace { createClient, ... }.
// We replace it here with the actual client instance that has .auth, .from(), etc.
try {
    var _lib = window.supabase;
    if (_lib && typeof _lib.createClient === 'function') {
        window.supabase = _lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.error('[Provisio] Supabase library not found or missing createClient. Check that js/supabase.js loaded correctly.');
    }
} catch (e) {
    console.error('[Provisio] Supabase client initialization failed:', e);
}
