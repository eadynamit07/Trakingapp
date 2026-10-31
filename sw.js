// All shell URLs are relative to the registration scope (including GitHub Pages).
const CACHE_NAME = 'kcal-tracker-v6';
const SCOPE = self.registration.scope;
const ASSETS = ['./', 'index.html', 'style.css', 'android.css', 'storage.js',
  'text-parser.js', 'ai-photo.js', 'scanner.js', 'app.js', 'android.js',
  'manifest.json', 'icon-192.png', 'icon-512.png'];
const SHELL = new Set(ASSETS.map(path => new URL(path, SCOPE).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([...SHELL])));
  // Keep the running version coherent; the new worker activates after closing the app.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => /^kcal-tracker-v/.test(key) && key !== CACHE_NAME)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Never cache API responses, keys or unrelated resources.
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;
  if (!SHELL.has(url.href) && event.request.mode !== 'navigate') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request);
      if (response.ok && SHELL.has(url.href)) await cache.put(event.request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') return (await cache.match(new URL('index.html', SCOPE).href)) || Response.error();
      return Response.error();
    }
  })());
});
