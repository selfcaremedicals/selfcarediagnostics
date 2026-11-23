/* file: assets/js/admin.js */
/**
 * Selfcare Diagnostics - Master Admin Operating System v9.0.0
 * Features:
 * - Zero-Trash Clean Architecture.
 * - Live Customer Directory showing Login ID, Password, Bookings Count & Spend.
 * - Complete Bookings Ledger with MRP, Customer Price, B2B Lab Cost & Net Profit.
 * - Unified Technician & Captain Credential Engine (Works on both technician.html & home-collection.html).
 */

const AdminApp = {
  currentAssignBookingId: null,
  editingTestId: null,
  editingPackageId: null,
  currentFinancialPeriod: 'all',
  currentChartPeriod: '7days',
  currentPackageMappingId: null,

  async init() {
    this.seedDefaultDataIfEmpty();
    this.initCurrentDateLabel();

    // Instant cache render
    this.renderHomeRevenueKPIs();
    this.renderTests();
    this.renderPackages();
    this.renderBookingsTable();
    this.renderCustomersTable();
    this.renderTechnicians();

    // Cloud Sync from Google Sheets
    await Promise.all([
      this.loadAllBookings(),
      this.loadAllCustomers(),
      this.loadAllTests(),
      this.loadAllPackages(),
      this.loadAllTechnicians()
    ]);

    this.renderHomeRevenueKPIs();
    this.renderRevenueChart(this.currentChartPeriod);
    this.renderFinancialLedger();
    this.renderBookingsTable();
    this.renderCustomersTable();
    this.renderTechnicians();
    this.renderTests();
    this.renderPackages();
    this.renderCarousel();
    this.populateReportBookingSelect();
    this.initPackageMappingEngine();
    this.populateSocialItemSelect();
  },

  initCurrentDateLabel() {
    const el = document.getElementById('home-current-date');
    if (el) {
      el.textContent = new Date().toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
      });
    }
  },

  seedDefaultDataIfEmpty() {
    if (!localStorage.getItem('selfcare_technicians')) {
      const initialTechs = [
        {
          id: 'TechlabDesk',
          captainId: 'TechlabDesk',
          name: 'Mohamed Adamkani',
          phone: '7010174890',
          mobile: '7010174890',
          zone: 'Vettuvankeni, ECR & OMR (10 km)',
          pass: 'Admin@123',
          password: 'Admin@123',
          upiId: '',
          status: 'Active',
          active: true
        }
      ];
      this.syncDualStaffStorage(initialTechs);
    }
  },

  /**
   * Synchronizes Technician / Captain records across both keys so
   * Technician Lab Desk (technician.html) & Home Collection App (home-collection.html)
   * share the exact same ID, Password, Location & Details.
   */
  syncDualStaffStorage(staffList) {
    const normalized = (staffList || []).map(t => ({
      id: String(t.id || t.captainId || '').trim(),
      captainId: String(t.id || t.captainId || '').trim(),
      name: String(t.name || t.captainName || '').trim(),
      phone: String(t.phone || t.mobile || '').trim(),
      mobile: String(t.phone || t.mobile || '').trim(),
      zone: String(t.zone || 'Vettuvankeni, ECR & OMR').trim(),
      pass: String(t.pass || t.password || '').trim(),
      password: String(t.pass || t.password || '').trim(),
      upiId: String(t.upiId || '').trim(),
      status: t.status || 'Active',
      active: (t.status || 'Active') === 'Active'
    }));
    localStorage.setItem('selfcare_technicians', JSON.stringify(normalized));
    localStorage.setItem('selfcare_admin_captains', JSON.stringify(normalized));
  },

  /* =========================================================
     CLOUD DATA LOADERS (BOOKINGS, CUSTOMERS, STAFF, CATALOG)
     ========================================================= */
  async loadAllBookings() {
    let allBookings = [];

    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      try {
        const res = await Api.request('getAllBookings', {}, false);
        const list = res?.bookings || res?.data || (Array.isArray(res) ? res : []);
        if (Array.isArray(list) && list.length > 0) {
          allBookings = list;
        }
      } catch (err) {}
    }

    try {
      const sources = [
        'selfcare_bookings_db',
        'selfcare_recent_bookings',
        'selfcare_user_bookings',
        'selfcare_pending_sync'
      ];
      const mergedMap = new Map();
      allBookings.forEach(b => {
        const id = b.bookingId || b.id;
        if (id) mergedMap.set(id, b);
      });

      sources.forEach(key => {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(arr)) {
          arr.forEach(b => {
            const id = b.bookingId || b.id;
            if (id && !mergedMap.has(id)) {
              mergedMap.set(id, {
                ...b,
                id: id,
                bookingId: id,
                patientName: b.patientName || 'Customer',
                patientPhone: b.patientPhone || '-',
                location: b.address || b.location || 'Chennai',
                mode: b.collectionType === 'lab' ? 'Lab Walk-in' : 'Home Collection',
                slot: `${b.collectionDate || 'Today'} (${b.timeSlot || 'Slot'})`,
                totalAmount: Number(b.finalAmount || b.totalAmount || 0),
                paymentStatus: b.paymentStatus || b.paymentMode || 'CONFIRMED',
                techStatus: b.assignedTechName ? `Assigned to ${b.assignedTechName}` : (b.techStatus || 'Unassigned'),
                date: b.createdAt || b.updatedAt || b.collectionDate || new Date().toISOString()
              });
            }
          });
        }
      });

      allBookings = Array.from(mergedMap.values());
      localStorage.setItem('selfcare_bookings_db', JSON.stringify(allBookings));
    } catch (e) {}

    return allBookings;
  },

  async loadAllCustomers() {
    let cloudCustomers = [];
    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      try {
        const res = await Api.request('getAllCustomers', {}, false);
        const list = res?.customers || res?.users || res?.data || (Array.isArray(res) ? res : []);
        if (Array.isArray(list)) cloudCustomers = list;
      } catch (e) {}
    }

    const custMap = new Map();

    // 1. Merge from Backend Customers / Users sheet
    cloudCustomers.forEach(u => {
      const phone = String(u.phone || u.mobile || u.userId || '').replace(/\D/g, '').slice(-10);
      const key = phone || u.email || u.userId;
      if (!key) return;
      custMap.set(key, {
        customerId: u.userId || u.customerId || `CUST${phone.slice(-4) || '01'}`,
        name: u.name || u.fullName || 'Customer',
        phone: phone || u.userId || '-',
        password: u.password || u.pass || '—',
        address: u.address || u.city || 'Chennai',
        lastActive: u.lastLogin || u.updatedAt || u.createdAt || 'Active'
      });
    });

    // 2. Merge from Local User Auth & Registered Users Storage
    try {
      const localUsers = JSON.parse(localStorage.getItem('selfcare_users_db') || localStorage.getItem('selfcare_registered_users') || '[]');
      if (Array.isArray(localUsers)) {
        localUsers.forEach(u => {
          const phone = String(u.phone || u.mobile || '').replace(/\D/g, '').slice(-10);
          if (!phone) return;
          const prev = custMap.get(phone) || {};
          custMap.set(phone, {
            customerId: u.userId || prev.customerId || `CUST${phone.slice(-4)}`,
            name: u.name || prev.name || 'Customer',
            phone,
            password: u.password || u.pass || prev.password || '—',
            address: u.address || prev.address || 'Chennai',
            lastActive: u.lastLogin || prev.lastActive || 'Active'
          });
        });
      }

      const activeUserRaw = localStorage.getItem('selfcare_active_user');
      if (activeUserRaw) {
        const au = JSON.parse(activeUserRaw);
        const phone = String(au.phone || au.mobile || '').replace(/\D/g, '').slice(-10);
        if (phone) {
          const prev = custMap.get(phone) || {};
          custMap.set(phone, {
            customerId: au.userId || prev.customerId || `CUST${phone.slice(-4)}`,
            name: au.name || prev.name || 'Customer',
            phone,
            password: au.password || prev.password || '—',
            address: au.address || prev.address || 'Chennai',
            lastActive: 'Online Now'
          });
        }
      }
    } catch (e) {}

    // 3. Cross-reference Bookings to attach Customer booking counts & any guest bookers
    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    bookings.forEach(b => {
      const phone = String(b.patientPhone || '').replace(/\D/g, '').slice(-10);
      if (!phone) return;
      if (!custMap.has(phone)) {
        custMap.set(phone, {
          customerId: b.userId || `CUST${phone.slice(-4)}`,
          name: b.patientName || 'Customer',
          phone,
          password: b.userPassword || 'OTP / Guest',
          address: b.address || b.location || 'Chennai',
          lastActive: (b.date || '').slice(0, 10)
        });
      }
    });

    const list = Array.from(custMap.values());
    localStorage.setItem('selfcare_admin_customers_cache', JSON.stringify(list));
    return list;
  },

  async syncCustomersFromCloud() {
    this.showToast('Syncing customer logins & bookings...');
    await Promise.all([this.loadAllCustomers(), this.loadAllBookings()]);
    this.renderCustomersTable();
    this.renderHomeRevenueKPIs();
    this.showToast('Customer IDs & Passwords updated ✓');
  },

  async loadAllTechnicians() {
    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      try {
        const res = await Api.request('getTechnicians', {}, false);
        const list = res?.technicians || res?.data || (Array.isArray(res) ? res : []);
        if (Array.isArray(list) && list.length > 0) {
          this.syncDualStaffStorage(list);
        }
      } catch (e) {}
    }
  },

  async loadAllTests() {
    let cloudTests = null;
    if (navigator.onLine && typeof Api !== 'undefined') {
      try {
        cloudTests = await Api.request('getAdminTests', {}, false).catch(() => null);
        if (!Array.isArray(cloudTests) || cloudTests.length === 0) {
          cloudTests = await Api.getTests?.();
        }
      } catch (err) {}
    }

    if (Array.isArray(cloudTests) && cloudTests.length > 0) {
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
    }
  },

  async loadAllPackages() {
    let cloudPkgs = null;
    if (navigator.onLine && typeof Api !== 'undefined') {
      try {
        cloudPkgs = await Api.request('getAdminPackages', {}, false).catch(() => null);
        if (!Array.isArray(cloudPkgs) || cloudPkgs.length === 0) {
          cloudPkgs = await Api.getPackages?.();
        }
      } catch (err) {}
    }

    if (Array.isArray(cloudPkgs) && cloudPkgs.length > 0) {
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
    }
  },

  /* =========================================================
     FINANCIAL CALCULATOR HELPER (MRP, B2B & NET PROFIT)
     ========================================================= */
  computeBookingFinancials(b, adminTests, adminPackages) {
    const rev = Number(b.totalAmount || b.finalAmount || 0);
    let orderMrp = Number(b.totalMrp || b.mrp || 0);
    let orderB2b = Number(b.b2bCost || 0);

    let items = b.items;
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch (e) { items = []; }
    }
    if (!Array.isArray(items)) items = [];

    if (orderMrp === 0 || orderB2b === 0) {
      let calcMrp = 0, calcB2b = 0;
      items.forEach(item => {
        const name = (item.name || item.TestName || item.PackageName || '').toLowerCase();
        const t = adminTests.find(x => x.TestName.toLowerCase() === name || x.TestID === item.id);
        const p = adminPackages.find(x => x.PackageName.toLowerCase() === name || x.PackageID === item.id);

        if (t) {
          calcMrp += Number(t.MRP || 0);
          calcB2b += Number(t.B2BCost || Math.round(t.OfferPrice * 0.35));
        } else if (p) {
          calcMrp += Number(p.MRP || 0);
          calcB2b += Number(p.B2BCost || Math.round(p.OfferPrice * 0.35));
        } else {
          const itemPrice = Number(item.price || 0);
          calcMrp += Number(item.mrp || Math.round(itemPrice * 1.4));
          calcB2b += Math.round(itemPrice * 0.35);
        }
      });
      if (orderMrp === 0) orderMrp = calcMrp;
      if (orderB2b === 0) orderB2b = calcB2b;
    }

    if (orderMrp < rev) orderMrp = Math.round(rev * 1.4);
    if (orderB2b === 0 && rev > 0) orderB2b = Math.round(rev * 0.35);

    const netProfit = Math.max(0, rev - orderB2b);
    return { mrp: orderMrp, revenue: rev, b2b: orderB2b, profit: netProfit, itemCount: items.length || 1 };
  },

  /* =========================================================
     DASHBOARD KPIs & SVG CHART
     ========================================================= */
  renderHomeRevenueKPIs() {
    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const customers = JSON.parse(localStorage.getItem('selfcare_admin_customers_cache') || '[]');
    const adminTests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');
    const adminPackages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    let allMrp = 0, allRev = 0, allB2b = 0;
    let todayRev = 0, todayMrp = 0, todayOrders = 0;
    let monthRev = 0, monthB2b = 0;
    let pendingPayments = 0, pendingOrders = 0;

    bookings.forEach(b => {
      const bDate = new Date(b.date || Date.now());
      const bDateStr = isNaN(bDate.getTime()) ? todayStr : bDate.toISOString().slice(0, 10);
      const fin = this.computeBookingFinancials(b, adminTests, adminPackages);

      allMrp += fin.mrp;
      allRev += fin.revenue;
      allB2b += fin.b2b;

      if (bDateStr === todayStr) {
        todayRev += fin.revenue;
        todayMrp += fin.mrp;
        todayOrders++;
      }

      if (!isNaN(bDate.getTime()) && bDate.getFullYear() === curYear && bDate.getMonth() === curMonth) {
        monthRev += fin.revenue;
        monthB2b += fin.b2b;
      }

      if (String(b.paymentStatus || '').toUpperCase().includes('PENDING')) {
        pendingPayments += fin.revenue;
        pendingOrders++;
      }
    });

    const allProfit = Math.max(0, allRev - allB2b);
    const monthProfit = Math.max(0, monthRev - monthB2b);
    const margin = allRev > 0 ? ((allProfit / allRev) * 100).toFixed(1) : 0;

    this.safeSetText('kpi-total-bookings-count', bookings.length.toLocaleString('en-IN'));
    this.safeSetText('kpi-today-orders-count', `${todayOrders} Bookings Today`);
    this.safeSetText('kpi-total-customers-count', customers.length.toLocaleString('en-IN'));
    this.safeSetText('kpi-all-mrp', `₹${allMrp.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-today-mrp-sub', `Today MRP: ₹${todayMrp.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-all-revenue', `₹${allRev.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-today-revenue', `Today: ₹${todayRev.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-all-b2b', `₹${allB2b.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-month-b2b', `This Month: ₹${monthB2b.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-all-profit', `₹${allProfit.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-profit-margin', `Net Margin: ${margin}%`);
    this.safeSetText('kpi-month-revenue', `₹${monthRev.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-month-profit', `Month Profit: ₹${monthProfit.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-pending-payments', `₹${pendingPayments.toLocaleString('en-IN')}`);
    this.safeSetText('kpi-pending-orders-count', `${pendingOrders} Uncollected`);
  },

  renderRevenueChart(period) {
    this.currentChartPeriod = period;
    ['today', '7days', '30days'].forEach(p => {
      document.getElementById(`chart-tab-${p}`)?.classList.toggle('active', p === period);
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
        labels.push(d.toLocaleDateString('en-IN', { weekday: 'short' }));
        const iso = d.toISOString().slice(0, 10);
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

    const barsSvg = labels.map((label, i) => {
      const val = dataPoints[i];
      const barHeight = Math.max(12, (val / maxVal) * 140);
      const x = (i * spacing) + (spacing / 2) - (barWidth / 2);
      const y = svgHeight - 40 - barHeight;
      return `
        <g>
          <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="8" fill="url(#revGrad)" />
          <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" fill="#045D49" font-size="11" font-weight="800">₹${val.toLocaleString('en-IN')}</text>
          <text x="${x + barWidth / 2}" y="${svgHeight - 15}" text-anchor="middle" fill="#64748B" font-size="11" font-weight="700">${label}</text>
        </g>
      `;
    }).join('');

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

  /* =========================================================
     FINANCIAL LEDGER (MRP vs CUSTOMER PRICE vs B2B vs PROFIT)
     ========================================================= */
  setFinancialPeriod(period) {
    this.currentFinancialPeriod = period;
    document.getElementById('btn-period-month')?.classList.toggle('active', period === 'month');
    document.getElementById('btn-period-all')?.classList.toggle('active', period === 'all');
    this.safeSetText('fin-profit-period-label', period === 'month' ? '(This Month)' : '(All Time)');
    this.renderFinancialLedger();
  },

  renderFinancialLedger() {
    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const adminTests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');
    const adminPackages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');

    const now = new Date();
    let totalMrp = 0, totalRevenue = 0, totalB2bCost = 0;
    const ledgerRows = [];

    bookings.forEach(b => {
      const bookingDate = new Date(b.date || Date.now());
      if (this.currentFinancialPeriod === 'month') {
        if (bookingDate.getFullYear() !== now.getFullYear() || bookingDate.getMonth() !== now.getMonth()) return;
      }

      const fin = this.computeBookingFinancials(b, adminTests, adminPackages);
      totalMrp += fin.mrp;
      totalRevenue += fin.revenue;
      totalB2bCost += fin.b2b;

      ledgerRows.push({
        id: b.id || b.bookingId,
        date: isNaN(bookingDate.getTime()) ? 'Today' : bookingDate.toLocaleDateString('en-GB'),
        patient: b.patientName || 'Customer',
        itemCount: `${fin.itemCount} Items`,
        mrp: fin.mrp,
        revenue: fin.revenue,
        b2b: fin.b2b,
        profit: fin.profit,
        status: b.techStatus || b.bookingStatus || 'Confirmed'
      });
    });

    const actualProfit = Math.max(0, totalRevenue - totalB2bCost);
    const profitMargin = totalRevenue > 0 ? ((actualProfit / totalRevenue) * 100).toFixed(1) : 0;

    this.safeSetText('fin-total-mrp', `₹${totalMrp.toLocaleString('en-IN')}`);
    this.safeSetText('fin-total-revenue', `₹${totalRevenue.toLocaleString('en-IN')}`);
    this.safeSetText('fin-total-b2b', `₹${totalB2bCost.toLocaleString('en-IN')}`);
    this.safeSetText('fin-actual-profit', `₹${actualProfit.toLocaleString('en-IN')}`);
    this.safeSetText('fin-margin-percentage', `Profit Margin: ${profitMargin}%`);

    const tbody = document.getElementById('finance-ledger-table-body');
    if (!tbody) return;

    if (ledgerRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color:#64748B;">No financial records found.</td></tr>`;
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

  /* =========================================================
     ALL BOOKINGS TABLE (WITH MRP, B2B & PROFIT PER ROW)
     ========================================================= */
  renderBookingsTable(filteredList = null) {
    const tableBody = document.getElementById('bookings-table-body');
    if (!tableBody) return;

    const allBookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const adminTests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');
    const adminPackages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    const bookings = filteredList || allBookings;

    this.safeSetText('bookings-total-badge', bookings.length);

    if (bookings.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:#64748B;">No bookings found.</td></tr>`;
      return;
    }

    tableBody.innerHTML = bookings.map(b => {
      const bId = b.id || b.bookingId;
      const fin = this.computeBookingFinancials(b, adminTests, adminPackages);
      const statusText = b.techStatus || 'Unassigned';
      let statusClass = 'status-pending';
      if (statusText.includes('Broadcasted')) statusClass = 'status-broadcast';
      if (statusText.includes('Assigned')) statusClass = 'status-assigned';

      return `
        <tr>
          <td><strong>${bId}</strong></td>
          <td>
            <strong>${b.patientName || 'Customer'}</strong><br>
            <span style="font-size:11px; color:#536E66;">${b.patientPhone || '-'}</span>
          </td>
          <td>
            <span style="font-size:11.5px;">${b.location || b.address || 'Chennai'}</span><br>
            <span class="status-pill status-broadcast" style="margin-top:3px;">${b.mode || 'Home Collection'}</span>
          </td>
          <td><span style="font-size:11.5px; font-weight:700;">${b.slot || b.timeSlot || 'Scheduled'}</span></td>
          <td>
            <div style="font-size:11px; line-height:1.45;">
              <span class="strikethrough">MRP: ₹${fin.mrp}</span> • <strong class="green-text">Price: ₹${fin.revenue}</strong><br>
              <span class="b2b-cell-text">B2B: ₹${fin.b2b}</span> • <strong style="color:#045D49;">Profit: +₹${fin.profit}</strong>
            </div>
          </td>
          <td><span style="font-size:11px; font-weight:800;">${b.paymentStatus || b.paymentMode || 'Confirmed'}</span></td>
          <td><span class="status-pill ${statusClass}">${statusText}</span></td>
          <td>
            ${b.reportUrl ? `<a href="${b.reportUrl}" target="_blank" style="color:#078866; font-weight:800; text-decoration:none;">📄 View PDF</a>` : `<span style="color:#94A3B8; font-size:11px;">Pending</span>`}
          </td>
          <td>
            <button class="btn-emerald-solid" style="padding:6px 10px; font-size:11px;" onclick="AdminApp.openAssignModal('${bId}')">
              📍 Assign
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filterBookingsByStatus(statusKey, btnEl) {
    document.querySelectorAll('.status-filter-scroll .filter-pill').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const todayStr = new Date().toISOString().slice(0, 10);

    let filtered = bookings;
    if (statusKey === 'home') {
      filtered = bookings.filter(b => (b.mode || '').toLowerCase().includes('home') || b.collectionType === 'home');
    } else if (statusKey === 'today') {
      filtered = bookings.filter(b => (b.date || '').slice(0, 10) === todayStr);
    } else if (statusKey === 'pending') {
      filtered = bookings.filter(b => (b.techStatus || '').includes('Unassigned'));
    } else if (statusKey === 'payment_pending') {
      filtered = bookings.filter(b => String(b.paymentStatus || '').toUpperCase().includes('PENDING') || String(b.paymentStatus || '').toUpperCase().includes('CASH'));
    } else if (statusKey === 'completed') {
      filtered = bookings.filter(b => (b.techStatus || '').toUpperCase() === 'COMPLETED' || b.reportUrl);
    }

    this.renderBookingsTable(filtered);
  },

  filterBookings() {
    const query = (document.getElementById('booking-search-input')?.value || '').toLowerCase();
    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const filtered = bookings.filter(b => `${b.id} ${b.bookingId} ${b.patientName} ${b.patientPhone}`.toLowerCase().includes(query));
    this.renderBookingsTable(filtered);
  },

  /* =========================================================
     CUSTOMERS DIRECTORY (ID, PASSWORD & BOOKING COUNT)
     ========================================================= */
  renderCustomersTable(query = '') {
    const tbody = document.getElementById('customers-table-body');
    if (!tbody) return;

    const customers = JSON.parse(localStorage.getItem('selfcare_admin_customers_cache') || '[]');
    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');

    const enriched = customers.map(c => {
      const phoneClean = String(c.phone || '').replace(/\D/g, '').slice(-10);
      const userBookings = bookings.filter(b => String(b.patientPhone || '').replace(/\D/g, '').slice(-10) === phoneClean);
      const totalSpent = userBookings.reduce((sum, b) => sum + Number(b.totalAmount || b.finalAmount || 0), 0);
      return {
        ...c,
        bookingCount: userBookings.length,
        totalSpent
      };
    }).filter(c => {
      if (!query) return true;
      return `${c.customerId} ${c.name} ${c.phone} ${c.address}`.toLowerCase().includes(query.toLowerCase());
    });

    this.safeSetText('customers-total-badge', enriched.length);

    if (enriched.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#64748B;">No customer logins recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = enriched.map(c => `
      <tr>
        <td><code>${c.customerId}</code></td>
        <td><strong>${c.name}</strong></td>
        <td><strong>${c.phone}</strong></td>
        <td><code style="background:#FEF3C7; color:#92400E; padding:3px 8px; border-radius:6px; font-weight:800;">${c.password}</code></td>
        <td>${c.address}</td>
        <td><span class="status-pill status-assigned">${c.bookingCount} Bookings</span></td>
        <td><strong class="green-text">₹${c.totalSpent.toLocaleString('en-IN')}</strong></td>
        <td><span style="font-size:11px; color:#64748B;">${c.lastActive}</span></td>
      </tr>
    `).join('');
  },

  filterCustomers(val) {
    this.renderCustomersTable(val);
  },

  /* =========================================================
     UNIFIED TECHNICIAN & CAPTAIN MANAGEMENT
     ========================================================= */
  openAssignModal(bookingId) {
    this.currentAssignBookingId = bookingId;
    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const b = bookings.find(item => (item.id === bookingId || item.bookingId === bookingId));
    if (!b) return;

    document.getElementById('assign-booking-details').innerHTML = `
      <strong>Booking ID: ${b.id || b.bookingId}</strong> | Patient: <strong>${b.patientName}</strong> (${b.patientPhone})<br>
      📍 Address: ${b.location || b.address}
    `;

    const techs = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');
    const select = document.getElementById('modal-select-particular-tech');
    select.innerHTML = techs.map(t => `<option value="${t.id}">${t.name} [ID: ${t.id}] - ${t.zone}</option>`).join('');

    this.toggleAssignMode('particular');
    document.querySelector('input[name="assign_type"][value="particular"]').checked = true;
    document.getElementById('assign-tech-modal').style.display = 'flex';
  },

  toggleAssignMode(mode) {
    document.getElementById('particular-tech-select-wrap').style.display = mode === 'particular' ? 'block' : 'none';
    document.getElementById('nearby-broadcast-notice').style.display = mode === 'particular' ? 'none' : 'flex';
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
      payload = { bookingId: this.currentAssignBookingId, type: 'particular', techId, techName: tech?.name };
      this.showToast(`Assigned to ${tech?.name}`);
    } else {
      bookings[idx].techStatus = `Broadcasted to All Captains 📡`;
      bookings[idx].assignedTechId = '';
      bookings[idx].assignedTechName = 'All Captains';
      payload = { bookingId: this.currentAssignBookingId, type: 'broadcast' };
      this.showToast('Broadcasted to all active Captains!');
    }

    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('assignTechnician', payload, false).catch(() => {});
    }

    localStorage.setItem('selfcare_bookings_db', JSON.stringify(bookings));
    this.closeModal('assign-tech-modal');
    this.renderBookingsTable();
  },

  renderTechnicians() {
    const container = document.getElementById('technicians-card-container');
    if (!container) return;

    const techs = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');
    if (techs.length === 0) {
      container.innerHTML = '<p style="font-size:12px; color:#64748B;">No Technician / Captain IDs created yet.</p>';
      return;
    }

    container.innerHTML = techs.map((t, idx) => `
      <div class="tech-row-item" style="display:flex; justify-content:space-between; align-items:center; padding:12px; border:1px solid #E2E8F0; border-radius:12px; margin-bottom:10px; background:#FFFFFF;">
        <div>
          <strong>${t.name} <span class="status-pill status-assigned" style="font-size:9.5px;">${t.status}</span></strong><br>
          <span style="font-size:11.5px;">ID: <code>${t.id}</code> • Pass: <code style="background:#FEF3C7; padding:1px 5px; border-radius:4px;">${t.pass}</code> • 📱 ${t.phone}</span><br>
          <span style="color:#078866; font-weight:700; font-size:11.5px;">📍 Location: ${t.zone} ${t.upiId ? `• UPI: ${t.upiId}` : ''}</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn-cancel" style="padding:5px 10px; font-size:11px;" onclick="AdminApp.openEditTechModal(${idx})">Edit</button>
          <button class="btn-cancel" style="padding:5px 10px; font-size:11px; color:#DC2626;" onclick="AdminApp.deleteTechnician(${idx})">Del</button>
        </div>
      </div>
    `).join('');
  },

  handleCreateTechnician(e) {
    e.preventDefault();
    const id = document.getElementById('tech-id-input').value.trim();
    const pass = document.getElementById('tech-pass-input').value.trim();
    const name = document.getElementById('tech-name-input').value.trim();
    const phone = document.getElementById('tech-phone-input').value.trim();
    const zone = document.getElementById('tech-zone-input').value.trim();
    const upiId = document.getElementById('tech-upi-input').value.trim();
    const status = document.getElementById('tech-status-select').value;

    let techs = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');
    if (techs.some(t => t.id.toLowerCase() === id.toLowerCase())) {
      alert('This ID already exists! Use a unique Technician/Captain ID.');
      return;
    }

    const staffObj = { id, captainId: id, name, phone, mobile: phone, zone, pass, password: pass, upiId, status, active: status === 'Active' };
    techs.push(staffObj);
    this.syncDualStaffStorage(techs);

    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('saveTechnician', staffObj, false).catch(() => {});
    }

    document.getElementById('tech-create-form').reset();
    this.showToast(`Created ID "${id}" for both Technician Desk & Home Collection!`);
    this.renderTechnicians();
  },

  openEditTechModal(idx) {
    const techs = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');
    const t = techs[idx];
    if (!t) return;
    document.getElementById('edit-tech-index').value = idx;
    document.getElementById('edit-tech-id').value = t.id;
    document.getElementById('edit-tech-pass').value = t.pass || t.password || '';
    document.getElementById('edit-tech-name').value = t.name;
    document.getElementById('edit-tech-phone').value = t.phone;
    document.getElementById('edit-tech-zone').value = t.zone;
    document.getElementById('edit-tech-upi').value = t.upiId || '';
    document.getElementById('edit-tech-status').value = t.status || 'Active';
    document.getElementById('edit-tech-modal').style.display = 'flex';
  },

  saveEditedTechnician(e) {
    e.preventDefault();
    const idx = Number(document.getElementById('edit-tech-index').value);
    let techs = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');
    if (!techs[idx]) return;

    const updated = {
      ...techs[idx],
      pass: document.getElementById('edit-tech-pass').value.trim(),
      password: document.getElementById('edit-tech-pass').value.trim(),
      name: document.getElementById('edit-tech-name').value.trim(),
      phone: document.getElementById('edit-tech-phone').value.trim(),
      mobile: document.getElementById('edit-tech-phone').value.trim(),
      zone: document.getElementById('edit-tech-zone').value.trim(),
      upiId: document.getElementById('edit-tech-upi').value.trim(),
      status: document.getElementById('edit-tech-status').value,
      active: document.getElementById('edit-tech-status').value === 'Active'
    };

    techs[idx] = updated;
    this.syncDualStaffStorage(techs);

    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('saveTechnician', updated, false).catch(() => {});
    }

    this.closeModal('edit-tech-modal');
    this.renderTechnicians();
    this.showToast(`Updated ${updated.name} (${updated.id}) ✓`);
  },

  deleteTechnician(idx) {
    if (!confirm('Remove this Technician / Captain ID?')) return;
    let techs = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');
    const removed = techs.splice(idx, 1);
    this.syncDualStaffStorage(techs);

    if (removed[0] && navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('deleteTechnician', { id: removed[0].id }, false).catch(() => {});
    }
    this.renderTechnicians();
  },

  /* =========================================================
     CATALOG, PACKAGES, MAPPING, REPORTS & BANNERS
     ========================================================= */
  syncPublicTestsCache(adminTests) {
    const publicTests = adminTests.map(({ B2BCost, ...rest }) => rest);
    localStorage.setItem('cache_tests', JSON.stringify(publicTests));
    localStorage.setItem('selfcare_tests_db', JSON.stringify(publicTests));
  },

  syncPublicPackagesCache(adminPackages) {
    const publicPackages = adminPackages.map(({ B2BCost, ...rest }) => rest);
    localStorage.setItem('cache_packages', JSON.stringify(publicPackages));
    localStorage.setItem('selfcare_packages_db', JSON.stringify(publicPackages));
  },

  renderTests() {
    const tbody = document.getElementById('tests-table-body');
    if (!tbody) return;

    let tests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');
    const query = (document.getElementById('test-search-filter')?.value || '').toLowerCase();
    const cat = document.getElementById('test-category-filter')?.value || '';

    if (query) tests = tests.filter(t => (t.TestName + t.TestCode + t.TestID).toLowerCase().includes(query));
    if (cat) tests = tests.filter(t => t.Category === cat);

    if (tests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:20px; color:#64748B;">No tests found.</td></tr>`;
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

  saveTestRecord(e) {
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
      SearchKeywords: document.getElementById('t-SearchKeywords').value.trim()
    };

    if (this.editingTestId) {
      const idx = tests.findIndex(t => t.TestID === this.editingTestId);
      if (idx !== -1) tests[idx] = record;
    } else {
      tests.unshift(record);
    }

    localStorage.setItem('selfcare_tests_admin_db', JSON.stringify(tests));
    this.syncPublicTestsCache(tests);
    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('saveTest', record, false).catch(() => {});
    }

    this.closeModal('test-edit-modal');
    this.renderTests();
    this.showToast(`Test "${record.TestName}" saved!`);
  },

  deleteTest(testId) {
    if (!confirm(`Delete test ${testId}?`)) return;
    let tests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]').filter(t => t.TestID !== testId);
    localStorage.setItem('selfcare_tests_admin_db', JSON.stringify(tests));
    this.syncPublicTestsCache(tests);
    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('deleteTest', { testId }, false).catch(() => {});
    }
    this.renderTests();
  },

  renderPackages() {
    const tbody = document.getElementById('packages-table-body');
    if (!tbody) return;

    let packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    const query = (document.getElementById('package-search-filter')?.value || '').toLowerCase();
    if (query) packages = packages.filter(p => (p.PackageName + p.PackageCode + p.PackageID).toLowerCase().includes(query));

    if (packages.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:20px; color:#64748B;">No packages found.</td></tr>`;
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
      document.getElementById('package-modal-title').innerText = '+ Add New Health Package';
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

  savePackageRecord(e) {
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
    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('savePackage', record, false).catch(() => {});
    }

    this.closeModal('package-edit-modal');
    this.renderPackages();
    this.showToast(`Package "${record.PackageName}" saved!`);
  },

  deletePackage(packageId) {
    if (!confirm(`Delete package ${packageId}?`)) return;
    let packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]').filter(p => p.PackageID !== packageId);
    localStorage.setItem('selfcare_packages_admin_db', JSON.stringify(packages));
    this.syncPublicPackagesCache(packages);
    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('deletePackage', { packageId }, false).catch(() => {});
    }
    this.renderPackages();
  },

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
      availContainer.innerHTML = tests.filter(t => !bundledIds.includes(t.TestID)).map(t => `
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
        if (match) { totalMrp += Number(match.MRP || 0); totalB2b += Number(match.B2BCost || 0); }
        return `
          <div class="mapping-item" style="justify-content:space-between;">
            <span><strong>${tid}</strong>: ${match ? match.TestName : 'Test'}</span>
            <button class="btn-cancel" style="padding:2px 8px; font-size:10px; color:#DC2626;" onclick="AdminApp.removeSingleTestFromPackage('${tid}')">✕</button>
          </div>
        `;
      }).join('');
    }

    const summaryEl = document.getElementById('map-selection-summary');
    if (summaryEl) {
      summaryEl.innerHTML = `<span>Tests: <strong>${bundledIds.length}</strong></span> | <span>Total MRP: <strong>₹${totalMrp}</strong></span> | <span>B2B Cost: <strong>₹${totalB2b}</strong></span>`;
    }
  },

  addSelectedTestsToPackage() {
    if (!this.currentPackageMappingId) return;
    const newIds = Array.from(document.querySelectorAll('.map-avail-chk:checked')).map(c => c.value);
    let packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    const idx = packages.findIndex(p => p.PackageID === this.currentPackageMappingId);
    if (idx === -1) return;
    const existing = (packages[idx].TestIDs || '').split(',').map(s => s.trim()).filter(Boolean);
    packages[idx].TestIDs = Array.from(new Set([...existing, ...newIds])).join(', ');
    localStorage.setItem('selfcare_packages_admin_db', JSON.stringify(packages));
    this.handlePackageMappingSelection(this.currentPackageMappingId);
  },

  removeSingleTestFromPackage(testId) {
    let packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    const idx = packages.findIndex(p => p.PackageID === this.currentPackageMappingId);
    if (idx === -1) return;
    packages[idx].TestIDs = (packages[idx].TestIDs || '').split(',').map(s => s.trim()).filter(id => id && id !== testId).join(', ');
    localStorage.setItem('selfcare_packages_admin_db', JSON.stringify(packages));
    this.handlePackageMappingSelection(this.currentPackageMappingId);
  },

  removeAllTestsFromPackage() {
    let packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    const idx = packages.findIndex(p => p.PackageID === this.currentPackageMappingId);
    if (idx === -1) return;
    packages[idx].TestIDs = '';
    localStorage.setItem('selfcare_packages_admin_db', JSON.stringify(packages));
    this.handlePackageMappingSelection(this.currentPackageMappingId);
  },

  savePackageTestMapping() {
    const packages = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    const pkg = packages.find(p => p.PackageID === this.currentPackageMappingId);
    if (!pkg) return;
    this.syncPublicPackagesCache(packages);
    if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
      Api.request('savePackage', pkg, false).catch(() => {});
    }
    this.showToast(`Mapping saved for ${pkg.PackageName}!`);
  },

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
    }
  },

  previewReportFile(input) {
    if (input.files && input.files[0]) {
      document.getElementById('upload-file-label').innerHTML = `Selected: <strong>${input.files[0].name}</strong>`;
    }
  },

  readFileAsDataUrl(file) {
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

    let reportUrl = directLink || '';
    if (fileInput.files && fileInput.files[0]) {
      const base64Report = await this.readFileAsDataUrl(fileInput.files[0]);
      if (base64Report) reportUrl = base64Report;
    }
    if (!reportUrl) return;

    let bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const idx = bookings.findIndex(b => (b.id === bookingId || b.bookingId === bookingId));
    if (idx !== -1) {
      bookings[idx].reportUrl = reportUrl;
      bookings[idx].reportStatus = 'Report Ready';
      localStorage.setItem('selfcare_bookings_db', JSON.stringify(bookings));
      if (navigator.onLine && typeof Api !== 'undefined' && Api.request) {
        Api.request('uploadReport', { bookingId, reportUrl, doctor, clinicalStatus }, false).catch(() => {});
      }
      this.showToast(`Report for ${bookingId} published!`);
      document.getElementById('report-upload-form').reset();
      this.renderBookingsTable();
    }
  },

  renderCarousel() {
    const container = document.getElementById('carousel-cards-list');
    if (!container) return;
    const banners = JSON.parse(localStorage.getItem('selfcare_carousel_db') || '[]');
    if (banners.length === 0) {
      container.innerHTML = '<p style="color:#64748B;">No banners added yet.</p>';
      return;
    }
    container.innerHTML = banners.map((b, idx) => `
      <div class="banner-admin-card">
        <img src="${b.image}" alt="Banner" class="banner-preview-img" onerror="this.src='assets/images/logo.png'">
        <div class="banner-card-info">
          <h4>${b.title}</h4>
          <p>${b.subtitle || ''}</p>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
            <span class="status-pill status-assigned">${b.status}</span>
            <button class="btn-cancel" style="padding:4px 8px; font-size:11px; color:#DC2626;" onclick="AdminApp.deleteCarouselBanner(${idx})">Del</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  openCarouselModal() {
    document.getElementById('carousel-form').reset();
    document.getElementById('carousel-edit-modal').style.display = 'flex';
  },

  saveCarouselBanner(e) {
    e.preventDefault();
    const banners = JSON.parse(localStorage.getItem('selfcare_carousel_db') || '[]');
    banners.push({
      id: 'BAN_' + Date.now(),
      title: document.getElementById('banner-title-input').value.trim(),
      subtitle: document.getElementById('banner-subtitle-input').value.trim(),
      image: document.getElementById('banner-img-input').value.trim(),
      link: document.getElementById('banner-link-input').value.trim(),
      status: document.getElementById('banner-status-input').value
    });
    localStorage.setItem('selfcare_carousel_db', JSON.stringify(banners));
    this.closeModal('carousel-edit-modal');
    this.renderCarousel();
  },

  deleteCarouselBanner(idx) {
    const banners = JSON.parse(localStorage.getItem('selfcare_carousel_db') || '[]');
    banners.splice(idx, 1);
    localStorage.setItem('selfcare_carousel_db', JSON.stringify(banners));
    this.renderCarousel();
  },

  populateSocialItemSelect() {
    const select = document.getElementById('social-share-item-select');
    if (!select) return;
    const tests = JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]');
    const pkgs = JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]');
    let html = '<option value="">-- Choose Test / Package --</option>';
    pkgs.forEach(p => html += `<option value="pkg_${p.PackageID}">[Package] ${p.PackageName} (₹${p.OfferPrice})</option>`);
    tests.forEach(t => html += `<option value="test_${t.TestID}">[Test] ${t.TestName} (₹${t.OfferPrice})</option>`);
    select.innerHTML = html;
  },

  prepareSocialSharePreview() {
    const val = document.getElementById('social-share-item-select').value;
    if (!val) return;
    const [type, id] = val.split('_');
    const item = type === 'pkg'
      ? JSON.parse(localStorage.getItem('selfcare_packages_admin_db') || '[]').find(x => x.PackageID === id)
      : JSON.parse(localStorage.getItem('selfcare_tests_admin_db') || '[]').find(x => x.TestID === id);
    if (!item) return;

    const title = item.TestName || item.PackageName;
    const msg = `🌟 Selfcare Diagnostics - Special Offer!\n\nGet ${title} at just ₹${item.OfferPrice} (MRP: ₹${item.MRP}).\nBook home sample pickup: https://selfcarediagnostics.in?ref=${id}`;
    document.getElementById('social-share-msg').value = msg;
    document.getElementById('social-preview-box').innerHTML = msg.replace(/\n/g, '<br>');
  },

  shareOnWhatsApp() {
    const text = encodeURIComponent(document.getElementById('social-share-msg').value);
    window.open(`https://wa.me/917010174890?text=${text}`, '_blank');
  },

  shareOnFacebook() {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://selfcarediagnostics.in')}`, '_blank');
  },

  copyInstagramCaption() {
    navigator.clipboard.writeText(document.getElementById('social-share-msg').value);
    this.showToast('Caption copied to clipboard!');
  },

  /* =========================================================
     NAVIGATION, GLOBAL SEARCH & HELPERS
     ========================================================= */
  toggleDrawer() {
    document.getElementById('admin-drawer')?.classList.toggle('open');
    document.getElementById('admin-drawer-overlay')?.classList.toggle('active');
  },

  closeDrawer() {
    document.getElementById('admin-drawer')?.classList.remove('open');
    document.getElementById('admin-drawer-overlay')?.classList.remove('active');
  },

  switchTab(tabId) {
    document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active');
    document.querySelector(`.nav-item[data-tab="${tabId}"]`)?.classList.add('active');

    if (tabId === 'tab-home') { this.renderHomeRevenueKPIs(); this.renderRevenueChart(this.currentChartPeriod); }
    if (tabId === 'tab-finance') this.renderFinancialLedger();
    if (tabId === 'tab-bookings') this.renderBookingsTable();
    if (tabId === 'tab-customers') this.renderCustomersTable();
    if (tabId === 'tab-technicians') this.renderTechnicians();

    this.closeDrawer();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  handleGlobalSearch(query) {
    const q = (query || '').trim().toLowerCase();
    const dropdown = document.getElementById('global-search-results-dropdown');
    const clearBtn = document.getElementById('btn-clear-search');
    if (!q) { dropdown.style.display = 'none'; clearBtn.style.display = 'none'; return; }
    clearBtn.style.display = 'block';

    const bookings = JSON.parse(localStorage.getItem('selfcare_bookings_db') || '[]');
    const customers = JSON.parse(localStorage.getItem('selfcare_admin_customers_cache') || '[]');
    const techs = JSON.parse(localStorage.getItem('selfcare_technicians') || '[]');

    const mBookings = bookings.filter(b => `${b.id} ${b.bookingId} ${b.patientName} ${b.patientPhone}`.toLowerCase().includes(q));
    const mCust = customers.filter(c => `${c.name} ${c.phone} ${c.customerId}`.toLowerCase().includes(q));
    const mTechs = techs.filter(t => `${t.name} ${t.id} ${t.zone}`.toLowerCase().includes(q));

    let html = '';
    if (mBookings.length) {
      html += `<div class="search-result-group-title">Bookings (${mBookings.length})</div>` +
        mBookings.slice(0, 3).map(b => `<div class="search-result-row" onclick="AdminApp.switchTab('tab-bookings')"><strong>${b.id || b.bookingId} - ${b.patientName}</strong><small>₹${b.totalAmount || 0}</small></div>`).join('');
    }
    if (mCust.length) {
      html += `<div class="search-result-group-title">Customers (${mCust.length})</div>` +
        mCust.slice(0, 3).map(c => `<div class="search-result-row" onclick="AdminApp.switchTab('tab-customers')"><strong>${c.name} (${c.phone})</strong><small>Pass: ${c.password}</small></div>`).join('');
    }
    if (mTechs.length) {
      html += `<div class="search-result-group-title">Technicians / Captains (${mTechs.length})</div>` +
        mTechs.slice(0, 3).map(t => `<div class="search-result-row" onclick="AdminApp.switchTab('tab-technicians')"><strong>${t.name} [${t.id}]</strong><small>${t.zone}</small></div>`).join('');
    }

    dropdown.innerHTML = html || `<div style="padding:14px; text-align:center; font-size:12px; color:#64748B;">No matches found</div>`;
    dropdown.style.display = 'block';
  },

  clearGlobalSearch() {
    document.getElementById('admin-global-search-input').value = '';
    document.getElementById('global-search-results-dropdown').style.display = 'none';
    document.getElementById('btn-clear-search').style.display = 'none';
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
    setTimeout(() => toast.remove(), 3200);
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  },

  async forceSyncCloud() {
    this.showToast('Syncing Bookings, Customers, Staff & Catalog...');
    await Promise.all([
      this.loadAllBookings(),
      this.loadAllCustomers(),
      this.loadAllTechnicians(),
      this.loadAllTests(),
      this.loadAllPackages()
    ]);
    this.renderHomeRevenueKPIs();
    this.renderFinancialLedger();
    this.renderBookingsTable();
    this.renderCustomersTable();
    this.renderTechnicians();
    this.renderTests();
    this.renderPackages();
    this.showToast('All Data Synchronized ✓');
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
