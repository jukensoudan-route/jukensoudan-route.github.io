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
    label: '1,500円／3回',
    amount: 1500,
    count: 3
  },
  ticket10: {
    label: '3,500円／10回',
    amount: 3500,
    count: 10
  }
};


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

function applyPaidStripeSession_(session) {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('applyPaidStripeSession_');
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

    let userRow = findRouteUserRow_(users, lineUserId);

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

    const newRemaining = currentRemaining + def.count;

    users.getRange(
      userRow,
      ROUTE_QA.USER_COL.MEMBER_STATUS
    ).setValue('有効');

    users.getRange(
      userRow,
      ROUTE_QA.USER_COL.LAST_TICKET
    ).setValue(def.label);

    users.getRange(
      userRow,
      ROUTE_QA.USER_COL.TOTAL_PAID
    ).setValue(currentPaid + def.amount);

    users.getRange(
      userRow,
      ROUTE_QA.USER_COL.TOTAL_GRANTED
    ).setValue(currentGranted + def.count);

    users.getRange(
      userRow,
      ROUTE_QA.USER_COL.REMAINING
    ).setValue(newRemaining);

    users.getRange(
      userRow,
      ROUTE_QA.USER_COL.UPDATED_AT
    ).setValue(new Date());

    if (paymentRow <= 0) {
      payments.appendRow([
        new Date(),
        lineUserId,
        String(metadata.display_name || ''),
        ticketCode,
        def.amount,
        def.count,
        session.id,
        paymentIntentId,
        '支払済',
        '付与済',
        new Date(),
        new Date()
      ]);

      paymentRow = payments.getLastRow();

    } else {
      payments.getRange(paymentRow, 8)
        .setValue(paymentIntentId);

      payments.getRange(paymentRow, 9)
        .setValue('支払済');

      payments.getRange(paymentRow, 10)
        .setValue('付与済');

      payments.getRange(paymentRow, 11)
        .setValue(new Date());

      payments.getRange(paymentRow, 12)
        .setValue(new Date());
    }

    return {
      granted: true,
      alreadyGranted: false,
      remainingCount: newRemaining
    };

  } finally {
    lock.releaseLock();
  }
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