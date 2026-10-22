/* file: assets/js/membership.js */
/**
 * Selfcare Diagnostics - VIP Membership & Razorpay Controller v2.1.0
 * Features:
 * - Automatic Live Backend Sync (Google Sheets) on Page Load
 * - 10-Digit Mobile Sanitization (removes +91, spaces, dashes)
 * - Dynamic Paid / Unpaid Status with Date & Time display
 * - Checkbox only for unpaid members (PAID members show Crown & Validity)
 * - Selective Primary User billing
 * - Family Members Cloud Sync & Instant 👑 Crown reflection
 */

const MembershipPage = {
  PER_HEAD_PRICE: 99,
  currentUser: null,
  familyMembers: [],
  selectedMemberIds: new Set(),
  isPrimarySelected: false,
  isPrimaryVip: false,
  primaryExpiry: null,

  // Mobile number-ai 10 digits-aaga normalize seiyum helper
  cleanMobile(mobile) {
    return String(mobile || '').replace(/\D/g, '').slice(-10);
  },

  async init() {
    this.loadUserData();
    this.checkExistingMembership(); // Local cache check (Instant UI)
    this.renderPrimaryUser();
    this.renderFamilyOptions();
    this.calculateTotal();

    // Live Backend Sync from Google Sheets
    await this.syncMembershipFromBackend();
  },

  loadUserData() {
    const rawActive = localStorage.getItem('selfcare_active_user') || '';
    const activeMobile = this.cleanMobile(rawActive);

    let storedUser = null;
    try {
      const rawUser = localStorage.getItem(`selfcare_profile_${activeMobile}`) 
                   || localStorage.getItem('selfcare_permanent_user')
                   || localStorage.getItem(`selfcare_profile_${rawActive}`);
      if (rawUser) storedUser = JSON.parse(rawUser);
    } catch (e) {}

    const userMobile = activeMobile || this.cleanMobile(storedUser && storedUser.mobile);

    this.currentUser = {
      name: (storedUser && storedUser.name) || 'Valued Customer',
      mobile: userMobile,
      email: (storedUser && storedUser.email) || '',
      userId: (storedUser && storedUser.userId) || ('SCD_' + userMobile),
      membership: (storedUser && storedUser.membership) || 'Regular'
    };

    try {
      let rawFam = localStorage.getItem(`selfcare_family_${userMobile}`) 
                || localStorage.getItem(`selfcare_family_${rawActive}`)
                || localStorage.getItem('selfcare_family_members');
      this.familyMembers = rawFam ? JSON.parse(rawFam) : [];
    } catch (e) {
      this.familyMembers = [];
    }
  },

  checkExistingMembership() {
    const activeMobile = this.currentUser.mobile;
    if (!activeMobile) return;

    const cacheKey = `selfcare_membership_${activeMobile}`;
    const raw = localStorage.getItem(cacheKey);

    if (raw) {
      try {
        const mem = JSON.parse(raw);
        if (mem && (mem.status === 'Membership' || mem.membership === 'Membership')) {
          const exp = new Date(mem.expiryDate || mem.vipExpiry);
          if (!isNaN(exp.getTime()) && exp > new Date()) {
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

  // GOOGLE SHEETS BACKEND-IL IRUNDHU LIVE DATA FETCH SEIYUM FUNCTION
  async syncMembershipFromBackend() {
    const activeMobile = this.currentUser.mobile;
    if (!activeMobile || activeMobile.length !== 10) return;

    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      try {
        const res = await Api.request('getMembershipStatus', { mobile: activeMobile }, false);
        const data = (res && res.data) ? res.data : res;

        if (data && (data.status === 'success' || data.success === true || data.isMember !== undefined)) {
          let updated = false;

          // 1. Primary User VIP Check
          const isVip = data.isPrimaryVip || data.isMember;
          const expiryStr = data.primaryExpiry || data.expiryDate;

          if (isVip && expiryStr) {
            const exp = new Date(expiryStr);
            if (!isNaN(exp.getTime()) && exp > new Date()) {
              this.isPrimaryVip = true;
              this.primaryExpiry = exp;
              this.currentUser.membership = 'Membership';
              this.isPrimarySelected = false; // Already paid aagiyathaal bill panna vendam

              // Local storage sync
              localStorage.setItem(`selfcare_membership_${activeMobile}`, JSON.stringify({
                status: 'Membership',
                membership: 'Membership',
                expiryDate: exp.toISOString()
              }));
              localStorage.setItem('selfcare_is_vip_member', 'true');

              const banner = document.getElementById('already-member-banner');
              const validText = document.getElementById('membership-validity-text');
              if (banner) banner.style.display = 'flex';
              if (validText) validText.textContent = `Valid until: ${this.formatDateTime(exp)}`;

              updated = true;
            }
          }

          // 2. Family Members VIP Sync
          const paidIds = data.paidFamilyMemberIds || [];
          const expiryMap = data.familyExpiryMap || {};

          if (Array.isArray(data.familyMembers) && data.familyMembers.length > 0) {
            this.familyMembers = data.familyMembers.map(serverMember => {
              const localMatch = this.familyMembers.find(f => f.id === serverMember.id) || {};
              return { ...localMatch, ...serverMember };
            });
            updated = true;
          } else if (paidIds.length > 0) {
            this.familyMembers = this.familyMembers.map(m => {
              if (paidIds.includes(m.id)) {
                this.selectedMemberIds.delete(m.id);
                return {
                  ...m,
                  membership: 'Membership',
                  expiryDate: expiryMap[m.id] || expiryStr
                };
              }
              return m;
            });
            updated = true;
          }

          // UI-ai instant-aaga update seigirom
          if (updated) {
            localStorage.setItem('selfcare_family_members', JSON.stringify(this.familyMembers));
            localStorage.setItem(`selfcare_family_${activeMobile}`, JSON.stringify(this.familyMembers));

            this.renderPrimaryUser();
            this.renderFamilyOptions();
            this.calculateTotal();
          }
        }
      } catch (err) {
        console.warn('Membership backend sync warning:', err);
      }
    }
  },

  formatDateTime(dateObj) {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    if (isNaN(d.getTime())) return '';
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

    const displayMobile = this.currentUser.mobile ? '+91 ' + this.currentUser.mobile : 'Active Account';

    // ALREADY PAID AANA PRIMARY USER KATCHI
    if (this.isPrimaryVip) {
      container.innerHTML = `
        <div class="member-select-row vip-active-card">
          <div class="vip-badge-icon">👑</div>
          <div class="member-row-info">
            <div class="name-line">
              <strong>${safeName}</strong>
              <span class="relation-tag vip-tag">PRIMARY (YOU) • VIP</span>
            </div>
            <span class="member-sub">${displayMobile}</span>
            <span class="validity-time-green">✔ Active • Valid till: ${this.formatDateTime(this.primaryExpiry)}</span>
          </div>
          <div class="paid-status-text">PAID</div>
        </div>
      `;
    } else {
      // UNPAID STATE
      container.innerHTML = `
        <div class="member-select-row ${this.isPrimarySelected ? 'selected' : ''}" onclick="MembershipPage.togglePrimarySelect()">
          <label class="custom-checkbox" onclick="event.stopPropagation()">
            <input type="checkbox" id="chk_primary" ${this.isPrimarySelected ? 'checked' : ''} onchange="MembershipPage.togglePrimarySelect()">
            <span class="checkmark"></span>
          </label>
          <div class="member-row-info">
            <div class="name-line">
              <strong>${safeName}</strong>
              <span class="relation-tag self-tag">PRIMARY (YOU)</span>
            </div>
            <span class="member-sub">${displayMobile}</span>
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
      const relationUpper = String(m.relation || 'Member').toUpperCase();
      const memberSub = `${m.age ? m.age + ' Yrs • ' : ''}${m.mobile ? '+91 ' + m.mobile : 'Same address'}`;

      // ALREADY PAID AANA FAMILY MEMBER KATCHI
      if (isVip) {
        return `
          <div class="member-select-row vip-active-card">
            <div class="vip-badge-icon">👑</div>
            <div class="member-row-info">
              <div class="name-line">
                <strong>${safeName}</strong>
                <span class="relation-tag vip-tag">${relationUpper} • VIP</span>
              </div>
              <span class="member-sub">${memberSub}</span>
              <span class="validity-time-green">✔ Active • Valid till: ${this.formatDateTime(m.expiryDate)}</span>
            </div>
            <div class="paid-status-text">PAID</div>
          </div>
        `;
      } else {
        // UNPAID STATE
        return `
          <div class="member-select-row ${isSelected ? 'selected' : ''}" onclick="MembershipPage.toggleFamilySelect('${m.id}')">
            <label class="custom-checkbox" onclick="event.stopPropagation()">
              <input type="checkbox" id="chk_${m.id}" ${isSelected ? 'checked' : ''} onchange="MembershipPage.toggleFamilySelect('${m.id}')">
              <span class="checkmark"></span>
            </label>
            <div class="member-row-info">
              <div class="name-line">
                <strong>${safeName}</strong>
                <span class="relation-tag">${relationUpper}</span>
              </div>
              <span class="member-sub">${memberSub}</span>
            </div>
            <div class="row-price">+₹99</div>
          </div>
        `;
      }
    }).join('');
  },

  toggleFamilySelect(memberId) {
    const member = this.familyMembers.find(m => m.id === memberId);
    if (member && member.membership === 'Membership' && member.expiryDate && new Date(member.expiryDate) > new Date()) {
      return; // Already paid aagiyavargalai meendum select seiya koodathu
    }

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
        ctaText.textContent = this.isPrimaryVip ? 'All members up to date' : 'Select a member to activate VIP';
      } else {
        ctaBtn.disabled = false;
        ctaText.textContent = `Pay ₹${totalAmount} Online & Activate VIP`;
      }
    }
  },

  async initiatePayment() {
    const activeMobile = this.currentUser.mobile;
    if (!activeMobile || activeMobile.length !== 10) {
      alert('Please log in with a valid 10-digit mobile number to purchase VIP Membership.');
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
      this.isPrimaryVip = true;
      this.primaryExpiry = expiry;
      this.currentUser.membership = 'Membership';
      this.isPrimarySelected = false;

      const membershipRecord = {
        status: 'Membership',
        membership: 'Membership',
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

    this.selectedMemberIds.clear();

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
          familyMemberIds: JSON.stringify(selectedFamilyIds),
          familyMembers: JSON.stringify(coveredFamily)
        }, false);
      } catch (err) {
        console.warn('Backend sync warning:', err);
      }
    }

    // 4. Trigger Instant 👑 Crown in App UI
    if (typeof App !== 'undefined' && App.notifyVipSuccess) {
      App.notifyVipSuccess();
    }

    // 5. Re-render UI
    this.renderPrimaryUser();
    this.renderFamilyOptions();
    this.calculateTotal();

    // 6. Success Modal Alert
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
          <button onclick="document.getElementById('vip-success-modal').remove(); window.location.reload();" style="width:100%; background:linear-gradient(135deg, #078866, #045D49); color:#fff; border:none; padding:13px; border-radius:12px; font-weight:800; font-size:14px; cursor:pointer; box-shadow:0 4px 12px rgba(7,136,102,0.3);">
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

  async handleSaveQuickMember() {
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

    // Backend Cloud Vault Sync
    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function' && activeMobile) {
      try {
        Api.request('saveFamilyMember', {
          primaryMobile: activeMobile,
          primaryUserId: this.currentUser.userId,
          primaryUserName: this.currentUser.name,
          id: newMember.id,
          name: newMember.name,
          relation: newMember.relation,
          age: newMember.age,
          mobile: newMember.mobile,
          membership: 'Regular'
        }, false);
      } catch (e) {}
    }

    this.toggleAddMemberModal(false);
    this.renderFamilyOptions();
    this.calculateTotal();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  MembershipPage.init();
});
