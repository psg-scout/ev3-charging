// EV3 Charging service worker: offline app shell + cached Leaflet + small map-tile cache.
const VERSION = 'ev3-v3';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'data.js', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'calendar/ev3-monday-charge.ics'];
const LIBS = ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
const TILE_CACHE = 'ev3-tiles-v3', TILE_MAX = 400;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(SHELL);
    await Promise.all(LIBS.map(u => fetch(u, { mode: 'cors' }).then(r => r.ok && c.put(u, r)).catch(() => {})));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== TILE_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function trimTiles() { const c = await caches.open(TILE_CACHE), ks = await c.keys(); for (let i = 0; i < ks.length - TILE_MAX; i++) await c.delete(ks[i]); }
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'tile.openstreetmap.org') { // network first, fall back to cache when offline
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cl = r.clone(); caches.open(TILE_CACHE).then(c => c.put(req, cl)).then(trimTiles); } return r; })
      .catch(() => caches.match(req).then(r => r || Response.error())));
    return;
  }
  if (url.origin === location.origin || url.hostname === 'unpkg.com') { // stale-while-revalidate
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req, { ignoreSearch: url.origin === location.origin });
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit || (req.mode === 'navigate' ? c.match('index.html') : Response.error()));
      return hit || net;
    }));
  }
});
