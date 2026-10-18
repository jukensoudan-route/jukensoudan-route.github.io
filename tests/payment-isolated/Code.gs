/**
 * ROUTEQ — PAY-01 / PAY-04 isolated Stripe TEST integration.
 * Not for production. This Apps Script must be created from the new
 * ROUTEQ_PAY0104_PAYMENT_ISOLATED_TEST_20261018 spreadsheet only.
 *
 * Preserves 03 final two functions with previously approved 3-line PI
 * duplicate hold amendment; all other functions provide the minimal adapters.
 * NO LINE, NO LIVE STRIPE, NO PROD GAS, NO AUTOMATIC TRIGGER.
 *
 * Prepare only: do NOT execute, authorize, deploy or set secrets until instructed.
 */
const ROUTEQ_TEST = Object.freeze({
  SHEET_ID: '1EdVYzWiiCaqX_3EFrnt6Qw2_XdwIgCtKaMEvogmMwD0',
  MARKER: 'ROUTEQ_PAY0104_ISOLATED_20261018',
  USER_PREFIX: 'routeq_test_',
  GATE_PROPERTY: 'ROUTEQ_TEST_ENABLE',
  INTERNAL_SECRET_PROPERTY: 'ROUTEQ_TEST_INTERNAL_SECRET',
  STRIPE_KEY_PROPERTY: 'ROUTEQ_TEST_STRIPE_SECRET_KEY'
});
const ROUTE_QA = Object.freeze({
  PAYMENTS: 'Payments', USERS: 'Users',
  USER_COL: Object.freeze({
    MEMBER_STATUS: 3, LAST_TICKET: 4,
    TOTAL_PAID: 5, TOTAL_GRANTED: 6,
    REMAINING: 8, UPDATED_AT: 11
  })
});
const ROUTE_STRIPE_TICKETS = Object.freeze({
  ticket3: Object.freeze({ label: '3問', amount: 1000, count: 3 }),
  ticket10: Object.freeze({ label: '10問', amount: 3000, count: 10 })
});

/** Read-only binding check. No Stripe, no writing and no live connections. */
function checkRouteqTestBinding() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== ROUTEQ_TEST.SHEET_ID) {
    throw new Error('隔離TESTシートに紐づいていません。処理中止。');
  }
  const required = ['Payments','Users','StripeEvents','TEST_Control'];
  required.forEach(n => { if (!ss.getSheetByName(n)) throw new Error(n + ' がありません'); });
  console.log('PASS: TEST spreadsheet binding. No writes or external calls performed.');
}

/** All paths capable of mutating Sheets or calling Stripe must enter here. */
function routeqTestGate_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== ROUTEQ_TEST.SHEET_ID) {
    throw new Error('TEST隔離違反: シートIDが一致しません。');
  }
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ROUTEQ_TEST_SHEET_ID') !== ROUTEQ_TEST.SHEET_ID ||
      props.getProperty(ROUTEQ_TEST.GATE_PROPERTY) !== 'YES') {
    throw new Error('TEST隔離は有効化されていません。');
  }
  const mark = ss.getSheetByName('TEST_Control');
  if (!mark || mark.getRange('B1').getDisplayValue() !== ROUTEQ_TEST.MARKER) {
    throw new Error('TEST識別子が一致しません。');
  }
  return ss;
}
function getStripeSecretKey_() {
  routeqTestGate_();
  const key = PropertiesService.getScriptProperties()
    .getProperty(ROUTEQ_TEST.STRIPE_KEY_PROPERTY) || '';
  if (!/^sk_test_[A-Za-z0-9]+$/.test(key)) {
    throw new Error('隔離TEST用Stripe秘密鍵が未設定または不正です。');
  }
  return key;
}
function retrieveStripeCheckoutSession_(id) {
  routeqTestGate_();
  const sessionId = String(id || '').trim();
  if (!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId)) {
    throw new Error('TEST専用のCheckout Sessionではありません。');
  }
  const response = UrlFetchApp.fetch(
    'https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sessionId), {
      method: 'get',
      headers: { Authorization: 'Bearer ' + getStripeSecretKey_() },
      muteHttpExceptions: true
    }
  );
  if (response.getResponseCode() !== 200) {
    throw new Error('Stripe TEST Session照合エラー HTTP ' + response.getResponseCode());
  }
  const session = JSON.parse(response.getContentText());
  if (session.id !== sessionId || session.livemode !== false ||
      session.metadata?.routeq_test_marker !== ROUTEQ_TEST.MARKER ||
      !String(session.client_reference_id || '').startsWith(ROUTEQ_TEST.USER_PREFIX) ||
      session.metadata?.line_user_id !== session.client_reference_id) {
    throw new Error('隔離TEST以外のSessionを拒否しました。');
  }
  return session;
}
function setupSheets() {
  const ss = routeqTestGate_();
  ['Payments', 'Users', 'StripeEvents'].forEach(n => {
    if (!ss.getSheetByName(n)) throw new Error('TESTシート不足: ' + n);
  });
}
function findPaymentRowBySessionId_(sheet, id) {
  routeqTestGate_();
  const sessionId = String(id || '').trim();
  if (!sessionId || !sheet || sheet.getName() !== 'Payments') return -1;
  const count = sheet.getLastRow() - 1;
  if (count < 1) return -1;
  const ids = sheet.getRange(2, 7, count, 1).getValues();
  let result = -1;
  ids.forEach((r, i) => {
    if (String(r[0] || '').trim() === sessionId) {
      if (result !== -1) throw new Error('TEST注文に重複Session行があります。');
      result = i + 2;
    }
  });
  return result;
}
function findRouteUserRow_(sheet, userId) {
  routeqTestGate_();
  const user = String(userId || '').trim();
  if (!user.startsWith(ROUTEQ_TEST.USER_PREFIX) || !sheet || sheet.getName() !== 'Users') {
    throw new Error('TESTユーザー以外は処理しません。');
  }
  const count = sheet.getLastRow() - 1;
  if (count < 1) return -1;
  const ids = sheet.getRange(2, 1, count, 1).getValues();
  let result = -1;
  ids.forEach((r, i) => {
    if (String(r[0] || '').trim() === user) {
      if (result !== -1) throw new Error('TESTユーザーに重複行があります。');
      result = i + 2;
    }
  });
  return result;
}
const ROUTE_STRIPE_EVENTS_SHEET = 'StripeEvents';
function ensureStripeEventsSheet_(ss) {
  routeqTestGate_();
  const sh = ss.getSheetByName(ROUTE_STRIPE_EVENTS_SHEET);
  if (!sh) throw new Error('TEST StripeEventsシートがありません。');
  return sh;
}
function findStripeEventRow_(sheet, eventId) {
  routeqTestGate_();
  const id = String(eventId || '').trim();
  if (!id || sheet.getLastRow() < 2) return -1;
  const vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const p = vals.findIndex(r => String(r[0] || '').trim() === id);
  return p < 0 ? -1 : p + 2;
}
function recordStripeEvent_(sheet, eventId, session, result) {
  routeqTestGate_();
  if (!eventId || findStripeEventRow_(sheet, eventId) > 0) return;
  sheet.appendRow([eventId, 'checkout.session.completed / async_payment_succeeded',
    String(session.id || ''), String(session.payment_intent || ''), String(result || ''), new Date()]);
}
function secureEquals_(a, b) {
  const left = String(a || ''), right = String(b || '');
  let diff = left.length ^ right.length;
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++) diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return diff === 0;
}
/** This is a TEST-only replacement of the app-level doPost router. */
function doPost(e) {
  const p = e && e.parameter || {};
  const requestId = String(p.requestId || '').trim();
  try {
    routeqTestGate_();
    if (String(p.action || '') !== 'confirmCheckout') throw new Error('操作拒否');
    if (!/^stripe-webhook-evt_[A-Za-z0-9_]+$/.test(requestId)) throw new Error('Event ID形式不一致');
    if (!/^cs_test_[A-Za-z0-9_]+$/.test(String(p.sessionId || ''))) throw new Error('TEST Session以外を拒否');
    const expectedSecret = PropertiesService.getScriptProperties()
      .getProperty(ROUTEQ_TEST.INTERNAL_SECRET_PROPERTY) || '';
    if (expectedSecret.length < 32 || !secureEquals_(expectedSecret, p.testSecret)) {
      throw new Error('内部認証失敗');
    }
    const session = retrieveStripeCheckoutSession_(p.sessionId);
    const result = applyPaidStripeSession_(session, requestId.slice('stripe-webhook-'.length));
    return makeRouteqTestResponse_({ ok: true, type: 'confirmCheckout', requestId,
      result: { paymentStatus: session.payment_status,
        granted: result.granted, alreadyGranted: result.alreadyGranted,
        remainingCount: result.remainingCount, requiresReview: !!result.requiresReview } });
  } catch (error) {
    // Fail closed: transport may return HTTP 200, but the webhook must inspect ok=false.
    console.error('隔離TEST Webhook拒否: ' + (error.message || String(error)));
    return makeRouteqTestResponse_({ ok: false, type: 'confirmCheckout', requestId,
      message: '決済確認失敗・要照合' });
  }
}
/** Same HtmlService response envelope as the existing GAS app. */
function makeRouteqTestResponse_(data) {
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const html = '<!doctype html><html><head><meta charset="UTF-8"></head><body>' +
    '<script>(function(){const message={source:"route-qa-gas",payload:' + json + '};' +
    'try{if(window.parent)window.parent.postMessage(message,"*");}catch(e){}' +
    '})();</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doGet() {
  return HtmlService.createHtmlOutput('ROUTEQ ISOLATED PAYMENT TEST ONLY - NOT ACTIVE');
}


/** Reconcile only safely ungranted orders. Keep existing expiration/mode behavior. */
function reconcileStripePayments() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const payments = ss.getSheetByName(ROUTE_QA.PAYMENTS);
  if (!payments) return;
  const lastRow = payments.getLastRow();
  if (lastRow < 2) return;

  const secretKey = getStripeSecretKey_();
  const stripeMode = /^sk_test_/.test(secretKey) ? 'test' : /^sk_live_/.test(secretKey) ? 'live' : '';
  if (!stripeMode) throw new Error('STRIPE_SECRET_KEYのモードを判定できません。');

  const values = payments.getRange(2, 1, lastRow - 1, 12).getValues();
  let checkedCount = 0;
  let expiredCount = 0;
  let modeSkippedCount = 0;
  let statusSkippedCount = 0;
  let openUnpaidCount = 0;
  const modeSkippedSessions = [];
  const openUnpaidSessions = [];

  for (let i = 0; i < values.length; i++) {
    const row = i + 2;
    const sessionId = String(values[i][6] || '').trim();
    const paymentStatus = String(values[i][8] || '').trim();
    const grantedStatus = String(values[i][9] || '').trim();
    if (!sessionId) continue;

    // P0 change (3): only the explicitly ungranted state is auto-retryable.
    // 付与処理中 / 要照合 / 付与済 / unknown status must never be retried.
    if (grantedStatus !== '未付与' || paymentStatus === '返金' || paymentStatus === '期限切れ') {
      statusSkippedCount++;
      continue;
    }

    const isTestSession = /^cs_test_/.test(sessionId);
    const isLiveSession = /^cs_live_/.test(sessionId);
    if ((stripeMode === 'test' && isLiveSession) || (stripeMode === 'live' && isTestSession)) {
      modeSkippedCount++;
      modeSkippedSessions.push('row=' + row + ', session=' + sessionId);
      continue;
    }

    try {
      const session = retrieveStripeCheckoutSession_(sessionId);
      checkedCount++;
      if (session.payment_status === 'paid') {
        // Shared P0 validation and idempotent claim live inside applyPaidStripeSession_.
        applyPaidStripeSession_(session);
        continue;
      }

      const expiresAt = Number(session.expires_at || 0);
      const isExpired = session.status === 'expired' ||
        (session.payment_status !== 'paid' && expiresAt > 0 &&
         expiresAt <= Math.floor(Date.now() / 1000));
      if (isExpired) {
        const statusCell = payments.getRange(row, 9);
        const statusValidation = SpreadsheetApp.newDataValidation()
          .requireValueInList(['作成', '支払済', '失敗', '返金', '期限切れ'], true)
          .setAllowInvalid(false).build();
        statusCell.setDataValidation(statusValidation);
        statusCell.setValue('期限切れ');
        payments.getRange(row, 12).setValue(new Date());
        expiredCount++;
        continue;
      }
      payments.getRange(row, 9).setValue('作成');
      payments.getRange(row, 12).setValue(new Date());
      if (session.payment_status === 'unpaid' && session.status === 'open') {
        openUnpaidCount++;
        openUnpaidSessions.push('row=' + row + ', session=' + sessionId);
      }
    } catch (error) {
      console.error('Stripe照合エラー row=' + row + ': ' + (error.message || String(error)));
    }
  }

  console.log('Stripe照合結果 mode=' + stripeMode +
    ', checked=' + checkedCount + ', expired=' + expiredCount +
    ', modeSkipped=' + modeSkippedCount + ', statusSkipped=' + statusSkippedCount +
    ', openUnpaid=' + openUnpaidCount +
    ', modeSkippedSessions=' + JSON.stringify(modeSkippedSessions) +
    ', openUnpaidSessions=' + JSON.stringify(openUnpaidSessions));
}

/** Validate a registered Stripe order and grant at most once, holding ambiguous outcomes. */
function applyPaidStripeSession_(session, stripeEventId) {
  if (!session || !session.id) throw new Error('Stripe Session情報がありません。');
  if (session.payment_status !== 'paid') {
    return { granted: false, alreadyGranted: false, remainingCount: null };
  }

  const metadata = session.metadata || {};
  const lineUserId = String(metadata.line_user_id || session.client_reference_id || '').trim();
  const ticketCode = String(metadata.ticket_code || '').trim();
  const def = ROUTE_STRIPE_TICKETS[ticketCode];
  if (!lineUserId) throw new Error('Stripe決済にLINEユーザーIDがありません。');
  if (!def) throw new Error('Stripe決済の商品コードが不正です。');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    setupSheets();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const payments = ss.getSheetByName(ROUTE_QA.PAYMENTS);
    const users = ss.getSheetByName(ROUTE_QA.USERS);
    const stripeEvents = ensureStripeEventsSheet_(ss);
    const normalizedEventId = String(stripeEventId || '').trim();

    // P0 direct-entry guard: refunded / expired orders are never creditable.
    // Check BEFORE Stripe Event duplicate early return (which could report alreadyGranted).
    const paymentRow = findPaymentRowBySessionId_(payments, session.id);
    if (paymentRow <= 0) throw new Error('未登録のStripe Checkout注文は付与できません。');
    const paymentStatus = String(payments.getRange(paymentRow, 9).getValue() || '').trim();
    if (paymentStatus === '返金' || paymentStatus === '期限切れ') {
      return { granted: false, alreadyGranted: false, requiresReview: true, remainingCount: null };
    }
    // Check J before StripeEvents early return; a duplicate Event is not proof of a completed grant.
    const earlyGrantState = String(payments.getRange(paymentRow, 10).getValue() || '').trim();
    if (earlyGrantState === '付与処理中' || earlyGrantState === '要照合') {
      return { granted: false, alreadyGranted: false, requiresReview: true, remainingCount: null };
    }

    // P0 change (1): require a saved Checkout record and strict pre-grant equality.
    const order = payments.getRange(paymentRow, 1, 1, 12).getValues()[0];
    const savedLineUserId = String(order[1] || '').trim();
    const savedTicketCode = String(order[3] || '').trim();
    const savedAmount = Number(order[4]);
    const savedCount = Number(order[5]);
    const savedSessionId = String(order[6] || '').trim();
    const savedIntent = String(order[7] || '').trim();
    const metadataUser = String(metadata.line_user_id || '').trim();
    const referenceUser = String(session.client_reference_id || '').trim();
    const intentId = String(session.payment_intent || '').trim();
    const secretKey = getStripeSecretKey_();
    const expectedLive = /^sk_live_/.test(secretKey);

    if (!/^sk_(?:test|live)_/.test(secretKey) ||
        typeof session.livemode !== 'boolean' || session.livemode !== expectedLive ||
        !(expectedLive ? /^cs_live_/.test(session.id) : /^cs_test_/.test(session.id)) ||
        session.status !== 'complete' || session.payment_status !== 'paid' ||
        !savedLineUserId || !metadataUser || !referenceUser ||
        savedLineUserId !== lineUserId || metadataUser !== savedLineUserId ||
        referenceUser !== savedLineUserId ||
        !savedTicketCode || savedTicketCode !== ticketCode ||
        savedSessionId !== String(session.id).trim() ||
        !Number.isInteger(savedAmount) || savedAmount !== Number(def.amount) ||
        !Number.isInteger(savedCount) || savedCount !== Number(def.count) ||
        !Number.isInteger(session.amount_total) || session.amount_total !== savedAmount ||
        String(session.currency || '').toLowerCase() !== 'jpy' ||
        !Object.prototype.hasOwnProperty.call(metadata, 'grant_count') ||
        String(metadata.grant_count) !== String(savedCount) ||
        !intentId || (savedIntent && savedIntent !== intentId)) {
      throw new Error('Stripe Session・保存済み注文の整合性検査に失敗しました。');
    }

    const state = String(order[9] || '').trim();
    if (state === '付与処理中' || state === '要照合') {
      return { granted: false, alreadyGranted: false, requiresReview: true, remainingCount: null };
    }
    if (state !== '未付与' && state !== '付与済') {
      throw new Error('Payments J列に未認識の付与状態があります。');
    }
    // A duplicate Stripe Event is not proof of a completed grant.
    // Verify the registered order and J status first; ambiguous replay is held.
    if (normalizedEventId && findStripeEventRow_(stripeEvents, normalizedEventId) > 0) {
      if (state !== '付与済') {
        // Persist the hold: otherwise reconciliation sees 未付与 and may retry without an Event ID.
        payments.getRange(paymentRow, 10).setValue('要照合');
        SpreadsheetApp.flush();
        return { granted: false, alreadyGranted: false, requiresReview: true, remainingCount: null };
      }
      const existingUserRow = findRouteUserRow_(users, lineUserId);
      const existingRemaining = existingUserRow > 0
        ? Number(users.getRange(existingUserRow, ROUTE_QA.USER_COL.REMAINING).getValue() || 0)
        : null;
      return { granted: false, alreadyGranted: true, remainingCount: existingRemaining };
    }
    if (state === '付与済') {
      const userRow = findRouteUserRow_(users, lineUserId);
      const remaining = userRow > 0
        ? Number(users.getRange(userRow, ROUTE_QA.USER_COL.REMAINING).getValue() || 0)
        : null;
      recordStripeEvent_(stripeEvents, normalizedEventId, session, 'Session付与済み');
      return { granted: false, alreadyGranted: true, remainingCount: remaining };
    }

    // P0: a different Session with the same Payment Intent must not grant, even
    // when the other row is 未付与 or 付与処理中 (not only when already granted).
    if (payments.getLastRow() > 2) {
      const paymentIntents = payments.getRange(2, 8, payments.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < paymentIntents.length; i++) {
        if (i + 2 !== paymentRow && String(paymentIntents[i][0] || '').trim() === intentId) {
          // Persist the manual-review hold; otherwise reconciliation retries this unsafe order.
          payments.getRange(paymentRow, 10).setValue('要照合');
          SpreadsheetApp.flush();
          return { granted: false, alreadyGranted: false, requiresReview: true, remainingCount: null };
        }
      }
    }

    // P0 change (2): record the PI and persist the non-retriable claim BEFORE
    // mutating Users. A failed claim cannot reach the Users write path.
    payments.getRange(paymentRow, 8).setValue(intentId);
    payments.getRange(paymentRow, 10).setValue('付与処理中');
    SpreadsheetApp.flush();

    try {
      let userRow = findRouteUserRow_(users, lineUserId);
      if (userRow === -1) {
        users.appendRow([
          lineUserId, String(metadata.display_name || ''), '有効', def.label,
          0, 0, 0, 0, '使用済み', '', new Date(), 'Stripe決済から自動作成'
        ]);
        userRow = users.getLastRow();
      }
      const uv = users.getRange(userRow, 1, 1, 12).getValues()[0];
      const currentPaid = Number(uv[ROUTE_QA.USER_COL.TOTAL_PAID - 1] || 0);
      const currentGranted = Number(uv[ROUTE_QA.USER_COL.TOTAL_GRANTED - 1] || 0);
      const currentRemaining = Number(uv[ROUTE_QA.USER_COL.REMAINING - 1] || 0);
      const newRemaining = currentRemaining + def.count;

      users.getRange(userRow, ROUTE_QA.USER_COL.MEMBER_STATUS).setValue('有効');
      users.getRange(userRow, ROUTE_QA.USER_COL.LAST_TICKET).setValue(def.label);
      users.getRange(userRow, ROUTE_QA.USER_COL.TOTAL_PAID).setValue(currentPaid + def.amount);
      users.getRange(userRow, ROUTE_QA.USER_COL.TOTAL_GRANTED).setValue(currentGranted + def.count);
      users.getRange(userRow, ROUTE_QA.USER_COL.REMAINING).setValue(newRemaining);
      users.getRange(userRow, ROUTE_QA.USER_COL.UPDATED_AT).setValue(new Date());

      payments.getRange(paymentRow, 9).setValue('支払済');
      payments.getRange(paymentRow, 10).setValue('付与済');
      payments.getRange(paymentRow, 11).setValue(new Date());
      payments.getRange(paymentRow, 12).setValue(new Date());
      recordStripeEvent_(stripeEvents, normalizedEventId, session, '付与済み');
      return { granted: true, alreadyGranted: false, remainingCount: newRemaining };
    } catch (error) {
      // Partial Users outcome is UNKNOWN. Never reset J to 未付与 automatically.
      try {
        payments.getRange(paymentRow, 10).setValue('要照合');
        SpreadsheetApp.flush();
      } catch (markError) {
        // If the update fails, 付与処理中 remains a non-retryable state.
      }
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}
