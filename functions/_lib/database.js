/* file: functions/_lib/database.js */

let cachedToken = null;
let tokenExpiry = 0;

function base64UrlEncode(input) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem) {
  const cleanPem = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binaryString = atob(cleanPem);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < tokenExpiry - 60) {
    return cachedToken;
  }

  const clientEmail = env.GOOGLE_CLIENT_EMAIL;
  const privateKeyPem = env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKeyPem) {
    throw new Error('Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY in Cloudflare Environment Variables.');
  }

  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64UrlEncode(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }));

  const signingInput = `${header}.${claimSet}`;
  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error('Google Auth failed: ' + (tokenData.error_description || tokenData.error || 'Unknown error'));
  }

  cachedToken = tokenData.access_token;
  tokenExpiry = now + (tokenData.expires_in || 3600);
  return cachedToken;
}

export function createDatabase(env) {
  const spreadsheetId = env.SPREADSHEET_ID || '1lswBf5iPcPnt8OGA6ZfCE1tcJyqqxTaP1e2u9UwwHOw';
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;

  async function sheetsFetch(path, options = {}) {
    const token = await getGoogleAccessToken(env);
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Google Sheets API Error (${res.status})`);
    }
    return data;
  }

  function sanitizeValue(val) {
    if (typeof val === 'string' && /^[=+\-@\t\r]/.test(val)) {
      return "'" + val;
    }
    return val !== undefined && val !== null ? val : '';
  }

  return {
    sanitizeValue,

    async ensureSheet(sheetName, defaultHeaders) {
      const meta = await sheetsFetch('?fields=sheets.properties.title');
      const existingTitles = (meta.sheets || []).map(s => s.properties.title);

      if (!existingTitles.includes(sheetName)) {
        await sheetsFetch(':batchUpdate', {
          method: 'POST',
          body: JSON.stringify({
            requests: [{ addSheet: { properties: { title: sheetName } } }]
          })
        });

        await sheetsFetch(`/values/${encodeURIComponent(sheetName)}!A1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          body: JSON.stringify({ values: [defaultHeaders] })
        });
        return;
      }

      const headerRes = await sheetsFetch(`/values/${encodeURIComponent(sheetName)}!1:1`);
      const existingHeaders = (headerRes.values && headerRes.values[0]) ? headerRes.values[0].map(h => String(h).trim()) : [];

      if (existingHeaders.length === 0) {
        await sheetsFetch(`/values/${encodeURIComponent(sheetName)}!A1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          body: JSON.stringify({ values: [defaultHeaders] })
        });
        return;
      }

      let updated = false;
      const mergedHeaders = [...existingHeaders];
      for (const h of defaultHeaders) {
        if (!mergedHeaders.includes(h)) {
          mergedHeaders.push(h);
          updated = true;
        }
      }

      if (updated) {
        await sheetsFetch(`/values/${encodeURIComponent(sheetName)}!1:1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          body: JSON.stringify({ values: [mergedHeaders] })
        });
      }
    },

    async getSheetData(sheetName) {
      try {
        const res = await sheetsFetch(`/values/${encodeURIComponent(sheetName)}`);
        const rows = res.values || [];
        if (rows.length < 2) return [];

        const headers = rows[0].map(h => String(h).trim());
        const data = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const obj = {};
          let isEmpty = true;

          for (let j = 0; j < headers.length; j++) {
            const header = headers[j];
            if (header) {
              const val = row[j] !== undefined ? row[j] : '';
              obj[header] = val;
              if (val !== '' && val !== null) isEmpty = false;
            }
          }

          if (!isEmpty) data.push(obj);
        }
        return data;
      } catch (e) {
        console.error(`Error reading sheet ${sheetName}:`, e.message);
        return [];
      }
    },

    async getRow(sheetName, idColumnName, idValue) {
      const data = await this.getSheetData(sheetName);
      const cleanSearch = String(idValue).trim();
      return data.find(row => String(row[idColumnName] || '').trim() === cleanSearch) || null;
    },

    async appendRow(sheetName, rowObj) {
      return this.appendRows(sheetName, [rowObj]);
    },

    async appendRows(sheetName, rowsArray) {
      if (!rowsArray || !rowsArray.length) return true;
      try {
        const headerRes = await sheetsFetch(`/values/${encodeURIComponent(sheetName)}!1:1`);
        const headers = (headerRes.values && headerRes.values[0]) ? headerRes.values[0].map(h => String(h).trim()) : [];
        if (!headers.length) return false;

        const matrix = rowsArray.map(rowObj =>
          headers.map(h => sanitizeValue(rowObj[h]))
        );

        await sheetsFetch(`/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
          method: 'POST',
          body: JSON.stringify({ values: matrix })
        });
        return true;
      } catch (e) {
        console.error(`Error appending rows to ${sheetName}:`, e.message);
        return false;
      }
    },

    async updateRows(sheetName, idColumnName, idValue, updateObj) {
      try {
        const res = await sheetsFetch(`/values/${encodeURIComponent(sheetName)}`);
        const data = res.values || [];
        if (data.length < 2) return 0;

        const headers = data[0].map(h => String(h).trim());
        const idColIdx = headers.indexOf(idColumnName);
        if (idColIdx === -1) return 0;

        const cleanSearch = String(idValue).trim();
        let updatedCount = 0;

        for (let i = 1; i < data.length; i++) {
          while (data[i].length < headers.length) {
            data[i].push('');
          }
          if (String(data[i][idColIdx] || '').trim() === cleanSearch) {
            for (const key in updateObj) {
              const colIdx = headers.indexOf(key);
              if (colIdx !== -1) {
                data[i][colIdx] = sanitizeValue(updateObj[key]);
              }
            }
            updatedCount++;
          }
        }

        if (updatedCount > 0) {
          await sheetsFetch(`/values/${encodeURIComponent(sheetName)}?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            body: JSON.stringify({ values: data })
          });
        }
        return updatedCount;
      } catch (e) {
        console.error(`Error updating ${sheetName}:`, e.message);
        return 0;
      }
    }
  };
}
