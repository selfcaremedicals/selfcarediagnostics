/* file: assets/js/cart.js */
/**
 * Selfcare Diagnostics - Slide-by-Slide Wizard Engine v9.4.2
 * Features:
 * 1. Progressive Referral Engine (10% to 100% OFF): Valid strictly for Primary Account Holder (Self).
 * 2. Hidden from Family Members: Referral reward coupon is hidden & auto-removed if a family member is selected.
 * 3. New Customer Referral Rule: Friend's referral code (SCxxxx) requires minimum ₹500 test subtotal.
 * 4. 100% Free Checkup Support & Cycle Reset: Automatically processes ₹0 orders and resets the 10-referral counter.
 * 5. Backend Referral Tracking: Passes referralCodeUsed and referrerUserId on booking creation.
 */

const CartPage = {
  currentSlide: 1,
  totalSlides: 4,
  cart: [],
  familyMembers: [],
  
  // Multi-Patient State
  selectedPatientIds: ['SELF'],
  selectedPatientId: 'SELF',
  selectedPatientName: 'Self',
  selectedPatientPhone: '',
  selectedPatientEmail: '',
  selectedPatientRelation: 'Self',
  selectedPatientAge: '',
  selectedPatientGender: '',

  selectedSlotDay: 'Today',
  selectedTimeSlot: '',

  selectedPaymentMode: null,
  collectionType: 'home',
  appliedCoupon: null,
  couponDiscountAmount: 0,
  onlineDiscountAmount: 0,
  doorstepCharge: 0,

  currentPickupAddress: 'Chennai, Tamil Nadu',
  currentPickupLocation: 'Not set',

  // Add-on Engine State
  isAddonMode: false,
  addonBookingId: null,
  addonBooking: null,
  existingBookingItems: [],

  // Cashfree & Checkout Processing State
  isProcessingCheckout: false,
  isVerifyingPayment: false,
  currentPendingBooking: null,
  intentLaunchTime: 0,
  fallbackTimerId: null,

  adminCoupons: [
    {
      code: 'SELFCARE10',
      title: 'Flat 10% Laboratory Discount',
      discountPercent: 10,
      validUntil: '2026-12-31',
      description: 'Valid on all preventive panels and blood tests'
    },
    {
      code: 'HEALTH2026',
      title: 'Seasonal Health Saver',
      discountPercent: 10,
      validUntil: '2026-12-31',
      description: 'Special seasonal diagnostic checkup savings'
    }
  ],

  /* ==========================================================
     REFERRAL & SELF-ONLY VALIDATION HELPERS
     ========================================================== */

  getPrimaryUserMobile() {
    const user = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};
    return String(user.mobile || user.phone || localStorage.getItem('selfcare_active_user') || '7010174890')
      .replace(/\D/g, '')
      .slice(-10);
  },

  getOwnReferralCode() {
    const mobile = this.getPrimaryUserMobile();
    return `SC${mobile.slice(-4)}`.toUpperCase();
  },

  getCompletedReferralsCount() {
    const mobile = this.getPrimaryUserMobile();
    const raw = localStorage.getItem(`selfcare_referral_completed_${mobile}`) ||
                localStorage.getItem('selfcare_completed_referrals') ||
                '0';
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), 10);
  },

  /**
   * Returns true ONLY if the Primary Account Holder ('SELF') is the sole selected patient
   */
  isOnlySelfSelected() {
    return Array.isArray(this.selectedPatientIds) &&
           this.selectedPatientIds.length === 1 &&
           this.selectedPatientIds[0] === 'SELF';
  },

  /**
   * Checks if coupon code is a progressive referrer reward (REF10FREE ... REF100FREE)
   */
  isProgressiveReferralCoupon(code) {
    if (!code) return false;
    return /^REF(10|20|30|40|50|60|70|80|90|100)FREE$/i.test(String(code).trim());
  },

  getProgressiveCouponPercent(code) {
    if (!this.isProgressiveReferralCoupon(code)) return 0;
    const match = String(code).trim().match(/^REF(\d+)FREE$/i);
    return match ? Math.min(Math.max(parseInt(match[1], 10), 10), 100) : 0;
  },

  /**
   * Checks if code is a friend's referral code (e.g. SC4890)
   */
  isFriendReferralCode(code) {
    if (!code) return false;
    return /^SC\d{4}$/i.test(String(code).trim());
  },

  getNewTestsSubtotal() {
    return this.cart.reduce((sum, item) => {
      if (item.isExistingBookingItem) return sum;
      return sum + Number(item.price || item.OfferPrice || 0);
    }, 0);
  },

  /**
   * Resets the referral counter after 100% (or progressive reward) redemption so a new 0/10 cycle begins
   */
  resetReferralCycleAfterRedemption() {
    const mobile = this.getPrimaryUserMobile();
    localStorage.setItem(`selfcare_referral_completed_${mobile}`, '0');
    localStorage.setItem('selfcare_completed_referrals', '0');
    localStorage.removeItem('selfcare_applied_coupon');
    localStorage.removeItem('selfcare_coupon_discount_percent');
    localStorage.removeItem('selfcare_coupon_applicable_for');
  },

  calculateAge(dobOrAge) {
    if (!dobOrAge) return '';
    const cleanStr = String(dobOrAge).trim();
    if (!cleanStr) return '';

    const num = Number(cleanStr);
    if (!isNaN(num) && num > 0 && num < 125) {
      return String(Math.floor(num));
    }

    let birthDate = new Date(cleanStr);
    if (isNaN(birthDate.getTime()) && /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(cleanStr)) {
      const parts = cleanStr.split(/[/-]/);
      birthDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }

    if (isNaN(birthDate.getTime())) {
      return '';
    }

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return (age >= 0 && age < 125) ? String(age) : '';
  },

  async init() {
    try {
      this.detectAddonBookingMode();
      this.loadCartData();
      this.loadPatientAndAddressData();
      this.restorePersistedWizardState();
      this.checkAutoAppliedCoupon();
      this.populateTimeSlotsDropdown();
      this.renderCartUI();
      this.updateCartBadgeUI();
      this.setupUPIAppReturnListeners();

      const urlParams = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : null;
      const cfOrderIdFromUrl = urlParams
        ? (urlParams.get('cf_order_id') || urlParams.get('order_id') || urlParams.get('cashfreeOrderId'))
        : null;

      if (typeof Api !== 'undefined' && typeof Api.loadCashfreeSDK === 'function' && navigator.onLine) {
        Api.loadCashfreeSDK().catch(() => {});
      }

      const requestedSlide = urlParams ? parseInt(urlParams.get('slide'), 10) : null;
      const savedSlide = parseInt(sessionStorage.getItem('selfcare_cart_slide'), 10);

      if (this.isAddonMode) {
        this.goToSlide(1, true);
        this.applyAddonLocksToUI();
      } else if (requestedSlide && requestedSlide >= 1 && requestedSlide <= 4) {
        this.goToSlide(requestedSlide, true);
      } else if (savedSlide && savedSlide >= 1 && savedSlide <= 4 && this.cart.length > 0) {
        this.goToSlide(savedSlide, true);
      } else {
        this.goToSlide(1, true);
      }

      if (cfOrderIdFromUrl) {
        await this.handleCashfreeReturnRedirect(cfOrderIdFromUrl);
      }
    } catch (err) {
      console.error('CartPage init error:', err);
    }
  },

  safeShowToast(message, type = 'info') {
    if (typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(message, type);
    } else {
      alert(message);
    }
  },

  restorePersistedWizardState() {
    if (this.isAddonMode) return;

    try {
      const savedCollection = sessionStorage.getItem('selfcare_cart_collection_type');
      if (savedCollection) {
        this.selectCollectionType(savedCollection, false);
      } else {
        this.selectCollectionType('home', false);
      }

      const savedPatients = sessionStorage.getItem('selfcare_cart_patient_ids');
      if (savedPatients) {
        try {
          const parsed = JSON.parse(savedPatients);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.selectedPatientIds = parsed;
          }
        } catch (e) {}
      } else {
        const singleOldId = sessionStorage.getItem('selfcare_cart_patient_id');
        if (singleOldId) this.selectedPatientIds = [singleOldId];
      }

      this.syncPrimaryPatientDetails();

      const savedSlotDay = sessionStorage.getItem('selfcare_cart_slot_day');
      if (savedSlotDay) {
        this.selectSlotDay(savedSlotDay, false);
      }

      const savedTimeSlot = sessionStorage.getItem('selfcare_cart_time_slot');
      if (savedTimeSlot) {
        this.selectedTimeSlot = savedTimeSlot;
        const selectEl = document.getElementById('cart-slot-select');
        if (selectEl) selectEl.value = savedTimeSlot;
      }

      const savedPayment = sessionStorage.getItem('selfcare_cart_payment_mode');
      if (savedPayment) {
        this.selectPaymentMode(savedPayment, false);
      }
    } catch (e) {
      console.warn('Could not restore wizard state:', e);
    }
  },

  clearPersistedWizardState() {
    try {
      sessionStorage.removeItem('selfcare_cart_slide');
      sessionStorage.removeItem('selfcare_cart_collection_type');
      sessionStorage.removeItem('selfcare_cart_payment_mode');
      sessionStorage.removeItem('selfcare_cart_patient_ids');
      sessionStorage.removeItem('selfcare_cart_patient_id');
      sessionStorage.removeItem('selfcare_cart_slot_day');
      sessionStorage.removeItem('selfcare_cart_time_slot');
      sessionStorage.removeItem('selfcare_target_patient_id');
      sessionStorage.removeItem('selfcare_active_cf_txn');
      sessionStorage.removeItem('selfcare_active_upi_txn');
    } catch (e) {}
  },

  navigateToAddItems(patientId, type) {
    const targetId = patientId || this.selectedPatientId || 'SELF';
    sessionStorage.setItem('selfcare_target_patient_id', targetId);
    sessionStorage.setItem('selfcare_cart_slide', '1');

    const targetUrl = (type === 'packages') ? 'packages.html' : 'tests.html';
    window.location.href = `${targetUrl}?patientId=${encodeURIComponent(targetId)}`;
  },

  goToSlide(slideIndex, force = false) {
    if (slideIndex < 1 || slideIndex > this.totalSlides) return;

    if (!force) {
      if (slideIndex > 1) {
        if (!this.cart || this.cart.length === 0) {
          this.safeShowToast('Your cart is empty', 'error');
          return;
        }
        if (!this.selectedPatientIds || this.selectedPatientIds.length === 0) {
          this.safeShowToast('Please select at least one family member', 'error');
          return;
        }
      }
      if (slideIndex > 2) {
        if (!this.selectedPatientPhone || this.selectedPatientPhone.length !== 10) {
          this.selectedPatientPhone = this.getPrimaryUserMobile() || '7010174890';
        }
        if (!this.selectedTimeSlot) {
          this.safeShowToast('Please select a 30-minute collection time slot', 'error');
          return;
        }
      }
      if (slideIndex > 3 && !this.selectedPaymentMode) {
        this.safeShowToast('Please select a payment method (Online or Cash) to proceed', 'error');
        return;
      }
    }

    this.currentSlide = slideIndex;

    if (!this.isAddonMode && this.cart.length > 0) {
      sessionStorage.setItem('selfcare_cart_slide', String(slideIndex));
    }

    for (let i = 1; i <= this.totalSlides; i++) {
      const slideEl = document.getElementById(`cart-slide-${i}`);
      const stepNode = document.getElementById(`step-node-${i}`);
      const connector = document.getElementById(`connector-${i}`);

      if (slideEl) slideEl.classList.toggle('active', i === slideIndex);
      if (stepNode) {
        stepNode.classList.toggle('active', i === slideIndex);
        stepNode.classList.toggle('completed', i < slideIndex);
      }
      if (connector) connector.classList.toggle('filled', i < slideIndex);
    }

    this.updateBottomControlBarUI();

    if (this.isAddonMode) {
      this.applyAddonLocksToUI();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  tryJumpToSlide(targetSlide) {
    this.goToSlide(targetSlide);
  },

  applyAddonLocksToUI() {
    if (!this.isAddonMode) return;

    // 1. Patient selection chips disabled / locked in Slide 1
    document.querySelectorAll('.patient-chip').forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.85';
    });

    // 2. Collection mode cards disabled in Slide 4
    const homeCard = document.getElementById('card-mode-home');
    const labCard = document.getElementById('card-mode-lab');
    if (homeCard) { homeCard.style.pointerEvents = 'none'; homeCard.style.opacity = '0.85'; }
    if (labCard) { labCard.style.pointerEvents = 'none'; labCard.style.opacity = '0.85'; }

    // 3. Slot day buttons & time slot dropdown locked in Slide 2
    const todayBtn = document.getElementById('slot-day-today');
    const tomorrowBtn = document.getElementById('slot-day-tomorrow');
    const slotSelect = document.getElementById('cart-slot-select');
    if (todayBtn) todayBtn.style.pointerEvents = 'none';
    if (tomorrowBtn) tomorrowBtn.style.pointerEvents = 'none';
    if (slotSelect) slotSelect.disabled = true;

    // 4. Address edit button disabled
    const editAddrBtn = document.getElementById('edit-address-btn');
    if (editAddrBtn) editAddrBtn.style.display = 'none';
  },

  updateBottomControlBarUI() {
    const backBtn = document.getElementById('bar-back-btn');
    const nextBtn = document.getElementById('floating-action-btn');

    if (!backBtn || !nextBtn) return;

    if (this.currentSlide === 1) {
      backBtn.style.visibility = this.isAddonMode ? 'visible' : 'hidden';
      if (this.isAddonMode) {
        backBtn.textContent = '✕ Exit';
        backBtn.classList.add('exit-bar-btn');
      } else {
        backBtn.classList.remove('exit-bar-btn');
      }
    } else {
      backBtn.style.visibility = 'visible';
      backBtn.textContent = '← Back';
      backBtn.classList.remove('exit-bar-btn');
    }

    if (this.currentSlide === 1) {
      nextBtn.textContent = 'Schedule & Address ➔';
      nextBtn.disabled = this.cart.length === 0;
    } else if (this.currentSlide === 2) {
      nextBtn.textContent = 'Payment & Offers ➔';
      nextBtn.disabled = false;
    } else if (this.currentSlide === 3) {
      nextBtn.textContent = 'Select Collection ➔';
      nextBtn.disabled = false;
    } else if (this.currentSlide === 4) {
      nextBtn.textContent = this.isAddonMode ? 'Pay & Add Tests ➔' : 'Confirm Booking ➔';
      nextBtn.disabled = !this.collectionType;
    }
  },

  handleBarBack() {
    if (this.isAddonMode && this.currentSlide === 1) {
      this.exitAddonMode();
      return;
    }

    if (this.currentSlide > 1) {
      this.goToSlide(this.currentSlide - 1);
    }
  },

  handleFloatingActionButton() {
    if (this.currentSlide === 1) {
      if (!this.cart || this.cart.length === 0) {
        this.safeShowToast('Your cart is empty', 'error');
        return;
      }
      if (!this.selectedPatientIds || this.selectedPatientIds.length === 0) {
        this.safeShowToast('Please select at least one family member', 'error');
        return;
      }
      if (this.isAddonMode && (!this.selectedPatientPhone || this.selectedPatientPhone.length !== 10)) {
        this.selectedPatientPhone = this.getPrimaryUserMobile() || '7010174890';
      }
      this.goToSlide(2);
    } else if (this.currentSlide === 2) {
      if (!this.selectedPatientPhone || this.selectedPatientPhone.length !== 10) {
        this.selectedPatientPhone = this.getPrimaryUserMobile() || '7010174890';
      }
      if (!this.selectedTimeSlot) {
        this.safeShowToast('Please select a 30-minute collection time slot', 'error');
        return;
      }
      this.goToSlide(3);
    } else if (this.currentSlide === 3) {
      if (!this.selectedPaymentMode) {
        this.safeShowToast('Please select payment method (Online or Cash)', 'error');
        return;
      }
      this.goToSlide(4);
    } else if (this.currentSlide === 4) {
      if (!this.collectionType) {
        this.safeShowToast('Please select Home Pickup or Lab Walk-in', 'error');
        this.goToSlide(4);
        return;
      }
      this.handleProceedToCheckout();
    }
  },

  selectCollectionType(type, persist = true) {
    if (this.isAddonMode) {
      this.safeShowToast('Collection mode is locked to existing booking appointment', 'info');
      return;
    }

    this.collectionType = type;
    if (persist) {
      sessionStorage.setItem('selfcare_cart_collection_type', type);
    }

    const homeCard = document.getElementById('card-mode-home');
    const labCard = document.getElementById('card-mode-lab');
    const addrRow = document.getElementById('patient-display-address-row');
    const locRow = document.getElementById('patient-display-location-row');
    const editBtn = document.getElementById('edit-address-btn');
    const cashLabel = document.getElementById('cash-payment-label-text');
    const cashSub = document.getElementById('cash-payment-sub-text');

    if (homeCard) homeCard.classList.toggle('active', type === 'home');
    if (labCard) labCard.classList.toggle('active', type === 'lab');

    if (type === 'home') {
      if (addrRow) addrRow.style.display = 'flex';
      if (locRow) locRow.style.display = 'flex';
      if (editBtn) editBtn.style.display = 'inline-block';
      if (cashLabel) cashLabel.textContent = 'Cash on Collection';
      if (cashSub) cashSub.textContent = 'Pay phlebotomist directly at doorstep during sample pickup';
    } else {
      if (addrRow) addrRow.style.display = 'none';
      if (locRow) locRow.style.display = 'none';
      if (editBtn) editBtn.style.display = 'none';
      if (cashLabel) cashLabel.textContent = 'Pay Cash at Lab Counter';
      if (cashSub) cashSub.textContent = 'Pay directly at diagnostic center cash counter during sample visit';
    }

    this.calculateBillSummary();
    this.renderSelectedPatientCard();
    this.updateBottomControlBarUI();
  },

  calculateDoorstepCharge(subtotal = null) {
    if (this.isAddonMode) return 0;
    if (this.collectionType === 'lab') return 0;
    if (this.cart.length === 0) return 0;

    let total = subtotal !== null ? subtotal : this.getNewTestsSubtotal();

    if (total >= 500) {
      return 0;
    }

    const isPPBSTest = (item) => {
      const name = (item.name || item.TestName || '').toUpperCase();
      const code = (item.code || item.TestCode || '').toUpperCase();
      return name.includes('PPBS') || name.includes('POST PRANDIAL') || code === 'T0009' || code === 'SCDT0009';
    };

    const ppbsItems = this.cart.filter(i => !i.isExistingBookingItem && isPPBSTest(i));
    const otherItems = this.cart.filter(i => !i.isExistingBookingItem && !isPPBSTest(i));

    if (ppbsItems.length > 0 && otherItems.length > 0) return 150;
    return 100;
  },

  updateHomeCollectionBadge(subtotalNewTests) {
    const badge = document.getElementById('home-collection-badge-tag');
    if (!badge) return;

    if (subtotalNewTests >= 500) {
      badge.textContent = 'Collection Charge: FREE';
      badge.classList.add('free-tag');
    } else {
      const isPPBSTest = (item) => {
        const name = (item.name || item.TestName || '').toUpperCase();
        const code = (item.code || item.TestCode || '').toUpperCase();
        return name.includes('PPBS') || name.includes('POST PRANDIAL') || code === 'T0009' || code === 'SCDT0009';
      };
      const ppbsItems = this.cart.filter(i => !i.isExistingBookingItem && isPPBSTest(i));
      const otherItems = this.cart.filter(i => !i.isExistingBookingItem && !isPPBSTest(i));
      const charge = (ppbsItems.length > 0 && otherItems.length > 0) ? 150 : 100;

      badge.textContent = charge === 150 ? 'Doorstep Charge: ₹150 (Dual Visit for PPBS)' : 'Doorstep Charge: ₹100';
      badge.classList.remove('free-tag');
    }
  },

  calculateBillSummary() {
    let totalMrp = 0;
    let subtotalNewTests = 0;
    let existingPaidAmount = 0;

    this.cart.forEach(item => {
      if (item.isExistingBookingItem) {
        existingPaidAmount += Number(item.originalPrice || 0);
      } else {
        const offer = Number(item.price || item.OfferPrice || 0);
        const mrp = Number(item.mrp || item.MRP || offer);
        subtotalNewTests += offer;
        totalMrp += mrp;
      }
    });

    const labSavings = Math.max(0, totalMrp - subtotalNewTests);

    if (this.appliedCoupon && subtotalNewTests > 0) {
      const cleanCode = String(this.appliedCoupon).trim().toUpperCase();

      if (this.isProgressiveReferralCoupon(cleanCode)) {
        if (!this.isOnlySelfSelected()) {
          this.appliedCoupon = null;
          localStorage.removeItem('selfcare_applied_coupon');
          localStorage.removeItem('selfcare_coupon_discount_percent');
          localStorage.removeItem('selfcare_coupon_applicable_for');
          this.safeShowToast('Referral reward removed: Valid strictly for Primary Account Holder (Self) only.', 'error');
        }
      }

      if (this.appliedCoupon && this.isFriendReferralCode(cleanCode)) {
        if (subtotalNewTests < 500) {
          this.appliedCoupon = null;
          localStorage.removeItem('selfcare_applied_coupon');
          this.safeShowToast('Referral code removed: Minimum test order of ₹500 is required.', 'error');
        }
      }
    }

    let couponDiscount = 0;
    let couponTitle = '';

    if (this.appliedCoupon && subtotalNewTests > 0) {
      const clean = String(this.appliedCoupon).trim().toUpperCase();

      if (this.isProgressiveReferralCoupon(clean)) {
        const unlockedMaxPercent = this.getCompletedReferralsCount() * 10;
        const requestedPercent = this.getProgressiveCouponPercent(clean);
        const effectivePercent = unlockedMaxPercent > 0 ? Math.min(requestedPercent, unlockedMaxPercent) : requestedPercent;

        couponDiscount = Math.round(subtotalNewTests * (effectivePercent / 100));
        couponTitle = `Referral Reward (${effectivePercent}% OFF - Self Only):`;
      } else if (this.isFriendReferralCode(clean)) {
        couponDiscount = Math.round(subtotalNewTests * 0.10);
        couponTitle = `Referral Code (${clean} - 10% OFF):`;
      } else if (clean.toLowerCase().startsWith('selfcare10%')) {
        const friend = clean.substring(11);
        couponDiscount = Math.round(subtotalNewTests * 0.10);
        couponTitle = `Referral Discount (10% - ${friend}):`;
      } else {
        couponDiscount = Math.round(subtotalNewTests * 0.10);
        couponTitle = `Coupon Discount (${clean}):`;
      }
    }

    this.couponDiscountAmount = couponDiscount;
    this.onlineDiscountAmount = 0;
    this.doorstepCharge = this.calculateDoorstepCharge(subtotalNewTests);

    if (this.appliedCoupon && this.getProgressiveCouponPercent(this.appliedCoupon) === 100) {
      this.doorstepCharge = 0;
    }

    this.updateHomeCollectionBadge(subtotalNewTests);

    const finalPayable = Math.max(0, subtotalNewTests - couponDiscount + this.doorstepCharge);

    const stickyPayableEl = document.getElementById('sticky-payable-amount');
    if (stickyPayableEl) stickyPayableEl.textContent = Utils.formatCurrency(finalPayable);

    const totalMrpEl = document.getElementById('bill-total-mrp');
    const subtotalPriceEl = document.getElementById('bill-subtotal-price');
    const labSavingsEl = document.getElementById('bill-lab-savings');
    const couponRow = document.getElementById('bill-coupon-row');
    const couponLabel = document.getElementById('bill-coupon-label');
    const couponAmtEl = document.getElementById('bill-coupon-amount');
    const chargeLabel = document.getElementById('bill-collection-charge-label');
    const chargeVal = document.getElementById('bill-collection-charge-val');
    const finalPayableEl = document.getElementById('bill-final-payable');

    if (totalMrpEl) totalMrpEl.textContent = Utils.formatCurrency(totalMrp);
    if (subtotalPriceEl) subtotalPriceEl.textContent = Utils.formatCurrency(subtotalNewTests);
    if (labSavingsEl) labSavingsEl.textContent = `- ${Utils.formatCurrency(labSavings)}`;

    if (couponDiscount > 0 && couponRow) {
      couponRow.style.display = 'flex';
      if (couponLabel) couponLabel.textContent = couponTitle;
      if (couponAmtEl) couponAmtEl.textContent = `- ${Utils.formatCurrency(couponDiscount)}`;
    } else if (couponRow) {
      couponRow.style.display = 'none';
    }

    if (chargeVal) {
      if (this.isAddonMode) {
        chargeVal.textContent = 'FREE (₹0 - Clubbed)';
        chargeVal.classList.add('green-val');
        if (chargeLabel) chargeLabel.textContent = 'Doorstep Sample Collection:';
      } else if (this.collectionType === 'lab') {
        chargeVal.textContent = 'FREE (₹0)';
        chargeVal.classList.add('green-val');
        if (chargeLabel) chargeLabel.textContent = 'Direct Lab Visit Fee:';
      } else if (this.collectionType === 'home') {
        if (this.doorstepCharge === 0) {
          chargeVal.textContent = 'FREE';
          chargeVal.classList.add('green-val');
          if (chargeLabel) chargeLabel.textContent = 'Doorstep Sample Collection:';
        } else {
          chargeVal.classList.remove('green-val');
          chargeVal.textContent = Utils.formatCurrency(this.doorstepCharge);
          if (chargeLabel) {
            chargeLabel.textContent = this.doorstepCharge === 150 
              ? 'Doorstep Collection (₹150 - Dual visit for PPBS):' 
              : 'Doorstep Sample Collection:';
          }
        }
      } else {
        chargeVal.textContent = 'FREE (₹0 - Order ₹500+)';
      }
    }

    if (finalPayableEl) finalPayableEl.textContent = Utils.formatCurrency(finalPayable);
    this.updateCouponBannerUI();
  },

  syncPrimaryPatientDetails() {
    if (!this.selectedPatientIds || this.selectedPatientIds.length === 0) {
      this.selectedPatientIds = ['SELF'];
    }

    const firstId = this.selectedPatientIds[0];
    const target = this.familyMembers.find(p => p.id === firstId) || this.familyMembers[0] || {};

    this.selectedPatientId = target.id || 'SELF';
    this.selectedPatientName = target.name || 'Self';
    this.selectedPatientPhone = target.mobile || this.getPrimaryUserMobile() || '';
    this.selectedPatientEmail = target.email || '';
    this.selectedPatientRelation = target.relation || 'Self';
    this.selectedPatientAge = target.age || '';
    this.selectedPatientGender = target.gender || '';

    if (target.id !== 'SELF' && target.address && target.address.trim()) {
      this.currentPickupAddress = target.address;
      if (target.location) this.currentPickupLocation = target.location;
    }
  },

  togglePatient(id) {
    if (this.isAddonMode) {
      this.safeShowToast('Patient is fixed to the existing booking', 'info');
      return;
    }

    const index = this.selectedPatientIds.indexOf(id);

    if (index > -1) {
      if (this.selectedPatientIds.length === 1) {
        this.safeShowToast('At least one family member must be selected', 'info');
        return;
      }
      this.selectedPatientIds.splice(index, 1);
    } else {
      this.selectedPatientIds.push(id);
    }

    sessionStorage.setItem('selfcare_cart_patient_ids', JSON.stringify(this.selectedPatientIds));
    this.syncPrimaryPatientDetails();
    this.renderPatientChips();
    this.renderSelectedPatientCard();

    const activeFirstId = this.selectedPatientIds[0];
    let cartModified = false;
    this.cart.forEach(item => {
      if (item.patientId && !this.selectedPatientIds.includes(item.patientId)) {
        item.patientId = activeFirstId;
        cartModified = true;
      }
    });

    if (cartModified) {
      this.saveCartState();
    }

    this.renderItemsList();
    this.calculateBillSummary();
  },

  selectPatient(id, persist = true) {
    this.togglePatient(id);
  },

  renderSelectedPatientCard() {
    const nameEl = document.getElementById('disp-patient-name');
    const relEl = document.getElementById('disp-patient-relation');
    const phoneEl = document.getElementById('disp-patient-phone');
    const addrEl = document.getElementById('cart-display-address');
    const locEl = document.getElementById('cart-display-location');
    const tagsContainer = document.getElementById('selected-patients-overview-tags');

    const selectedMembers = this.familyMembers.filter(m => this.selectedPatientIds.includes(m.id));

    if (nameEl) {
      if (selectedMembers.length === 1) {
        nameEl.textContent = selectedMembers[0].name;
      } else {
        nameEl.textContent = `${selectedMembers.length} Family Members Selected`;
      }
    }

    if (relEl) {
      relEl.textContent = selectedMembers.length === 1 
        ? (selectedMembers[0].relation || 'Self') 
        : `${selectedMembers.length} Members`;
    }

    if (phoneEl) {
      const primaryPhone = this.selectedPatientPhone || (selectedMembers[0] && selectedMembers[0].mobile) || this.getPrimaryUserMobile() || '';
      phoneEl.textContent = primaryPhone ? `+91 ${primaryPhone}` : 'Not set';
    }

    if (addrEl) addrEl.textContent = this.currentPickupAddress || 'Chennai, Tamil Nadu';
    if (locEl) locEl.textContent = this.currentPickupLocation || 'Not set';

    if (tagsContainer) {
      tagsContainer.style.display = 'flex';
      tagsContainer.innerHTML = selectedMembers.map(m => `
        <span class="patient-overview-tag">
          👤 ${Utils.escapeHtml(m.name)} (${Utils.escapeHtml(m.relation || 'Member')})
        </span>
      `).join('');
    }
  },

  renderPatientChips() {
    const container = document.getElementById('patient-selection-list');
    const badge = document.getElementById('patient-count-badge');
    if (!container) return;

    if (badge) {
      badge.textContent = `${this.selectedPatientIds.length} Selected (Tap to toggle)`;
    }

    if (this.isAddonMode) {
      container.innerHTML = `
        <div class="patient-chip active" style="cursor: default;">
          <span class="chip-name">${Utils.escapeHtml(this.selectedPatientName)}</span>
          <span class="chip-relation-tag">${Utils.escapeHtml(this.selectedPatientRelation)} (Locked)</span>
        </div>
      `;
      return;
    }

    container.innerHTML = this.familyMembers.map(p => {
      const isSelected = this.selectedPatientIds.includes(p.id);
      return `
        <div class="patient-chip ${isSelected ? 'active' : ''}" onclick="CartPage.togglePatient('${p.id}')">
          <span class="chip-name">${Utils.escapeHtml(p.name)}</span>
          <span class="chip-relation-tag">${Utils.escapeHtml(p.relation || 'Member')}</span>
        </div>
      `;
    }).join('');
  },

  selectPaymentMode(mode, persist = true) {
    this.selectedPaymentMode = mode;
    if (persist) {
      sessionStorage.setItem('selfcare_cart_payment_mode', mode);
    }

    const cardOnline = document.getElementById('pay-card-online');
    const cardCash = document.getElementById('pay-card-cash');
    if (cardOnline) cardOnline.classList.toggle('active', mode === 'online');
    if (cardCash) cardCash.classList.toggle('active', mode === 'cash');

    const radioOnline = document.querySelector('input[name="payment_mode"][value="online"]');
    const radioCash = document.querySelector('input[name="payment_mode"][value="cash"]');
    if (mode === 'online' && radioOnline) radioOnline.checked = true;
    if (mode === 'cash' && radioCash) radioCash.checked = true;

    this.calculateBillSummary();
    this.updateBottomControlBarUI();
  },

  assignItemPatient(itemIndex, targetPatientId) {
    if (itemIndex >= 0 && itemIndex < this.cart.length) {
      const targetItem = this.cart[itemIndex];

      if (targetItem.isExistingBookingItem) {
        this.safeShowToast('Already booked tests cannot be reassigned', 'info');
        return;
      }

      if (typeof ConflictValidator !== 'undefined') {
        try {
          const targetPatientItems = this.cart.filter((it, idx) => idx !== itemIndex && (it.patientId || 'SELF') === targetPatientId);
          const conflict = ConflictValidator.checkConflict(targetItem, targetPatientItems);
          if (conflict && conflict.hasConflict) {
            this.safeShowToast(conflict.reason, 'error');
            this.renderItemsList();
            return;
          }
        } catch (e) {
          console.warn('Conflict check error on reassign:', e);
        }
      }

      this.cart[itemIndex].patientId = targetPatientId;
      this.saveCartState();
      this.renderItemsList();
      const p = this.familyMembers.find(m => m.id === targetPatientId);
      if (p) this.safeShowToast(`Test assigned to ${p.name}`, 'info');
    }
  },

  renderItemsList() {
    const container = document.getElementById('cart-items-list');
    const countBadge = document.getElementById('cart-items-count-badge');
    if (!container) return;

    if (countBadge) countBadge.textContent = `${this.cart.length} Items`;

    const selectedMembers = this.familyMembers.filter(m => this.selectedPatientIds.includes(m.id));
    const effectiveMembers = (selectedMembers && selectedMembers.length > 0) 
      ? selectedMembers 
      : [this.familyMembers[0] || { id: 'SELF', name: 'Self', relation: 'Self' }];
    
    const fallbackPatientId = effectiveMembers[0].id || 'SELF';

    this.cart.forEach(item => {
      if (!item.patientId || !this.selectedPatientIds.includes(item.patientId)) {
        item.patientId = fallbackPatientId;
      }
    });

    let groupedHtml = '';

    effectiveMembers.forEach(member => {
      const memberItems = this.cart
        .map((item, idx) => ({ ...item, originalIndex: idx }))
        .filter(item => (item.patientId || fallbackPatientId) === member.id);

      groupedHtml += `
        <div class="patient-tests-group-card glass-panel-3d animate-3d-card">
          <div class="patient-group-header">
            <div>
              <span class="patient-group-name">
                👤 ${Utils.escapeHtml(member.name)} (${Utils.escapeHtml(member.relation || 'Member')})
              </span>
            </div>
            <span class="patient-tests-badge">
              ${memberItems.length} Tests
            </span>
          </div>

          ${memberItems.length === 0 ? `
            <div class="patient-empty-tests-box">
              <p>No tests assigned for ${Utils.escapeHtml(member.name)} yet.</p>
              <span>Use buttons below to add tests or packages</span>
            </div>
          ` : memberItems.map(item => {
            const isPaidItem = Boolean(item.isExistingBookingItem);
            const isPackage = item.type === 'package' || String(item.PackageID || item.PackageCode || '').startsWith('PKG');
            const name = item.name || item.TestName || item.PackageName || 'Diagnostic Item';
            const offerPrice = isPaidItem ? 0 : Number(item.price || item.OfferPrice || 0);
            const mrp = isPaidItem ? Number(item.originalPrice || 0) : Number(item.mrp || item.MRP || offerPrice);

            return `
              <div class="cart-item-card glass-panel-3d-item ${isPaidItem ? 'existing-locked-item' : ''}">
                <div class="item-main-details">
                  <div class="item-meta-row">
                    <span class="type-badge ${isPackage ? 'package-type' : 'test-type'}">
                      ${isPackage ? 'PACKAGE' : 'TEST'}
                    </span>
                    <span class="item-code-tag">${Utils.escapeHtml(item.code || item.TestCode || item.PackageCode || '')}</span>
                    ${isPaidItem ? `<span class="paid-tag" style="background:#078866; color:#fff; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:800;">🔒 EXISTING (LOCKED)</span>` : ''}
                  </div>
                  <h4 class="item-title">${Utils.escapeHtml(name)}</h4>
                  <div class="item-price-row">
                    ${(!isPaidItem && mrp > offerPrice) ? `<span class="item-mrp-strike">${Utils.formatCurrency(mrp)}</span>` : ''}
                    <span class="item-offer-price">${Utils.formatCurrency(offerPrice)}</span>
                    ${isPaidItem ? `<span class="item-paid-note">(Already Paid: ${Utils.formatCurrency(item.originalPrice || 0)})</span>` : ''}
                  </div>
                </div>

                <div class="item-actions-row">
                  ${(!isPaidItem && effectiveMembers.length > 1) ? `
                    <select class="patient-reassign-select" onchange="CartPage.assignItemPatient(${item.originalIndex}, this.value)">
                      ${effectiveMembers.map(m => `
                        <option value="${m.id}" ${m.id === member.id ? 'selected' : ''}>
                          For: ${m.name}
                        </option>
                      `).join('')}
                    </select>
                  ` : ''}

                  ${isPaidItem ? `
                    <span class="item-paid-badge" style="color:#078866; font-size:11px; font-weight:800;">🔒 Cannot Remove</span>
                  ` : `
                    <button type="button" class="item-delete-btn" onclick="CartPage.removeItem(${item.originalIndex})" title="Remove item">🗑️</button>
                  `}
                </div>
              </div>
            `;
          }).join('')}

          <div class="patient-card-actions-row">
            <button type="button" class="patient-action-btn add-test-sub-btn"
              onclick="CartPage.navigateToAddItems('${member.id}', 'tests')">
              🧪 + Add Tests
            </button>
            <button type="button" class="patient-action-btn add-pkg-sub-btn"
              onclick="CartPage.navigateToAddItems('${member.id}', 'packages')">
              📦 + Add Packages
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = groupedHtml;
  },

  detectAddonBookingMode() {
    const urlParams = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : null;
    const urlAddonId = urlParams ? urlParams.get('addonBookingId') : null;
    const storedAddonId = (typeof localStorage !== 'undefined') ? localStorage.getItem('selfcare_active_addon_booking_id') : null;
    const targetAddonId = urlAddonId || storedAddonId;

    if (targetAddonId) {
      let bData = null;
      try {
        const raw = sessionStorage.getItem('selfcare_addon_booking') || localStorage.getItem('selfcare_active_addon_booking_data');
        if (raw) bData = JSON.parse(raw);
      } catch (e) {}

      if (!bData) {
        try {
          const recents = JSON.parse(localStorage.getItem('selfcare_recent_bookings') || '[]');
          bData = recents.find(b => (b.bookingId || '').toUpperCase() === targetAddonId.toUpperCase());
        } catch (e) {}
      }

      if (bData && bData.bookingId) {
        this.isAddonMode = true;
        this.addonBookingId = bData.bookingId;
        this.addonBooking = bData;
        this.collectionType = bData.collectionType || 'home';
        localStorage.setItem('selfcare_active_addon_booking_id', bData.bookingId);
        localStorage.setItem('selfcare_active_addon_booking_data', JSON.stringify(bData));
        return;
      }
    }

    this.isAddonMode = false;
    this.addonBookingId = null;
    this.addonBooking = null;
    this.existingBookingItems = [];
  },

  loadCartData() {
    if (this.isAddonMode && this.addonBooking) {
      let rawBookingItems = this.addonBooking.items;
      if (typeof rawBookingItems === 'string') {
        try { rawBookingItems = JSON.parse(rawBookingItems); } catch (e) { rawBookingItems = []; }
      }
      if (!Array.isArray(rawBookingItems)) rawBookingItems = [];

      const existingMarked = rawBookingItems.map((item, idx) => ({
        id: item.id || item.TestID || item.PackageID || `PAID_${idx}`,
        name: item.name || item.TestName || item.PackageName || 'Diagnostic Test',
        code: item.code || item.TestCode || item.PackageCode || 'PAID',
        price: 0,
        originalPrice: Number(item.price || item.OfferPrice || 0),
        mrp: Number(item.mrp || item.MRP || item.price || 0),
        type: item.type || 'test',
        patientId: item.patientId || this.addonBooking.patientId || 'SELF',
        isExistingBookingItem: true,
        removable: false
      }));

      this.existingBookingItems = existingMarked;

      let newAddedItems = [];
      try {
        const activeUser = localStorage.getItem('selfcare_active_user');
        let rawCart = activeUser ? localStorage.getItem(`selfcare_cart_${activeUser}`) : localStorage.getItem('selfcare_cart');
        if (rawCart) {
          const parsed = JSON.parse(rawCart);
          if (Array.isArray(parsed)) {
            newAddedItems = parsed.filter(i => !i.isExistingBookingItem);
          }
        }
      } catch (e) {}

      this.cart = [...existingMarked, ...newAddedItems];
      return;
    }

    try {
      let localCart = null;
      if (typeof localStorage !== 'undefined') {
        const activeUser = localStorage.getItem('selfcare_active_user');
        let raw = activeUser ? localStorage.getItem(`selfcare_cart_${activeUser}`) : (localStorage.getItem('selfcare_cart') ?? localStorage.getItem('cart'));
        if (raw !== null) {
          try { localCart = JSON.parse(raw); } catch (e) {}
        }
      }
      this.cart = Array.isArray(localCart) ? localCart : [];
    } catch (e) {
      this.cart = [];
    }
  },

  loadPatientAndAddressData() {
    let user = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};
    const primaryMobile = user.mobile || user.phone || localStorage.getItem('selfcare_active_user') || '7010174890';

    try {
      if (!user || Object.keys(user).length === 0 || !user.name) {
        const storedUser = localStorage.getItem(`selfcare_profile_${primaryMobile}`) ||
                           localStorage.getItem(`selfcare_user_${primaryMobile}`) ||
                           localStorage.getItem('selfcare_profile') ||
                           localStorage.getItem('selfcare_user') ||
                           localStorage.getItem('user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          user = { ...parsed, ...user };
        }
      }
    } catch (e) {}

    const primaryName = user.name || user.fullName || user.userName || 'Valued Customer';
    const primaryEmail = user.email || '';

    const selfAgeRaw = user.age || user.Age || user.dob || user.DOB || user.dateOfBirth || user.DateOfBirth || user.birthDate || '';
    const calculatedSelfAge = this.calculateAge(selfAgeRaw);

    const selfPatient = {
      id: 'SELF',
      name: primaryName,
      relation: 'Self',
      mobile: primaryMobile,
      email: primaryEmail,
      age: calculatedSelfAge,
      gender: user.gender || user.Gender || 'Male',
      address: user.address || user.Address || 'Chennai, Tamil Nadu',
      location: user.location || user.Location || 'Not set'
    };

    let famList = [];
    try {
      let rawFam = localStorage.getItem(`selfcare_family_${primaryMobile}`) || 
                   localStorage.getItem('selfcare_family_members') || 
                   localStorage.getItem('family_members');
      if (rawFam) famList = JSON.parse(rawFam);
    } catch (e) {}

    this.familyMembers = [
      selfPatient,
      ...famList.map(m => {
        const mAgeRaw = m.age || m.Age || m.dob || m.DOB || m.dateOfBirth || m.DateOfBirth || m.birthDate || '';
        return {
          id: m.id || m.MemberID || `FAM_${Date.now()}_${Math.random()}`,
          name: m.name || m.Name || 'Member',
          relation: m.relation || m.Relation || 'Family',
          mobile: m.mobile || m.Mobile || '',
          email: m.email || m.Email || '',
          age: this.calculateAge(mAgeRaw),
          gender: m.gender || m.Gender || '',
          address: m.address || m.Address || '',
          location: m.location || m.Location || ''
        };
      })
    ];

    if (this.isAddonMode && this.addonBooking) {
      const b = this.addonBooking;
      this.selectedPatientIds = [b.patientId || 'SELF'];
      this.selectedPatientName = b.patientName || selfPatient.name;
      this.selectedPatientPhone = b.patientPhone || b.mobile || primaryMobile || selfPatient.mobile || '7010174890';
      this.selectedPatientEmail = b.patientEmail || '';
      this.selectedPatientRelation = b.relation || 'Self';
      this.selectedPatientId = b.patientId || 'SELF';
      this.selectedPatientAge = this.calculateAge(b.patientAge || b.age || calculatedSelfAge);
      this.selectedPatientGender = b.patientGender || b.gender || selfPatient.gender;
      this.currentPickupAddress = b.address || selfPatient.address;
      this.currentPickupLocation = b.location?.link || b.location || 'Not set';
      this.collectionType = b.collectionType || 'home';
      this.selectedTimeSlot = b.timeSlot || '';
    } else {
      this.syncPrimaryPatientDetails();
      this.currentPickupAddress = user.address || user.Address || 'Chennai, Tamil Nadu';
      this.currentPickupLocation = user.location || user.Location || 'Not set';
    }

    this.renderSelectedPatientCard();
  },

  checkAutoAppliedCoupon() {
    const savedCoupon = localStorage.getItem('selfcare_applied_coupon');
    if (savedCoupon && savedCoupon.trim()) {
      const clean = savedCoupon.trim().toUpperCase();
      if (this.isProgressiveReferralCoupon(clean) && !this.isOnlySelfSelected()) {
        localStorage.removeItem('selfcare_applied_coupon');
        this.appliedCoupon = null;
        return;
      }
      this.appliedCoupon = clean;
    }
  },

  populateTimeSlotsDropdown() {
    const select = document.getElementById('cart-slot-select');
    if (!select) return;

    if (this.isAddonMode && this.addonBooking) {
      select.innerHTML = `<option value="${this.addonBooking.timeSlot || 'Original Slot'}" selected>✅ Locked with Booking (${this.addonBooking.collectionDate || 'Scheduled'} • ${this.addonBooking.timeSlot || ''})</option>`;
      select.disabled = true;
      this.selectedTimeSlot = this.addonBooking.timeSlot;
      return;
    }

    select.disabled = false;
    select.innerHTML = '';
    const now = new Date();
    const isToday = this.selectedSlotDay === 'Today';
    const bufferTime = new Date(now.getTime() + 60 * 60 * 1000);

    let bookedSlots = [];
    try {
      const storedBookings = localStorage.getItem('selfcare_booked_slots');
      bookedSlots = storedBookings ? JSON.parse(storedBookings) : [];
    } catch (e) {
      bookedSlots = [];
    }

    const targetDate = new Date();
    if (!isToday) targetDate.setDate(targetDate.getDate() + 1);
    const dateKey = targetDate.toISOString().split('T')[0];

    let firstSelectableSlot = '';

    for (let h = 6; h < 20; h++) {
      for (let m = 0; m < 60; m += 30) {
        const startHour = h;
        const startMin = m;
        let endHour = h;
        let endMin = m + 30;
        if (endMin >= 60) { endHour++; endMin = 0; }

        const formatTime = (hour, min) => {
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const displayH = hour % 12 === 0 ? 12 : hour % 12;
          const displayM = min === 0 ? '00' : String(min).padStart(2, '0');
          return `${String(displayH).padStart(2, '0')}:${displayM} ${ampm}`;
        };

        const slotLabel = `${formatTime(startHour, startMin)} - ${formatTime(endHour, endMin)}`;
        const slotDateKey = `${dateKey}_${slotLabel}`;

        let isPassed = false;
        if (isToday) {
          const slotStartTime = new Date();
          slotStartTime.setHours(startHour, startMin, 0, 0);
          if (slotStartTime < bufferTime) isPassed = true;
        }

        const isBooked = bookedSlots.includes(slotDateKey);
        const opt = document.createElement('option');
        opt.value = slotLabel;

        if (isBooked) {
          opt.textContent = `❌ ${slotLabel} [Already Booked]`;
          opt.disabled = true;
        } else if (isPassed) {
          opt.textContent = `⏳ ${slotLabel} (Passed)`;
          opt.disabled = true;
        } else {
          opt.textContent = `✅ ${slotLabel}`;
          if (!firstSelectableSlot) firstSelectableSlot = slotLabel;
        }

        select.appendChild(opt);
      }
    }

    if (firstSelectableSlot) {
      select.value = firstSelectableSlot;
      this.selectedTimeSlot = firstSelectableSlot;
    } else {
      this.selectedTimeSlot = '';
      const noOpt = document.createElement('option');
      noOpt.textContent = 'No slots available for Today. Please choose Tomorrow.';
      noOpt.disabled = true;
      noOpt.selected = true;
      select.appendChild(noOpt);
    }
  },

  selectSlotDay(day, persist = true) {
    if (this.isAddonMode) {
      this.safeShowToast('Schedule day is locked to existing booking appointment', 'info');
      return;
    }

    this.selectedSlotDay = day;
    if (persist) {
      sessionStorage.setItem('selfcare_cart_slot_day', day);
    }

    const todayBtn = document.getElementById('slot-day-today');
    const tomorrowBtn = document.getElementById('slot-day-tomorrow');
    if (todayBtn) todayBtn.classList.toggle('active', day === 'Today');
    if (tomorrowBtn) tomorrowBtn.classList.toggle('active', day === 'Tomorrow');
    this.populateTimeSlotsDropdown();
  },

  handleSlotSelect(val) {
    this.selectedTimeSlot = val;
    if (!this.isAddonMode) {
      sessionStorage.setItem('selfcare_cart_time_slot', val);
    }
  },

  updateCouponBannerUI() {
    const banner = document.getElementById('applied-coupon-banner');
    const inputBox = document.getElementById('coupon-input-box');
    const codeText = document.getElementById('applied-coupon-code-text');
    const descText = document.getElementById('applied-coupon-desc-text');

    if (this.appliedCoupon) {
      if (banner) banner.style.display = 'flex';
      if (inputBox) inputBox.style.display = 'none';
      if (codeText) codeText.textContent = this.appliedCoupon;

      if (descText) {
        if (this.isProgressiveReferralCoupon(this.appliedCoupon)) {
          const pct = this.getProgressiveCouponPercent(this.appliedCoupon);
          descText.textContent = `${pct}% Referral Reward Applied (Self Only)`;
        } else if (this.isFriendReferralCode(this.appliedCoupon)) {
          descText.textContent = `10% Friend Referral Applied (Min. ₹500 Verified)`;
        } else {
          descText.textContent = `Discount Applied Successfully`;
        }
      }
    } else {
      if (banner) banner.style.display = 'none';
      if (inputBox) inputBox.style.display = 'flex';
    }
  },

  renderCartUI() {
    const emptySec = document.getElementById('empty-cart-section');
    const activeSec = document.getElementById('active-cart-section');
    const clearBtn = document.getElementById('clear-cart-btn');

    if (!this.cart || this.cart.length === 0) {
      if (emptySec) emptySec.style.display = 'flex';
      if (activeSec) activeSec.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'none';
      this.clearPersistedWizardState();
      return;
    }

    if (emptySec) emptySec.style.display = 'none';
    if (activeSec) activeSec.style.display = 'block';
    if (clearBtn) clearBtn.style.display = 'block';

    this.renderAddonBannerHeader();
    this.renderPatientChips();
    this.renderItemsList();
    this.calculateBillSummary();
  },

  renderAddonBannerHeader() {
    const banner = document.getElementById('addon-booking-banner');
    if (!banner) return;

    if (this.isAddonMode && this.addonBooking) {
      banner.style.display = 'flex';
      banner.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:#ECFDF5; border:1.5px solid #078866; border-radius:12px; padding:10px 14px; margin-bottom:12px;';
      banner.innerHTML = `
        <div>
          <span style="font-size:12px; font-weight:800; color:#045D49; display:block;">
            ➕ Adding Tests to Booking: <strong>${this.addonBooking.bookingId}</strong>
          </span>
          <span style="font-size:10px; color:#078866; font-weight:700;">
            Patient: ${this.selectedPatientName} • Visit Charge: ₹0 FREE
          </span>
        </div>
        <button type="button" onclick="CartPage.exitAddonMode()" style="background:#ffffff; border:1px solid #DC2626; color:#DC2626; font-size:10px; font-weight:800; padding:4px 8px; border-radius:6px; cursor:pointer;">
          Exit ✕
        </button>
      `;
    } else {
      banner.style.display = 'none';
    }
  },

  /* ==========================================================
     DIRECT CHECKOUT (HANDLES CASH, CASHFREE & ₹0 100% FREE)
     ========================================================== */
  async handleProceedToCheckout() {
    if (this.isProcessingCheckout) return;

    if (!navigator.onLine) {
      this.safeShowToast('Internet connection required to proceed with booking.', 'error');
      return;
    }

    if (!this.cart || this.cart.length === 0) {
      this.safeShowToast('Your cart is empty', 'error');
      this.goToSlide(1);
      return;
    }

    const newTestsCount = this.cart.filter(i => !i.isExistingBookingItem).length;
    if (this.isAddonMode && newTestsCount === 0) {
      this.safeShowToast('Please add new tests or packages to this booking first', 'info');
      window.location.href = 'tests.html';
      return;
    }

    if (!this.selectedPatientIds || this.selectedPatientIds.length === 0) {
      this.safeShowToast('Please select at least one family member', 'error');
      this.goToSlide(1);
      return;
    }

    if (!this.selectedPatientPhone || this.selectedPatientPhone.length !== 10) {
      this.selectedPatientPhone = this.getPrimaryUserMobile() || '7010174890';
    }

    if (this.collectionType === 'home' && (!this.currentPickupAddress || this.currentPickupAddress.trim() === '')) {
      this.safeShowToast('Please provide a valid doorstep pickup address', 'error');
      if (!this.isAddonMode) this.goToSlide(2);
      return;
    }

    if (!this.selectedTimeSlot) {
      this.safeShowToast('Please select a 30-minute collection time slot', 'error');
      if (!this.isAddonMode) this.goToSlide(2);
      return;
    }

    if (!this.collectionType) {
      this.safeShowToast('Please select Home Pickup or Lab Walk-in', 'error');
      this.goToSlide(4);
      return;
    }

    this.calculateBillSummary();

    this.isProcessingCheckout = true;

    const confirmBtn = document.getElementById('floating-action-btn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = this.selectedPaymentMode === 'online' ? 'Initializing Payment...' : 'Confirming Booking...';
    }

    const newItems = this.cart.filter(i => !i.isExistingBookingItem);
    let subtotalNew = 0;
    newItems.forEach(item => {
      subtotalNew += Number(item.price || item.OfferPrice || 0);
    });

    const couponDiscount = this.couponDiscountAmount;
    const doorstepCharge = this.isAddonMode ? 0 : this.doorstepCharge;
    const finalPayable = Math.max(0, subtotalNew - couponDiscount + doorstepCharge);

    const targetDate = new Date();
    if (this.selectedSlotDay === 'Tomorrow') targetDate.setDate(targetDate.getDate() + 1);
    const collectionDateStr = this.isAddonMode && this.addonBooking ? this.addonBooking.collectionDate : targetDate.toISOString().split('T')[0];

    const finalAddress = this.collectionType === 'lab' ? 'Direct Lab Visit (Selfcare Diagnostics, Chennai)' : this.currentPickupAddress;
    const finalLocation = this.collectionType === 'lab' ? 'Lab Center' : this.currentPickupLocation;

    const selectedMembers = this.familyMembers.filter(m => this.selectedPatientIds.includes(m.id));
    const isMulti = selectedMembers.length > 1;
    const baseBookingId = this.isAddonMode 
      ? this.addonBookingId 
      : `SCDBOOK${Math.floor(100000 + Math.random() * 900000)}`;

    const defaultPatientId = (selectedMembers[0] && selectedMembers[0].id) || 'SELF';

    const cleanApplied = (this.appliedCoupon || '').trim().toUpperCase();
    const isFriendRef = this.isFriendReferralCode(cleanApplied);
    const isSelfRewardRedeem = this.isProgressiveReferralCoupon(cleanApplied);
    const referralCodeUsed = isFriendRef ? cleanApplied : '';
    const referrerUserId = isFriendRef ? cleanApplied : '';
    const isReferralEligible = Boolean(isFriendRef && subtotalNew >= 500);
    const redeemedReferralPercent = isSelfRewardRedeem ? this.getProgressiveCouponPercent(cleanApplied) : 0;

    const patientBookingsData = [];

    selectedMembers.forEach((member, idx) => {
      const memberItems = newItems.filter(item => (item.patientId || defaultPatientId) === member.id);
      if (memberItems.length === 0 && !this.isAddonMode) return;

      const mSubtotal = memberItems.reduce((sum, it) => sum + Number(it.price || it.OfferPrice || 0), 0);
      const mDiscount = subtotalNew > 0 ? Math.round((mSubtotal / subtotalNew) * couponDiscount) : 0;
      const mDoorstep = (idx === 0) ? doorstepCharge : 0;
      const mFinal = Math.max(0, mSubtotal - mDiscount + mDoorstep);
      const mBookingId = (isMulti && !this.isAddonMode) ? `${baseBookingId}-${idx + 1}` : baseBookingId;

      patientBookingsData.push({
        bookingId: mBookingId,
        baseBookingId: baseBookingId,
        patientId: member.id,
        patientName: member.name,
        patientAge: member.age || '',
        patientGender: member.gender || '',
        patientPhone: member.mobile || this.selectedPatientPhone,
        patientEmail: member.email || this.selectedPatientEmail || '',
        relation: member.relation || (idx === 0 ? 'Self' : 'Member'),
        items: memberItems.map(i => ({
          id: i.id || i.TestID || i.PackageID || '',
          name: i.name || i.TestName || i.PackageName || '',
          code: i.code || i.TestCode || i.PackageCode || '',
          price: Number(i.price || i.OfferPrice || 0),
          patientId: member.id,
          patientName: member.name,
          relation: member.relation || 'Member'
        })),
        collectionType: this.collectionType,
        address: finalAddress,
        location: { link: finalLocation },
        collectionDate: collectionDateStr,
        timeSlot: this.selectedTimeSlot,
        subtotal: mSubtotal,
        couponDiscount: mDiscount,
        onlineDiscount: 0,
        doorstepCharge: mDoorstep,
        finalAmount: mFinal,
        couponCode: cleanApplied,
        referralCodeUsed: referralCodeUsed,
        referrerUserId: referrerUserId,
        isReferralEligible: isReferralEligible,
        redeemedReferralReward: isSelfRewardRedeem,
        redeemedReferralPercent: redeemedReferralPercent
      });
    });

    if (patientBookingsData.length === 0) {
      patientBookingsData.push({
        bookingId: baseBookingId,
        baseBookingId: baseBookingId,
        patientId: this.selectedPatientId,
        patientName: this.selectedPatientName,
        patientAge: this.selectedPatientAge || '',
        patientGender: this.selectedPatientGender || '',
        patientPhone: this.selectedPatientPhone,
        patientEmail: this.selectedPatientEmail || '',
        relation: this.selectedPatientRelation || 'Self',
        items: newItems.map(i => ({
          id: i.id || i.TestID || i.PackageID || '',
          name: i.name || i.TestName || i.PackageName || '',
          code: i.code || i.TestCode || i.PackageCode || '',
          price: Number(i.price || i.OfferPrice || 0),
          patientId: this.selectedPatientId,
          patientName: this.selectedPatientName,
          relation: this.selectedPatientRelation || 'Self'
        })),
        collectionType: this.collectionType,
        address: finalAddress,
        location: { link: finalLocation },
        collectionDate: collectionDateStr,
        timeSlot: this.selectedTimeSlot,
        subtotal: subtotalNew,
        couponDiscount: couponDiscount,
        onlineDiscount: 0,
        doorstepCharge: doorstepCharge,
        finalAmount: finalPayable,
        couponCode: cleanApplied,
        referralCodeUsed: referralCodeUsed,
        referrerUserId: referrerUserId,
        isReferralEligible: isReferralEligible,
        redeemedReferralReward: isSelfRewardRedeem,
        redeemedReferralPercent: redeemedReferralPercent
      });
    }

    if (this.selectedPaymentMode === 'cash' || finalPayable === 0) {
      try {
        const isFreeRewardOrder = finalPayable === 0 && isSelfRewardRedeem;

        for (const pData of patientBookingsData) {
          const payload = {
            ...pData,
            isAddon: this.isAddonMode,
            addonBookingId: this.addonBookingId,
            targetBookingId: this.addonBookingId,
            paymentMode: isFreeRewardOrder ? 'REFERRAL_100_FREE' : 'CASH',
            paymentStatus: isFreeRewardOrder ? 'PAYMENT_SUCCESS' : 'PENDING_COLLECTION',
            bookingStatus: 'CONFIRMED'
          };

          let resBookingId = pData.bookingId;
          if (typeof Api !== 'undefined' && Api.createBooking) {
            const cashRes = await Api.createBooking(payload).catch(err => {
              console.warn('Cloud write deferred:', err);
              return null;
            });
            if (cashRes && cashRes.bookingId) {
              resBookingId = cashRes.bookingId;
              pData.bookingId = resBookingId;
            }
          }

          this.persistConfirmedBookingLocally({
            ...payload,
            bookingId: resBookingId,
            currentStage: 1,
            items: pData.items
          });
        }

        if (isSelfRewardRedeem) {
          this.resetReferralCycleAfterRedemption();
        }

        this.saveBookedSlot(collectionDateStr, this.selectedTimeSlot);
        this.safeShowToast(
          isFreeRewardOrder ? '100% Free Referral Checkup Booked! Counter reset to 0/10.' : 'Booking confirmed successfully!',
          'success'
        );
        this.finalizeConfirmedMultiBooking(patientBookingsData);
      } catch (err) {
        console.error('Booking creation failed:', err);
        this.safeShowToast(err.message || 'Failed to confirm booking. Please try again.', 'error');
      } finally {
        this.resetCheckoutButtonState();
      }
      return;
    }

    try {
      if (typeof Api === 'undefined' || typeof Api.createCashfreeOrder !== 'function') {
        throw new Error('Cashfree payment service (Api.createCashfreeOrder) is not available.');
      }

      const cleanCanonicalReturnBase = 'https://selfcarediagnostics.in/cart.html';

      const orderPayload = {
        bookingId: baseBookingId,
        baseBookingId: baseBookingId,
        isAddon: this.isAddonMode,
        isAddonMode: this.isAddonMode,
        addonBookingId: this.addonBookingId || '',
        targetBookingId: this.addonBookingId || '',
        patientId: this.selectedPatientId,
        patientName: selectedMembers.map(m => m.name).join(' & ') || this.selectedPatientName,
        patientPhone: this.selectedPatientPhone,
        patientEmail: this.selectedPatientEmail || '',
        relation: this.selectedPatientRelation || 'Self',
        items: newItems,
        patientBookingsData: patientBookingsData,
        collectionType: this.collectionType,
        address: finalAddress,
        location: { link: finalLocation },
        collectionDate: collectionDateStr,
        timeSlot: this.selectedTimeSlot,
        subtotal: subtotalNew,
        couponDiscount: couponDiscount,
        onlineDiscount: 0,
        doorstepCharge: doorstepCharge,
        finalAmount: finalPayable,
        couponCode: cleanApplied,
        referralCodeUsed: referralCodeUsed,
        referrerUserId: referrerUserId,
        isReferralEligible: isReferralEligible,
        redeemedReferralReward: isSelfRewardRedeem,
        redeemedReferralPercent: redeemedReferralPercent,
        returnUrl: cleanCanonicalReturnBase
      };

      const cfOrderRes = await Api.createCashfreeOrder(orderPayload);

      if (!cfOrderRes || !cfOrderRes.paymentSessionId || !cfOrderRes.cashfreeOrderId) {
        throw new Error('Unable to initialize Cashfree payment session with server.');
      }

      const verifiedPatientBookings = (Array.isArray(cfOrderRes.patientBookingsData) && cfOrderRes.patientBookingsData.length > 0)
        ? cfOrderRes.patientBookingsData
        : patientBookingsData;

      this.currentPendingBooking = {
        bookingId: cfOrderRes.bookingId || baseBookingId,
        bookingIds: cfOrderRes.bookingIds || verifiedPatientBookings.map(b => b.bookingId),
        cashfreeOrderId: cfOrderRes.cashfreeOrderId,
        paymentReference: cfOrderRes.cashfreeOrderId,
        paymentSessionId: cfOrderRes.paymentSessionId,
        sdkMode: cfOrderRes.sdkMode || 'production',
        finalAmount: Number(cfOrderRes.finalAmount || finalPayable),
        patientBookingsData: verifiedPatientBookings,
        collectionDate: collectionDateStr,
        timeSlot: this.selectedTimeSlot,
        selectedSlotDay: this.selectedSlotDay,
        collectionType: this.collectionType,
        address: finalAddress,
        location: finalLocation,
        doorstepCharge: Number(cfOrderRes.doorstepCharge !== undefined ? cfOrderRes.doorstepCharge : doorstepCharge),
        appliedCoupon: cleanApplied,
        redeemedReferralReward: isSelfRewardRedeem,
        isAddon: this.isAddonMode,
        addonBookingId: this.addonBookingId,
        newItems: newItems,
        selectedMembers: selectedMembers
      };

      const serializedPending = JSON.stringify(this.currentPendingBooking);
      sessionStorage.setItem('selfcare_active_cf_txn', serializedPending);

      if (confirmBtn) {
        confirmBtn.textContent = 'Opening Cashfree Checkout...';
      }

      this.intentLaunchTime = Date.now();

      const checkoutResult = await Api.openCashfreeCheckout(cfOrderRes.paymentSessionId, {
        sdkMode: cfOrderRes.sdkMode || 'production',
        redirectTarget: '_modal'
      });

      if (checkoutResult && checkoutResult.error) {
        console.warn('Cashfree checkout notice:', checkoutResult.error);
      }

      await this.verifyAndFinalizeCashfreePayment(
        this.currentPendingBooking.cashfreeOrderId,
        this.currentPendingBooking.bookingId
      );

    } catch (err) {
      console.error('Cashfree checkout error:', err);
      this.safeShowToast(err.message || 'Error initializing online payment. Please try again.', 'error');
      this.resetCheckoutButtonState();
    }
  },

  async handleCashfreeReturnRedirect(cfOrderIdFromUrl) {
    if (!cfOrderIdFromUrl) return;

    try {
      const saved = sessionStorage.getItem('selfcare_active_cf_txn');
      if (saved) {
        this.currentPendingBooking = JSON.parse(saved);
      }
    } catch (e) {}

    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('cf_order_id');
      cleanUrl.searchParams.delete('order_id');
      cleanUrl.searchParams.delete('cashfreeOrderId');
      window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search);
    }

    const bookingId = this.currentPendingBooking ? this.currentPendingBooking.bookingId : '';
    await this.verifyAndFinalizeCashfreePayment(cfOrderIdFromUrl, bookingId);
  },

  async verifyAndFinalizeCashfreePayment(cashfreeOrderId, bookingId = '') {
    if (this.isVerifyingPayment) return;
    this.isVerifyingPayment = true;

    const confirmBtn = document.getElementById('floating-action-btn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Verifying Payment...';
    }

    try {
      const targetOrderId = cashfreeOrderId || (this.currentPendingBooking && this.currentPendingBooking.cashfreeOrderId);
      const targetBookingId = bookingId || (this.currentPendingBooking && this.currentPendingBooking.bookingId) || '';

      if (!targetOrderId) {
        throw new Error('Missing Cashfree Order ID for payment verification.');
      }

      this.safeShowToast('Verifying payment status...', 'info');

      const verifyRes = await Api.verifyCashfreePayment({
        cashfreeOrderId: targetOrderId,
        paymentReference: targetOrderId,
        bookingId: targetBookingId
      });

      if (
        verifyRes &&
        verifyRes.verified === true &&
        verifyRes.paymentStatus === 'PAYMENT_SUCCESS' &&
        verifyRes.bookingStatus === 'CONFIRMED'
      ) {
        const pending = this.currentPendingBooking || {};
        const pList = (Array.isArray(verifyRes.patientBookingsData) && verifyRes.patientBookingsData.length > 0)
          ? verifyRes.patientBookingsData
          : (pending.patientBookingsData || []);

        for (const pData of pList) {
          this.persistConfirmedBookingLocally({
            ...pData,
            paymentMode: 'ONLINE_CASHFREE',
            paymentStatus: 'PAYMENT_SUCCESS',
            bookingStatus: 'CONFIRMED',
            paymentReference: targetOrderId,
            transactionId: verifyRes.transactionId || '',
            currentStage: 1,
            items: pData.items || []
          });
        }

        if (pending.redeemedReferralReward || this.isProgressiveReferralCoupon(this.appliedCoupon)) {
          this.resetReferralCycleAfterRedemption();
        }

        if (pending.collectionDate && pending.timeSlot) {
          this.saveBookedSlot(pending.collectionDate, pending.timeSlot);
        }

        this.safeShowToast('Payment verified! Redirecting to bookings...', 'success');
        this.finalizeConfirmedMultiBooking(pList);
        return;
      }

      const statusMsg = (verifyRes && verifyRes.message)
        ? verifyRes.message
        : 'Payment is still pending or not completed. You can retry or choose Cash on Collection.';

      this.safeShowToast(statusMsg, 'info');

    } catch (err) {
      console.error('Server-side payment verification error:', err);
      this.safeShowToast(err.message || 'Could not verify payment status right now.', 'error');
    } finally {
      this.isVerifyingPayment = false;
      this.resetCheckoutButtonState();
    }
  },

  setupUPIAppReturnListeners() {
    const handleAppFocusOrVisibility = () => {
      if (!this.currentPendingBooking) {
        const saved = sessionStorage.getItem('selfcare_active_cf_txn');
        if (saved) {
          try { this.currentPendingBooking = JSON.parse(saved); } catch (e) {}
        }
      }

      if (!this.currentPendingBooking) return;

      const timeElapsed = Date.now() - this.intentLaunchTime;
      if (timeElapsed > 3000 && !this.isVerifyingPayment) {
        this.verifyAndFinalizeCashfreePayment(
          this.currentPendingBooking.cashfreeOrderId,
          this.currentPendingBooking.bookingId
        );
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleAppFocusOrVisibility();
    });

    window.addEventListener('focus', handleAppFocusOrVisibility);
  },

  finalizeConfirmedMultiBooking(patientBookingsData) {
    this.clearPersistedWizardState();
    this.cart = [];
    this.saveCartState();
    this.renderCartUI();
    this.updateCartBadgeUI();

    const targetBookingId = (patientBookingsData && patientBookingsData[0] && patientBookingsData[0].bookingId)
      ? patientBookingsData[0].bookingId
      : '';

    setTimeout(() => {
      if (targetBookingId) {
        window.location.href = `bookings.html?id=${encodeURIComponent(targetBookingId)}`;
      } else {
        window.location.href = 'bookings.html';
      }
    }, 800);
  },

  resetCheckoutButtonState() {
    this.isProcessingCheckout = false;
    this.updateBottomControlBarUI();
  },

  saveBookedSlot(dateStr, slotLabel) {
    try {
      const stored = localStorage.getItem('selfcare_booked_slots');
      const booked = stored ? JSON.parse(stored) : [];
      const key = `${dateStr}_${slotLabel}`;
      if (!booked.includes(key)) {
        booked.push(key);
        localStorage.setItem('selfcare_booked_slots', JSON.stringify(booked));
      }
    } catch (e) {}
  },

  removeItem(index) {
    if (index >= 0 && index < this.cart.length) {
      const item = this.cart[index];
      if (item.isExistingBookingItem) {
        this.safeShowToast('Already booked tests cannot be removed from this visit', 'info');
        return;
      }

      const removed = this.cart.splice(index, 1);
      this.saveCartState();
      this.renderCartUI();
      this.updateCartBadgeUI();
      if (removed && removed[0]) {
        this.safeShowToast(`${removed[0].name || 'Item'} removed`, 'info');
      }
    }
  },

  exitAddonMode() {
    this.clearPersistedWizardState();
    this.isAddonMode = false;
    this.addonBookingId = null;
    this.addonBooking = null;
    this.existingBookingItems = [];
    localStorage.removeItem('selfcare_active_addon_booking_id');
    localStorage.removeItem('selfcare_active_addon_booking_data');
    sessionStorage.removeItem('selfcare_addon_booking');

    this.cart = this.cart.filter(i => !i.isExistingBookingItem);
    this.saveCartState();

    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    window.location.reload();
  },

  clearAllCartItems() {
    if (this.isAddonMode) {
      if (confirm('Remove all newly added tests and exit Add-on Mode?')) {
        this.exitAddonMode();
      }
      return;
    }

    if (confirm('Clear all items from your cart?')) {
      this.clearPersistedWizardState();
      this.cart = [];
      this.saveCartState();
      this.renderCartUI();
      this.updateCartBadgeUI();
    }
  },

  saveCartState() {
    try {
      const cartStr = JSON.stringify(this.cart);
      localStorage.setItem('cart', cartStr);
      localStorage.setItem('selfcare_cart', cartStr);

      const activeUser = localStorage.getItem('selfcare_active_user');
      if (activeUser) {
        localStorage.setItem(`selfcare_cart_${activeUser}`, cartStr);
      }

      if (typeof App !== 'undefined') {
        App.cart = this.cart;
        if (typeof App.updateCartBadge === 'function') App.updateCartBadge();
      }

      if (typeof OfflineDB !== 'undefined' && typeof OfflineDB.saveCart === 'function') {
        OfflineDB.saveCart(this.cart).catch(() => {});
      }
    } catch (e) {
      console.warn('Error saving cart state:', e);
    }
  },

  persistConfirmedBookingLocally(bookingRecord) {
    try {
      const stored = localStorage.getItem('selfcare_recent_bookings');
      let list = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(list)) list = [];

      list = list.filter(b => b.bookingId !== bookingRecord.bookingId);
      list.unshift(bookingRecord);
      localStorage.setItem('selfcare_recent_bookings', JSON.stringify(list));
    } catch (e) {}
  },

  /* ==========================================================
     COUPONS & PROGRESSIVE REFERRAL MODAL (HIDDEN FOR FAMILY)
     ========================================================== */

  openAvailableCouponsModal() {
    const container = document.getElementById('available-coupons-list');
    if (!container) return;

    const todayStr = new Date().toISOString().split('T')[0];
    let allCoupons = [...this.adminCoupons];

    const completedReferrals = this.getCompletedReferralsCount();
    if (this.isOnlySelfSelected() && completedReferrals > 0) {
      const discountPercent = completedReferrals * 10;
      const refCode = `REF${discountPercent}FREE`;
      allCoupons.unshift({
        code: refCode,
        title: `Referral Bonus: ${discountPercent}% OFF (Self Only)`,
        discountPercent: discountPercent,
        validUntil: '2026-12-31',
        description: discountPercent === 100
          ? '🎉 100% FREE Checkup unlocked via 10 referrals! Valid strictly for Primary Account Holder (Self).'
          : `Unlocked via ${completedReferrals} completed referral booking(s). Valid strictly for Primary Account Holder (Self).`
      });
    }

    container.innerHTML = allCoupons.map(c => {
      const isExpired = c.validUntil < todayStr;
      return `
        <div class="coupon-item-card ${isExpired ? 'expired' : ''}">
          <div class="coupon-meta">
            <h5>🏷️ ${Utils.escapeHtml(c.code)}</h5>
            <p>${Utils.escapeHtml(c.description)}</p>
            <div class="coupon-expiry">
              ${isExpired ? '❌ Expired' : `⏳ Valid till: ${c.validUntil}`}
            </div>
          </div>
          <button type="button" class="apply-modal-coupon-btn" 
            ${isExpired ? 'disabled' : ''} 
            onclick="CartPage.applyCouponCode('${Utils.escapeHtml(c.code)}')">
            ${isExpired ? 'Expired' : 'Apply'}
          </button>
        </div>
      `;
    }).join('');

    this.openModal('available-coupons-modal');
  },

  applyCouponCode(code) {
    if (!code) return;
    const cleanCode = String(code).trim().toUpperCase();
    const subtotalNew = this.getNewTestsSubtotal();

    if (this.isProgressiveReferralCoupon(cleanCode)) {
      if (!this.isOnlySelfSelected()) {
        this.safeShowToast('Referral reward is valid strictly for Primary Account Holder (Self) and cannot be applied to family members.', 'error');
        return;
      }

      const unlockedPercent = this.getCompletedReferralsCount() * 10;
      const requestedPercent = this.getProgressiveCouponPercent(cleanCode);

      if (unlockedPercent <= 0 || requestedPercent > unlockedPercent) {
        this.safeShowToast('You do not have enough completed referrals to apply this reward code.', 'error');
        return;
      }
    }

    if (this.isFriendReferralCode(cleanCode)) {
      if (cleanCode === this.getOwnReferralCode()) {
        this.safeShowToast('You cannot apply your own referral code.', 'error');
        return;
      }

      if (subtotalNew < 500) {
        this.safeShowToast('Minimum test order value of ₹500 is required to apply a referral code.', 'error');
        return;
      }
    }

    this.appliedCoupon = cleanCode;
    localStorage.setItem('selfcare_applied_coupon', cleanCode);
    this.calculateBillSummary();
    this.closeModal('available-coupons-modal');
    this.safeShowToast(`Code "${cleanCode}" applied successfully!`, 'success');
  },

  applyCouponManually() {
    const input = document.getElementById('coupon-code-input');
    const val = input ? input.value.trim() : '';

    if (!val) {
      this.safeShowToast('Please enter a coupon or referral code', 'error');
      return;
    }

    this.applyCouponCode(val);
    if (input) input.value = '';
  },

  removeCoupon() {
    this.appliedCoupon = null;
    this.couponDiscountAmount = 0;
    localStorage.removeItem('selfcare_applied_coupon');
    localStorage.removeItem('selfcare_coupon_discount_percent');
    localStorage.removeItem('selfcare_coupon_applicable_for');
    this.calculateBillSummary();
    this.safeShowToast('Coupon removed', 'info');
  },

  openEditAddressModal() {
    const phoneInput = document.getElementById('cart-edit-phone-input');
    const addressInput = document.getElementById('cart-edit-address-input');
    const locationInput = document.getElementById('cart-edit-location-input');

    if (phoneInput) phoneInput.value = this.selectedPatientPhone || '';
    if (addressInput) addressInput.value = this.currentPickupAddress || '';
    if (locationInput) locationInput.value = this.currentPickupLocation !== 'Not set' ? this.currentPickupLocation : '';

    this.openModal('edit-address-modal');
  },

  saveUpdatedAddressLocation() {
    const phoneInput = document.getElementById('cart-edit-phone-input');
    const addressInput = document.getElementById('cart-edit-address-input');
    const locationInput = document.getElementById('cart-edit-location-input');

    const phone = phoneInput ? phoneInput.value.trim() : '';
    const addr = addressInput ? addressInput.value.trim() : '';
    const loc = locationInput ? locationInput.value.trim() : '';

    if (!phone || phone.length !== 10 || !/^\d{10}$/.test(phone)) {
      this.safeShowToast('Please enter a valid 10-digit mobile number', 'error');
      return;
    }

    if (!addr) {
      this.safeShowToast('Please enter pickup address', 'error');
      return;
    }

    this.selectedPatientPhone = phone;
    this.currentPickupAddress = addr;
    this.currentPickupLocation = loc || 'Not set';

    const target = this.familyMembers.find(p => p.id === this.selectedPatientId);
    if (target) {
      target.mobile = phone;
      target.address = addr;
      target.location = loc || 'Not set';
    }

    this.renderSelectedPatientCard();

    const user = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};
    user.mobile = phone;
    user.address = this.currentPickupAddress;
    user.location = this.currentPickupLocation;
    if (typeof Auth !== 'undefined' && Auth.savePermanentSession) {
      Auth.savePermanentSession(user);
    }

    this.closeModal('edit-address-modal');
    this.safeShowToast('Mobile, Address & Location updated ✓', 'success');
  },

  detectGpsLocation(targetId) {
    if (!navigator.geolocation) {
      this.safeShowToast('GPS not supported on this browser', 'error');
      return;
    }
    this.safeShowToast('Detecting current GPS location...', 'info');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const url = `https://maps.google.com/?q=${lat},${lng}`;
        const input = document.getElementById(targetId);
        if (input) input.value = url;
        this.safeShowToast('GPS Location fetched successfully!', 'success');
      },
      () => {
        this.safeShowToast('Could not fetch GPS. Please turn on location.', 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  },

  openModal(id) {
    if (id === 'upi-confirm-modal' || id === 'modal-confirm-patient') return;
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  },

  updateCartBadgeUI() {
    const badges = document.querySelectorAll('.cart-badge');
    const count = this.cart.length;
    badges.forEach(b => {
      if (count > 0) {
        b.textContent = count;
        b.style.display = 'inline-block';
      } else {
        b.textContent = '0';
        b.style.display = 'none';
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  CartPage.init();
});

if (typeof window !== 'undefined') {
  window.CartPage = CartPage;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CartPage;
}
