/* file: assets/js/technician.js */
/**
 * Selfcare Diagnostics - Master Lab Walk-in Desk Engine v3.8.2
 * Features:
 * 1. Infinite-Loop Shielded Auth: Automatically binds TechlabDesk session on first load[span_9](start_span)[span_9](end_span).
 * 2. Dynamic Billed Parameter Filter: Shows ONLY tests billed (FBS, PPBS, RBS, BP, Vitals/BMI)[span_10](start_span)[span_10](end_span).
 * 3. Real-Time BMI Auto-Calculation: Calculates immediately as Height/Weight are entered[span_11](start_span)[span_11](end_span).
 * 4. Post-Save Popup: Prompts Download Report PDF or Send via WhatsApp[span_12](start_span)[span_12](end_span).
 * 5. Invoice-Exact Lab Report Sheet with Corner Download QR (points to booking.html, NEVER technician.html)[span_13](start_span)[span_13](end_span).
 * 6. WhatsApp Bill Share includes direct booking.html tracking link[span_14](start_span)[span_14](end_span).
 * 7. 5-Minute Countdown Timer for WhatsApp Payment Links[span_15](start_span)[span_15](end_span).
 * 8. Counter UPI Direct Confirmation Modal & Compulsory Cash Tendered Validation[span_16](start_span)[span_16](end_span).
 */

const TechnicianApp = {
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

  // ⏱️ 5-Minute Payment Link State
  activePaymentLinkId: null,
  linkExpiryTimestamp: null,
  linkCountdownTimer: null,
  linkPollingInterval: null,
  pendingBookingData: null,

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
    this.checkSessionAndAuth();
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
     1. AUTHENTICATION & TECHNICIAN IDENTITY (LOOP PROOF)
     ========================================================= */
  checkSessionAndAuth() {
    let rawTech = localStorage.getItem('selfcare_active_tech') || localStorage.getItem('selfcare_active_technician');
    if (rawTech) {
      try { this.currentTech = JSON.parse(rawTech); } catch (e) { this.currentTech = null; }
    }
    if (!this.currentTech) {
      const activeUser = localStorage.getItem('selfcare_active_user') || 'Mohamed Adamkani';
      this.currentTech = { id: 'TechlabDesk', name: activeUser, zone: 'Vettuvankeni Lab' };
      localStorage.setItem('selfcare_active_tech', JSON.stringify(this.currentTech));
    }
    const nameEl = document.getElementById('tech-display-name');
    if (nameEl) nameEl.textContent = this.currentTech.name || 'Lab Staff';
  },

  logout() {
    if (confirm('Are you sure you want to log out from Operations Desk?')) {
      localStorage.removeItem('selfcare_active_tech');
      localStorage.removeItem('selfcare_active_technician');
      localStorage.removeItem('selfcare_active_user');
      localStorage.removeItem('selfcare_auth_token');
      localStorage.removeItem('selfcare_customer_profile');
      window.location.replace('login.html?logout=true');
    }
  },

  /* =========================================================
     2. DOB TO AGE AUTO-CALCULATION
     ========================================================= */
  calculateAgeFromDob(dobString) {
    if (!dobString) return '';
    const dob = new Date(dobString);
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
    const age = this.calculateAgeFromDob(dobVal);
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
      const params = String(item.Parameters || item.parameters || '').toLowerCase().trim();
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
          <div style="padding: 14px; text-align: center; color: #64748B; font-size: 12px;">
            No diagnostic items matching "<strong>${Utils.escapeHtml(q)}</strong>"<br>
            <button type="button" onclick="TechnicianApp.forceSyncCatalogue()" style="margin-top:8px; padding:4px 10px; border-radius:6px; background:#078866; color:#fff; border:none; font-size:11px; cursor:pointer;">
              🔄 Refresh from Google Sheet
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
                <span class="cat-type-pill ${isPkg ? 'pill-pkg' : 'pill-test'}">${isPkg ? '📦 PACKAGE' : '🧪 TEST'}</span>
                <span style="font-size:9.5px; color:#64748B;">Code: ${Utils.escapeHtml(code)} | MRP: ${Utils.formatCurrency(mrp)}</span>
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
        ? `⚡ ${count} Live Items <span style="font-size:9px;">(Tap to sync)</span>` 
        : `Unified Catalogue 🔄`;
    }
  },

  async forceSyncCatalogue() {
    Utils.showToast('Fetching latest prices from Google Sheet...', 'info');
    await this.fetchLiveCatalogueFromServer();
    Utils.showToast(`Updated! ${this.catalogueList.length} items ready.`, 'success');
  },

  /* =========================================================
     5. CART & VIP MEMBERSHIP AUTO DISCOUNT (10%)
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
      SampleType: item.SampleType || 'Blood',
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

  renderInPageCart() {
    const container = document.getElementById('inpage-cart-items-list');
    const countBadge = document.getElementById('inpage-cart-count');
    const mrpEl = document.getElementById('lab-bill-mrp');
    const discountLineEl = document.getElementById('lab-bill-discount-line');
    const memRow = document.getElementById('membership-discount-row');
    const memLineEl = document.getElementById('lab-bill-membership-line');
    const couponRow = document.getElementById('coupon-discount-row');
    const couponLineEl = document.getElementById('lab-bill-coupon-line');
    const grandTotalEl = document.getElementById('lab-bill-grand-total');

    if (!container) return;
    if (countBadge) countBadge.textContent = `${this.inPageCart.length} Items`;

    if (this.inPageCart.length === 0) {
      container.innerHTML = `
        <div class="empty-inpage-cart">
          <span>🛒</span>
          <p>No tests or packages added yet. Search above to add diagnostic items.</p>
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
            <span class="cat-type-pill ${item.type === 'package' ? 'pill-pkg' : 'pill-test'}">${item.type === 'package' ? '📦 PACKAGE' : '🧪 TEST'}</span>
            <span style="font-size:10px; color:#64748B;">MRP: ${Utils.formatCurrency(item.mrp)}</span>
          </div>
          <div class="cart-item-right">
            <strong style="color: #045D49; font-size: 13px;">${Utils.formatCurrency(item.price)}</strong>
            <button type="button" class="btn-del-item" onclick="TechnicianApp.removeItemFromInPageCart(${idx})">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    const regularDiscount = Math.max(0, totalMrp - totalSubtotal);

    let membershipDiscount = 0;
    if (this.activeMembership && this.activeMembership.isMember) {
      membershipDiscount = Math.round(totalSubtotal * 0.10);
    }

    let couponDiscount = 0;
    if (this.appliedCoupon) {
      const pct = Number(this.appliedCoupon.percent || this.appliedCoupon.discountPercent || 10);
      couponDiscount = Math.min(2499, Math.round((totalSubtotal * pct) / 100));
    }

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
      if (couponLineEl) couponLineEl.textContent = `- ${Utils.formatCurrency(couponDiscount)}`;
    } else {
      if (couponRow) couponRow.style.display = 'none';
    }

    if (grandTotalEl) grandTotalEl.textContent = Utils.formatCurrency(finalPayable);
    this.calculateCashChange(this.activeCashTendered);
  },

  /* =========================================================
     6. CUSTOMER AUTOFILL & VIP MEMBERSHIP DETECTION
     ========================================================= */
  async handleCustomerMobileLookup(val) {
    const mobile = String(val).replace(/\D/g, '').slice(0, 10);
    if (mobile.length !== 10) return;

    let matchedUser = null;
    try {
      const raw = localStorage.getItem(`selfcare_profile_${mobile}`) || localStorage.getItem('selfcare_customer_profile');
      if (raw) {
        const u = JSON.parse(raw);
        if (String(u.mobile || u.phone || '').includes(mobile)) matchedUser = u;
      }
    } catch (e) {}

    if (navigator.onLine && typeof Api !== 'undefined') {
      try {
        const res = await Api.request('getProfile', { userId: mobile, mobile: mobile });
        const userFromCloud = res?.data || res?.profile || res?.user;
        if (userFromCloud && userFromCloud.Name) {
          matchedUser = {
            id: userFromCloud.UserID || `CUST_${mobile}`,
            name: userFromCloud.Name,
            salutation: userFromCloud.Salutation || 'Mr.',
            email: userFromCloud.Email || '',
            dob: userFromCloud.DOB || '',
            age: userFromCloud.Age || '',
            gender: userFromCloud.Gender || 'Male',
            membership: userFromCloud.Membership || 'Regular'
          };
        }
      } catch (err) {}
    }

    const nameInput = document.getElementById('cust-name-input');
    const ageInput = document.getElementById('cust-age-input');
    const dobInput = document.getElementById('cust-dob-input');
    const genderSelect = document.getElementById('cust-gender-select');
    const salutationSelect = document.getElementById('cust-salutation-select');
    const emailInput = document.getElementById('cust-email-input');
    const idTag = document.getElementById('disp-patient-id-tag');

    if (matchedUser) {
      if (nameInput) nameInput.value = matchedUser.name || matchedUser.FullName || '';
      if (emailInput && matchedUser.email) emailInput.value = matchedUser.email;
      if (genderSelect && matchedUser.gender) genderSelect.value = matchedUser.gender;
      if (salutationSelect && matchedUser.salutation) salutationSelect.value = matchedUser.salutation;
      
      if (matchedUser.dob) {
        if (dobInput) dobInput.value = matchedUser.dob;
        this.handleDobChange(matchedUser.dob);
      } else if (matchedUser.age && ageInput) {
        ageInput.value = matchedUser.age;
      }

      const memStatus = String(matchedUser.membership || matchedUser.Membership || '').trim().toUpperCase();
      const isVip = (memStatus.includes('MEMBER') || memStatus.includes('VIP')) && !memStatus.includes('REGULAR');

      if (isVip) {
        this.activeMembership = { isMember: true, type: 'VIP', discountPercent: 10 };
        if (idTag) {
          idTag.className = 'id-tag-pill vip-member-badge';
          idTag.innerHTML = `⭐ VIP MEMBER (${matchedUser.id || 'CUST_' + mobile.slice(-6)})`;
        }
        Utils.showToast('⭐ VIP Care Member detected! Flat 10% auto discount applied.', 'success');
      } else {
        this.activeMembership = null;
        if (idTag) {
          idTag.className = 'id-tag-pill';
          idTag.textContent = `ID: ${matchedUser.id || 'CUST_' + mobile.slice(-6)}`;
        }
      }

      this.renderInPageCart();
    } else {
      this.activeMembership = null;
      if (idTag) {
        idTag.className = 'id-tag-pill';
        idTag.textContent = `ID: SCD_CUST_${mobile.slice(-6)}`;
      }
      this.renderInPageCart();
    }
  },

  /* =========================================================
     7. REFERRING DOCTOR DIRECTORY
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
        🩺 ${Utils.escapeHtml(doc)}
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
        submitBtn.innerHTML = '📲 Generate & Send WhatsApp Payment Link';
      } else if (mode === 'UPI_QR') {
        submitBtn.innerHTML = '⚡ Verify Counter QR & Generate Bill';
      } else {
        submitBtn.innerHTML = '✓ Generate Bill & Create Official PDF Invoice';
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
      changeEl.style.color = this.activeCashTendered >= grandTotal ? '#047857' : '#DC2626';
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
    const dob = document.getElementById('cust-dob-input').value.trim();
    const gender = document.getElementById('cust-gender-select').value;
    const email = document.getElementById('cust-email-input').value.trim();
    const doctor = document.getElementById('cust-doctor-input').value.trim() || 'Self / Walk-In';

    if (mobile.length !== 10 || !name || !age) {
      Utils.showToast('Please enter mobile, full name and age', 'error');
      return;
    }

    const totalMrp = this.inPageCart.reduce((sum, it) => sum + it.mrp, 0);
    const subtotal = this.inPageCart.reduce((sum, it) => sum + it.price, 0);

    let membershipDiscount = 0;
    if (this.activeMembership && this.activeMembership.isMember) {
      membershipDiscount = Math.round(subtotal * 0.10);
    }

    let couponDiscount = 0;
    if (this.appliedCoupon) {
      couponDiscount = Math.min(2499, Math.round((subtotal * 10) / 100));
    }
    const finalAmount = Math.max(0, subtotal - membershipDiscount - couponDiscount);

    this.pendingBookingData = {
      bookingId: `SCDLAB${Math.floor(100000 + Math.random() * 900000)}`,
      salutation, name: `${salutation} ${name}`, rawName: name, mobile, age, dob, gender, email,
      doctor, finalAmount, totalMrp, membershipDiscount, couponDiscount,
      billedByTechId: this.currentTech?.id || 'TechlabDesk',
      billedByTechName: this.currentTech?.name || 'Mohamed Adamkani'
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

    this.initiateCustomerPaymentLink(this.pendingBookingData);
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
     10. 5-MINUTE COUNTDOWN TIMER & PAYMENT LINK
     ========================================================= */
  async initiateCustomerPaymentLink(data) {
    if (this.activePaymentLinkId && this.linkExpiryTimestamp && Date.now() < this.linkExpiryTimestamp) {
      Utils.showToast('Payment link is still active! Wait for the 5-minute timer to complete or check status.', 'info');
      return;
    }

    Utils.showToast('Creating 5-minute Razorpay Payment Link...', 'info');

    try {
      const res = await Api.request('createPaymentLink', {
        amount: data.finalAmount,
        bookingId: data.bookingId,
        mobile: data.mobile,
        patientName: data.name,
        email: data.email,
        doctor: data.doctor,
        billedByTechName: data.billedByTechName
      });

      const linkData = res?.data || res;
      if (!linkData || !linkData.shortUrl) {
        throw new Error(linkData?.message || 'Failed to create payment link');
      }

      this.activePaymentLinkId = linkData.paymentLinkId;
      this.linkExpiryTimestamp = Date.now() + (5 * 60 * 1000);

      const msg = `*SELFCARE DIAGNOSTICS - LAB BILL PAYMENT*\n` +
        `----------------------------------------\n` +
        `Dear *${data.name}*,\n` +
        `Your lab test bill *#${data.bookingId}* has been generated for *₹${data.finalAmount}*.\n\n` +
        `📲 *Click to Pay via GPay / PhonePe / Card:*\n` +
        `${linkData.shortUrl}\n\n` +
        `⚠️ *Note:* This payment link is valid for 5 minutes only.\n` +
        `_Once payment is successful, your official invoice PDF will be issued immediately._`;

      window.open(`https://wa.me/91${data.mobile}?text=${encodeURIComponent(msg)}`, '_blank');

      document.getElementById('link-waiting-state').style.display = 'none';
      document.getElementById('link-expired-state').style.display = 'none';
      document.getElementById('link-polling-state').style.display = 'block';

      this.startLinkCountdownAndPolling();
    } catch (err) {
      Utils.showToast(`Error: ${err.message}`, 'error');
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
      if (!this.activePaymentLinkId) return;

      try {
        const res = await Api.request('checkPaymentLinkStatus', {
          paymentLinkId: this.activePaymentLinkId
        });
        const statusData = res?.data || res;

        if (statusData && statusData.isPaid) {
          this.clearLinkTimers();
          Utils.showToast('✓ Payment Received Online!', 'success');

          this.finalizeAndStoreBooking({
            ...this.pendingBookingData,
            paymentMode: 'ONLINE_LINK',
            paymentStatus: 'PAID',
            razorpayPaymentId: statusData.paymentId || ''
          });

          document.getElementById('link-waiting-state').style.display = 'block';
          document.getElementById('link-polling-state').style.display = 'none';
          document.getElementById('link-expired-state').style.display = 'none';
          this.activePaymentLinkId = null;
          this.linkExpiryTimestamp = null;
        } else if (statusData && statusData.isExpired) {
          this.handlePaymentLinkExpired();
        }
      } catch (e) {}
    }, 3500);
  },

  handlePaymentLinkExpired() {
    this.clearLinkTimers();
    this.activePaymentLinkId = null;
    this.linkExpiryTimestamp = null;

    document.getElementById('link-polling-state').style.display = 'none';
    document.getElementById('link-expired-state').style.display = 'block';
    Utils.showToast('⚠️ Payment link has expired after 5 minutes. Please generate a new link.', 'error');
  },

  regeneratePaymentLink() {
    if (this.pendingBookingData) {
      document.getElementById('link-expired-state').style.display = 'none';
      this.initiateCustomerPaymentLink(this.pendingBookingData);
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
    if (!this.activePaymentLinkId) return;
    Utils.showToast('Checking status with Razorpay...', 'info');

    const res = await Api.request('checkPaymentLinkStatus', { paymentLinkId: this.activePaymentLinkId });
    const statusData = res?.data || res;

    if (statusData && statusData.isPaid) {
      this.clearLinkTimers();
      Utils.showToast('✓ Payment Verified!', 'success');
      this.finalizeAndStoreBooking({
        ...this.pendingBookingData,
        paymentMode: 'ONLINE_LINK',
        paymentStatus: 'PAID',
        razorpayPaymentId: statusData.paymentId || ''
      });
      document.getElementById('link-waiting-state').style.display = 'block';
      document.getElementById('link-polling-state').style.display = 'none';
    } else {
      Utils.showToast('Payment not yet completed by customer', 'info');
    }
  },

  /* =========================================================
     11. FINALIZE & STORE BOOKING
     ========================================================= */
  finalizeAndStoreBooking(data) {
    const bookingRecord = {
      bookingId: data.bookingId,
      salutation: data.salutation || 'Mr.',
      patientName: data.name,
      patientPhone: data.mobile,
      patientEmail: data.email || '',
      patientAge: data.age,
      dob: data.dob || '',
      patientGender: data.gender,
      referringDoctor: data.doctor,
      collectionType: 'lab',
      items: this.inPageCart,
      totalAmount: data.totalMrp,
      subtotal: data.finalAmount + (data.membershipDiscount || 0) + (data.couponDiscount || 0),
      membershipDiscount: data.membershipDiscount || 0,
      couponDiscount: data.couponDiscount || 0,
      finalAmount: data.finalAmount,
      cashTendered: data.cashTendered || 0,
      changeReturned: data.changeReturned || 0,
      paymentMode: data.paymentMode,
      paymentStatus: data.paymentStatus,
      bookingStatus: 'SAMPLE_COLLECTED',
      reportStatus: 'PENDING_ENTRY',
      reportData: {},
      billedByTechId: data.billedByTechId,
      billedByTechName: data.billedByTechName,
      techStatus: `Billed by ${data.billedByTechName}`,
      collectionDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };

    try {
      const db = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
      db.unshift(bookingRecord);
      localStorage.setItem('selfcare_bookings_db', JSON.stringify(db));
    } catch (e) {}

    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.createBooking === 'function') {
      Api.createBooking(bookingRecord).catch(console.warn);
    }

    this.lastGeneratedBooking = bookingRecord;
    this.renderReceiptModal(bookingRecord);
    this.clearInPageCart();
    this.loadPreviousBills();
  },

  /* =========================================================
     12. INVOICE RENDERING & PDF GENERATION
     ========================================================= */
  renderReceiptModal(b) {
    const modal = document.getElementById('bill-receipt-modal');
    if (!modal) return;

    document.getElementById('rec-bill-id').textContent = b.bookingId;
    const billDate = new Date(b.createdAt || Date.now());
    document.getElementById('rec-bill-datetime').textContent = billDate.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric'
    }) + ', ' + billDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    document.getElementById('rec-patient-name').textContent = (b.patientName || 'PATIENT').toUpperCase();
    document.getElementById('rec-patient-age-gender').textContent = `${b.patientAge || '25'} Years / ${b.patientGender || 'Male'}`;
    document.getElementById('rec-patient-mobile').textContent = `+91 ${b.patientPhone}`;
    document.getElementById('rec-referring-doctor').textContent = b.referringDoctor || 'Self / Walk-In';

    const sampleId = `SC${billDate.toISOString().slice(2, 10).replace(/-/g, '')}${String(b.bookingId).slice(-3)}`;
    document.getElementById('rec-sample-id').textContent = sampleId;

    const tbody = document.getElementById('rec-items-tbody');
    let rowsHtml = '';

    (b.items || []).forEach((item, idx) => {
      let sample = item.SampleType || 'Blood';
      const name = item.name || item.TestName;
      if (name.toLowerCase().includes('urine')) sample = 'Urine';
      if (name.toLowerCase().includes('vitamin') || name.toLowerCase().includes('iron')) sample = 'Serum';

      rowsHtml += `
        <tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td><strong>${Utils.escapeHtml(name)}</strong></td>
          <td style="text-align: center; color: #475569; font-weight: 600;">${Utils.escapeHtml(sample)}</td>
          <td style="text-align: center; color: #475569; font-weight: 600;">${Utils.escapeHtml(item.TAT || '6–12 Hours')}</td>
          <td style="text-align:right; font-weight:800;">${Utils.formatCurrency(item.price || 0).replace('₹', '')}</td>
        </tr>
      `;
    });

    if (tbody) tbody.innerHTML = rowsHtml;

    document.getElementById('rec-total-mrp').textContent = Utils.formatCurrency(b.totalAmount || b.finalAmount);
    const disc = Math.max(0, (b.totalAmount || b.finalAmount) - b.finalAmount + (b.membershipDiscount || 0) + (b.couponDiscount || 0));
    document.getElementById('rec-total-discount').textContent = `- ${Utils.formatCurrency(disc)}`;
    document.getElementById('rec-grand-paid').textContent = Utils.formatCurrency(b.finalAmount);
    document.getElementById('rec-payment-mode-text').textContent = b.paymentMode;
    document.getElementById('rec-payment-status-badge').textContent = b.paymentStatus;

    modal.style.display = 'flex';
  },

  async downloadInvoicePDF() {
    if (!this.lastGeneratedBooking) return;
    const b = this.lastGeneratedBooking;
    const element = document.getElementById('printable-receipt-card');
    const opt = {
      margin: 0,
      filename: `Selfcare_Invoice_${b.bookingId}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2.2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    await html2pdf().set(opt).from(element).save();
  },

  async shareInvoicePDFOnWhatsApp() {
    if (!this.lastGeneratedBooking) return;
    const b = this.lastGeneratedBooking;
    
    // Direct Tracking & Invoice Download link pointing to booking.html
    const trackUrl = `https://selfcarediagnostics.in/booking.html?bookingId=${b.bookingId}`;

    const msg = `*SELFCARE DIAGNOSTICS - OFFICIAL LAB INVOICE*%0A` +
      `----------------------------------------%0A` +
      `*Invoice ID:* ${b.bookingId}%0A` +
      `*Patient:* ${b.patientName}%0A` +
      `*Doctor:* ${b.referringDoctor || 'Self'}%0A` +
      `*Amount Paid:* ₹${b.finalAmount}%0A` +
      `----------------------------------------%0A` +
      `🔍 *Track Live Reports & Download Invoice:*%0A` +
      `${trackUrl}%0A%0A` +
      `_Thank you for choosing Selfcare Diagnostics!_`;

    window.open(`https://wa.me/91${b.patientPhone}?text=${msg}`, '_blank');
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
      container.innerHTML = `<div style="text-align:center; padding:18px; color:#64748B; font-size:12px;">No bills found between ${from} and ${to}.</div>`;
      return;
    }

    container.innerHTML = filtered.map(b => `
      <div class="past-bill-card">
        <div class="past-bill-head">
          <strong>🧾 ${b.bookingId}</strong>
          <span class="past-bill-amt">${Utils.formatCurrency(b.finalAmount)}</span>
        </div>
        <div class="past-bill-meta">
          <span>👤 ${Utils.escapeHtml(b.patientName)} (+91 ${b.patientPhone})</span> • 
          <span>🩺 ${Utils.escapeHtml(b.referringDoctor || 'Self')}</span>
          <span style="float:right; font-size:10px; color:#64748B;">${new Date(b.createdAt || b.date).toLocaleDateString('en-GB')}</span>
        </div>
        <div class="past-bill-actions-grid">
          <button type="button" class="btn-view-receipt-mini" onclick="TechnicianApp.openPastBillReceipt('${b.bookingId}')">
            👁️ Invoice
          </button>
          <button type="button" class="btn-view-receipt-mini" style="background:#078866; color:#FFF; border-color:#078866;" onclick="TechnicianApp.openUpdateReportModal('${b.bookingId}')">
            📝 Update Report
          </button>
          <button type="button" class="btn-view-receipt-mini" style="background:#045D49; color:#FFF; border-color:#045D49;" onclick="TechnicianApp.openPatientReportModal('${b.bookingId}')">
            📑 View Report
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
     14. DYNAMIC UPDATE REPORTS ENGINE (ONLY BILLED TESTS)
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
      verifiedBy: this.currentTech?.name || 'Mohamed Adamkani'
    };

    b.reportData = reportPayload;
    b.reportStatus = 'VERIFIED';
    all[idx] = b;
    localStorage.setItem('selfcare_bookings_db', JSON.stringify(all));

    // Cloud Sync to Google Sheets
    if (navigator.onLine && typeof Api !== 'undefined') {
      try {
        if (typeof Api.updateReport === 'function') {
          await Api.updateReport({
            bookingId: b.bookingId,
            patientPhone: b.patientPhone,
            reportData: JSON.stringify(reportPayload),
            reportStatus: 'VERIFIED'
          });
        } else {
          await Api.request('updateReport', {
            bookingId: b.bookingId,
            patientPhone: b.patientPhone,
            reportData: JSON.stringify(reportPayload),
            reportStatus: 'VERIFIED'
          });
        }
      } catch (e) {
        console.warn('Backend sync deferred:', e);
      }
    }

    this.activeViewingReport = b;
    this.closeModal('update-report-modal');
    this.loadPreviousBills();
    Utils.showToast('✓ Diagnostic Report successfully saved & verified!', 'success');

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

  shareCurrentReportWhatsApp() {
    if (!this.activeViewingReport) return;
    const b = this.activeViewingReport;
    const r = b.reportData || {};

    let summary = '';
    if (r.fbs) summary += `• Fasting Blood Sugar: ${r.fbs} mg/dL%0A`;
    if (r.ppbs) summary += `• Post Prandial Blood Sugar: ${r.ppbs} mg/dL%0A`;
    if (r.rbs) summary += `• Random Blood Sugar: ${r.rbs} mg/dL%0A`;
    if (r.bpSys && r.bpDia) summary += `• Blood Pressure: ${r.bpSys}/${r.bpDia} mmHg%0A`;
    if (r.height && r.weight) summary += `• Height: ${r.height} cm | Weight: ${r.weight} kg%0A`;
    if (r.bmi) summary += `• BMI: ${r.bmi} kg/m²%0A`;

    const directTrackUrl = `https://selfcarediagnostics.in/booking.html?bookingId=${b.bookingId}`;

    const msg = `*SELFCARE DIAGNOSTICS - CLINICAL LAB REPORT*%0A` +
      `----------------------------------------%0A` +
      `Dear *${b.patientName}*,%0A` +
      `Your verified diagnostic test report for Bill *#${b.bookingId}* is ready.%0A%0A` +
      `📋 *TEST RESULTS SUMMARY:*%0A` +
      `${summary}%0A` +
      `📥 *Download Full Official Report & Invoice:*%0A` +
      `${directTrackUrl}%0A%0A` +
      `_Status: Certified by Lab Pathologist._`;

    window.open(`https://wa.me/91${b.patientPhone}?text=${msg}`, '_blank');
  },

  /* =========================================================
     15. OFFICIAL A4 REPORT RENDERING & CORNER QR CODE
     ========================================================= */
  async openPatientReportModal(bookingId) {
    const all = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const b = all.find(item => item.bookingId === bookingId);
    if (!b) return;

    this.activeViewingReport = b;
    const r = b.reportData || {};
    const billDate = new Date(b.createdAt || Date.now());

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

    const qrDownloadUrl = `https://selfcarediagnostics.in/booking.html?bookingId=${b.bookingId}`;
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
      const statusColor = isHigh ? '#DC2626' : (isPre ? '#D97706' : '#047857');

      rowsHtml += `
        <tr>
          <td style="text-align:center;">${rowIdx++}</td>
          <td><strong>Fasting Blood Sugar (FBS)</strong><br><span style="font-size:9px; color:#64748B;">Method: Hexokinase / Glucose Oxidase</span></td>
          <td style="text-align:center; font-size:13px; font-weight:800; color:${statusColor};">${r.fbs}</td>
          <td style="text-align:center; color:#475569;">mg/dL</td>
          <td style="text-align:center; color:#475569;">70.0 – 99.0</td>
          <td style="text-align:center; font-weight:800; color:${statusColor};">${statusText}</td>
        </tr>
      `;
    }

    if (r.ppbs) {
      const v = parseFloat(r.ppbs);
      const isHigh = v >= 200;
      const isPre = v >= 140 && v < 200;
      const statusText = isHigh ? 'HIGH' : (isPre ? 'ELEVATED' : 'NORMAL');
      const statusColor = isHigh ? '#DC2626' : (isPre ? '#D97706' : '#047857');

      rowsHtml += `
        <tr>
          <td style="text-align:center;">${rowIdx++}</td>
          <td><strong>Post Prandial Blood Sugar (PPBS)</strong><br><span style="font-size:9px; color:#64748B;">2 hrs Post Meal Glucose</span></td>
          <td style="text-align:center; font-size:13px; font-weight:800; color:${statusColor};">${r.ppbs}</td>
          <td style="text-align:center; color:#475569;">mg/dL</td>
          <td style="text-align:center; color:#475569;">&lt; 140.0</td>
          <td style="text-align:center; font-weight:800; color:${statusColor};">${statusText}</td>
        </tr>
      `;
    }

    if (r.rbs) {
      const v = parseFloat(r.rbs);
      const isHigh = v > 140;
      const statusText = isHigh ? 'HIGH' : 'NORMAL';
      const statusColor = isHigh ? '#DC2626' : '#047857';

      rowsHtml += `
        <tr>
          <td style="text-align:center;">${rowIdx++}</td>
          <td><strong>Random Blood Sugar (RBS)</strong><br><span style="font-size:9px; color:#64748B;">Plasma Glucose Examination</span></td>
          <td style="text-align:center; font-size:13px; font-weight:800; color:${statusColor};">${r.rbs}</td>
          <td style="text-align:center; color:#475569;">mg/dL</td>
          <td style="text-align:center; color:#475569;">70.0 – 140.0</td>
          <td style="text-align:center; font-weight:800; color:${statusColor};">${statusText}</td>
        </tr>
      `;
    }

    if (r.bpSys && r.bpDia) {
      const s = parseInt(r.bpSys);
      const d = parseInt(r.bpDia);
      const isHigh = s >= 140 || d >= 90;
      const isPre = (s >= 120 && s < 140) || (d >= 80 && d < 90);
      const statusText = isHigh ? 'STAGE 1 HTN' : (isPre ? 'ELEVATED' : 'NORMAL');
      const statusColor = isHigh ? '#DC2626' : (isPre ? '#D97706' : '#047857');

      rowsHtml += `
        <tr>
          <td style="text-align:center;">${rowIdx++}</td>
          <td><strong>Blood Pressure (BP)</strong><br><span style="font-size:9px; color:#64748B;">Systolic / Diastolic Pressure</span></td>
          <td style="text-align:center; font-size:13px; font-weight:800; color:${statusColor};">${s} / ${d}</td>
          <td style="text-align:center; color:#475569;">mmHg</td>
          <td style="text-align:center; color:#475569;">120 / 80</td>
          <td style="text-align:center; font-weight:800; color:${statusColor};">${statusText}</td>
        </tr>
      `;
    }

    if (r.height || r.weight) {
      rowsHtml += `
        <tr>
          <td style="text-align:center;">${rowIdx++}</td>
          <td><strong>Height & Body Weight</strong></td>
          <td style="text-align:center; font-size:12px; font-weight:800;">${r.height || '-'} cm / ${r.weight || '-'} kg</td>
          <td style="text-align:center; color:#475569;">cm / kg</td>
          <td style="text-align:center; color:#475569;">Physical</td>
          <td style="text-align:center; font-weight:800; color:#047857;">RECORDED</td>
        </tr>
      `;
    }

    if (r.bmi) {
      const bmi = parseFloat(r.bmi);
      const isOver = bmi >= 25.0;
      const isUnder = bmi < 18.5;
      const statusText = isOver ? (bmi >= 30 ? 'OBESE' : 'OVERWEIGHT') : (isUnder ? 'UNDERWEIGHT' : 'NORMAL');
      const statusColor = (isOver || isUnder) ? '#D97706' : '#047857';

      rowsHtml += `
        <tr>
          <td style="text-align:center;">${rowIdx++}</td>
          <td><strong>Body Mass Index (BMI)</strong><br><span style="font-size:9px; color:#64748B;">Auto-calculated Quetelet Index</span></td>
          <td style="text-align:center; font-size:13px; font-weight:800; color:${statusColor};">${bmi}</td>
          <td style="text-align:center; color:#475569;">kg/m²</td>
          <td style="text-align:center; color:#475569;">18.5 – 24.9</td>
          <td style="text-align:center; font-weight:800; color:${statusColor};">${statusText}</td>
        </tr>
      `;
    }

    if (!rowsHtml) {
      rowsHtml = `
        <tr>
          <td colspan="6" style="text-align:center; padding: 20px; color:#94A3B8;">
            No diagnostic parameters entered yet. Click "Update Report" to enter values.
          </td>
        </tr>
      `;
    }

    if (tbody) tbody.innerHTML = rowsHtml;
    this.openModal('report-view-modal');
  },

  async downloadCurrentReportPDF() {
    if (!this.activeViewingReport) return;
    const b = this.activeViewingReport;
    const element = document.getElementById('printable-report-sheet');
    const opt = {
      margin: 0,
      filename: `Selfcare_Report_${b.bookingId}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2.2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    await html2pdf().set(opt).from(element).save();
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
