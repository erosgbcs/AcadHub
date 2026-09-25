const CACHE_NAME = 'acadhub-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js'
];

// Hosts that must NEVER be cached (dynamic / auth / realtime)
const NEVER_CACHE_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebaseappcheck.googleapis.com'
];

// ------------------------------------------------------------------
// Install — precache the app shell + libraries
// ------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use individual puts so one bad URL doesn't kill the whole install
      return Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Precache miss:', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ------------------------------------------------------------------
// Activate — drop old caches
// ------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// ------------------------------------------------------------------
// Fetch
// ------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET — never intercept POST/PUT/DELETE (Firebase + API writes)
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip non-http(s) (chrome-extension, blob, etc.)
  if (!url.protocol.startsWith('http')) return;

  // Skip Firebase auth / firestore / realtime hosts
  if (NEVER_CACHE_HOSTS.some((h) => url.hostname.endsWith(h))) return;

  // --- API ---
  // Only cache idempotent GETs (e.g. /api/health). Everything else goes straight to network.
  if (url.pathname.includes('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // --- Navigation requests (HTML) ---
  // Network-first so users get fresh index.html when online.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithFallback(request, './index.html'));
    return;
  }

  // --- Static assets (CSS, JS, fonts, icons) ---
  // Cache-first, revalidate in background.
  event.respondWith(cacheFirst(request));
});

// ------------------------------------------------------------------
// Strategies
// ------------------------------------------------------------------

// Cache-first + background revalidate
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      // Only cache successful, basic/cors responses
      if (response && response.ok) {
        const clone = response.clone();
        cache.put(request, clone).catch(() => {});
      }
      return response;
    })
    .catch(() => cached); // offline → serve cached if we have it

  return cached || fetchPromise;
}

// Network-first, fallback to cache
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

// Network-first with an HTML fallback (for SPA routing / offline)
async function networkFirstWithFallback(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await cache.match(fallbackUrl);
    if (fallback) return fallback;
    // Last resort
    return new Response(
      '<h1>Offline</h1><p>AcadHub is offline and this page isn\'t cached yet.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

// ------------------------------------------------------------------
// Optional: allow the page to trigger an immediate SW update
// ------------------------------------------------------------------
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});