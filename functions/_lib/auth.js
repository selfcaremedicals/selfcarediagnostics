/* file: functions/_lib/auth.js */

const otpMemoryStore = new Map();

export const Security = {
  sanitizeParams(params) {
    if (!params || typeof params !== 'object') return {};
    const sanitized = {};
    for (const key of Object.keys(params)) {
      const val = params[key];
      if (typeof val === 'string') {
        sanitized[key] = this.sanitizeText(val);
      } else if (Array.isArray(val)) {
        sanitized[key] = val.map(item => {
          if (typeof item === 'string') return Security.sanitizeText(item);
          if (typeof item === 'object' && item !== null) return Security.sanitizeParams(item);
          return item;
        });
      } else if (typeof val === 'object' && val !== null) {
        sanitized[key] = this.sanitizeParams(val);
      } else {
        sanitized[key] = val;
      }
    }
    return sanitized;
  },

  sanitizeText(str) {
    if (str === null || str === undefined) return '';
    let clean = String(str).trim();
    clean = clean.replace(/<[^>]*>?/gm, '');
    clean = clean.replace(/javascript\s*:/gi, '');
    if (/^[\=\+\-\@\t\r]/.test(clean)) {
      clean = "'" + clean;
    }
    return clean;
  },

  sanitizeMobile(mobile) {
    if (!mobile) return '';
    return String(mobile).replace(/\D/g, '').slice(-10);
  },

  isValidMobile(mobile) {
    return /^[6-9]\d{9}$/.test(this.sanitizeMobile(mobile));
  },

  isValidOtp(otp) {
    return /^\d{4}$/.test(String(otp || '').trim());
  },

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }
};

export function createAuthAPI(db, env) {
  const DEV_MASTER_OTP = env.DEV_MASTER_OTP || '1234';
  const OTP_EXPIRY_SECONDS = Number(env.OTP_EXPIRY_SECONDS || 300);
  const ADMIN_ID = env.ADMIN_ID || 'SCDADMIN01';
  const ADMIN_PWD = env.ADMIN_PWD || 'admin@123';

  const CUSTOMER_HEADERS = [
    'UserID', 'Mobile', 'Password', 'Salutation', 'Name', 'DOB', 'Email', 'Age', 'Gender',
    'BloodGroup', 'Address', 'Location', 'Role', 'Membership',
    'MembershipExpiry', 'MembershipPaymentID', 'CreatedAt', 'LastLoginAt'
  ];

  const TECH_HEADERS = [
    'TechID', 'Name', 'LoginID', 'Password', 'Phone', 'ZoneArea', 'UpiID', 'Rating', 'RatingCount', 'Status', 'CreatedAt'
  ];

  function buildPatientSessionPayload(userRow, mobile) {
    let currentMembership = userRow.Membership || 'Regular';
    const currentExpiry = userRow.MembershipExpiry || '';
    if (currentMembership === 'Membership' && currentExpiry) {
      const expDate = new Date(currentExpiry);
      if (isNaN(expDate.getTime()) || expDate < new Date()) {
        currentMembership = 'Regular';
      }
    }

    return {
      success: true,
      userId: userRow.UserID || ('SCD_' + mobile),
      mobile,
      salutation: userRow.Salutation || 'Mr.',
      name: userRow.Name || 'Valued Customer',
      dob: userRow.DOB || '',
      email: userRow.Email || '',
      age: userRow.Age || '',
      gender: userRow.Gender || 'Male',
      bloodGroup: userRow.BloodGroup || 'O+',
      address: userRow.Address || '',
      location: userRow.Location || '',
      role: 'patient',
      membership: currentMembership,
      membershipExpiry: currentExpiry,
      token: 'LIFETIME_NABL_TOKEN_' + mobile
    };
  }

  return {
    async initDatabase() {
      const nowIso = new Date().toISOString();
      const createdOrVerified = [];

      await db.ensureSheet('Technicians', TECH_HEADERS);
      const existingTechs = await db.getSheetData('Technicians');

      if (existingTechs.length === 0) {
        await db.appendRows('Technicians', [
          {
            TechID: 'SCDADMIN01',
            Name: 'Super Administrator',
            LoginID: 'SCDADMIN01',
            Password: ADMIN_PWD,
            Phone: '7010174890',
            ZoneArea: 'Vettuvankeni Head Office',
            UpiID: '',
            Rating: 5.0,
            RatingCount: 0,
            Status: 'Active',
            CreatedAt: nowIso
          },
          {
            TechID: 'SCDTECH001',
            Name: 'Mohamed Adamkani',
            LoginID: 'SCDTECH001',
            Password: 'Admin@123',
            Phone: '7010174890',
            ZoneArea: 'Vettuvankeni, ECR & OMR (10 km)',
            UpiID: '',
            Rating: 4.9,
            RatingCount: 0,
            Status: 'Active',
            CreatedAt: nowIso
          }
        ]);
        createdOrVerified.push('Technicians (Seeded SCDADMIN01 & SCDTECH001)');
      } else {
        createdOrVerified.push('Technicians (Verified)');
      }

      await db.ensureSheet('Customers', CUSTOMER_HEADERS);
      createdOrVerified.push('Customers (Verified)');

      return {
        success: true,
        message: 'Login database sheets (Customers & Technicians) ready!',
        details: createdOrVerified
      };
    },

    async patientRegister(params = {}) {
      const rawMobile = params.mobile || params.phone || '';
      const mobile = String(rawMobile).replace(/\D/g, '').slice(-10);
      const password = String(params.password || '').trim();

      if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
        throw new Error('Please enter a valid 10-digit Indian mobile number.');
      }
      if (!password || password.length < 4) {
        throw new Error('Password must be at least 4 characters long.');
      }

      await db.ensureSheet('Customers', CUSTOMER_HEADERS);
      const nowIso = new Date().toISOString();
      const customers = await db.getSheetData('Customers');
      const existingUser = customers.find(
        c => String(c.Mobile || '').replace(/\D/g, '').slice(-10) === mobile
      );

      if (existingUser) {
        const existingPwd = String(existingUser.Password || '').trim();
        if (existingPwd) {
          throw new Error('Mobile number already registered. Please Login with your password.');
        }

        await db.updateRows('Customers', 'Mobile', mobile, {
          Password: db.sanitizeValue(password),
          Name: db.sanitizeValue(params.name || existingUser.Name || 'Valued Customer'),
          LastLoginAt: nowIso
        });
        existingUser.Password = password;
        return buildPatientSessionPayload(existingUser, mobile);
      }

      const newCustomer = {
        UserID: 'SCD_' + mobile,
        Mobile: mobile,
        Password: db.sanitizeValue(password),
        Salutation: db.sanitizeValue(params.salutation || 'Mr.'),
        Name: db.sanitizeValue(params.name || 'Valued Customer'),
        DOB: db.sanitizeValue(params.dob || ''),
        Email: db.sanitizeValue(params.email || ''),
        Age: db.sanitizeValue(params.age || ''),
        Gender: db.sanitizeValue(params.gender || 'Male'),
        BloodGroup: db.sanitizeValue(params.bloodGroup || 'O+'),
        Address: db.sanitizeValue(params.address || ''),
        Location: db.sanitizeValue(params.location || ''),
        Role: 'patient',
        Membership: 'Regular',
        MembershipExpiry: '',
        MembershipPaymentID: '',
        CreatedAt: nowIso,
        LastLoginAt: nowIso
      };

      await db.appendRow('Customers', newCustomer);
      return buildPatientSessionPayload(newCustomer, mobile);
    },

    async patientLogin(params = {}) {
      const rawMobile = params.mobile || params.phone || '';
      const mobile = String(rawMobile).replace(/\D/g, '').slice(-10);
      const password = String(params.password || '').trim();

      if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
        throw new Error('Please enter a valid 10-digit Indian mobile number.');
      }
      if (!password) {
        throw new Error('Please enter your password.');
      }

      await db.ensureSheet('Customers', CUSTOMER_HEADERS);
      const customers = await db.getSheetData('Customers');
      const matchedUser = customers.find(
        c => String(c.Mobile || '').replace(/\D/g, '').slice(-10) === mobile
      );

      if (!matchedUser) {
        throw new Error('Mobile number not registered. Please click Sign Up to create an account.');
      }

      const savedPassword = String(matchedUser.Password || '').trim();
      if (!savedPassword) {
        throw new Error('Password not set for this account. Please click Sign Up to set your password.');
      }
      if (savedPassword !== password) {
        throw new Error('Incorrect password. Please try again.');
      }

      await db.updateRows('Customers', 'Mobile', mobile, {
        LastLoginAt: new Date().toISOString()
      });

      return buildPatientSessionPayload(matchedUser, mobile);
    },

    async requestOtp(params = {}) {
      const rawMobile = params.mobile || params.phone || '';
      const mobile = String(rawMobile).replace(/\D/g, '').slice(-10);
      if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
        throw new Error('Please enter a valid 10-digit Indian mobile number.');
      }
      const dynamicOtp = Math.floor(1000 + Math.random() * 9000).toString();
      otpMemoryStore.set(mobile, {
        otp: dynamicOtp,
        expiresAt: Date.now() + OTP_EXPIRY_SECONDS * 1000
      });

      return {
        success: true,
        mobile,
        devOtp: dynamicOtp,
        masterOtp: DEV_MASTER_OTP,
        expiresInSeconds: OTP_EXPIRY_SECONDS
      };
    },

    async verifyOtp(params = {}) {
      const mobile = String(params.mobile || params.phone || '').replace(/\D/g, '').slice(-10);
      const otp = String(params.otp || '').trim();
      if (!mobile || mobile.length !== 10) throw new Error('Invalid mobile number.');
      if (!otp) throw new Error('Please enter the OTP.');

      const record = otpMemoryStore.get(mobile);
      const cachedOtp = record && Date.now() < record.expiresAt ? record.otp : null;
      const isValid = (otp === DEV_MASTER_OTP) || (cachedOtp && otp === cachedOtp);
      if (!isValid) throw new Error('Invalid OTP entered.');
      otpMemoryStore.delete(mobile);

      await db.ensureSheet('Customers', CUSTOMER_HEADERS);
      const nowIso = new Date().toISOString();
      const customers = await db.getSheetData('Customers');
      let existingUser = customers.find(
        c => String(c.Mobile || '').replace(/\D/g, '').slice(-10) === mobile
      );

      if (existingUser) {
        await db.updateRows('Customers', 'Mobile', mobile, { LastLoginAt: nowIso });
      } else {
        existingUser = {
          UserID: 'SCD_' + mobile,
          Mobile: mobile,
          Password: '',
          Salutation: db.sanitizeValue(params.salutation || 'Mr.'),
          Name: db.sanitizeValue(params.name || 'Valued Customer'),
          DOB: db.sanitizeValue(params.dob || ''),
          Email: db.sanitizeValue(params.email || ''),
          Age: db.sanitizeValue(params.age || '28'),
          Gender: db.sanitizeValue(params.gender || 'Male'),
          BloodGroup: db.sanitizeValue(params.bloodGroup || 'O+'),
          Address: db.sanitizeValue(params.address || 'Chennai, Tamil Nadu'),
          Location: db.sanitizeValue(params.location || 'Chennai'),
          Role: 'patient',
          Membership: 'Regular',
          MembershipExpiry: '',
          MembershipPaymentID: '',
          CreatedAt: nowIso,
          LastLoginAt: nowIso
        };
        await db.appendRow('Customers', existingUser);
      }

      return buildPatientSessionPayload(existingUser, mobile);
    },

    async staffLogin(params = {}) {
      const rawId = String(params.id || params.captainId || params.techId || params.loginId || '').trim();
      const upperId = rawId.toUpperCase();
      const loginId = rawId.toLowerCase();
      const password = String(params.password || '').trim();

      if (!loginId || !password) {
        throw new Error('Please enter both ID and Password.');
      }

      if ((upperId === 'SCDADMIN01' || upperId === 'SCDADMIN' || loginId === 'admin@selfcare') && password === ADMIN_PWD) {
        return {
          success: true,
          userId: upperId.startsWith('SCDADMIN') ? upperId : 'SCDADMIN01',
          name: 'Super Administrator',
          role: 'admin',
          token: 'SELFCARE_ADMIN_TOKEN_SECURE'
        };
      }

      await db.ensureSheet('Technicians', TECH_HEADERS);
      const technicians = await db.getSheetData('Technicians');

      for (const t of technicians) {
        const rowLoginId = String(t.LoginID || '').trim().toLowerCase();
        const rowTechId = String(t.TechID || '').trim().toLowerCase();
        const rowPwd = String(t.Password || '').trim();
        const status = String(t.Status || 'Active').trim().toLowerCase();

        if ((rowLoginId === loginId || rowTechId === loginId) && rowPwd === password) {
          if (status !== 'active') {
            throw new Error('Account is deactivated. Contact Admin.');
          }

          const assignedId = String(t.TechID || t.LoginID).trim();
          const isAdminAccount = assignedId.toUpperCase().startsWith('SCDADMIN');

          const staffObj = {
            id: assignedId,
            captainId: assignedId,
            techId: assignedId,
            name: t.Name,
            mobile: String(t.Phone || '').replace(/\D/g, '').slice(-10),
            zone: t.ZoneArea || 'Vettuvankeni, ECR & OMR',
            upiId: t.UpiID || '',
            rating: Number(t.Rating || 4.9),
            ratingCount: Number(t.RatingCount || 0)
          };

          return {
            success: true,
            userId: assignedId,
            techId: assignedId,
            name: t.Name,
            loginId: assignedId,
            area: t.ZoneArea || 'Chennai Zone',
            zone: t.ZoneArea || 'Chennai Zone',
            upiId: t.UpiID || '',
            role: isAdminAccount ? 'admin' : 'technician',
            captain: staffObj,
            technician: staffObj,
            token: 'TECH_TOKEN_' + assignedId
          };
        }
      }

      throw new Error('Invalid ID or Password.');
    },

    async createTechnician(params = {}) {
      const name = db.sanitizeValue(String(params.name || '').trim());
      const loginId = db.sanitizeValue(String(params.loginId || params.id || params.captainId || '').trim());
      const password = String(params.password || params.pass || '').trim();
      const phone = db.sanitizeValue(String(params.phone || params.mobile || '').replace(/\D/g, '').slice(-10));
      const area = db.sanitizeValue(String(params.area || params.zone || 'Vettuvankeni, ECR & OMR').trim());
      const upiId = db.sanitizeValue(String(params.upiId || '').trim());
      const status = String(params.status || 'Active').trim();

      if (!name || !loginId || !password) {
        throw new Error('Name, ID, and Password are required.');
      }

      await db.ensureSheet('Technicians', TECH_HEADERS);
      const technicians = await db.getSheetData('Technicians');
      const exists = technicians.some(t => {
        const existingLogin = String(t.LoginID || t.TechID || '').trim().toLowerCase();
        return existingLogin === loginId.toLowerCase();
      });

      if (exists) {
        await db.updateRows('Technicians', 'TechID', loginId, {
          Name: name,
          LoginID: loginId,
          Password: password,
          Phone: phone,
          ZoneArea: area,
          UpiID: upiId,
          Status: status
        });
      } else {
        await db.appendRow('Technicians', {
          TechID: loginId,
          Name: name,
          LoginID: loginId,
          Password: password,
          Phone: phone,
          ZoneArea: area,
          UpiID: upiId,
          Rating: 4.9,
          RatingCount: 0,
          Status: status,
          CreatedAt: new Date().toISOString()
        });
      }

      return {
        success: true,
        id: loginId,
        techId: loginId,
        name,
        loginId,
        phone,
        zone: area,
        upiId,
        status
      };
    },

    async getTechnicians() {
      await db.ensureSheet('Technicians', TECH_HEADERS);
      const technicians = await db.getSheetData('Technicians');
      return technicians.map(t => {
        const idVal = String(t.TechID || t.LoginID || '').trim();
        return {
          id: idVal,
          captainId: idVal,
          techId: idVal,
          name: t.Name || '',
          loginId: idVal,
          pass: t.Password || '',
          password: t.Password || '',
          phone: String(t.Phone || '').replace(/\D/g, '').slice(-10),
          mobile: String(t.Phone || '').replace(/\D/g, '').slice(-10),
          zone: t.ZoneArea || 'Vettuvankeni, ECR & OMR',
          area: t.ZoneArea || 'Vettuvankeni, ECR & OMR',
          upiId: t.UpiID || '',
          rating: Number(t.Rating || 4.9),
          ratingCount: Number(t.RatingCount || 0),
          status: t.Status || 'Active',
          active: String(t.Status || 'Active').toLowerCase() === 'active'
        };
      });
    }
  };
}
