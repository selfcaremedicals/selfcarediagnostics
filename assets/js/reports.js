/* file: assets/js/reports.js */
/**
 * Selfcare Diagnostics - Real Health Records Engine v5.0.0
 * Features:
 * 1. STRICT STAGE 5 FILTER: Reports appear in the Reports tab ONLY when 
 *    the booking reaches "Certified NABL Report Ready" (Stage 5 / Completed / Report Ready).
 * 2. ZERO DUMMY/MOCK DATA: Strictly blocks premature/fake medical parameters when sample is not tested.
 * 3. Multi-tenant Family Vault Awareness (selfcare_family_${mobile}).
 * 4. Automatic clean empty state when no verified reports exist for the selected patient.
 * 5. Live Google Sheets Backend Sync via Api.getBookingsByPatient.
 */

const ReportsPage = {
  patientsList: [],
  selectedPatientIndex: 0,

  async init() {
    try {
      this.loadRealProfilesAndReports();
      this.renderPatientChips();
      this.evaluatePatientRecords();
      await this.syncLiveCloudReports();
    } catch (err) {
      console.error('[Reports] Init error:', err);
    }
  },

  safeEscape(str) {
    if (typeof Utils !== 'undefined' && Utils.escapeHtml) {
      return Utils.escapeHtml(str);
    }
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  },

  safeFormatCurrency(amt) {
    if (typeof Utils !== 'undefined' && Utils.formatCurrency) {
      return Utils.formatCurrency(amt);
    }
    return '₹' + Math.round(Number(amt) || 0).toLocaleString('en-IN');
  },

  /**
   * Helper: Determines if a booking has ACTUALLY reached Certified NABL Report Ready status
   */
  isReportCertifiedReady(booking) {
    if (!booking) return false;

    const stage = Number(booking.currentStage || 0);
    const bStatus = String(booking.bookingStatus || '').toUpperCase();
    const rStatus = String(booking.reportStatus || '').toUpperCase();
    const hasReportUrl = Boolean(booking.reportUrl && String(booking.reportUrl).trim() !== '');

    // Strictly check if report is ready / completed / published by lab
    return (
      stage === 5 ||
      bStatus === 'COMPLETED' ||
      bStatus.includes('REPORT_READY') ||
      rStatus === 'REPORT READY' ||
      rStatus.includes('READY') ||
      hasReportUrl
    );
  },

  /**
   * Reads genuine user profiles and ONLY certified completed lab reports
   */
  loadRealProfilesAndReports() {
    let selfName = 'Customer (Self)';
    let selfGender = 'Not Specified';
    let currentMobile = '';

    const storedUser = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || null;
    if (storedUser) {
      if (storedUser.name) selfName = storedUser.name;
      if (storedUser.gender) selfGender = storedUser.gender;
      currentMobile = storedUser.mobile || storedUser.phone || '';
    } else {
      try {
        const p = localStorage.getItem('selfcare_customer_profile');
        if (p) {
          const parsed = JSON.parse(p);
          if (parsed.name || parsed.FullName) selfName = parsed.name || parsed.FullName;
          if (parsed.gender || parsed.Gender) selfGender = parsed.gender || parsed.Gender;
          currentMobile = parsed.mobile || '';
        }
      } catch (e) {}
    }

    if (!currentMobile) {
      currentMobile = localStorage.getItem('selfcare_active_user') || '';
    }

    // 1. Initialize primary real customer
    const realPatients = [
      {
        id: 'self',
        name: selfName,
        relation: 'Self',
        gender: selfGender,
        reports: []
      }
    ];

    // 2. Read real family members from storage
    try {
      let famStored = null;
      if (currentMobile) {
        famStored = localStorage.getItem(`selfcare_family_${currentMobile}`);
      }
      if (!famStored) {
        famStored = localStorage.getItem('selfcare_family_members');
      }

      if (famStored) {
        const famList = JSON.parse(famStored);
        if (Array.isArray(famList)) {
          famList.forEach((fm, idx) => {
            if (fm && fm.name) {
              realPatients.push({
                id: fm.id || `fam_${idx}`,
                name: fm.name,
                relation: fm.relation || 'Family',
                gender: fm.gender || 'Not Specified',
                reports: []
              });
            }
          });
        }
      }
    } catch (e) {}

    // 3. Read true bookings from storage
    let allStoredBookings = [];
    try {
      const b1 = localStorage.getItem('selfcare_recent_bookings');
      const b2 = localStorage.getItem('selfcare_all_bookings');
      if (b1) allStoredBookings = allStoredBookings.concat(JSON.parse(b1));
      if (b2) allStoredBookings = allStoredBookings.concat(JSON.parse(b2));
    } catch (e) {}

    // Deduplicate bookings by bookingId
    const uniqueBookingsMap = new Map();
    allStoredBookings.forEach(item => {
      if (item && item.bookingId && !uniqueBookingsMap.has(item.bookingId)) {
        uniqueBookingsMap.set(item.bookingId, item);
      }
    });

    const uniqueBookings = Array.from(uniqueBookingsMap.values());

    // 4. Attach reports ONLY IF the booking has reached Certified NABL Report Ready
    uniqueBookings.forEach(booking => {
      // 🛑 CRITICAL GUARD: If the test is in progress (Stage 1, 2, 3, 4), DO NOT show in Reports page!
      if (!this.isReportCertifiedReady(booking)) {
        return;
      }

      const pName = (booking.patientName || selfName).trim().toLowerCase();
      const pId = String(booking.patientId || '').trim().toLowerCase();
      const isSelf = pId === 'self' || pId === 'patient_self' || pName.includes('self');

      let targetPatient = realPatients.find(p => {
        const targetId = String(p.id).toLowerCase();
        const targetName = p.name.trim().toLowerCase();
        return (pId && targetId === pId) || (targetName === pName) || (isSelf && targetId === 'self');
      });

      if (!targetPatient && pName !== 'customer (self)') {
        targetPatient = {
          id: pId || `patient_${pName.replace(/\s+/g, '_')}`,
          name: booking.patientName || 'Member',
          relation: booking.relation || 'Member',
          gender: booking.gender || 'Not Specified',
          reports: []
        };
        realPatients.push(targetPatient);
      }

      if (targetPatient) {
        let itemsList = booking.items;
        if (typeof itemsList === 'string') {
          try { itemsList = JSON.parse(itemsList); } catch (e) { itemsList = []; }
        }

        const reportTitle = (Array.isArray(itemsList) && itemsList.length > 0)
          ? itemsList.map(i => i.name || i.TestName || i.PackageName).join(' + ')
          : 'Diagnostic Health Checkup';

        // ONLY genuine clinical parameters attached by lab/admin. No fabricated fake numbers!
        const parameters = Array.isArray(booking.parameters) ? booking.parameters : [];

        targetPatient.reports.push({
          id: `REP_${booking.bookingId}`,
          bookingId: booking.bookingId,
          title: reportTitle,
          date: booking.collectionDate || booking.date || 'Certified Checkup',
          timestamp: booking.timestamp || new Date(booking.collectionDate || Date.now()).getTime(),
          reportUrl: booking.reportUrl || '',
          doctor: booking.doctor || 'Chief Pathologist (NABL)',
          parameters: parameters
        });
      }
    });

    // Sort each patient's reports chronologically (latest first)
    realPatients.forEach(p => {
      p.reports.sort((a, b) => b.timestamp - a.timestamp);
    });

    this.patientsList = realPatients;
  },

  /**
   * Live Cloud Sync: Fetches real test bookings from Google Sheets
   */
  async syncLiveCloudReports() {
    if (!navigator.onLine || typeof Api === 'undefined') return;
    const user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
    const mobile = user ? (user.mobile || user.phone) : (localStorage.getItem('selfcare_active_user') || null);
    if (!mobile) return;

    try {
      let liveBookings = null;
      if (typeof Api.getBookingsByPatient === 'function') {
        liveBookings = await Api.getBookingsByPatient(mobile);
      } else if (typeof Api.request === 'function') {
        liveBookings = await Api.request('getBookingsByPatient', { patientPhone: mobile }, false);
      }

      if (Array.isArray(liveBookings) && liveBookings.length > 0) {
        let existing = [];
        try {
          const raw = localStorage.getItem('selfcare_recent_bookings');
          if (raw) existing = JSON.parse(raw);
        } catch (e) {}

        const map = new Map();
        liveBookings.forEach(b => map.set(b.bookingId, b));
        existing.forEach(b => { if (!map.has(b.bookingId)) map.set(b.bookingId, b); });

        localStorage.setItem('selfcare_recent_bookings', JSON.stringify(Array.from(map.values())));
        this.loadRealProfilesAndReports();
        this.renderPatientChips();
        this.evaluatePatientRecords();
      }
    } catch (err) {
      console.warn('[Reports] Cloud sync notice:', err);
    }
  },

  renderPatientChips() {
    const container = document.getElementById('patient-chips-list');
    if (!container) return;

    container.innerHTML = this.patientsList.map((p, idx) => {
      const initial = (p.name || 'P').charAt(0).toUpperCase();
      return `
        <div class="patient-chip ${idx === this.selectedPatientIndex ? 'active' : ''}" 
             onclick="ReportsPage.selectPatient(${idx})">
          <div class="chip-avatar">${initial}</div>
          <div class="chip-info">
            <span class="chip-name">${this.safeEscape(p.name)}</span>
            <span class="chip-relation">${this.safeEscape(p.relation)}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  selectPatient(index) {
    this.selectedPatientIndex = index;
    this.renderPatientChips();
    this.evaluatePatientRecords();
  },

  /**
   * Health Records Evaluation: Displays ONLY verified NABL completed reports
   */
  evaluatePatientRecords() {
    const patient = this.patientsList[this.selectedPatientIndex];
    const recordsView = document.getElementById('patient-records-view');
    const emptyState = document.getElementById('patient-empty-state');

    // 🛑 If patient has no Stage 5 completed reports, show clean empty state!
    if (!patient || !patient.reports || patient.reports.length === 0) {
      if (recordsView) recordsView.style.display = 'none';
      if (emptyState) {
        emptyState.style.display = 'flex';
        const titleEl = document.getElementById('empty-state-title');
        const descEl = document.getElementById('empty-state-desc');
        if (titleEl) titleEl.textContent = `No Certified Reports for ${patient ? patient.name : 'Patient'}`;
        if (descEl) {
          descEl.textContent = `There are no completed lab reports available for ${patient ? patient.name : 'this member'} yet. Once your sample collection and clinical testing reach "Certified NABL Report Ready", your verified medical records will appear here.`;
        }
      }
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (recordsView) recordsView.style.display = 'block';

    const reports = patient.reports;
    const latestReport = reports[0];
    const previousReport = reports.length > 1 ? reports[1] : null;

    const comparisonSection = document.getElementById('comparison-section');
    const bannerBox = document.getElementById('trend-highlight-banner');
    const overallBadge = document.getElementById('overall-trend-badge');
    const paramsContainer = document.getElementById('comparison-parameters-container');

    const hasRealParams = latestReport.parameters && latestReport.parameters.length > 0;

    if (previousReport && comparisonSection && hasRealParams && previousReport.parameters && previousReport.parameters.length > 0) {
      comparisonSection.style.display = 'block';
      document.getElementById('patient-comparison-title').textContent = `${patient.name}'s Health Progress`;
      document.getElementById('comparison-date-range').textContent = 
        `Comparing Checkups: ${previousReport.date} vs ${latestReport.date}`;

      const comparisonResults = this.compareTwoReports(previousReport, latestReport);
      this.renderComparisonUI(patient.name, comparisonResults, bannerBox, overallBadge, paramsContainer);
    } else if (comparisonSection) {
      document.getElementById('patient-comparison-title').textContent = `${patient.name}'s Verified Report`;
      document.getElementById('comparison-date-range').textContent = `Certified on ${latestReport.date}`;
      if (overallBadge) {
        overallBadge.textContent = 'NABL Authenticated';
        overallBadge.style.background = '#ECFDF5';
        overallBadge.style.color = '#047857';
      }

      if (bannerBox) {
        bannerBox.className = 'trend-alert-banner stable';
        bannerBox.style.display = 'flex';
        bannerBox.innerHTML = `
          <div class="banner-icon">📄</div>
          <div class="banner-content">
            <strong>Certified Lab Report Ready for ${this.safeEscape(patient.name)}</strong>
            <p>Your diagnostic evaluation is complete. Tap "Download PDF" below to view the official verified medical test results.</p>
          </div>
        `;
      }

      if (paramsContainer) {
        if (hasRealParams) {
          paramsContainer.innerHTML = latestReport.parameters.map(p => `
            <div class="comp-param-card">
              <div class="param-title-row">
                <strong>${this.safeEscape(p.name)}</strong>
                <span class="ref-val">Ref: ${p.range || 'Standard'} ${p.unit || ''}</span>
              </div>
              <div class="values-compare-flex">
                <div class="val-col">
                  <span>Observed Value</span>
                  <strong style="color: ${p.status === 'high' ? '#DC2626' : '#047857'};">${p.value} ${p.unit || ''}</strong>
                </div>
                <span class="param-badge ${p.status || 'normal'}">${(p.status || 'NORMAL').toUpperCase()}</span>
              </div>
            </div>
          `).join('');
        } else {
          paramsContainer.innerHTML = `
            <div style="padding:14px; text-align:center; background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:10px; font-size:12px; color:#475569;">
              Official NABL laboratory verification complete. Full clinical parameter breakdown is available inside your signed PDF report.
            </div>
          `;
        }
      }
    }

    this.renderLifestyleAdvisory(patient, latestReport);
    this.renderReportsHistory(patient);
  },

  compareTwoReports(prevReport, latestReport) {
    const prevParams = prevReport.parameters || [];
    const latestParams = latestReport.parameters || [];

    const comparisons = [];
    let hasImprovement = false;
    let hasElevation = false;

    latestParams.forEach(latestP => {
      const matchPrev = prevParams.find(p => p.name.trim().toLowerCase() === latestP.name.trim().toLowerCase());
      if (matchPrev) {
        const valPrev = parseFloat(matchPrev.value);
        const valLatest = parseFloat(latestP.value);

        if (!isNaN(valPrev) && !isNaN(valLatest)) {
          const delta = (valLatest - valPrev).toFixed(1);
          const isReduced = delta < 0;
          const isIncreased = delta > 0;

          const isFavorableReduction = isReduced && (
            latestP.name.toLowerCase().includes('hba1c') ||
            latestP.name.toLowerCase().includes('glucose') ||
            latestP.name.toLowerCase().includes('sugar') ||
            latestP.name.toLowerCase().includes('cholesterol')
          );

          const isFavorableIncrease = isIncreased && latestP.name.toLowerCase().includes('hemoglobin');

          if (isFavorableReduction || isFavorableIncrease) {
            hasImprovement = true;
          } else if (isIncreased && (latestP.name.toLowerCase().includes('hba1c') || latestP.name.toLowerCase().includes('sugar'))) {
            hasElevation = true;
          }

          comparisons.push({
            name: latestP.name,
            unit: latestP.unit || '',
            range: latestP.range || '',
            prevVal: valPrev,
            latestVal: valLatest,
            delta: Math.abs(delta),
            isReduced: isReduced,
            isFavorable: isFavorableReduction || isFavorableIncrease
          });
        }
      }
    });

    return {
      items: comparisons,
      hasImprovement: hasImprovement,
      hasElevation: hasElevation
    };
  },

  renderComparisonUI(patientName, comparisonResults, bannerBox, overallBadge, paramsContainer) {
    const { items, hasImprovement, hasElevation } = comparisonResults;

    if (!paramsContainer) return;

    if (items.length === 0) {
      if (bannerBox) bannerBox.style.display = 'none';
      paramsContainer.innerHTML = `<p style="font-size:11px; color:#536E66; padding:8px;">Different diagnostic panels booked across visits. Full breakdown available in individual PDF reports.</p>`;
      return;
    }

    if (bannerBox) bannerBox.style.display = 'flex';
    if (hasImprovement) {
      if (overallBadge) {
        overallBadge.textContent = '🌟 Significant Health Improvement';
        overallBadge.style.color = '#047857';
        overallBadge.style.background = '#ECFDF5';
      }

      const topImproved = items.find(i => i.isFavorable);
      const paramText = topImproved ? `${topImproved.name} reduced from ${topImproved.prevVal}${topImproved.unit} to ${topImproved.latestVal}${topImproved.unit}` : 'Key diagnostic vitals have improved';

      if (bannerBox) {
        bannerBox.className = 'trend-alert-banner improved';
        bannerBox.innerHTML = `
          <div class="banner-icon">🎉</div>
          <div class="banner-content">
            <strong>Well done, ${this.safeEscape(patientName)}! Your ${paramText}!</strong>
            <p>Your diagnostic parameters show positive control compared to your previous laboratory checkup.</p>
          </div>
        `;
      }
    } else if (hasElevation) {
      if (overallBadge) {
        overallBadge.textContent = '⚠️ Attention Required';
        overallBadge.style.color = '#DC2626';
        overallBadge.style.background = '#FEF2F2';
      }

      if (bannerBox) {
        bannerBox.className = 'trend-alert-banner alert';
        bannerBox.innerHTML = `
          <div class="banner-icon">⚠️</div>
          <div class="banner-content">
            <strong>Health Alert: Parameter values have elevated since previous test.</strong>
            <p>We advise adjusting dietary habits and consulting a specialist for regular medical guidance.</p>
          </div>
        `;
      }
    } else {
      if (overallBadge) {
        overallBadge.textContent = '✓ Healthy & Stable';
        overallBadge.style.color = '#1E40AF';
        overallBadge.style.background = '#EFF6FF';
      }

      if (bannerBox) {
        bannerBox.className = 'trend-alert-banner stable';
        bannerBox.innerHTML = `
          <div class="banner-icon">👍</div>
          <div class="banner-content">
            <strong>Parameters Stable & Well Maintained.</strong>
            <p>Observed laboratory markers remain steady and within safe variations.</p>
          </div>
        `;
      }
    }

    paramsContainer.innerHTML = items.map(p => `
      <div class="comp-param-card">
        <div class="param-title-row">
          <strong>${this.safeEscape(p.name)}</strong>
          <span class="ref-val">Ref: ${p.range} ${p.unit}</span>
        </div>
        <div class="values-compare-flex">
          <div class="val-col">
            <span>Previous</span>
            <strong>${p.prevVal} ${p.unit}</strong>
          </div>
          <div class="trend-arrow-box">
            <span class="trend-delta-pill ${p.isFavorable ? 'reduced-good' : 'increased-bad'}">
              ${p.isReduced ? '↓ -' : '↑ +'}${p.delta} ${p.unit}
            </span>
          </div>
          <div class="val-col" style="text-align: right;">
            <span>Latest</span>
            <strong style="color: ${p.isFavorable ? '#047857' : '#DC2626'};">${p.latestVal} ${p.unit}</strong>
          </div>
        </div>
      </div>
    `).join('');
  },

  renderLifestyleAdvisory(patient, report) {
    const eatList = document.getElementById('foods-to-eat-list');
    const avoidList = document.getElementById('foods-to-avoid-list');
    const exerciseText = document.getElementById('exercise-plan-text');
    const docText = document.getElementById('doc-referral-text');
    const docBadge = document.getElementById('doc-specialist-badge');

    if (!eatList || !avoidList) return;

    const params = report.parameters || [];
    
    const isDiabeticRisk = params.some(p => 
      (p.name.toLowerCase().includes('hba1c') && parseFloat(p.value) >= 6.0) ||
      (p.name.toLowerCase().includes('sugar') && parseFloat(p.value) > 100) ||
      (p.name.toLowerCase().includes('glucose') && parseFloat(p.value) > 100)
    );

    const isLipidRisk = params.some(p => 
      (p.name.toLowerCase().includes('cholesterol') && parseFloat(p.value) >= 195) ||
      (p.name.toLowerCase().includes('triglyceride') && parseFloat(p.value) > 150)
    );

    const isThyroidIssue = params.some(p => 
      p.name.toLowerCase().includes('tsh') && (parseFloat(p.value) > 4.5 || parseFloat(p.value) < 0.4)
    );

    if (isDiabeticRisk) {
      eatList.innerHTML = `
        <li>• Whole millets: Foxtail (Thinai), Little Millet (Samai), Ragi</li>
        <li>• Soluble fiber greens: Fenugreek (Methi) leaves, Bitter gourd (Pavakkai)</li>
        <li>• High protein legumes: Boiled sundal, sprouted moong dal, paneer</li>
        <li>• Low GI fruits: Guava, green apples, fresh berries</li>
      `;
      avoidList.innerHTML = `
        <li>• Polished white rice, maida & bakery white bread</li>
        <li>• Refined sugar, sweets, packaged fruit beverages</li>
        <li>• Deep fried snacks (Bajjis, samosas, mixtures)</li>
        <li>• High-glycemic fruits like mangoes, sapota, ripe bananas</li>
      `;
      if (exerciseText) exerciseText.textContent = "30 to 45 minutes of daily brisk walking combined with light Surya Namaskar to boost cellular insulin absorption.";
      if (docText) docText.textContent = "Diabetologist / Consultant Physician";
      if (docBadge) docBadge.textContent = "Diabetology";
    } else if (isLipidRisk) {
      eatList.innerHTML = `
        <li>• Soluble oat beta-glucan, chia seeds & flax seeds</li>
        <li>• 4-5 unsalted almonds & walnuts daily</li>
        <li>• Steamed garlic pods & fresh curry leaf infusions</li>
        <li>• Cold-pressed oils in measured limited quantities</li>
      `;
      avoidList.innerHTML = `
        <li>• Commercial trans fats, vanaspati (dalda) & palm oil</li>
        <li>• Deep fried mutton, red meat & full-fat dairy creams</li>
        <li>• Re-heated commercial cooking oils & butter cookies</li>
        <li>• Ultra-processed chips & packaged foods</li>
      `;
      if (exerciseText) exerciseText.textContent = "Moderate aerobic cardio (cycling, jogging, or stair climbing) 5 days a week for 30 minutes to improve HDL.";
      if (docText) docText.textContent = "Cardiologist / General Medicine Specialist";
      if (docBadge) docBadge.textContent = "Cardiology";
    } else if (isThyroidIssue) {
      eatList.innerHTML = `
        <li>• Selenium & Zinc foods: Pumpkin seeds, sunflower seeds, eggs</li>
        <li>• Cooked vegetables, fiber-rich carrots & cucumbers</li>
        <li>• Consistent meal timing and adequate iodine intake</li>
      `;
      avoidList.innerHTML = `
        <li>• Raw cruciferous vegetables (raw cabbage, raw cauliflower)</li>
        <li>• Excess soy products & refined packaged sugars</li>
        <li>• Late night heavy gluten meals</li>
      `;
      if (exerciseText) exerciseText.textContent = "Daily 30 minutes of low-impact walking and thyroid-stimulating yoga (Sarvangasana, Matsyasana).";
      if (docText) docText.textContent = "Endocrinologist / General Physician";
      if (docBadge) docBadge.textContent = "Endocrinology";
    } else {
      eatList.innerHTML = `
        <li>• Seasonal mixed salads, boiled lentils & fresh home-cooked vegetables</li>
        <li>• Adequate hydration: 2.5 - 3 Litres of clean water daily</li>
        <li>• Whole food grains and light homemade curd</li>
      `;
      avoidList.innerHTML = `
        <li>• Carbonated soft drinks & artificial sweeteners</li>
        <li>• Ultra-processed instant noodles & evening oily snacks</li>
        <li>• Excess table salt & irregular midnight meals</li>
      `;
      if (exerciseText) exerciseText.textContent = "Maintain regular active physical movements (aim for 8,000 - 10,000 daily steps) with 7-8 hours of restful sleep.";
      if (docText) docText.textContent = "General Medicine Physician";
      if (docBadge) docBadge.textContent = "General Medicine";
    }
  },

  renderReportsHistory(patient) {
    const container = document.getElementById('reports-list-container');
    if (!container) return;

    container.innerHTML = (patient.reports || []).map(r => `
      <div class="report-card animate-fade">
        <div class="report-card-top">
          <div>
            <h5>${this.safeEscape(r.title)}</h5>
            <span>Date: ${r.date} • ID: ${r.bookingId}</span>
          </div>
          <span style="font-size: 10px; font-weight:800; color:#047857; background:#ECFDF5; padding:3px 7px; border-radius:6px;">NABL Certified</span>
        </div>
        <div class="report-actions-row">
          <button type="button" class="btn-view" onclick="ReportsPage.openModal('${r.id}')">
            👁️ View Parameters
          </button>
          <button type="button" class="btn-pdf" onclick="ReportsPage.downloadPdf('${this.safeEscape(r.title)}', '${r.bookingId}', '${this.safeEscape(r.reportUrl || '')}')">
            📥 Download PDF
          </button>
        </div>
      </div>
    `).join('');
  },

  openModal(reportId) {
    const patient = this.patientsList[this.selectedPatientIndex];
    const report = (patient.reports || []).find(r => r.id === reportId);
    if (!report) return;

    const titleEl = document.getElementById('modal-report-title');
    const metaEl = document.getElementById('modal-report-meta');
    if (titleEl) titleEl.textContent = report.title;
    if (metaEl) metaEl.textContent = `Checkup Date: ${report.date} • ID: ${report.bookingId} • ${patient.name}`;

    const tbody = document.getElementById('modal-params-tbody');
    const params = report.parameters || [];

    if (tbody) {
      if (params.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align:center; padding:18px; color:#536E66; font-size:12px;">
              Clinical laboratory analysis verified by ${this.safeEscape(report.doctor)}. Full signed diagnostic breakdown is available in the official PDF.
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = params.map(p => `
          <tr>
            <td><strong>${this.safeEscape(p.name)}</strong></td>
            <td><strong>${p.value}</strong> <small>${p.unit || ''}</small></td>
            <td><small>${p.range || 'Standard'} ${p.unit || ''}</small></td>
            <td><span class="param-badge ${p.status || 'normal'}">${(p.status || 'NORMAL').toUpperCase()}</span></td>
          </tr>
        `).join('');
      }
    }

    const pdfBtn = document.getElementById('modal-download-pdf-btn');
    if (pdfBtn) {
      pdfBtn.onclick = () => this.downloadPdf(report.title, report.bookingId, report.reportUrl);
    }

    const waBtn = document.getElementById('modal-whatsapp-share-btn');
    if (waBtn) {
      waBtn.onclick = () => {
        const text = `Hello Doctor, sharing my verified diagnostic report for *${report.title}* from Selfcare Diagnostics Chennai (Patient: ${patient.name}, Booking ID: ${report.bookingId}).`;
        window.location.href = `https://wa.me/917010174890?text=${encodeURIComponent(text)}`;
      };
    }

    const modal = document.getElementById('report-view-modal');
    if (modal) modal.style.display = 'flex';
  },

  downloadPdf(title, bookingId, reportUrl = '') {
    if (reportUrl && reportUrl.trim() !== '') {
      if (typeof Utils !== 'undefined' && Utils.showToast) {
        Utils.showToast(`Opening certified NABL lab report for ${bookingId}...`, 'success');
      }
      window.open(reportUrl, '_blank');
      return;
    }

    if (typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(`Requesting certified PDF report ${bookingId}...`, 'success');
    }
    const msg = `Hello Selfcare Diagnostics, please share the official signed PDF report for Booking ID: *${bookingId}* (${title}).`;
    window.location.href = `https://wa.me/917010174890?text=${encodeURIComponent(msg)}`;
  },

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ReportsPage.init();
});

if (typeof window !== 'undefined') {
  window.ReportsPage = ReportsPage;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReportsPage;
}
