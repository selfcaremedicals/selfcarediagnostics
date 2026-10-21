/* file: assets/js/app.js */
/**
 * Selfcare Diagnostics - Main Application Controller v4.2.0 (Turbo Reload Engine)
 * Features:
 * - Prevents sudden first-install page reloads (hadPreviousController guard)
 * - Instant synchronous 0ms local-first session restoration
 * - Multi-tenant vault-aware cart isolation
 * - Non-blocking IndexedDB & smart dev Service Worker bypass
 * - Instant seamless auto-reload only on genuine version upgrade
 */

const App = {
  cart: [],

  async init() {
    try {
      console.log('[Selfcare App] Initializing v4.2.0...');
      
      // 1. Instant Synchronous User Session Check (0ms lag)
      if (typeof Auth !== 'undefined' && Auth.getUser) {
        const currentUser = Auth.getUser();
        if (currentUser) {
          console.log('[Selfcare App] Active User detected:', currentUser.mobile || currentUser.phone);
        }
      }

      // 2. Synchronous & Direct Cart Restoration
      this.loadCartDirect();

      // 3. Non-blocking Background IndexedDB Initialization
      if (typeof OfflineDB !== 'undefined' && OfflineDB.init) {
        OfflineDB.init().catch(err => console.warn('[Selfcare App] OfflineDB init background notice:', err));
      }

      // 4. Smart Service Worker registration (Zero-Cache Auto-Update Engine)
      this.handleServiceWorker();

      // 5. Non-blocking Background catalogue synchronization
      if (navigator.onLine && typeof OfflineSync !== 'undefined' && OfflineSync.bootstrap) {
        setTimeout(() => {
          OfflineSync.bootstrap().catch(e => console.warn('[Selfcare App] Sync bootstrap notice:', e));
        }, 1500);
      }

      // 6. Navigation listeners (Back button cart sync)
      this.setupNavigationListeners();

      console.log('[Selfcare App] Initialization complete.');
    } catch (error) {
      console.error('[Selfcare App] Initialization error:', error);
    }
  },

  safeShowToast(message, type = 'info') {
    if (typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(message, type);
    } else {
      alert(message);
    }
  },

  getTargetPatientId() {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const pId = urlParams.get('patientId');
        if (pId && pId.trim()) {
          const clean = decodeURIComponent(pId.trim());
          sessionStorage.setItem('selfcare_target_patient_id', clean);
          return clean;
        }
      }
      const stored = sessionStorage.getItem('selfcare_target_patient_id');
      if (stored && stored.trim()) return stored.trim();
    } catch (e) {}
    return 'SELF';
  },

  loadCartDirect() {
    try {
      let localCart = null;
      if (typeof localStorage !== 'undefined') {
        const activeUser = localStorage.getItem('selfcare_active_user');
        let raw = null;

        if (activeUser) {
          raw = localStorage.getItem(`selfcare_cart_${activeUser}`);
        }

        if (raw === null) {
          raw = localStorage.getItem('selfcare_cart') ?? localStorage.getItem('cart');
        }

        if (raw !== null) {
          try {
            localCart = JSON.parse(raw);
          } catch (e) {}
        }
      }

      this.cart = Array.isArray(localCart) ? localCart : [];
      this.updateCartUI();
    } catch (e) {
      console.error('[Selfcare App] Direct cart read error:', e);
      this.cart = [];
      this.updateCartUI();
    }
  },

  async loadCart() {
    this.loadCartDirect();
    if (this.cart.length === 0 && typeof OfflineDB !== 'undefined' && OfflineDB.getCart) {
      try {
        const dbCart = await OfflineDB.getCart();
        if (Array.isArray(dbCart) && dbCart.length > 0) {
          this.cart = dbCart;
          this.updateCartUI();
        }
      } catch (e) {}
    }
  },

  /**
   * ZERO-CACHE AUTO-UPDATE SERVICE WORKER HANDLER
   */
  handleServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    const isLocalhost = Boolean(
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '' ||
      window.location.port !== '' ||
      window.location.protocol === 'file:'
    );

    if (isLocalhost) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          registration.unregister();
        }
      }).catch(() => {});
      return;
    }

    // Check if an existing controller was present before new install
    let hadPreviousController = Boolean(navigator.serviceWorker.controller);

    navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' }).then((registration) => {
      registration.update();

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING', action: 'skipWaiting' });
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[Selfcare App] New update detected! Activating seamlessly...');
              newWorker.postMessage({ type: 'SKIP_WAITING', action: 'skipWaiting' });
            }
          });
        }
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      });

      setInterval(() => {
        registration.update().catch(() => {});
      }, 15 * 60 * 1000);

    }).catch((err) => {
      console.warn('[Selfcare App] Service Worker registration notice:', err);
    });

    // Guard: முதல்முறை app திறக்கும் போது தேவையின்றி reload ஆவதைத் தடுக்கிறது
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadPreviousController) {
        hadPreviousController = true;
        return;
      }
      if (!refreshing) {
        refreshing = true;
        console.log('[Selfcare App] Reloading with latest version...');
        window.location.reload();
      }
    });
  },

  async saveCart(newCart) {
    try {
      if (Array.isArray(newCart)) {
        this.cart = newCart;
      }
      const cartStr = JSON.stringify(this.cart);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cart', cartStr);
        localStorage.setItem('selfcare_cart', cartStr);

        const activeUser = localStorage.getItem('selfcare_active_user');
        if (activeUser) {
          localStorage.setItem(`selfcare_cart_${activeUser}`, cartStr);
        }
      }
      this.updateCartUI();

      if (typeof OfflineDB !== 'undefined' && OfflineDB.saveCart) {
        OfflineDB.saveCart(this.cart).catch(() => {});
      }
    } catch (e) {
      console.error('[Selfcare App] Error saving cart:', e);
    }
  },

  async addToCart(item) {
    try {
      if (!item) return;

      const targetPatientId = item.patientId || this.getTargetPatientId() || 'SELF';
      const itemId = String(item.TestID || item.PackageID || item.id || '');
      const itemName = item.TestName || item.PackageName || item.name || 'Diagnostic Item';
      const itemCode = String(item.TestCode || item.PackageCode || item.code || 'ITEM');

      const itemWithPatient = {
        ...item,
        patientId: targetPatientId
      };

      if (typeof ConflictValidator !== 'undefined' && typeof ConflictValidator.checkConflict === 'function') {
        const patientCart = this.cart.filter(i => (i.patientId || 'SELF') === targetPatientId);
        const conflict = ConflictValidator.checkConflict(itemWithPatient, patientCart);
        
        if (conflict && conflict.hasConflict) {
          this.safeShowToast(conflict.reason, 'error');
          return;
        }
      }
      
      const alreadyInCartForPatient = this.cart.find(c => {
        const cId = String(c.TestID || c.PackageID || c.id || '');
        const cCode = String(c.TestCode || c.PackageCode || c.code || '');
        const cPatientId = c.patientId || 'SELF';
        return (cId === itemId || cCode === itemCode) && cPatientId === targetPatientId;
      });

      if (alreadyInCartForPatient) {
        this.safeShowToast(`"${itemName}" is already in cart for this member`, 'info');
        return;
      }

      const cartItem = {
        ...item,
        id: itemId,
        TestID: item.TestID || null,
        PackageID: item.PackageID || null,
        name: itemName,
        code: itemCode,
        price: Number(item.OfferPrice || item.price || item.MRP || 0),
        mrp: Number(item.MRP || item.mrp || 0),
        type: (item.PackageID || item.PackageCode || String(itemCode).startsWith('PKG')) ? 'package' : 'test',
        patientId: targetPatientId,
        addedAt: new Date().toISOString()
      };

      this.cart.push(cartItem);
      await this.saveCart(this.cart);

      this.safeShowToast(`Added "${itemName}" to cart`, 'success');
    } catch (e) {
      console.error('[Selfcare App] Error adding to cart:', e);
      this.safeShowToast('Could not add item to cart', 'error');
    }
  },

  async removeFromCart(itemId, targetPatientId = null) {
    try {
      const sId = String(itemId).trim().toLowerCase();
      this.cart = this.cart.filter(c => {
        const cId = String(c.id || c.TestID || c.PackageID || c.code || '').trim().toLowerCase();
        const cPatientId = c.patientId || 'SELF';

        if (targetPatientId) {
          return !(cId === sId && cPatientId === targetPatientId);
        }
        return cId !== sId;
      });

      await this.saveCart(this.cart);
      this.safeShowToast('Item removed from cart', 'info');
    } catch (e) {
      console.error('[Selfcare App] Error removing from cart:', e);
    }
  },

  updateCartBadge() {
    this.updateCartUI();
  },

  updateCartUI() {
    const badges = document.querySelectorAll('.cart-badge');
    const count = this.cart.length;
    badges.forEach(badge => {
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
      } else {
        badge.textContent = '0';
        badge.style.display = 'none';
      }
    });
  },

  setupNavigationListeners() {
    window.addEventListener('pageshow', () => {
      this.loadCartDirect();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.loadCartDirect();
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

if (typeof window !== 'undefined') window.App = App;
if (typeof module !== 'undefined' && module.exports) module.exports = App;
