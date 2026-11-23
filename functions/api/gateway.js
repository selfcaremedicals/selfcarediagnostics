/* file: functions/api/gateway.js */
import { createDatabase } from '../_lib/database.js';
import { createAuthAPI, Security } from '../_lib/auth.js';

const DEFAULT_LEGACY_GAS_URL = 'https://script.google.com/macros/s/AKfycbzM1alicIkwFVzwULAFpJwELalGwCFFOJhjnw9JGqimPz48Lt7V8llx1k6Jebv9icQBnQ/exec';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function formatSuccessPayload(action, result) {
  const responsePayload = {
    status: 'success',
    data: result
  };

  if (action === 'getTests' || action === 'getAdminTests') {
    responsePayload.tests = Array.isArray(result) ? result : (result && result.tests ? result.tests : []);
  } else if (action === 'getPackages' || action === 'getAdminPackages') {
    responsePayload.packages = Array.isArray(result) ? result : (result && result.packages ? result.packages : []);
  } else if (action === 'getAllBookings' || action === 'getPendingHomeCollections') {
    responsePayload.bookings = Array.isArray(result) ? result : (result && result.bookings ? result.bookings : []);
  } else if (action === 'getAllCustomers') {
    responsePayload.customers = Array.isArray(result) ? result : [];
  } else if (action === 'getTechnicians') {
    responsePayload.technicians = Array.isArray(result) ? result : [];
  } else if (action === 'getLabBills' && result && result.bills) {
    responsePayload.bills = result.bills;
  } else if ((action === 'getBookingReport' || action === 'getReportsByPatient') && result && result.records) {
    responsePayload.records = result.records;
  } else if (action === 'getProfile' && result && typeof result === 'object') {
    if (result.profile) responsePayload.profile = result.profile;
    if (result.familyMembers) responsePayload.familyMembers = result.familyMembers;
    if (result.membership) responsePayload.membership = result.membership;
    if (result.referralCoupons) responsePayload.referralCoupons = result.referralCoupons;
  } else if (action === 'getFamilyMembers' && result && typeof result === 'object') {
    responsePayload.familyMembers = result.familyMembers || result.data || [];
  } else if ((action === 'getMembership' || action === 'getMembershipStatus') && result && typeof result === 'object') {
    responsePayload.membership = result;
    responsePayload.isPrimaryVip = Boolean(result.isPrimaryVip);
    responsePayload.expiryDate = result.expiryDate || '';
    responsePayload.paidFamilyMemberIds = result.paidFamilyMemberIds || [];
    responsePayload.familyMembers = result.familyMembers || [];
  } else if (action === 'getBloodData' && result && typeof result === 'object') {
    responsePayload.requests = result.requests || [];
    responsePayload.donors = result.donors || [];
  } else if (result && typeof result === 'object' && !Array.isArray(result)) {
    for (const k of Object.keys(result)) {
      if (!Object.prototype.hasOwnProperty.call(responsePayload, k)) {
        responsePayload[k] = result[k];
      }
    }
  }

  return responsePayload;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');

  if (!action) {
    return jsonResponse({
      status: 'success',
      message: 'Selfcare Diagnostics Cloudflare API Gateway is Active & Live (v1.0.0)'
    });
  }

  const params = {};
  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value;
  }

  return routeAction(context, action, params);
}

export async function onRequestPost(context) {
  try {
    const url = new URL(context.request.url);
    let action = url.searchParams.get('action') || '';
    let params = {};

    const rawText = await context.request.text();
    if (rawText) {
      try {
        const body = JSON.parse(rawText);
        if (body.action) action = body.action;
        params = body;
      } catch (e) {}
    }

    for (const [key, value] of url.searchParams.entries()) {
      if (!Object.prototype.hasOwnProperty.call(params, key)) {
        params[key] = value;
      }
    }

    return routeAction(context, action, params);
  } catch (err) {
    return jsonResponse({
      status: 'error',
      message: err.message || 'Server error occurred'
    }, 500);
  }
}

async function routeAction(context, action, rawParams) {
  try {
    const params = Security.sanitizeParams(rawParams);
    const db = createDatabase(context.env);
    const AuthAPI = createAuthAPI(db, context.env);

    let result;
    let handled = true;

    switch (action) {
      case 'initDatabase':
      case 'setupDatabase':
        result = await AuthAPI.initDatabase();
        break;

      case 'patientRegister':
      case 'patientSignup':
        result = await AuthAPI.patientRegister(params);
        break;

      case 'patientLogin':
        result = await AuthAPI.patientLogin(params);
        break;

      case 'requestOtp':
        result = await AuthAPI.requestOtp(params);
        break;

      case 'verifyOtp':
        result = await AuthAPI.verifyOtp(params);
        break;

      case 'staffLogin':
      case 'verifyCaptainLogin':
        result = await AuthAPI.staffLogin(params);
        break;

      case 'createTechnician':
      case 'saveTechnician':
        result = await AuthAPI.createTechnician(params);
        break;

      case 'getTechnicians':
        result = await AuthAPI.getTechnicians();
        break;

      default:
        handled = false;
        break;
    }

    if (handled) {
      return jsonResponse(formatSuccessPayload(action, result));
    }

    // Fallback to legacy Apps Script for modules not yet migrated
    const legacyUrl = context.env.LEGACY_GAS_URL || DEFAULT_LEGACY_GAS_URL;
    const forwardUrl = new URL(legacyUrl);
    if (action) forwardUrl.searchParams.set('action', action);

    const legacyRes = await fetch(forwardUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...rawParams })
    });

    const legacyData = await legacyRes.json();
    return jsonResponse(legacyData, legacyRes.status);
  } catch (error) {
    return jsonResponse({
      status: 'error',
      message: error.message || 'Server error occurred'
    }, 400);
  }
}
