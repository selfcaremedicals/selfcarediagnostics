/* file: assets/js/bookings.js */
/**
 * Selfcare Diagnostics - Direct Family & Patient Booking Tracker Engine v8.0.0
 * Features:
 * 1. Random 4-Digit Pickup OTP Generation & Automatic Backend Cloud Sync (stored per booking).
 * 2. Exact Cart Time Slot Preservation & Latest-Booking-First Sorting (Created Timestamp + Date/Slot).
 * 3. Background & Live Push Notifications (via Service Worker) for every Diagnostics Process Stage
 *    (Booking Confirmed, Phlebotomist Assigned, Sample Collected, Cold-Chain Transit, NABL Report Ready)
 *    even when the customer app is closed or in the background.
 * 4. Strict User & Mobile Isolation + Automatic Parent/Sibling Deduplication.
 */

const BookingsPage = {
  patientsList: [],
  allBookings: [],
  selectedPatientId: null,
  selectedPatientIndex: 0,
  currentActiveBooking: null,
  livePollTimer: null,

  ADD_TESTS_WINDOW_HOURS: 3,

  async init() {
    try {
      this.registerPushNotificationWorker();
      this.requestNotificationPermission();

      this.loadPatientsAndBookings();
      this.renderPatientChips();
      await this.autoSelectInitialPatientOrUrlTarget();
      await this.syncLiveCloudBookings();

      // Background live stage poller (checks every 15s for status updates & fires phone notifications)
      if (this.livePollTimer) clearInterval(this.livePollTimer);
      this.livePollTimer = setInterval(() => {
        this.syncLiveCloudBookings(true);
      }, 15000);
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

  normalizeName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/^(mr|mrs|ms|miss|dr|smt|shri|master|baby)\.?\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
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

  /* =========================================================
     1. RANDOM 4-DIGIT OTP GENERATOR & BACKEND SYNC
     ========================================================= */
  generateRandomOtp() {
    return String(Math.floor(1000 + Math.random() * 9000));
  },

  ensureBookingPickupOtp(booking) {
    if (!booking || !booking.bookingId) return '';

    const isLab = booking.collectionType === 'lab' || String(booking.address || '').toLowerCase().includes('direct lab');
    if (isLab) return '';

    // Check if an OTP already exists on the booking or in local OTP registry
    const existingOtp = String(
      booking.pickupOtp || booking.otp || booking.verificationOtp || booking.bookingOtp || ''
    ).trim();

    let otpMap = {};
    try {
      otpMap = JSON.parse(localStorage.getItem('selfcare_booking_otps') || '{}');
    } catch (e) {}

    if (existingOtp && /^\d{4,6}$/.test(existingOtp)) {
      if (otpMap[booking.bookingId] !== existingOtp) {
        otpMap[booking.bookingId] = existingOtp;
        localStorage.setItem('selfcare_booking_otps', JSON.stringify(otpMap));
      }
      booking.pickupOtp = existingOtp;
      booking.otp = existingOtp;
      return existingOtp;
    }

    if (otpMap[booking.bookingId] && /^\d{4,6}$/.test(otpMap[booking.bookingId])) {
      booking.pickupOtp = otpMap[booking.bookingId];
      booking.otp = otpMap[booking.bookingId];
      return otpMap[booking.bookingId];
    }

    // Generate fresh random 4-digit OTP and store in localStorage + Backend
    const newOtp = this.generateRandomOtp();
    booking.pickupOtp = newOtp;
    booking.otp = newOtp;
    otpMap[booking.bookingId] = newOtp;
    localStorage.setItem('selfcare_booking_otps', JSON.stringify(otpMap));

    this.syncOtpToBackend(booking, newOtp);
    return newOtp;
  },

  async syncOtpToBackend(booking, otp) {
    if (!booking || !booking.bookingId || !otp) return;
    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      try {
        await Api.request('saveBookingPickupOtp', {
          bookingId: booking.bookingId,
          pickupOtp: otp,
          otp: otp,
          patientName: booking.patientName || '',
          patientPhone: booking.patientPhone || booking.customerPhone || booking.mobile || ''
        }, false);
      } catch (e) {
        // Fallback generic update call if backend uses updateBooking
        try {
          await Api.request('updateBookingOtp', {
            bookingId: booking.bookingId,
            pickupOtp: otp
          }, false);
        } catch (err) {}
      }
    }
  },

  /* =========================================================
     2. SYSTEM PUSH NOTIFICATIONS FOR LIVE DIAGNOSTICS STAGES
     ========================================================= */
  registerPushNotificationWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
    }
  },

  requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  },

  getStageNotificationMeta(booking, stage) {
    const bId = booking.bookingId || '';
    const pName = booking.patientName || 'Patient';
    const isLab = booking.collectionType === 'lab' || String(booking.address || '').toLowerCase().includes('direct lab');
    const otpTxt = booking.pickupOtp ? ` • Pickup OTP: ${booking.pickupOtp}` : '';

    if (isLab) {
      switch (stage) {
        case 1:
          return {
            title: `✅ Lab Appointment Confirmed (${bId})`,
            body: `${pName}'s lab visit is confirmed for ${this.formatFriendlyDate(booking.collectionDate, false)} (${booking.timeSlot || 'Scheduled'}).`
          };
        case 2:
          return {
            title: `🏥 Ready for Lab Check-In (${bId})`,
            body: `Please visit the diagnostic counter for ${pName}'s sample collection.`
          };
        case 3:
          return {
            title: `🩸 Sample Collected at Lab (${bId})`,
            body: `${pName}'s barcoded sample has been drawn and sent to the analyzer.`
          };
        case 4:
          return {
            title: `🔬 Clinical Testing In Progress (${bId})`,
            body: `${pName}'s sample is undergoing NABL quality testing.`
          };
        case 5:
          return {
            title: `📄 NABL Report Ready! (${bId})`,
            body: `${pName}'s certified diagnostic report is ready to view & download.`
          };
      }
    } else {
      switch (stage) {
        case 1:
          return {
            title: `✅ Booking Confirmed (${bId})`,
            body: `Home collection confirmed for ${pName} (${booking.timeSlot || 'Scheduled'}).${otpTxt}`
          };
        case 2:
          return {
            title: `🛵 Phlebotomist Assigned (${bId})`,
            body: `Our certified phlebotomist is assigned for ${pName}'s doorstep pickup.${otpTxt}`
          };
        case 3:
          return {
            title: `🩸 Doorstep Sample Collected (${bId})`,
            body: `${pName}'s sample has been safely collected and barcoded.`
          };
        case 4:
          return {
            title: `❄️ Cold-Chain Transit to Lab (${bId})`,
            body: `${pName}'s sample is transported under 2°C–8°C to our NABL lab.`
          };
        case 5:
          return {
            title: `📄 Certified NABL Report Ready! (${bId})`,
            body: `${pName}'s lab report is ready! Tap to view or download PDF.`
          };
      }
    }
    return null;
  },

  async checkAndDispatchStageNotifications(bookingsList) {
    if (!Array.isArray(bookingsList) || bookingsList.length === 0) return;

    let notifiedStages = {};
    try {
      notifiedStages = JSON.parse(localStorage.getItem('selfcare_notified_booking_stages') || '{}');
    } catch (e) {}

    let changed = false;

    for (const b of bookingsList) {
      if (!b || !b.bookingId) continue;
      const currentStage = this.getBookingStage(b);
      const lastNotifiedStage = Number(notifiedStages[b.bookingId] || 0);

      if (currentStage > lastNotifiedStage) {
        notifiedStages[b.bookingId] = currentStage;
        changed = true;
        await this.firePhoneStageNotification(b, currentStage);
      }
    }

    if (changed) {
      localStorage.setItem('selfcare_notified_booking_stages', JSON.stringify(notifiedStages));
    }
  },

  async firePhoneStageNotification(booking, stage) {
    const meta = this.getStageNotificationMeta(booking, stage);
    if (!meta) return;

    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (e) {}
    }
    if (Notification.permission !== 'granted') return;

    const tag = `selfcare-stage-${booking.bookingId}-s${stage}`;
    const targetUrl = `bookings.html?id=${encodeURIComponent(booking.bookingId)}`;

    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(meta.title, {
          body: meta.body,
          icon: 'assets/images/logo.png',
          badge: 'assets/images/logo.png',
          tag,
          renotify: false,
          vibrate: [200, 100, 200],
          data: { bookingId: booking.bookingId, stage, url: targetUrl }
        });
      } else {
        const n = new Notification(meta.title, {
          body: meta.body,
          icon: 'assets/images/logo.png',
          tag
        });
        n.onclick = () => {
          window.focus();
          window.location.href = targetUrl;
        };
      }
    } catch (e) {}
  },

  /* =========================================================
     3. MEMBERSHIP, DATE & TIME SORTING HELPERS
     ========================================================= */
  isMembershipActive(patient = null) {
    try {
      if (patient) {
        if (typeof App !== 'undefined' && App.isVipActive) {
          return App.isVipActive(patient);
        }
        if (patient.isVip) return true;
        if (patient.membership === 'Membership') {
          return !patient.expiryDate || new Date(patient.expiryDate) > new Date();
        }
        return false;
      }

      if (typeof App !== 'undefined' && App.isVipActive) {
        return App.isVipActive();
      }

      const activeMobile = localStorage.getItem('selfcare_active_user') || '';
      if (localStorage.getItem('selfcare_is_vip_member') === 'true') return true;

      if (activeMobile) {
        const rawMem = localStorage.getItem(`selfcare_membership_${activeMobile}`);
        if (rawMem) {
          const mem = JSON.parse(rawMem);
          if (mem && mem.status === 'Membership') {
            return !mem.expiryDate || new Date(mem.expiryDate) > new Date();
          }
        }
      }

      const user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
      if (user && (user.membership === 'Membership' || user.isMember)) return true;
    } catch (e) {}
    return false;
  },

  parseDateClean(dateStr) {
    if (!dateStr) return new Date(0);
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
    return isNaN(d2.getTime()) ? new Date(0) : d2;
  },

  parseSlotStartMinutes(timeSlotStr) {
    if (!timeSlotStr) return 0;
    const startPart = String(timeSlotStr).split(/[-–to]/i)[0].trim();
    const match = startPart.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return 0;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3] ? match[3].toUpperCase() : '';

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    return hours * 60 + minutes;
  },

  getBookingSortTimestamp(b) {
    // 1. Primary: Exact booking creation timestamp (last booked appears first!)
    const createdRaw = b.createdAt || b.bookedAt || b.timestamp || b.bookingTimestamp;
    if (createdRaw) {
      const cDate = new Date(createdRaw);
      if (!isNaN(cDate.getTime()) && cDate.getTime() > 0) {
        return cDate.getTime();
      }
    }

    // 2. Secondary: Collection Date + Exact Cart Time Slot start minutes
    const colDate = this.parseDateClean(b.collectionDate || b.bookingDate || b.date);
    const slotMins = this.parseSlotStartMinutes(b.timeSlot || b.slot || b.selectedSlot);
    return colDate.getTime() + (slotMins * 60 * 1000);
  },

  resolveCartTimeSlot(booking) {
    const slot = String(
      booking.timeSlot ||
      booking.slot ||
      booking.selectedSlot ||
      booking.appointmentSlot ||
      booking.collectionSlot ||
      ''
    ).trim();
    return slot || 'Scheduled Slot';
  },

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

  isWithinAddTestsTimeWindow(booking) {
    if (!booking) return false;

    const stage = this.getBookingStage(booking);
    if (stage >= 5) return false;

    const collectionDate = booking.collectionDate;
    const timeSlot = this.resolveCartTimeSlot(booking);
    if (!collectionDate) return false;

    try {
      const slotDateObj = this.parseDateClean(collectionDate);
      let slotHour = 12;
      let slotMinute = 0;

      if (timeSlot && typeof timeSlot === 'string') {
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
      const cutoffTimeMs = slotDateObj.getTime() + (this.ADD_TESTS_WINDOW_HOURS * 60 * 60 * 1000);
      return Date.now() <= cutoffTimeMs;
    } catch (e) {
      return false;
    }
  },

  /* =========================================================
     4. LOAD PATIENTS & BOOKINGS (LATEST BOOKING FIRST)
     ========================================================= */
  loadPatientsAndBookings(skipMockSeeding = false) {
    let savedBookings = [];

    let selfName = 'Customer (Self)';
    let currentMobile = '';
    let selfMembership = 'Regular';
    let selfExpiry = null;

    const storedUser = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || null;
    if (storedUser) {
      if (storedUser.name) selfName = storedUser.name;
      currentMobile = storedUser.mobile || storedUser.phone || '';
      selfMembership = storedUser.membership || 'Regular';
      selfExpiry = storedUser.vipExpiry || storedUser.membershipExpiry || null;
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
          selfMembership = parsed.membership || 'Regular';
          selfExpiry = parsed.vipExpiry || parsed.membershipExpiry || null;
        }
      } catch (e) {}
    }

    if (!currentMobile) {
      currentMobile = localStorage.getItem('selfcare_active_user') || '';
    }

    const cleanMobile = currentMobile ? String(currentMobile).replace(/\D/g, '').slice(-10) : '';

    let familyMembers = [];
    try {
      let famStored = null;
      if (cleanMobile) {
        famStored = localStorage.getItem(`selfcare_family_${cleanMobile}`);
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

    // Merge bookings from scoped storage + recent/all bookings so latest cart checkout always appears immediately
    const mergedMap = new Map();
    const storageKeys = [
      cleanMobile ? `selfcare_bookings_${cleanMobile}` : null,
      'selfcare_recent_bookings',
      'selfcare_all_bookings',
      'selfcare_customer_bookings'
    ].filter(Boolean);

    storageKeys.forEach(key => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(b => {
            if (!b || !b.bookingId) return;
            if (cleanMobile) {
              const bPhone = String(b.patientPhone || b.customerPhone || b.mobile || b.phone || b.userPhone || '').replace(/\D/g, '').slice(-10);
              if (bPhone && bPhone !== cleanMobile) return;
            }
            const existing = mergedMap.get(b.bookingId) || {};
            mergedMap.set(b.bookingId, { ...existing, ...b });
          });
        }
      } catch (e) {}
    });

    savedBookings = Array.from(mergedMap.values());

    // Ensure every booking has a random 4-digit OTP and exact cart timeSlot preserved
    let updatedStorage = false;
    savedBookings.forEach(b => {
      const beforeOtp = b.pickupOtp || b.otp;
      const ensuredOtp = this.ensureBookingPickupOtp(b);
      if (ensuredOtp && ensuredOtp !== beforeOtp) {
        updatedStorage = true;
      }
      if (!b.timeSlot && (b.slot || b.selectedSlot || b.appointmentSlot)) {
        b.timeSlot = this.resolveCartTimeSlot(b);
        updatedStorage = true;
      }
    });

    // Deduplication: Hide un-split parent booking if split sub-bookings exist
    const subParentBIds = new Set();
    savedBookings.forEach(b => {
      const bId = String(b.bookingId || '');
      if (/-\d+$/.test(bId)) {
        subParentBIds.add(bId.replace(/-\d+$/, '').toUpperCase());
      }
    });

    if (subParentBIds.size > 0) {
      savedBookings = savedBookings.filter(b => {
        const cleanId = String(b.bookingId || '').toUpperCase();
        return !subParentBIds.has(cleanId);
      });
    }

    // Sort globally: Last booked (newest timestamp / latest date & slot) FIRST
    savedBookings.sort((a, b) => {
      const diff = this.getBookingSortTimestamp(b) - this.getBookingSortTimestamp(a);
      if (diff !== 0) return diff;
      return String(b.bookingId || '').localeCompare(String(a.bookingId || ''));
    });

    if (updatedStorage && savedBookings.length > 0) {
      if (cleanMobile) {
        localStorage.setItem(`selfcare_bookings_${cleanMobile}`, JSON.stringify(savedBookings));
      }
      localStorage.setItem('selfcare_recent_bookings', JSON.stringify(savedBookings));
    }

    const isPrimaryVip = this.isMembershipActive();
    const patientMap = new Map();
    const normalizedSelfName = this.normalizeName(selfName);

    patientMap.set('self', {
      id: 'self',
      name: selfName,
      relation: 'Self',
      membership: isPrimaryVip ? 'Membership' : selfMembership,
      expiryDate: selfExpiry,
      isVip: isPrimaryVip,
      isSelf: true
    });

    const isSelfIdentifier = (id, name, relation) => {
      const sId = String(id || '').trim().toLowerCase();
      const sName = this.normalizeName(name);
      const sRel = String(relation || '').trim().toLowerCase();

      if (sId === 'self' || sId === 'patient_self') return true;
      if (cleanMobile && (sId === cleanMobile || sId === `scd_${cleanMobile}`)) return true;
      if (sRel === 'self') return true;
      if (sName && (sName === normalizedSelfName || sName === 'customer (self)' || sName === 'valued customer')) return true;
      return false;
    };

    familyMembers.forEach((fm, idx) => {
      if (!fm) return;
      if (isSelfIdentifier(fm.id, fm.name, fm.relation)) return;

      const key = this.normalizeName(fm.name) || String(fm.id || `fam_${idx}`).trim().toLowerCase();
      const isFamVip = fm.membership === 'Membership' && (!fm.expiryDate || new Date(fm.expiryDate) > new Date());

      if (!patientMap.has(key)) {
        patientMap.set(key, {
          id: fm.id || key,
          name: fm.name || `Member ${idx + 1}`,
          relation: fm.relation || 'Family',
          membership: fm.membership || 'Regular',
          expiryDate: fm.expiryDate || null,
          isVip: Boolean(isFamVip),
          isSelf: false
        });
      }
    });

    savedBookings.forEach(b => {
      const pName = b.patientName || selfName;
      const pId = b.patientId || pName;
      const pRel = b.relation || 'Member';

      if (isSelfIdentifier(pId, pName, pRel)) return;

      const key = this.normalizeName(pName);
      if (key && !patientMap.has(key)) {
        patientMap.set(key, {
          id: pId,
          name: pName,
          relation: pRel,
          membership: 'Regular',
          isVip: false,
          isSelf: false
        });
      }
    });

    this.patientsList = Array.from(patientMap.values());
    this.allBookings = savedBookings;

    // Trigger system notifications for newly confirmed bookings or stage updates
    this.checkAndDispatchStageNotifications(this.allBookings);
  },

  async syncLiveCloudBookings(isBackgroundPoll = false) {
    if (!navigator.onLine || typeof Api === 'undefined') return;
    const user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
    const mobile = user ? (user.mobile || user.phone) : (localStorage.getItem('selfcare_active_user') || null);
    if (!mobile) return;

    const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);
    if (!cleanMobile) return;

    try {
      let liveBookings = null;
      if (typeof Api.getBookingsByPatient === 'function') {
        liveBookings = await Api.getBookingsByPatient(cleanMobile);
      } else if (typeof Api.request === 'function') {
        liveBookings = await Api.request('getBookingsByPatient', { patientPhone: cleanMobile }, false);
      }

      if (Array.isArray(liveBookings)) {
        const isMock = (id) => ['SCDBOOK000214', 'SCDBOOK000198', 'SCDBOOK000185'].includes(id);

        const existing = this.allBookings.filter(b => {
          if (isMock(b.bookingId)) return false;
          const bPhone = String(b.patientPhone || b.customerPhone || b.mobile || b.phone || '').replace(/\D/g, '').slice(-10);
          return !bPhone || bPhone === cleanMobile;
        });

        const bookingMap = new Map();
        existing.forEach(b => {
          if (b && b.bookingId) bookingMap.set(b.bookingId, b);
        });

        liveBookings.forEach(b => {
          if (!b || !b.bookingId) return;
          const prev = bookingMap.get(b.bookingId) || {};
          // Preserve locally generated random OTP if cloud hasn't returned one yet, or accept cloud OTP
          const mergedBooking = {
            ...prev,
            ...b,
            timeSlot: this.resolveCartTimeSlot(b.timeSlot ? b : prev),
            pickupOtp: b.pickupOtp || b.otp || prev.pickupOtp || prev.otp || ''
          };
          this.ensureBookingPickupOtp(mergedBooking);
          bookingMap.set(b.bookingId, mergedBooking);
        });

        let merged = Array.from(bookingMap.values());

        // Deduplication in live cloud sync
        const subParentBIds = new Set();
        merged.forEach(b => {
          const bId = String(b.bookingId || '');
          if (/-\d+$/.test(bId)) {
            subParentBIds.add(bId.replace(/-\d+$/, '').toUpperCase());
          }
        });

        if (subParentBIds.size > 0) {
          merged = merged.filter(b => !subParentBIds.has(String(b.bookingId || '').toUpperCase()));
        }

        // Sort: Last booked first
        merged.sort((a, b) => {
          const diff = this.getBookingSortTimestamp(b) - this.getBookingSortTimestamp(a);
          if (diff !== 0) return diff;
          return String(b.bookingId || '').localeCompare(String(a.bookingId || ''));
        });

        this.allBookings = merged;

        localStorage.setItem(`selfcare_bookings_${cleanMobile}`, JSON.stringify(this.allBookings));
        localStorage.setItem('selfcare_recent_bookings', JSON.stringify(this.allBookings));

        // Fire phone notifications for any updated live diagnostic stages
        await this.checkAndDispatchStageNotifications(this.allBookings);

        this.loadPatientsAndBookings(true);
        this.renderPatientChips();

        if (isBackgroundPoll && this.currentActiveBooking) {
          const updatedCurrent = this.allBookings.find(b => b.bookingId === this.currentActiveBooking.bookingId);
          if (updatedCurrent) {
            this.renderBookingDetails(updatedCurrent);
          }
        } else {
          this.autoSelectInitialPatientOrUrlTarget();
        }
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

    container.innerHTML = this.patientsList.map((p, idx) => {
      const showCrown = this.isMembershipActive(p);
      const cleanDisplay = p.name.replace(/^(mr|mrs|ms|miss|dr|smt|shri)\.?\s+/i, '').trim();
      const initial = (cleanDisplay || 'U').charAt(0).toUpperCase();

      return `
        <div class="patient-chip ${idx === this.selectedPatientIndex ? 'active' : ''}" 
             id="chip-${idx}" 
             onclick="BookingsPage.selectPatientByIndex(${idx})">
          <div class="chip-avatar" style="position: relative;">
            ${initial}
            ${showCrown ? '<span class="crown-avatar-badge" style="position:absolute; top:-7px; right:-7px; font-size:13px; filter:drop-shadow(0 1px 2px rgba(245,158,11,0.6));" title="Active Care VIP">👑</span>' : ''}
          </div>
          <div class="chip-info">
            <span class="chip-name">
              ${this.safeEscape(p.name)}
              ${showCrown ? '<span class="vip-crown-badge" style="margin-left:4px; font-size:13px;" title="Care VIP">👑</span>' : ''}
            </span>
            <span class="chip-relation">
              ${showCrown ? '⭐ VIP Member' : this.safeEscape(p.relation)}
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
            this.ensureBookingPickupOtp(fetched);
            match = fetched;
            this.allBookings.unshift(fetched);
            this.loadPatientsAndBookings(true);
            this.renderPatientChips();
          }
        } catch (e) {}
      }

      if (match) {
        const matchNormName = this.normalizeName(match.patientName);
        const pIdx = this.patientsList.findIndex(p => 
          (match.patientId && p.id === match.patientId) ||
          this.normalizeName(p.name) === matchNormName
        );
        this.selectPatientByIndex(pIdx >= 0 ? pIdx : 0, match.bookingId);
        return;
      }
    }

    if (targetPatient) {
      const normTarget = this.normalizeName(targetPatient);
      const pIdx = this.patientsList.findIndex(p => this.normalizeName(p.name).includes(normTarget));
      if (pIdx >= 0) {
        this.selectPatientByIndex(pIdx);
        return;
      }
    }

    // Automatically select the patient who has the LATEST booking first
    if (this.allBookings.length > 0) {
      const latestBooking = this.allBookings[0];
      const latestNormName = this.normalizeName(latestBooking.patientName);
      const latestPIdx = this.patientsList.findIndex(p =>
        (latestBooking.patientId && p.id === latestBooking.patientId) ||
        (latestNormName && this.normalizeName(p.name) === latestNormName)
      );
      if (latestPIdx >= 0) {
        this.selectPatientByIndex(latestPIdx, latestBooking.bookingId);
        return;
      }
    }

    this.selectPatientByIndex(0);
  },

  getBookingsForPatient(patient) {
    if (!patient) return [];
    const pId = String(patient.id || '').trim().toLowerCase();
    const pName = this.normalizeName(patient.name);
    const isSelf = pId === 'self' || patient.isSelf || pId === 'patient_self' || pName.includes('self');

    const filtered = this.allBookings.filter(b => {
      const bPatientId = String(b.patientId || '').trim().toLowerCase();
      const bPatientName = this.normalizeName(b.patientName);
      const bId = String(b.bookingId || '').trim().toLowerCase();

      const isSubBooking = /-\d+$/.test(bId);

      if (isSelf) {
        if (bPatientId.startsWith('fam_')) return false;
        if (isSubBooking && !bId.endsWith('-1')) return false;
        if (bPatientId === 'self' || bPatientId === 'patient_self' || (bPatientName && bPatientName === pName) || (isSubBooking && bId.endsWith('-1'))) {
          return true;
        }
      } else {
        if (bPatientId === 'self' || bPatientId === 'patient_self') return false;
        if (isSubBooking && bId.endsWith('-1')) return false;

        if (bPatientId === pId) return true;
        if (bPatientName && pName && (bPatientName === pName || bPatientName.includes(pName) || pName.includes(bPatientName))) {
          return true;
        }
      }

      let items = b.items;
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch (e) { items = []; }
      }

      if (Array.isArray(items) && items.length > 0) {
        return items.some(it => {
          const itId = String(it.patientId || '').trim().toLowerCase();
          const itName = this.normalizeName(it.patientName);
          if (isSelf) {
            if (itId.startsWith('fam_')) return false;
            return itId === 'self' || itId === 'patient_self' || (itName && itName === pName);
          } else {
            if (itId === 'self' || itId === 'patient_self') return false;
            return itId === pId || (itName && pName && (itName === pName || itName.includes(pName) || pName.includes(itName)));
          }
        });
      }

      return false;
    });

    // Strict Latest-Booking-First sorting (Last booked appears at index 0)
    return filtered.sort((a, b) => {
      const diff = this.getBookingSortTimestamp(b) - this.getBookingSortTimestamp(a);
      if (diff !== 0) return diff;
      return String(b.bookingId || '').localeCompare(String(a.bookingId || ''));
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
    const pName = this.normalizeName(activePatient.name);
    const isSelf = pId === 'self' || activePatient.isSelf || pName.includes('self');

    const hasTaggedItems = items.some(it => it.patientId || it.patientName);
    if (hasTaggedItems) {
      const matched = items.filter(it => {
        const itId = String(it.patientId || '').trim().toLowerCase();
        const itName = this.normalizeName(it.patientName);
        if (itId && itId === pId) return true;
        if (itName && pName && (itName === pName || pName.includes(itName) || itName.includes(pName))) return true;
        if (isSelf && (itId === 'self' || itId === 'patient_self' || itId === '')) return true;
        return false;
      });
      if (matched.length > 0) return matched;
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

    // Always default to index 0 (the latest booked order) unless URL explicitly requested another ID
    const selectedBId = preferredBookingId || patientBookings[0].bookingId;

    if (patientBookings.length > 1) {
      if (subnav) {
        subnav.style.display = 'flex';
        subnav.innerHTML = patientBookings.map((b, bIdx) => {
          const friendlyDate = this.formatFriendlyDate(b.collectionDate, false);
          const slotLabel = this.resolveCartTimeSlot(b);
          const isSelected = b.bookingId === selectedBId;
          const latestTag = bIdx === 0 ? '🆕 ' : '';
          return `
            <button type="button" class="booking-subtab ${isSelected ? 'active' : ''}" 
                    onclick="BookingsPage.selectSpecificBooking('${b.bookingId}')">
              ${latestTag}${this.safeEscape(b.bookingId)} • ${friendlyDate} (${this.safeEscape(slotLabel)})
            </button>
          `;
        }).join('');
      }
    } else {
      if (subnav) subnav.style.display = 'none';
    }

    const activeBooking = patientBookings.find(b => b.bookingId === selectedBId) || patientBookings[0];
    this.renderBookingDetails(activeBooking);
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

    // Ensure random 4-digit OTP is generated and stored
    const pickupOtp = this.ensureBookingPickupOtp(booking);

    const idEl = document.getElementById('disp-booking-id');
    const modeEl = document.getElementById('disp-collection-mode');
    const patientEl = document.getElementById('disp-patient-name');
    const slotEl = document.getElementById('disp-time-slot');
    const paymentEl = document.getElementById('disp-payment-status');
    const amtEl = document.getElementById('disp-amount-val');
    const otpBoxEl = document.getElementById('disp-pickup-otp-box');
    const otpValEl = document.getElementById('disp-pickup-otp-val');

    const isLab = booking.collectionType === 'lab' || String(booking.address || '').includes('Direct Lab');
    const activePatient = this.patientsList[this.selectedPatientIndex] || this.patientsList[0];
    const isVip = this.isMembershipActive(activePatient);

    if (idEl) idEl.textContent = booking.bookingId;
    if (modeEl) {
      modeEl.textContent = isLab ? '🔬 Lab Walk-in' : '🏠 Home Pickup';
      modeEl.className = `meta-mode-badge ${isLab ? 'lab-mode' : 'home-mode'}`;
    }

    // Display Customer Pickup OTP prominently for Home Collection
    if (otpBoxEl && otpValEl) {
      if (!isLab && pickupOtp) {
        otpBoxEl.style.display = 'flex';
        otpValEl.textContent = pickupOtp;
      } else {
        otpBoxEl.style.display = 'none';
      }
    }

    if (patientEl && activePatient) {
      patientEl.innerHTML = `${this.safeEscape(activePatient.name)} ${isVip ? '<span title="VIP Member" style="color:#F59E0B; margin-left:3px;">👑</span>' : ''} (${this.safeEscape(activePatient.relation || 'Self')})`;
    }

    if (slotEl) {
      const friendlyDate = this.formatFriendlyDate(booking.collectionDate, true);
      const exactCartSlot = this.resolveCartTimeSlot(booking);
      slotEl.textContent = `${friendlyDate} • ${exactCartSlot}`;
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

    // Amount Calculation: Final payable priority
    const patientItems = this.getPatientItemsForBooking(booking);
    const patientGrossSum = patientItems.reduce((acc, it) => acc + Number(it.originalPrice || it.price || it.OfferPrice || 0), 0);

    const rawFinal = (booking.finalAmount !== undefined && booking.finalAmount !== null) ? booking.finalAmount :
                     ((booking.FinalAmount !== undefined && booking.FinalAmount !== null) ? booking.FinalAmount :
                     ((booking.amount !== undefined && booking.amount !== null) ? booking.amount : null));

    const vipDiscount = Number(booking.vipDiscount || booking.VIPDiscount || 0);
    const referralDiscount = Number(booking.referralDiscount || booking.CouponDiscount || booking.couponDiscount || 0);
    const doorstepCharge = Number(booking.doorstepCharge || booking.DoorstepCharge || 0);

    const calculatedPayable = Math.max(0, patientGrossSum - vipDiscount - referralDiscount + doorstepCharge);
    const currentBookingAmount = Number(rawFinal !== null ? rawFinal : calculatedPayable);

    // Cross-Linked Sibling Order Total Calculation
    const bId = String(booking.bookingId || '');
    const isSub = /-\d+$/.test(bId);
    let orderGrandTotal = currentBookingAmount;
    let hasSiblings = false;

    if (isSub) {
      const basePrefix = bId.replace(/-\d+$/, '');
      const siblings = this.allBookings.filter(b => String(b.bookingId || '').startsWith(basePrefix + '-'));
      if (siblings.length > 1) {
        hasSiblings = true;
        orderGrandTotal = siblings.reduce((sum, b) => {
          const sFinal = b.finalAmount !== undefined ? b.finalAmount : (b.FinalAmount !== undefined ? b.FinalAmount : b.amount);
          return sum + Number(sFinal || 0);
        }, 0);
      }
    }

    if (amtEl) {
      const amtBlock = amtEl.parentElement;
      const amtLabel = amtBlock ? amtBlock.querySelector('span') : null;

      if (hasSiblings) {
        if (amtLabel) amtLabel.textContent = '💰 Patient Share:';
        amtEl.innerHTML = `
          <span style="color:#078866; font-size:14.5px; font-weight:900;">${this.safeFormatCurrency(currentBookingAmount)}</span>
          <span style="display:block; font-size:9.5px; font-weight:600; color:#536E66; margin-top:2px;">(Order Total: ${this.safeFormatCurrency(orderGrandTotal)})</span>
        `;
      } else {
        if (amtLabel) amtLabel.textContent = '💰 Total Paid:';
        amtEl.innerHTML = `<span style="color:#078866; font-size:14.5px; font-weight:900;">${this.safeFormatCurrency(currentBookingAmount)}</span>`;
      }
    }

    this.renderAddTestsCenterBanner(booking);
    this.renderTimelineStepper(booking);
    this.renderBookedTests(booking, currentBookingAmount, orderGrandTotal, hasSiblings);
  },

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
    const exactSlot = this.resolveCartTimeSlot(booking);

    const homeSteps = [
      { num: 1, title: 'Order Confirmed', desc: `Doorstep pickup confirmed for ${exactSlot}.`, time: 'Booking Confirmed' },
      { num: 2, title: 'Phlebotomist Assigned', desc: 'Field technician assigned with sterile barcoded vacutainers.', time: stage === 2 ? 'In Progress' : (stage > 2 ? 'Completed' : 'Pending') },
      { num: 3, title: 'Doorstep Sample Collection', desc: `Share OTP (${booking.pickupOtp || '****'}) with phlebotomist at ${exactSlot}.`, time: stage === 3 ? 'Sample Collected' : (stage > 3 ? 'Done' : 'Upcoming') },
      { num: 4, title: 'Cold-Chain Transport to Lab', desc: 'Barcoded samples transported safely under 2°C-8°C ice-box.', time: stage === 4 ? 'In Transit' : (stage > 4 ? 'Done' : 'Upcoming') },
      { num: 5, title: 'Certified NABL Report Ready', desc: 'Signed laboratory report delivered to WhatsApp & app.', time: stage === 5 ? 'Report Ready' : 'Same Day' }
    ];

    const labSteps = [
      { num: 1, title: 'Appointment Confirmed', desc: `Lab appointment slot (${exactSlot}) confirmed in lab queue.`, time: 'Confirmed' },
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

  renderBookedTests(booking, currentBookingAmount, orderGrandTotal, hasSiblings) {
    const container = document.getElementById('disp-tests-list');
    if (!container) return;

    const items = this.getPatientItemsForBooking(booking);
    const activePatient = this.patientsList[this.selectedPatientIndex] || this.patientsList[0];
    const isLab = booking.collectionType === 'lab' || String(booking.address || '').includes('Direct Lab');
    
    const doorstepCharge = Number(booking.doorstepCharge || booking.DoorstepCharge || 0);
    const vipDiscount = Number(booking.vipDiscount || booking.VIPDiscount || 0);
    const referralDiscount = Number(booking.referralDiscount || booking.CouponDiscount || booking.couponDiscount || 0);

    let html = items.map(item => `
      <div class="test-summary-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #f1f5f9;">
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span style="font-size:12.5px; font-weight:700; color:#10231E;">🧪 ${this.safeEscape(item.name || item.TestName || 'Diagnostic Checkup')}</span>
          <span style="font-size:10px; color:#078866; font-weight:800; background:rgba(7,136,102,0.08); padding:2px 6px; border-radius:4px; width:fit-content;">
            👤 For: ${this.safeEscape(activePatient.name)}
          </span>
        </div>
        <strong style="color:#1E293B; font-size:13px;">${this.safeFormatCurrency(item.originalPrice || item.price || item.OfferPrice || 0)}</strong>
      </div>
    `).join('');

    if (vipDiscount > 0) {
      html += `
        <div class="test-summary-row" style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#FEF3C7; border-radius:8px; margin-top:6px;">
          <span style="font-size:11.5px; font-weight:800; color:#92400E;">👑 VIP 10% Member Discount:</span>
          <strong style="color:#92400E; font-size:12.5px;">- ${this.safeFormatCurrency(vipDiscount)}</strong>
        </div>
      `;
    }

    if (referralDiscount > 0) {
      html += `
        <div class="test-summary-row" style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#ECFDF5; border-radius:8px; margin-top:6px;">
          <span style="font-size:11.5px; font-weight:800; color:#047857;">🎁 Referral Discount:</span>
          <strong style="color:#047857; font-size:12.5px;">- ${this.safeFormatCurrency(referralDiscount)}</strong>
        </div>
      `;
    }

    if (!isLab && doorstepCharge > 0) {
      html += `
        <div class="test-summary-row" style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#fff7ed; border-radius:8px; margin-top:6px;">
          <span style="font-size:11.5px; font-weight:700; color:#9a3412;">🏠 Home Sample Collection Fee:</span>
          <strong style="color:#c2410c; font-size:12.5px;">${this.safeFormatCurrency(doorstepCharge)}</strong>
        </div>
      `;
    }

    html += `
      <div class="test-summary-row" style="display:flex; justify-content:space-between; align-items:center; padding:12px 6px 4px 6px; border-top:1.5px solid #078866; margin-top:8px;">
        <div>
          <strong style="font-size:13px; color:#10231E; display:block;">Total Paid:</strong>
          <span style="font-size:9.5px; color:#536E66;">(Certified NABL Reports & Taxes Included)</span>
        </div>
        <strong style="color:#078866; font-size:16px; font-weight:900;">${this.safeFormatCurrency(currentBookingAmount)}</strong>
      </div>
    `;

    if (hasSiblings) {
      html += `
        <div class="test-summary-row" style="display:flex; justify-content:space-between; align-items:center; padding:4px 6px; font-size:11px; color:#6B7280;">
          <span>🧾 Family Order Combined Total:</span>
          <strong style="color:#1F2937; font-size:12px; font-weight:800;">${this.safeFormatCurrency(orderGrandTotal)}</strong>
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
      lockedTimeSlot: this.resolveCartTimeSlot(booking),
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
    const slot = this.resolveCartTimeSlot(booking);

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
