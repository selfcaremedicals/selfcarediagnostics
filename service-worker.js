/* file: service-worker.js */
/**
 * Selfcare Diagnostics - Service Worker v7.0.0 (Zero-Glitch Edition)
 * Features:
 * - Relative Path Precache Engine (100% GitHub Pages & Custom Domain Compatible)
 * - Versioned Cache Invalidation (v7.0.0 Clean Slate Purge)
 * - True Offline Fallback for Single-Page & HTML Navigation
 * - Network-First for HTML Documents & Versioned Assets (?v=...)
 * - Stale-While-Revalidate for Static Images & Stylesheets
 * - Instant Client Claim & Zero-Lag Activation
 */

const CACHE_NAME = 'selfcare-cache-v7.0.0';

// Relative paths guaranteed to resolve across GitHub Pages sub-directories and custom roots
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
  './assets/images/logo.png',
  './assets/images/icon-192.png',
  './assets/images/icon-512.png'
];

self.addEventListener('install', (event) => {
  console.log('[Selfcare SW] Installing version 7.0.0...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Individual resilient fetch prevents any single missing asset from failing installation
      const cachePromises = ASSETS_TO_CACHE.map(async (url) => {
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
          }
        } catch (err) {
          console.warn('[Selfcare SW] Precache deferred for:', url);
        }
      });
      await Promise.all(cachePromises);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[Selfcare SW] Activating version 7.0.0...');
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
      console.log('[Selfcare SW] Claimed clients for v7.0.0');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Cross-origin மற்றும் non-GET requests bypass
  if (url.origin !== location.origin || event.request.method !== 'GET') {
    return;
  }

  // 2. Google Apps Script Web App API calls dynamic-ஆக செல்ல வேண்டும்
  if (url.pathname.includes('/exec') || url.pathname.includes('/api/')) {
    return;
  }

  // 3. Localhost Development bypass
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

  // 4. HTML Documents - Network-First Strategy with Multi-tier Offline Fallback
  if (event.request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
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
          // Exact route match
          const cachedDirect = await caches.match(event.request, { ignoreSearch: true });
          if (cachedDirect) return cachedDirect;

          // Relative route fallback chain
          const indexFallback = await caches.match('./index.html');
          if (indexFallback) return indexFallback;

          const customerFallback = await caches.match('./customer.html');
          if (customerFallback) return customerFallback;

          return caches.match('./login.html');
        })
    );
    return;
  }

  // 5. Versioned Assets (?v=...) - Network-First Strategy
  const hasVersionQuery = url.searchParams.has('v');

  if (hasVersionQuery) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request, { ignoreSearch: true });
        })
    );
    return;
  }

  // 6. Stale-While-Revalidate for Other Static Assets (Images, Icons, Fonts)
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
