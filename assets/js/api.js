/* file: assets/js/api.js */
/**
 * Selfcare Diagnostics - API Gateway v6.0.0 (Direct Booking & Razorpay Gateway)
 * Features:
 * - Direct Booking and Cash Collection API endpoints.
 * - Razorpay order creation and server-side HMAC signature verification.
 * - Fail-fast dynamic timeouts and request deduplication.
 */

const Api = {
  activeRequests: new Map(),

  /**
   * Action-specific timeout resolver (Milliseconds)
   */
  getTimeoutForAction(action) {
    const fastReadActions = [
      'getTests',
      'getPackages',
      'getTestById',
      'getPackageById',
      'searchTests',
      'searchPackages',
      'getProfile',
      'getBookingsByPatient',
      'getBookingDetails',
      'getAdminTests',
      'getAdminPackages',
      'getAllBookings',
      'getPaymentStatus',
      'aiSearch'
    ];

    if (fastReadActions.includes(action)) {
      return 8500; // 8.5 seconds fail-fast
    }

    if (action === 'processPrescriptionOCR' || action === 'uploadPrescription') {
      return 90000; // 90 seconds for OCR & image processing
    }

    if (action === 'createRazorpayOrder' || action === 'verifyRazorpayPayment') {
      return 30000; // 30 seconds for Razorpay order generation & signature verification
    }

    return 45000; // 45 seconds default for bookings and writes
  },

  /**
   * Core fetch wrapper with deduplication and adaptive timeout
   */
  async request(action, params = {}, useCache = true, customTimeout = null) {
    const requestKey = `${action}_${JSON.stringify(params)}`;

    if (useCache && this.activeRequests.has(requestKey)) {
      return this.activeRequests.get(requestKey);
    }

    const promise = (async () => {
      try {
        if (!navigator.onLine) {
          throw new Error('No internet connection. Operating in offline mode.');
        }

        const baseUrl = (typeof Config !== 'undefined' && Config.GAS_WEB_APP_URL) ? Config.GAS_WEB_APP_URL : '';
        if (!baseUrl) {
          throw new Error('GAS_WEB_APP_URL is not configured in config.js');
        }

        const url = new URL(baseUrl);
        url.searchParams.append('action', action);

        const payloadData = {
          action: action,
          ...params
        };

        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payloadData)
        };

        const timeoutMs = customTimeout || this.getTimeoutForAction(action);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        options.signal = controller.signal;

        let response;
        try {
          response = await fetch(url.toString(), options);
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          if (fetchErr.name === 'AbortError') {
            throw new Error(`Server request timed out after ${Math.round(timeoutMs / 1000)}s for action: ${action}`);
          }
          throw fetchErr;
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Server error response: ${response.status}`);
        }

        const data = await response.json();
        
        if (data && data.status === 'error') {
          throw new Error(data.message || 'Unknown server error');
        }

        return (data && data.data !== undefined) ? data.data : data;
      } catch (error) {
        console.warn(`API [${action}] Notice:`, error.message || error);
        throw error;
      } finally {
        this.activeRequests.delete(requestKey);
      }
    })();

    if (useCache) {
      this.activeRequests.set(requestKey, promise);
    }

    return promise;
  },

  // ==========================================================
  // AUTHENTICATION & PROFILE APIS
  // ==========================================================

  async requestOtp(mobile) {
    return this.request('requestOtp', { mobile }, false);
  },

  async verifyOtp(mobile, otp) {
    return this.request('verifyOtp', { mobile, otp }, false);
  },

  async staffLogin(id, password) {
    return this.request('staffLogin', { id, password }, false);
  },

  async getProfile(userId) {
    return this.request('getProfile', { userId, mobile: userId }, false);
  },

  async updateProfile(profileData) {
    return this.request('updateProfile', profileData, false);
  },

  // ==========================================================
  // CATALOGUE APIS
  // ==========================================================

  async getTests() {
    return this.request('getTests', {}, false);
  },

  async getTestById(testId) {
    return this.request('getTestById', { testId }, false);
  },

  async searchTests(query) {
    return this.request('searchTests', { query }, false);
  },

  async getPackages() {
    return this.request('getPackages', {}, false);
  },

  async getPackageById(packageId) {
    return this.request('getPackageById', { packageId }, false);
  },

  async searchPackages(query) {
    return this.request('searchPackages', { query }, false);
  },

  async aiSearch(query) {
    return this.request('aiSearch', { query }, false);
  },

  // ==========================================================
  // PRESCRIPTION & OCR APIS
  // ==========================================================

  async uploadPrescription(payload) {
    return this.request('uploadPrescription', payload, false);
  },

  async processPrescriptionOCR(base64Data, mimeType, optionalParams = {}) {
    return this.request('processPrescriptionOCR', { base64Data, mimeType, ...optionalParams }, false);
  },

  async matchPrescriptionTests(ocrText) {
    return this.request('matchPrescriptionTests', { ocrText }, false);
  },

  async getPrescriptionMatches(prescriptionId) {
    return this.request('getPrescriptionMatches', { prescriptionId }, false);
  },

  async confirmPrescriptionTests(prescriptionId, confirmedTestIds) {
    return this.request('confirmPrescriptionTests', { prescriptionId, confirmedTestIds }, false);
  },

  // ==========================================================
  // BOOKINGS & LIVE TRACKING APIS
  // ==========================================================

  async createBooking(bookingData) {
    return this.request('createBooking', bookingData, false);
  },

  async getBookingDetails(bookingId) {
    return this.request('getBookingDetails', { bookingId }, false);
  },

  async getBookingsByPatient(patientPhone) {
    return this.request('getBookingsByPatient', { patientPhone }, false);
  },

  // ==========================================================
  // PAYMENT STATUS CHECK
  // ==========================================================

  async getPaymentStatus(bookingId, paymentReference) {
    return this.request('getPaymentStatus', { bookingId, paymentReference }, false);
  },

  // ==========================================================
  // RAZORPAY ONLINE PAYMENT GATEWAY APIS
  // ==========================================================

  async createRazorpayOrder(orderPayload) {
    return this.request('createRazorpayOrder', orderPayload, false);
  },

  async verifyRazorpayPayment(verificationPayload) {
    return this.request('verifyRazorpayPayment', verificationPayload, false);
  }
};

if (typeof window !== 'undefined') {
  window.Api = Api;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Api;
}
