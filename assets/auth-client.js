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
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ACTIVE_CHARACTER_KEY = "goblinwar_activeCharacterId";

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

  const { data: row, error } = await sb.from('characters').select('id').eq('id', activeId).maybeSingle();
  if(error || !row){
    // Deleted (from another device, say) since this browser last picked it.
    localStorage.removeItem(ACTIVE_CHARACTER_KEY);
    redirectToCharacters();
    return null;
  }
  return session;
});

sb.auth.onAuthStateChange((event, session)=>{
  if(event === 'SIGNED_OUT'){
    localStorage.removeItem(ACTIVE_CHARACTER_KEY);
    if(!location.pathname.endsWith('login.html')) redirectToLogin();
  }
});
