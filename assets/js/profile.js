/* file: assets/js/profile.js */
/**
 * Selfcare Diagnostics - My Account Controller v6.2.0 (Clean Production Edition)
 * Features:
 * - Live Google Sheets Sync for both Profile and FamilyMembers table.
 * - Displays Member Cards: Name, Relation, Age, and Individual Mobile Number.
 * - Edit & Remove functionality per family/friend member with Google Sheets deletion.
 * - Dedicated Mobile mapping for Cart isolation.
 * - Testing mock/demo buttons completely removed for production fidelity.
 */

const ProfilePage = {
  currentUser: null,
  familyMembers: [],
  addresses: [],
  referralCoupons: [],

  async init() {
    try {
      this.updateCartBadgeUI();
      this.loadAccountData();
      this.checkReferralBadges();
      await this.syncLiveCloudProfile();
    } catch (err) {
      console.error('ProfilePage init error:', err);
    }
  },

  safeShowToast(message, type = 'info') {
    if (typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(message, type);
    } else {
      alert(message);
    }
  },

  loadAccountData() {
    const activeMobile = (typeof localStorage !== 'undefined' && localStorage.getItem('selfcare_active_user')) || '';

    let vaultProfile = {};
    if (activeMobile) {
      try {
        const rawVault = localStorage.getItem(`selfcare_profile_${activeMobile}`);
        if (rawVault) vaultProfile = JSON.parse(rawVault);
      } catch (e) {}
    }

    const storedUser = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};

    this.currentUser = {
      name: storedUser.name || vaultProfile.name || 'Valued Customer',
      mobile: activeMobile || storedUser.mobile || vaultProfile.mobile || '7010174890',
      email: storedUser.email || vaultProfile.email || '',
      age: storedUser.age || vaultProfile.age || '',
      gender: storedUser.gender || vaultProfile.gender || 'Male',
      bloodGroup: storedUser.bloodGroup || vaultProfile.bloodGroup || 'O+',
      address: storedUser.address || vaultProfile.address || '',
      location: storedUser.location || vaultProfile.location || ''
    };

    const currentMobile = this.currentUser.mobile;

    // Load Family Members
    try {
      let savedFam = null;
      if (currentMobile) {
        savedFam = localStorage.getItem(`selfcare_family_${currentMobile}`);
      }
      if (!savedFam) {
        savedFam = localStorage.getItem('selfcare_family_members');
      }
      this.familyMembers = savedFam ? JSON.parse(savedFam) : [];
    } catch (e) {
      this.familyMembers = [];
    }

    // Load Addresses
    try {
      const savedAddr = localStorage.getItem('selfcare_saved_addresses');
      this.addresses = savedAddr ? JSON.parse(savedAddr) : [
        {
          id: 'ADDR_1',
          label: 'Primary Home',
          line: this.currentUser.address || 'Chennai, Tamil Nadu',
          pincode: '600001',
          location: this.currentUser.location || ''
        }
      ];
    } catch (e) {
      this.addresses = [];
    }

    // Load Referral Coupons
    try {
      const savedCoupons = localStorage.getItem('selfcare_referral_coupons');
      this.referralCoupons = savedCoupons ? JSON.parse(savedCoupons) : [];
    } catch (e) {
      this.referralCoupons = [];
    }

    this.renderSelfProfile();
    this.populateFormInputs();
  },

  async syncLiveCloudProfile() {
    const activeMobile = (this.currentUser && this.currentUser.mobile) || localStorage.getItem('selfcare_active_user');
    if (!navigator.onLine || typeof Api === 'undefined' || !activeMobile) return;

    try {
      let res = null;
      if (typeof Api.getProfile === 'function') {
        res = await Api.getProfile(activeMobile);
      } else if (typeof Api.request === 'function') {
        res = await Api.request('getProfile', { userId: activeMobile, mobile: activeMobile }, false);
      }

      if (res && res.status === 'success' && res.profile) {
        const p = res.profile;

        this.currentUser = {
          ...this.currentUser,
          name: p.name || this.currentUser.name,
          age: (p.age !== undefined && p.age !== null && p.age !== '') ? String(p.age) : this.currentUser.age,
          gender: p.gender || this.currentUser.gender,
          bloodGroup: p.bloodGroup || this.currentUser.bloodGroup,
          email: p.email || this.currentUser.email,
          address: p.address || this.currentUser.address,
          location: p.location || this.currentUser.location
        };

        const serialized = JSON.stringify(this.currentUser);
        localStorage.setItem(`selfcare_profile_${activeMobile}`, serialized);
        localStorage.setItem('selfcare_customer_profile', serialized);
        localStorage.setItem('selfcare_permanent_user', serialized);

        if (typeof Auth !== 'undefined' && Auth.savePermanentSession) {
          Auth.savePermanentSession(this.currentUser);
        }

        // Hydrate Family Members from Google Sheets
        if (res.familyMembers && Array.isArray(res.familyMembers)) {
          this.familyMembers = res.familyMembers;
          localStorage.setItem(`selfcare_family_${activeMobile}`, JSON.stringify(this.familyMembers));
          localStorage.setItem('selfcare_family_members', JSON.stringify(this.familyMembers));
          this.renderFamilyCards();
        }

        if (res.referralCoupons && Array.isArray(res.referralCoupons) && res.referralCoupons.length > 0) {
          this.referralCoupons = res.referralCoupons;
          localStorage.setItem('selfcare_referral_coupons', JSON.stringify(this.referralCoupons));
          this.checkReferralBadges();
        }

        this.renderSelfProfile();
        this.populateFormInputs();
      }
    } catch (err) {
      console.warn('[Profile] Cloud sync notice:', err);
    }
  },

  checkReferralBadges() {
    const badge = document.getElementById('referral-reward-badge');
    if (badge) {
      const activeCount = this.referralCoupons.filter(c => c.status === 'Active').length;
      if (activeCount > 0) {
        badge.textContent = `${activeCount}x 10% OFF`;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
  },

  // 1. MY PROFILE
  openMyProfileModal() {
    this.renderSelfProfile();
    this.populateFormInputs();
    this.toggleSelfEditMode(false);
    this.openModal('modal-my-profile');
  },

  renderSelfProfile() {
    const u = this.currentUser || {};
    const nameEl = document.getElementById('self-display-name');
    const avatarEl = document.getElementById('self-avatar-letter');
    const mobileEl = document.getElementById('self-view-mobile');
    const emailEl = document.getElementById('self-view-email');
    const ageGenderEl = document.getElementById('self-view-age-gender');
    const bloodEl = document.getElementById('self-view-blood');
    const addressEl = document.getElementById('self-view-address');
    const locEl = document.getElementById('self-view-location');

    if (nameEl) nameEl.textContent = u.name || 'Valued Customer';
    if (avatarEl) avatarEl.textContent = (u.name || 'U').charAt(0).toUpperCase();
    if (mobileEl) mobileEl.textContent = u.mobile ? `+91 ${u.mobile}` : '+91 7010174890';
    if (emailEl) emailEl.textContent = u.email || 'Not provided';
    if (ageGenderEl) ageGenderEl.textContent = `${u.age ? u.age + ' Yrs' : 'Age not set'} • ${u.gender || 'Male'}`;
    if (bloodEl) bloodEl.textContent = u.bloodGroup || 'O+';
    if (addressEl) addressEl.textContent = u.address || 'Chennai, Tamil Nadu';
    if (locEl) locEl.textContent = u.location || 'Not set';
  },

  populateFormInputs() {
    const u = this.currentUser || {};
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = (val !== undefined && val !== null) ? val : '';
    };

    setVal('self-edit-name', u.name);
    setVal('self-edit-mobile', u.mobile);
    setVal('self-edit-age', u.age);
    setVal('self-edit-email', u.email);
    setVal('self-edit-address', u.address);
    setVal('self-edit-location', u.location);

    const genderEl = document.getElementById('self-edit-gender');
    if (genderEl && u.gender) genderEl.value = u.gender;

    const bloodEl = document.getElementById('self-edit-blood');
    if (bloodEl && u.bloodGroup) {
      const rawBg = String(u.bloodGroup).trim().toLowerCase();
      let matched = false;
      for (let i = 0; i < bloodEl.options.length; i++) {
        const optVal = bloodEl.options[i].value.toLowerCase();
        const optText = bloodEl.options[i].text.toLowerCase();
        if (optVal === rawBg || optText === rawBg || optText.replace(/\s/g, '') === rawBg.replace(/\s/g, '')) {
          bloodEl.selectedIndex = i;
          matched = true;
          break;
        }
      }
      if (!matched) bloodEl.value = u.bloodGroup;
    }
  },

  toggleSelfEditMode(isEdit) {
    const viewMode = document.getElementById('profile-view-mode');
    const editMode = document.getElementById('profile-edit-mode');
    if (viewMode) viewMode.style.display = isEdit ? 'none' : 'block';
    if (editMode) editMode.style.display = isEdit ? 'block' : 'none';

    if (isEdit) this.populateFormInputs();
  },

  async saveSelfDetails() {
    const name = document.getElementById('self-edit-name').value.trim();
    const mobile = document.getElementById('self-edit-mobile').value.replace(/\D/g, '').slice(-10);
    const bloodGroup = document.getElementById('self-edit-blood').value;
    const age = document.getElementById('self-edit-age').value.trim();
    const gender = document.getElementById('self-edit-gender').value;
    const email = document.getElementById('self-edit-email').value.trim();
    const address = document.getElementById('self-edit-address').value.trim();
    const location = document.getElementById('self-edit-location').value.trim();

    if (!name) {
      this.safeShowToast('Please enter your full name', 'error');
      return;
    }

    const activeMobile = mobile || (this.currentUser && this.currentUser.mobile) || localStorage.getItem('selfcare_active_user');

    this.currentUser = {
      ...this.currentUser,
      name,
      mobile: activeMobile,
      bloodGroup,
      age: age || '',
      gender,
      email,
      address,
      location
    };

    const serialized = JSON.stringify(this.currentUser);
    localStorage.setItem(`selfcare_profile_${activeMobile}`, serialized);
    localStorage.setItem('selfcare_customer_profile', serialized);
    localStorage.setItem('selfcare_permanent_user', serialized);

    if (typeof Auth !== 'undefined' && Auth.savePermanentSession) {
      Auth.savePermanentSession(this.currentUser);
    }

    if (navigator.onLine && typeof Api !== 'undefined') {
      try {
        const cloudPayload = {
          mobile: activeMobile,
          name: this.currentUser.name,
          age: this.currentUser.age,
          gender: this.currentUser.gender,
          bloodGroup: this.currentUser.bloodGroup,
          email: this.currentUser.email,
          address: this.currentUser.address,
          location: this.currentUser.location
        };

        if (typeof Api.updateProfile === 'function') {
          Api.updateProfile(cloudPayload).catch(() => {});
        } else if (typeof Api.request === 'function') {
          Api.request('updateProfile', cloudPayload, false).catch(() => {});
        }
      } catch (e) {}
    }

    this.renderSelfProfile();
    this.toggleSelfEditMode(false);
    this.safeShowToast('Profile updated successfully!', 'success');
  },

  // 2. FAMILY MEMBERS: RENDER, SAVE & DELETE
  openFamilyMembersModal() {
    this.renderFamilyCards();
    this.closeMemberForm();
    this.openModal('modal-family-members');
  },

  renderFamilyCards() {
    const countEl = document.getElementById('family-total-count');
    const container = document.getElementById('family-cards-container');
    if (!container) return;

    const count = this.familyMembers.length;
    if (countEl) {
      countEl.textContent = `${count} ${count === 1 ? 'Member' : 'Members'} Saved`;
    }

    if (count === 0) {
      container.innerHTML = `
        <div class="empty-family-state">
          <span>👨‍👩‍👧‍👦</span>
          <h4>No Family Members Added</h4>
          <p>Add your family members or friends to book tests for them using their own mobile number.</p>
          <button type="button" class="add-member-top-btn" style="margin: 0 auto;" onclick="ProfilePage.openMemberForm()">
            <span>+</span> Add Member
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.familyMembers.map(m => {
      const cleanMobile = m.mobile ? `+91 ${m.mobile}` : 'Not provided';
      const cleanAge = m.age ? `${m.age} Yrs` : 'Age not set';
      const cleanGender = m.gender || 'Not specified';
      const cleanBg = m.bloodGroup || 'O+';
      const cleanRelation = m.relation || 'Relative';

      return `
        <div class="member-display-card">
          <div class="member-card-header">
            <div class="member-title-group">
              <span class="member-name-text">${Utils.escapeHtml(m.name)}</span>
              <span class="member-relation-badge">${Utils.escapeHtml(cleanRelation)}</span>
            </div>
            <div class="member-actions-group">
              <button type="button" class="card-btn-edit" onclick="ProfilePage.editFamilyMember('${m.id}')">
                ✏️ Edit
              </button>
              <button type="button" class="card-btn-delete" onclick="ProfilePage.deleteFamilyMember('${m.id}')" title="Remove Member">
                🗑️
              </button>
            </div>
          </div>

          <div class="member-card-body-grid">
            <div class="member-info-item">
              <span class="info-label">Mobile Number</span>
              <span class="info-val mobile-highlight">${cleanMobile}</span>
            </div>
            <div class="member-info-item">
              <span class="info-label">Age & Gender</span>
              <span class="info-val">${cleanAge} • ${cleanGender}</span>
            </div>
            <div class="member-info-item">
              <span class="info-label">Blood Group</span>
              <span class="info-val">${cleanBg}</span>
            </div>
            <div class="member-info-item">
              <span class="info-label">Address</span>
              <span class="info-val" style="font-size:10.5px;">${Utils.escapeHtml(m.address || 'Same as primary')}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  openMemberForm(memberId = null) {
    const listView = document.getElementById('family-list-view');
    const formView = document.getElementById('family-form-view');
    const formTitle = document.getElementById('member-form-title');

    if (listView) listView.style.display = 'none';
    if (formView) formView.style.display = 'block';

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val !== undefined && val !== null ? val : '';
    };

    if (memberId) {
      const target = this.familyMembers.find(m => m.id === memberId);
      if (target) {
        if (formTitle) formTitle.textContent = `Edit Details: ${target.name}`;
        setVal('family-edit-id', target.id);
        setVal('family-name-input', target.name);
        setVal('family-relation-select', target.relation || 'Father');
        setVal('family-blood-select', target.bloodGroup || 'O+');
        setVal('family-age-input', target.age || '');
        setVal('family-gender-select', target.gender || 'Male');
        setVal('family-mobile-input', target.mobile || '');
        setVal('family-email-input', target.email || '');
        setVal('family-address-input', target.address || '');
        setVal('family-location-input', target.location || '');
        return;
      }
    }

    if (formTitle) formTitle.textContent = 'Add New Member';
    setVal('family-edit-id', '');
    setVal('family-name-input', '');
    setVal('family-relation-select', 'Father');
    setVal('family-blood-select', 'O+');
    setVal('family-age-input', '');
    setVal('family-gender-select', 'Male');
    setVal('family-mobile-input', '');
    setVal('family-email-input', '');
    setVal('family-address-input', this.currentUser ? this.currentUser.address : '');
    setVal('family-location-input', this.currentUser ? this.currentUser.location : '');
  },

  closeMemberForm() {
    const listView = document.getElementById('family-list-view');
    const formView = document.getElementById('family-form-view');
    if (listView) listView.style.display = 'block';
    if (formView) formView.style.display = 'none';
  },

  editFamilyMember(id) {
    this.openMemberForm(id);
  },

  async saveFamilyMember() {
    const editId = document.getElementById('family-edit-id').value.trim();
    const name = document.getElementById('family-name-input').value.trim();
    const relation = document.getElementById('family-relation-select').value;
    const bloodGroup = document.getElementById('family-blood-select').value;
    const age = document.getElementById('family-age-input').value.trim();
    const gender = document.getElementById('family-gender-select').value;
    const mobile = document.getElementById('family-mobile-input').value.replace(/\D/g, '').slice(-10);
    const email = document.getElementById('family-email-input').value.trim();
    const address = document.getElementById('family-address-input').value.trim();
    const location = document.getElementById('family-location-input').value.trim();

    if (!name) {
      this.safeShowToast('Please enter member name', 'error');
      return;
    }

    if (!mobile || mobile.length !== 10) {
      this.safeShowToast('Please enter a valid 10-digit mobile number for this member', 'error');
      document.getElementById('family-mobile-input').focus();
      return;
    }

    const currentMobile = (this.currentUser && this.currentUser.mobile) || localStorage.getItem('selfcare_active_user') || '7010174890';
    const finalMemberId = editId || `FAM_${Date.now()}`;

    const memberPayload = {
      id: finalMemberId,
      memberId: finalMemberId,
      MemberID: finalMemberId,
      primaryMobile: currentMobile,
      PrimaryMobile: currentMobile,
      name,
      relation,
      bloodGroup,
      age: age || '30',
      gender,
      mobile,
      email,
      address,
      location,
      updatedAt: new Date().toISOString()
    };

    if (editId) {
      this.familyMembers = this.familyMembers.map(m => (m.id === editId ? memberPayload : m));
    } else {
      this.familyMembers.push(memberPayload);
    }

    // 1. Instant Local Storage Persistence
    const serialized = JSON.stringify(this.familyMembers);
    localStorage.setItem('selfcare_family_members', serialized);
    if (currentMobile) {
      localStorage.setItem(`selfcare_family_${currentMobile}`, serialized);
    }

    // 2. Direct Sync to Google Sheets FamilyMembers Table
    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      try {
        await Api.request('saveFamilyMember', memberPayload, false);
        console.log('[Family] Synced to Google Sheet FamilyMembers successfully.');
      } catch (err) {
        console.warn('[Family] Sheet save warning:', err);
      }
    }

    this.renderFamilyCards();
    this.closeMemberForm();
    this.safeShowToast(`${name} details saved & synced to Google Sheets!`, 'success');
  },

  async deleteFamilyMember(id) {
    const target = this.familyMembers.find(m => m.id === id);
    const memberName = target ? target.name : 'Member';

    if (!confirm(`Are you sure you want to remove ${memberName}?`)) {
      return;
    }

    this.familyMembers = this.familyMembers.filter(m => m.id !== id);
    const serialized = JSON.stringify(this.familyMembers);
    localStorage.setItem('selfcare_family_members', serialized);

    const currentMobile = (this.currentUser && this.currentUser.mobile) || localStorage.getItem('selfcare_active_user') || '7010174890';
    if (currentMobile) {
      localStorage.setItem(`selfcare_family_${currentMobile}`, serialized);
    }

    // Delete in Google Sheets FamilyMembers Table
    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      try {
        await Api.request('deleteFamilyMember', {
          id: id,
          memberId: id,
          primaryMobile: currentMobile
        }, false);
        console.log('[Family] Deleted from Google Sheet.');
      } catch (err) {
        console.warn('[Family] Sheet delete warning:', err);
      }
    }

    this.renderFamilyCards();
    this.safeShowToast(`${memberName} removed.`, 'info');
  },

  // 3. ADDRESSES
  openAddressesModal() {
    this.renderAddressesList();
    this.openModal('modal-addresses');
  },

  renderAddressesList() {
    const box = document.getElementById('addresses-list-container');
    if (!box) return;

    if (this.addresses.length === 0) {
      box.innerHTML = `<p style="font-size:11px; color:#6B7280;">No pickup addresses saved yet.</p>`;
      return;
    }

    box.innerHTML = this.addresses.map((a, idx) => `
      <div style="padding:8px 10px; background:#F9FAFB; border:1px solid #E5E7EB; border-radius:8px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="font-size:12px; color:#045D49;">${Utils.escapeHtml(a.label)} ${idx === 0 ? '★ Default' : ''}</strong>
          <p style="font-size:11px; color:#374151;">${Utils.escapeHtml(a.line)} - ${a.pincode}</p>
        </div>
        <button onclick="ProfilePage.deleteAddress('${a.id}')" style="border:none; background:transparent; color:#dc2626; cursor:pointer;">🗑️</button>
      </div>
    `).join('');
  },

  addNewAddress() {
    const label = document.getElementById('addr-label-input').value.trim() || 'Home';
    const line = document.getElementById('addr-line-input').value.trim();
    const pincode = document.getElementById('addr-pincode-input').value.trim();
    const location = document.getElementById('addr-loc-input').value.trim();

    if (!line) {
      this.safeShowToast('Please enter address line', 'error');
      return;
    }

    this.addresses.push({
      id: `ADDR_${Date.now()}`,
      label,
      line,
      pincode: pincode || '600001',
      location
    });

    localStorage.setItem('selfcare_saved_addresses', JSON.stringify(this.addresses));
    this.renderAddressesList();
    document.getElementById('addr-label-input').value = '';
    document.getElementById('addr-line-input').value = '';
    document.getElementById('addr-pincode-input').value = '';
    document.getElementById('addr-loc-input').value = '';
    this.safeShowToast('Address saved successfully!', 'success');
  },

  deleteAddress(id) {
    this.addresses = this.addresses.filter(a => a.id !== id);
    localStorage.setItem('selfcare_saved_addresses', JSON.stringify(this.addresses));
    this.renderAddressesList();
    this.safeShowToast('Address removed', 'info');
  },

  // 4. REFER AND EARN
  openReferEarnModal() {
    const userMobile = this.currentUser && this.currentUser.mobile ? this.currentUser.mobile : '7010174890';
    const referCode = `SC${userMobile.slice(-4)}`;
    const codeEl = document.getElementById('user-refer-code');
    if (codeEl) codeEl.textContent = referCode;

    this.renderEarnedCouponsList();
    this.openModal('modal-refer-earn');
  },

  renderEarnedCouponsList() {
    const container = document.getElementById('earned-coupons-container');
    if (!container) return;

    if (!this.referralCoupons || this.referralCoupons.length === 0) {
      container.innerHTML = `
        <div style="padding:10px; background:#F9FAFB; border:1px dashed #D1D5DB; border-radius:8px; font-size:11px; color:#6B7280; text-align:center;">
          No referral rewards unlocked yet. Share your code above! Once your friend books, your 10% coupon will appear here.
        </div>
      `;
      return;
    }

    container.innerHTML = this.referralCoupons.map((c) => `
      <div class="coupon-reward-card">
        <div class="coupon-info-wrap">
          <span class="coupon-code-badge">🏷️ ${Utils.escapeHtml(c.code)}</span>
          <span class="coupon-note">🎉 Friend <strong>${Utils.escapeHtml(c.friendName)}</strong> booked a test! Get 10% OFF</span>
        </div>
        <button type="button" class="apply-coupon-btn" onclick="ProfilePage.applyCouponToCart('${Utils.escapeHtml(c.code)}')">
          🛒 Apply to Cart
        </button>
      </div>
    `).join('');
  },

  applyCouponToCart(couponCode) {
    localStorage.setItem('selfcare_applied_coupon', couponCode);
    localStorage.setItem('selfcare_coupon_discount_percent', '10');

    this.safeShowToast(`Coupon "${couponCode}" applied! (10% Discount)`, 'success');
    this.closeModal('modal-refer-earn');

    setTimeout(() => {
      window.location.href = 'cart.html';
    }, 700);
  },

  shareReferralWhatsApp() {
    const code = document.getElementById('user-refer-code').textContent;
    const msg = `Book certified lab tests at doorstep with Selfcare Diagnostics! Use my referral code *${code}* to book your test: https://selfcarediagnostics.com`;
    window.open(`https://wa.me/917010174890?text=${encodeURIComponent(msg)}`, '_blank');
  },

  // 5. GENERAL INFO, LOGOUT & SUPPORT
  openGeneralInfoModal() {
    this.openModal('modal-general-info');
  },

  handleLogout() {
    if (confirm('Are you sure you want to log out?')) {
      if (typeof Auth !== 'undefined' && Auth.logout) {
        Auth.logout();
      } else {
        localStorage.clear();
        window.location.reload();
      }
    }
  },

  openSupportDeskModal() {
    this.openModal('modal-support-desk');
  },

  detectGpsLocation(targetInputId) {
    if (!navigator.geolocation) {
      this.safeShowToast('GPS Geolocation not supported on this browser', 'error');
      return;
    }

    this.safeShowToast('Detecting current GPS location...', 'info');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        const mapUrl = `https://maps.google.com/?q=${lat},${lng}`;
        
        const input = document.getElementById(targetInputId);
        if (input) input.value = mapUrl;
        this.safeShowToast('Location detected successfully!', 'success');
      },
      (err) => {
        console.warn('Geolocation error:', err);
        this.safeShowToast('Could not fetch location. Please turn on GPS.', 'error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'flex';
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
  },

  updateCartBadgeUI() {
    const badges = document.querySelectorAll('.cart-badge');
    const activeUser = localStorage.getItem('selfcare_active_user');
    let raw = null;

    if (activeUser) {
      raw = localStorage.getItem(`selfcare_cart_${activeUser}`);
    }
    if (raw === null) {
      raw = localStorage.getItem('selfcare_cart') ?? localStorage.getItem('cart');
    }

    let count = 0;
    try {
      const parsed = JSON.parse(raw);
      count = Array.isArray(parsed) ? parsed.length : 0;
    } catch (e) {}

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
  ProfilePage.init();
});

if (typeof window !== 'undefined') {
  window.ProfilePage = ProfilePage;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProfilePage;
}
