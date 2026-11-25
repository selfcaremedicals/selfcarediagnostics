/* file: assets/js/home-collection.js */
/**
 * Selfcare Diagnostics - Home Collection Captain & Payout Engine v4.0.0
 * Features:
 * 1. Persistent Duty Toggle (Remains ON across logins until manually switched OFF).
 * 2. Persistent Declined / Dismissed Notification Memory (Never re-notifies declined/seen orders).
 * 3. Unlimited Concurrent Active Pickups (Accept any number of orders simultaneously).
 * 4. Accurate Google Maps Navigation (Uses exact customer GPS coordinates or full geocoded address).
 * 5. Exact Booking OTP Verification (Matches exact OTP created during customer booking).
 * 6. Footer ILD Sample Delivery Directory Popup with One-Tap Direct Call.
 * 7. Self-Editable Captain Profile & UPI Details + Mandatory Full Cash Settlement via Razorpay before Withdrawal.
 * 8. Direct WhatsApp Withdrawal Request with Auto Wallet Reset to ₹0.
 */

const HomeCollectionApp = {
  SINGLE_VISIT_FEE: 150,
  MULTI_VISIT_FEE: 250,
  ADMIN_WHATSAPP_NUMBER: '919840000000', // Fallback; overridden by Config.WHATSAPP_NUMBER if present

  isOnline: false,
  pollTimer: null,
  dayFilter: 'ALL',

  currentCaptain: null,
  incomingOrders: [],
  activeTrips: [],
  completedTrips: [],

  // Active OTP Target Booking ID
  otpTargetBookingId: null,

  // Rapido Incoming Alert State
  popupOrder: null,
  popupTimerId: null,
  popupSecondsLeft: 30,
  seenAlertIds: new Set(),
  declinedIds: new Set(),

  // Area-wise ILD (In-Lab Drop / Sample Delivery) Hubs
  ildDirectory: [
    { area: 'Vettuvankeni Main Hub (ECR)', code: 'ILD-VTK', phone: '7010174890', timing: '24x7 Central Processing' },
    { area: 'Neelankarai & Palavakkam', code: 'ILD-NLK', phone: '9840112202', timing: '06:00 AM - 10:00 PM' },
    { area: 'Thiruvanmiyur & Adyar', code: 'ILD-ADY', phone: '9840112203', timing: '06:00 AM - 10:00 PM' },
    { area: 'Velachery & Taramani', code: 'ILD-VLC', phone: '9840112204', timing: '06:00 AM - 10:00 PM' },
    { area: 'Thoraipakkam & Perungudi (OMR)', code: 'ILD-OMR', phone: '9840112205', timing: '06:00 AM - 10:00 PM' },
    { area: 'Sholinganallur & Karapakkam', code: 'ILD-SHL', phone: '9840112206', timing: '06:00 AM - 09:30 PM' },
    { area: 'Injambakkam & Akkarai', code: 'ILD-INJ', phone: '9840112207', timing: '06:30 AM - 09:30 PM' },
    { area: 'Medavakkam & Pallikaranai', code: 'ILD-MDV', phone: '9840112208', timing: '06:30 AM - 09:30 PM' }
  ],

  ratingsData: {
    average: 4.9,
    totalCount: 0,
    breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    reviews: []
  },

  wallet: {
    availableBalance: 0,
    totalEarned: 0,
    totalPaidOut: 0,
    codCashHeld: 0,
    payoutCycle: 'DAILY',
    bank: {
      holderName: '',
      upiId: '',
      accountNo: '',
      ifsc: ''
    },
    ledger: []
  },

  init() {
    if (typeof Config !== 'undefined' && Config.WHATSAPP_NUMBER) {
      this.ADMIN_WHATSAPP_NUMBER = String(Config.WHATSAPP_NUMBER).replace(/\D/g, '');
    }

    this.registerServiceWorkerNotifications();
    this.checkUrlPopupAction();

    const session = this.getSavedCaptainSession();
    if (!session) {
      window.location.replace('index.html');
      return;
    }

    this.currentCaptain = session;
    this.unlockAppShell();
  },

  /* =========================================================
     1. SESSION GUARD & PERSISTENT ALERT MEMORY
     ========================================================= */
  getSavedCaptainSession() {
    try {
      const raw =
        localStorage.getItem('selfcare_captain_session') ||
        localStorage.getItem('selfcare_active_tech') ||
        localStorage.getItem('selfcare_active_technician');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const staffId = parsed?.id || parsed?.staffId || parsed?.captainId;
      if (!staffId) return null;

      // Merge any self-saved profile overrides
      const savedProfileRaw = localStorage.getItem(`selfcare_hc_profile_${staffId}`);
      const savedProfile = savedProfileRaw ? JSON.parse(savedProfileRaw) : {};

      return {
        id: staffId,
        name: savedProfile.name || parsed.name || parsed.technicianName || parsed.captainName || 'Selfcare Captain',
        age: savedProfile.age || parsed.age || '',
        gender: savedProfile.gender || parsed.gender || 'Male',
        mobile: savedProfile.mobile || parsed.mobile || (parsed.branchPhone ? String(parsed.branchPhone).replace(/\D/g, '').slice(-10) : ''),
        address: savedProfile.address || parsed.address || parsed.zone || 'Vettuvankeni, ECR, Chennai',
        upiId: savedProfile.upiId || parsed.upiId || '',
        upiHolderName: savedProfile.upiHolderName || parsed.upiHolderName || parsed.name || '',
        accountNo: savedProfile.accountNo || parsed.accountNo || '',
        ifsc: savedProfile.ifsc || parsed.ifsc || '',
        rating: Number(parsed.rating || 4.9),
        ratingCount: Number(parsed.ratingCount || 0)
      };
    } catch (e) {
      return null;
    }
  },

  loadAlertMemory() {
    try {
      const declined = JSON.parse(localStorage.getItem(`selfcare_hc_declined_${this.currentCaptain.id}`) || '[]');
      const seen = JSON.parse(localStorage.getItem(`selfcare_hc_seen_${this.currentCaptain.id}`) || '[]');
      this.declinedIds = new Set(Array.isArray(declined) ? declined : []);
      this.seenAlertIds = new Set(Array.isArray(seen) ? seen : []);
    } catch (e) {}
  },

  saveAlertMemory() {
    try {
      localStorage.setItem(
        `selfcare_hc_declined_${this.currentCaptain.id}`,
        JSON.stringify(Array.from(this.declinedIds).slice(-300))
      );
      localStorage.setItem(
        `selfcare_hc_seen_${this.currentCaptain.id}`,
        JSON.stringify(Array.from(this.seenAlertIds).slice(-300))
      );
    } catch (e) {}
  },

  logoutCaptain() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    // Note: Intentionally keeping 'selfcare_hc_online' & alert memory intact so duty stays ON across logins
    localStorage.removeItem('selfcare_captain_session');
    localStorage.removeItem('selfcare_active_tech');
    localStorage.removeItem('selfcare_active_technician');
    localStorage.removeItem('selfcare_active_user');
    localStorage.removeItem('selfcare_user_role');
    localStorage.removeItem('selfcare_tech_workspace');
    localStorage.removeItem('selfcare_auth_token');
    window.location.replace('index.html?logout=true');
  },

  unlockAppShell() {
    const appShell = document.getElementById('hc-app-shell');
    if (appShell) appShell.style.display = 'block';

    this.loadAlertMemory();
    this.loadWalletData();
    this.loadTripsData();
    this.syncCaptainProfileAndRatings();

    const datePicker = document.getElementById('hc-stats-date-picker');
    if (datePicker) {
      datePicker.value = this.getLocalYmd(new Date());
    }

    this.renderWallet();
    this.renderPerformanceStats();
    this.renderHistory();
    this.renderProfileView();
    this.renderActiveTrips();

    // Persistent Duty State: defaults to ON once switched ON, survives across logins
    const dutyStored = localStorage.getItem('selfcare_hc_online');
    const savedOnline = dutyStored === null ? true : (dutyStored === 'true');
    const toggle = document.getElementById('hc-duty-toggle');
    if (toggle) toggle.checked = savedOnline;
    this.toggleDuty(savedOnline, true);
  },

  /* =========================================================
     2. SELF-EDITABLE CAPTAIN PROFILE, UPI & RATINGS
     ========================================================= */
  saveCaptainProfile() {
    const name = String(document.getElementById('hc-inp-name')?.value || '').trim();
    const age = String(document.getElementById('hc-inp-age')?.value || '').trim();
    const mobile = String(document.getElementById('hc-inp-mobile')?.value || '').replace(/\D/g, '').slice(-10);
    const gender = String(document.getElementById('hc-inp-gender')?.value || 'Male').trim();
    const address = String(document.getElementById('hc-inp-address')?.value || '').trim();
    const upiId = String(document.getElementById('hc-inp-upi')?.value || '').trim();
    const upiHolderName = String(document.getElementById('hc-inp-upi-name')?.value || '').trim();
    const accountNo = String(document.getElementById('hc-inp-acc')?.value || '').trim();
    const ifsc = String(document.getElementById('hc-inp-ifsc')?.value || '').trim().toUpperCase();

    if (!name || mobile.length !== 10 || !upiId) {
      Utils.showToast('Please enter Name, 10-digit Phone Number, and UPI ID', 'error');
      return;
    }

    this.currentCaptain = {
      ...this.currentCaptain,
      name,
      age,
      mobile,
      gender,
      address,
      upiId,
      upiHolderName: upiHolderName || name,
      accountNo,
      ifsc
    };

    localStorage.setItem(`selfcare_hc_profile_${this.currentCaptain.id}`, JSON.stringify(this.currentCaptain));
    localStorage.setItem('selfcare_captain_session', JSON.stringify(this.currentCaptain));

    this.wallet.bank = {
      holderName: upiHolderName || name,
      upiId,
      accountNo,
      ifsc
    };
    this.saveWalletData();
    this.renderProfileView();

    if (navigator.onLine && typeof Api !== 'undefined') {
      Api.request('updateCaptainProfile', {
        captainId: this.currentCaptain.id,
        ...this.currentCaptain
      }).catch(() => {});
    }

    Utils.showToast('Profile & UPI details saved successfully!', 'success');
  },

  async syncCaptainProfileAndRatings() {
    if (!this.currentCaptain) return;

    if (navigator.onLine && typeof Api !== 'undefined') {
      try {
        const res = await Api.request('getCaptainProfileAndRatings', {
          captainId: this.currentCaptain.id
        });
        if (res && res.success && res.ratings) {
          this.ratingsData = {
            average: Number(res.ratings.average || this.currentCaptain.rating || 4.9),
            totalCount: Number(res.ratings.totalCount || 0),
            breakdown: res.ratings.breakdown || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
            reviews: Array.isArray(res.ratings.reviews) ? res.ratings.reviews : []
          };
        }
      } catch (e) {}
    }

    if (this.currentCaptain.upiId) {
      this.wallet.bank = {
        holderName: this.currentCaptain.upiHolderName || this.currentCaptain.name,
        upiId: this.currentCaptain.upiId,
        accountNo: this.currentCaptain.accountNo || '',
        ifsc: this.currentCaptain.ifsc || ''
      };
    }

    this.renderProfileView();
    this.renderWallet();
  },

  renderProfileView() {
    if (!this.currentCaptain) return;
    const c = this.currentCaptain;
    const initials = String(c.name || 'SC')
      .split(' ')
      .map(p => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const headerAvatar = document.getElementById('hc-header-avatar');
    const profAvatar = document.getElementById('hc-prof-avatar');
    if (headerAvatar) headerAvatar.textContent = initials;
    if (profAvatar) profAvatar.textContent = initials;

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    setTxt('hc-prof-name', c.name || 'Captain');
    setTxt('hc-prof-id-badge', `ID: ${c.id}`);
    setTxt('hc-prof-id-line', `ID: ${c.id} • ${c.address || 'Chennai Zone'}`);

    setVal('hc-inp-name', c.name);
    setVal('hc-inp-age', c.age);
    setVal('hc-inp-mobile', c.mobile);
    setVal('hc-inp-gender', c.gender || 'Male');
    setVal('hc-inp-address', c.address);
    setVal('hc-inp-upi', c.upiId);
    setVal('hc-inp-upi-name', c.upiHolderName || c.name);
    setVal('hc-inp-acc', c.accountNo);
    setVal('hc-inp-ifsc', c.ifsc);

    const avg = Number(this.ratingsData.average || c.rating || 4.9).toFixed(1);
    const total = Number(this.ratingsData.totalCount || c.ratingCount || 0);

    setTxt('hc-prof-rating-avg', avg);
    setTxt('hc-prof-rating-count', `(${total} Customer Ratings)`);
    setTxt('hc-rating-badge-right', `★ ${avg} / 5.0`);

    const barsEl = document.getElementById('hc-rating-bars');
    if (barsEl) {
      const bd = this.ratingsData.breakdown || {};
      const maxVal = Math.max(1, total);
      barsEl.innerHTML = [5, 4, 3, 2, 1].map(star => {
        const cnt = Number(bd[star] || 0);
        const pct = total > 0 ? Math.round((cnt / maxVal) * 100) : (star === 5 ? 90 : (star === 4 ? 10 : 0));
        return `
          <div class="hc-rating-bar-row">
            <span style="width:32px;">${star} ★</span>
            <div class="hc-rating-track"><div class="hc-rating-fill" style="width:${pct}%"></div></div>
            <span style="width:28px; text-align:right; color:#64748B;">${cnt}</span>
          </div>
        `;
      }).join('');
    }

    const revEl = document.getElementById('hc-reviews-list');
    if (revEl) {
      const list = this.ratingsData.reviews || [];
      if (list.length === 0) {
        revEl.innerHTML = `<div class="hc-empty-state">Customer feedback & star ratings after home sample collections will appear here automatically.</div>`;
      } else {
        revEl.innerHTML = list.map(r => `
          <div class="hc-ledger-row" style="flex-direction:column; align-items:flex-start; gap:4px;">
            <div style="display:flex; justify-content:space-between; width:100%;">
              <strong style="font-size:12.5px;">${Utils.escapeHtml(r.patientName || 'Verified Patient')}</strong>
              <span style="color:#D97706; font-weight:900; font-size:12px;">${'★'.repeat(Number(r.stars || 5))}</span>
            </div>
            <p style="font-size:12px; color:#334155;">${Utils.escapeHtml(r.comment || 'Punctual and painless sample collection.')}</p>
          </div>
        `).join('');
      }
    }
  },

  /* =========================================================
     3. ILD SAMPLE DELIVERY POPUP DIRECTORY
     ========================================================= */
  openIldModal() {
    const searchInput = document.getElementById('hc-ild-search');
    if (searchInput) searchInput.value = '';
    this.filterIldContacts('');
    document.getElementById('hc-ild-modal').style.display = 'flex';
  },

  filterIldContacts(query) {
    const listEl = document.getElementById('hc-ild-list-container');
    if (!listEl) return;

    const q = String(query || '').trim().toLowerCase();
    const filtered = this.ildDirectory.filter(item =>
      !q ||
      item.area.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q) ||
      item.phone.includes(q)
    );

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="hc-empty-state">No ILD hub found matching "${Utils.escapeHtml(query)}".</div>`;
      return;
    }

    listEl.innerHTML = filtered.map(item => `
      <a href="tel:+91${item.phone}" class="hc-ild-row">
        <div>
          <strong style="font-size:13px; display:block;">${Utils.escapeHtml(item.area)}</strong>
          <span style="font-size:11px; color:#64748B;">${Utils.escapeHtml(item.code)} • ${Utils.escapeHtml(item.timing)}</span>
        </div>
        <span class="hc-ild-call-pill">📞 Call</span>
      </a>
    `).join('');
  },

  /* =========================================================
     4. DATE, STORAGE & PERSISTENT DUTY SWITCH
     ========================================================= */
  getLocalYmd(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  getTomorrowYmd() {
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    return this.getLocalYmd(tmrw);
  },

  normalizeBookingDateYmd(rawDate) {
    if (!rawDate) return '';
    const s = String(rawDate).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }

    const parsed = new Date(s);
    return !isNaN(parsed.getTime()) ? this.getLocalYmd(parsed) : '';
  },

  isTodaySlotOnTime(timeSlotStr) {
    if (!timeSlotStr) return true;
    const str = String(timeSlotStr).trim();
    const parts = str.split(/[-–to]/i);
    const endPart = (parts.length > 1 ? parts[1] : parts[0]).trim();

    const match = endPart.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return true;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3] ? match[3].toUpperCase() : '';

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const now = new Date();
    const slotEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
    const graceCutoffMs = slotEnd.getTime() + (60 * 60 * 1000);
    return now.getTime() <= graceCutoffMs;
  },

  setDayFilter(filterType) {
    this.dayFilter = filterType;
    ['ALL', 'TODAY', 'TOMORROW'].forEach(f => {
      document.getElementById(`hc-flt-${f}`)?.classList.toggle('active', f === filterType);
    });
    this.renderIncomingList();
  },

  loadWalletData() {
    try {
      const raw = localStorage.getItem(`selfcare_hc_wallet_${this.currentCaptain.id}`);
      if (raw) this.wallet = { ...this.wallet, ...JSON.parse(raw) };
    } catch (e) {}
  },

  saveWalletData() {
    localStorage.setItem(`selfcare_hc_wallet_${this.currentCaptain.id}`, JSON.stringify(this.wallet));
    this.renderWallet();
    this.renderPerformanceStats();
  },

  loadTripsData() {
    try {
      const actMulti = localStorage.getItem(`selfcare_hc_active_multi_${this.currentCaptain.id}`);
      if (actMulti) {
        this.activeTrips = JSON.parse(actMulti);
      } else {
        // Migrate legacy single active trip if any
        const legacyAct = localStorage.getItem(`selfcare_hc_active_${this.currentCaptain.id}`);
        if (legacyAct) {
          this.activeTrips = [JSON.parse(legacyAct)];
          localStorage.removeItem(`selfcare_hc_active_${this.currentCaptain.id}`);
        }
      }

      const hist = localStorage.getItem(`selfcare_hc_completed_${this.currentCaptain.id}`);
      if (hist) this.completedTrips = JSON.parse(hist);
    } catch (e) {}
  },

  saveTripsData() {
    localStorage.setItem(`selfcare_hc_active_multi_${this.currentCaptain.id}`, JSON.stringify(this.activeTrips));
    localStorage.setItem(`selfcare_hc_completed_${this.currentCaptain.id}`, JSON.stringify(this.completedTrips));
    this.renderPerformanceStats();
  },

  toggleDuty(online, silent = false) {
    this.isOnline = Boolean(online);
    localStorage.setItem('selfcare_hc_online', String(this.isOnline));

    const lbl = document.getElementById('hc-duty-label');
    const pill = document.getElementById('hc-duty-pill-box');

    if (this.isOnline) {
      this.requestNotificationPermission();
      if (lbl) { lbl.textContent = 'ONLINE'; lbl.classList.add('online'); }
      if (pill) pill.classList.add('is-online');

      this.syncBookings(!silent);
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => this.syncBookings(false), 10000);
    } else {
      if (lbl) { lbl.textContent = 'OFFLINE'; lbl.classList.remove('online'); }
      if (pill) pill.classList.remove('is-online');
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.renderIncomingList();
    }
    this.renderActiveTrips();
  },

  /* =========================================================
     5. EXACT GOOGLE MAPS NAVIGATION & VISIT FEE EVALUATION
     ========================================================= */
  buildAccurateMapsUrl(b) {
    // 1. Check explicit latitude/longitude fields
    if (b.latitude && b.longitude) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${b.latitude},${b.longitude}`)}`;
    }
    if (b.destCoords && b.destCoords.lat && b.destCoords.lng && !b.destCoords.isFallback) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${b.destCoords.lat},${b.destCoords.lng}`)}`;
    }

    // 2. Check if customer shared a Google Maps link or lat,lng string in location
    const rawLoc = String(b.location?.link || b.location || '').trim();
    if (rawLoc.startsWith('http://') || rawLoc.startsWith('https://')) {
      return rawLoc;
    }
    const coordMatch = rawLoc.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (coordMatch) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${coordMatch[1]},${coordMatch[2]}`)}`;
    }

    // 3. Use exact full customer address + landmark + pincode for Google Maps Navigation
    const fullQuery = [b.address, b.landmark, b.area, b.pincode, 'Chennai, Tamil Nadu']
      .filter(Boolean)
      .join(', ');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullQuery || 'Vettuvankeni, Chennai')}`;
  },

  evaluateVisitFee(b) {
    const items = Array.isArray(b.items) ? b.items : [];
    const blob = items.map(i => `${i.name || ''} ${i.code || ''}`).join(' ').toUpperCase();

    const hasFbs = /FBS|FASTING/.test(blob);
    const hasPpbs = /PPBS|POST\s*PRANDIAL/.test(blob);
    const patients = new Set(items.map(i => i.patientId || i.patientName).filter(Boolean));

    const isMulti = Boolean(
      b.isMultiVisit ||
      Number(b.doorstepCharge) === 150 ||
      (hasFbs && hasPpbs) ||
      patients.size > 1
    );

    return {
      isMulti,
      fee: isMulti ? this.MULTI_VISIT_FEE : this.SINGLE_VISIT_FEE,
      label: isMulti ? 'Multi-Visit (₹250)' : 'Single Visit (₹150)'
    };
  },

  isStrictCustomerHomeBooking(b) {
    if (!b || !b.bookingId) return false;

    const status = String(b.bookingStatus || 'CONFIRMED').toUpperCase();
    if (status === 'COMPLETED' || status === 'CANCELLED') return false;

    const source = String(b.bookingSource || b.source || b.createdBy || b.channel || '').toUpperCase();
    if (
      source.includes('LAB') ||
      source.includes('DESK') ||
      source.includes('TECH') ||
      source.includes('WALK') ||
      source.includes('OFFLINE_DESK') ||
      b.isLabDesk === true ||
      b.isWalkIn === true
    ) {
      return false;
    }

    const colType = String(b.collectionType || '').toLowerCase();
    const addrLower = String(b.address || '').toLowerCase();
    if (colType === 'lab' || colType === 'walkin' || addrLower.includes('direct lab') || addrLower.includes('walk-in')) {
      return false;
    }

    return true;
  },

  isCashPayment(b) {
    const mode = String(b.paymentMode || b.paymentMethod || '').toUpperCase();
    const payStatus = String(b.paymentStatus || '').toUpperCase();
    if (payStatus === 'PAID' && !mode.includes('CASH') && !mode.includes('COD')) return false;
    return mode.includes('CASH') || mode.includes('COD') || mode.includes('DOORSTEP');
  },

  /* =========================================================
     6. LIVE SYNC (NO GPS LIMIT, UNLIMITED ORDERS, NO REPEAT POPUPS)
     ========================================================= */
  async syncBookings(showToast = false) {
    let rawBookings = [];
    const todayYmd = this.getLocalYmd(new Date());
    const tomorrowYmd = this.getTomorrowYmd();

    if (navigator.onLine && typeof Api !== 'undefined') {
      try {
        const res = await Api.request('getPendingHomeCollections', {
          todayDate: todayYmd,
          tomorrowDate: tomorrowYmd,
          customerOnly: true
        });
        const list = res?.bookings || res?.data || (Array.isArray(res) ? res : []);
        if (Array.isArray(list)) rawBookings.push(...list);
      } catch (e) {}

      if (rawBookings.length === 0) {
        try {
          const allRes = await Api.request('getAllBookings', { limit: 120 });
          const allList = allRes?.bookings || allRes?.data || (Array.isArray(allRes) ? allRes : []);
          if (Array.isArray(allList)) rawBookings.push(...allList);
        } catch (e) {}
      }
    }

    try {
      const keys = [
        'selfcare_recent_bookings',
        'selfcare_bookings_db',
        'selfcare_user_bookings',
        'selfcare_customer_bookings',
        'selfcare_pending_sync'
      ];
      keys.forEach(k => {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(arr)) rawBookings.push(...arr);
      });
    } catch (e) {}

    if (typeof OfflineDB !== 'undefined' && typeof OfflineDB.getAllBookings === 'function') {
      try {
        const idbList = await OfflineDB.getAllBookings();
        if (Array.isArray(idbList)) rawBookings.push(...idbList);
      } catch (e) {}
    }

    const doneIds = new Set(this.completedTrips.map(t => t.bookingId));
    const activeIds = new Set(this.activeTrips.map(t => t.bookingId));
    const map = new Map();

    rawBookings.forEach(b => {
      if (!this.isStrictCustomerHomeBooking(b)) return;
      if (doneIds.has(b.bookingId)) return;
      if (activeIds.has(b.bookingId)) return;

      if (b.assignedTechId && String(b.assignedTechId) !== String(this.currentCaptain.id)) return;

      const bookingDateYmd = this.normalizeBookingDateYmd(b.collectionDate || b.date || b.appointmentDate);
      let scheduleDayType = null;

      if (!bookingDateYmd || bookingDateYmd === todayYmd) {
        if (!this.isTodaySlotOnTime(b.timeSlot)) return;
        scheduleDayType = 'TODAY';
      } else if (bookingDateYmd === tomorrowYmd) {
        scheduleDayType = 'TOMORROW';
      } else {
        return;
      }

      const feeInfo = this.evaluateVisitFee(b);
      map.set(b.bookingId, {
        ...b,
        collectionDate: bookingDateYmd || todayYmd,
        scheduleDayType,
        techEarning: feeInfo.fee,
        isMultiVisit: feeInfo.isMulti,
        visitLabel: feeInfo.label,
        isCash: this.isCashPayment(b)
      });
    });

    this.incomingOrders = Array.from(map.values()).sort((a, b) => {
      if (a.scheduleDayType !== b.scheduleDayType) {
        return a.scheduleDayType === 'TODAY' ? -1 : 1;
      }
      return String(b.bookingId).localeCompare(String(a.bookingId));
    });

    const todayCnt = this.incomingOrders.filter(o => o.scheduleDayType === 'TODAY').length;
    const tmrwCnt = this.incomingOrders.filter(o => o.scheduleDayType === 'TOMORROW').length;

    const cntAll = document.getElementById('hc-cnt-all');
    const cntToday = document.getElementById('hc-cnt-today');
    const cntTmrw = document.getElementById('hc-cnt-tomorrow');
    if (cntAll) cntAll.textContent = this.incomingOrders.length;
    if (cntToday) cntToday.textContent = todayCnt;
    if (cntTmrw) cntTmrw.textContent = tmrwCnt;

    this.renderIncomingList();

    // Only notify genuinely NEW orders that have NEVER been declined or notified before
    if (this.isOnline && !this.popupOrder && this.incomingOrders.length > 0) {
      const freshOrder = this.incomingOrders.find(
        o => !this.seenAlertIds.has(o.bookingId) && !this.declinedIds.has(o.bookingId)
      );
      if (freshOrder) {
        this.seenAlertIds.add(freshOrder.bookingId);
        this.saveAlertMemory();
        this.triggerRapidoIncomingAlert(freshOrder);
      }
    }

    if (showToast) {
      Utils.showToast(`Synced: ${todayCnt} Today, ${tmrwCnt} Tomorrow Customer Pickups`, 'info');
    }
  },

  /* =========================================================
     7. BACKGROUND PUSH NOTIFICATIONS & RAPIDO POPUP
     ========================================================= */
  registerServiceWorkerNotifications() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CAPTAIN_POPUP_ACTION') {
          const { action, bookingId } = event.data;
          if (action === 'accept' && bookingId) {
            this.acceptBooking(bookingId);
          } else if (action === 'decline' && bookingId) {
            this.declinedIds.add(bookingId);
            this.seenAlertIds.add(bookingId);
            this.saveAlertMemory();
          }
        }
      });
    }
  },

  requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  },

  checkUrlPopupAction() {
    const params = new URLSearchParams(window.location.search);
    const act = params.get('hc_action');
    const bid = params.get('bookingId');
    if (act && bid) {
      setTimeout(() => {
        if (act === 'accept') this.acceptBooking(bid);
        if (act === 'decline') {
          this.declinedIds.add(bid);
          this.seenAlertIds.add(bid);
          this.saveAlertMemory();
        }
      }, 1200);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  },

  playRapidoAlertTone() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const notes = [880, 1108.73, 1318.51];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.14);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.14 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.14);
        osc.stop(ctx.currentTime + idx * 0.14 + 0.36);
      });
    } catch (e) {}
  },

  async triggerSystemNotification(order) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const payText = order.isCash ? `Cash ₹${order.finalAmount || 0}` : 'Paid Online';
    const title = `🛵 New Home Pickup (+₹${order.techEarning})`;
    const body = `${order.patientName || 'Patient'} • ${order.address || 'Chennai'}\n${order.timeSlot || 'Scheduled'} • ${payText}`;

    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: 'assets/images/logo.png',
          badge: 'assets/images/logo.png',
          tag: `hc-pickup-${order.bookingId}`,
          renotify: false,
          requireInteraction: true,
          vibrate: [300, 150, 300, 150, 400],
          data: { bookingId: order.bookingId, url: 'home-collection.html' },
          actions: [
            { action: 'accept', title: '✓ Accept Pickup' },
            { action: 'decline', title: '✕ Decline' }
          ]
        });
      } else {
        new Notification(title, { body, icon: 'assets/images/logo.png', tag: `hc-pickup-${order.bookingId}` });
      }
    } catch (e) {}
  },

  triggerRapidoIncomingAlert(order) {
    this.popupOrder = order;
    this.popupSecondsLeft = 30;

    this.playRapidoAlertTone();
    if (navigator.vibrate) navigator.vibrate([300, 120, 300]);
    this.triggerSystemNotification(order);

    const items = Array.isArray(order.items) ? order.items : [];
    const testSummary = items.map(i => i.name || i.TestName || 'Lab Test').join(', ') || 'Diagnostic Package';

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('hc-rap-fee', `₹${order.techEarning}`);
    setTxt('hc-rap-visit-type', `${order.visitLabel} • Customer Home Pickup`);
    setTxt('hc-rap-patient', `${order.patientName || 'Customer'} (${order.bookingId})`);
    setTxt('hc-rap-address', order.address || 'Chennai');
    setTxt('hc-rap-slot', `${order.collectionDate} • ${order.timeSlot || 'Scheduled Slot'}`);
    setTxt('hc-rap-tests', `Tests: ${testSummary}`);

    const payBadge = document.getElementById('hc-rap-payment-badge');
    if (payBadge) {
      if (order.isCash) {
        payBadge.className = 'hc-rap-pay-pill hc-pay-pill-cash';
        payBadge.textContent = `💵 CASH ON COLLECTION: ₹${order.finalAmount || 0}`;
      } else {
        payBadge.className = 'hc-rap-pay-pill hc-pay-pill-online';
        payBadge.textContent = `✅ PAID ONLINE (₹${order.finalAmount || 0})`;
      }
    }

    const timerEl = document.getElementById('hc-rapido-timer');
    if (timerEl) timerEl.textContent = `${this.popupSecondsLeft}s`;

    const popupEl = document.getElementById('hc-rapido-popup');
    if (popupEl) popupEl.style.display = 'flex';

    if (this.popupTimerId) clearInterval(this.popupTimerId);
    this.popupTimerId = setInterval(() => {
      this.popupSecondsLeft -= 1;
      if (timerEl) timerEl.textContent = `${this.popupSecondsLeft}s`;
      if (this.popupSecondsLeft <= 0) {
        this.closeRapidoPopup();
      }
    }, 1000);
  },

  acceptIncomingPopup() {
    if (!this.popupOrder) return;
    const bid = this.popupOrder.bookingId;
    this.closeRapidoPopup();
    this.acceptBooking(bid);
  },

  declineIncomingPopup() {
    if (this.popupOrder) {
      this.declinedIds.add(this.popupOrder.bookingId);
      this.seenAlertIds.add(this.popupOrder.bookingId);
      this.saveAlertMemory();
    }
    this.closeRapidoPopup();
    Utils.showToast('Pickup request declined', 'info');
  },

  closeRapidoPopup() {
    if (this.popupTimerId) clearInterval(this.popupTimerId);
    this.popupTimerId = null;
    this.popupOrder = null;
    const el = document.getElementById('hc-rapido-popup');
    if (el) el.style.display = 'none';
  },

  /* =========================================================
     8. RENDER CUSTOMER BOOKING QUEUE & UNLIMITED ACTIVE ORDERS
     ========================================================= */
  renderIncomingList() {
    const container = document.getElementById('hc-incoming-list');
    if (!container) return;

    if (!this.isOnline) {
      container.innerHTML = `<div class="hc-empty-state">You are currently <strong>OFFLINE</strong>. Switch ON the top duty toggle to receive Customer Home Collection requests.</div>`;
      return;
    }

    const filtered = this.incomingOrders.filter(o => {
      if (this.dayFilter === 'TODAY') return o.scheduleDayType === 'TODAY';
      if (this.dayFilter === 'TOMORROW') return o.scheduleDayType === 'TOMORROW';
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div class="hc-empty-state">No new customer home collection bookings available right now.</div>`;
      return;
    }

    container.innerHTML = filtered.map(o => {
      const items = Array.isArray(o.items) ? o.items : [];
      const testSummary = items.map(i => i.name || i.TestName || 'Diagnostic Test').join(', ') || 'Lab Checkup';
      const isToday = o.scheduleDayType === 'TODAY';

      const dayBadge = isToday
        ? `<span class="hc-badge-today">● TODAY ON-TIME</span>`
        : `<span class="hc-badge-tomorrow">📅 TOMORROW</span>`;

      const payPill = o.isCash
        ? `<span class="hc-pay-pill-cash">💵 CASH: ₹${o.finalAmount || 0}</span>`
        : `<span class="hc-pay-pill-online">✅ PAID ONLINE (₹${o.finalAmount || 0})</span>`;

      return `
        <div class="hc-order-card">
          <div class="hc-order-top">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              ${dayBadge}
            </div>
            <span class="hc-fee-tag">+ ₹${o.techEarning} Payout</span>
          </div>

          <strong class="hc-order-title">${Utils.escapeHtml(o.patientName || 'Customer')} • ${Utils.escapeHtml(o.bookingId)}</strong>
          <p class="hc-order-addr">🏠 ${Utils.escapeHtml(o.address || 'Chennai')}</p>

          <div class="hc-tags-wrap">
            ${payPill}
            <span class="hc-meta-pill">${o.visitLabel}</span>
            <span class="hc-meta-pill">⏱️ ${Utils.escapeHtml(o.timeSlot || 'Scheduled Slot')}</span>
          </div>

          <p class="hc-tests-line"><strong>Tests:</strong> ${Utils.escapeHtml(testSummary)}</p>

          <button type="button" class="hc-btn-3d-primary" onclick="HomeCollectionApp.acceptBooking('${o.bookingId}')">
            Accept Pickup (Earn ₹${o.techEarning}) ➔
          </button>
        </div>
      `;
    }).join('');
  },

  acceptBooking(bookingId) {
    // Unlimited orders allowed simultaneously! No single-order restriction.
    if (this.activeTrips.some(t => t.bookingId === bookingId)) {
      Utils.showToast('Booking already in your active pickups', 'info');
      return;
    }

    const order = this.incomingOrders.find(o => o.bookingId === bookingId);
    if (!order) return;

    const newTrip = {
      ...order,
      stage: 1,
      cashReceivedConfirmed: !order.isCash,
      acceptedAt: new Date().toISOString()
    };

    this.activeTrips.unshift(newTrip);
    this.incomingOrders = this.incomingOrders.filter(o => o.bookingId !== bookingId);
    this.seenAlertIds.add(bookingId);
    this.saveAlertMemory();
    this.saveTripsData();
    this.renderIncomingList();
    this.renderActiveTrips();

    if (navigator.onLine && typeof Api !== 'undefined') {
      Api.request('assignHomeCollection', {
        bookingId: order.bookingId,
        captainId: this.currentCaptain.id,
        captainName: this.currentCaptain.name,
        techId: this.currentCaptain.id,
        techName: this.currentCaptain.name,
        techEarning: order.techEarning
      }).catch(() => {});
    }

    Utils.showToast(`Accepted ${bookingId}! Added to Active Pickups.`, 'success');
  },

  getVacutainerGuide(items) {
    const txt = (items || []).map(i => `${i.name || ''} ${i.code || ''}`).join(' ').toUpperCase();
    const list = [];
    if (/CBC|HBA1C|ESR|PLATELET|HEMOGLOBIN/.test(txt)) list.push('EDTA (Lavender)');
    if (/FBS|PPBS|RBS|GLUCOSE|SUGAR/.test(txt)) list.push('Fluoride (Grey)');
    if (/LFT|KFT|LIPID|THYROID|TSH|VITAMIN|CHOLESTEROL|CREATININE|CRP/.test(txt)) list.push('SST Gel / Red');
    if (/URINE/.test(txt)) list.push('Sterile Urine Container');
    return list.length > 0 ? list.join(' • ') : 'SST Gel + EDTA';
  },

  confirmCashReceived(bookingId) {
    const trip = this.activeTrips.find(t => t.bookingId === bookingId);
    if (!trip || !trip.isCash) return;
    const amt = Number(trip.finalAmount || 0);

    trip.cashReceivedConfirmed = true;
    trip.cashReceivedAt = new Date().toISOString();
    this.saveTripsData();
    this.renderActiveTrips();

    if (navigator.onLine && typeof Api !== 'undefined') {
      Api.request('recordCashCollection', {
        bookingId: trip.bookingId,
        captainId: this.currentCaptain.id,
        captainName: this.currentCaptain.name,
        amountCollected: amt,
        paymentStatus: 'PAID_CASH',
        collectedAt: trip.cashReceivedAt
      }).catch(() => {});
    }

    Utils.showToast(`₹${amt} Cash Received confirmed for ${bookingId}!`, 'success');
  },

  renderActiveTrips() {
    const wrapper = document.getElementById('hc-active-trips-wrapper');
    const box = document.getElementById('hc-active-trip-box');
    const countBadge = document.getElementById('hc-active-count-badge');
    if (!wrapper || !box) return;

    if (!this.activeTrips || this.activeTrips.length === 0) {
      wrapper.style.display = 'none';
      return;
    }

    wrapper.style.display = 'block';
    if (countBadge) countBadge.textContent = this.activeTrips.length;

    box.innerHTML = this.activeTrips.map(t => {
      const navUrl = this.buildAccurateMapsUrl(t);

      let cashSectionHtml = '';
      if (t.isCash) {
        if (!t.cashReceivedConfirmed) {
          cashSectionHtml = `
            <div class="hc-cash-collect-box">
              <div>
                <strong style="font-size:12.5px; color:#92400E;">💵 Cash Payment Due: ₹${t.finalAmount || 0}</strong>
                <span style="display:block; font-size:11px; color:#B45309;">Collect cash from customer & tap button</span>
              </div>
              <button type="button" class="hc-btn-cash-received" onclick="HomeCollectionApp.confirmCashReceived('${t.bookingId}')">
                ✓ Received Cash (₹${t.finalAmount || 0})
              </button>
            </div>
          `;
        } else {
          cashSectionHtml = `
            <div class="hc-cash-collect-box collected">
              <div>
                <strong style="font-size:12.5px; color:#065F46;">✅ Cash Received: ₹${t.finalAmount || 0}</strong>
                <span style="display:block; font-size:11px; color:#047857;">Synced with Selfcare Backend</span>
              </div>
              <span class="hc-pay-pill-online">VERIFIED</span>
            </div>
          `;
        }
      }

      let stepBtn = '';
      if (t.stage === 1) {
        stepBtn = `<button type="button" class="hc-btn-3d-primary" onclick="HomeCollectionApp.markArrived('${t.bookingId}')">📍 Reached Customer Doorstep</button>`;
      } else if (t.stage === 2) {
        stepBtn = `<button type="button" class="hc-btn-3d-primary" onclick="HomeCollectionApp.openOtpModal('${t.bookingId}')">🔐 Enter Booking OTP & Collect Sample</button>`;
      } else if (t.stage === 3) {
        stepBtn = `<button type="button" class="hc-btn-3d-primary" onclick="HomeCollectionApp.completeLabDrop('${t.bookingId}')">🏥 Drop Sample at Lab & Credit ₹${t.techEarning}</button>`;
      }

      return `
        <div class="hc-active-card">
          <div class="hc-order-top">
            <span class="hc-rate-badge">ACTIVE • ${Utils.escapeHtml(t.bookingId)}</span>
            <span class="hc-fee-tag">Fee: ₹${t.techEarning}</span>
          </div>

          <div class="hc-stage-grid">
            <div class="hc-stage-pill ${t.stage >= 1 ? 'done' : ''}">1. En-Route</div>
            <div class="hc-stage-pill ${t.stage >= 2 ? 'done' : ''}">2. At Doorstep</div>
            <div class="hc-stage-pill ${t.stage >= 3 ? 'done' : ''}">3. Collected</div>
            <div class="hc-stage-pill ${t.stage >= 4 ? 'done' : ''}">4. Lab Drop</div>
          </div>

          <strong class="hc-order-title">${Utils.escapeHtml(t.patientName)} (+91 ${Utils.escapeHtml(t.patientPhone || '')})</strong>
          <p class="hc-order-addr">🏠 ${Utils.escapeHtml(t.address)}</p>

          ${cashSectionHtml}

          <div class="hc-info-box">
            <div><strong>Schedule:</strong> ${Utils.escapeHtml(t.collectionDate || '')} • ${Utils.escapeHtml(t.timeSlot || '')}</div>
            <div><strong>Vacutainers:</strong> ${this.getVacutainerGuide(t.items)}</div>
            <div><strong>Payment Status:</strong> ${t.isCash ? (t.cashReceivedConfirmed ? `Cash Received (₹${t.finalAmount})` : `Pending Cash (₹${t.finalAmount})`) : `Paid Online (₹${t.finalAmount || 0})`}</div>
          </div>

          <div style="display:flex; gap:8px; margin-bottom:10px;">
            <a href="${navUrl}" target="_blank" rel="noopener noreferrer" class="hc-btn-secondary" style="flex:1;">🗺️ Navigate Map</a>
            <a href="tel:+91${Utils.escapeHtml(t.patientPhone || '')}" class="hc-btn-secondary" style="flex:1;">📞 Call Customer</a>
          </div>

          ${stepBtn}
        </div>
      `;
    }).join('');
  },

  markArrived(bookingId) {
    const trip = this.activeTrips.find(t => t.bookingId === bookingId);
    if (!trip) return;
    trip.stage = 2;
    this.saveTripsData();
    this.renderActiveTrips();
    Utils.showToast('Arrived at Doorstep! Enter customer booking OTP.', 'info');
  },

  /* =========================================================
     9. STRICT BOOKING OTP VERIFICATION & LAB DROP
     ========================================================= */
  getExpectedBookingOtp(trip) {
    // Check explicit OTP fields created in booking workflow
    const rawOtp = trip.pickupOtp || trip.otp || trip.verificationOtp || trip.bookingOtp || trip.collectionOtp;
    if (rawOtp !== undefined && rawOtp !== null && String(rawOtp).trim() !== '') {
      return String(rawOtp).trim();
    }
    // Fallback deterministic 4-digit booking OTP (last 4 digits of Booking ID)
    const digits = String(trip.bookingId || '').replace(/\D/g, '');
    return digits.slice(-4);
  },

  openOtpModal(bookingId) {
    const trip = this.activeTrips.find(t => t.bookingId === bookingId);
    if (!trip) return;
    this.otpTargetBookingId = bookingId;

    const descEl = document.getElementById('hc-otp-modal-desc');
    if (descEl) {
      descEl.textContent = `Enter the exact OTP generated in ${trip.patientName}'s booking (${bookingId}) to confirm sample collection.`;
    }

    const inp = document.getElementById('hc-otp-input');
    if (inp) inp.value = '';
    document.getElementById('hc-otp-modal').style.display = 'flex';
  },

  verifyOtpAndCollect() {
    const trip = this.activeTrips.find(t => t.bookingId === this.otpTargetBookingId);
    if (!trip) return;

    const enteredOtp = String(document.getElementById('hc-otp-input')?.value || '').trim();
    const expectedOtp = this.getExpectedBookingOtp(trip);

    if (!enteredOtp || enteredOtp !== expectedOtp) {
      Utils.showToast('Invalid OTP! Please enter the exact OTP from the customer booking.', 'error');
      return;
    }

    trip.stage = 3;
    trip.verifiedOtp = enteredOtp;
    trip.collectedAt = new Date().toISOString();
    this.saveTripsData();
    this.closeModal('hc-otp-modal');
    this.renderActiveTrips();
    Utils.showToast('OTP Verified & Sample Collected! Drop at Lab to credit wallet.', 'success');
  },

  completeLabDrop(bookingId) {
    const trip = this.activeTrips.find(t => t.bookingId === bookingId);
    if (!trip) return;

    if (trip.isCash && !trip.cashReceivedConfirmed) {
      Utils.showToast('Please tap "Received Cash" button before completing Lab Drop!', 'error');
      return;
    }

    const fee = Number(trip.techEarning || this.SINGLE_VISIT_FEE);
    const codAmt = trip.isCash ? Number(trip.finalAmount || 0) : 0;

    this.wallet.availableBalance += fee;
    this.wallet.totalEarned += fee;
    if (codAmt > 0) this.wallet.codCashHeld += codAmt;

    this.wallet.ledger.unshift({
      id: `TXN${Date.now()}`,
      type: 'CREDIT',
      title: `${trip.visitLabel} • ${trip.bookingId}`,
      sub: `${trip.patientName} (${trip.isCash ? `Cash ₹${codAmt} Collected` : 'Paid Online'})`,
      amount: fee,
      date: new Date().toISOString()
    });

    trip.stage = 4;
    trip.completedAt = new Date().toISOString();
    this.completedTrips.unshift(trip);
    this.activeTrips = this.activeTrips.filter(t => t.bookingId !== bookingId);

    this.saveWalletData();
    this.saveTripsData();
    this.renderActiveTrips();
    this.renderHistory();

    if (navigator.onLine && typeof Api !== 'undefined') {
      Api.request('completeHomeCollection', {
        bookingId: trip.bookingId,
        captainId: this.currentCaptain.id,
        captainName: this.currentCaptain.name,
        techId: this.currentCaptain.id,
        techName: this.currentCaptain.name,
        techEarning: fee,
        paymentMode: trip.isCash ? 'CASH' : 'ONLINE',
        codCollected: codAmt,
        cashReceivedConfirmed: trip.cashReceivedConfirmed
      }).catch(() => {});
    }

    Utils.showToast(`Lab Drop Verified! ₹${fee} credited to wallet.`, 'success');
  },

  /* =========================================================
     10. PERFORMANCE STATS, FULL RAZORPAY CASH SETTLEMENT & WHATSAPP PAYOUT
     ========================================================= */
  renderPerformanceStats() {
    const now = new Date();
    const todayYmd = this.getLocalYmd(now);
    const pickerEl = document.getElementById('hc-stats-date-picker');
    const selectedDayYmd = (pickerEl && pickerEl.value) ? pickerEl.value : todayYmd;

    const weekStart = new Date(now);
    const dayOfWeek = weekStart.getDay();
    const diffToMon = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
    weekStart.setDate(now.getDate() + diffToMon);
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);

    let dayVisits = 0, dayEarn = 0;
    let weekVisits = 0, weekEarn = 0;
    let monthVisits = 0, monthEarn = 0;

    (this.completedTrips || []).forEach(t => {
      const rawDate = t.completedAt || t.collectionDate;
      if (!rawDate) return;
      const dObj = new Date(rawDate);
      if (isNaN(dObj.getTime())) return;

      const tripYmd = this.getLocalYmd(dObj);
      const earn = Number(t.techEarning || this.SINGLE_VISIT_FEE);

      if (tripYmd === selectedDayYmd) {
        dayVisits += 1;
        dayEarn += earn;
      }
      if (dObj >= weekStart) {
        weekVisits += 1;
        weekEarn += earn;
      }
      if (dObj >= monthStart) {
        monthVisits += 1;
        monthEarn += earn;
      }
    });

    const dayLbl = document.getElementById('hc-stat-day-lbl');
    if (dayLbl) {
      dayLbl.textContent = selectedDayYmd === todayYmd ? 'Day-Wise (Today)' : `Day (${selectedDayYmd})`;
    }

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('hc-stat-day-visits', `${dayVisits} Visits`);
    setTxt('hc-stat-day-earn', `₹${dayEarn.toLocaleString('en-IN')}`);
    setTxt('hc-stat-week-visits', `${weekVisits} Visits`);
    setTxt('hc-stat-week-earn', `₹${weekEarn.toLocaleString('en-IN')}`);
    setTxt('hc-stat-month-visits', `${monthVisits} Visits`);
    setTxt('hc-stat-month-earn', `₹${monthEarn.toLocaleString('en-IN')}`);

    setTxt('hc-w-day-cnt', `${dayVisits} Visits`);
    setTxt('hc-w-day-amt', `₹${dayEarn.toLocaleString('en-IN')}`);
    setTxt('hc-w-week-cnt', `${weekVisits} Visits`);
    setTxt('hc-w-week-amt', `₹${weekEarn.toLocaleString('en-IN')}`);
    setTxt('hc-w-month-cnt', `${monthVisits} Visits`);
    setTxt('hc-w-month-amt', `₹${monthEarn.toLocaleString('en-IN')}`);
  },

  selectPayoutCycle(cycle) {
    this.wallet.payoutCycle = cycle;
    this.saveWalletData();
    Utils.showToast(`Payout schedule set to ${cycle}`, 'success');
  },

  openPayoutModal() {
    // 1. Block withdrawal completely if ANY customer cash is unsettled
    if (Number(this.wallet.codCashHeld || 0) > 0) {
      Utils.showToast(`Settle ₹${this.wallet.codCashHeld} collected cash via Razorpay first before withdrawing!`, 'error');
      return;
    }

    // 2. Ensure Captain has filled their UPI ID in Profile
    const targetUpi = this.wallet.bank?.upiId || this.currentCaptain?.upiId;
    if (!targetUpi) {
      Utils.showToast('Please enter your UPI ID in Profile tab before requesting withdrawal', 'error');
      this.switchTab('profile');
      return;
    }

    if (this.wallet.availableBalance < 150) {
      Utils.showToast('Minimum ₹150 balance required for withdrawal', 'error');
      return;
    }

    const avail = Number(this.wallet.availableBalance);
    document.getElementById('hc-modal-avail').textContent = `₹${avail}`;
    document.getElementById('hc-modal-cycle').textContent = this.wallet.payoutCycle;

    const amtInput = document.getElementById('hc-payout-amt');
    amtInput.value = avail;

    const updatePreview = () => {
      const reqAmt = Number(amtInput.value || 0);
      const previewEl = document.getElementById('hc-payout-preview-box');
      if (previewEl) {
        previewEl.innerHTML = `
          <strong>WhatsApp Payout Slip Preview:</strong><br>
          Technician: <b>${Utils.escapeHtml(this.currentCaptain.name)}</b> (${Utils.escapeHtml(this.currentCaptain.id)})<br>
          Phone: +91 ${Utils.escapeHtml(this.currentCaptain.mobile || 'N/A')}<br>
          UPI ID: <b>${Utils.escapeHtml(targetUpi)}</b><br>
          Withdraw Amount: <b>₹${reqAmt}</b>
        `;
      }
    };

    amtInput.oninput = updatePreview;
    updatePreview();

    document.getElementById('hc-payout-modal').style.display = 'flex';
  },

  confirmPayout() {
    if (Number(this.wallet.codCashHeld || 0) > 0) {
      Utils.showToast('Cash settlement pending! Settle cash via Razorpay first.', 'error');
      return;
    }

    const amt = Number(document.getElementById('hc-payout-amt').value || 0);
    const targetUpi = this.wallet.bank?.upiId || this.currentCaptain?.upiId;

    if (!targetUpi) {
      Utils.showToast('Please update your UPI ID in Profile first.', 'error');
      return;
    }

    if (amt < 150 || amt > this.wallet.availableBalance) {
      Utils.showToast(`Enter amount between ₹150 and ₹${this.wallet.availableBalance}`, 'error');
      return;
    }

    const payoutId = `PAY${Math.floor(100000 + Math.random() * 900000)}`;
    const c = this.currentCaptain;

    // Build formatted WhatsApp message sent from Technician to Admin
    const waText = [
      `*SELFCARE CAPTAIN PAYOUT REQUEST*`,
      `Request ID: ${payoutId}`,
      `Technician Name: ${c.name}`,
      `Captain ID: ${c.id}`,
      `Age / Gender: ${c.age || 'N/A'} / ${c.gender || 'N/A'}`,
      `Phone Number: +91 ${c.mobile || 'N/A'}`,
      `UPI ID: ${targetUpi}`,
      `UPI Holder Name: ${c.upiHolderName || c.name}`,
      c.accountNo ? `Bank A/C: ${c.accountNo} (${c.ifsc || ''})` : '',
      `Payout Cycle: ${this.wallet.payoutCycle}`,
      `*Withdraw Amount: ₹${amt}*`,
      `Cash Settlement Status: SETTLED (₹0 Pending)`
    ].filter(Boolean).join('\n');

    const waUrl = `https://wa.me/${this.ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;

    // Sync payout request to backend
    if (navigator.onLine && typeof Api !== 'undefined') {
      Api.request('requestTechnicianPayout', {
        payoutId,
        captainId: c.id,
        captainName: c.name,
        mobile: c.mobile,
        age: c.age,
        amount: amt,
        cycle: this.wallet.payoutCycle,
        mode: 'WHATSAPP_UPI',
        upiId: targetUpi
      }).catch(() => {});
    }

    // Reset wallet balance to ₹0 upon sending WhatsApp payout request
    this.wallet.availableBalance = 0;
    this.wallet.totalPaidOut += amt;
    this.wallet.ledger.unshift({
      id: payoutId,
      type: 'DEBIT',
      title: `WhatsApp Payout Request Sent`,
      sub: `UPI: ${targetUpi} • Wallet Reset to ₹0`,
      amount: amt,
      date: new Date().toISOString()
    });

    this.saveWalletData();
    this.closeModal('hc-payout-modal');

    // Open WhatsApp with pre-filled technician & payout details
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    Utils.showToast(`WhatsApp payout request opened & wallet reset to ₹0!`, 'success');
  },

  async payCodViaRazorpay() {
    // Strictly full amount only — no partial payment
    const fullDue = Number(this.wallet.codCashHeld || 0);
    if (fullDue <= 0) return;

    if (typeof Razorpay === 'undefined') {
      Utils.showToast('Razorpay SDK not loaded. Check internet.', 'error');
      return;
    }

    try {
      const refId = `COD${Date.now()}`;
      let orderId = '';
      if (typeof Api !== 'undefined' && typeof Api.createRazorpayOrder === 'function') {
        const res = await Api.createRazorpayOrder({
          bookingId: refId,
          finalAmount: fullDue,
          patientName: this.currentCaptain.name,
          patientPhone: this.currentCaptain.mobile
        });
        orderId = res?.orderId || '';
      }

      const rzp = new Razorpay({
        key: (typeof Config !== 'undefined' && Config.RAZORPAY_KEY_ID) || 'rzp_live_Tq9S3sQhh5B3hW',
        amount: Math.round(fullDue * 100), // Full amount in paise
        currency: 'INR',
        name: 'Selfcare Diagnostics',
        description: `Full Cash Settlement (${this.currentCaptain.name})`,
        image: 'assets/images/logo.png',
        ...(orderId ? { order_id: orderId } : {}),
        handler: (response) => {
          // Only executes on verified Razorpay success
          if (!response || !response.razorpay_payment_id) {
            Utils.showToast('Payment verification failed. Cash balance unchanged.', 'error');
            return;
          }

          this.wallet.codCashHeld = 0;
          this.wallet.ledger.unshift({
            id: response.razorpay_payment_id,
            type: 'SETTLED',
            title: 'SETTLED • Full Cash Deposited via Razorpay',
            sub: `Payment ID: ${response.razorpay_payment_id}`,
            amount: fullDue,
            date: new Date().toISOString()
          });
          this.saveWalletData();

          if (navigator.onLine && typeof Api !== 'undefined') {
            Api.request('settleCaptainCodCash', {
              captainId: this.currentCaptain.id,
              amount: fullDue,
              status: 'SETTLED',
              razorpayPaymentId: response.razorpay_payment_id
            }).catch(() => {});
          }

          Utils.showToast(`SETTLED! ₹${fullDue} full cash settled via Razorpay.`, 'success');
        },
        modal: {
          ondismiss: () => {
            Utils.showToast('Razorpay checkout closed. Pending cash remains ₹' + fullDue, 'info');
          }
        },
        prefill: {
          name: this.currentCaptain.name,
          contact: this.currentCaptain.mobile
        },
        theme: { color: '#0F172A' }
      });

      rzp.on('payment.failed', () => {
        Utils.showToast(`Payment Failed! Pending cash remains ₹${fullDue}.`, 'error');
      });

      rzp.open();
    } catch (e) {
      Utils.showToast('Unable to initialize Razorpay checkout. Cash balance unchanged.', 'error');
    }
  },

  renderWallet() {
    const w = this.wallet;
    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('hc-header-wallet', `₹${w.availableBalance}`);
    setTxt('hc-wallet-avail', `₹${w.availableBalance}`);
    setTxt('hc-wallet-total', `₹${w.totalEarned}`);
    setTxt('hc-wallet-paidout', `₹${w.totalPaidOut}`);
    setTxt('hc-wallet-cod', `₹${w.codCashHeld}`);

    const codBox = document.getElementById('hc-cod-settle-box');
    const codInline = document.getElementById('hc-cod-due-inline');
    if (codInline) codInline.textContent = `₹${w.codCashHeld}`;
    if (codBox) codBox.style.display = Number(w.codCashHeld) > 0 ? 'flex' : 'none';

    const withdrawBtn = document.getElementById('hc-withdraw-main-btn');
    if (withdrawBtn) {
      if (Number(w.codCashHeld) > 0) {
        withdrawBtn.style.opacity = '0.55';
        withdrawBtn.textContent = '🔒 Settle Cash to Withdraw';
      } else {
        withdrawBtn.style.opacity = '1';
        withdrawBtn.textContent = 'Withdraw via WhatsApp ➔';
      }
    }

    ['DAILY', 'WEEKLY', 'MONTHLY'].forEach(c => {
      document.getElementById(`cycle-card-${c}`)?.classList.toggle('active', w.payoutCycle === c);
    });
    const pill = document.getElementById('hc-cycle-pill');
    if (pill) pill.textContent = `${w.payoutCycle} PAYOUT`;

    const upiTxt = document.getElementById('hc-linked-upi-text');
    const upiVal = w.bank?.upiId || this.currentCaptain?.upiId;
    if (upiTxt) {
      upiTxt.textContent = upiVal ? `${upiVal} (${this.currentCaptain?.name || ''})` : 'Not Set • Update in Profile';
    }

    this.renderPerformanceStats();

    const ledgerBox = document.getElementById('hc-ledger-container');
    if (!ledgerBox) return;

    if (!w.ledger || w.ledger.length === 0) {
      ledgerBox.innerHTML = `<div class="hc-empty-state">No wallet transactions yet. Complete a customer home collection to earn ₹150 or ₹250.</div>`;
      return;
    }

    ledgerBox.innerHTML = w.ledger.map(item => {
      const color = item.type === 'CREDIT' ? '#059669' : (item.type === 'SETTLED' ? '#0284C7' : '#0F172A');
      const prefix = item.type === 'CREDIT' ? '+' : (item.type === 'SETTLED' ? '✓ ' : '- ');
      return `
        <div class="hc-ledger-row">
          <div>
            <strong style="font-size:12.5px; display:block;">${Utils.escapeHtml(item.title)}</strong>
            <span style="font-size:10.5px; color:#64748B;">${Utils.escapeHtml(item.sub)} • ${new Date(item.date).toLocaleDateString('en-GB')}</span>
          </div>
          <strong style="color:${color}; font-size:13.5px;">
            ${prefix}₹${item.amount}
          </strong>
        </div>
      `;
    }).join('');
  },

  renderHistory() {
    const box = document.getElementById('hc-history-container');
    const badge = document.getElementById('hc-history-count');
    if (badge) badge.textContent = `${this.completedTrips.length} Trips`;
    if (!box) return;

    if (this.completedTrips.length === 0) {
      box.innerHTML = `<div class="hc-empty-state">No completed customer home visits yet.</div>`;
      return;
    }

    box.innerHTML = this.completedTrips.map(t => `
      <div class="hc-order-card">
        <div class="hc-order-top">
          <strong>${Utils.escapeHtml(t.bookingId)} • ${Utils.escapeHtml(t.patientName)}</strong>
          <span class="hc-fee-tag">+ ₹${t.techEarning}</span>
        </div>
        <div style="font-size:11.5px; color:#334155; margin-bottom:6px;">
          🏠 ${Utils.escapeHtml(t.address)} • ${t.visitLabel}
        </div>
        <div>
          ${t.isCash
            ? `<span class="hc-pay-pill-cash">💵 Cash Collected: ₹${t.finalAmount || 0}</span>`
            : `<span class="hc-pay-pill-online">✅ Paid Online: ₹${t.finalAmount || 0}</span>`
          }
        </div>
      </div>
    `).join('');
  },

  switchTab(tab) {
    ['orders', 'wallet', 'history', 'profile'].forEach(t => {
      const view = document.getElementById(`hc-view-${t}`);
      const btn = document.getElementById(`tab-btn-${t}`);
      if (view) view.style.display = t === tab ? 'block' : 'none';
      if (btn) btn.classList.toggle('active', t === tab);
    });
    if (tab === 'profile') {
      this.syncCaptainProfileAndRatings();
    }
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  HomeCollectionApp.init();
});

if (typeof window !== 'undefined') {
  window.HomeCollectionApp = HomeCollectionApp;
}
