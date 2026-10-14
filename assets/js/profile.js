/* file: assets/js/profile.js */
/**
 * Selfcare Diagnostics - My Account Controller v6.5.0
 * Features:
 * - Mandatory Profile Onboarding for New Users
 * - Blood Connect Integration (Addresses removed)
 * - Progressive 10% Referral Engine (Up to 100% Free Health Checkup)
 * - Strict Self-Only Cart Reward Flag
 */

const ProfilePage = {
  currentUser: null,
  familyMembers: [],
  completedReferralsCount: 0,
  isMandatorySetup: false,

  async init() {
    try {
      this.loadAccountData();
      this.updateCartBadgeUI();
      this.checkReferralStatus();

      const loader = document.getElementById('profile-loading-overlay') || document.getElementById('page-loader');
      if (loader) loader.style.display = 'none';

      // Check if user is redirected for mandatory onboarding
      const urlParams = new URLSearchParams(window.location.search);
      const isParamSetup = urlParams.get('setup') === 'mandatory' || urlParams.get('setup') === '1';

      if (isParamSetup || !this.isProfileFullyComplete()) {
        this.triggerMandatoryProfileSetup();
      }

      if (navigator.onLine) {
        setTimeout(() => {
          this.syncLiveCloudProfile().catch(e => console.warn('[Profile] Background sync notice:', e));
        }, 150);
      }
    } catch (err) {
      console.error('ProfilePage init error:', err);
    }
  },

  isProfileFullyComplete() {
    if (!this.currentUser) return false;
    const u = this.currentUser;
    const nameValid = Boolean(u.name && u.name.trim() !== '' && u.name.trim().toLowerCase() !== 'customer account' && u.name.trim().toLowerCase() !== 'valued customer');
    const ageValid = Boolean(u.age && Number(u.age) > 0);
    const genderValid = Boolean(u.gender && u.gender.trim() !== '');
    const addressValid = Boolean(u.address && u.address.trim() !== '' && u.address.toLowerCase() !== 'address not provided');
    return Boolean(nameValid && ageValid && genderValid && addressValid);
  },

  triggerMandatoryProfileSetup() {
    this.isMandatorySetup = true;
    this.openMyProfileModal();
    this.toggleSelfEditMode(true);

    const closeBtn = document.getElementById('my-profile-close-btn');
    if (closeBtn) closeBtn.style.display = 'none';

    const cancelBtn = document.getElementById('self-edit-cancel-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';

    const alertBanner = document.getElementById('mandatory-setup-alert');
    if (alertBanner) alertBanner.style.display = 'flex';

    const saveBtn = document.getElementById('self-edit-save-btn');
    if (saveBtn) saveBtn.textContent = 'Save & Proceed to Dashboard ➔';

    this.safeShowToast('Welcome! Please complete your profile details to continue.', 'info');
  },

  safeShowToast(message, type = 'info') {
    if (typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(message, type);
    } else {
      alert(message);
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
    const rawAge = storedUser.age || storedUser.Age || vaultProfile.age || vaultProfile.Age || storedUser.dob || vaultProfile.dob || '';

    this.currentUser = {
      name: storedUser.name || vaultProfile.name || '',
      mobile: activeMobile || storedUser.mobile || vaultProfile.mobile || '7010174890',
      email: storedUser.email || vaultProfile.email || '',
      age: this.calculateAge(rawAge),
      gender: storedUser.gender || storedUser.Gender || vaultProfile.gender || vaultProfile.Gender || 'Male',
      bloodGroup: storedUser.bloodGroup || storedUser.BloodGroup || vaultProfile.bloodGroup || vaultProfile.BloodGroup || 'O+',
      address: storedUser.address || storedUser.Address || vaultProfile.address || '',
      location: storedUser.location || storedUser.Location || vaultProfile.location || ''
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
      const parsedFam = savedFam ? JSON.parse(savedFam) : [];
      this.familyMembers = parsedFam.map(m => ({
        id: m.id || m.MemberID || m.memberId,
        name: m.name || m.Name || 'Member',
        relation: m.relation || m.Relation || 'Relative',
        mobile: m.mobile || m.Mobile || '',
        age: this.calculateAge(m.age || m.Age),
        gender: m.gender || m.Gender || '',
        bloodGroup: m.bloodGroup || m.BloodGroup || 'O+',
        address: m.address || m.Address || '',
        location: m.location || m.Location || ''
      }));
    } catch (e) {
      this.familyMembers = [];
    }

    // Load Completed Referrals Count (0 to 10 cycle)
    const savedCount = localStorage.getItem(`selfcare_referral_completed_${currentMobile}`) || localStorage.getItem('selfcare_completed_referrals') || '0';
    this.completedReferralsCount = Math.min(Math.max(parseInt(savedCount, 10) || 0, 0), 10);

    this.renderSelfProfile();
    this.populateFormInputs();
    this.renderFamilyCards();
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
        const incomingAge = p.age ?? p.Age ?? p.dob ?? p.DOB;

        this.currentUser = {
          ...this.currentUser,
          name: p.name || p.Name || this.currentUser.name,
          age: (incomingAge !== undefined && incomingAge !== null && incomingAge !== '') ? this.calculateAge(incomingAge) : this.currentUser.age,
          gender: p.gender || p.Gender || this.currentUser.gender,
          bloodGroup: p.bloodGroup || p.BloodGroup || this.currentUser.bloodGroup,
          email: p.email || p.Email || this.currentUser.email,
          address: p.address || p.Address || this.currentUser.address,
          location: p.location || p.Location || this.currentUser.location
        };

        if (res.completedReferrals !== undefined) {
          this.completedReferralsCount = Math.min(Math.max(parseInt(res.completedReferrals, 10) || 0, 0), 10);
          localStorage.setItem(`selfcare_referral_completed_${activeMobile}`, String(this.completedReferralsCount));
          this.checkReferralStatus();
        }

        const serialized = JSON.stringify(this.currentUser);
        localStorage.setItem(`selfcare_profile_${activeMobile}`, serialized);
        localStorage.setItem('selfcare_customer_profile', serialized);
        localStorage.setItem('selfcare_permanent_user', serialized);

        this.renderSelfProfile();
        this.populateFormInputs();
      }
    } catch (err) {
      console.warn('[Profile] Background sync notice:', err);
    }
  },

  checkReferralStatus() {
    const badge = document.getElementById('referral-reward-badge');
    const discount = this.completedReferralsCount * 10;
    if (badge) {
      if (discount > 0) {
        badge.textContent = `${discount}% OFF Unlocked`;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
  },

  openMyProfileModal() {
    this.renderSelfProfile();
    this.populateFormInputs();
    if (!this.isMandatorySetup) {
      this.toggleSelfEditMode(false);
    }
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

    const displayName = (u.name && u.name.trim()) ? u.name : 'Profile Incomplete';
    if (nameEl) nameEl.textContent = displayName;
    if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();
    if (mobileEl) mobileEl.textContent = u.mobile ? `+91 ${u.mobile}` : '+91 7010174890';
    if (emailEl) emailEl.textContent = u.email || 'Not provided';
    if (ageGenderEl) ageGenderEl.textContent = `${u.age ? u.age + ' Yrs' : 'Age not set'} • ${u.gender || 'Male'}`;
    if (bloodEl) bloodEl.textContent = u.bloodGroup || 'O+';
    if (addressEl) addressEl.textContent = u.address || 'Address not provided';
    if (locEl) locEl.textContent = u.location || 'Not set';

    const bgConnectDisplay = document.getElementById('blood-connect-display-bg');
    if (bgConnectDisplay) bgConnectDisplay.textContent = u.bloodGroup || 'O+';
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
    if (bloodEl && u.bloodGroup) bloodEl.value = u.bloodGroup;
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
    const rawAge = document.getElementById('self-edit-age').value.trim();
    const gender = document.getElementById('self-edit-gender').value;
    const email = document.getElementById('self-edit-email').value.trim();
    const address = document.getElementById('self-edit-address').value.trim();
    const location = document.getElementById('self-edit-location').value.trim();

    if (!name || name.toLowerCase() === 'customer account' || name.toLowerCase() === 'valued customer') {
      this.safeShowToast('Please enter your full name', 'error');
      document.getElementById('self-edit-name').focus();
      return;
    }

    if (!rawAge || Number(rawAge) <= 0) {
      this.safeShowToast('Please enter a valid age', 'error');
      document.getElementById('self-edit-age').focus();
      return;
    }

    if (!address) {
      this.safeShowToast('Please provide your pickup address for sample collection', 'error');
      document.getElementById('self-edit-address').focus();
      return;
    }

    const calculatedAge = this.calculateAge(rawAge);
    const activeMobile = mobile || (this.currentUser && this.currentUser.mobile) || localStorage.getItem('selfcare_active_user');

    this.currentUser = {
      ...this.currentUser,
      name,
      mobile: activeMobile,
      bloodGroup,
      age: calculatedAge,
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
    this.safeShowToast('Profile details saved successfully!', 'success');

    if (this.isMandatorySetup) {
      this.isMandatorySetup = false;
      setTimeout(() => {
        window.location.href = 'customer.html';
      }, 700);
      return;
    }

    this.toggleSelfEditMode(false);
  },

  /* ================= BLOOD CONNECT MODAL ================= */
  openBloodConnectModal() {
    this.renderSelfProfile();
    this.openModal('modal-blood-connect');
  },

  registerAsBloodDonor() {
    this.safeShowToast('Thank you! Donor registration module will be active shortly.', 'success');
  },

  requestEmergencyBloodHelp() {
    const bg = (this.currentUser && this.currentUser.bloodGroup) || 'Any';
    const addr = (this.currentUser && this.currentUser.address) || 'Chennai';
    const msg = `🚨 *URGENT BLOOD REQUEST - CHENNAI*\nBlood Group Needed: *${bg}*\nLocation: ${addr}\nPlease check available donors and connect immediately.`;
    window.open(`https://wa.me/917010174890?text=${encodeURIComponent(msg)}`, '_blank');
  },

  /* ================= REFER & EARN PROGRESSIVE ENGINE ================= */
  openReferEarnModal() {
    const userMobile = this.currentUser && this.currentUser.mobile ? this.currentUser.mobile : '7010174890';
    const referCode = `SC${userMobile.slice(-4)}`;
    
    const codeEl = document.getElementById('user-refer-code');
    if (codeEl) codeEl.textContent = referCode;

    this.renderReferralProgress();
    this.openModal('modal-refer-earn');
  },

  renderReferralProgress() {
    const count = this.completedReferralsCount; // 0 to 10
    const discount = count * 10; // 0% to 100%

    const countDisplay = document.getElementById('referral-count-display');
    const barFill = document.getElementById('referral-bar-fill');
    const discountDisplay = document.getElementById('referral-unlocked-discount');

    if (countDisplay) countDisplay.textContent = `${count} / 10 Completed`;
    if (barFill) barFill.style.width = `${count * 10}%`;
    if (discountDisplay) {
      discountDisplay.textContent = discount === 100 ? '100% FREE CHECKUP 🎉' : `${discount}% OFF`;
    }

    const container = document.getElementById('earned-coupons-container');
    if (!container) return;

    if (discount === 0) {
      container.innerHTML = `
        <div style="padding:12px; background:#F9FAFB; border:1px dashed #D1D5DB; border-radius:10px; font-size:11.5px; color:#6B7280; text-align:center;">
          Refer your friends to unlock rewards! Each completed referral earns <strong>10% OFF</strong>, reaching <strong>100% FREE</strong> checkup at 10 referrals.
        </div>
      `;
      return;
    }

    const couponCode = `REF${count * 10}FREE`;
    const isFree = discount === 100;

    container.innerHTML = `
      <div class="coupon-reward-card ${isFree ? 'gold-reward' : ''}">
        <div class="coupon-info-wrap">
          <span class="coupon-code-badge">🏷️ ${couponCode} (${discount}% OFF)</span>
          <span class="coupon-note">
            ${isFree ? '🌟 100% FREE Comprehensive Health Checkup Unlocked!' : `🎉 ${count} referral booking(s) completed! Enjoy ${discount}% OFF.`}
          </span>
          <small style="font-size: 9.5px; color: #DC2626; font-weight: 700; margin-top: 2px;">
            ⚠️ Valid strictly for Primary Account User only (Self)
          </small>
        </div>
        <button type="button" class="apply-coupon-btn" onclick="ProfilePage.applyReferralBonusToCart(${discount}, '${couponCode}')">
          🛒 Apply to Cart
        </button>
      </div>
    `;
  },

  applyReferralBonusToCart(discountPercent, couponCode) {
    localStorage.setItem('selfcare_applied_coupon', couponCode);
    localStorage.setItem('selfcare_coupon_discount_percent', String(discountPercent));
    localStorage.setItem('selfcare_coupon_applicable_for', 'self_only');

    this.safeShowToast(`${discountPercent}% Referral Reward Applied to Cart!`, 'success');
    this.closeModal('modal-refer-earn');

    setTimeout(() => {
      window.location.href = 'cart.html';
    }, 600);
  },

  shareReferralWhatsApp() {
    const code = document.getElementById('user-refer-code').textContent;
    const msg = `Book certified clinical lab tests at doorstep with Selfcare Diagnostics! Use my referral code *${code}* during checkout to book your health tests: https://selfcarediagnostics.in`;
    window.open(`https://wa.me/917010174890?text=${encodeURIComponent(msg)}`, '_blank');
  },

  /* ================= FAMILY DIRECTORY ================= */
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
    if (countEl) countEl.textContent = `${count} ${count === 1 ? 'Member' : 'Members'} Saved`;

    if (count === 0) {
      container.innerHTML = `
        <div class="empty-family-state">
          <span>👨‍👩‍👧‍👦</span>
          <h4>No Family Members Added</h4>
          <p>Add family members or relatives to easily schedule and book diagnostic tests on their behalf.</p>
          <button type="button" class="add-member-top-btn" style="margin: 0 auto;" onclick="ProfilePage.openMemberForm()">
            <span>+</span> Add Member
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.familyMembers.map(m => `
      <div class="member-display-card">
        <div class="member-card-header">
          <div class="member-title-group">
            <span class="member-name-text">${Utils.escapeHtml(m.name)}</span>
            <span class="member-relation-badge">${Utils.escapeHtml(m.relation || 'Relative')}</span>
          </div>
          <div class="member-actions-group">
            <button type="button" class="card-btn-edit" onclick="ProfilePage.editFamilyMember('${m.id}')">✏️ Edit</button>
            <button type="button" class="card-btn-delete" onclick="ProfilePage.deleteFamilyMember('${m.id}')">🗑️</button>
          </div>
        </div>

        <div class="member-card-body-grid">
          <div class="member-info-item">
            <span class="info-label">Mobile Number</span>
            <span class="info-val mobile-highlight">${m.mobile ? '+91 ' + m.mobile : 'Not provided'}</span>
          </div>
          <div class="member-info-item">
            <span class="info-label">Age & Gender</span>
            <span class="info-val">${m.age ? m.age + ' Yrs' : 'Age not set'} • ${m.gender || 'Not specified'}</span>
          </div>
          <div class="member-info-item">
            <span class="info-label">Blood Group</span>
            <span class="info-val">${m.bloodGroup || 'O+'}</span>
          </div>
          <div class="member-info-item">
            <span class="info-label">Pickup Address</span>
            <span class="info-val" style="font-size:10.5px;">${Utils.escapeHtml(m.address || 'Same as primary')}</span>
          </div>
        </div>
      </div>
    `).join('');
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
    const rawAge = document.getElementById('family-age-input').value.trim();
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
      return;
    }

    const currentMobile = (this.currentUser && this.currentUser.mobile) || localStorage.getItem('selfcare_active_user') || '7010174890';
    const finalMemberId = editId || `FAM_${Date.now()}`;
    const calculatedAge = this.calculateAge(rawAge);

    const memberPayload = {
      id: finalMemberId,
      memberId: finalMemberId,
      MemberID: finalMemberId,
      primaryMobile: currentMobile,
      PrimaryMobile: currentMobile,
      name,
      relation,
      bloodGroup,
      age: calculatedAge,
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

    const serialized = JSON.stringify(this.familyMembers);
    localStorage.setItem('selfcare_family_members', serialized);
    if (currentMobile) {
      localStorage.setItem(`selfcare_family_${currentMobile}`, serialized);
    }

    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      try {
        await Api.request('saveFamilyMember', memberPayload, false);
      } catch (err) {
        console.warn('[Family] Sheet save warning:', err);
      }
    }

    this.renderFamilyCards();
    this.closeMemberForm();
    this.safeShowToast(`${name} details saved successfully!`, 'success');
  },

  async deleteFamilyMember(id) {
    const target = this.familyMembers.find(m => m.id === id);
    const memberName = target ? target.name : 'Member';

    if (!confirm(`Are you sure you want to remove ${memberName}?`)) return;

    this.familyMembers = this.familyMembers.filter(m => m.id !== id);
    const serialized = JSON.stringify(this.familyMembers);
    localStorage.setItem('selfcare_family_members', serialized);

    const currentMobile = (this.currentUser && this.currentUser.mobile) || localStorage.getItem('selfcare_active_user') || '7010174890';
    if (currentMobile) localStorage.setItem(`selfcare_family_${currentMobile}`, serialized);

    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      try {
        await Api.request('deleteFamilyMember', { id, memberId: id, primaryMobile: currentMobile }, false);
      } catch (err) {}
    }

    this.renderFamilyCards();
    this.safeShowToast(`${memberName} removed.`, 'info');
  },

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
      this.safeShowToast('GPS Geolocation is not supported by your browser', 'error');
      return;
    }
    this.safeShowToast('Detecting current GPS coordinates...', 'info');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const url = `https://maps.google.com/?q=${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
        const input = document.getElementById(targetInputId);
        if (input) input.value = url;
        this.safeShowToast('Location detected successfully!', 'success');
      },
      () => this.safeShowToast('Unable to detect location. Please enable GPS permissions.', 'error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  },

  openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  },

  closeModal(id) {
    if (this.isMandatorySetup && id === 'modal-my-profile') {
      this.safeShowToast('Please save your profile details to proceed', 'error');
      return;
    }
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  },

  updateCartBadgeUI() {
    const badges = document.querySelectorAll('.cart-badge');
    const activeUser = localStorage.getItem('selfcare_active_user');
    let raw = activeUser ? localStorage.getItem(`selfcare_cart_${activeUser}`) : null;
    if (raw === null) raw = localStorage.getItem('selfcare_cart') ?? localStorage.getItem('cart');

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

if (typeof window !== 'undefined') window.ProfilePage = ProfilePage;
if (typeof module !== 'undefined' && module.exports) module.exports = ProfilePage;
