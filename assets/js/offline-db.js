/* file: assets/js/offline-db.js */
/**
 * Selfcare Diagnostics - Offline Database (IndexedDB) v5.0.0
 * Hardened against mobile backgrounding deadlocks, multiple-tab lockouts,
 * with 800ms auto-timeout safeguard, LocalStorage instant fallback,
 * and Multi-tenant Multi-Patient Cart Vault synchronization.
 */

const OfflineDB = {
  db: null,

  async init() {
    // Check if existing database connection is active and valid
    if (this.db) {
      try {
        this.db.transaction('tests', 'readonly');
        return this.db;
      } catch (e) {
        this.db = null; // Connection expired or closed by OS
      }
    }

    return new Promise((resolve) => {
      const dbName = (typeof Config !== 'undefined' && Config.DB_NAME) ? Config.DB_NAME : 'selfcare_db';
      const dbVersion = (typeof Config !== 'undefined' && Config.DB_VERSION) ? Config.DB_VERSION : 1;

      // 1.2s Timeout Safeguard: Database open aagalaati hang aaga vidaama resolve pannidum
      const timer = setTimeout(() => {
        console.warn('IndexedDB open timeout - falling back to memory/local');
        resolve(null);
      }, 1200);

      try {
        const request = indexedDB.open(dbName, dbVersion);

        // When another page/tab is locking the DB
        request.onblocked = () => {
          clearTimeout(timer);
          console.warn('IndexedDB blocked by active connection');
          resolve(null);
        };

        request.onerror = (event) => {
          clearTimeout(timer);
          console.error('IndexedDB open error:', event.target ? event.target.error : event);
          resolve(null);
        };

        request.onsuccess = (event) => {
          clearTimeout(timer);
          this.db = event.target.result;

          this.db.onversionchange = () => {
            if (this.db) this.db.close();
            this.db = null;
          };

          this.db.onclose = () => {
            this.db = null;
          };

          resolve(this.db);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          const stores = ['tests', 'packages', 'packageTests', 'offers', 'cart', 'appState', 'metadata'];

          stores.forEach(storeName => {
            if (!db.objectStoreNames.contains(storeName)) {
              if (storeName === 'metadata' || storeName === 'appState') {
                db.createObjectStore(storeName);
              } else if (storeName === 'tests') {
                db.createObjectStore(storeName, { keyPath: 'TestID' });
              } else if (storeName === 'packages') {
                db.createObjectStore(storeName, { keyPath: 'PackageID' });
              } else {
                db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
              }
            }
          });
        };
      } catch (err) {
        clearTimeout(timer);
        resolve(null);
      }
    });
  },

  /**
   * Safe getAll with 800ms race-timeout and LocalStorage backup
   */
  async getAll(storeName) {
    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`Timeout reading ${storeName}, using localStorage backup`);
        try {
          const backup = localStorage.getItem(`cache_${storeName}`);
          resolve(backup ? JSON.parse(backup) : []);
        } catch (e) {
          resolve([]);
        }
      }, 800);

      try {
        const db = await this.init();
        if (!db) {
          clearTimeout(timeout);
          const backup = localStorage.getItem(`cache_${storeName}`);
          return resolve(backup ? JSON.parse(backup) : []);
        }

        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          clearTimeout(timeout);
          const result = request.result || [];
          if (result.length > 0) {
            try {
              localStorage.setItem(`cache_${storeName}`, JSON.stringify(result));
            } catch (e) {}
          }
          resolve(result);
        };

        request.onerror = () => {
          clearTimeout(timeout);
          const backup = localStorage.getItem(`cache_${storeName}`);
          resolve(backup ? JSON.parse(backup) : []);
        };
      } catch (err) {
        clearTimeout(timeout);
        const backup = localStorage.getItem(`cache_${storeName}`);
        resolve(backup ? JSON.parse(backup) : []);
      }
    });
  },

  async putAll(storeName, items, clearFirst = true) {
    // Instant localStorage backup reflection
    if (Array.isArray(items) && items.length > 0) {
      try {
        localStorage.setItem(`cache_${storeName}`, JSON.stringify(items));
      } catch (e) {}
    }

    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => {
        resolve(true); // Don't hang UI even if transaction takes time
      }, 1500);

      try {
        const db = await this.init();
        if (!db) {
          clearTimeout(timeout);
          return resolve(true);
        }

        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);

        transaction.oncomplete = () => {
          clearTimeout(timeout);
          resolve(true);
        };

        transaction.onerror = () => {
          clearTimeout(timeout);
          resolve(true);
        };

        if (clearFirst) {
          store.clear();
        }

        if (Array.isArray(items)) {
          items.forEach(item => {
            try {
              store.put(item);
            } catch (putErr) {
              console.warn(`Error writing item to ${storeName}:`, putErr);
            }
          });
        }
      } catch (err) {
        clearTimeout(timeout);
        resolve(true);
      }
    });
  },

  async getById(storeName, key) {
    try {
      const all = await this.getAll(storeName);
      const cleanKey = String(key || '').trim().toLowerCase();
      return all.find(item => {
        const tId = String(item.TestID || '').trim().toLowerCase();
        const pId = String(item.PackageID || '').trim().toLowerCase();
        const iId = String(item.id || '').trim().toLowerCase();
        const tCode = String(item.TestCode || item.PackageCode || item.code || '').trim().toLowerCase();
        return tId === cleanKey || pId === cleanKey || iId === cleanKey || tCode === cleanKey;
      }) || null;
    } catch (e) {
      return null;
    }
  },

  async clear(storeName) {
    try {
      localStorage.removeItem(`cache_${storeName}`);
      const db = await this.init();
      if (!db) return true;
      return new Promise((resolve) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        store.clear();
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(true);
      });
    } catch (e) {
      return true;
    }
  },

  async setMetadata(key, value) {
    try {
      localStorage.setItem(`meta_${key}`, JSON.stringify(value));
      const db = await this.init();
      if (!db) return true;
      return new Promise((resolve) => {
        const transaction = db.transaction('metadata', 'readwrite');
        transaction.objectStore('metadata').put(value, key);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(true);
      });
    } catch (e) {
      return true;
    }
  },

  async getMetadata(key) {
    try {
      const localVal = localStorage.getItem(`meta_${key}`);
      if (localVal) return JSON.parse(localVal);
      const db = await this.init();
      if (!db) return null;
      return new Promise((resolve) => {
        const req = db.transaction('metadata', 'readonly').objectStore('metadata').get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  },

  /**
   * Universal Vault-Aware Cart Saver with Multi-Patient Composite Key Protection
   */
  async saveCart(cartItems) {
    try {
      const itemsList = Array.isArray(cartItems) ? cartItems : [];
      const cartStr = JSON.stringify(itemsList);
      
      localStorage.setItem('cart', cartStr);
      localStorage.setItem('selfcare_cart', cartStr);

      // Multi-tenant isolation: Guaranteed update into active user's dedicated vault
      const activeUser = localStorage.getItem('selfcare_active_user');
      if (activeUser) {
        localStorage.setItem(`selfcare_cart_${activeUser}`, cartStr);
      }

      const db = await this.init();
      if (!db) return true;

      return new Promise((resolve) => {
        const transaction = db.transaction('cart', 'readwrite');
        const store = transaction.objectStore('cart');
        store.clear();

        itemsList.forEach((item, idx) => {
          // Composite ID Safeguard: Prevents overwrite when multiple patients order the exact same test
          const rawItemId = item.id || item.TestID || item.PackageID || item.TestCode || item.PackageCode || idx;
          const patientScope = item.patientId || 'SELF';
          const compositeId = item.cartItemId || `${patientScope}_${rawItemId}_${idx}`;

          const sanitizedItem = {
            ...item,
            id: compositeId,
            cartItemId: compositeId
          };

          try {
            store.put(sanitizedItem);
          } catch (putErr) {
            console.warn('Error saving cart item to IndexedDB:', putErr);
          }
        });

        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(true);
      });
    } catch (e) {
      return true;
    }
  },

  /**
   * Universal Vault-Aware Cart Reader with LocalStorage + IndexedDB True Fallback
   */
  async getCart() {
    try {
      const activeUser = localStorage.getItem('selfcare_active_user');
      let raw = null;

      if (activeUser) {
        raw = localStorage.getItem(`selfcare_cart_${activeUser}`);
      }

      if (raw === null) {
        raw = localStorage.getItem('selfcare_cart') || localStorage.getItem('cart');
      }

      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }

      // True IndexedDB Fallback: Reads directly from store if localStorage is empty
      const db = await this.init();
      if (!db) return [];

      return new Promise((resolve) => {
        try {
          const transaction = db.transaction('cart', 'readonly');
          const store = transaction.objectStore('cart');
          const request = store.getAll();

          request.onsuccess = () => {
            const dbCart = request.result || [];
            if (Array.isArray(dbCart) && dbCart.length > 0) {
              // Restore back to active user's LocalStorage vault
              const cartStr = JSON.stringify(dbCart);
              localStorage.setItem('selfcare_cart', cartStr);
              if (activeUser) {
                localStorage.setItem(`selfcare_cart_${activeUser}`, cartStr);
              }
              resolve(dbCart);
            } else {
              resolve([]);
            }
          };

          request.onerror = () => resolve([]);
        } catch (readErr) {
          resolve([]);
        }
      });
    } catch (e) {
      return [];
    }
  }
};

// Global Window Exposure for seamless cross-module access
if (typeof window !== 'undefined') {
  window.OfflineDB = OfflineDB;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OfflineDB;
}
