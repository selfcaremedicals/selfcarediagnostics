/* file: assets/js/cart.js */
/**
 * Selfcare Diagnostics - Slide-by-Slide Wizard Engine v9.0.0
 * Features:
 * 1. Multi-Patient Backend Auto-Split: Generates dedicated unique Booking IDs 
 *    per family member (e.g. SCDBOOK100001-1 for Self, SCDBOOK100001-2 for Jazeerah) 
 *    in both Google Sheets Backend and Local Database.
 * 2. Unified Single-Click Checkout: User pays once (UPI/Cash), but backend stores individual records.
 * 3. Slide 1 has both Cart Items & Patient Selection engine.
 * 4. Slide 2 has Collection Address & Appointment Schedule slots with Mobile Editing.
 * 5. Unified 3D Patient Card with dedicated + Add Tests / + Add Packages buttons.
 * 6. Dynamic Conflict Validation during Test Reassignment.
 * 7. Multi-Patient Verification Modal & Grouped WhatsApp Booking Summary.
 * 8. Direct UPI Gateway + Fallback Link Integration.
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
  collectionType: 'home', // Defaults to 'home' so doorstep fee/free threshold calculates right on Slide 1
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

  // Direct UPI Intent State
  isProcessingCheckout: false,
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
      title: 'New Year Health Saver',
      discountPercent: 10,
      validUntil: '2026-10-31',
      description: 'Special seasonal checkup savings'
    }
  ],

  async init() {
    try {
      this.detectAddonBookingMode();
      this.loadCartData();
      this.loadPatientAndAddressData();
      this.checkAutoAppliedCoupon();
      this.populateTimeSlotsDropdown();
      this.restorePersistedWizardState();
      this.renderCartUI();
      this.updateCartBadgeUI();
      this.setupUPIAppReturnListeners();

      const urlParams = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : null;
      const requestedSlide = urlParams ? parseInt(urlParams.get('slide'), 10) : null;
      const savedSlide = parseInt(sessionStorage.getItem('selfcare_cart_slide'), 10);

      if (this.isAddonMode) {
        this.goToSlide(3, true);
        this.updateAddonStepperUI();
      } else if (requestedSlide && requestedSlide >= 1 && requestedSlide <= 4) {
        this.goToSlide(requestedSlide, true);
      } else if (savedSlide && savedSlide >= 1 && savedSlide <= 4 && this.cart.length > 0) {
        this.goToSlide(savedSlide, true);
      } else {
        this.goToSlide(1, true);
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

  // ==========================================================
  // WIZARD STATE PERSISTENCE HELPERS
  // ==========================================================
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
    } catch (e) {}
  },

  // ==========================================================
  // INDIVIDUAL PATIENT NAVIGATION HELPER
  // ==========================================================
  navigateToAddItems(patientId, type) {
    const targetId = patientId || this.selectedPatientId || 'SELF';
    sessionStorage.setItem('selfcare_target_patient_id', targetId);
    sessionStorage.setItem('selfcare_cart_slide', '1');

    const targetUrl = (type === 'packages') ? 'packages.html' : 'tests.html';
    window.location.href = `${targetUrl}?patientId=${encodeURIComponent(targetId)}`;
  },

  // ==========================================================
  // SLIDE-BY-SLIDE WIZARD NAVIGATION
  // ==========================================================
  goToSlide(slideIndex, force = false) {
    if (slideIndex < 1 || slideIndex > this.totalSlides) return;

    if (this.isAddonMode && slideIndex < 3) {
      this.safeShowToast('Patient details and collection mode are locked to this booking', 'info');
      return;
    }

    if (!force && !this.isAddonMode) {
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
          this.safeShowToast(`Please enter a valid 10-digit mobile number for ${this.selectedPatientName}`, 'error');
          return;
        }
        if (!this.selectedTimeSlot) {
          this.safeShowToast('Please select a 30-minute collection time slot', 'error');
          return;
        }
      }
      if (slideIndex > 3 && !this.selectedPaymentMode) {
        this.safeShowToast('Please select a payment method (UPI or Cash) to proceed', 'error');
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  tryJumpToSlide(targetSlide) {
    if (this.isAddonMode && targetSlide < 3) {
      this.safeShowToast('Collection type & Patient details are locked for this booking', 'info');
      return;
    }
    this.goToSlide(targetSlide);
  },

  updateAddonStepperUI() {
    const node1 = document.getElementById('step-node-1');
    const node2 = document.getElementById('step-node-2');
    const conn1 = document.getElementById('connector-1');
    const conn2 = document.getElementById('connector-2');

    if (node1) {
      node1.classList.add('locked', 'completed');
      node1.style.pointerEvents = 'none';
      node1.title = 'Locked with booking';
    }
    if (node2) {
      node2.classList.add('locked', 'completed');
      node2.style.pointerEvents = 'none';
      node2.title = 'Locked with booking';
    }
    if (conn1) conn1.classList.add('filled');
    if (conn2) conn2.classList.add('filled');
  },

  updateBottomControlBarUI() {
    const backBtn = document.getElementById('bar-back-btn');
    const nextBtn = document.getElementById('floating-action-btn');

    if (!backBtn || !nextBtn) return;

    if (this.currentSlide === 1) {
      backBtn.style.visibility = 'hidden';
      backBtn.classList.remove('exit-bar-btn');
    } else if (this.isAddonMode && this.currentSlide === 3) {
      backBtn.style.visibility = 'visible';
      backBtn.textContent = '✕ Exit';
      backBtn.classList.add('exit-bar-btn');
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
    if (this.isAddonMode && this.currentSlide === 3) {
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
      this.goToSlide(2);
    } else if (this.currentSlide === 2) {
      if (!this.selectedPatientPhone || this.selectedPatientPhone.length !== 10) {
        this.safeShowToast(`Please enter a valid 10-digit mobile number for ${this.selectedPatientName}`, 'error');
        return;
      }
      if (!this.selectedTimeSlot) {
        this.safeShowToast('Please select a 30-minute collection time slot', 'error');
        return;
      }
      this.goToSlide(3);
    } else if (this.currentSlide === 3) {
      if (!this.selectedPaymentMode) {
        this.safeShowToast('Please select payment method (UPI or Cash)', 'error');
        return;
      }
      this.goToSlide(4);
    } else if (this.currentSlide === 4) {
      if (!this.collectionType) {
        this.safeShowToast('Please select Home Pickup or Lab Walk-in', 'error');
        return;
      }
      this.openPatientConfirmModal();
    }
  },

  // ==========================================================
  // SLIDE 4: COLLECTION TYPE & THRESHOLD CHARGE LOGIC
  // ==========================================================
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

    let total = subtotal;
    if (total === null) {
      total = this.cart.reduce((sum, item) => {
        if (item.isExistingBookingItem) return sum;
        return sum + Number(item.price || item.OfferPrice || 0);
      }, 0);
    }

    // Orders ₹500 or above -> 100% FREE DOORSTEP PICKUP
    if (total >= 500) {
      return 0;
    }

    const isPPBSTest = (item) => {
      const name = (item.name || item.TestName || '').toUpperCase();
      const code = (item.code || item.TestCode || '').toUpperCase();
      return name.includes('PPBS') || name.includes('POST PRANDIAL') || code === 'T0009' || code === 'SCDT0009';
    };

    const ppbsItems = this.cart.filter(isPPBSTest);
    const otherItems = this.cart.filter(i => !isPPBSTest(i));

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
      const ppbsItems = this.cart.filter(isPPBSTest);
      const otherItems = this.cart.filter(i => !isPPBSTest(i));
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

    let couponDiscount = 0;
    let couponTitle = '';

    if (this.appliedCoupon && subtotalNewTests > 0) {
      const clean = String(this.appliedCoupon).trim();
      if (clean.toLowerCase().startsWith('selfcare10%')) {
        const friend = clean.substring(12);
        couponDiscount = Math.round(subtotalNewTests * 0.10);
        couponTitle = `Referral Discount (10% - Referred by ${friend.toUpperCase()}):`;
      } else {
        couponDiscount = Math.round(subtotalNewTests * 0.10);
        couponTitle = `Coupon Discount (${clean}):`;
      }
    }
    this.couponDiscountAmount = couponDiscount;

    this.onlineDiscountAmount = 0;
    this.doorstepCharge = this.calculateDoorstepCharge(subtotalNewTests);
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

  // ==========================================================
  // MULTI-PATIENT SELECTION ENGINE (SLIDE 1)
  // ==========================================================
  syncPrimaryPatientDetails() {
    if (!this.selectedPatientIds || this.selectedPatientIds.length === 0) {
      this.selectedPatientIds = ['SELF'];
    }

    const firstId = this.selectedPatientIds[0];
    const target = this.familyMembers.find(p => p.id === firstId) || this.familyMembers[0] || {};

    this.selectedPatientId = target.id || 'SELF';
    this.selectedPatientName = target.name || 'Self';
    this.selectedPatientPhone = target.mobile || '';
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
      const primaryPhone = this.selectedPatientPhone || (selectedMembers[0] && selectedMembers[0].mobile) || '';
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

  // ==========================================================
  // SLIDE 3: PAYMENT MODE & COUPONS
  // ==========================================================
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

  // ==========================================================
  // SLIDE 1: UNIFIED PATIENT-WISE GROUPED CART RENDERING
  // ==========================================================
  assignItemPatient(itemIndex, targetPatientId) {
    if (itemIndex >= 0 && itemIndex < this.cart.length) {
      const targetItem = this.cart[itemIndex];

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
              <div class="cart-item-card glass-panel-3d-item">
                <div class="item-main-details">
                  <div class="item-meta-row">
                    <span class="type-badge ${isPackage ? 'package-type' : 'test-type'}">
                      ${isPackage ? 'PACKAGE' : 'TEST'}
                    </span>
                    <span class="item-code-tag">${Utils.escapeHtml(item.code || item.TestCode || item.PackageCode || '')}</span>
                    ${isPaidItem ? `<span class="paid-tag">PAID</span>` : ''}
                  </div>
                  <h4 class="item-title">${Utils.escapeHtml(name)}</h4>
                  <div class="item-price-row">
                    ${(!isPaidItem && mrp > offerPrice) ? `<span class="item-mrp-strike">${Utils.formatCurrency(mrp)}</span>` : ''}
                    <span class="item-offer-price">${Utils.formatCurrency(offerPrice)}</span>
                    ${isPaidItem ? `<span class="item-paid-note">(Paid: ${Utils.formatCurrency(item.originalPrice || 0)})</span>` : ''}
                  </div>
                </div>

                <div class="item-actions-row">
                  ${effectiveMembers.length > 1 ? `
                    <select class="patient-reassign-select" onchange="CartPage.assignItemPatient(${item.originalIndex}, this.value)">
                      ${effectiveMembers.map(m => `
                        <option value="${m.id}" ${m.id === member.id ? 'selected' : ''}>
                          For: ${m.name}
                        </option>
                      `).join('')}
                    </select>
                  ` : ''}

                  ${isPaidItem ? `
                    <span class="item-paid-badge">✓ Paid</span>
                  ` : `
                    <button type="button" class="item-delete-btn" onclick="CartPage.removeItem(${item.originalIndex})" title="Remove item">🗑️</button>
                  `}
                </div>
              </div>
            `;
          }).join('')}

          <!-- Dedicated Per-Patient Action Buttons -->
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

  // ==========================================================
  // CORE HELPER INITIALIZERS & DATA LOADING
  // ==========================================================
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
        patientId: item.patientId || 'SELF',
        isExistingBookingItem: true
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
    const user = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};
    const primaryMobile = user.mobile || localStorage.getItem('selfcare_active_user') || '7010174890';
    const primaryName = user.name || 'Valued Customer';
    const primaryEmail = user.email || '';

    const selfPatient = {
      id: 'SELF',
      name: primaryName,
      relation: 'Self',
      mobile: primaryMobile,
      email: primaryEmail,
      age: user.age || '28',
      gender: user.gender || 'Male',
      address: user.address || 'Chennai, Tamil Nadu',
      location: user.location || 'Not set'
    };

    let famList = [];
    try {
      let rawFam = localStorage.getItem(`selfcare_family_${primaryMobile}`) || localStorage.getItem('selfcare_family_members');
      if (rawFam) famList = JSON.parse(rawFam);
    } catch (e) {}

    this.familyMembers = [
      selfPatient,
      ...famList.map(m => ({
        id: m.id || `FAM_${Date.now()}_${Math.random()}`,
        name: m.name || 'Member',
        relation: m.relation || 'Family',
        mobile: m.mobile || '',
        email: m.email || '',
        age: m.age || '',
        gender: m.gender || '',
        address: m.address || '',
        location: m.location || ''
      }))
    ];

    if (this.isAddonMode && this.addonBooking) {
      const b = this.addonBooking;
      this.selectedPatientIds = [b.patientId || 'SELF'];
      this.selectedPatientName = b.patientName || selfPatient.name;
      this.selectedPatientPhone = b.patientPhone || selfPatient.mobile;
      this.selectedPatientEmail = b.patientEmail || '';
      this.selectedPatientRelation = b.relation || 'Self';
      this.selectedPatientId = b.patientId || 'SELF';
      this.currentPickupAddress = b.address || selfPatient.address;
      this.currentPickupLocation = b.location?.link || b.location || 'Not set';
      this.collectionType = b.collectionType || 'home';
    } else {
      this.syncPrimaryPatientDetails();
      this.currentPickupAddress = user.address || 'Chennai, Tamil Nadu';
      this.currentPickupLocation = user.location || 'Not set';
    }

    this.renderSelectedPatientCard();
  },

  checkAutoAppliedCoupon() {
    const savedCoupon = localStorage.getItem('selfcare_applied_coupon');
    if (savedCoupon && savedCoupon.trim()) {
      this.appliedCoupon = savedCoupon.trim();
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

    if (this.appliedCoupon) {
      if (banner) banner.style.display = 'flex';
      if (inputBox) inputBox.style.display = 'none';
      if (codeText) codeText.textContent = this.appliedCoupon;
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

  // ==========================================================
  // PATIENT VERIFICATION CHECKPOINT POPUP FLOW
  // ==========================================================
  openPatientConfirmModal() {
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
      this.safeShowToast('Please select at least one patient for sample pickup', 'error');
      this.goToSlide(1);
      return;
    }

    if (!this.selectedPatientPhone || this.selectedPatientPhone.length !== 10) {
      this.safeShowToast(`Please enter a valid 10-digit mobile number for ${this.selectedPatientName}`, 'error');
      if (!this.isAddonMode) this.goToSlide(2);
      return;
    }

    if (this.collectionType === 'home' && (!this.currentPickupAddress || this.currentPickupAddress.trim() === '')) {
      this.safeShowToast('Please provide a valid doorstep pickup address', 'error');
      if (!this.isAddonMode) this.goToSlide(2);
      return;
    }

    if (!this.selectedTimeSlot) {
      this.safeShowToast('Please select a valid 30-minute collection slot', 'error');
      if (!this.isAddonMode) this.goToSlide(2);
      return;
    }

    if (!this.collectionType) {
      this.safeShowToast('Please select collection mode (Home Pickup or Lab Walk-in)', 'error');
      this.goToSlide(4);
      return;
    }

    const selectedMembers = this.familyMembers.filter(m => this.selectedPatientIds.includes(m.id));

    const nameEl = document.getElementById('verify-patient-name');
    const relationEl = document.getElementById('verify-patient-relation');
    const multiListEl = document.getElementById('verify-patient-multi-list');
    const mobileEl = document.getElementById('verify-patient-mobile');
    const ageGenderEl = document.getElementById('verify-patient-age-gender');
    const collectionEl = document.getElementById('verify-patient-collection');
    const slotEl = document.getElementById('verify-patient-slot');
    const totalEl = document.getElementById('verify-total-amount');

    const totalPayableEl = document.getElementById('bill-final-payable');
    const currentPayable = totalPayableEl ? totalPayableEl.textContent : '₹0';

    if (nameEl) {
      nameEl.textContent = selectedMembers.length > 1 
        ? `${selectedMembers[0].name} + ${selectedMembers.length - 1} Member(s)` 
        : this.selectedPatientName;
    }

    if (relationEl) {
      relationEl.textContent = this.isAddonMode ? `Add-on: ${this.addonBooking.bookingId}` : (selectedMembers.length > 1 ? `${selectedMembers.length} Members` : (this.selectedPatientRelation || 'Self'));
    }

    if (multiListEl) {
      if (selectedMembers.length > 1) {
        multiListEl.style.display = 'block';
        multiListEl.innerHTML = selectedMembers.map((m, i) => {
          const mCount = this.cart.filter(item => item.patientId === m.id).length;
          return `
            <div style="font-size:10px; font-weight:700; color:#1E293B; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:3px 7px; margin-bottom:3px; display:flex; justify-content:space-between;">
              <span>${i + 1}. ${m.name} (${m.relation || 'Member'})</span>
              <span style="color:#078866; font-weight:800;">${mCount} Tests</span>
            </div>
          `;
        }).join('');
      } else {
        multiListEl.style.display = 'none';
      }
    }

    if (mobileEl) mobileEl.textContent = `+91 ${this.selectedPatientPhone}`;
    if (ageGenderEl) {
      ageGenderEl.textContent = selectedMembers.length > 1
        ? `${selectedMembers.length} Patients Configured`
        : `${this.selectedPatientAge ? this.selectedPatientAge + ' Yrs' : 'Age not set'} • ${this.selectedPatientGender || 'Not set'}`;
    }
    if (collectionEl) {
      collectionEl.textContent = this.isAddonMode ? 'Doorstep Pickup (Clubbed ₹0)' : (this.collectionType === 'lab' ? 'Direct Lab Walk-in (₹0)' : `Doorstep Pickup (${this.doorstepCharge === 0 ? 'FREE ₹0' : '₹' + this.doorstepCharge})`);
    }
    if (slotEl) slotEl.textContent = `${this.selectedSlotDay} (${this.selectedTimeSlot})`;
    if (totalEl) totalEl.textContent = currentPayable;

    this.openModal('modal-confirm-patient');
  },

  confirmPatientAndProceed() {
    this.closeModal('modal-confirm-patient');
    this.handleProceedToCheckout();
  },

  // ==========================================================
  // DIRECT UPI INTENT / CASH CHECKOUT WITH MULTI-PATIENT SPLIT
  // ==========================================================
  async handleProceedToCheckout() {
    if (this.isProcessingCheckout) return;
    this.isProcessingCheckout = true;

    const confirmBtn = document.getElementById('floating-action-btn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = this.selectedPaymentMode === 'online' ? 'Opening UPI...' : 'Confirming...';
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
    const collectionDateStr = this.isAddonMode ? this.addonBooking.collectionDate : targetDate.toISOString().split('T')[0];

    const finalAddress = this.collectionType === 'lab' ? 'Direct Lab Visit (Selfcare Diagnostics, Chennai)' : this.currentPickupAddress;
    const finalLocation = this.collectionType === 'lab' ? 'Lab Center' : this.currentPickupLocation;

    const selectedMembers = this.familyMembers.filter(m => this.selectedPatientIds.includes(m.id));
    const isMulti = selectedMembers.length > 1;
    const baseBookingId = this.isAddonMode 
      ? this.addonBookingId 
      : `SCDBOOK${Math.floor(100000 + Math.random() * 900000)}`;

    const defaultPatientId = (selectedMembers[0] && selectedMembers[0].id) || 'SELF';

    // MULTI-PATIENT PARTITION ENGINE:
    // Split newItems into distinct patient groups with dedicated sub-booking IDs
    const patientBookingsData = [];

    selectedMembers.forEach((member, idx) => {
      const memberItems = newItems.filter(item => (item.patientId || defaultPatientId) === member.id);
      if (memberItems.length === 0) return;

      const mSubtotal = memberItems.reduce((sum, it) => sum + Number(it.price || it.OfferPrice || 0), 0);
      const mDiscount = subtotalNew > 0 ? Math.round((mSubtotal / subtotalNew) * couponDiscount) : 0;
      // Single home collection visit fee assigned to primary patient only
      const mDoorstep = (idx === 0) ? doorstepCharge : 0;
      const mFinal = Math.max(0, mSubtotal - mDiscount + mDoorstep);
      // Dedicated Booking ID per patient (e.g., SCDBOOK100001-1 for Self, SCDBOOK100001-2 for Jazeerah)
      const mBookingId = isMulti ? `${baseBookingId}-${idx + 1}` : baseBookingId;

      patientBookingsData.push({
        bookingId: mBookingId,
        baseBookingId: baseBookingId,
        patientId: member.id,
        patientName: member.name,
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
        couponCode: this.appliedCoupon || ''
      });
    });

    // Fallback: If no partitioned items matched, bundle all under primary
    if (patientBookingsData.length === 0) {
      patientBookingsData.push({
        bookingId: baseBookingId,
        baseBookingId: baseBookingId,
        patientId: this.selectedPatientId,
        patientName: this.selectedPatientName,
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
        couponCode: this.appliedCoupon || ''
      });
    }

    // PATHWAY A: CASH ON VISIT
    if (this.selectedPaymentMode === 'cash') {
      try {
        const createdIds = [];

        // Save each patient's booking separately in Google Sheets and Local Database
        for (const pData of patientBookingsData) {
          const payload = {
            ...pData,
            paymentStatus: 'PENDING_COLLECTION',
            bookingStatus: 'CONFIRMED'
          };

          if (typeof Api !== 'undefined' && Api.createBooking) {
            await Api.createBooking(payload).catch(err => console.warn('Cloud write deferred:', err));
          }

          this.persistConfirmedBookingLocally({
            ...payload,
            currentStage: 1,
            items: pData.items
          });

          createdIds.push(pData.bookingId);
        }

        this.finalizeConfirmedMultiBooking(patientBookingsData, 'Cash on Sample Collection');
        this.safeShowToast(
          this.isAddonMode 
            ? `Tests added to Booking ${baseBookingId}!` 
            : `Bookings (${createdIds.join(', ')}) confirmed!`, 
          'success'
        );
      } catch (err) {
        console.error('Cash booking creation failed:', err);
        this.safeShowToast(err.message || 'Failed to confirm booking. Please try again.', 'error');
      } finally {
        this.resetCheckoutButtonState();
      }
      return;
    }

    // PATHWAY B: DIRECT UPI INTENT
    try {
      if (typeof Api === 'undefined' || !Api.createPendingUPIBooking) {
        throw new Error('API client method createPendingUPIBooking is not available.');
      }

      // Single checkout UPI intent payload for the combined total
      const pendingPayload = {
        bookingId: baseBookingId,
        patientId: this.selectedPatientId,
        patientName: selectedMembers.map(m => m.name).join(' & '),
        patientPhone: this.selectedPatientPhone,
        patientEmail: this.selectedPatientEmail || '',
        relation: this.selectedPatientRelation || 'Self',
        items: newItems,
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
        couponCode: this.appliedCoupon || ''
      };

      const pendingRes = await Api.createPendingUPIBooking(pendingPayload);

      if (!pendingRes || !pendingRes.bookingId || !pendingRes.paymentReference) {
        throw new Error('Unable to initialize booking session with server.');
      }

      this.currentPendingBooking = {
        bookingId: pendingRes.bookingId,
        paymentReference: pendingRes.paymentReference,
        finalAmount: pendingRes.finalAmount || finalPayable,
        patientBookingsData: patientBookingsData,
        collectionDate: collectionDateStr,
        timeSlot: this.selectedTimeSlot,
        collectionType: this.collectionType,
        address: finalAddress,
        location: finalLocation,
        isAddon: this.isAddonMode,
        addonBookingId: this.addonBookingId,
        newItems: newItems,
        selectedMembers: selectedMembers
      };

      sessionStorage.setItem('selfcare_active_upi_txn', JSON.stringify(this.currentPendingBooking));

      const upiConfig = (typeof Config !== 'undefined' && Config.UPI) ? Config.UPI : {
        MERCHANT_VPA: '0798545a0252206.bqr@kotak',
        MERCHANT_NAME: 'Selfcare Diagnostics',
        CURRENCY: 'INR',
        MCC: '8099'
      };

      const pa = upiConfig.MERCHANT_VPA;
      const pn = encodeURIComponent(upiConfig.MERCHANT_NAME);
      const am = Number(this.currentPendingBooking.finalAmount).toFixed(2);
      const cu = upiConfig.CURRENCY || 'INR';
      const tr = this.currentPendingBooking.paymentReference;
      const tn = encodeURIComponent(`Selfcare-${this.currentPendingBooking.bookingId}`);
      const mc = upiConfig.MCC || '8099';

      const upiUri = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tr=${tr}&tn=${tn}&mc=${mc}`;

      this.openModal('upi-payment-modal');
      const bookRefEl = document.getElementById('upi-modal-book-ref');
      const amountEl = document.getElementById('upi-modal-amount');
      const fallbackBtn = document.getElementById('upi-direct-manual-link');
      const fallbackContainer = document.getElementById('upi-fallback-container');

      if (bookRefEl) bookRefEl.textContent = this.currentPendingBooking.bookingId;
      if (amountEl) amountEl.textContent = Utils.formatCurrency(this.currentPendingBooking.finalAmount);
      if (fallbackBtn) fallbackBtn.href = upiUri;
      if (fallbackContainer) fallbackContainer.style.display = 'none';

      this.intentLaunchTime = Date.now();
      if (this.fallbackTimerId) clearTimeout(this.fallbackTimerId);
      this.fallbackTimerId = setTimeout(() => {
        if (fallbackContainer) fallbackContainer.style.display = 'block';
      }, 3500);

      window.location.href = upiUri;

    } catch (err) {
      console.error('Direct UPI Intent failure:', err);
      this.safeShowToast(err.message || 'Error opening UPI payment. Please try again.', 'error');
      this.resetCheckoutButtonState();
    }
  },

  setupUPIAppReturnListeners() {
    const handleAppFocusOrVisibility = () => {
      if (!this.currentPendingBooking) {
        const saved = sessionStorage.getItem('selfcare_active_upi_txn');
        if (saved) {
          try { this.currentPendingBooking = JSON.parse(saved); } catch (e) {}
        }
      }

      if (!this.currentPendingBooking) return;

      const modal = document.getElementById('upi-payment-modal');
      if (modal && modal.style.display === 'flex') {
        const timeElapsed = Date.now() - this.intentLaunchTime;
        if (timeElapsed > 2500) {
          this.handleReturnFromUPI();
        }
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleAppFocusOrVisibility();
    });

    window.addEventListener('focus', handleAppFocusOrVisibility);
  },

  handleReturnFromUPI() {
    if (!this.currentPendingBooking) {
      const saved = sessionStorage.getItem('selfcare_active_upi_txn');
      if (saved) {
        try { this.currentPendingBooking = JSON.parse(saved); } catch (e) {}
      }
    }

    if (!this.currentPendingBooking) return;

    this.closeModal('upi-payment-modal');

    const amtEl = document.getElementById('upi-confirm-amt-text');
    const bookIdEl = document.getElementById('upi-confirm-book-id');
    const payRefEl = document.getElementById('upi-confirm-pay-ref');

    if (amtEl) amtEl.textContent = Utils.formatCurrency(this.currentPendingBooking.finalAmount);
    if (bookIdEl) bookIdEl.textContent = this.currentPendingBooking.bookingId;
    if (payRefEl) payRefEl.textContent = this.currentPendingBooking.paymentReference;

    this.openModal('upi-confirm-modal');
  },

  async confirmUserPaymentSuccess() {
    if (!this.currentPendingBooking) return;

    const yesBtn = document.querySelector('#upi-confirm-modal .modal-action-btn');
    if (yesBtn) {
      yesBtn.innerHTML = '⏳ Opening WhatsApp...';
      yesBtn.style.pointerEvents = 'none';
      yesBtn.style.opacity = '0.85';
    }

    const booking = this.currentPendingBooking;
    const finalId = booking.isAddon ? booking.addonBookingId : booking.bookingId;

    try {
      if (typeof Api !== 'undefined' && Api.updateUPIPaymentStatus) {
        Api.updateUPIPaymentStatus({
          bookingId: finalId,
          paymentReference: booking.paymentReference,
          paymentStatus: 'PAYMENT_SUCCESS',
          bookingStatus: 'CONFIRMED',
          transactionId: 'USER_CONFIRMED_UPI',
          rawResponse: 'Customer confirmed payment completion inside UPI app'
        }).catch(() => {});
      }
    } catch (err) {}

    // Register each patient's individual booking in Google Sheets and Local Database
    const pList = booking.patientBookingsData || [];
    for (const pData of pList) {
      const payload = {
        ...pData,
        paymentStatus: 'PAYMENT_SUCCESS',
        bookingStatus: 'CONFIRMED',
        paymentReference: booking.paymentReference
      };

      if (typeof Api !== 'undefined' && Api.createBooking) {
        Api.createBooking(payload).catch(err => console.warn('Child booking cloud write deferred:', err));
      }

      this.persistConfirmedBookingLocally({
        ...payload,
        currentStage: 1,
        items: pData.items
      });
    }

    this.finalizeConfirmedMultiBooking(pList, 'Online UPI');
    this.closeModal('upi-confirm-modal');
    this.resetCheckoutButtonState();
  },

  finalizeConfirmedMultiBooking(patientBookingsData, payModeTitle) {
    const isLab = this.collectionType === 'lab';
    const typeLabel = isLab 
      ? 'Direct Lab Walk-in (FREE ₹0)' 
      : (this.doorstepCharge === 0 ? 'Doorstep Home Pickup (FREE ₹0 - Orders ₹500+)' : `Doorstep Home Pickup (₹${this.doorstepCharge})`);
    
    const addressDetails = isLab 
      ? `🏢 *Visit Center:* Selfcare Diagnostics Lab, Chennai` 
      : `🏠 *Address:* ${this.currentPickupAddress}\n📍 *Location Link:* ${this.currentPickupLocation}`;

    let totalAmount = 0;
    let patientDetailsBlocks = '';

    patientBookingsData.forEach((pData, idx) => {
      totalAmount += Number(pData.finalAmount || 0);
      patientDetailsBlocks += `
👤 *Patient ${idx + 1}: ${pData.patientName} (${pData.relation || 'Member'})*
📋 *Booking ID:* ${pData.bookingId}
📞 *Mobile:* +91 ${pData.patientPhone}
🧪 *Booked Tests:*
${pData.items.map((it, i) => `  ${i + 1}. ${it.name} (₹${it.price})`).join('\n')}
💰 *Payable:* ${Utils.formatCurrency(pData.finalAmount)}
`;
    });

    const isMulti = patientBookingsData.length > 1;

    const waMessage = 
`*NEW ${isMulti ? 'FAMILY ' : ''}TEST BOOKING - SELFCARE DIAGNOSTICS* 🧪
━━━━━━━━━━━━━━━━━━━━
💳 *Payment Mode:* ${payModeTitle}
🏥 *Collection Mode:* ${typeLabel}
${addressDetails}
⏱ *Appointment Slot:* ${this.selectedSlotDay} (${this.selectedTimeSlot})
━━━━━━━━━━━━━━━━━━━━
${patientDetailsBlocks.trim()}
━━━━━━━━━━━━━━━━━━━━
🏷️ *Coupon:* ${this.appliedCoupon || 'None'}
💰 *Grand Total:* ${Utils.formatCurrency(totalAmount)}
━━━━━━━━━━━━━━━━━━━━
_${isLab ? 'Direct walk-in counter booking.' : 'Please assign phlebotomist with required sample vials for doorstep pickup.'}_`;

    this.clearPersistedWizardState();
    this.cart = [];
    this.saveCartState();
    this.renderCartUI();
    this.updateCartBadgeUI();

    const waUrl = `https://wa.me/917010174890?text=${encodeURIComponent(waMessage)}`;
    window.location.href = waUrl;
  },

  confirmUserPaymentFailed() {
    if (!this.currentPendingBooking) {
      this.closeModal('upi-confirm-modal');
      return;
    }

    const booking = this.currentPendingBooking;
    try {
      if (typeof Api !== 'undefined' && Api.updateUPIPaymentStatus) {
        Api.updateUPIPaymentStatus({
          bookingId: booking.bookingId,
          paymentReference: booking.paymentReference,
          paymentStatus: 'PAYMENT_CANCELLED',
          bookingStatus: 'PAYMENT_CANCELLED',
          transactionId: '',
          rawResponse: 'Customer clicked payment failed/cancelled'
        }).catch(() => {});
      }
    } catch (err) {}

    this.closeModal('upi-confirm-modal');
    sessionStorage.removeItem('selfcare_active_upi_txn');
    this.resetCheckoutButtonState();

    this.safeShowToast('Payment was not completed. You can retry UPI or choose Cash.', 'info');
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

  openAvailableCouponsModal() {
    const container = document.getElementById('available-coupons-list');
    if (!container) return;

    const todayStr = new Date().toISOString().split('T')[0];
    let allCoupons = [...this.adminCoupons];

    try {
      const savedRef = localStorage.getItem('selfcare_referral_coupons');
      if (savedRef) {
        const refs = JSON.parse(savedRef);
        refs.forEach(r => {
          allCoupons.unshift({
            code: r.code,
            title: `Referral Reward: ${r.friendName}`,
            discountPercent: 10,
            validUntil: '2026-12-31',
            description: `Earned via friend ${r.friendName}'s booking`
          });
        });
      }
    } catch (e) {}

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
    this.appliedCoupon = code;
    localStorage.setItem('selfcare_applied_coupon', code);
    this.calculateBillSummary();
    this.closeModal('available-coupons-modal');
    this.safeShowToast(`Coupon "${code}" applied successfully!`, 'success');
  },

  applyCouponManually() {
    const input = document.getElementById('coupon-code-input');
    const val = input ? input.value.trim() : '';

    if (!val) {
      this.safeShowToast('Please enter coupon code', 'error');
      return;
    }

    this.applyCouponCode(val);
    if (input) input.value = '';
  },

  removeCoupon() {
    this.appliedCoupon = null;
    this.couponDiscountAmount = 0;
    localStorage.removeItem('selfcare_applied_coupon');
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
