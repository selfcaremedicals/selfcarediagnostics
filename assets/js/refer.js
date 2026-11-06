/* file: assets/js/refer.js */
/**
 * Selfcare Diagnostics - Refer & Earn Controller v16.1.0
 * Features:
 * 1. 0% Live Reset Engine: Once a discount (10% to 100%) is redeemed in Cart, activeDiscountPercent immediately resets to 0%.
 * 2. Active vs Redeemed Reward Filtering: Only un-redeemed, qualified bookings (Min ₹500 spend) calculate the active milestone gauge.
 * 3. Real-Time Cloud Sync: Syncs with Apps Script 'getReferralData' and updates 'claimReferralReward' on redemption.
 * 4. HD Branded Ad Poster Generator (1080x1080 Canvas with Official Logo & 10% Discount Highlight).
 * 5. Multi-App OS Direct Share (Instagram Stories, WhatsApp, Telegram, SMS).
 * 6. Minimum ₹500 spend eligibility & 30-day expiry engine.
 */

const ReferPage = {
  currentMobile: '',
  referralCode: '',
  MAX_DISCOUNT_CAP: 2499, // Max discount cap in INR
  referralData: {
    cycle: 1,
    referredUsers: [],
    activeDiscountPercent: 0,
    totalRewardsUsedCount: 0,
    achieved100At: null,
    expiredLastCycle: false
  },

  async init() {
    try {
      this.loadUserSession();
      this.generateReferralCode();
      this.loadReferralData();
      this.renderUI();
      await this.syncWithCloud();
    } catch (err) {
      console.error('[ReferPage] Init error:', err);
    }
  },

  triggerHaptic() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(25);
    }
  },

  safeShowToast(msg, type = 'info') {
    if (typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(msg, type);
    } else {
      alert(msg);
    }
  },

  loadUserSession() {
    let ph = '';
    try {
      const user = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) || {};
      ph = user.mobile || localStorage.getItem('selfcare_active_user') || '';
    } catch (e) {}
    this.currentMobile = String(ph || '').replace(/\D/g, '').slice(-10);
  },

  generateReferralCode() {
    if (this.currentMobile) {
      this.referralCode = `SCD${this.currentMobile.slice(-6)}`;
    } else {
      this.referralCode = 'SCDHEALTH';
    }
    const codeEl = document.getElementById('my-referral-code');
    if (codeEl) codeEl.textContent = this.referralCode;
  },

  loadReferralData() {
    const storageKey = `selfcare_referral_${this.currentMobile || 'guest'}`;
    const raw = localStorage.getItem(storageKey);

    if (raw) {
      try {
        this.referralData = JSON.parse(raw);
      } catch (e) {
        this.resetToDefaultData();
      }
    } else {
      this.resetToDefaultData();
    }

    this.calculateDiscountStatus();
  },

  resetToDefaultData() {
    this.referralData = {
      cycle: 1,
      referredUsers: [],
      activeDiscountPercent: 0,
      totalRewardsUsedCount: 0,
      achieved100At: null,
      expiredLastCycle: false
    };
    this.saveDataLocally();
  },

  saveDataLocally() {
    const storageKey = `selfcare_referral_${this.currentMobile || 'guest'}`;
    localStorage.setItem(storageKey, JSON.stringify(this.referralData));
    localStorage.setItem('selfcare_active_referral_discount', String(this.referralData.activeDiscountPercent || 0));
    localStorage.setItem('selfcare_referral_max_cap', String(this.MAX_DISCOUNT_CAP));
  },

  /**
   * RESET TO 0% LOGIC:
   * Only counts ACTIVE referrals. If an earned reward has been used/redeemed in Cart, it is excluded,
   * cleanly resetting active discount percent back to 0% for the next cycle.
   */
  calculateDiscountStatus() {
    const allFriends = Array.isArray(this.referralData.referredUsers) ? this.referralData.referredUsers : [];
    
    // Only count qualified bookings (₹500+) that have NOT been redeemed yet
    const activeQualifiedFriends = allFriends.filter(item => {
      const spent = parseFloat(item.amount || item.bookingAmount || 0);
      const isQualified = spent >= 500;
      const isNotRedeemed = String(item.rewardStatus || 'ACTIVE').toUpperCase() !== 'REDEEMED';
      return isQualified && isNotRedeemed;
    });

    const qualifiedCount = activeQualifiedFriends.length;

    if (qualifiedCount >= 10) {
      if (!this.referralData.achieved100At) {
        this.referralData.achieved100At = new Date().toISOString();
      }

      // 30 Days Expiry Engine
      const achievedTime = new Date(this.referralData.achieved100At).getTime();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const expiryTime = achievedTime + thirtyDaysMs;
      const nowTime = Date.now();

      if (nowTime >= expiryTime) {
        this.referralData.cycle = (this.referralData.cycle || 1) + 1;
        this.referralData.activeDiscountPercent = 0;
        this.referralData.achieved100At = null;
        this.referralData.expiredLastCycle = true;
        this.saveDataLocally();
        return;
      } else {
        this.referralData.activeDiscountPercent = 100;
      }
    } else {
      this.referralData.activeDiscountPercent = qualifiedCount * 10;
      this.referralData.achieved100At = null;
    }

    this.saveDataLocally();
  },

  getExpiryInfo() {
    if (!this.referralData.achieved100At || this.referralData.activeDiscountPercent < 100) {
      return null;
    }

    const achieved = new Date(this.referralData.achieved100At);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const expires = new Date(achieved.getTime() + thirtyDaysMs);
    const now = new Date();

    const diffMs = expires.getTime() - now.getTime();
    const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    const dateOptions = { day: '2-digit', month: 'short', year: 'numeric' };

    return {
      expiryDateStr: expires.toLocaleDateString('en-GB', dateOptions),
      daysLeft
    };
  },

  renderUI() {
    const allFriends = this.referralData.referredUsers || [];
    const activeQualifiedFriends = allFriends.filter(item => {
      const spent = parseFloat(item.amount || item.bookingAmount || 0);
      return spent >= 500 && String(item.rewardStatus || 'ACTIVE').toUpperCase() !== 'REDEEMED';
    });
    const qualifiedCount = activeQualifiedFriends.length;
    const currentPercent = this.referralData.activeDiscountPercent;
    const currentCycle = this.referralData.cycle || 1;

    const cycleBadge = document.getElementById('refer-cycle-badge');
    if (cycleBadge) cycleBadge.textContent = `Cycle #${currentCycle}`;

    const discountEl = document.getElementById('active-discount-percent');
    if (discountEl) discountEl.textContent = currentPercent;

    const discountSub = document.getElementById('active-discount-sub');
    if (discountSub) {
      discountSub.textContent = `${qualifiedCount} of 10 Active Qualified Friends (Min ₹500 spend)`;
    }

    const friendsPill = document.getElementById('friends-count-pill');
    if (friendsPill) friendsPill.textContent = `${Math.min(10, qualifiedCount)}/10 Friends`;

    const progressFill = document.getElementById('milestone-progress-fill');
    if (progressFill) progressFill.style.width = `${currentPercent}%`;

    this.renderMilestoneGrid(qualifiedCount);

    const expiryBanner = document.getElementById('expiry-100-banner');
    const expiryDateEl = document.getElementById('expiry-date-display');
    const expiryDaysEl = document.getElementById('expiry-days-left');
    const expiryInfo = this.getExpiryInfo();

    if (expiryInfo && currentPercent === 100) {
      if (expiryBanner) expiryBanner.style.display = 'block';
      if (expiryDateEl) expiryDateEl.textContent = expiryInfo.expiryDateStr;
      if (expiryDaysEl) expiryDaysEl.textContent = expiryInfo.daysLeft;
    } else {
      if (expiryBanner) expiryBanner.style.display = 'none';
    }

    const expiredAlert = document.getElementById('cycle-expired-alert');
    if (expiredAlert) {
      expiredAlert.style.display = this.referralData.expiredLastCycle ? 'block' : 'none';
    }

    this.renderHistoryList();
  },

  renderMilestoneGrid(count) {
    const container = document.getElementById('milestone-steps-container');
    if (!container) return;

    let html = '';
    for (let i = 1; i <= 10; i++) {
      const stepPercent = i * 10;
      const isCompleted = i <= count;
      const isActiveNow = i === count;

      html += `
        <div class="milestone-node ${isCompleted ? 'completed' : ''} ${isActiveNow ? 'active-now' : ''}">
          <span class="node-percent">${stepPercent}%</span>
          <span class="node-dot">${isCompleted ? '✅' : '⚪'}</span>
        </div>
      `;
    }
    container.innerHTML = html;
  },

  renderHistoryList() {
    const container = document.getElementById('referral-history-list');
    const badge = document.getElementById('history-total-badge');
    if (!container) return;

    const list = this.referralData.referredUsers || [];
    if (badge) badge.textContent = `${list.length} Total`;

    if (list.length === 0) {
      container.innerHTML = `
        <div class="history-empty-state">
          <span style="font-size:24px; display:block; margin-bottom:4px;">🤝</span>
          <p>No bookings in Cycle #${this.referralData.cycle || 1} yet.<br>Share your code! When a friend spends ₹500+, you unlock 10% discount.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map((item, idx) => {
      const amount = parseFloat(item.amount || item.bookingAmount || 0);
      const isQualified = amount >= 500;
      const isRedeemed = String(item.rewardStatus || '').toUpperCase() === 'REDEEMED';

      let statusPillHtml = '';
      if (!isQualified) {
        statusPillHtml = `
          <span class="history-reward-disqualified">Not Qualified</span>
          <span class="history-amount-sub" style="color:#B91C1C;">Spent &lt; ₹500</span>
        `;
      } else if (isRedeemed) {
        statusPillHtml = `
          <span class="history-reward-pill" style="background:#F1F5F9; color:#475569; border:1px solid #CBD5E1;">Used in Cart ✓</span>
          <span class="history-amount-sub" style="color:#64748B;">Redeemed</span>
        `;
      } else {
        statusPillHtml = `
          <span class="history-reward-pill">+10% OFF</span>
          <span class="history-amount-sub" style="color:#047857;">Active (₹500+)</span>
        `;
      }

      return `
        <div class="history-item-row">
          <div class="history-user-info">
            <strong>#${idx + 1} ${this.safeEscape(item.name || 'Friend')}</strong>
            <span>${item.date || 'Recent'} • Booking: ₹${amount.toFixed(0)}</span>
          </div>
          <div class="history-reward-flex">
            ${statusPillHtml}
          </div>
        </div>
      `;
    }).join('');
  },

  safeEscape(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  },

  copyReferralCode() {
    this.triggerHaptic();
    if (!navigator.clipboard) {
      const textarea = document.createElement('textarea');
      textarea.value = this.referralCode;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    } else {
      navigator.clipboard.writeText(this.referralCode);
    }
    this.safeShowToast(`Referral Code "${this.referralCode}" copied! Share with friends.`, 'success');
  },

  shareViaWhatsApp() {
    this.triggerHaptic();
    const shareText = encodeURIComponent(
      `Get Flat 10% Discount on Blood Tests at Selfcare Diagnostics! 🩸🛵\n\nUse my Referral Code *${this.referralCode}* on your booking (Min ₹500 spend).\n\nPlus, you can also refer friends to get a 100% FREE Health Checkup (Worth up to ₹2,499)!\n\nBook tests online: https://selfcarediagnostics.in/customer.html`
    );
    window.location.href = `https://wa.me/?text=${shareText}`;
  },

  loadCanvasImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  },

  /**
   * 🎨 HD ADVERTISEMENT POSTER GENERATOR ENGINE (1080x1080)
   * With Official Logo + 10% Discount First + 100% Free Health Checkup Second
   */
  async generateAdPosterBlob() {
    return new Promise(async (resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');

      // 1. Premium Background Gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1080);
      bgGrad.addColorStop(0, '#1E0624');
      bgGrad.addColorStop(0.35, '#033B2E');
      bgGrad.addColorStop(1, '#021F17');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1080, 1080);

      // Subtle Decorative Glowing Ambient Rings
      ctx.fillStyle = 'rgba(217, 119, 6, 0.16)';
      ctx.beginPath();
      ctx.arc(950, 120, 260, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.beginPath();
      ctx.arc(120, 960, 320, 0, Math.PI * 2);
      ctx.fill();

      // Outer Border Frame
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 12;
      ctx.strokeRect(28, 28, 1024, 1024);

      // 2. Official Logo Integration (assets/images/logo.png)
      const logoImg = await this.loadCanvasImage('assets/images/logo.png');
      if (logoImg) {
        const logoHeight = 65;
        const aspect = logoImg.width / logoImg.height;
        const logoWidth = logoHeight * aspect;
        const logoX = (1080 - logoWidth) / 2;
        ctx.drawImage(logoImg, logoX, 55, logoWidth, logoHeight);
      } else {
        ctx.fillStyle = '#10B981';
        ctx.font = '900 36px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🌿 SELFCARE DIAGNOSTICS', 540, 95);
      }

      ctx.fillStyle = '#94A3B8';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NABL ACCREDITED CLINICAL PATHOLOGY NETWORK • CHENNAI', 540, 150);

      // 3. Primary Offer Badge
      ctx.fillStyle = '#FEF3C7';
      ctx.beginPath();
      ctx.roundRect(280, 180, 520, 44, 22);
      ctx.fill();

      ctx.fillStyle = '#B45309';
      ctx.font = '900 21px system-ui, sans-serif';
      ctx.fillText('⚡ SPECIAL REFERRAL INVITATION OFFER ⚡', 540, 210);

      // 4. Primary Headline
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 58px system-ui, sans-serif';
      ctx.fillText('USE THIS CODE & GET', 540, 290);

      ctx.fillStyle = '#F59E0B';
      ctx.font = '900 68px system-ui, sans-serif';
      ctx.fillText('FLAT 10% DISCOUNT!', 540, 362);

      // 5. Giant Referral Code Showcase Box
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(140, 400, 800, 205, 26);
      ctx.fill();

      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 4;
      ctx.setLineDash([14, 8]);
      ctx.strokeRect(155, 415, 770, 175);
      ctx.setLineDash([]);

      ctx.fillStyle = '#475569';
      ctx.font = '800 20px system-ui, sans-serif';
      ctx.fillText('ENTER COUPON CODE AT ONLINE CHECKOUT:', 540, 455);

      ctx.fillStyle = '#045D49';
      ctx.font = '900 78px monospace';
      ctx.fillText(this.referralCode, 540, 535);

      ctx.fillStyle = '#D97706';
      ctx.font = '800 19px system-ui, sans-serif';
      ctx.fillText('• VALID ON MINIMUM BLOOD TEST BOOKING OF ₹500 •', 540, 572);

      // 6. Secondary Highlight: 100% Free Health Checkup Box
      const freeBoxGrad = ctx.createLinearGradient(140, 630, 940, 755);
      freeBoxGrad.addColorStop(0, 'rgba(74, 21, 75, 0.7)');
      freeBoxGrad.addColorStop(1, 'rgba(4, 93, 73, 0.7)');
      ctx.fillStyle = freeBoxGrad;
      ctx.beginPath();
      ctx.roundRect(140, 630, 800, 125, 20);
      ctx.fill();

      ctx.strokeStyle = '#FCD34D';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(140, 630, 800, 125);

      ctx.fillStyle = '#FEF08A';
      ctx.font = '900 28px system-ui, sans-serif';
      ctx.fillText('🎁 GET 100% FREE HEALTH CHECKUP!', 540, 678);

      ctx.fillStyle = '#E2E8F0';
      ctx.font = '600 20px system-ui, sans-serif';
      ctx.fillText('Refer Your Friends & Family • Earn Free Test Package up to ₹2,499', 540, 720);

      // 7. Clinical Trust Features Row
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.fillText('🛵 Doorstep Phlebotomy Home Collection', 180, 805);
      ctx.fillText('🧪 Automated Barcode & Cold-Chain Safety', 180, 845);
      ctx.fillText('⚡ Fast Digital Reports on WhatsApp in 24 Hrs', 180, 885);

      // 8. Footer Call-to-Action
      ctx.textAlign = 'center';
      ctx.fillStyle = '#10B981';
      ctx.font = '900 30px system-ui, sans-serif';
      ctx.fillText('Book Tests: selfcarediagnostics.in', 540, 955);

      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 19px system-ui, sans-serif';
      ctx.fillText('East Coast Road (ECR), Chennai • Helpline: +91 7010174890', 540, 995);

      canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
    });
  },

  /**
   * 📲 MORE OPTIONS: NATIVE AD IMAGE SHARING TO ALL INSTALLED APPS
   */
  async shareNative() {
    this.triggerHaptic();

    const btnGeneric = document.querySelector('.btn-share-generic');
    const originalText = btnGeneric ? btnGeneric.innerHTML : '📲 More Options';

    if (btnGeneric) {
      btnGeneric.innerHTML = '⏳ Generating Ad Poster...';
      btnGeneric.style.opacity = '0.7';
    }

    try {
      const adBlob = await this.generateAdPosterBlob();
      const adFile = new File([adBlob], `Selfcare-Offer-${this.referralCode}.png`, { type: 'image/png' });

      const shareTitle = 'Get 10% Discount on Blood Tests - Selfcare Diagnostics';
      const shareText = `Use my Referral Code *${this.referralCode}* on Selfcare Diagnostics for flat 10% discount on doorstep blood tests (Min ₹500 spend). Plus, refer your friends to get 100% FREE checkup (Up to ₹2,499)! Book online: https://selfcarediagnostics.in/customer.html`;

      if (navigator.canShare && navigator.canShare({ files: [adFile] })) {
        await navigator.share({
          files: [adFile],
          title: shareTitle,
          text: shareText
        });
        this.safeShowToast('Referral invitation shared successfully!', 'success');
      } else if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: 'https://selfcarediagnostics.in/customer.html'
        });
      } else {
        const downloadUrl = URL.createObjectURL(adBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `Selfcare-Offer-${this.referralCode}.png`;
        a.click();
        URL.revokeObjectURL(downloadUrl);

        this.copyReferralCode();
        alert(`📥 Advertisement Poster downloaded!\n\nReferral code "${this.referralCode}" copied. You can now post this image to Instagram Story, Reel, SMS, or Telegram.`);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[ReferPage] Share notice:', err);
        this.copyReferralCode();
      }
    } finally {
      if (btnGeneric) {
        btnGeneric.innerHTML = originalText;
        btnGeneric.style.opacity = '1';
      }
    }
  },

  /**
   * REDEEM DISCOUNT & IMMEDIATE RESET TO 0%:
   * 1. Applies current active discount to cart payload.
   * 2. Marks qualified friend entries as 'REDEEMED' so they cannot be reused.
   * 3. Resets activeDiscountPercent to 0% and saves state locally.
   * 4. Asynchronously invokes backend 'claimReferralReward' to lock in 0% on Google Sheets.
   * 5. Redirects user to Cart.
   */
  async redeemDiscount() {
    this.triggerHaptic();
    const discount = this.referralData.activeDiscountPercent;

    if (discount <= 0) {
      this.safeShowToast('You have 0% discount. Refer friends (Min ₹500 spend) to unlock discounts!', 'info');
      return;
    }

    const expiryInfo = this.getExpiryInfo();
    const expiryText = expiryInfo ? `\n(⚠️ Notice: This 100% discount expires in ${expiryInfo.daysLeft} days).` : '';
    const capNotice = (discount === 100) 
      ? `\n\n🛡️ Maximum Discount Cap: Up to ₹${this.MAX_DISCOUNT_CAP} FREE!\n(Cart value up to ₹2,499 is completely free. Any amount exceeding this can be paid at checkout).`
      : '';

    const confirmed = confirm(
      `🎉 You have ${discount}% referral discount available!${expiryText}${capNotice}\n\nApply this discount to your Cart checkout now?\n\n(Note: Applying will use this reward and reset your active milestone back to 0% for fresh referrals).`
    );

    if (confirmed) {
      const discountPayload = {
        code: `REFER_${this.referralCode}`,
        percent: discount,
        maxDiscountCap: this.MAX_DISCOUNT_CAP,
        cycle: this.referralData.cycle,
        appliedAt: new Date().toISOString()
      };
      localStorage.setItem('selfcare_applied_referral_coupon', JSON.stringify(discountPayload));

      // Local Reset to 0%
      this.referralData.cycle = (this.referralData.cycle || 1) + 1;
      this.referralData.totalRewardsUsedCount = (this.referralData.totalRewardsUsedCount || 0) + 1;
      this.referralData.activeDiscountPercent = 0;
      this.referralData.achieved100At = null;
      this.referralData.expiredLastCycle = false;

      // Mark locally recorded qualified items as REDEEMED
      if (Array.isArray(this.referralData.referredUsers)) {
        this.referralData.referredUsers.forEach(u => {
          if (parseFloat(u.amount || u.bookingAmount || 0) >= 500) {
            u.rewardStatus = 'REDEEMED';
          }
        });
      }
      this.saveDataLocally();

      // Trigger Cloud Claim to permanently persist the 0% reset on the Google Sheets database
      if (navigator.onLine && typeof Api !== 'undefined' && typeof Api.request === 'function' && this.currentMobile) {
        Api.request('claimReferralReward', { mobile: this.currentMobile }, false).catch(() => {});
      }

      this.safeShowToast(`${discount}% discount applied (Max ₹2,499)! Redirecting to Cart...`, 'success');
      setTimeout(() => {
        window.location.href = 'cart.html';
      }, 700);
    }
  },

  async syncWithCloud() {
    if (!navigator.onLine || typeof Api === 'undefined' || typeof Api.request !== 'function' || !this.currentMobile) return;

    try {
      const res = await Api.request('getReferralData', { mobile: this.currentMobile }, false).catch(() => null);
      if (res && res.status === 'success' && res.data) {
        if (Array.isArray(res.data.referredUsers)) {
          this.referralData.referredUsers = res.data.referredUsers;
        }
        if (res.data.cycle) {
          this.referralData.cycle = res.data.cycle;
        }
        if (res.data.achieved100At) {
          this.referralData.achieved100At = res.data.achieved100At;
        }
        this.calculateDiscountStatus();
        this.renderUI();
      }
    } catch (e) {
      console.warn('[ReferPage] Cloud sync notice:', e);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ReferPage.init();
});

if (typeof window !== 'undefined') window.ReferPage = ReferPage;
if (typeof module !== 'undefined' && module.exports) module.exports = ReferPage;
