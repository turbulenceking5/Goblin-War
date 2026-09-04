// Every player page requires a logged-in account (see context/accounts.md). This script is
// the FIRST thing loaded in <head>, synchronously, before any CSS/body content — it's a
// best-effort check with no network call (just: does a Supabase session token exist in this
// browser's localStorage at all?), so an obviously-logged-out visitor is bounced to
// login.html before a single frame of gameplay UI ever paints. It can't tell whether a
// present token has actually expired — that authoritative check happens later, async, in
// assets/auth-client.js, and redirects too if it turns out the token was stale. Requires
// assets/supabase-config.js to be loaded immediately before this script.
// Deliberately a shared file rather than copy-pasted per page (breaking the project's usual
// no-modules convention) — this is a security gate, not game logic, and having one page's
// copy drift from another's would be a login bypass, not just a display bug.
(function(){
  if(/(^|\/)login\.html$/.test(location.pathname)) return; // never gate the login page itself
  let ref = null;
  try { ref = new URL(SUPABASE_URL).hostname.split('.')[0]; } catch(e){}
  const hasToken = ref && !!localStorage.getItem(`sb-${ref}-auth-token`);
  if(!hasToken){
    const redirect = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
    // Cache-bust login.html itself too — see the matching comment in login.html's
    // targetPage(), same reasoning.
    location.replace(`login.html?redirect=${redirect}&_=${Date.now()}`);
  }
})();
