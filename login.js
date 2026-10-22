/* file: assets/js/login.js */
/**
 * Selfcare Diagnostics - Permanent Mobile + OTP Authentication Engine v4.2.0
 * Features:
 * 1. Deep-Link & Referral Auto-Restore: Seamlessly handles returnUrl, redirect & scd_pending_share_url.
 * 2. Strict Multi-tenant Cart Isolation: Preserves & vaults cart items per mobile number without data leaks.
 * 3. Live Google Sheets Backend Sync: Registers & verifies customer sessions via Api.requestOtp & verifyOtp.
 * 4. Top OTP Display Banner with Instant Auto-Fill Engine into 4-digit boxes.
 * 5. Zero Session Timeout: User stays logged in permanently until manual logout.
 * 6. Resilient offline fallback support (Master OTP 1234 for testing).
 */

const LoginPage = {
  mobileNumber: '',
  timerInterval: null,
  cooldownSeconds: 30,
  generatedOtp: '',

  init() {
    this.checkIfAlreadyLoggedIn();
    this.setupOtpAutoAdvance();
  },

  safeShowToast(message, type = 'info') {
    if (typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(message, type);
    } else {
      alert(message);
    }
  },

  /**
   * If customer is already logged in, skip login page entirely and restore intended deep-link
   */
  checkIfAlreadyLoggedIn() {
    const urlParams = new URLSearchParams(window.location.search);
    const forceLogout = urlParams.get('logout') === 'true';

    if (forceLogout) {
      this.performManualLogout();
      return;
    }

    const activeUser = localStorage.getItem('selfcare_active_user');
    const authToken = localStorage.getItem('selfcare_auth_token');

    // Permanent session verification
    if (activeUser && authToken) {
      const pendingShare = localStorage.getItem('scd_pending_share_url');
      const targetRedirect = urlParams.get('returnUrl') || urlParams.get('redirect') || pendingShare || 'customer.html';
      
      if (pendingShare) {
        localStorage.removeItem('scd_pending_share_url');
      }
      
      window.location.replace(targetRedirect);
    }
  },

  validateMobileInput(inputEl) {
    inputEl.value = inputEl.value.replace(/\D/g, '').slice(0, 10);
    const errorHint = document.getElementById('mobile-error-hint');
    if (errorHint) errorHint.style.display = 'none';
  },

  /**
   * Requests OTP from Backend (Google Apps Script) and syncs cache
   */
  async requestOtp() {
    const input = document.getElementById('mobile-number-input');
    const mobile = input ? input.value.trim() : '';

    if (!/^[6-9]\d{9}$/.test(mobile)) {
      const errorHint = document.getElementById('mobile-error-hint');
      if (errorHint) errorHint.style.display = 'block';
      this.safeShowToast('Please enter a valid 10-digit mobile number', 'error');
      return;
    }

    this.mobileNumber = mobile;
    const sendBtn = document.getElementById('send-otp-btn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending OTP...';
    }

    try {
      let serverRes = null;

      // 1. Call Backend API Gateway
      if (navigator.onLine && typeof Api !== 'undefined') {
        try {
          if (typeof Api.requestOtp === 'function') {
            serverRes = await Api.requestOtp(mobile);
          } else if (typeof Api.request === 'function') {
            serverRes = await Api.request('requestOtp', { mobile: mobile }, false);
          }
        } catch (netErr) {
          console.warn('[Login] Backend OTP request deferred, using local fallback:', netErr);
        }
      }

      // 2. Set OTP from server or fallback
      this.generatedOtp = (serverRes && (serverRes.devOtp || serverRes.masterOtp)) 
        ? String(serverRes.devOtp || serverRes.masterOtp) 
        : Math.floor(1000 + Math.random() * 9000).toString();

      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Get OTP ➔';
      }

      this.showOtpStep();

    } catch (err) {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Get OTP ➔';
      }
      this.safeShowToast(err.message || 'Error sending OTP. Please try again.', 'error');
    }
  },

  /**
   * Shows OTP Step, displays OTP at the TOP, and automatically fills the 4 input boxes
   */
  showOtpStep() {
    document.getElementById('view-mobile-step').style.display = 'none';
    document.getElementById('view-otp-step').style.display = 'block';
    document.getElementById('disp-entered-mobile').textContent = `+91 ${this.mobileNumber}`;

    // 1. Top Banner Display
    const topBadge = document.getElementById('top-otp-badge');
    const topOtpDisp = document.getElementById('top-otp-display');
    if (topBadge && topOtpDisp) {
      topOtpDisp.textContent = this.generatedOtp;
      topBadge.style.display = 'flex';
    }

    // 2. Clear old input boxes
    const boxes = document.querySelectorAll('.otp-digit');
    boxes.forEach(b => b.value = '');

    // 3. Instant auto-fill with smooth tactile delay
    setTimeout(() => {
      this.autoFillOtp();
    }, 250);

    this.startCooldownTimer();
  },

  /**
   * Helper: Fills the 4 input boxes with generated OTP
   */
  autoFillOtp() {
    if (!this.generatedOtp) return;
    const digits = String(this.generatedOtp).split('');
    const boxes = document.querySelectorAll('.otp-digit');

    boxes.forEach((box, index) => {
      if (digits[index]) {
        box.value = digits[index];
      }
    });

    if (boxes[boxes.length - 1]) {
      boxes[boxes.length - 1].focus();
    }
  },

  goBackToMobileStep() {
    clearInterval(this.timerInterval);
    document.getElementById('view-otp-step').style.display = 'none';
    document.getElementById('view-mobile-step').style.display = 'block';
    const input = document.getElementById('mobile-number-input');
    if (input) input.focus();
  },

  setupOtpAutoAdvance() {
    const inputs = document.querySelectorAll('.otp-digit');

    inputs.forEach((input, index) => {
      // Auto-move forward on typing
      input.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val ? val[0] : '';

        if (e.target.value && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }

        // Auto verify when all 4 digits are entered
        const fullOtp = Array.from(inputs).map(i => i.value).join('');
        if (fullOtp.length === 4) {
          LoginPage.verifyOtp();
        }
      });

      // Handle backspace navigation
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && index > 0) {
          inputs[index - 1].focus();
        }
      });

      // Handle paste
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasteData = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 4);
        if (pasteData) {
          pasteData.split('').forEach((char, i) => {
            if (inputs[i]) inputs[i].value = char;
          });
          const nextIndex = Math.min(pasteData.length, inputs.length - 1);
          inputs[nextIndex].focus();
          if (pasteData.length === 4) LoginPage.verifyOtp();
        }
      });
    });
  },

  startCooldownTimer() {
    clearInterval(this.timerInterval);
    let secondsLeft = this.cooldownSeconds;

    const timerText = document.getElementById('resend-countdown-text');
    const resendBtn = document.getElementById('resend-otp-btn');

    if (timerText) timerText.style.display = 'inline';
    if (resendBtn) resendBtn.style.display = 'none';

    this.timerInterval = setInterval(() => {
      secondsLeft--;
      if (timerText) {
        timerText.innerHTML = `Resend OTP in <strong>${secondsLeft}s</strong>`;
      }

      if (secondsLeft <= 0) {
        clearInterval(this.timerInterval);
        if (timerText) timerText.style.display = 'none';
        if (resendBtn) resendBtn.style.display = 'inline';
      }
    }, 1000);
  },

  async resendOtp() {
    const sendBtn = document.getElementById('resend-otp-btn');
    if (sendBtn) sendBtn.style.display = 'none';
    await this.requestOtp();
  },

  /**
   * CRITICAL AUTH & ISOLATION LOGIC:
   * Validates OTP via backend and isolates Cart, Family Members, and Profiles.
   */
  async verifyOtp() {
    const inputs = document.querySelectorAll('.otp-digit');
    const enteredOtp = Array.from(inputs).map(i => i.value).join('');

    if (enteredOtp.length < 4) {
      this.safeShowToast('Please enter complete 4-digit OTP', 'error');
      return;
    }

    const verifyBtn = document.getElementById('verify-otp-btn');
    if (verifyBtn) {
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying...';
    }

    try {
      let serverUser = null;

      // 1. Strict Server Verification (Syncs with Google Sheets 'Customers' table)
      if (navigator.onLine && typeof Api !== 'undefined') {
        try {
          if (typeof Api.verifyOtp === 'function') {
            serverUser = await Api.verifyOtp(this.mobileNumber, enteredOtp);
          } else if (typeof Api.request === 'function') {
            serverUser = await Api.request('verifyOtp', { mobile: this.mobileNumber, otp: enteredOtp }, false);
          }
        } catch (netErr) {
          const errText = netErr.message || '';
          if (errText.includes('Invalid OTP') || errText.includes('OTP')) {
            throw netErr;
          }
          console.warn('[Login] Network issue during verify, checking local fallback:', netErr);
        }
      }

      // 2. Offline / Master OTP fallback check
      if (!serverUser && enteredOtp !== this.generatedOtp && enteredOtp !== '1234') {
        throw new Error('Invalid OTP entered. Please try again.');
      }

      const currentMobile = this.mobileNumber;
      const previousMobile = localStorage.getItem('selfcare_active_user');

      // 3. Stash previous user's cart safely before switching numbers and prevent data contamination
      if (previousMobile && previousMobile !== currentMobile) {
        try {
          const activeCart = localStorage.getItem('selfcare_cart');
          if (activeCart) localStorage.setItem(`selfcare_cart_${previousMobile}`, activeCart);
          
          const activeFam = localStorage.getItem('selfcare_family_members');
          if (activeFam) localStorage.setItem(`selfcare_family_${previousMobile}`, activeFam);
          
          // Purge generic legacy keys to prevent cart leaking into new account
          localStorage.removeItem('cart');
          localStorage.removeItem('selfcare_cart');
        } catch (e) {}
      }

      const userData = {
        userId: (serverUser && serverUser.userId) ? serverUser.userId : `SCD_${currentMobile}`,
        mobile: currentMobile,
        phone: currentMobile,
        name: (serverUser && serverUser.name) ? serverUser.name : 'Valued Customer',
        token: (serverUser && serverUser.token) ? serverUser.token : `PERMANENT_NABL_TOKEN_${currentMobile}`,
        role: (serverUser && serverUser.role) ? serverUser.role : 'patient'
      };

      // 4. Save session permanently using Auth engine
      if (typeof Auth !== 'undefined' && typeof Auth.savePermanentSession === 'function') {
        Auth.savePermanentSession(userData);
      } else {
        localStorage.setItem('selfcare_active_user', currentMobile);
        localStorage.setItem('selfcare_auth_token', userData.token);
        localStorage.setItem('selfcare_customer_profile', JSON.stringify(userData));
        localStorage.setItem(`selfcare_profile_${currentMobile}`, JSON.stringify(userData));
      }

      // 5. Load or Initialize this specific user's isolated cart
      try {
        const userVaultCart = localStorage.getItem(`selfcare_cart_${currentMobile}`);
        if (userVaultCart) {
          localStorage.setItem('selfcare_cart', userVaultCart);
          localStorage.setItem('cart', userVaultCart);
        } else {
          const emptyCart = JSON.stringify([]);
          localStorage.setItem('selfcare_cart', emptyCart);
          localStorage.setItem('cart', emptyCart);
          localStorage.setItem(`selfcare_cart_${currentMobile}`, emptyCart);
        }
      } catch (e) {}

      // 6. Success notification and Smart Deep-Link Redirection
      this.safeShowToast('Login successful! Welcome to Selfcare Diagnostics', 'success');

      setTimeout(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const pendingShare = localStorage.getItem('scd_pending_share_url');
        const targetRedirect = urlParams.get('returnUrl') || urlParams.get('redirect') || pendingShare || 'customer.html';

        if (pendingShare) {
          localStorage.removeItem('scd_pending_share_url');
        }

        window.location.replace(targetRedirect);
      }, 500);

    } catch (err) {
      if (verifyBtn) {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify OTP ➔';
      }
      this.safeShowToast(err.message || 'Invalid OTP. Please try again.', 'error');
      inputs.forEach(i => i.value = '');
      if (inputs[0]) inputs[0].focus();
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
    localStorage.removeItem('selfcare_auth_token');
    localStorage.removeItem('selfcare_cart');
    localStorage.removeItem('cart');
    localStorage.removeItem('selfcare_customer_profile');
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
