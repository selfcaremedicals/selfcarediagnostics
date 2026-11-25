/* file: service-worker.js */
/**
 * Selfcare Diagnostics - Service Worker v23.0.0
 * Features:
 * - Background 10 km Radius Home Collection Order Polling & Heads-Up Screen Alerts
 * - Direct Accept (opens app) & Silent Permanent Decline (stays outside app)
 * - Smart Network-First Caching for Dynamic Captain & Booking Modules
 */

const CACHE_VERSION = '23.0.0';
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
  './upi-pay.html',
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

// Live Captain State synced from home-collection.js
let captainState = {
  isOnline: false,
  notificationsEnabled: false,
  captainId: '',
  lat: null,
  lng: null,
  maxRadiusKm: 10,
  apiUrl: 'https://script.google.com/macros/s/AKfycbwHZxUVCks3RIOyPe_3YM1Y6zrdUNhbYgGCXDUXk-La3Zy9SrJrITHcsbQZVHmHimUggQ/exec',
  declinedIds: []
};

/* =========================================================
   HELPER: HAVERSINE 10 KM DISTANCE & COORDINATE PARSER
   ========================================================= */
function extractCustomerCoords(b) {
  const directLat = Number(b.latitude || b.lat || b.customerLat || b.destCoords?.lat || 0);
  const directLng = Number(b.longitude || b.lng || b.customerLng || b.destCoords?.lng || 0);
  if (directLat && directLng && !b.destCoords?.isFallback) {
    return { lat: directLat, lng: directLng };
  }

  const rawLoc = String(b.location?.link || b.location || b.customerLocation || b.gpsLocation || '').trim();
  if (!rawLoc) return null;

  const patterns = [
    /[?&](?:q|query|destination|ll)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i,
    /@(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/,
    /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/
  ];

  for (const regex of patterns) {
    const m = rawLoc.match(regex);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && lat !== 0 && lng !== 0) {
        return { lat, lng };
      }
    }
  }
  return null;
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

function getLocalYmd(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* =========================================================
   BACKGROUND ORDER CHECKER (WHEN APP IS MINIMIZED)
   ========================================================= */
async function checkNearbyOrdersInBackground() {
  if (!captainState.isOnline || !captainState.notificationsEnabled) return;
  if (!captainState.lat || !captainState.lng || !captainState.apiUrl) return;

  try {
    const todayYmd = getLocalYmd(new Date());
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    const tomorrowYmd = getLocalYmd(tmrw);

    const url = new URL(captainState.apiUrl);
    url.searchParams.append('action', 'getPendingHomeCollections');

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'getPendingHomeCollections',
        todayDate: todayYmd,
        tomorrowDate: tomorrowYmd,
        customerOnly: true,
        captainId: captainState.captainId,
        lat: captainState.lat,
        lng: captainState.lng,
        radiusKm: captainState.maxRadiusKm || 10
      })
    });

    if (!res.ok) return;
    const json = await res.json();
    const data = (json && json.data !== undefined) ? json.data : json;
    const list = data?.bookings || data?.data || (Array.isArray(data) ? data : []);
    if (!Array.isArray(list)) return;

    const declinedSet = new Set(captainState.declinedIds || []);

    for (const b of list) {
      if (!b || !b.bookingId) continue;
      if (declinedSet.has(b.bookingId)) continue;

      const status = String(b.bookingStatus || 'CONFIRMED').toUpperCase();
      if (status === 'COMPLETED' || status === 'CANCELLED') continue;

      // Skip if already accepted by any technician
      const assignedId = String(b.assignedTechId || b.captainId || '').trim();
      if (assignedId) continue;

      const coords = extractCustomerCoords(b);
      if (!coords) continue;

      const distKm = getDistanceKm(captainState.lat, captainState.lng, coords.lat, coords.lng);
      if (distKm > (captainState.maxRadiusKm || 10)) continue;

      const mode = String(b.paymentMode || b.paymentMethod || '').toUpperCase();
      const isCash = mode.includes('CASH') || mode.includes('COD') || mode.includes('DOORSTEP');
      const payText = isCash ? `Cash ₹${b.finalAmount || 0}` : 'Paid Online';

      await self.registration.showNotification(`🛵 NEW PICKUP • ${distKm} km away`, {
        body: `${b.patientName || 'Customer'} • ${b.timeSlot || 'Scheduled'}\n${payText} • Tap Accept or Decline`,
        icon: './assets/images/logo.png',
        badge: './assets/images/logo.png',
        tag: `hc-pickup-${b.bookingId}`,
        renotify: true,
        requireInteraction: true,
        silent: false,
        vibrate: [500, 200, 500, 200, 600],
        data: { bookingId: b.bookingId, url: './home-collection.html' },
        actions: [
          { action: 'accept', title: '✓ Accept Pickup' },
          { action: 'decline', title: '✕ Decline' }
        ]
      });
    }
  } catch (e) {}
}

/* =========================================================
   INSTALL & ACTIVATE
   ========================================================= */
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

/* =========================================================
   MESSAGE & BACKGROUND SYNC LISTENERS
   ========================================================= */
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING' || event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data.type === 'CAPTAIN_STATE_SYNC') {
    captainState = { ...captainState, ...event.data };
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'selfcare-captain-poll') {
    event.waitUntil(checkNearbyOrdersInBackground());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'selfcare-captain-poll') {
    event.waitUntil(checkNearbyOrdersInBackground());
  }
});

self.addEventListener('push', (event) => {
  if (!captainState.isOnline || !captainState.notificationsEnabled) return;
  event.waitUntil(checkNearbyOrdersInBackground());
});

/* =========================================================
   NOTIFICATION CLICK (ACCEPT -> OPEN APP | DECLINE -> STAY OUT)
   ========================================================= */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action || '';
  const bookingId = data.bookingId || '';

  // DECLINE: Do NOT open the app; mark declined permanently
  if (action === 'decline' && bookingId) {
    if (!captainState.declinedIds.includes(bookingId)) {
      captainState.declinedIds.push(bookingId);
    }
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        clientList.forEach((client) => {
          client.postMessage({ type: 'CAPTAIN_POPUP_ACTION', action: 'decline', bookingId });
        });
      })
    );
    return;
  }

  // ACCEPT or NOTIFICATION TAP: Bring technician directly inside the app
  const targetUrl = (action === 'accept' && bookingId)
    ? `./home-collection.html?hc_action=accept&bookingId=${encodeURIComponent(bookingId)}`
    : (data.url || './home-collection.html');

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (action === 'accept' && bookingId) {
          client.postMessage({ type: 'CAPTAIN_POPUP_ACTION', action: 'accept', bookingId });
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

/* =========================================================
   FETCH & CACHING STRATEGY
   ========================================================= */
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
