/* file: assets/js/utils.js */
/**
 * Selfcare Diagnostics - Utilities & Dynamic 2-Tier Sheet Inspection Engine v12.0.0
 * Features:
 * 1. Indian Rupee currency formatting, XSS sanitization, debouncing, online check, and toast notifications.
 * 2. Multi-Patient Aware Bi-directional Dynamic Conflict Validation Engine:
 *    - Rule 1: Package vs Individual Test (Blocks LFT / GGT / Bilirubin if package has LFT, allows Vitamin D).
 *    - Rule 2: Individual Test vs Package (Blocks adding package if individual tests overlap).
 *    - Rule 3: Parent Panel vs Sub-parameter (e.g., CBC vs Hb, LFT vs SGPT/GGT, KFT vs Creatinine).
 *    - Rule 4: Package vs Package Deep Overlap (Blocks adding overlapping health packages).
 *    - Multi-Patient Isolation Guard: Evaluates conflicts ONLY within the same patient context.
 */

const Utils = {
  /**
   * Format number to Indian Rupee currency string
   * @param {number|string} amount 
   * @returns {string} Formatted currency string
   */
  formatCurrency(amount) {
    if (amount === undefined || amount === null || isNaN(Number(amount))) return '₹0';
    return '₹' + Math.round(Number(amount)).toLocaleString('en-IN');
  },

  /**
   * Debounce function to limit rapid execution
   * @param {Function} func 
   * @param {number} wait 
   * @returns {Function} Debounced function
   */
  debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Escape HTML to prevent XSS attacks
   * @param {string} str 
   * @returns {string} Sanitized string
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Display a floating 3D toast notification
   * @param {string} message 
   * @param {string} type - 'success', 'error', 'info'
   */
  showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position: fixed; bottom: 85px; left: 50%; transform: translateX(-50%); z-index: 10000; display: flex; flex-direction: column; gap: 8px; pointer-events: none; width: 90%; max-width: 420px; align-items: center;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgColors = {
      success: 'linear-gradient(135deg, #078866, #045D49)',
      error: 'linear-gradient(135deg, #E4005A, #BE0048)',
      info: 'linear-gradient(135deg, #045D49, #033F33)'
    };

    toast.style.cssText = `background: ${bgColors[type] || bgColors.success}; color: #FFFFFF; padding: 12px 18px; border-radius: 12px; font-size: 13px; font-weight: 700; box-shadow: 0 10px 28px rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); opacity: 0; transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s ease; transform: translateY(12px); pointer-events: auto; text-align: center; width: 100%; box-sizing: border-box;`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3200);
  },

  /**
   * Check if device is currently online
   * @returns {boolean}
   */
  isOnline() {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
};

/**
 * =========================================================================
 * CONFLICT VALIDATOR ENGINE - DYNAMIC 2-TIER SHEET GRAPH INSPECTION
 * =========================================================================
 */
const ConflictValidator = {
  // Clinical Organ Panel Aliases for Instant Detection
  panelAliases: {
    'LFT': ['lft', 'liver function test', 'liver function', 'liver panel', 'hepatic function', 'liver profile', 't0013', 'scdt0013'],
    'CBC': ['cbc', 'complete blood count', 'hemogram', 'complete hemogram', 'haemogram', 't0001', 'scdt0001'],
    'KFT': ['kft', 'rft', 'kidney function test', 'renal function test', 'kidney function', 'renal function', 'kidney panel', 'renal panel', 't0014', 'scdt0014', 't0016', 'scdt0016'],
    'LIPID': ['lipid profile', 'lipid panel', 'cholesterol panel', 'lipid screen', 'lipids', 't0012', 'scdt0012'],
    'THYROID': ['thyroid profile', 'thyroid panel', 'total thyroid', 't3 t4 tsh', 'thyroid function', 't0040', 'scdt0040'],
    'DIABETES': ['diabetes profile', 'diabetic screen', 'diabetes panel', 'blood sugar profile']
  },

  isPackage(item) {
    if (!item) return false;
    const type = String(item.type || '').toLowerCase();
    const code = String(item.PackageID || item.PackageCode || item.TestCode || item.code || item.id || '').toUpperCase();
    const name = String(item.TestName || item.PackageName || item.name || '').toUpperCase();
    return Boolean(
      item.isPackage === true ||
      type === 'package' ||
      code.startsWith('PKG') ||
      code.includes('SCDPACK') ||
      name.includes('PACKAGE') ||
      name.includes('PANEL') ||
      name.includes('HEALTH CHECK') ||
      name.includes('FULL BODY') ||
      name.includes('WELLNESS') ||
      name.includes('MASTER HEALTH')
    );
  },

  /**
   * Clinical exemption for Reticulocyte count (Can be ordered alongside CBC)
   * Note: T0015 is Serum Creatinine in Selfcare catalog and MUST NOT be exempted here!
   */
  isReticulocyte(item) {
    if (!item) return false;
    const code = String(item.TestCode || item.code || item.TestID || item.id || '').toUpperCase();
    const name = String(item.TestName || item.name || '').toUpperCase();
    return name.includes('RETICULOCYTE') || code.includes('RETIC');
  },

  cleanStr(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[;,/|•\n\t()\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  getAllSheetTests() {
    try {
      const raw = localStorage.getItem('cache_tests') || localStorage.getItem('selfcare_tests_db');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  },

  findFullPackageFromSheet(cartPkg) {
    try {
      const raw = localStorage.getItem('cache_packages') || localStorage.getItem('selfcare_packages_db');
      if (raw) {
        const pkgs = JSON.parse(raw);
        const pId = String(cartPkg.PackageID || cartPkg.id || cartPkg.PackageCode || cartPkg.code || '').toUpperCase().trim();
        const pName = String(cartPkg.PackageName || cartPkg.TestName || cartPkg.name || '').toUpperCase().trim();

        const found = pkgs.find(p => {
          const cId = String(p.PackageID || p.id || p.PackageCode || '').toUpperCase().trim();
          const cName = String(p.PackageName || p.name || '').toUpperCase().trim();
          return (pId && cId === pId) || (pName && cName === pName);
        });

        if (found) return found;
      }
    } catch (e) {}
    return cartPkg;
  },

  extractPackageConstituents(pkg) {
    const fullPkg = this.findFullPackageFromSheet(pkg);
    const raw = fullPkg.Parameters || fullPkg.parameters || fullPkg.Description || fullPkg.WhyDone || '';
    const rawTestIds = fullPkg.TestIDs || fullPkg.testIds || fullPkg.TestCodeList || fullPkg.tests || '';

    let items = [];

    if (Array.isArray(raw)) {
      items.push(...raw.map(r => typeof r === 'object' && r !== null ? (r.Name || r.ParameterName || r.TestName || '') : String(r)));
    } else if (typeof raw === 'string') {
      items.push(...raw.split(/[;,|\n•]|<br\s*[\/]?>/i));
    }

    if (Array.isArray(rawTestIds)) {
      items.push(...rawTestIds);
    } else if (typeof rawTestIds === 'string') {
      items.push(...rawTestIds.split(/[,;|/\n]/));
    }

    return items
      .map(i => String(i).trim())
      .filter(i => i.length > 1);
  },

  /**
   * Determines if two test names or codes represent the exact same Organ Panel (e.g. "LFT" vs "Liver Function Test")
   */
  isSameOrganPanel(nameA, codeA, nameB, codeB) {
    const cleanA = this.cleanStr(nameA);
    const cleanB = this.cleanStr(nameB);
    const cA = String(codeA || '').toUpperCase();
    const cB = String(codeB || '').toUpperCase();

    if (cA && cB && cA === cB) return true;
    if (cleanA && cleanB && cleanA === cleanB) return true;

    for (const key of Object.keys(this.panelAliases)) {
      const aliases = this.panelAliases[key];
      const aMatches = aliases.some(alias => cleanA === alias || cleanA.includes(alias) || cA === alias.toUpperCase());
      const bMatches = aliases.some(alias => cleanB === alias || cleanB.includes(alias) || cB === alias.toUpperCase());
      if (aMatches && bMatches) {
        return true;
      }
    }
    return false;
  },

  /**
   * Reads Sheet test record for a panel and returns all its dynamic clinical sub-parameters
   */
  getDeepParametersForSheetTest(constituentName, allSheetTests) {
    if (!constituentName) {
      return { parentTest: null, subParameters: [] };
    }

    const cClean = this.cleanStr(constituentName);
    const cUpper = constituentName.toUpperCase().trim();

    let matchedTest = null;
    if (Array.isArray(allSheetTests) && allSheetTests.length > 0) {
      matchedTest = allSheetTests.find(t => {
        const tName = String(t.TestName || '').trim();
        const tCode = String(t.TestCode || t.TestID || '').toUpperCase().trim();
        const tClean = this.cleanStr(tName);

        if (tCode && tCode === cUpper) return true;
        if (tClean === cClean) return true;

        for (const key of Object.keys(this.panelAliases)) {
          const aliases = this.panelAliases[key];
          const cMatches = aliases.some(a => cClean === a || cClean.includes(a) || cUpper === a.toUpperCase());
          const tMatches = aliases.some(a => tClean === a || tClean.includes(a) || tCode === a.toUpperCase());
          if (cMatches && tMatches) return true;
        }

        const reg = new RegExp(`(^|[^a-z0-9])${cClean}([^a-z0-9]|$)`, 'i');
        return reg.test(tClean);
      });
    }

    let subParams = [];

    if (matchedTest) {
      const rawParams = matchedTest.Parameters || matchedTest.Description || '';
      if (Array.isArray(rawParams)) {
        subParams = rawParams.map(p => String(p).trim());
      } else if (typeof rawParams === 'string') {
        subParams = rawParams.split(/[;,|\n•]|<br\s*[\/]?>/i).map(p => p.trim());
      }
    }

    // Standard Clinical Fallback Panel Expansions
    if (cClean.includes('cbc') || cClean.includes('hemogram') || (matchedTest && String(matchedTest.TestCode).toUpperCase() === 'T0001')) {
      subParams.push('Hemoglobin', 'Hb', 'Total WBC', 'TLC', 'WBC', 'RBC', 'Platelet', 'PCV', 'MCV', 'MCH', 'MCHC', 'RDW', 'Neutrophils', 'Lymphocytes', 'Monocytes', 'Eosinophils', 'Basophils');
    } else if (cClean.includes('lft') || cClean.includes('liver') || (matchedTest && String(matchedTest.TestCode).toUpperCase() === 'T0013')) {
      subParams.push('Bilirubin', 'Total Bilirubin', 'Direct Bilirubin', 'Indirect Bilirubin', 'SGOT', 'AST', 'SGPT', 'ALT', 'Alkaline Phosphatase', 'ALP', 'Total Protein', 'Albumin', 'Globulin', 'A/G Ratio', 'GGT', 'Gamma GT');
    } else if (cClean.includes('kft') || cClean.includes('rft') || cClean.includes('kidney') || cClean.includes('renal') || (matchedTest && (String(matchedTest.TestCode).toUpperCase() === 'T0014' || String(matchedTest.TestCode).toUpperCase() === 'T0016'))) {
      subParams.push('Blood Urea', 'Urea', 'Serum Creatinine', 'Creatinine', 'Uric Acid', 'BUN', 'Blood Urea Nitrogen', 'eGFR', 'Calcium', 'Phosphorus');
    } else if (cClean.includes('lipid') || (matchedTest && String(matchedTest.TestCode).toUpperCase() === 'T0012')) {
      subParams.push('Total Cholesterol', 'Cholesterol', 'Triglycerides', 'HDL', 'HDL Cholesterol', 'LDL', 'LDL Cholesterol', 'VLDL', 'Cholesterol/HDL Ratio');
    } else if (cClean.includes('thyroid') || (matchedTest && String(matchedTest.TestCode).toUpperCase() === 'T0040')) {
      subParams.push('T3', 'Total T3', 'Triiodothyronine', 'T4', 'Total T4', 'Thyroxine', 'TSH', 'Thyroid Stimulating Hormone');
    }

    return {
      parentTest: matchedTest,
      subParameters: subParams.filter(p => p && p.length > 1)
    };
  },

  /**
   * Bi-directional Dynamic Conflict Engine
   * Validates tests and packages with Multi-Patient Isolation support.
   */
  checkConflict(newItem, cart) {
    if (!newItem || !Array.isArray(cart) || cart.length === 0) {
      return { hasConflict: false, reason: '' };
    }

    if (this.isReticulocyte(newItem)) {
      return { hasConflict: false, reason: '' };
    }

    const allSheetTests = this.getAllSheetTests();
    const newIsPkg = this.isPackage(newItem);
    const newName = newItem.TestName || newItem.PackageName || newItem.name || 'Selected Test';
    const newNameClean = this.cleanStr(newName);
    const newCode = (newItem.TestCode || newItem.PackageCode || newItem.PackageID || newItem.code || newItem.id || '').toUpperCase().replace(/[\s\-_]/g, '');
    const targetPatientId = newItem.patientId || null;

    for (const cartItem of cart) {
      if (this.isReticulocyte(cartItem)) continue;

      // MULTI-PATIENT ISOLATION GUARD:
      // If patientIds are explicitly defined on both items and they belong to different patients, SKIP conflict!
      if (targetPatientId && cartItem.patientId && cartItem.patientId !== targetPatientId) {
        continue;
      }

      const cartIsPkg = this.isPackage(cartItem);
      const cartName = cartItem.TestName || cartItem.PackageName || cartItem.name || 'Package';
      const cartNameClean = this.cleanStr(cartName);
      const cartCode = (cartItem.PackageCode || cartItem.PackageID || cartItem.TestCode || cartItem.code || cartItem.id || '').toUpperCase().replace(/[\s\-_]/g, '');

      // =========================================================================
      // RULE 4: PACKAGE vs PACKAGE CONFLICT (e.g. 1299 Package vs 1999 Package)
      // =========================================================================
      if (cartIsPkg && newIsPkg) {
        // 1. Exact Duplicate Package Check
        if (newCode && cartCode && newCode === cartCode) {
          return {
            hasConflict: true,
            reason: `⚠️ "${newName}" is already in your cart.`
          };
        }

        // 2. Overlapping Constituents / Panels Check
        const cartConstituents = this.extractPackageConstituents(cartItem);
        const newConstituents = this.extractPackageConstituents(newItem);
        const commonOverlaps = [];

        for (const cItem of cartConstituents) {
          const cClean = this.cleanStr(cItem);
          for (const nItem of newConstituents) {
            const nClean = this.cleanStr(nItem);

            if (cClean === nClean || this.isSameOrganPanel(cItem, '', nItem, '')) {
              const displayName = cItem.toUpperCase();
              if (!commonOverlaps.includes(displayName)) {
                commonOverlaps.push(displayName);
              }
            }
          }
        }

        if (commonOverlaps.length > 0) {
          return {
            hasConflict: true,
            reason: `⚠️ Package Conflict: "${newName}" contains common panels (${commonOverlaps.slice(0, 3).join(', ')}) already included in "${cartName}". You cannot add two health packages simultaneously for the same person.`
          };
        }

        return {
          hasConflict: true,
          reason: `⚠️ Package Conflict: Your cart already has "${cartName}". Please remove it first to select "${newName}".`
        };
      }

      // =========================================================================
      // RULE 1: Cart has Package -> User tries to add Individual Test
      // =========================================================================
      if (cartIsPkg && !newIsPkg) {
        const pkgConstituents = this.extractPackageConstituents(cartItem);

        for (const constituent of pkgConstituents) {
          const itemClean = this.cleanStr(constituent);
          const itemCode = constituent.toUpperCase().replace(/[\s\-_]/g, '');

          // Direct Panel Equality Block
          if (newCode && (newCode === itemCode || newCode === constituent.toUpperCase())) {
            return {
              hasConflict: true,
              reason: `⚠️ "${newName}" is already included in the "${cartName}" package in your cart.`
            };
          }

          if (this.isSameOrganPanel(constituent, itemCode, newName, newCode)) {
            return {
              hasConflict: true,
              reason: `⚠️ "${newName}" is already included in the "${cartName}" package in your cart.`
            };
          }

          // Dynamic Sub-parameters Block (e.g. Package has KFT -> Blocks Serum Creatinine)
          const { parentTest, subParameters } = this.getDeepParametersForSheetTest(constituent, allSheetTests);
          const parentName = parentTest ? (parentTest.TestName || constituent) : constituent;

          if (parentTest && this.isSameOrganPanel(parentName, parentTest.TestCode, newName, newCode)) {
            return {
              hasConflict: true,
              reason: `⚠️ "${newName}" is already included in the "${cartName}" package in your cart.`
            };
          }

          for (const param of subParameters) {
            const paramClean = this.cleanStr(param);
            const regexMatch = new RegExp(`(^|[^a-z0-9])${paramClean}([^a-z0-9]|$)`, 'i').test(newNameClean);
            const reverseRegexMatch = new RegExp(`(^|[^a-z0-9])${newNameClean}([^a-z0-9]|$)`, 'i').test(paramClean);

            if (paramClean === newNameClean || regexMatch || reverseRegexMatch) {
              return {
                hasConflict: true,
                reason: `⚠️ "${newName}" is already covered under "${parentName}" in the "${cartName}" package.`
              };
            }
          }
        }
        continue;
      }

      // =========================================================================
      // RULE 2: Cart has Individual Test -> User tries to add Package
      // =========================================================================
      if (!cartIsPkg && newIsPkg) {
        const pkgConstituents = this.extractPackageConstituents(newItem);

        for (const constituent of pkgConstituents) {
          const itemClean = this.cleanStr(constituent);
          const itemCode = constituent.toUpperCase().replace(/[\s\-_]/g, '');

          if (this.isSameOrganPanel(constituent, itemCode, cartName, cartCode)) {
            return {
              hasConflict: true,
              reason: `⚠️ Your cart already has "${cartName}". Please remove it first to add the complete "${newName}" package.`
            };
          }

          const { parentTest, subParameters } = this.getDeepParametersForSheetTest(constituent, allSheetTests);
          const parentName = parentTest ? (parentTest.TestName || constituent) : constituent;

          for (const param of subParameters) {
            const paramClean = this.cleanStr(param);
            const regexMatch = new RegExp(`(^|[^a-z0-9])${paramClean}([^a-z0-9]|$)`, 'i').test(cartNameClean);
            const reverseRegexMatch = new RegExp(`(^|[^a-z0-9])${cartNameClean}([^a-z0-9]|$)`, 'i').test(paramClean);

            if (paramClean === cartNameClean || regexMatch || reverseRegexMatch) {
              return {
                hasConflict: true,
                reason: `⚠️ Your cart has "${cartName}" which is already covered under "${parentName}" in "${newName}". Please remove "${cartName}" first.`
              };
            }
          }
        }
        continue;
      }

      // =========================================================================
      // RULE 3: Panel vs Sub-parameter (e.g. Cart has KFT -> User adds Creatinine)
      // =========================================================================
      if (!cartIsPkg && !newIsPkg) {
        // Direct duplicate test check
        if (newCode && cartCode && newCode === cartCode) {
          return {
            hasConflict: true,
            reason: `⚠️ "${newName}" is already in your cart.`
          };
        }

        const cartDeep = this.getDeepParametersForSheetTest(cartName, allSheetTests);
        if (cartDeep.subParameters.length > 0) {
          for (const param of cartDeep.subParameters) {
            const paramClean = this.cleanStr(param);
            if (paramClean === newNameClean || 
                new RegExp(`(^|[^a-z0-9])${paramClean}([^a-z0-9]|$)`, 'i').test(newNameClean) ||
                new RegExp(`(^|[^a-z0-9])${newNameClean}([^a-z0-9]|$)`, 'i').test(paramClean)) {
              return {
                hasConflict: true,
                reason: `⚠️ "${newName}" is already covered inside "${cartName}" in your cart.`
              };
            }
          }
        }

        const newDeep = this.getDeepParametersForSheetTest(newName, allSheetTests);
        if (newDeep.subParameters.length > 0) {
          for (const param of newDeep.subParameters) {
            const paramClean = this.cleanStr(param);
            if (paramClean === cartNameClean || 
                new RegExp(`(^|[^a-z0-9])${paramClean}([^a-z0-9]|$)`, 'i').test(cartNameClean) ||
                new RegExp(`(^|[^a-z0-9])${cartNameClean}([^a-z0-9]|$)`, 'i').test(paramClean)) {
              return {
                hasConflict: true,
                reason: `⚠️ Your cart already has "${cartName}". To add the complete "${newName}" panel, please remove "${cartName}" from cart first.`
              };
            }
          }
        }
      }
    }

    return { hasConflict: false, reason: '' };
  }
};

// Global Exposure across all environments
if (typeof window !== 'undefined') {
  window.Utils = Utils;
  window.ConflictValidator = ConflictValidator;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Utils, ConflictValidator };
}
