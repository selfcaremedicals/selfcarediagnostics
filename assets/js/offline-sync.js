/* file: assets/js/offline-sync.js */
/**
 * Selfcare Diagnostics - Real-Time Offline Synchronization v5.0.0
 * Instant 0ms Local-First load with Seamless Background Google Sheets updates.
 * Auto-sanitizes TestID and PackageID to prevent IndexedDB keyPath errors.
 */

const OfflineSync = {
  async shouldSync(storeName, maxAgeMinutes = 0.5) {
    try {
      const lastSync = await OfflineDB.getMetadata(`${storeName}LastSync`);
      if (!lastSync) return true;
      const diffMinutes = (new Date() - new Date(lastSync)) / (1000 * 60);
      return diffMinutes > maxAgeMinutes;
    } catch (e) {
      return true;
    }
  },

  async syncTests(force = true) {
    try {
      if (!force) {
        const needSync = await this.shouldSync('tests', 0.5);
        if (!needSync) return null;
      }

      const rawTests = await Api.getTests();
      if (rawTests && Array.isArray(rawTests) && rawTests.length > 0) {
        // Sanitize every row so IndexedDB keyPath will NEVER throw error
        const tests = rawTests.map((t, idx) => {
          const tid = String(t.TestID || t.TestCode || t.id || ('T' + String(idx + 1).padStart(4, '0'))).trim();
          return {
            ...t,
            TestID: tid,
            TestCode: t.TestCode || tid,
            TestName: t.TestName || t.name || 'Diagnostic Test'
          };
        });

        await OfflineDB.putAll('tests', tests, true);
        await OfflineDB.setMetadata('testsLastSync', new Date().toISOString());
        localStorage.setItem('cache_tests', JSON.stringify(tests));
        localStorage.setItem('selfcare_tests_db', JSON.stringify(tests));
        return tests;
      }
    } catch (error) {
      console.warn('Sync tests failed (offline or network error):', error);
    }
    return null;
  },

  async syncPackages(force = true) {
    try {
      if (!force) {
        const needSync = await this.shouldSync('packages', 0.5);
        if (!needSync) return null;
      }

      const rawPackages = await Api.getPackages();
      if (rawPackages && Array.isArray(rawPackages) && rawPackages.length > 0) {
        const packages = rawPackages.map((p, idx) => {
          const pid = String(p.PackageID || p.PackageCode || p.id || ('PKG' + String(idx + 1).padStart(3, '0'))).trim();
          return {
            ...p,
            PackageID: pid,
            PackageCode: p.PackageCode || pid,
            PackageName: p.PackageName || p.name || 'Health Package'
          };
        });

        await OfflineDB.putAll('packages', packages, true);
        await OfflineDB.setMetadata('packagesLastSync', new Date().toISOString());
        localStorage.setItem('cache_packages', JSON.stringify(packages));
        localStorage.setItem('selfcare_packages_db', JSON.stringify(packages));
        return packages;
      }
    } catch (error) {
      console.warn('Sync packages failed (offline or network error):', error);
    }
    return null;
  },

  async checkForUpdates(force = true) {
    if (!navigator.onLine) return;
    try {
      await Promise.all([
        this.syncTests(force),
        this.syncPackages(force)
      ]);
    } catch (error) {
      console.error('Background update check error:', error);
    }
  },

  async bootstrap() {
    try {
      await this.checkForUpdates(true);
    } catch (error) {
      console.error('OfflineSync bootstrap error:', error);
    }
  }
};

if (typeof window !== 'undefined') {
  window.OfflineSync = OfflineSync;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OfflineSync;
}
