/* file: assets/js/api.js */
/**
 * Selfcare Diagnostics - Direct Google Apps Script API Client v7.1.0
 * Features:
 * - Fast-read timeouts & auto cache invalidation for Home Collection & OTP sync
 * - Automatic 4-digit Pickup OTP injection on createBooking
 */

const Api = {
  activeRequests: new Map(),
  responseCache: new Map(),

  CACHE_TTL: {
    getBloodData: 20000,
    getReferralData: 30000,
    getFamilyMembers: 45000,
    getProfile: 45000,
    getTests: 180000,
    getPackages: 180000,
    defaultRead: 30000
  },

  getTimeoutForAction(action) {
    const fastReadActions = [
      'getBloodData',
      'getTests',
      'getPackages',
      'getTestById',
      'getPackageById',
      'searchTests',
      'searchPackages',
      'getProfile',
      'getFamilyMembers',
      'getMembershipStatus',
      'getBookingsByPatient',
      'getBookingDetails',
      'getAdminTests',
      'getAdminPackages',
      'getAllBookings',
      'getPendingHomeCollections',
      'getCaptainProfileAndRatings',
      'getPaymentStatus',
      'getBookingReport',
      'aiSearch'
    ];

    if (fastReadActions.includes(action)) return 12000;
    if (action === 'patientLogin' || action === 'patientRegister' || action === 'staffLogin') return 18000;
    if (action === 'validateReferralCode' || action === 'claimReferralReward' || action === 'getReferralData') return 35000;
    if (action === 'processPrescriptionOCR' || action === 'uploadPrescription') return 90000;
    if (
      action === 'createRazorpayOrder' ||
      action === 'verifyRazorpayPayment' ||
      action === 'saveMembership' ||
      action === 'updateReport' ||
      action === 'saveBookingPickupOtp' ||
      action === 'assignHomeCollection' ||
      action === 'recordCashCollection' ||
      action === 'completeHomeCollection'
    ) return 30000;
    return 45000;
  },

  invalidateCache(actionPrefix) {
    for (const key of this.responseCache.keys()) {
      if (key.startsWith(actionPrefix)) {
        this.responseCache.delete(key);
      }
    }
  },

  async request(action, params = {}, allowCache = false, customTimeout = null) {
    const cacheKey = `${action}_${JSON.stringify(params)}`;

    if (allowCache && this.responseCache.has(cacheKey)) {
      const cached = this.responseCache.get(cacheKey);
      const ttl = this.CACHE_TTL[action] || this.CACHE_TTL.defaultRead;
      if (Date.now() - cached.timestamp < ttl) {
        return cached.data;
      }
      this.responseCache.delete(cacheKey);
    }

    if (this.activeRequests.has(cacheKey)) {
      return this.activeRequests.get(cacheKey);
    }

    const promise = (async () => {
      try {
        if (!navigator.onLine) {
          throw new Error('No internet connection. Operating in offline mode.');
        }

        const gasUrl = (typeof Config !== 'undefined' && Config.GAS_WEB_APP_URL) ? Config.GAS_WEB_APP_URL.trim() : '';
        if (!gasUrl || !gasUrl.startsWith('https://')) {
          throw new Error('GAS_WEB_APP_URL is not configured in config.js');
        }

        const url = new URL(gasUrl);
        url.searchParams.append('action', action);

        const payloadData = {
          action: action,
          ...params
        };

        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
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

  async updateReport(payload) {
    this.invalidateCache('getBookingsByPatient');
    this.invalidateCache('getBookingDetails');
    this.invalidateCache('getBookingReport');
    return this.request('updateReport', payload, false);
  },

  async getBookingReport(bookingId, patientPhone) {
    return this.request('getBookingReport', { bookingId, patientPhone }, false);
  },

  async validateReferralCode(code, mobile, amount) {
    return this.request('validateReferralCode', { code, mobile, amount }, false);
  },

  async getReferralData(mobile) {
    return this.request('getReferralData', { mobile }, false);
  },

  async claimReferralReward(mobile) {
    this.invalidateCache('getReferralData');
    return this.request('claimReferralReward', { mobile }, false);
  },

  async getBloodData() {
    return this.request('getBloodData', {}, true);
  },

  async saveBloodRequest(requestPayload) {
    this.invalidateCache('getBloodData');
    return this.request('saveBloodRequest', requestPayload, false);
  },

  async updateBloodRequest(updatePayload) {
    this.invalidateCache('getBloodData');
    return this.request('updateBloodRequest', updatePayload, false);
  },

  async registerBloodDonor(donorPayload) {
    this.invalidateCache('getBloodData');
    return this.request('registerBloodDonor', donorPayload, false);
  },

  async patientRegister(mobile, password, name = '') {
    return this.request('patientRegister', {
      mobile,
      password,
      name,
      userId: `SCD_${mobile}`
    }, false);
  },

  async patientLogin(mobile, password) {
    return this.request('patientLogin', { mobile, password }, false);
  },

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

  async saveMembership(membershipPayload) {
    this.invalidateCache('getProfile');
    this.invalidateCache('getFamilyMembers');
    this.invalidateCache('getMembershipStatus');
    return this.request('saveMembership', membershipPayload, false);
  },

  async getMembershipStatus(mobile) {
    return this.request('getMembershipStatus', { mobile }, false);
  },

  async getFamilyMembers(primaryMobile) {
    return this.request('getFamilyMembers', {
      mobile: primaryMobile,
      primaryMobile: primaryMobile
    }, true);
  },

  async saveFamilyMember(memberPayload) {
    this.invalidateCache('getFamilyMembers');
    this.invalidateCache('getProfile');
    return this.request('saveFamilyMember', memberPayload, false);
  },

  async deleteFamilyMember(payload) {
    this.invalidateCache('getFamilyMembers');
    this.invalidateCache('getProfile');
    return this.request('deleteFamilyMember', payload, false);
  },

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

  async createBooking(bookingData) {
    this.invalidateCache('getBookingsByPatient');
    this.invalidateCache('getReferralData');
    this.invalidateCache('getPendingHomeCollections');

    // Automatically attach a random 4-digit OTP if not already generated
    const generatedOtp = bookingData.pickupOtp || bookingData.otp || String(Math.floor(1000 + Math.random() * 9000));
    const enrichedPayload = {
      ...bookingData,
      pickupOtp: generatedOtp,
      otp: generatedOtp,
      createdAt: bookingData.createdAt || new Date().toISOString()
    };

    try {
      if (enrichedPayload.bookingId) {
        const otpMap = JSON.parse(localStorage.getItem('selfcare_booking_otps') || '{}');
        otpMap[enrichedPayload.bookingId] = generatedOtp;
        localStorage.setItem('selfcare_booking_otps', JSON.stringify(otpMap));
      }
    } catch (e) {}

    return this.request('createBooking', enrichedPayload, false);
  },

  async saveBookingPickupOtp(payload) {
    this.invalidateCache('getBookingsByPatient');
    this.invalidateCache('getBookingDetails');
    this.invalidateCache('getPendingHomeCollections');
    return this.request('saveBookingPickupOtp', payload, false);
  },

  async getBookingDetails(bookingId) {
    return this.request('getBookingDetails', { bookingId }, false);
  },

  async getBookingsByPatient(patientPhone) {
    return this.request('getBookingsByPatient', { patientPhone }, false);
  },

  async getPaymentStatus(bookingId, paymentReference) {
    return this.request('getPaymentStatus', { bookingId, paymentReference }, false);
  },

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
