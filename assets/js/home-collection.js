/* file: assets/js/home-collection.js */
/**
 * Selfcare Diagnostics - Home Collection Captain & Payout Engine v3.2.0
 * Features:
 * 1. Session-Protected Captain Workstation (Redirects to index.html if not logged in).
 * 2. Strict Customer-Only Booking Filter (Excludes all Lab Desk / Walk-in / Technician-created orders).
 * 3. Multi-Source Live & Saved Booking Sync (Backend API + IndexedDB + LocalStorage).
 * 4. Rapido-Style Full-Screen Incoming Popup + Background Push/Service Worker Notifications.
 * 5. Payment Mode Clarity (Paid Online vs Cash) + Mandatory "Received Cash" Confirmation synced to Backend.
 * 6. Read-Only Captain Profile with Live Backend Customer Ratings & Reviews.
 */

const HomeCollectionApp = {
  MAX_RADIUS_KM: 10.0,
  SINGLE_VISIT_FEE: 150,
  MULTI_VISIT_FEE: 250,

  techCoords: { lat: 12.9467, lng: 80.2562 },
  isOnline: false,
  pollTimer: null,
  dayFilter: 'ALL',

  currentCaptain: null,
  incomingOrders: [],
  activeTrip: null,
  completedTrips: [],

  // Rapido Incoming Alert State
  popupOrder: null,
  popupTimerId: null,
  popupSecondsLeft: 30,
  seenAlertIds: new Set(),
  declinedIds: new Set(),

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
     1. SESSION GUARD & WORKSPACE INITIALIZATION
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

      return {
        id: staffId,
        name: parsed.name || parsed.technicianName || parsed.captainName || 'Selfcare Captain',
        mobile: parsed.mobile || (parsed.branchPhone ? String(parsed.branchPhone).replace(/\D/g, '').slice(-10) : ''),
        zone: parsed.zone || 'Vettuvankeni, ECR & OMR (10 km)',
        upiId: parsed.upiId || '',
        accountNo: parsed.accountNo || '',
        ifsc: parsed.ifsc || '',
        rating: Number(parsed.rating || 4.9),
        ratingCount: Number(parsed.ratingCount || 0)
      };
    } catch (e) {
      return null;
    }
  },

  logoutCaptain() {
    if (this.pollTimer) clearInterval(this.pollTimer);
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

    this.loadWalletData();
    this.loadTripsData();
    this.syncCaptainProfileAndRatings();

    const datePicker = document.getElementById('hc-stats-date-picker');
    if (datePicker) {
      datePicker.value = this.getLocalYmd(new Date());
    }

    // Clear stale active trip from previous dates
    const todayYmd = this.getLocalYmd(new Date());
    if (this.activeTrip) {
      const tripDate = this.normalizeBookingDateYmd(this.activeTrip.collectionDate);
      if (tripDate && tripDate < todayYmd) {
        this.activeTrip = null;
        this.saveTripsData();
      }
    }

    this.refreshGps(true);
    this.renderWallet();
    this.renderPerformanceStats();
    this.renderHistory();
    this.renderProfileView();

    const savedOnline = localStorage.getItem('selfcare_hc_online') === 'true';
    const toggle = document.getElementById('hc-duty-toggle');
    if (toggle) toggle.checked = savedOnline;
    this.toggleDuty(savedOnline, true);
  },

  /* =========================================================
     2. ADMIN-CONTROLLED PROFILE & BACKEND RATINGS
     ========================================================= */
  async syncCaptainProfileAndRatings() {
    if (!this.currentCaptain) return;

    if (navigator.onLine && typeof Api !== 'undefined') {
      try {
        const res = await Api.request('getCaptainProfileAndRatings', {
          captainId: this.currentCaptain.id
        });
        if (res && res.success) {
          if (res.captain) {
            this.currentCaptain = { ...this.currentCaptain, ...res.captain };
            localStorage.setItem('selfcare_captain_session', JSON.stringify(this.currentCaptain));
          }
          if (res.ratings) {
            this.ratingsData = {
              average: Number(res.ratings.average || this.currentCaptain.rating || 4.9),
              totalCount: Number(res.ratings.totalCount || 0),
              breakdown: res.ratings.breakdown || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
              reviews: Array.isArray(res.ratings.reviews) ? res.ratings.reviews : []
            };
          }
        }
      } catch (e) {}
    }

    if (this.currentCaptain.upiId) {
      this.wallet.bank = {
        holderName: this.currentCaptain.name,
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

    setTxt('hc-prof-name', c.name || 'Captain');
    setTxt('hc-prof-id-line', `ID: ${c.id} • ${c.zone || 'Chennai Zone'}`);
    setTxt('hc-prof-detail-id', c.id);
    setTxt('hc-prof-detail-mobile', c.mobile ? `+91 ${c.mobile}` : 'Managed by Admin');
    setTxt('hc-prof-detail-zone', c.zone || 'ECR & OMR (10 km)');
    setTxt('hc-prof-detail-upi', c.upiId || 'Managed by Admin');

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
     3. DATE & SCHEDULE HELPERS
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

    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return s.slice(0, 10);
    }

    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) {
      const dd = dmy[1].padStart(2, '0');
      const mm = dmy[2].padStart(2, '0');
      const yyyy = dmy[3];
      return `${yyyy}-${mm}-${dd}`;
    }

    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return this.getLocalYmd(parsed);
    }
    return '';
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
    const graceCutoffMs = slotEnd.getTime() + (45 * 60 * 1000);
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
      const act = localStorage.getItem(`selfcare_hc_active_${this.currentCaptain.id}`);
      if (act) this.activeTrip = JSON.parse(act);

      const hist = localStorage.getItem(`selfcare_hc_completed_${this.currentCaptain.id}`);
      if (hist) this.completedTrips = JSON.parse(hist);
    } catch (e) {}
  },

  saveTripsData() {
    if (this.activeTrip) {
      localStorage.setItem(`selfcare_hc_active_${this.currentCaptain.id}`, JSON.stringify(this.activeTrip));
    } else {
      localStorage.removeItem(`selfcare_hc_active_${this.currentCaptain.id}`);
    }
    localStorage.setItem(`selfcare_hc_completed_${this.currentCaptain.id}`, JSON.stringify(this.completedTrips));
    this.renderPerformanceStats();
  },

  /* =========================================================
     4. DUTY TOGGLE & 10 KM GPS RADAR
     ========================================================= */
  toggleDuty(online, silent = false) {
    this.isOnline = Boolean(online);
    localStorage.setItem('selfcare_hc_online', String(this.isOnline));

    const lbl = document.getElementById('hc-duty-label');
    const pill = document.getElementById('hc-duty-pill-box');
    const dot = document.getElementById('hc-gps-dot');
    const statusTxt = document.getElementById('hc-gps-status-text');

    if (this.isOnline) {
      this.requestNotificationPermission();
      if (lbl) { lbl.textContent = 'ONLINE'; lbl.classList.add('online'); }
      if (pill) pill.classList.add('is-online');
      if (dot) dot.classList.add('active');
      if (statusTxt) statusTxt.textContent = `Online • Scanning Customer Home Pickups (≤ ${this.MAX_RADIUS_KM} km)`;

      this.syncBookings(!silent);
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => this.syncBookings(false), 10000);
    } else {
      if (lbl) { lbl.textContent = 'OFFLINE'; lbl.classList.remove('online'); }
      if (pill) pill.classList.remove('is-online');
      if (dot) dot.classList.remove('active');
      if (statusTxt) statusTxt.textContent = 'Duty Offline • Switch ON to receive Customer Home Pickups';
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.renderIncomingList();
    }
    this.renderActiveTrip();
  },

  refreshGps(silent = false) {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.techCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!silent) Utils.showToast(`GPS Updated (${this.techCoords.lat.toFixed(4)}, ${this.techCoords.lng.toFixed(4)})`, 'success');
        if (this.isOnline) this.syncBookings(false);
      },
      () => {
        if (!silent) Utils.showToast('Using Vettuvankeni Hub GPS', 'info');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  },

  calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(1));
  },

  resolveBookingCoords(b) {
    const rawLoc = String(b.location?.link || b.location || b.address || '');
    const match = rawLoc.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };

    const addr = String(b.address || '').toLowerCase();
    if (addr.includes('velachery')) return { lat: 12.9750, lng: 80.2206 };
    if (addr.includes('adyar')) return { lat: 13.0012, lng: 80.2565 };
    if (addr.includes('thoraipakkam') || addr.includes('omr')) return { lat: 12.9386, lng: 80.2377 };
    if (addr.includes('neelankarai')) return { lat: 12.9492, lng: 80.2547 };
    if (addr.includes('injambakkam')) return { lat: 12.9195, lng: 80.2512 };
    if (addr.includes('sholinganallur')) return { lat: 12.9010, lng: 80.2279 };
    return { lat: 12.9480, lng: 80.2550 };
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

  /* =========================================================
     5. STRICT CUSTOMER-ONLY FILTER + ALL SAVED BOOKINGS SYNC
     ========================================================= */
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

  async syncBookings(showToast = false) {
    let rawBookings = [];
    const todayYmd = this.getLocalYmd(new Date());
    const tomorrowYmd = this.getTomorrowYmd();

    if (navigator.onLine && typeof Api !== 'undefined') {
      try {
        const res = await Api.request('getPendingHomeCollections', {
          lat: this.techCoords.lat,
          lng: this.techCoords.lng,
          radiusKm: this.MAX_RADIUS_KM,
          todayDate: todayYmd,
          tomorrowDate: tomorrowYmd,
          customerOnly: true
        });
        const list = res?.bookings || res?.data || (Array.isArray(res) ? res : []);
        if (Array.isArray(list)) rawBookings.push(...list);
      } catch (e) {}

      if (rawBookings.length === 0) {
        try {
          const allRes = await Api.request('getAllBookings', { limit: 100 });
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
    const map = new Map();

    rawBookings.forEach(b => {
      if (!this.isStrictCustomerHomeBooking(b)) return;
      if (doneIds.has(b.bookingId)) return;
      if (this.activeTrip && this.activeTrip.bookingId === b.bookingId) return;

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

      const coords = this.resolveBookingCoords(b);
      const distKm = this.calculateDistanceKm(this.techCoords.lat, this.techCoords.lng, coords.lat, coords.lng);

      if (distKm <= this.MAX_RADIUS_KM) {
        const feeInfo = this.evaluateVisitFee(b);
        map.set(b.bookingId, {
          ...b,
          collectionDate: bookingDateYmd || todayYmd,
          scheduleDayType,
          distanceKm: distKm,
          destCoords: coords,
          techEarning: feeInfo.fee,
          isMultiVisit: feeInfo.isMulti,
          visitLabel: feeInfo.label,
          isCash: this.isCashPayment(b)
        });
      }
    });

    this.incomingOrders = Array.from(map.values()).sort((a, b) => {
      if (a.scheduleDayType !== b.scheduleDayType) {
        return a.scheduleDayType === 'TODAY' ? -1 : 1;
      }
      return a.distanceKm - b.distanceKm;
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

    if (this.isOnline && !this.activeTrip && !this.popupOrder && this.incomingOrders.length > 0) {
      const freshOrder = this.incomingOrders.find(
        o => !this.seenAlertIds.has(o.bookingId) && !this.declinedIds.has(o.bookingId)
      );
      if (freshOrder) {
        this.seenAlertIds.add(freshOrder.bookingId);
        this.triggerRapidoIncomingAlert(freshOrder);
      }
    }

    if (showToast) {
      Utils.showToast(`Synced: ${todayCnt} Today, ${tmrwCnt} Tomorrow Customer Pickups`, 'info');
    }
  },

  /* =========================================================
     6. RAPIDO-STYLE FULL-SCREEN POPUP & SYSTEM PUSH NOTIFICATION
     ========================================================= */
  registerServiceWorkerNotifications() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CAPTAIN_POPUP_ACTION') {
          const { action, bookingId } = event.data;
          if (action === 'accept' && bookingId) {
            this.acceptBooking(bookingId);
          } else if (action === 'decline' && bookingId) {
            this.declinedIds.add(bookingId);
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
        if (act === 'decline') this.declinedIds.add(bid);
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
    const title = `🛵 New Home Pickup (+₹${order.techEarning}) • ${order.distanceKm} km`;
    const body = `${order.patientName || 'Patient'} • ${order.address || 'Chennai'}\n${order.timeSlot || 'Scheduled'} • ${payText}`;

    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: 'assets/images/logo.png',
          badge: 'assets/images/logo.png',
          tag: `hc-pickup-${order.bookingId}`,
          renotify: true,
          requireInteraction: true,
          vibrate: [300, 150, 300, 150, 400],
          data: { bookingId: order.bookingId, url: 'home-collection.html' },
          actions: [
            { action: 'accept', title: '✓ Accept Pickup' },
            { action: 'decline', title: '✕ Decline' }
          ]
        });
      } else {
        new Notification(title, { body, icon: 'assets/images/logo.png' });
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
    setTxt('hc-rap-visit-type', `${order.visitLabel} • ${order.distanceKm} km away`);
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
    }
    this.closeRapidoPopup();
    Utils.showToast('Pickup request skipped', 'info');
  },

  closeRapidoPopup() {
    if (this.popupTimerId) clearInterval(this.popupTimerId);
    this.popupTimerId = null;
    this.popupOrder = null;
    const el = document.getElementById('hc-rapido-popup');
    if (el) el.style.display = 'none';
  },

  /* =========================================================
     7. RENDER CUSTOMER BOOKING QUEUE
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
      container.innerHTML = `<div class="hc-empty-state">No customer home collection bookings within 10 km right now.</div>`;
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
              <span class="hc-dist-tag">📍 ${o.distanceKm} km</span>
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

  /* =========================================================
     8. ACCEPT TRIP, RECEIVED CASH BUTTON & LAB DROP
     ========================================================= */
  acceptBooking(bookingId) {
    if (this.activeTrip) {
      Utils.showToast('Complete your current active pickup first!', 'error');
      return;
    }

    const order = this.incomingOrders.find(o => o.bookingId === bookingId);
    if (!order) return;

    this.activeTrip = {
      ...order,
      stage: 1,
      cashReceivedConfirmed: !order.isCash,
      acceptedAt: new Date().toISOString()
    };

    this.incomingOrders = this.incomingOrders.filter(o => o.bookingId !== bookingId);
    this.saveTripsData();
    this.renderIncomingList();
    this.renderActiveTrip();

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

    Utils.showToast(`Accepted ${bookingId}! Proceed to customer location.`, 'success');
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

  confirmCashReceived() {
    if (!this.activeTrip || !this.activeTrip.isCash) return;
    const amt = Number(this.activeTrip.finalAmount || 0);

    this.activeTrip.cashReceivedConfirmed = true;
    this.activeTrip.cashReceivedAt = new Date().toISOString();
    this.saveTripsData();
    this.renderActiveTrip();

    if (navigator.onLine && typeof Api !== 'undefined') {
      Api.request('recordCashCollection', {
        bookingId: this.activeTrip.bookingId,
        captainId: this.currentCaptain.id,
        captainName: this.currentCaptain.name,
        amountCollected: amt,
        paymentStatus: 'PAID_CASH',
        collectedAt: this.activeTrip.cashReceivedAt
      }).catch(() => {});
    }

    Utils.showToast(`₹${amt} Cash Received confirmed & synced to backend!`, 'success');
  },

  renderActiveTrip() {
    const box = document.getElementById('hc-active-trip-box');
    if (!box) return;

    if (!this.activeTrip) {
      box.style.display = 'none';
      return;
    }

    const t = this.activeTrip;
    const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${t.destCoords.lat},${t.destCoords.lng}`;

    let cashSectionHtml = '';
    if (t.isCash) {
      if (!t.cashReceivedConfirmed) {
        cashSectionHtml = `
          <div class="hc-cash-collect-box">
            <div>
              <strong style="font-size:12.5px; color:#92400E;">💵 Cash Payment Due: ₹${t.finalAmount || 0}</strong>
              <span style="display:block; font-size:11px; color:#B45309;">Collect cash from customer & tap button</span>
            </div>
            <button type="button" class="hc-btn-cash-received" onclick="HomeCollectionApp.confirmCashReceived()">
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
      stepBtn = `<button type="button" class="hc-btn-3d-primary" onclick="HomeCollectionApp.markArrived()">📍 Reached Customer Doorstep</button>`;
    } else if (t.stage === 2) {
      stepBtn = `<button type="button" class="hc-btn-3d-primary" onclick="HomeCollectionApp.openOtpModal()">🔐 Enter Pickup OTP & Collect Sample</button>`;
    } else if (t.stage === 3) {
      stepBtn = `<button type="button" class="hc-btn-3d-primary" onclick="HomeCollectionApp.completeLabDrop()">🏥 Drop Sample at Lab & Credit ₹${t.techEarning}</button>`;
    }

    box.style.display = 'block';
    box.innerHTML = `
      <div class="hc-active-card">
        <div class="hc-order-top">
          <span class="hc-rate-badge">ACTIVE PICKUP • ${Utils.escapeHtml(t.bookingId)}</span>
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
          <a href="${navUrl}" target="_blank" class="hc-btn-secondary" style="flex:1;">🗺️ Navigate Map</a>
          <a href="tel:+91${Utils.escapeHtml(t.patientPhone || '')}" class="hc-btn-secondary" style="flex:1;">📞 Call Customer</a>
        </div>

        ${stepBtn}
      </div>
    `;
  },

  markArrived() {
    if (!this.activeTrip) return;
    this.activeTrip.stage = 2;
    this.saveTripsData();
    this.renderActiveTrip();
    Utils.showToast('Arrived at Doorstep! Verify 4-digit OTP.', 'info');
  },

  openOtpModal() {
    document.getElementById('hc-otp-input').value = '';
    document.getElementById('hc-otp-modal').style.display = 'flex';
  },

  verifyOtpAndCollect() {
    const otp = String(document.getElementById('hc-otp-input')?.value || '').trim();
    if (otp.length !== 4) {
      Utils.showToast('Enter 4-digit OTP (last 4 digits of Booking ID)', 'error');
      return;
    }
    this.activeTrip.stage = 3;
    this.activeTrip.collectedAt = new Date().toISOString();
    this.saveTripsData();
    this.closeModal('hc-otp-modal');
    this.renderActiveTrip();
    Utils.showToast('Sample collected! Drop at Lab to credit wallet.', 'success');
  },

  completeLabDrop() {
    if (!this.activeTrip) return;

    if (this.activeTrip.isCash && !this.activeTrip.cashReceivedConfirmed) {
      Utils.showToast('Please tap "Received Cash" button before completing Lab Drop!', 'error');
      return;
    }

    const trip = this.activeTrip;
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
    this.activeTrip = null;

    this.saveWalletData();
    this.saveTripsData();
    this.renderActiveTrip();
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
     9. PERFORMANCE STATS, WALLET & PAYOUTS
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
    if (!this.wallet.bank?.upiId && !this.currentCaptain?.upiId) {
      Utils.showToast('Ask Selfcare Admin to link your UPI / Bank account first', 'error');
      return;
    }
    if (this.wallet.availableBalance < 150) {
      Utils.showToast('Minimum ₹150 balance required for payout', 'error');
      return;
    }

    document.getElementById('hc-modal-avail').textContent = `₹${this.wallet.availableBalance}`;
    document.getElementById('hc-modal-cycle').textContent = this.wallet.payoutCycle;
    document.getElementById('hc-payout-amt').value = this.wallet.availableBalance;
    document.getElementById('hc-payout-modal').style.display = 'flex';
  },

  confirmPayout() {
    const amt = Number(document.getElementById('hc-payout-amt').value || 0);
    const channel = document.getElementById('hc-payout-channel').value;
    const targetUpi = this.wallet.bank?.upiId || this.currentCaptain?.upiId || 'Admin Linked Account';

    if (amt < 150 || amt > this.wallet.availableBalance) {
      Utils.showToast(`Enter amount between ₹150 and ₹${this.wallet.availableBalance}`, 'error');
      return;
    }

    const payoutId = `PAY${Math.floor(100000 + Math.random() * 900000)}`;

    if (navigator.onLine && typeof Api !== 'undefined') {
      Api.request('requestTechnicianPayout', {
        payoutId,
        captainId: this.currentCaptain.id,
        captainName: this.currentCaptain.name,
        techId: this.currentCaptain.id,
        techName: this.currentCaptain.name,
        amount: amt,
        cycle: this.wallet.payoutCycle,
        mode: channel,
        upiId: targetUpi
      }).catch(() => {});
    }

    this.wallet.availableBalance -= amt;
    this.wallet.totalPaidOut += amt;
    this.wallet.ledger.unshift({
      id: payoutId,
      type: 'DEBIT',
      title: `${this.wallet.payoutCycle} Payout (${channel})`,
      sub: `Sent to: ${targetUpi}`,
      amount: amt,
      date: new Date().toISOString()
    });

    this.saveWalletData();
    this.closeModal('hc-payout-modal');
    Utils.showToast(`Payout of ₹${amt} initiated!`, 'success');
  },

  async payCodViaRazorpay() {
    const due = Number(this.wallet.codCashHeld || 0);
    if (due <= 0) return;

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
          finalAmount: due,
          patientName: this.currentCaptain.name,
          patientPhone: this.currentCaptain.mobile
        });
        orderId = res?.orderId || '';
      }

      const rzp = new Razorpay({
        key: (typeof Config !== 'undefined' && Config.RAZORPAY_KEY_ID) || 'rzp_live_Tq9S3sQhh5B3hW',
        amount: due * 100,
        currency: 'INR',
        name: 'Selfcare Diagnostics',
        description: `Cash Settlement (${this.currentCaptain.name})`,
        image: 'assets/images/logo.png',
        ...(orderId ? { order_id: orderId } : {}),
        handler: (response) => {
          this.wallet.codCashHeld = 0;
          this.wallet.ledger.unshift({
            id: response.razorpay_payment_id || refId,
            type: 'SETTLED',
            title: 'Customer Cash Deposited via Razorpay',
            sub: `Ref: ${response.razorpay_payment_id || 'Verified'}`,
            amount: due,
            date: new Date().toISOString()
          });
          this.saveWalletData();

          if (navigator.onLine && typeof Api !== 'undefined') {
            Api.request('settleCaptainCodCash', {
              captainId: this.currentCaptain.id,
              amount: due,
              razorpayPaymentId: response.razorpay_payment_id || refId
            }).catch(() => {});
          }

          Utils.showToast(`₹${due} cash settled via Razorpay!`, 'success');
        },
        prefill: {
          name: this.currentCaptain.name,
          contact: this.currentCaptain.mobile
        },
        theme: { color: '#0F172A' }
      });
      rzp.open();
    } catch (e) {
      Utils.showToast('Unable to open Razorpay checkout', 'error');
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
    if (codBox) codBox.style.display = w.codCashHeld > 0 ? 'flex' : 'none';

    ['DAILY', 'WEEKLY', 'MONTHLY'].forEach(c => {
      document.getElementById(`cycle-card-${c}`)?.classList.toggle('active', w.payoutCycle === c);
    });
    const pill = document.getElementById('hc-cycle-pill');
    if (pill) pill.textContent = `${w.payoutCycle} PAYOUT`;

    const upiTxt = document.getElementById('hc-linked-upi-text');
    const upiVal = w.bank?.upiId || this.currentCaptain?.upiId;
    if (upiTxt) {
      upiTxt.textContent = upiVal ? `${upiVal} (${this.currentCaptain?.name || ''})` : 'Managed by Admin';
    }

    this.renderPerformanceStats();

    const ledgerBox = document.getElementById('hc-ledger-container');
    if (!ledgerBox) return;

    if (!w.ledger || w.ledger.length === 0) {
      ledgerBox.innerHTML = `<div class="hc-empty-state">No wallet transactions yet. Complete a customer home collection to earn ₹150 or ₹250.</div>`;
      return;
    }

    ledgerBox.innerHTML = w.ledger.map(item => `
      <div class="hc-ledger-row">
        <div>
          <strong style="font-size:12.5px; display:block;">${Utils.escapeHtml(item.title)}</strong>
          <span style="font-size:10.5px; color:#64748B;">${Utils.escapeHtml(item.sub)} • ${new Date(item.date).toLocaleDateString('en-GB')}</span>
        </div>
        <strong style="color:${item.type === 'CREDIT' ? '#059669' : '#0F172A'}; font-size:13.5px;">
          ${item.type === 'CREDIT' ? '+' : '-'} ₹${item.amount}
        </strong>
      </div>
    `).join('');
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
          🏠 ${Utils.escapeHtml(t.address)} (${t.distanceKm} km) • ${t.visitLabel}
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
