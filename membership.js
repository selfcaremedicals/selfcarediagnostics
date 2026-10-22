/* file: assets/js/membership.js */
/**
 * Selfcare Diagnostics - VIP Membership & Razorpay Controller v2.0.0
 * Features:
 * - Dynamic Paid / Unpaid Status with Date & Time display
 * - Checkbox only for unpaid members (No mandatory tick)
 * - Selective Primary User billing
 * - Instant 👑 Crown reflection & Broadcast
 */

const MembershipPage = {
  PER_HEAD_PRICE: 99,
  currentUser: null,
  familyMembers: [],
  selectedMemberIds: new Set(),
  isPrimarySelected: false,
  isPrimaryVip: false,
  primaryExpiry: null,

  async init() {
    this.loadUserData();
    this.checkExistingMembership();
    this.renderPrimaryUser();
    this.renderFamilyOptions();
    this.calculateTotal();
  },

  loadUserData() {
    const activeMobile = localStorage.getItem('selfcare_active_user') || '';

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
            this.isPrimaryVip = true;
            this.primaryExpiry = exp;

            const banner = document.getElementById('already-member-banner');
            const validText = document.getElementById('membership-validity-text');
            if (banner) banner.style.display = 'flex';
            if (validText) validText.textContent = `Valid until: ${this.formatDateTime(exp)}`;
          }
        }
      } catch (e) {}
    }
  },

  formatDateTime(dateObj) {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${dateStr} at ${timeStr}`;
  },

  renderPrimaryUser() {
    const container = document.getElementById('primary-user-container');
    if (!container) return;

    const safeName = (typeof Utils !== 'undefined' && Utils.escapeHtml) 
      ? Utils.escapeHtml(this.currentUser.name) 
      : this.currentUser.name;

    if (this.isPrimaryVip) {
      container.innerHTML = `
        <div class="member-select-row vip-active-card">
          <div class="vip-badge-icon">👑</div>
          <div class="member-row-info">
            <div class="name-line">
              <strong>${safeName}</strong>
              <span class="relation-tag vip-tag">Primary (You) • VIP</span>
            </div>
            <span class="member-sub">${this.currentUser.mobile ? '+91 ' + this.currentUser.mobile : 'Active Account'}</span>
            <span class="validity-time-green">✔ Active • Valid till: ${this.formatDateTime(this.primaryExpiry)}</span>
          </div>
          <div class="paid-status-text">PAID</div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="member-select-row ${this.isPrimarySelected ? 'selected' : ''}" onclick="MembershipPage.togglePrimarySelect()">
          <label class="custom-checkbox" onclick="event.stopPropagation()">
            <input type="checkbox" id="chk_primary" ${this.isPrimarySelected ? 'checked' : ''} onchange="MembershipPage.togglePrimarySelect()">
            <span class="checkmark"></span>
          </label>
          <div class="member-row-info">
            <div class="name-line">
              <strong>${safeName}</strong>
              <span class="relation-tag self-tag">Primary (You)</span>
            </div>
            <span class="member-sub">${this.currentUser.mobile ? '+91 ' + this.currentUser.mobile : 'Active Account'}</span>
          </div>
          <div class="row-price">₹99</div>
        </div>
      `;
    }
  },

  togglePrimarySelect() {
    if (this.isPrimaryVip) return;
    this.isPrimarySelected = !this.isPrimarySelected;
    this.renderPrimaryUser();
    this.calculateTotal();
  },

  renderFamilyOptions() {
    const container = document.getElementById('family-members-selection-list');
    if (!container) return;

    if (!this.familyMembers || this.familyMembers.length === 0) {
      container.innerHTML = `
        <div style="font-size:12px; color:#6B7280; padding:10px 0; text-align:center;">
          No family members saved yet. Click below to add.
        </div>
      `;
      return;
    }

    container.innerHTML = this.familyMembers.map(m => {
      const isVip = m.membership === 'Membership' && m.expiryDate && new Date(m.expiryDate) > new Date();
      const isSelected = this.selectedMemberIds.has(m.id);
      const safeName = (typeof Utils !== 'undefined' && Utils.escapeHtml) ? Utils.escapeHtml(m.name) : m.name;

      if (isVip) {
        return `
          <div class="member-select-row vip-active-card">
            <div class="vip-badge-icon">👑</div>
            <div class="member-row-info">
              <div class="name-line">
                <strong>${safeName}</strong>
                <span class="relation-tag vip-tag">${m.relation || 'Member'} • VIP</span>
              </div>
              <span class="member-sub">${m.age ? m.age + ' Yrs • ' : ''}${m.mobile ? '+91 ' + m.mobile : 'Same address'}</span>
              <span class="validity-time-green">✔ Active • Valid till: ${this.formatDateTime(m.expiryDate)}</span>
            </div>
            <div class="paid-status-text">PAID</div>
          </div>
        `;
      } else {
        return `
          <div class="member-select-row ${isSelected ? 'selected' : ''}" onclick="MembershipPage.toggleFamilySelect('${m.id}')">
            <label class="custom-checkbox" onclick="event.stopPropagation()">
              <input type="checkbox" id="chk_${m.id}" ${isSelected ? 'checked' : ''} onchange="MembershipPage.toggleFamilySelect('${m.id}')">
              <span class="checkmark"></span>
            </label>
            <div class="member-row-info">
              <div class="name-line">
                <strong>${safeName}</strong>
                <span class="relation-tag">${m.relation || 'Member'}</span>
              </div>
              <span class="member-sub">${m.age ? m.age + ' Yrs • ' : ''}${m.mobile ? '+91 ' + m.mobile : 'Same address'}</span>
            </div>
            <div class="row-price">+₹99</div>
          </div>
        `;
      }
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
    const isPrimaryBilled = !this.isPrimaryVip && this.isPrimarySelected;
    const primaryCount = isPrimaryBilled ? 1 : 0;
    const familyCount = this.selectedMemberIds.size;
    const totalCount = primaryCount + familyCount;
    const totalAmount = totalCount * this.PER_HEAD_PRICE;

    const primaryBillRow = document.getElementById('bill-primary-row');
    const famRow = document.getElementById('bill-family-row');
    const famCountEl = document.getElementById('bill-family-count');
    const famAmtEl = document.getElementById('bill-family-amount');
    const grandTotalEl = document.getElementById('bill-grand-total');
    const ctaBtn = document.getElementById('pay-razorpay-btn');
    const ctaText = document.getElementById('cta-btn-text');

    if (primaryBillRow) primaryBillRow.style.display = isPrimaryBilled ? 'flex' : 'none';

    if (familyCount > 0) {
      if (famRow) famRow.style.display = 'flex';
      if (famCountEl) famCountEl.textContent = familyCount;
      if (famAmtEl) famAmtEl.textContent = `₹${familyCount * this.PER_HEAD_PRICE}`;
    } else {
      if (famRow) famRow.style.display = 'none';
    }

    if (grandTotalEl) grandTotalEl.textContent = `₹${totalAmount}`;

    if (ctaBtn && ctaText) {
      if (totalCount === 0) {
        ctaBtn.disabled = true;
        ctaText.textContent = 'Select a member to activate VIP';
      } else {
        ctaBtn.disabled = false;
        ctaText.textContent = `Pay ₹${totalAmount} Online & Activate VIP`;
      }
    }
  },

  async initiatePayment() {
    const activeMobile = this.currentUser.mobile;
    if (!activeMobile) {
      alert('Please log in with your mobile number to purchase VIP Membership.');
      window.location.href = 'customer.html';
      return;
    }

    const isPrimaryBilled = !this.isPrimaryVip && this.isPrimarySelected;
    const totalMembers = (isPrimaryBilled ? 1 : 0) + this.selectedMemberIds.size;
    const totalAmount = totalMembers * this.PER_HEAD_PRICE;

    if (totalMembers === 0) {
      alert('Please select at least one member to activate VIP.');
      return;
    }

    const selectedFamilyList = this.familyMembers.filter(m => this.selectedMemberIds.has(m.id));
    const payBtn = document.getElementById('pay-razorpay-btn');
    const originalBtnContent = payBtn ? payBtn.innerHTML : '';

    try {
      if (payBtn) {
        payBtn.disabled = true;
        payBtn.innerHTML = '<span>⏳ Preparing Secure Payment...</span>';
      }

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

      const options = {
        key: razorpayKey,
        amount: totalAmount * 100,
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
          await MembershipPage.handlePaymentSuccess(response, totalAmount, selectedFamilyList, isPrimaryBilled);
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

      if (orderId) options.order_id = orderId;

      const rzp = new Razorpay(options);
      rzp.on('payment.failed', function(response) {
        alert(`Payment Incomplete: ${response.error.description || 'Transaction was not completed.'}`);
        if (payBtn) {
          payBtn.disabled = false;
          payBtn.innerHTML = originalBtnContent;
        }
      });

      rzp.open();

    } catch (err) {
      console.error(err);
      alert(err.message || 'Payment could not be initialized.');
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.innerHTML = originalBtnContent;
      }
    }
  },

  async handlePaymentSuccess(razorpayResponse, amount, coveredFamily, primaryIncluded) {
    const activeMobile = this.currentUser.mobile;
    const today = new Date();
    const expiry = new Date();
    expiry.setFullYear(today.getFullYear() + 1);

    const selectedFamilyIds = coveredFamily.map(f => f.id);

    // 1. Primary User Update
    if (primaryIncluded) {
      const membershipRecord = {
        status: 'Membership',
        plan: 'CarePass 1 Year VIP',
        amount: amount,
        paymentId: razorpayResponse.razorpay_payment_id || ('PAY_' + Date.now()),
        startDate: today.toISOString(),
        expiryDate: expiry.toISOString()
      };
      localStorage.setItem(`selfcare_membership_${activeMobile}`, JSON.stringify(membershipRecord));
      localStorage.setItem('selfcare_is_vip_member', 'true');

      let storedUser = {};
      try {
        storedUser = JSON.parse(localStorage.getItem(`selfcare_profile_${activeMobile}`) || '{}');
      } catch (e) {}
      storedUser.membership = 'Membership';
      storedUser.vipExpiry = expiry.toISOString();
      localStorage.setItem(`selfcare_profile_${activeMobile}`, JSON.stringify(storedUser));
    }

    // 2. Family Members Update with Expiry
    this.familyMembers = this.familyMembers.map(m => {
      if (selectedFamilyIds.includes(m.id)) {
        return { 
          ...m, 
          membership: 'Membership', 
          expiryDate: expiry.toISOString() 
        };
      }
      return m;
    });

    localStorage.setItem('selfcare_family_members', JSON.stringify(this.familyMembers));
    localStorage.setItem(`selfcare_family_${activeMobile}`, JSON.stringify(this.familyMembers));

    // 3. Google Sheets Backend Sync
    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      try {
        await Api.request('saveMembership', {
          mobile: activeMobile,
          primaryUserId: this.currentUser.userId,
          paymentId: razorpayResponse.razorpay_payment_id || ('PAY_' + Date.now()),
          amount: amount,
          expiryDate: expiry.toISOString(),
          primaryIncluded: primaryIncluded,
          familyMemberIds: JSON.stringify(selectedFamilyIds)
        }, false);
      } catch (err) {
        console.warn('Backend sync warning:', err);
      }
    }

    // 4. Trigger Instant 👑 Crown in App UI
    if (typeof App !== 'undefined' && App.notifyVipSuccess) {
      App.notifyVipSuccess();
    }

    // 5. Success Modal Alert
    this.showSuccessModal(expiry);
  },

  showSuccessModal(expiry) {
    const formattedDate = this.formatDateTime(expiry);
    const modalHtml = `
      <div id="vip-success-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:99999; padding:20px; backdrop-filter:blur(4px);">
        <div style="background:#fff; border-radius:18px; padding:24px; max-width:340px; width:100%; text-align:center; box-shadow:0 15px 35px rgba(0,0,0,0.3); animation: popModal 0.3s ease;">
          <div style="font-size:48px; margin-bottom:10px; filter:drop-shadow(0 2px 5px rgba(245,158,11,0.5));">👑</div>
          <h3 style="color:#4A154B; margin:0 0 8px 0; font-size:20px; font-weight:800;">VIP Membership Activated!</h3>
          <p style="color:#4B5563; font-size:13px; line-height:1.5; margin:0 0 16px 0;">
            Congratulations! VIP Crown status is now active across all member accounts.
          </p>
          <div style="background:#F0FDF4; border:1px solid #86EFAC; border-radius:10px; padding:10px; font-size:12px; color:#15803D; margin-bottom:20px; font-weight:600;">
            ✔ Valid till: ${formattedDate}
          </div>
          <button onclick="window.location.reload();" style="width:100%; background:linear-gradient(135deg, #078866, #045D49); color:#fff; border:none; padding:13px; border-radius:12px; font-weight:800; font-size:14px; cursor:pointer; box-shadow:0 4px 12px rgba(7,136,102,0.3);">
            Done & View Status
          </button>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
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
