/* file: assets/js/bookings.js */
/**
 * Selfcare Diagnostics - Direct Family & Patient Booking Tracker Engine v6.5.0
 * Features:
 * 1. Strict 3-Hour Slot Window: "Add Tests" box appears ONLY up to 3 hours after the appointment slot.
 * 2. Add Tests Box Layout: Rendered strictly between Booking Meta Card and Live Diagnostic Progress.
 * 3. User Deduplication: Merges same user records into ONE clean chip (No duplicate Self / Member chips).
 * 4. Membership Crown (👑): Dynamically displays Prime Crown on the user's avatar & name if membership is active.
 * 5. Clean Human-Readable Date & Time: Replaces ugly ISO timestamps with "Today, 21 Oct 2026 • 06:30 AM - 07:00 AM".
 * 6. Chronological Date Sorter: Newest bookings first (Today -> Yesterday -> Older dates).
 * 7. Doorstep Fee Auto-Sync: Reflects ₹100 collection fee for orders below ₹500 (e.g. ₹350 + ₹100 = ₹450).
 * 8. Deep Add-On Booking Serializer: Correctly identifies Health Packages (like 'SELFCARE BASIC HEALTH'),
 *    expands all package sheet constituents & parameters, and syncs target patient context to prevent re-adding duplicate/covered tests.
 */

const BookingsPage = {
  patientsList: [],
  allBookings: [],
  selectedPatientId: null,
  selectedPatientIndex: 0,
  currentActiveBooking: null,

  // Cutoff window: Allowed up to 3 hours from the scheduled slot end time
  ADD_TESTS_WINDOW_HOURS: 3,

  async init() {
    try {
      this.loadPatientsAndBookings();
      this.renderPatientChips();
      await this.autoSelectInitialPatientOrUrlTarget();
      this.syncLiveCloudBookings();
    } catch (err) {
      console.error('[Bookings] Init error:', err);
    }
  },

  safeEscape(str) {
    if (typeof Utils !== 'undefined' && Utils.escapeHtml) {
      return Utils.escapeHtml(str);
    }
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  },

  safeFormatCurrency(amt) {
    if (typeof Utils !== 'undefined' && Utils.formatCurrency) {
      return Utils.formatCurrency(amt);
    }
    return '₹' + Math.round(Number(amt) || 0).toLocaleString('en-IN');
  },

  safeShowToast(msg, type = 'info') {
    if (typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(msg, type);
    } else {
      alert(msg);
    }
  },

  /**
   * Checks if user has an active Care Membership
   */
  isMembershipActive() {
    try {
      const mem = localStorage.getItem('selfcare_membership') || localStorage.getItem('selfcare_is_member');
      if (mem === 'true' || mem === 'active') return true;
      if (mem) {
        const p = JSON.parse(mem);
        if (p && (p.isActive || p.status === 'active' || p.plan)) return true;
      }
      const user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
      if (user && (user.isMember || user.membership === 'active' || user.hasMembership || user.role === 'member')) {
        return true;
      }

      // Check if any booking contains annual membership item
      const bookings = this.allBookings || [];
      const hasMemBooking = bookings.some(b => {
        let bItems = b.items;
        if (typeof bItems === 'string') {
          try { bItems = JSON.parse(bItems); } catch (e) { bItems = []; }
        }
        return Array.isArray(bItems) && bItems.some(it => String(it.name || it.TestName || '').toUpperCase().includes('MEMBERSHIP'));
      });
      if (hasMemBooking) return true;
    } catch (e) {}
    return false;
  },

  /**
   * Converts any raw date string (ISO / YYYY-MM-DD) into a clean Date object
   */
  parseDateClean(dateStr) {
    if (!dateStr) return new Date();
    if (dateStr instanceof Date) return dateStr;
    const s = String(dateStr).trim();
    if (s.includes('T')) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d;
    }
    const cleanYmd = s.split('T')[0].split(' ')[0];
    const parts = cleanYmd.split('-');
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    const d2 = new Date(s);
    return isNaN(d2.getTime()) ? new Date() : d2;
  },

  /**
   * Formats dates as: "Today, 21 Oct 2026", "Yesterday, 20 Oct 2026", or "21 Oct 2026"
   */
  formatFriendlyDate(rawDate, includeYear = true) {
    if (!rawDate) return 'Today';
    try {
      const d = this.parseDateClean(rawDate);
      const now = new Date();

      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      const yest = new Date(now);
      yest.setDate(now.getDate() - 1);
      const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;

      const tmrw = new Date(now);
      tmrw.setDate(now.getDate() + 1);
      const tmrwStr = `${tmrw.getFullYear()}-${String(tmrw.getMonth() + 1).padStart(2, '0')}-${String(tmrw.getDate()).padStart(2, '0')}`;

      const targetStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthName = months[d.getMonth()];
      const day = d.getDate();
      const year = d.getFullYear();

      if (targetStr === todayStr) {
        return includeYear ? `Today, ${day} ${monthName} ${year}` : `Today, ${day} ${monthName}`;
      }
      if (targetStr === yestStr) {
        return includeYear ? `Yesterday, ${day} ${monthName} ${year}` : `Yesterday, ${day} ${monthName}`;
      }
      if (targetStr === tmrwStr) {
        return includeYear ? `Tomorrow, ${day} ${monthName} ${year}` : `Tomorrow, ${day} ${monthName}`;
      }

      return includeYear ? `${day} ${monthName} ${year}` : `${day} ${monthName}`;
    } catch (e) {
      return String(rawDate).split('T')[0];
    }
  },

  /**
   * STRICT 3-HOUR WINDOW:
   * Example: If slot is 11:30 AM - 12:00 PM today, customer has up to 3 hours
   * from 12:00 PM (i.e. until Today 3:00 PM) to add tests.
   */
  isWithinAddTestsTimeWindow(booking) {
    if (!booking) return false;

    // 1. If report already completed/delivered, sample is finished
    const stage = this.getBookingStage(booking);
    if (stage >= 5) return false;

    const collectionDate = booking.collectionDate;
    const timeSlot = booking.timeSlot;
    if (!collectionDate) return false;

    try {
      const slotDateObj = this.parseDateClean(collectionDate);
      let slotHour = 12;
      let slotMinute = 0;

      if (timeSlot && typeof timeSlot === 'string') {
        // e.g. "11:30 AM - 12:00 PM" -> Extract end time "12:00 PM"
        const parts = timeSlot.split(/[-–to]/i);
        const targetTimePart = (parts.length > 1 ? parts[1] : parts[0]).trim();
        
        const match = targetTimePart.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (match) {
          let h = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          const ampm = match[3] ? match[3].toUpperCase() : '';

          if (ampm === 'PM' && h < 12) h += 12;
          if (ampm === 'AM' && h === 12) h = 0;

          slotHour = h;
          slotMinute = m;
        }
      }

      slotDateObj.setHours(slotHour, slotMinute, 0, 0);

      // Cutoff time: Exactly 3 hours after the slot ends
      const cutoffTimeMs = slotDateObj.getTime() + (this.ADD_TESTS_WINDOW_HOURS * 60 * 60 * 1000);
      const nowMs = Date.now();

      // Current time must be within cutoff limit
      return nowMs <= cutoffTimeMs;
    } catch (e) {
      console.warn('Error evaluating add tests time window:', e);
      return false;
    }
  },

  loadPatientsAndBookings(skipMockSeeding = false) {
    let savedPatients = [];
    let savedBookings = [];

    let selfName = 'Customer (Self)';
    let currentMobile = '';

    const storedUser = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || null;
    if (storedUser) {
      if (storedUser.name) selfName = storedUser.name;
      currentMobile = storedUser.mobile || storedUser.phone || '';
    } else {
      try {
        const selfProfile = localStorage.getItem('selfcare_customer_profile');
        if (selfProfile) {
          const parsed = JSON.parse(selfProfile);
          if (parsed && (parsed.name || parsed.FullName)) {
            selfName = parsed.name || parsed.FullName;
          }
          if (parsed && (parsed.mobile || parsed.phone)) {
            currentMobile = parsed.mobile || parsed.phone;
          }
        }
      } catch (e) {}
    }

    if (!currentMobile) {
      currentMobile = localStorage.getItem('selfcare_active_user') || '';
    }

    let familyMembers = [];
    try {
      let famStored = null;
      if (currentMobile) {
        famStored = localStorage.getItem(`selfcare_family_${currentMobile}`);
      }
      if (!famStored) {
        famStored = localStorage.getItem('selfcare_family_members');
      }
      if (famStored) {
        const parsedFam = JSON.parse(famStored);
        if (Array.isArray(parsedFam) && parsedFam.length > 0) {
          familyMembers = parsedFam;
        }
      }
    } catch (e) {}

    try {
      const storedBookings = localStorage.getItem('selfcare_recent_bookings') || localStorage.getItem('selfcare_all_bookings');
      if (storedBookings) {
        const parsed = JSON.parse(storedBookings);
        if (Array.isArray(parsed) && parsed.length > 0) {
          savedBookings = parsed;
        }
      }
    } catch (e) {}

    const isLoggedIn = typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn();
    const shouldSkipMock = skipMockSeeding || isLoggedIn;

    if (savedBookings.length === 0 && !shouldSkipMock) {
      savedPatients = [
        { id: 'self', name: selfName !== 'Customer (Self)' ? selfName : 'Valued Customer', relation: 'Self', isSelf: true }
      ];
    } else {
      const patientMap = new Map();
      const cleanMobile = currentMobile ? String(currentMobile).replace(/\D/g, '').slice(-10) : '';
      const normalizedSelfName = selfName.trim().toLowerCase();

      // Base Primary User Record (Single Self Chip)
      patientMap.set('self', {
        id: 'self',
        name: selfName,
        relation: 'Self',
        isSelf: true
      });

      // Strict Deduplication Helper: Detects if record belongs to Self
      const isSelfIdentifier = (id, name, relation) => {
        const sId = String(id || '').trim().toLowerCase();
        const sName = String(name || '').trim().toLowerCase();
        const sRel = String(relation || '').trim().toLowerCase();

        if (sId === 'self' || sId === 'patient_self') return true;
        if (cleanMobile && (sId === cleanMobile || sId === `scd_${cleanMobile}`)) return true;
        if (sRel === 'self') return true;
        if (sName === normalizedSelfName || sName === 'customer (self)' || sName === 'valued customer') return true;
        return false;
      };

      // Add registered family members (Skipping self duplication)
      familyMembers.forEach((fm, idx) => {
        if (!fm) return;
        if (isSelfIdentifier(fm.id, fm.name, fm.relation)) return;

        const key = String(fm.name || fm.id || `fam_${idx}`).trim().toLowerCase();
        if (!patientMap.has(key)) {
          patientMap.set(key, {
            id: fm.id || key,
            name: fm.name || `Member ${idx + 1}`,
            relation: fm.relation || 'Family',
            isSelf: false
          });
        }
      });

      // Add members from bookings (Skipping duplicates by name)
      savedBookings.forEach(b => {
        const pName = b.patientName || selfName;
        const pId = b.patientId || pName;
        const pRel = b.relation || 'Member';

        if (isSelfIdentifier(pId, pName, pRel)) return;

        const key = String(pName).trim().toLowerCase();
        if (!patientMap.has(key)) {
          patientMap.set(key, {
            id: pId,
            name: pName,
            relation: pRel,
            isSelf: false
          });
        }

        if (b.selectedPatients && Array.isArray(b.selectedPatients)) {
          b.selectedPatients.forEach(sp => {
            if (!sp) return;
            if (isSelfIdentifier(sp.id, sp.name, sp.relation)) return;

            const spKey = String(sp.name || sp.id).trim().toLowerCase();
            if (!patientMap.has(spKey)) {
              patientMap.set(spKey, {
                id: sp.id || spKey,
                name: sp.name,
                relation: sp.relation || 'Member',
                isSelf: false
              });
            }
          });
        }
      });

      savedPatients = Array.from(patientMap.values());
    }

    this.patientsList = savedPatients;
    this.allBookings = savedBookings;
  },

  async syncLiveCloudBookings() {
    if (!navigator.onLine || typeof Api === 'undefined') return;
    const user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
    const mobile = user ? (user.mobile || user.phone) : (localStorage.getItem('selfcare_active_user') || null);
    if (!mobile) return;

    try {
      let liveBookings = null;
      if (typeof Api.getBookingsByPatient === 'function') {
        liveBookings = await Api.getBookingsByPatient(mobile);
      } else if (typeof Api.request === 'function') {
        liveBookings = await Api.request('getBookingsByPatient', { patientPhone: mobile }, false);
      }

      if (Array.isArray(liveBookings) && liveBookings.length > 0) {
        const isMock = (id) => ['SCDBOOK000214', 'SCDBOOK000198', 'SCDBOOK000185'].includes(id);
        const existing = this.allBookings.filter(b => !isMock(b.bookingId));

        const bookingMap = new Map();
        liveBookings.forEach(b => bookingMap.set(b.bookingId, b));
        existing.forEach(b => {
          if (!bookingMap.has(b.bookingId)) bookingMap.set(b.bookingId, b);
        });

        this.allBookings = Array.from(bookingMap.values());
        localStorage.setItem('selfcare_recent_bookings', JSON.stringify(this.allBookings));

        this.loadPatientsAndBookings(true);
        this.renderPatientChips();
        this.autoSelectInitialPatientOrUrlTarget();
      }
    } catch (err) {
      console.warn('[Bookings] Live cloud sync notice:', err);
    }
  },

  renderPatientChips() {
    const container = document.getElementById('patient-chips-list');
    if (!container) return;

    if (!this.patientsList || this.patientsList.length === 0) {
      container.innerHTML = '';
      return;
    }

    const isMember = this.isMembershipActive();

    container.innerHTML = this.patientsList.map((p, idx) => {
      const isSelf = p.id === 'self' || p.isSelf || String(p.relation).toLowerCase() === 'self';
      const showCrown = isSelf && isMember;
      const initial = (p.name || 'U').charAt(0).toUpperCase();

      return `
        <div class="patient-chip ${idx === this.selectedPatientIndex ? 'active' : ''}" 
             id="chip-${idx}" 
             onclick="BookingsPage.selectPatientByIndex(${idx})">
          <div class="chip-avatar">
            ${initial}
            ${showCrown ? '<span class="crown-avatar-badge" title="Active Care Member">👑</span>' : ''}
          </div>
          <div class="chip-info">
            <span class="chip-name">
              ${this.safeEscape(p.name)}
              ${showCrown ? '<span class="crown-inline-badge" title="Care Member">👑</span>' : ''}
            </span>
            <span class="chip-relation">
              ${showCrown ? '⭐ Care Member' : this.safeEscape(p.relation)}
            </span>
          </div>
        </div>
      `;
    }).join('');
  },

  async autoSelectInitialPatientOrUrlTarget() {
    const urlParams = new URLSearchParams(window.location.search);
    const targetBookingId = urlParams.get('id') || urlParams.get('bookingId');
    const targetPatient = urlParams.get('patient');

    if (targetBookingId) {
      const cleanBId = targetBookingId.trim().toUpperCase();
      let match = this.allBookings.find(b => (b.bookingId || '').toUpperCase() === cleanBId);

      if (!match && navigator.onLine && typeof Api !== 'undefined' && typeof Api.getBookingDetails === 'function') {
        try {
          const fetched = await Api.getBookingDetails(cleanBId);
          if (fetched && fetched.bookingId) {
            match = fetched;
            this.allBookings.unshift(fetched);
            this.loadPatientsAndBookings(true);
            this.renderPatientChips();
          }
        } catch (e) {}
      }

      if (match) {
        const pIdx = this.patientsList.findIndex(p => 
          (match.patientId && p.id === match.patientId) ||
          p.name.toLowerCase() === (match.patientName || '').toLowerCase()
        );
        this.selectPatientByIndex(pIdx >= 0 ? pIdx : 0, match.bookingId);
        return;
      }
    }

    if (targetPatient) {
      const pIdx = this.patientsList.findIndex(p => p.name.toLowerCase().includes(targetPatient.toLowerCase()));
      if (pIdx >= 0) {
        this.selectPatientByIndex(pIdx);
        return;
      }
    }

    this.selectPatientByIndex(0);
  },

  getBookingsForPatient(patient) {
    if (!patient) return [];
    const pId = String(patient.id || '').trim().toLowerCase();
    const pName = String(patient.name || '').trim().toLowerCase();
    const isSelf = pId === 'self' || patient.isSelf || pId === 'patient_self' || pName.includes('self') || pName.includes('valued');

    const filtered = this.allBookings.filter(b => {
      const bPatientId = String(b.patientId || '').trim().toLowerCase();
      const bPatientName = String(b.patientName || '').trim().toLowerCase();

      if (bPatientId === pId || bPatientName === pName) return true;
      if (isSelf && (bPatientId === 'self' || bPatientId === 'patient_self' || bPatientId === '')) return true;

      if (b.selectedPatients && Array.isArray(b.selectedPatients)) {
        const inSelected = b.selectedPatients.some(sp => {
          const spId = String(sp.id || '').trim().toLowerCase();
          const spName = String(sp.name || '').trim().toLowerCase();
          return spId === pId || spName === pName || (isSelf && (spId === 'self' || spName.includes('self')));
        });
        if (inSelected) return true;
      }

      if (b.items && Array.isArray(b.items)) {
        const inItems = b.items.some(it => {
          const itId = String(it.patientId || '').trim().toLowerCase();
          const itName = String(it.patientName || '').trim().toLowerCase();
          return itId === pId || itName === pName || (isSelf && (itId === 'self' || itId === 'patient_self'));
        });
        if (inItems) return true;
      }

      return false;
    });

    // CHRONOLOGICAL SORTING: Newest bookings first (Today -> Yesterday -> Older)
    return filtered.sort((a, b) => {
      const timeA = this.parseDateClean(a.collectionDate || a.createdAt || a.bookingDate).getTime();
      const timeB = this.parseDateClean(b.collectionDate || b.createdAt || b.bookingDate).getTime();
      return timeB - timeA;
    });
  },

  getPatientItemsForBooking(booking) {
    if (!booking) return [];
    let items = booking.items;
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch (e) { items = []; }
    }
    if (!Array.isArray(items) || items.length === 0) return [];

    const activePatient = this.patientsList[this.selectedPatientIndex] || this.patientsList[0];
    const pId = String(activePatient.id || '').trim().toLowerCase();
    const pName = String(activePatient.name || '').trim().toLowerCase();
    const isSelf = pId === 'self' || activePatient.isSelf || pName.includes('self');

    const hasTaggedItems = items.some(it => it.patientId || it.patientName);
    if (hasTaggedItems) {
      const matched = items.filter(it => {
        const itId = String(it.patientId || '').trim().toLowerCase();
        const itName = String(it.patientName || '').trim().toLowerCase();
        if (itId && itId === pId) return true;
        if (itName && itName === pName) return true;
        if (isSelf && (itId === 'self' || itId === 'patient_self' || itId === '')) return true;
        return false;
      });
      if (matched.length > 0) return matched;
    }

    if (items.length > 1 && booking.selectedPatients && booking.selectedPatients.length === items.length) {
      const patientIdx = booking.selectedPatients.findIndex(sp => {
        const spId = String(sp.id || '').trim().toLowerCase();
        const spName = String(sp.name || '').trim().toLowerCase();
        return spId === pId || spName === pName || (isSelf && (spId === 'self' || spName.includes('self')));
      });
      if (patientIdx >= 0 && items[patientIdx]) {
        return [items[patientIdx]];
      }
    }

    const bId = String(booking.patientId || '').trim().toLowerCase();
    const bName = String(booking.patientName || '').trim().toLowerCase();
    if (bId === pId || bName === pName || (isSelf && (bId === 'self' || bId === 'patient_self'))) {
      return items;
    }

    return items;
  },

  selectPatientByIndex(idx, preferredBookingId = null) {
    const patient = this.patientsList[idx];
    if (!patient) return;

    this.selectedPatientIndex = idx;
    this.selectedPatientId = patient.id;

    document.querySelectorAll('.patient-chip').forEach((chip, i) => {
      chip.classList.toggle('active', i === idx);
    });

    const patientBookings = this.getBookingsForPatient(patient);

    const activeView = document.getElementById('active-track-view');
    const emptyView = document.getElementById('patient-empty-state');
    const subnav = document.getElementById('patient-bookings-subnav');

    if (patientBookings.length === 0) {
      if (activeView) activeView.style.display = 'none';
      if (subnav) subnav.style.display = 'none';
      if (emptyView) {
        emptyView.style.display = 'flex';
        const titleEl = document.getElementById('empty-patient-title');
        const descEl = document.getElementById('empty-patient-desc');
        if (titleEl) titleEl.textContent = `No Bookings for ${patient.name}`;
        if (descEl) descEl.textContent = `There are no scheduled tests for ${patient.name} (${patient.relation}) currently.`;
      }
      return;
    }

    if (emptyView) emptyView.style.display = 'none';
    if (activeView) activeView.style.display = 'block';

    if (patientBookings.length > 1) {
      if (subnav) {
        subnav.style.display = 'flex';
        let selectedBId = preferredBookingId || patientBookings[0].bookingId;

        // Clean Date-wise Labels: SCDBOOK583132 (Today, 21 Oct)
        subnav.innerHTML = patientBookings.map(b => {
          const friendlyDate = this.formatFriendlyDate(b.collectionDate, false);
          const isSelected = b.bookingId === selectedBId;
          return `
            <button type="button" class="booking-subtab ${isSelected ? 'active' : ''}" 
                    onclick="BookingsPage.selectSpecificBooking('${b.bookingId}')">
              ${this.safeEscape(b.bookingId)} (${friendlyDate})
            </button>
          `;
        }).join('');

        const activeBooking = patientBookings.find(b => b.bookingId === selectedBId) || patientBookings[0];
        this.renderBookingDetails(activeBooking);
      }
    } else {
      if (subnav) subnav.style.display = 'none';
      this.renderBookingDetails(patientBookings[0]);
    }
  },

  selectSpecificBooking(bookingId) {
    const booking = this.allBookings.find(b => b.bookingId === bookingId);
    if (!booking) return;

    document.querySelectorAll('.booking-subtab').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.includes(bookingId));
    });

    this.renderBookingDetails(booking);
  },

  getBookingStage(booking) {
    if (booking.currentStage) return Number(booking.currentStage);
    const bStatus = String(booking.bookingStatus || '').toUpperCase();

    if (bStatus.includes('REPORT') || bStatus.includes('COMPLETED')) return 5;
    if (bStatus.includes('TRANSIT') || bStatus.includes('IN_LAB')) return 4;
    if (bStatus.includes('SAMPLE_COLLECTED') || bStatus.includes('DRAWN')) return 3;
    if (bStatus.includes('ASSIGNED') || bStatus.includes('IN_PROGRESS')) return 2;
    return 1;
  },

  renderBookingDetails(booking) {
    this.currentActiveBooking = booking;

    const idEl = document.getElementById('disp-booking-id');
    const modeEl = document.getElementById('disp-collection-mode');
    const patientEl = document.getElementById('disp-patient-name');
    const slotEl = document.getElementById('disp-time-slot');
    const paymentEl = document.getElementById('disp-payment-status');
    const amtEl = document.getElementById('disp-amount-val');

    const isLab = booking.collectionType === 'lab' || String(booking.address || '').includes('Direct Lab');
    const activePatient = this.patientsList[this.selectedPatientIndex] || this.patientsList[0];

    if (idEl) idEl.textContent = booking.bookingId;
    if (modeEl) {
      modeEl.textContent = isLab ? '🔬 Lab Walk-in' : '🏠 Home Pickup';
      modeEl.className = `meta-mode-badge ${isLab ? 'lab-mode' : 'home-mode'}`;
    }

    if (patientEl && activePatient) {
      patientEl.textContent = `${activePatient.name} (${activePatient.relation || 'Self'})`;
    }

    // CLEAN SCHEDULED SLOT FORMATTING: "Today, 21 Oct 2026 • 06:30 AM - 07:00 AM"
    if (slotEl) {
      const friendlyDate = this.formatFriendlyDate(booking.collectionDate, true);
      const slotTime = booking.timeSlot || '07:30 AM - 08:00 AM';
      slotEl.textContent = `${friendlyDate} • ${slotTime}`;
    }

    if (paymentEl) {
      const payStatus = String(booking.paymentStatus || '').toUpperCase();
      const payMode = String(booking.paymentMode || '').toUpperCase();

      if (payStatus.includes('SUCCESS') || payMode.includes('RAZORPAY') || payMode.includes('ONLINE')) {
        paymentEl.textContent = '✅ Paid Online (Razorpay)';
        paymentEl.style.color = '#059669';
      } else if (payStatus === 'PAID_AT_LAB' || payMode === 'CASH_LAB_COUNTER') {
        paymentEl.textContent = '✅ Paid at Lab Counter';
        paymentEl.style.color = '#059669';
      } else if (payMode.includes('UPI')) {
        paymentEl.textContent = '⚡ UPI QR on Collection';
        paymentEl.style.color = '#D97706';
      } else {
        paymentEl.textContent = '💵 Cash on Visit';
        paymentEl.style.color = '#D97706';
      }
    }

    // ACCURATE TOTAL CALCULATION (Tests Price + Doorstep Charge)
    const patientItems = this.getPatientItemsForBooking(booking);
    const patientSum = patientItems.reduce((acc, it) => acc + Number(it.price || it.OfferPrice || 0), 0);
    
    // Auto-derive doorstep fee if order subtotal < 500 and mode is home pickup
    let doorstepCharge = Number(booking.doorstepCharge || 0);
    if (doorstepCharge === 0 && !isLab && patientSum > 0 && patientSum < 500) {
      doorstepCharge = 100;
    }

    let finalDisplayTotal = Number(booking.finalAmount || 0);
    if (!finalDisplayTotal || finalDisplayTotal < (patientSum + doorstepCharge)) {
      finalDisplayTotal = patientSum + doorstepCharge;
    }

    if (amtEl) amtEl.textContent = this.safeFormatCurrency(finalDisplayTotal);

    // RENDER ADD TESTS BANNER (BETWEEN META CARD & LIVE PROGRESS)
    this.renderAddTestsCenterBanner(booking);

    this.renderTimelineStepper(booking);
    this.renderBookedTests(booking, doorstepCharge);
  },

  /**
   * Renders the Add Tests Box between Booking Reference & Live Diagnostic Progress
   */
  renderAddTestsCenterBanner(booking) {
    const bannerBox = document.getElementById('disp-add-tests-box');
    if (!bannerBox) return;

    const canAddTests = this.isWithinAddTestsTimeWindow(booking);

    if (canAddTests) {
      bannerBox.style.display = 'block';
      bannerBox.innerHTML = `
        <div class="add-tests-center-banner glass-card animate-fade">
          <div class="add-tests-banner-left">
            <strong><span>➕</span> Want to add more tests to this visit?</strong>
            <span>100% Free Doorstep Collection Fee (Clubbed Visit)</span>
          </div>
          <button type="button" class="add-tests-banner-btn" onclick="BookingsPage.goToAddTests('${booking.bookingId}')">
            <span>➕</span> Add Tests
          </button>
        </div>
      `;
    } else {
      bannerBox.style.display = 'none';
      bannerBox.innerHTML = '';
    }
  },

  renderTimelineStepper(booking) {
    const container = document.getElementById('tracking-stepper-list');
    if (!container) return;

    const isLab = booking.collectionType === 'lab' || String(booking.address || '').includes('Direct Lab');
    const stage = this.getBookingStage(booking);

    const homeSteps = [
      { num: 1, title: 'Order Confirmed', desc: 'Doorstep pickup appointment confirmed in our system.', time: 'Booking Confirmed' },
      { num: 2, title: 'Phlebotomist Assigned', desc: 'Field technician assigned with sterile barcoded vacutainers.', time: stage === 2 ? 'In Progress' : (stage > 2 ? 'Completed' : 'Pending') },
      { num: 3, title: 'Doorstep Sample Collection', desc: 'Technician will visit your address at scheduled 30-min window.', time: stage === 3 ? 'Arriving Soon' : (stage > 3 ? 'Done' : 'Upcoming') },
      { num: 4, title: 'Cold-Chain Transport to Lab', desc: 'Barcoded samples transported safely under 2°C-8°C ice-box.', time: stage === 4 ? 'In Transit' : (stage > 4 ? 'Done' : 'Upcoming') },
      { num: 5, title: 'Certified NABL Report Ready', desc: 'Signed laboratory report delivered to WhatsApp & app.', time: stage === 5 ? 'Report Ready' : 'Same Day' }
    ];

    const labSteps = [
      { num: 1, title: 'Appointment Confirmed', desc: 'Lab appointment slot confirmed and registered in lab queue.', time: 'Confirmed' },
      { num: 2, title: 'Arrive at Diagnostic Center', desc: 'Please visit lab counter at your scheduled time slot.', time: stage === 2 ? 'Next Action' : (stage > 2 ? 'Done' : 'Pending') },
      { num: 3, title: 'Sample Collection at Lab', desc: 'Certified phlebotomist will draw blood / urine sample.', time: stage === 3 ? 'Sampling Now' : (stage > 3 ? 'Done' : 'Pending') },
      { num: 4, title: 'Clinical Barcoded Testing', desc: 'Sample undergoing certified NABL quality analyzer tests.', time: stage === 4 ? 'In Testing' : (stage > 4 ? 'Done' : 'Pending') },
      { num: 5, title: 'Reports Verified & Ready', desc: 'Official digital report available via WhatsApp & Reports tab.', time: stage === 5 ? 'Ready' : 'Within 6-12 Hrs' }
    ];

    const steps = isLab ? labSteps : homeSteps;

    container.innerHTML = steps.map(s => {
      let statusClass = 'pending';
      let icon = '○';

      if (s.num < stage) {
        statusClass = 'completed';
        icon = '✓';
      } else if (s.num === stage) {
        statusClass = 'active';
        icon = '●';
      }

      return `
        <div class="step-item ${statusClass}">
          <div class="step-node">${icon}</div>
          <div class="step-content">
            <strong>${this.safeEscape(s.title)}</strong>
            <p>${this.safeEscape(s.desc)}</p>
            <span class="step-time-badge">${this.safeEscape(s.time)}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  renderBookedTests(booking, doorstepCharge = 0) {
    const container = document.getElementById('disp-tests-list');
    if (!container) return;

    const items = this.getPatientItemsForBooking(booking);
    const activePatient = this.patientsList[this.selectedPatientIndex] || this.patientsList[0];
    const isLab = booking.collectionType === 'lab' || String(booking.address || '').includes('Direct Lab');

    let html = items.map(item => `
      <div class="test-summary-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #f1f5f9;">
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span style="font-size:12.5px; font-weight:700; color:#10231E;">🧪 ${this.safeEscape(item.name || item.TestName || 'Diagnostic Checkup')}</span>
          <span style="font-size:10px; color:#078866; font-weight:800; background:rgba(7,136,102,0.08); padding:2px 6px; border-radius:4px; width:fit-content;">
            👤 For: ${this.safeEscape(activePatient.name)}
          </span>
        </div>
        <strong style="color:#045D49; font-size:13px;">${this.safeFormatCurrency(item.price || item.OfferPrice || 0)}</strong>
      </div>
    `).join('');

    // HOME COLLECTION CHARGE ROW DISPLAY (FOR ORDERS < ₹500)
    if (!isLab && doorstepCharge > 0) {
      html += `
        <div class="test-summary-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px 8px; border-bottom:1px solid #f1f5f9; background:#fff7ed; border-radius:8px; margin-top:8px;">
          <div style="display:flex; flex-direction:column; gap:1px;">
            <span style="font-size:12px; font-weight:700; color:#9a3412;">🏠 Home Sample Collection Fee</span>
            <span style="font-size:9.5px; color:#c2410c; font-weight:600;">Standard doorstep charge (Orders below ₹500)</span>
          </div>
          <strong style="color:#c2410c; font-size:13px;">${this.safeFormatCurrency(doorstepCharge)}</strong>
        </div>
      `;
    }

    container.innerHTML = html;
  },

  goToAddTests(bookingId) {
    const booking = bookingId ? this.allBookings.find(b => b.bookingId === bookingId) : this.currentActiveBooking;
    if (!booking) {
      this.safeShowToast('Could not load booking details', 'error');
      return;
    }

    // STRICT 3-HOUR TIME WINDOW VALIDATION
    if (!this.isWithinAddTestsTimeWindow(booking)) {
      this.safeShowToast('⚠️ Add-on tests window has expired (Allowed only within 3 hours of appointment slot).', 'error');
      return;
    }

    const activePatient = this.patientsList[this.selectedPatientIndex] || this.patientsList[0];
    const rawItems = this.getPatientItemsForBooking(booking);
    const pId = activePatient ? activePatient.id : (booking.patientId || 'self');

    const existingItems = rawItems.map((item, idx) => {
      let isPkg = false;
      if (typeof ConflictValidator !== 'undefined' && typeof ConflictValidator.isPackage === 'function') {
        isPkg = ConflictValidator.isPackage(item);
      } else {
        const c = String(item.code || item.id || item.PackageCode || item.PackageID || '').toUpperCase();
        const n = String(item.name || item.TestName || item.PackageName || '').toUpperCase();
        isPkg = (
          item.type === 'package' ||
          item.PackageID ||
          item.PackageCode ||
          c.startsWith('PKG') ||
          c.startsWith('PACK') ||
          c.startsWith('SCDP') ||
          n.includes('PACKAGE') ||
          n.includes('HEALTH') ||
          n.includes('WELLNESS') ||
          n.includes('CHECK')
        );
      }

      let fullPkgData = null;
      if (isPkg && typeof ConflictValidator !== 'undefined' && typeof ConflictValidator.findFullPackageFromSheet === 'function') {
        fullPkgData = ConflictValidator.findFullPackageFromSheet(item);
      }

      return {
        ...item,
        ...(fullPkgData || {}),
        id: item.id || item.TestID || item.PackageID || `PAID_${idx}`,
        TestID: item.TestID || item.id || null,
        PackageID: item.PackageID || (isPkg ? (item.id || item.code || item.PackageCode) : null),
        TestCode: item.TestCode || item.code || null,
        PackageCode: item.PackageCode || (isPkg ? (item.code || item.id || item.PackageID) : null),
        name: item.name || item.TestName || item.PackageName || (isPkg ? 'Health Package' : 'Diagnostic Test'),
        TestName: item.TestName || item.name || item.PackageName,
        PackageName: item.PackageName || (isPkg ? (item.name || item.TestName) : null),
        code: item.code || item.TestCode || item.PackageCode || (isPkg ? 'PKG' : 'TEST'),
        originalPrice: Number(item.price || item.OfferPrice || item.originalPrice || 0),
        price: 0,
        type: isPkg ? 'package' : 'test',
        isPackage: isPkg,
        patientId: pId,
        isExistingLocked: true,
        isExistingBookingItem: true,
        removable: false
      };
    });

    const addonLockData = {
      ...booking,
      targetSlide: 1,
      addonMode: 'TESTS_ONLY',
      isLockedExistingBooking: true,
      lockedPatientId: pId,
      lockedPatientName: activePatient ? activePatient.name : (booking.patientName || 'Self'),
      lockedRelation: activePatient ? activePatient.relation : (booking.relation || 'Self'),
      lockedCollectionType: booking.collectionType || 'home',
      lockedCollectionDate: booking.collectionDate || '',
      lockedTimeSlot: booking.timeSlot || '',
      lockedAddress: booking.address || '',
      lockedExistingItems: existingItems,
      items: existingItems,
      permissions: {
        canAddTests: true,
        canRemoveExistingTests: false,
        canChangePatient: false,
        canChangeSlot: false,
        canChangeAddress: false,
        canChangeCollectionType: false
      }
    };

    sessionStorage.setItem('selfcare_addon_booking', JSON.stringify(addonLockData));
    sessionStorage.setItem('selfcare_target_patient_id', String(pId));
    localStorage.setItem('selfcare_active_addon_booking_id', booking.bookingId);
    localStorage.setItem('selfcare_active_addon_booking_data', JSON.stringify(addonLockData));

    window.location.href = `cart.html?addonBookingId=${encodeURIComponent(booking.bookingId)}&slide=1&mode=addon_only`;
  },

  openWhatsAppSupport() {
    const booking = this.currentActiveBooking || {};
    const bId = booking.bookingId || 'My Booking';
    const activePatient = this.patientsList[this.selectedPatientIndex] || this.patientsList[0];
    const patient = activePatient ? activePatient.name : (booking.patientName || 'Self');
    const slot = booking.timeSlot || 'Scheduled Slot';

    const msg = `Hello Selfcare Diagnostics, I need an update regarding sample collection for Booking ID: *${bId}* (Patient: ${patient}, Slot: ${slot}). Please assist.`;
    window.location.href = `https://wa.me/917010174890?text=${encodeURIComponent(msg)}`;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  BookingsPage.init();
});

if (typeof window !== 'undefined') {
  window.BookingsPage = BookingsPage;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BookingsPage;
}
