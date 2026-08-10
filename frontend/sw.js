const CACHE_NAME = 'acadhub-v2';
const urlsToCache = [
  '/AcadHub/',
  '/AcadHub/index.html',
  '/AcadHub/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
