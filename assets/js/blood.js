/* file: assets/js/blood.js */
/**
 * Selfcare Diagnostics - Emergency Blood Connect Controller v2.0.0
 * Zero-Dummy Data, Touch Modals, Unit Highlights, Attender Handshake,
 * 38 Districts, Gamified Tiers, and Native WhatsApp Image Sharing.
 */

const BloodPage = {
  currentTab: 'requests', // 'requests' | 'donors' | 'history'
  historySubTab: 'requests', // 'requests' | 'donations'
  bloodRequests: [],
  bloodDonors: [],
  selectedBloodGroup: 'ALL',
  selectedDistrict: 'ALL',

  async init() {
    try {
      this.loadBloodData();
      this.populateUserContext();
      this.renderAll();
      this.syncLiveCloudData();
    } catch (err) {
      console.error('[BloodConnect] Init error:', err);
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

  safeShowToast(msg, type = 'info') {
    if (typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(msg, type);
    } else {
      alert(msg);
    }
  },

  triggerHaptic() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(25);
    }
  },

  populateUserContext() {
    try {
      const user = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};
      const activeMobile = localStorage.getItem('selfcare_active_user') || user.mobile || '';

      const nameInput = document.getElementById('donor-name');
      const phoneInput = document.getElementById('donor-phone');
      const groupInput = document.getElementById('donor-blood-group');
      const reqAttender = document.getElementById('req-attender-name');
      const reqPhone = document.getElementById('req-attender-phone');

      if (nameInput && user.name) nameInput.value = user.name;
      if (phoneInput && activeMobile) phoneInput.value = String(activeMobile).replace(/\D/g, '').slice(-10);
      if (groupInput && user.bloodGroup) groupInput.value = user.bloodGroup;

      if (reqAttender && user.name) reqAttender.value = user.name;
      if (reqPhone && activeMobile) reqPhone.value = String(activeMobile).replace(/\D/g, '').slice(-10);
    } catch (e) {}
  },

  loadBloodData() {
    // Zero-Dummy Data: Initialized strictly from LocalStorage or empty arrays
    try {
      const storedReq = localStorage.getItem('selfcare_blood_requests');
      this.bloodRequests = storedReq ? JSON.parse(storedReq) : [];

      const storedDonors = localStorage.getItem('selfcare_blood_donors');
      this.bloodDonors = storedDonors ? JSON.parse(storedDonors) : [];
    } catch (e) {
      this.bloodRequests = [];
      this.bloodDonors = [];
    }
  },

  async syncLiveCloudData() {
    if (!navigator.onLine || typeof Api === 'undefined' || typeof Api.request !== 'function') return;

    try {
      const res = await Api.request('getBloodData', {}, false).catch(() => null);
      if (res && res.status === 'success') {
        if (Array.isArray(res.requests)) {
          this.bloodRequests = res.requests;
          localStorage.setItem('selfcare_blood_requests', JSON.stringify(this.bloodRequests));
        }
        if (Array.isArray(res.donors)) {
          this.bloodDonors = res.donors;
          localStorage.setItem('selfcare_blood_donors', JSON.stringify(this.bloodDonors));
        }
        this.renderAll();
      }
    } catch (e) {}
  },

  switchTab(tab) {
    this.triggerHaptic();
    this.currentTab = tab;

    const btnReq = document.getElementById('tab-btn-requests');
    const btnDon = document.getElementById('tab-btn-donors');
    const btnHist = document.getElementById('tab-btn-history');

    const viewReq = document.getElementById('view-requests-section');
    const viewDon = document.getElementById('view-donors-section');
    const viewHist = document.getElementById('view-history-section');
    const filterBox = document.getElementById('filters-container');

    [btnReq, btnDon, btnHist].forEach(b => b && b.classList.remove('active'));
    [viewReq, viewDon, viewHist].forEach(v => v && (v.style.display = 'none'));

    if (tab === 'requests') {
      if (btnReq) btnReq.classList.add('active');
      if (viewReq) viewReq.style.display = 'block';
      if (filterBox) filterBox.style.display = 'block';
    } else if (tab === 'donors') {
      if (btnDon) btnDon.classList.add('active');
      if (viewDon) viewDon.style.display = 'block';
      if (filterBox) filterBox.style.display = 'block';
    } else {
      if (btnHist) btnHist.classList.add('active');
      if (viewHist) viewHist.style.display = 'block';
      if (filterBox) filterBox.style.display = 'none';
      this.renderHistory();
    }
  },

  switchHistorySubTab(subTab) {
    this.triggerHaptic();
    this.historySubTab = subTab;

    const btnReq = document.getElementById('subtab-completed-requests');
    const btnDon = document.getElementById('subtab-completed-donations');

    if (subTab === 'requests') {
      if (btnReq) btnReq.classList.add('active');
      if (btnDon) btnDon.classList.remove('active');
    } else {
      if (btnReq) btnReq.classList.remove('active');
      if (btnDon) btnDon.classList.add('active');
    }
    this.renderHistory();
  },

  applyFilters() {
    const groupSelect = document.getElementById('filter-blood-group');
    const districtSelect = document.getElementById('filter-district');

    this.selectedBloodGroup = groupSelect ? groupSelect.value : 'ALL';
    this.selectedDistrict = districtSelect ? districtSelect.value : 'ALL';

    this.renderAll();
  },

  renderAll() {
    this.renderHeroStats();
    this.renderRequests();
    this.renderDonors();
    this.renderHistory();
  },

  renderHeroStats() {
    const activeReqs = this.bloodRequests.filter(r => (parseInt(r.unitsNeeded, 10) - (r.unitsDonated || 0)) > 0);
    const completedReqs = this.bloodRequests.filter(r => (parseInt(r.unitsNeeded, 10) - (r.unitsDonated || 0)) <= 0);

    const statReq = document.getElementById('stat-active-requests');
    const statDon = document.getElementById('stat-registered-donors');
    const tabCountReq = document.getElementById('count-tab-requests');
    const tabCountDon = document.getElementById('count-tab-donors');
    const tabCountHist = document.getElementById('count-tab-history');

    if (statReq) statReq.textContent = activeReqs.length;
    if (statDon) statDon.textContent = this.bloodDonors.length;
    if (tabCountReq) tabCountReq.textContent = activeReqs.length;
    if (tabCountDon) tabCountDon.textContent = this.bloodDonors.length;
    if (tabCountHist) tabCountHist.textContent = completedReqs.length;
  },

  /**
   * SECTION 1: Render Active Emergency Blood Requests
   * Auto-disappears when balance = 0
   */
  renderRequests() {
    const container = document.getElementById('requests-list-container');
    if (!container) return;

    // Filter ONLY active requests where balance > 0
    let list = this.bloodRequests.filter(r => {
      const needed = parseInt(r.unitsNeeded || 1, 10);
      const donated = parseInt(r.unitsDonated || 0, 10);
      return (needed - donated) > 0;
    });

    if (this.selectedBloodGroup !== 'ALL') {
      if (this.selectedBloodGroup === 'ANY') {
        list = list.filter(r => r.bloodGroup === 'ANY');
      } else {
        list = list.filter(r => r.bloodGroup === this.selectedBloodGroup || r.bloodGroup === 'ANY');
      }
    }
    if (this.selectedDistrict !== 'ALL') {
      list = list.filter(r => r.district.toLowerCase() === this.selectedDistrict.toLowerCase());
    }

    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-family-state" style="padding: 24px 16px; text-align: center; background: #FFFFFF; border-radius: 16px; border: 1.5px dashed #CBD5E1;">
          <span style="font-size: 32px; display: block; margin-bottom: 6px;">🩺</span>
          <h4 style="font-size: 13.5px; font-weight: 800; color: #1E293B;">No Active Emergency Requests</h4>
          <p style="font-size: 11px; color: #64748B;">No patients currently need blood in ${this.selectedDistrict !== 'ALL' ? this.selectedDistrict : 'Tamil Nadu'}.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(req => {
      const isCritical = req.urgency === 'CRITICAL';
      const urgencyClass = isCritical ? 'urgency-critical' : (req.urgency === 'TODAY' ? 'urgency-today' : 'urgency-scheduled');
      const urgencyLabel = isCritical ? '🔴 CRITICAL (2-4 HRS)' : (req.urgency === 'TODAY' ? '🟡 NEEDED TODAY' : '🟢 SCHEDULED');

      const totalNeeded = parseInt(req.unitsNeeded || 1, 10);
      const donatedCount = parseInt(req.unitsDonated || 0, 10);
      const balance = Math.max(0, totalNeeded - donatedCount);

      const whatsappText = encodeURIComponent(
        `Hello ${req.attenderName}, I saw your emergency request on Selfcare Diagnostics Blood Connect for patient ${req.patientName} (${req.bloodGroup} at ${req.hospitalName}). I would like to volunteer to donate blood. Please confirm hospital details.`
      );

      return `
        <div class="request-card ${isCritical ? 'critical-card' : ''}" onclick="BloodPage.openPatientDetails('${req.id}')">
          <div class="card-top-head">
            <div class="blood-group-badge-circle">
              ${this.safeEscape(req.bloodGroup)}
              <small>BLOOD</small>
            </div>
            <div class="request-header-details">
              <h4>${this.safeEscape(req.patientName)}</h4>
              <span class="req-meta-sub">Attender: ${this.safeEscape(req.attenderName)} (${this.safeEscape(req.attenderRelation || 'Attender')})</span>
            </div>
            <span class="urgency-pill ${urgencyClass}">${urgencyLabel}</span>
          </div>

          <!-- Highlighted Units Progress Banner -->
          <div class="units-highlight-banner">
            <span class="units-text">🎯 Target: ${totalNeeded} Units Required</span>
            <span class="balance-tag">${donatedCount} Donated • ${balance} Units Balance</span>
          </div>

          <div class="card-hospital-box">
            <div class="hosp-line">
              <span>🏥</span>
              <strong>${this.safeEscape(req.hospitalName)}</strong>
            </div>
            <div class="ward-line">
              📍 ${this.safeEscape(req.hospitalWard || 'Emergency Ward')} • ${this.safeEscape(req.area)}, ${this.safeEscape(req.district)}
            </div>
          </div>

          <div class="card-action-bar" onclick="event.stopPropagation()">
            <button type="button" class="action-btn-call" onclick="BloodPage.promptDonorSafetyCall('${req.attenderPhone}', '${this.safeEscape(req.hospitalName)}')">
              📞 Call
            </button>
            <button type="button" class="action-btn-whatsapp" onclick="BloodPage.promptDonorSafetyWhatsApp('${req.attenderPhone}', '${whatsappText}', '${this.safeEscape(req.hospitalName)}')">
              💬 WhatsApp
            </button>
            <a href="${req.gpsLink || `https://maps.google.com/?q=${encodeURIComponent(req.hospitalName + ' ' + req.district)}`}" target="_blank" rel="noopener noreferrer" class="action-btn-map">
              🗺️ Map
            </a>
          </div>

          <div class="tap-view-hint">👆 Tap card to view full patient details & confirm donation</div>
        </div>
      `;
    }).join('');
  },

  /**
   * TOUCH PATIENT CARD -> OPEN FULL DETAILS & ATTENDER HANDSHAKE MODAL
   */
  openPatientDetails(reqId) {
    this.triggerHaptic();
    const req = this.bloodRequests.find(r => r.id === reqId);
    if (!req) return;

    const modalBody = document.getElementById('patient-details-body');
    if (!modalBody) return;

    const totalNeeded = parseInt(req.unitsNeeded || 1, 10);
    const donatedCount = parseInt(req.unitsDonated || 0, 10);
    const balance = Math.max(0, totalNeeded - donatedCount);

    // Current user context
    const user = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};
    const myPhone = String(localStorage.getItem('selfcare_active_user') || user.mobile || '').replace(/\D/g, '').slice(-10);
    const isAttender = myPhone && (myPhone === req.attenderPhone);

    const donorsList = req.donorsList || [];

    modalBody.innerHTML = `
      <div class="patient-detail-group">
        <div class="detail-row-item">
          <span class="detail-lbl">Patient Full Name:</span>
          <span class="detail-val">${this.safeEscape(req.patientName)}</span>
        </div>
        <div class="detail-row-item">
          <span class="detail-lbl">Age / Gender:</span>
          <span class="detail-val">${this.safeEscape(req.patientAgeGender || 'Not Specified')}</span>
        </div>
        <div class="detail-row-item">
          <span class="detail-lbl">Blood Group:</span>
          <span class="detail-val detail-highlight">${this.safeEscape(req.bloodGroup)}</span>
        </div>
        <div class="detail-row-item">
          <span class="detail-lbl">Component Type:</span>
          <span class="detail-val">${this.safeEscape(req.componentType || 'Whole Blood')}</span>
        </div>
      </div>

      <!-- Highlight Units Status -->
      <div class="units-highlight-banner" style="padding: 10px;">
        <div>
          <strong style="color: #9A3412; font-size: 13px;">${totalNeeded} Units Required</strong>
          <p style="font-size: 10.5px; color: #C2410C; margin: 2px 0 0 0;">${donatedCount} Person(s) Donated</p>
        </div>
        <span class="balance-tag" style="font-size: 11px; padding: 4px 10px;">${balance} Units Balance Needed</span>
      </div>

      <div class="patient-detail-group">
        <div class="detail-row-item">
          <span class="detail-lbl">Attender Name:</span>
          <span class="detail-val">${this.safeEscape(req.attenderName)}</span>
        </div>
        <div class="detail-row-item">
          <span class="detail-lbl">Relation with Patient:</span>
          <span class="detail-val" style="color: #045D49; font-weight: 900;">${this.safeEscape(req.attenderRelation || 'Attender')}</span>
        </div>
        <div class="detail-row-item">
          <span class="detail-lbl">Contact Phone:</span>
          <span class="detail-val">${this.safeEscape(req.attenderPhone)}</span>
        </div>
      </div>

      <div class="patient-detail-group">
        <div class="detail-row-item">
          <span class="detail-lbl">Hospital:</span>
          <span class="detail-val">${this.safeEscape(req.hospitalName)}</span>
        </div>
        <div class="detail-row-item">
          <span class="detail-lbl">Ward / Room / Bed:</span>
          <span class="detail-val">${this.safeEscape(req.hospitalWard || 'Emergency Ward')}</span>
        </div>
        <div class="detail-row-item">
          <span class="detail-lbl">District & Area:</span>
          <span class="detail-val">${this.safeEscape(req.area)}, ${this.safeEscape(req.district)}</span>
        </div>
      </div>

      <!-- ATTENDER CONFIRMATION HANDSHAKE SECTION -->
      ${isAttender ? `
        <div class="handshake-box">
          <h5>🤝 Attender Verification Panel</h5>
          <p style="font-size: 10.5px; color: #78350F; margin-bottom: 8px;">
            Donors who volunteer at the hospital will appear here. Click <strong>[Donated]</strong> only after blood collection is verified.
          </p>

          ${donorsList.length === 0 ? `
            <p style="font-size: 11px; color: #92400E; font-style: italic;">No donors have accepted this request yet.</p>
          ` : donorsList.map(d => `
            <div class="handshake-donor-item">
              <div>
                <strong style="font-size: 11.5px; color: #1E293B;">${this.safeEscape(d.donorName)}</strong>
                <div style="font-size: 9.5px; color: #64748B;">PIN: <span class="donor-pin-badge">${d.pin}</span> • ${d.donorPhone}</div>
              </div>
              <div class="handshake-actions">
                ${d.status === 'CONFIRMED' ? `
                  <span style="font-size: 10px; color: #047857; font-weight: 900;">✅ Confirmed Donated</span>
                ` : `
                  <button type="button" class="btn-confirm-donated" onclick="BloodPage.confirmDonationHandshake('${req.id}', '${d.donorId}', true)">
                    ✓ Donated
                  </button>
                  <button type="button" class="btn-cancel-donated" onclick="BloodPage.confirmDonationHandshake('${req.id}', '${d.donorId}', false)">
                    ✕ Not Donated
                  </button>
                `}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <!-- VOLUNTEER DONOR CTA -->
        <div style="margin-top: 6px;">
          <button type="button" class="modal-action-btn primary-glow-btn" onclick="BloodPage.volunteerForRequest('${req.id}')">
            🙋 I Am Ready to Donate for This Patient →
          </button>
        </div>
      `}

      <div class="card-action-bar" style="margin-top: 8px;">
        <button type="button" class="action-btn-call" onclick="BloodPage.promptDonorSafetyCall('${req.attenderPhone}', '${this.safeEscape(req.hospitalName)}')">
          📞 Direct Call
        </button>
        <button type="button" class="action-btn-whatsapp" onclick="BloodPage.promptDonorSafetyWhatsApp('${req.attenderPhone}', '', '${this.safeEscape(req.hospitalName)}')">
          💬 WhatsApp
        </button>
        <a href="${req.gpsLink || `https://maps.google.com/?q=${encodeURIComponent(req.hospitalName + ' ' + req.district)}`}" target="_blank" rel="noopener noreferrer" class="action-btn-map">
          🗺️ Hospital GPS
        </a>
      </div>
    `;

    this.openModal('modal-patient-details');
  },

  /**
   * VOLUNTEER DONATION HANDSHAKE
   */
  volunteerForRequest(reqId) {
    this.triggerHaptic();
    let myProfile = null;
    try {
      const stored = localStorage.getItem('selfcare_my_donor_profile');
      if (stored) myProfile = JSON.parse(stored);
    } catch (e) {}

    const user = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};
    const donorName = myProfile?.name || user.name || 'Voluntary Donor';
    const donorPhone = myProfile?.phone || String(localStorage.getItem('selfcare_active_user') || user.mobile || '').replace(/\D/g, '').slice(-10);

    if (!donorPhone) {
      this.safeShowToast('Please register as a donor first to volunteer!', 'error');
      this.closeModal('modal-patient-details');
      this.openDonorRegisterModal();
      return;
    }

    const req = this.bloodRequests.find(r => r.id === reqId);
    if (!req) return;

    if (!req.donorsList) req.donorsList = [];

    // Check if already volunteered
    const existing = req.donorsList.find(d => d.donorPhone === donorPhone);
    if (existing) {
      this.safeShowToast(`You already volunteered! Your Verification PIN is: ${existing.pin}`, 'info');
      return;
    }

    // Generate 4-digit verification PIN
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const donorRecord = {
      donorId: `VOL_${Date.now()}`,
      donorName,
      donorPhone,
      pin,
      status: 'PENDING',
      timestamp: new Date().toISOString()
    };

    req.donorsList.push(donorRecord);
    localStorage.setItem('selfcare_blood_requests', JSON.stringify(this.bloodRequests));

    alert(
      `🎉 THANK YOU LIFESAVER!\n\nYou have volunteered to donate blood for ${req.patientName}.\n\nYour 4-Digit Verification PIN is: [ ${pin} ]\n\nPlease give this PIN to the attender (${req.attenderName}) at ${req.hospitalName}.`
    );

    this.openPatientDetails(reqId);
  },

  /**
   * ATTENDER HANDSHAKE: Donated vs Not Donated
   */
  confirmDonationHandshake(reqId, donorId, isDonated) {
    this.triggerHaptic();
    const req = this.bloodRequests.find(r => r.id === reqId);
    if (!req || !req.donorsList) return;

    const donorObj = req.donorsList.find(d => d.donorId === donorId);
    if (!donorObj) return;

    if (isDonated) {
      donorObj.status = 'CONFIRMED';
      req.unitsDonated = (parseInt(req.unitsDonated || 0, 10)) + 1;

      // Update donor's local profile & donation tier
      try {
        let myProfile = JSON.parse(localStorage.getItem('selfcare_my_donor_profile') || '{}');
        if (myProfile && myProfile.phone === donorObj.donorPhone) {
          myProfile.donationCount = (myProfile.donationCount || 0) + 1;
          myProfile.lastDonationDate = new Date().toISOString().slice(0, 10);
          localStorage.setItem('selfcare_my_donor_profile', JSON.stringify(myProfile));
        }

        // Add to donor's completed history list
        let myHistory = JSON.parse(localStorage.getItem('selfcare_my_donation_history') || '[]');
        myHistory.unshift({
          patientName: req.patientName,
          hospitalName: req.hospitalName,
          district: req.district,
          date: new Date().toLocaleDateString('en-GB')
        });
        localStorage.setItem('selfcare_my_donation_history', JSON.stringify(myHistory));
      } catch (e) {}

      this.safeShowToast('Donation verified! Units balance updated ❤️', 'success');
    } else {
      donorObj.status = 'REJECTED';
      this.safeShowToast('Marked as Not Donated. Slot opened for other donors.', 'info');
    }

    localStorage.setItem('selfcare_blood_requests', JSON.stringify(this.bloodRequests));
    this.renderAll();
    this.openPatientDetails(reqId);
  },

  /**
   * SECTION 2: Render Verified Donors Directory
   */
  renderDonors() {
    const container = document.getElementById('donors-list-container');
    if (!container) return;

    let list = [...this.bloodDonors];

    if (this.selectedBloodGroup !== 'ALL') {
      list = list.filter(d => d.bloodGroup === this.selectedBloodGroup);
    }
    if (this.selectedDistrict !== 'ALL') {
      list = list.filter(d => d.district.toLowerCase() === this.selectedDistrict.toLowerCase());
    }

    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-family-state" style="padding: 24px 16px; text-align: center; background: #FFFFFF; border-radius: 16px; border: 1.5px dashed #CBD5E1;">
          <span style="font-size: 32px; display: block; margin-bottom: 6px;">🩸</span>
          <h4 style="font-size: 13.5px; font-weight: 800; color: #1E293B;">No Donors Registered Yet</h4>
          <p style="font-size: 11px; color: #64748B;">Be the first lifesaver from this district to register.</p>
          <button type="button" class="modal-action-btn primary-glow-btn" style="width: auto; margin: 8px auto 0; padding: 8px 16px;" onclick="BloodPage.openDonorRegisterModal()">
            Register as Donor →
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(d => {
      const cooldown = this.calculateCooldown(d.lastDonationDate);
      const isEligible = d.isAvailable && cooldown.canDonate;

      const whatsappText = encodeURIComponent(
        `Hello ${d.name}, we urgently need blood donation for a critical patient in ${d.district}. We found your profile on Selfcare Diagnostics Blood Connect. Could you please let us know if you are available?`
      );

      return `
        <div class="donor-card-item ${isEligible ? 'active-available' : ''}">
          <div class="donor-header-row">
            <div class="donor-info-left">
              <span class="donor-group-pill">${this.safeEscape(d.bloodGroup)}</span>
              <div class="donor-title-group">
                <h4>${this.safeEscape(d.name)}</h4>
                <span class="donor-meta-desc">${d.age} Yrs • ${this.safeEscape(d.gender)} • ${this.safeEscape(d.area)}, ${this.safeEscape(d.district)}</span>
              </div>
            </div>
            <span class="cooldown-pill ${isEligible ? 'available-tag' : 'cooldown-tag'}">
              ${isEligible ? '✅ Available' : cooldown.badgeText}
            </span>
          </div>

          <div class="donor-card-body">
            <div>
              <span class="d-label">Total Donations</span>
              <span class="d-val">⭐ ${d.donationCount || 1} Times</span>
            </div>
            <div>
              <span class="d-label">Last Donated</span>
              <span class="d-val">${d.lastDonationDate ? d.lastDonationDate : 'First Time Hero'}</span>
            </div>
          </div>

          <div class="donor-actions-row">
            <button type="button" class="action-btn-call" onclick="window.location.href='tel:${d.phone}'">
              📞 Call Donor
            </button>
            <button type="button" class="action-btn-whatsapp" onclick="window.location.href='https://wa.me/91${d.phone}?text=${whatsappText}'">
              💬 WhatsApp
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * SECTION 3: Completed Archive (Past Requests & Past Donations)
   */
  renderHistory() {
    const container = document.getElementById('history-list-container');
    if (!container) return;

    const completedReqs = this.bloodRequests.filter(r => (parseInt(r.unitsNeeded, 10) - (r.unitsDonated || 0)) <= 0);
    const countReqEl = document.getElementById('count-history-req');
    const countDonEl = document.getElementById('count-history-don');

    let myHistory = [];
    try {
      myHistory = JSON.parse(localStorage.getItem('selfcare_my_donation_history') || '[]');
    } catch (e) {}

    if (countReqEl) countReqEl.textContent = completedReqs.length;
    if (countDonEl) countDonEl.textContent = myHistory.length;

    if (this.historySubTab === 'requests') {
      if (completedReqs.length === 0) {
        container.innerHTML = `
          <div class="empty-family-state" style="padding: 24px; text-align: center; background: #FFFFFF; border-radius: 16px;">
            <p style="font-size: 11px; color: #64748B;">No completed requests archived yet.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = completedReqs.map(r => `
        <div class="request-card" style="border-color: #A7F3D0; background: #F0FDF9;">
          <div class="card-top-head">
            <div class="blood-group-badge-circle" style="background: #047857;">
              ${this.safeEscape(r.bloodGroup)}
            </div>
            <div class="request-header-details">
              <h4>${this.safeEscape(r.patientName)}</h4>
              <span class="req-meta-sub">${this.safeEscape(r.hospitalName)}, ${this.safeEscape(r.district)}</span>
            </div>
            <span class="urgency-pill urgency-scheduled">✅ 100% FULFILLED</span>
          </div>
          <p style="font-size: 10.5px; color: #065F46; margin-top: 4px; font-weight: 700;">
            All ${r.unitsNeeded} units successfully collected and confirmed by attender!
          </p>
        </div>
      `).join('');
    } else {
      if (myHistory.length === 0) {
        container.innerHTML = `
          <div class="empty-family-state" style="padding: 24px; text-align: center; background: #FFFFFF; border-radius: 16px;">
            <p style="font-size: 11px; color: #64748B;">You have not made any donations through the app yet.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = myHistory.map((h, i) => `
        <div class="request-card" style="border-color: #CBD5E1;">
          <div class="card-top-head">
            <span style="font-size: 24px;">🎖️</span>
            <div class="request-header-details">
              <h4>Donation #${myHistory.length - i} for ${this.safeEscape(h.patientName)}</h4>
              <span class="req-meta-sub">${this.safeEscape(h.hospitalName)} • ${this.safeEscape(h.district)}</span>
            </div>
            <span style="font-size: 10px; font-weight: 800; color: #045D49;">${h.date}</span>
          </div>
        </div>
      `).join('');
    }
  },

  calculateCooldown(lastDateStr) {
    if (!lastDateStr) return { canDonate: true, badgeText: 'Available', daysRemaining: 0 };

    try {
      const lastDate = new Date(lastDateStr);
      if (isNaN(lastDate.getTime())) return { canDonate: true, badgeText: 'Available', daysRemaining: 0 };

      const diffTime = Date.now() - lastDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const requiredGapDays = 90;

      if (diffDays >= requiredGapDays) {
        return { canDonate: true, badgeText: 'Available', daysRemaining: 0 };
      } else {
        const remaining = requiredGapDays - diffDays;
        return { canDonate: false, badgeText: `⏳ Cooldown (${remaining}d left)`, daysRemaining: remaining };
      }
    } catch (e) {
      return { canDonate: true, badgeText: 'Available', daysRemaining: 0 };
    }
  },

  promptDonorSafetyCall(phone, hospitalName) {
    this.triggerHaptic();
    const confirmed = confirm(
      `⚠️ DONOR SAFETY ADVISORY:\n\nPlease confirm you are meeting strictly inside "${hospitalName}".\n\nNEVER meet attenders at private residences or isolated spots.\n\nProceed to call ${phone}?`
    );
    if (confirmed) {
      window.location.href = `tel:${phone}`;
    }
  },

  promptDonorSafetyWhatsApp(phone, text, hospitalName) {
    this.triggerHaptic();
    const confirmed = confirm(
      `⚠️ DONOR SAFETY ADVISORY:\n\nEnsure donations take place inside "${hospitalName}".\n\nOpen WhatsApp chat?`
    );
    if (confirmed) {
      window.location.href = `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
    }
  },

  handleRequestSubmit(event) {
    event.preventDefault();
    this.triggerHaptic();

    const patientName = document.getElementById('req-patient-name').value.trim();
    const patientAgeGender = document.getElementById('req-patient-age-gender').value.trim();
    const attenderName = document.getElementById('req-attender-name').value.trim();
    const attenderRelation = document.getElementById('req-attender-relation').value;
    const attenderPhone = document.getElementById('req-attender-phone').value.replace(/\D/g, '').slice(-10);
    const urgency = document.getElementById('req-urgency-level').value;
    const bloodGroup = document.getElementById('req-blood-group').value;
    const unitsNeeded = parseInt(document.getElementById('req-units').value, 10);
    const componentType = document.getElementById('req-component-type').value;

    const hospitalName = document.getElementById('req-hospital-name').value.trim();
    const hospitalWard = document.getElementById('req-hospital-ward').value.trim();
    const district = document.getElementById('req-hospital-district').value;
    const area = document.getElementById('req-hospital-area').value.trim();
    const gpsLink = document.getElementById('req-hospital-gps').value.trim();

    if (!patientName || !attenderName) {
      this.safeShowToast('Please provide patient and attender names', 'error');
      return;
    }

    if (!attenderPhone || attenderPhone.length !== 10) {
      this.safeShowToast('Please enter a valid 10-digit mobile number', 'error');
      return;
    }

    const newRequest = {
      id: `REQ_${Date.now()}`,
      patientName,
      patientAgeGender,
      attenderName,
      attenderRelation,
      attenderPhone,
      bloodGroup,
      componentType,
      unitsNeeded,
      unitsDonated: 0,
      urgency,
      hospitalName,
      hospitalWard: hospitalWard || 'Emergency Ward',
      district,
      area,
      gpsLink: gpsLink || `https://maps.google.com/?q=${encodeURIComponent(hospitalName + ' ' + district)}`,
      createdAt: new Date().toISOString(),
      donorsList: []
    };

    this.bloodRequests.unshift(newRequest);
    localStorage.setItem('selfcare_blood_requests', JSON.stringify(this.bloodRequests));

    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      Api.request('saveBloodRequest', newRequest, false).catch(() => {});
    }

    this.renderAll();
    this.closeModal('modal-blood-request');
    this.switchTab('requests');

    this.safeShowToast('Emergency request posted across Tamil Nadu! 🚨', 'success');
  },

  handleDonorSubmit(event) {
    event.preventDefault();
    this.triggerHaptic();

    const name = document.getElementById('donor-name').value.trim();
    const phone = document.getElementById('donor-phone').value.replace(/\D/g, '').slice(-10);
    const bloodGroup = document.getElementById('donor-blood-group').value;
    const age = parseInt(document.getElementById('donor-age').value, 10);
    const gender = document.getElementById('donor-gender').value;
    const district = document.getElementById('donor-district').value;
    const area = document.getElementById('donor-area').value.trim();
    const gpsLink = document.getElementById('donor-gps').value.trim();
    const lastDate = document.getElementById('donor-last-date').value;
    const isAvailable = document.getElementById('donor-available-toggle').checked;

    if (!name || phone.length !== 10) {
      this.safeShowToast('Please enter valid donor details and 10-digit phone', 'error');
      return;
    }

    const newDonor = {
      id: `DON_${Date.now()}`,
      name,
      phone,
      bloodGroup,
      age,
      gender,
      district,
      area,
      gpsLink: gpsLink || '',
      lastDonationDate: lastDate || '',
      donationCount: 1,
      isAvailable
    };

    this.bloodDonors = this.bloodDonors.filter(d => d.phone !== phone);
    this.bloodDonors.unshift(newDonor);
    localStorage.setItem('selfcare_blood_donors', JSON.stringify(this.bloodDonors));
    localStorage.setItem('selfcare_my_donor_profile', JSON.stringify(newDonor));

    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      Api.request('registerBloodDonor', newDonor, false).catch(() => {});
    }

    this.renderAll();
    this.closeModal('modal-donor-register');
    this.switchTab('donors');

    this.safeShowToast(`Thank you ${name}! You are registered as a Lifesaver ❤️`, 'success');
    setTimeout(() => this.openMyCertificateModal(), 800);
  },

  /**
   * E-CERTIFICATE MODAL & GAMIFIED TIERS
   */
  openMyCertificateModal() {
    this.triggerHaptic();

    let myProfile = null;
    try {
      const stored = localStorage.getItem('selfcare_my_donor_profile');
      if (stored) myProfile = JSON.parse(stored);
    } catch (e) {}

    const user = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};
    const name = myProfile?.name || user.name || 'Valued Lifesaver';
    const group = myProfile?.bloodGroup || user.bloodGroup || 'O +ve';
    const count = parseInt(myProfile?.donationCount || 1, 10);

    const nameEl = document.getElementById('cert-donor-name');
    const groupEl = document.getElementById('cert-donor-group');
    const countEl = document.getElementById('cert-donations-count');
    const dateEl = document.getElementById('cert-issue-date');
    const badgeEl = document.getElementById('cert-tier-badge');

    if (nameEl) nameEl.textContent = name;
    if (groupEl) groupEl.textContent = group;
    if (countEl) countEl.textContent = `${count} ${count > 1 ? 'Times' : 'Time'}`;
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // Determine Gamified Tier Badge
    if (badgeEl) {
      badgeEl.className = 'cert-badge-tag';
      if (count === 1) {
        badgeEl.classList.add('tier-bronze');
        badgeEl.textContent = '🥉 BRONZE LIFESAVER (1 DONATION)';
      } else if (count === 2) {
        badgeEl.classList.add('tier-silver');
        badgeEl.textContent = '🥈 SILVER LIFESAVER (2 DONATIONS)';
      } else if (count === 3) {
        badgeEl.classList.add('tier-gold');
        badgeEl.textContent = '🥇 GOLD LIFESAVER (3 DONATIONS)';
      } else if (count >= 4 && count <= 5) {
        badgeEl.classList.add('tier-platinum');
        badgeEl.textContent = `💎 PLATINUM LIFESAVER (${count} DONATIONS)`;
      } else if (count >= 6 && count <= 9) {
        badgeEl.classList.add('tier-diamond');
        badgeEl.textContent = `👑 DIAMOND CHAMPION (${count} DONATIONS)`;
      } else {
        badgeEl.classList.add('tier-legendary');
        badgeEl.textContent = `🌟 LEGENDARY LIFESAVER CIRCLE (${count}+ DONATIONS)`;
      }
    }

    this.openModal('modal-certificate');
  },

  /**
   * DIRECT IMAGE SHARE TO WHATSAPP VIA HTML2CANVAS & WEB SHARE API
   */
  async shareCertificateDirect() {
    this.triggerHaptic();
    const certNode = document.getElementById('certificate-render-node');
    if (!certNode) return;

    if (typeof html2canvas === 'undefined') {
      this.safeShowToast('Image generator loading... please try again.', 'info');
      return;
    }

    const shareBtn = document.getElementById('btn-share-certificate');
    const originalText = shareBtn ? shareBtn.textContent : '';
    if (shareBtn) shareBtn.textContent = '⏳ Rendering Image...';

    try {
      const canvas = await html2canvas(certNode, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#FFFFFF'
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          if (shareBtn) shareBtn.textContent = originalText;
          return;
        }

        const file = new File([blob], 'Selfcare-Lifesaver-Certificate.png', { type: 'image/png' });

        // Native Web Share API (Direct WhatsApp File Share)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Selfcare Lifesaver Certificate',
              text: 'Proud to be a voluntary blood donor with Selfcare Diagnostics! 🩸 Join the circle: https://selfcarediagnostics.in/blood.html'
            });
            if (shareBtn) shareBtn.textContent = originalText;
          } catch (shareErr) {
            if (shareBtn) shareBtn.textContent = originalText;
          }
        } else {
          // Fallback: Download file and open WhatsApp chat
          const link = document.createElement('a');
          link.download = 'Selfcare-Lifesaver-Certificate.png';
          link.href = canvas.toDataURL('image/png');
          link.click();

          const text = encodeURIComponent(
            `Proud to be a voluntary blood donor with Selfcare Diagnostics! 🩸 (Attached is my Lifesaver Certificate). Join us: https://selfcarediagnostics.in/blood.html`
          );
          setTimeout(() => {
            window.location.href = `https://wa.me/?text=${text}`;
          }, 800);
          if (shareBtn) shareBtn.textContent = originalText;
        }
      }, 'image/png');
    } catch (err) {
      if (shareBtn) shareBtn.textContent = originalText;
      this.safeShowToast('Could not generate image. Please try screenshot.', 'error');
    }
  },

  async downloadCertificateImage() {
    this.triggerHaptic();
    const certNode = document.getElementById('certificate-render-node');
    if (!certNode || typeof html2canvas === 'undefined') return;

    this.safeShowToast('Downloading certificate...', 'info');
    try {
      const canvas = await html2canvas(certNode, { scale: 2.5, useCORS: true, backgroundColor: '#FFFFFF' });
      const link = document.createElement('a');
      link.download = `Selfcare-Certificate-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      this.safeShowToast('Certificate downloaded successfully!', 'success');
    } catch (e) {
      this.safeShowToast('Download failed. Please take a screenshot.', 'error');
    }
  },

  detectGpsLocation(targetId) {
    this.triggerHaptic();
    if (!navigator.geolocation) {
      this.safeShowToast('GPS not supported on your browser', 'error');
      return;
    }
    this.safeShowToast('Detecting clinical GPS location...', 'info');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const url = `https://maps.google.com/?q=${lat},${lng}`;
        const input = document.getElementById(targetId);
        if (input) input.value = url;
        this.safeShowToast('GPS coordinates fetched successfully!', 'success');
      },
      () => {
        this.safeShowToast('Could not fetch GPS. Please enable location permissions.', 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  },

  openRequestModal() {
    this.triggerHaptic();
    this.populateUserContext();
    this.openModal('modal-blood-request');
  },

  openDonorRegisterModal() {
    this.triggerHaptic();
    this.populateUserContext();
    this.openModal('modal-donor-register');
  },

  openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  },

  closeModal(id) {
    this.triggerHaptic();
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  BloodPage.init();
});

if (typeof window !== 'undefined') window.BloodPage = BloodPage;
if (typeof module !== 'undefined' && module.exports) module.exports = BloodPage;
