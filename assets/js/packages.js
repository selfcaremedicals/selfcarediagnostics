/**
 * Selfcare Diagnostics - Health Packages Page JS v6.1.0
 * Features:
 * 1. Multi-Patient Isolated Conflict Validation.
 * 2. Target Patient Context Detection via URL & sessionStorage (targetPatientId).
 * 3. Patient-Isolated Cart Existence Checker (isItemInCart).
 * 4. Strict Backend-Only Data Loading.
 * 5. 3-Tier Neon Glow Effects for Top 3 Packages.
 * 6. Dynamic Category Selection Bar.
 * 7. Safe ID-based Cart Toggle & Voice Search.
 * 8. Search State Persistence during Background Offline Sync.
 * 9. Native Web Share API (navigator.share) with clean clipboard fallback for Packages.
 */

const PackagesPage = {
  allPackages: [],
  currentCategory: 'All',
  speechRecognitionInstance: null,

  symptomDictionary: {
    'fever': ['fever', 'cbc', 'esr', 'crp', 'malaria', 'widal', 'dengue', 'typhoid', 'temperature'],
    'temperature': ['fever', 'cbc', 'esr', 'crp', 'malaria', 'widal', 'dengue', 'typhoid'],
    'kaichal': ['fever', 'cbc', 'esr', 'crp', 'malaria', 'widal', 'dengue', 'typhoid'],
    'chills': ['malaria', 'dengue', 'widal', 'fever', 'cbc'],
    'cold': ['fever', 'cbc', 'crp'],
    'joint pain': ['vitamin', 'calcium', 'uric acid', 'arthritis'],
    'knee pain': ['vitamin', 'calcium', 'uric acid'],
    'muttu vali': ['vitamin', 'calcium', 'uric acid'],
    'arthritis': ['vitamin', 'calcium', 'uric acid'],
    'chest pain': ['cardiac', 'heart', 'lipid profile', 'cholesterol'],
    'nenju vali': ['cardiac', 'heart', 'lipid profile', 'cholesterol'],
    'heart': ['cardiac', 'heart', 'lipid profile', 'cholesterol'],
    'tired': ['vitamin', 'b12', 'vitamin d', 'sugar', 'hba1c'],
    'fatigue': ['vitamin', 'b12', 'vitamin d', 'sugar', 'hba1c'],
    'weakness': ['vitamin', 'b12', 'vitamin d'],
    'asathi': ['vitamin', 'b12', 'vitamin d'],
    'sugar': ['sugar', 'glucose', 'diabetes', 'fbs', 'hba1c'],
    'diabetes': ['sugar', 'glucose', 'diabetes', 'fbs', 'hba1c'],
    'sakkarai': ['sugar', 'glucose', 'diabetes', 'fbs', 'hba1c'],
    'thyroid': ['thyroid', 'tsh'],
    'full body': ['preventive', 'wellness', 'full body', 'health panel'],
    'master health': ['master health', 'executive', 'wellness'],
    'body checkup': ['body checkup', 'preventive', 'wellness'],
    'liver': ['lft', 'liver', 'bilirubin'],
    'kidney': ['kft', 'kidney', 'creatinine'],
    'jaundice': ['lft', 'liver', 'bilirubin'],
    'dengue': ['dengue', 'ns1', 'platelet', 'fever'],
    'malaria': ['malaria', 'smear', 'fever'],
    'typhoid': ['typhoid', 'widal', 'fever']
  },

  stopWords: [
    'i', 'have', 'had', 'am', 'having', 'feeling', 'got', 'last', 'past', 'days',
    'day', 'severe', 'mild', 'acute', 'chronic', 'pain', 'since', 'weeks', 'week',
    'from', 'suffering', 'my', 'the', 'a', 'an', 'and', 'for', 'with', 'in', 'of',
    'to', 'me', 'please', 'suggest', 'package', 'packages', 'check', 'any'
  ],

  async init() {
    try {
      this.setupEventListeners();
      this.updateCartBadgeUI();
      await this.loadPackagesCatalogue();
      this.checkUrlForPackageDetail();
    } catch (error) {
      console.error('PackagesPage init error:', error);
    }
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
    } catch (e) {
      console.warn('Error resolving targetPatientId in packages:', e);
    }
    return 'SELF';
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

  async loadPackagesCatalogue() {
    const container = document.getElementById('packages-catalogue-container');
    if (!container) return;

    try {
      if (typeof OfflineDB !== 'undefined') {
        const cached = await OfflineDB.getAll('packages');
        if (cached && cached.length > 0) {
          this.allPackages = cached;
          this.renderCategories();
          this.filterAndRender();
        } else {
          container.innerHTML = '<p class="empty-msg">Fetching latest health packages from server...</p>';
        }
      }
    } catch (e) {
      console.warn('Cache read error:', e);
      container.innerHTML = '<p class="empty-msg">Loading packages from server...</p>';
    }

    if (navigator.onLine && typeof OfflineSync !== 'undefined' && typeof OfflineSync.syncPackages === 'function') {
      setTimeout(async () => {
        try {
          const fresh = await OfflineSync.syncPackages();
          if (fresh && fresh.length > 0) {
            this.allPackages = fresh;
            this.renderCategories();
            this.filterAndRender();
          }
        } catch (err) {
          console.warn('Silent sync error:', err);
        }
      }, 600);
    }
  },

  renderCategories() {
    const track = document.getElementById('categoryFilterTrack');
    if (!track || !this.allPackages || this.allPackages.length === 0) return;

    const categories = ['All'];
    this.allPackages.forEach(pkg => {
      if (pkg.Category && typeof pkg.Category === 'string') {
        const catTrimmed = pkg.Category.trim();
        if (catTrimmed && !categories.some(c => c.toLowerCase() === catTrimmed.toLowerCase())) {
          categories.push(catTrimmed);
        }
      }
    });

    track.innerHTML = categories.map(cat => {
      const isAll = cat.toLowerCase() === 'all';
      const isActive = isAll 
        ? (this.currentCategory.toLowerCase() === 'all')
        : (this.currentCategory.toLowerCase() === cat.toLowerCase());

      const label = isAll ? 'All Packages' : cat;
      return `<button class="cat-pill ${isActive ? 'active' : ''}" onclick="PackagesPage.selectCategory('${Utils.escapeHtml(cat)}')">${Utils.escapeHtml(label)}</button>`;
    }).join('');
  },

  selectCategory(category) {
    this.currentCategory = category || 'All';

    document.querySelectorAll('.cat-pill').forEach(el => {
      const text = el.textContent.trim().toLowerCase();
      const target = this.currentCategory.toLowerCase();
      const match = (target === 'all' && (text === 'all' || text === 'all packages')) || (text === target);
      el.classList.toggle('active', match);
    });

    this.filterAndRender();
  },

  filterAndRender() {
    let filtered = this.allPackages;

    const searchInput = document.getElementById('packages-search-input');
    const query = searchInput ? searchInput.value.trim() : '';

    if (query) {
      filtered = this.filterPackagesByQuery(query);
    }

    if (this.currentCategory && this.currentCategory.toLowerCase() !== 'all') {
      filtered = filtered.filter(pkg => pkg.Category && pkg.Category.toLowerCase() === this.currentCategory.toLowerCase());
    }

    const prioritized = this.sortPackagesWithScdPriority(filtered);
    this.renderPackages(prioritized);
  },

  getCart() {
    if (typeof localStorage === 'undefined') return [];
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
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (err) {
      console.error('Cart parse error:', err);
    }
    return [];
  },

  updateCartBadgeUI() {
    const cart = this.getCart();
    const count = cart.length;
    const badges = document.querySelectorAll('.cart-badge');
    badges.forEach(b => {
      if (count > 0) {
        b.textContent = count;
        b.style.display = 'inline-block';
      } else {
        b.textContent = '0';
        b.style.display = 'none';
      }
    });
  },

  /**
   * Patient-Isolated Existence Checker
   */
  isItemInCart(packageId, packageCode, packageName) {
    const cart = this.getCart();
    const targetPatientId = this.getTargetPatientId();
    const sId = String(packageId || '').trim().toLowerCase();
    const sCode = String(packageCode || '').trim().toLowerCase();
    const sName = String(packageName || '').trim().toLowerCase();

    return cart.some(item => {
      const itemPatientId = item.patientId || 'SELF';
      if (itemPatientId !== targetPatientId) {
        return false;
      }

      const iId = String(item.PackageID || item.id || item.TestID || item.PackageCode || item.code || '').trim().toLowerCase();
      const iCode = String(item.PackageCode || item.code || item.TestCode || '').trim().toLowerCase();
      const iName = String(item.PackageName || item.name || item.TestName || '').trim().toLowerCase();
      return (sId && iId === sId) || (sCode && iCode === sCode) || (sName && iName === sName);
    });
  },

  animateFlyToCart(btnElement, isRemove = false) {
    const cartIcon = document.querySelector('.bottom-nav a[href="cart.html"]') || document.querySelector('.cart-badge');
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
      const cartBadge = document.querySelector('.cart-badge');
      if (cartBadge) {
        cartBadge.classList.remove('badge-bump');
        void cartBadge.offsetWidth;
        cartBadge.classList.add('badge-bump');
      }
    }, 550);
  },

  /**
   * Multi-tenant Isolated Toggle Cart Action
   */
  toggleCart(pkgOrId, event) {
    if (event) {
      event.stopPropagation();
    }

    let pkg = pkgOrId;
    if (typeof pkgOrId === 'string') {
      const cleanId = pkgOrId.trim();
      pkg = this.allPackages.find(p => String(p.PackageID) === cleanId || String(p.PackageCode) === cleanId);
    }

    if (!pkg) return;

    const targetPatientId = this.getTargetPatientId();
    const packageCode = pkg.PackageCode || 'PKG';
    const packageId = pkg.PackageID || packageCode;
    const packageName = pkg.PackageName || '';
    
    let cart = this.getCart();
    const isAdded = this.isItemInCart(packageId, packageCode, packageName);

    const pkgWithMeta = {
      ...pkg,
      id: packageId,
      code: packageCode,
      name: packageName,
      type: 'package',
      patientId: targetPatientId,
      addedAt: new Date().toISOString()
    };

    if (!isAdded) {
      if (typeof ConflictValidator !== 'undefined') {
        try {
          const patientOnlyCart = cart.filter(i => (i.patientId || 'SELF') === targetPatientId);
          const conflict = ConflictValidator.checkConflict(pkgWithMeta, patientOnlyCart);
          if (conflict && conflict.hasConflict) {
            if (typeof Utils !== 'undefined') {
              Utils.showToast(conflict.reason, 'error');
            } else {
              alert(conflict.reason);
            }
            return;
          }
        } catch (cvErr) {
          console.warn('Conflict check non-fatal exception:', cvErr);
        }
      }
    }

    const btnTarget = (event && event.currentTarget) ? event.currentTarget : null;
    if (btnTarget) {
      this.animateFlyToCart(btnTarget, isAdded);
    }

    if (isAdded) {
      cart = cart.filter(i => {
        const itemPatientId = i.patientId || 'SELF';
        if (itemPatientId !== targetPatientId) {
          return true;
        }

        const iId = String(i.PackageID || i.id || i.TestID || i.PackageCode || i.code || '');
        const iCode = String(i.PackageCode || i.code || i.TestCode || '');
        const iName = String(i.PackageName || i.name || i.TestName || '');
        return iId !== packageId && iCode !== packageCode && iName !== packageName;
      });

      if (typeof Utils !== 'undefined') {
        Utils.showToast(`Removed "${packageName}" from cart`, 'info');
      }
    } else {
      cart.push(pkgWithMeta);
      if (typeof Utils !== 'undefined') {
        Utils.showToast(`Added "${packageName}" to cart`, 'success');
      }
    }

    const cartStr = JSON.stringify(cart);
    localStorage.setItem('cart', cartStr);
    localStorage.setItem('selfcare_cart', cartStr);

    const activeUser = localStorage.getItem('selfcare_active_user');
    if (activeUser) {
      localStorage.setItem(`selfcare_cart_${activeUser}`, cartStr);
    }

    if (typeof App !== 'undefined') {
      App.cart = cart;
      if (typeof App.saveCart === 'function') App.saveCart(cart);
      if (typeof App.updateCartBadge === 'function') App.updateCartBadge();
    }
    if (typeof OfflineDB !== 'undefined' && typeof OfflineDB.saveCart === 'function') {
      OfflineDB.saveCart(cart);
    }

    this.updateCartBadgeUI();
    this.filterAndRender();
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
        badgeText: '⚠ Fasting Required',
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
        return 'https://heartbeats1435-coder.github.io/Selfcare-Diagnostics-app';
      }
      const pathname = window.location.pathname;
      const basePath = pathname.substring(0, pathname.lastIndexOf('/'));
      return `${window.location.origin}${basePath}`;
    }
    return 'https://heartbeats1435-coder.github.io/Selfcare-Diagnostics-app';
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
    const price = Number(pkg.OfferPrice || pkg.price || pkg.MRP || 0);
    const priceFormatted = (typeof Utils !== 'undefined' && Utils.formatCurrency)
      ? Utils.formatCurrency(price)
      : (`₹${price}`);

    let testCountText = '';
    const numCount = Number(pkg.TestsCount || pkg.ParametersCount);
    if (!isNaN(numCount) && numCount > 0) {
      testCountText = `${numCount} Tests`;
    } else {
      const items = this.extractParametersList(pkg.Parameters || pkg.Description);
      if (items && items.length > 0) {
        testCountText = `${items.length} Tests`;
      } else {
        testCountText = this.getPackageParameterCount(pkg);
      }
    }

    const baseUrl = this.getBaseAppUrl();
    const shareUrl = `${baseUrl}/index.html?package=${encodeURIComponent(pkgId)}`;
    const shareTitle = `💚 SELFCARE DIAGNOSTICS - ${pkgName}`;
    const shareBody = `💚 SELFCARE DIAGNOSTICS\n\nPackage: ${pkgName}\n${testCountText}\nOffer Price: ${priceFormatted}\n\n📍 Home Sample Collection Available\n⚡ Fast Reports\n🏠 24/7 Home Collection\n\nView Package:`;

    this.executeShare(shareTitle, shareBody, shareUrl);
  },

  renderPackages(packages) {
    const container = document.getElementById('packages-catalogue-container');
    if (!container) return;

    if (!packages || packages.length === 0) {
      container.innerHTML = '<p class="empty-msg">No health packages found. Please check your network or search term.</p>';
      return;
    }

    container.innerHTML = packages.map((pkg, idx) => {
      const packageCode = pkg.PackageCode || 'PKG';
      const packageId = pkg.PackageID || packageCode;
      const alreadyAdded = this.isItemInCart(packageId, packageCode, pkg.PackageName);
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

      const actionButton = alreadyAdded 
        ? `<button type="button" class="book-btn added-btn" onclick="PackagesPage.toggleCart('${Utils.escapeHtml(packageId)}', event)">Remove</button>`
        : `<button type="button" class="book-btn add-cart-btn" onclick="PackagesPage.toggleCart('${Utils.escapeHtml(packageId)}', event)">🛒 Add To Cart</button>`;

      return `
        <div class="package-card glass-card animate-fade ${neonCardClass}" style="position: relative;">
          ${neonBadgeHtml}
          <div class="package-card-top">
            <div class="package-card-header-row">
              <div class="package-card-badge-group" style="display: flex; align-items: center; gap: 6px;">
                <span class="package-code-tag">${Utils.escapeHtml(packageCode)}</span>
                <span class="card-fasting-tag ${fastingInfo.isFasting ? 'fasting' : 'non-fasting'}">
                  ${fastingInfo.cardText}
                </span>
              </div>
              <button type="button" class="card-share-btn" aria-label="Share Package" title="Share Package" onclick="PackagesPage.sharePackage('${Utils.escapeHtml(packageId)}', event)">
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

          <div class="know-more-row" onclick="PackagesPage.showPackageDetails('${Utils.escapeHtml(packageId)}')">
            <span class="info-icon">ⓘ</span>
            <span class="know-more-text">Know more</span>
            <span class="arrow-icon">➡</span>
          </div>

          <div class="package-pricing-row">
            <span class="mrp">${Utils.formatCurrency(pkg.MRP)}</span>
            <span class="offer-price">${Utils.formatCurrency(pkg.OfferPrice)}</span>
          </div>

          <div class="package-card-action-container">
            ${actionButton}
          </div>
        </div>
      `;
    }).join('');
  },

  filterPackagesByQuery(query) {
    if (!query) return this.sortPackagesWithScdPriority(this.allPackages);
    const cleanQuery = query.toLowerCase().trim();

    let symptomMatchedTargetTerms = [];
    Object.keys(this.symptomDictionary).forEach(symptomKey => {
      if (cleanQuery.includes(symptomKey)) {
        symptomMatchedTargetTerms.push(...this.symptomDictionary[symptomKey]);
      }
    });

    const words = cleanQuery
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !this.stopWords.includes(w));

    const results = this.allPackages.filter(pkg => {
      const name = String(pkg.PackageName || '').toLowerCase();
      const code = String(pkg.PackageCode || '').toLowerCase();
      const category = String(pkg.Category || '').toLowerCase();
      const desc = String(pkg.Description || '').toLowerCase();
      const params = String(pkg.Parameters || '').toLowerCase();
      const prep = String(pkg.Preparation || '').toLowerCase();
      const testIds = String(pkg.TestIDs || '').toLowerCase();

      const combinedMeta = `${name} ${code} ${category} ${desc} ${params} ${prep} ${testIds}`;

      if (combinedMeta.includes(cleanQuery)) {
        return true;
      }

      if (symptomMatchedTargetTerms.length > 0) {
        const matchesSymptom = symptomMatchedTargetTerms.some(term => {
          return code === term || name.includes(term) || desc.includes(term) || params.includes(term) || category.includes(term);
        });
        if (matchesSymptom) return true;
      }

      if (words.length > 0) {
        return words.some(word => combinedMeta.includes(word));
      }

      return false;
    });

    return this.sortPackagesWithScdPriority(results);
  },

  startVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      if (typeof Utils !== 'undefined') {
        Utils.showToast('Voice Search is not supported on this browser. Please use Chrome.', 'error');
      } else {
        alert('Voice Search is not supported on this browser. Please use Chrome.');
      }
      return;
    }

    const voiceBtn = document.getElementById('voice-search-btn') || document.querySelector('.voice-search-btn');
    const searchInput = document.getElementById('packages-search-input');

    if (this.speechRecognitionInstance) {
      try {
        this.speechRecognitionInstance.stop();
      } catch (e) {}
      this.speechRecognitionInstance = null;
      if (voiceBtn) {
        voiceBtn.classList.remove('listening');
        voiceBtn.innerHTML = '🎙️';
      }
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      this.speechRecognitionInstance = recognition;
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (voiceBtn) {
          voiceBtn.classList.add('listening');
          voiceBtn.innerHTML = '🔴';
        }
        if (typeof Utils !== 'undefined') {
          Utils.showToast('🎙 Listening... Speak package or symptoms', 'info');
        }
      };

      recognition.onresult = (event) => {
        const transcript = event.results && event.results[0] && event.results[0][0] ? event.results[0][0].transcript : '';
        if (transcript) {
          if (searchInput) {
            searchInput.value = transcript;
          }
          this.filterAndRender();
          if (typeof Utils !== 'undefined') {
            Utils.showToast(`Search: "${transcript}"`, 'success');
          }
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        if (typeof Utils !== 'undefined') {
          if (event.error === 'not-allowed') {
            Utils.showToast('Microphone access denied. Please allow microphone in browser.', 'error');
          } else if (event.error === 'no-speech') {
            Utils.showToast('No speech detected. Please speak clearly.', 'info');
          } else {
            Utils.showToast(`Voice Search: ${event.error}`, 'error');
          }
        }
      };

      recognition.onend = () => {
        this.speechRecognitionInstance = null;
        if (voiceBtn) {
          voiceBtn.classList.remove('listening');
          voiceBtn.innerHTML = '🎙️';
        }
      };

      recognition.start();
    } catch (err) {
      console.error('Speech recognition exception:', err);
      this.speechRecognitionInstance = null;
      if (voiceBtn) {
        voiceBtn.classList.remove('listening');
        voiceBtn.innerHTML = '🎙️';
      }
    }
  },

  setupEventListeners() {
    const searchInput = document.getElementById('packages-search-input');
    if (searchInput) {
      const parentForm = searchInput.closest('form');
      if (parentForm) {
        parentForm.addEventListener('submit', (e) => e.preventDefault());
      }

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
        }
      });

      searchInput.addEventListener('input', Utils.debounce(() => {
        this.filterAndRender();
      }, 250));
    }

    window.addEventListener('pageshow', () => {
      this.updateCartBadgeUI();
      if (this.allPackages.length === 0) {
        this.loadPackagesCatalogue();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.updateCartBadgeUI();
      }
    });
  },

  async showPackageDetails(packageId) {
    let pkg = this.allPackages.find(p => p.PackageID === packageId || p.PackageCode === packageId);
    if (!pkg && typeof OfflineDB !== 'undefined') {
      pkg = await OfflineDB.getById('packages', packageId);
    }
    if (!pkg) return;

    const actualId = pkg.PackageID || pkg.PackageCode;
    const formattedParams = this.formatParameters(pkg);
    const paramCount = this.getPackageParameterCount(pkg);
    const fastingInfo = this.getFastingDetails(pkg);
    const alreadyAdded = this.isItemInCart(actualId, pkg.PackageCode, pkg.PackageName);

    const actionBtn = alreadyAdded
      ? `<button class="modal-action-btn remove-btn" onclick="PackagesPage.toggleCart('${Utils.escapeHtml(actualId)}', event); PackagesPage.showPackageDetails('${Utils.escapeHtml(actualId)}');">🗑️ Remove from Cart</button>`
      : `<button class="modal-action-btn add-btn" onclick="PackagesPage.toggleCart('${Utils.escapeHtml(actualId)}', event); PackagesPage.showPackageDetails('${Utils.escapeHtml(actualId)}');">🛒 Add to Cart</button>`;

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
            <span class="package-avatar-icon">📦</span>
            <h3>${Utils.escapeHtml(pkg.PackageName)}</h3>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button type="button" class="card-share-btn modal-share-btn" aria-label="Share Package" title="Share Package" onclick="PackagesPage.sharePackage('${Utils.escapeHtml(actualId)}', event)">
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

  async checkUrlForPackageDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const packageId = urlParams.get('id');
    if (packageId) {
      setTimeout(() => this.showPackageDetails(packageId), 500);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  PackagesPage.init();
});

if (typeof window !== 'undefined') {
  window.PackagesPage = PackagesPage;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PackagesPage;
}
