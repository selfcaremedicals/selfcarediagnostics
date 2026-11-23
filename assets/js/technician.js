/* file: assets/js/technician.js */
/**
 * Selfcare Diagnostics - Master Lab Walk-in Desk Engine v5.9.0
 * Features:
 * 1. Direct Razorpay Payment Link Flow (GPay, PhonePe, Paytm, Cards, EMI) — opens Razorpay directly without visiting bookings.html.
 * 2. Automatic Bill Close on Payment Confirmation + Auto-Send Official Invoice PDF to Customer WhatsApp.
 * 3. Single-Trigger Family Members Selection Popup (Never opens twice for the same mobile lookup).
 * 4. Compact 1-Page A4 Vector PDF & Print Layout (Auto-paginates cleanly to Page 2 only when 12+ tests are billed).
 * 5. Automated Google Drive Cloud Archiving for Receipts.
 */

const TechnicianApp = {
  RECEIPT_DRIVE_FOLDER_ID: '1wBorw9PqZIPhCO0cTJ6n2ecx-sYtbOEA',

  currentTech: null,
  catalogueList: [],
  isSyncingCatalogue: false,

  // Lab Cart & Membership State
  inPageCart: [],
  selectedCustomer: null,
  activeMembership: null,
  appliedCoupon: null,
  currentPaymentMode: 'CASH',
  activeCashTendered: 0,
  activeChangeReturned: 0,
  lastGeneratedBooking: null,
  activeViewingReport: null,
  activeEditingBookingId: null,

  // Family Picker Single-Trigger State
  lookupMembersList: [],
  familyPopupShownForMobile: '',

  // 5-Minute Direct Razorpay Payment Link State
  activePaymentLinkId: null,
  activePaymentShortUrl: '',
  linkExpiryTimestamp: null,
  linkCountdownTimer: null,
  linkPollingInterval: null,
  pendingBookingData: null,
  isFinalizingOnlineBill: false,

  doctorList: [
    'Self / Walk-In',
    'Dr. Rajesh MBBS (Vettuvankeni)',
    'Dr. K. Senthil MD (ECR Clinic)',
    'Dr. Anitha DGO (Neelankarai)',
    'Dr. Suresh MD (Thoraipakkam)',
    'Dr. Priya MBBS (Adyar Clinic)',
    'Dr. A. Mohamed Kathar MD (Chennai)',
    'Selfcare Clinical Pathology (In-House)'
  ],

  async init() {
    if (!this.checkSessionAndAuth()) return;
    this.injectFamilyPickerModal();
    this.initHistoryDateFilter();
    this.loadDoctorDirectory();
    this.loadPreviousBills();
    await this.loadCatalogueData();

    document.addEventListener('click', (e) => {
      const drop = document.getElementById('doctor-custom-dropdown');
      const input = document.getElementById('cust-doctor-input');
      if (drop && input && !drop.contains(e.target) && e.target !== input) {
        drop.style.display = 'none';
      }
    });
  },

  /* =========================================================
     1. SESSION-PROTECTED STAFF AUTHENTICATION
     ========================================================= */
  checkSessionAndAuth() {
    let rawTech =
      localStorage.getItem('selfcare_active_tech') ||
      localStorage.getItem('selfcare_active_technician') ||
      localStorage.getItem('selfcare_captain_session');

    if (!rawTech) {
      window.location.replace('index.html');
      return false;
    }

    let parsed = null;
    try { parsed = JSON.parse(rawTech); } catch (e) { parsed = null; }

    const staffIdCandidate = parsed?.staffId || parsed?.id || parsed?.captainId || parsed?.UserID || '';
    if (!staffIdCandidate) {
      window.location.replace('index.html');
      return false;
    }

    try {
      const listA = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');
      const listB = JSON.parse(localStorage.getItem('selfcare_admin_captains') || '[]');
      const unifiedRoster = [...listA, ...listB];
      if (unifiedRoster.length > 0) {
        const matchedAdminRecord = unifiedRoster.find(
          s => String(s.id || s.captainId || '').toLowerCase() === String(staffIdCandidate).toLowerCase()
        );
        if (matchedAdminRecord) {
          parsed = {
            ...parsed,
            id: matchedAdminRecord.id || matchedAdminRecord.captainId,
            staffId: matchedAdminRecord.id || matchedAdminRecord.captainId,
            name: matchedAdminRecord.name || parsed?.name,
            technicianName: matchedAdminRecord.name || parsed?.technicianName,
            zone: matchedAdminRecord.zone || parsed?.zone,
            branchPhone: matchedAdminRecord.phone || matchedAdminRecord.mobile || parsed?.branchPhone
          };
        }
      }
    } catch (e) {}

    let prof = {};
    try {
      prof = JSON.parse(localStorage.getItem('selfcare_customer_profile') || '{}');
    } catch (e) {}

    const activeUser = localStorage.getItem('selfcare_active_user') || '';

    let resolvedName =
      parsed?.technicianName ||
      parsed?.name ||
      parsed?.FullName ||
      parsed?.Name ||
      prof?.technicianName ||
      prof?.name ||
      prof?.FullName ||
      prof?.Name ||
      '';

    if (!resolvedName || /^\d{10,12}$/.test(String(resolvedName).replace(/\D/g, ''))) {
      if (activeUser && !/^\d{10,12}$/.test(String(activeUser).replace(/\D/g, ''))) {
        resolvedName = activeUser;
      } else {
        resolvedName = 'Mohamed Adamkani';
      }
    }

    let resolvedBranch =
      parsed?.branchName ||
      parsed?.branch ||
      parsed?.zone ||
      prof?.branchName ||
      prof?.branch ||
      'Vettuvankeni Branch';

    if (!resolvedBranch.toLowerCase().includes('branch')) {
      resolvedBranch = `${resolvedBranch} Branch`;
    }

    const branchAddress =
      parsed?.branchAddress ||
      prof?.branchAddress ||
      'Masjid Street, 4th Main Road, Mahatma Gandhi Nagar, Vettuvankeni, ECR, Chennai - 600115';

    const branchPhone =
      parsed?.branchPhone ||
      prof?.branchPhone ||
      '+91 7010174890';

    const branchGstin =
      parsed?.branchGstin ||
      prof?.branchGstin ||
      'Verified';

    this.currentTech = {
      id: staffIdCandidate,
      staffId: staffIdCandidate,
      name: resolvedName,
      technicianName: resolvedName,
      branchId: parsed?.branchId || resolvedBranch.toUpperCase().replace(/\s+/g, '_'),
      branch: resolvedBranch,
      branchName: resolvedBranch,
      zone: parsed?.zone || resolvedBranch,
      branchAddress,
      branchPhone,
      branchGstin
    };

    localStorage.setItem('selfcare_active_tech', JSON.stringify(this.currentTech));
    localStorage.setItem('selfcare_captain_session', JSON.stringify({
      id: this.currentTech.id,
      name: this.currentTech.name,
      mobile: String(branchPhone).replace(/\D/g, '').slice(-10),
      zone: this.currentTech.zone
    }));

    const nameEl = document.getElementById('tech-display-name');
    const branchEl = document.getElementById('tech-display-branch');
    if (nameEl) nameEl.textContent = this.currentTech.name;
    if (branchEl) branchEl.textContent = this.currentTech.branchName;

    return true;
  },

  logout() {
    if (confirm('Are you sure you want to log out from Operations Desk?')) {
      localStorage.removeItem('selfcare_active_tech');
      localStorage.removeItem('selfcare_active_technician');
      localStorage.removeItem('selfcare_captain_session');
      localStorage.removeItem('selfcare_tech_workspace');
      localStorage.removeItem('selfcare_active_user');
      localStorage.removeItem('selfcare_user_role');
      localStorage.removeItem('selfcare_auth_token');
      localStorage.removeItem('selfcare_customer_profile');
      window.location.replace('index.html?logout=true');
    }
  },

  /* =========================================================
     2. DOB NORMALIZER & DOB-TO-AGE AUTO-CALCULATION
     ========================================================= */
  normalizeDobForDateInput(rawDob) {
    if (!rawDob) return '';
    const s = String(rawDob).trim();
    if (!s || s === 'undefined' || s === 'null') return '';

    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return s.slice(0, 10);
    }

    const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (dmy) {
      const dd = dmy[1].padStart(2, '0');
      const mm = dmy[2].padStart(2, '0');
      const yyyy = dmy[3];
      return `${yyyy}-${mm}-${dd}`;
    }

    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    return '';
  },

  calculateAgeFromDob(dobString) {
    const normalized = this.normalizeDobForDateInput(dobString);
    if (!normalized) return '';
    const dob = new Date(normalized);
    if (isNaN(dob.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age >= 0 ? age : 0;
  },

  handleDobChange(dobVal) {
    const normalized = this.normalizeDobForDateInput(dobVal);
    const dobInput = document.getElementById('cust-dob-input');
    if (dobInput && normalized && dobInput.value !== normalized) {
      dobInput.value = normalized;
    }
    const age = this.calculateAgeFromDob(normalized || dobVal);
    const ageInput = document.getElementById('cust-age-input');
    if (ageInput && age !== '') {
      ageInput.value = age;
    }
  },

  /* =========================================================
     3. SEARCH ENGINE
     ========================================================= */
  escapeRegExp(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  searchCatalogueWithStrictPriority(query) {
    if (!query) return this.catalogueList;
    const cleanQuery = query.toLowerCase().trim();
    const scoredItems = [];

    for (const item of this.catalogueList) {
      const isPkg = item.itemType === 'package';
      const name = String(item.TestName || item.PackageName || item.name || '').toLowerCase().trim();
      const code = String(item.TestCode || item.PackageCode || item.TestID || item.PackageID || item.code || '').toLowerCase().trim();
      const params = String(item.Parameters || item.parameters || item.IncludedTests || '').toLowerCase().trim();
      const symptoms = String(item.Symptoms || item.Description || item.WhyDone || '').toLowerCase().trim();
      const keywords = String(item.SearchKeywords || '').toLowerCase().trim();

      let score = 0;

      if (!isPkg) {
        if (name === cleanQuery) score += 10000;
        else if (code === cleanQuery) score += 9000;
        else if (name.startsWith(cleanQuery)) score += 7000;
        else if (new RegExp('\\b' + this.escapeRegExp(cleanQuery) + '\\b', 'i').test(name)) score += 5000;
        else if (name.includes(cleanQuery)) score += 3500;
        else if (code.includes(cleanQuery)) score += 2500;
      }

      if (!isPkg) {
        if (symptoms.includes(cleanQuery)) score += 1500;
        if (params.includes(cleanQuery)) score += 1200;
        if (keywords.includes(cleanQuery)) score += 1000;
      }

      if (isPkg) {
        if (name === cleanQuery) score += 2000;
        else if (name.startsWith(cleanQuery)) score += 1400;
        else if (name.includes(cleanQuery)) score += 800;
        else if (params.includes(cleanQuery)) score += 400;
      }

      if (score > 0) {
        scoredItems.push({ item, score });
      }
    }

    scoredItems.sort((a, b) => b.score - a.score);
    return scoredItems.map(s => s.item);
  },

  handleSearchInput(query) {
    const q = String(query || '').trim();
    const dropdown = document.getElementById('search-results-dropdown');
    const clearBtn = document.getElementById('clear-search-btn');

    if (!q) {
      if (dropdown) dropdown.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'none';
      return;
    }

    if (clearBtn) clearBtn.style.display = 'block';
    const matches = this.searchCatalogueWithStrictPriority(q).slice(0, 12);

    if (matches.length === 0) {
      if (dropdown) {
        dropdown.innerHTML = `
          <div style="padding: 14px; text-align: center; color: #6B7280; font-size: 12px;">
            No diagnostic items matching "<strong>${Utils.escapeHtml(q)}</strong>"<br>
            <button type="button" onclick="TechnicianApp.forceSyncCatalogue()" style="margin-top:8px; padding:5px 10px; border-radius:6px; background:#FFFFFF; color:#111827; border:2px solid #111827; font-weight:700; font-size:11px; cursor:pointer;">
              Refresh from Google Sheet
            </button>
          </div>
        `;
        dropdown.style.display = 'block';
      }
      return;
    }

    if (dropdown) {
      dropdown.innerHTML = matches.map(item => {
        const isPkg = item.itemType === 'package';
        const name = item.PackageName || item.TestName || item.name || 'Diagnostic Item';
        const code = item.PackageCode || item.TestCode || item.PackageID || item.TestID || item.code || '';
        const price = Number(item.OfferPrice || item.price || 0);
        const mrp = Number(item.MRP || item.mrp || price);

        return `
          <div class="dropdown-item-row" onclick="TechnicianApp.addItemToInPageCart('${Utils.escapeHtml(code)}')">
            <div class="dd-left-meta">
              <strong>${Utils.escapeHtml(name)}</strong>
              <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:2px;">
                <span class="cat-type-pill">${isPkg ? 'PACKAGE' : 'TEST'}</span>
                <span style="font-size:9.5px; color:#6B7280;">Code: ${Utils.escapeHtml(code)} | MRP: ${Utils.formatCurrency(mrp)}</span>
              </div>
            </div>
            <div class="dd-right-price">
              <span class="dd-price">${Utils.formatCurrency(price)}</span>
              <button type="button" class="btn-add-dd">+ Add</button>
            </div>
          </div>
        `;
      }).join('');
      dropdown.style.display = 'block';
    }
  },

  clearSearch() {
    const input = document.getElementById('catalogue-search-input');
    if (input) input.value = '';
    const dropdown = document.getElementById('search-results-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) clearBtn.style.display = 'none';
  },

  /* =========================================================
     4. BACKEND & CACHE SYNC
     ========================================================= */
  async loadCatalogueData() {
    try {
      let cachedTests = [];
      let cachedPkgs = [];

      if (typeof OfflineDB !== 'undefined' && typeof OfflineDB.getAll === 'function') {
        try {
          cachedTests = (await OfflineDB.getAll('tests')) || [];
          cachedPkgs = (await OfflineDB.getAll('packages')) || [];
        } catch (e) {}
      }

      if (cachedTests.length === 0) cachedTests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || localStorage.getItem('cache_tests') || '[]');
      if (cachedPkgs.length === 0) cachedPkgs = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || localStorage.getItem('cache_packages') || '[]');

      if (cachedTests.length > 0 || cachedPkgs.length > 0) {
        this.catalogueList = [
          ...cachedTests.map(t => ({ ...t, itemType: 'test' })),
          ...cachedPkgs.map(p => ({ ...p, itemType: 'package' }))
        ];
        this.updateCounterBadge(this.catalogueList.length);
      }

      if (navigator.onLine) {
        this.fetchLiveCatalogueFromServer();
      }
    } catch (err) {
      console.error(err);
    }
  },

  async fetchLiveCatalogueFromServer() {
    if (this.isSyncingCatalogue) return;
    this.isSyncingCatalogue = true;

    try {
      let freshTests = [];
      let freshPkgs = [];

      if (typeof Api !== 'undefined') {
        try {
          const resT = await (Api.getTests ? Api.getTests() : Api.request('getTests'));
          freshTests = resT?.tests || resT?.data?.tests || (Array.isArray(resT?.data) ? resT.data : (Array.isArray(resT) ? resT : []));
          const resP = await (Api.getPackages ? Api.getPackages() : Api.request('getPackages'));
          freshPkgs = resP?.packages || resP?.data?.packages || (Array.isArray(resP?.data) ? resP.data : (Array.isArray(resP) ? resP : []));
        } catch (apiErr) {}
      }

      if (freshTests.length > 0 || freshPkgs.length > 0) {
        this.catalogueList = [
          ...freshTests.map(t => ({ ...t, itemType: 'test' })),
          ...freshPkgs.map(p => ({ ...p, itemType: 'package' }))
        ];

        if (typeof OfflineDB !== 'undefined') {
          if (freshTests.length > 0 && typeof OfflineDB.save === 'function') await OfflineDB.save('tests', freshTests);
          if (freshPkgs.length > 0 && typeof OfflineDB.save === 'function') await OfflineDB.save('packages', freshPkgs);
        }

        if (freshTests.length > 0) localStorage.setItem('cache_tests', JSON.stringify(freshTests));
        if (freshPkgs.length > 0) localStorage.setItem('cache_packages', JSON.stringify(freshPkgs));

        this.updateCounterBadge(this.catalogueList.length);
      }
    } catch (err) {
      console.warn(err);
    } finally {
      this.isSyncingCatalogue = false;
      this.updateCounterBadge(this.catalogueList.length);
    }
  },

  updateCounterBadge(count) {
    const counterBadge = document.getElementById('cat-items-counter');
    if (counterBadge) {
      counterBadge.innerHTML = count > 0 
        ? `${count} Live Items (Tap to sync)` 
        : `Unified Catalogue`;
    }
  },

  async forceSyncCatalogue() {
    Utils.showToast('Fetching latest prices from Google Sheet...', 'info');
    await this.fetchLiveCatalogueFromServer();
    Utils.showToast(`Updated! ${this.catalogueList.length} items ready.`, 'success');
  },

  /* =========================================================
     5. CART, COUPON/REFERRAL & VIP MEMBERSHIP AUTO DISCOUNT
     ========================================================= */
  checkCartConflict(newItem) {
    const alertBox = document.getElementById('cart-conflict-alert-box');
    if (!alertBox) return false;

    if (this.inPageCart.some(i => i.code === newItem.code || i.id === newItem.id)) {
      Utils.showToast(`"${newItem.name}" is already in bill!`, 'info');
      return true;
    }
    alertBox.style.display = 'none';
    return false;
  },

  addItemToInPageCart(itemCode) {
    const item = this.catalogueList.find(i => (
      String(i.TestCode).trim() === String(itemCode).trim() || 
      String(i.PackageCode).trim() === String(itemCode).trim() || 
      String(i.TestID).trim() === String(itemCode).trim() || 
      String(i.PackageID).trim() === String(itemCode).trim() || 
      String(i.code).trim() === String(itemCode).trim()
    ));
    if (!item) return;

    const id = item.PackageID || item.TestID || item.PackageCode || item.TestCode || item.id;
    const name = item.PackageName || item.TestName || item.name;
    const isPkg = item.itemType === 'package';

    const cartItem = {
      id: id,
      code: item.PackageCode || item.TestCode || id,
      name: name,
      price: Number(item.OfferPrice || item.price || 0),
      mrp: Number(item.MRP || item.mrp || item.OfferPrice || 0),
      type: isPkg ? 'package' : 'test',
      TAT: item.TAT || '6–12 Hours'
    };

    if (this.checkCartConflict(cartItem)) return;

    this.inPageCart.push(cartItem);
    this.clearSearch();
    this.renderInPageCart();
    Utils.showToast(`Added "${name}" to bill`, 'success');
  },

  removeItemFromInPageCart(idx) {
    this.inPageCart.splice(idx, 1);
    this.renderInPageCart();
  },

  clearInPageCart() {
    this.inPageCart = [];
    this.appliedCoupon = null;
    const coupInput = document.getElementById('lab-coupon-code-input');
    if (coupInput) coupInput.value = '';
    const statusMsg = document.getElementById('coupon-status-msg');
    if (statusMsg) statusMsg.style.display = 'none';
    const cashInput = document.getElementById('cash-tendered-input');
    if (cashInput) cashInput.value = '';
    this.activeCashTendered = 0;
    this.activeChangeReturned = 0;
    this.renderInPageCart();
  },

  async applyCouponCode() {
    const input = document.getElementById('lab-coupon-code-input');
    const statusMsg = document.getElementById('coupon-status-msg');
    const code = String(input?.value || '').trim().toUpperCase();

    if (!code) {
      this.appliedCoupon = null;
      if (statusMsg) statusMsg.style.display = 'none';
      this.renderInPageCart();
      Utils.showToast('Please enter a referral or coupon code', 'info');
      return;
    }

    let discountPercent = 10;
    let isReferral = code.startsWith('REF') || code.startsWith('SCD') || code.includes('REFER');
    let labelText = isReferral ? `Referral Code (${code})` : `Coupon (${code})`;

    if (navigator.onLine && typeof Api !== 'undefined') {
      try {
        const res = await Api.request('validateCoupon', { code });
        const cData = res?.data || res;
        if (cData && cData.valid) {
          discountPercent = Number(cData.percent || cData.discountPercent || 10);
          isReferral = Boolean(cData.isReferral || isReferral);
          labelText = isReferral ? `Referral Code (${code})` : `Coupon (${code})`;
        }
      } catch (e) {}
    }

    this.appliedCoupon = {
      code,
      percent: discountPercent,
      isReferral,
      label: labelText
    };

    if (statusMsg) {
      statusMsg.style.display = 'block';
      statusMsg.textContent = `✓ ${labelText} applied (${discountPercent}% Off)`;
    }

    this.renderInPageCart();
    Utils.showToast(`${labelText} applied!`, 'success');
  },

  calculateDiscountsForSubtotal(subtotal) {
    let membershipDiscount = 0;
    if (this.activeMembership && this.activeMembership.isMember) {
      membershipDiscount = Math.round(subtotal * 0.10);
    }

    let couponDiscount = 0;
    if (this.appliedCoupon) {
      const pct = Number(this.appliedCoupon.percent || this.appliedCoupon.discountPercent || 10);
      couponDiscount = Math.min(2499, Math.round((subtotal * pct) / 100));
    }

    return { membershipDiscount, couponDiscount };
  },

  renderInPageCart() {
    const container = document.getElementById('inpage-cart-items-list');
    const countBadge = document.getElementById('inpage-cart-count');
    const mrpEl = document.getElementById('lab-bill-mrp');
    const discountLineEl = document.getElementById('lab-bill-discount-line');
    const memRow = document.getElementById('membership-discount-row');
    const memLineEl = document.getElementById('lab-bill-membership-line');
    const couponRow = document.getElementById('coupon-discount-row');
    const couponLabelEl = document.getElementById('lab-bill-coupon-label');
    const couponLineEl = document.getElementById('lab-bill-coupon-line');
    const grandTotalEl = document.getElementById('lab-bill-grand-total');

    if (!container) return;
    if (countBadge) countBadge.textContent = `${this.inPageCart.length} Items`;

    if (this.inPageCart.length === 0) {
      container.innerHTML = `
        <div class="empty-inpage-cart">
          <p style="margin:0;">No tests or packages added yet. Search above to add diagnostic items.</p>
        </div>
      `;
      if (mrpEl) mrpEl.textContent = '₹0';
      if (discountLineEl) discountLineEl.textContent = '- ₹0';
      if (memRow) memRow.style.display = 'none';
      if (couponRow) couponRow.style.display = 'none';
      if (grandTotalEl) grandTotalEl.textContent = '₹0';
      return;
    }

    let totalMrp = 0;
    let totalSubtotal = 0;

    container.innerHTML = this.inPageCart.map((item, idx) => {
      totalMrp += item.mrp;
      totalSubtotal += item.price;

      return `
        <div class="inpage-cart-item">
          <div class="cart-item-info">
            <strong>${Utils.escapeHtml(item.name)}</strong>
            <span class="cat-type-pill">${item.type === 'package' ? 'PACKAGE' : 'TEST'}</span>
            <span style="font-size:10px; color:#6B7280; margin-left:4px;">MRP: ${Utils.formatCurrency(item.mrp)}</span>
          </div>
          <div class="cart-item-right">
            <strong style="color: #111827; font-size: 13px;">${Utils.formatCurrency(item.price)}</strong>
            <button type="button" class="btn-del-item" onclick="TechnicianApp.removeItemFromInPageCart(${idx})">✕</button>
          </div>
        </div>
      `;
    }).join('');

    const regularDiscount = Math.max(0, totalMrp - totalSubtotal);
    const { membershipDiscount, couponDiscount } = this.calculateDiscountsForSubtotal(totalSubtotal);
    const finalPayable = Math.max(0, totalSubtotal - membershipDiscount - couponDiscount);

    if (mrpEl) mrpEl.textContent = Utils.formatCurrency(totalMrp);
    if (discountLineEl) discountLineEl.textContent = `- ${Utils.formatCurrency(regularDiscount)}`;

    if (membershipDiscount > 0) {
      if (memRow) memRow.style.display = 'flex';
      if (memLineEl) memLineEl.textContent = `- ${Utils.formatCurrency(membershipDiscount)}`;
    } else {
      if (memRow) memRow.style.display = 'none';
    }

    if (this.appliedCoupon && couponDiscount > 0) {
      if (couponRow) couponRow.style.display = 'flex';
      if (couponLabelEl) couponLabelEl.textContent = `${this.appliedCoupon.label || 'Referral / Coupon Discount'}:`;
      if (couponLineEl) couponLineEl.textContent = `- ${Utils.formatCurrency(couponDiscount)}`;
    } else {
      if (couponRow) couponRow.style.display = 'none';
    }

    if (grandTotalEl) grandTotalEl.textContent = Utils.formatCurrency(finalPayable);
    this.calculateCashChange(this.activeCashTendered);
  },

  /* =========================================================
     6. SINGLE-TRIGGER CUSTOMER + FAMILY MEMBERS POPUP
     ========================================================= */
  injectFamilyPickerModal() {
    if (document.getElementById('family-member-picker-modal')) return;
    const modalHtml = `
      <div id="family-member-picker-modal" class="sia-modal-overlay no-print-section" style="display: none; z-index: 4500;">
        <div class="sia-modal-content minimal-modal" style="max-width: 440px; padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #E5E7EB; padding-bottom: 10px; margin-bottom: 12px;">
            <div>
              <h3 style="color: #111827; margin: 0; font-size: 15.5px;">Select Patient for Billing</h3>
              <span id="fam-picker-subtitle" style="font-size: 11px; color: #6B7280;">Primary User & Family Members</span>
            </div>
            <button type="button" class="act-btn-close" onclick="TechnicianApp.closeModal('family-member-picker-modal')">✕</button>
          </div>

          <div id="fam-picker-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto;"></div>

          <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #E5E7EB; text-align: right;">
            <button type="button" class="btn-clear-cart" style="padding: 7px 14px; font-size: 11.5px;" onclick="TechnicianApp.closeModal('family-member-picker-modal')">
              + Enter New Patient Manually
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },

  extractSalutationAndName(fullName, explicitSalutation = '') {
    let raw = String(fullName || '').trim();
    let sal = explicitSalutation || '';
    const salMatch = raw.match(/^(Mr\.|Mrs\.|Ms\.|Master|Dr\.|Baby)\s+/i);
    if (salMatch) {
      if (!sal) {
        const prefix = salMatch[1].toLowerCase();
        if (prefix.startsWith('mrs')) sal = 'Mrs.';
        else if (prefix.startsWith('ms')) sal = 'Ms.';
        else if (prefix.startsWith('master')) sal = 'Master';
        else if (prefix.startsWith('dr')) sal = 'Dr.';
        else if (prefix.startsWith('baby')) sal = 'Baby';
        else sal = 'Mr.';
      }
      raw = raw.replace(salMatch[0], '').trim();
    }
    return { salutation: sal || 'Mr.', cleanName: raw };
  },

  applySelectedPersonToForm(person, mobile) {
    const nameInput = document.getElementById('cust-name-input');
    const ageInput = document.getElementById('cust-age-input');
    const dobInput = document.getElementById('cust-dob-input');
    const genderSelect = document.getElementById('cust-gender-select');
    const salutationSelect = document.getElementById('cust-salutation-select');
    const emailInput = document.getElementById('cust-email-input');
    const idTag = document.getElementById('disp-patient-id-tag');

    const { salutation, cleanName } = this.extractSalutationAndName(
      person.name || person.FullName || person.Name || '',
      person.salutation || person.Salutation || ''
    );

    if (salutationSelect) {
      let resolvedSal = salutation;
      if (!person.salutation && person.gender) {
        const g = String(person.gender).toLowerCase();
        if (g === 'female' && resolvedSal === 'Mr.') resolvedSal = 'Ms.';
      }
      salutationSelect.value = resolvedSal;
    }

    if (nameInput) nameInput.value = cleanName;
    if (emailInput) emailInput.value = person.email || person.Email || '';
    if (genderSelect && (person.gender || person.Gender)) {
      const gRaw = String(person.gender || person.Gender).trim();
      const gNorm = gRaw.charAt(0).toUpperCase() + gRaw.slice(1).toLowerCase();
      if (['Male', 'Female', 'Other'].includes(gNorm)) {
        genderSelect.value = gNorm;
      }
    }

    const rawDob = person.dob || person.DOB || person.dateOfBirth || '';
    const normDob = this.normalizeDobForDateInput(rawDob);
    if (dobInput) {
      dobInput.value = normDob;
    }

    if (normDob) {
      const calcAge = this.calculateAgeFromDob(normDob);
      if (ageInput && calcAge !== '') ageInput.value = calcAge;
    } else if ((person.age || person.Age) && ageInput) {
      ageInput.value = person.age || person.Age;
    }

    const memStatus = String(person.membership || person.Membership || '').trim().toUpperCase();
    const isVip = (memStatus.includes('MEMBER') || memStatus.includes('VIP')) && !memStatus.includes('REGULAR');

    const badgeId = person.id || person.UserID || person.memberId || `SCD_CUST_${mobile.slice(-6)}`;
    if (isVip) {
      this.activeMembership = { isMember: true, type: 'VIP', discountPercent: 10 };
      if (idTag) {
        idTag.className = 'id-tag-pill vip-member-badge';
        idTag.innerHTML = `VIP MEMBER (${badgeId})`;
      }
    } else {
      this.activeMembership = null;
      if (idTag) {
        idTag.className = 'id-tag-pill';
        idTag.textContent = `${person.relationLabel || 'ID'}: ${badgeId}`;
      }
    }

    this.renderInPageCart();
  },

  selectFamilyMemberByIndex(idx) {
    const person = this.lookupMembersList[idx];
    const mobile = String(document.getElementById('cust-mobile-input')?.value || '').replace(/\D/g, '').slice(0, 10);
    if (!person) return;

    this.applySelectedPersonToForm(person, mobile);
    this.closeModal('family-member-picker-modal');
    Utils.showToast(`Selected: ${person.name} (${person.relationLabel || 'Patient'})`, 'success');
  },

  renderFamilyPickerList(mobile) {
    this.injectFamilyPickerModal();
    const listEl = document.getElementById('fam-picker-list');
    const subEl = document.getElementById('fam-picker-subtitle');
    if (!listEl) return;

    if (subEl) {
      subEl.textContent = `Mobile: +91 ${mobile} • ${this.lookupMembersList.length} Profiles Found`;
    }

    listEl.innerHTML = this.lookupMembersList.map((m, idx) => {
      const dobDisp = this.normalizeDobForDateInput(m.dob || m.DOB || '');
      const ageDisp = dobDisp ? `${this.calculateAgeFromDob(dobDisp)} Yrs` : (m.age ? `${m.age} Yrs` : '');
      const roleTag = idx === 0 ? 'PRIMARY USER' : String(m.relation || m.relationLabel || 'FAMILY MEMBER').toUpperCase();

      return `
        <div onclick="TechnicianApp.selectFamilyMemberByIndex(${idx})"
             style="padding: 11px 13px; border: 1.5px solid ${idx === 0 ? '#111827' : '#CBD5E1'}; border-radius: 8px; background: #FFFFFF; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <div>
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px;">
              <strong style="font-size: 13px; color: #111827;">${Utils.escapeHtml(m.name || 'Member')}</strong>
              <span style="font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: #F3F4F6; border: 1px solid #D1D5DB; color: #111827;">${Utils.escapeHtml(roleTag)}</span>
            </div>
            <div style="font-size: 11px; color: #4B5563;">
              ${Utils.escapeHtml(m.gender || 'Male')} ${ageDisp ? `• ${ageDisp}` : ''} ${dobDisp ? `• DOB: ${dobDisp}` : ''}
            </div>
          </div>
          <span style="font-size: 11.5px; font-weight: 800; color: #111827; border: 1.5px solid #111827; padding: 4px 10px; border-radius: 6px;">Select ➔</span>
        </div>
      `;
    }).join('');
  },

  openFamilyMemberSelectModal(mobile, forceOpen = false) {
    this.renderFamilyPickerList(mobile);
    const modal = document.getElementById('family-member-picker-modal');
    if (!modal) return;

    if (!forceOpen && this.familyPopupShownForMobile === mobile) {
      return;
    }

    this.familyPopupShownForMobile = mobile;
    modal.style.display = 'flex';
  },

  collectLocalCustomerAndFamily(mobile) {
    const members = [];
    const seenKeys = new Set();

    const pushUnique = (obj, defaultRel = 'Primary User') => {
      if (!obj || !(obj.name || obj.FullName || obj.Name || obj.patientName)) return;
      const rawName = obj.name || obj.FullName || obj.Name || obj.patientName;
      const { cleanName, salutation } = this.extractSalutationAndName(rawName, obj.salutation || obj.Salutation || '');
      const key = cleanName.toLowerCase();
      if (!cleanName || seenKeys.has(key)) return;
      seenKeys.add(key);

      members.push({
        id: obj.id || obj.UserID || obj.memberId || `SCD_${mobile.slice(-4)}_${members.length + 1}`,
        name: cleanName,
        salutation,
        dob: this.normalizeDobForDateInput(obj.dob || obj.DOB || obj.dateOfBirth || ''),
        age: obj.age || obj.Age || obj.patientAge || '',
        gender: obj.gender || obj.Gender || obj.patientGender || 'Male',
        email: obj.email || obj.Email || obj.patientEmail || '',
        membership: obj.membership || obj.Membership || 'Regular',
        relationLabel: obj.relation || obj.relationship || defaultRel
      });
    };

    try {
      const rawProf = localStorage.getItem(`selfcare_profile_${mobile}`);
      if (rawProf) {
        const p = JSON.parse(rawProf);
        pushUnique(p, 'Primary User');
        if (Array.isArray(p.familyMembers)) {
          p.familyMembers.forEach(fm => pushUnique(fm, fm.relation || 'Family Member'));
        }
      }
    } catch (e) {}

    try {
      const famRaw = localStorage.getItem(`selfcare_family_${mobile}`);
      if (famRaw) {
        const famArr = JSON.parse(famRaw);
        if (Array.isArray(famArr)) {
          famArr.forEach(fm => pushUnique(fm, fm.relation || 'Family Member'));
        }
      }
    } catch (e) {}

    try {
      const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
      bookings.forEach(b => {
        const bPhone = String(b.patientPhone || '').replace(/\D/g, '').slice(-10);
        if (bPhone === mobile) {
          pushUnique({
            name: b.patientName,
            salutation: b.salutation,
            dob: b.dob,
            age: b.patientAge,
            gender: b.patientGender,
            email: b.patientEmail
          }, members.length === 0 ? 'Primary User' : 'Previous Patient');
        }
      });
    } catch (e) {}

    return members;
  },

  async handleCustomerMobileLookup(val) {
    const mobile = String(val).replace(/\D/g, '').slice(0, 10);
    if (mobile.length < 10) {
      this.familyPopupShownForMobile = '';
      return;
    }

    // STEP A: 0ms Instant Local Lookup
    const localMembers = this.collectLocalCustomerAndFamily(mobile);
    if (localMembers.length > 0) {
      this.lookupMembersList = localMembers;
      this.applySelectedPersonToForm(localMembers[0], mobile);
      if (localMembers.length > 1) {
        this.openFamilyMemberSelectModal(mobile, false);
      }
    } else {
      this.activeMembership = null;
      const idTag = document.getElementById('disp-patient-id-tag');
      if (idTag) {
        idTag.className = 'id-tag-pill';
        idTag.textContent = `ID: SCD_CUST_${mobile.slice(-6)}`;
      }
      this.renderInPageCart();
    }

    // STEP B: Parallel Live Cloud Sync
    if (navigator.onLine && typeof Api !== 'undefined') {
      try {
        const [profRes, famRes] = await Promise.all([
          Api.request('getProfile', { userId: mobile, mobile }).catch(() => null),
          Api.request('getFamilyMembers', { userId: mobile, mobile }).catch(() => null)
        ]);

        const u = profRes?.data || profRes?.profile || profRes?.user;
        const cloudMembers = [];
        const seen = new Set();

        const addCloudPerson = (obj, relLabel) => {
          if (!obj) return;
          const rawName = obj.Name || obj.name || obj.FullName || obj.memberName || '';
          const { cleanName, salutation } = this.extractSalutationAndName(rawName, obj.Salutation || obj.salutation || '');
          if (!cleanName || seen.has(cleanName.toLowerCase())) return;
          seen.add(cleanName.toLowerCase());

          cloudMembers.push({
            id: obj.UserID || obj.MemberID || obj.id || `CUST_${mobile}`,
            name: cleanName,
            salutation,
            dob: this.normalizeDobForDateInput(obj.DOB || obj.dob || obj.DateOfBirth || ''),
            age: obj.Age || obj.age || '',
            gender: obj.Gender || obj.gender || 'Male',
            email: obj.Email || obj.email || '',
            membership: obj.Membership || obj.membership || 'Regular',
            relationLabel: obj.Relation || obj.relation || relLabel
          });
        };

        if (u && (u.Name || u.name)) {
          addCloudPerson(u, 'Primary User');
        }

        const famList = famRes?.members || famRes?.family || famRes?.data || (Array.isArray(famRes) ? famRes : []);
        if (Array.isArray(famList)) {
          famList.forEach(fm => addCloudPerson(fm, fm.Relation || fm.relation || 'Family Member'));
        }

        localMembers.forEach(lm => {
          if (!seen.has(lm.name.toLowerCase())) {
            seen.add(lm.name.toLowerCase());
            cloudMembers.push(lm);
          }
        });

        if (cloudMembers.length > 0) {
          this.lookupMembersList = cloudMembers;

          localStorage.setItem(`selfcare_profile_${mobile}`, JSON.stringify({
            ...cloudMembers[0],
            mobile,
            familyMembers: cloudMembers.slice(1)
          }));

          const currentNameVal = String(document.getElementById('cust-name-input')?.value || '').trim();
          if (!currentNameVal || currentNameVal.toLowerCase() === cloudMembers[0].name.toLowerCase()) {
            this.applySelectedPersonToForm(cloudMembers[0], mobile);
          }

          if (cloudMembers.length > 1) {
            if (this.familyPopupShownForMobile !== mobile) {
              this.openFamilyMemberSelectModal(mobile, false);
            } else {
              this.renderFamilyPickerList(mobile);
            }
          }
        }
      } catch (err) {}
    }
  },

  /* =========================================================
     7. REFERRING DOCTOR DIRECTORY & BACKEND SYNC
     ========================================================= */
  loadDoctorDirectory() {
    try {
      const stored = JSON.parse(localStorage.getItem('selfcare_doctor_directory') || '[]');
      if (Array.isArray(stored) && stored.length > 0) {
        this.doctorList = Array.from(new Set([...this.doctorList, ...stored]));
      }
    } catch (e) {}
  },

  showDoctorDropdown() {
    this.filterDoctorDropdown(document.getElementById('cust-doctor-input')?.value || '');
  },

  filterDoctorDropdown(query) {
    const drop = document.getElementById('doctor-custom-dropdown');
    if (!drop) return;
    const q = String(query || '').toLowerCase().trim();
    const list = this.doctorList.filter(d => d.toLowerCase().includes(q));

    if (list.length === 0) {
      drop.style.display = 'none';
      return;
    }

    drop.innerHTML = list.map(doc => `
      <div class="doctor-opt-row" onclick="TechnicianApp.selectDoctor('${Utils.escapeHtml(doc)}')">
        ${Utils.escapeHtml(doc)}
      </div>
    `).join('');
    drop.style.display = 'block';
  },

  selectDoctor(docName) {
    const input = document.getElementById('cust-doctor-input');
    if (input) input.value = docName;
    const drop = document.getElementById('doctor-custom-dropdown');
    if (drop) drop.style.display = 'none';
  },

  setSelfDoctor() {
    this.selectDoctor('Self / Walk-In');
  },

  saveDoctorToDirectory(docName) {
    if (!docName || docName.includes('Self / Walk-In')) return;
    if (!this.doctorList.includes(docName)) {
      this.doctorList.push(docName);
      localStorage.setItem('selfcare_doctor_directory', JSON.stringify(this.doctorList));
    }
    if (navigator.onLine && typeof Api !== 'undefined') {
      Api.request('saveDoctor', {
        doctorName: docName,
        branchId: this.currentTech?.branchId || 'VETTUVANKENI_BRANCH',
        branchName: this.currentTech?.branchName || 'Vettuvankeni Branch',
        addedBy: this.currentTech?.name || 'Mohamed Adamkani'
      }).catch(() => {});
    }
  },

  /* =========================================================
     8. PAYMENT MODE & CASH RECONCILIATION
     ========================================================= */
  handlePaymentModeChange(mode) {
    this.currentPaymentMode = mode;
    document.getElementById('pay-mode-lbl-cash')?.classList.toggle('active', mode === 'CASH');
    document.getElementById('pay-mode-lbl-link')?.classList.toggle('active', mode === 'LINK');
    document.getElementById('pay-mode-lbl-upi')?.classList.toggle('active', mode === 'UPI_QR');

    const cashPanel = document.getElementById('cash-calculator-panel');
    const linkPanel = document.getElementById('link-payment-panel');
    const upiPanel = document.getElementById('upi-counter-panel');
    const submitBtn = document.getElementById('btn-submit-lab-booking');

    if (cashPanel) cashPanel.style.display = mode === 'CASH' ? 'block' : 'none';
    if (linkPanel) linkPanel.style.display = mode === 'LINK' ? 'block' : 'none';
    if (upiPanel) upiPanel.style.display = mode === 'UPI_QR' ? 'block' : 'none';

    if (submitBtn) {
      if (mode === 'LINK') {
        submitBtn.textContent = 'Send WhatsApp to Pay Bill';
      } else if (mode === 'UPI_QR') {
        submitBtn.textContent = 'Verify Counter QR & Generate Bill';
      } else {
        submitBtn.textContent = 'Generate Bill';
      }
    }
  },

  calculateCashChange(val) {
    this.activeCashTendered = Number(val) || 0;
    const grandTotalEl = document.getElementById('lab-bill-grand-total');
    const grandTotal = parseInt(String(grandTotalEl?.textContent || '0').replace(/\D/g, '')) || 0;
    this.activeChangeReturned = Math.max(0, this.activeCashTendered - grandTotal);

    const changeEl = document.getElementById('disp-change-return-amount');
    if (changeEl) {
      changeEl.textContent = Utils.formatCurrency(this.activeChangeReturned);
    }
  },

  /* =========================================================
     9. CHECKOUT ENGINE
     ========================================================= */
  handleCheckoutClick() {
    if (this.inPageCart.length === 0) {
      Utils.showToast('Please add at least one test to bill', 'error');
      return;
    }

    const mobile = document.getElementById('cust-mobile-input').value.trim();
    const salutation = document.getElementById('cust-salutation-select').value;
    const name = document.getElementById('cust-name-input').value.trim();
    const age = document.getElementById('cust-age-input').value.trim();
    const dob = this.normalizeDobForDateInput(document.getElementById('cust-dob-input').value.trim());
    const gender = document.getElementById('cust-gender-select').value;
    const email = document.getElementById('cust-email-input').value.trim();
    const doctor = document.getElementById('cust-doctor-input').value.trim() || 'Self / Walk-In';

    if (mobile.length !== 10 || !name || !age) {
      Utils.showToast('Please enter mobile, full name and age', 'error');
      return;
    }

    const totalMrp = this.inPageCart.reduce((sum, it) => sum + it.mrp, 0);
    const subtotal = this.inPageCart.reduce((sum, it) => sum + it.price, 0);
    const { membershipDiscount, couponDiscount } = this.calculateDiscountsForSubtotal(subtotal);
    const finalAmount = Math.max(0, subtotal - membershipDiscount - couponDiscount);

    this.pendingBookingData = {
      bookingId: `SCDLAB${Math.floor(100000 + Math.random() * 900000)}`,
      salutation,
      name: `${salutation} ${name}`,
      rawName: name,
      mobile,
      age,
      dob,
      gender,
      email,
      doctor,
      referringDoctor: doctor,
      doctorName: doctor,
      itemsSnapshot: [...this.inPageCart],
      finalAmount,
      totalMrp,
      subtotal,
      membershipDiscount,
      couponDiscount,
      couponCode: this.appliedCoupon?.code || '',
      couponLabel: this.appliedCoupon?.label || '',
      isReferralDiscount: Boolean(this.appliedCoupon?.isReferral),
      billedByTechId: this.currentTech?.staffId || 'SCDTECH001',
      billedByTechName: this.currentTech?.name || 'Mohamed Adamkani',
      technicianName: this.currentTech?.name || 'Mohamed Adamkani',
      branchId: this.currentTech?.branchId || 'VETTUVANKENI_BRANCH',
      branchName: this.currentTech?.branchName || 'Vettuvankeni Branch',
      branch: this.currentTech?.branchName || 'Vettuvankeni Branch',
      branchAddress: this.currentTech?.branchAddress,
      branchPhone: this.currentTech?.branchPhone,
      branchGstin: this.currentTech?.branchGstin
    };

    if (this.currentPaymentMode === 'CASH') {
      const cashTendered = this.activeCashTendered;
      if (!cashTendered || cashTendered < finalAmount) {
        Utils.showToast(`Please enter cash tendered. Customer must give at least ${Utils.formatCurrency(finalAmount)}`, 'error');
        document.getElementById('cash-tendered-input')?.focus();
        return;
      }

      document.getElementById('conf-cash-tendered').textContent = Utils.formatCurrency(cashTendered);
      document.getElementById('conf-grand-total').textContent = Utils.formatCurrency(finalAmount);
      document.getElementById('conf-cash-received').textContent = Utils.formatCurrency(cashTendered);
      document.getElementById('conf-change-return').textContent = Utils.formatCurrency(this.activeChangeReturned);
      this.openModal('cash-confirm-modal');
      return;
    }

    if (this.currentPaymentMode === 'UPI_QR') {
      document.getElementById('conf-upi-grand-total').textContent = Utils.formatCurrency(finalAmount);
      this.openModal('upi-confirm-modal');
      return;
    }

    // WhatsApp Link Mode: Create Direct Razorpay Link & open Customer WhatsApp
    this.isFinalizingOnlineBill = false;
    this.initiateCustomerPaymentLink(this.pendingBookingData, true);
  },

  confirmCashAndGenerateBill() {
    this.closeModal('cash-confirm-modal');
    this.saveDoctorToDirectory(this.pendingBookingData.doctor);

    this.finalizeAndStoreBooking({
      ...this.pendingBookingData,
      cashTendered: this.activeCashTendered,
      changeReturned: this.activeChangeReturned,
      paymentMode: 'CASH',
      paymentStatus: 'PAID'
    });
  },

  confirmUpiAndGenerateBill() {
    this.closeModal('upi-confirm-modal');
    this.saveDoctorToDirectory(this.pendingBookingData.doctor);

    this.finalizeAndStoreBooking({
      ...this.pendingBookingData,
      cashTendered: 0,
      changeReturned: 0,
      paymentMode: 'COUNTER_UPI_QR',
      paymentStatus: 'PAID'
    });
  },

  /* =========================================================
     10. DIRECT RAZORPAY PAYMENT LINK (GPAY / PHONEPE / CARD / EMI)
         + AUTO-CLOSE BILL & AUTO-SEND INVOICE PDF ON WHATSAPP
     ========================================================= */
  buildPaymentLinkWhatsAppMessage(data, payUrl) {
    const branchName = data.branchName || this.currentTech?.branchName || 'Vettuvankeni Branch';
    const branchAddress = data.branchAddress || this.currentTech?.branchAddress || 'Masjid Street, 4th Main Road, Vettuvankeni, ECR, Chennai - 600115';
    const branchPhone = data.branchPhone || this.currentTech?.branchPhone || '+91 7010174890';
    const testNames = (data.itemsSnapshot || this.inPageCart || []).map(i => i.name).join(', ') || 'Diagnostic Lab Tests';

    return (
      `*SELFCARE DIAGNOSTICS - LAB BILL PAYMENT*\n` +
      `_(${branchName})_\n` +
      `----------------------------------------\n` +
      `*Booking ID:* ${data.bookingId}\n` +
      `*Patient:* ${data.name} (${data.age} Yrs / ${data.gender})\n` +
      `*Tests:* ${testNames}\n` +
      `*Amount to Pay:* *Rs. ${data.finalAmount}*\n` +
      `----------------------------------------\n` +
      `*Tap Link to Pay Directly via Razorpay (GPay / PhonePe / Paytm / Card / EMI):*\n` +
      `${payUrl}\n\n` +
      `_Note: Valid for 5 minutes. Your official invoice PDF will be sent on WhatsApp right after payment._\n` +
      `_${branchAddress}_\n` +
      `_Helpline: ${branchPhone}_`
    );
  },

  async initiateCustomerPaymentLink(data, openWhatsAppImmediately = true) {
    const phone = String(data.mobile || '').replace(/\D/g, '').slice(-10);

    if (this.activePaymentLinkId && this.activePaymentShortUrl && this.linkExpiryTimestamp && Date.now() < this.linkExpiryTimestamp) {
      if (openWhatsAppImmediately) {
        const msg = this.buildPaymentLinkWhatsAppMessage(data, this.activePaymentShortUrl);
        window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
      }
      return;
    }

    Utils.showToast('Generating Direct Razorpay Link (GPay / PhonePe / Card / EMI)...', 'info');

    try {
      const res = await Api.request('createPaymentLink', {
        amount: data.finalAmount,
        bookingId: data.bookingId,
        mobile: phone,
        patientName: data.name,
        email: data.email,
        upi_link: false, // Full Razorpay Hosted Page (GPay, PhonePe, Paytm, Cards, EMI, Netbanking)
        methods: { upi: true, card: true, emi: true, netbanking: true, wallet: true },
        doctor: data.doctor,
        billedByTechName: data.billedByTechName,
        branchId: data.branchId,
        branchName: data.branchName
      });

      const linkData = res?.data || res;
      const directRazorpayUrl = linkData?.shortUrl || linkData?.short_url || linkData?.paymentLinkUrl || '';
      const paymentLinkId = linkData?.paymentLinkId || linkData?.id || '';

      if (!directRazorpayUrl || !paymentLinkId) {
        throw new Error(linkData?.message || 'Unable to generate Razorpay payment link. Check backend Razorpay keys.');
      }

      this.activePaymentLinkId = paymentLinkId;
      this.activePaymentShortUrl = directRazorpayUrl;
      this.linkExpiryTimestamp = Date.now() + (5 * 60 * 1000);

      const pollingBox = document.getElementById('link-polling-state');
      document.getElementById('link-waiting-state').style.display = 'none';
      document.getElementById('link-expired-state').style.display = 'none';
      pollingBox.style.display = 'block';

      let manualSendWrap = document.getElementById('manual-wa-link-send-wrap');
      if (!manualSendWrap) {
        manualSendWrap = document.createElement('div');
        manualSendWrap.id = 'manual-wa-link-send-wrap';
        manualSendWrap.style.margin = '10px 0';
        pollingBox.insertBefore(manualSendWrap, pollingBox.firstChild);
      }

      manualSendWrap.innerHTML = `
        <div style="background:#FFFFFF; border:1px solid #D1D5DB; border-radius:8px; padding:8px 10px; margin-bottom:8px; font-size:11.5px; text-align:left;">
          <div><strong>Customer:</strong> ${Utils.escapeHtml(data.name)} (+91 ${Utils.escapeHtml(phone)})</div>
          <div><strong>Amount Payable:</strong> Rs. ${data.finalAmount} (GPay • PhonePe • Card • EMI)</div>
          <div style="font-size:10.5px; color:#047857; margin-top:2px; word-break:break-all;"><strong>Direct Razorpay Link:</strong> ${Utils.escapeHtml(directRazorpayUrl)}</div>
        </div>
        <button type="button" class="primary-action-btn" style="width:100%; margin-bottom:8px;" onclick="TechnicianApp.sendPaymentLinkManuallyOnWhatsApp()">
          📲 Resend Razorpay Link on WhatsApp (+91 ${Utils.escapeHtml(phone)})
        </button>
      `;

      // Open Customer WhatsApp directly with Razorpay Link
      if (openWhatsAppImmediately) {
        const msg = this.buildPaymentLinkWhatsAppMessage(data, directRazorpayUrl);
        window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
      }

      this.startLinkCountdownAndPolling();
    } catch (err) {
      Utils.showToast(`Error: ${err.message}`, 'error');
    }
  },

  sendPaymentLinkManuallyOnWhatsApp() {
    if (!this.pendingBookingData || !this.activePaymentShortUrl) {
      Utils.showToast('Please click "Send WhatsApp to Pay Bill" first', 'error');
      return;
    }
    const data = this.pendingBookingData;
    const phone = String(data.mobile || '').replace(/\D/g, '').slice(-10);
    const msg = this.buildPaymentLinkWhatsAppMessage(data, this.activePaymentShortUrl);
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  },

  async completeOnlinePaidBillAndSendInvoice(paymentId = '') {
    if (this.isFinalizingOnlineBill || !this.pendingBookingData) return;
    this.isFinalizingOnlineBill = true;

    try {
      this.clearLinkTimers();
      Utils.showToast('Payment Received! Closing bill & sending invoice to customer WhatsApp...', 'success');

      const bookingToFinalize = { ...this.pendingBookingData };
      this.saveDoctorToDirectory(bookingToFinalize.doctor);

      await this.finalizeAndStoreBooking({
        ...bookingToFinalize,
        cashTendered: 0,
        changeReturned: 0,
        paymentMode: 'ONLINE_RAZORPAY',
        paymentStatus: 'PAID',
        razorpayPaymentId: paymentId
      });

      // Reset payment link UI state
      document.getElementById('link-waiting-state').style.display = 'block';
      document.getElementById('link-polling-state').style.display = 'none';
      document.getElementById('link-expired-state').style.display = 'none';
      this.activePaymentLinkId = null;
      this.activePaymentShortUrl = '';
      this.linkExpiryTimestamp = null;
      this.pendingBookingData = null;

      // Automatically send Official Invoice PDF / WhatsApp message to Customer
      setTimeout(() => {
        this.shareInvoicePDFOnWhatsApp();
      }, 600);
    } finally {
      this.isFinalizingOnlineBill = false;
    }
  },

  startLinkCountdownAndPolling() {
    this.clearLinkTimers();
    const timerDisplay = document.getElementById('link-timer-display');

    this.linkCountdownTimer = setInterval(() => {
      const remainingMs = Math.max(0, this.linkExpiryTimestamp - Date.now());
      const remainingSeconds = Math.floor(remainingMs / 1000);

      const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
      const seconds = String(remainingSeconds % 60).padStart(2, '0');

      if (timerDisplay) {
        timerDisplay.textContent = `${minutes}:${seconds}`;
      }

      if (remainingSeconds <= 0) {
        this.handlePaymentLinkExpired();
      }
    }, 1000);

    this.linkPollingInterval = setInterval(async () => {
      if (!this.activePaymentLinkId || this.isFinalizingOnlineBill) return;

      try {
        const res = await Api.request('checkPaymentLinkStatus', {
          paymentLinkId: this.activePaymentLinkId,
          bookingId: this.pendingBookingData?.bookingId || ''
        });
        const statusData = res?.data || res;

        if (statusData && statusData.isPaid) {
          await this.completeOnlinePaidBillAndSendInvoice(statusData.paymentId || '');
        } else if (statusData && statusData.isExpired) {
          this.handlePaymentLinkExpired();
        }
      } catch (e) {}
    }, 3500);
  },

  handlePaymentLinkExpired() {
    this.clearLinkTimers();
    this.activePaymentLinkId = null;
    this.activePaymentShortUrl = '';
    this.linkExpiryTimestamp = null;

    document.getElementById('link-polling-state').style.display = 'none';
    document.getElementById('link-expired-state').style.display = 'block';
    Utils.showToast('Payment link expired after 5 minutes. Generate a new link.', 'error');
  },

  regeneratePaymentLink() {
    if (this.pendingBookingData) {
      document.getElementById('link-expired-state').style.display = 'none';
      this.isFinalizingOnlineBill = false;
      this.initiateCustomerPaymentLink(this.pendingBookingData, true);
    }
  },

  clearLinkTimers() {
    if (this.linkCountdownTimer) {
      clearInterval(this.linkCountdownTimer);
      this.linkCountdownTimer = null;
    }
    if (this.linkPollingInterval) {
      clearInterval(this.linkPollingInterval);
      this.linkPollingInterval = null;
    }
  },

  async manualCheckLinkPayment() {
    if (!this.activePaymentLinkId || this.isFinalizingOnlineBill) return;
    Utils.showToast('Checking live status with Razorpay...', 'info');

    try {
      const res = await Api.request('checkPaymentLinkStatus', {
        paymentLinkId: this.activePaymentLinkId,
        bookingId: this.pendingBookingData?.bookingId || ''
      });
      const statusData = res?.data || res;

      if (statusData && statusData.isPaid) {
        await this.completeOnlinePaidBillAndSendInvoice(statusData.paymentId || '');
      } else {
        Utils.showToast('Payment not yet completed by customer', 'info');
      }
    } catch (e) {
      Utils.showToast('Unable to verify status right now. Retrying...', 'info');
    }
  },

  /* =========================================================
     11. FINALIZE BILL, SAVE RECEIPT TO GOOGLE DRIVE & OPEN RECEIPT MODAL
     ========================================================= */
  async finalizeAndStoreBooking(data) {
    const techName = data.billedByTechName || this.currentTech?.name || 'Mohamed Adamkani';
    const branchName = data.branchName || this.currentTech?.branchName || 'Vettuvankeni Branch';
    const branchId = data.branchId || this.currentTech?.branchId || 'VETTUVANKENI_BRANCH';
    const branchAddress = data.branchAddress || this.currentTech?.branchAddress || 'Masjid Street, 4th Main Road, Mahatma Gandhi Nagar, Vettuvankeni, ECR, Chennai - 600115';
    const branchPhone = data.branchPhone || this.currentTech?.branchPhone || '+91 7010174890';
    const branchGstin = data.branchGstin || this.currentTech?.branchGstin || 'Verified';
    const docName = data.doctor || data.referringDoctor || 'Self / Walk-In';

    const bookingRecord = {
      bookingId: data.bookingId,
      salutation: data.salutation || 'Mr.',
      patientName: data.name,
      patientPhone: data.mobile,
      patientEmail: data.email || '',
      patientAge: data.age,
      dob: data.dob || '',
      patientGender: data.gender,
      referringDoctor: docName,
      doctorName: docName,
      doctor: docName,
      bookingSource: 'LAB_DESK',
      source: 'LAB_DESK',
      channel: 'WALK_IN',
      isLabDesk: true,
      isWalkIn: true,
      collectionType: 'lab',
      address: `Direct Lab Walk-In (${branchName})`,
      items: Array.isArray(data.itemsSnapshot) && data.itemsSnapshot.length > 0 ? data.itemsSnapshot : [...this.inPageCart],
      totalAmount: data.totalMrp,
      subtotal: data.subtotal || (data.finalAmount + (data.membershipDiscount || 0) + (data.couponDiscount || 0)),
      membershipDiscount: data.membershipDiscount || 0,
      vipDiscount: data.membershipDiscount || 0,
      couponDiscount: data.couponDiscount || 0,
      referralDiscount: data.couponDiscount || 0,
      couponCode: data.couponCode || '',
      couponLabel: data.couponLabel || '',
      finalAmount: data.finalAmount,
      cashTendered: data.cashTendered || 0,
      changeReturned: data.changeReturned || 0,
      paymentMode: data.paymentMode,
      paymentStatus: data.paymentStatus,
      razorpayPaymentId: data.razorpayPaymentId || '',
      bookingStatus: 'SAMPLE_COLLECTED',
      reportStatus: 'PENDING_ENTRY',
      reportData: {},
      billedByTechId: data.billedByTechId || this.currentTech?.staffId || 'SCDTECH001',
      billedByTechName: techName,
      technicianName: techName,
      branchId: branchId,
      branchName: branchName,
      branch: branchName,
      branchAddress: branchAddress,
      branchPhone: branchPhone,
      branchGstin: branchGstin,
      techStatus: `Billed by ${techName} (${branchName})`,
      collectionDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };

    try {
      const db = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
      db.unshift(bookingRecord);
      localStorage.setItem('selfcare_bookings_db', JSON.stringify(db));
    } catch (e) {}

    if (navigator.onLine && typeof Api !== 'undefined') {
      if (typeof Api.createBooking === 'function') {
        Api.createBooking(bookingRecord).catch(console.warn);
      } else {
        Api.request('createBooking', bookingRecord).catch(console.warn);
      }
    }

    this.lastGeneratedBooking = bookingRecord;
    this.renderReceiptModal(bookingRecord);
    this.clearInPageCart();
    this.loadPreviousBills();

    // Auto-archive Receipt PDF into Google Drive Receipt Folder
    this.uploadReceiptPdfToDrive(bookingRecord);

    Utils.showToast('Bill generated! Invoice ready to share on WhatsApp.', 'success');
  },

  async uploadReceiptPdfToDrive(b) {
    if (!navigator.onLine || typeof Api === 'undefined') return;
    try {
      const doc = await this.buildVectorInvoicePDF(b);
      const dataUri = doc.output('datauristring');
      const pdfBase64 = dataUri.split(',')[1] || '';
      const fileName = this.getInvoiceFileName(b);

      await Api.request('uploadFileToDrive', {
        folderId: this.RECEIPT_DRIVE_FOLDER_ID,
        fileName: fileName,
        mimeType: 'application/pdf',
        base64: pdfBase64,
        bookingId: b.bookingId,
        patientName: b.patientName,
        patientPhone: b.patientPhone,
        fileCategory: 'RECEIPT'
      });
    } catch (e) {
      console.warn('Receipt Drive upload deferred:', e);
    }
  },

  /* =========================================================
     12. COMPACT 1-PAGE A4 VECTOR PDF & PRINT (AUTO PAGE-2 ONLY FOR 12+ ITEMS)
     ========================================================= */
  getInvoiceFileName(b) {
    const rawName = String(b?.patientName || 'Customer')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '_');
    const invoiceNo = String(b?.bookingId || 'INVOICE').trim();
    return `${rawName}_${invoiceNo}.pdf`;
  },

  renderReceiptModal(b) {
    const modal = document.getElementById('bill-receipt-modal');
    if (!modal) return;

    const branchName = b.branchName || this.currentTech?.branchName || 'Vettuvankeni Branch';
    const branchAddress = b.branchAddress || this.currentTech?.branchAddress || 'Masjid Street, 4th Main Road, Mahatma Gandhi Nagar, Vettuvankeni, ECR, Chennai - 600115';
    const branchPhone = b.branchPhone || this.currentTech?.branchPhone || '+91 7010174890';
    const branchGstin = b.branchGstin || this.currentTech?.branchGstin || 'Verified';

    document.getElementById('rec-bill-id').textContent = b.bookingId;
    const billDate = new Date(b.createdAt || Date.now());
    document.getElementById('rec-bill-datetime').textContent = billDate.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric'
    }) + ', ' + billDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    const branchBadge = document.getElementById('rec-branch-badge');
    if (branchBadge) branchBadge.textContent = branchName;

    const hlPhoneEl = document.getElementById('rec-footer-hl-phone');
    if (hlPhoneEl) hlPhoneEl.textContent = branchPhone;

    const addrEl = document.getElementById('rec-footer-address');
    if (addrEl) addrEl.textContent = branchAddress;

    const contactEl = document.getElementById('rec-footer-contact');
    if (contactEl) {
      contactEl.innerHTML = `Phone: <strong>${Utils.escapeHtml(branchPhone)}</strong> &nbsp;|&nbsp; Web: <strong>selfcarediagnostics.in</strong> &nbsp;|&nbsp; <strong>GSTIN: ${Utils.escapeHtml(branchGstin)}</strong>`;
    }

    document.getElementById('rec-patient-name').textContent = (b.patientName || 'PATIENT').toUpperCase();
    document.getElementById('rec-patient-age-gender').textContent = `${b.patientAge || '25'} Years / ${b.patientGender || 'Male'}`;
    document.getElementById('rec-patient-mobile').textContent = `+91 ${b.patientPhone}`;
    document.getElementById('rec-referring-doctor').textContent = b.referringDoctor || b.doctorName || 'Self / Walk-In';

    const sampleId = `SC${billDate.toISOString().slice(2, 10).replace(/-/g, '')}${String(b.bookingId).slice(-3)}`;
    document.getElementById('rec-sample-id').textContent = sampleId;

    const tbody = document.getElementById('rec-items-tbody');
    let rowsHtml = '';

    (b.items || []).forEach((item, idx) => {
      const name = item.name || item.TestName || item.PackageName || 'Diagnostic Item';

      rowsHtml += `
        <tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td><strong>${Utils.escapeHtml(name)}</strong></td>
          <td style="text-align: center; color: #374151; font-weight: 500;">${Utils.escapeHtml(item.TAT || '6–12 Hours')}</td>
          <td style="text-align:right; font-weight:700;">${Utils.formatCurrency(item.price || 0).replace('₹', '')}</td>
        </tr>
      `;
    });

    if (tbody) tbody.innerHTML = rowsHtml;

    const totalMrp = Number(b.totalAmount || b.finalAmount || 0);
    const subtotal = Number(b.subtotal || (b.finalAmount + (b.membershipDiscount || 0) + (b.couponDiscount || 0)));
    const counterDisc = Math.max(0, totalMrp - subtotal);
    const vipDisc = Number(b.membershipDiscount || b.vipDiscount || 0);
    const refDisc = Number(b.couponDiscount || b.referralDiscount || 0);

    document.getElementById('rec-total-mrp').textContent = Utils.formatCurrency(totalMrp);
    document.getElementById('rec-total-discount').textContent = `- ${Utils.formatCurrency(counterDisc)}`;

    const vipRow = document.getElementById('rec-vip-discount-row');
    if (vipRow) {
      if (vipDisc > 0) {
        vipRow.style.display = 'flex';
        document.getElementById('rec-vip-discount').textContent = `- ${Utils.formatCurrency(vipDisc)}`;
      } else {
        vipRow.style.display = 'none';
      }
    }

    const refRow = document.getElementById('rec-referral-discount-row');
    if (refRow) {
      if (refDisc > 0) {
        refRow.style.display = 'flex';
        const lbl = document.getElementById('rec-referral-label');
        if (lbl) lbl.textContent = b.couponCode ? `Referral / Coupon (${b.couponCode})` : 'Referral / Coupon Discount';
        document.getElementById('rec-referral-discount').textContent = `- ${Utils.formatCurrency(refDisc)}`;
      } else {
        refRow.style.display = 'none';
      }
    }

    document.getElementById('rec-grand-paid').textContent = Utils.formatCurrency(b.finalAmount);
    document.getElementById('rec-payment-mode-text').textContent = b.paymentMode;
    document.getElementById('rec-payment-status-badge').textContent = b.paymentStatus;

    modal.style.display = 'flex';
  },

  async loadImageAsDataUrl(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const origW = img.naturalWidth || 360;
          const origH = img.naturalHeight || 108;
          const maxW = 360;
          const scale = origW > maxW ? (maxW / origW) : 1;

          const canvas = document.createElement('canvas');
          canvas.width = Math.round(origW * scale);
          canvas.height = Math.round(origH * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({
            dataUrl: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height
          });
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  },

  async buildVectorInvoicePDF(b) {
    const JsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JsPDFClass) {
      throw new Error('jsPDF library not loaded');
    }

    const doc = new JsPDFClass({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pageW = 210;
    const pageH = 297;
    const margin = 12;
    const contentW = pageW - margin * 2;
    let y = 12;

    const branchText = b.branchName || this.currentTech?.branchName || 'Vettuvankeni Branch';
    const branchAddress = b.branchAddress || this.currentTech?.branchAddress || 'Masjid Street, 4th Main Road, Mahatma Gandhi Nagar, Vettuvankeni, ECR, Chennai - 600115';
    const branchPhone = b.branchPhone || this.currentTech?.branchPhone || '+91 7010174890';
    const branchGstin = b.branchGstin || this.currentTech?.branchGstin || 'Verified';

    const formatRs = (amt) => `Rs. ${Number(amt || 0).toLocaleString('en-IN')}`;
    const billDate = new Date(b.createdAt || Date.now());
    const formattedDateTime = billDate.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric'
    }) + ', ' + billDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const sampleId = `SC${billDate.toISOString().slice(2, 10).replace(/-/g, '')}${String(b.bookingId).slice(-3)}`;

    // 1. Compact Header
    const logoAsset = await this.loadImageAsDataUrl('assets/images/logo.png');
    if (logoAsset && logoAsset.dataUrl) {
      const logoH = 12;
      const logoW = Math.min(52, (logoAsset.width / logoAsset.height) * logoH);
      doc.addImage(logoAsset.dataUrl, 'PNG', margin, y, logoW, logoH, undefined, 'FAST');
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(17, 24, 39);
      doc.text('SELFCARE DIAGNOSTICS', margin, y + 6);
    }

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(17, 24, 39);
    doc.setLineWidth(0.45);
    doc.roundedRect(pageW - margin - 52, y + 2, 52, 7.5, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(17, 24, 39);
    doc.text(branchText, pageW - margin - 26, y + 7, { align: 'center' });

    y += 15;
    doc.setDrawColor(17, 24, 39);
    doc.setLineWidth(0.45);
    doc.line(margin, y, pageW - margin, y);

    // 2. Title
    y += 6.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(17, 24, 39);
    doc.text('LABORATORY INVOICE', margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(75, 85, 99);
    doc.text('Diagnostic Laboratory Services', pageW - margin, y, { align: 'right' });

    // 3. Compact Patient & Visit Details Boxes
    y += 4;
    const boxGap = 4;
    const boxW = (contentW - boxGap) / 2;
    const boxH = 36;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(17, 24, 39);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, y, boxW, boxH, 1.5, 1.5, 'FD');
    doc.line(margin, y + 6.5, margin + boxW, y + 6.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 39);
    doc.text('Patient Details', margin + 3.5, y + 4.6);

    const pRows = [
      ['Name', (b.patientName || 'PATIENT').toUpperCase()],
      ['Age / Gender', `${b.patientAge || '25'} Years / ${b.patientGender || 'Male'}`],
      ['Mobile No.', `+91 ${b.patientPhone}`],
      ['Ref. Doctor', b.referringDoctor || b.doctorName || 'Self / Walk-In']
    ];

    let py = y + 11.2;
    pRows.forEach(([lbl, val]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(75, 85, 99);
      doc.text(lbl, margin + 3.5, py);
      doc.text(':', margin + 24, py);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 24, 39);
      const wrappedVal = doc.splitTextToSize(String(val), boxW - 29);
      doc.text(wrappedVal[0], margin + 26.5, py);
      py += 6;
    });

    const rightBoxX = margin + boxW + boxGap;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(17, 24, 39);
    doc.setLineWidth(0.4);
    doc.roundedRect(rightBoxX, y, boxW, boxH, 1.5, 1.5, 'FD');
    doc.line(rightBoxX, y + 6.5, rightBoxX + boxW, y + 6.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 39);
    doc.text('Visit Details', rightBoxX + 3.5, y + 4.6);

    const vRows = [
      ['Invoice No.', String(b.bookingId)],
      ['Date & Time', formattedDateTime],
      ['Visit Type', 'Lab Counter'],
      ['Sample ID', sampleId],
      ['Report TAT', 'Within 6-12 Hours']
    ];

    let vy = y + 10.8;
    vRows.forEach(([lbl, val]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(75, 85, 99);
      doc.text(lbl, rightBoxX + 3.5, vy);
      doc.text(':', rightBoxX + 23, vy);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 24, 39);
      const wrappedVal = doc.splitTextToSize(String(val), boxW - 28);
      doc.text(wrappedVal[0], rightBoxX + 25.5, vy);
      vy += 5.1;
    });

    // 4. Compact Items Table
    y += boxH + 4.5;
    const colX = {
      idx: margin + 5,
      desc: margin + 13,
      tat: margin + 134,
      amt: pageW - margin - 4
    };
    const descMaxW = 108;

    const drawTableHeader = (posY) => {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(17, 24, 39);
      doc.setLineWidth(0.5);
      doc.rect(margin, posY, contentW, 7.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.4);
      doc.setTextColor(17, 24, 39);
      doc.text('#', colX.idx, posY + 5, { align: 'center' });
      doc.text('Test / Package Description', colX.desc, posY + 5);
      doc.text('Report Time', colX.tat, posY + 5, { align: 'center' });
      doc.text('Amount (Rs.)', colX.amt, posY + 5, { align: 'right' });
    };

    drawTableHeader(y);
    y += 7.5;

    const items = b.items || [];
    const footerReserveHeight = 82;

    items.forEach((item, idx) => {
      const name = String(item.name || item.TestName || item.PackageName || 'Diagnostic Item');
      const tat = String(item.TAT || '6-12 Hours');
      const priceStr = Number(item.price || 0).toLocaleString('en-IN');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.3);
      const descLines = doc.splitTextToSize(name, descMaxW);
      const rowH = Math.max(7, descLines.length * 4 + 3);

      const isLastItem = idx === items.length - 1;
      const limitY = isLastItem ? (pageH - footerReserveHeight) : (pageH - 18);

      if (y + rowH > limitY) {
        doc.addPage();
        y = 14;
        drawTableHeader(y);
        y += 7.5;
      }

      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.28);
      doc.rect(margin, y, contentW, rowH, 'D');

      const textY = y + 4.7;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.3);
      doc.setTextColor(75, 85, 99);
      doc.text(String(idx + 1), colX.idx, textY, { align: 'center' });

      doc.setTextColor(17, 24, 39);
      doc.text(descLines, colX.desc, textY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(55, 65, 81);
      doc.text(tat, colX.tat, textY, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 24, 39);
      doc.text(priceStr, colX.amt, textY, { align: 'right' });

      y += rowH;
    });

    // 5. Compact Bottom Summary & Totals
    y += 4.5;
    if (y + 72 > pageH - 10) {
      doc.addPage();
      y = 16;
    }

    const leftNoteW = 94;
    const rightTotX = margin + leftNoteW + 6;
    const rightTotW = contentW - leftNoteW - 6;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.32);
    doc.roundedRect(margin, y, leftNoteW, 26, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(17, 24, 39);
    doc.text('Note:', margin + 3.5, y + 5.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(55, 65, 81);
    const note1 = doc.splitTextToSize('• Certified NABL accredited clinical pathology analyzers used.', leftNoteW - 7);
    const note2 = doc.splitTextToSize('• Digital verified reports delivered to registered WhatsApp & App within 6-12 hours.', leftNoteW - 7);
    doc.text(note1, margin + 3.5, y + 10);
    doc.text(note2, margin + 3.5, y + 17);

    const totalMrp = Number(b.totalAmount || b.finalAmount || 0);
    const subtotal = Number(b.subtotal || (b.finalAmount + (b.membershipDiscount || 0) + (b.couponDiscount || 0)));
    const counterDisc = Math.max(0, totalMrp - subtotal);
    const vipDisc = Number(b.membershipDiscount || b.vipDiscount || 0);
    const refDisc = Number(b.couponDiscount || b.referralDiscount || 0);

    let ty = y + 4;
    const drawTotRow = (label, valueStr, isBoldLabel = false) => {
      doc.setFont('helvetica', isBoldLabel ? 'bold' : 'normal');
      doc.setFontSize(8.4);
      doc.setTextColor(17, 24, 39);
      doc.text(label, rightTotX, ty);
      doc.text(':', rightTotX + 49, ty);
      doc.setFont('helvetica', 'bold');
      doc.text(valueStr, pageW - margin, ty, { align: 'right' });
      ty += 5;
    };

    drawTotRow('Subtotal (MRP)', formatRs(totalMrp));
    drawTotRow('Counter Discount', `- ${formatRs(counterDisc)}`);

    if (vipDisc > 0) {
      drawTotRow('VIP Membership (10%)', `- ${formatRs(vipDisc)}`, true);
    }

    if (refDisc > 0) {
      const refLabel = b.couponCode ? `Referral / Coupon (${b.couponCode})` : 'Referral / Coupon Discount';
      drawTotRow(refLabel, `- ${formatRs(refDisc)}`, true);
    }

    drawTotRow('Sample Collection', 'FREE', true);

    ty += 0.8;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(17, 24, 39);
    doc.setLineWidth(0.65);
    doc.roundedRect(rightTotX, ty - 4, rightTotW, 9, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 39);
    doc.text('TOTAL AMOUNT PAID', rightTotX + 3.5, ty + 1.8);
    doc.setFontSize(10.8);
    doc.text(formatRs(b.finalAmount), pageW - margin - 3.5, ty + 2, { align: 'right' });

    y = Math.max(y + 29, ty + 8.5);

    // 6. Payment Strip
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(17, 24, 39);
    doc.setLineWidth(0.42);
    doc.roundedRect(margin, y, contentW, 8, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(17, 24, 39);
    doc.text('Payment Information', margin + 3.5, y + 5.3);

    doc.setFont('helvetica', 'normal');
    doc.text(`Payment Mode : ${b.paymentMode || 'CASH'}`, margin + 70, y + 5.3);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(17, 24, 39);
    doc.setLineWidth(0.45);
    doc.roundedRect(pageW - margin - 21, y + 1.5, 17, 5, 1, 1, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(17, 24, 39);
    doc.text(b.paymentStatus || 'PAID', pageW - margin - 12.5, y + 5, { align: 'center' });

    // 7. Compact Footer pinned neatly inside Page 1
    const footerStartY = Math.max(y + 11, pageH - 42);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(17, 24, 39);
    doc.setLineWidth(0.45);
    doc.roundedRect(margin, footerStartY, contentW, 8, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(17, 24, 39);
    doc.text(`FREE HOME COLLECTION AVAILABLE  |  Book via Call / WhatsApp: ${branchPhone}`, pageW / 2, footerStartY + 5.3, { align: 'center' });

    const addrY = footerStartY + 9.8;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.32);
    doc.roundedRect(margin, addrY, contentW, 14.5, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 39);
    doc.text('SELFCARE DIAGNOSTICS', pageW / 2, addrY + 4.3, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(55, 65, 81);
    doc.text(branchAddress, pageW / 2, addrY + 8.8, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(17, 24, 39);
    doc.text(`Phone: ${branchPhone}   |   Web: selfcarediagnostics.in   |   GSTIN: ${branchGstin}`, pageW / 2, addrY + 13, { align: 'center' });

    const thanksY = addrY + 16.5;
    doc.setDrawColor(209, 213, 219);
    doc.line(margin, thanksY + 3, pageW / 2 - 46, thanksY + 3);
    doc.line(pageW / 2 + 46, thanksY + 3, pageW - margin, thanksY + 3);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(17, 24, 39);
    doc.setLineWidth(0.4);
    doc.roundedRect(pageW / 2 - 44, thanksY, 88, 6.2, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(17, 24, 39);
    doc.text('Thank you for choosing Selfcare Diagnostics!', pageW / 2, thanksY + 4.2, { align: 'center' });

    return doc;
  },

  async downloadInvoicePDF() {
    if (!this.lastGeneratedBooking) return;
    const b = this.lastGeneratedBooking;
    const fileName = this.getInvoiceFileName(b);
    try {
      const doc = await this.buildVectorInvoicePDF(b);
      doc.save(fileName);
      Utils.showToast(`Saved: ${fileName}`, 'success');
    } catch (err) {
      console.warn('Vector PDF error:', err);
      Utils.showToast('Unable to generate PDF', 'error');
    }
  },

  printInvoicePDF() {
    const modal = document.getElementById('bill-receipt-modal');
    if (modal && modal.style.display !== 'flex') {
      if (this.lastGeneratedBooking) {
        this.renderReceiptModal(this.lastGeneratedBooking);
      }
    }
    requestAnimationFrame(() => {
      window.print();
    });
  },

  buildWhatsAppInvoiceCaption(b) {
    const trackUrl = `https://selfcarediagnostics.in/bookings.html?bookingId=${b.bookingId}`;
    const branchName = b.branchName || this.currentTech?.branchName || 'Vettuvankeni Branch';
    const branchAddress = b.branchAddress || this.currentTech?.branchAddress || 'Masjid Street, 4th Main Road, Vettuvankeni, ECR, Chennai - 600115';
    const branchPhone = b.branchPhone || this.currentTech?.branchPhone || '+91 7010174890';
    const itemsList = (b.items || []).map(i => `• ${i.name} (Rs. ${i.price})`).join('\n');

    return (
      `*SELFCARE DIAGNOSTICS - OFFICIAL LAB INVOICE*\n` +
      `_(${branchName})_\n` +
      `----------------------------------------\n` +
      `*Booking / Invoice ID:* ${b.bookingId}\n` +
      `*Patient Name:* ${b.patientName}\n` +
      `*Age / Gender:* ${b.patientAge || '-'} Yrs / ${b.patientGender || '-'}\n` +
      `*Mobile:* +91 ${b.patientPhone}\n` +
      `*Ref. Doctor:* ${b.referringDoctor || 'Self / Walk-In'}\n` +
      `----------------------------------------\n` +
      `*Booked Tests:*\n${itemsList}\n` +
      `----------------------------------------\n` +
      `*Total Amount:* Rs. ${b.finalAmount} (${b.paymentMode} • ${b.paymentStatus || 'PAID'})\n\n` +
      `*Download Invoice & Track Live Reports:*\n` +
      `${trackUrl}\n\n` +
      `*FREE HOME COLLECTION AVAILABLE*\n` +
      `_${branchAddress}_\n` +
      `_${branchPhone}_\n\n` +
      `_Thank you for choosing Selfcare Diagnostics!_`
    );
  },

  async shareInvoicePDFOnWhatsApp() {
    if (!this.lastGeneratedBooking) return;
    const b = this.lastGeneratedBooking;
    const phone = String(b.patientPhone || '').replace(/\D/g, '').slice(-10);
    const caption = this.buildWhatsAppInvoiceCaption(b);
    const fileName = this.getInvoiceFileName(b);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(caption);
      }
    } catch (e) {}

    try {
      const doc = await this.buildVectorInvoicePDF(b);
      const pdfBlob = doc.output('blob');
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

      if (navigator.share) {
        if (!navigator.canShare || navigator.canShare({ files: [pdfFile] })) {
          await navigator.share({
            files: [pdfFile],
            title: fileName,
            text: caption
          });
          return;
        }
      }

      doc.save(fileName);
      Utils.showToast(`Downloaded ${fileName} • Opening WhatsApp for +91 ${phone}`, 'info');
      window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(caption)}`, '_blank');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(caption)}`, '_blank');
    }
  },

  /* =========================================================
     13. DATE-TO-DATE FILTER & BILLS HISTORY
     ========================================================= */
  initHistoryDateFilter() {
    const today = new Date().toISOString().split('T')[0];
    const fromInput = document.getElementById('history-from-date');
    const toInput = document.getElementById('history-to-date');
    if (fromInput) fromInput.value = today;
    if (toInput) toInput.value = today;
  },

  setQuickDateFilter(type) {
    document.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`qf-${type}`)?.classList.add('active');

    const today = new Date();
    const toDate = today.toISOString().split('T')[0];
    let fromDate = toDate;

    if (type === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      fromDate = d.toISOString().split('T')[0];
    } else if (type === 'month') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      fromDate = d.toISOString().split('T')[0];
    } else if (type === 'all') {
      fromDate = '2024-01-01';
    }

    document.getElementById('history-from-date').value = fromDate;
    document.getElementById('history-to-date').value = toDate;
    this.applyDateRangeFilter();
  },

  applyDateRangeFilter() {
    const fromDate = document.getElementById('history-from-date')?.value;
    const toDate = document.getElementById('history-to-date')?.value;
    this.loadPreviousBills(fromDate, toDate);
  },

  loadPreviousBills(fromDate = null, toDate = null) {
    const container = document.getElementById('previous-bills-container');
    if (!container) return;

    let allBookings = [];
    try {
      allBookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    } catch (e) {}

    const from = fromDate || document.getElementById('history-from-date')?.value || '';
    const to = toDate || document.getElementById('history-to-date')?.value || from;

    const filtered = allBookings.filter(b => {
      const bDate = String(b.collectionDate || b.date || b.createdAt || '').split('T')[0];
      if (!from && !to) return true;
      if (from && !to) return bDate >= from;
      if (!from && to) return bDate <= to;
      return bDate >= from && bDate <= to;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:18px; color:#6B7280; font-size:12px;">No bills found between ${from} and ${to}.</div>`;
      return;
    }

    container.innerHTML = filtered.map(b => `
      <div class="past-bill-card">
        <div class="past-bill-head">
          <strong>${b.bookingId}</strong>
          <span class="past-bill-amt">${Utils.formatCurrency(b.finalAmount)}</span>
        </div>
        <div class="past-bill-meta">
          <span>${Utils.escapeHtml(b.patientName)} (+91 ${b.patientPhone})</span> • 
          <span>${Utils.escapeHtml(b.referringDoctor || 'Self')}</span>
          <span style="float:right; font-size:10px; color:#6B7280;">${new Date(b.createdAt || b.date).toLocaleDateString('en-GB')}</span>
        </div>
        <div class="past-bill-actions-grid">
          <button type="button" class="btn-view-receipt-mini" onclick="TechnicianApp.openPastBillReceipt('${b.bookingId}')">
            Invoice
          </button>
          <button type="button" class="btn-view-receipt-mini btn-mini-dark" onclick="TechnicianApp.openUpdateReportModal('${b.bookingId}')">
            Update Report
          </button>
          <button type="button" class="btn-view-receipt-mini" onclick="TechnicianApp.openPatientReportModal('${b.bookingId}')">
            View Report
          </button>
        </div>
      </div>
    `).join('');
  },

  openPastBillReceipt(bookingId) {
    const all = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const b = all.find(item => item.bookingId === bookingId);
    if (b) {
      this.lastGeneratedBooking = b;
      this.renderReceiptModal(b);
    }
  },

  /* =========================================================
     14. DYNAMIC UPDATE REPORTS ENGINE
     ========================================================= */
  detectBilledParameters(booking) {
    const items = booking.items || [];
    const fullText = items.map(i => `${i.name || ''} ${i.code || ''} ${i.TestName || ''}`).join(' ').toLowerCase();

    return {
      fbs: /fbs|fasting\s*blood\s*sugar|glucose\s*fasting|fasting\s*sugar|sugar\s*fasting/i.test(fullText),
      ppbs: /ppbs|post\s*prandial|postprandial|glucose\s*pp|sugar\s*pp/i.test(fullText),
      rbs: /rbs|random\s*blood\s*sugar|glucose\s*random|random\s*sugar/i.test(fullText),
      bp: /blood\s*pressure|\bbp\b|systolic|diastolic|vitals|hypertension/i.test(fullText),
      vitals: /height|weight|bmi|body\s*mass|vitals|wellness/i.test(fullText)
    };
  },

  openUpdateReportModal(bookingId) {
    const all = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const b = all.find(item => item.bookingId === bookingId);
    if (!b) {
      Utils.showToast('Booking details not found', 'error');
      return;
    }

    this.activeEditingBookingId = bookingId;
    const subTitle = document.getElementById('rep-modal-patient-subtitle');
    if (subTitle) {
      subTitle.textContent = `Patient: ${b.patientName} • Bill ID: ${b.bookingId}`;
    }

    const detected = this.detectBilledParameters(b);

    const hasAnyMatch = detected.fbs || detected.ppbs || detected.rbs || detected.bp || detected.vitals;
    if (!hasAnyMatch) {
      detected.fbs = true;
      detected.ppbs = true;
      detected.rbs = true;
      detected.bp = true;
      detected.vitals = true;
    }

    document.getElementById('field-group-fbs').style.display = detected.fbs ? 'block' : 'none';
    document.getElementById('field-group-ppbs').style.display = detected.ppbs ? 'block' : 'none';
    document.getElementById('field-group-rbs').style.display = detected.rbs ? 'block' : 'none';
    document.getElementById('field-group-bp').style.display = detected.bp ? 'block' : 'none';
    document.getElementById('field-group-vitals').style.display = detected.vitals ? 'block' : 'none';

    const detectedNames = [];
    if (detected.fbs) detectedNames.push('FBS');
    if (detected.ppbs) detectedNames.push('PPBS');
    if (detected.rbs) detectedNames.push('RBS');
    if (detected.bp) detectedNames.push('Blood Pressure');
    if (detected.vitals) detectedNames.push('Height/Weight (BMI)');
    document.getElementById('rep-detected-list').textContent = detectedNames.join(', ');

    const existing = b.reportData || {};
    document.getElementById('rep-input-fbs').value = existing.fbs || '';
    document.getElementById('rep-input-ppbs').value = existing.ppbs || '';
    document.getElementById('rep-input-rbs').value = existing.rbs || '';
    document.getElementById('rep-input-bp-sys').value = existing.bpSys || '';
    document.getElementById('rep-input-bp-dia').value = existing.bpDia || '';
    document.getElementById('rep-input-height').value = existing.height || '';
    document.getElementById('rep-input-weight').value = existing.weight || '';

    this.calculateBmiRealtime();
    this.openModal('update-report-modal');
  },

  calculateBmiRealtime() {
    const h = parseFloat(document.getElementById('rep-input-height')?.value || 0);
    const w = parseFloat(document.getElementById('rep-input-weight')?.value || 0);
    const dispBmi = document.getElementById('disp-calc-bmi');
    const dispStatus = document.getElementById('disp-calc-bmi-status');

    if (h > 0 && w > 0) {
      const heightInMeters = h / 100;
      const bmi = (w / (heightInMeters * heightInMeters)).toFixed(1);
      if (dispBmi) dispBmi.textContent = `${bmi} kg/m²`;

      if (dispStatus) {
        if (bmi < 18.5) {
          dispStatus.textContent = 'Underweight';
          dispStatus.className = 'bmi-badge-warning';
        } else if (bmi <= 24.9) {
          dispStatus.textContent = 'Normal';
          dispStatus.className = 'bmi-badge-normal';
        } else if (bmi <= 29.9) {
          dispStatus.textContent = 'Overweight';
          dispStatus.className = 'bmi-badge-warning';
        } else {
          dispStatus.textContent = 'Obese';
          dispStatus.className = 'bmi-badge-warning';
        }
      }
      return bmi;
    } else {
      if (dispBmi) dispBmi.textContent = '--';
      if (dispStatus) {
        dispStatus.textContent = 'Enter H & W';
        dispStatus.className = 'bmi-badge-normal';
      }
      return '';
    }
  },

  async saveReportData() {
    const bookingId = this.activeEditingBookingId;
    if (!bookingId) return;

    const all = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const idx = all.findIndex(item => item.bookingId === bookingId);
    if (idx === -1) return;

    const b = all[idx];
    const bmiVal = this.calculateBmiRealtime();

    const reportPayload = {
      fbs: document.getElementById('rep-input-fbs')?.value.trim() || null,
      ppbs: document.getElementById('rep-input-ppbs')?.value.trim() || null,
      rbs: document.getElementById('rep-input-rbs')?.value.trim() || null,
      bpSys: document.getElementById('rep-input-bp-sys')?.value.trim() || null,
      bpDia: document.getElementById('rep-input-bp-dia')?.value.trim() || null,
      height: document.getElementById('rep-input-height')?.value.trim() || null,
      weight: document.getElementById('rep-input-weight')?.value.trim() || null,
      bmi: bmiVal || null,
      verifiedAt: new Date().toISOString(),
      verifiedBy: this.currentTech?.name || 'Mohamed Adamkani',
      branchId: this.currentTech?.branchId || 'VETTUVANKENI_BRANCH',
      branchName: this.currentTech?.branchName || 'Vettuvankeni Branch'
    };

    b.reportData = reportPayload;
    b.reportStatus = 'VERIFIED';
    all[idx] = b;
    localStorage.setItem('selfcare_bookings_db', JSON.stringify(all));

    if (navigator.onLine && typeof Api !== 'undefined') {
      try {
        const updatePayload = {
          bookingId: b.bookingId,
          patientPhone: b.patientPhone,
          reportData: JSON.stringify(reportPayload),
          reportStatus: 'VERIFIED',
          verifiedBy: reportPayload.verifiedBy,
          branchId: reportPayload.branchId,
          branchName: reportPayload.branchName
        };
        if (typeof Api.updateReport === 'function') {
          await Api.updateReport(updatePayload);
        } else {
          await Api.request('updateReport', updatePayload);
        }
      } catch (e) {
        console.warn('Backend sync deferred:', e);
      }
    }

    this.activeViewingReport = b;
    this.closeModal('update-report-modal');
    this.loadPreviousBills();

    Utils.showToast('Diagnostic Report successfully saved & verified!', 'success');
    this.openModal('report-post-save-modal');
  },

  previewSavedReport() {
    this.closeModal('report-post-save-modal');
    if (this.activeViewingReport) {
      this.openPatientReportModal(this.activeViewingReport.bookingId);
    }
  },

  shareReportViaPostSaveWhatsapp() {
    this.closeModal('report-post-save-modal');
    this.shareCurrentReportWhatsApp();
  },

  async shareCurrentReportWhatsApp() {
    if (!this.activeViewingReport) return;
    const b = this.activeViewingReport;
    const phone = String(b.patientPhone || '').replace(/\D/g, '').slice(-10);
    const r = b.reportData || {};

    let summary = '';
    if (r.fbs) summary += `• Fasting Blood Sugar: ${r.fbs} mg/dL\n`;
    if (r.ppbs) summary += `• Post Prandial Blood Sugar: ${r.ppbs} mg/dL\n`;
    if (r.rbs) summary += `• Random Blood Sugar: ${r.rbs} mg/dL\n`;
    if (r.bpSys && r.bpDia) summary += `• Blood Pressure: ${r.bpSys}/${r.bpDia} mmHg\n`;
    if (r.height && r.weight) summary += `• Height: ${r.height} cm | Weight: ${r.weight} kg\n`;
    if (r.bmi) summary += `• BMI: ${r.bmi} kg/m²\n`;

    const directTrackUrl = `https://selfcarediagnostics.in/bookings.html?bookingId=${b.bookingId}`;

    const caption =
      `*SELFCARE DIAGNOSTICS - CLINICAL LAB REPORT*\n` +
      `----------------------------------------\n` +
      `Dear *${b.patientName}*,\n` +
      `Your verified diagnostic test report for Bill *#${b.bookingId}* is ready.\n\n` +
      `*TEST RESULTS SUMMARY:*\n` +
      `${summary}\n` +
      `*Download Full Official Report & Invoice:*\n` +
      `${directTrackUrl}\n\n` +
      `_FREE HOME COLLECTION AVAILABLE • +91 7010174890_\n` +
      `_Thank you for choosing Selfcare Diagnostics!_`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(caption);
      }
    } catch (e) {}

    const rawName = String(b.patientName || 'Customer').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
    const reportFileName = `${rawName}_${b.bookingId}_Report.pdf`;

    try {
      const element = document.getElementById('printable-report-sheet');
      if (element && typeof html2pdf !== 'undefined') {
        const opt = {
          margin: 0,
          filename: reportFileName,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
        const pdfFile = new File([pdfBlob], reportFileName, { type: 'application/pdf' });

        if (navigator.share) {
          if (!navigator.canShare || navigator.canShare({ files: [pdfFile] })) {
            await navigator.share({
              files: [pdfFile],
              title: reportFileName,
              text: caption
            });
            return;
          }
        }
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }

    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(caption)}`, '_blank');
  },

  /* =========================================================
     15. OFFICIAL A4 REPORT RENDERING & CORNER QR CODE
     ========================================================= */
  populateReportSheetDom(b) {
    const r = b.reportData || {};
    const billDate = new Date(b.createdAt || Date.now());

    const branchAddress = b.branchAddress || this.currentTech?.branchAddress || 'Masjid Street, 4th Main Road, Mahatma Gandhi Nagar, Vettuvankeni, ECR, Chennai - 600115';
    const branchPhone = b.branchPhone || this.currentTech?.branchPhone || '+91 7010174890';

    const repAddrEl = document.getElementById('rep-header-addr');
    if (repAddrEl) repAddrEl.textContent = branchAddress;
    const repPhoneEl = document.getElementById('rep-header-phone');
    if (repPhoneEl) repPhoneEl.textContent = branchPhone;

    document.getElementById('rep-sheet-bill-id').textContent = b.bookingId;
    document.getElementById('rep-sheet-datetime').textContent = billDate.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
    document.getElementById('rep-patient-name').textContent = (b.patientName || 'PATIENT').toUpperCase();
    document.getElementById('rep-patient-age-gender').textContent = `${b.patientAge || '27'} Years / ${b.patientGender || 'Male'}`;
    document.getElementById('rep-patient-mobile').textContent = `+91 ${b.patientPhone}`;
    document.getElementById('rep-referring-doctor').textContent = b.referringDoctor || 'Self / Walk-In';
    document.getElementById('rep-collection-date').textContent = billDate.toLocaleDateString('en-GB');

    const sampleId = `SC${billDate.toISOString().slice(2, 10).replace(/-/g, '')}${String(b.bookingId).slice(-3)}`;
    document.getElementById('rep-sample-id').textContent = sampleId;

    const qrDownloadUrl = `https://selfcarediagnostics.in/bookings.html?bookingId=${b.bookingId}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrDownloadUrl)}`;
    const qrImg = document.getElementById('rep-corner-qr-img');
    if (qrImg) qrImg.src = qrApiUrl;

    const tbody = document.getElementById('rep-findings-tbody');
    let rowsHtml = '';
    let rowIdx = 1;

    if (r.fbs) {
      const v = parseFloat(r.fbs);
      const isHigh = v >= 126;
      const isPre = v >= 100 && v < 126;
      const statusText = isHigh ? 'HIGH' : (isPre ? 'PRE-DIABETIC' : 'NORMAL');

      rowsHtml += `
        <tr>
          <td style="text-align:center;">${rowIdx++}</td>
          <td><strong>Fasting Blood Sugar (FBS)</strong><br><span style="font-size:9px; color:#6B7280;">Method: Hexokinase / Glucose Oxidase</span></td>
          <td style="text-align:center; font-size:13px; font-weight:800;">${r.fbs}</td>
          <td style="text-align:center; color:#4B5563;">mg/dL</td>
          <td style="text-align:center; color:#4B5563;">70.0 – 99.0</td>
          <td style="text-align:center; font-weight:700;">${statusText}</td>
        </tr>
      `;
    }

    if (r.ppbs) {
      const v = parseFloat(r.ppbs);
      const isHigh = v >= 200;
      const isPre = v >= 140 && v < 200;
      const statusText = isHigh ? 'HIGH' : (isPre ? 'ELEVATED' : 'NORMAL');

      rowsHtml += `
        <tr>
          <td style="text-align:center;">${rowIdx++}</td>
          <td><strong>Post Prandial Blood Sugar (PPBS)</strong><br><span style="font-size:9px; color:#6B7280;">2 hrs Post Meal Glucose</span></td>
          <td style="text-align:center; font-size:13px; font-weight:800;">${r.ppbs}</td>
          <td style="text-align:center; color:#4B5563;">mg/dL</td>
          <td style="text-align:center; color:#4B5563;">&lt; 140.0</td>
          <td style="text-align:center; font-weight:700;">${statusText}</td>
        </tr>
      `;
    }

    if (r.rbs) {
      const v = parseFloat(r.rbs);
      const isHigh = v > 140;
      const statusText = isHigh ? 'HIGH' : 'NORMAL';

      rowsHtml += `
        <tr>
          <td style="text-align:center;">${rowIdx++}</td>
          <td><strong>Random Blood Sugar (RBS)</strong><br><span style="font-size:9px; color:#6B7280;">Plasma Glucose Examination</span></td>
          <td style="text-align:center; font-size:13px; font-weight:800;">${r.rbs}</td>
          <td style="text-align:center; color:#4B5563;">mg/dL</td>
          <td style="text-align:center; color:#4B5563;">70.0 – 140.0</td>
          <td style="text-align:center; font-weight:700;">${statusText}</td>
        </tr>
      `;
    }

    if (r.bpSys && r.bpDia) {
      const s = parseInt(r.bpSys);
      const d = parseInt(r.bpDia);
      const isHigh = s >= 140 || d >= 90;
      const isPre = (s >= 120 && s < 140) || (d >= 80 && d < 90);
      const statusText = isHigh ? 'STAGE 1 HTN' : (isPre ? 'ELEVATED' : 'NORMAL');

      rowsHtml += `
        <tr>
          <td style="text-align:center;">${rowIdx++}</td>
          <td><strong>Blood Pressure (BP)</strong><br><span style="font-size:9px; color:#6B7280;">Systolic / Diastolic Pressure</span></td>
          <td style="text-align:center; font-size:13px; font-weight:800;">${s} / ${d}</td>
          <td style="text-align:center; color:#4B5563;">mmHg</td>
          <td style="text-align:center; color:#4B5563;">120 / 80</td>
          <td style="text-align:center; font-weight:700;">${statusText}</td>
        </tr>
      `;
    }

    if (r.height || r.weight) {
      rowsHtml += `
        <tr>
          <td style="text-align:center;">${rowIdx++}</td>
          <td><strong>Height & Body Weight</strong></td>
          <td style="text-align:center; font-size:12px; font-weight:800;">${r.height || '-'} cm / ${r.weight || '-'} kg</td>
          <td style="text-align:center; color:#4B5563;">cm / kg</td>
          <td style="text-align:center; color:#4B5563;">Physical</td>
          <td style="text-align:center; font-weight:700;">RECORDED</td>
        </tr>
      `;
    }

    if (r.bmi) {
      const bmi = parseFloat(r.bmi);
      const isOver = bmi >= 25.0;
      const isUnder = bmi < 18.5;
      const statusText = isOver ? (bmi >= 30 ? 'OBESE' : 'OVERWEIGHT') : (isUnder ? 'UNDERWEIGHT' : 'NORMAL');

      rowsHtml += `
        <tr>
          <td style="text-align:center;">${rowIdx++}</td>
          <td><strong>Body Mass Index (BMI)</strong><br><span style="font-size:9px; color:#6B7280;">Auto-calculated Quetelet Index</span></td>
          <td style="text-align:center; font-size:13px; font-weight:800;">${bmi}</td>
          <td style="text-align:center; color:#4B5563;">kg/m²</td>
          <td style="text-align:center; color:#4B5563;">18.5 – 24.9</td>
          <td style="text-align:center; font-weight:700;">${statusText}</td>
        </tr>
      `;
    }

    if (!rowsHtml) {
      rowsHtml = `
        <tr>
          <td colspan="6" style="text-align:center; padding: 20px; color:#6B7280;">
            No diagnostic parameters entered yet. Click "Update Report" to enter values.
          </td>
        </tr>
      `;
    }

    if (tbody) tbody.innerHTML = rowsHtml;
  },

  async openPatientReportModal(bookingId) {
    const all = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const b = all.find(item => item.bookingId === bookingId);
    if (!b) return;

    this.activeViewingReport = b;
    this.populateReportSheetDom(b);
    this.openModal('report-view-modal');
  },

  async downloadCurrentReportPDF() {
    if (!this.activeViewingReport) return;
    const b = this.activeViewingReport;
    const rawName = String(b.patientName || 'Customer').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
    const element = document.getElementById('printable-report-sheet');
    const opt = {
      margin: 0,
      filename: `${rawName}_${b.bookingId}_Report.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2.2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    await html2pdf().set(opt).from(element).save();
  },

  printCurrentReportPDF() {
    requestAnimationFrame(() => {
      window.print();
    });
  },

  openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  TechnicianApp.init();
});

if (typeof window !== 'undefined') {
  window.TechnicianApp = TechnicianApp;
}
