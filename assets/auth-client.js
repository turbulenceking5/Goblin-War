// The authoritative half of the login/character gate (see assets/auth-gate-sync.js for the
// synchronous first pass, and context/accounts.md + context/characters.md for the full
// picture). Loaded near the bottom of every player page, right after the Supabase JS CDN
// script and assets/supabase-config.js. Creates the one shared client (`sb`) every page's
// own script uses for auth/character calls, confirms the session is actually still valid
// (not just present) and that an active character is actually still real (not just an id
// sitting in localStorage — it could have been deleted from another device), and redirects
// if either check fails. Also redirects immediately if the player logs out in another tab,
// so a stale tab can't keep playing after logout.
// Shared rather than duplicated per page for the same reason as auth-gate-sync.js: this is
// security-relevant control flow, not game logic.
// `global.fetch` adds `keepalive:true` to every request this client makes. Per the project
// owner, screen-to-screen navigation was feeling slow — the actual cause (see index.html's
// goTo()) was that leaving a page waits for an autosave PATCH to Supabase to fully complete
// before starting the next page's navigation at all, specifically so the write can't get
// aborted by the browser unloading this document mid-request. `keepalive` is the fetch spec's
// purpose-built fix for exactly that: the request survives the page unload on its own (same
// mechanism navigator.sendBeacon uses), so goTo() no longer needs to block navigation on it —
// same reliability, without the wait. The one caveat: Chromium caps a single keepalive
// request's body around 64KB; a character save's JSON snapshot is comfortably under that today
// (every unbounded-sounding list — quest history, etc. — is already capped small, see
// characters.md), but worth re-checking if a much larger persisted field is ever added.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: (url, options = {}) => fetch(url, { ...options, keepalive: true }) },
});
const ACTIVE_CHARACTER_KEY = "goblinwar_activeCharacterId";
// Skips re-verifying the active character still exists server-side if it was already confirmed
// within the last CHAR_VERIFY_TTL_MS, in this same tab — the single biggest per-navigation
// network cost otherwise, and this check is inherently non-realtime already (it only ever runs
// on a page load, never pushed), so a short cache window doesn't meaningfully weaken it.
// sessionStorage, not localStorage: a brand-new tab (or one reopened after actually closing)
// always re-verifies immediately, only rapid same-tab navigation skips the redundant round trip.
const CHAR_VERIFY_CACHE_KEY = "goblinwar_charVerifiedAt";
const CHAR_VERIFY_TTL_MS = 60000;

function redirectToLogin(){
  const redirect = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
  // Cache-bust login.html itself too — see the matching comment in login.html's
  // targetPage(), same reasoning.
  location.replace(`login.html?redirect=${redirect}&_=${Date.now()}`);
}

function redirectToCharacters(){
  const redirect = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
  location.replace(`characters.html?redirect=${redirect}&_=${Date.now()}`);
}

// Resolves to the session once both checks pass, or null (a redirect is already underway).
// characters.html is exempt from the "active character" half of this — it's where one gets
// picked — but still needs a valid session, same as every other gated page.
const authGateReady = sb.auth.getSession().then(async ({ data: { session } })=>{
  if(!session){ redirectToLogin(); return null; }
  const onCharactersPage = location.pathname.split('/').pop() === 'characters.html';
  if(onCharactersPage) return session;

  const activeId = localStorage.getItem(ACTIVE_CHARACTER_KEY);
  if(!activeId){ redirectToCharacters(); return null; }

  const cached = sessionStorage.getItem(CHAR_VERIFY_CACHE_KEY);
  if(cached){
    const [cachedId, cachedAt] = cached.split('|');
    if(cachedId === activeId && Date.now() - Number(cachedAt) < CHAR_VERIFY_TTL_MS) return session;
  }

  const { data: row, error } = await sb.from('characters').select('id').eq('id', activeId).maybeSingle();
  if(error || !row){
    // Deleted (from another device, say) since this browser last picked it.
    localStorage.removeItem(ACTIVE_CHARACTER_KEY);
    redirectToCharacters();
    return null;
  }
  sessionStorage.setItem(CHAR_VERIFY_CACHE_KEY, `${activeId}|${Date.now()}`);
  return session;
});

sb.auth.onAuthStateChange((event, session)=>{
  if(event === 'SIGNED_OUT'){
    localStorage.removeItem(ACTIVE_CHARACTER_KEY);
    sessionStorage.removeItem(CHAR_VERIFY_CACHE_KEY);
    if(!location.pathname.endsWith('login.html')) redirectToLogin();
  }
});
