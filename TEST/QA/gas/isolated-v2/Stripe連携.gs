// Archived source staging only. NOT DEPLOYABLE. Needs TEST isolation and current-production version confirmation.
/**
 * =========================================================
 * ROUTE Q&A 完成版：Stripe連携.gs
 * Checkout / 決済完了ページ確認 / 回数自動付与 / 二重付与防止
 * =========================================================
 *
 * Stripeはまずテストモードで確認してください。
 *
 * Script Properties:
 *   STRIPE_SECRET_KEY
 *   QUESTION_PAGE_URL
 */

const ROUTE_STRIPE_TICKETS = {
  ticket3: {
    label: '1,000円／3回',
    amount: 1000,
    count: 3
  },
  ticket10: {
    label: '3,000円／10回',
    amount: 3000,
    count: 10
  }
};

// Object-identity capability used only by the owner-run Sheets acceptance.
// Web requests and ordinary application entry points cannot construct it.
const ROUTEQ_QA_STRIPE_GRANT_ACCEPTANCE_PERMIT_ = Object.freeze({
  purpose: 'ISOLATED_TEST_STRIPE_GRANT_SHEETS_ACCEPTANCE'
});

function assertRouteqQaStripeGrantEntry_(permit) {
  assertRouteqQaTestEnvironment_();
  if (permit === ROUTEQ_QA_STRIPE_GRANT_ACCEPTANCE_PERMIT_) return true;
  routeqQaBlockSensitiveEntry_('applyPaidStripeSession_');
}


/* =========================================================
   Checkout Session作成
========================================================= */

function createStripeCheckoutForWeb_(idToken, ticketCode) {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('createStripeCheckoutForWeb_');
  const user = verifyLineUser_(idToken);

  const def = ROUTE_STRIPE_TICKETS[
    String(ticketCode || '')
  ];

  if (!def) {
    throw new Error('回数券の種類が正しくありません。');
  }

  // Stripe決済後はいったん通常ブラウザ用の完了ページへ戻す。
  // Q&A本体（LIFF）は決済確認が成功するまで開かない。
  const paymentCompleteUrl =
    'https://jukensoudan-route.github.io/route-qa/payment-complete.html';

  const successUrl = appendQuery_(
    paymentCompleteUrl,
    'stripe=success&session_id={CHECKOUT_SESSION_ID}'
  );

  const cancelUrl = appendQuery_(
    paymentCompleteUrl,
    'stripe=cancel'
  );

  const session = stripePost_(
    '/v1/checkout/sessions',
    {
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.sub,

      'line_items[0][price_data][currency]': 'jpy',
      'line_items[0][price_data][product_data][name]':
        'ROUTE Q&A ' + def.label,
      'line_items[0][price_data][unit_amount]': String(Math.round(Number(def.amount))),
      'line_items[0][quantity]': '1',

      'metadata[line_user_id]': user.sub,
      'metadata[display_name]': user.name || '',
      'metadata[ticket_code]': String(ticketCode),
      'metadata[ticket_label]': def.label,
      'metadata[grant_count]': String(def.count)
    }
  );

  if (!session || !session.id || !session.url) {
    throw new Error('Stripe決済画面を作成できませんでした。');
  }

  savePaymentSessionCreated_(
    session,
    user,
    ticketCode,
    def
  );

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    ticketCode,
    ticketLabel: def.label,
    amount: def.amount,
    grantCount: def.count
  };
}


/* =========================================================
   決済成功ページから即時確認
========================================================= */

function confirmStripeCheckoutForWeb_(sessionId) {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('confirmStripeCheckoutForWeb_');
  const session = retrieveStripeCheckoutSession_(sessionId);
  const metadata = session.metadata || {};

  // 完了ページではLIFFを起動しないため、idToken認証は行わない。
  // 付与先はCheckout Session作成時にStripe metadataへ保存した
  // line_user_id（またはclient_reference_id）だけを使用する。
  const lineUserId = String(
    metadata.line_user_id ||
    session.client_reference_id ||
    ''
  ).trim();

  if (!lineUserId) {
    throw new Error(
      '決済情報にLINEユーザーIDがありません。'
    );
  }

  // Checkout作成時にPaymentsへ保存したSessionと同一か確認する。
  setupSheets();

  const ss = openRouteqQaTestSpreadsheet_();
  const payments = ss.getSheetByName(ROUTE_QA.PAYMENTS);

  const paymentRow = findPaymentRowBySessionId_(
    payments,
    session.id
  );

  if (paymentRow <= 0) {
    throw new Error(
      'この決済情報をROUTE側で確認できません。再決済せずお問い合わせください。'
    );
  }

  const savedLineUserId = String(
    payments.getRange(paymentRow, 2).getValue() || ''
  ).trim();

  if (
    savedLineUserId &&
    savedLineUserId !== lineUserId
  ) {
    throw new Error(
      '決済情報のユーザー確認に失敗しました。'
    );
  }

  const result = applyPaidStripeSession_(session);

  return {
    paymentStatus: session.payment_status || '',
    granted: result.granted,
    alreadyGranted: result.alreadyGranted,
    remainingCount: result.remainingCount
  };
}


/* =========================================================
   1分ごとにStripe決済を自動照合
========================================================= */

function setupStripeAutoReconcileTrigger() {
  const functionName = 'reconcileStripePayments';

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === functionName) {
      routeqQaRejectTriggerMutation_(trigger);
    }
  });

  routeqQaRejectTriggerMutation_(functionName)
    .timeBased()
    .everyMinutes(1)
    .create();

  SpreadsheetApp.getActive().toast(
    'Stripe決済の自動確認を1分ごとに設定しました。',
    'ROUTE Q&A',
    5
  );
}


/**
 * Paymentsの「未付与」のCheckoutを確認。
 * applyPaidStripeSession_側で個別にロックするため、
 * この関数自体ではScriptLockを取得しません。
 */
function reconcileStripePayments() {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('reconcileStripePayments');
  const ss = openRouteqQaTestSpreadsheet_();
  const payments = ss.getSheetByName(ROUTE_QA.PAYMENTS);

  if (!payments) return;

  const lastRow = payments.getLastRow();
  if (lastRow < 2) return;

  const values = payments
    .getRange(2, 1, lastRow - 1, 12)
    .getValues();

  for (let i = 0; i < values.length; i++) {
    const row = i + 2;

    const sessionId = String(values[i][6] || '').trim();
    const paymentStatus = String(values[i][8] || '').trim();
    const grantedStatus = String(values[i][9] || '').trim();

    if (!sessionId) continue;
    if (grantedStatus === '付与済') continue;
    if (paymentStatus === '返金') continue;

    try {
      const session = retrieveStripeCheckoutSession_(sessionId);

      if (session.payment_status === 'paid') {
        applyPaidStripeSession_(session);
      } else {
        payments.getRange(row, 9).setValue('作成');
        payments.getRange(row, 12).setValue(new Date());
      }

    } catch (error) {
      console.error(
        'Stripe照合エラー row=' +
        row +
        ': ' +
        (error.message || String(error))
      );
    }
  }
}


/* =========================================================
   支払済Session → Usersへ回数付与
========================================================= */

function applyPaidStripeSession_(session, acceptancePermit) {
  assertRouteqQaTestEnvironment_();
  assertRouteqQaStripeGrantEntry_(acceptancePermit);
  if (!session || !session.id) {
    throw new Error('Stripe Session情報がありません。');
  }

  if (session.payment_status !== 'paid') {
    return {
      granted: false,
      alreadyGranted: false,
      remainingCount: null
    };
  }

  const metadata = session.metadata || {};

  const lineUserId = String(
    metadata.line_user_id ||
    session.client_reference_id ||
    ''
  ).trim();

  const ticketCode = String(
    metadata.ticket_code || ''
  ).trim();

  const def = ROUTE_STRIPE_TICKETS[ticketCode];

  if (!lineUserId) {
    throw new Error(
      'Stripe決済にLINEユーザーIDがありません。'
    );
  }

  if (!def) {
    throw new Error(
      'Stripe決済の商品コードが不正です。'
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    setupSheets();

    const ss = openRouteqQaTestSpreadsheet_();
    const payments = ss.getSheetByName(ROUTE_QA.PAYMENTS);
    const users = ss.getSheetByName(ROUTE_QA.USERS);

    let paymentRow = findPaymentRowBySessionId_(
      payments,
      session.id
    );

    // Never treat a recorded Session as an idempotent success until every
    // immutable grant identity agrees with the paid Stripe Session. The only
    // permitted repair is the first Intent write for an untouched Checkout
    // row (作成／未付与); assertStripePaymentIdentity_ performs it under this
    // ScriptLock after all identity and uniqueness checks have passed.
    assertStripePaymentIdentity_(
      payments,
      paymentRow,
      session,
      lineUserId,
      ticketCode,
      def
    );

    // Session IDで二重付与防止
    if (paymentRow > 0) {
      const already = String(
        payments.getRange(paymentRow, 10).getValue() || ''
      );

      if (already === '付与済') {
        const userRow = findRouteUserRow_(users, lineUserId);

        const remaining = userRow > 0
          ? Number(
              users.getRange(
                userRow,
                ROUTE_QA.USER_COL.REMAINING
              ).getValue() || 0
            )
          : null;

        return {
          granted: false,
          alreadyGranted: true,
          remainingCount: remaining
        };
      }
    }

    // Payment Intentでも二重付与防止
    const paymentIntentId = String(
      session.payment_intent || ''
    ).trim();

    if (paymentIntentId) {
      const duplicateRow = findPaymentRowByPaymentIntent_(
        payments,
        paymentIntentId
      );

      if (
        duplicateRow > 0 &&
        String(
          payments.getRange(duplicateRow, 10).getValue() || ''
        ) === '付与済'
      ) {
        const duplicateUserRow =
          findRouteUserRow_(users, lineUserId);

        const duplicateRemaining =
          duplicateUserRow > 0
            ? Number(
                users.getRange(
                  duplicateUserRow,
                  ROUTE_QA.USER_COL.REMAINING
                ).getValue() || 0
              )
            : null;

        return {
          granted: false,
          alreadyGranted: true,
          remainingCount: duplicateRemaining
        };
      }
    }

    // A different Session sharing this Payment Intent must not bypass an
    // earlier ambiguous grant attempt.
    if (paymentIntentId) {
      const intentRow = findPaymentRowByPaymentIntent_(payments, paymentIntentId);
      if (intentRow > 0 && intentRow !== paymentRow) {
        throw new Error('Stripe Payment Intentは別セッションで登録済みです。手動整合確認が必要です。');
      }
    }

    // Recover an interrupted grant from the immutable before/after counters saved
    // in Payments. Only exact matches are safe to resume or finalize.
    if (paymentRow > 0) {
      const state = String(payments.getRange(paymentRow, 10).getValue() || '');
      if (state === '要整合確認') {
        throw new Error('Stripe付与状態が不整合です。手動照合してください。');
      }
      if (state === '付与処理中') {
        return recoverInterruptedStripeGrant_(
          payments, paymentRow, users, session, def
        );
      }
    }

    let userRow = findRouteUserRow_(users, lineUserId);

    const beforeValues = userRow > 0
      ? users.getRange(userRow, 1, 1, 12).getValues()[0]
      : ['', '', '', '', 0, 0, 0, 0, '', '', '', ''];
    const grantJournal = buildStripeGrantJournal_(
      session, lineUserId, ticketCode, def, beforeValues
    );

    // Persist the recovery journal before the claim marker and before Users.
    if (paymentRow > 0) {
      payments.getRange(paymentRow, 13).setValue(JSON.stringify(grantJournal));
      payments.getRange(paymentRow, 10).setValue('付与処理中');
      payments.getRange(paymentRow, 12).setValue(new Date());
    } else {
      payments.appendRow([
        new Date(), lineUserId, String(metadata.display_name || ''),
        ticketCode, def.amount, def.count, session.id, paymentIntentId,
        '支払済', '付与処理中', '', new Date(), JSON.stringify(grantJournal)
      ]);
      paymentRow = payments.getLastRow();
    }

    if (userRow === -1) {
      users.appendRow([
        lineUserId,
        String(metadata.display_name || ''),
        '有効',
        def.label,
        0,
        0,
        0,
        0,
        '使用済み',
        '',
        new Date(),
        'Stripe決済から自動作成'
      ]);

      userRow = users.getLastRow();
    }

    const uv = users.getRange(userRow, 1, 1, 12).getValues()[0];

    const currentPaid = Number(
      uv[ROUTE_QA.USER_COL.TOTAL_PAID - 1] || 0
    );

    const currentGranted = Number(
      uv[ROUTE_QA.USER_COL.TOTAL_GRANTED - 1] || 0
    );

    const currentRemaining = Number(
      uv[ROUTE_QA.USER_COL.REMAINING - 1] || 0
    );

    if (![currentPaid, currentGranted, currentRemaining, def.count, def.amount].every(
      function(v) { return Number.isSafeInteger(v) && v >= 0; }
    ) || !Number.isSafeInteger(currentPaid + def.amount) ||
        !Number.isSafeInteger(currentGranted + def.count) ||
        !Number.isSafeInteger(currentRemaining + def.count)) {
      throw new Error('Stripeチケット付与の数値が不正です。');
    }

    const newRemaining = currentRemaining + def.count;

    // Keep all Users ticket counters in a single row write.
    const updatedUserValues = uv.slice();
    updatedUserValues[ROUTE_QA.USER_COL.MEMBER_STATUS - 1] = '有効';
    updatedUserValues[ROUTE_QA.USER_COL.LAST_TICKET - 1] = def.label;
    updatedUserValues[ROUTE_QA.USER_COL.TOTAL_PAID - 1] = currentPaid + def.amount;
    updatedUserValues[ROUTE_QA.USER_COL.TOTAL_GRANTED - 1] = currentGranted + def.count;
    updatedUserValues[ROUTE_QA.USER_COL.REMAINING - 1] = newRemaining;
    updatedUserValues[ROUTE_QA.USER_COL.UPDATED_AT - 1] = new Date();
    users.getRange(userRow, 1, 1, 12).setValues([updatedUserValues]);

    // Users was updated; never leave a replayable blank marker on failure.
    const grantedAt = new Date();
    payments.getRange(paymentRow, 9, 1, 4).setValues([[
      '支払済', '付与済', grantedAt, grantedAt
    ]]);


    return {
      granted: true,
      alreadyGranted: false,
      remainingCount: newRemaining
    };

  } finally {
    lock.releaseLock();
  }
}


function buildStripeGrantJournal_(session, lineUserId, ticketCode, def, userValues) {
  const before = stripeGrantCountersFromUserValues_(userValues);
  const numericValues = [
    before.totalPaid, before.totalGranted, before.remaining,
    def.amount, def.count
  ];
  if (!numericValues.every(function(v) {
    return Number.isSafeInteger(v) && v >= 0;
  })) {
    throw new Error('Stripeチケット付与の数値が不正です。');
  }

  const after = {
    totalPaid: before.totalPaid + def.amount,
    totalGranted: before.totalGranted + def.count,
    remaining: before.remaining + def.count
  };
  if (![after.totalPaid, after.totalGranted, after.remaining].every(
    Number.isSafeInteger
  )) {
    throw new Error('Stripeチケット付与の数値が上限を超えています。');
  }

  return {
    version: 1,
    sessionId: String(session.id || ''),
    paymentIntentId: String(session.payment_intent || ''),
    lineUserId: lineUserId,
    ticketCode: ticketCode,
    amount: def.amount,
    count: def.count,
    before: before,
    after: after
  };
}


function stripeGrantCountersFromUserValues_(values) {
  return {
    totalPaid: Number(values[ROUTE_QA.USER_COL.TOTAL_PAID - 1] || 0),
    totalGranted: Number(values[ROUTE_QA.USER_COL.TOTAL_GRANTED - 1] || 0),
    remaining: Number(values[ROUTE_QA.USER_COL.REMAINING - 1] || 0)
  };
}


function stripeGrantCountersEqual_(left, right) {
  return left.totalPaid === right.totalPaid &&
    left.totalGranted === right.totalGranted &&
    left.remaining === right.remaining;
}


function recoverInterruptedStripeGrant_(payments, paymentRow, users, session, def) {
  const rawJournal = String(payments.getRange(paymentRow, 13).getValue() || '');
  let journal;
  try {
    journal = JSON.parse(rawJournal);
  } catch (error) {
    payments.getRange(paymentRow, 10).setValue('要整合確認');
    throw new Error('Stripe付与復旧ジャーナルが不正です。手動照合してください。');
  }

  const metadata = session.metadata || {};
  const lineUserId = String(
    metadata.line_user_id || session.client_reference_id || ''
  ).trim();
  const ticketCode = String(metadata.ticket_code || '').trim();
  if (!journal || journal.version !== 1 ||
      journal.sessionId !== String(session.id || '') ||
      journal.paymentIntentId !== String(session.payment_intent || '') ||
      journal.lineUserId !== lineUserId ||
      journal.ticketCode !== ticketCode ||
      journal.amount !== def.amount || journal.count !== def.count ||
      !journal.before || !journal.after ||
      ![
        journal.before.totalPaid,
        journal.before.totalGranted,
        journal.before.remaining,
        journal.after.totalPaid,
        journal.after.totalGranted,
        journal.after.remaining
      ].every(function(value) {
        return Number.isSafeInteger(value) && value >= 0;
      }) ||
      journal.after.totalPaid !== journal.before.totalPaid + def.amount ||
      journal.after.totalGranted !== journal.before.totalGranted + def.count ||
      journal.after.remaining !== journal.before.remaining + def.count) {
    payments.getRange(paymentRow, 10).setValue('要整合確認');
    throw new Error('Stripe付与復旧ジャーナルとSessionが一致しません。');
  }

  let userRow = findRouteUserRow_(users, lineUserId);
  const currentValues = userRow > 0
    ? users.getRange(userRow, 1, 1, 12).getValues()[0]
    : ['', '', '', '', 0, 0, 0, 0, '', '', '', ''];
  const current = stripeGrantCountersFromUserValues_(currentValues);

  if (stripeGrantCountersEqual_(current, journal.after)) {
    const recoveredAt = new Date();
    payments.getRange(paymentRow, 9, 1, 4).setValues([[
      '支払済', '付与済', recoveredAt, recoveredAt
    ]]);
    return {
      granted: false,
      alreadyGranted: true,
      recovered: true,
      remainingCount: current.remaining
    };
  }

  if (!stripeGrantCountersEqual_(current, journal.before)) {
    payments.getRange(paymentRow, 10).setValue('要整合確認');
    throw new Error('Stripe付与中のUsers値が付与前後のどちらにも一致しません。');
  }

  if (userRow === -1) {
    users.appendRow([
      lineUserId, String(metadata.display_name || ''), '有効', def.label,
      0, 0, 0, 0, '使用済み', '', new Date(),
      'Stripe決済から自動作成（復旧）'
    ]);
    userRow = users.getLastRow();
  }

  const updated = users.getRange(userRow, 1, 1, 12).getValues()[0];
  updated[ROUTE_QA.USER_COL.MEMBER_STATUS - 1] = '有効';
  updated[ROUTE_QA.USER_COL.LAST_TICKET - 1] = def.label;
  updated[ROUTE_QA.USER_COL.TOTAL_PAID - 1] = journal.after.totalPaid;
  updated[ROUTE_QA.USER_COL.TOTAL_GRANTED - 1] = journal.after.totalGranted;
  updated[ROUTE_QA.USER_COL.REMAINING - 1] = journal.after.remaining;
  updated[ROUTE_QA.USER_COL.UPDATED_AT - 1] = new Date();
  users.getRange(userRow, 1, 1, 12).setValues([updated]);

  const recoveredAt = new Date();
  payments.getRange(paymentRow, 9, 1, 4).setValues([[
    '支払済', '付与済', recoveredAt, recoveredAt
  ]]);
  return {
    granted: true,
    alreadyGranted: false,
    recovered: true,
    remainingCount: journal.after.remaining
  };
}


/* =========================================================
   Checkout作成時にPaymentsへ仮登録
========================================================= */

function savePaymentSessionCreated_(
  session,
  user,
  ticketCode,
  def
) {
  setupSheets();

  const ss = openRouteqQaTestSpreadsheet_();
  const payments = ss.getSheetByName(ROUTE_QA.PAYMENTS);

  const existingRow = findPaymentRowBySessionId_(
    payments,
    session.id
  );

  if (existingRow > 0) return;

  payments.appendRow([
    new Date(),
    user.sub,
    user.name || '',
    ticketCode,
    def.amount,
    def.count,
    session.id,
    '',
    '作成',
    '未付与',
    '',
    new Date()
  ]);
}


/* =========================================================
   Stripe API
========================================================= */

function getStripeSecretKey_() {
  const key = PropertiesService
    .getScriptProperties()
    .getProperty('STRIPE_SECRET_KEY');

  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEYが設定されていません。'
    );
  }

  return key;
}


function stripePost_(
  path,
  payload
) {

  const secret =
    getStripeSecretKey_();

  const formBody =
    Object.keys(
      payload || {}
    )
      .filter(
        function(key) {
          return (
            payload[key] !== undefined &&
            payload[key] !== null
          );
        }
      )
      .map(
        function(key) {
          return (
            encodeURIComponent(
              String(key)
            ) +
            '=' +
            encodeURIComponent(
              String(
                payload[key]
              )
            )
          );
        }
      )
      .join('&');

  const response =
    routeqQaRejectExternalFetch_(
      'https://api.stripe.com' + path,
      {
        method:
          'post',

        contentType:
          'application/x-www-form-urlencoded',

        payload:
          formBody,

        headers: {
          Authorization:
            'Bearer ' + secret
        },

        muteHttpExceptions:
          true
      }
    );

  return parseStripeResponse_(
    response
  );
}


function stripeGet_(path) {
  const response = routeqQaRejectExternalFetch_(
    'https://api.stripe.com' + path,
    {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + getStripeSecretKey_()
      },
      muteHttpExceptions: true
    }
  );

  return parseStripeResponse_(response);
}


function retrieveStripeCheckoutSession_(sessionId) {
  const id = String(sessionId || '').trim();

  if (!/^cs_/.test(id)) {
    throw new Error(
      'Stripe Session IDが正しくありません。'
    );
  }

  return stripeGet_(
    '/v1/checkout/sessions/' +
    encodeURIComponent(id)
  );
}


function parseStripeResponse_(response) {
  const code = response.getResponseCode();
  const body = response.getContentText();

  let json;

  try {
    json = JSON.parse(body);
  } catch (error) {
    throw new Error(
      'Stripeから不正な応答が返りました。'
    );
  }

  if (code < 200 || code >= 300) {
    const message =
      json &&
      json.error &&
      json.error.message
        ? json.error.message
        : 'Stripe APIエラー HTTP ' + code;

    throw new Error(message);
  }

  return json;
}


/* =========================================================
   Payments検索
========================================================= */

function findPaymentRowBySessionId_(sheet, sessionId) {
  return findPaymentRowByColumn_(sheet, 7, sessionId);
}


function findPaymentRowByPaymentIntent_(
  sheet,
  paymentIntentId
) {
  return findPaymentRowByColumn_(
    sheet,
    8,
    paymentIntentId
  );
}


function assertStripePaymentIdentity_(
  payments,
  paymentRow,
  session,
  lineUserId,
  ticketCode,
  def
) {
  const paymentIntentId = String(session.payment_intent || '').trim();
  const amountTotal = Number(session.amount_total);
  const grantCount = Number((session.metadata || {}).grant_count);

  if (paymentRow <= 0 || !paymentIntentId ||
      !Number.isSafeInteger(amountTotal) || amountTotal < 0 ||
      !Number.isSafeInteger(grantCount) || grantCount < 0) {
    throw new Error(
      'Stripe決済識別情報が不足しています。Usersを更新せず手動整合確認してください。'
    );
  }

  const lastRow = payments.getLastRow();
  const rows = payments.getRange(2, 1, lastRow - 1, 13).getValues();
  const sessionId = String(session.id || '').trim();
  let sessionMatches = 0;
  let intentMatches = 0;

  rows.forEach(function(values) {
    if (String(values[6] || '').trim() === sessionId) sessionMatches += 1;
    if (String(values[7] || '').trim() === paymentIntentId) intentMatches += 1;
  });

  const saved = rows[paymentRow - 2] || [];
  const savedIntentId = String(saved[7] || '').trim();
  const coreIdentityMatches =
    sessionMatches === 1 &&
    String(saved[6] || '').trim() === sessionId &&
    String(saved[1] || '').trim() === lineUserId &&
    String(saved[3] || '').trim() === ticketCode &&
    Number.isSafeInteger(Number(saved[4])) &&
    Number(saved[4]) === amountTotal &&
    amountTotal === def.amount &&
    Number.isSafeInteger(Number(saved[5])) &&
    Number(saved[5]) === grantCount &&
    grantCount === def.count;

  const recordedIntentMatches =
    savedIntentId === paymentIntentId && intentMatches === 1;
  const canBindInitialIntent =
    !savedIntentId &&
    intentMatches === 0 &&
    String(saved[8] || '').trim() === '作成' &&
    String(saved[9] || '').trim() === '未付与';

  if (!coreIdentityMatches ||
      (!recordedIntentMatches && !canBindInitialIntent)) {
    throw new Error(
      'Payments登録値とStripe Sessionが一致しません。Usersを更新せず手動整合確認してください。'
    );
  }

  if (canBindInitialIntent) {
    payments.getRange(paymentRow, 8).setValue(paymentIntentId);
  }
}


function findPaymentRowByColumn_(sheet, column, value) {
  const target = String(value || '').trim();

  if (!target) return -1;

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return -1;

  const values = sheet
    .getRange(2, column, lastRow - 1, 1)
    .getValues();

  for (let i = 0; i < values.length; i++) {
    if (
      String(values[i][0] || '').trim() === target
    ) {
      return i + 2;
    }
  }

  return -1;
}


/* =========================================================
   URL補助
========================================================= */

function appendQuery_(baseUrl, query) {
  return (
    baseUrl +
    (
      String(baseUrl).indexOf('?') >= 0
        ? '&'
        : '?'
    ) +
    query
  );
}


/* =========================================================
   Stripe接続テスト
========================================================= */

function testStripeConnection() {
  const result = stripeGet_('/v1/balance');

  console.log(JSON.stringify(result));

  SpreadsheetApp.getActive().toast(
    'Stripe API接続OKです。',
    'ROUTE Q&A',
    4
  );
}


function testRouteStripeIntegerEncoding() {

  const def =
    ROUTE_STRIPE_TICKETS.ticket3;

  const payload = {
    'line_items[0][price_data][unit_amount]':
      String(
        Math.round(
          Number(
            def.amount
          )
        )
      ),

    'line_items[0][quantity]':
      '1'
  };

  const formBody =
    Object.keys(payload)
      .map(
        function(key) {
          return (
            encodeURIComponent(key) +
            '=' +
            encodeURIComponent(
              String(payload[key])
            )
          );
        }
      )
      .join('&');

  console.log(
    'quantity値：' +
    payload['line_items[0][quantity]']
  );

  console.log(
    'quantity型：' +
    typeof payload['line_items[0][quantity]']
  );

  console.log(
    'unit_amount値：' +
    payload['line_items[0][price_data][unit_amount]']
  );

  console.log(
    'フォーム本文：' +
    formBody
  );

  console.log(
    '1.0混入なし：' +
    (
      formBody.indexOf('1.0') === -1
    )
  );
}
