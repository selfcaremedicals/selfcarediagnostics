/* file: assets/js/login.js */
/**
 * Selfcare Diagnostics - Unified Single-Tab Authentication Engine v7.0.0
 * Features:
 * 1. Clean Patient Login & Customer Sign Up UI (Zero extra tabs).
 * 2. One-Time Lifetime Patient Session (Never logs out unless manually logged out).
 * 3. Smart Prefix Routing in the Same Login Box:
 *    - ID starting with `SCDADMIN` -> Authenticates & routes strictly to `admin.html`.
 *    - ID starting with `SCDTECH`  -> Authenticates & opens Lab Desk (`technician.html`) vs Home Collection (`home-collection.html`) confirmation popup.
 *    - 10-digit Mobile Number      -> Authenticates Customer & routes to `customer.html`.
 */

const LoginPage = {
  pendingTechSession: null,

  init() {
    this.checkIfAlreadyLoggedIn();
    const urlParams = new URLSearchParams(window.location.search);
    if ((urlParams.get('mode') || '').toLowerCase() === 'signup') {
      this.switchPatientMode('signup');
    }
  },

  safeShowToast(message, type = 'info') {
    if (typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(message, type);
    } else {
      alert(message);
    }
  },

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
   * One-Time Lifetime Session Auto-Restore (Never logs out unless ?logout=true)
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
    const permanentUser = localStorage.getItem('selfcare_permanent_user');
    const activeTech = localStorage.getItem('selfcare_active_tech') || localStorage.getItem('selfcare_active_technician');

    // Admin persistent redirect (Only if ID starts with SCDADMIN)
    if (userRole === 'admin' && activeUser && activeUser.toUpperCase().startsWith('SCDADMIN')) {
      window.location.replace('admin.html');
      return;
    }

    // Technician persistent redirect (Only if ID starts with SCDTECH)
    if (userRole === 'technician' && activeTech) {
      try {
        const tObj = JSON.parse(activeTech);
        const tid = String(tObj.id || tObj.staffId || activeUser || '').toUpperCase();
        if (tid.startsWith('SCDTECH')) {
          const lastWorkspace = localStorage.getItem('selfcare_tech_workspace') || 'technician.html';
          window.location.replace(lastWorkspace);
          return;
        }
      } catch (e) {}
    }

    // Lifetime Patient Session Auto-Restore
    if ((activeUser && authToken) || permanentUser) {
      let restoredMobile = activeUser;
      if (!restoredMobile && permanentUser) {
        try {
          const p = JSON.parse(permanentUser);
          restoredMobile = p.mobile || p.phone || p.userId;
          if (restoredMobile) {
            localStorage.setItem('selfcare_active_user', restoredMobile);
            localStorage.setItem('selfcare_user_role', 'patient');
            localStorage.setItem('selfcare_auth_token', p.token || `LIFETIME_NABL_TOKEN_${restoredMobile}`);
          }
        } catch (e) {}
      }

      if (restoredMobile) {
        const pendingShare = localStorage.getItem('scd_pending_share_url');
        const targetRedirect = urlParams.get('returnUrl') || urlParams.get('redirect') || pendingShare || 'customer.html';
        if (pendingShare) localStorage.removeItem('scd_pending_share_url');
        window.location.replace(targetRedirect);
      }
    }
  },

  handleUnifiedIdInput(inputEl) {
    // Allow alphanumeric for SCDADMIN / SCDTECH prefixes or digits for 10-digit mobile
    inputEl.value = inputEl.value.replace(/[^a-zA-Z0-9@_.-]/g, '');
    const loginErr = document.getElementById('patient-login-error');
    if (loginErr) loginErr.style.display = 'none';
  },

  validateMobileInput(inputEl) {
    inputEl.value = inputEl.value.replace(/\D/g, '').slice(0, 10);
    const signupErr = document.getElementById('patient-signup-error');
    if (signupErr) signupErr.style.display = 'none';
  },

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

  savePatientCredential(mobile, password, name = 'Valued Customer', serverProfile = null) {
    const map = this.getStoredPatientCredentials();
    const resolvedName = (serverProfile && serverProfile.name) || name || (map[mobile] && map[mobile].name) || 'Valued Customer';
    const userId = (serverProfile && serverProfile.userId) || `SCD_${mobile}`;

    map[mobile] = {
      mobile,
      password,
      userId,
      name: resolvedName,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('selfcare_patient_credentials', JSON.stringify(map));

    // Also sync to Admin Customers Directory cache so Admin sees ID & Password
    try {
      const usersList = JSON.parse(localStorage.getItem('selfcare_users_db') || '[]');
      const idx = usersList.findIndex(u => String(u.phone || u.mobile) === mobile);
      const userEntry = {
        userId,
        name: resolvedName,
        phone: mobile,
        mobile,
        password,
        lastLogin: new Date().toLocaleDateString('en-GB')
      };
      if (idx !== -1) usersList[idx] = { ...usersList[idx], ...userEntry };
      else usersList.unshift(userEntry);
      localStorage.setItem('selfcare_users_db', JSON.stringify(usersList));
    } catch (e) {}
  },

  /**
   * Save Permanent Lifetime Patient Session (Never Logs Out)
   */
  finalizePatientSession(mobile, serverUser = null) {
    const previousMobile = localStorage.getItem('selfcare_active_user');

    if (previousMobile && previousMobile !== mobile) {
      try {
        const activeCart = localStorage.getItem('selfcare_cart');
        if (activeCart) localStorage.setItem(`selfcare_cart_${previousMobile}`, activeCart);
        localStorage.removeItem('cart');
        localStorage.removeItem('selfcare_cart');
      } catch (e) {}
    }

    let existingVault = {};
    try {
      const rawVault = localStorage.getItem(`selfcare_profile_${mobile}`);
      if (rawVault) existingVault = JSON.parse(rawVault);
    } catch (e) {}

    const credsMap = this.getStoredPatientCredentials();
    const savedName = (serverUser && serverUser.name) || existingVault.name || (credsMap[mobile] && credsMap[mobile].name) || 'Valued Customer';

    const userData = {
      ...existingVault,
      userId: (serverUser && serverUser.userId) ? serverUser.userId : (existingVault.userId || `SCD_${mobile}`),
      mobile: mobile,
      phone: mobile,
      name: savedName,
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
      const targetRedirect = urlParams.get('returnUrl') || urlParams.get('redirect') || pendingShare || 'customer.html';
      if (pendingShare) localStorage.removeItem('scd_pending_share_url');
      window.location.replace(targetRedirect);
    }, 400);
  },

  /* =========================================================
     UNIFIED LOGIN ROUTER:
     - Prefix `SCDADMIN` -> Admin OS (`admin.html`)
     - Prefix `SCDTECH`  -> Tech Confirmation Popup (`technician.html` vs `home-collection.html`)
     - 10-digit Mobile   -> Customer Lifetime Login (`customer.html`)
     ========================================================= */
  async handleUnifiedLogin() {
    const idInput = document.getElementById('mobile-number-input');
    const pwdInput = document.getElementById('patient-password-input');
    const errHint = document.getElementById('patient-login-error');
    const loginBtn = document.getElementById('patient-login-btn');

    const rawId = idInput ? idInput.value.trim() : '';
    const upperId = rawId.toUpperCase();
    const password = pwdInput ? pwdInput.value.trim() : '';

    if (errHint) errHint.style.display = 'none';

    if (!rawId || !password) {
      if (errHint) {
        errHint.textContent = 'Please enter your Mobile Number / ID and Password.';
        errHint.style.display = 'block';
      }
      return;
    }

    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.innerHTML = '<span>Verifying...</span>';
    }

    // ---------------------------------------------------------
    // ROUTE 1: STRICT `SCDADMIN...` PREFIX -> ADMIN PORTAL ONLY
    // ---------------------------------------------------------
    if (upperId.startsWith('SCDADMIN')) {
      let adminVerified = false;

      // Default Master Admin IDs (e.g., SCDADMIN01)
      if ((upperId === 'SCDADMIN01' || upperId === 'SCDADMIN') && password === 'admin@123') {
        adminVerified = true;
      }

      // Check Admin-configured list or Backend API
      if (!adminVerified && navigator.onLine && typeof Api !== 'undefined' && typeof Api.staffLogin === 'function') {
        try {
          const res = await Api.staffLogin(upperId, password);
          if (res && (res.success || res.userId) && String(res.role || '').toLowerCase() === 'admin') {
            adminVerified = true;
          }
        } catch (e) {}
      }

      if (!adminVerified) {
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.innerHTML = '<span>Login ➔</span>';
        }
        if (errHint) {
          errHint.textContent = 'Invalid Admin ID or Password.';
          errHint.style.display = 'block';
        }
        this.safeShowToast('Invalid Admin credentials', 'error');
        return;
      }

      localStorage.setItem('selfcare_active_user', upperId);
      localStorage.setItem('selfcare_user_role', 'admin');
      localStorage.setItem('selfcare_auth_token', `SELFCARE_ADMIN_TOKEN_${upperId}`);

      this.safeShowToast('Welcome, Selfcare Administrator!', 'success');
      setTimeout(() => window.location.replace('admin.html'), 400);
      return;
    }

    // ---------------------------------------------------------
    // ROUTE 2: STRICT `SCDTECH...` PREFIX -> LAB DESK vs HOME COLLECTION POPUP
    // ---------------------------------------------------------
    if (upperId.startsWith('SCDTECH')) {
      let matchedTechRecord = null;

      // Check Local Admin-Created Technician / Captain Roster
      try {
        const listA = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');
        const listB = JSON.parse(localStorage.getItem('selfcare_admin_captains') || '[]');
        const combined = [...listA, ...listB];

        const found = combined.find(t => {
          const tid = String(t.id || t.captainId || t.TechID || '').trim().toUpperCase();
          const tpwd = String(t.pass || t.password || t.Password || '').trim();
          const active = t.active !== false && String(t.status || 'Active') === 'Active';
          return tid === upperId && tpwd === password && active;
        });

        if (found) {
          matchedTechRecord = {
            id: upperId,
            staffId: upperId,
            name: found.name || found.technicianName || upperId,
            technicianName: found.name || found.technicianName || upperId,
            mobile: found.phone || found.mobile || '7010174890',
            zone: found.zone || 'Vettuvankeni, ECR & OMR',
            upiId: found.upiId || '',
            role: 'technician'
          };
        }
      } catch (e) {}

      // Fallback: Verify via Cloud Backend API
      if (!matchedTechRecord && navigator.onLine && typeof Api !== 'undefined') {
        try {
          const res = await (typeof Api.staffLogin === 'function'
            ? Api.staffLogin(upperId, password)
            : Api.request('verifyCaptainLogin', { captainId: upperId, techId: upperId, password }));
          const rec = res?.captain || res?.technician || res?.staff || res;
          if (res && (res.success || res.userId || rec?.id)) {
            matchedTechRecord = {
              id: upperId,
              staffId: upperId,
              name: rec.name || rec.technicianName || upperId,
              technicianName: rec.name || rec.technicianName || upperId,
              mobile: rec.mobile || rec.phone || '7010174890',
              zone: rec.zone || rec.area || 'Vettuvankeni, ECR & OMR',
              upiId: rec.upiId || '',
              role: 'technician'
            };
          }
        } catch (e) {}
      }

      if (!matchedTechRecord) {
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.innerHTML = '<span>Login ➔</span>';
        }
        if (errHint) {
          errHint.textContent = 'Invalid Technician ID or Password. Check Admin-issued credentials.';
          errHint.style.display = 'block';
        }
        this.safeShowToast('Invalid Technician credentials', 'error');
        return;
      }

      // Store unified session for both Lab Desk & Home Collection
      this.pendingTechSession = matchedTechRecord;
      localStorage.setItem('selfcare_active_user', upperId);
      localStorage.setItem('selfcare_user_role', 'technician');
      localStorage.setItem('selfcare_active_tech', JSON.stringify(matchedTechRecord));
      localStorage.setItem('selfcare_active_technician', JSON.stringify(matchedTechRecord));
      localStorage.setItem('selfcare_captain_session', JSON.stringify(matchedTechRecord));
      localStorage.setItem('selfcare_auth_token', `TECH_TOKEN_${upperId}`);

      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>Login ➔</span>';
      }

      // Open Lab Desk vs Home Collection Confirmation Popup
      const subEl = document.getElementById('tech-choice-subtitle');
      if (subEl) {
        subEl.textContent = `Welcome ${matchedTechRecord.name} (${upperId})! Select your workspace:`;
      }
      const choiceModal = document.getElementById('tech-mode-choice-modal');
      if (choiceModal) {
        choiceModal.style.display = 'flex';
      } else {
        window.location.replace('technician.html');
      }
      return;
    }

    // ---------------------------------------------------------
    // ROUTE 3: PATIENT LOGIN (10-DIGIT MOBILE NUMBER)
    // ---------------------------------------------------------
    const mobile = rawId.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>Login ➔</span>';
      }
      if (errHint) {
        errHint.textContent = 'Please enter a valid 10-digit mobile number.';
        errHint.style.display = 'block';
      }
      this.safeShowToast('Enter a valid 10-digit mobile number', 'error');
      return;
    }

    try {
      const credentialsMap = this.getStoredPatientCredentials();
      const localRecord = credentialsMap[mobile];
      let isAuthenticated = false;
      let serverUser = null;

      if (localRecord && localRecord.password === password) {
        isAuthenticated = true;
      }

      if (!isAuthenticated && navigator.onLine && typeof Api !== 'undefined') {
        try {
          let serverRes = null;
          if (typeof Api.patientLogin === 'function') {
            serverRes = await Api.patientLogin(mobile, password);
          } else if (typeof Api.request === 'function') {
            serverRes = await Api.request('patientLogin', { mobile, password }, false);
          }

          if (serverRes && (serverRes.status === 'success' || serverRes.success || serverRes.userId)) {
            isAuthenticated = true;
            serverUser = serverRes.user || serverRes.profile || serverRes;
            this.savePatientCredential(mobile, password, serverUser.name, serverUser);
          }
        } catch (netErr) {}
      }

      if (!isAuthenticated) {
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.innerHTML = '<span>Login ➔</span>';
        }
        const msg = localRecord
          ? 'Incorrect password. Please try again.'
          : 'Mobile number not registered. Please click "Customer Sign Up" to create an account.';
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

  confirmTechDestination(mode) {
    const modal = document.getElementById('tech-mode-choice-modal');
    if (modal) modal.style.display = 'none';

    const targetPage = mode === 'home' ? 'home-collection.html' : 'technician.html';
    localStorage.setItem('selfcare_tech_workspace', targetPage);
    window.location.replace(targetPage);
  },

  /**
   * CUSTOMER SIGN UP HANDLER (CUSTOMERS ONLY)
   */
  async handlePatientSignup() {
    const nameInput = document.getElementById('signup-name-input');
    const mobileInput = document.getElementById('signup-mobile-input');
    const pwdInput = document.getElementById('signup-password-input');
    const confirmInput = document.getElementById('signup-confirm-input');
    const errHint = document.getElementById('patient-signup-error');
    const signupBtn = document.getElementById('patient-signup-btn');

    const fullName = nameInput ? nameInput.value.trim() : '';
    const mobile = mobileInput ? mobileInput.value.trim() : '';
    const password = pwdInput ? pwdInput.value.trim() : '';
    const confirmPwd = confirmInput ? confirmInput.value.trim() : '';

    if (errHint) errHint.style.display = 'none';

    if (!fullName || fullName.length < 2) {
      if (errHint) {
        errHint.textContent = 'Please enter your full name.';
        errHint.style.display = 'block';
      }
      if (nameInput) nameInput.focus();
      return;
    }

    if (!/^[6-9]\d{9}$/.test(mobile)) {
      if (errHint) {
        errHint.textContent = 'Please enter a valid 10-digit Indian mobile number.';
        errHint.style.display = 'block';
      }
      if (mobileInput) mobileInput.focus();
      return;
    }

    if (password.length < 4) {
      if (errHint) {
        errHint.textContent = 'Password must be at least 4 characters long.';
        errHint.style.display = 'block';
      }
      if (pwdInput) pwdInput.focus();
      return;
    }

    if (password !== confirmPwd) {
      if (errHint) {
        errHint.textContent = 'Passwords do not match. Please enter matching passwords.';
        errHint.style.display = 'block';
      }
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
            serverUser = await Api.patientRegister(mobile, password, fullName);
          } else if (typeof Api.request === 'function') {
            serverUser = await Api.request('patientRegister', {
              name: fullName,
              mobile,
              password,
              userId: `SCD_${mobile}`
            }, false);
          }
        } catch (netErr) {}
      }

      this.savePatientCredential(mobile, password, fullName, serverUser);
      this.finalizePatientSession(mobile, { ...(serverUser || {}), name: fullName });
    } catch (err) {
      if (signupBtn) {
        signupBtn.disabled = false;
        signupBtn.innerHTML = '<span>Create Account &amp; Login ✓</span>';
      }
      if (errHint) {
        errHint.textContent = err.message || 'Registration failed. Please try again.';
        errHint.style.display = 'block';
      }
    }
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
    localStorage.removeItem('selfcare_captain_session');
    localStorage.removeItem('selfcare_tech_workspace');
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
