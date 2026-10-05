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
// Offline/mock Supabase stand-in for local testing — see context/accounts.md's "Mock mode"
// section and the matching comment in assets/auth-gate-sync.js. Mirrors just the slice of the
// real supabase-js API this game actually calls (auth.getSession/onAuthStateChange/signOut/
// signInWithPassword/signUp, and a chainable from(table).select/insert/update/delete/eq/order/
// single/maybeSingle) backed by plain localStorage tables instead of a network call. Every other
// file's sb.* call site (characters.html, settings.html, index.html's graves calls, login.html)
// runs completely unchanged against it — it never knows it isn't talking to real Supabase, which
// is what lets this stay a two-file change instead of touching every gated page.
function createMockSupabaseClient(){
  const MOCK_USER_ID_KEY = 'goblinwar_mockUserId';
  let mockUserId = localStorage.getItem(MOCK_USER_ID_KEY);
  if(!mockUserId){
    mockUserId = 'mock-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(MOCK_USER_ID_KEY, mockUserId);
  }
  const mockSession = { user: { id: mockUserId, email: 'mock@local.test' } };
  const authListeners = [];

  function genId(){ return 'mock-' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function readTable(name){
    try{ return JSON.parse(localStorage.getItem('goblinwar_mockdb_' + name)) || []; }catch(e){ return []; }
  }
  function writeTable(name, rows){ localStorage.setItem('goblinwar_mockdb_' + name, JSON.stringify(rows)); }

  function makeQuery(table){
    const state = { mode: 'select', payload: null, filters: [], order: null, singleMode: false, maybeSingleMode: false };
    function matches(row){ return state.filters.every(([col, val]) => row[col] === val); }
    async function execute(){
      const rows = readTable(table);
      const now = new Date().toISOString();
      if(state.mode === 'insert'){
        const row = Object.assign({ id: genId(), created_at: now, updated_at: now }, state.payload);
        rows.push(row);
        writeTable(table, rows);
        return { data: state.singleMode ? row : [row], error: null };
      }
      if(state.mode === 'update'){
        let updated = null;
        const next = rows.map(row => {
          if(matches(row)){ updated = Object.assign({}, row, state.payload); return updated; }
          return row;
        });
        writeTable(table, next);
        return { data: state.singleMode ? updated : (updated ? [updated] : []), error: null };
      }
      if(state.mode === 'delete'){
        writeTable(table, rows.filter(row => !matches(row)));
        return { data: null, error: null };
      }
      // select
      let matched = rows.filter(matches);
      if(state.order){
        const { col, ascending } = state.order;
        matched = matched.slice().sort((a, b) => ascending ? (a[col] > b[col] ? 1 : -1) : (a[col] < b[col] ? 1 : -1));
      }
      if(state.maybeSingleMode || state.singleMode) return { data: matched[0] || null, error: null };
      return { data: matched, error: null };
    }
    return {
      select(){ if(state.mode !== 'insert' && state.mode !== 'update') state.mode = 'select'; return this; },
      insert(payload){ state.mode = 'insert'; state.payload = payload; return this; },
      update(payload){ state.mode = 'update'; state.payload = payload; return this; },
      delete(){ state.mode = 'delete'; return this; },
      eq(col, val){ state.filters.push([col, val]); return this; },
      order(col, opts){ state.order = { col, ascending: !opts || opts.ascending !== false }; return this; },
      single(){ state.singleMode = true; return this; },
      maybeSingle(){ state.maybeSingleMode = true; return this; },
      then(onFulfilled, onRejected){ return execute().then(onFulfilled, onRejected); },
    };
  }

  return {
    auth: {
      getSession(){ return Promise.resolve({ data: { session: mockSession } }); },
      onAuthStateChange(cb){
        authListeners.push(cb);
        return { data: { subscription: { unsubscribe(){ const i = authListeners.indexOf(cb); if(i >= 0) authListeners.splice(i, 1); } } } };
      },
      // Logging out of a mock session has nowhere real to sign out of — it just fires the same
      // SIGNED_OUT event the real client would, so the listener below (unchanged) still clears
      // the active character and redirects to login.html exactly like a real logout would.
      signOut(){ authListeners.forEach(cb => cb('SIGNED_OUT', null)); return Promise.resolve({ error: null }); },
      signInWithPassword(){ return Promise.resolve({ error: null }); },
      signUp(){ return Promise.resolve({ data: { session: mockSession }, error: null }); },
    },
    from(table){ return makeQuery(table); },
  };
}

const MOCK_MODE = localStorage.getItem('goblinwar_mockMode') === '1';
const sb = MOCK_MODE ? createMockSupabaseClient() : supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
