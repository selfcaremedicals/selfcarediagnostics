/* file: assets/js/api.js */
/**
 * Selfcare Diagnostics - API Gateway v6.1.0 (Turbo Speed & Memory Cache Edition)
 * Features:
 * - High-speed In-Memory TTL Response Caching for Instant UI updates (Zero GAS delay)
 * - Automatic cache invalidation on write/update mutations
 * - Dedicated endpoints for Family Vault (getFamilyMembers, saveFamilyMember, deleteFamilyMember)
 * - Concurrent In-Flight request deduplication
 * - Dynamic fail-fast timeouts & AbortController integration
 */

const Api = {
  activeRequests: new Map(),
  responseCache: new Map(),

  // Default Cache Durations (Milliseconds)
  CACHE_TTL: {
    getFamilyMembers: 45000, // 45 seconds
    getProfile: 45000,
    getTests: 180000,        // 3 minutes
    getPackages: 180000,
    defaultRead: 30000       // 30 seconds
  },

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
      'getFamilyMembers',
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
   * Clears in-memory cache for specific action keys on mutation
   */
  invalidateCache(actionPrefix) {
    for (const key of this.responseCache.keys()) {
      if (key.startsWith(actionPrefix)) {
        this.responseCache.delete(key);
      }
    }
  },

  /**
   * Core fetch wrapper with Deduplication, Memory Caching and Adaptive Timeout
   */
  async request(action, params = {}, allowCache = false, customTimeout = null) {
    const cacheKey = `${action}_${JSON.stringify(params)}`;

    // 1. Instant Cache hit (Zero Network Latency)
    if (allowCache && this.responseCache.has(cacheKey)) {
      const cached = this.responseCache.get(cacheKey);
      const ttl = this.CACHE_TTL[action] || this.CACHE_TTL.defaultRead;
      if (Date.now() - cached.timestamp < ttl) {
        return cached.data;
      }
      this.responseCache.delete(cacheKey);
    }

    // 2. In-flight request deduplication (prevents duplicate parallel fetches)
    if (this.activeRequests.has(cacheKey)) {
      return this.activeRequests.get(cacheKey);
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

        const result = (data && data.data !== undefined) ? data.data : data;

        // Cache successful read response
        if (allowCache) {
          this.responseCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
          });
        }

        return result;
      } catch (error) {
        console.warn(`API [${action}] Notice:`, error.message || error);
        throw error;
      } finally {
        this.activeRequests.delete(cacheKey);
      }
    })();

    this.activeRequests.set(cacheKey, promise);
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
    return this.request('getProfile', { userId, mobile: userId }, true);
  },

  async updateProfile(profileData) {
    this.invalidateCache('getProfile');
    return this.request('updateProfile', profileData, false);
  },

  // ==========================================================
  // FAMILY VAULT DIRECTORY APIS
  // ==========================================================

  async getFamilyMembers(primaryMobile) {
    return this.request('getFamilyMembers', {
      mobile: primaryMobile,
      primaryMobile: primaryMobile
    }, true);
  },

  async saveFamilyMember(memberPayload) {
    this.invalidateCache('getFamilyMembers');
    return this.request('saveFamilyMember', memberPayload, false);
  },

  async deleteFamilyMember(payload) {
    this.invalidateCache('getFamilyMembers');
    return this.request('deleteFamilyMember', payload, false);
  },

  // ==========================================================
  // CATALOGUE APIS
  // ==========================================================

  async getTests() {
    return this.request('getTests', {}, true);
  },

  async getTestById(testId) {
    return this.request('getTestById', { testId }, true);
  },

  async searchTests(query) {
    return this.request('searchTests', { query }, true);
  },

  async getPackages() {
    return this.request('getPackages', {}, true);
  },

  async getPackageById(packageId) {
    return this.request('getPackageById', { packageId }, true);
  },

  async searchPackages(query) {
    return this.request('searchPackages', { query }, true);
  },

  async aiSearch(query) {
    return this.request('aiSearch', { query }, true);
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
    this.invalidateCache('getBookingsByPatient');
    return this.request('createBooking', bookingData, false);
  },

  async getBookingDetails(bookingId) {
    return this.request('getBookingDetails', { bookingId }, false);
  },

  async getBookingsByPatient(patientPhone) {
    return this.request('getBookingsByPatient', { patientPhone }, true);
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
