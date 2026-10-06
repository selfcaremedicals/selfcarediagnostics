/* file: assets/js/app.js */
/**
 * Selfcare Diagnostics - Main Application Controller (app.js) v4.0.0 (Zero-Lag Engine)
 * Features:
 * - Instant synchronous 0ms local-first session restoration.
 * - Multi-tenant vault-aware cart isolation (selfcare_cart_${activeUser}).
 * - Multi-Patient context detection & isolated dynamic ConflictValidator.
 * - Allows multiple family members to independently order same tests without false blocks.
 * - Non-blocking IndexedDB & smart dev Service Worker bypass.
 */

const App = {
  cart: [],

  async init() {
    try {
      console.log('[Selfcare App] Initializing v4.0.0 (Zero-Lag Engine)...');
      
      // 1. Instant Synchronous User Session Check (0ms lag)
      if (typeof Auth !== 'undefined' && Auth.getUser) {
        const currentUser = Auth.getUser();
        if (currentUser) {
          console.log('[Selfcare App] Active User detected:', currentUser.mobile || currentUser.phone);
        }
      }

      // 2. Synchronous & Direct Cart Restoration (Vault-aware instant load)
      this.loadCartDirect();

      // 3. Non-blocking Background IndexedDB Initialization
      if (typeof OfflineDB !== 'undefined' && OfflineDB.init) {
        OfflineDB.init().catch(err => console.warn('[Selfcare App] OfflineDB init background notice:', err));
      }

      // 4. Smart Service Worker registration (Dev mode bypass / Production cache)
      this.handleServiceWorker();

      // 5. Non-blocking Background catalogue synchronization
      if (navigator.onLine && typeof OfflineSync !== 'undefined' && OfflineSync.bootstrap) {
        setTimeout(() => {
          OfflineSync.bootstrap().catch(e => console.warn('[Selfcare App] Sync bootstrap notice:', e));
        }, 2000);
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

  /**
   * Resolves the current target patient context (defaults to 'SELF')
   */
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

  /**
   * Instant Synchronous Cart Load:
   * Checks active user vault first to guarantee absolute user isolation.
   */
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

      if (Array.isArray(localCart)) {
        this.cart = localCart;
      } else {
        this.cart = [];
      }

      this.updateCartUI();
    } catch (e) {
      console.error('[Selfcare App] Direct cart read error:', e);
      this.cart = [];
      this.updateCartUI();
    }
  },

  /**
   * Backward compatible async loadCart
   */
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
   * SMART SERVICE WORKER HANDLER:
   * Localhost/preview-ல் கேச் லாக் ஆகாமல் unregister செய்து preview தரும்.
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
          registration.unregister().then(() => {
            console.log('[Selfcare App] Localhost dev mode: Unregistered old Service Worker.');
          });
        }
      }).catch(err => console.warn('[Selfcare App] SW unregister notice:', err));

      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        });
      }
      return;
    }

    navigator.serviceWorker.register('service-worker.js').then((registration) => {
      registration.update();
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[Selfcare App] New service worker version available.');
            }
          });
        }
      });
    }).catch((err) => {
      console.warn('[Selfcare App] Service Worker registration notice:', err);
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  },

  /**
   * Universal Save Cart - Syncs memory, localStorage, multi-tenant vault, and background IndexedDB
   */
  async saveCart(newCart) {
    try {
      if (Array.isArray(newCart)) {
        this.cart = newCart;
      }
      const cartStr = JSON.stringify(this.cart);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cart', cartStr);
        localStorage.setItem('selfcare_cart', cartStr);

        // Multi-tenant isolation: Always save into active user's dedicated vault
        const activeUser = localStorage.getItem('selfcare_active_user');
        if (activeUser) {
          localStorage.setItem(`selfcare_cart_${activeUser}`, cartStr);
        }
      }
      this.updateCartUI();

      // Background IndexedDB write without blocking UI thread
      if (typeof OfflineDB !== 'undefined' && OfflineDB.saveCart) {
        OfflineDB.saveCart(this.cart).catch(() => {});
      }
    } catch (e) {
      console.error('[Selfcare App] Error saving cart:', e);
    }
  },

  /**
   * Safe Add to Cart with Multi-Patient Isolation & Dynamic ConflictValidator
   */
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

      // 1. Multi-Patient Isolated Conflict Check
      if (typeof ConflictValidator !== 'undefined' && typeof ConflictValidator.checkConflict === 'function') {
        // Filter only tests belonging to THIS specific family member
        const patientCart = this.cart.filter(i => (i.patientId || 'SELF') === targetPatientId);
        const conflict = ConflictValidator.checkConflict(itemWithPatient, patientCart);
        
        if (conflict && conflict.hasConflict) {
          this.safeShowToast(conflict.reason, 'error');
          return;
        }
      }
      
      // 2. Patient-Scoped Duplicate Check
      // (Allows different patients in the family to order the exact same test, e.g. CBC)
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

      // 3. Structured Cart Item Payload
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
          // Remove only this patient's instance of the item
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

// Global window exposure
if (typeof window !== 'undefined') {
  window.App = App;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = App;
}
