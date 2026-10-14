/* file: assets/js/config.js */
/**
 * Selfcare Diagnostics - Frontend Configuration (config.js)
 * Defines API endpoints, versioning, database configuration, cache settings,
 * and Cashfree Production Gateway status constants.
 */

const Config = {
  APP_VERSION: '8.2.0',
  CACHE_VERSION: 'selfcare-cache-v8.2.0',
  
  // Google Apps Script Web App Deployment URL (Preserved)
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbzM1alicIkwFVzwULAFpJwELalGwCFFOJhjnw9JGqimPz48Lt7V8llx1k6Jebv9icQBnQ/exec', 
  
  SPREADSHEET_ID: '1lswBf5iPcPnt8OGA6ZfCE1tcJyqqxTaP1e2u9UwwHOw',

  // IndexedDB Configuration
  DB_NAME: 'selfcare_db',
  DB_VERSION: 1,

  // ==========================================================
  // CASHFREE PRODUCTION GATEWAY PUBLIC SETTINGS (NO SECRET KEYS)
  // ==========================================================
  CASHFREE: {
    SDK_URL: 'https://sdk.cashfree.com/js/v3/cashfree.js',
    MODE: 'production',
    CURRENCY: 'INR',
    RETURN_URL: 'https://selfcarediagnostics.in/cart.html?cf_order_id={order_id}'
  },

  // ==========================================================
  // LEGACY UPI FALLBACK CONFIGURATION (PRESERVED)
  // ==========================================================
  UPI: {
    MERCHANT_VPA: '0798545a0252206.bqr@kotak',
    MERCHANT_NAME: 'Selfcare Diagnostics',
    CURRENCY: 'INR',
    MCC: '8099', // Medical Services & Diagnostic Labs
    TRANSACTION_PREFIX: 'SCDPAY',
    BOOKING_PREFIX: 'SCDBOOK',
    INTENT_TIMEOUT_MS: 180000, // 3 minutes timeout window for app return
    POLL_INTERVAL_MS: 3000     // 3 seconds polling interval
  },

  // Payment Status Lifecycle
  PAYMENT_STATUS: {
    PENDING: 'PAYMENT_PENDING',
    SUCCESS: 'PAYMENT_SUCCESS',
    FAILED: 'PAYMENT_FAILED',
    CANCELLED: 'PAYMENT_CANCELLED',
    EXPIRED: 'PAYMENT_EXPIRED',
    UNKNOWN: 'PAYMENT_UNKNOWN',
    VERIFICATION_PENDING: 'PAYMENT_VERIFICATION_PENDING'
  },

  // Booking Status Lifecycle
  BOOKING_STATUS: {
    PAYMENT_PENDING: 'PAYMENT_PENDING',
    CONFIRMED: 'CONFIRMED',
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    PAYMENT_CANCELLED: 'PAYMENT_CANCELLED',
    PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
    PAYMENT_VERIFICATION_PENDING: 'PAYMENT_VERIFICATION_PENDING'
  }
};

// Expose Config across all client scopes (window, globalThis, and worker context)
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
