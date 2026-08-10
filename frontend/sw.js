self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('acadhub-v1').then((cache) => {
      return cache.addAll([
        '/AcadHub/',
        '/AcadHub/index.html',
        '/AcadHub/manifest.json'
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
