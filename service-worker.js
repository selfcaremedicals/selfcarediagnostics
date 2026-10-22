/* file: service-worker.js */
/**
 * Selfcare Diagnostics - Service Worker v10.4.0 (VIP Live Expiry & Cloud Sync Edition)
 * Features:
 * - Upgraded Cache Version to v10.4.0 (Instantly purges stale membership.js & css cache)
 * - Automatic cache purge on activation & immediate client takeover (clients.claim())
 * - Fast precache with cache-busting timestamp to prevent browser HTTP disk caching
 * - Instant broadcast to all open tabs/PWA windows on update
 * - Strict network bypass for Google Apps Script & Central API calls
 * - Stale-While-Revalidate (SWR) for lightning-fast JS/CSS execution
 * - Network-First for HTML pages with seamless offline fallback
 */

const CACHE_NAME = 'selfcare-cache-v10.4.0';

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
  './membership.html',
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
  './assets/css/membership.css',
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
  './assets/js/membership.js',
  './assets/images/logo.png',
  './assets/images/icon-192.png',
  './assets/images/icon-512.png'
];

// 1. INSTALL EVENT - Precache Fresh Files & Skip Waiting
self.addEventListener('install', (event) => {
  console.log('[Selfcare SW] Installing Upgraded Engine v10.4.0 (VIP Live Expiry Edition)...');
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachePromises = ASSETS_TO_CACHE.map(async (url) => {
        try {
          // Cache busting query added during fetch to bypass browser disk cache
          const bustUrl = `${url}?sw_bust=10.4.0`;
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
  console.log('[Selfcare SW] Activating v10.4.0 & Purging all stale caches...');
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
      // Notify all open tabs/clients that new version is live
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATED', version: 'v10.4.0' });
      });
    })
  );
});

// 4. FETCH EVENT - Optimized Strategy with Safe Network Bypass
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // A. Bypass Non-GET Requests
  if (event.request.method !== 'GET') {
    return;
  }

  // B. Bypass API Calls & Google Apps Script Execution URLs
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

  // C. Local Development Mode Bypass
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

  // STRATEGY 1: JS & CSS Assets -> Stale-While-Revalidate with Auto-Background Cache Update
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

  // STRATEGY 2: HTML Documents -> Network-First with Offline Fallback
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

  // STRATEGY 3: Images, Media & Fonts -> Cache-First with Revalidation
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
