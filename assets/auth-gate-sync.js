// Every player page requires a logged-in account AND an active character (see
// context/accounts.md and context/characters.md). This script is the FIRST thing loaded in
// <head>, synchronously, before any CSS/body content — it's a best-effort check with no
// network call, so an obviously-logged-out (or character-less) visitor is bounced before a
// single frame of gameplay UI ever paints:
//   1. Does a Supabase session token exist in localStorage at all? If not -> login.html.
//   2. Is a character actually selected (goblinwar_activeCharacterId set)? If not ->
//      characters.html. This key is written by characters.html's Play/Create actions and
//      cleared on log out (see assets/auth-client.js) — its exact name has to match both.
// Neither check can tell if what it found is actually still valid (an expired token, or a
// character id that's since been deleted from another device) — that authoritative check
// happens later, async, in assets/auth-client.js, and redirects too if so. Requires
// assets/supabase-config.js to be loaded immediately before this script.
// Deliberately a shared file rather than copy-pasted per page (breaking the project's usual
// no-modules convention) — this is a security gate, not game logic, and having one page's
// copy drift from another's would be a login bypass, not just a display bug.
(function(){
  const path = location.pathname.split('/').pop() || 'index.html';

  // Offline/mock mode for local testing without a real Supabase account or network access — see
  // context/accounts.md's "Mock mode" section. Opt-in only: visiting any page once with ?mock=1
  // flips a localStorage flag that persists across normal navigation (so the param doesn't need
  // to ride along on every link); ?mock=0 clears it again. A real player has no reason to ever
  // add this param, so it never weakens the real gate below for them — it only substitutes a
  // fake, entirely local session + character store (assets/auth-client.js) for someone who
  // deliberately opted in.
  const mockParam = new URLSearchParams(location.search).get('mock');
  if(mockParam === '1') localStorage.setItem('goblinwar_mockMode', '1');
  else if(mockParam === '0') localStorage.removeItem('goblinwar_mockMode');
  const mockMode = localStorage.getItem('goblinwar_mockMode') === '1';

  if(path === 'login.html' || path === 'characters.html') return; // these manage their own gating

  if(mockMode){
    // No real token to check — assets/auth-client.js substitutes a fake, always-valid session.
    // Still enforce the real "pick a character" requirement, same as the real gate below, so a
    // mock session can't skip straight into gameplay with nothing selected.
    if(!localStorage.getItem('goblinwar_activeCharacterId')){
      location.replace(`characters.html?redirect=${encodeURIComponent(path)}&_=${Date.now()}`);
    }
    return;
  }

  let ref = null;
  try { ref = new URL(SUPABASE_URL).hostname.split('.')[0]; } catch(e){}
  const hasToken = ref && !!localStorage.getItem(`sb-${ref}-auth-token`);
  // Cache-busted too — see the matching comment in login.html's targetPage(), same reasoning.
  if(!hasToken){
    location.replace(`login.html?redirect=${encodeURIComponent(path)}&_=${Date.now()}`);
    return;
  }
  if(!localStorage.getItem('goblinwar_activeCharacterId')){
    location.replace(`characters.html?redirect=${encodeURIComponent(path)}&_=${Date.now()}`);
  }
})();
