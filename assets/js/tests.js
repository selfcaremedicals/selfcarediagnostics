/**
 * Selfcare Diagnostics - Tests Page JS (Zero-Fail Edition) v6.2.0
 * Features:
 * 1. Multi-Patient Isolated Conflict Validation.
 * 2. Target Patient Context Detection via URL & sessionStorage (targetPatientId).
 * 3. Patient-Isolated Cart Existence Checker (isItemInCart).
 * 4. Multi-tenant Vault-Aware Cart Isolation.
 * 5. Dedicated Category Switcher.
 * 6. Native Web Speech Recognition API Integration (Real-time voice search).
 * 7. Parameters Count Badge on outside card box.
 * 8. Natural Language Symptom Search Engine (Full 40 Symptoms Mapping).
 * 9. Fly-to-Cart Animation & 3D detail modal.
 * 10. Smooth 5s Auto-Slider with Touch/Hover Pause & Interval Leak Protection.
 * 11. Native Web Share API (navigator.share) with clean clipboard fallback for Tests.
 */

const TestsPage = {
  allTests: [],
  currentCategory: 'All',
  speechRecognitionInstance: null,
  sliderIntervalId: null,

  symptomDictionary: {
    'fever': ['cbc', 'esr', 'crp', 'malaria', 'widal', 'dengue', 'typhoid', 'hemogram', 't0001', 't0002', 't0041', 't0043m', 't0051w'],
    'temperature': ['cbc', 'esr', 'crp', 'malaria', 'widal', 'dengue', 'typhoid'],
    'kaichal': ['cbc', 'esr', 'crp', 'malaria', 'widal', 'dengue', 'typhoid'],
    'chills': ['cbc', 'malaria', 'dengue', 'widal'],
    'cold': ['cbc', 'crp', 'esr'],
    'joint pain': ['uric acid', 'calcium', 'vitamin d', 'crp', 'esr', 'ra factor', 'rheumatoid', 't0035', 't0041'],
    'knee pain': ['uric acid', 'calcium', 'vitamin d', 'crp', 'esr'],
    'muttu vali': ['uric acid', 'calcium', 'vitamin d', 'crp', 'esr'],
    'arthritis': ['uric acid', 'calcium', 'vitamin d', 'crp', 'esr', 'ra factor'],
    'bone pain': ['calcium', 'vitamin d', 'alkaline phosphatase', 't0035'],
    'chest pain': ['lipid profile', 'troponin', 'ck-mb', 'ecg', 'crp', 'cardiac', 'cholesterol', 't0012', 't0041'],
    'nenju vali': ['lipid profile', 'troponin', 'ck-mb', 'crp', 'cholesterol'],
    'heart': ['lipid profile', 'troponin', 'cardiac', 'cholesterol', 't0012'],
    'palpitation': ['tsh', 'thyroid', 'lipid profile', 'cbc', 'ecg'],
    'breathless': ['cbc', 'lipid profile', 'crp', 'd-dimer'],
    'tired': ['vitamin b12', 'vitamin d', 'cbc', 'tsh', 'thyroid', 'iron', 'ferritin', 'sugar', 'fbs', 'hba1c', 't0034', 't0035', 't0037'],
    'fatigue': ['vitamin b12', 'vitamin d', 'cbc', 'tsh', 'thyroid', 'iron', 'ferritin', 'sugar', 'hba1c'],
    'weakness': ['vitamin b12', 'vitamin d', 'cbc', 'tsh', 'sugar', 'hba1c', 't0034', 't0035'],
    'asathi': ['vitamin b12', 'vitamin d', 'cbc', 'tsh', 'sugar'],
    'sugar': ['sugar', 'glucose', 'fbs', 'ppbs', 'hba1c', 'diabetes', 't0008', 't0009', 't0011'],
    'diabetes': ['sugar', 'glucose', 'fbs', 'ppbs', 'hba1c', 'urine routine', 't0008', 't0009', 't0011'],
    'sakkarai': ['sugar', 'glucose', 'fbs', 'ppbs', 'hba1c'],
    'frequent urination': ['sugar', 'glucose', 'fbs', 'hba1c', 'urine routine'],
    'thyroid': ['tsh', 'thyroid', 't3', 't4', 't0037', 't0040'],
    'weight gain': ['tsh', 'thyroid', 'lipid profile', 'fbs', 'hba1c'],
    'weight loss': ['tsh', 'thyroid', 'cbc', 'fbs', 'hba1c'],
    'hair fall': ['tsh', 'thyroid', 'ferritin', 'iron', 'vitamin d', 'vitamin b12', 'cbc'],
    'jaundice': ['lft', 'liver', 'bilirubin', 'sgot', 'sgpt', 't0013'],
    'liver': ['lft', 'liver function', 'bilirubin', 'sgot', 'sgpt', 't0013'],
    'manjal kamalai': ['lft', 'liver', 'bilirubin', 't0013'],
    'kidney': ['kft', 'rft', 'creatinine', 'urea', 'kidney function', 't0014', 't0015', 't0016'],
    'creatinine': ['kft', 'rft', 'creatinine', 'urea', 't0015'],
    'swelling': ['kft', 'creatinine', 'urea', 'urine routine', 'lft', 'albumin'],
    'urine': ['urine routine', 'kft', 'creatinine', 't0046'],
    'burning urine': ['urine routine', 'kft', 't0046'],
    'dengue': ['dengue', 'platelet', 'cbc', 'ns1', 't0001'],
    'malaria': ['malaria', 'smear', 'cbc', 't0043m', 't0001'],
    'typhoid': ['widal', 'typhoid', 'cbc', 't0051w', 't0001'],
    'body pain': ['vitamin d', 'vitamin b12', 'cbc', 'esr', 'crp'],
    'headache': ['cbc', 'esr', 'blood pressure', 'sugar', 'lipid profile']
  },

  stopWords: [
    'i', 'have', 'had', 'am', 'having', 'feeling', 'got', 'last', 'past', 'days',
    'day', 'severe', 'mild', 'acute', 'chronic', 'pain', 'since', 'weeks', 'week',
    'from', 'suffering', 'my', 'the', 'a', 'an', 'and', 'for', 'with', 'in', 'of',
    'to', 'me', 'please', 'suggest', 'test', 'tests', 'check', 'any'
  ],

  async init() {
    try {
      this.setupEventListeners();
      this.setupAutoSlideCarousel();
      this.updateCartBadgeUI();
      await this.loadTestsCatalogue();
      this.checkUrlForTestDetail();
    } catch (error) {
      console.error('Tests page init error:', error);
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
      console.warn('Error resolving targetPatientId:', e);
    }
    return 'SELF';
  },

  async loadTestsCatalogue() {
    const container = document.getElementById('tests-catalogue-container');
    if (!container) return;

    if (this.allTests && this.allTests.length > 0) {
      this.renderTests(this.allTests);
    }

    try {
      const cachedTests = await OfflineDB.getAll('tests');
      if (cachedTests && cachedTests.length > 0) {
        this.allTests = cachedTests;
        this.filterAndRender();
      } else if (!this.allTests || this.allTests.length === 0) {
        container.innerHTML = '<p class="empty-msg">Loading laboratory tests...</p>';
      }
    } catch (e) {
      console.warn('Cache load error:', e);
    }

    if (navigator.onLine && typeof OfflineSync !== 'undefined') {
      setTimeout(async () => {
        try {
          const freshTests = await OfflineSync.syncTests();
          if (freshTests && freshTests.length > 0) {
            this.allTests = freshTests;
            this.filterAndRender();
          }
        } catch (err) {
          console.warn('Silent sync error:', err);
        }
      }, 1000);
    }
  },

  /**
   * Multi-tenant Isolated Cart Reader
   */
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
  isItemInCart(testId, testCode, testName) {
    const cart = this.getCart();
    const targetPatientId = this.getTargetPatientId();
    const sId = String(testId || '').trim().toLowerCase();
    const sCode = String(testCode || '').trim().toLowerCase();
    const sName = String(testName || '').trim().toLowerCase();

    return cart.some(item => {
      const itemPatientId = item.patientId || 'SELF';
      if (itemPatientId !== targetPatientId) {
        return false;
      }

      if (item.type === 'package' || item.PackageID || item.PackageCode || String(item.code || '').startsWith('PKG')) {
        return false;
      }
      const iId = String(item.TestID || item.id || item.TestCode || item.code || '').trim().toLowerCase();
      const iCode = String(item.TestCode || item.code || '').trim().toLowerCase();
      const iName = String(item.TestName || item.name || '').trim().toLowerCase();
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

  toggleCartById(testId, event) {
    const sId = String(testId).trim().toLowerCase();
    const test = this.allTests.find(t => {
      return String(t.TestID || '').trim().toLowerCase() === sId ||
             String(t.TestCode || '').trim().toLowerCase() === sId;
    });

    if (test) {
      this.toggleCart(test, event);
    }
  },

  toggleCart(testOrId, event) {
    let test = testOrId;
    if (typeof testOrId === 'string') {
      test = this.allTests.find(t => (t.TestID || t.TestCode) === testOrId);
    }
    if (!test) return;

    const targetPatientId = this.getTargetPatientId();
    const testCode = test.TestCode || 'TEST';
    const testId = test.TestID || testCode;
    const testName = test.TestName || '';
    
    let cart = this.getCart();
    const isAdded = this.isItemInCart(testId, testCode, testName);

    const testItemWithMeta = {
      ...test,
      id: testId,
      TestID: testId,
      TestCode: testCode,
      TestName: testName,
      name: testName,
      code: testCode,
      price: Number(test.OfferPrice || test.price || 0),
      mrp: Number(test.MRP || test.mrp || 0),
      type: 'test',
      patientId: targetPatientId,
      addedAt: new Date().toISOString()
    };

    if (!isAdded) {
      if (typeof ConflictValidator !== 'undefined') {
        try {
          const patientOnlyCart = cart.filter(i => (i.patientId || 'SELF') === targetPatientId);
          const conflict = ConflictValidator.checkConflict(testItemWithMeta, patientOnlyCart);
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

        if (i.type === 'package' || i.PackageID) return true;
        const iId = String(i.TestID || i.id || i.TestCode || i.code || '');
        const iCode = String(i.TestCode || i.code || '');
        const iName = String(i.TestName || i.name || '');
        return iId !== testId && iCode !== testCode && iName !== testName;
      });

      if (typeof Utils !== 'undefined') {
        Utils.showToast(`Removed "${testName}" from cart`, 'info');
      }
    } else {
      cart.push(testItemWithMeta);
      if (typeof Utils !== 'undefined') {
        Utils.showToast(`Added "${testName}" to cart`, 'success');
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

  selectCategory(category) {
    this.currentCategory = category || 'All';

    document.querySelectorAll('.cat-pill, .filter-chip').forEach(el => {
      const match = el.textContent.trim().toLowerCase() === this.currentCategory.toLowerCase();
      el.classList.toggle('active', match);
    });

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

  getTestParameterCount(test) {
    const code = (test.TestCode || '').toUpperCase();
    if (code === 'T0001') return '24 Parameters';

    const items = this.extractParametersList(test.Parameters || test.Description);
    const count = items.length;
    return count > 1 ? `${count} Parameters` : (count === 1 ? '1 Parameter' : 'Complete Panel');
  },

  formatParameters(test) {
    const code = (test.TestCode || '').toUpperCase();
    const rawParams = test.Parameters || test.Description;

    if (code === 'T0001' || (typeof rawParams === 'string' && rawParams.trim().toLowerCase() === 'cbc')) {
      const cbcList = [
        "Hemoglobin (Hb)", "Total WBC Count (TLC)", "Neutrophils", "Lymphocytes",
        "Monocytes", "Eosinophils", "Basophils", "Absolute Neutrophil Count (ANC)",
        "Absolute Lymphocyte Count (ALC)", "Absolute Monocyte Count (AMC)", "Absolute Eosinophil Count (AEC)",
        "Absolute Basophil Count (ABC)", "RBC Count", "Hematocrit / PCV", "MCV", "MCH", "MCHC",
        "RDW-CV", "RDW-SD", "Platelet Count", "MPV", "PDW", "PCT", "P-LCR"
      ];
      return cbcList.map((item, index) => `<div class="param-item"><span class="param-num">${index + 1}</span> <span>${Utils.escapeHtml(item)}</span></div>`).join('');
    }

    const items = this.extractParametersList(rawParams);
    if (items.length === 0) {
      return '<div class="param-item"><span class="param-num">1</span> <span>Complete Clinical Diagnostic Evaluation</span></div>';
    }
    return items.map((item, index) => `<div class="param-item"><span class="param-num">${index + 1}</span> <span>${Utils.escapeHtml(item)}</span></div>`).join('');
  },

  getFastingDetails(test) {
    const prep = String(test.Preparation || '').toLowerCase();
    const isFasting = Boolean(test.FastingRequired) || (prep.includes('fasting') && !prep.includes('no fasting') && !prep.includes('non fasting'));
    
    if (isFasting) {
      const match = prep.match(/(\d+\s*[-–to]\s*\d+|\d+)\s*(hrs|hours|hour)/i);
      const duration = match ? match[0] : '10 - 12 Hours';
      return {
        isFasting: true,
        badgeText: '⚠️️ Fasting Required',
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

  shareTest(testOrId, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    }

    let test = testOrId;
    if (typeof testOrId === 'string') {
      const cleanId = testOrId.trim();
      test = this.allTests.find(t => String(t.TestID) === cleanId || String(t.TestCode) === cleanId);
      if (!test) {
        try {
          const cached = JSON.parse(localStorage.getItem('cache_tests') || '[]');
          test = cached.find(t => String(t.TestID) === cleanId || String(t.TestCode) === cleanId);
        } catch (e) {}
      }
    }

    if (!test && typeof testOrId === 'object' && testOrId !== null) {
      test = testOrId;
    }

    if (!test) {
      console.warn('Test not found for sharing:', testOrId);
      return;
    }

    const rawId = test.TestID || test.TestCode || test.id || 'TEST';
    const testId = String(rawId).trim();
    const testName = test.TestName || test.name || 'Diagnostic Test';
    const price = Number(test.OfferPrice || test.price || test.MRP || 0);
    const priceFormatted = (typeof Utils !== 'undefined' && Utils.formatCurrency)
      ? Utils.formatCurrency(price)
      : (`₹${price}`);

    const baseUrl = this.getBaseAppUrl();
    const shareUrl = `${baseUrl}/index.html?test=${encodeURIComponent(testId)}`;
    const shareTitle = `🧪 SELFCARE DIAGNOSTICS - ${testName}`;
    const shareBody = `🧪 SELFCARE DIAGNOSTICS\n\nTest: ${testName}\nPrice: ${priceFormatted}\n\n📍 Home Sample Collection Available\n⚡ Fast Reports\n🏠 24/7 Home Collection\n\nView Test:`;

    this.executeShare(shareTitle, shareBody, shareUrl);
  },

  renderTests(tests) {
    const container = document.getElementById('tests-catalogue-container');
    if (!container) return;

    if (!tests || tests.length === 0) {
      container.innerHTML = '<p class="empty-msg">No laboratory tests found matching your symptoms or query.</p>';
      return;
    }

    container.innerHTML = tests.map(test => {
      const testCode = test.TestCode || 'TEST';
      const testId = test.TestID || testCode;
      const alreadyAdded = this.isItemInCart(testId, testCode, test.TestName);
      const fastingInfo = this.getFastingDetails(test);
      const paramCount = this.getTestParameterCount(test);

      const actionButton = alreadyAdded 
        ? `<button class="book-btn added-btn" onclick="TestsPage.toggleCartById('${Utils.escapeHtml(testId)}', event)">Remove</button>`
        : `<button class="book-btn add-cart-btn" onclick="TestsPage.toggleCartById('${Utils.escapeHtml(testId)}', event)">🛒 Add To Cart</button>`;

      return `
        <div class="test-card glass-card animate-fade" style="position: relative;">
          <div class="test-card-top">
            <div class="test-card-header-row">
              <div class="test-card-badge-group" style="display: flex; align-items: center; gap: 6px;">
                <span class="test-code-tag">${Utils.escapeHtml(testCode)}</span>
                <span class="card-fasting-tag ${fastingInfo.isFasting ? 'fasting' : 'non-fasting'}">
                  ${fastingInfo.cardText}
                </span>
              </div>
              <button type="button" class="card-share-btn" aria-label="Share Test" title="Share Test" onclick="TestsPage.shareTest('${Utils.escapeHtml(testId)}', event)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5" r="3"></circle>
                  <circle cx="6" cy="12" r="3"></circle>
                  <circle cx="18" cy="19" r="3"></circle>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
              </button>
            </div>
            <h4>${Utils.escapeHtml(test.TestName)}</h4>
            <div class="card-param-badge">
              🧪 <strong>${paramCount}</strong> Included
            </div>
          </div>

          <div class="know-more-row" onclick="TestsPage.showTestDetails('${Utils.escapeHtml(testId)}')">
            <span class="info-icon">ⓘ</span>
            <span class="know-more-text">Know more</span>
            <span class="arrow-icon">➡</span>
          </div>

          <div class="test-pricing-row">
            <span class="mrp">${Utils.formatCurrency(test.MRP)}</span>
            <span class="offer-price">${Utils.formatCurrency(test.OfferPrice)}</span>
          </div>

          <div class="test-card-action-container">
            ${actionButton}
          </div>
        </div>
      `;
    }).join('');
  },

  filterTestsByQuery(query) {
    if (!query) return this.allTests;
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

    return this.allTests.filter(test => {
      const name = String(test.TestName || '').toLowerCase();
      const code = String(test.TestCode || '').toLowerCase();
      const category = String(test.Category || '').toLowerCase();
      const keywords = String(test.SearchKeywords || '').toLowerCase();
      const desc = String(test.Description || test.WhyDone || '').toLowerCase();
      const symptoms = String(test.Symptoms || '').toLowerCase();
      const params = String(test.Parameters || '').toLowerCase();
      const prep = String(test.Preparation || '').toLowerCase();

      const combinedTestMeta = `${name} ${code} ${category} ${keywords} ${desc} ${symptoms} ${params} ${prep}`;

      if (combinedTestMeta.includes(cleanQuery)) {
        return true;
      }

      if (symptomMatchedTargetTerms.length > 0) {
        const matchesSymptom = symptomMatchedTargetTerms.some(term => {
          return code === term || name.includes(term) || keywords.includes(term) || desc.includes(term) || params.includes(term);
        });
        if (matchesSymptom) return true;
      }

      if (words.length > 0) {
        return words.some(word => combinedTestMeta.includes(word));
      }

      return false;
    });
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
    const searchInput = document.getElementById('tests-search-input');

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
          Utils.showToast('🎙 Listening... Speak your test or symptom now', 'info');
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
            Utils.showToast('No speech detected. Please tap mic and speak clearly.', 'info');
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
    const searchInput = document.getElementById('tests-search-input');
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
      if (this.allTests.length === 0) {
        this.loadTestsCatalogue();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.updateCartBadgeUI();
      }
    });
  },

  /**
   * Premium 3D Promo Slider Engine
   */
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

    const startSliding = () => {
      if (this.sliderIntervalId) clearInterval(this.sliderIntervalId);
      this.sliderIntervalId = setInterval(() => {
        currentSlide = (currentSlide + 1) % totalSlides;
        track.style.transform = `translateX(-${currentSlide * 100}%)`;
      }, 5000);
    };

    startSliding();

    const sliderBox = track.closest('.single-slider-box');
    if (sliderBox) {
      sliderBox.addEventListener('mouseenter', () => clearInterval(this.sliderIntervalId));
      sliderBox.addEventListener('mouseleave', () => startSliding());
      sliderBox.addEventListener('touchstart', () => clearInterval(this.sliderIntervalId), { passive: true });
      sliderBox.addEventListener('touchend', () => startSliding(), { passive: true });
    }
  },

  filterAndRender() {
    let filtered = this.allTests;

    const searchInput = document.getElementById('tests-search-input');
    const query = searchInput ? searchInput.value.trim() : '';

    if (query) {
      filtered = this.filterTestsByQuery(query);
    }

    if (this.currentCategory && this.currentCategory !== 'All') {
      filtered = filtered.filter(test => test.Category && test.Category.toLowerCase() === this.currentCategory.toLowerCase());
    }

    this.renderTests(filtered);
  },

  async showTestDetails(testId) {
    let test = this.allTests.find(t => t.TestID === testId || t.TestCode === testId);
    if (!test && typeof OfflineDB !== 'undefined') {
      test = await OfflineDB.getById('tests', testId);
    }
    if (!test) return;

    const actualId = test.TestID || test.TestCode;
    const formattedParams = this.formatParameters(test);
    const paramCount = this.getTestParameterCount(test);
    const fastingInfo = this.getFastingDetails(test);
    const alreadyAdded = this.isItemInCart(actualId, test.TestCode, test.TestName);

    const actionBtn = alreadyAdded
      ? `<button class="modal-action-btn remove-btn" onclick="TestsPage.toggleCartById('${Utils.escapeHtml(actualId)}', event); TestsPage.showTestDetails('${Utils.escapeHtml(actualId)}');">🗑️ Remove from Cart</button>`
      : `<button class="modal-action-btn add-btn" onclick="TestsPage.toggleCartById('${Utils.escapeHtml(actualId)}', event); TestsPage.showTestDetails('${Utils.escapeHtml(actualId)}');">🛒 Add to Cart</button>`;

    let modal = document.getElementById('test-detail-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'test-detail-modal';
      modal.className = 'sia-modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="sia-modal-content glass-modal-3d animate-3d-pop">
        <div class="sia-modal-header">
          <div class="modal-title-wrap">
            <span class="test-avatar-icon">🧪</span>
            <h3>${Utils.escapeHtml(test.TestName)}</h3>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button type="button" class="card-share-btn modal-share-btn" aria-label="Share Test" title="Share Test" onclick="TestsPage.shareTest('${Utils.escapeHtml(actualId)}', event)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
            </button>
            <button class="sia-close-btn" onclick="document.getElementById('test-detail-modal').style.display='none'">✕</button>
          </div>
        </div>

        <div class="sia-modal-body">
          <div class="detail-glass-card">
            <div class="info-chips-row">
              <span class="info-chip">🏷️ <strong>Code:</strong> ${Utils.escapeHtml(test.TestCode || 'TEST')}</span>
              <span class="info-chip">🔬 <strong>Category:</strong> ${Utils.escapeHtml(test.Category || 'Pathology')}</span>
              <span class="info-chip">🩸 <strong>Sample:</strong> ${Utils.escapeHtml(test.SampleType || 'Blood')}</span>
              <span class="info-chip">⏱️ <strong>TAT:</strong> ${Utils.escapeHtml(test.TAT || '24 Hours')}</span>
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
            <h4 class="section-label">Test Description</h4>
            <p class="description-text">
              ${Utils.escapeHtml(test.WhyDone || test.Description || 'Accurate clinical screening test performed under strict NABL diagnostic protocol to evaluate vital physiological parameters and track wellness.')}
            </p>
          </div>

          <div class="detail-glass-card">
            <div class="params-header-row">
              <h4 class="section-label" style="margin-bottom:0;">Included Parameters</h4>
              <span class="params-count-pill">${paramCount}</span>
            </div>
            <div class="parameters-scroll-box">
              ${formattedParams}
            </div>
          </div>

          <div class="modal-pricing-card">
            <div class="pricing-left">
              <span class="mrp-strikethrough">MRP ${Utils.formatCurrency(test.MRP)}</span>
              <span class="offer-highlight">${Utils.formatCurrency(test.OfferPrice)}</span>
            </div>
            <span class="discount-badge">Save ${(test.MRP && test.OfferPrice) ? Math.round(((test.MRP - test.OfferPrice) / test.MRP) * 100) : 0}%</span>
          </div>

          <div class="modal-footer-action">
            ${actionBtn}
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
  },

  async checkUrlForTestDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('id');
    if (testId) {
      setTimeout(() => this.showTestDetails(testId), 500);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  TestsPage.init();
});

if (typeof window !== 'undefined') {
  window.TestsPage = TestsPage;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestsPage;
}
