/**
 * ROUTEQ official 01: strictly isolated TEST Stripe Webhook admission.
 *
 * Only the separate routeq-qa-test-gateway receives Stripe webhooks.
 * Incoming GAS POSTs must carry a fresh HMAC over the exact JSON payload.
 * The gateway uses Stripe's TEST-only retrieve operation before signing.
 * No direct Stripe, LINE, or OpenAI network call is made by this file.
 * All other existing GAS doPost actions remain blocked.
 */
const ROUTEQ_QA_STRIPE_TEST_GATEWAY_PERMIT_ = Object.freeze({
  purpose:'ROUTEQ_QA_TEST_SIGNED_STRIPE_INGRESS'
});
const ROUTEQ_QA_STRIPE_TEST_FIXTURE_USER_ = 'U_ROUTEQ_ISOLATED_MOCK_20261023';
const ROUTEQ_QA_STRIPE_TEST_MARKER_ = 'ROUTEQ_QA_ISOLATED_STRIPE_TEST_20261023';
const ROUTEQ_QA_STRIPE_TEST_ACCOUNT_ = 'acct_1TjYNMIRwv4Jy7lt';

function routeqQaConstantTimeHexEqual_(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string' ||
      a.length !== 64 || b.length !== 64) return false;
  var result = 0;
  for (var i=0;i<64;i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function routeqQaValidateSignedStripeTestEnvelope_(rawBody) {
  assertRouteqQaTestEnvironment_();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('ROUTEQ_QA_STRIPE_TEST_INGRESS_ENABLED') !== 'ON') {
    throw new Error('STRIPE_TEST_INGRESS_DISABLED');
  }
  var secret = props.getProperty('ROUTEQ_QA_STRIPE_TEST_GATEWAY_SECRET') || '';
  if (secret.length < 32) throw new Error('STRIPE_TEST_SHARED_SECRET_MISSING');
  if (typeof rawBody !== 'string' || rawBody.length > 12000) {
    throw new Error('STRIPE_TEST_ENVELOPE_INVALID');
  }
  var envelope;
  try { envelope = JSON.parse(rawBody); } catch (_) {
    throw new Error('STRIPE_TEST_ENVELOPE_INVALID');
  }
  if (!envelope || !Number.isSafeInteger(envelope.timestamp) ||
      typeof envelope.payload !== 'string' ||
      envelope.payload.length < 20 || envelope.payload.length > 10000 ||
      typeof envelope.signature !== 'string' ||
      !/^[0-9a-f]{64}$/.test(envelope.signature)) {
    throw new Error('STRIPE_TEST_ENVELOPE_INVALID');
  }
  if (Math.abs(Date.now() - envelope.timestamp * 1000) > 300000) {
    throw new Error('STRIPE_TEST_ENVELOPE_EXPIRED');
  }
  var mac = Utilities.computeHmacSha256Signature(
    envelope.timestamp + '.' + envelope.payload, secret, Utilities.Charset.UTF_8
  ).map(function(b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
  if (!routeqQaConstantTimeHexEqual_(mac,envelope.signature)) {
    throw new Error('STRIPE_TEST_ENVELOPE_SIGNATURE_INVALID');
  }
  var packet;
  try { packet = JSON.parse(envelope.payload); } catch (_) {
    throw new Error('STRIPE_TEST_PACKET_INVALID');
  }
  if (!packet || packet.v !== 1 || packet.source !== 'ROUTEQ_QA_TEST_GATEWAY' ||
      packet.stripeAccount !== ROUTEQ_QA_STRIPE_TEST_ACCOUNT_ ||
      !/^evt_[A-Za-z0-9]+$/.test(String(packet.eventId || '')) ||
      ['checkout.session.completed','checkout.session.async_payment_succeeded'].indexOf(packet.eventType) < 0) {
    throw new Error('STRIPE_TEST_PACKET_IDENTITY_INVALID');
  }
  var s = packet.session, m = s && s.metadata;
  if (!s || !m || s.livemode !== false || s.mode !== 'payment' ||
      s.status !== 'complete' || s.payment_status !== 'paid' ||
      !/^cs_test_[A-Za-z0-9]+$/.test(String(s.id || '')) ||
      !/^pi_[A-Za-z0-9]+$/.test(String(s.payment_intent || '')) ||
      String(s.client_reference_id || '') !== ROUTEQ_QA_STRIPE_TEST_FIXTURE_USER_ ||
      String(m.line_user_id || '') !== ROUTEQ_QA_STRIPE_TEST_FIXTURE_USER_ ||
      String(m.routeq_test_marker || '') !== ROUTEQ_QA_STRIPE_TEST_MARKER_ ||
      s.currency !== 'jpy') {
    throw new Error('STRIPE_TEST_SESSION_IDENTITY_INVALID');
  }
  var code = String(m.ticket_code || ''), def = ROUTE_STRIPE_TICKETS[code];
  if (!def || !Number.isSafeInteger(s.amount_total) ||
      s.amount_total !== def.amount || String(m.grant_count || '') !== String(def.count)) {
    throw new Error('STRIPE_TEST_SESSION_PRODUCT_INVALID');
  }
  // Return a minimal signed fixture; no arbitrary user ID or ticket values.
  return {
    id:s.id, payment_intent:s.payment_intent, payment_status:'paid',
    livemode:false, mode:'payment', status:'complete', currency:'jpy',
    amount_total:def.amount, client_reference_id:ROUTEQ_QA_STRIPE_TEST_FIXTURE_USER_,
    metadata:{
      line_user_id:ROUTEQ_QA_STRIPE_TEST_FIXTURE_USER_,
      display_name:'ROUTEQ isolated TEST',
      routeq_test_marker:ROUTEQ_QA_STRIPE_TEST_MARKER_,
      ticket_code:code, grant_count:String(def.count)
    }
  };
}

function routeqQaStageSignedStripeTestPayment_(session) {
  assertRouteqQaTestEnvironment_();
  var ss = openRouteqQaTestSpreadsheet_();
  var payments = ss.getSheetByName(ROUTE_QA.PAYMENTS);
  var users = ss.getSheetByName(ROUTE_QA.USERS);
  if (!payments || !users ||
      findRouteUserRow_(users, ROUTEQ_QA_STRIPE_TEST_FIXTURE_USER_) <= 0) {
    throw new Error('STRIPE_TEST_FIXTURE_SHEETS_INVALID');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var row = findPaymentRowBySessionId_(payments,session.id);
    var intentRow = findPaymentRowByPaymentIntent_(payments,session.payment_intent);
    if (intentRow > 0 && intentRow !== row) {
      throw new Error('STRIPE_TEST_INTENT_CONFLICT');
    }
    var code = String(session.metadata.ticket_code);
    var def = ROUTE_STRIPE_TICKETS[code];
    if (row > 0) {
      var saved = payments.getRange(row,1,1,13).getValues()[0];
      if (String(saved[1] || '') !== ROUTEQ_QA_STRIPE_TEST_FIXTURE_USER_ ||
          String(saved[3] || '') !== code ||
          Number(saved[4]) !== def.amount || Number(saved[5]) !== def.count ||
          String(saved[6] || '') !== session.id ||
          (String(saved[7] || '') && String(saved[7]) !== session.payment_intent)) {
        throw new Error('STRIPE_TEST_EXISTING_PAYMENT_CONFLICT');
      }
    } else {
      payments.appendRow([
        new Date(), ROUTEQ_QA_STRIPE_TEST_FIXTURE_USER_, 'ROUTEQ isolated TEST',
        code,def.amount,def.count,session.id,'',
        '作成','未付与','',new Date(),''
      ]);
    }
  } finally {
    lock.releaseLock();
  }
}

function routeqQaAcceptSignedStripeTestPost_(rawBody) {
  var session = routeqQaValidateSignedStripeTestEnvelope_(rawBody);
  routeqQaStageSignedStripeTestPayment_(session);
  var outcome = applyPaidStripeSession_(session, ROUTEQ_QA_STRIPE_TEST_GATEWAY_PERMIT_);
  if (!outcome || (!outcome.granted && !outcome.alreadyGranted)) {
    throw new Error('STRIPE_TEST_GRANT_NOT_CONFIRMED');
  }
  return Object.freeze({
    ok:true, environment:'ISOLATED_TEST',
    granted:outcome.granted === true,
    alreadyGranted:outcome.alreadyGranted === true,
    livePayment:false, lineSent:false, aiApiInvoked:false
  });
}
