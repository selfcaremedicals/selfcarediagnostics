/* file: assets/js/app.js */
/**
 * Selfcare Diagnostics - Main Application Controller v4.3.0
 * Features:
 * - Prevents sudden first-install page reloads (hadPreviousController guard)
 * - Instant synchronous 0ms local-first session restoration
 * - Multi-tenant vault-aware cart isolation
 * - Universal VIP Membership Controller & Instant 👑 Crown Badge Engine
 * - Dynamic Date-Time Validity Validator & Reactive Status Sync
 * - Non-blocking IndexedDB & smart dev Service Worker bypass
 */

const App = {
  cart: [],
  activeUser: null,

  async init() {
    try {
      console.log('[Selfcare App] Initializing v4.3.0 with VIP Engine...');
      
      // 1. Instant Synchronous User Session Check
      this.loadActiveUser();

      // 2. Synchronous & Direct Cart Restoration
      this.loadCartDirect();

      // 3. Render VIP Badges & Crown across the entire DOM
      this.refreshVipBadges();

      // 4. Non-blocking Background IndexedDB Initialization
      if (typeof OfflineDB !== 'undefined' && OfflineDB.init) {
        OfflineDB.init().catch(err => console.warn('[Selfcare App] OfflineDB init notice:', err));
      }

      // 5. Smart Service Worker registration
      this.handleServiceWorker();

      // 6. Background catalogue sync
      if (navigator.onLine && typeof OfflineSync !== 'undefined' && OfflineSync.bootstrap) {
        setTimeout(() => {
          OfflineSync.bootstrap().catch(e => console.warn('[Selfcare App] Sync bootstrap notice:', e));
        }, 1500);
      }

      // 7. Navigation & Real-time VIP change listeners
      this.setupNavigationListeners();
      this.setupVipListeners();

      console.log('[Selfcare App] Initialization complete.');
    } catch (error) {
      console.error('[Selfcare App] Initialization error:', error);
    }
  },

  loadActiveUser() {
    try {
      const activeMobile = localStorage.getItem('selfcare_active_user') || '';
      let storedUser = null;

      if (typeof Auth !== 'undefined' && Auth.getUser) {
        storedUser = Auth.getUser();
      }

      if (!storedUser && activeMobile) {
        const raw = localStorage.getItem(`selfcare_profile_${activeMobile}`) || localStorage.getItem('selfcare_permanent_user');
        if (raw) storedUser = JSON.parse(raw);
      }

      this.activeUser = storedUser || (activeMobile ? { mobile: activeMobile } : null);
    } catch (e) {
      console.error('[Selfcare App] User load error:', e);
    }
  },

  /* ==========================================================================
     VIP MEMBERSHIP & CROWN (👑) CORE CONTROLLER
     ========================================================================== */

  /**
   * Check if a given member or primary user has active VIP status & not expired
   */
  isVipActive(memberObj = null) {
    const now = new Date();

    // 1. If specific family member object is passed
    if (memberObj) {
      if (memberObj.membership === 'Membership') {
        if (!memberObj.expiryDate) return true; // Lifetime or unexpired default
        return new Date(memberObj.expiryDate) > now;
      }
      return false;
    }

    // 2. Check for Primary User
    const activeMobile = localStorage.getItem('selfcare_active_user') || '';
    if (!activeMobile) return false;

    // Direct cache flag check
    const isVipFlag = localStorage.getItem('selfcare_is_vip_member');
    const rawMem = localStorage.getItem(`selfcare_membership_${activeMobile}`);

    if (rawMem) {
      try {
        const mem = JSON.parse(rawMem);
        if (mem && mem.status === 'Membership') {
          return mem.expiryDate ? new Date(mem.expiryDate) > now : true;
        }
      } catch (e) {}
    }

    return isVipFlag === 'true';
  },

  /**
   * Get formatted validity date & time string (e.g. 24 Oct 2027 at 10:30 AM)
   */
  getVipValidityInfo(memberObj = null) {
    const activeMobile = localStorage.getItem('selfcare_active_user') || '';
    let expiryStr = null;

    if (memberObj && memberObj.expiryDate) {
      expiryStr = memberObj.expiryDate;
    } else if (activeMobile) {
      const raw = localStorage.getItem(`selfcare_membership_${activeMobile}`);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          expiryStr = parsed.expiryDate;
        } catch (e) {}
      }
    }

    if (!expiryStr) {
      return { isActive: this.isVipActive(memberObj), formattedDate: 'Active' };
    }

    const expDate = new Date(expiryStr);
    const isValid = expDate > new Date();

    const dStr = expDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const tStr = expDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    return {
      isActive: isValid,
      expiryDate: expDate,
      formattedDate: `${dStr} at ${tStr}`
    };
  },

  /**
   * Returns HTML string with Crown icon appended if VIP
   */
  formatVipName(name, isVip = false) {
    const safeName = (typeof Utils !== 'undefined' && Utils.escapeHtml) ? Utils.escapeHtml(name) : name;
    if (isVip) {
      return `${safeName} <span class="vip-instant-crown" title="Active VIP Member" style="color:#F59E0B; font-size:16px; margin-left:4px; vertical-align:middle; filter:drop-shadow(0 1px 2px rgba(245,158,11,0.5));">👑</span>`;
    }
    return safeName;
  },

  /**
   * Scans and updates Crown icons & VIP Badges across any open page UI
   */
  refreshVipBadges() {
    try {
      const isPrimaryVip = this.isVipActive();
      const activeMobile = localStorage.getItem('selfcare_active_user') || '';

      // 1. Primary User Elements update (Header, Profile Card, Nav Name)
      const primaryNameEls = document.querySelectorAll('[data-user-name], #profile-user-name, #header-user-name, .user-display-name');
      primaryNameEls.forEach(el => {
        const rawName = el.getAttribute('data-raw-name') || el.textContent.replace('👑', '').trim();
        el.setAttribute('data-raw-name', rawName);
        el.innerHTML = this.formatVipName(rawName, isPrimaryVip);
      });

      // 2. Primary VIP Badge Container update
      const vipBadges = document.querySelectorAll('[data-primary-vip-badge], #vip-status-pill');
      vipBadges.forEach(badge => {
        if (isPrimaryVip) {
          const info = this.getVipValidityInfo();
          badge.innerHTML = `<span style="background:linear-gradient(135deg, #FFD700, #FFA500); color:#4A154B; font-weight:bold; font-size:11px; padding:3px 8px; border-radius:12px; display:inline-flex; align-items:center; gap:4px; box-shadow:0 2px 5px rgba(255,165,0,0.3);">👑 VIP ACTIVE</span>`;
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      });

      // 3. Family Member Elements update (using family cache)
      let familyList = [];
      try {
        const rawFam = localStorage.getItem(`selfcare_family_${activeMobile}`) || localStorage.getItem('selfcare_family_members');
        if (rawFam) familyList = JSON.parse(rawFam);
      } catch (e) {}

      if (familyList.length > 0) {
        document.querySelectorAll('[data-family-id]').forEach(card => {
          const mId = card.getAttribute('data-family-id');
          const member = familyList.find(f => String(f.id) === String(mId));
          if (member && this.isVipActive(member)) {
            const nameTarget = card.querySelector('.member-name, [data-member-name]');
            if (nameTarget) {
              const rawFamName = nameTarget.getAttribute('data-raw-name') || nameTarget.textContent.replace('👑', '').trim();
              nameTarget.setAttribute('data-raw-name', rawFamName);
              nameTarget.innerHTML = this.formatVipName(rawFamName, true);
            }
          }
        });
      }
    } catch (e) {
      console.warn('[Selfcare App] Crown badge injection notice:', e);
    }
  },

  /**
   * Broadcast VIP state change instantly across all tabs & screens
   */
  notifyVipSuccess() {
    window.dispatchEvent(new CustomEvent('selfcare:vip_activated'));
    this.refreshVipBadges();
  },

  setupVipListeners() {
    // Listen for custom trigger from membership checkout
    window.addEventListener('selfcare:vip_activated', () => {
      this.refreshVipBadges();
    });

    // Listen for storage changes from other tabs
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.includes('membership')) {
        this.refreshVipBadges();
      }
    });
  },

  /* ==========================================================================
     CART CONTROLLER & NOTIFICATIONS
     ========================================================================== */

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
      this.refreshVipBadges();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.loadCartDirect();
        this.refreshVipBadges();
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

if (typeof window !== 'undefined') window.App = App;
if (typeof module !== 'undefined' && module.exports) module.exports = App;
