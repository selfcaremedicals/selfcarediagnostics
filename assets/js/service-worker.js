/* file: service-worker.js */
/**
 * Selfcare Diagnostics - Service Worker v22.0.0
 */

const CACHE_VERSION = '22.0.0';
const CACHE_NAME = `selfcare-cache-v${CACHE_VERSION}`;

const ASSETS_TO_CACHE = [
  './',
  './index.html',
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
  './home-collection.html',
  './membership.html',
  './blood.html',
  './manifest.json',
  './assets/css/global.css',
  './assets/css/components.css',
  './assets/css/responsive.css',
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
  './assets/css/home-collection.css',
  './assets/css/membership.css',
  './assets/css/blood.css',
  './assets/js/config.js',
  './assets/js/api.js',
  './assets/js/utils.js',
  './assets/js/auth.js',
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
  './assets/js/home-collection.js',
  './assets/js/membership.js',
  './assets/js/blood.js',
  './assets/images/logo.png',
  './assets/images/icon-192.png',
  './assets/images/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachePromises = ASSETS_TO_CACHE.map(async (url) => {
        try {
          const response = await fetch(`${url}?sw_bust=${CACHE_VERSION}`, { cache: 'no-cache' });
          if (response.ok) await cache.put(url, response);
        } catch (err) {}
      });
      await Promise.all(cachePromises);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data.action === 'skipWaiting')) {
    self.skipWaiting();
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action || '';
  let targetUrl = data.url || './bookings.html';

  if (action === 'accept' && data.bookingId) {
    targetUrl = `./home-collection.html?hc_action=accept&bookingId=${encodeURIComponent(data.bookingId)}`;
  } else if (action === 'decline' && data.bookingId) {
    targetUrl = `./home-collection.html?hc_action=decline&bookingId=${encodeURIComponent(data.bookingId)}`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (action && data.bookingId) {
          client.postMessage({ type: 'CAPTAIN_POPUP_ACTION', action, bookingId: data.bookingId });
        }
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    }).then(async () => {
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATED', version: `v${CACHE_VERSION}` });
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  if (
    url.origin !== location.origin ||
    url.pathname.includes('/exec') ||
    url.pathname.includes('/api/') ||
    url.search.includes('action=') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com') ||
    url.hostname.includes('razorpay.com') ||
    url.hostname.includes('wa.me') ||
    url.hostname.includes('whatsapp.com') ||
    url.hostname.includes('qrserver.com') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.protocol.startsWith('chrome-extension')
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
      fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  if (
    url.pathname.endsWith('/technician.js') ||
    url.pathname.endsWith('/technician.css') ||
    url.pathname.endsWith('/home-collection.js') ||
    url.pathname.endsWith('/home-collection.css') ||
    url.pathname.endsWith('/bookings.js') ||
    url.pathname.endsWith('/customer.js') ||
    url.pathname.endsWith('/api.js') ||
    url.pathname.endsWith('/admin.js')
  ) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

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
          const cleanPath = url.pathname.split('/').pop() || 'customer.html';
          const matchedShell = await caches.match(`./${cleanPath}`, { ignoreSearch: true });
          if (matchedShell) return matchedShell;
          return (await caches.match('./customer.html')) || (await caches.match('./index.html'));
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
