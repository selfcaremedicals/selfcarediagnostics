/* file: assets/js/cart.js */
/**
 * Selfcare Diagnostics - Direct Booking Cart Engine v13.0.0
 * Features:
 * 1. Per-Person VIP Membership Engine: Calculates 10% discount strictly for VIP holders only.
 * 2. Non-VIP members pay standard price (No discount).
 * 3. Free Home Sample Collection for active VIP members.
 * 4. Dynamic Crown 👑 Badge rendered on Member names (Disappears automatically on expiry).
 * 5. Normalized Patient ID Engine: Case-insensitive 'self' & 'SELF' handling prevents silent checkout bypass.
 * 6. Guaranteed Addon Cart Loader: Always loads existing booked items alongside newly added tests.
 * 7. 2-Step Fast Addon Checkout: Addon mode automatically skips locked address/date slides straight to confirmation.
 * 8. Multi-Tenant Deep Persistence: Merges updated items locally & remotely to survive cloud syncs.
 */

const CartPage = {
  currentSlide: 1,
  totalSlides: 4,
  cart: [],
  familyMembers: [],

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

  selectedPaymentMode: 'online',
  collectionType: 'home',
  doorstepCharge: 0,

  currentPickupAddress: 'Chennai, Tamil Nadu',
  currentPickupLocation: 'Not set',

  isAddonMode: false,
  addonBookingId: null,
  addonBooking: null,
  existingBookingItems: [],

  isProcessingCheckout: false,

  formatMoney(amount) {
    const val = Number(amount) || 0;
    if (typeof Utils !== 'undefined' && typeof Utils.formatCurrency === 'function') {
      return Utils.formatCurrency(val);
    }
    return '₹' + Math.round(val).toLocaleString('en-IN');
  },

  safeEscape(str) {
    if (typeof Utils !== 'undefined' && typeof Utils.escapeHtml === 'function') {
      return Utils.escapeHtml(str);
    }
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  },

  getPrimaryUserMobile() {
    try {
      const user = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};
      return String(user.mobile || user.phone || localStorage.getItem('selfcare_active_user') || '7010174890')
        .replace(/\D/g, '')
        .slice(-10);
    } catch (e) {
      return '7010174890';
    }
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

    if (isNaN(birthDate.getTime())) return '';

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return (age >= 0 && age < 125) ? String(age) : '';
  },

  getNewTestsSubtotal() {
    return this.cart.reduce((sum, item) => {
      if (!item || item.isExistingBookingItem || item.isExistingLocked) return sum;
      return sum + Number(item.price || item.OfferPrice || 0);
    }, 0);
  },

  async init() {
    try {
      this.detectAddonBookingMode();
      this.loadCartData();
      this.loadPatientAndAddressData();
      this.restorePersistedWizardState();

      this.populateTimeSlotsDropdown();
      this.renderCartUI();
      this.updateCartBadgeUI();

      const urlParams = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : null;
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
    } catch (err) {
      console.error('CartPage init error:', err);
      const activeSec = document.getElementById('active-cart-section');
      const emptySec = document.getElementById('empty-cart-section');
      if (this.cart && this.cart.length > 0) {
        if (activeSec) activeSec.style.display = 'block';
        if (emptySec) emptySec.style.display = 'none';
      } else {
        if (emptySec) emptySec.style.display = 'flex';
        if (activeSec) activeSec.style.display = 'none';
      }
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
      this.selectCollectionType(savedCollection || 'home', false);

      const savedPatients = sessionStorage.getItem('selfcare_cart_patient_ids');
      if (savedPatients) {
        try {
          const parsed = JSON.parse(savedPatients);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.selectedPatientIds = parsed.map(id => String(id).toUpperCase());
          }
        } catch (e) {}
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
    } catch (e) {}
  },

  navigateToAddItems(patientId, type) {
    const targetId = patientId || 'SELF';
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
      }
      if (slideIndex > 2 && !this.isAddonMode) {
        if (!this.selectedPatientPhone || this.selectedPatientPhone.length !== 10) {
          this.selectedPatientPhone = this.getPrimaryUserMobile() || '7010174890';
        }
        if (!this.selectedTimeSlot) {
          this.safeShowToast('Please select a 30-minute collection time slot', 'error');
          return;
        }
      }
      if (slideIndex > 3 && !this.selectedPaymentMode) {
        this.safeShowToast('Please select a payment method to proceed', 'error');
        return;
      }
    }

    this.currentSlide = slideIndex;

    if (!this.isAddonMode && this.cart.length > 0) {
      sessionStorage.setItem('selfcare_cart_slide', String(slideIndex));
    }

    for (let i = 1; i <= this.totalSlides; i++) {
      const slideEl = document.getElementById(`cart-slide-${i}`);
      if (slideEl) slideEl.classList.toggle('active', i === slideIndex);
    }

    this.updateBottomControlBarUI();

    if (this.isAddonMode) {
      this.applyAddonLocksToUI();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  applyAddonLocksToUI() {
    if (!this.isAddonMode) return;

    document.querySelectorAll('.patient-chip').forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.85';
    });

    const homeCard = document.getElementById('card-mode-home');
    const labCard = document.getElementById('card-mode-lab');
    if (homeCard) { homeCard.style.pointerEvents = 'none'; homeCard.style.opacity = '0.85'; }
    if (labCard) { labCard.style.pointerEvents = 'none'; labCard.style.opacity = '0.85'; }

    const todayBtn = document.getElementById('slot-day-today');
    const tomorrowBtn = document.getElementById('slot-day-tomorrow');
    const slotSelect = document.getElementById('cart-slot-select');
    if (todayBtn) todayBtn.style.pointerEvents = 'none';
    if (tomorrowBtn) tomorrowBtn.style.pointerEvents = 'none';
    if (slotSelect) slotSelect.disabled = true;

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

    const newTestsCount = this.cart.filter(i => i && !i.isExistingBookingItem && !i.isExistingLocked).length;

    if (this.currentSlide === 1) {
      nextBtn.textContent = this.isAddonMode ? 'Confirm & Review Tests ➔' : 'Schedule & Address ➔';
      nextBtn.disabled = this.isAddonMode ? (newTestsCount === 0) : (this.cart.length === 0);
    } else if (this.currentSlide === 2) {
      nextBtn.textContent = 'Payment Method ➔';
      nextBtn.disabled = false;
    } else if (this.currentSlide === 3) {
      nextBtn.textContent = this.isAddonMode ? 'Review & Confirm ➔' : 'Select Collection ➔';
      nextBtn.disabled = false;
    } else if (this.currentSlide === 4) {
      nextBtn.textContent = this.isAddonMode 
        ? 'Confirm & Add to Visit ➔' 
        : (this.selectedPaymentMode === 'online' ? 'Pay Online & Confirm ➔' : 'Confirm Booking ➔');
      nextBtn.disabled = !this.collectionType;
    }
  },

  handleBarBack() {
    if (this.isAddonMode) {
      if (this.currentSlide === 1) {
        this.exitAddonMode();
        return;
      }
      if (this.currentSlide === 3) {
        this.goToSlide(1);
        return;
      }
    }

    if (this.currentSlide > 1) {
      this.goToSlide(this.currentSlide - 1);
    }
  },

  handleFloatingActionButton() {
    if (this.currentSlide === 1) {
      const newTestsCount = this.cart.filter(i => i && !i.isExistingBookingItem && !i.isExistingLocked).length;
      if (this.isAddonMode) {
        if (newTestsCount === 0) {
          this.safeShowToast('Please add at least one new test to this booking visit', 'info');
          window.location.href = 'tests.html';
          return;
        }
        this.goToSlide(3);
        return;
      }

      if (!this.cart || this.cart.length === 0) {
        this.safeShowToast('Your cart is empty', 'error');
        return;
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
        this.safeShowToast('Please select a payment method', 'error');
        return;
      }
      this.goToSlide(4);
    } else if (this.currentSlide === 4) {
      if (!this.collectionType) {
        this.safeShowToast('Please select Home Pickup or Lab Walk-in', 'error');
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
    if (!this.cart || this.cart.length === 0) return 0;

    let total = subtotal !== null ? subtotal : this.getNewTestsSubtotal();
    if (total >= 500) return 0;

    const isPPBSTest = (item) => {
      if (!item) return false;
      const name = (item.name || item.TestName || '').toUpperCase();
      const code = (item.code || item.TestCode || '').toUpperCase();
      return name.includes('PPBS') || name.includes('POST PRANDIAL') || code === 'T0009' || code === 'SCDT0009';
    };

    const ppbsItems = this.cart.filter(i => i && !i.isExistingBookingItem && !i.isExistingLocked && isPPBSTest(i));
    const otherItems = this.cart.filter(i => i && !i.isExistingBookingItem && !i.isExistingLocked && !isPPBSTest(i));

    if (ppbsItems.length > 0 && otherItems.length > 0) return 150;
    return 100;
  },

  updateHomeCollectionBadge(subtotalNewTests, isVipFree = false) {
    const badge = document.getElementById('home-collection-badge-tag');
    if (!badge) return;

    if (isVipFree) {
      badge.textContent = 'Collection Charge: FREE (👑 VIP Pass Benefit)';
      badge.classList.add('free-tag');
      return;
    }

    if (this.isAddonMode) {
      badge.textContent = 'Doorstep Collection: FREE (Clubbed Visit)';
      badge.classList.add('free-tag');
      return;
    }

    if (subtotalNewTests >= 500) {
      badge.textContent = 'Collection Charge: FREE';
      badge.classList.add('free-tag');
    } else {
      const isPPBSTest = (item) => {
        if (!item) return false;
        const name = (item.name || item.TestName || '').toUpperCase();
        const code = (item.code || item.TestCode || '').toUpperCase();
        return name.includes('PPBS') || name.includes('POST PRANDIAL') || code === 'T0009' || code === 'SCDT0009';
      };
      const ppbsItems = this.cart.filter(i => i && !i.isExistingBookingItem && !i.isExistingLocked && isPPBSTest(i));
      const otherItems = this.cart.filter(i => i && !i.isExistingBookingItem && !i.isExistingLocked && !isPPBSTest(i));
      const charge = (ppbsItems.length > 0 && otherItems.length > 0) ? 150 : 100;

      badge.textContent = charge === 150 ? 'Doorstep Charge: ₹150 (Dual Visit for PPBS)' : 'Doorstep Charge: ₹100';
      badge.classList.remove('free-tag');
    }
  },

  /**
   * =========================================================================
   * PER-PERSON 10% VIP DISCOUNT & BILL CALCULATION ENGINE
   * =========================================================================
   */
  calculateBillSummary() {
    let totalGrossMrp = 0;
    let totalGrossPrice = 0;
    let totalVipDiscount = 0;
    let anyPatientHasVip = false;

    // Item-by-item calculation based on the individual patient's VIP status
    this.cart.forEach(item => {
      if (!item || item.isExistingBookingItem || item.isExistingLocked) return;

      const pId = item.patientId || 'SELF';
      const isItemVip = (typeof Utils !== 'undefined' && typeof Utils.isPatientVIP === 'function') 
        ? Utils.isPatientVIP(pId) 
        : false;

      if (isItemVip) anyPatientHasVip = true;

      const itemPrice = Number(item.price || item.OfferPrice || 0);
      const mrp = Number(item.mrp || item.MRP || itemPrice);

      totalGrossPrice += itemPrice;
      totalGrossMrp += mrp;

      // 10% Discount applies strictly if this specific patient is a VIP Member
      if (isItemVip) {
        const itemDiscount = Math.round(itemPrice * 0.10);
        totalVipDiscount += itemDiscount;
      }
    });

    const subtotalAfterVip = Math.max(0, totalGrossPrice - totalVipDiscount);

    // Free Home Collection if ANY patient in this booking has active VIP pass
    if (anyPatientHasVip || this.isAddonMode || this.collectionType === 'lab') {
      this.doorstepCharge = 0;
    } else {
      this.doorstepCharge = this.calculateDoorstepCharge(subtotalAfterVip);
    }

    this.updateHomeCollectionBadge(subtotalAfterVip, anyPatientHasVip);

    const finalPayable = Math.max(0, subtotalAfterVip + this.doorstepCharge);

    const stickyPayableEl = document.getElementById('sticky-payable-amount');
    if (stickyPayableEl) stickyPayableEl.textContent = this.formatMoney(finalPayable);

    const totalMrpEl = document.getElementById('bill-total-mrp');
    const subtotalPriceEl = document.getElementById('bill-subtotal-price');
    const labSavingsEl = document.getElementById('bill-lab-savings');
    const chargeLabel = document.getElementById('bill-collection-charge-label');
    const chargeVal = document.getElementById('bill-collection-charge-val');
    const finalPayableEl = document.getElementById('bill-final-payable');

    if (totalMrpEl) totalMrpEl.textContent = this.formatMoney(totalGrossMrp);
    if (subtotalPriceEl) subtotalPriceEl.textContent = this.formatMoney(totalGrossPrice);

    const standardSavings = Math.max(0, totalGrossMrp - totalGrossPrice);
    if (labSavingsEl) labSavingsEl.textContent = `- ${this.formatMoney(standardSavings)}`;

    // Render or update VIP Discount Row
    let vipRow = document.getElementById('bill-vip-discount-row');
    if (!vipRow && totalVipDiscount > 0) {
      vipRow = document.createElement('div');
      vipRow.id = 'bill-vip-discount-row';
      vipRow.className = 'bill-row';
      vipRow.style.cssText = 'display:flex; justify-content:space-between; color:#047857; font-weight:700; margin:6px 0; font-size:12.5px;';
      const subtotalRow = document.getElementById('bill-subtotal-price')?.parentElement;
      if (subtotalRow && subtotalRow.parentNode) {
        subtotalRow.parentNode.insertBefore(vipRow, subtotalRow.nextSibling);
      }
    }

    if (vipRow) {
      if (totalVipDiscount > 0) {
        vipRow.style.display = 'flex';
        vipRow.innerHTML = `<span>👑 VIP 10% Member Discount:</span><span style="color:#047857;">- ${this.formatMoney(totalVipDiscount)}</span>`;
      } else {
        vipRow.style.display = 'none';
      }
    }

    if (chargeVal) {
      if (anyPatientHasVip) {
        chargeVal.textContent = 'FREE (👑 VIP Benefit)';
        chargeVal.classList.add('green-val');
        if (chargeLabel) chargeLabel.textContent = 'Doorstep Sample Collection:';
      } else if (this.isAddonMode) {
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
          chargeVal.textContent = this.formatMoney(this.doorstepCharge);
          if (chargeLabel) {
            chargeLabel.textContent = this.doorstepCharge === 150 
              ? 'Doorstep Collection (₹150 - Dual visit for PPBS):' 
              : 'Doorstep Sample Collection:';
          }
        }
      }
    }

    if (finalPayableEl) finalPayableEl.textContent = this.formatMoney(finalPayable);
    this.updateBottomControlBarUI();
  },

  syncPrimaryPatientDetails() {
    if (!this.selectedPatientIds || this.selectedPatientIds.length === 0) {
      this.selectedPatientIds = ['SELF'];
    }

    const firstId = String(this.selectedPatientIds[0]).toUpperCase();
    const target = this.familyMembers.find(p => p && String(p.id).toUpperCase() === firstId) || this.familyMembers[0] || {};

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

    const normId = String(id).toUpperCase();
    const index = this.selectedPatientIds.map(x => String(x).toUpperCase()).indexOf(normId);

    if (index > -1) {
      if (this.selectedPatientIds.length === 1) {
        this.safeShowToast('At least one family member must be selected', 'info');
        return;
      }
      this.selectedPatientIds.splice(index, 1);
    } else {
      this.selectedPatientIds.push(normId);
    }

    sessionStorage.setItem('selfcare_cart_patient_ids', JSON.stringify(this.selectedPatientIds));
    this.syncPrimaryPatientDetails();
    this.renderPatientChips();
    this.renderSelectedPatientCard();

    const activeFirstId = this.selectedPatientIds[0];
    let cartModified = false;
    this.cart.forEach(item => {
      const pId = String(item.patientId || '').toUpperCase();
      if (item && pId && !this.selectedPatientIds.includes(pId)) {
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

  renderSelectedPatientCard() {
    const nameEl = document.getElementById('disp-patient-name');
    const relEl = document.getElementById('disp-patient-relation');
    const phoneEl = document.getElementById('disp-patient-phone');
    const addrEl = document.getElementById('cart-display-address');
    const locEl = document.getElementById('cart-display-location');
    const tagsContainer = document.getElementById('selected-patients-overview-tags');

    const selectedMembers = (Array.isArray(this.familyMembers) ? this.familyMembers : [])
      .filter(m => m && this.selectedPatientIds.some(id => String(id).toUpperCase() === String(m.id).toUpperCase()));

    const activeList = selectedMembers.length > 0 ? selectedMembers : [this.familyMembers[0] || {}];

    if (nameEl) {
      nameEl.textContent = activeList.length === 1 
        ? activeList[0].name 
        : `${activeList.length} Family Members Selected`;
    }

    if (relEl) {
      relEl.textContent = activeList.length === 1 
        ? (activeList[0].relation || 'Self') 
        : `${activeList.length} Members`;
    }

    if (phoneEl) {
      const primaryPhone = this.selectedPatientPhone || (activeList[0] && activeList[0].mobile) || this.getPrimaryUserMobile() || '';
      phoneEl.textContent = primaryPhone ? `+91 ${primaryPhone}` : 'Not set';
    }

    if (addrEl) addrEl.textContent = this.currentPickupAddress || 'Chennai, Tamil Nadu';
    if (locEl) locEl.textContent = this.currentPickupLocation || 'Not set';

    if (tagsContainer) {
      tagsContainer.style.display = 'flex';
      tagsContainer.innerHTML = activeList.map(m => {
        const formattedTag = (typeof Utils !== 'undefined' && typeof Utils.formatVIPName === 'function')
          ? Utils.formatVIPName(m.name, m.id)
          : this.safeEscape(m.name);

        return `
          <span class="patient-overview-tag">
            👤 ${formattedTag} (${this.safeEscape(m.relation || 'Member')})
          </span>
        `;
      }).join('');
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
      const formattedSelf = (typeof Utils !== 'undefined' && typeof Utils.formatVIPName === 'function')
        ? Utils.formatVIPName(this.selectedPatientName, this.selectedPatientId)
        : this.safeEscape(this.selectedPatientName);

      container.innerHTML = `
        <div class="patient-chip active" style="cursor: default;">
          <span class="chip-name">${formattedSelf}</span>
          <span class="chip-relation-tag">${this.safeEscape(this.selectedPatientRelation)} (Locked)</span>
        </div>
      `;
      return;
    }

    const members = Array.isArray(this.familyMembers) ? this.familyMembers : [];
    container.innerHTML = members.map(p => {
      if (!p) return '';
      const isSelected = this.selectedPatientIds.some(id => String(id).toUpperCase() === String(p.id).toUpperCase());
      const pName = (typeof Utils !== 'undefined' && typeof Utils.formatVIPName === 'function') 
        ? Utils.formatVIPName(p.name, p.id) 
        : this.safeEscape(p.name);

      return `
        <div class="patient-chip ${isSelected ? 'active' : ''}" onclick="CartPage.togglePatient('${p.id}')">
          <span class="chip-name">${pName}</span>
          <span class="chip-relation-tag">${this.safeEscape(p.relation || 'Member')}</span>
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
      if (!targetItem) return;

      if (targetItem.isExistingBookingItem || targetItem.isExistingLocked) {
        this.safeShowToast('Already booked tests cannot be reassigned', 'info');
        return;
      }

      const normTarget = String(targetPatientId).toUpperCase();
      this.cart[itemIndex].patientId = normTarget;
      this.saveCartState();
      this.renderItemsList();
      this.calculateBillSummary();
      const p = this.familyMembers.find(m => m && String(m.id).toUpperCase() === normTarget);
      if (p) this.safeShowToast(`Test assigned to ${p.name}`, 'info');
    }
  },

  renderItemsList() {
    const container = document.getElementById('cart-items-list');
    const countBadge = document.getElementById('cart-items-count-badge');
    if (!container) return;

    if (countBadge) countBadge.textContent = `${this.cart.length} Items`;

    const selectedMembers = (Array.isArray(this.familyMembers) ? this.familyMembers : [])
      .filter(m => m && this.selectedPatientIds.some(id => String(id).toUpperCase() === String(m.id).toUpperCase()));

    const effectiveMembers = (selectedMembers && selectedMembers.length > 0) 
      ? selectedMembers 
      : [this.familyMembers[0] || { id: 'SELF', name: 'Self', relation: 'Self' }];
    
    const fallbackPatientId = effectiveMembers[0].id || 'SELF';

    this.cart.forEach(item => {
      const pId = String(item.patientId || '').toUpperCase();
      if (item && (!pId || !this.selectedPatientIds.includes(pId))) {
        item.patientId = fallbackPatientId;
      }
    });

    let groupedHtml = '';

    effectiveMembers.forEach(member => {
      if (!member) return;
      const memId = String(member.id).toUpperCase();
      const isMemberVip = (typeof Utils !== 'undefined' && typeof Utils.isPatientVIP === 'function')
        ? Utils.isPatientVIP(member.id)
        : false;

      const memberItems = this.cart
        .map((item, idx) => ({ ...item, originalIndex: idx }))
        .filter(item => item && String(item.patientId || fallbackPatientId).toUpperCase() === memId);

      const itemsHtml = memberItems.length === 0 
        ? `
          <div class="patient-empty-tests-box">
            <p>No tests assigned for ${this.safeEscape(member.name)} yet.</p>
            <span>Use button below to add diagnostic tests</span>
          </div>
        `
        : memberItems.map(item => {
            const isPaidItem = Boolean(item.isExistingBookingItem || item.isExistingLocked);
            const isPackage = item.type === 'package' || String(item.PackageID || item.PackageCode || '').startsWith('PKG');
            const name = item.name || item.TestName || item.PackageName || 'Diagnostic Item';
            const originalOfferPrice = isPaidItem ? 0 : Number(item.price || item.OfferPrice || 0);
            const mrp = isPaidItem ? Number(item.originalPrice || 0) : Number(item.mrp || item.MRP || originalOfferPrice);

            // VIP Member-ஆக இருந்தால் மட்டுமே 10% தள்ளுபடி!
            const itemVipDiscount = (!isPaidItem && isMemberVip) ? Math.round(originalOfferPrice * 0.10) : 0;
            const finalItemPrice = originalOfferPrice - itemVipDiscount;

            const lockedBadgeHtml = isPaidItem 
              ? '<span class="paid-tag" style="background:#078866; color:#ffffff; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:800; letter-spacing:0.3px;">🔒 ALREADY BOOKED</span>'
              : '';

            const mrpStrikeHtml = (!isPaidItem && isMemberVip && itemVipDiscount > 0)
              ? `<span class="item-mrp-strike" style="text-decoration:line-through; color:#9CA3AF; margin-right:6px; font-size:11px;">${this.formatMoney(originalOfferPrice)}</span>`
              : ((!isPaidItem && mrp > originalOfferPrice) ? `<span class="item-mrp-strike">${this.formatMoney(mrp)}</span>` : '');

            const vipTagHtml = (!isPaidItem && isMemberVip)
              ? `<span style="font-size:9.5px; background:#FEF3C7; color:#92400E; padding:2px 6px; border-radius:4px; font-weight:800; border:1px solid #FCD34D;">10% VIP OFF</span>`
              : '';

            const cardStyle = isPaidItem 
              ? 'style="background: #f8fafc; border-left: 3.5px solid #078866;"' 
              : '';

            const lockedClass = isPaidItem ? 'existing-locked-item' : '';
            const itemCodeText = this.safeEscape(item.code || item.TestCode || item.PackageCode || '');
            const displayPriceText = isPaidItem ? '₹0' : this.formatMoney(finalItemPrice);

            let reassignSelectHtml = '';
            if (!isPaidItem && effectiveMembers.length > 1) {
              const options = effectiveMembers.map(m => {
                const isSelected = String(m.id).toUpperCase() === memId ? 'selected' : '';
                return '<option value="' + m.id + '" ' + isSelected + '>For: ' + this.safeEscape(m.name) + '</option>';
              }).join('');

              reassignSelectHtml = '<select class="patient-reassign-select" onchange="CartPage.assignItemPatient(' + item.originalIndex + ', this.value)">' + options + '</select>';
            }

            const actionBtnHtml = isPaidItem
              ? '<span class="item-paid-badge" style="color:#64748b; font-size:11px; font-weight:800; background:#f1f5f9; padding:4px 8px; border-radius:6px; border:1px solid #cbd5e1;">🔒 Cannot Remove</span>'
              : '<button type="button" class="item-delete-btn" onclick="CartPage.removeItem(' + item.originalIndex + ')" title="Remove item">🗑️</button>';

            return `
              <div class="cart-item-card glass-panel-3d-item ${lockedClass}" ${cardStyle}>
                <div class="item-main-details">
                  <div class="item-meta-row">
                    <span class="type-badge ${isPackage ? 'package-type' : 'test-type'}">
                      ${isPackage ? 'PACKAGE' : 'TEST'}
                    </span>
                    <span class="item-code-tag">${itemCodeText}</span>
                    ${vipTagHtml}
                    ${lockedBadgeHtml}
                  </div>
                  <h4 class="item-title">${this.safeEscape(name)}</h4>
                  <div class="item-price-row">
                    ${mrpStrikeHtml}
                    <span class="item-offer-price" style="${isMemberVip ? 'color:#078866; font-weight:900;' : ''}">${displayPriceText}</span>
                  </div>
                </div>

                <div class="item-actions-row">
                  ${reassignSelectHtml}
                  ${actionBtnHtml}
                </div>
              </div>
            `;
          }).join('');

      const addPkgButtonHtml = !this.isAddonMode 
        ? `<button type="button" class="patient-action-btn add-pkg-sub-btn" onclick="CartPage.navigateToAddItems('${member.id}', 'packages')">📦 + Add Packages</button>` 
        : '';

      const memberTitleWithCrown = (typeof Utils !== 'undefined' && typeof Utils.formatVIPName === 'function')
        ? Utils.formatVIPName(member.name, member.id)
        : this.safeEscape(member.name);

      groupedHtml += `
        <div class="patient-tests-group-card glass-panel-3d animate-3d-card" style="${isMemberVip ? 'border:1.5px solid #FCD34D;' : ''}">
          <div class="patient-group-header">
            <div>
              <span class="patient-group-name">
                👤 ${memberTitleWithCrown} (${this.safeEscape(member.relation || 'Member')})
              </span>
              ${isMemberVip ? '<span style="display:block; font-size:10px; color:#D97706; font-weight:800; margin-top:2px;">⭐ 10% CarePass VIP Active</span>' : ''}
            </div>
            <span class="patient-tests-badge">
              ${memberItems.length} Items
            </span>
          </div>

          ${itemsHtml}

          <div class="patient-card-actions-row">
            <button type="button" class="patient-action-btn add-test-sub-btn"
              onclick="CartPage.navigateToAddItems('${member.id}', 'tests')">
              🧪 + Add Tests
            </button>
            ${addPkgButtonHtml}
          </div>
        </div>
      `;
    });

    container.innerHTML = groupedHtml;
  },

  detectAddonBookingMode() {
    try {
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
            if (Array.isArray(recents)) {
              bData = recents.find(b => b && String(b.bookingId || '').toUpperCase() === targetAddonId.toUpperCase());
            }
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
    } catch (e) {}

    this.isAddonMode = false;
    this.addonBookingId = null;
    this.addonBooking = null;
    this.existingBookingItems = [];
  },

  loadCartData() {
    try {
      let existingMarked = [];

      if (this.isAddonMode && this.addonBooking) {
        let rawBookingItems = this.addonBooking.lockedExistingItems || this.addonBooking.items;
        if (typeof rawBookingItems === 'string') {
          try { rawBookingItems = JSON.parse(rawBookingItems); } catch (e) { rawBookingItems = []; }
        }
        if (!Array.isArray(rawBookingItems)) rawBookingItems = [];

        existingMarked = rawBookingItems.filter(Boolean).map((item, idx) => {
          const isPkg = (
            item.type === 'package' ||
            item.PackageID ||
            item.PackageCode ||
            String(item.code || item.id || '').toUpperCase().startsWith('PKG') ||
            String(item.name || item.TestName || '').toUpperCase().includes('PACKAGE')
          );

          return {
            id: item.id || item.TestID || item.PackageID || `PAID_${idx}`,
            TestID: item.TestID || item.id || null,
            PackageID: item.PackageID || (isPkg ? (item.id || item.code) : null),
            TestCode: item.TestCode || item.code || null,
            PackageCode: item.PackageCode || (isPkg ? (item.code || item.id) : null),
            name: item.name || item.TestName || item.PackageName || (isPkg ? 'Health Package' : 'Diagnostic Test'),
            code: item.code || item.TestCode || item.PackageCode || (isPkg ? 'PKG' : 'TEST'),
            price: 0,
            originalPrice: Number(item.price || item.OfferPrice || item.originalPrice || 0),
            mrp: Number(item.mrp || item.MRP || item.price || 0),
            type: isPkg ? 'package' : 'test',
            patientId: 'SELF',
            isExistingBookingItem: true,
            isExistingLocked: true,
            removable: false
          };
        });

        this.existingBookingItems = existingMarked;
      }

      let newItems = [];
      const activeUser = localStorage.getItem('selfcare_active_user');
      const candidateKeys = [
        activeUser ? `selfcare_cart_${activeUser}` : null,
        'selfcare_cart',
        'cart'
      ].filter(Boolean);

      for (const key of candidateKeys) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              newItems = parsed.filter(i => i && !i.isExistingBookingItem && !i.isExistingLocked);
              break;
            }
          } catch (e) {}
        }
      }

      newItems.forEach(i => {
        if (!i.patientId) i.patientId = 'SELF';
      });

      if (this.isAddonMode) {
        this.cart = [...this.existingBookingItems, ...newItems];
      } else {
        this.cart = newItems;
      }
    } catch (e) {
      console.warn('Error in loadCartData:', e);
      this.cart = [];
    }
  },

  loadPatientAndAddressData() {
    try {
      let user = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};
      const primaryMobile = this.getPrimaryUserMobile();

      if (!user || Object.keys(user).length === 0 || !user.name) {
        const storedUser = localStorage.getItem(`selfcare_profile_${primaryMobile}`) ||
                           localStorage.getItem(`selfcare_user_${primaryMobile}`) ||
                           localStorage.getItem('selfcare_profile') ||
                           localStorage.getItem('selfcare_user') ||
                           localStorage.getItem('user');
        if (storedUser) {
          try { user = { ...JSON.parse(storedUser), ...user }; } catch (e) {}
        }
      }

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
        if (rawFam) {
          const parsed = JSON.parse(rawFam);
          if (Array.isArray(parsed)) famList = parsed.filter(Boolean);
        }
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
            location: m.location || m.Location || '',
            membership: m.membership || 'Regular'
          };
        })
      ];

      if (this.isAddonMode && this.addonBooking) {
        const b = this.addonBooking;
        this.selectedPatientIds = ['SELF'];
        this.selectedPatientName = b.lockedPatientName || b.patientName || selfPatient.name;
        this.selectedPatientPhone = b.patientPhone || b.mobile || primaryMobile || selfPatient.mobile || '7010174890';
        this.selectedPatientEmail = b.patientEmail || '';
        this.selectedPatientRelation = b.lockedRelation || b.relation || 'Self';
        this.selectedPatientId = 'SELF';
        this.selectedPatientAge = this.calculateAge(b.patientAge || b.age || calculatedSelfAge);
        this.selectedPatientGender = b.patientGender || b.gender || selfPatient.gender;
        this.currentPickupAddress = b.lockedAddress || b.address || selfPatient.address;
        this.currentPickupLocation = b.location?.link || b.location || 'Not set';
        this.collectionType = b.lockedCollectionType || b.collectionType || 'home';
        this.selectedTimeSlot = b.lockedTimeSlot || b.timeSlot || '';
      } else {
        this.syncPrimaryPatientDetails();
        this.currentPickupAddress = user.address || user.Address || 'Chennai, Tamil Nadu';
        this.currentPickupLocation = user.location || user.Location || 'Not set';
      }

      this.renderSelectedPatientCard();
    } catch (e) {
      console.warn('Error in loadPatientAndAddressData:', e);
    }
  },

  populateTimeSlotsDropdown() {
    const select = document.getElementById('cart-slot-select');
    if (!select) return;

    if (this.isAddonMode && this.addonBooking) {
      const slotText = this.addonBooking.lockedTimeSlot || this.addonBooking.timeSlot || 'Original Slot';
      const dateText = this.addonBooking.lockedCollectionDate || this.addonBooking.collectionDate || 'Scheduled';
      select.innerHTML = `<option value="${slotText}" selected>✅ Locked with Booking (${dateText} • ${slotText})</option>`;
      select.disabled = true;
      this.selectedTimeSlot = slotText;
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
      if (storedBookings) {
        const parsed = JSON.parse(storedBookings);
        if (Array.isArray(parsed)) bookedSlots = parsed;
      }
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

        const isBooked = Array.isArray(bookedSlots) && bookedSlots.includes(slotDateKey);
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

  /**
   * ZERO-FAIL CHECKOUT ENGINE (WITH PER-PATIENT DISCOUNT PRESERVATION)
   */
  async handleProceedToCheckout() {
    if (this.isProcessingCheckout) return;

    if (!navigator.onLine) {
      this.safeShowToast('Internet connection required to proceed with booking.', 'error');
      return;
    }

    const newTestsCount = this.cart.filter(i => i && !i.isExistingBookingItem && !i.isExistingLocked).length;
    if (this.isAddonMode && newTestsCount === 0) {
      this.safeShowToast('Please add at least one new test to this booking visit', 'info');
      window.location.href = 'tests.html';
      return;
    }

    if (!this.selectedPatientPhone || this.selectedPatientPhone.length !== 10) {
      this.selectedPatientPhone = this.getPrimaryUserMobile() || '7010174890';
    }

    this.calculateBillSummary();
    this.isProcessingCheckout = true;

    const confirmBtn = document.getElementById('floating-action-btn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Processing...';
    }

    const newItems = this.cart.filter(i => i && !i.isExistingBookingItem && !i.isExistingLocked);
    let subtotalNewGross = 0;
    let totalVipDiscount = 0;

    newItems.forEach(item => {
      const pId = item.patientId || 'SELF';
      const isItemVip = (typeof Utils !== 'undefined' && typeof Utils.isPatientVIP === 'function') 
        ? Utils.isPatientVIP(pId) 
        : false;

      const basePrice = Number(item.price || item.OfferPrice || 0);
      subtotalNewGross += basePrice;

      if (isItemVip) {
        totalVipDiscount += Math.round(basePrice * 0.10);
      }
    });

    const doorstepCharge = this.doorstepCharge;
    const finalPayable = Math.max(0, (subtotalNewGross - totalVipDiscount) + doorstepCharge);

    const targetDate = new Date();
    if (this.selectedSlotDay === 'Tomorrow') {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    const collectionDateStr = (this.isAddonMode && this.addonBooking)
      ? (this.addonBooking.lockedCollectionDate || this.addonBooking.collectionDate)
      : targetDate.toISOString().split('T')[0];

    const finalAddress = (this.collectionType === 'lab') 
      ? 'Direct Lab Visit (Selfcare Diagnostics, Chennai)' 
      : this.currentPickupAddress;
    const finalLocation = (this.collectionType === 'lab') 
      ? 'Lab Center' 
      : this.currentPickupLocation;

    const baseBookingId = this.isAddonMode 
      ? this.addonBookingId 
      : `SCDBOOK${Math.floor(100000 + Math.random() * 900000)}`;

    const combinedItems = this.isAddonMode 
      ? [...this.existingBookingItems, ...newItems] 
      : newItems;

    const existingTotal = this.existingBookingItems.reduce((sum, it) => sum + Number(it.originalPrice || it.price || 0), 0);
    const finalTotalWithExisting = existingTotal + (subtotalNewGross - totalVipDiscount) + doorstepCharge;

    const bookingPayload = {
      bookingId: baseBookingId,
      baseBookingId: baseBookingId,
      patientId: 'SELF',
      patientName: this.selectedPatientName || 'Valued Customer',
      patientAge: this.selectedPatientAge || '',
      patientGender: this.selectedPatientGender || '',
      patientPhone: this.selectedPatientPhone,
      patientEmail: this.selectedPatientEmail || '',
      relation: this.selectedPatientRelation || 'Self',
      items: combinedItems.map(i => {
        const itemPatientId = i.patientId || 'SELF';
        const isItemVip = (typeof Utils !== 'undefined' && typeof Utils.isPatientVIP === 'function')
          ? Utils.isPatientVIP(itemPatientId)
          : false;

        const original = Number(i.originalPrice || i.price || i.OfferPrice || 0);
        const itemDiscount = (!i.isExistingBookingItem && isItemVip) ? Math.round(original * 0.10) : 0;

        return {
          id: i.id || i.TestID || i.PackageID || '',
          name: i.name || i.TestName || i.PackageName || '',
          code: i.code || i.TestCode || i.PackageCode || '',
          originalPrice: original,
          discount: itemDiscount,
          price: original - itemDiscount,
          patientId: itemPatientId,
          patientName: this.selectedPatientName || 'Valued Customer',
          relation: this.selectedPatientRelation || 'Self'
        };
      }),
      collectionType: this.collectionType,
      address: finalAddress,
      location: { link: finalLocation },
      collectionDate: collectionDateStr,
      timeSlot: this.selectedTimeSlot,
      subtotal: existingTotal + subtotalNewGross,
      vipDiscount: totalVipDiscount,
      doorstepCharge: doorstepCharge,
      finalAmount: finalTotalWithExisting,
      paymentMode: (this.selectedPaymentMode === 'online') ? 'ONLINE_RAZORPAY' : 'CASH',
      paymentStatus: this.isAddonMode ? (this.addonBooking.paymentStatus || 'PENDING_COLLECTION') : 'PENDING_COLLECTION',
      bookingStatus: 'CONFIRMED',
      isAddon: this.isAddonMode,
      addonBookingId: this.addonBookingId,
      targetBookingId: this.addonBookingId
    };

    // 1. CASH ON VISIT / CASH CONFIRMATION
    if (this.selectedPaymentMode === 'cash') {
      try {
        let resBookingId = bookingPayload.bookingId;

        if (typeof Api !== 'undefined' && Api.createBooking) {
          const res = await Api.createBooking(bookingPayload).catch(err => {
            console.warn('Direct write deferred:', err);
            return null;
          });
          if (res && res.bookingId) {
            resBookingId = res.bookingId;
          }
        }

        this.persistConfirmedBookingLocally({
          ...bookingPayload,
          bookingId: resBookingId,
          currentStage: 1
        });

        this.saveBookedSlot(collectionDateStr, this.selectedTimeSlot);
        this.safeShowToast('Tests booked successfully with VIP discount!', 'success');
        this.finalizeConfirmedMultiBooking([bookingPayload]);
      } catch (err) {
        console.error('Booking confirmation failed:', err);
        this.safeShowToast(err.message || 'Failed to update booking. Please try again.', 'error');
      } finally {
        this.resetCheckoutButtonState();
      }
      return;
    }

    // 2. RAZORPAY ONLINE GATEWAY FLOW
    try {
      if (typeof Razorpay === 'undefined') {
        throw new Error('Razorpay payment gateway failed to load. Please check internet connection.');
      }

      if (confirmBtn) confirmBtn.textContent = 'Initializing Razorpay...';

      const orderPayload = {
        bookingId: baseBookingId,
        finalAmount: finalPayable,
        patientName: this.selectedPatientName,
        patientPhone: this.selectedPatientPhone
      };

      const rzpOrder = await Api.createRazorpayOrder(orderPayload);
      if (!rzpOrder || !rzpOrder.orderId) {
        throw new Error('Failed to create Razorpay payment order on server.');
      }

      const rzpOptions = {
        key: rzpOrder.keyId || Config.RAZORPAY_KEY_ID || 'rzp_live_Tq9S3sQhh5B3hW',
        amount: rzpOrder.amount,
        currency: rzpOrder.currency || 'INR',
        name: 'Selfcare Diagnostics',
        description: `Booking #${baseBookingId}`,
        image: 'assets/images/logo.png',
        order_id: rzpOrder.orderId,
        handler: async (response) => {
          try {
            this.safeShowToast('Verifying payment with bank...', 'info');

            const verifyPayload = {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              bookingId: baseBookingId
            };

            const verifyRes = await Api.verifyRazorpayPayment(verifyPayload);

            if (verifyRes && verifyRes.verified) {
              const confirmedData = {
                ...bookingPayload,
                paymentMode: 'ONLINE_RAZORPAY',
                paymentStatus: 'PAYMENT_SUCCESS',
                bookingStatus: 'CONFIRMED',
                paymentReference: response.razorpay_order_id,
                transactionId: response.razorpay_payment_id,
                currentStage: 1
              };

              if (typeof Api !== 'undefined' && Api.createBooking) {
                await Api.createBooking(confirmedData).catch(() => {});
              }

              this.persistConfirmedBookingLocally(confirmedData);
              this.saveBookedSlot(collectionDateStr, this.selectedTimeSlot);
              this.safeShowToast('Payment successful! Booking confirmed.', 'success');
              this.finalizeConfirmedMultiBooking([confirmedData]);
            } else {
              throw new Error('Payment signature verification failed.');
            }
          } catch (vErr) {
            console.error('Razorpay verification error:', vErr);
            this.safeShowToast(vErr.message || 'Payment verification failed.', 'error');
            this.resetCheckoutButtonState();
          }
        },
        prefill: {
          name: this.selectedPatientName,
          contact: this.selectedPatientPhone,
          email: this.selectedPatientEmail || ''
        },
        theme: {
          color: '#078866'
        },
        modal: {
          ondismiss: () => {
            this.safeShowToast('Payment cancelled by user.', 'info');
            this.resetCheckoutButtonState();
          }
        }
      };

      const rzp = new Razorpay(rzpOptions);
      rzp.open();

    } catch (err) {
      console.error('Razorpay initialization error:', err);
      this.safeShowToast(err.message || 'Error opening Razorpay payment gateway.', 'error');
      this.resetCheckoutButtonState();
    }
  },

  finalizeConfirmedMultiBooking(patientBookingsData) {
    this.clearPersistedWizardState();
    
    localStorage.removeItem('selfcare_active_addon_booking_id');
    localStorage.removeItem('selfcare_active_addon_booking_data');
    sessionStorage.removeItem('selfcare_addon_booking');

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
    }, 700);
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
      if (Array.isArray(booked) && !booked.includes(key)) {
        booked.push(key);
        localStorage.setItem('selfcare_booked_slots', JSON.stringify(booked));
      }
    } catch (e) {}
  },

  removeItem(index) {
    if (index >= 0 && index < this.cart.length) {
      const item = this.cart[index];
      if (item && (item.isExistingBookingItem || item.isExistingLocked)) {
        this.safeShowToast('Already booked tests cannot be removed from this visit', 'info');
        return;
      }

      const removed = this.cart.splice(index, 1);
      this.saveCartState();
      this.renderCartUI();
      this.updateCartBadgeUI();
      this.updateBottomControlBarUI();
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

    this.cart = this.cart.filter(i => i && !i.isExistingBookingItem && !i.isExistingLocked);
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
      const newlyAddedOnly = this.cart.filter(i => i && !i.isExistingBookingItem && !i.isExistingLocked);
      const cartStr = JSON.stringify(newlyAddedOnly);
      localStorage.setItem('cart', cartStr);
      localStorage.setItem('selfcare_cart', cartStr);

      const activeUser = localStorage.getItem('selfcare_active_user');
      if (activeUser) {
        localStorage.setItem(`selfcare_cart_${activeUser}`, cartStr);
      }

      if (typeof App !== 'undefined') {
        App.cart = newlyAddedOnly;
        if (typeof App.updateCartBadge === 'function') App.updateCartBadge();
      }

      if (typeof OfflineDB !== 'undefined' && typeof OfflineDB.saveCart === 'function') {
        OfflineDB.saveCart(newlyAddedOnly).catch(() => {});
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

      const targetBId = String(bookingRecord.bookingId).toUpperCase();
      const existingIdx = list.findIndex(b => b && String(b.bookingId).toUpperCase() === targetBId);

      if (existingIdx !== -1) {
        list[existingIdx] = {
          ...list[existingIdx],
          ...bookingRecord,
          items: bookingRecord.items,
          finalAmount: bookingRecord.finalAmount,
          doorstepCharge: bookingRecord.doorstepCharge,
          subtotal: bookingRecord.subtotal
        };
      } else {
        list.unshift(bookingRecord);
      }

      localStorage.setItem('selfcare_recent_bookings', JSON.stringify(list));
      localStorage.setItem('selfcare_all_bookings', JSON.stringify(list));
    } catch (e) {
      console.warn('Error in persistConfirmedBookingLocally:', e);
    }
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

    const target = this.familyMembers.find(p => p && p.id === this.selectedPatientId);
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
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  },

  updateCartBadgeUI() {
    const badges = document.querySelectorAll('.cart-badge');
    const count = this.cart.filter(i => i && !i.isExistingBookingItem && !i.isExistingLocked).length;
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
