// Keeps the booth working after a reload with no internet: pages, fonts and event images are saved on the device.
const V = 'tb-v7', SHELL = ['/booth/', '/booth/index.html', '/booth/booth.js', '/booth/booth.css', '/css/app.css', '/js/common.js', '/js/qr.js', '/js/queue.js', '/img/pencil.png', '/img/pbme-icon.svg', '/v/index.html', '/station/', '/station/index.html', '/station/station.js', '/station/station.css', '/js/help.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
const timeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('slow')), ms))]);
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname.includes('fonts.g')) {   // fonts: saved once, used forever
    e.respondWith(caches.open(V).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { c.put(req, r.clone()); return r; })));
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/files/')) {   // logo, frame, background, samples: show the saved copy, refresh in the background
    e.respondWith(caches.open(V).then(async (c) => { const hit = await c.match(req, { ignoreSearch: true }); const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit); return hit || net; }));
    return;
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;   // live data always goes to the server
  // pages and code: newest version when online, saved copy when not
  e.respondWith(caches.open(V).then(async (c) => {
    try { const r = await timeout(fetch(req), 5000); if (r.ok) c.put(req, r.clone()); return r; }
    catch { return (await c.match(req, { ignoreSearch: true })) || (url.pathname.startsWith('/booth') ? c.match('/booth/index.html') : Response.error()); }
  }));
});
