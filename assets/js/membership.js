/* file: assets/js/membership.js */
/**
 * Selfcare Diagnostics - VIP Membership & Razorpay Controller v1.2.0
 * Features:
 * - 1 Year validity calculation
 * - Strictly Online Payment via Razorpay Live Gateway
 * - Auto-creates backend Razorpay Order ID before checkout modal
 * - Primary User (₹99) + Selected Family Members (₹99 each)
 * - Sets 'Membership' status in Customers & FamilyMembers backend sheets
 * - Sets 'Regular' for non-purchased members
 */

const MembershipPage = {
  PER_HEAD_PRICE: 99,
  currentUser: null,
  familyMembers: [],
  selectedMemberIds: new Set(),
  activeMembership: null,

  async init() {
    this.loadUserData();
    this.checkExistingMembership();
    this.renderPrimaryUser();
    this.renderFamilyOptions();
    this.calculateTotal();
  },

  loadUserData() {
    const activeMobile = localStorage.getItem('selfcare_active_user') || '';

    // Primary User Load
    let storedUser = null;
    try {
      const rawUser = localStorage.getItem(`selfcare_profile_${activeMobile}`) || localStorage.getItem('selfcare_permanent_user');
      if (rawUser) storedUser = JSON.parse(rawUser);
    } catch (e) {}

    this.currentUser = {
      name: (storedUser && storedUser.name) || 'Valued Customer',
      mobile: activeMobile || (storedUser && storedUser.mobile) || '',
      email: (storedUser && storedUser.email) || '',
      userId: (storedUser && storedUser.userId) || ('SCD_' + activeMobile),
      membership: (storedUser && storedUser.membership) || 'Regular'
    };

    // Family Members Load from Profile Vault
    try {
      let rawFam = localStorage.getItem(`selfcare_family_${activeMobile}`) || localStorage.getItem('selfcare_family_members');
      this.familyMembers = rawFam ? JSON.parse(rawFam) : [];
    } catch (e) {
      this.familyMembers = [];
    }
  },

  checkExistingMembership() {
    const activeMobile = this.currentUser.mobile;
    const cacheKey = `selfcare_membership_${activeMobile}`;
    const raw = localStorage.getItem(cacheKey);

    if (raw) {
      try {
        const mem = JSON.parse(raw);
        if (mem && mem.status === 'Membership') {
          const exp = new Date(mem.expiryDate);
          if (exp > new Date()) {
            this.activeMembership = mem;
            const banner = document.getElementById('already-member-banner');
            const validText = document.getElementById('membership-validity-text');
            if (banner) banner.style.display = 'flex';
            if (validText) validText.textContent = `Valid until: ${exp.toLocaleDateString('en-GB')}`;
          }
        }
      } catch (e) {}
    }
  },

  renderPrimaryUser() {
    const nameEl = document.getElementById('primary-user-name');
    const phoneEl = document.getElementById('primary-user-phone');
    if (nameEl) nameEl.textContent = this.currentUser.name;
    if (phoneEl) phoneEl.textContent = this.currentUser.mobile ? `+91 ${this.currentUser.mobile}` : 'Active Account';
  },

  renderFamilyOptions() {
    const container = document.getElementById('family-members-selection-list');
    if (!container) return;

    if (!this.familyMembers || this.familyMembers.length === 0) {
      container.innerHTML = `
        <div style="font-size:11px; color:#6B7280; padding:6px 0;">
          No family members saved yet. Click below to add.
        </div>
      `;
      return;
    }

    container.innerHTML = this.familyMembers.map(m => {
      const isSelected = this.selectedMemberIds.has(m.id);
      const isAlreadyVip = m.membership === 'Membership';

      return `
        <div class="member-select-row ${isSelected ? 'selected' : ''}" onclick="MembershipPage.toggleFamilySelect('${m.id}')">
          <label class="custom-checkbox" onclick="event.stopPropagation()">
            <input type="checkbox" id="chk_${m.id}" ${isSelected ? 'checked' : ''} onchange="MembershipPage.toggleFamilySelect('${m.id}')">
            <span class="checkmark"></span>
          </label>
          <div class="member-row-info">
            <div class="name-line">
              <strong>${Utils.escapeHtml(m.name)}</strong>
              <span class="relation-tag ${isAlreadyVip ? 'vip-tag' : ''}">${Utils.escapeHtml(m.relation || 'Member')} ${isAlreadyVip ? '• VIP' : ''}</span>
            </div>
            <span class="member-sub">${m.age ? m.age + ' Yrs • ' : ''}${m.mobile ? '+91 ' + m.mobile : 'Same address'}</span>
          </div>
          <div class="row-price">+₹99</div>
        </div>
      `;
    }).join('');
  },

  toggleFamilySelect(memberId) {
    if (this.selectedMemberIds.has(memberId)) {
      this.selectedMemberIds.delete(memberId);
    } else {
      this.selectedMemberIds.add(memberId);
    }
    this.renderFamilyOptions();
    this.calculateTotal();
  },

  calculateTotal() {
    const familyCount = this.selectedMemberIds.size;
    const totalCount = 1 + familyCount;
    const totalAmount = totalCount * this.PER_HEAD_PRICE;

    const famRow = document.getElementById('bill-family-row');
    const famCountEl = document.getElementById('bill-family-count');
    const famAmtEl = document.getElementById('bill-family-amount');
    const grandTotalEl = document.getElementById('bill-grand-total');
    const ctaText = document.getElementById('cta-btn-text');

    if (familyCount > 0) {
      if (famRow) famRow.style.display = 'flex';
      if (famCountEl) famCountEl.textContent = familyCount;
      if (famAmtEl) famAmtEl.textContent = `₹${familyCount * this.PER_HEAD_PRICE}`;
    } else {
      if (famRow) famRow.style.display = 'none';
    }

    if (grandTotalEl) grandTotalEl.textContent = `₹${totalAmount}`;
    if (ctaText) ctaText.textContent = `Pay ₹${totalAmount} Online & Activate VIP`;
  },

  // Razorpay Gateway - Live Online Checkout with Backend Order ID
  async initiatePayment() {
    const activeMobile = this.currentUser.mobile;
    if (!activeMobile) {
      alert('Please log in with your mobile number to purchase VIP Membership.');
      window.location.href = 'customer.html';
      return;
    }

    const totalMembers = 1 + this.selectedMemberIds.size;
    const totalAmount = totalMembers * this.PER_HEAD_PRICE;
    const selectedFamilyList = this.familyMembers.filter(m => this.selectedMemberIds.has(m.id));

    const payBtn = document.getElementById('pay-razorpay-btn');
    const originalBtnContent = payBtn ? payBtn.innerHTML : '';

    try {
      if (payBtn) {
        payBtn.disabled = true;
        payBtn.innerHTML = '<span>⏳ Preparing Secure Payment...</span>';
      }

      if (typeof Razorpay === 'undefined') {
        throw new Error('Razorpay Gateway loading failed. Please check internet connection.');
      }

      // 1. Backend vazhi Razorpay Order ID undakkunnu
      let orderRes = null;
      if (typeof Api !== 'undefined' && typeof Api.createRazorpayOrder === 'function') {
        orderRes = await Api.createRazorpayOrder({
          amount: totalAmount,
          finalAmount: totalAmount,
          bookingId: 'VIP_' + Date.now(),
          patientName: this.currentUser.name,
          patientPhone: activeMobile
        });
      }

      const razorpayKey = (orderRes && orderRes.keyId) || 
                          (typeof Config !== 'undefined' && Config.RAZORPAY_KEY_ID) || 
                          'rzp_live_Tq9S3sQhh5B3hW';

      const orderId = orderRes && (orderRes.orderId || orderRes.id);

      // 2. Razorpay Live Modal Options
      const options = {
        key: razorpayKey,
        amount: totalAmount * 100, // paise
        currency: "INR",
        name: "Selfcare Diagnostics",
        description: `CarePass 1-Year VIP Membership (${totalMembers} Members)`,
        image: "assets/images/logo.png",
        prefill: {
          name: this.currentUser.name,
          contact: activeMobile,
          email: this.currentUser.email || ""
        },
        theme: {
          color: "#4A154B"
        },
        handler: async (response) => {
          await MembershipPage.handlePaymentSuccess(response, totalAmount, selectedFamilyList);
        },
        modal: {
          ondismiss: function() {
            if (payBtn) {
              payBtn.disabled = false;
              payBtn.innerHTML = originalBtnContent;
            }
          }
        }
      };

      if (orderId) {
        options.order_id = orderId;
      }

      const rzp = new Razorpay(options);

      rzp.on('payment.failed', function(response) {
        console.error('Razorpay Error:', response.error);
        alert(`Payment Incomplete: ${response.error.description || 'Transaction was not completed.'}`);
        if (payBtn) {
          payBtn.disabled = false;
          payBtn.innerHTML = originalBtnContent;
        }
      });

      rzp.open();

    } catch (err) {
      console.error('Initiate payment error:', err);
      alert(err.message || 'Payment could not be initialized.');
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.innerHTML = originalBtnContent;
      }
    }
  },

  async handlePaymentSuccess(razorpayResponse, amount, coveredFamily) {
    const activeMobile = this.currentUser.mobile;
    const today = new Date();
    const expiry = new Date();
    expiry.setFullYear(today.getFullYear() + 1); // 1 Year validity

    const selectedFamilyIds = coveredFamily.map(f => f.id);

    const membershipRecord = {
      status: 'Membership',
      plan: 'CarePass 1 Year VIP',
      amount: amount,
      paymentId: razorpayResponse.razorpay_payment_id || ('PAY_' + Date.now()),
      startDate: today.toISOString(),
      expiryDate: expiry.toISOString(),
      coveredFamilyIds: selectedFamilyIds
    };

    // 1. LocalStorage Update
    localStorage.setItem(`selfcare_membership_${activeMobile}`, JSON.stringify(membershipRecord));
    localStorage.setItem('selfcare_is_vip_member', 'true');

    let storedUser = {};
    try {
      storedUser = JSON.parse(localStorage.getItem(`selfcare_profile_${activeMobile}`) || '{}');
    } catch (e) {}
    storedUser.membership = 'Membership';
    localStorage.setItem(`selfcare_profile_${activeMobile}`, JSON.stringify(storedUser));

    this.familyMembers = this.familyMembers.map(m => {
      if (selectedFamilyIds.includes(m.id)) {
        return { ...m, membership: 'Membership' };
      }
      return m.membership ? m : { ...m, membership: 'Regular' };
    });
    localStorage.setItem('selfcare_family_members', JSON.stringify(this.familyMembers));
    localStorage.setItem(`selfcare_family_${activeMobile}`, JSON.stringify(this.familyMembers));

    // 2. Google Sheets Backend Sync
    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      try {
        await Api.request('saveMembership', {
          mobile: activeMobile,
          primaryUserId: this.currentUser.userId,
          paymentId: membershipRecord.paymentId,
          amount: amount,
          expiryDate: membershipRecord.expiryDate,
          familyMemberIds: JSON.stringify(selectedFamilyIds)
        }, false);
      } catch (err) {
        console.warn('[Membership] Backend sync warning:', err);
      }
    }

    alert(`🎉 Congratulations! Your 1-Year Selfcare VIP Membership is now Active.\nPayment ID: ${membershipRecord.paymentId}`);
    window.location.href = 'profile.html';
  },

  toggleAddMemberModal(show) {
    const modal = document.getElementById('quick-add-modal');
    if (modal) modal.style.display = show ? 'flex' : 'none';
  },

  handleSaveQuickMember() {
    const name = document.getElementById('quick-name').value.trim();
    const relation = document.getElementById('quick-relation').value;
    const age = document.getElementById('quick-age').value.trim();
    const mobile = document.getElementById('quick-mobile').value.trim();

    if (!name) {
      alert('Please enter member name');
      return;
    }

    const newMember = {
      id: 'FAM_' + Date.now(),
      name: name,
      relation: relation,
      age: age,
      mobile: mobile,
      membership: 'Regular'
    };

    this.familyMembers.push(newMember);
    this.selectedMemberIds.add(newMember.id);

    const activeMobile = this.currentUser.mobile;
    const serialized = JSON.stringify(this.familyMembers);
    localStorage.setItem('selfcare_family_members', serialized);
    if (activeMobile) localStorage.setItem(`selfcare_family_${activeMobile}`, serialized);

    this.toggleAddMemberModal(false);
    this.renderFamilyOptions();
    this.calculateTotal();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  MembershipPage.init();
});
