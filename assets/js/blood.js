/* file: assets/js/blood.js */
/**
 * Selfcare Diagnostics - Emergency Blood Connect Controller v15.0.0
 * Backend Cloud Synchronized Edition:
 * 1. Zero-Typing Smart Auto-Fill: Form open aanaale logged-in user-oda Name, Phone, Blood Group, Age, Gender, District, Area ellam automatic-aa pre-fill aagum.
 * 2. Realtime Two-Way Cloud Handshake: Pledging, PIN Verification, and Status updates are saved directly to Google Sheets (BloodRequests & BloodDonors).
 * 3. Permanent Donor Profile Hydration: Cloud-la irunthu donor profile, donation count, and permanent PIN auto-restores even after browser cache clear.
 * 4. Strict Ownership Guard & Pinned 'YOU' card preserved.
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
      this.ensurePermanentDonorPin();
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

  /**
   * PERMANENT RAPIDO-LIKE DONOR PIN (Fixed forever for this user)
   */
  ensurePermanentDonorPin() {
    let pin = localStorage.getItem('selfcare_donor_permanent_pin');
    if (!pin || pin.length !== 4) {
      pin = String(Math.floor(1000 + Math.random() * 9000));
      localStorage.setItem('selfcare_donor_permanent_pin', pin);
    }
    return pin;
  },

  getMyDonorPin() {
    return localStorage.getItem('selfcare_donor_permanent_pin') || this.ensurePermanentDonorPin();
  },

  /**
   * ACCURATE LOGGED-IN USER PHONE & PROFILE DETAILS
   */
  getMyPhone() {
    let ph = '';
    try {
      const user = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};
      ph = user.mobile || localStorage.getItem('selfcare_active_user') || '';
      if (!ph) {
        const storedDonor = JSON.parse(localStorage.getItem('selfcare_my_donor_profile') || '{}');
        ph = storedDonor.phone || '';
      }
    } catch (e) {}
    return String(ph || '').replace(/\D/g, '').slice(-10);
  },

  getMyProfile() {
    let profile = {
      name: '',
      phone: this.getMyPhone(),
      bloodGroup: '',
      age: '',
      gender: 'Male',
      district: 'Chennai',
      area: ''
    };

    try {
      const user = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};
      if (user.name) profile.name = user.name;
      if (user.bloodGroup) profile.bloodGroup = user.bloodGroup;
      if (user.age) profile.age = user.age;
      if (user.gender) profile.gender = user.gender;
      if (user.location) profile.district = user.location;
      if (user.address) profile.area = user.address;

      const storedDonor = JSON.parse(localStorage.getItem('selfcare_my_donor_profile') || '{}');
      if (storedDonor.name) profile.name = storedDonor.name;
      if (storedDonor.phone) profile.phone = storedDonor.phone;
      if (storedDonor.bloodGroup) profile.bloodGroup = storedDonor.bloodGroup;
      if (storedDonor.age) profile.age = storedDonor.age;
      if (storedDonor.gender) profile.gender = storedDonor.gender;
      if (storedDonor.district) profile.district = storedDonor.district;
      if (storedDonor.area) profile.area = storedDonor.area;
      if (storedDonor.lastDonationDate) profile.lastDonationDate = storedDonor.lastDonationDate;
    } catch (e) {}

    return profile;
  },

  getMyName() {
    const prof = this.getMyProfile();
    return prof.name || 'Voluntary Donor';
  },

  /**
   * STRICT POST OWNER CHECK:
   * Returns true ONLY if the current logged-in phone matches the attender's phone.
   */
  isMyCreatedRequest(reqAttenderPhone) {
    const myPhone = this.getMyPhone();
    if (!myPhone) return false;
    const cleanAttenderPhone = String(reqAttenderPhone || '').replace(/\D/g, '').slice(-10);
    return cleanAttenderPhone !== '' && myPhone === cleanAttenderPhone;
  },

  hasActivePledgedSos() {
    const myPhone = this.getMyPhone();
    if (!myPhone) return null;
    for (const req of this.bloodRequests) {
      if ((req.unitsNeeded - (req.unitsDonated || 0)) > 0 && Array.isArray(req.donorsList)) {
        const found = req.donorsList.find(d => d.donorPhone === myPhone && d.status === 'ACCEPTED');
        if (found) return req;
      }
    }
    return null;
  },

  /**
   * ZERO-TYPING SMART AUTO-FILL ENGINE
   * Pre-populates all inputs from Backend User Profile / Donor Profile
   */
  populateUserContext() {
    try {
      const prof = this.getMyProfile();

      // 1. Auto-fill Request Modal Inputs (SOS Form)
      const reqAttender = document.getElementById('req-attender-name');
      const reqPhone = document.getElementById('req-attender-phone');
      const reqDist = document.getElementById('req-hospital-district');
      const reqArea = document.getElementById('req-hospital-area');

      if (reqAttender && !reqAttender.value && prof.name) reqAttender.value = prof.name;
      if (reqPhone && !reqPhone.value && prof.phone) reqPhone.value = prof.phone;
      if (reqArea && !reqArea.value && prof.area) reqArea.value = prof.area;

      if (reqDist && prof.district) {
        for (let i = 0; i < reqDist.options.length; i++) {
          if (reqDist.options[i].value.toLowerCase() === prof.district.toLowerCase()) {
            reqDist.selectedIndex = i;
            break;
          }
        }
      }

      // 2. Auto-fill Donor Registration Modal Inputs
      const donName = document.getElementById('donor-name');
      const donPhone = document.getElementById('donor-phone');
      const donGroup = document.getElementById('donor-blood-group');
      const donAge = document.getElementById('donor-age');
      const donGender = document.getElementById('donor-gender');
      const donDist = document.getElementById('donor-district');
      const donArea = document.getElementById('donor-area');
      const donLastDate = document.getElementById('donor-last-date');

      if (donName && prof.name) donName.value = prof.name;
      if (donPhone && prof.phone) donPhone.value = prof.phone;
      if (donAge && prof.age) donAge.value = prof.age;
      if (donArea && prof.area) donArea.value = prof.area;
      if (donLastDate && prof.lastDonationDate) donLastDate.value = prof.lastDonationDate;

      if (donGroup && prof.bloodGroup) {
        for (let i = 0; i < donGroup.options.length; i++) {
          if (donGroup.options[i].value.toLowerCase() === prof.bloodGroup.toLowerCase()) {
            donGroup.selectedIndex = i;
            break;
          }
        }
      }

      if (donGender && prof.gender) {
        for (let i = 0; i < donGender.options.length; i++) {
          if (donGender.options[i].value.toLowerCase() === prof.gender.toLowerCase()) {
            donGender.selectedIndex = i;
            break;
          }
        }
      }

      if (donDist && prof.district) {
        for (let i = 0; i < donDist.options.length; i++) {
          if (donDist.options[i].value.toLowerCase() === prof.district.toLowerCase()) {
            donDist.selectedIndex = i;
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[BloodConnect] Auto-fill notice:', e);
    }
  },

  loadBloodData() {
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

  /**
   * TWO-WAY REALTIME CLOUD SYNC WITH GOOGLE SHEETS
   */
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

          // Hydrate current user's donor profile directly from backend
          const myPhone = this.getMyPhone();
          if (myPhone) {
            const myServerProfile = res.donors.find(d => String(d.phone).slice(-10) === myPhone);
            if (myServerProfile) {
              localStorage.setItem('selfcare_my_donor_profile', JSON.stringify(myServerProfile));
              if (myServerProfile.permanentPin) {
                localStorage.setItem('selfcare_donor_permanent_pin', myServerProfile.permanentPin);
              }
            }
          }
        }
        this.renderAll();
      }
    } catch (e) {
      console.warn('[BloodConnect] Cloud sync notice:', e);
    }
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

  renderRequests() {
    const container = document.getElementById('requests-list-container');
    if (!container) return;

    const myPhone = this.getMyPhone();

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
          <p style="font-size: 11px; color: #64748B;">No open emergency requests in ${this.selectedDistrict !== 'ALL' ? this.selectedDistrict : 'Tamil Nadu'}.</p>
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

      const donorsList = req.donorsList || [];
      const acceptedCount = donorsList.filter(d => d.status === 'ACCEPTED' || d.status === 'CONFIRMED').length;
      const isSlotsFull = acceptedCount >= totalNeeded;

      const isOwner = this.isMyCreatedRequest(req.attenderPhone);
      const hasMeAccepted = myPhone && donorsList.some(d => d.donorPhone === myPhone && d.status === 'ACCEPTED');

      const whatsappText = encodeURIComponent(
        `Hello ${req.attenderName}, I saw your emergency request on Selfcare Diagnostics Blood Connect for patient ${req.patientName} (${req.bloodGroup} at ${req.hospitalName}). I would like to volunteer to donate blood.`
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

          <div class="units-highlight-banner">
            <span class="units-text">🎯 Target: ${totalNeeded} Units Required</span>
            <span class="balance-tag">${donatedCount} Donated • ${balance} Units Balance</span>
          </div>

          ${donorsList.length > 0 ? `
            <div class="card-accepted-donors-box">
              <span class="accepted-head">Lifesavers on the way (${acceptedCount}/${totalNeeded}):</span>
              <div class="donor-chips-wrap">
                ${donorsList.map(d => `
                  <span class="donor-status-chip ${d.status === 'CONFIRMED' ? 'chip-confirmed' : 'chip-accepted'}">
                    🩸 ${this.safeEscape(d.donorName)} (${d.status === 'CONFIRMED' ? '✅ Donated' : 'Ready to donate'})
                  </span>
                `).join('')}
              </div>
            </div>
          ` : ''}

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

            ${isOwner ? `
              <button type="button" class="action-btn-owner-panel" onclick="BloodPage.openPatientDetails('${req.id}')">
                ⚙️ Verify PIN
              </button>
            ` : hasMeAccepted ? `
              <button type="button" class="action-btn-accepted" onclick="BloodPage.openPatientDetails('${req.id}')">
                ✓ Pledged
              </button>
            ` : isSlotsFull ? `
              <button type="button" class="action-btn-full" disabled>
                🔒 Full
              </button>
            ` : `
              <button type="button" class="action-btn-accept-outer" onclick="BloodPage.volunteerForRequest('${req.id}')">
                🙋 Accept SOS
              </button>
            `}
          </div>

          <div class="tap-view-hint">👆 Tap card to view full details</div>
        </div>
      `;
    }).join('');
  },

  openPatientDetails(reqId) {
    this.triggerHaptic();
    const req = this.bloodRequests.find(r => r.id === reqId);
    if (!req) return;

    const modalBody = document.getElementById('patient-details-body');
    if (!modalBody) return;

    const totalNeeded = parseInt(req.unitsNeeded || 1, 10);
    const donatedCount = parseInt(req.unitsDonated || 0, 10);
    const balance = Math.max(0, totalNeeded - donatedCount);

    const isOwner = this.isMyCreatedRequest(req.attenderPhone);
    const myPhone = this.getMyPhone();
    const myPermanentPin = this.getMyDonorPin();

    const donorsList = req.donorsList || [];
    const acceptedCount = donorsList.filter(d => d.status === 'ACCEPTED' || d.status === 'CONFIRMED').length;
    const isSlotsFull = acceptedCount >= totalNeeded;
    const myPledge = myPhone ? donorsList.find(d => d.donorPhone === myPhone) : null;

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

      <div class="units-highlight-banner" style="padding: 10px;">
        <div>
          <strong style="color: #9A3412; font-size: 13px;">${totalNeeded} Units Required</strong>
          <p style="font-size: 10.5px; color: #C2410C; margin: 2px 0 0 0;">${donatedCount} Confirmed • ${acceptedCount} Pledged</p>
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

      <!-- CONDITIONAL VIEW: OWNER SEES VERIFY PIN, ALL OTHERS SEE ACCEPT -->
      ${isOwner ? `
        <div class="handshake-box">
          <h5>🔐 Attender PIN Verification Panel</h5>
          <p style="font-size: 10.5px; color: #78350F; margin-bottom: 8px;">
            Ask the voluntary donor for their <strong>4-Digit Lifesaver PIN</strong> when they arrive at the hospital. Enter the PIN to confirm blood collection.
          </p>

          ${donorsList.length === 0 ? `
            <div style="padding: 10px; background: #FEF3C7; border-radius: 8px; text-align: center;">
              <p style="font-size: 11px; color: #92400E; margin: 0; font-weight: 700;">Waiting for donors to accept this request...</p>
            </div>
          ` : donorsList.map(d => `
            <div class="handshake-donor-item">
              <div>
                <strong style="font-size: 12px; color: #0F172A;">${this.safeEscape(d.donorName)}</strong>
                <div style="font-size: 10px; color: #64748B;">📞 ${this.safeEscape(d.donorPhone)}</div>
              </div>

              ${d.status === 'CONFIRMED' ? `
                <span class="verified-done-tag">✅ Confirmed Donated</span>
              ` : `
                <div class="pin-verify-action-group">
                  <input type="tel" maxlength="4" placeholder="4-Digit PIN" id="input-pin-${d.donorId}" class="pin-entry-input">
                  <button type="button" class="btn-verify-pin" onclick="BloodPage.verifyDonorPin('${req.id}', '${d.donorId}')">
                    Verify PIN ✓
                  </button>
                  <button type="button" class="btn-reject-donor" onclick="BloodPage.rejectDonor('${req.id}', '${d.donorId}')" title="Not Donated">
                    ✕
                  </button>
                </div>
              `}
            </div>
          `).join('')}
        </div>
      ` : `
        ${myPledge ? `
          <div class="donor-pin-showcase-box animate-pop">
            <span class="pin-showcase-tag">YOUR PERMANENT LIFESAVER PIN</span>
            <div class="pin-display-giant">${myPermanentPin}</div>
            <p class="pin-instructions">
              Please visit <strong>${this.safeEscape(req.hospitalName)}</strong> and provide this 4-digit PIN to attender <strong>${this.safeEscape(req.attenderName)}</strong> to verify your donation.
            </p>
          </div>
        ` : isSlotsFull ? `
          <div class="slots-full-notice">
            🔒 Required units have already been pledged by lifesavers on the way.
          </div>
        ` : `
          <div style="margin-top: 6px;">
            <button type="button" class="modal-action-btn primary-glow-btn" onclick="BloodPage.volunteerForRequest('${req.id}')">
              🙋 I Am Ready to Donate for This Patient →
            </button>
          </div>
        `}
      `}

      <div class="card-action-bar" style="margin-top: 10px;">
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
   * VOLUNTEER PLEDGE HANDSHAKE -> SAVED TO LOCAL + GOOGLE SHEETS
   */
  volunteerForRequest(reqId) {
    this.triggerHaptic();
    const myPhone = this.getMyPhone();

    if (!myPhone) {
      this.safeShowToast('Please register as a donor first to volunteer!', 'error');
      this.closeModal('modal-patient-details');
      this.openDonorRegisterModal();
      return;
    }

    const req = this.bloodRequests.find(r => r.id === reqId);
    if (!req) return;

    if (this.isMyCreatedRequest(req.attenderPhone)) {
      this.safeShowToast('You created this SOS request! Only other voluntary donors can accept.', 'error');
      return;
    }

    let myProfile = null;
    try {
      myProfile = JSON.parse(localStorage.getItem('selfcare_my_donor_profile') || '{}');
    } catch (e) {}

    if (myProfile && myProfile.lastDonationDate) {
      const cooldown = this.calculateCooldown(myProfile.lastDonationDate);
      if (!cooldown.canDonate) {
        alert(`⚠️ Medical Cooldown Active:\nYou recently donated blood. You must wait ${cooldown.daysRemaining} more days before accepting another donation.`);
        return;
      }
    }

    const activePledgedReq = this.hasActivePledgedSos();
    if (activePledgedReq && activePledgedReq.id !== reqId) {
      alert(`⚠️ Active SOS in Progress:\nYou have already accepted to donate for patient "${activePledgedReq.patientName}" at ${activePledgedReq.hospitalName}. Please complete or cancel that donation before accepting another SOS.`);
      return;
    }

    if (!req.donorsList) req.donorsList = [];

    const totalNeeded = parseInt(req.unitsNeeded || 1, 10);
    const currentAccepted = req.donorsList.filter(d => d.status === 'ACCEPTED' || d.status === 'CONFIRMED').length;
    if (currentAccepted >= totalNeeded) {
      alert('This request already has the required number of donors on the way!');
      return;
    }

    const existing = req.donorsList.find(d => d.donorPhone === myPhone);
    const permanentPin = this.getMyDonorPin();

    if (existing) {
      this.safeShowToast(`You already accepted! Your permanent PIN is: ${permanentPin}`, 'info');
      this.openPatientDetails(reqId);
      return;
    }

    const donorRecord = {
      donorId: `VOL_${Date.now()}`,
      donorName: this.getMyName(),
      donorPhone: myPhone,
      pin: permanentPin,
      status: 'ACCEPTED',
      timestamp: new Date().toISOString()
    };

    req.donorsList.push(donorRecord);
    localStorage.setItem('selfcare_blood_requests', JSON.stringify(this.bloodRequests));

    // CLOUD SYNC: Update Google Sheets in background
    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      Api.request('updateBloodRequest', {
        id: req.id,
        donorsList: req.donorsList
      }, false).catch(err => console.warn('[BloodConnect] Cloud pledge sync notice:', err));
    }

    alert(
      `🎉 DONATION PLEDGE ACCEPTED!\n\nYour Permanent Lifesaver PIN is: [ ${permanentPin} ]\n\nPlease reach "${req.hospitalName}" and give this 4-digit PIN to attender "${req.attenderName}".`
    );

    this.renderAll();
    this.openPatientDetails(reqId);
  },

  /**
   * ATTENDER PIN VERIFICATION -> SAVED TO LOCAL + GOOGLE SHEETS
   */
  verifyDonorPin(reqId, donorId) {
    this.triggerHaptic();
    const req = this.bloodRequests.find(r => r.id === reqId);
    if (!req || !req.donorsList) return;

    const donorObj = req.donorsList.find(d => d.donorId === donorId);
    if (!donorObj) return;

    const inputEl = document.getElementById(`input-pin-${donorId}`);
    const enteredPin = inputEl ? inputEl.value.trim() : '';

    if (!enteredPin || enteredPin.length !== 4) {
      this.safeShowToast('Please enter the 4-digit PIN provided by the donor', 'error');
      return;
    }

    if (enteredPin !== String(donorObj.pin)) {
      alert('❌ INCORRECT PIN!\nThe entered PIN does not match the donor’s PIN. Please verify with the donor.');
      return;
    }

    donorObj.status = 'CONFIRMED';
    req.unitsDonated = (parseInt(req.unitsDonated || 0, 10)) + 1;

    try {
      let myProfile = JSON.parse(localStorage.getItem('selfcare_my_donor_profile') || '{}');
      if (myProfile && myProfile.phone === donorObj.donorPhone) {
        myProfile.donationCount = (myProfile.donationCount || 0) + 1;
        myProfile.lastDonationDate = new Date().toISOString().slice(0, 10);
        localStorage.setItem('selfcare_my_donor_profile', JSON.stringify(myProfile));
      }

      let myHistory = JSON.parse(localStorage.getItem('selfcare_my_donation_history') || '[]');
      myHistory.unshift({
        patientName: req.patientName,
        hospitalName: req.hospitalName,
        district: req.district,
        date: new Date().toLocaleDateString('en-GB')
      });
      localStorage.setItem('selfcare_my_donation_history', JSON.stringify(myHistory));
    } catch (e) {}

    localStorage.setItem('selfcare_blood_requests', JSON.stringify(this.bloodRequests));

    const totalNeeded = parseInt(req.unitsNeeded || 1, 10);
    const balance = Math.max(0, totalNeeded - req.unitsDonated);

    // CLOUD SYNC: Reflect in Google Sheets
    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      Api.request('updateBloodRequest', {
        id: req.id,
        unitsDonated: req.unitsDonated,
        donorsList: req.donorsList,
        status: balance === 0 ? 'COMPLETED' : 'ACTIVE'
      }, false).catch(err => console.warn('[BloodConnect] Cloud verification sync notice:', err));

      // Sync donor's updated donation count to Cloud sheet 'BloodDonors'
      let myProfile = JSON.parse(localStorage.getItem('selfcare_my_donor_profile') || '{}');
      if (myProfile && myProfile.phone === donorObj.donorPhone) {
        Api.request('registerBloodDonor', myProfile, false).catch(() => {});
      }
    }

    if (balance === 0) {
      alert(`🎉 100% BLOOD UNITS COLLECTED!\n\nAll ${totalNeeded} units have been verified with donor PINs. This emergency request is now completed and archived.`);
      this.closeModal('modal-patient-details');
    } else {
      this.safeShowToast(`PIN Verified! ${balance} more units required.`, 'success');
      this.openPatientDetails(reqId);
    }

    this.renderAll();
  },

  rejectDonor(reqId, donorId) {
    this.triggerHaptic();
    const confirmed = confirm('Mark this donor as Not Donated? This will open the slot for another lifesaver.');
    if (!confirmed) return;

    const req = this.bloodRequests.find(r => r.id === reqId);
    if (!req || !req.donorsList) return;

    req.donorsList = req.donorsList.filter(d => d.donorId !== donorId);
    localStorage.setItem('selfcare_blood_requests', JSON.stringify(this.bloodRequests));

    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      Api.request('updateBloodRequest', {
        id: req.id,
        donorsList: req.donorsList
      }, false).catch(() => {});
    }

    this.safeShowToast('Donor removed. Slot opened for others.', 'info');
    this.renderAll();
    this.openPatientDetails(reqId);
  },

  renderDonors() {
    const container = document.getElementById('donors-list-container');
    if (!container) return;

    const myPhone = this.getMyPhone();
    let list = [...this.bloodDonors];

    if (this.selectedBloodGroup !== 'ALL') {
      list = list.filter(d => d.bloodGroup === this.selectedBloodGroup);
    }
    if (this.selectedDistrict !== 'ALL') {
      list = list.filter(d => d.district.toLowerCase() === this.selectedDistrict.toLowerCase());
    }

    // 🌟 PIN CURRENT USER FIXED AT THE VERY TOP
    if (myPhone) {
      const myIndex = list.findIndex(d => String(d.phone).replace(/\D/g, '').slice(-10) === myPhone);
      if (myIndex > -1) {
        const [myRecord] = list.splice(myIndex, 1);
        list.unshift(myRecord);
      }
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
      const isMe = myPhone && (String(d.phone).replace(/\D/g, '').slice(-10) === myPhone);
      const cooldown = this.calculateCooldown(d.lastDonationDate);
      const isEligible = d.isAvailable && cooldown.canDonate;

      const whatsappText = encodeURIComponent(
        `Hello ${d.name}, we urgently need blood donation for a patient in ${d.district}. We found your profile on Selfcare Diagnostics Blood Connect. Could you please let us know if you are available?`
      );

      return `
        <div class="donor-card-item ${isMe ? 'is-me-card' : ''} ${isEligible ? 'active-available' : ''}">
          <div class="donor-header-row">
            <div class="donor-info-left">
              <span class="donor-group-pill">${this.safeEscape(d.bloodGroup)}</span>
              <div class="donor-title-group">
                <h4>
                  ${this.safeEscape(d.name)}
                  ${isMe ? '<span class="badge-you-donor">YOU</span>' : ''}
                </h4>
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
              <span class="d-val">⭐ ${d.donationCount ?? 0} Times</span>
            </div>
            <div>
              <span class="d-label">Last Donated</span>
              <span class="d-val">${d.lastDonationDate ? d.lastDonationDate : 'First Time Hero'}</span>
            </div>
          </div>

          <!-- SMART ACTIONS: IF 'YOU', SHOW CERTIFICATE & EDIT BUTTONS -->
          ${isMe ? `
            <div class="donor-actions-row">
              <button type="button" class="action-btn-my-profile" onclick="BloodPage.openMyCertificateModal()">
                📜 My Certificate
              </button>
              <button type="button" class="action-btn-edit-donor" onclick="BloodPage.openDonorRegisterModal()">
                ✏️ Edit My Profile
              </button>
            </div>
          ` : `
            <div class="donor-actions-row">
              <button type="button" class="action-btn-call" onclick="window.location.href='tel:${d.phone}'">
                📞 Call Donor
              </button>
              <button type="button" class="action-btn-whatsapp" onclick="window.location.href='https://wa.me/91${d.phone}?text=${whatsappText}'">
                💬 WhatsApp
              </button>
            </div>
          `}
        </div>
      `;
    }).join('');
  },

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
            All ${r.unitsNeeded} units successfully verified with donor PINs!
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

  /**
   * REQUEST SOS SUBMISSION -> CLOUD BACKEND SYNC
   */
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

    const reqId = `REQ_${Date.now()}`;
    const newRequest = {
      id: reqId,
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

    // CLOUD PERSISTENCE: Save into Google Sheets
    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      Api.request('saveBloodRequest', newRequest, false).catch(err => console.warn('[BloodConnect] Save request cloud notice:', err));
    }

    this.renderAll();
    this.closeModal('modal-blood-request');
    this.switchTab('requests');

    this.safeShowToast('Emergency request posted to Cloud! 🚨', 'success');
  },

  /**
   * DONOR REGISTRATION SUBMIT -> CLOUD BACKEND SYNC
   */
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

    const permanentPin = this.ensurePermanentDonorPin();
    const initialDonationCount = (lastDate && lastDate.trim() !== '') ? 1 : 0;

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
      donationCount: initialDonationCount,
      isAvailable,
      permanentPin
    };

    this.bloodDonors = this.bloodDonors.filter(d => d.phone !== phone);
    this.bloodDonors.unshift(newDonor);
    localStorage.setItem('selfcare_blood_donors', JSON.stringify(this.bloodDonors));
    localStorage.setItem('selfcare_my_donor_profile', JSON.stringify(newDonor));

    // CLOUD PERSISTENCE: Save into Google Sheets
    if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function') {
      Api.request('registerBloodDonor', newDonor, false).catch(err => console.warn('[BloodConnect] Save donor cloud notice:', err));
    }

    this.renderAll();
    this.closeModal('modal-donor-register');
    this.switchTab('donors');

    alert(`🎉 WELCOME TO SELFCARE LIFESAVERS!\n\nYour Permanent 4-Digit PIN is: [ ${permanentPin} ]\n\nWhenever you donate blood at a hospital, give this PIN to the attender to verify your donation.`);
    setTimeout(() => this.openMyCertificateModal(), 800);
  },

  openMyCertificateModal() {
    this.triggerHaptic();

    let myProfile = null;
    try {
      myProfile = JSON.parse(localStorage.getItem('selfcare_my_donor_profile'));
    } catch (e) {}

    const user = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};
    const name = myProfile?.name || user.name || 'Valued Lifesaver';
    const group = myProfile?.bloodGroup || user.bloodGroup || 'O +ve';
    const count = parseInt(myProfile?.donationCount ?? 0, 10);

    const nameEl = document.getElementById('cert-donor-name');
    const groupEl = document.getElementById('cert-donor-group');
    const countEl = document.getElementById('cert-donations-count');
    const dateEl = document.getElementById('cert-issue-date');
    const badgeEl = document.getElementById('cert-tier-badge');

    if (nameEl) nameEl.textContent = name;
    if (groupEl) groupEl.textContent = group;
    if (countEl) countEl.textContent = `${count} ${count === 1 ? 'Time' : 'Times'}`;
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    if (badgeEl) {
      badgeEl.className = 'cert-badge-tag';
      if (count === 0) {
        badgeEl.classList.add('tier-bronze');
        badgeEl.textContent = '🌱 PLEDGED LIFESAVER (READY TO DONATE)';
      } else if (count === 1) {
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

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Selfcare Lifesaver Certificate',
              text: 'Proud to be a voluntary blood donor with Selfcare Diagnostics! 🩸 Join: https://selfcarediagnostics.in/blood.html'
            });
            if (shareBtn) shareBtn.textContent = originalText;
          } catch (shareErr) {
            if (shareBtn) shareBtn.textContent = originalText;
          }
        } else {
          const link = document.createElement('a');
          link.download = 'Selfcare-Lifesaver-Certificate.png';
          link.href = canvas.toDataURL('image/png');
          link.click();

          const text = encodeURIComponent(
            `Proud to be a voluntary blood donor with Selfcare Diagnostics! 🩸 (Attached is my Lifesaver Certificate). Join: https://selfcarediagnostics.in/blood.html`
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
