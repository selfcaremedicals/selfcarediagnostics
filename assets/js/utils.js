/* file: assets/js/utils.js */
/**
 * Selfcare Diagnostics - Dynamic 2-Tier Sheet Inspection Engine v12.5.0
 * Verified against live database export:
 * - Test IDs: CBC (SCDT0001/T0001), Lipid (SCDT0002/T0002), LFT (SCDT0003/T0003),
 *             RFT (SCDT0004/T0004), Thyroid (SCDT0005/T0005), Iron (SCDT0006/T0006),
 *             Hemoglobin (SCDT0008/T0008), PCV (SCDT0009/T0009), RBC (SCDT0010/T0010),
 *             WBC (SCDT0011/T0011), Platelets (SCDT0012/T0012), ESR (SCDT0013/T0013).
 * - Sugars:   FBS (SCDT0018/T0018), PPBS (SCDT0019/T0019), RBS (SCDT0020/T0020).
 * - Specimen: Urine Complete Analysis (SCDT0028/T0028) vs Blood Tests.
 * - Packages: SELFCARE BASIC HEALTH (SCD PACK 001 / PKG001 / BASIC HEALTH).
 */

const Utils = {
  formatCurrency(amount) {
    if (amount === undefined || amount === null || isNaN(Number(amount))) return '₹0';
    return '₹' + Math.round(Number(amount)).toLocaleString('en-IN');
  },

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

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

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

  isOnline() {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
};

const ConflictValidator = {
  // Correctly aligned with your catalog
  panelAliases: {
    'CBC': ['cbc', 'complete blood count', 'hemogram', 'complete hemogram', 'haemogram', 'complete blood picture', 'cbp', 't0001', 'scdt0001'],
    'LIPID': ['lipid profile', 'lipid panel', 'cholesterol panel', 'lipid screen', 'lipids', 'complete lipid profile', 't0002', 'scdt0002'],
    'LFT': ['lft', 'liver function test', 'liver function', 'liver panel', 'hepatic function', 'liver profile', 't0003', 'scdt0003'],
    'KFT': ['kft', 'rft', 'kidney function test', 'renal function test', 'kidney function', 'renal function', 'kidney panel', 'renal panel', 'renal profile', 't0004', 'scdt0004'],
    'THYROID': ['thyroid profile', 'thyroid panel', 'total thyroid', 't3 t4 tsh', 'thyroid function', 'thyroid profile total', 't0005', 'scdt0005', 't0007', 'scdt0007', 't0062', 'scdt0062'],
    'IRON': ['iron profile', 'serum iron profile', 'iron studies', 't0006', 'scdt0006'],
    'DIABETES': ['diabetes profile', 'diabetic screen', 'diabetes panel', 'blood sugar profile']
  },

  escapeRegExp(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  isPatientMatch(patientIdA, patientIdB) {
    const a = String(patientIdA || 'self').trim().toLowerCase();
    const b = String(patientIdB || 'self').trim().toLowerCase();
    if (a === b) return true;
    if ((a === 'self' || a === 'patient_self' || a === '') && (b === 'self' || b === 'patient_self' || b === '')) return true;
    return false;
  },

  isPackage(item) {
    if (!item) return false;
    if (item.isPackage === true || String(item.isPackage).toLowerCase() === 'true') return true;
    const type = String(item.type || '').toLowerCase();
    if (type === 'package') return true;
    if (item.PackageID || item.PackageCode) return true;

    const code = String(item.PackageCode || item.PackageID || item.TestCode || item.code || item.id || '').toUpperCase().trim();
    const name = String(item.PackageName || item.TestName || item.name || '').toUpperCase().trim();

    if (
      code.startsWith('PKG') ||
      code.includes('SCDPACK') ||
      code.includes('SCD PACK') ||
      code.startsWith('PACK') ||
      code.startsWith('SCDP') ||
      code === 'BASIC HEALTH' ||
      name.includes('PACKAGE') ||
      name.includes('HEALTH CHECK') ||
      name.includes('FULL BODY') ||
      name.includes('WELLNESS') ||
      name.includes('MASTER HEALTH') ||
      name.includes('BASIC HEALTH') ||
      name.includes('COMPREHENSIVE HEALTH') ||
      name.includes('EXECUTIVE HEALTH') ||
      name.includes('SENIOR CITIZEN') ||
      name.includes('FEVER ADVANCED') ||
      name.includes('WOMEN HEALTH') ||
      name.includes('MEN HEALTH')
    ) {
      return true;
    }

    try {
      const raw = localStorage.getItem('cache_packages') || localStorage.getItem('selfcare_packages_db');
      if (raw) {
        const pkgs = JSON.parse(raw);
        if (Array.isArray(pkgs) && pkgs.length > 0) {
          const isFound = pkgs.some(p => {
            if (!p) return false;
            const pId = String(p.PackageID || p.id || p.PackageCode || p.code || '').toUpperCase().trim();
            const pName = String(p.PackageName || p.name || p.TestName || '').toUpperCase().trim();
            return (code && (pId === code || pName === code)) || (name && (pName === name || pId === name));
          });
          if (isFound) return true;
        }
      }
    } catch (e) {}

    return false;
  },

  isReticulocyte(item) {
    if (!item) return false;
    const code = String(item.TestCode || item.code || item.TestID || item.id || '').toUpperCase();
    const name = String(item.TestName || item.name || '').toUpperCase();
    return name.includes('RETICULOCYTE') || code.includes('RETIC') || code === 'T0015' || code === 'SCDT0015';
  },

  isUrineItem(item) {
    if (!item) return false;
    if (this.isPackage(item)) return false;

    const sample = String(item.SampleType || item.sample || '').toUpperCase();
    const name = String(item.TestName || item.name || '').toUpperCase();
    const code = String(item.TestCode || item.code || item.TestID || item.id || '').toUpperCase().replace(/[\s\-_]/g, '');

    if (sample.includes('URINE')) return true;
    if (name.includes('URINE') || name.includes('URINARY')) return true;
    // Accurate Urine Codes from your database
    if (code === 'T0028' || code === 'SCDT0028' || code === 'T0029' || code === 'SCDT0029') return true;
    return false;
  },

  isBloodSugarTest(item, type) {
    if (!item) return false;
    if (this.isPackage(item)) return false;
    if (this.isUrineItem(item)) return false;

    const name = String(item.TestName || item.name || '').toUpperCase();
    const code = String(item.TestCode || item.code || item.TestID || item.id || '').toUpperCase().replace(/[\s\-_]/g, '');

    // Aligned strictly with your database: T0018=FBS, T0019=PPBS, T0020=RBS
    const codes = {
      rbs: ['T0020', 'SCDT0020', 'RBS', 'RANDOMBLOODSUGAR', 'RANDOMGLUCOSE', 'BLOODSUGARRANDOM'],
      fbs: ['T0018', 'SCDT0018', 'FBS', 'FASTINGBLOODSUGAR', 'FASTINGBLOODGLUCOSE', 'FASTINGGLUCOSE', 'BLOODSUGARFASTING'],
      ppbs: ['T0019', 'SCDT0019', 'PPBS', 'POSTPRANDIALBLOODSUGAR', 'POSTPRANDIALBLOODGLUCOSE', 'POSTPRANDIALGLUCOSE', 'BLOODSUGARPP', 'PPBLOODSUGAR']
    };

    if (type === 'rbs') {
      if (codes.rbs.includes(code)) return true;
      return (name.includes('RANDOM') && (name.includes('SUGAR') || name.includes('GLUCOSE'))) || name === 'RBS';
    }
    if (type === 'fbs') {
      if (codes.fbs.includes(code)) return true;
      return (name.includes('FASTING') && (name.includes('SUGAR') || name.includes('GLUCOSE'))) || name === 'FBS';
    }
    if (type === 'ppbs') {
      if (codes.ppbs.includes(code)) return true;
      return (name.includes('POST PRANDIAL') && (name.includes('SUGAR') || name.includes('GLUCOSE'))) || name.includes('PPBS') || name.includes('P.P. BLOOD SUGAR') || name.includes('P.P. GLUCOSE');
    }
    return false;
  },

  packageHasFbs(pkg) {
    if (!pkg) return false;
    const fullPkg = this.findFullPackageFromSheet(pkg);
    const constituents = this.extractPackageConstituents(fullPkg);

    for (const item of constituents) {
      const str = String(item).toUpperCase().trim();
      if (str.includes('FASTING BLOOD SUGAR') || str.includes('FASTING GLUCOSE') || str === 'FBS' || str === 'T0018' || str.includes('SCDT0018')) {
        return true;
      }
    }

    const raw = String(fullPkg.Parameters || fullPkg.parameters || fullPkg.Description || fullPkg.WhyDone || '').toUpperCase();
    return raw.includes('FASTING BLOOD SUGAR') || raw.includes('FASTING GLUCOSE') || raw.includes('FBS') || raw.includes('T0018') || raw.includes('BLOOD GLUCOSE');
  },

  cleanStr(str) {
    if (typeof str === 'object' && str !== null) {
      str = str.TestName || str.PackageName || str.name || str.TestCode || '';
    }
    return String(str || '')
      .toLowerCase()
      .replace(/[;,/|•\n\t()\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  isParamMatch(paramClean, targetClean) {
    if (!paramClean || !targetClean) return false;
    if (paramClean === targetClean) return true;

    if (paramClean.length >= 4 && targetClean.length >= 4) {
      if (paramClean.includes(targetClean) || targetClean.includes(paramClean)) {
        return true;
      }
    }

    const escP = this.escapeRegExp(paramClean);
    const escT = this.escapeRegExp(targetClean);
    const pInT = new RegExp(`(^|[^a-z0-9])${escP}([^a-z0-9]|$)`, 'i').test(targetClean);
    const tInP = new RegExp(`(^|[^a-z0-9])${escT}([^a-z0-9]|$)`, 'i').test(paramClean);

    return pInT || tInP;
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
    if (!cartPkg) return {};
    try {
      const raw = localStorage.getItem('cache_packages') || localStorage.getItem('selfcare_packages_db');
      if (raw) {
        const pkgs = JSON.parse(raw);
        const pId = String(cartPkg.PackageID || cartPkg.id || cartPkg.PackageCode || cartPkg.code || '').toUpperCase().trim();
        const pName = String(cartPkg.PackageName || cartPkg.TestName || cartPkg.name || '').toUpperCase().trim();

        const found = pkgs.find(p => {
          if (!p) return false;
          const cId = String(p.PackageID || p.id || p.PackageCode || p.code || '').toUpperCase().trim();
          const cName = String(p.PackageName || p.name || p.TestName || '').toUpperCase().trim();
          if (pId && (cId === pId || cName === pId)) return true;
          if (pName && (cName === pName || cId === pName)) return true;
          if (pName && cName && (cName.includes(pName) || pName.includes(cName))) return true;
          return false;
        });

        if (found) {
          return { ...cartPkg, ...found };
        }
      }
    } catch (e) {}
    return cartPkg;
  },

  extractPackageConstituents(pkg) {
    if (!pkg) return [];
    const fullPkg = this.findFullPackageFromSheet(pkg);

    let items = [];
    const candidateSources = [
      fullPkg.IncludedTests,
      fullPkg.TestsIncluded,
      fullPkg.Tests,
      fullPkg.tests,
      fullPkg.TestList,
      fullPkg.TestIDs,
      fullPkg.Parameters,
      fullPkg.parameters,
      fullPkg.Description,
      pkg.IncludedTests,
      pkg.TestsIncluded,
      pkg.Tests,
      pkg.Parameters
    ];

    candidateSources.forEach(source => {
      if (!source) return;

      if (typeof source === 'string') {
        const trimmed = source.trim();
        if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              source = parsed;
            }
          } catch (e) {}
        }
      }

      if (Array.isArray(source)) {
        source.forEach(r => {
          if (typeof r === 'object' && r !== null) {
            const val = r.Name || r.ParameterName || r.TestName || r.name || r.code || r.TestCode || r.TestID || '';
            if (val) items.push(String(val).trim());
          } else if (r) {
            items.push(String(r).trim());
          }
        });
      } else if (typeof source === 'string') {
        items.push(...source.split(/[;,|\n•]|<br\s*[\/]?>/i).map(i => i.trim()).filter(Boolean));
      }
    });

    // Real Package Constitution as defined in your database
    const cleanPkgName = this.cleanStr(fullPkg.PackageName || fullPkg.TestName || fullPkg.name || pkg.name || '');
    if (cleanPkgName.includes('basic health')) {
      items.push(
        'Complete Blood Count (CBC)', 'CBC', 'T0001',
        'Lipid Profile', 'T0002',
        'Liver Function Test (LFT)', 'LFT', 'T0003',
        'Renal Function Test (RFT)', 'KFT', 'RFT', 'T0004',
        'Thyroid Profile (T3, T4, TSH)', 'T0005',
        'Fasting Blood Sugar (FBS)', 'FBS', 'T0018',
        'HbA1c', 'T0021',
        'ESR', 'T0013',
        'Urine Complete Analysis', 'T0028'
      );
    }

    const seen = new Set();
    const result = [];
    for (const item of items) {
      const clean = item.trim();
      const lower = clean.toLowerCase();
      if (clean.length > 1 && !seen.has(lower)) {
        seen.add(lower);
        result.push(clean);
      }
    }

    return result;
  },

  isSameOrganPanel(nameA, codeA, nameB, codeB) {
    const cleanA = this.cleanStr(nameA);
    const cleanB = this.cleanStr(nameB);
    const cA = String(codeA || '').toUpperCase().trim();
    const cB = String(codeB || '').toUpperCase().trim();

    if (cA && cB && cA === cB) return true;
    if (cleanA && cleanB && cleanA === cleanB) return true;

    for (const key of Object.keys(this.panelAliases)) {
      const aliases = this.panelAliases[key];
      const aMatches = aliases.some(alias => cleanA === alias || cleanA.includes(alias) || (cA && cA === alias.toUpperCase()));
      const bMatches = aliases.some(alias => cleanB === alias || cleanB.includes(alias) || (cB && cB === alias.toUpperCase()));
      if (aMatches && bMatches) {
        return true;
      }
    }
    return false;
  },

  getDeepParametersForSheetTest(constituentName, allSheetTests) {
    if (!constituentName) {
      return { parentTest: null, subParameters: [] };
    }

    const cStr = typeof constituentName === 'object' && constituentName !== null
      ? (constituentName.TestName || constituentName.PackageName || constituentName.name || constituentName.TestCode || '')
      : String(constituentName);

    const cClean = this.cleanStr(cStr);
    const cUpper = cStr.toUpperCase().trim();

    let matchedTest = null;
    if (Array.isArray(allSheetTests) && allSheetTests.length > 0) {
      matchedTest = allSheetTests.find(t => {
        if (!t) return false;
        const tName = String(t.TestName || t.name || '').trim();
        const tCode = String(t.TestCode || t.TestID || t.id || '').toUpperCase().trim();
        const tClean = this.cleanStr(tName);

        if (tCode && (tCode === cUpper || cUpper.includes(tCode))) return true;
        if (tClean && (tClean === cClean || cClean.includes(tClean))) return true;

        for (const key of Object.keys(this.panelAliases)) {
          const aliases = this.panelAliases[key];
          const cMatches = aliases.some(a => cClean === a || cClean.includes(a) || cUpper === a.toUpperCase());
          const tMatches = aliases.some(a => tClean === a || tClean.includes(a) || tCode === a.toUpperCase());
          if (cMatches && tMatches) return true;
        }

        return false;
      });
    }

    let subParams = [];

    if (matchedTest) {
      const rawParams = matchedTest.Parameters || matchedTest.parameters || matchedTest.Description || '';
      if (Array.isArray(rawParams)) {
        subParams = rawParams.map(p => {
          if (typeof p === 'object' && p !== null) return p.Name || p.ParameterName || p.TestName || '';
          return String(p).trim();
        });
      } else if (typeof rawParams === 'string') {
        subParams = rawParams.split(/[;,|\n•]|<br\s*[\/]?>/i).map(p => p.trim());
      }
    }

    if (typeof constituentName === 'object' && constituentName !== null) {
      const directParams = constituentName.Parameters || constituentName.parameters;
      if (Array.isArray(directParams)) {
        subParams.push(...directParams.map(p => typeof p === 'object' ? (p.Name || p.ParameterName || '') : String(p)));
      } else if (typeof directParams === 'string') {
        subParams.push(...directParams.split(/[;,|\n•]|<br\s*[\/]?>/i));
      }
    }

    // Exact sub-parameter fallbacks verified against Selfcare Catalog
    if (cClean.includes('cbc') || cClean.includes('hemogram') || (matchedTest && String(matchedTest.TestCode || '').toUpperCase() === 'T0001')) {
      subParams.push(
        'Hemoglobin', 'Hb', 'Total WBC', 'TLC', 'WBC', 'Total WBC Count',
        'RBC', 'RBC Count', 'Red Blood Cell Count', 'Platelet', 'Platelet Count', 'PCV',
        'Hematocrit', 'Packed Cell Volume', 'MCV', 'MCH', 'MCHC', 'RDW',
        'RDW-CV', 'RDW-SD', 'Neutrophils', 'Lymphocytes', 'Monocytes',
        'Eosinophils', 'Basophils', 'Differential Count', 'DLC', 'Absolute Neutrophil Count',
        'Absolute Lymphocyte Count', 'Absolute Monocyte Count', 'Absolute Eosinophil Count',
        'Absolute Basophil Count', 'MPV', 'P-LCR', 'PCT', 'PDW'
      );
    } else if (cClean.includes('lft') || cClean.includes('liver') || (matchedTest && String(matchedTest.TestCode || '').toUpperCase() === 'T0003')) {
      subParams.push('Total Bilirubin', 'Direct Bilirubin', 'Indirect Bilirubin', 'Bilirubin', 'SGOT', 'AST', 'SGPT', 'ALT', 'Alkaline Phosphatase', 'ALP', 'Total Protein', 'Albumin', 'Globulin', 'A/G Ratio', 'GGT', 'Gamma GT');
    } else if (cClean.includes('kft') || cClean.includes('rft') || cClean.includes('kidney') || cClean.includes('renal') || (matchedTest && String(matchedTest.TestCode || '').toUpperCase() === 'T0004')) {
      subParams.push('Blood Urea', 'Urea', 'BUN', 'Creatinine', 'Serum Creatinine', 'Uric Acid', 'Sodium', 'Potassium', 'Chloride', 'Calcium', 'Bun Creatinine Ratio');
    } else if (cClean.includes('lipid') || (matchedTest && String(matchedTest.TestCode || '').toUpperCase() === 'T0002')) {
      subParams.push('Total Cholesterol', 'Cholesterol', 'Triglycerides', 'HDL', 'HDL Cholesterol', 'LDL', 'LDL Cholesterol', 'VLDL', 'VLDL Cholesterol', 'Non-HDL Cholesterol', 'Chol / HDL Ratio', 'LDL / HDL Ratio');
    } else if (cClean.includes('thyroid') || (matchedTest && (String(matchedTest.TestCode || '').toUpperCase() === 'T0005' || String(matchedTest.TestCode || '').toUpperCase() === 'T0007'))) {
      subParams.push('Total T3', 'T3', 'Total T4', 'T4', 'TSH', 'Free T3', 'Free T4');
    }

    return {
      parentTest: matchedTest,
      subParameters: subParams.filter(p => p && String(p).trim().length > 1).map(p => String(p).trim())
    };
  },

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

    const patientCart = cart.filter(item => {
      if (!item) return false;
      if (targetPatientId && item.patientId) {
        return this.isPatientMatch(item.patientId, targetPatientId);
      }
      return true;
    });

    if (patientCart.length === 0) {
      return { hasConflict: false, reason: '' };
    }

    // Sugar Conflict Engine (T0018 / T0019 / T0020)
    const isNewRbs = this.isBloodSugarTest(newItem, 'rbs');
    const isNewFbs = this.isBloodSugarTest(newItem, 'fbs');
    const isNewPpbs = this.isBloodSugarTest(newItem, 'ppbs');
    const isNewPkgWithFbs = newIsPkg && this.packageHasFbs(newItem);

    const cartHasFbs = patientCart.some(c => this.isBloodSugarTest(c, 'fbs') || (this.isPackage(c) && this.packageHasFbs(c)));
    const cartHasPpbs = patientCart.some(c => this.isBloodSugarTest(c, 'ppbs'));
    const cartHasRbs = patientCart.some(c => this.isBloodSugarTest(c, 'rbs'));

    if (isNewRbs) {
      if (cartHasFbs && cartHasPpbs) {
        return {
          hasConflict: true,
          reason: `⚠️ Fasting Blood Sugar (FBS) & PPBS are already in your cart. Random Blood Sugar (RBS) is not required.`
        };
      }
      if (cartHasFbs) {
        return {
          hasConflict: true,
          reason: `⚠️ Fasting Blood Sugar (FBS) is already included. Random Blood Sugar (RBS) is not required.`
        };
      }
      if (cartHasPpbs) {
        return {
          hasConflict: true,
          reason: `⚠️ Post Prandial Blood Sugar (PPBS) is already in your cart. Random Blood Sugar (RBS) is not required.`
        };
      }
    }

    if (cartHasRbs) {
      if (isNewFbs) {
        return {
          hasConflict: true,
          reason: `⚠️ Random Blood Sugar (RBS) is already in your cart. Please remove RBS to add Fasting Blood Sugar (FBS).`
        };
      }
      if (isNewPpbs) {
        return {
          hasConflict: true,
          reason: `⚠️ Random Blood Sugar (RBS) is already in your cart. Please remove RBS to add Post Prandial Blood Sugar (PPBS).`
        };
      }
      if (isNewPkgWithFbs) {
        return {
          hasConflict: true,
          reason: `⚠️ Random Blood Sugar (RBS) is already in your cart. Please remove RBS to add "${newName}".`
        };
      }
    }

    // General Panel & Parameter Graph Engine
    for (const cartItem of patientCart) {
      if (!cartItem) continue;
      if (this.isReticulocyte(cartItem)) continue;

      const cartIsPkg = this.isPackage(cartItem);
      const cartName = cartItem.TestName || cartItem.PackageName || cartItem.name || 'Package';
      const cartNameClean = this.cleanStr(cartName);
      const cartCode = (cartItem.PackageCode || cartItem.PackageID || cartItem.TestCode || cartItem.code || cartItem.id || '').toUpperCase().replace(/[\s\-_]/g, '');
      const isLocked = Boolean(cartItem.isExistingLocked || cartItem.isExistingBookingItem);
      const placeText = isLocked ? 'in your booked appointment' : 'in your cart';

      // Rule 4: Package vs Package
      if (cartIsPkg && newIsPkg) {
        if (newCode && cartCode && newCode === cartCode) {
          return {
            hasConflict: true,
            reason: `⚠️ "${newName}" is already ${placeText}.`
          };
        }

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
            reason: `⚠️ Package Conflict: "${newName}" contains common tests (${commonOverlaps.slice(0, 3).join(', ')}) already included in "${cartName}". You cannot add two health packages simultaneously for the same person.`
          };
        }

        return {
          hasConflict: true,
          reason: `⚠️ Package Conflict: You already have "${cartName}" ${placeText}. Please remove it first to select "${newName}".`
        };
      }

      // Rule 1: Package in Cart -> Adding Single Test / Parameter (e.g. CBC or Hb)
      if (cartIsPkg && !newIsPkg) {
        const pkgConstituents = this.extractPackageConstituents(cartItem);

        for (const constituent of pkgConstituents) {
          const itemClean = this.cleanStr(constituent);
          const itemCode = constituent.toUpperCase().replace(/[\s\-_]/g, '');

          if ((newCode && (newCode === itemCode || newCode === constituent.toUpperCase())) ||
              this.isSameOrganPanel(constituent, itemCode, newName, newCode) ||
              (itemClean && (itemClean === newNameClean || (itemClean.length > 3 && newNameClean === itemClean)))) {
            return {
              hasConflict: true,
              reason: `⚠️ "${newName}" is already included in the "${cartName}" package ${placeText}.`
            };
          }

          const { parentTest, subParameters } = this.getDeepParametersForSheetTest(constituent, allSheetTests);
          const parentName = parentTest ? (parentTest.TestName || constituent) : constituent;

          const isConstituentUrine = this.isUrineItem(parentTest || { TestName: constituent });
          const isNewUrine = this.isUrineItem(newItem);
          if (isConstituentUrine !== isNewUrine) {
            continue;
          }

          if (parentTest && this.isSameOrganPanel(parentName, parentTest.TestCode, newName, newCode)) {
            return {
              hasConflict: true,
              reason: `⚠️ "${newName}" is already included in the "${cartName}" package ${placeText}.`
            };
          }

          for (const param of subParameters) {
            const paramClean = this.cleanStr(param);
            if (this.isParamMatch(paramClean, newNameClean)) {
              return {
                hasConflict: true,
                reason: `⚠️ "${newName}" is already covered under "${parentName}" in the "${cartName}" package ${placeText}.`
              };
            }
          }
        }
        continue;
      }

      // Rule 2: Single Test / Parameter in Cart -> Adding Package
      if (!cartIsPkg && newIsPkg) {
        const pkgConstituents = this.extractPackageConstituents(newItem);

        for (const constituent of pkgConstituents) {
          const itemClean = this.cleanStr(constituent);
          const itemCode = constituent.toUpperCase().replace(/[\s\-_]/g, '');

          if (this.isSameOrganPanel(constituent, itemCode, cartName, cartCode) || itemClean === cartNameClean) {
            return {
              hasConflict: true,
              reason: `⚠️ You already have "${cartName}" ${placeText}. It is already included in "${newName}". Please remove "${cartName}" first to add this package.`
            };
          }

          const { parentTest, subParameters } = this.getDeepParametersForSheetTest(constituent, allSheetTests);
          const parentName = parentTest ? (parentTest.TestName || constituent) : constituent;

          const isConstituentUrine = this.isUrineItem(parentTest || { TestName: constituent });
          const isCartUrine = this.isUrineItem(cartItem);
          if (isConstituentUrine !== isCartUrine) {
            continue;
          }

          for (const param of subParameters) {
            const paramClean = this.cleanStr(param);
            if (this.isParamMatch(paramClean, cartNameClean)) {
              return {
                hasConflict: true,
                reason: `⚠️ You have "${cartName}" ${placeText} which is already covered under "${parentName}" in "${newName}". Please remove "${cartName}" first to add this package.`
              };
            }
          }
        }
        continue;
      }

      // Rule 3: Single Test vs Single Test / Parameter (e.g. CBC vs Hemoglobin)
      if (!cartIsPkg && !newIsPkg) {
        if ((newCode && cartCode && newCode === cartCode) || (newNameClean && cartNameClean && newNameClean === cartNameClean)) {
          return {
            hasConflict: true,
            reason: `⚠️ "${newName}" is already ${placeText}.`
          };
        }

        if (this.isSameOrganPanel(cartName, cartCode, newName, newCode)) {
          return {
            hasConflict: true,
            reason: `⚠️ "${newName}" is already included ${placeText}.`
          };
        }

        const isCartUrine = this.isUrineItem(cartItem);
        const isNewUrine = this.isUrineItem(newItem);
        if (isCartUrine !== isNewUrine) {
          continue;
        }

        // 3A: Cart has CBC -> Adding Hemoglobin / Platelets
        const cartDeep = this.getDeepParametersForSheetTest(cartName, allSheetTests);
        if (cartDeep.subParameters.length > 0) {
          for (const param of cartDeep.subParameters) {
            const paramClean = this.cleanStr(param);
            if (this.isParamMatch(paramClean, newNameClean)) {
              return {
                hasConflict: true,
                reason: `⚠️ "${newName}" is already covered inside "${cartName}" ${placeText}.`
              };
            }
          }
        }

        // 3B: Cart has Hemoglobin -> Adding CBC
        const newDeep = this.getDeepParametersForSheetTest(newName, allSheetTests);
        if (newDeep.subParameters.length > 0) {
          for (const param of newDeep.subParameters) {
            const paramClean = this.cleanStr(param);
            if (this.isParamMatch(paramClean, cartNameClean)) {
              return {
                hasConflict: true,
                reason: `⚠️ You already have "${cartName}" ${placeText}. To add the complete "${newName}" panel, please remove "${cartName}" first.`
              };
            }
          }
        }
      }
    }

    return { hasConflict: false, reason: '' };
  }
};

if (typeof window !== 'undefined') {
  window.Utils = Utils;
  window.ConflictValidator = ConflictValidator;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Utils, ConflictValidator };
}
