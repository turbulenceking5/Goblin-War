// Goblin War service worker — offline asset caching for the installed PWA (see manifest.json's
// "Add to Home Screen"). Per context/roadmap.md's "A service worker for offline asset caching":
// the game already ships a Web App Manifest; this is the missing half that actually makes the
// installed app usable with a flaky connection.
//
// Deliberately network-first, not cache-first and not a precached app-shell with a hand-maintained
// file list. This repo already fought hard to keep navigation/data fresh against GitHub Pages'
// own CDN caching (see CLAUDE.md's "every internal navigation cache-busts with ?_=Date.now()"
// convention, added after a real bug where a stale cached page kept showing an old inline Change
// Log) — a cache-first service worker would reintroduce exactly that class of bug at a worse,
// harder-to-debug layer. So online behavior is unchanged: every request still goes to the network
// first, and the cache is purely a fallback for when that network request fails outright (no
// connection, or a flaky one that drops it). The cache itself is built up opportunistically from
// whatever a player has actually loaded while playing — every settlement's real portrait art,
// whichever pages they've visited — rather than a precache list that would need updating by hand
// every time new art ships under assets/.
//
// CACHE_NAME is bumped alongside version.json's changelogId (see CLAUDE.md's "Shipping a change?"
// convention) so an update that changes cached page content also starts a clean cache rather than
// serving a mix of old and new same-named responses.
const CACHE_NAME = 'goblinwar-v175';

self.addEventListener('install', (event) => {
  // Takes over immediately rather than waiting for every open tab to close — the fallback-only
  // caching strategy above means a slightly-earlier takeover carries no staleness risk the way it
  // would for a cache-first worker.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only same-origin GETs. Never intercept a cross-origin request — Supabase's own API calls are
  // a different origin entirely (see assets/supabase-config.js), and this worker has no business
  // anywhere near auth/save traffic. Never intercept a non-GET either — caching a POST/PATCH
  // response (or replaying one from cache) would be actively dangerous, not just stale.
  if(req.method !== 'GET') return;
  let url;
  try{ url = new URL(req.url); }catch(e){ return; }
  if(url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then(res => {
      // Only cache a real, successful response — never cache a 404/500 as if it were the real
      // asset.
      if(res && res.ok){
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(req, copy)));
      }
      return res;
    }).catch(() =>
      caches.match(req).then(cached => cached || Response.error())
    )
  );
});
