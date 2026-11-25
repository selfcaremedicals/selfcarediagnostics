/* file: assets/js/config.js */
/**
 * Selfcare Diagnostics - Frontend Configuration (config.js) v8.3.0 (Direct GAS Edition)
 */

const Config = {
  APP_VERSION: '8.3.0',
  CACHE_VERSION: 'selfcare-cache-v8.3.0',

  // Razorpay Live Key ID
  RAZORPAY_KEY_ID: 'rzp_live_Tq9S3sQhh5B3hW',

  // Direct Google Apps Script Web App URL (Cloudflare removed)
  API_GATEWAY_URL: '',
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbxI9FsL50w1vC7pBipFreIR934D9mQk6dWwiEN7WAargLKP6qYqF8vlLZ3Ywzo5GQjquA/exec',

  SPREADSHEET_ID: '1lswBf5iPcPnt8OGA6ZfCE1tcJyqqxTaP1e2u9UwwHOw',

  // IndexedDB Configuration
  DB_NAME: 'selfcare_db',
  DB_VERSION: 1,

  CASHFREE: {
    SDK_URL: 'https://sdk.cashfree.com/js/v3/cashfree.js',
    MODE: 'production',
    CURRENCY: 'INR',
    RETURN_URL: 'https://selfcarediagnostics.in/cart.html?cf_order_id={order_id}'
  },

  UPI: {
    MERCHANT_VPA: '0798545a0252206.bqr@kotak',
    MERCHANT_NAME: 'Selfcare Diagnostics',
    CURRENCY: 'INR',
    MCC: '8099',
    TRANSACTION_PREFIX: 'SCDPAY',
    BOOKING_PREFIX: 'SCDBOOK',
    INTENT_TIMEOUT_MS: 180000,
    POLL_INTERVAL_MS: 3000
  },

  PAYMENT_STATUS: {
    PENDING: 'PAYMENT_PENDING',
    SUCCESS: 'PAYMENT_SUCCESS',
    FAILED: 'PAYMENT_FAILED',
    CANCELLED: 'PAYMENT_CANCELLED',
    EXPIRED: 'PAYMENT_EXPIRED',
    UNKNOWN: 'PAYMENT_UNKNOWN',
    VERIFICATION_PENDING: 'PAYMENT_VERIFICATION_PENDING'
  },

  BOOKING_STATUS: {
    PAYMENT_PENDING: 'PAYMENT_PENDING',
    CONFIRMED: 'CONFIRMED',
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    PAYMENT_CANCELLED: 'PAYMENT_CANCELLED',
    PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
    PAYMENT_VERIFICATION_PENDING: 'PAYMENT_VERIFICATION_PENDING'
  }
};

if (typeof window !== 'undefined') {
  window.Config = Config;
  window.CONFIG = Config;
}
if (typeof self !== 'undefined') {
  self.Config = Config;
  self.CONFIG = Config;
}
if (typeof globalThis !== 'undefined') {
  globalThis.Config = Config;
  globalThis.CONFIG = Config;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Config;
}
