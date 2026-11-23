/* file: assets/js/auth.js */
/**
 * Selfcare Diagnostics - Instant Zero-Lag Permanent Auth Engine v3.9.0
 * Features:
 * - Routes unauthenticated users to index.html (Single Unified Login Portal)
 * - Supports SCDADMIN, SCDTECH, and Lifetime Patient Sessions
 */

const Auth = {
  ACTIVE_USER_KEY: 'selfcare_active_user',
  PROFILE_KEY: 'selfcare_customer_profile',
  TOKEN_KEY: 'selfcare_auth_token',
  ROLE_KEY: 'selfcare_user_role',

  checkRouteGuard() {
    try {
      if (typeof window === 'undefined') return;

      const currentPath = window.location.pathname.toLowerCase();
      const currentUrl = window.location.href;

      if (
        currentPath.endsWith('index.html') ||
        currentPath.endsWith('/') ||
        currentPath.endsWith('login.html')
      ) {
        return;
      }

      const activeUser = localStorage.getItem(this.ACTIVE_USER_KEY);
      const activeTech =
        localStorage.getItem('selfcare_active_tech') ||
        localStorage.getItem('selfcare_active_technician') ||
        localStorage.getItem('selfcare_captain_session');
      const token = localStorage.getItem(this.TOKEN_KEY);

      const isLogged = Boolean(activeUser && token) || Boolean(activeTech) || this.isLoggedIn();

      if (!isLogged) {
        const target = encodeURIComponent(currentUrl);
        window.location.replace(`index.html?redirect=${target}`);
        return;
      }

      if (currentPath.includes('technician.html') && !activeTech) {
        const techName = activeUser || 'Mohamed Adamkani';
        const defaultTech = { id: 'SCDTECH001', name: techName, zone: 'Vettuvankeni Lab' };
        localStorage.setItem('selfcare_active_tech', JSON.stringify(defaultTech));
      }
    } catch (e) {
      console.warn('[Auth] Route guard check notice:', e);
    }
  },

  isLoggedIn() {
    try {
      const activeUser = localStorage.getItem(this.ACTIVE_USER_KEY);
      const token = localStorage.getItem(this.TOKEN_KEY);
      if (activeUser && token) return true;

      const legacy = localStorage.getItem('selfcare_permanent_user') || localStorage.getItem('selfcare_user_session');
      if (legacy) {
        const parsed = JSON.parse(legacy);
        return Boolean(parsed && (parsed.mobile || parsed.phone));
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  getUser() {
    try {
      const profileRaw = localStorage.getItem(this.PROFILE_KEY);
      if (profileRaw) {
        const profile = JSON.parse(profileRaw);
        if (!profile.mobile) {
          profile.mobile = localStorage.getItem(this.ACTIVE_USER_KEY) || '';
        }
        if (!profile.userId) {
          profile.userId = `SCD_${profile.mobile}`;
        }
        return profile;
      }

      const activeMobile = localStorage.getItem(this.ACTIVE_USER_KEY);
      if (activeMobile) {
        const userVault = localStorage.getItem(`selfcare_profile_${activeMobile}`);
        if (userVault) return JSON.parse(userVault);

        return {
          userId: `SCD_${activeMobile}`,
          mobile: activeMobile,
          phone: activeMobile,
          salutation: 'Mr.',
          name: 'Valued Customer',
          relation: 'Self',
          membership: 'Regular'
        };
      }

      const legacy = localStorage.getItem('selfcare_permanent_user') || localStorage.getItem('selfcare_user_session');
      return legacy ? JSON.parse(legacy) : null;
    } catch (e) {
      return null;
    }
  },

  getSession() {
    return this.getUser();
  },

  savePermanentSession(userData) {
    if (!userData) return false;
    const rawMobile = userData.mobile || userData.phone || '';
    const cleanMobile = String(rawMobile).replace(/\D/g, '').slice(-10);

    if (!cleanMobile) return false;

    let existingProfile = {};
    try {
      const stored = localStorage.getItem(this.PROFILE_KEY) || localStorage.getItem(`selfcare_profile_${cleanMobile}`);
      if (stored) existingProfile = JSON.parse(stored);
    } catch (e) {}

    const memStatus = userData.membership || existingProfile.membership || 'Regular';
    const memExpiry = userData.membershipExpiry || userData.vipExpiry || existingProfile.membershipExpiry || existingProfile.vipExpiry || '';
    const isVipValid = memStatus === 'Membership' && (!memExpiry || new Date(memExpiry) > new Date());

    const permanentUser = {
      ...existingProfile,
      ...userData,
      userId: userData.userId || userData.UserID || existingProfile.userId || `SCD_${cleanMobile}`,
      mobile: cleanMobile,
      phone: cleanMobile,
      salutation: userData.salutation || userData.Salutation || existingProfile.salutation || 'Mr.',
      name: userData.name || userData.Name || existingProfile.name || 'Valued Customer',
      age: userData.age || userData.Age || existingProfile.age || existingProfile.Age || '',
      dob: userData.dob || userData.DOB || userData.dateOfBirth || existingProfile.dob || '',
      gender: userData.gender || userData.Gender || existingProfile.gender || 'Male',
      bloodGroup: userData.bloodGroup || userData.BloodGroup || existingProfile.bloodGroup || 'O+',
      email: userData.email || userData.Email || existingProfile.email || '',
      role: userData.role || existingProfile.role || 'patient',
      address: userData.address || userData.Address || existingProfile.address || '',
      location: userData.location || userData.Location || existingProfile.location || '',
      membership: isVipValid ? 'Membership' : 'Regular',
      membershipExpiry: memExpiry,
      vipExpiry: memExpiry,
      verifiedAt: userData.verifiedAt || existingProfile.verifiedAt || new Date().toISOString(),
      isPermanent: true
    };

    try {
      const serialized = JSON.stringify(permanentUser);
      localStorage.setItem(this.ACTIVE_USER_KEY, cleanMobile);
      localStorage.setItem(this.PROFILE_KEY, serialized);
      localStorage.setItem(`selfcare_profile_${cleanMobile}`, serialized);
      localStorage.setItem(this.TOKEN_KEY, userData.token || existingProfile.token || `PERMANENT_NABL_TOKEN_${cleanMobile}`);
      localStorage.setItem(this.ROLE_KEY, permanentUser.role);
      localStorage.setItem('selfcare_permanent_user', serialized);
      localStorage.setItem('selfcare_user_session', serialized);

      if (isVipValid) {
        localStorage.setItem('selfcare_is_vip_member', 'true');
        localStorage.setItem(`selfcare_membership_${cleanMobile}`, JSON.stringify({
          status: 'Membership',
          plan: 'CarePass 1 Year VIP',
          expiryDate: memExpiry
        }));
      } else {
        localStorage.removeItem('selfcare_is_vip_member');
      }

      if (typeof App !== 'undefined' && App.refreshVipBadges) {
        App.refreshVipBadges();
      }

      return true;
    } catch (e) {
      return false;
    }
  },

  setSession(sessionData) {
    return this.savePermanentSession(sessionData);
  },

  updateProfile(updatedFields) {
    const current = this.getUser() || {};
    return this.savePermanentSession({ ...current, ...updatedFields });
  },

  requireAuth(redirectUrl = 'index.html') {
    if (!this.isLoggedIn()) {
      const target = encodeURIComponent(window.location.href);
      window.location.replace(`${redirectUrl}?redirect=${target}`);
      return false;
    }
    return true;
  },

  logout() {
    try {
      const activeMobile = localStorage.getItem(this.ACTIVE_USER_KEY);
      if (activeMobile) {
        const activeCart = localStorage.getItem('selfcare_cart');
        if (activeCart) localStorage.setItem(`selfcare_cart_${activeMobile}`, activeCart);
      }

      localStorage.removeItem(this.ACTIVE_USER_KEY);
      localStorage.removeItem(this.PROFILE_KEY);
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.ROLE_KEY);
      localStorage.removeItem('selfcare_active_tech');
      localStorage.removeItem('selfcare_active_technician');
      localStorage.removeItem('selfcare_captain_session');
      localStorage.removeItem('selfcare_tech_workspace');
      localStorage.removeItem('selfcare_is_vip_member');
      localStorage.removeItem('selfcare_permanent_user');
      localStorage.removeItem('selfcare_user_session');
      localStorage.removeItem('selfcare_cart');
      localStorage.removeItem('cart');
      localStorage.removeItem('selfcare_family_members');

      if (typeof Utils !== 'undefined' && Utils.showToast) {
        Utils.showToast('Logged out successfully', 'info');
      }
      setTimeout(() => {
        window.location.replace('index.html?logout=true');
      }, 350);
    } catch (e) {}
  }
};

Auth.checkRouteGuard();

if (typeof window !== 'undefined') window.Auth = Auth;
if (typeof module !== 'undefined' && module.exports) module.exports = Auth;
