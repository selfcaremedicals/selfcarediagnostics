/* file: service-worker.js */
/**
 * Selfcare Diagnostics - Service Worker v16.0.0 (Refer & Earn Engine Edition)
 * Upgrades:
 * - Upgraded Cache Storage to v16.0.0 (Automatically purges old v15.x caches)
 * - Added refer.html, refer.css, and refer.js to ASSETS_TO_CACHE for complete PWA offline support
 * - Fast precache with cache-busting query (?sw_bust=16.0.0)
 * - Broadcasts SW_UPDATED to refresh all active client tabs seamlessly
 * - Strict network bypass for Google Apps Script (/exec) and backend API requests
 * - Stale-While-Revalidate (SWR) for high-performance JS/CSS assets
 * - Network-First for HTML documents with offline fallbacks
 */

const CACHE_NAME = 'selfcare-cache-v16.0.0';

// Precache list for core application shell
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './customer.html',
  './tests.html',
  './packages.html',
  './cart.html',
  './refer.html',
  './reports.html',
  './bookings.html',
  './profile.html',
  './admin.html',
  './technician.html',
  './membership.html',
  './blood.html',
  './manifest.json',
  './assets/css/global.css',
  './assets/css/components.css',
  './assets/css/responsive.css',
  './assets/css/login.css',
  './assets/css/customer.css',
  './assets/css/tests.css',
  './assets/css/packages.css',
  './assets/css/cart.css',
  './assets/css/refer.css',
  './assets/css/reports.css',
  './assets/css/bookings.css',
  './assets/css/profile.css',
  './assets/css/admin.css',
  './assets/css/technician.css',
  './assets/css/membership.css',
  './assets/css/blood.css',
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
  './assets/js/refer.js',
  './assets/js/reports.js',
  './assets/js/bookings.js',
  './assets/js/profile.js',
  './assets/js/admin.js',
  './assets/js/technician.js',
  './assets/js/membership.js',
  './assets/js/blood.js',
  './assets/images/logo.png',
  './assets/images/icon-192.png',
  './assets/images/icon-512.png'
];

// 1. INSTALL EVENT - Precache Fresh Files & Skip Waiting Immediately
self.addEventListener('install', (event) => {
  console.log('[Selfcare SW] Installing Upgraded Engine v16.0.0 (Refer & Earn Integrated)...');
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachePromises = ASSETS_TO_CACHE.map(async (url) => {
        try {
          const bustUrl = `${url}?sw_bust=16.0.0`;
          const response = await fetch(bustUrl, { cache: 'no-cache' });
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

// 2. MESSAGE EVENT - Direct Activation & Refresh Listener
self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data.action === 'skipWaiting')) {
    console.log('[Selfcare SW] SKIP_WAITING signal received...');
    self.skipWaiting();
  }
});

// 3. ACTIVATE EVENT - Purge All Older Caches & Claim Clients Immediately
self.addEventListener('activate', (event) => {
  console.log('[Selfcare SW] Activating v16.0.0 & Purging all stale caches...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Selfcare SW] Purging old cache storage:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(async () => {
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATED', version: 'v16.0.0' });
      });
    })
  );
});

// 4. FETCH EVENT - Optimized Strategy with Safe Network Bypass
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') {
    return;
  }

  // Network bypass for backend API and Google Apps Script requests
  if (
    url.origin !== location.origin ||
    url.pathname.includes('/exec') ||
    url.pathname.includes('/api/') ||
    url.search.includes('action=') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com')
  ) {
    return;
  }

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

  // Stale-While-Revalidate for Scripts & Styles
  if (
    event.request.destination === 'script' ||
    event.request.destination === 'style' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
        const fetchPromise = fetch(event.request, { cache: 'no-cache' })
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Network-First for HTML documents with offline fallbacks
  if (
    event.request.destination === 'document' ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/')
  ) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedDirect = await caches.match(event.request, { ignoreSearch: true });
          if (cachedDirect) return cachedDirect;

          const customerFallback = await caches.match('./customer.html');
          if (customerFallback) return customerFallback;

          const indexFallback = await caches.match('./index.html');
          if (indexFallback) return indexFallback;

          return caches.match('./login.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
