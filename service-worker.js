/* file: service-worker.js */
/**
 * Selfcare Diagnostics - Service Worker v10.1.2
 * Features:
 * - Upgraded Cache Version to purge stale cart scripts
 * - Network-First for core App Shell (HTML, JS, CSS) with cache fallback
 * - Automatic skipWaiting() and immediate client takeover (clients.claim())
 * - ignoreSearch cache matching for versioned asset URLs (?v=...)
 */

const CACHE_NAME = 'selfcare-cache-v10.1.2';

// Precache list for core application shell
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './customer.html',
  './tests.html',
  './packages.html',
  './cart.html',
  './reports.html',
  './bookings.html',
  './profile.html',
  './admin.html',
  './technician.html',
  './manifest.json',
  './assets/css/global.css',
  './assets/css/components.css',
  './assets/css/responsive.css',
  './assets/css/login.css',
  './assets/css/customer.css',
  './assets/css/tests.css',
  './assets/css/packages.css',
  './assets/css/cart.css',
  './assets/css/reports.css',
  './assets/css/bookings.css',
  './assets/css/profile.css',
  './assets/css/admin.css',
  './assets/css/technician.css',
  './assets/js/config.js',
  './assets/js/api.js',
  './assets/js/utils.js',
  './assets/js/auth.js',
  './assets/js/login.js',
  './assets/js/ai-assistant.js',
  './assets/js/offline-db.js',
  './assets/js/offline-sync.js',
  './assets/js/app.js',
  './assets/js/customer.js',
  './assets/js/tests.js',
  './assets/js/packages.js',
  './assets/js/cart.js',
  './assets/js/reports.js',
  './assets/js/bookings.js',
  './assets/js/profile.js',
  './assets/js/admin.js',
  './assets/js/technician.js',
  './assets/images/logo.png',
  './assets/images/icon-192.png',
  './assets/images/icon-512.png'
];

// 1. INSTALL EVENT - Precache and Auto Skip-Waiting
self.addEventListener('install', (event) => {
  console.log('[Selfcare SW] Installing updated version v10.1.2...');
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachePromises = ASSETS_TO_CACHE.map(async (url) => {
        try {
          const response = await fetch(url, { cache: 'no-cache' });
          if (response.ok) {
            await cache.put(url, response);
          }
        } catch (err) {
          console.warn('[Selfcare SW] Precache deferred for:', url);
        }
      });
      await Promise.all(cachePromises);
    })
  );
});

// 2. MESSAGE EVENT - Listens to SKIP_WAITING from app.js
self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data.action === 'skipWaiting')) {
    console.log('[Selfcare SW] SKIP_WAITING signal received, activating immediately...');
    self.skipWaiting();
  }
});

// 3. ACTIVATE EVENT - Purges obsolete caches and claims all open clients
self.addEventListener('activate', (event) => {
  console.log('[Selfcare SW] Activating version v10.1.2 and purging old caches...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Selfcare SW] Deleting obsolete cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Selfcare SW] Claiming clients for v10.1.2...');
      return self.clients.claim();
    })
  );
});

// 4. FETCH EVENT - Network-First for HTML/Scripts/CSS, Cache fallback for offline
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass non-GET and cross-origin requests
  if (url.origin !== location.origin || event.request.method !== 'GET') {
    return;
  }

  // Bypass backend Google Apps Script / API calls
  if (url.pathname.includes('/exec') || url.pathname.includes('/api/')) {
    return;
  }

  // Local development bypass
  const isLocalDev = Boolean(
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.port !== '' ||
    url.protocol === 'file:'
  );

  if (isLocalDev) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  // Core App Shell & Scripts: Always try fresh network fetch first
  if (
    event.request.destination === 'document' ||
    event.request.destination === 'script' ||
    event.request.destination === 'style' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/')
  ) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedDirect = await caches.match(event.request, { ignoreSearch: true });
          if (cachedDirect) return cachedDirect;

          if (event.request.destination === 'document' || url.pathname.endsWith('.html')) {
            const customerFallback = await caches.match('./customer.html');
            if (customerFallback) return customerFallback;

            const indexFallback = await caches.match('./index.html');
            if (indexFallback) return indexFallback;

            return caches.match('./login.html');
          }
          return undefined;
        })
    );
    return;
  }

  // Versioned assets (?v=...)
  const hasVersionQuery = url.searchParams.has('v');
  if (hasVersionQuery) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  // Static Assets (Images, Icons, Fonts) - Cache First with Network Revalidation
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
