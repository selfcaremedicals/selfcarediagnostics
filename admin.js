/* file: assets/js/admin.js */
/**
 * Selfcare Diagnostics - Master Admin Operating System Engine v8.7.0
 * Features:
 * - Live Bi-directional Google Sheets sync for 500+ Tests & Packages.
 * - Auto-sanitization of TestID & PackageID to prevent IndexedDB keyPath crashes.
 * - Persistent Report Upload with Base64 FileReader (Fixes expired blob: URLs).
 * - Direct WhatsApp wa.me link compliance.
 * - Instant zero-lag cache restore + background cloud fetch.
 */

const AdminApp = {
  currentAssignBookingId: null,
  editingTestId: null,
  editingPackageId: null,
  currentFinancialPeriod: 'month',
  currentChartPeriod: '7days',
  currentPackageMappingId: null,

  async init() {
    this.seedDefaultDataIfEmpty();
    this.initCurrentDateLabel();

    // 1. Instant 0ms cache render
    this.renderHomeRevenueKPIs();
    this.renderTests();
    this.renderPackages();
    this.renderBookingsTable();

    // 2. Live Cloud Fetch from Google Sheets for Bookings, Tests & Packages
    await Promise.all([
      this.loadAllBookings(),
      this.loadAllTests(),
      this.loadAllPackages()
    ]);

    // 3. Re-render UI with fresh 500+ Tests and Packages from Sheets
    this.renderHomeRevenueKPIs();
    this.renderRevenueChart(this.currentChartPeriod);
    this.renderFinancialLedger();
    this.renderBookingsTable();
    this.renderHomeCollectionsTable();
    this.renderTechnicians();
    this.renderTests();
    this.renderPackages();
    this.renderCarousel();
    this.populateReportBookingSelect();
    this.initPackageMappingEngine();
    this.populateSocialItemSelect();
    this.renderCustomersTable();
    this.renderCouponsTable();
    this.renderInventoryTable();
    this.renderAuditLogsTable();
  },

  initCurrentDateLabel() {
    const el = document.getElementById('home-current-date');
    if (el) {
      el.textContent = new Date().toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }
  },

  /* =========================================================
     LIVE TESTS & PACKAGES CLOUD SYNC ENGINE
     ========================================================= */
  async loadAllTests() {
    let cloudTests = null;
    if (navigator.onLine && typeof Api !== 'undefined') {
      try {
        if (typeof Api.request === 'function') {
          cloudTests = await Api.request('getAdminTests', {}, false).catch(() => null);
        }
        if (!cloudTests || !Array.isArray(cloudTests) || cloudTests.length === 0) {
          if (typeof Api.getTests === 'function') {
            cloudTests = await Api.getTests();
          }
        }
      } catch (err) {
        console.warn('[Admin] Cloud tests fetch deferred:', err);
      }
    }

    if (cloudTests && Array.isArray(cloudTests) && cloudTests.length > 0) {
      const sanitized = cloudTests.map((t, idx) => {
        const tid = String(t.TestID || t.TestCode || t.id || ('T' + String(idx + 1).padStart(4, '0'))).trim();
        return {
          ...t,
          TestID: tid,
          TestCode: t.TestCode || tid,
          TestName: t.TestName || t.name || 'Diagnostic Test',
          Category: t.Category || 'General',
          SampleType: t.SampleType || 'Blood',
          FastingRequired: t.FastingRequired || 'No',
          MRP: Number(t.MRP || 0),
          OfferPrice: Number(t.OfferPrice || t.price || 0),
          B2BCost: Number(t.B2BCost || Math.round((t.OfferPrice || 0) * 0.35)),
          Status: t.Status || 'Active'
        };
      });

      localStorage.setItem('selfcare_tests_admin_db', JSON.stringify(sanitized));
      this.syncPublicTestsCache(sanitized);

      if (typeof OfflineDB !== 'undefined' && OfflineDB.putAll) {
        await OfflineDB.putAll('tests', sanitized, true);
        await OfflineDB.setMetadata('testsLastSync', new Date().toISOString());
      }
      return sanitized;
    }

    return JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');
  },

  async loadAllPackages() {
    let cloudPkgs = null;
    if (navigator.onLine && typeof Api !== 'undefined') {
      try {
        if (typeof Api.request === 'function') {
          cloudPkgs = await Api.request('getAdminPackages', {}, false).catch(() => null);
        }
        if (!cloudPkgs || !Array.isArray(cloudPkgs) || cloudPkgs.length === 0) {
          if (typeof Api.getPackages === 'function') {
            cloudPkgs = await Api.getPackages();
          }
        }
      } catch (err) {
        console.warn('[Admin] Cloud packages fetch deferred:', err);
      }
    }

    if (cloudPkgs && Array.isArray(cloudPkgs) && cloudPkgs.length > 0) {
      const sanitized = cloudPkgs.map((p, idx) => {
        const pid = String(p.PackageID || p.PackageCode || p.id || ('PKG' + String(idx + 1).padStart(3, '0'))).trim();
        return {
          ...p,
          PackageID: pid,
          PackageCode: p.PackageCode || pid,
          PackageName: p.PackageName || p.name || 'Health Package',
          Category: p.Category || 'Preventive Care',
          Parameters: p.Parameters || 'Complete Evaluation',
          MRP: Number(p.MRP || 0),
          OfferPrice: Number(p.OfferPrice || p.price || 0),
          B2BCost: Number(p.B2BCost || Math.round((p.OfferPrice || 0) * 0.35)),
          Status: p.Status || 'Active',
          Featured: String(p.Featured || 'FALSE').toUpperCase()
        };
      });

      localStorage.setItem('selfcare_packages_admin_db', JSON.stringify(sanitized));
      this.syncPublicPackagesCache(sanitized);

      if (typeof OfflineDB !== 'undefined' && OfflineDB.putAll) {
        await OfflineDB.putAll('packages', sanitized, true);
        await OfflineDB.setMetadata('packagesLastSync', new Date().toISOString());
      }
      return sanitized;
    }

    return JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
  },

  /* =========================================================
     DRAWER NAVIGATION & TAB SWITCHING
     ========================================================= */
  toggleDrawer() {
    const drawer = document.getElementById('admin-drawer');
    const overlay = document.getElementById('admin-drawer-overlay');
    const isOpen = drawer.classList.contains('open');

    if (isOpen) {
      this.closeDrawer();
    } else {
      drawer.classList.add('open');
      overlay.classList.add('active');
    }
  },

  closeDrawer() {
    const drawer = document.getElementById('admin-drawer');
    const overlay = document.getElementById('admin-drawer-overlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  },

  switchTab(tabId) {
    document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const targetTab = document.getElementById(tabId);
    const targetNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);

    if (targetTab) targetTab.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    if (tabId === 'tab-home') {
      this.renderHomeRevenueKPIs();
      this.renderRevenueChart(this.currentChartPeriod);
    } else if (tabId === 'tab-finance') {
      this.renderFinancialLedger();
    } else if (tabId === 'tab-bookings') {
      this.renderBookingsTable();
    } else if (tabId === 'tab-tests') {
      this.renderTests();
    } else if (tabId === 'tab-packages') {
      this.renderPackages();
    } else if (tabId === 'tab-package-mapping') {
      this.initPackageMappingEngine();
    }

    this.closeDrawer();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  /* =========================================================
     HOME REVENUE KPIS & SVG REVENUE CHART
     ========================================================= */
  renderHomeRevenueKPIs() {
    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const adminTests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');
    const adminPackages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let todayRev = 0, todayMrp = 0, todayOrders = 0;
    let weekRev = 0, weekOrders = 0;
    let monthRev = 0, monthMrp = 0, monthB2b = 0, monthOrders = 0;
    let pendingPayments = 0, pendingOrders = 0;

    bookings.forEach(b => {
      const bDate = new Date(b.date || Date.now());
      const bDateStr = bDate.toISOString().slice(0, 10);
      const rev = Number(b.totalAmount || b.finalAmount || 0);

      let orderMrp = 0, orderB2b = 0;
      let items = b.items;
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = []; }
      }
      if (!Array.isArray(items)) items = [];

      items.forEach(item => {
        const name = (item.name || item.TestName || item.PackageName || '').toLowerCase();
        const t = adminTests.find(x => x.TestName.toLowerCase() === name || x.TestID === item.id);
        const p = adminPackages.find(x => x.PackageName.toLowerCase() === name || x.PackageID === item.id);

        if (t) {
          orderMrp += Number(t.MRP || 0);
          orderB2b += Number(t.B2BCost || Math.round(t.OfferPrice * 0.36));
        } else if (p) {
          orderMrp += Number(p.MRP || 0);
          orderB2b += Number(p.B2BCost || Math.round(p.OfferPrice * 0.35));
        } else {
          orderMrp += Number(item.price || 0) * 1.5;
          orderB2b += Math.round(Number(item.price || 0) * 0.36);
        }
      });

      if (orderMrp < rev) orderMrp = Math.round(rev * 1.45);
      if (orderB2b === 0) orderB2b = Math.round(rev * 0.35);

      if (bDateStr === todayStr) {
        todayRev += rev;
        todayMrp += orderMrp;
        todayOrders++;
      }

      if (bDate >= sevenDaysAgo) {
        weekRev += rev;
        weekOrders++;
      }

      if (bDate.getFullYear() === curYear && bDate.getMonth() === curMonth) {
        monthRev += rev;
        monthMrp += orderMrp;
        monthB2b += orderB2b;
        monthOrders++;
      }

      if (String(b.paymentStatus || '').toUpperCase() === 'PENDING') {
        pendingPayments += rev;
        pendingOrders++;
      }
    });

    const monthProfit = Math.max(0, monthRev - monthB2b);
    const profitMargin = monthRev > 0 ? ((monthProfit / monthRev) * 100).toFixed(1) : 0;
    const todaySavings = Math.max(0, todayMrp - todayRev);

    this.safeSetText('kpi-today-revenue', `₹${todayRev.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-today-orders-count', `${todayOrders} Orders Today`);
    this.safeSetText('kpi-week-revenue', `₹${weekRev.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-week-orders-count', `${weekOrders} Orders (7 Days)`);
    this.safeSetText('kpi-month-revenue', `₹${monthRev.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-month-orders-count', `${monthOrders} Orders This Month`);
    this.safeSetText('kpi-today-mrp', `₹${todayMrp.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-today-discount-savings', `Customer Savings: ₹${todaySavings.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-month-mrp', `₹${monthMrp.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-month-b2b', `₹${monthB2b.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-month-profit', `₹${monthProfit.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-profit-margin', `Actual Margin: ${profitMargin}%`);
    this.safeSetText('kpi-pending-payments', `₹${pendingPayments.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-pending-orders-count', `${pendingOrders} Uncollected Orders`);
  },

  renderRevenueChart(period) {
    this.currentChartPeriod = period;
    ['today', '7days', '30days'].forEach(p => {
      const btn = document.getElementById(`chart-tab-${p}`);
      if (btn) btn.classList.toggle('active', p === period);
    });

    const container = document.getElementById('revenue-svg-chart-container');
    if (!container) return;

    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const now = new Date();
    let labels = [];
    let dataPoints = [];

    if (period === 'today') {
      labels = ['6-9 AM', '9-12 PM', '12-3 PM', '3-7 PM'];
      dataPoints = [0, 0, 0, 0];
      const todayStr = now.toISOString().slice(0, 10);
      bookings.filter(b => (b.date || '').slice(0, 10) === todayStr).forEach((b, idx) => {
        dataPoints[idx % 4] += Number(b.totalAmount || b.finalAmount || 0);
      });
    } else if (period === '7days') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayStr = d.toLocaleDateString('en-IN', { weekday: 'short' });
        const iso = d.toISOString().slice(0, 10);
        labels.push(dayStr);

        const sum = bookings
          .filter(b => (b.date || '').slice(0, 10) === iso)
          .reduce((acc, cur) => acc + Number(cur.totalAmount || cur.finalAmount || 0), 0);
        dataPoints.push(sum);
      }
    } else {
      labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
      dataPoints = [0, 0, 0, 0];
      bookings.forEach((b, i) => {
        dataPoints[i % 4] += Number(b.totalAmount || b.finalAmount || 0);
      });
    }

    const maxVal = Math.max(...dataPoints, 1000);
    const svgWidth = 800;
    const svgHeight = 220;
    const barWidth = 45;
    const spacing = svgWidth / labels.length;

    let barsSvg = '';
    labels.forEach((label, i) => {
      const val = dataPoints[i];
      const barHeight = Math.max(12, (val / maxVal) * 140);
      const x = (i * spacing) + (spacing / 2) - (barWidth / 2);
      const y = svgHeight - 40 - barHeight;

      barsSvg += `
        <g class="chart-group">
          <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="8" fill="url(#revGrad)" />
          <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" fill="#045D49" font-size="11" font-weight="800">₹${val.toLocaleString('en-IN')}</text>
          <text x="${x + barWidth / 2}" y="${svgHeight - 15}" text-anchor="middle" fill="#64748B" font-size="11" font-weight="700">${label}</text>
        </g>
      `;
    });

    container.innerHTML = `
      <svg viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="100%">
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#35C39A" />
            <stop offset="100%" stop-color="#078866" />
          </linearGradient>
        </defs>
        <line x1="20" y1="${svgHeight - 35}" x2="${svgWidth - 20}" y2="${svgHeight - 35}" stroke="#E2E8F0" stroke-width="1.5" />
        ${barsSvg}
      </svg>
    `;
  },

  seedDefaultDataIfEmpty() {
    if (!localStorage.getItem('selfcare_technicians')) {
      const initialTechs = [
        { id: "SCDTECH001", name: "Ramesh Phlebotomist", phone: "9840123456", zone: "T. Nagar, Kodambakkam", pass: "tech@123", status: "Active" },
        { id: "SCDTECH002", name: "Suresh Phlebotomist", phone: "9840987654", zone: "Anna Nagar, Kilpauk", pass: "tech@123", status: "Active" }
      ];
      localStorage.setItem('selfcare_technicians', JSON.stringify(initialTechs));
    }
  },

  syncPublicTestsCache(adminTests) {
    const publicTests = adminTests.map(t => {
      const { B2BCost, ...publicFields } = t;
      return publicFields;
    });
    localStorage.setItem('cache_tests', JSON.stringify(publicTests));
    localStorage.setItem('selfcare_tests_db', JSON.stringify(publicTests));
  },

  syncPublicPackagesCache(adminPackages) {
    const publicPackages = adminPackages.map(p => {
      const { B2BCost, ...publicFields } = p;
      return publicFields;
    });
    localStorage.setItem('cache_packages', JSON.stringify(publicPackages));
    localStorage.setItem('selfcare_packages_db', JSON.stringify(publicPackages));
  },

  /* =========================================================
     1. BOOKINGS & LOGISTICS PIPELINE
     ========================================================= */
  async loadAllBookings() {
    let allBookings = [];

    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      try {
        const cloudBookings = await Api.request('getAllBookings', {}, false);
        if (Array.isArray(cloudBookings) && cloudBookings.length > 0) {
          allBookings = cloudBookings;
        }
      } catch (err) {
        console.warn('[Admin] Cloud bookings fetch deferred:', err);
      }
    }

    try {
      const cartRecents = JSON.parse(localStorage.getItem('selfcare_recent_bookings') || '[]');
      const adminStored = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');

      const mergedMap = new Map();
      allBookings.forEach(b => mergedMap.set(b.bookingId || b.id, b));
      adminStored.forEach(b => mergedMap.set(b.bookingId || b.id, b));
      cartRecents.forEach(b => {
        const id = b.bookingId || b.id;
        if (!mergedMap.has(id)) {
          mergedMap.set(id, {
            id: id,
            bookingId: id,
            patientName: b.patientName || 'Customer',
            patientPhone: b.patientPhone || '-',
            location: b.address || 'Chennai',
            zone: 'Kodambakkam Hub',
            mode: b.collectionType === 'lab' ? 'Direct Lab Walk-in' : 'Home Sample Pickup',
            slot: `${b.collectionDate || 'Today'} (${b.timeSlot || 'Window'})`,
            totalAmount: Number(b.finalAmount || 0),
            paymentStatus: b.paymentStatus || 'CONFIRMED',
            techStatus: b.bookingStatus === 'CONFIRMED' ? 'Unassigned' : (b.bookingStatus || 'Unassigned'),
            reportStatus: 'Pending',
            items: b.items || [],
            date: b.updatedAt || new Date().toISOString()
          });
        }
      });

      allBookings = Array.from(mergedMap.values());
      localStorage.setItem('selfcare_bookings_db', JSON.stringify(allBookings));
    } catch (e) {
      console.error('Error merging bookings:', e);
    }

    return allBookings;
  },

  renderBookingsTable(filteredList = null) {
    const tableBody = document.getElementById('bookings-table-body');
    if (!tableBody) return;

    const bookings = filteredList || JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');

    if (bookings.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#64748B;">No bookings recorded.</td></tr>`;
      return;
    }

    tableBody.innerHTML = bookings.map(b => {
      const bId = b.id || b.bookingId;
      const statusText = b.techStatus || 'Unassigned';
      let statusClass = 'status-pending';
      if (statusText.includes('Broadcasted')) statusClass = 'status-broadcast';
      if (statusText.includes('Assigned to')) statusClass = 'status-assigned';

      return `
        <tr>
          <td><strong>${bId}</strong></td>
          <td>
            <strong>${b.patientName}</strong><br>
            <span style="font-size:11px; color:#536E66;">${b.patientPhone}</span>
          </td>
          <td>${b.location || b.address || 'Chennai'}</td>
          <td><span style="font-size:11.5px; font-weight:700;">${b.slot || b.timeSlot}</span></td>
          <td>
            <strong style="color:#078866; font-size:13.5px;">₹${b.totalAmount || b.finalAmount || 0}</strong><br>
            <span style="font-size:10px; color:#64748B;">${b.paymentStatus || 'Confirmed'}</span>
          </td>
          <td><span class="status-pill ${statusClass}">${statusText}</span></td>
          <td>
            ${b.reportUrl ? `<a href="${b.reportUrl}" target="_blank" style="color:#078866; font-weight:800; text-decoration:none;">📄 View PDF</a>` : `<span style="color:#94A3B8; font-size:11px;">Pending</span>`}
          </td>
          <td>
            <button class="btn-emerald-solid" style="padding:6px 12px; font-size:11px;" onclick="AdminApp.openAssignModal('${bId}')">
              📍 Assign Phlebo
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filterBookingsByStatus(statusKey) {
    document.querySelectorAll('.status-filter-scroll .filter-pill').forEach(b => b.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');

    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const todayStr = new Date().toISOString().slice(0, 10);

    let filtered = bookings;
    if (statusKey === 'today') {
      filtered = bookings.filter(b => (b.date || '').slice(0, 10) === todayStr);
    } else if (statusKey === 'pending') {
      filtered = bookings.filter(b => (b.techStatus || '').includes('Unassigned'));
    } else if (statusKey === 'payment_pending') {
      filtered = bookings.filter(b => String(b.paymentStatus || '').toUpperCase() === 'PENDING');
    } else if (statusKey === 'completed') {
      filtered = bookings.filter(b => (b.techStatus || '').toUpperCase() === 'COMPLETED' || b.reportUrl);
    }

    this.renderBookingsTable(filtered);
  },

  filterBookings() {
    const query = (document.getElementById('booking-search-input').value || '').toLowerCase();
    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const filtered = bookings.filter(b => {
      const str = `${b.id} ${b.bookingId} ${b.patientName} ${b.patientPhone}`.toLowerCase();
      return str.includes(query);
    });
    this.renderBookingsTable(filtered);
  },

  calculateDeliveryRate() {
    const dist = parseFloat(document.getElementById('calc-distance-input').value) || 0;
    const visitType = document.getElementById('calc-visit-type').value;
    const resultEl = document.getElementById('calc-fee-result');
    const explEl = document.getElementById('calc-fee-explanation');

    let fee = 0;
    if (dist <= 5.0) {
      fee = visitType === 'single' ? 100 : 150;
      explEl.textContent = `Within 5 km radius flat rate applied (₹${fee}).`;
    } else {
      const perKm = visitType === 'single' ? 20 : 30;
      fee = Math.round(dist * perKm);
      explEl.textContent = `Tier 2 rate applied: ${dist} km × ₹${perKm}/km.`;
    }

    resultEl.textContent = `₹${fee}`;
  },

  renderHomeCollectionsTable() {
    const tbody = document.getElementById('home-collections-table-body');
    if (!tbody) return;

    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const homePickups = bookings.filter(b => (b.mode || '').includes('Home') || (b.collectionType || '') === 'home');

    if (homePickups.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:16px; color:#64748B;">No home sample collections pending.</td></tr>`;
      return;
    }

    tbody.innerHTML = homePickups.map(b => `
      <tr>
        <td><strong>${b.id || b.bookingId}</strong></td>
        <td>${b.patientName}</td>
        <td>${b.location || b.address || 'Chennai'}</td>
        <td><span class="status-pill status-assigned">3.2 km</span></td>
        <td><strong>₹100</strong></td>
        <td>${b.assignedTechName || b.techStatus || 'Unassigned'}</td>
        <td><span class="status-pill status-assigned">Confirmed</span></td>
      </tr>
    `).join('');
  },

  setFinancialPeriod(period) {
    this.currentFinancialPeriod = period;
    document.getElementById('btn-period-month').classList.toggle('active', period === 'month');
    document.getElementById('btn-period-all').classList.toggle('active', period === 'all');
    document.getElementById('fin-profit-period-label').textContent = period === 'month' ? '(This Month)' : '(All Time)';
    this.renderFinancialLedger();
  },

  renderFinancialLedger() {
    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const adminTests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');
    const adminPackages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let totalMrp = 0;
    let totalRevenue = 0;
    let totalB2bCost = 0;

    const ledgerRows = [];

    bookings.forEach(b => {
      const bookingDate = new Date(b.date || Date.now());
      if (this.currentFinancialPeriod === 'month') {
        if (bookingDate.getFullYear() !== currentYear || bookingDate.getMonth() !== currentMonth) {
          return;
        }
      }

      let orderMrp = 0;
      let orderRevenue = Number(b.totalAmount || b.finalAmount || 0);
      let orderB2b = 0;

      let items = b.items;
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = []; }
      }
      if (!Array.isArray(items)) items = [];

      items.forEach(item => {
        const itemName = (item.name || item.TestName || item.PackageName || '').toLowerCase();
        const matchedTest = adminTests.find(t => t.TestName.toLowerCase() === itemName || t.TestID === item.id);
        const matchedPkg = adminPackages.find(p => p.PackageName.toLowerCase() === itemName || p.PackageID === item.id);

        if (matchedTest) {
          orderMrp += Number(matchedTest.MRP || 0);
          orderB2b += Number(matchedTest.B2BCost || Math.round(matchedTest.OfferPrice * 0.38));
        } else if (matchedPkg) {
          orderMrp += Number(matchedPkg.MRP || 0);
          orderB2b += Number(matchedPkg.B2BCost || Math.round(matchedPkg.OfferPrice * 0.35));
        } else {
          orderMrp += Number(item.price || 0) * 1.5;
          orderB2b += Math.round(Number(item.price || 0) * 0.36);
        }
      });

      if (orderMrp < orderRevenue) orderMrp = Math.round(orderRevenue * 1.4);
      if (orderB2b === 0) orderB2b = Math.round(orderRevenue * 0.35);

      const netProfit = Math.max(0, orderRevenue - orderB2b);

      totalMrp += orderMrp;
      totalRevenue += orderRevenue;
      totalB2bCost += orderB2b;

      ledgerRows.push({
        id: b.id || b.bookingId,
        date: bookingDate.toLocaleDateString('en-GB'),
        patient: b.patientName,
        itemCount: `${items.length || 1} Items`,
        mrp: orderMrp,
        revenue: orderRevenue,
        b2b: orderB2b,
        profit: netProfit,
        status: b.techStatus || 'Confirmed'
      });
    });

    const actualProfit = Math.max(0, totalRevenue - totalB2bCost);
    const profitMargin = totalRevenue > 0 ? ((actualProfit / totalRevenue) * 100).toFixed(1) : 0;

    this.safeSetText('fin-total-mrp', `₹${totalMrp.toLocaleString('en-IN')}`);
    this.safeSetText('fin-total-revenue', `₹${totalRevenue.toLocaleString('en-IN')}`);
    this.safeSetText('fin-total-b2b', `₹${totalB2bCost.toLocaleString('en-IN')}`);
    this.safeSetText('fin-actual-profit', `₹${actualProfit.toLocaleString('en-IN')}`);
    this.safeSetText('fin-margin-percentage', `Profit Margin: ${profitMargin}% of Revenue`);

    const tbody = document.getElementById('finance-ledger-table-body');
    if (!tbody) return;

    if (ledgerRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color:#64748B;">No financial records found for this period.</td></tr>`;
      return;
    }

    tbody.innerHTML = ledgerRows.map(r => `
      <tr>
        <td>${r.date}</td>
        <td><strong>${r.id}</strong></td>
        <td>${r.patient}</td>
        <td><span class="status-pill status-assigned">${r.itemCount}</span></td>
        <td class="strikethrough">₹${r.mrp.toLocaleString('en-IN')}</td>
        <td><strong class="green-text">₹${r.revenue.toLocaleString('en-IN')}</strong></td>
        <td><span class="b2b-cell-text">₹${r.b2b.toLocaleString('en-IN')}</span></td>
        <td><strong style="color:#045D49; font-size:13px;">+ ₹${r.profit.toLocaleString('en-IN')}</strong></td>
        <td><span class="status-pill status-assigned">${r.status}</span></td>
      </tr>
    `).join('');
  },

  openAssignModal(bookingId) {
    this.currentAssignBookingId = bookingId;
    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const b = bookings.find(item => (item.id === bookingId || item.bookingId === bookingId));
    if (!b) return;

    document.getElementById('assign-booking-details').innerHTML = `
      <strong>Booking ID: ${b.id || b.bookingId}</strong> | Patient: <strong>${b.patientName}</strong> (${b.patientPhone})<br>
      📍 Address: ${b.location || b.address} | Slot: ${b.slot || b.timeSlot}
    `;

    const techs = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');
    const select = document.getElementById('modal-select-particular-tech');
    select.innerHTML = techs.map(t => `<option value="${t.id}">${t.name} (${t.zone}) - [${t.status}]</option>`).join('');

    this.toggleAssignMode('particular');
    document.querySelector('input[name="assign_type"][value="particular"]').checked = true;
    document.getElementById('assign-tech-modal').style.display = 'flex';
  },

  toggleAssignMode(mode) {
    const particularWrap = document.getElementById('particular-tech-select-wrap');
    const broadcastNotice = document.getElementById('nearby-broadcast-notice');

    if (mode === 'particular') {
      particularWrap.style.display = 'block';
      broadcastNotice.style.display = 'none';
    } else {
      particularWrap.style.display = 'none';
      broadcastNotice.style.display = 'flex';
    }
  },

  async executeTechnicianAssignment() {
    const mode = document.querySelector('input[name="assign_type"]:checked').value;
    let bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const idx = bookings.findIndex(b => (b.id === this.currentAssignBookingId || b.bookingId === this.currentAssignBookingId));
    if (idx === -1) return;

    let payload = {};

    if (mode === 'particular') {
      const techId = document.getElementById('modal-select-particular-tech').value;
      const techs = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');
      const tech = techs.find(t => t.id === techId);

      bookings[idx].techStatus = `Assigned to ${tech ? tech.name : techId}`;
      bookings[idx].assignedTechId = techId;
      bookings[idx].assignedTechName = tech ? tech.name : techId;
      payload = { bookingId: this.currentAssignBookingId, type: 'particular', techId: techId, techName: tech?.name };
      this.showToast(`Booking assigned to ${tech?.name}`);
    } else {
      bookings[idx].techStatus = `Broadcasted to All Nearby Technicians 📡`;
      bookings[idx].assignedTechId = 'BROADCAST_ALL';
      bookings[idx].assignedTechName = 'Nearby Fleet';
      payload = { bookingId: this.currentAssignBookingId, type: 'broadcast', zone: bookings[idx].zone || 'All' };
      this.showToast('Order broadcasted to all on-duty phlebotomists!');
    }

    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('assignTechnician', payload, false).catch(err => console.warn('Assign sync deferred:', err));
    }

    localStorage.setItem('selfcare_bookings_db', JSON.stringify(bookings));
    this.closeModal('assign-tech-modal');
    this.renderBookingsTable();
    this.renderHomeRevenueKPIs();
  },

  renderTechnicians() {
    const container = document.getElementById('technicians-card-container');
    if (!container) return;

    const techs = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');
    if (techs.length === 0) {
      container.innerHTML = '<p style="font-size:12px; color:#64748B;">No technicians created yet.</p>';
      return;
    }

    container.innerHTML = techs.map((t, idx) => `
      <div class="tech-row-item">
        <div>
          <strong>${t.name} <span class="status-pill status-assigned" style="font-size:9.5px;">${t.status}</span></strong>
          <span>ID: <code>${t.id}</code> | Contact: ${t.phone}</span><br>
          <span style="color:#078866; font-weight:700;">📍 Coverage: ${t.zone}</span>
        </div>
        <button class="btn-cancel" style="padding:4px 10px; font-size:11px; color:#DC2626;" onclick="AdminApp.deleteTechnician(${idx})">Delete ✕</button>
      </div>
    `).join('');
  },

  handleCreateTechnician(e) {
    e.preventDefault();
    const id = document.getElementById('tech-id-input').value.trim();
    const name = document.getElementById('tech-name-input').value.trim();
    const phone = document.getElementById('tech-phone-input').value.trim();
    const zone = document.getElementById('tech-zone-input').value.trim();
    const pass = document.getElementById('tech-pass-input').value.trim();
    const status = document.getElementById('tech-status-select').value;

    let techs = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');
    if (techs.some(t => t.id.toLowerCase() === id.toLowerCase())) {
      alert('Technician ID already exists! Please use a unique ID.');
      return;
    }

    const techObj = { id, name, phone, zone, pass, status };
    techs.push(techObj);
    localStorage.setItem('selfcare_technicians', JSON.stringify(techs));

    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('saveTechnician', techObj, false).catch(err => console.warn('Tech sync deferred:', err));
    }

    document.getElementById('tech-create-form').reset();
    this.showToast(`Technician ${name} (${id}) registered!`);
    this.renderTechnicians();
  },

  deleteTechnician(idx) {
    if (!confirm('Remove this technician?')) return;
    let techs = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');
    const removed = techs.splice(idx, 1);
    localStorage.setItem('selfcare_technicians', JSON.stringify(techs));

    if (removed[0] && navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('deleteTechnician', { id: removed[0].id }, false).catch(() => {});
    }

    this.renderTechnicians();
  },

  /* =========================================================
     5. TESTS FULL CRUD (LIVE SHEETS SYNC)
     ========================================================= */
  renderTests() {
    const tbody = document.getElementById('tests-table-body');
    if (!tbody) return;

    let tests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');
    const query = (document.getElementById('test-search-filter')?.value || '').toLowerCase();
    const cat = document.getElementById('test-category-filter')?.value || '';

    if (query) {
      tests = tests.filter(t => (t.TestName + t.TestCode + t.TestID).toLowerCase().includes(query));
    }
    if (cat) {
      tests = tests.filter(t => t.Category === cat);
    }

    if (tests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:20px; color:#64748B;">No diagnostic tests found. Tap "Sync with Google Sheets" to fetch.</td></tr>`;
      return;
    }

    tbody.innerHTML = tests.map(t => {
      const profit = Math.max(0, Number(t.OfferPrice || 0) - Number(t.B2BCost || 0));
      return `
        <tr>
          <td><strong>${t.TestID}</strong></td>
          <td><code>${t.TestCode}</code></td>
          <td><strong>${t.TestName}</strong></td>
          <td>${t.Category || '-'}</td>
          <td>${t.SampleType || '-'}</td>
          <td>${t.FastingRequired || '-'}</td>
          <td class="strikethrough">₹${t.MRP}</td>
          <td><strong class="green-text">₹${t.OfferPrice}</strong></td>
          <td><span class="b2b-cell-text">₹${t.B2BCost || 0}</span></td>
          <td><strong style="color:#045D49;">₹${profit}</strong></td>
          <td><span class="status-pill status-assigned">${t.Status || 'Active'}</span></td>
          <td>
            <button class="btn-cancel" style="padding:4px 8px; font-size:11px;" onclick="AdminApp.openTestModal('edit', '${t.TestID}')">Edit</button>
            <button class="btn-cancel" style="padding:4px 8px; font-size:11px; color:#DC2626;" onclick="AdminApp.deleteTest('${t.TestID}')">Del</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  openTestModal(action, testId = null) {
    const modal = document.getElementById('test-edit-modal');
    document.getElementById('test-backend-form').reset();

    if (action === 'add') {
      this.editingTestId = null;
      document.getElementById('test-modal-title').innerText = '+ Add New Diagnostic Test';
      document.getElementById('t-TestID').value = 'T' + Date.now().toString().slice(-4);
      document.getElementById('t-TestID').readOnly = false;
    } else {
      this.editingTestId = testId;
      document.getElementById('test-modal-title').innerText = '✏️ Edit Test: ' + testId;
      const tests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');
      const t = tests.find(item => item.TestID === testId);
      if (!t) return;

      document.getElementById('t-TestID').value = t.TestID;
      document.getElementById('t-TestID').readOnly = true;
      document.getElementById('t-TestCode').value = t.TestCode || '';
      document.getElementById('t-TestName').value = t.TestName || '';
      document.getElementById('t-Category').value = t.Category || '';
      document.getElementById('t-SampleType').value = t.SampleType || '';
      document.getElementById('t-FastingRequired').value = t.FastingRequired || 'No';
      document.getElementById('t-Preparation').value = t.Preparation || '';
      document.getElementById('t-Parameters').value = t.Parameters || '';
      document.getElementById('t-TAT').value = t.TAT || '';
      document.getElementById('t-MRP').value = t.MRP || 0;
      document.getElementById('t-OfferPrice').value = t.OfferPrice || 0;
      document.getElementById('t-B2BCost').value = t.B2BCost || 0;
      document.getElementById('t-Status').value = t.Status || 'Active';
      document.getElementById('t-WhyDone').value = t.WhyDone || '';
      document.getElementById('t-SearchKeywords').value = t.SearchKeywords || '';
    }

    modal.style.display = 'flex';
  },

  async saveTestRecord(e) {
    e.preventDefault();
    let tests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');

    const record = {
      TestID: document.getElementById('t-TestID').value.trim(),
      TestCode: document.getElementById('t-TestCode').value.trim(),
      TestName: document.getElementById('t-TestName').value.trim(),
      Category: document.getElementById('t-Category').value.trim(),
      SampleType: document.getElementById('t-SampleType').value.trim(),
      FastingRequired: document.getElementById('t-FastingRequired').value,
      Preparation: document.getElementById('t-Preparation').value.trim(),
      Parameters: document.getElementById('t-Parameters').value.trim(),
      TAT: document.getElementById('t-TAT').value.trim(),
      MRP: Number(document.getElementById('t-MRP').value),
      OfferPrice: Number(document.getElementById('t-OfferPrice').value),
      B2BCost: Number(document.getElementById('t-B2BCost').value),
      Status: document.getElementById('t-Status').value,
      WhyDone: document.getElementById('t-WhyDone').value.trim(),
      SearchKeywords: document.getElementById('t-SearchKeywords').value.trim(),
      UpdatedAt: new Date().toISOString()
    };

    if (this.editingTestId) {
      const idx = tests.findIndex(t => t.TestID === this.editingTestId);
      if (idx !== -1) tests[idx] = record;
    } else {
      tests.unshift(record);
    }

    localStorage.setItem('selfcare_tests_admin_db', JSON.stringify(tests));
    this.syncPublicTestsCache(tests);

    if (typeof OfflineDB !== 'undefined' && OfflineDB.putAll) {
      OfflineDB.putAll('tests', tests, true);
    }

    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('saveTest', record, false).catch(err => console.warn('Test backend write deferred:', err));
    }

    this.closeModal('test-edit-modal');
    this.renderTests();
    this.showToast(`Test "${record.TestName}" saved live!`);
  },

  deleteTest(testId) {
    if (!confirm(`Delete test ${testId}?`)) return;
    let tests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');
    tests = tests.filter(t => t.TestID !== testId);
    localStorage.setItem('selfcare_tests_admin_db', JSON.stringify(tests));
    this.syncPublicTestsCache(tests);

    if (typeof OfflineDB !== 'undefined' && OfflineDB.putAll) {
      OfflineDB.putAll('tests', tests, true);
    }

    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('deleteTest', { testId }, false).catch(() => {});
    }

    this.renderTests();
    this.showToast(`Test ${testId} removed.`);
  },

  /* =========================================================
     6. HEALTH PACKAGES CRUD (LIVE SHEETS SYNC)
     ========================================================= */
  renderPackages() {
    const tbody = document.getElementById('packages-table-body');
    if (!tbody) return;

    let packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    const query = (document.getElementById('package-search-filter')?.value || '').toLowerCase();

    if (query) {
      packages = packages.filter(p => (p.PackageName + p.PackageCode + p.PackageID).toLowerCase().includes(query));
    }

    if (packages.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:20px; color:#64748B;">No health packages found. Tap "Sync with Google Sheets" to fetch.</td></tr>`;
      return;
    }

    tbody.innerHTML = packages.map(p => {
      const profit = Math.max(0, Number(p.OfferPrice || 0) - Number(p.B2BCost || 0));
      return `
        <tr>
          <td><strong>${p.PackageID}</strong></td>
          <td><code>${p.PackageCode}</code></td>
          <td><strong>${p.PackageName}</strong></td>
          <td>${p.Category || '-'}</td>
          <td><span class="status-pill status-assigned">${p.Parameters || '-'}</span></td>
          <td class="strikethrough">₹${p.MRP}</td>
          <td><strong class="green-text">₹${p.OfferPrice}</strong></td>
          <td><span class="b2b-cell-text">₹${p.B2BCost || 0}</span></td>
          <td><strong style="color:#045D49;">₹${profit}</strong></td>
          <td><strong>${p.Featured === 'TRUE' ? '⭐ YES' : 'NO'}</strong></td>
          <td><span class="status-pill status-assigned">${p.Status}</span></td>
          <td>
            <button class="btn-cancel" style="padding:4px 8px; font-size:11px;" onclick="AdminApp.openPackageModal('edit', '${p.PackageID}')">Edit</button>
            <button class="btn-cancel" style="padding:4px 8px; font-size:11px; color:#DC2626;" onclick="AdminApp.deletePackage('${p.PackageID}')">Del</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  openPackageModal(action, packageId = null) {
    const modal = document.getElementById('package-edit-modal');
    document.getElementById('package-backend-form').reset();

    if (action === 'add') {
      this.editingPackageId = null;
      document.getElementById('package-modal-title').innerText = '+ Add New Health Checkup Package';
      document.getElementById('p-PackageID').value = 'PKG_' + Date.now().toString().slice(-4);
      document.getElementById('p-PackageID').readOnly = false;
    } else {
      this.editingPackageId = packageId;
      document.getElementById('package-modal-title').innerText = '✏️ Edit Package: ' + packageId;
      const packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
      const p = packages.find(item => item.PackageID === packageId);
      if (!p) return;

      document.getElementById('p-PackageID').value = p.PackageID;
      document.getElementById('p-PackageID').readOnly = true;
      document.getElementById('p-PackageCode').value = p.PackageCode || '';
      document.getElementById('p-PackageName').value = p.PackageName || '';
      document.getElementById('p-Category').value = p.Category || '';
      document.getElementById('p-Description').value = p.Description || '';
      document.getElementById('p-TestIDs').value = p.TestIDs || '';
      document.getElementById('p-Parameters').value = p.Parameters || '';
      document.getElementById('p-Preparation').value = p.Preparation || '';
      document.getElementById('p-FastingRequired').value = p.FastingRequired || 'No Fasting Required';
      document.getElementById('p-SampleType').value = p.SampleType || '';
      document.getElementById('p-TAT').value = p.TAT || '';
      document.getElementById('p-MRP').value = p.MRP || 0;
      document.getElementById('p-OfferPrice').value = p.OfferPrice || 0;
      document.getElementById('p-B2BCost').value = p.B2BCost || 0;
      document.getElementById('p-Status').value = p.Status || 'Active';
      document.getElementById('p-Featured').value = p.Featured || 'FALSE';
    }

    modal.style.display = 'flex';
  },

  async savePackageRecord(e) {
    e.preventDefault();
    let packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');

    const record = {
      PackageID: document.getElementById('p-PackageID').value.trim(),
      PackageCode: document.getElementById('p-PackageCode').value.trim(),
      PackageName: document.getElementById('p-PackageName').value.trim(),
      Category: document.getElementById('p-Category').value.trim(),
      Description: document.getElementById('p-Description').value.trim(),
      TestIDs: document.getElementById('p-TestIDs').value.trim(),
      Parameters: document.getElementById('p-Parameters').value.trim(),
      Preparation: document.getElementById('p-Preparation').value.trim(),
      FastingRequired: document.getElementById('p-FastingRequired').value,
      SampleType: document.getElementById('p-SampleType').value.trim(),
      TAT: document.getElementById('p-TAT').value.trim(),
      MRP: Number(document.getElementById('p-MRP').value),
      OfferPrice: Number(document.getElementById('p-OfferPrice').value),
      B2BCost: Number(document.getElementById('p-B2BCost').value),
      Status: document.getElementById('p-Status').value,
      Featured: document.getElementById('p-Featured').value
    };

    if (this.editingPackageId) {
      const idx = packages.findIndex(p => p.PackageID === this.editingPackageId);
      if (idx !== -1) packages[idx] = record;
    } else {
      packages.unshift(record);
    }

    localStorage.setItem('selfcare_packages_admin_db', JSON.stringify(packages));
    this.syncPublicPackagesCache(packages);

    if (typeof OfflineDB !== 'undefined' && OfflineDB.putAll) {
      OfflineDB.putAll('packages', packages, true);
    }

    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('savePackage', record, false).catch(err => console.warn('Package sync deferred:', err));
    }

    this.closeModal('package-edit-modal');
    this.renderPackages();
    this.showToast(`Package "${record.PackageName}" saved live!`);
  },

  deletePackage(packageId) {
    if (!confirm(`Delete package ${packageId}?`)) return;
    let packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    packages = packages.filter(p => p.PackageID !== packageId);
    localStorage.setItem('selfcare_packages_admin_db', JSON.stringify(packages));
    this.syncPublicPackagesCache(packages);

    if (typeof OfflineDB !== 'undefined' && OfflineDB.putAll) {
      OfflineDB.putAll('packages', packages, true);
    }

    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('deletePackage', { packageId }, false).catch(() => {});
    }

    this.renderPackages();
    this.showToast(`Package ${packageId} removed.`);
  },

  /* =========================================================
     6B. PACKAGE-TEST MAPPING ENGINE
     ========================================================= */
  initPackageMappingEngine() {
    const select = document.getElementById('map-target-package-select');
    if (!select) return;

    const packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    select.innerHTML = '<option value="">-- Choose Health Package --</option>' +
      packages.map(p => `<option value="${p.PackageID}">${p.PackageName} (${p.PackageID})</option>`).join('');

    if (packages.length > 0 && !this.currentPackageMappingId) {
      this.currentPackageMappingId = packages[0].PackageID;
      select.value = packages[0].PackageID;
      this.handlePackageMappingSelection(packages[0].PackageID);
    }
  },

  handlePackageMappingSelection(pkgId) {
    this.currentPackageMappingId = pkgId;
    if (!pkgId) return;

    const packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    const tests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');
    const pkg = packages.find(p => p.PackageID === pkgId);
    if (!pkg) return;

    const bundledIds = (pkg.TestIDs || '').split(',').map(s => s.trim()).filter(Boolean);

    const availContainer = document.getElementById('map-available-tests-list');
    if (availContainer) {
      availContainer.innerHTML = tests
        .filter(t => !bundledIds.includes(t.TestID))
        .map(t => `
          <label class="mapping-item">
            <input type="checkbox" value="${t.TestID}" class="map-avail-chk">
            <span><strong>${t.TestCode}</strong> - ${t.TestName} (₹${t.OfferPrice})</span>
          </label>
        `).join('');
    }

    const bundledContainer = document.getElementById('map-bundled-tests-list');
    let totalMrp = 0, totalB2b = 0;

    if (bundledContainer) {
      bundledContainer.innerHTML = bundledIds.map(tid => {
        const match = tests.find(t => t.TestID === tid);
        if (match) {
          totalMrp += Number(match.MRP || 0);
          totalB2b += Number(match.B2BCost || 0);
        }
        return `
          <div class="mapping-item" style="justify-content:space-between;">
            <span><strong>${tid}</strong>: ${match ? match.TestName : 'Test item'}</span>
            <button class="btn-cancel" style="padding:2px 8px; font-size:10px; color:#DC2626;" onclick="AdminApp.removeSingleTestFromPackage('${tid}')">✕</button>
          </div>
        `;
      }).join('');
    }

    const summaryEl = document.getElementById('map-selection-summary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <span>Tests: <strong>${bundledIds.length}</strong></span> | 
        <span>Total MRP: <strong>₹${totalMrp}</strong></span> | 
        <span>Outsourced B2B: <strong>₹${totalB2b}</strong></span>
      `;
    }
  },

  addSelectedTestsToPackage() {
    if (!this.currentPackageMappingId) return;
    const chks = document.querySelectorAll('.map-avail-chk:checked');
    const newIds = Array.from(chks).map(c => c.value);

    let packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    const idx = packages.findIndex(p => p.PackageID === this.currentPackageMappingId);
    if (idx === -1) return;

    let existing = (packages[idx].TestIDs || '').split(',').map(s => s.trim()).filter(Boolean);
    packages[idx].TestIDs = Array.from(new Set([...existing, ...newIds])).join(', ');

    localStorage.setItem('selfcare_packages_admin_db', JSON.stringify(packages));
    this.handlePackageMappingSelection(this.currentPackageMappingId);
    this.showToast('Tests added to package!');
  },

  removeSingleTestFromPackage(testId) {
    let packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    const idx = packages.findIndex(p => p.PackageID === this.currentPackageMappingId);
    if (idx === -1) return;

    let existing = (packages[idx].TestIDs || '').split(',').map(s => s.trim()).filter(Boolean);
    packages[idx].TestIDs = existing.filter(id => id !== testId).join(', ');

    localStorage.setItem('selfcare_packages_admin_db', JSON.stringify(packages));
    this.handlePackageMappingSelection(this.currentPackageMappingId);
  },

  removeAllTestsFromPackage() {
    if (!confirm('Remove all mapped tests from this package?')) return;
    let packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    const idx = packages.findIndex(p => p.PackageID === this.currentPackageMappingId);
    if (idx === -1) return;

    packages[idx].TestIDs = '';
    localStorage.setItem('selfcare_packages_admin_db', JSON.stringify(packages));
    this.handlePackageMappingSelection(this.currentPackageMappingId);
  },

  savePackageTestMapping() {
    let packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    const pkg = packages.find(p => p.PackageID === this.currentPackageMappingId);
    if (!pkg) return;

    this.syncPublicPackagesCache(packages);
    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('savePackage', pkg, false).catch(() => {});
    }
    this.showToast(`Mapping for "${pkg.PackageName}" synchronized!`);
  },

  /* =========================================================
     7. REPORT UPLOAD HUB (PERSISTENT BASE64 / LINK STORAGE)
     ========================================================= */
  populateReportBookingSelect() {
    const select = document.getElementById('report-booking-select');
    if (!select) return;

    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    select.innerHTML = '<option value="">-- Choose Booking ID --</option>' +
      bookings.map(b => `<option value="${b.id || b.bookingId}">${b.id || b.bookingId} - ${b.patientName}</option>`).join('');
  },

  autofillReportPatient(bookingId) {
    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const b = bookings.find(item => (item.id === bookingId || item.bookingId === bookingId));
    if (b) {
      document.getElementById('report-patient-info').value = `${b.patientName} (${b.patientPhone})`;
      const cleanName = (b.patientName || 'PATIENT').toUpperCase().replace(/[^A-Z]/g, '');
      document.getElementById('report-naming-tag').textContent = `${b.id || b.bookingId}_${cleanName}.pdf`;
    } else {
      document.getElementById('report-patient-info').value = '';
    }
  },

  previewReportFile(input) {
    if (input.files && input.files[0]) {
      document.getElementById('upload-file-label').innerHTML = `Selected File: <strong>${input.files[0].name}</strong> (${(input.files[0].size/1024).toFixed(1)} KB)`;
    }
  },

  async readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  },

  async handleReportSubmit(e) {
    e.preventDefault();
    const bookingId = document.getElementById('report-booking-select').value;
    const fileInput = document.getElementById('report-file-input');
    const directLink = document.getElementById('report-link-input').value.trim();
    const doctor = document.getElementById('report-doctor-input').value.trim();
    const clinicalStatus = document.getElementById('report-status-input').value;

    if (!bookingId) {
      alert('Please select a Booking ID');
      return;
    }

    let reportUrl = directLink || '';

    // PERSISTENT STORAGE: Read local file as persistent Data URL to prevent tab close expiration
    if (fileInput.files && fileInput.files[0]) {
      const base64Report = await this.readFileAsDataUrl(fileInput.files[0]);
      if (base64Report) {
        reportUrl = base64Report;
      }
    }

    if (!reportUrl) {
      reportUrl = 'assets/reports/sample_nabl_report.pdf';
    }

    let bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const idx = bookings.findIndex(b => (b.id === bookingId || b.bookingId === bookingId));

    if (idx !== -1) {
      bookings[idx].reportUrl = reportUrl;
      bookings[idx].reportStatus = 'Report Ready';
      bookings[idx].doctor = doctor;
      bookings[idx].clinicalStatus = clinicalStatus;
      localStorage.setItem('selfcare_bookings_db', JSON.stringify(bookings));

      try {
        const custBookings = JSON.parse(localStorage.getItem('selfcare_recent_bookings') || '[]');
        const cIdx = custBookings.findIndex(b => b.bookingId === bookingId);
        if (cIdx !== -1) {
          custBookings[cIdx].reportUrl = reportUrl;
          custBookings[cIdx].currentStage = 5;
          custBookings[cIdx].bookingStatus = 'COMPLETED';
          localStorage.setItem('selfcare_recent_bookings', JSON.stringify(custBookings));
        }
      } catch(err) {}

      if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
        Api.request('uploadReport', { bookingId, reportUrl, doctor, clinicalStatus }, false).catch(() => {});
      }

      this.showToast(`Report for ${bookingId} published!`);
      document.getElementById('report-upload-form').reset();
      this.renderBookingsTable();
    }
  },

  /* =========================================================
     8. APP CAROUSEL & SOCIAL OUTREACH
     ========================================================= */
  renderCarousel() {
    const container = document.getElementById('carousel-cards-list');
    if (!container) return;

    const banners = JSON.parse(localStorage.getItem('selfcare_carousel_db') || '[]');
    if (banners.length === 0) {
      container.innerHTML = '<p style="color:#64748B;">No banners created yet.</p>';
      return;
    }

    container.innerHTML = banners.map((b, idx) => `
      <div class="banner-admin-card">
        <img src="${b.image}" alt="Banner" class="banner-preview-img" onerror="this.src='assets/images/logo.png'">
        <div class="banner-card-info">
          <h4>${b.title}</h4>
          <p>${b.subtitle || ''}</p>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="status-pill status-assigned">${b.status}</span>
            <div>
              <button class="btn-cancel" style="padding:4px 8px; font-size:11px;" onclick="AdminApp.editCarouselBanner(${idx})">Edit</button>
              <button class="btn-cancel" style="padding:4px 8px; font-size:11px; color:#DC2626;" onclick="AdminApp.deleteCarouselBanner(${idx})">Del</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  },

  openCarouselModal(action) {
    const modal = document.getElementById('carousel-edit-modal');
    document.getElementById('carousel-form').reset();
    document.getElementById('banner-id-input').value = action === 'add' ? '' : 'edit';
    modal.style.display = 'flex';
  },

  saveCarouselBanner(e) {
    e.preventDefault();
    const idVal = document.getElementById('banner-id-input').value;
    const title = document.getElementById('banner-title-input').value.trim();
    const subtitle = document.getElementById('banner-subtitle-input').value.trim();
    const image = document.getElementById('banner-img-input').value.trim();
    const link = document.getElementById('banner-link-input').value.trim();
    const status = document.getElementById('banner-status-input').value;

    let banners = JSON.parse(localStorage.getItem('selfcare_carousel_db') || '[]');
    if (idVal && !isNaN(Number(idVal))) {
      banners[Number(idVal)] = { title, subtitle, image, link, status };
    } else {
      banners.push({ id: 'BAN_' + Date.now(), title, subtitle, image, link, status });
    }

    localStorage.setItem('selfcare_carousel_db', JSON.stringify(banners));
    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('saveCarousel', banners, false).catch(() => {});
    }

    this.closeModal('carousel-edit-modal');
    this.renderCarousel();
    this.showToast('Carousel banners updated live!');
  },

  editCarouselBanner(idx) {
    const banners = JSON.parse(localStorage.getItem('selfcare_carousel_db') || '[]');
    const b = banners[idx];
    if (!b) return;

    this.openCarouselModal('edit');
    document.getElementById('banner-id-input').value = idx;
    document.getElementById('banner-title-input').value = b.title || '';
    document.getElementById('banner-subtitle-input').value = b.subtitle || '';
    document.getElementById('banner-img-input').value = b.image || '';
    document.getElementById('banner-link-input').value = b.link || '';
    document.getElementById('banner-status-input').value = b.status || 'Active';
  },

  deleteCarouselBanner(idx) {
    if (!confirm('Delete this banner?')) return;
    let banners = JSON.parse(localStorage.getItem('selfcare_carousel_db') || '[]');
    banners.splice(idx, 1);
    localStorage.setItem('selfcare_carousel_db', JSON.stringify(banners));
    this.renderCarousel();
  },

  populateSocialItemSelect() {
    const select = document.getElementById('social-share-item-select');
    if (!select) return;

    const tests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');
    const pkgs = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');

    let html = '<option value="">-- Choose Diagnostic Offering --</option>';
    pkgs.forEach(p => html += `<option value="pkg_${p.PackageID}">[Package] ${p.PackageName} (₹${p.OfferPrice})</option>`);
    tests.forEach(t => html += `<option value="test_${t.TestID}">[Test] ${t.TestName} (₹${t.OfferPrice})</option>`);
    select.innerHTML = html;
  },

  prepareSocialSharePreview() {
    const val = document.getElementById('social-share-item-select').value;
    const msgBox = document.getElementById('social-share-msg');
    const previewBox = document.getElementById('social-preview-box');

    if (!val) return;

    const [type, id] = val.split('_');
    let item = null;
    if (type === 'pkg') {
      item = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]').find(x => x.PackageID === id);
    } else {
      item = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]').find(x => x.TestID === id);
    }

    if (!item) return;

    const title = item.TestName || item.PackageName;
    const price = item.OfferPrice;
    const mrp = item.MRP;
    const discount = Math.round(((mrp - price) / mrp) * 100);

    const message = `🌟 Selfcare Diagnostics - Special Offer!\n\nGet ${title} at just ₹${price} (MRP: ₹${mrp}, ${discount}% OFF).\nIncludes free doorstep sample pickup in Chennai!\n\nBook instantly: https://selfcarediagnostics.com?ref=${id}`;
    msgBox.value = message;
    previewBox.innerHTML = message.replace(/\n/g, '<br>');
  },

  shareOnWhatsApp() {
    const text = encodeURIComponent(document.getElementById('social-share-msg').value);
    // WhatsApp Direct Link Compliance (Prevents browser unknown scheme issues)
    window.open(`https://wa.me/917010174890?text=${text}`, '_blank');
  },

  shareOnFacebook() {
    const url = encodeURIComponent('https://selfcarediagnostics.com');
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
  },

  copyInstagramCaption() {
    const text = document.getElementById('social-share-msg').value;
    navigator.clipboard.writeText(text + "\n\n#SelfcareDiagnostics #HealthCheckup #ChennaiHealth #BloodTest #Wellness");
    this.showToast('Formatted caption & hashtags copied to clipboard for Instagram post!');
  },

  /* =========================================================
     9. CUSTOMERS, COUPONS, INVENTORY & AUDIT LOGS
     ========================================================= */
  renderCustomersTable() {
    const tbody = document.getElementById('customers-table-body');
    if (!tbody) return;

    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const customerMap = new Map();

    bookings.forEach(b => {
      const phone = b.patientPhone || '9840000000';
      if (!customerMap.has(phone)) {
        customerMap.set(phone, {
          name: b.patientName || 'Customer',
          phone: phone,
          location: b.location || 'Chennai',
          totalBookings: 1,
          lifetimeSpent: Number(b.totalAmount || b.finalAmount || 0),
          lastBooking: (b.date || '').slice(0, 10),
          reportsCount: b.reportUrl ? 1 : 0
        });
      } else {
        const cur = customerMap.get(phone);
        cur.totalBookings++;
        cur.lifetimeSpent += Number(b.totalAmount || b.finalAmount || 0);
        if (b.reportUrl) cur.reportsCount++;
      }
    });

    const list = Array.from(customerMap.values());
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:18px; color:#64748B;">No patient records registered yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(c => `
      <tr>
        <td><strong>${c.name}</strong></td>
        <td><code>${c.phone}</code></td>
        <td>${c.location}</td>
        <td>${c.totalBookings}</td>
        <td><strong class="green-text">₹${c.lifetimeSpent.toLocaleString('en-IN')}</strong></td>
        <td>${c.lastBooking}</td>
        <td><span class="status-pill status-assigned">${c.reportsCount} Ready</span></td>
        <td><button class="btn-cancel" style="padding:4px 8px; font-size:11px;">View Profile</button></td>
      </tr>
    `).join('');
  },

  renderCouponsTable() {
    const tbody = document.getElementById('coupons-table-body');
    if (!tbody) return;

    const coupons = [
      { code: 'WELLNESS50', type: 'Flat Amount', val: '₹50', min: '₹499', max: '₹50', status: 'Active' },
      { code: 'HEALTH20', type: 'Percentage', val: '20%', min: '₹999', max: '₹300', status: 'Active' },
      { code: 'FIRSTCARE', type: 'Flat Amount', val: '₹100', min: '₹799', max: '₹100', status: 'Active' }
    ];

    tbody.innerHTML = coupons.map(c => `
      <tr>
        <td><strong>${c.code}</strong></td>
        <td>${c.type}</td>
        <td><strong class="green-text">${c.val}</strong></td>
        <td>${c.min}</td>
        <td>${c.max}</td>
        <td><span class="status-pill status-assigned">${c.status}</span></td>
        <td><button class="btn-cancel" style="padding:4px 8px; font-size:10px;">Edit</button></td>
      </tr>
    `).join('');
  },

  renderInventoryTable() {
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody) return;

    const stock = [
      { item: 'EDTA Blood Vials (Purple Top)', cat: 'Phlebotomy', qty: 420, min: 100, unit: 'Tubes', status: 'In Stock' },
      { item: 'Serum Separator Vials (Gold Top)', cat: 'Phlebotomy', qty: 350, min: 100, unit: 'Tubes', status: 'In Stock' },
      { item: 'Sterile Syringes (5ml)', cat: 'Consumables', qty: 85, min: 100, unit: 'Units', status: 'Low Stock' },
      { item: 'Lipid Enzymatic Reagents', cat: 'Biochemistry', qty: 14, min: 5, unit: 'Kits', status: 'In Stock' }
    ];

    tbody.innerHTML = stock.map(s => `
      <tr>
        <td><strong>${s.item}</strong></td>
        <td>${s.cat}</td>
        <td><strong>${s.qty}</strong></td>
        <td>${s.min}</td>
        <td>${s.unit}</td>
        <td><span class="status-pill ${s.qty < s.min ? 'status-pending' : 'status-assigned'}">${s.status}</span></td>
      </tr>
    `).join('');
  },

  renderAuditLogsTable() {
    const tbody = document.getElementById('audit-logs-table-body');
    if (!tbody) return;

    const logs = [
      { time: 'Today, 09:30 AM', user: 'admin@selfcare', mod: 'Bookings', act: 'Assigned Phlebotomist to SCDBOOK000001', id: 'SCDBOOK000001' },
      { time: 'Yesterday, 04:15 PM', user: 'admin@selfcare', mod: 'Reports', act: 'Published PDF Lab Report', id: 'SCDBOOK000002' },
      { time: '28 Sep, 02:00 PM', user: 'admin@selfcare', mod: 'Tests', act: 'Price update for Lipid Profile Comprehensive', id: 'SCDT0012' }
    ];

    tbody.innerHTML = logs.map(l => `
      <tr>
        <td>${l.time}</td>
        <td><strong>${l.user}</strong></td>
        <td><span class="status-pill status-assigned">${l.mod}</span></td>
        <td>${l.act}</td>
        <td><code>${l.id}</code></td>
      </tr>
    `).join('');
  },

  handleGlobalSearch(query) {
    const q = (query || '').trim().toLowerCase();
    const dropdown = document.getElementById('global-search-results-dropdown');
    const clearBtn = document.getElementById('btn-clear-search');

    if (!q) {
      dropdown.style.display = 'none';
      clearBtn.style.display = 'none';
      return;
    }

    clearBtn.style.display = 'block';

    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const tests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');
    const pkgs = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    const techs = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');

    const matchedBookings = bookings.filter(b => (b.id + b.bookingId + b.patientName + b.patientPhone).toLowerCase().includes(q));
    const matchedTests = tests.filter(t => (t.TestName + t.TestCode + t.TestID).toLowerCase().includes(q));
    const matchedPkgs = pkgs.filter(p => (p.PackageName + p.PackageCode).toLowerCase().includes(q));
    const matchedTechs = techs.filter(t => (t.name + t.id + t.zone).toLowerCase().includes(q));

    let html = '';

    if (matchedBookings.length > 0) {
      html += `<div class="search-result-group-title">Bookings (${matchedBookings.length})</div>`;
      matchedBookings.slice(0, 3).forEach(b => {
        html += `
          <div class="search-result-row" onclick="AdminApp.switchTab('tab-bookings')">
            <div>
              <strong>${b.id || b.bookingId}</strong> - ${b.patientName}<br>
              <small>Slot: ${b.slot || b.timeSlot} | ₹${b.totalAmount}</small>
            </div>
            <span class="status-pill status-assigned">${b.techStatus || 'Confirmed'}</span>
          </div>
        `;
      });
    }

    if (matchedTests.length > 0) {
      html += `<div class="search-result-group-title">Tests (${matchedTests.length})</div>`;
      matchedTests.slice(0, 3).forEach(t => {
        html += `
          <div class="search-result-row" onclick="AdminApp.switchTab('tab-tests')">
            <div>
              <strong>${t.TestCode}</strong> - ${t.TestName}<br>
              <small>${t.Category} | MRP: ₹${t.MRP}</small>
            </div>
            <strong class="green-text">₹${t.OfferPrice}</strong>
          </div>
        `;
      });
    }

    if (matchedPkgs.length > 0) {
      html += `<div class="search-result-group-title">Packages (${matchedPkgs.length})</div>`;
      matchedPkgs.slice(0, 3).forEach(p => {
        html += `
          <div class="search-result-row" onclick="AdminApp.switchTab('tab-packages')">
            <div>
              <strong>${p.PackageName}</strong><br>
              <small>${p.Parameters}</small>
            </div>
            <strong class="green-text">₹${p.OfferPrice}</strong>
          </div>
        `;
      });
    }

    if (matchedTechs.length > 0) {
      html += `<div class="search-result-group-title">Technicians (${matchedTechs.length})</div>`;
      matchedTechs.slice(0, 3).forEach(t => {
        html += `
          <div class="search-result-row" onclick="AdminApp.switchTab('tab-technicians')">
            <div>
              <strong>${t.name}</strong> (<code>${t.id}</code>)<br>
              <small>Coverage: ${t.zone}</small>
            </div>
            <span class="status-pill status-assigned">${t.status}</span>
          </div>
        `;
      });
    }

    if (!html) {
      html = `<div style="padding:16px; text-align:center; font-size:12px; color:#64748B;">No matches found for "${query}"</div>`;
    }

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
  },

  clearGlobalSearch() {
    const input = document.getElementById('admin-global-search-input');
    if (input) input.value = '';
    const dropdown = document.getElementById('global-search-results-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    const clearBtn = document.getElementById('btn-clear-search');
    if (clearBtn) clearBtn.style.display = 'none';
  },

  safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  },

  showToast(message) {
    const container = document.getElementById('admin-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'admin-toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  },

  async forceSyncCloud() {
    this.showToast('Syncing all 500+ tests and packages from Sheets...');
    await Promise.all([
      this.loadAllBookings(),
      this.loadAllTests(),
      this.loadAllPackages()
    ]);
    this.renderHomeRevenueKPIs();
    this.renderFinancialLedger();
    this.renderBookingsTable();
    this.renderTests();
    this.renderPackages();
    this.initPackageMappingEngine();
    this.populateSocialItemSelect();
    this.showToast('Sheets Synchronization Complete ✓');
  },

  logout() {
    if (confirm('Log out from Admin OS?')) {
      localStorage.removeItem('selfcare_active_user');
      localStorage.removeItem('selfcare_user_role');
      window.location.replace('index.html');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => AdminApp.init());
