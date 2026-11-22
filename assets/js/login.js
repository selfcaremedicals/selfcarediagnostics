/* file: assets/js/login.js */
/**
 * Selfcare Diagnostics - Unified Authentication Engine v6.0.0
 * Features:
 * 1. Password-Based Patient Login & Sign Up (No OTP required).
 * 2. Live Password & Confirm Password Matching Verification on Sign Up.
 * 3. Lifetime Persistent Session for Patients (Never logs out unless manually logged out).
 * 4. Staff / Admin Login Only (Sign Up restricted strictly to Patients).
 * 5. Strict Multi-tenant Cart Isolation per mobile number.
 */

const LoginPage = {
  init() {
    this.checkIfAlreadyLoggedIn();
    this.checkInitialRoleTab();
  },

  safeShowToast(message, type = 'info') {
    if (typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(message, type);
    } else {
      alert(message);
    }
  },

  /**
   * Auto-select Staff tab if URL contains ?role=staff, ?role=admin, or ?role=tech
   */
  checkInitialRoleTab() {
    const urlParams = new URLSearchParams(window.location.search);
    const roleParam = (urlParams.get('role') || '').toLowerCase();
    const returnUrl = (urlParams.get('returnUrl') || urlParams.get('redirect') || '').toLowerCase();

    if (
      roleParam === 'staff' ||
      roleParam === 'admin' ||
      roleParam === 'tech' ||
      roleParam === 'technician' ||
      returnUrl.includes('admin.html') ||
      returnUrl.includes('technician.html')
    ) {
      this.switchRoleTab('staff');
    } else if ((urlParams.get('mode') || '').toLowerCase() === 'signup') {
      this.switchRoleTab('patient');
      this.switchPatientMode('signup');
    }
  },

  /**
   * Switch between Patient Portal and Staff / Admin Portal
   */
  switchRoleTab(role) {
    const patientTab = document.getElementById('tab-patient-btn');
    const staffTab = document.getElementById('tab-staff-btn');
    const patientWrapper = document.getElementById('patient-auth-wrapper');
    const staffSection = document.getElementById('view-staff-step');
    const staffError = document.getElementById('staff-error-hint');

    if (role === 'staff') {
      if (patientTab) patientTab.classList.remove('active');
      if (staffTab) staffTab.classList.add('active');
      if (patientWrapper) patientWrapper.style.display = 'none';
      if (staffSection) staffSection.style.display = 'block';
      if (staffError) staffError.style.display = 'none';
    } else {
      if (staffTab) staffTab.classList.remove('active');
      if (patientTab) patientTab.classList.add('active');
      if (staffSection) staffSection.style.display = 'none';
      if (patientWrapper) patientWrapper.style.display = 'block';
    }
  },

  /**
   * Switch between Patient Login and Patient Sign Up
   */
  switchPatientMode(mode) {
    const loginSubtab = document.getElementById('subtab-patient-login');
    const signupSubtab = document.getElementById('subtab-patient-signup');
    const loginView = document.getElementById('view-patient-login');
    const signupView = document.getElementById('view-patient-signup');
    const loginErr = document.getElementById('patient-login-error');
    const signupErr = document.getElementById('patient-signup-error');

    if (loginErr) loginErr.style.display = 'none';
    if (signupErr) signupErr.style.display = 'none';

    if (mode === 'signup') {
      if (loginSubtab) loginSubtab.classList.remove('active');
      if (signupSubtab) signupSubtab.classList.add('active');
      if (loginView) loginView.style.display = 'none';
      if (signupView) signupView.style.display = 'block';
    } else {
      if (signupSubtab) signupSubtab.classList.remove('active');
      if (loginSubtab) loginSubtab.classList.add('active');
      if (signupView) signupView.style.display = 'none';
      if (loginView) loginView.style.display = 'block';
    }
  },

  togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    if (btnEl) {
      btnEl.textContent = input.type === 'password' ? '👁️' : '🙈';
    }
  },

  /**
   * Lifetime Session Auto-Restore (Prevents asking login again once logged in)
   */
  checkIfAlreadyLoggedIn() {
    const urlParams = new URLSearchParams(window.location.search);
    const forceLogout = urlParams.get('logout') === 'true';

    if (forceLogout) {
      this.performManualLogout();
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      return;
    }

    const userRole = localStorage.getItem('selfcare_user_role');
    const activeUser = localStorage.getItem('selfcare_active_user');
    const authToken = localStorage.getItem('selfcare_auth_token');
    const activeTech = localStorage.getItem('selfcare_active_tech') || localStorage.getItem('selfcare_active_technician');

    if (userRole === 'admin' && activeUser) {
      window.location.replace('admin.html');
      return;
    }

    if (userRole === 'technician') {
      if (activeTech) {
        window.location.replace('technician.html');
        return;
      } else {
        localStorage.removeItem('selfcare_user_role');
        localStorage.removeItem('selfcare_active_user');
        return;
      }
    }

    if ((activeUser && authToken) || activeTech) {
      const pendingShare = localStorage.getItem('scd_pending_share_url');
      let targetRedirect = urlParams.get('returnUrl') || urlParams.get('redirect') || pendingShare || '';

      if (pendingShare) {
        localStorage.removeItem('scd_pending_share_url');
      }

      if (!targetRedirect) {
        targetRedirect = activeTech ? 'technician.html' : 'customer.html';
      }

      if (targetRedirect.toLowerCase().includes('technician.html') && !activeTech) {
        const techName = activeUser || 'Mohamed Adamkani';
        localStorage.setItem('selfcare_active_tech', JSON.stringify({
          id: 'TechlabDesk',
          name: techName,
          zone: 'Vettuvankeni Lab'
        }));
      }

      window.location.replace(targetRedirect);
    }
  },

  validateMobileInput(inputEl) {
    inputEl.value = inputEl.value.replace(/\D/g, '').slice(0, 10);
    const loginErr = document.getElementById('patient-login-error');
    const signupErr = document.getElementById('patient-signup-error');
    if (loginErr) loginErr.style.display = 'none';
    if (signupErr) signupErr.style.display = 'none';
  },

  /**
   * Real-time password & confirm password match checker
   */
  checkPasswordMatch() {
    const pwdEl = document.getElementById('signup-password-input');
    const confirmEl = document.getElementById('signup-confirm-input');
    const badgeEl = document.getElementById('password-match-badge');
    if (!pwdEl || !confirmEl || !badgeEl) return false;

    const pwd = pwdEl.value;
    const confirmPwd = confirmEl.value;

    if (!confirmPwd) {
      badgeEl.style.display = 'none';
      badgeEl.textContent = '';
      return false;
    }

    badgeEl.style.display = 'flex';
    if (pwd === confirmPwd) {
      badgeEl.className = 'password-match-badge match-ok';
      badgeEl.textContent = '✓ Passwords match perfectly';
      return true;
    } else {
      badgeEl.className = 'password-match-badge match-err';
      badgeEl.textContent = '✗ Passwords do not match';
      return false;
    }
  },

  getStoredPatientCredentials() {
    try {
      const raw = localStorage.getItem('selfcare_patient_credentials');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },

  savePatientCredential(mobile, password, serverProfile = null) {
    const map = this.getStoredPatientCredentials();
    map[mobile] = {
      mobile,
      password,
      userId: (serverProfile && serverProfile.userId) || `SCD_${mobile}`,
      name: (serverProfile && serverProfile.name) || (map[mobile] && map[mobile].name) || 'Valued Customer',
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('selfcare_patient_credentials', JSON.stringify(map));
  },

  /**
   * Save Permanent Lifetime Patient Session & Redirect
   */
  finalizePatientSession(mobile, serverUser = null) {
    const previousMobile = localStorage.getItem('selfcare_active_user');

    if (previousMobile && previousMobile !== mobile) {
      try {
        const activeCart = localStorage.getItem('selfcare_cart');
        if (activeCart) localStorage.setItem(`selfcare_cart_${previousMobile}`, activeCart);

        const activeFam = localStorage.getItem('selfcare_family_members');
        if (activeFam) localStorage.setItem(`selfcare_family_${previousMobile}`, activeFam);

        localStorage.removeItem('cart');
        localStorage.removeItem('selfcare_cart');
      } catch (e) {}
    }

    let existingVault = {};
    try {
      const rawVault = localStorage.getItem(`selfcare_profile_${mobile}`);
      if (rawVault) existingVault = JSON.parse(rawVault);
    } catch (e) {}

    const userData = {
      ...existingVault,
      userId: (serverUser && serverUser.userId) ? serverUser.userId : (existingVault.userId || `SCD_${mobile}`),
      mobile: mobile,
      phone: mobile,
      name: (serverUser && serverUser.name) ? serverUser.name : (existingVault.name || 'Valued Customer'),
      token: (serverUser && serverUser.token) ? serverUser.token : `LIFETIME_NABL_TOKEN_${mobile}`,
      role: 'patient',
      lifetimeSession: true
    };

    if (typeof Auth !== 'undefined' && typeof Auth.savePermanentSession === 'function') {
      Auth.savePermanentSession(userData);
    }

    const serialized = JSON.stringify(userData);
    localStorage.setItem('selfcare_active_user', mobile);
    localStorage.setItem('selfcare_user_role', 'patient');
    localStorage.setItem('selfcare_auth_token', userData.token);
    localStorage.setItem('selfcare_customer_profile', serialized);
    localStorage.setItem('selfcare_permanent_user', serialized);
    localStorage.setItem(`selfcare_profile_${mobile}`, serialized);

    try {
      const userVaultCart = localStorage.getItem(`selfcare_cart_${mobile}`);
      if (userVaultCart) {
        localStorage.setItem('selfcare_cart', userVaultCart);
        localStorage.setItem('cart', userVaultCart);
      } else {
        const emptyCart = JSON.stringify([]);
        localStorage.setItem('selfcare_cart', emptyCart);
        localStorage.setItem('cart', emptyCart);
        localStorage.setItem(`selfcare_cart_${mobile}`, emptyCart);
      }
    } catch (e) {}

    this.safeShowToast('Login successful! Welcome to Selfcare Diagnostics', 'success');

    setTimeout(() => {
      const urlParams = new URLSearchParams(window.location.search);
      const pendingShare = localStorage.getItem('scd_pending_share_url');
      let targetRedirect = urlParams.get('returnUrl') || urlParams.get('redirect') || pendingShare || 'customer.html';

      if (pendingShare) {
        localStorage.removeItem('scd_pending_share_url');
      }

      if (targetRedirect.toLowerCase().includes('technician.html') || urlParams.get('role') === 'tech') {
        localStorage.setItem('selfcare_active_tech', JSON.stringify({
          id: 'TechlabDesk',
          name: userData.name || 'Mohamed Adamkani',
          zone: 'Vettuvankeni Lab'
        }));
      }

      window.location.replace(targetRedirect);
    }, 450);
  },

  /**
   * PATIENT SIGN UP HANDLER
   */
  async handlePatientSignup() {
    const mobileInput = document.getElementById('signup-mobile-input');
    const pwdInput = document.getElementById('signup-password-input');
    const confirmInput = document.getElementById('signup-confirm-input');
    const errHint = document.getElementById('patient-signup-error');
    const signupBtn = document.getElementById('patient-signup-btn');

    const mobile = mobileInput ? mobileInput.value.trim() : '';
    const password = pwdInput ? pwdInput.value.trim() : '';
    const confirmPwd = confirmInput ? confirmInput.value.trim() : '';

    if (errHint) errHint.style.display = 'none';

    if (!/^[6-9]\d{9}$/.test(mobile)) {
      if (errHint) {
        errHint.textContent = 'Please enter a valid 10-digit Indian mobile number.';
        errHint.style.display = 'block';
      }
      this.safeShowToast('Please enter a valid 10-digit mobile number', 'error');
      if (mobileInput) mobileInput.focus();
      return;
    }

    if (password.length < 4) {
      if (errHint) {
        errHint.textContent = 'Password must be at least 4 characters long.';
        errHint.style.display = 'block';
      }
      this.safeShowToast('Password must be at least 4 characters', 'error');
      if (pwdInput) pwdInput.focus();
      return;
    }

    if (password !== confirmPwd) {
      if (errHint) {
        errHint.textContent = 'Passwords do not match. Please enter matching passwords.';
        errHint.style.display = 'block';
      }
      this.safeShowToast('Passwords do not match', 'error');
      if (confirmInput) confirmInput.focus();
      return;
    }

    if (signupBtn) {
      signupBtn.disabled = true;
      signupBtn.innerHTML = '<span>Creating Account...</span>';
    }

    try {
      let serverUser = null;

      if (navigator.onLine && typeof Api !== 'undefined') {
        try {
          if (typeof Api.patientRegister === 'function') {
            serverUser = await Api.patientRegister(mobile, password);
          } else if (typeof Api.request === 'function') {
            serverUser = await Api.request('patientRegister', {
              mobile: mobile,
              password: password,
              userId: `SCD_${mobile}`
            }, false);
          }
        } catch (netErr) {
          console.warn('[Login] Cloud patient registration deferred, saving locally:', netErr);
        }
      }

      this.savePatientCredential(mobile, password, serverUser);
      this.finalizePatientSession(mobile, serverUser);

    } catch (err) {
      if (signupBtn) {
        signupBtn.disabled = false;
        signupBtn.innerHTML = '<span>Create Account &amp; Login ✓</span>';
      }
      if (errHint) {
        errHint.textContent = err.message || 'Registration failed. Please try again.';
        errHint.style.display = 'block';
      }
      this.safeShowToast(err.message || 'Registration failed', 'error');
    }
  },

  /**
   * PATIENT LOGIN HANDLER (Mobile + Password)
   */
  async handlePatientLogin() {
    const mobileInput = document.getElementById('mobile-number-input');
    const pwdInput = document.getElementById('patient-password-input');
    const errHint = document.getElementById('patient-login-error');
    const loginBtn = document.getElementById('patient-login-btn');

    const mobile = mobileInput ? mobileInput.value.trim() : '';
    const password = pwdInput ? pwdInput.value.trim() : '';

    if (errHint) errHint.style.display = 'none';

    if (!/^[6-9]\d{9}$/.test(mobile)) {
      if (errHint) {
        errHint.textContent = 'Please enter a valid 10-digit Indian mobile number.';
        errHint.style.display = 'block';
      }
      this.safeShowToast('Please enter a valid 10-digit mobile number', 'error');
      if (mobileInput) mobileInput.focus();
      return;
    }

    if (!password) {
      if (errHint) {
        errHint.textContent = 'Please enter your password.';
        errHint.style.display = 'block';
      }
      this.safeShowToast('Please enter your password', 'error');
      if (pwdInput) pwdInput.focus();
      return;
    }

    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.innerHTML = '<span>Logging in...</span>';
    }

    try {
      const credentialsMap = this.getStoredPatientCredentials();
      const localRecord = credentialsMap[mobile];
      let isAuthenticated = false;
      let serverUser = null;

      // 1. Check local saved credentials
      if (localRecord && localRecord.password === password) {
        isAuthenticated = true;
      }

      // 2. Verify with Cloud Backend if online
      if (!isAuthenticated && navigator.onLine && typeof Api !== 'undefined') {
        try {
          let serverRes = null;
          if (typeof Api.patientLogin === 'function') {
            serverRes = await Api.patientLogin(mobile, password);
          } else if (typeof Api.request === 'function') {
            serverRes = await Api.request('patientLogin', { mobile: mobile, password: password }, false);
          }

          if (serverRes && (serverRes.status === 'success' || serverRes.success || serverRes.userId)) {
            isAuthenticated = true;
            serverUser = serverRes.user || serverRes.profile || serverRes;
            this.savePatientCredential(mobile, password, serverUser);
          }
        } catch (netErr) {
          console.warn('[Login] Cloud patient login check notice:', netErr);
        }
      }

      if (!isAuthenticated) {
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.innerHTML = '<span>Login ➔</span>';
        }
        const msg = localRecord
          ? 'Incorrect password. Please try again.'
          : 'Mobile number not registered. Please click "Sign Up" to create an account.';
        if (errHint) {
          errHint.textContent = msg;
          errHint.style.display = 'block';
        }
        this.safeShowToast(msg, 'error');
        return;
      }

      this.finalizePatientSession(mobile, serverUser);

    } catch (err) {
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>Login ➔</span>';
      }
      this.safeShowToast(err.message || 'Login failed. Please try again.', 'error');
    }
  },

  /**
   * STAFF / ADMIN / TECHNICIAN LOGIN HANDLER (No Sign Up allowed)
   */
  async handleStaffLogin() {
    const idInput = document.getElementById('staff-id-input');
    const pwdInput = document.getElementById('staff-password-input');
    const errorHint = document.getElementById('staff-error-hint');
    const loginBtn = document.getElementById('staff-login-btn');

    const enteredId = idInput ? idInput.value.replace(/\s+/g, '').toLowerCase() : '';
    const enteredPwd = pwdInput ? pwdInput.value.trim() : '';

    if (errorHint) errorHint.style.display = 'none';

    if (!enteredId || !enteredPwd) {
      if (errorHint) {
        errorHint.textContent = 'Please enter both ID and Password.';
        errorHint.style.display = 'block';
      }
      return;
    }

    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.textContent = 'Verifying Credentials...';
    }

    // 1. Check ADMIN CREDENTIALS
    if (enteredId === 'admin@selfcare' && enteredPwd === 'admin@123') {
      localStorage.setItem('selfcare_active_user', 'admin@selfcare');
      localStorage.setItem('selfcare_user_role', 'admin');
      localStorage.setItem('selfcare_auth_token', 'SELFCARE_ADMIN_TOKEN_SECURE');

      this.safeShowToast('Welcome, Administrator!', 'success');
      setTimeout(() => window.location.replace('admin.html'), 400);
      return;
    }

    // 2. Check TECHNICIAN CREDENTIALS in localStorage
    let technicians = [];
    try {
      const storedTechs = localStorage.getItem('selfcare_technicians');
      if (storedTechs) technicians = JSON.parse(storedTechs);
    } catch (e) {}

    const matchedTech = technicians.find(t => {
      const tId = String(t.id || t.loginId || t.TechID || t.LoginID || '').replace(/\s+/g, '').toLowerCase();
      const tPwd = String(t.pass || t.password || t.Password || '').trim();
      return tId === enteredId && tPwd === enteredPwd;
    });

    if (matchedTech) {
      const techId = matchedTech.id || matchedTech.loginId || matchedTech.TechID || enteredId;
      const techData = {
        id: techId,
        name: matchedTech.name || matchedTech.Name || techId,
        zone: matchedTech.zone || matchedTech.ZoneArea || 'Chennai Zone',
        role: 'technician'
      };
      localStorage.setItem('selfcare_active_user', techId);
      localStorage.setItem('selfcare_user_role', 'technician');
      localStorage.setItem('selfcare_active_tech', JSON.stringify(techData));
      localStorage.setItem('selfcare_active_technician', JSON.stringify(techData));
      localStorage.setItem('selfcare_auth_token', `TECH_TOKEN_${techId}`);

      this.safeShowToast(`Welcome Technician ${techData.name}!`, 'success');
      setTimeout(() => window.location.replace('technician.html'), 400);
      return;
    }

    // 3. Live Google Sheets Backend Verification via Api.staffLogin
    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.staffLogin === 'function') {
      try {
        const serverRes = await Api.staffLogin(enteredId, enteredPwd);
        if (serverRes && (serverRes.success || serverRes.userId)) {
          if (serverRes.role === 'admin') {
            localStorage.setItem('selfcare_active_user', serverRes.userId || enteredId);
            localStorage.setItem('selfcare_user_role', 'admin');
            localStorage.setItem('selfcare_auth_token', 'SELFCARE_ADMIN_TOKEN_SECURE');
            this.safeShowToast('Welcome, Administrator!', 'success');
            setTimeout(() => window.location.replace('admin.html'), 400);
            return;
          }

          const techId = serverRes.userId || serverRes.techId || enteredId;
          const techData = {
            id: techId,
            name: serverRes.name || techId,
            zone: serverRes.area || serverRes.zone || 'Chennai Zone',
            role: serverRes.role || 'technician'
          };
          localStorage.setItem('selfcare_active_user', techId);
          localStorage.setItem('selfcare_user_role', 'technician');
          localStorage.setItem('selfcare_active_tech', JSON.stringify(techData));
          localStorage.setItem('selfcare_active_technician', JSON.stringify(techData));
          localStorage.setItem('selfcare_auth_token', `TECH_TOKEN_${techId}`);

          this.safeShowToast(`Welcome Technician ${techData.name}!`, 'success');
          setTimeout(() => window.location.replace('technician.html'), 400);
          return;
        }
      } catch (netErr) {
        console.warn('[Login] Live staff login check notice:', netErr);
      }
    }

    // 4. Invalid Credentials
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<span>Login ➔</span>';
    }
    if (errorHint) {
      errorHint.textContent = 'Invalid ID or Password. Please check credentials.';
      errorHint.style.display = 'block';
    }
    this.safeShowToast('Invalid credentials', 'error');
  },

  performManualLogout() {
    try {
      const currentUser = localStorage.getItem('selfcare_active_user');
      if (currentUser) {
        const activeCart = localStorage.getItem('selfcare_cart');
        if (activeCart) localStorage.setItem(`selfcare_cart_${currentUser}`, activeCart);
      }
    } catch (e) {}

    localStorage.removeItem('selfcare_active_user');
    localStorage.removeItem('selfcare_user_role');
    localStorage.removeItem('selfcare_auth_token');
    localStorage.removeItem('selfcare_active_tech');
    localStorage.removeItem('selfcare_active_technician');
    localStorage.removeItem('selfcare_cart');
    localStorage.removeItem('cart');
    localStorage.removeItem('selfcare_customer_profile');
    localStorage.removeItem('selfcare_permanent_user');
    localStorage.removeItem('selfcare_family_members');
    localStorage.removeItem('scd_pending_share_url');

    this.safeShowToast('You have been logged out securely.', 'info');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  LoginPage.init();
});

if (typeof window !== 'undefined') {
  window.LoginPage = LoginPage;
}
