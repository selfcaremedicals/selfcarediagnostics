/* file: assets/js/profile.js */
/**
 * Selfcare Diagnostics - My Account Controller v16.0.0
 * Features:
 * - Supports Salutation (Mr., Mrs., Ms., Master, Baby, Dr.) & Date of Birth (DOB)
 * - Instantly calculates exact Age from DOB on input & dynamically updates age every year on page load
 * - Unwraps both nested (res.data) and top-level backend responses on initial load
 * - Resolves mobile number across all session/auth storage keys automatically
 * - Syncs Profile, Family Members, Membership & Blood Connect immediately on page open
 */

const ProfilePage = {
  currentUser: null,
  familyMembers: [],
  membershipInfo: null,
  _isSavingMember: false,
  _isSavingProfile: false,

  normalizeMobile(raw) {
    if (!raw) return '';
    const digits = String(raw).replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : '';
  },

  isActiveMembershipStatus(status) {
    if (!status) return false;
    const s = String(status).trim().toLowerCase();
    if (s === 'success' || s === 'error' || s === 'regular' || s === 'none') return false;
    return ['membership', 'vip', 'active', 'carepass', 'gold', 'platinum', 'subscribed', 'yes', 'true'].includes(s);
  },

  unwrapResponse(res) {
    if (!res || typeof res !== 'object') return res;
    if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
      return { ...res, ...res.data };
    }
    return res;
  },

  resolveSessionMobile() {
    const candidates = [];

    if (typeof localStorage !== 'undefined') {
      candidates.push(localStorage.getItem('selfcare_active_user'));

      const storageKeys = [
        'selfcare_permanent_user',
        'selfcare_customer_profile',
        'selfcare_user',
        'user'
      ];
      for (const key of storageKeys) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              candidates.push(parsed.mobile, parsed.Mobile, parsed.phone, parsed.Phone, parsed.userId, parsed.UserID);
            }
          }
        } catch (e) {}
      }
    }

    if (typeof Auth !== 'undefined' && typeof Auth.getUser === 'function') {
      try {
        const authUser = Auth.getUser();
        if (authUser && typeof authUser === 'object') {
          candidates.push(authUser.mobile, authUser.Mobile, authUser.phone, authUser.Phone, authUser.userId, authUser.UserID);
        }
      } catch (e) {}
    }

    for (const item of candidates) {
      const mob = this.normalizeMobile(item);
      if (mob && mob.length === 10) {
        if (typeof localStorage !== 'undefined' && !localStorage.getItem('selfcare_active_user')) {
          localStorage.setItem('selfcare_active_user', mob);
        }
        return mob;
      }
    }

    return '';
  },

  async init() {
    try {
      this.setMaxDobLimits();
      this.loadAccountData();
      this.updateCartBadgeUI();
      this.renderBloodConnectBadges();

      const loader = document.getElementById('profile-loading-overlay') || document.getElementById('page-loader');
      if (loader) loader.style.display = 'none';

      if (navigator.onLine) {
        await Promise.allSettled([
          this.syncLiveCloudProfile(),
          this.syncLiveCloudFamilyMembers(),
          this.syncLiveCloudMembership(),
          this.syncBloodConnectLive()
        ]);
      }
    } catch (err) {
      console.error('ProfilePage init error:', err);
    }
  },

  setMaxDobLimits() {
    const todayIso = new Date().toISOString().split('T')[0];
    const selfDob = document.getElementById('self-edit-dob');
    const famDob = document.getElementById('family-dob-input');
    if (selfDob) selfDob.max = todayIso;
    if (famDob) famDob.max = todayIso;
  },

  safeShowToast(message, type = 'info') {
    if (typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(message, type);
    } else {
      alert(message);
    }
  },

  normalizeDobInput(rawDob) {
    if (!rawDob) return '';
    const cleanStr = String(rawDob).trim();
    if (!cleanStr) return '';

    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
      return cleanStr;
    }

    // ISO Timestamp e.g. 1999-07-05T00:00:00.000Z
    if (/^\d{4}-\d{2}-\d{2}T/.test(cleanStr)) {
      const d = new Date(cleanStr);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }

    // DD/MM/YYYY or DD-MM-YYYY
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(cleanStr)) {
      const parts = cleanStr.split(/[/-]/);
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }

    const parsed = new Date(cleanStr);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    return '';
  },

  parseLocalDate(dateStr) {
    const normalized = this.normalizeDobInput(dateStr);
    if (!normalized) return null;
    const [y, m, d] = normalized.split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  },

  calculateAge(dobOrAge) {
    if (dobOrAge === null || dobOrAge === undefined) return '';
    const cleanStr = String(dobOrAge).trim();
    if (!cleanStr) return '';

    // Legacy direct numeric age fallback
    const num = Number(cleanStr);
    if (!isNaN(num) && num >= 0 && num < 125 && !cleanStr.includes('-') && !cleanStr.includes('/')) {
      return String(Math.floor(num));
    }

    const birthDate = this.parseLocalDate(cleanStr);
    if (!birthDate) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (birthDate > today) return '';

    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return (age >= 0 && age < 125) ? String(age) : '';
  },

  formatAgeDisplay(dob, fallbackAge) {
    const birthDate = this.parseLocalDate(dob);
    if (birthDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (birthDate <= today) {
        let years = today.getFullYear() - birthDate.getFullYear();
        let months = today.getMonth() - birthDate.getMonth();
        if (today.getDate() < birthDate.getDate()) {
          months--;
        }
        if (months < 0) {
          years--;
          months += 12;
        }
        if (years >= 1) {
          return `${years} ${years === 1 ? 'Yr' : 'Yrs'}`;
        }
        if (months >= 1) {
          return `${months} ${months === 1 ? 'Month' : 'Months'}`;
        }
        const diffDays = Math.max(1, Math.floor((today - birthDate) / (1000 * 60 * 60 * 24)));
        return `${diffDays} ${diffDays === 1 ? 'Day' : 'Days'}`;
      }
    }

    const numericAge = this.calculateAge(fallbackAge);
    return numericAge ? `${numericAge} Yrs` : '';
  },

  syncAgeInputFromDob(dobInputId, ageInputId) {
    const dobEl = document.getElementById(dobInputId);
    const ageEl = document.getElementById(ageInputId);
    if (!dobEl || !ageEl) return;

    const dobVal = dobEl.value;
    if (!dobVal) {
      ageEl.value = '';
      return;
    }

    const displayLabel = this.formatAgeDisplay(dobVal, '');
    ageEl.value = displayLabel || '';
  },

  onSalutationChange(salutationSelectId, genderSelectId) {
    const salEl = document.getElementById(salutationSelectId);
    const genEl = document.getElementById(genderSelectId);
    if (!salEl || !genEl) return;

    const sal = salEl.value;
    if (sal === 'Mr.' || sal === 'Master') {
      genEl.value = 'Male';
    } else if (sal === 'Mrs.' || sal === 'Ms.') {
      genEl.value = 'Female';
    }
  },

  inferDefaultSalutation(gender, age) {
    const g = String(gender || '').toLowerCase();
    const numAge = Number(age);
    if (!isNaN(numAge) && numAge > 0 && numAge < 12) {
      return g === 'male' ? 'Master' : 'Baby';
    }
    if (g === 'female') return 'Ms.';
    return 'Mr.';
  },

  formatFullName(salutation, name) {
    const cleanName = String(name || '').trim();
    const cleanSal = String(salutation || '').trim();
    if (!cleanName) return 'Customer Account';
    if (!cleanSal) return cleanName;
    if (cleanName.toLowerCase().startsWith(cleanSal.toLowerCase())) {
      return cleanName;
    }
    return `${cleanSal} ${cleanName}`;
  },

  loadAccountData() {
    const resolvedMobile = this.resolveSessionMobile();
    const storedUser = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};

    let vaultProfile = {};
    if (resolvedMobile) {
      try {
        const rawVault = localStorage.getItem(`selfcare_profile_${resolvedMobile}`);
        if (rawVault) vaultProfile = JSON.parse(rawVault);
      } catch (e) {}
    }

    let permanentUser = {};
    try {
      const rawPerm = localStorage.getItem('selfcare_permanent_user') || localStorage.getItem('selfcare_customer_profile');
      if (rawPerm) permanentUser = JSON.parse(rawPerm);
    } catch (e) {}

    const merged = { ...permanentUser, ...storedUser, ...vaultProfile };
    const normalizedDob = this.normalizeDobInput(merged.dob || merged.DOB || merged.dateOfBirth || merged.DateOfBirth || '');
    const rawAge = normalizedDob || merged.age || merged.Age || '';
    const computedAge = this.calculateAge(rawAge);
    const gender = merged.gender || merged.Gender || 'Male';
    const salutation = merged.salutation || merged.Salutation || merged.title || merged.Title || this.inferDefaultSalutation(gender, computedAge);

    this.currentUser = {
      userId: merged.userId || merged.UserID || (resolvedMobile ? 'SCD_' + resolvedMobile : ''),
      salutation,
      name: merged.name || merged.Name || '',
      mobile: resolvedMobile,
      email: merged.email || merged.Email || '',
      dob: normalizedDob,
      age: computedAge,
      gender,
      bloodGroup: merged.bloodGroup || merged.BloodGroup || 'O+',
      address: merged.address || merged.Address || '',
      location: merged.location || merged.Location || '',
      membership: merged.membership || merged.Membership || 'Regular',
      membershipPlan: merged.membershipPlan || merged.MembershipPlan || '',
      membershipExpiry: merged.membershipExpiry || merged.MembershipExpiry || ''
    };

    try {
      const rawMem = (resolvedMobile && localStorage.getItem(`selfcare_membership_${resolvedMobile}`)) || localStorage.getItem('selfcare_membership');
      if (rawMem) {
        this.membershipInfo = JSON.parse(rawMem);
      }
    } catch (e) {}

    try {
      let savedFam = null;
      if (resolvedMobile) {
        savedFam = localStorage.getItem(`selfcare_family_${resolvedMobile}`);
      }
      if (!savedFam) {
        savedFam = localStorage.getItem('selfcare_family_members');
      }
      const parsedFam = savedFam ? JSON.parse(savedFam) : [];
      if (Array.isArray(parsedFam)) {
        this.hydrateFamilyMembers(parsedFam, resolvedMobile, false);
      }
    } catch (e) {
      this.familyMembers = [];
    }

    this.renderSelfProfile();
    this.renderMembershipSummary();
    this.populateFormInputs();
    this.renderFamilyCards();
  },

  async syncLiveCloudProfile() {
    const activeMobile = this.normalizeMobile((this.currentUser && this.currentUser.mobile) || this.resolveSessionMobile());
    if (!navigator.onLine || typeof Api === 'undefined' || !activeMobile) return;

    try {
      let rawRes = null;
      if (typeof Api.request === 'function') {
        rawRes = await Api.request('getProfile', { userId: 'SCD_' + activeMobile, mobile: activeMobile }, false);
      } else if (typeof Api.getProfile === 'function') {
        rawRes = await Api.getProfile(activeMobile);
      }

      const res = this.unwrapResponse(rawRes);
      if (!res || typeof res !== 'object') return;

      const p = (res.profile && typeof res.profile === 'object')
        ? res.profile
        : ((res.user && typeof res.user === 'object') ? res.user : (res.mobile || res.Mobile || res.Name || res.name ? res : null));

      if (p && typeof p === 'object') {
        const incomingDob = this.normalizeDobInput(p.dob ?? p.DOB ?? p.dateOfBirth ?? p.DateOfBirth ?? this.currentUser.dob);
        const incomingAgeRaw = incomingDob || p.age || p.Age;
        const calculatedAge = (incomingAgeRaw !== undefined && incomingAgeRaw !== null && incomingAgeRaw !== '')
          ? this.calculateAge(incomingAgeRaw)
          : this.currentUser.age;
        const incomingGender = p.gender || p.Gender || this.currentUser.gender;
        const incomingSalutation = p.salutation || p.Salutation || p.title || p.Title || this.currentUser.salutation || this.inferDefaultSalutation(incomingGender, calculatedAge);

        const incomingMemStatus = p.membership ?? p.Membership ?? p.membershipStatus ?? p.MembershipStatus ?? this.currentUser.membership;
        const incomingMemPlan = p.membershipPlan ?? p.MembershipPlan ?? p.planName ?? p.PlanName ?? this.currentUser.membershipPlan;
        const incomingMemExpiry = p.membershipExpiry ?? p.MembershipExpiry ?? p.expiryDate ?? p.ExpiryDate ?? p.validTill ?? p.ValidTill ?? this.currentUser.membershipExpiry;

        this.currentUser = {
          ...this.currentUser,
          userId: p.userId || p.UserID || ('SCD_' + activeMobile),
          salutation: incomingSalutation,
          name: (p.name || p.Name || '').trim() || this.currentUser.name,
          mobile: activeMobile,
          dob: incomingDob,
          age: calculatedAge,
          gender: incomingGender,
          bloodGroup: p.bloodGroup || p.BloodGroup || this.currentUser.bloodGroup,
          email: (p.email !== undefined ? p.email : (p.Email !== undefined ? p.Email : this.currentUser.email)),
          address: (p.address !== undefined ? p.address : (p.Address !== undefined ? p.Address : this.currentUser.address)),
          location: (p.location !== undefined ? p.location : (p.Location !== undefined ? p.Location : this.currentUser.location)),
          membership: incomingMemStatus || 'Regular',
          membershipPlan: incomingMemPlan || '',
          membershipExpiry: incomingMemExpiry || ''
        };

        const serialized = JSON.stringify(this.currentUser);
        localStorage.setItem('selfcare_active_user', activeMobile);
        localStorage.setItem(`selfcare_profile_${activeMobile}`, serialized);
        localStorage.setItem('selfcare_customer_profile', serialized);
        localStorage.setItem('selfcare_permanent_user', serialized);

        if (res.membership && typeof res.membership === 'object') {
          this.applyMembershipPayload(res.membership, activeMobile);
        } else if (this.isActiveMembershipStatus(this.currentUser.membership)) {
          this.applyMembershipPayload({
            membership: this.currentUser.membership,
            planName: this.currentUser.membershipPlan || 'CarePass VIP',
            expiryDate: this.currentUser.membershipExpiry
          }, activeMobile);
        }

        this.renderSelfProfile();
        this.renderMembershipSummary();
        this.populateFormInputs();
      }

      const incomingFam = res.familyMembers || res.members || res.family;
      if (Array.isArray(incomingFam) && incomingFam.length > 0) {
        this.hydrateFamilyMembers(incomingFam, activeMobile, true);
      }
    } catch (err) {
      console.warn('[Profile] Background profile sync notice:', err);
    }
  },

  async syncLiveCloudMembership() {
    const activeMobile = this.normalizeMobile((this.currentUser && this.currentUser.mobile) || this.resolveSessionMobile());
    if (!navigator.onLine || typeof Api === 'undefined' || !activeMobile) return;

    const userId = (this.currentUser && this.currentUser.userId) || ('SCD_' + activeMobile);

    try {
      let rawRes = null;
      if (typeof Api.request === 'function') {
        rawRes = await Api.request('getMembershipStatus', {
          mobile: activeMobile,
          primaryMobile: activeMobile,
          userId: userId,
          primaryUserId: userId
        }, false);
      } else if (typeof Api.getMembership === 'function') {
        rawRes = await Api.getMembership(activeMobile);
      }

      const res = this.unwrapResponse(rawRes);
      if (!res || typeof res !== 'object') return;

      const memObj = (res.membership && typeof res.membership === 'object') ? { ...res, ...res.membership } : res;
      this.applyMembershipPayload(memObj, activeMobile);

      if (Array.isArray(memObj.familyMembers) && memObj.familyMembers.length > 0 && this.familyMembers.length === 0) {
        this.hydrateFamilyMembers(memObj.familyMembers, activeMobile, true);
      }

      this.renderSelfProfile();
      this.renderMembershipSummary();
      this.renderFamilyCards();
    } catch (err) {
      console.warn('[Profile] Membership sync notice:', err);
    }
  },

  applyMembershipPayload(raw, activeMobile) {
    if (!raw || typeof raw !== 'object') return;

    const explicitStatus = raw.membership || raw.Membership || raw.membershipStatus || raw.MembershipStatus || '';
    const boolVip = (raw.isPrimaryVip === true || raw.isMember === true);
    const status = explicitStatus || (boolVip ? 'Membership' : 'Regular');
    const isVip = boolVip || this.isActiveMembershipStatus(status);

    const planName = raw.planName || raw.PlanName || raw.membershipPlan || raw.MembershipPlan || raw.plan || raw.Plan || (isVip ? 'CarePass VIP' : 'Regular');
    const expiryDate = raw.expiryDate || raw.ExpiryDate || raw.primaryExpiry || raw.membershipExpiry || raw.MembershipExpiry || raw.validTill || raw.ValidTill || '';
    const coveredMembers = raw.paidFamilyMemberIds || raw.coveredMembers || raw.CoveredMembers || [];

    this.membershipInfo = {
      status: isVip ? 'Membership' : 'Regular',
      isPrimaryVip: isVip,
      planName,
      expiryDate,
      coveredMembers: Array.isArray(coveredMembers) ? coveredMembers : []
    };

    if (this.currentUser) {
      this.currentUser.membership = this.membershipInfo.status;
      this.currentUser.membershipPlan = planName;
      this.currentUser.membershipExpiry = expiryDate;
    }

    const serializedMem = JSON.stringify(this.membershipInfo);
    localStorage.setItem('selfcare_membership', serializedMem);
    if (activeMobile) {
      localStorage.setItem(`selfcare_membership_${activeMobile}`, serializedMem);
      if (this.currentUser) {
        const serializedUser = JSON.stringify(this.currentUser);
        localStorage.setItem(`selfcare_profile_${activeMobile}`, serializedUser);
        localStorage.setItem('selfcare_customer_profile', serializedUser);
        localStorage.setItem('selfcare_permanent_user', serializedUser);
      }
    }
  },

  async syncLiveCloudFamilyMembers() {
    const activeMobile = this.normalizeMobile((this.currentUser && this.currentUser.mobile) || this.resolveSessionMobile());
    if (!navigator.onLine || typeof Api === 'undefined' || !activeMobile) return;

    const userId = (this.currentUser && this.currentUser.userId) || ('SCD_' + activeMobile);

    try {
      let rawRes = null;
      if (typeof Api.request === 'function') {
        rawRes = await Api.request('getFamilyMembers', {
          mobile: activeMobile,
          primaryMobile: activeMobile,
          userId: userId,
          primaryUserId: userId
        }, false);
      }

      const res = this.unwrapResponse(rawRes);
      let incomingList = this.extractArrayFromResponse(res);

      if ((!incomingList || incomingList.length === 0) && typeof Api.getFamilyMembers === 'function') {
        const fallbackRaw = await Api.getFamilyMembers(activeMobile).catch(() => null);
        const fallbackRes = this.unwrapResponse(fallbackRaw);
        const fallbackList = this.extractArrayFromResponse(fallbackRes);
        if (fallbackList && fallbackList.length > 0) {
          incomingList = fallbackList;
        }
      }

      if (Array.isArray(incomingList)) {
        if (incomingList.length > 0 || (res && res.status === 'success')) {
          this.hydrateFamilyMembers(incomingList, activeMobile, true);
        }
      }
    } catch (err) {
      console.warn('[Profile] Background family sync notice:', err);
    }
  },

  extractArrayFromResponse(res) {
    if (!res) return null;
    if (Array.isArray(res)) return res;
    if (typeof res === 'object') {
      if (Array.isArray(res.familyMembers)) return res.familyMembers;
      if (Array.isArray(res.members)) return res.members;
      if (Array.isArray(res.family)) return res.family;
      if (Array.isArray(res.records)) return res.records;
      if (Array.isArray(res.rows)) return res.rows;
      if (Array.isArray(res.data)) return res.data;
    }
    return null;
  },

  hydrateFamilyMembers(list, activeMobile, persist = true) {
    if (!Array.isArray(list)) return;

    const baseTs = Date.now();
    this.familyMembers = list.map((m, idx) => {
      const dob = this.normalizeDobInput(m.dob ?? m.DOB ?? m.dateOfBirth ?? m.DateOfBirth ?? '');
      const age = this.calculateAge(dob || m.age || m.Age);
      const gender = m.gender || m.Gender || '';
      const salutation = m.salutation || m.Salutation || m.title || m.Title || this.inferDefaultSalutation(gender, age);

      return {
        id: m.id || m.MemberID || m.memberId || m['Member ID'] || m.member_id || `FAM_${baseTs}_${idx}`,
        primaryUserId: m.primaryUserId || m.PrimaryUserID || m['Primary User ID'] || (activeMobile ? 'SCD_' + activeMobile : ''),
        primaryUserName: m.primaryUserName || m.PrimaryUserName || (this.currentUser && this.currentUser.name) || '',
        salutation,
        name: m.name || m.Name || m.fullName || m['Full Name'] || 'Member',
        relation: m.relation || m.Relation || m.relationship || m.Relationship || 'Relative',
        mobile: this.normalizeMobile(m.mobile || m.Mobile || m.phone || m.Phone || ''),
        email: m.email || m.Email || '',
        dob,
        age,
        gender,
        bloodGroup: m.bloodGroup || m.BloodGroup || m['Blood Group'] || 'O+',
        address: m.address || m.Address || '',
        location: m.location || m.Location || '',
        membership: m.membership || m.Membership || m.membershipStatus || 'Regular',
        expiryDate: m.expiryDate || m.MembershipExpiry || ''
      };
    });

    if (persist) {
      const serialized = JSON.stringify(this.familyMembers);
      localStorage.setItem('selfcare_family_members', serialized);
      if (activeMobile) {
        localStorage.setItem(`selfcare_family_${activeMobile}`, serialized);
      }
    }

    this.renderFamilyCards();
    this.updateFamilyMenuSummary();
  },

  updateFamilyMenuSummary() {
    const subEl = document.getElementById('menu-family-sub');
    const pillEl = document.getElementById('menu-family-pill');
    const count = this.familyMembers.length;

    if (pillEl) {
      pillEl.textContent = String(count);
      if (count > 0) {
        pillEl.classList.add('pill-active');
      } else {
        pillEl.classList.remove('pill-active');
      }
    }

    if (subEl) {
      if (count === 0) {
        subEl.textContent = 'Add family members for quick booking';
      } else {
        const names = this.familyMembers.slice(0, 2).map(m => this.formatFullName(m.salutation, m.name)).join(', ');
        subEl.textContent = count > 2 ? `${names} +${count - 2} more` : names;
      }
    }
  },

  isSelfVIP() {
    const utilVip = (typeof Utils !== 'undefined' && typeof Utils.isPatientVIP === 'function')
      ? Utils.isPatientVIP('SELF')
      : false;
    const userMemVip = this.currentUser && this.isActiveMembershipStatus(this.currentUser.membership);
    const infoMemVip = this.membershipInfo && (this.membershipInfo.isPrimaryVip === true || this.isActiveMembershipStatus(this.membershipInfo.status));
    return Boolean(utilVip || userMemVip || infoMemVip);
  },

  isMemberVIP(member) {
    if (!member) return false;
    const utilVip = (typeof Utils !== 'undefined' && typeof Utils.isPatientVIP === 'function')
      ? Utils.isPatientVIP(member.id)
      : false;
    const directVip = this.isActiveMembershipStatus(member.membership);
    const coveredList = (this.membershipInfo && Array.isArray(this.membershipInfo.coveredMembers))
      ? this.membershipInfo.coveredMembers
      : [];
    const inCovered = coveredList.some(c => {
      if (typeof c === 'string') return c === member.id || c.toLowerCase() === (member.name || '').toLowerCase();
      if (c && typeof c === 'object') return (c.id || c.memberId || c.MemberID) === member.id;
      return false;
    });
    return Boolean(utilVip || directVip || inCovered);
  },

  formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const localDt = this.parseLocalDate(dateStr);
    if (localDt) {
      return localDt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  renderMembershipSummary() {
    const subEl = document.getElementById('menu-membership-sub');
    const pillEl = document.getElementById('menu-membership-pill');
    const viewRowEl = document.getElementById('self-view-membership');

    const isVip = this.isSelfVIP();
    const planName = (this.membershipInfo && this.membershipInfo.planName)
      || (this.currentUser && this.currentUser.membershipPlan)
      || (isVip ? 'CarePass VIP' : 'Regular');
    const rawExpiry = (this.membershipInfo && this.membershipInfo.expiryDate)
      || (this.currentUser && this.currentUser.membershipExpiry)
      || '';
    const expiry = this.formatDisplayDate(rawExpiry);

    if (pillEl) {
      pillEl.textContent = isVip ? 'ACTIVE' : 'Regular';
      if (isVip) {
        pillEl.classList.add('pill-active');
      } else {
        pillEl.classList.remove('pill-active');
      }
    }

    if (subEl) {
      if (isVip) {
        subEl.textContent = expiry ? `${planName} • Valid till ${expiry}` : `${planName} • Active Member`;
      } else {
        subEl.textContent = 'Standard Plan • Tap to view benefits';
      }
    }

    if (viewRowEl) {
      if (isVip) {
        viewRowEl.textContent = expiry ? `${planName} (Valid till ${expiry})` : `${planName} (Active)`;
      } else {
        viewRowEl.textContent = 'Regular (No active plan)';
      }
    }
  },

  openMyProfileModal() {
    this.renderSelfProfile();
    this.populateFormInputs();
    this.toggleSelfEditMode(false);
    this.openModal('modal-my-profile');

    if (navigator.onLine) {
      this.syncLiveCloudProfile().catch(() => {});
      this.syncLiveCloudMembership().catch(() => {});
    }
  },

  renderSelfProfile() {
    const u = this.currentUser || {};
    const nameEl = document.getElementById('self-display-name');
    const avatarEl = document.getElementById('self-avatar-letter');
    const relationSubEl = document.getElementById('self-display-relation');
    const mobileEl = document.getElementById('self-view-mobile');
    const emailEl = document.getElementById('self-view-email');
    const dobEl = document.getElementById('self-view-dob');
    const ageGenderEl = document.getElementById('self-view-age-gender');
    const bloodEl = document.getElementById('self-view-blood');
    const addressEl = document.getElementById('self-view-address');
    const locEl = document.getElementById('self-view-location');
    const bannerSubEl = document.getElementById('banner-account-sub');
    const menuProfileSubEl = document.getElementById('menu-profile-sub');

    const rawName = (u.name && u.name.trim()) ? u.name.trim() : '';
    const displayName = rawName ? this.formatFullName(u.salutation, rawName) : 'Customer Account';
    const safeName = (typeof Utils !== 'undefined' && Utils.escapeHtml) ? Utils.escapeHtml(displayName) : displayName;
    const isSelfVip = this.isSelfVIP();

    if (nameEl) nameEl.innerHTML = isSelfVip ? `${safeName} 👑` : safeName;
    if (avatarEl) avatarEl.textContent = (rawName || displayName).charAt(0).toUpperCase();
    if (bannerSubEl) bannerSubEl.textContent = u.mobile ? `${displayName} • +91 ${u.mobile}` : displayName;
    if (menuProfileSubEl) menuProfileSubEl.textContent = u.mobile ? `${displayName} • +91 ${u.mobile}` : 'View & edit personal details';

    if (relationSubEl) {
      relationSubEl.textContent = isSelfVip
        ? 'Account Primary (Self) • Active VIP Member'
        : 'Account Primary (Self)';
    }

    const formattedAge = this.formatAgeDisplay(u.dob, u.age);

    if (mobileEl) mobileEl.textContent = u.mobile ? `+91 ${u.mobile}` : 'Not provided';
    if (emailEl) emailEl.textContent = u.email || 'Not provided';
    if (dobEl) dobEl.textContent = u.dob ? this.formatDisplayDate(u.dob) : 'Not set';
    if (ageGenderEl) ageGenderEl.textContent = `${formattedAge || 'Age not set'} • ${u.gender || 'Male'}`;
    if (bloodEl) bloodEl.textContent = u.bloodGroup || 'O+';
    if (addressEl) addressEl.textContent = u.address || 'Address not provided';
    if (locEl) locEl.textContent = u.location || 'Not set';

    this.renderMembershipSummary();
  },

  populateFormInputs() {
    const u = this.currentUser || {};
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = (val !== undefined && val !== null) ? val : '';
    };

    const salEl = document.getElementById('self-edit-salutation');
    if (salEl) salEl.value = u.salutation || this.inferDefaultSalutation(u.gender, u.age);

    setVal('self-edit-name', u.name);
    setVal('self-edit-mobile', u.mobile);
    setVal('self-edit-dob', u.dob);
    setVal('self-edit-age', this.formatAgeDisplay(u.dob, u.age));
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
    if (this._isSavingProfile) return;

    const saveBtn = document.getElementById('self-edit-save-btn');
    const originalText = saveBtn ? saveBtn.textContent : 'Save Profile Details';

    const salutation = document.getElementById('self-edit-salutation').value;
    const name = document.getElementById('self-edit-name').value.trim();
    const mobile = this.normalizeMobile(document.getElementById('self-edit-mobile').value);
    const bloodGroup = document.getElementById('self-edit-blood').value;
    const dob = this.normalizeDobInput(document.getElementById('self-edit-dob').value);
    const gender = document.getElementById('self-edit-gender').value;
    const email = document.getElementById('self-edit-email').value.trim();
    const address = document.getElementById('self-edit-address').value.trim();
    const location = document.getElementById('self-edit-location').value.trim();

    if (!name) {
      this.safeShowToast('Please enter your name', 'error');
      document.getElementById('self-edit-name').focus();
      return;
    }

    if (!dob) {
      this.safeShowToast('Please select your Date of Birth', 'error');
      document.getElementById('self-edit-dob').focus();
      return;
    }

    try {
      this._isSavingProfile = true;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      const calculatedAge = this.calculateAge(dob);
      const activeMobile = mobile || this.normalizeMobile((this.currentUser && this.currentUser.mobile) || this.resolveSessionMobile());

      this.currentUser = {
        ...this.currentUser,
        userId: (this.currentUser && this.currentUser.userId) || ('SCD_' + activeMobile),
        salutation,
        name,
        mobile: activeMobile,
        bloodGroup,
        dob,
        age: calculatedAge,
        gender,
        email,
        address,
        location
      };

      const serialized = JSON.stringify(this.currentUser);
      localStorage.setItem('selfcare_active_user', activeMobile);
      localStorage.setItem(`selfcare_profile_${activeMobile}`, serialized);
      localStorage.setItem('selfcare_customer_profile', serialized);
      localStorage.setItem('selfcare_permanent_user', serialized);

      if (typeof Auth !== 'undefined' && Auth.savePermanentSession) {
        Auth.savePermanentSession(this.currentUser);
      }

      if (navigator.onLine && typeof Api !== 'undefined') {
        const cloudPayload = {
          userId: this.currentUser.userId,
          mobile: activeMobile,
          salutation: this.currentUser.salutation,
          name: this.currentUser.name,
          dob: this.currentUser.dob,
          age: this.currentUser.age,
          gender: this.currentUser.gender,
          bloodGroup: this.currentUser.bloodGroup,
          email: this.currentUser.email,
          address: this.currentUser.address,
          location: this.currentUser.location
        };

        if (typeof Api.updateProfile === 'function') {
          await Api.updateProfile(cloudPayload);
        } else if (typeof Api.request === 'function') {
          await Api.request('updateProfile', cloudPayload, false);
        }
      }

      this.renderSelfProfile();
      this.safeShowToast('Profile details saved successfully!', 'success');
      this.toggleSelfEditMode(false);
    } catch (e) {
      console.error(e);
      this.safeShowToast('Profile details saved locally!', 'info');
      this.toggleSelfEditMode(false);
    } finally {
      this._isSavingProfile = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    }
  },

  /* ================= FAMILY DIRECTORY ================= */
  openFamilyMembersModal() {
    this.renderFamilyCards();
    this.closeMemberForm();
    this.openModal('modal-family-members');

    if (navigator.onLine) {
      this.syncLiveCloudFamilyMembers().catch(e => console.warn('[Profile] Modal open sync notice:', e));
    }
  },

  renderFamilyCards() {
    const countEl = document.getElementById('family-total-count');
    const container = document.getElementById('family-cards-container');
    if (!container) return;

    const count = this.familyMembers.length;
    if (countEl) countEl.textContent = `${count} ${count === 1 ? 'Member' : 'Members'} Saved`;
    this.updateFamilyMenuSummary();

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

    const esc = (str) => (typeof Utils !== 'undefined' && Utils.escapeHtml) ? Utils.escapeHtml(str) : String(str || '');

    container.innerHTML = this.familyMembers.map(m => {
      const isMemberVip = this.isMemberVIP(m);
      const displayName = this.formatFullName(m.salutation, m.name);
      const formattedAge = this.formatAgeDisplay(m.dob, m.age);
      const formattedDob = m.dob ? this.formatDisplayDate(m.dob) : 'Not set';

      return `
        <div class="member-display-card">
          <div class="member-card-header">
            <div class="member-title-group">
              <span class="member-name-text">${esc(displayName)}</span>
              <span class="member-relation-badge">${esc(m.relation || 'Relative')}</span>
              ${isMemberVip ? '<span class="member-vip-badge">VIP</span>' : ''}
            </div>
            <div class="member-actions-group">
              <button type="button" class="card-btn-edit" onclick="ProfilePage.editFamilyMember('${esc(m.id)}')">Edit</button>
              <button type="button" class="card-btn-delete" onclick="ProfilePage.deleteFamilyMember('${esc(m.id)}')">Delete</button>
            </div>
          </div>

          <div class="member-card-body-grid">
            <div class="member-info-item">
              <span class="info-label">Mobile Number</span>
              <span class="info-val mobile-highlight">${m.mobile ? '+91 ' + esc(m.mobile) : 'Not provided'}</span>
            </div>
            <div class="member-info-item">
              <span class="info-label">Age &amp; Gender</span>
              <span class="info-val">${formattedAge ? esc(formattedAge) : 'Age not set'} • ${esc(m.gender || 'Not specified')}</span>
            </div>
            <div class="member-info-item">
              <span class="info-label">Date of Birth</span>
              <span class="info-val">${esc(formattedDob)}</span>
            </div>
            <div class="member-info-item">
              <span class="info-label">Blood Group</span>
              <span class="info-val">${esc(m.bloodGroup || 'O+')}</span>
            </div>
            <div class="member-info-item">
              <span class="info-label">Pickup Address</span>
              <span class="info-val">${esc(m.address || 'Same as primary')}</span>
            </div>
            <div class="member-info-item">
              <span class="info-label">GPS Location</span>
              <span class="info-val">
                ${m.location ? `<a href="${esc(m.location)}" target="_blank" rel="noopener noreferrer" style="color:#078866; text-decoration:underline;">Open Map</a>` : 'Not set'}
              </span>
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
        if (formTitle) formTitle.textContent = `Edit Details: ${this.formatFullName(target.salutation, target.name)}`;
        setVal('family-edit-id', target.id);
        setVal('family-salutation-select', target.salutation || this.inferDefaultSalutation(target.gender, target.age));
        setVal('family-name-input', target.name);
        setVal('family-relation-select', target.relation || 'Father');
        setVal('family-blood-select', target.bloodGroup || 'O+');
        setVal('family-dob-input', target.dob || '');
        setVal('family-age-input', this.formatAgeDisplay(target.dob, target.age));
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
    setVal('family-salutation-select', 'Mr.');
    setVal('family-name-input', '');
    setVal('family-relation-select', 'Father');
    setVal('family-blood-select', 'O+');
    setVal('family-dob-input', '');
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
    if (this._isSavingMember) return;

    const saveBtn = document.getElementById('family-save-btn');
    const originalText = saveBtn ? saveBtn.textContent : 'Save Member';

    const editId = document.getElementById('family-edit-id').value.trim();
    const salutation = document.getElementById('family-salutation-select').value;
    const name = document.getElementById('family-name-input').value.trim();
    const relation = document.getElementById('family-relation-select').value;
    const bloodGroup = document.getElementById('family-blood-select').value;
    const dob = this.normalizeDobInput(document.getElementById('family-dob-input').value);
    const gender = document.getElementById('family-gender-select').value;
    const mobile = this.normalizeMobile(document.getElementById('family-mobile-input').value);
    const email = document.getElementById('family-email-input').value.trim();
    const address = document.getElementById('family-address-input').value.trim();
    const location = document.getElementById('family-location-input').value.trim();

    if (!name) {
      this.safeShowToast('Please enter member name', 'error');
      return;
    }

    if (!dob) {
      this.safeShowToast('Please select Date of Birth', 'error');
      document.getElementById('family-dob-input').focus();
      return;
    }

    if (!mobile || mobile.length !== 10) {
      this.safeShowToast('Please enter a valid 10-digit mobile number for this member', 'error');
      return;
    }

    try {
      this._isSavingMember = true;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      const activeMobile = this.normalizeMobile((this.currentUser && this.currentUser.mobile) || this.resolveSessionMobile());
      if (!activeMobile) {
        this.safeShowToast('User session expired. Please re-login.', 'error');
        return;
      }

      const activeName = (this.currentUser && this.currentUser.name && this.currentUser.name.trim()) ? this.currentUser.name : 'Customer Account';
      const activeUserId = (this.currentUser && this.currentUser.userId) || ('SCD_' + activeMobile);

      const finalMemberId = editId || `FAM_${Date.now()}`;
      const calculatedAge = this.calculateAge(dob);

      let existingMembership = 'Regular';
      if (editId) {
        const existingTarget = this.familyMembers.find(m => m.id === editId);
        if (existingTarget && existingTarget.membership) {
          existingMembership = existingTarget.membership;
        }
      }

      const memberPayload = {
        id: finalMemberId,
        memberId: finalMemberId,
        MemberID: finalMemberId,
        primaryUserId: activeUserId,
        PrimaryUserID: activeUserId,
        primaryUserName: activeName,
        PrimaryUserName: activeName,
        primaryMobile: activeMobile,
        PrimaryMobile: activeMobile,
        salutation,
        name,
        relation,
        bloodGroup,
        dob,
        age: calculatedAge,
        gender,
        mobile,
        email,
        address,
        location,
        membership: existingMembership,
        updatedAt: new Date().toISOString()
      };

      if (editId) {
        this.familyMembers = this.familyMembers.map(m => (m.id === editId ? memberPayload : m));
      } else {
        const alreadyExists = this.familyMembers.some(m => m.name.toLowerCase() === name.toLowerCase() && m.mobile === mobile);
        if (!alreadyExists) {
          this.familyMembers.push(memberPayload);
        }
      }

      const serialized = JSON.stringify(this.familyMembers);
      localStorage.setItem('selfcare_family_members', serialized);
      localStorage.setItem(`selfcare_family_${activeMobile}`, serialized);

      if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
        try {
          await Api.request('saveFamilyMember', memberPayload, false);
        } catch (err) {
          console.warn('[Family] Sheet save warning:', err);
        }
      }

      this.renderFamilyCards();
      this.closeMemberForm();
      this.safeShowToast(`${this.formatFullName(salutation, name)} details saved successfully!`, 'success');
    } finally {
      this._isSavingMember = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    }
  },

  async deleteFamilyMember(id) {
    const target = this.familyMembers.find(m => m.id === id);
    const memberName = target ? this.formatFullName(target.salutation, target.name) : 'Member';

    if (!confirm(`Are you sure you want to remove ${memberName}?`)) return;

    this.familyMembers = this.familyMembers.filter(m => m.id !== id);
    const serialized = JSON.stringify(this.familyMembers);
    localStorage.setItem('selfcare_family_members', serialized);

    const currentMobile = this.normalizeMobile((this.currentUser && this.currentUser.mobile) || this.resolveSessionMobile());
    if (currentMobile) localStorage.setItem(`selfcare_family_${currentMobile}`, serialized);

    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      try {
        await Api.request('deleteFamilyMember', {
          id,
          memberId: id,
          primaryMobile: currentMobile,
          primaryUserId: currentMobile ? 'SCD_' + currentMobile : ''
        }, false);
      } catch (err) {}
    }

    this.renderFamilyCards();
    this.safeShowToast(`${memberName} removed.`, 'info');
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
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  },

  updateCartBadgeUI() {
    const badges = document.querySelectorAll('.cart-badge');
    const activeUser = this.resolveSessionMobile();
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
  },

  renderBloodConnectBadges() {
    try {
      const storedReq = localStorage.getItem('selfcare_blood_requests');
      const storedDonors = localStorage.getItem('selfcare_blood_donors');

      const requests = storedReq ? JSON.parse(storedReq) : [];
      const donors = storedDonors ? JSON.parse(storedDonors) : [];

      const activeSosList = requests.filter(r => (parseInt(r.unitsNeeded || 1, 10) - (r.unitsDonated || 0)) > 0);
      const sosCount = activeSosList.length;
      const donorCount = donors.length;

      const sosChip = document.getElementById('chip-active-sos');
      const donorChip = document.getElementById('chip-total-donors');
      const urgentPill = document.getElementById('urgent-live-pill');

      if (sosChip) {
        sosChip.textContent = sosCount > 0 ? `${sosCount} Active SOS` : `0 Urgent SOS`;
      }

      if (donorChip) {
        donorChip.textContent = `${donorCount} Donors`;
      }

      if (urgentPill) {
        urgentPill.style.display = sosCount > 0 ? 'inline-block' : 'none';
      }
    } catch (e) {
      console.warn('[Profile] Blood badge error:', e);
    }
  },

  async syncBloodConnectLive() {
    if (!navigator.onLine || typeof Api === 'undefined' || typeof Api.request !== 'function') return;
    try {
      const rawRes = await Api.request('getBloodData', {}, false).catch(() => null);
      const res = this.unwrapResponse(rawRes);
      if (res && res.status === 'success') {
        if (Array.isArray(res.requests)) {
          localStorage.setItem('selfcare_blood_requests', JSON.stringify(res.requests));
        }
        if (Array.isArray(res.donors)) {
          localStorage.setItem('selfcare_blood_donors', JSON.stringify(res.donors));
        }
        this.renderBloodConnectBadges();
      }
    } catch (e) {
      console.warn('[Profile] Blood live sync error:', e);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ProfilePage.init();
});

if (typeof window !== 'undefined') window.ProfilePage = ProfilePage;
if (typeof module !== 'undefined' && module.exports) module.exports = ProfilePage;
