// The authoritative half of the login gate (see assets/auth-gate-sync.js for the
// synchronous first pass, and context/accounts.md for the full picture). Loaded near the
// bottom of every player page, right after the Supabase JS CDN script and
// assets/supabase-config.js. Creates the one shared client (`sb`) every page's own script
// uses for auth/cloud-save calls, confirms the session is actually still valid (not just
// present), and redirects to login.html if not — covering the case an expired/revoked token
// slipped past the sync check. Also redirects immediately if the player logs out in another
// tab, so a stale tab can't keep playing after logout.
// Shared rather than duplicated per page for the same reason as auth-gate-sync.js: this is
// security-relevant control flow, not game logic.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function redirectToLogin(){
  const redirect = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
  location.replace(`login.html?redirect=${redirect}`);
}

const authGateReady = sb.auth.getSession().then(({ data: { session } })=>{
  if(!session){ redirectToLogin(); return null; }
  return session;
});

sb.auth.onAuthStateChange((event, session)=>{
  if(event === 'SIGNED_OUT' && !location.pathname.endsWith('login.html')) redirectToLogin();
});
