/* file: assets/js/customer.js */
/**
 * Selfcare Diagnostics - Customer Dashboard JS v9.1.0
 * Clean & Optimized Edition:
 * 1. Smart Auth Deep-Linking: Redirects non-logged-in users to Login first, then auto-restores package modal.
 * 2. Add-on Booking Lock Guard: Strictly blocks re-adding booked packages
 *    and prevents package duplication in active appointments.
 * 3. Multi-Patient Isolated Cart & Conflict Validation.
 * 4. Mobile Web Share API with App-Style Box Card UI & Detailed Parameters below the box.
 * 5. Dedicated Share button on every Package card & Detail Modal.
 * 6. Safe ID-based Cart Toggle with Locked Appointment Status Badges.
 * 7. Interactive Finger Touch-Swipe + Auto-Slide Carousel Engine.
 */

const CustomerDashboard = {
  allPackages: [],
  sliderIntervalId: null,

  async init() {
    try {
      // Redirect non-logged-in users with deep-links to Login first
      if (typeof Auth !== 'undefined' && !Auth.isLoggedIn()) {
        const urlParams = new URLSearchParams(window.location.search);
        const hasDeepLink = urlParams.has('package') || urlParams.has('pkg') || urlParams.has('packageId');

        if (hasDeepLink) {
          localStorage.setItem('scd_pending_share_url', window.location.href);
          window.location.replace('index.html?redirect=' + encodeURIComponent(window.location.href));
          return;
        }
      }

      this.setupEventListeners();
      this.setupAutoSlideCarousel();
      this.updateCartBadgeUI();
      await this.loadLocalCatalogue();
      this.handleDeepLinks();
    } catch (error) {
      console.error('CustomerDashboard init error:', error);
    }
  },

  /**
   * Helper: Normalized Patient ID Comparison (Case-Insensitive & 'self' alias aware)
   */
  isPatientMatch(patientIdA, patientIdB) {
    const a = String(patientIdA || 'SELF').trim().toLowerCase();
    const b = String(patientIdB || 'SELF').trim().toLowerCase();
    if (a === b) return true;
    if ((a === 'self' || a === 'patient_self') && (b === 'self' || b === 'patient_self')) return true;
    return false;
  },

  /**
   * Identifies the current active patient context
   */
  getTargetPatientId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const paramId = urlParams.get('patientId');
      if (paramId && paramId.trim()) {
        const cleanId = decodeURIComponent(paramId.trim());
        sessionStorage.setItem('selfcare_target_patient_id', cleanId);
        return cleanId;
      }

      const storedId = sessionStorage.getItem('selfcare_target_patient_id');
      if (storedId && storedId.trim()) {
        return storedId.trim();
      }

      // Check if active addon booking specifies a locked patient
      const addonRaw = sessionStorage.getItem('selfcare_addon_booking') || localStorage.getItem('selfcare_active_addon_booking_data');
      if (addonRaw) {
        const addon = JSON.parse(addonRaw);
        if (addon && (addon.lockedPatientId || addon.patientId)) {
          return String(addon.lockedPatientId || addon.patientId).trim();
        }
      }
    } catch (e) {
      console.warn('Error resolving targetPatientId in customer dashboard:', e);
    }
    return 'SELF';
  },

  /**
   * Checks if a package is already paid and locked in an active booking appointment
   */
  isItemLockedInBooking(packageId, packageCode, packageName) {
    try {
      const addonRaw = sessionStorage.getItem('selfcare_addon_booking') || localStorage.getItem('selfcare_active_addon_booking_data');
      if (!addonRaw) return false;
      const addon = JSON.parse(addonRaw);
      if (!addon || !Array.isArray(addon.lockedExistingItems) || addon.lockedExistingItems.length === 0) return false;

      const targetPatientId = this.getTargetPatientId();
      const lockedPatientId = addon.lockedPatientId || addon.patientId || 'SELF';
      if (!this.isPatientMatch(targetPatientId, lockedPatientId)) return false;

      const sId = String(packageId || '').trim().toLowerCase();
      const sCode = String(packageCode || '').trim().toLowerCase();
      const sName = String(packageName || '').trim().toLowerCase();

      return addon.lockedExistingItems.some(item => {
        const iId = String(item.PackageID || item.TestID || item.id || item.code || '').trim().toLowerCase();
        const iCode = String(item.PackageCode || item.TestCode || item.code || '').trim().toLowerCase();
        const iName = String(item.PackageName || item.TestName || item.name || '').trim().toLowerCase();
        return (sId && iId === sId) || (sCode && iCode === sCode) || (sName && iName === sName);
      });
    } catch (e) {
      return false;
    }
  },

  showLockedNotice(pkgName, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const name = pkgName || 'This package';
    if (typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(`🔒 "${name}" is already paid & booked in this appointment!`, 'info');
    } else {
      alert(`"${name}" is already paid & booked in this appointment!`);
    }
  },

  getScdPackPriority(pkg, index = 0) {
    if (!pkg) return 999;
    const str = `${pkg.PackageCode || ''} ${pkg.PackageID || ''} ${pkg.PackageName || ''}`
      .toLowerCase()
      .replace(/[\s\-_]/g, '');

    if (str.includes('scdpack001') || str.includes('scd001') || str.includes('scdp001') || str.includes('scdpack1')) return 1;
    if (str.includes('scdpack002') || str.includes('scd002') || str.includes('scdp002') || str.includes('scdpack2')) return 2;
    if (str.includes('scdpack003') || str.includes('scd003') || str.includes('scdp003') || str.includes('scdpack3') || pkg.IsRecommended) return 3;

    if (index === 0) return 1;
    if (index === 1) return 2;
    if (index === 2) return 3;

    return 999;
  },

  sortPackagesWithScdPriority(packages) {
    if (!packages || !Array.isArray(packages)) return [];
    return [...packages].sort((a, b) => {
      const pA = this.getScdPackPriority(a, 999);
      const pB = this.getScdPackPriority(b, 999);
      if (pA !== pB) return pA - pB;
      return 0;
    });
  },

  async loadLocalCatalogue() {
    const container = document.getElementById('popular-packages-container');
    try {
      if (typeof OfflineDB !== 'undefined') {
        const localPkgs = await OfflineDB.getAll('packages');
        if (localPkgs && localPkgs.length > 0) {
          this.allPackages = localPkgs;
          this.renderPopularPackages();
        } else if (container) {
          container.innerHTML = '<p class="empty-msg" style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 20px;">Fetching popular packages from server...</p>';
        }
      }
    } catch (e) {
      console.warn('Local cache read error:', e);
    }

    if (navigator.onLine && typeof OfflineSync !== 'undefined') {
      setTimeout(async () => {
        try {
          if (typeof OfflineSync.syncPackages === 'function') {
            const freshPkgs = await OfflineSync.syncPackages();
            if (freshPkgs && freshPkgs.length > 0) {
              this.allPackages = freshPkgs;
              this.renderPopularPackages();
            }
          }
          this.handleDeepLinks();
        } catch (err) {
          console.warn('Background sync error:', err);
        }
      }, 600);
    }
  },

  /**
   * Multi-tenant Isolated Cart Reader
   * Merges locked items from an existing booking for ConflictValidator inspection.
   */
  getCart() {
    let cart = [];
    if (typeof localStorage !== 'undefined') {
      try {
        const activeUser = localStorage.getItem('selfcare_active_user');
        let raw = null;

        if (activeUser) {
          raw = localStorage.getItem(`selfcare_cart_${activeUser}`);
        }

        if (raw === null) {
          raw = localStorage.getItem('selfcare_cart') ?? localStorage.getItem('cart');
        }

        if (raw !== null) {
          const parsed = JSON.parse(raw);
          cart = Array.isArray(parsed) ? parsed : [];
        }
      } catch (err) {
        console.error('Cart parse error:', err);
      }
    }

    // 🛡️ CRITICAL FIX: Merge locked existing booking items into cart array for deep conflict checks
    try {
      const addonRaw = sessionStorage.getItem('selfcare_addon_booking') || localStorage.getItem('selfcare_active_addon_booking_data');
      if (addonRaw) {
        const addonData = JSON.parse(addonRaw);
        if (addonData && Array.isArray(addonData.lockedExistingItems)) {
          const lockedTargetPatientId = addonData.lockedPatientId || addonData.patientId || 'SELF';

          addonData.lockedExistingItems.forEach(lockedItem => {
            const isPkg = (
              lockedItem.type === 'package' ||
              lockedItem.PackageID ||
              lockedItem.PackageCode ||
              String(lockedItem.code || lockedItem.id || '').toUpperCase().startsWith('PKG') ||
              String(lockedItem.TestCode || '').toUpperCase().startsWith('PKG') ||
              String(lockedItem.name || lockedItem.TestName || '').toUpperCase().includes('PACKAGE')
            );

            const lockedItemNormalized = {
              ...lockedItem,
              id: lockedItem.PackageID || lockedItem.TestID || lockedItem.id || lockedItem.code,
              PackageID: lockedItem.PackageID || (isPkg ? (lockedItem.id || lockedItem.code) : null),
              TestID: lockedItem.TestID || (!isPkg ? (lockedItem.id || lockedItem.code) : null),
              PackageCode: lockedItem.PackageCode || (isPkg ? (lockedItem.code || lockedItem.id) : null),
              TestCode: lockedItem.TestCode || (!isPkg ? (lockedItem.code || lockedItem.id) : null),
              code: lockedItem.PackageCode || lockedItem.TestCode || lockedItem.code || lockedItem.id,
              name: lockedItem.PackageName || lockedItem.TestName || lockedItem.name,
              PackageName: lockedItem.PackageName || lockedItem.name,
              TestName: lockedItem.TestName || (!isPkg ? lockedItem.name : null),
              type: isPkg ? 'package' : 'test',
              isPackage: isPkg,
              patientId: lockedTargetPatientId,
              isExistingLocked: true
            };

            const lCode = String(lockedItemNormalized.code || '').trim().toLowerCase();
            const lId = String(lockedItemNormalized.id || '').trim().toLowerCase();
            const lName = String(lockedItemNormalized.name || '').trim().toLowerCase();

            const alreadyPresent = cart.some(c => {
              const cCode = String(c.PackageCode || c.TestCode || c.code || c.id || '').trim().toLowerCase();
              const cId = String(c.PackageID || c.TestID || c.id || '').trim().toLowerCase();
              const cName = String(c.PackageName || c.TestName || c.name || '').trim().toLowerCase();
              return (lCode && cCode === lCode) || (lId && cId === lId) || (lName && cName === lName);
            });

            if (!alreadyPresent) {
              cart.push(lockedItemNormalized);
            }
          });
        }
      }
    } catch (e) {
      console.warn('Addon booking inspection notice:', e);
    }

    return cart;
  },

  saveCartStorage(cart) {
    // Save ONLY newly added items into localStorage (Preserve locked items in appointment store)
    const newlyAddedOnly = Array.isArray(cart) ? cart.filter(i => !i.isExistingLocked) : [];

    if (typeof localStorage !== 'undefined') {
      const cartStr = JSON.stringify(newlyAddedOnly);
      localStorage.setItem('cart', cartStr);
      localStorage.setItem('selfcare_cart', cartStr);

      const activeUser = localStorage.getItem('selfcare_active_user');
      if (activeUser) {
        localStorage.setItem(`selfcare_cart_${activeUser}`, cartStr);
      }
    }

    if (typeof App !== 'undefined') {
      App.cart = newlyAddedOnly;
      if (typeof App.saveCart === 'function') App.saveCart(newlyAddedOnly);
      if (typeof App.updateCartBadge === 'function') App.updateCartBadge();
    }

    if (typeof OfflineDB !== 'undefined' && typeof OfflineDB.saveCart === 'function') {
      OfflineDB.saveCart(newlyAddedOnly);
    }
  },

  updateCartBadgeUI() {
    // Only count newly added items in the badge
    const cart = this.getCart().filter(i => !i.isExistingLocked);
    const count = cart.length;
    const badges = document.querySelectorAll('.cart-badge');
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

  isItemInCart(itemId, itemCode, itemName) {
    const cart = this.getCart();
    const targetPatientId = this.getTargetPatientId();
    const sId = String(itemId || '').trim().toLowerCase();
    const sCode = String(itemCode || '').trim().toLowerCase();
    const sName = String(itemName || '').trim().toLowerCase();

    return cart.some(item => {
      const itemPatientId = item.patientId || 'SELF';
      if (!this.isPatientMatch(itemPatientId, targetPatientId)) {
        return false;
      }

      const iId = String(item.TestID || item.PackageID || item.id || item.TestCode || item.PackageCode || item.code || '').trim().toLowerCase();
      const iCode = String(item.TestCode || item.PackageCode || item.code || '').trim().toLowerCase();
      const iName = String(item.TestName || item.PackageName || item.name || '').trim().toLowerCase();
      return (sId && iId === sId) || (sCode && iCode === sCode) || (sName && iName === sName);
    });
  },

  animateFlyToCart(btnElement, isRemove = false) {
    const cartIcon = document.querySelector('.bottom-nav a[href="cart.html"]') || document.querySelector('.cart-btn');
    if (!btnElement || !cartIcon) return;

    const startRect = isRemove ? cartIcon.getBoundingClientRect() : btnElement.getBoundingClientRect();
    const targetRect = isRemove ? btnElement.getBoundingClientRect() : cartIcon.getBoundingClientRect();

    const flyDot = document.createElement('div');
    flyDot.className = 'fly-cart-dot';
    flyDot.innerHTML = '🛒';
    document.body.appendChild(flyDot);

    const startX = startRect.left + (startRect.width / 2) - 14;
    const startY = startRect.top + (startRect.height / 2) - 14;
    const targetX = targetRect.left + (targetRect.width / 2) - 14;
    const targetY = targetRect.top + (targetRect.height / 2) - 14;

    flyDot.style.left = `${startX}px`;
    flyDot.style.top = `${startY}px`;

    requestAnimationFrame(() => {
      flyDot.style.transform = `translate(${targetX - startX}px, ${targetY - startY}px) scale(${isRemove ? 1.2 : 0.4})`;
      flyDot.style.opacity = isRemove ? '0.2' : '0.4';
    });

    setTimeout(() => {
      if (flyDot.parentNode) flyDot.parentNode.removeChild(flyDot);
      const cartBadges = document.querySelectorAll('.cart-badge');
      cartBadges.forEach(b => {
        b.classList.remove('badge-bump');
        void b.offsetWidth;
        b.classList.add('badge-bump');
      });
    }, 550);
  },

  toggleCart(itemOrId, event) {
    if (event) {
      event.stopPropagation();
    }

    let item = itemOrId;
    if (typeof itemOrId === 'string') {
      const cleanId = itemOrId.trim();
      item = this.allPackages.find(p => String(p.PackageID) === cleanId || String(p.PackageCode) === cleanId);
    }

    if (!item) {
      console.warn('Package not found for cart toggle:', itemOrId);
      return;
    }

    const targetPatientId = this.getTargetPatientId();
    const itemId = String(item.PackageID || item.PackageCode || item.id || '');
    const itemCode = String(item.PackageCode || item.code || '');
    const itemName = String(item.PackageName || item.name || '');

    // 🛡️ BLOCK ACTION IF ITEM IS ALREADY PAID IN LOCKED BOOKING
    if (this.isItemLockedInBooking(itemId, itemCode, itemName)) {
      this.showLockedNotice(itemName, event);
      return;
    }

    // 🛡️ STRICT ADDON MODE GUARD:
    // If the user arrived via "➕ Add Tests", appointments are in TESTS_ONLY mode.
    // They are not allowed to add whole health packages to an existing appointment.
    const addonRaw = sessionStorage.getItem('selfcare_addon_booking') || localStorage.getItem('selfcare_active_addon_booking_data');
    if (addonRaw) {
      try {
        const addon = JSON.parse(addonRaw);
        if (addon && addon.addonMode === 'TESTS_ONLY') {
          if (typeof Utils !== 'undefined') {
            Utils.showToast('⚠️ Only individual tests can be added to an existing booking. For another package, please book a new appointment.', 'error');
          } else {
            alert('Only individual tests can be added to an existing booking.');
          }
          return;
        }
      } catch (e) {}
    }
    
    let cart = this.getCart();
    const isAdded = this.isItemInCart(itemId, itemCode, itemName);

    const itemWithMeta = {
      ...item,
      id: itemId,
      PackageID: itemId,
      code: itemCode,
      PackageCode: itemCode,
      name: itemName,
      PackageName: itemName,
      type: 'package',
      isPackage: true,
      patientId: targetPatientId,
      addedAt: new Date().toISOString()
    };

    if (!isAdded) {
      if (typeof ConflictValidator !== 'undefined') {
        try {
          const patientOnlyCart = cart.filter(i => this.isPatientMatch(i.patientId, targetPatientId));
          const conflict = ConflictValidator.checkConflict(itemWithMeta, patientOnlyCart);
          if (conflict && conflict.hasConflict) {
            if (typeof Utils !== 'undefined') {
              Utils.showToast(conflict.reason, 'error');
            } else {
              alert(conflict.reason);
            }
            return;
          }
        } catch (cvErr) {
          console.warn('Conflict check bypass on non-fatal exception:', cvErr);
        }
      }
    }

    const btnTarget = (event && event.currentTarget) ? event.currentTarget : null;
    if (btnTarget) {
      this.animateFlyToCart(btnTarget, isAdded);
    }

    if (isAdded) {
      // Remove item only if it is NOT a pre-existing locked item
      cart = cart.filter(i => {
        if (i.isExistingLocked) return true;
        const itemPatientId = i.patientId || 'SELF';
        if (!this.isPatientMatch(itemPatientId, targetPatientId)) {
          return true;
        }

        const iId = String(i.PackageID || i.TestID || i.id || i.PackageCode || i.TestCode || i.code || '');
        const iCode = String(i.PackageCode || i.TestCode || i.code || '');
        const iName = String(i.PackageName || i.TestName || i.name || '');
        return iId !== itemId && iCode !== itemCode && iName !== itemName;
      });

      if (typeof Utils !== 'undefined') {
        Utils.showToast(`Removed "${itemName}" from cart`, 'info');
      }
    } else {
      cart.push(itemWithMeta);
      if (typeof Utils !== 'undefined') {
        Utils.showToast(`Added "${itemName}" to cart`, 'success');
      }
    }

    this.saveCartStorage(cart);
    this.updateCartBadgeUI();
    this.renderPopularPackages();
  },

  extractParametersList(rawParams) {
    if (!rawParams) return [];
    let items = [];
    if (Array.isArray(rawParams)) {
      items = rawParams.flatMap(p => {
        const str = typeof p === 'object' && p !== null ? (p.Name || p.ParameterName || p.TestName || JSON.stringify(p)) : String(p);
        return str.split(/[;,|\n•]|<br\s*[\/]?>/i).map(i => i.trim()).filter(Boolean);
      });
    } else if (typeof rawParams === 'string') {
      items = rawParams.split(/[;,|\n•]|<br\s*[\/]?>/i).map(i => i.trim()).filter(Boolean);
    } else {
      items = [String(rawParams).trim()];
    }
    return items.filter(item => item && item.length > 1);
  },

  getPackageParameterCount(pkg) {
    const backendCount = Number(pkg.ParametersCount);
    if (!isNaN(backendCount) && backendCount > 0) {
      return backendCount > 1 ? `${backendCount} Parameters` : '1 Parameter';
    }

    const items = this.extractParametersList(pkg.Parameters || pkg.Description);
    const count = items.length;
    return count > 1 ? `${count} Parameters` : (count === 1 ? '1 Parameter' : 'Complete Panel');
  },

  formatParameters(pkg) {
    const items = this.extractParametersList(pkg.Parameters || pkg.Description);
    if (items.length === 0) {
      return '<div class="param-item"><span class="param-num">1</span> <span>Complete Clinical Diagnostic Evaluation</span></div>';
    }
    return items.map((item, index) => `<div class="param-item"><span class="param-num">${index + 1}</span> <span>${Utils.escapeHtml(item)}</span></div>`).join('');
  },

  getFastingDetails(pkg) {
    const prep = String(pkg.Preparation || pkg.Description || '').toLowerCase();
    const isFasting = Boolean(pkg.FastingRequired) || (prep.includes('fasting') && !prep.includes('no fasting') && !prep.includes('non fasting'));
    
    if (isFasting) {
      const match = prep.match(/(\d+\s*[-–to]\s*\d+|\d+)\s*(hrs|hours|hour)/i);
      const duration = match ? match[0] : '10 - 12 Hours';
      return {
        isFasting: true,
        badgeText: '⚠️ Fasting Required',
        cardText: 'Fasting',
        durationText: `${duration} overnight fasting is required (Water is permitted).`
      };
    } else {
      return {
        isFasting: false,
        badgeText: '✅ Non-Fasting',
        cardText: 'Non-Fasting',
        durationText: 'No fasting required. Sample can be collected at any time.'
      };
    }
  },

  getBaseAppUrl() {
    if (typeof window !== 'undefined' && window.location) {
      const host = window.location.hostname;
      const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '' || window.location.protocol === 'file:';
      
      if (isLocal) {
        return 'https://selfcarediagnostics.in';
      }

      const pathname = window.location.pathname;
      const basePath = pathname.substring(0, pathname.lastIndexOf('/'));
      const fullOrigin = `${window.location.origin}${basePath}`;
      return fullOrigin.replace(/\/+$/, '');
    }
    return 'https://selfcarediagnostics.in';
  },

  async copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      if (typeof Utils !== 'undefined' && Utils.showToast) {
        Utils.showToast('Share link copied to clipboard!', 'success');
      }
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      if (typeof Utils !== 'undefined' && Utils.showToast) {
        Utils.showToast('Unable to copy share link', 'error');
      }
    }
  },

  async executeShare(shareTitle, shareBody, shareUrl) {
    const fullShareText = `${shareBody}\n\n${shareUrl}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: fullShareText
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        try {
          await navigator.share({
            title: shareTitle,
            text: shareBody,
            url: shareUrl
          });
          return;
        } catch (err2) {
          if (err2.name === 'AbortError') return;
          console.warn('Native share fallback:', err2);
        }
      }
    }

    await this.copyToClipboard(fullShareText);
  },

  sharePackage(pkgOrId, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    }

    let pkg = pkgOrId;
    if (typeof pkgOrId === 'string') {
      const cleanId = pkgOrId.trim();
      pkg = this.allPackages.find(p => String(p.PackageID) === cleanId || String(p.PackageCode) === cleanId);
      if (!pkg) {
        try {
          const cached = JSON.parse(localStorage.getItem('cache_packages') || '[]');
          pkg = cached.find(p => String(p.PackageID) === cleanId || String(p.PackageCode) === cleanId);
        } catch (e) {}
      }
    }

    if (!pkg && typeof pkgOrId === 'object' && pkgOrId !== null) {
      pkg = pkgOrId;
    }

    if (!pkg) {
      console.warn('Package not found for sharing:', pkgOrId);
      return;
    }

    const rawId = pkg.PackageID || pkg.PackageCode || pkg.id || 'PKG';
    const pkgId = String(rawId).trim();
    const pkgName = pkg.PackageName || pkg.name || 'Health Package';
    const pkgCode = pkg.PackageCode || 'PKG';
    const price = Number(pkg.OfferPrice || pkg.price || pkg.MRP || 0);
    const mrp = Number(pkg.MRP || 0);
    const priceFormatted = (typeof Utils !== 'undefined' && Utils.formatCurrency)
      ? Utils.formatCurrency(price)
      : (`₹${price}`);
    const mrpFormatted = (mrp > price && typeof Utils !== 'undefined' && Utils.formatCurrency)
      ? Utils.formatCurrency(mrp)
      : (mrp > price ? `₹${mrp}` : '');

    const paramBadgeText = this.getPackageParameterCount(pkg);
    const fastingInfo = this.getFastingDetails(pkg);
    const paramItems = this.extractParametersList(pkg.Parameters || pkg.Description);

    let priceLine = `💵 *Offer Price: ${priceFormatted}*`;
    if (mrpFormatted) {
      priceLine += ` ~(${mrpFormatted})~`;
    }

    const boxCard = [
      '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓',
      '  🌿 *SELFCARE DIAGNOSTICS*',
      '  ───────────────────────────',
      `  📦 *${pkgName.toUpperCase()}*`,
      `  🏷️ ${pkgCode} • ${fastingInfo.isFasting ? '⚠️ Fasting' : '✅ Non-Fasting'}`,
      `  🧪 *${paramBadgeText} Included*`,
      `  ${priceLine}`,
      '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛'
    ].join('\n');

    let detailsSection = '';
    if (paramItems && paramItems.length > 0) {
      const displayLimit = 25;
      const listItems = paramItems.slice(0, displayLimit).map((item, idx) => `  ${idx + 1}. ${item}`);
      const remaining = paramItems.length - displayLimit;
      const moreText = remaining > 0 ? `\n  ➕ ... matrum innum ${remaining} parameters` : '';
      
      detailsSection = `\n📋 *Included Parameters & Tests:*\n${listItems.join('\n')}${moreText}\n`;
    }

    let fastingSection = '';
    if (fastingInfo.isFasting && fastingInfo.durationText) {
      fastingSection = `\n⚠️ *Preparation:* ${fastingInfo.durationText}\n`;
    }

    const baseUrl = this.getBaseAppUrl();
    const shareUrl = `${baseUrl}/index.html?package=${encodeURIComponent(pkgId)}`;
    const shareTitle = `💚 SELFCARE DIAGNOSTICS - ${pkgName}`;
    const shareBody = `${boxCard}\n${detailsSection}${fastingSection}\n📍 *Home Sample Collection Available*\n⚡ *Fast Reports*\n🏠 *24/7 Home Collection*\n\n🔗 *View Package & Book:*`;

    this.executeShare(shareTitle, shareBody, shareUrl);
  },

  handleDeepLinks() {
    try {
      if (typeof window === 'undefined' || !window.location) return;
      const urlParams = new URLSearchParams(window.location.search);
      const pkgParam = urlParams.get('package') || urlParams.get('pkg') || urlParams.get('packageId');

      if (pkgParam) {
        const cleanParam = decodeURIComponent(pkgParam).trim().toLowerCase();
        setTimeout(() => {
          const matchedPkg = this.allPackages.find(p => {
            const pid = String(p.PackageID || '').trim().toLowerCase();
            const pcode = String(p.PackageCode || '').trim().toLowerCase();
            return pid === cleanParam || pcode === cleanParam;
          });

          if (matchedPkg) {
            this.showPackageDetails(matchedPkg.PackageID || matchedPkg.PackageCode);
          }
        }, 350);
      }
    } catch (e) {
      console.warn('Deep link inspect notice:', e);
    }
  },

  renderPopularPackages() {
    const container = document.getElementById('popular-packages-container');
    if (!container) return;

    if (!this.allPackages || this.allPackages.length === 0) {
      container.innerHTML = '<p class="empty-msg" style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 20px;">Fetching popular packages from server...</p>';
      return;
    }

    const sortedPackages = this.sortPackagesWithScdPriority(this.allPackages);

    container.innerHTML = sortedPackages.slice(0, 4).map((pkg, idx) => {
      const pkgCode = pkg.PackageCode || 'PKG';
      const pkgId = pkg.PackageID || pkgCode;
      const isLocked = this.isItemLockedInBooking(pkgId, pkgCode, pkg.PackageName);
      const alreadyAdded = this.isItemInCart(pkgId, pkgCode, pkg.PackageName);
      const fastingInfo = this.getFastingDetails(pkg);
      const paramCount = this.getPackageParameterCount(pkg);

      const priority = this.getScdPackPriority(pkg, idx);
      let neonCardClass = '';
      let neonBadgeHtml = '';

      if (priority === 1) {
        neonCardClass = 'neon-glowing-card neon-card-1';
        neonBadgeHtml = '<div class="neon-recommended-badge neon-badge-1">⚡ ESSENTIAL</div>';
      } else if (priority === 2) {
        neonCardClass = 'neon-glowing-card neon-card-2';
        neonBadgeHtml = '<div class="neon-recommended-badge neon-badge-2">🔥 POPULAR</div>';
      } else if (priority === 3) {
        neonCardClass = 'neon-glowing-card neon-card-3';
        neonBadgeHtml = '<div class="neon-recommended-badge neon-badge-3">✨ RECOMMENDED</div>';
      }

      let actionButton = '';
      if (isLocked) {
        actionButton = `<button type="button" class="book-btn locked-btn" style="background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1; cursor:not-allowed;" onclick="CustomerDashboard.showLockedNotice('${Utils.escapeHtml(pkg.PackageName)}', event)">🔒 Already Booked</button>`;
      } else if (alreadyAdded) {
        actionButton = `<button type="button" class="book-btn added-btn" onclick="CustomerDashboard.toggleCart('${Utils.escapeHtml(pkgId)}', event)">Remove</button>`;
      } else {
        actionButton = `<button type="button" class="book-btn add-cart-btn" onclick="CustomerDashboard.toggleCart('${Utils.escapeHtml(pkgId)}', event)">🛒 Add To Cart</button>`;
      }

      return `
        <div class="test-card glass-card animate-fade ${neonCardClass}" style="position: relative;">
          ${neonBadgeHtml}
          <div class="test-card-top">
            <div class="test-card-header-row">
              <div class="test-card-badge-group" style="display: flex; align-items: center; gap: 6px;">
                <span class="test-code-tag">${Utils.escapeHtml(pkgCode)}</span>
                <span class="card-fasting-tag ${fastingInfo.isFasting ? 'fasting' : 'non-fasting'}">
                  ${fastingInfo.cardText}
                </span>
              </div>
              <button type="button" class="card-share-btn" aria-label="Share Package" title="Share Package" onclick="CustomerDashboard.sharePackage('${Utils.escapeHtml(pkgId)}', event)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5" r="3"></circle>
                  <circle cx="6" cy="12" r="3"></circle>
                  <circle cx="18" cy="19" r="3"></circle>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
              </button>
            </div>
            <h4>${Utils.escapeHtml(pkg.PackageName)}</h4>
            <div class="card-param-badge">
              🧪 <strong>${paramCount}</strong> Included
            </div>
          </div>

          <div class="know-more-row" onclick="CustomerDashboard.showPackageDetails('${Utils.escapeHtml(pkgId)}')">
            <span class="info-icon">ⓘ</span>
            <span class="know-more-text">Know more</span>
            <span class="arrow-icon">➡</span>
          </div>

          <div class="test-pricing-row">
            <span class="mrp">${Utils.formatCurrency(pkg.MRP)}</span>
            <span class="offer-price">${Utils.formatCurrency(pkg.OfferPrice)}</span>
          </div>

          <div class="test-card-action-container">
            ${actionButton}
          </div>
        </div>
      `;
    }).join('');
  },

  showPackageDetails(pkgId) {
    let pkg = this.allPackages.find(p => String(p.PackageID).trim().toLowerCase() === String(pkgId).trim().toLowerCase() || String(p.PackageCode).trim().toLowerCase() === String(pkgId).trim().toLowerCase());
    if (!pkg) return;

    const actualId = pkg.PackageID || pkg.PackageCode;
    const formattedParams = this.formatParameters(pkg);
    const paramCount = this.getPackageParameterCount(pkg);
    const fastingInfo = this.getFastingDetails(pkg);
    const isLocked = this.isItemLockedInBooking(actualId, pkg.PackageCode, pkg.PackageName);
    const alreadyAdded = this.isItemInCart(actualId, pkg.PackageCode, pkg.PackageName);

    let actionBtn = '';
    if (isLocked) {
      actionBtn = `<button type="button" class="modal-action-btn locked-btn" style="background:#e2e8f0; color:#475569; border:1px solid #cbd5e1; cursor:not-allowed;" onclick="CustomerDashboard.showLockedNotice('${Utils.escapeHtml(pkg.PackageName)}', event)">🔒 Already Included in Booked Appointment</button>`;
    } else if (alreadyAdded) {
      actionBtn = `<button class="modal-action-btn remove-btn" onclick="CustomerDashboard.toggleCart('${Utils.escapeHtml(actualId)}', event); CustomerDashboard.showPackageDetails('${Utils.escapeHtml(actualId)}');">🗑️ Remove from Cart</button>`;
    } else {
      actionBtn = `<button class="modal-action-btn add-btn" onclick="CustomerDashboard.toggleCart('${Utils.escapeHtml(actualId)}', event); CustomerDashboard.showPackageDetails('${Utils.escapeHtml(actualId)}');">🛒 Add to Cart</button>`;
    }

    let modal = document.getElementById('package-detail-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'package-detail-modal';
      modal.className = 'sia-modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="sia-modal-content glass-modal-3d animate-3d-pop">
        <div class="sia-modal-header">
          <div class="modal-title-wrap">
            <span class="test-avatar-icon">📦</span>
            <h3>${Utils.escapeHtml(pkg.PackageName)}</h3>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button type="button" class="card-share-btn modal-share-btn" aria-label="Share Package" title="Share Package" onclick="CustomerDashboard.sharePackage('${Utils.escapeHtml(actualId)}', event)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
            </button>
            <button class="sia-close-btn" onclick="document.getElementById('package-detail-modal').style.display='none'">✕</button>
          </div>
        </div>

        <div class="sia-modal-body">
          <div class="detail-glass-card">
            <div class="info-chips-row">
              <span class="info-chip">🏷️ <strong>Code:</strong> ${Utils.escapeHtml(pkg.PackageCode || 'PKG')}</span>
              <span class="info-chip">🔬 <strong>Category:</strong> ${Utils.escapeHtml(pkg.Category || 'Preventive Panel')}</span>
              <span class="info-chip">🩸 <strong>Sample:</strong> ${Utils.escapeHtml(pkg.SampleType || 'Blood & Urine')}</span>
              <span class="info-chip">⏱️ <strong>TAT:</strong> ${Utils.escapeHtml(pkg.TAT || '24 Hours')}</span>
            </div>
          </div>

          <div class="detail-glass-card">
            <h4 class="section-label">Preparation & Fasting</h4>
            <div class="fasting-container ${fastingInfo.isFasting ? 'fasting-req' : 'fasting-no'}">
              <span class="fasting-badge-pill">${fastingInfo.badgeText}</span>
              <p class="fasting-desc">${fastingInfo.durationText}</p>
            </div>
          </div>

          <div class="detail-glass-card">
            <h4 class="section-label">Package Description</h4>
            <p class="description-text">
              ${Utils.escapeHtml(pkg.Description || 'Comprehensive preventive health checkup panel executed under certified clinical protocols.')}
            </p>
          </div>

          <div class="detail-glass-card">
            <div class="params-header-row">
              <h4 class="section-label" style="margin-bottom:0;">Included Tests & Parameters</h4>
              <span class="params-count-pill">${paramCount}</span>
            </div>
            <div class="parameters-scroll-box">
              ${formattedParams}
            </div>
          </div>

          <div class="modal-pricing-card">
            <div class="pricing-left">
              <span class="mrp-strikethrough">MRP ${Utils.formatCurrency(pkg.MRP)}</span>
              <span class="offer-highlight">${Utils.formatCurrency(pkg.OfferPrice)}</span>
            </div>
            <span class="discount-badge">Save ${(pkg.MRP && pkg.OfferPrice) ? Math.round(((pkg.MRP - pkg.OfferPrice) / pkg.MRP) * 100) : 0}%</span>
          </div>

          <div class="modal-footer-action">
            ${actionBtn}
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
  },

  setupAutoSlideCarousel() {
    const track = document.getElementById('singleSliderTrack');
    if (!track) return;

    if (this.sliderIntervalId) {
      clearInterval(this.sliderIntervalId);
      this.sliderIntervalId = null;
    }

    let currentSlide = 0;
    const totalSlides = track.children.length;
    if (totalSlides <= 1) return;

    const sliderBox = track.closest('.single-slider-box') || track.parentElement;
    track.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
    track.style.touchAction = 'pan-y';

    const goToSlideIndex = (index) => {
      currentSlide = (index + totalSlides) % totalSlides;
      track.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
      track.style.transform = `translateX(-${currentSlide * 100}%)`;
    };

    const startSliding = () => {
      if (this.sliderIntervalId) clearInterval(this.sliderIntervalId);
      this.sliderIntervalId = setInterval(() => {
        goToSlideIndex(currentSlide + 1);
      }, 5000);
    };

    startSliding();

    if (sliderBox && !sliderBox.dataset.swipeBound) {
      sliderBox.dataset.swipeBound = 'true';

      let startX = 0;
      let startY = 0;
      let currentDeltaX = 0;
      let isDragging = false;
      let isHorizontalSwipe = null;

      sliderBox.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length === 0) return;
        clearInterval(this.sliderIntervalId);
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        currentDeltaX = 0;
        isDragging = true;
        isHorizontalSwipe = null;
        track.style.transition = 'none';
      }, { passive: true });

      sliderBox.addEventListener('touchmove', (e) => {
        if (!isDragging || !e.touches || e.touches.length === 0) return;
        const moveX = e.touches[0].clientX;
        const moveY = e.touches[0].clientY;
        const diffX = moveX - startX;
        const diffY = moveY - startY;

        if (isHorizontalSwipe === null) {
          if (Math.abs(diffX) > 6 || Math.abs(diffY) > 6) {
            isHorizontalSwipe = Math.abs(diffX) > Math.abs(diffY);
          }
        }

        if (isHorizontalSwipe) {
          currentDeltaX = diffX;
          const boxWidth = sliderBox.offsetWidth || 320;
          const dragPercent = (currentDeltaX / boxWidth) * 100;
          track.style.transform = `translateX(calc(-${currentSlide * 100}% + ${dragPercent}%))`;
        }
      }, { passive: true });

      const finishTouchSwipe = () => {
        if (!isDragging) return;
        isDragging = false;
        const boxWidth = sliderBox.offsetWidth || 320;
        const threshold = Math.min(45, boxWidth * 0.15);

        if (isHorizontalSwipe && Math.abs(currentDeltaX) > threshold) {
          if (currentDeltaX < 0) {
            goToSlideIndex(currentSlide + 1);
          } else {
            goToSlideIndex(currentSlide - 1);
          }
        } else {
          goToSlideIndex(currentSlide);
        }

        currentDeltaX = 0;
        isHorizontalSwipe = null;
        startSliding();
      };

      sliderBox.addEventListener('touchend', finishTouchSwipe, { passive: true });
      sliderBox.addEventListener('touchcancel', finishTouchSwipe, { passive: true });

      sliderBox.addEventListener('mouseenter', () => clearInterval(this.sliderIntervalId));
      sliderBox.addEventListener('mouseleave', () => startSliding());
    }
  },

  setupEventListeners() {
    window.addEventListener('pageshow', () => {
      this.updateCartBadgeUI();
      if (this.allPackages.length === 0) {
        this.loadLocalCatalogue();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.updateCartBadgeUI();
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  CustomerDashboard.init();
});

if (typeof window !== 'undefined') {
  window.CustomerDashboard = CustomerDashboard;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CustomerDashboard;
}
