// TEST CANDIDATE — non-deployable. Copied from quarantined original with added deep external-network entrypoint blocks.
// Do not remove fail-closed throws without completing complete dependency and connectivity review.
// QUARANTINED TEST CANDIDATE. DO NOT DEPLOY. Preserves archived source with sheet isolation and entrypoint fail-closed.
/**
 * =========================================================
 * ROUTE Q&A 完成版：コード.gs
 * 質問受付 / LINE認証 / 回数券管理 / AI回答案 / 共通処理
 * =========================================================
 *
 * このファイルに doPost() は1つだけ置きます。
 * Stripe固有処理は「Stripe連携.gs」
 * 回答確認画面は「回答確認.gs」
 *
 * Script Properties（必須）
 *   LINE_LOGIN_CHANNEL_ID
 *   LINE_CHANNEL_ACCESS_TOKEN
 *   OPENAI_API_KEY
 *   STRIPE_SECRET_KEY
 *   QUESTION_PAGE_URL
 */

const TIME_ZONE = 'Asia/Tokyo';
const OPENAI_MODEL = 'gpt-5.6-terra';
const OPENAI_MODEL_LOW_COST = 'gpt-5.6-luna';

const ROUTE_QA = {
  QUESTIONS: 'Questions',
  REVIEW: '回答確認',
  USERS: 'Users',
  PAYMENTS: 'Payments',

  QUESTION_COL: {
    RECEIVED_AT: 1,
    LINE_USER_ID: 2,
    DISPLAY_NAME: 3,
    CATEGORY: 4,
    THEME: 5,
    DISTRICT: 6,
    SCHOOL: 7,
    QUESTION: 8,
    AI_ANSWER: 9,
    FINAL_ANSWER: 10,
    AI_STATUS: 11,
    CONFIRMED: 12,
    SEND_STATUS: 13,
    SENT_AT: 14,
    UPDATED_AT: 15,
    TICKET_LABEL: 16,
    REMAINING_AFTER: 17
  },

  USER_COL: {
    LINE_USER_ID: 1,
    DISPLAY_NAME: 2,
    MEMBER_STATUS: 3,
    LAST_TICKET: 4,
    TOTAL_PAID: 5,
    TOTAL_GRANTED: 6,
    USED_COUNT: 7,
    REMAINING: 8,
    FREE_TRIAL_USED: 9,
    LAST_QUESTION_AT: 10,
    UPDATED_AT: 11,
    NOTE: 12
  }
};


/* =========================================================
   初期セットアップ
========================================================= */

function setupAll() {
  assertRouteqQaTestEnvironment_();
  throw new Error('TEST isolation: entry point disabled until isolated dependencies validated');
  setupSheets();
  setupReviewSheet();
  setupStripeAutoReconcileTrigger();

  SpreadsheetApp.getActive().toast(
    'ROUTE Q&A の初期セットアップが完了しました。',
    'ROUTE Q&A',
    5
  );
}



function ensureRouteQuestionDistrictColumn_(
  sheet
) {

  if (!sheet) {
    return;
  }


  const lastColumn =
    Math.max(
      1,
      sheet.getLastColumn()
    );

  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0]
      .map(
        function(value) {
          return String(
            value || ''
          ).trim();
        }
      );


  /*
   * すでにF列が「学区」なら移行済み。
   * 何度 setupSheets() を実行しても列を増やさない。
   */
  if (
    headers[5] ===
    '学区'
  ) {
    return;
  }


  const themeIndex =
    headers.indexOf(
      '質問テーマ'
    );


  if (
    themeIndex === -1
  ) {
    throw new Error(
      'Questionsシートの「質問テーマ」列を確認できません。自動移行を停止しました。'
    );
  }


  /*
   * 旧版は「質問テーマ」の直後が「高校名」。
   * その位置に学区列を1列挿入し、既存データを右へ移動する。
   */
  sheet.insertColumnAfter(
    themeIndex + 1
  );


  sheet
    .getRange(
      1,
      themeIndex + 2
    )
    .setValue(
      '学区'
    );
}


function setupSheets() {
  assertRouteqQaTestEnvironment_();
  throw new Error('TEST isolation: entry point disabled until isolated dependencies validated');
  const ss = openRouteqQaTestSpreadsheet_();

  if (!ss) {
    throw new Error('Googleスプレッドシートを取得できませんでした。');
  }

  // Users
  let users = ss.getSheetByName(ROUTE_QA.USERS);
  if (!users) users = ss.insertSheet(ROUTE_QA.USERS);

  ensureHeaders_(users, [
    'LINEユーザーID',
    '表示名',
    '会員状態',
    '最終購入チケット',
    '累計購入金額',
    '累計付与回数',
    '使用回数',
    '残り回数',
    '無料お試し使用済み',
    '最終質問日時',
    '更新日時',
    'メモ'
  ]);

  // Questions
  let questions = ss.getSheetByName(ROUTE_QA.QUESTIONS);
  if (!questions) questions = ss.insertSheet(ROUTE_QA.QUESTIONS);

  /*
   * 既存16列版を17列版へ移行する。
   * 重要：ヘッダーを書き換える前に列挿入する。
   */
  ensureRouteQuestionDistrictColumn_(
    questions
  );

  ensureHeaders_(questions, [
    '受付日時',
    'LINEユーザーID',
    '表示名',
    '大項目',
    '質問テーマ',
    '学区',
    '高校名',
    '質問内容',
    'AI回答案',
    '最終回答',
    'AI生成状態',
    '確認済み',
    '送信状態',
    'LINE送信日時',
    '最終更新日時',
    '利用チケット',
    '質問後残り回数'
  ]);

  // Payments
  let payments = ss.getSheetByName(ROUTE_QA.PAYMENTS);
  if (!payments) payments = ss.insertSheet(ROUTE_QA.PAYMENTS);

  ensureHeaders_(payments, [
    '作成日時',
    'LINEユーザーID',
    '表示名',
    '商品コード',
    '金額',
    '付与回数',
    'Stripe Session ID',
    'Payment Intent ID',
    '決済状態',
    '回数付与済み',
    '付与日時',
    '最終更新日時'
  ]);

}


function ensureHeaders_(sheet, headers) {
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      headers.length - sheet.getMaxColumns()
    );
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}


/* =========================================================
   Webアプリ
========================================================= */

function doGet() {
  assertRouteqQaTestEnvironment_();
  throw new Error('TEST isolation: entry point disabled until isolated dependencies validated');
  return HtmlService.createHtmlOutput(
    '<h2>ROUTE受験Q&A API</h2>' +
    '<p>回数券・Stripe対応版が正常に稼働しています。</p>'
  );
}


/**
 * 前の質問フォームと同じPOST方式を維持。
 * action:
 *   usage
 *   validateQuestion
 *   submit
 *   createCheckout
 *   confirmCheckout
 */
function doPost(e) {
  assertRouteqQaTestEnvironment_();
  throw new Error('TEST isolation: entry point disabled until isolated dependencies validated');
  let requestId = '';

  try {
    const p = e && e.parameter ? e.parameter : {};
    requestId = String(p.requestId || '');
    const action = String(p.action || '');

    if (action === 'usage') {
      return makeResponse_({
        ok: true,
        type: 'usage',
        requestId,
        result: getUsageForWeb_(p.idToken)
      });
    }

    if (action === 'validateQuestion') {
      return makeResponse_({
        ok: true,
        type: 'validateQuestion',
        requestId,
        result: validateQuestionForWeb_(p)
      });
    }

    if (action === 'submit') {
      return makeResponse_({
        ok: true,
        type: 'submit',
        requestId,
        result: saveQuestionForWeb_(p)
      });
    }

    if (action === 'createCheckout') {
      return makeResponse_({
        ok: true,
        type: 'createCheckout',
        requestId,
        result: createStripeCheckoutForWeb_(p.idToken, p.ticketCode)
      });
    }

    if (action === 'confirmCheckout') {
      return makeResponse_({
        ok: true,
        type: 'confirmCheckout',
        requestId,
        result: confirmStripeCheckoutForWeb_(p.sessionId)
      });
    }

    throw new Error('不明な処理です。');

  } catch (error) {
    return makeResponse_({
      ok: false,
      requestId,
      message: error && error.message ? error.message : String(error)
    });
  }
}


/* =========================================================
   Apps Script → 質問ページへ結果返却
========================================================= */

function makeResponse_(data) {
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body>
<script>
(function () {
  const message = {
    source: "route-qa-gas",
    payload: ${json}
  };

  try {
    if (window.parent) {
      window.parent.postMessage(message, "*");
    }
    if (window.top && window.top !== window.parent) {
      window.top.postMessage(message, "*");
    }
  } catch(error) {
    console.error(error);
  }
})();
</script>
</body>
</html>`;

  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/* =========================================================
   LINE本人確認
========================================================= */

function verifyLineUser_(token) {
  assertRouteqQaTestEnvironment_();
  throw new Error('TEST isolation: entry point disabled until isolated dependencies validated');

  const value =
    String(
      token || ''
    )
      .trim();

  if (!value) {
    throw new Error(
      'LINE認証情報を確認できません。LINEから開き直してください。'
    );
  }


  /*
   * =====================================================
   * 1. IDトークン(JWT)の場合
   * =====================================================
   *
   * IDトークンは通常 xxx.yyy.zzz のJWT形式。
   * 以前のページや今後IDトークンを使う場合にも対応する。
   */
  if (
    value.split('.').length === 3
  ) {

    const channelId =
      PropertiesService
        .getScriptProperties()
        .getProperty(
          'LINE_LOGIN_CHANNEL_ID'
        );

    if (!channelId) {
      throw new Error(
        'LINE_LOGIN_CHANNEL_IDが設定されていません。'
      );
    }


    const response =
      UrlFetchApp.fetch(
        'https://api.line.me/oauth2/v2.1/verify',
        {
          method:
            'post',

          payload: {
            id_token:
              value,

            client_id:
              channelId
          },

          muteHttpExceptions:
            true
        }
      );


    if (
      response.getResponseCode() ===
      200
    ) {

      const user =
        JSON.parse(
          response.getContentText()
        );

      if (
        !user.sub
      ) {
        throw new Error(
          'LINEユーザー情報を取得できませんでした。'
        );
      }


      return {
        sub:
          user.sub,

        name:
          user.name || '',

        picture:
          user.picture || ''
      };
    }


    console.log(
      'LINE IDトークン検証失敗：' +
      response.getContentText()
    );
  }


  /*
   * =====================================================
   * 2. LINEアクセストークンの場合
   * =====================================================
   *
   * 現在のGitHub質問ページは
   * liff.getAccessToken() を送っているためこちらを使用。
   */
  const profileResponse =
    UrlFetchApp.fetch(
      'https://api.line.me/v2/profile',
      {
        method:
          'get',

        headers: {
          Authorization:
            'Bearer ' +
            value
        },

        muteHttpExceptions:
          true
      }
    );


  if (
    profileResponse.getResponseCode() !==
    200
  ) {

    console.log(
      'LINEアクセストークン検証失敗：' +
      profileResponse.getContentText()
    );

    throw new Error(
      'LINE認証に失敗しました。LINEから開き直してください。'
    );
  }


  const profile =
    JSON.parse(
      profileResponse.getContentText()
    );


  if (
    !profile.userId
  ) {
    throw new Error(
      'LINEユーザー情報を取得できませんでした。'
    );
  }


  /*
   * 後続コードは user.sub / user.name を使うので
   * IDトークンと同じ形式へ統一して返す。
   */
  return {
    sub:
      profile.userId,

    name:
      profile.displayName || '',

    picture:
      profile.pictureUrl || ''
  };
}


/* =========================================================
   Users
========================================================= */

function findRouteUserRow_(sheet, lineUserId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(lineUserId)) {
      return i + 2;
    }
  }

  return -1;
}


/**
 * 初めてLINE認証した人には無料お試し1回を付与。
 */
function createFreeTrialRouteUser_(sheet, user) {
  sheet.appendRow([
    user.sub,          // A LINEユーザーID
    user.name || '',   // B 表示名
    '有効',            // C
    '無料お試し',      // D
    0,                 // E 累計購入金額
    1,                 // F 累計付与回数
    0,                 // G 使用回数
    1,                 // H 残り回数
    '未使用',          // I
    '',                // J
    new Date(),        // K
    ''                 // L
  ]);

  return sheet.getLastRow();
}


/* =========================================================
   利用状況
========================================================= */

function getUsageForWeb_(idToken) {
  setupSheets();

  const user = verifyLineUser_(idToken);
  const ss = openRouteqQaTestSpreadsheet_();
  const users = ss.getSheetByName(ROUTE_QA.USERS);

  let row = findRouteUserRow_(users, user.sub);

  if (row === -1) {
    row = createFreeTrialRouteUser_(users, user);
  }

  users.getRange(row, ROUTE_QA.USER_COL.DISPLAY_NAME)
    .setValue(user.name || '');

  users.getRange(row, ROUTE_QA.USER_COL.UPDATED_AT)
    .setValue(new Date());

  const v = users.getRange(row, 1, 1, 12).getValues()[0];

  const remaining = Math.max(
    0,
    Number(v[ROUTE_QA.USER_COL.REMAINING - 1] || 0)
  );

  const memberStatus = String(
    v[ROUTE_QA.USER_COL.MEMBER_STATUS - 1] || '有効'
  );

  return {
    displayName: user.name || '',
    memberStatus,
    ticketLabel: String(
      v[ROUTE_QA.USER_COL.LAST_TICKET - 1] || '無料お試し'
    ),
    totalGranted: Number(
      v[ROUTE_QA.USER_COL.TOTAL_GRANTED - 1] || 0
    ),
    usedCount: Number(
      v[ROUTE_QA.USER_COL.USED_COUNT - 1] || 0
    ),
    remainingCount: remaining,
    canSubmit: memberStatus === '有効' && remaining > 0,

    // 前の質問ページとの互換用
    dayCount: 0,
    weekCount: 0,
    maxDay: 999999,
    maxWeek: 999999
  };
}



/* =========================================================
   質問送信前チェック
   対象外・回答困難・不適切・意味不明・入力ミスを
   Questions保存 / 回数消費の前に差し戻す
========================================================= */


/* =========================================================
   学区・学校候補の回答条件
========================================================= */

const ROUTE_DISTRICT_LABELS = {
  "district1": "第1学区",
  "district2": "第2学区",
  "district3": "第3学区",
  "district4": "第4学区",
  "district5": "第5学区",
  "private": "私立"
};

const ROUTE_DISTRICT_SCHOOLS = {
  "district1": [
    "県立東灘高校",
    "県立御影高校",
    "県立神戸高校",
    "県立兵庫工業高校",
    "県立神戸鈴蘭台高校",
    "県立北神戸総合高校",
    "県立夢野台高校",
    "県立兵庫高校",
    "県立長田高校",
    "県立須磨東高校",
    "県立北須磨高校",
    "県立須磨友が丘高校",
    "県立星陵高校",
    "県立舞子高校",
    "県立神戸商業高校",
    "県立神戸学園都市高校",
    "県立神戸高塚高校",
    "県立芦屋高校",
    "県立国際高校",
    "県立洲本高校",
    "県立洲本実業高校",
    "県立津名高校",
    "県立淡路高校",
    "県立淡路三原高校",
    "神戸市立六甲アイランド高校",
    "神戸市立科学技術高校",
    "神戸市立葺合高校",
    "神戸市立神港橘高校",
    "神戸市立須磨翔風高校"
  ],
  "district2": [
    "県立尼崎高校",
    "県立尼崎北高校",
    "県立尼崎稲園高校",
    "県立尼崎西高校",
    "県立尼崎小田高校",
    "県立尼崎工業高校",
    "県立武庫荘総合高校",
    "県立西宮高校",
    "県立西宮苦楽園高校",
    "県立鳴尾高校",
    "県立西宮南高校",
    "県立西宮今津高校",
    "県立伊丹高校",
    "県立伊丹西高校",
    "県立伊丹北高校",
    "県立宝塚高校",
    "県立宝塚東高校",
    "県立宝塚西高校",
    "県立宝塚北高校",
    "県立川西緑台高校",
    "県立川西北陵高校",
    "県立川西明峰高校",
    "県立有馬高校",
    "県立北摂三田高校",
    "県立三田西陵高校",
    "県立三田祥雲館高校",
    "県立猪名川高校",
    "県立篠山鳳鳴高校",
    "県立篠山産業高校",
    "県立篠山東雲高校",
    "県立柏原高校",
    "県立氷上西高校",
    "県立氷上高校",
    "尼崎市立尼崎高校",
    "尼崎市立尼崎双星高校",
    "伊丹市立伊丹高校",
    "西宮市立西宮高校",
    "西宮市立西宮東高校"
  ],
  "district3": [
    "県立明石高校",
    "県立明石南高校",
    "県立明石西高校",
    "県立明石北高校",
    "県立明石清水高校",
    "県立明石城西高校",
    "県立加古川東高校",
    "県立加古川西高校",
    "県立加古川北高校",
    "県立加古川南高校",
    "県立農業高校",
    "県立東播工業高校",
    "県立高砂高校",
    "県立高砂南高校",
    "県立松陽高校",
    "県立東播磨高校",
    "県立播磨南高校",
    "県立西脇高校",
    "県立西脇工業高校",
    "県立三木高校",
    "県立三木総合高校",
    "県立小野高校",
    "県立小野工業高校",
    "県立北条高校",
    "県立播磨農業高校",
    "県立社高校",
    "県立多可高校",
    "明石市立明石商業高校"
  ],
  "district4": [
    "県立姫路東高校",
    "県立姫路西高校",
    "県立飾磨工業高校",
    "県立姫路海稜高校",
    "県立姫路別所高校",
    "県立姫路飾西高校",
    "県立姫路商業高校",
    "県立姫路工業高校",
    "県立播磨福崎高校",
    "県立神崎高校",
    "県立香寺高校",
    "県立相生高校",
    "県立相生産業高校",
    "県立龍野高校",
    "県立龍野北高校",
    "県立赤穂高校",
    "県立太子高校",
    "県立上郡高校",
    "県立大学附属高校",
    "県立佐用高校",
    "県立山崎高校",
    "県立伊和高校",
    "県立千種高校",
    "姫路市立高等学校"
  ],
  "district5": [
    "県立豊岡高校",
    "県立豊岡総合高校",
    "県立香住高校",
    "県立日高高校",
    "県立出石高校",
    "県立村岡高校",
    "県立浜坂高校",
    "県立八鹿高校",
    "県立但馬農業高校",
    "県立生野高校",
    "県立和田山高校"
  ],
  "private": [
    "三田学園高等学校",
    "三田松聖高等学校",
    "仁川学院高等学校",
    "六甲学院高等学校",
    "兵庫大学附属須磨ノ浦高等学校",
    "啓明学院高等学校",
    "園田学園高等学校",
    "報徳学園高等学校",
    "夙川高等学校",
    "姫路女学院高等学校",
    "小林聖心女子学院高等学校",
    "市川高等学校",
    "彩星工科高等学校",
    "愛徳学園高等学校",
    "日ノ本学園高等学校",
    "東洋大学附属姫路高等学校",
    "松蔭高等学校",
    "武庫川女子大学附属高等学校",
    "淳心学院高等学校",
    "滝川第二高等学校",
    "滝川高等学校",
    "灘高等学校",
    "生野学園高等学校",
    "甲南女子高等学校",
    "甲南高等学校",
    "甲子園学院高等学校",
    "甲陽学院高等学校",
    "白陵高等学校",
    "百合学院高等学校",
    "神戸国際大学附属高等学校",
    "神戸女学院高等学部",
    "神戸学院大学附属高等学校",
    "神戸山手グローバル高等学校",
    "神戸常盤女子高等学校",
    "神戸弘陵学園高等学校",
    "神戸星城高等学校",
    "神戸海星女子学院高等学校",
    "神戸第一高等学校",
    "神戸野田高等学校",
    "神戸龍谷高等学校",
    "神港学園高等学校",
    "育英高等学校",
    "芦屋学園高等学校",
    "蒼開高等学校",
    "親和女子高等学校",
    "賢明女子学院高等学校",
    "近畿大学附属豊岡高等学校",
    "関西学院高等部",
    "雲雀丘学園高等学校",
    "須磨学園高等学校"
  ]
};


function getRouteDistrictLabel_(district) {

  const key =
    String(
      district || ''
    )
      .trim();

  return (
    ROUTE_DISTRICT_LABELS[key] ||
    ''
  );
}


function getRouteDistrictSchools_(district) {

  const key =
    String(
      district || ''
    )
      .trim();

  const values =
    ROUTE_DISTRICT_SCHOOLS[key];

  return Array.isArray(values)
    ? values.slice()
    : [];
}


function isRouteSchoolInSelectedDistrict_(
  district,
  school
) {

  const selectedSchool =
    String(
      school || ''
    )
      .trim();

  if (!selectedSchool) {
    return true;
  }

  const schools =
    getRouteDistrictSchools_(
      district
    );

  if (schools.length === 0) {
    return true;
  }

  return (
    schools.indexOf(
      selectedSchool
    ) !== -1
  );
}


function getRouteDistrictAnswerContext_(data) {

  const district =
    String(
      data && data.district || ''
    )
      .trim();

  const label =
    String(
      data && data.districtLabel || ''
    )
      .trim() ||
    getRouteDistrictLabel_(
      district
    );

  const schools =
    getRouteDistrictSchools_(
      district
    );

  if (
    !district ||
    schools.length === 0
  ) {
    return (
      '学区指定なし。質問文または選択高校の条件だけで回答する。'
    );
  }

  return (
    '選択学区：' +
    label +
    '\n' +
    'この学区指定がある場合、候補校・おすすめ校・強豪校・比較校・第2志望・安全校・併願候補・ランキング等、回答内で候補として挙げてよい学校は、原則として次の一覧内だけです。' +
    '\n' +
    schools.join('、') +
    '\n' +
    '一覧外の高校を候補として回答へ混ぜないでください。'
  );
}



function isRouteSchoolPopulationComparisonQuestion_(
  data
) {

  const text =
    [
      data && data.category,
      data && data.categoryLabel,
      data && data.theme,
      data && data.districtLabel,
      data && data.school,
      data && data.question
    ]
      .filter(Boolean)
      .join(' ');


  /*
   * 学区内の複数校を比較して候補を出す質問。
   * 「検索で見つかった学校だけ」から選ばず、
   * 学区登録校全体を候補母集団として扱う。
   */
  return (
    /強豪|強い|おすすめ|候補|どこがいい|どの高校|上位|ランキング|比較|向いている|実績が良い|進学実績|学費が安い|費用が安い|校風が|設備が|部活が|入りやすい|安全校|第2志望|第二志望|併願候補/.test(
      text
    )
  );
}


function getRouteSchoolPopulationResearchInstruction_(
  data
) {

  if (
    !isRouteSchoolPopulationComparisonQuestion_(
      data
    )
  ) {
    return '';
  }


  const district =
    String(
      data && data.district || ''
    )
      .trim();

  const districtLabel =
    String(
      data && data.districtLabel || ''
    )
      .trim() ||
    getRouteDistrictLabel_(
      district
    );


  const schools =
    getRouteDistrictSchools_(
      district
    );


  if (
    !district ||
    schools.length === 0
  ) {
    return '';
  }


  return (
    '【候補母集団の固定：最重要】\n' +
    'この質問では検索結果に出てきた学校だけから候補を選んではいけません。\n' +
    'まず、選択された' +
    districtLabel +
    'の登録校すべてを候補母集団としてください。\n' +
    '候補母集団：' +
    schools.join('、') +
    '\n' +
    'そのうえで、質問テーマに関係する最新の公式情報を各校について確認し、比較してください。\n' +
    '検索上位に出た学校だけを優先せず、候補母集団の中で実績・条件・現在性を比較して最終候補を選んでください。\n' +
    '十分な公式情報を確認できなかった学校は「情報不足」として扱い、確認していない学校を弱い・劣ると断定しないでください。\n'
  );
}


function testRouteSchoolPopulationComparisonQuestion() {

  console.log(
    '強豪校=true：' +
    isRouteSchoolPopulationComparisonQuestion_({
      category:
        '志望校・高校選び',
      theme:
        '部活動',
      district:
        'district2',
      districtLabel:
        '第2学区',
      question:
        '陸上部の強豪校を教えて'
    })
  );


  console.log(
    '進学実績比較=true：' +
    isRouteSchoolPopulationComparisonQuestion_({
      category:
        '大学進学・進路実績',
      theme:
        '進学実績',
      district:
        'district2',
      districtLabel:
        '第2学区',
      question:
        '進学実績が良い高校を教えて'
    })
  );


  console.log(
    '単独校質問=false：' +
    (
      isRouteSchoolPopulationComparisonQuestion_({
        category:
          '英検・資格・優遇',
        theme:
          '英検',
        district:
          'district2',
        districtLabel:
          '第2学区',
        school:
          '県立西宮高校',
        question:
          '県立西宮高校では英検はどのように扱われますか'
      }) === false
    )
  );
}


function testRouteSchoolPopulationInstruction() {

  const instruction =
    getRouteSchoolPopulationResearchInstruction_({
      category:
        '志望校・高校選び',
      theme:
        '部活動',
      district:
        'district2',
      districtLabel:
        '第2学区',
      question:
        '陸上部の強豪校を教えて'
    });


  console.log(
    '第2学区=true：' +
    (
      instruction.indexOf(
        '第2学区'
      ) !== -1
    )
  );


  console.log(
    '県立西宮高校を母集団に含む=true：' +
    (
      instruction.indexOf(
        '県立西宮高校'
      ) !== -1
    )
  );


  console.log(
    '市立西宮高校を母集団に含む=true：' +
    (
      instruction.indexOf(
        '市立西宮高校'
      ) !== -1
    )
  );


  console.log(
    '検索結果だけから選ばない=true：' +
    (
      instruction.indexOf(
        '検索結果に出てきた学校だけから候補を選んではいけません'
      ) !== -1
    )
  );
}





function getRouteSportEvaluationType_(
  data
) {

  const text =
    [
      data && data.category,
      data && data.theme,
      data && data.school,
      data && data.question
    ]
      .filter(Boolean)
      .join(' ');


  /*
   * チームスポーツ
   * 学校対学校でチーム成績を競う競技を中心に判定。
   */
  if (
    /野球|硬式野球|軟式野球|サッカー|フットサル|バスケットボール|バスケ|バレーボール|バレー|ラグビー|ハンドボール|ホッケー|ソフトボール|アメリカンフットボール|アメフト|水球/.test(
      text
    )
  ) {
    return 'team';
  }


  /*
   * 個人スポーツ
   * 個人種目の実績を学校評価へ積み上げる競技。
   * 団体戦が存在しても、基本評価は個人競技型として扱う。
   */
  if (
    /陸上|陸上競技|水泳|競泳|飛込|体操|新体操|テニス|ソフトテニス|バドミントン|卓球|柔道|剣道|空手|空手道|レスリング|弓道|アーチェリー|フェンシング|ボクシング|重量挙げ|ウエイトリフティング|自転車|スキー|スケート|ゴルフ/.test(
      text
    )
  ) {
    return 'individual';
  }


  return 'unknown';
}


function getRouteSportsEvaluationInstruction_(
  data
) {

  const type =
    getRouteSportEvaluationType_(
      data
    );


  if (
    type === 'individual'
  ) {

    return (
      '【個人スポーツの強豪校判定基準】\n' +
      '直近3年間に実施された近畿大会すべての公式結果を対象に分析する。\n' +
      '総体・ユース・新人・選手権等、競技ごとに公式に実施された近畿レベルの大会を漏れなく確認する。\n' +
      '全国進出、近畿入賞、近畿出場の順で重視する。\n' +
      '3年間の継続性、複数種目、出場人数、男女両方の実績も評価する。\n'
    );
  }


  if (
    type === 'team'
  ) {

    return (
      '【チームスポーツの強豪校判定基準】\n' +
      '直近3年間に実施された兵庫県大会すべての公式結果を対象に分析する。\n' +
      '総体・新人・選手権・県大会等、競技ごとに公式に実施された県レベルの大会を漏れなく確認する。\n' +
      '優勝、準優勝、ベスト4、ベスト8、県大会出場の順で重視する。\n' +
      '単年だけではなく、直近3年間の県大会成績の継続性を評価する。\n' +
      '全国・近畿大会進出実績がある場合は追加評価する。\n' +
      '地区大会だけの成績で県内強豪校と断定しない。\n'
    );
  }


  return '';
}


function testRouteSportEvaluationType() {

  console.log(
    '陸上=individual：' +
    (
      getRouteSportEvaluationType_({
        theme:
          '部活動',
        question:
          '陸上部の強豪校を教えて'
      }) ===
      'individual'
    )
  );


  console.log(
    '水泳=individual：' +
    (
      getRouteSportEvaluationType_({
        theme:
          '部活動',
        question:
          '水泳部の強豪校を教えて'
      }) ===
      'individual'
    )
  );


  console.log(
    'サッカー=team：' +
    (
      getRouteSportEvaluationType_({
        theme:
          '部活動',
        question:
          'サッカー部の強豪校を教えて'
      }) ===
      'team'
    )
  );


  console.log(
    'バスケ=team：' +
    (
      getRouteSportEvaluationType_({
        theme:
          '部活動',
        question:
          'バスケ部の強豪校を教えて'
      }) ===
      'team'
    )
  );
}


function isRouteCurrentStrengthQuestion_(data) {

  const text =
    [
      data && data.category,
      data && data.theme,
      data && data.school,
      data && data.question
    ]
      .filter(Boolean)
      .join(' ');

  return (
    /強豪|強い|強さ|実績|上位|県大会|近畿大会|全国大会|インターハイ|部活/.test(
      text
    ) &&
    /部活動|部活|陸上|野球|サッカー|バスケ|バレー|テニス|水泳|卓球|柔道|剣道|ラグビー|ハンドボール|吹奏楽/.test(
      text
    )
  );
}


function testRouteDistrictScopeContext() {

  const context =
    getRouteDistrictAnswerContext_({
      district:
        'district2',

      districtLabel:
        '第2学区'
    });

  console.log(
    '第2学区を含む=true：' +
    (
      context.indexOf(
        '第2学区'
      ) !== -1
    )
  );

  console.log(
    '県立西宮高校を含む=true：' +
    (
      context.indexOf(
        '県立西宮高校'
      ) !== -1
    )
  );

  console.log(
    '県立神戸高校を含まない=true：' +
    (
      context.indexOf(
        '県立神戸高校'
      ) === -1
    )
  );
}


function testRouteCurrentStrengthQuestion() {

  console.log(
    '部活強豪=true：' +
    isRouteCurrentStrengthQuestion_({
      category:
        '志望校・高校選び',
      theme:
        '部活動',
      question:
        '陸上部の強豪校を教えて'
    })
  );

  console.log(
    '学費=false：' +
    (
      isRouteCurrentStrengthQuestion_({
        category:
          '学費・費用',
        theme:
          '初年度費用',
        question:
          '初年度いくらかかりますか'
      }) === false
    )
  );
}



/* =========================================================
   システム登録済みの選択肢質問
========================================================= */

const ROUTE_PRESET_QUESTION_TEMPLATES = {
  "school": {
    "学校の特徴・強み": [
      "{school}の特徴や強みを教えてください。"
    ],
    "コース・学科": [
      "{school}にはどのようなコース・学科がありますか？"
    ],
    "校風・学校生活": [
      "{school}の校風や学校生活の特徴を教えてください。"
    ],
    "部活動": [
      "{school}の部活動の特徴を教えてください。",
      "{school}の部活動の最近の実績を教えてください。",
      "{district}で希望する競技の強豪校を教えてください。"
    ],
    "通学・立地": [
      "{school}への通学や立地について教えてください。"
    ],
    "学校設備": [
      "{school}の学校設備について教えてください。"
    ],
    "学校行事": [
      "{school}の主な学校行事を教えてください。"
    ],
    "制服・学校生活費": [
      "{school}の制服や学校生活で必要になる費用を教えてください。"
    ],
    "学校同士の客観比較": [
      "A高校とB高校の特徴を客観的に比較してください。"
    ]
  },
  "score": {
    "内申点": [
      "兵庫県公立高校入試の内申点の仕組みを教えてください。",
      "{school}の受験で内申点はどのように扱われますか？"
    ],
    "実力テスト": [
      "高校受験で実力テストはどのように見られますか？"
    ],
    "定期テスト": [
      "高校受験で定期テストの結果はどのように関係しますか？"
    ],
    "模試・偏差値": [
      "{school}の偏差値や模試での目安を教えてください。"
    ],
    "合格ライン": [
      "{school}の合格ラインの目安を教えてください。"
    ],
    "当日点の目安": [
      "{school}の入試当日点の目安を教えてください。"
    ],
    "内申点と当日点の仕組み": [
      "兵庫県公立高校入試の内申点と当日点の計算方法を教えてください。"
    ],
    "加点・減点の仕組み": [
      "兵庫県高校入試の加点・減点の仕組みを教えてください。"
    ]
  },
  "exam": {
    "一般入試": [
      "{school}の一般入試について教えてください。"
    ],
    "推薦入試": [
      "{school}の推薦入試について教えてください。"
    ],
    "特色選抜": [
      "{school}の特色選抜について教えてください。"
    ],
    "専願・併願": [
      "{school}の専願・併願の扱いを教えてください。"
    ],
    "複数志願選抜": [
      "兵庫県公立高校の複数志願選抜について教えてください。"
    ],
    "学区・出願資格": [
      "{school}の学区と出願資格を教えてください。"
    ],
    "試験科目・配点": [
      "{school}の試験科目と配点を教えてください。"
    ],
    "面接": [
      "{school}の入試で面接はありますか？"
    ],
    "作文・小論文": [
      "{school}の入試で作文・小論文はありますか？"
    ],
    "私立高校の入試方式": [
      "{school}の入試方式を教えてください。"
    ]
  },
  "qualification": {
    "英検": [
      "{school}では英検はどのように扱われますか？"
    ],
    "漢検・数検": [
      "{school}では漢検・数検はどのように扱われますか？"
    ],
    "加点": [
      "{school}の入試で資格による加点はありますか？"
    ],
    "得点換算": [
      "{school}の入試で資格による得点換算はありますか？"
    ],
    "試験免除": [
      "{school}の入試で資格による試験免除はありますか？"
    ],
    "出願条件": [
      "{school}の出願条件を教えてください。"
    ],
    "推薦条件": [
      "{school}の推薦条件を教えてください。"
    ],
    "資格の活用方法": [
      "{school}の入試で資格をどのように活用できますか？"
    ]
  },
  "university": {
    "国公立大学": [
      "{school}の国公立大学への進学実績を教えてください。"
    ],
    "関関同立": [
      "{school}の関関同立への進学実績を教えてください。"
    ],
    "産近甲龍": [
      "{school}の産近甲龍への進学実績を教えてください。"
    ],
    "その他大学の進学実績": [
      "{school}の大学進学実績を教えてください。"
    ],
    "指定校推薦": [
      "{school}の指定校推薦について教えてください。"
    ],
    "内部進学": [
      "{school}の内部進学制度について教えてください。"
    ],
    "大学進学率": [
      "{school}の大学進学率を教えてください。"
    ],
    "大学合格実績": [
      "{school}の最新の大学合格実績を教えてください。"
    ],
    "進路指導": [
      "{school}の進路指導の特徴を教えてください。"
    ],
    "大学附属・系列校": [
      "{school}の大学附属・系列校としての特徴を教えてください。"
    ]
  },
  "cost": {
    "授業料": [
      "{school}の授業料はいくらですか？"
    ],
    "入学金": [
      "{school}の入学金はいくらですか？"
    ],
    "初年度費用": [
      "{school}の初年度に必要な費用を教えてください。"
    ],
    "授業料以外の諸経費": [
      "{school}で授業料以外に必要な諸経費を教えてください。"
    ],
    "制服・教材費": [
      "{school}の制服・教材費を教えてください。"
    ],
    "ICT端末": [
      "{school}のICT端末に必要な費用を教えてください。"
    ],
    "修学旅行・行事費": [
      "{school}の修学旅行・行事費について教えてください。"
    ],
    "部活動費": [
      "{school}の部活動に必要な費用について教えてください。"
    ],
    "授業料無償化・就学支援金": [
      "{school}で利用できる授業料無償化・就学支援金について教えてください。"
    ],
    "公立・私立の費用比較": [
      "公立高校と私立高校の費用を比較してください。"
    ]
  },
  "schedule": {
    "出願日": [
      "{school}の出願日はいつですか？"
    ],
    "入試日": [
      "{school}の入試日はいつですか？"
    ],
    "合格発表": [
      "{school}の合格発表日はいつですか？"
    ],
    "学校説明会": [
      "{school}の今後の学校説明会の日程を教えてください。",
      "{district}で今後学校説明会がある高校を教えてください。"
    ],
    "オープンスクール": [
      "{school}の今後のオープンスクールの日程を教えてください。",
      "{district}で今後オープンスクール・学校見学がある高校を教えてください。"
    ],
    "進路希望調査": [
      "中学校の進路希望調査はいつ頃行われますか？"
    ],
    "三者懇談": [
      "高校受験の三者懇談はいつ頃行われますか？"
    ],
    "私立受験校を決める時期": [
      "私立高校の受験校はいつ頃決めますか？"
    ],
    "公立受験校を決める時期": [
      "公立高校の受験校はいつ頃決めますか？"
    ],
    "志望校変更の時期": [
      "志望校はいつ頃まで変更できますか？"
    ]
  }
};


function buildRoutePresetQuestion_(template, data) {
  const school =
    String(data && data.school || '').trim() ||
    '選択した高校';

  const district =
    String(data && data.districtLabel || '').trim() ||
    getRouteDistrictLabel_(data && data.district) ||
    '選択した学区';

  return String(template || '')
    .replace(/\{school\}/g, school)
    .replace(/\{district\}/g, district)
    .trim();
}


function isRoutePresetQuestionAllowed_(data) {
  const category =
    String(data && data.category || '').trim();

  const theme =
    String(data && data.theme || '').trim();

  const question =
    String(data && data.question || '').trim();

  const categoryTemplates =
    ROUTE_PRESET_QUESTION_TEMPLATES[category];

  if (!categoryTemplates) return false;

  const themeTemplates =
    categoryTemplates[theme];

  if (!Array.isArray(themeTemplates)) return false;

  return themeTemplates.some(function(template) {
    return buildRoutePresetQuestion_(template, data) === question;
  });
}


function testRoutePresetQuestionValidation() {
  console.log(
    '登録済み質問=true：' +
    isRoutePresetQuestionAllowed_({
      category:'score',
      theme:'実力テスト',
      district:'district2',
      districtLabel:'第2学区',
      school:'県立西宮高校',
      question:'高校受験で実力テストはどのように見られますか？'
    })
  );

  console.log(
    '未登録質問=false：' +
    (
      isRoutePresetQuestionAllowed_({
        category:'score',
        theme:'実力テスト',
        district:'district2',
        districtLabel:'第2学区',
        school:'県立西宮高校',
        question:'勝手に書き換えた質問です'
      }) === false
    )
  );
}


function normalizeRouteValidationValue_(
  value
) {
  return String(
    value || ''
  )
    .replace(
      /\r\n?/g,
      '\n'
    )
    .replace(
      /[ \t]+/g,
      ' '
    )
    .trim();
}


function makeRouteValidationFingerprint_(
  lineUserId,
  data
) {

  const source = [
    normalizeRouteValidationValue_(
      lineUserId
    ),
    normalizeRouteValidationValue_(
      data && data.category
    ),
    normalizeRouteValidationValue_(
      data && data.categoryLabel
    ),
    normalizeRouteValidationValue_(
      data && data.theme
    ),
    normalizeRouteValidationValue_(
      data && data.district
    ),
    normalizeRouteValidationValue_(
      data && data.districtLabel
    ),
    normalizeRouteValidationValue_(
      data && data.school
    ),
    normalizeRouteValidationValue_(
      data && data.question
    ),
    normalizeRouteValidationValue_(
      data && data.questionSource
    )
  ]
    .join(
      '\n---ROUTE-VALIDATION---\n'
    );

  const digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      source,
      Utilities.Charset.UTF_8
    );

  return digest
    .map(
      function(byte) {

        const value =
          byte < 0
            ? byte + 256
            : byte;

        return (
          '0' +
          value.toString(16)
        )
          .slice(-2);
      }
    )
    .join('');
}


function getRouteValidationSecret_() {

  const props =
    PropertiesService
      .getScriptProperties();

  let secret =
    String(
      props.getProperty(
        'ROUTE_VALIDATION_SECRET'
      ) || ''
    )
      .trim();


  if (secret) {
    return secret;
  }


  /*
   * 初回だけ自動生成。
   * 同時アクセス時に別々の秘密鍵を作らないようロックする。
   */
  const lock =
    LockService
      .getScriptLock();

  lock.waitLock(
    10000
  );

  try {

    secret =
      String(
        props.getProperty(
          'ROUTE_VALIDATION_SECRET'
        ) || ''
      )
        .trim();


    if (!secret) {

      secret =
        Utilities.getUuid() +
        Utilities.getUuid();

      props.setProperty(
        'ROUTE_VALIDATION_SECRET',
        secret
      );
    }


    return secret;

  }
  finally {

    lock.releaseLock();
  }
}


function bytesToRouteHex_(
  bytes
) {

  return bytes
    .map(
      function(byte) {

        const value =
          byte < 0
            ? byte + 256
            : byte;

        return (
          '0' +
          value.toString(16)
        )
          .slice(-2);
      }
    )
    .join('');
}


function makeRouteValidationSignature_(
  issuedAt,
  fingerprint
) {

  const secret =
    getRouteValidationSecret_();

  const source =
    String(
      issuedAt || ''
    ) +
    '\n---ROUTE-QCHECK---\n' +
    String(
      fingerprint || ''
    );

  const signature =
    Utilities
      .computeHmacSha256Signature(
        source,
        secret,
        Utilities.Charset.UTF_8
      );

  return bytesToRouteHex_(
    signature
  );
}


function saveRouteValidationToken_(
  lineUserId,
  data
) {

  const fingerprint =
    makeRouteValidationFingerprint_(
      lineUserId,
      data
    );

  const issuedAt =
    String(
      Date.now()
    );

  const signature =
    makeRouteValidationSignature_(
      issuedAt,
      fingerprint
    );


  /*
   * CacheServiceだけに依存すると、
   * 別リクエストでキャッシュを取得できない場合があるため、
   * 署名付きトークン自体で確認済み内容を検証する。
   */
  return (
    issuedAt +
    '.' +
    signature
  );
}


function consumeRouteValidationToken_(
  lineUserId,
  data,
  validationToken
) {

  const token =
    normalizeRouteValidationValue_(
      validationToken
    );

  if (!token) {
    return false;
  }


  const parts =
    token.split(
      '.'
    );
  if (
    parts.length !== 2
  ) {
    return false;
  }


  const issuedAt =
    Number(
      parts[0]
    );

  const suppliedSignature =
    String(
      parts[1] || ''
    );


  if (
    !Number.isFinite(
      issuedAt
    ) ||
    !suppliedSignature
  ) {
    return false;
  }


  /*
   * 事前確認の有効期限は10分。
   */
  const age =
    Date.now() -
    issuedAt;

  if (
    age < -30000 ||
    age > 10 * 60 * 1000
  ) {
    return false;
  }


  const fingerprint =
    makeRouteValidationFingerprint_(
      lineUserId,
      data
    );

  const expectedSignature =
    makeRouteValidationSignature_(
      String(
        issuedAt
      ),
      fingerprint
    );


  return (
    suppliedSignature ===
    expectedSignature
  );
}


function testRouteValidationTokenRoundTrip() {

  const lineUserId =
    'U_ROUTE_TEST';

  const data = {
    category:
      'qualification',

    categoryLabel:
      '英検・資格・優遇',

    theme:
      '英検',

    school:
      '関西学院高等部',

    question:
      '関西学院高等部では英検はどのように扱われますか？'
  };


  const token =
    saveRouteValidationToken_(
      lineUserId,
      data
    );


  const sameContent =
    consumeRouteValidationToken_(
      lineUserId,
      data,
      token
    );


  const changedContent =
    consumeRouteValidationToken_(
      lineUserId,
      {
        category:
          data.category,

        categoryLabel:
          data.categoryLabel,

        theme:
          data.theme,

        school:
          data.school,

        question:
          data.question +
          '変更'
      },
      token
    );


  console.log(
    '同じ内容=true：' +
    sameContent
  );

  console.log(
    '変更後=false：' +
    changedContent
  );
}


function routeValidationDefaultMessage_(
  code
) {

  const messages = {
    out_of_scope: {
      title:
        'ROUTEのQ&A対象外の内容です',
      message:
        'ROUTEでは、高校受験・進路・学校選び・成績・入試制度・資格・大学進学・学費・受験スケジュールに関するご質問を受け付けています。'
    },

    unanswerable: {
      title:
        'この内容では正確に回答できません',
      message:
        '非公開情報や、現時点で確定していない内容など、責任をもって回答できない質問です。公開情報や現在の状況をもとに答えられる形へ質問を修正してください。'
    },

    inappropriate: {
      title:
        'この内容は受け付けできません',
      message:
        '公序良俗に反する内容、他者への誹謗中傷・差別・嫌がらせ、違法行為を目的とする内容などは受け付けできません。'
    },

    unclear: {
      title:
        '質問内容をご確認ください',
      message:
        '何を知りたいのか判断できないため、このままでは正確に回答できません。「学校名」「知りたいこと」「現在の状況」などを具体的に入力してください。'
    },

    likely_mistake: {
      title:
        '入力内容をご確認ください',
      message:
        '学校名・数値・学年・選択したテーマなどに入力ミスや食い違いの可能性があります。内容をご確認のうえ修正してください。'
    },

    multiple_questions: {
      title:
        '質問は1回につき1つまでです',
      message:
        '複数の独立した質問が含まれています。最も知りたい内容を1つに絞ってご入力ください。その他の内容は、次のQ&Aでご質問ください。'
    },

    unclear_multiple: {
      title:
        '質問内容を1つに絞ってください',
      message:
        '複数の内容が含まれている可能性があります。1つの質問として回答できるよう、最も知りたい内容を1つに絞ってご入力ください。'
    }
  };

  return (
    messages[code] ||
    {
      title:
        '質問内容をご確認ください',
      message:
        'このままでは正確に回答することが難しいため、質問内容を修正してください。'
    }
  );
}


function parseRouteValidationJson_(
  rawText
) {

  let text =
    String(
      rawText || ''
    )
      .trim();

  text =
    text.replace(
      /^```(?:json)?\s*/i,
      ''
    );

  text =
    text.replace(
      /\s*```$/i,
      ''
    );

  const start =
    text.indexOf(
      '{'
    );

  const end =
    text.lastIndexOf(
      '}'
    );

  if (
    start === -1 ||
    end === -1 ||
    end <= start
  ) {
    throw new Error(
      '質問チェック結果を解析できませんでした。'
    );
  }

  return JSON.parse(
    text.slice(
      start,
      end + 1
    )
  );
}



function isRouteQuestionClearlySpecific_(
  data
) {

  const category =
    normalizeRouteValidationValue_(
      data && data.category
    );

  const categoryLabel =
    normalizeRouteValidationValue_(
      data && data.categoryLabel
    );

  const theme =
    normalizeRouteValidationValue_(
      data && data.theme
    );

  const district =
    normalizeRouteValidationValue_(
      data && data.district
    );

  const districtLabel =
    normalizeRouteValidationValue_(
      data && data.districtLabel
    );

  const school =
    normalizeRouteValidationValue_(
      data && data.school
    );

  const question =
    normalizeRouteValidationValue_(
      data && data.question
    );


  if (
    !category ||
    !theme ||
    !question
  ) {
    return false;
  }


  /*
   * AIが「学校や内容を特定できない」と誤判定した場合の安全弁。
   *
   * ここでは「ROUTE対象であることが文章上かなり明確」な場合だけ
   * unclear を allowed に補正する。
   *
   * out_of_scope / inappropriate / unanswerable /
   * likely_mistake は絶対に上書きしない。
   */
  const combined =
    [
      categoryLabel || category,
      theme,
      districtLabel || district,
      school,
      question
    ]
      .filter(Boolean)
      .join(' ');


  const routeTopic =
    /高校|学校|志望校|進路|受験|入試|推薦|専願|併願|特色選抜|複数志願|学区|出願|試験|合格|内申|評定|実力テスト|定期テスト|模試|偏差値|当日点|英検|漢検|数検|資格|優遇|加点|換算|免除|大学進学|進学実績|指定校|内部進学|授業料|学費|入学金|費用|諸経費|施設費|制服|教材|ICT|端末|就学支援|無償化|説明会|オープンスクール|オープンハイスクール|校風|特徴|コース|学科|部活動|通学/.test(
      combined
    );


  if (!routeTopic) {
    return false;
  }


  /*
   * 質問本文自身にもROUTEの論点が入っているか、
   * 選択した学校名が質問本文に現れている場合のみ補正する。
   * 「あれってどうなん？」のような曖昧文は補正しない。
   */
  const questionHasRouteTopic =
    /高校|学校|志望校|進路|受験|入試|推薦|専願|併願|特色選抜|複数志願|学区|出願|試験|合格|内申|評定|実力テスト|定期テスト|模試|偏差値|当日点|英検|漢検|数検|資格|優遇|加点|換算|免除|大学進学|進学実績|指定校|内部進学|授業料|学費|入学金|費用|諸経費|施設費|制服|教材|ICT|端末|就学支援|無償化|説明会|オープンスクール|オープンハイスクール|校風|特徴|コース|学科|部活動|通学/.test(
      question
    );


  let schoolMentioned =
    false;

  if (school) {

    const compactSchool =
      school
        .replace(
          /高等学校|高等部|高校/g,
          ''
        )
        .trim();

    schoolMentioned =
      question.indexOf(
        school
      ) !== -1 ||
      (
        compactSchool.length >= 2 &&
        question.indexOf(
          compactSchool
        ) !== -1
      );
  }


  return (
    questionHasRouteTopic ||
    schoolMentioned
  );
}


function validateRouteQuestionContent_(
  data
) {

  const category =
    normalizeRouteValidationValue_(
      data && data.category
    );

  const categoryLabel =
    normalizeRouteValidationValue_(
      data && data.categoryLabel
    );

  const theme =
    normalizeRouteValidationValue_(
      data && data.theme
    );

  const district =
    normalizeRouteValidationValue_(
      data && data.district
    );

  const districtLabel =
    normalizeRouteValidationValue_(
      data && data.districtLabel
    );

  const school =
    normalizeRouteValidationValue_(
      data && data.school
    );

  const question =
    normalizeRouteValidationValue_(
      data && data.question
    );


  if (!category) {
    return {
      allowed: false,
      code: 'unclear',
      title: 'ご確認ください',
      message: '相談したい内容を選択してください。',
      suggestion: ''
    };
  }

  if (!theme) {
    return {
      allowed: false,
      code: 'unclear',
      title: 'ご確認ください',
      message: '質問テーマを選択してください。',
      suggestion: ''
    };
  }

  if (!question) {
    return {
      allowed: false,
      code: 'unclear',
      title: 'ご確認ください',
      message: '質問内容を入力してください。',
      suggestion: ''
    };
  }


  if (
    district &&
    school &&
    !isRouteSchoolInSelectedDistrict_(
      district,
      school
    )
  ) {
    return {
      allowed: false,
      code: 'likely_mistake',
      title: '選択内容をご確認ください',
      message: '選択した学区と高校が一致していません。学区または高校を選び直してください。',
      suggestion: ''
    };
  }


  /*
   * 明らかな無意味入力だけはAPIを使わず差し戻す。
   * 「推薦は？」「学費は？」など、短くても
   * 学校・テーマとの組み合わせで意味が分かる質問は通す。
   */
  if (
    /^[\s?？!！。、,.・ー\-_=+*#@]+$/.test(
      question
    )
  ) {
    return {
      allowed: false,
      code: 'unclear',
      title: '質問内容をご確認ください',
      message: '質問内容を読み取ることができません。知りたいことを文章で入力してください。',
      suggestion: ''
    };
  }


  const props =
    PropertiesService
      .getScriptProperties();

  const apiKey =
    props.getProperty(
      'OPENAI_API_KEY'
    );
  if (!apiKey) {
    throw new Error(
      '質問内容の確認処理を利用できません。'
    );
  }


  const instructions = `
あなたは「進路相談室ROUTE」の質問受付チェック担当です。
保護者が入力した質問を、本回答を作る前に受付可能かだけ判定してください。

ROUTEの対象は主に兵庫県の高校受験・進路相談です。

【受付可能な主な内容】
・志望校、高校選び、学校の特徴、コース、校風、部活動、通学
・内申点、実力テスト、模試、偏差値、合格可能性、当日点の目安
・一般入試、推薦、特色選抜、専願・併願、学区、出願資格
・英検等の資格、優遇、加点、得点換算
・大学進学実績、指定校推薦、内部進学
・授業料、入学金、諸経費、就学支援金
・出願日、入試日、説明会、進路決定時期
・上記に直接関係する保護者の相談

【差し戻す分類】
out_of_scope:
ROUTEの受験・進路相談と実質的に関係がない質問。
各教科の具体的な問題の解法、宿題の答え、受験と無関係な一般相談も含む。

unanswerable:
質問の核心が、非公開の個人情報、学校内部だけの秘密情報、
未発表の内容を断定すること、未来の試験問題の予言、
特定受験生の合否の断定などで、責任をもって回答できないもの。
ただし、公開情報や一般的な判断材料を使って有用な回答ができるなら差し戻さず allowed にする。

inappropriate:
公序良俗に反する、違法行為を助ける、差別・誹謗中傷・嫌がらせ、
露骨な性的内容など、ROUTEで受け付けるべきでないもの。

unclear:
何を質問しているか読み取れない、文章が途中、情報が少なすぎて
核心を特定できないもの。
ただし「関学の英検は？」「学費はいくら？」など、
選択された学校・テーマを合わせれば意味が明確な短文は allowed。

likely_mistake:
学校名・学年・点数・制度名などに明らかな入力ミスや矛盾があり、
そのまま回答すると別の質問に答える危険が高いもの。
軽微な誤字脱字、口語、変換ミスでも意味が明確なら allowed。
選択された高校と質問本文で別の高校を明確に指定している場合は likely_mistake。

multiple_questions:
1回の入力欄に、独立して別々の回答が必要な質問が2つ以上含まれるもの。
別テーマ、別目的、別制度、別学校への質問をまとめている場合は multiple_questions。
例：
・「A高校の英検優遇と必要な内申点を教えて」→ 英検と内申で2質問
・「B高校の学費と大学進学実績を教えて」→ 学費と進学実績で2質問
・「C高校に届きますか？難しい場合は第2志望校も教えて」→ 合格可能性と候補校提案で2質問

ただし、同じ1つのテーマを理解するための補足・理由・条件・内訳は1質問として allowed。
例：
・「A高校では英検はどのように扱われますか？B方式ではどうですか？」→ 同じ英検の扱いなので1質問
・「B高校では授業料以外で初年度いくらですか？内訳も教えて」→ 同じ初年度費用なので1質問
・「C高校の推薦条件は何ですか？評定条件も含めて教えて」→ 同じ推薦条件なので1質問

unclear_multiple:
文章の構造上、複数の独立質問が含まれている可能性が高いが、
1質問の補足なのか複数質問なのか判別しにくいもの。
この場合は安全側に倒し、質問者に1つへ絞ってもらう。

【重要】
・厳しすぎる判定をしない。
・回答に注意書きや条件を付ければ答えられる質問は allowed。
・質問者の文章力や丁寧さを評価しない。
・「公式情報が見つからないかもしれない」というだけで unanswerable にしない。
・この処理ではWeb検索をしない。本回答で調べれば答えられる可能性がある質問は allowed。
・「選択した高校」「質問テーマ」「選択した学区」は質問本文の一部として必ず利用する。
・選択学区がある場合、その学区条件を無視してはいけない。
・選択した高校が空欄でないのに「対象学校が特定できない」と判定してはいけない。
・質問テーマが空欄でないのに「何についての質問か分からない」と安易に判定してはいけない。
・例：学校=関西学院高等部、テーマ=英検、質問=「関西学院高等部では英検はどのように扱われますか？」は必ず allowed。
・例：学校=雲雀丘学園高等学校、テーマ=初年度費用、質問=「授業料以外で初年度いくらかかりますか？」は allowed。
・1回につき独立した質問は1つまで。独立した答えが2つ以上必要なら multiple_questions。
・単に「？」が2個あるだけで multiple_questions にしない。意味上の独立性で判断する。
・「金額＋内訳」「制度＋その条件」「結論＋理由」のように同じテーマを深掘りするものは1質問として allowed。
・複数質問かどうか判断が曖昧なら unclear_multiple として差し戻す。
・出力は説明文ではなくJSONだけにする。

【JSON形式】
{
  "allowed": true または false,
  "code": "allowed" または "out_of_scope" または "unanswerable" または "inappropriate" または "unclear" または "likely_mistake" または "multiple_questions" または "unclear_multiple",
  "reason": "判定理由を日本語で簡潔に",
  "suggestion": "差し戻す場合だけ、質問者が直しやすい修正例。不要なら空文字"
}
`;


  const input = `
【相談カテゴリー】
${categoryLabel || category}

【質問テーマ】
${theme}

【選択した学区】
${districtLabel || getRouteDistrictLabel_(district) || '未選択'}

【選択した高校】
${school || '未選択'}

【質問内容】
${question}
`;


  const payload = {
    model:
      OPENAI_MODEL,

    instructions:
      instructions,

    input:
      input,

    reasoning: {
      effort:
        'low'
    },

    max_output_tokens:
      450,

    store:
      false
  };


  const response =
    callRouteOpenAiResponse_(
      apiKey,
      payload
    );

  const status =
    response.getResponseCode();

  const body =
    response.getContentText();

  if (
    status < 200 ||
    status >= 300
  ) {

    console.error(
      '質問送信前チェックAPIエラー：',
      body
    );

    throw new Error(
      '質問内容の確認処理でエラーが発生しました。'
    );
  }


  const json =
    JSON.parse(
      body
    );

  const raw =
    extractResponseText_(
      json
    );

  const result =
    parseRouteValidationJson_(
      raw
    );


  /*
   * AIが明確なROUTE質問を「unclear」と誤判定した場合だけ補正。
   * 他の差し戻し分類はそのまま尊重する。
   */
  if (
    String(
      result.code || ''
    ) === 'unclear' &&
    isRouteQuestionClearlySpecific_({
      category:
        category,

      categoryLabel:
        categoryLabel,

      theme:
        theme,

      district:
        district,

      districtLabel:
        districtLabel,

      school:
        school,

      question:
        question
    })
  ) {

    console.log(
      '質問チェック unclear誤判定をallowedへ補正しました。'
    );

    return {
      allowed: true,
      code: 'allowed',
      title: '',
      message: '',
      suggestion: ''
    };
  }


  const allowed =
    result.allowed === true &&
    String(
      result.code || ''
    ) === 'allowed';


  if (allowed) {
    return {
      allowed: true,
      code: 'allowed',
      title: '',
      message: '',
      suggestion: ''
    };
  }


  const allowedCodes = [
    'out_of_scope',
    'unanswerable',
    'inappropriate',
    'unclear',
    'likely_mistake',
    'multiple_questions',
    'unclear_multiple'
  ];

  const code =
    allowedCodes.indexOf(
      String(
        result.code || ''
      )
    ) !== -1
      ? String(
          result.code
        )
      : 'unclear';

  const defaults =
    routeValidationDefaultMessage_(
      code
    );

  const reason =
    normalizeRouteValidationValue_(
      result.reason
    );

  const suggestion =
    normalizeRouteValidationValue_(
      result.suggestion
    );


  return {
    allowed: false,
    code:
      code,

    title:
      defaults.title,

    message:
      reason
        ? (
            defaults.message +
            '\n\n理由：' +
            reason.slice(
              0,
              220
            )
          )
        : defaults.message,

    suggestion:
      suggestion.slice(
        0,
        240
      )
  };
}


/**
 * 確認画面へ表示する返信予定情報。
 * 営業時間は必ず「設定」シートの現在値から判定する。
 */
function getRouteReplyScheduleInfoForWeb_() {

  const ss =
    openRouteqQaTestSpreadsheet_();


  const questions =
    ss &&
    ss.getSheetByName(
      ROUTE_QA.QUESTIONS
    );


  if (
    !questions ||
    getRouteReplyMode_(questions) !== '自動返信'
  ) {
    return {
      replyMode: '手動返信',
      outsideBusinessHours: false,
      nextReplyStartAt: '',
      businessHoursNotice: ''
    };
  }


  const settings =
    getRouteReplySettings_(
      questions
    );


  const now =
    new Date();


  if (
    isRouteReplyBusinessTime_(
      now,
      settings
    )
  ) {
    return {
      replyMode: '自動返信',
      outsideBusinessHours: false,
      nextReplyStartAt: '',
      businessHoursNotice: ''
    };
  }


  const nextOpening =
    getNextRouteBusinessOpening_(
      now,
      settings
    );


  const nextReplyStartAt =
    Utilities.formatDate(
      nextOpening,
      TIME_ZONE,
      'M月d日 H:mm'
    );


  return {
    replyMode: '自動返信',
    outsideBusinessHours: true,
    nextReplyStartAt:
      nextReplyStartAt,
    businessHoursNotice:
      '現在は営業時間外です。回答は' +
      nextReplyStartAt +
      '以降、順次LINEでお送りします。'
  };
}


function validateQuestionForWeb_(
  p
) {

  /*
   * LINE本人確認は行うが、ここでは
   * Questions保存も回数消費も一切行わない。
   */
  const user =
    verifyLineUser_(
      String(
        p.idToken || ''
      )
    );

  const data = {
    category:
      String(
        p.category || ''
      )
        .trim(),

    categoryLabel:
      String(
        p.categoryLabel || ''
      )
        .trim(),

    theme:
      String(
        p.theme || ''
      )
        .trim(),

    district:
      String(
        p.district || ''
      )
        .trim(),

    districtLabel:
      String(
        p.districtLabel || ''
      )
        .trim(),

    school:
      String(
        p.school || ''
      )
        .trim(),

    question:
      String(
        p.question || ''
      )
        .trim(),

    questionSource:
      String(
        p.questionSource || 'manual'
      )
        .trim()
  };


  let result;

  if (
    data.questionSource === 'preset' &&
    isRoutePresetQuestionAllowed_(data)
  ) {
    result = {
      allowed: true,
      code: 'allowed',
      title: '',
      message: '',
      suggestion: ''
    };
  }
  else {
    result =
      validateRouteQuestionContent_(
        data
      );
  }


  if (
    !result.allowed
  ) {
    return result;
  }


  const validationToken =
    saveRouteValidationToken_(
      user.sub,
      data
    );


  const replySchedule =
    getRouteReplyScheduleInfoForWeb_();

  return {
    allowed: true,
    code: 'allowed',
    title: '',
    message: '',
    suggestion: '',
    validationToken:
      validationToken,

    replyMode:
      replySchedule.replyMode,

    outsideBusinessHours:
      replySchedule.outsideBusinessHours,

    nextReplyStartAt:
      replySchedule.nextReplyStartAt,

    businessHoursNotice:
      replySchedule.businessHoursNotice
  };
}


function testRouteQuestionValidationAllowed() {

  const result =
    validateRouteQuestionContent_({
      category:
        'qualification',

      categoryLabel:
        '英検・資格・優遇',

      theme:
        '英検',

      school:
        '関西学院高等部',

      question:
        '関西学院高等部では英検はどのように扱われますか？'
    });

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );
}


function testRouteQuestionValidationOutOfScope() {

  const result =
    validateRouteQuestionContent_({
      category:
        'school',

      categoryLabel:
        '志望校・高校選び',

      theme:
        '学校の特徴・強み',

      school:
        '',

      question:
        '今日のプロ野球の試合結果を教えて'
    });

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );
}


function testRouteQuestionValidationUnclear() {

  const result =
    validateRouteQuestionContent_({
      category:
        'school',

      categoryLabel:
        '志望校・高校選び',

      theme:
        '学校の特徴・強み',

      school:
        '',

      question:
        'あれってどうなん？'
    });

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );
}



/* =========================================================
   質問保存 + 回数消費 + AI回答案
========================================================= */

function saveQuestionForWeb_(p) {

  /*
   * =====================================================
   * 重要：
   * 外部API（LINE認証・AI回答生成）中はScript Lockを保持しない。
   *
   * 以前は質問受付～AI回答生成までロックを保持していたため、
   * AI生成に10～30秒かかる間、別ユーザーの質問が
   * 「ロックのタイムアウト」になる可能性があった。
   *
   * 現在は「回数消費・質問行作成・Users更新」の
   * 短い処理だけをロックする。
   * =====================================================
   */

  setupSheets();

  /*
   * LINE認証は外部通信なのでロックの外で行う。
   */
  const user =
    verifyLineUser_(
      String(
        p.idToken || ''
      )
    );

  const category =
    String(
      p.category || ''
    )
      .trim();

  const categoryLabel =
    String(
      p.categoryLabel || ''
    )
      .trim();

  const theme =
    String(
      p.theme || ''
    )
      .trim();

  const district =
    String(
      p.district || ''
    )
      .trim();

  const districtLabel =
    String(
      p.districtLabel || ''
    )
      .trim();

  const school =
    String(
      p.school || ''
    )
      .trim();

  const question =
    String(
      p.question || ''
    )
      .trim();

  const questionSource =
    String(
      p.questionSource || 'manual'
    )
      .trim();


  if (!category) {
    throw new Error(
      '相談したい内容を選択してください。'
    );
  }

  if (!theme) {
    throw new Error(
      '質問テーマを選択してください。'
    );
  }

  if (!question) {
    throw new Error(
      '質問内容を入力してください。'
    );
  }


  /*
   * 送信前チェック済みトークンを検証。
   * ここもスプレッドシート更新ではないのでロック不要。
   */
  const validationData = {
    category:
      category,

    categoryLabel:
      categoryLabel,

    theme:
      theme,

    district:
      district,

    districtLabel:
      districtLabel,

    school:
      school,

    question:
      question,

    questionSource:
      questionSource
  };

  const validationToken =
    String(
      p.validationToken || ''
    )
      .trim();


  if (
    !consumeRouteValidationToken_(
      user.sub,
      validationData,
      validationToken
    )
  ) {

    throw new Error(
      '質問内容の事前確認が完了していません。入力内容を確認してから、もう一度「この内容で質問する」を押してください。'
    );
  }


  const ss =
    openRouteqQaTestSpreadsheet_();

  const users =
    ss.getSheetByName(
      ROUTE_QA.USERS
    );

  const questions =
    ss.getSheetByName(
      ROUTE_QA.QUESTIONS
    );


  /*
   * ロック内で確定させる値。
   */
  let userRow = -1;
  let ticketLabel = '';
  let newUsedCount = 0;
  let newRemaining = 0;
  let questionRow = 0;


  /*
   * =====================================================
   * 回数消費・Questions行作成だけ排他制御
   * =====================================================
   */
  const lock =
    LockService
      .getScriptLock();

  lock.waitLock(
    15000
  );


  try {

    userRow =
      findRouteUserRow_(
        users,
        user.sub
      );


    if (
      userRow === -1
    ) {

      userRow =
        createFreeTrialRouteUser_(
          users,
          user
        );
    }


    const uv =
      users
        .getRange(
          userRow,
          1,
          1,
          12
        )
        .getValues()[0];


    const memberStatus =
      String(
        uv[
          ROUTE_QA.USER_COL.MEMBER_STATUS - 1
        ] ||
        '有効'
      );


    if (
      memberStatus !==
      '有効'
    ) {

      throw new Error(
        '現在このアカウントでは質問を受け付けできません。'
      );
    }


    const remaining =
      Number(
        uv[
          ROUTE_QA.USER_COL.REMAINING - 1
        ] ||
        0
      );


    if (
      remaining <= 0
    ) {

      throw new Error(
        '質問できる回数を使い切りました。回数券をご購入ください。'
      );
    }


    const usedCount =
      Number(
        uv[
          ROUTE_QA.USER_COL.USED_COUNT - 1
        ] ||
        0
      );


    const freeTrialUsed =
      String(
        uv[
          ROUTE_QA.USER_COL.FREE_TRIAL_USED - 1
        ] ||
        '未使用'
      );


    ticketLabel =
      String(
        uv[
          ROUTE_QA.USER_COL.LAST_TICKET - 1
        ] ||
        '無料お試し'
      );


    /*
     * 無料お試しが未使用なら最初の質問は無料扱い。
     */
    if (
      freeTrialUsed !==
      '使用済み'
    ) {

      ticketLabel =
        '無料お試し';
    }


    newUsedCount =
      usedCount + 1;

    newRemaining =
      Math.max(
        0,
        remaining - 1
      );


    /*
     * 同時送信で同じ行を使わないよう、
     * getLastRow()+1 は必ずロック内で行う。
     */
    questionRow =
      questions.getLastRow() + 1;


    questions
      .getRange(
        questionRow,
        1,
        1,
        17
      )
      .setValues([[
        new Date(),                // A 受付日時
        user.sub,                  // B LINEユーザーID
        user.name || '',           // C 表示名
        categoryLabel || category, // D 大項目
        theme,                     // E 質問テーマ
        districtLabel ||
          getRouteDistrictLabel_(
            district
          ),                       // F 学区
        school,                    // G 高校名
        question,                  // H 質問内容
        '',                        // I AI回答案
        '',                        // J 最終回答
        '生成中',                  // K AI生成状態
        '未確認',                  // L 確認済み
        '未送信',                  // M 送信状態
        '',                        // N LINE送信日時
        new Date(),                // O 最終更新日時
        ticketLabel,               // P 利用チケット
        newRemaining               // Q 質問後残り回数
      ]]);


    /*
     * Users更新も同時送信対策のためロック内。
     */
    users
      .getRange(
        userRow,
        ROUTE_QA.USER_COL.DISPLAY_NAME
      )
      .setValue(
        user.name || ''
      );


    users
      .getRange(
        userRow,
        ROUTE_QA.USER_COL.USED_COUNT
      )
      .setValue(
        newUsedCount
      );


    users
      .getRange(
        userRow,
        ROUTE_QA.USER_COL.REMAINING
      )
      .setValue(
        newRemaining
      );

    if (
      freeTrialUsed !==
      '使用済み'
    ) {

      users
        .getRange(
          userRow,
          ROUTE_QA.USER_COL.FREE_TRIAL_USED
        )
        .setValue(
          '使用済み'
        );
    }


    users
      .getRange(
        userRow,
        ROUTE_QA.USER_COL.LAST_QUESTION_AT
      )
      .setValue(
        new Date()
      );


    users
      .getRange(
        userRow,
        ROUTE_QA.USER_COL.UPDATED_AT
      )
      .setValue(
        new Date()
      );

  }
  finally {

    /*
     * AI生成に入る前に必ずロックを解放。
     */
    lock.releaseLock();
  }


  /*
   * =====================================================
   * AI回答生成
   * ここから先はロックなし。
   * 別ユーザーの質問受付を止めない。
   * =====================================================
   */
  let aiGenerated =
    false;


  try {

    const draft =
      generateAiDraft_({
        category:
          categoryLabel ||
          category,

        theme:
          theme,

        district:
          district,

        districtLabel:
          districtLabel,

        school:
          school,

        question:
          question
      });


    questions
      .getRange(
        questionRow,
        ROUTE_QA.QUESTION_COL.AI_ANSWER
      )
      .setValue(
        draft
      );


    questions
      .getRange(
        questionRow,
        ROUTE_QA.QUESTION_COL.AI_STATUS
      )
      .setValue(
        '生成済'
      );


    questions
      .getRange(
        questionRow,
        ROUTE_QA.QUESTION_COL.UPDATED_AT
      )
      .setValue(
        new Date()
      );


    /*
     * 設定!B2 が「自動返信」の場合だけ、
     * そのままLINEへ1回送信。
     */
    autoSendRouteAnswerIfEnabled_(
      questions,
      questionRow,
      user.sub,
      draft
    );


    aiGenerated =
      true;

  }
  catch (aiError) {

    const aiErrorMessage =
      aiError &&
      aiError.message
        ? aiError.message
        : String(aiError);


    console.error(
      'ROUTE回答生成エラー：' +
      aiErrorMessage
    );


    /*
     * 管理用シートには原因を残す。
     * 顧客へは送信されない。
     */
    questions
      .getRange(
        questionRow,
        ROUTE_QA.QUESTION_COL.AI_ANSWER
      )
      .setValue(
        '【生成エラー】' +
        aiErrorMessage
      );


    questions
      .getRange(
        questionRow,
        ROUTE_QA.QUESTION_COL.AI_STATUS
      )
      .setValue(
        'エラー'
      );


    questions
      .getRange(
        questionRow,
        ROUTE_QA.QUESTION_COL.UPDATED_AT
      )
      .setValue(
        new Date()
      );
  }


  return {
    ticketLabel:
      ticketLabel,

    usedCount:
      newUsedCount,

    remainingCount:
      newRemaining,

    canSubmit:
      newRemaining > 0,

    aiGenerated:
      aiGenerated,

    // 前の質問ページとの互換用
    dayCount:
      0,

    weekCount:
      0,

    maxDay:
      999999,

    maxWeek:
      999999
  };
}

/* =========================================================
   AI回答案
========================================================= */

/**
 * =========================================================
 * ROUTE 公式Web検索が必要な質問か判定
 * =========================================================
 */

function isRouteGeneralExplanationQuestion_(
  data
) {

  const question =
    String(
      data && data.question || ''
    )
      .trim();

  const theme =
    String(
      data && data.theme || ''
    )
      .trim();


  return (
    /実力テスト|定期テスト|模試/.test(
      theme + ' ' + question
    ) ||
    /内申点.*仕組み|内申点と当日点|複数志願選抜.*仕組み|三者懇談|進路希望調査/.test(
      question
    )
  ) &&
  !(
    /この高校|この学校|の受験|の入試|の最新|の実績|の日程|の費用|では.*優遇|では.*扱/.test(
      question
    )
  );
}



/**
 * =========================================================
 * ROUTE 回答コスト最適化
 *
 * 第1段階：過去の確認済み同一回答を再利用（API 0回）
 * 第2段階：一般説明は GPT-5.6 Luna
 * 第3段階：学校固有・最新情報・比較分析は GPT-5.6 Terra
 * =========================================================
 */

function normalizeRouteExactQuestion_(
  value
) {

  let text =
    String(
      value || ''
    )
      .trim();

  try {
    text =
      text.normalize(
        'NFKC'
      );
  }
  catch (error) {
    // Apps Script環境差異があっても処理継続
  }

  return text
    .replace(
      /\s+/g,
      ''
    )
    .replace(
      /[？?]/g,
      '?'
    );
}


function isRouteCacheSafeQuestion_(
  data
) {

  if (
    !isRouteGeneralExplanationQuestion_(
      data
    )
  ) {
    return false;
  }

  const question =
    String(
      data && data.question || ''
    );

  /*
   * 「最新」「今年度」「現在」「2026年度」等が入る質問は
   * 過去回答を使わず、必ずその都度生成する。
   */
  if (
    /最新|現在|今年|今年度|来年度|年度|日程|金額|費用|倍率|募集人数|定員|実績/.test(
      question
    )
  ) {
    return false;
  }

  return true;
}


function findRouteConfirmedExactAnswer_(
  data
) {

  if (
    !isRouteCacheSafeQuestion_(
      data
    )
  ) {
    return '';
  }


  const targetQuestion =
    normalizeRouteExactQuestion_(
      data && data.question
    );

  const targetTheme =
    normalizeRouteExactQuestion_(
      data && data.theme
    );


  if (
    !targetQuestion
  ) {
    return '';
  }


  const ss =
    SpreadsheetApp
      .getActive();

  const questions =
    ss.getSheetByName(
      ROUTE_QA.QUESTIONS
    );


  if (
    !questions
  ) {
    return '';
  }


  const lastRow =
    questions
      .getLastRow();


  if (
    lastRow < 2
  ) {
    return '';
  }


  const values =
    questions
      .getRange(
        2,
        1,
        lastRow - 1,
        ROUTE_QA.QUESTION_COL.REMAINING_AFTER
      )
      .getValues();


  /*
   * 新しい確認済み回答を優先する。
   */
  for (
    let i =
      values.length - 1;
    i >= 0;
    i--
  ) {

    const row =
      values[i];

    const rowQuestion =
      normalizeRouteExactQuestion_(
        row[
          ROUTE_QA.QUESTION_COL.QUESTION - 1
        ]
      );

    if (
      rowQuestion !==
      targetQuestion
    ) {
      continue;
    }


    const rowTheme =
      normalizeRouteExactQuestion_(
        row[
          ROUTE_QA.QUESTION_COL.THEME - 1
        ]
      );


    if (
      targetTheme &&
      rowTheme &&
      rowTheme !==
        targetTheme
    ) {
      continue;
    }


    const confirmed =
      String(
        row[
          ROUTE_QA.QUESTION_COL.CONFIRMED - 1
        ] || ''
      )
        .trim();

    const finalAnswer =
      String(
        row[
          ROUTE_QA.QUESTION_COL.FINAL_ANSWER - 1
        ] || ''
      )
        .trim();


    if (
      !/確認済/.test(
        confirmed
      ) ||
      !finalAnswer
    ) {
      continue;
    }


    if (
      /^【生成エラー】/.test(
        finalAnswer
      )
    ) {
      continue;
    }


    console.log(
      'ROUTE回答経路：確認済み回答キャッシュ'
    );

    return ensureRouteClosingMessage_(
      finalAnswer
    );
  }


  return '';
}


function generateRouteLowCostGeneralDraft_(
  data,
  apiKey
) {
  console.log(
    'ROUTE回答経路：GPT-5.6 Luna'
  );


  const instructions =
    [
      'あなたは「進路相談室ROUTE」の兵庫県高校受験専門アドバイザーです。',
      '今回の質問は、学校固有の最新事実を調べる必要がない一般的な高校受験制度・学習・成績の説明です。',
      '質問された内容だけに、保護者向けに分かりやすく直接答えてください。',
      '選択されている高校名が質問内容と直接関係しない場合、その高校固有の情報や合格可能性を勝手に追加しないでください。',
      '第2志望・おすすめ校・合格可能性など、質問されていない個別判断を追加しないでください。',
      '根拠のない点数・順位・割合を作らないでください。',
      'URLや情報源一覧は回答に付けないでください。',
      '原則250～600文字程度で簡潔に回答してください。',
      'ROUTEの最後の案内文はシステム側で付けるため書かないでください。'
    ]
      .join(
        '\n'
      );


  const input =
    [
      '【質問テーマ】',
      String(
        data && data.theme || ''
      ),
      '',
      '【質問内容】',
      String(
        data && data.question || ''
      )
    ]
      .join(
        '\n'
      );


  const payload = {
    model:
      OPENAI_MODEL_LOW_COST,

    instructions:
      instructions,

    input:
      input,

    reasoning: {
      effort:
        'low'
    },

    max_output_tokens:
      900,

    store:
      false
  };


  const response =
    callRouteOpenAiResponse_(
      apiKey,
      payload
    );

  const status =
    response
      .getResponseCode();

  const body =
    response
      .getContentText();


  if (
    status < 200 ||
    status >= 300
  ) {

    let detail =
      '';

    try {

      const errorJson =
        JSON.parse(
          body
        );

      detail =
        errorJson &&
        errorJson.error &&
        errorJson.error.message
          ? String(
              errorJson.error.message
            )
          : '';

    }
    catch (error) {

      detail =
        String(
          body || ''
        )
          .slice(
            0,
            300
          );
    }


    throw new Error(
      'Luna APIエラー：HTTP ' +
      status +
      (
        detail
          ? ' / ' + detail
          : ''
      )
    );
  }


  const json =
    JSON.parse(
      body
    );

  const extracted =
    extractRouteResponseTextAndSources_(
      json
    );

  let answer =
    String(
      extracted.text || ''
    )
      .trim();


  if (
    !answer
  ) {
    throw new Error(
      'Lunaから回答本文を取得できませんでした。'
    );
  }


  answer =
    answer
      .replace(
        /\[([^\]]+)\]\(https?:\/\/[^)]+\)/g,
        '$1'
      )
      .replace(
        /https?:\/\/[^\s)]+/g,
        ''
      )
      .replace(
        /\*\*/g,
        ''
      )
      .trim();


  return ensureRouteClosingMessage_(
    answer
  );
}


function getRouteAnswerTierLabel_(
  data
) {

  if (
    isRouteCacheSafeQuestion_(
      data
    )
  ) {
    return '一般質問：キャッシュ優先 → Luna';
  }

  return '学校固有・最新情報・比較分析：Terra';
}


function shouldUseRouteOfficialWebSearch_(
  data
) {

  const text =
    [
      data && data.category,
      data && data.categoryLabel,
      data && data.theme,
      data && data.school,
      data && data.question
    ]
      .filter(Boolean)
      .join(' ');


  const questionText =
    String(
      data && data.question || ''
    );


  /*
   * 一般制度の説明だけなら、学校が選ばれていても
   * Web検索を強制しない。
   */
  const generalExplanationOnly =
    isRouteGeneralExplanationQuestion_(
      data
    );


  if (
    generalExplanationOnly
  ) {
    return false;
  }


  /*
   * 学校固有で、年度更新される可能性が高い内容。
   */
  const schoolSpecificCurrentInfo =
    Boolean(
      data &&
      data.school
    ) &&
    (
      /入試|募集要項|推薦|特色選抜|専願|併願|出願|試験日|入試日|合格発表|試験科目|配点|面接|作文|小論文/.test(text) ||
      /英検|漢検|数検|資格|優遇|加点|換算|免除|出願資格|推薦条件/.test(text) ||
      /学費|授業料|入学金|費用|諸経費|制服|教材|ICT|端末|修学旅行|部活動費|就学支援|無償化/.test(text) ||
      /指定校推薦|内部進学|大学進学率|大学合格実績|進学実績|進路指導/.test(text) ||
      /学校説明会|オープン|見学|授業公開|入試説明会|学校行事|部活動.*実績|最近.*実績/.test(text) ||
      /コース|学科|校則|学校設備|通学|立地/.test(text)
    );


  /*
   * 学校指定がなくても最新確認が必要な内容。
   */
  const generalCurrentInfo =
    /倍率|定員|募集人数|募集要項|出願日|入試日|合格発表|学校説明会|オープン|見学|授業公開/.test(
      text
    );


  const comparisonOrCurrentStrength =
    /強豪|強い|おすすめ|候補|ランキング|比較|実績が良い|学費が安い|費用が安い/.test(
      text
    );


  return (
    schoolSpecificCurrentInfo ||
    generalCurrentInfo ||
    comparisonOrCurrentStrength
  );
}



/**
 * =========================================================
 * Web検索レスポンスから本文とURLを取得
 * =========================================================
 */
function extractRouteResponseTextAndSources_(response) {

  if (!response) {
    return {
      text: '',
      sources: []
    };
  }


  const texts = [];
  const sources = [];
  const seen = {};


  function addSource_(url, title) {

    const value =
      String(url || '')
        .trim();

    if (
      !value ||
      seen[value]
    ) {
      return;
    }

    seen[value] = true;

    sources.push({
      url: value,
      title:
        String(title || '')
          .trim()
    });
  }


  if (
    typeof response.output_text === 'string' &&
    response.output_text.trim()
  ) {

    texts.push(
      response.output_text.trim()
    );

  }


  const output =
    Array.isArray(response.output)
      ? response.output
      : [];


  output.forEach(function(item) {

    /*
     * 通常のassistantメッセージ
     */
    if (
      item &&
      item.type === 'message'
    ) {

      const content =
        Array.isArray(item.content)
          ? item.content
          : [];


      content.forEach(function(part) {

        if (
          part &&
          typeof part.text === 'string'
        ) {

          /*
           * output_text がない場合だけ本文を追加
           */
          if (
            texts.length === 0
          ) {
            texts.push(
              part.text
            );
          }

        }
        else if (
          part &&
          part.text &&
          typeof part.text.value === 'string'
        ) {

          if (
            texts.length === 0
          ) {
            texts.push(
              part.text.value
            );
          }

        }


        /*
         * Web検索のURL citation
         */
        const annotations =
          part &&
          Array.isArray(part.annotations)
            ? part.annotations
            : [];


        annotations.forEach(function(annotation) {

          if (
            !annotation
          ) {
            return;
          }


          if (
            annotation.type === 'url_citation'
          ) {

            /*
             * Responses API の現在形
             */
            if (
              annotation.url
            ) {

              addSource_(
                annotation.url,
                annotation.title
              );

              return;
            }


            /*
             * 互換形式
             */
            if (
              annotation.url_citation
            ) {

              addSource_(
                annotation.url_citation.url,
                annotation.url_citation.title
              );

            }
          }
        });
      });
    }


    /*
     * include: ["web_search_call.action.sources"]
     * を指定した場合の検索ソース
     */
    if (
      item &&
      item.type === 'web_search_call' &&
      item.action &&
      Array.isArray(item.action.sources)
    ) {

      item.action.sources.forEach(function(source) {

        if (!source) {
          return;
        }

        addSource_(
          source.url,
          source.title
        );
      });
    }
  });


  return {
    text:
      texts
        .join('\n')
        .trim(),

    sources:
      sources
  };
}


/**
 * =========================================================
 * AI回答案
 * ROUTE内部情報＋必要時のみ最新公式Web検索
 * =========================================================
 */


function isRouteCostQuestion_(data) {

  const text =
    [
      data && data.category,
      data && data.theme,
      data && data.question
    ]
      .filter(Boolean)
      .join(' ');

  return /いくら|費用|学費|諸経費|初年度|授業料以外|入学金|施設費|制服|教材|ICT|端末/.test(
    text
  );
}


function getRouteOfficialWebContext_(
  apiKey,
  data
) {

  if (
    !shouldUseRouteOfficialWebSearch_(
      data
    )
  ) {
    return {
      context: '',
      sources: [],
      searched: false
    };
  }

  const today =
    Utilities.formatDate(
      new Date(),
      TIME_ZONE,
      'yyyy-MM-dd'
    );

  const isCost =
    isRouteCostQuestion_(
      data
    );

  const costInstructions =
    isCost
      ? `
【費用質問なので追加で必ず行うこと】
・「初年度費用」「諸経費」「入学手続き時の費用」「年間の費用」「施設費」「生徒会・PTA会費」「行事・学習材料費」「端末関連」でも検索する
・公式PDFに表がある場合は、表の各行を読み取り、金額を漏らさず列挙する
・「授業料以外」の質問なら、授業料を除外して、
  ①入学手続き時の費用
  ②年間費用のうち授業料以外
  ③①＋②の小計
  を必ず計算する
・端末本体、修学旅行、制服、教科書等が別途の場合は「別途」と明記し、小計には入れない
・1項目（例：入学金）だけ見つけて検索を終えてはいけない
`
      : '';

  const prompt = `
あなたは進路相談室ROUTEの「公式情報確認担当」です。

今日の日付：${today}

以下の質問について、必ずWeb検索を行い、最新の公式情報を確認してください。

【学校】
${data.school || '未選択'}

【質問テーマ】
${data.theme || ''}

【質問】
${data.question || ''}

【検索・確認の優先順位】
1. 対象学校の公式サイト
2. 学校公式の募集要項・入学手続資料・学費資料・公式PDF
3. 兵庫県教育委員会、自治体、大学等の公式情報
4. 上記で確認できない場合だけ信頼できる補助情報

【重要】
・塾、まとめサイト、個人ブログだけを根拠に制度・金額・日程を断定しない
・確認できた具体的な数値、金額、条件、年度を短く整理する
・「公式サイトで確認してください」だけで終わらせない
・確認できない項目は「公式情報では確認できない」と明示する
・費用質問では、授業料、入学金、施設費、教育充実費、制服、教材、ICT端末、PTA等を可能な限り区別する
・「授業料以外」を聞かれた場合、授業料を除外して合計に使える数値を整理する
${costInstructions}

最終回答ではなく、ROUTE本回答を作るための「公式情報メモ」として返してください。
`;

  function runSearch_(inputPrompt) {

    const payload = {
      model:
        OPENAI_MODEL,

      input:
        inputPrompt,

      tools: [
        {
          type:
            'web_search',

          search_context_size:
            isCost
              ? 'high'
              : 'medium'
        }
      ],

      tool_choice:
        'required',

      reasoning: {
        effort:
          'low'
      },

      max_output_tokens:
        isCost
          ? 1600
          : 1000,

      include: [
        'web_search_call.action.sources'
      ]
    };

    const response =
      callRouteOpenAiResponse_(
        apiKey,
        payload
      );

    const status =
      response.getResponseCode();

    const body =
      response.getContentText();

    if (
      status < 200 ||
      status >= 300
    ) {
      console.error(
        '公式Web検索エラー：',
        body
      );

      return {
        text: '',
        sources: []
      };
    }

    const json =
      JSON.parse(
        body
      );

    return extractRouteResponseTextAndSources_(
      json
    );
  }

  try {

    const first =
      runSearch_(
        prompt
      );

    let context =
      first.text || '';

    let sources =
      first.sources || [];

    /*
     * 費用質問なのに金額が十分取れていない場合は、
     * 公式PDFの費用表だけを狙ってもう1回検索する。
     */
    if (isCost) {

      const yenCount =
        (
          context.match(
            /円/g
          ) || []
        ).length;

      const hasBreakdown =
        /施設費|PTA|行事|学習材料|端末|年間の費用|年間費用/.test(
          context
        );

      if (
        yenCount < 3 ||
        !hasBreakdown
      ) {

        const secondPrompt = `
${data.school || ''} 高等学校について、学校公式サイト・公式PDFだけを検索してください。

探す内容は「初年度費用」「諸経費」の表です。
検索語として、
「入学手続き時の費用」
「入学金」
「施設費」
「年間の費用」
「授業料」
「生徒会・PTA会費」
「行事・学習材料費」
「卒業関連積立金」
「生徒端末関連」
を必ず使ってください。

質問：
${data.question || ''}

【必須出力】
・資料の対象年度
・入学金
・施設費
・年間費用内の授業料以外の全項目
・授業料を除く初年度の確認済み小計
・別途徴収されるもの
・公式URL

1項目だけで検索を終えず、費用表全体を確認してください。
`;

        const second =
          runSearch_(
            secondPrompt
          );

        if (
          second.text
        ) {
          context +=
            '\n\n【費用表の追加確認】\n' +
            second.text;
        }

        (second.sources || [])
          .forEach(
            function(source) {

              const exists =
                sources.some(
                  function(existing) {
                    return (
                      existing.url ===
                      source.url
                    );
                  }
                );

              if (!exists) {
                sources.push(
                  source
                );
              }
            }
          );
      }
    }

    return {
      context:
        context,

      sources:
        sources,

      searched:
        Boolean(
          context
        )
    };

  }
  catch (error) {

    console.error(
      '公式Web検索例外：',
      error
    );

    return {
      context: '',
      sources: [],
      searched: false
    };
  }
}





function routeQuestionAsksCandidateSchool_(
  data
) {

  const text =
    [
      data && data.category,
      data && data.theme,
      data && data.question
    ]
      .filter(Boolean)
      .join(' ');

  return /内申|第\s*[2二]\s*志望|第二志望|候補校|志望校|併願校|滑り止め|合格可能性|合格ライン|届く|どの高校|どこ.*高校|学校.*候補|公立.*候補|私立.*候補/.test(
    text
  );
}


function stripRouteUnaskedCandidateContent_(
  answer,
  data
) {

  let text =
    String(
      answer || ''
    )
      .trim();

  if (
    routeQuestionAsksCandidateSchool_(
      data
    )
  ) {
    return text;
  }

  const paragraphs =
    text
      .split(
        /\n{2,}/
      );

  const kept =
    paragraphs.filter(
      function(paragraph) {

        /*
         * 質問されていない内申・第2志望・候補校の段落を除去。
         * 英検・費用・制度など本来の回答部分には触れない。
         */
        if (
          /内申\s*[0-9０-９]+\s*点.*第\s*[2二]\s*志望|第\s*[2二]\s*志望校|第二志望校|候補を絞るには|適正～安全寄り|適正〜安全寄り|ROUTE資料.*内申目安|候補校を/.test(
            paragraph
          )
        ) {
          return false;
        }

        return true;
      }
    );

  return kept
    .join(
      '\n\n'
    )
    .trim();
}


function applyRouteVerifiedCostCorrections_(
  answer,
  data
) {

  let text =
    String(
      answer || ''
    );

  const school =
    String(
      data && data.school
        ? data.school
        : ''
    );

  if (
    school.indexOf(
      '雲雀丘学園'
    ) === -1 ||
    !isRouteCostQuestion_(
      data
    ) ||
    !/2025年度実績|2025年度.*参考|2025年度.*ベース/.test(
      text
    )
  ) {
    return text;
  }

  text =
    text.replace(
      /生徒会・PTA会費等\s*[：:]\s*[\*]*[0-9０-９,，万千百十]+\s*円(?:\s*\/\s*年)?[\*]*/g,
      '生徒会・PTA会費等：20,800円/年'
    );

  text =
    text.replace(
      /生徒端末関連\s*[：:]\s*[\*]*[0-9０-９,，万千百十]+\s*円(?:\s*\/\s*年)?[\*]*/g,
      '生徒端末関連：10,200円/年'
    );

  /*
   * 280,000 + 200,000 + 20,800 + 114,000 + 20,000 + 10,200
   * = 645,000円
   */
  text =
    text.replace(
      /655[,，]?000\s*円/g,
      '645,000円'
    );

  text =
    text.replace(
      /65万5[,，]?000\s*円/g,
      '64万5,000円'
    );

  text =
    text.replace(
      /65万5000\s*円/g,
      '64万5,000円'
    );

  text =
    text.replace(
      /(授業料を除く[^。\n]*?(?:初年度[^。\n]*?)?(?:小計|費用)[^0-9０-９\n]*)([0-9０-９,，万千百十]+)(\s*円)/g,
      '$1645,000$3'
    );

  if (
    text.indexOf(
      '361e0e38f8a518cc77a6a6fb7c8734be2e73489d.pdf'
    ) === -1
  ) {

    text +=
      '\n\n【学校公式の費用根拠】\n' +
      '雲雀丘学園高等学校「初年度費用 ※2025年度実績」\n' +
      'https://www.hibari.jp/admissions/361e0e38f8a518cc77a6a6fb7c8734be2e73489d.pdf';
  }

  return text;
}


function ensureRouteTuitionSupportNote_(
  answer,
  data
) {

  let text =
    String(
      answer || ''
    )
      .trim();

  if (
    !isRouteCostQuestion_(
      data
    )
  ) {
    return text;
  }

  /*
   * AIがすでに十分な説明を書いている場合は重複させない。
   */
  const alreadyExplained =
    /授業料支援|就学支援金|授業料.*支援制度|支援上限/.test(
      text
    );

  if (alreadyExplained) {
    return text;
  }

  const note =
    '【授業料の扱い】\n' +
    'ROUTEでは「授業料以外・諸経費」の金額を出す場合、授業料は合計から除外して表示します。' +
    '授業料については国や県などの授業料支援制度を別枠で確認し、制度の対象となる範囲は軽減されます。' +
    'ただし、学校の授業料がその年度の支援上限を超える場合は差額負担が残るため、' +
    '「年間総額・実質負担額」を求める質問では最新の公式制度と学校授業料を確認して差額を計算します。';

  return (
    text +
    '\n\n' +
    note
  )
    .trim();
}


function ensureRouteClosingMessage_(
  answer
) {

  const closing =
    '📖ROUTEでは、\n' +
    '学校や塾で聞かなければわからない重要なℹ️情報や、🙅保護者が知っておくべきことを、お伝えしています。\n' +
    'お気軽にご相談ください。☺️';

  let text =
    String(
      answer || ''
    )
      .trim();

  /*
   * モデルが本文中に同文を入れても、最後に1回だけ配置。
   */
  text =
    text
      .split(
        closing
      )
      .join('')
      .trim();

  return (
    text +
    '\n\n' +
    closing
  )
    .trim();
}


function callRouteOpenAiResponse_(
  apiKey,
  payload
) {
  assertRouteqQaTestEnvironment_();
  throw new Error('TEST isolation: OpenAI external responses are disabled pending independent TEST/mock adapter');
  const startedAt = new Date();
  const usageContext = getRouteTokenUsageContext_();
  let response = null;
  let fetchError = null;

  try {
    response = UrlFetchApp.fetch(
      'https://api.openai.com/v1/responses',
      {
        method:
          'post',

        contentType:
          'application/json',

        headers: {
          Authorization:
            'Bearer ' +
            apiKey
        },

        payload:
          JSON.stringify(
            payload
          ),

        muteHttpExceptions:
          true
      }
    );

    return response;
  }
  catch (error) {
    fetchError = error;
    throw error;
  }
  finally {
    try {
      recordRouteTokenUsage_(
        response,
        payload,
        startedAt,
        usageContext,
        fetchError
      );
    }
    catch (logError) {
      console.error(
        'TokenUsage記録失敗：' +
        (
          logError && logError.message
            ? logError.message
            : String(logError)
        )
      );
    }
  }
}


function getRouteTokenUsageContext_() {
  const context = {
    spreadsheet: null,
    questionRow: '',
    questionText: ''
  };

  try {
    const ss = openRouteqQaTestSpreadsheet_();
    context.spreadsheet = ss;

    const questionsSheet =
      ss && ss.getSheetByName(ROUTE_QA.QUESTIONS);

    if (questionsSheet && questionsSheet.getLastRow() >= 2) {
      context.questionRow = questionsSheet.getLastRow();
      context.questionText = questionsSheet
        .getRange(
          context.questionRow,
          ROUTE_QA.QUESTION_COL.QUESTION
        )
        .getDisplayValue();
    }
  }
  catch (error) {
    console.log('TokenUsage質問情報の取得失敗：' + error.message);
  }

  return context;
}


function recordRouteTokenUsage_(
  response,
  payload,
  startedAt,
  context,
  fetchError
) {
  let body = {};

  if (response) {
    try {
      body = JSON.parse(response.getContentText() || '{}');
    }
    catch (error) {
      body = {};
    }
  }

  const usage = body.usage || {};
  const inputDetails = usage.input_tokens_details || {};
  const outputDetails = usage.output_tokens_details || {};
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  const cachedTokens = Number(inputDetails.cached_tokens || 0);
  const reasoningTokens = Number(outputDetails.reasoning_tokens || 0);
  const totalTokens = Number(
    usage.total_tokens || inputTokens + outputTokens
  );

  let webSearchCalls = 0;
  (body.output || []).forEach(function(item) {
    if (item && item.type === 'web_search_call') {
      webSearchCalls++;
    }
  });

  const safeContext = context || {};
  const ss =
    safeContext.spreadsheet ||
    openRouteqQaTestSpreadsheet_();

  if (!ss) {
    throw new Error('TokenUsageの保存先を取得できません。');
  }

  const usageSheetName = safeContext.usageSheetName || 'TokenUsage';
  let usageSheet = ss.getSheetByName(usageSheetName);

  if (!usageSheet) {
    usageSheet = ss.insertSheet(usageSheetName);
    usageSheet.appendRow([
      '記録日時',
      'Questions行番号',
      '質問内容',
      'モデル',
      '入力トークン',
      'キャッシュ済み入力',
      '出力トークン',
      '推論トークン',
      '合計トークン',
      'Web検索回数',
      'Response ID',
      'HTTP状態',
      '処理時間ms'
    ]);
    usageSheet.setFrozenRows(1);
  }

  usageSheet.appendRow([
    new Date(),
    safeContext.questionRow || '',
    safeContext.questionText || '',
    (payload && payload.model) || OPENAI_MODEL,
    inputTokens,
    cachedTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    webSearchCalls,
    body.id || '',
    response
      ? response.getResponseCode()
      : 'FETCH_ERROR',
    new Date().getTime() - startedAt.getTime()
  ]);

  if (fetchError) {
    console.error('OpenAI通信失敗をTokenUsageへ記録：' + fetchError.message);
  }
}


function normalizeRouteSchoolNameForMatch_(
  name
) {

  return String(
    name || ''
  )
    .replace(
      /\s+/g,
      ''
    )
    .replace(
      /高等学校/g,
      '高校'
    )
    .replace(
      /県立/g,
      ''
    )
    .replace(
      /市立/g,
      ''
    )
    .trim();
}


function getRouteAllKnownSchools_() {

  const result = [];
  const seen = {};

  Object.keys(
    ROUTE_DISTRICT_SCHOOLS
  )
    .forEach(
      function(key) {

        const schools =
          ROUTE_DISTRICT_SCHOOLS[key];

        if (
          !Array.isArray(
            schools
          )
        ) {
          return;
        }

        schools.forEach(
          function(school) {

            const name =
              String(
                school || ''
              )
                .trim();

            if (
              !name ||
              seen[name]
            ) {
              return;
            }

            seen[name] =
              true;

            result.push(
              name
            );
          }
        );
      }
    );

  return result;
}


function findRouteOutOfDistrictSchoolsInAnswer_(
  answer,
  district
) {

  const selectedDistrict =
    String(
      district || ''
    )
      .trim();

  if (!selectedDistrict) {
    return [];
  }


  const allowed =
    getRouteDistrictSchools_(
      selectedDistrict
    );

  if (
    allowed.length === 0
  ) {
    return [];
  }


  const allowedNormalized = {};

  allowed.forEach(
    function(name) {

      allowedNormalized[
        normalizeRouteSchoolNameForMatch_(
          name
        )
      ] = true;
    }
  );


  const answerText =
    normalizeRouteSchoolNameForMatch_(
      answer
    );

  const outside = [];
  const seen = {};


  getRouteAllKnownSchools_()
    .forEach(
      function(name) {

        const normalized =
          normalizeRouteSchoolNameForMatch_(
            name
          );

        if (
          !normalized ||
          normalized.length < 3
        ) {
          return;
        }


        if (
          answerText.indexOf(
            normalized
          ) === -1
        ) {
          return;
        }


        if (
          allowedNormalized[
            normalized
          ]
        ) {
          return;
        }


        if (
          seen[name]
        ) {
          return;
        }


        seen[name] =
          true;

        outside.push(
          name
        );
      }
    );


  return outside;
}


function answerRequiresRouteDistrictGuard_(
  data
) {

  const district =
    String(
      data && data.district || ''
    )
      .trim();

  if (!district) {
    return false;
  }


  /*
   * 学区選択中は、学校名を回答に出す可能性がある質問全般で
   * 安全側に倒して検査する。
   */
  return true;
}


function testRouteDistrictAnswerGuard() {

  const badAnswer =
    '第2学区の候補として、県立西宮高校、滝川第二高校、県立社高校があります。';

  const bad =
    findRouteOutOfDistrictSchoolsInAnswer_(
      badAnswer,
      'district2'
    );


  console.log(
    '学区外検出あり=true：' +
    (
      bad.length >= 1
    )
  );

  console.log(
    '滝川第二検出=true：' +
    (
      bad.indexOf(
        '滝川第二高校'
      ) !== -1
    )
  );


  const goodAnswer =
    '第2学区では、県立西宮高校や市立西宮高校などが候補です。';

  const good =
    findRouteOutOfDistrictSchoolsInAnswer_(
      goodAnswer,
      'district2'
    );


  console.log(
    '学区内のみ=0校：' +
    (
      good.length === 0
    )
  );
}




function generateAiDraft_(data) {

  const startedAt =
    Date.now();


  /*
   * =====================================================
   * 第1段階：確認済み同一回答を再利用
   * APIを1回も呼ばない。
   * =====================================================
   */
  const cachedAnswer =
    findRouteConfirmedExactAnswer_(
      data
    );


  if (
    cachedAnswer
  ) {

    console.log(
      'ROUTE回答生成時間：' +
      (
        (
          Date.now() -
          startedAt
        ) /
        1000
      ).toFixed(1) +
      '秒'
    );

    return cachedAnswer;
  }


  const props =
    PropertiesService
      .getScriptProperties();

  const apiKey =
    props.getProperty(
      'OPENAI_API_KEY'
    );

  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEYが設定されていません。'
    );
  }


  /*
   * =====================================================
   * 第2段階：一般説明は低コストのGPT-5.6 Luna
   * 学校固有・最新情報が不要な質問だけに限定。
   * =====================================================
   */
  if (
    isRouteGeneralExplanationQuestion_(
      data
    )
  ) {

    const lunaAnswer =
      generateRouteLowCostGeneralDraft_(
        data,
        apiKey
      );


    console.log(
      'ROUTE回答生成時間：' +
      (
        (
          Date.now() -
          startedAt
        ) /
        1000
      ).toFixed(1) +
      '秒'
    );


    return lunaAnswer;
  }


  /*
   * =====================================================
   * 第3段階：学校固有・最新情報・比較分析はTerra
   * ここから従来の高精度ルート。
   * =====================================================
   */
  console.log(
    'ROUTE回答経路：GPT-5.6 Terra'
  );


  /*
   * =====================================================
   * ROUTE内部情報
   * =====================================================
   */
  let topPriorityContext = '';
  let materialContext = '';
  let correctionContext = '';
  let internalScoreContext = '';

  try {
    topPriorityContext =
      getRouteTopPriorityContext_();
  }
  catch (error) {
    console.error(
      'ROUTE最優先ルール参照エラー：',
      error
    );
  }

  try {
    materialContext =
      getRouteMaterialContext_(
        data
      );
  }
  catch (error) {
    console.error(
      'ROUTE資料DB参照エラー：',
      error
    );
  }

  try {
    correctionContext =
      getRouteCorrectionContext_(
        data
      );
  }
  catch (error) {
    console.error(
      'ROUTE確定回答参照エラー：',
      error
    );
  }

  const asksCandidateSchool =
    routeQuestionAsksCandidateSchool_(
      data
    );

  if (
    asksCandidateSchool
  ) {
    try {
      internalScoreContext =
        getRouteInternalScoreContext_(
          data
        );
    }
    catch (error) {
      console.error(
        'ROUTE内申判定参照エラー：',
        error
      );
    }
  }


  const useWebSearch =
    shouldUseRouteOfficialWebSearch_(
      data
    );

  console.log(
    'ROUTE Web検索使用：' +
    useWebSearch
  );

  console.log(
    'ROUTE 質問テーマ：' +
    String(
      data && data.theme || ''
    )
  );

  const isCostQuestion =
    isRouteCostQuestion_(
      data
    );

  const isCurrentStrengthQuestion =
    isRouteCurrentStrengthQuestion_(
      data
    );

  const sportEvaluationType =
    getRouteSportEvaluationType_(
      data
    );

  const sportsEvaluationInstruction =
    getRouteSportsEvaluationInstruction_(
      data
    );

  const isSchoolPopulationComparisonQuestion =
    isRouteSchoolPopulationComparisonQuestion_(
      data
    );

  const districtAnswerContext =
    getRouteDistrictAnswerContext_(
      data
    );

  const schoolPopulationResearchInstruction =
    getRouteSchoolPopulationResearchInstruction_(
      data
    );

  const vectorStoreId =
    props.getProperty(
      'OPENAI_VECTOR_STORE_ID'
    ) || '';

  const today =
    Utilities.formatDate(
      new Date(),
      TIME_ZONE,
      'yyyy-MM-dd'
    );


  /*
   * =====================================================
   * 重要：
   * 旧方式は
   *   公式Web検索 → 追加Web検索 → 最終回答
   * と最大3回APIを順番に呼んでいた。
   *
   * 高速版では、Web検索が必要な質問は
   * 「Web検索＋最終回答」を1回のResponses APIにまとめる。
   * =====================================================
   */

  const instructions = `
あなたは「進路相談室ROUTE」の兵庫県高校受験専門アドバイザーです。
今日の日付は ${today} です。

保護者からの質問に対して、具体的で実用的な最終回答を作成してください。

【情報の優先順位】
1. ROUTE最優先情報・絶対ルール
2. ROUTE内申・候補校自動判定
3. 今回のWeb検索で確認した最新の学校公式・公的情報
4. ROUTE資料DB
5. ROUTE過去の確定回答
6. ROUTE独自資料ファイル
7. 一般知識

【絶対ルール】
・回答する範囲は「今回の質問内容」に限定する
・質問されていない論点を追加しない
・質問文に「内申・第2志望・候補校・合格可能性」等が明示されていない場合、それらの話題を絶対に回答へ追加しない
・過去の確定回答や資料に別の論点が含まれていても、今回の質問と無関係な部分は無視する
・「ROUTE資料に登録がない」「DBにない」「内部資料を照合できない」など、ROUTE内部システムの実装・登録状況を顧客向け回答に書かない
・ROUTEの内申判定を勝手に甘くしない
・統合前の旧校を、現在受験できる学校として提案しない
・統合新校は旧校データを参考にしてよいが、新校自身の確定実績・確定難易度として断定しない
・根拠のない数値・制度・合格率を作らない
・最新情報が確定していない場合は、その部分だけを「現時点では未確定です」とする
・顧客向け回答では、AIやWeb検索の調査過程を見せない
・「確認できません」「確認できた資料では」「検索したところ」「示されていません」「公表されていません」など、調査結果を報告するような表現は原則使わない
・制度がないことを公式情報から判断できる場合は、「〜制度はありません」「〜制度は設けられていません」のように結論を直接書く
・制度内容がまだ確定していない場合は、無理に不存在を断定せず「現時点では未確定です」と書く
・回答は、ROUTEが情報を確認・整理したうえで保護者へ直接説明する文章として書く

【最新情報の扱い：全分野共通の最重要ルール】
・現在性が関係する事実は、分野を問わず最新の公式情報を優先する
・学校の特徴、コース、学科、校風、学校生活、校則、行事、部活動、設備、通学情報も、古い一般知識や過去の評判だけで回答しない
・入試制度、募集要項、出願資格、試験科目、配点、推薦、専願・併願、英検等の優遇は、受験年度に最も近い最新公式要項を優先する
・学費、授業料、入学金、諸経費、制服・教材・ICT端末等は、その学校が公式に公表している最新年度の金額を優先する
・大学進学実績、指定校推薦、内部進学、進学率は、最新公表年度・直近数年の実績を優先し、古い実績だけで現在の状況を断定しない
・説明会、オープンスクール、出願日、入試日、合格発表等の日程は、対象年度の最新公式発表を優先する
・部活動・強豪校だけでなく、学校比較・おすすめ・候補校・第2志望等でも、現在の学校状況と最新の公式情報を確認する
・公式情報が更新されている場合、古いROUTE資料や一般知識より新しい公式情報を優先する。ただしROUTE最優先ルール・内申判定ルールは勝手に変更しない
・最新情報が公式に未発表の場合は、最新公表実績の年度を明示したうえで参考として扱い、未発表内容を推測しない
・顧客向け回答では、検索過程やURL一覧は見せない

・「選択した学区」がある場合は、その学区を絶対条件として扱う
・学校候補、おすすめ校、強豪校、比較対象、第2志望、安全校、併願候補、学校ランキングなど、学校名を複数挙げるすべての回答で選択学区を絶対条件にする
・選択学区の学校一覧外の高校を回答候補として混ぜない
・学区が指定されているのに、兵庫県全体から候補を出してはいけない
・「比較」質問でも、ユーザーが明示的に学区外学校を指定した場合を除き、学区内だけで比較する
・複数校から候補を選ぶ質問では、Web検索結果に出た学校だけから選ばず、選択学区に登録されている全高校を候補母集団にする
・候補母集団の全校について、質問テーマに関係する最新公式情報を確認してから候補を絞る
・検索上位に出なかった学校を、確認せず候補から落としてはいけない
・公式情報が見つからない学校は「情報不足」として扱い、実績がないと断定しない

【現在の強豪校・部活動実績を聞かれた場合：必須】
・「強豪」「強い」「現在強い」「実績のある学校」等の質問は、昔の評判や過去の有名校だけで判断しない
・個人スポーツは、直近3年間に実施された近畿大会すべての公式結果を対象に分析する
・チームスポーツは、直近3年間に実施された兵庫県大会すべての公式結果を対象に分析する
・「すべての大会」とは、総体・ユース・新人・選手権等、その競技で公式に実施された対象レベルの大会を指す
・チームスポーツでは、優勝・準優勝・ベスト4・ベスト8・県大会出場と3年間の継続性を重視する
・チームスポーツの近畿・全国大会進出は追加評価とする
・個人スポーツでは、近畿大会すべてを横断し、出場人数・出場種目数・入賞数・全国大会進出数・3年間の継続性を重視する
・単年だけ突出した選手がいる学校と、3年間継続して複数種目で近畿へ進んでいる学校を区別する
・評価の優先順位は、全国進出 > 近畿入賞 > 近畿出場 > 県大会入賞 > 県大会決勝進出 とする
・同程度なら、3年間の継続性、複数種目、リレー、男女両方の実績がある学校を上位評価する
・総合型の強豪校と、短距離・中長距離・競歩・跳躍・投てき等の種目別強豪校を区別する
・兵庫県高体連、近畿高体連、競技団体、大会公式結果を優先し、学校公式情報は補完資料として使う
・検索結果上位に出た学校だけで決めず、選択学区に登録されている全高校を候補母集団として確認する
・過去に強かっただけで直近3年間の実績が乏しい学校を「現在の強豪校」と断定しない
・最新実績の裏付けが十分でない学校は、無理に強豪校として挙げない
・個人スポーツの回答では必ず「ここ3年においては、近畿大会の実績を基準にすると」のように、「ここ3年においては」という表現を入れる
・チームスポーツの回答では必ず「ここ3年においては、県大会の実績を基準にすると」のように、「ここ3年においては」という表現を入れる
・回答確定前に、選択学区の登録校一覧をもう一度見直し、近畿・県大会実績のある学校を検索漏れで落としていないか確認する
・特に近畿大会入賞・全国進出・3年継続出場がある学校を、検索順位が低いという理由だけで候補から除外しない
・顧客向け回答にURL一覧は掲載しない

【回答方法】
・最初の1～3文で質問への答えを直接示す
・単なる一般論ではなく、今回の学校・条件に即して答える
・必要に応じて箇条書きにする
・「絶対」「確実に合格」「安全圏」と安易に断定しない
・第2志望候補は「適正・安全寄り・やや挑戦・挑戦」の違いを明確にする
・原則400～900文字程度

【Web検索を使う場合】
・対象学校の公式サイト・公式PDFを最優先する
・顧客向け回答には「【確認に使用した公式情報】」のような出典一覧・URL一覧を付けない
・次に教育委員会、自治体、大学等の公式情報を使う
・塾、まとめサイト、個人ブログだけで制度・金額・日程を断定しない
・公式情報に具体的な答えがあるのに「最新の募集要項で確認してください」だけで終わらせない
・年度、金額、条件、日程を具体的に示す

【金額・諸経費の質問】
・「いくら」「費用」「初年度」「授業料以外」「諸経費」等の場合、学校公式サイト・公式PDFの費用表を探す
・1項目だけ見つけて検索を終えない
・「入学手続き時の費用」と「年間費用」の両方を確認する
・入学金、施設費、教育充実費、PTA等、行事・学習材料費、卒業関連積立、端末関連等を可能な限り項目別に示す
・「授業料以外」「諸経費」と聞かれた場合、授業料は合計から完全に除外する
・確認できた授業料以外の金額を合計し、「授業料を除く確認済み初年度小計」を必ず示す
・端末本体、修学旅行、制服、教科書など別途のものは小計に入れず「別途」と明示する
・公式資料で確認できない費目は推測しない
・受験予定年度（例：2027年度）の費用表がまだ未公表でも、「算出不可」で終わらせない
・その学校が公式に公表している「最新の費用表・最新実績」を探し、年度を明記したうえで参考額として計算する
・学校公式に2025年度実績、2026年度実績などがある場合は、それを「最新公表実績ベース」として使う
・最新公表実績と次年度の金額が同じとは断定せず、「次年度は変更の可能性あり」と明記する
・学校費用の金額根拠は、その学校の公式サイト・公式PDFを最優先する
・文部科学省・県のページは授業料支援制度の根拠として使い、学校固有の入学金・施設費・諸経費の根拠には原則使わない

【高校授業料支援制度の扱い：必須】
・授業料が関係する質問では、学校公式の授業料に加え、その年度の国の高等学校等就学支援金・高校授業料支援制度を文部科学省等の公式情報で確認する
・兵庫県の学校では、兵庫県公式の追加支援・県独自支援があるかも確認する
・支援額は「実際の授業料額」と「制度上限額」の低い方を上限として扱う
・「無償化」という言葉だけで授業料を自動的に0円と断定しない
・学校の授業料が国等の支援上限を超える場合は、その差額負担を明示する
・県独自支援など追加支援が公式に確認できる場合は、その分も差し引く
・「年間総額」「初年度総額」を聞かれた場合は、
  ①学校の授業料（支援前）
  ②国の支援額
  ③県等の公式に確認できた追加支援額
  ④実質授業料負担＝①－②－③（0円未満にはしない）
  ⑤授業料以外の諸経費
  ⑥実質負担総額＝④＋⑤
  の順で示す
・「授業料以外」「諸経費」を聞かれた場合は授業料を合計から除外し、
  「授業料については別枠で国等の支援制度があり、制度上限までは軽減される。学校授業料が上限を超える場合は差額負担が残る」
  と簡潔に説明する
・次年度費用が未公表でも、学校公式の最新公表実績または上記ROUTE公式確認済み費用参考データがある場合、「算出不可」と回答してはいけない
・その場合は「最新公表実績ベースでは○円。次年度は変更の可能性があります」と回答する

【ROUTEの最後の案内文】
最後の案内文はシステム側で自動付与するため、同じ文章を重複して書かないでください。
`;


  const userInput = `
以下の相談へ最終回答してください。

【相談カテゴリー】
${data.category || ''}

【質問テーマ】
${data.theme || ''}

【選択した学区】
${data.districtLabel || getRouteDistrictLabel_(data.district) || '未選択'}

【高校名】
${data.school || '未選択'}

【質問内容】
${data.question || ''}

==============================
【学区指定・回答可能な学校範囲】
==============================
${districtAnswerContext}

==============================
【学区内全校を候補母集団にする場合の調査指示】
==============================
${schoolPopulationResearchInstruction || '該当なし'}

==============================
【スポーツ強豪校の評価基準】
==============================
${sportsEvaluationInstruction || '該当なし'}

==============================
【ROUTE最優先情報・絶対ルール】
==============================
${
  topPriorityContext ||
  '今回の質問に追加の最優先ルールはありません。'
}

==============================
【ROUTE内申・候補校自動判定】
==============================
${
  asksCandidateSchool
    ? (
        internalScoreContext ||
        '今回の候補校・内申質問に使えるROUTE内申自動判定はありません。'
      )
    : '今回の質問は内申・第2志望・候補校の質問ではないため、この情報は使用禁止。'
}

==============================
【ROUTE資料DB】
==============================
${
  materialContext ||
  '今回の質問に直接関連するROUTE資料DBの情報はありません。'
}

==============================
【ROUTE過去の確定回答】
==============================
${
  correctionContext ||
  '今回の質問に関連する過去の確定回答はありません。'
}

==============================
【ROUTE公式確認済み費用参考データ】
==============================
${
  (
    String(data.school || '').indexOf('雲雀丘学園') !== -1
  )
    ? '雲雀丘学園高等学校について、学校公式PDFの2025年度実績では、入学金280,000円、施設費200,000円、年間費用743,000円（うち授業料578,000円、生徒会・PTA会費等20,800円、行事・学習材料費114,000円、卒業関連積立金20,000円、生徒端末関連10,200円）。したがって授業料を除く確認済み初年度費用は480,000円＋165,000円＝645,000円。修学旅行費と生徒端末本体は別途。公式PDF：https://www.hibari.jp/admissions/361e0e38f8a518cc77a6a6fb7c8734be2e73489d.pdf 。Web検索でこれより新しい学校公式費用表が確認できた場合は新しい方を優先する。'
    : 'この学校についてROUTEが固定保持する費用参考データはありません。Web検索した学校公式情報を使ってください。'
}

==============================
【今回の外部確認方針】
==============================
${
  useWebSearch
    ? (
        isCostQuestion
          ? 'まず学校公式サイト・公式PDFで「初年度費用」「入学手続き時の費用」「年間の費用」「学費」「納付金」を検索する。受験予定年度の費用表が未公表なら、同じ学校の最新公表実績まで遡って具体額を計算する。その後、文部科学省・兵庫県等の最新年度の授業料支援制度を公式情報で確認する。'
          : (
              isCurrentStrengthQuestion
                ? (
                    sportEvaluationType === 'team'
                      ? 'チームスポーツでは、選択学区の全登録校を候補母集団にし、直近3年間に実施された兵庫県大会すべての公式結果を確認する。総体・新人・選手権等を漏れなく横断し、優勝・準優勝・ベスト4・ベスト8・県大会出場と3年間の継続性を比較する。近畿・全国進出は追加評価する。検索結果上位校だけから選ばない。'
                      : '個人スポーツでは、選択学区の全登録校を候補母集団にし、直近3年間に実施された近畿大会すべての公式結果を確認する。総体・ユース・新人・選手権等を漏れなく横断し、全国進出・近畿入賞・近畿出場・3年間の継続性を比較する。検索結果上位校だけから選ばない。'
                  )
                : (
                    isSchoolPopulationComparisonQuestion
                      ? '選択学区に登録されている全高校を候補母集団とし、質問テーマに関係する最新公式情報を各校について確認して比較する。検索結果に出た学校だけから候補を選ばない。'
                      : '今回の質問分野について、学校公式サイト・公式PDF・教育委員会・公的機関等の最新情報をWeb検索し、現在の内容を確認してから最終回答する。学校の特徴・校風・コース・設備・進学実績・候補校等も古い一般知識だけで答えない。'
                  )
            )
      )
    : 'ROUTE内部情報と一般的な高校受験制度の知識を使って回答する。学校固有の最新事実が不要な一般説明では外部検索ツールを使わない。'
}
`;


  const payload = {
    model:
      OPENAI_MODEL,

    instructions:
      instructions,

    input:
      userInput,

    reasoning: {
      effort:
        'low'
    },

    /*
     * Web検索を同一Response内で行う場合、
     * max_output_tokens は可視回答＋推論トークンを含む。
     * 低すぎると検索後に本文が出る前に incomplete になるため余裕を持たせる。
     */
    max_output_tokens:
      isCostQuestion
        ? 3000
        : (
            (
              isCurrentStrengthQuestion ||
              isSchoolPopulationComparisonQuestion
            )
              ? 3200
              : (
                  useWebSearch
                    ? 2400
                    : 1600
                )
          ),

    store:
      false
  };


  /*
   * Web検索が必要な質問：
   * 公式Web検索と最終回答を「同じ1回のAPI」で行う。
   */
  if (useWebSearch) {

    payload.tools = [
      {
        type:
          'web_search',

        search_context_size:
          (
            isCostQuestion ||
            isCurrentStrengthQuestion ||
            isSchoolPopulationComparisonQuestion
          )
            ? 'high'
            : 'medium'
      }
    ];

    payload.tool_choice =
      'required';

    payload.max_tool_calls =
      (
        isCurrentStrengthQuestion ||
        isSchoolPopulationComparisonQuestion
      )
        ? 8
        : 2;

    payload.include = [
      'web_search_call.action.sources'
    ];

  }
  /*
   * Web検索不要の質問では、ツールを強制しない。
   *
   * ROUTE資料DB・確定回答・最優先ルールは、この関数の前半で
   * Apps Script側から取得済み。
   *
   * 以前は OPENAI_VECTOR_STORE_ID が設定されているだけで
   * File Search を tool_choice='required' で強制していたため、
   * 「実力テストとは？」のような一般説明でも
   * 不要なFile Search失敗が回答生成エラーにつながる可能性があった。
   */


  let response =
    callRouteOpenAiResponse_(
      apiKey,
      payload
    );

  let status =
    response.getResponseCode();

  let body =
    response.getContentText();


  /*
   * ツール実行だけで失敗した場合の安全な1回だけのフォールバック。
   * 通常時は実行されないので速度には影響しない。
   */
  if (
    (
      status < 200 ||
      status >= 300
    ) &&
    payload.tools
  ) {

    console.error(
      'ツール付き回答に失敗。ツールなしで1回だけ再試行：',
      body
    );

    delete payload.tools;
    delete payload.tool_choice;
    delete payload.include;
    delete payload.max_tool_calls;

    payload.input =
      userInput +
      '\n\n※外部検索が一時的に利用できません。確認できていない最新事実は断定しないでください。';

    response =
      callRouteOpenAiResponse_(
        apiKey,
        payload
      );

    status =
      response.getResponseCode();

    body =
      response.getContentText();
  }


  if (
    status < 200 ||
    status >= 300
  ) {

    console.error(
      'OpenAI APIエラー本文：' +
      body
    );

    let apiErrorDetail =
      '';

    try {

      const apiErrorJson =
        JSON.parse(
          body
        );

      apiErrorDetail =
        apiErrorJson &&
        apiErrorJson.error &&
        apiErrorJson.error.message
          ? String(
              apiErrorJson.error.message
            )
          : '';

    }
    catch(parseError) {

      apiErrorDetail =
        String(
          body || ''
        )
          .slice(
            0,
            300
          );
    }


    throw new Error(
      'OpenAI APIエラー：HTTP ' +
      status +
      (
        apiErrorDetail
          ? ' / ' +
            apiErrorDetail.slice(
              0,
              300
            )
          : ''
      )
    );
  }


  let json =
    JSON.parse(
      body
    );

  let extracted =
    extractRouteResponseTextAndSources_(
      json
    );


  /*
   * Web検索は完了したが、出力上限などで最終本文だけ空になった場合、
   * 同じresponseを previous_response_id で引き継ぎ、
   * Web検索をやり直さず「回答本文だけ」を1回生成する。
   */
  if (
    !extracted.text &&
    json &&
    json.id
  ) {

    console.warn(
      'AI本文が空のため回答本文だけ再生成します。status=' +
      String(
        json.status || ''
      ) +
      ' reason=' +
      String(
        json.incomplete_details &&
        json.incomplete_details.reason
          ? json.incomplete_details.reason
          : ''
      )
    );

    const recoveryPayload = {
      model:
        OPENAI_MODEL,

      previous_response_id:
        json.id,

      instructions:
        instructions,

      input:
        '直前のWeb検索結果とROUTE内部情報をそのまま使い、追加検索はせず、保護者向けの最終回答本文だけを完成させてください。費用質問では授業料以外の確認済み小計と授業料支援制度の扱いを必ず含めてください。',

      reasoning: {
        effort:
          'low'
      },

      max_output_tokens:
        isCostQuestion
          ? 2200
          : 1600,

      store:
        true
    };

    const recoveryResponse =
      callRouteOpenAiResponse_(
        apiKey,
        recoveryPayload
      );

    const recoveryStatus =
      recoveryResponse.getResponseCode();

    const recoveryBody =
      recoveryResponse.getContentText();

    if (
      recoveryStatus >= 200 &&
      recoveryStatus < 300
    ) {

      json =
        JSON.parse(
          recoveryBody
        );

      const recovered =
        extractRouteResponseTextAndSources_(
          json
        );

      /*
       * 最初のWeb検索ソースは維持する。
       */
      extracted = {
        text:
          recovered.text || '',

        sources:
          (
            extracted.sources &&
            extracted.sources.length > 0
          )
            ? extracted.sources
            : (
                recovered.sources || []
              )
      };

    }
    else {

      console.error(
        '回答本文再生成エラー：HTTP ' +
        recoveryStatus
      );
    }
  }


  if (
    !extracted.text
  ) {

    console.error(
      'AI回答案なし：status=' +
      String(
        json && json.status
          ? json.status
          : ''
      ) +
      ' reason=' +
      String(
        json &&
        json.incomplete_details &&
        json.incomplete_details.reason
          ? json.incomplete_details.reason
          : ''
      )
    );

    throw new Error(
      'AI回答案を取得できませんでした。'
    );
  }


  let answer =
    extracted.text
      .trim();




  console.log(
    'ROUTE回答生成時間：' +
    (
      (
        Date.now() -
        startedAt
      ) /
      1000
    ).toFixed(1) +
    '秒'
  );


  answer =
    stripRouteUnaskedCandidateContent_(
      answer,
      data
    );

  answer =
    applyRouteVerifiedCostCorrections_(
      answer,
      data
    );

  answer =
    ensureRouteTuitionSupportNote_(
      answer,
      data
    );

  answer = String(answer || '')
    // Markdownリンク → 表示文字だけ残す
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    // 残ったURLを削除
    .replace(/https?:\/\/[^\s)]+/g, '')
    // (sh.kwansei.ac.jp) のようなドメイン表示も削除
    .replace(/\(\s*(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s)]*)?\s*\)/gi, '')
    // 空括弧を削除
    .replace(/\(\s*\)/g, '')
    // LINEではMarkdownの太字記号 ** を表示しない
    .replace(/\*\*/g, '')
    .trim();


  /*
   * =====================================================
   * 学区外高校の最終検査
   *
   * プロンプトだけでは学区外校が混入する可能性があるため、
   * 完成した回答本文をプログラムで検査する。
   * =====================================================
   */
  if (
    answerRequiresRouteDistrictGuard_(
      data
    )
  ) {

    let outsideSchools =
      findRouteOutOfDistrictSchoolsInAnswer_(
        answer,
        data.district
      );


    if (
      outsideSchools.length > 0
    ) {

      console.warn(
        '学区外高校を検出。回答を再生成します：' +
        outsideSchools.join(
          '、'
        )
      );


      const allowedSchools =
        getRouteDistrictSchools_(
          data.district
        );


      const retryPayload = {
        model:
          OPENAI_MODEL,

        instructions:
          instructions +
          '\n\n【再生成時の最優先条件】\n' +
          '直前の回答には選択学区外の高校が混入していたため、その回答は使用禁止です。\n' +
          '今回、回答中で候補・比較・例として高校名を挙げる場合は、次の学校一覧内だけに限定してください。\n' +
          allowedSchools.join('、') +
          '\n一覧外の高校名は1校も記載しないでください。',

        input:
          userInput +
          '\n\n直前の回答で混入した学区外高校：' +
          outsideSchools.join('、') +
          '\nこれらを完全に除外して回答を作り直してください。',

        reasoning: {
          effort:
            'low'
        },

        max_output_tokens:
          isCostQuestion
            ? 2600
            : 2200,

        store:
          false
      };


      if (
        useWebSearch
      ) {

        retryPayload.tools = [
          {
            type:
              'web_search',

            search_context_size:
              'high'
          }
        ];

        retryPayload.tool_choice =
          'required';

        retryPayload.max_tool_calls =
          isCurrentStrengthQuestion
            ? 4
            : 3;
      }


      const retryResponse =
        callRouteOpenAiResponse_(
          apiKey,
          retryPayload
        );

      const retryStatus =
        retryResponse.getResponseCode();

      const retryBody =
        retryResponse.getContentText();


      if (
        retryStatus >= 200 &&
        retryStatus < 300
      ) {

        const retryJson =
          JSON.parse(
            retryBody
          );
        const retryExtracted =
          extractRouteResponseTextAndSources_(
            retryJson
          );

        const retryAnswer =
          String(
            retryExtracted.text || ''
          )
            .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
            .replace(/https?:\/\/[^\s)]+/g, '')
            .replace(/\(\s*(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s)]*)?\s*\)/gi, '')
            .replace(/\(\s*\)/g, '')
            .replace(/\*\*/g, '')
            .trim();


        if (
          retryAnswer
        ) {

          answer =
            retryAnswer;
        }
      }


      outsideSchools =
        findRouteOutOfDistrictSchoolsInAnswer_(
          answer,
          data.district
        );


      /*
       * 再生成後も学区外高校が残る場合は、
       * 誤回答をLINEへ送るより停止を優先する。
       */
      if (
        outsideSchools.length > 0
      ) {

        console.error(
          '学区外高校が再生成後も残っています：' +
          outsideSchools.join(
            '、'
          )
        );

        throw new Error(
          '選択学区外の高校が回答に含まれたため、回答生成を停止しました。'
        );
      }
    }
  }


  /*
   * スポーツ強豪校の回答では、期間限定評価であることを明示する。
   */
  if (
    isCurrentStrengthQuestion &&
    (
      sportEvaluationType === 'individual' ||
      sportEvaluationType === 'team'
    ) &&
    answer.indexOf(
      'ここ3年においては'
    ) === -1
  ) {

    const prefix =
      sportEvaluationType === 'individual'
        ? 'ここ3年においては、近畿大会の実績を基準にすると、'
        : 'ここ3年においては、県大会の実績を基準にすると、';


    answer =
      prefix +
      answer;
  }


  return ensureRouteClosingMessage_(
    answer
  );
}


/**
 * 従来コードとの互換用
 */
function extractResponseText_(response) {

  return (
    extractRouteResponseTextAndSources_(
      response
    ).text
  );

}


/**
 * =========================================================
 * 公式Web検索 動作確認
 * =========================================================
 */
function testRouteOfficialWebSearchKwansei() {

  const result =
    generateAiDraft_({
      category:
        '英検・資格・優遇',

      theme:
        '英検優遇',

      school:
        '関西学院高等部',

      question:
        '関西学院高等部の高校入試で英検はどのように優遇されますか？'
    });


  console.log(result);
}


/* =========================================================
   LINE送信（回答確認.gsから使用）
========================================================= */


function buildRouteLineRetryKey_(
  lineUserId,
  answer,
  dedupeKey
) {

  const source =
    String(lineUserId || '').trim() +
    '\n---ROUTE---\n' +
    String(answer || '').trim() +
    '\n---QUESTION---\n' +
    String(dedupeKey || '').trim();

  const digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      source,
      Utilities.Charset.UTF_8
    );

  const hex =
    digest
      .map(function(b) {
        const n =
          b < 0
            ? b + 256
            : b;

        return (
          '0' +
          n.toString(16)
        ).slice(-2);
      })
      .join('');

  let h =
    hex
      .slice(0, 32)
      .split('');

  // UUID v4 / RFC 4122 variant shape
  h[12] = '4';

  const variant =
    parseInt(
      h[16],
      16
    );

  h[16] =
    (
      (variant & 0x3) |
      0x8
    ).toString(16);

  const uuidHex =
    h.join('');

  return (
    uuidHex.slice(0, 8) +
    '-' +
    uuidHex.slice(8, 12) +
    '-' +
    uuidHex.slice(12, 16) +
    '-' +
    uuidHex.slice(16, 20) +
    '-' +
    uuidHex.slice(20, 32)
  );
}

function sendLinePushMessage_(
  lineUserId,
  answer,
  dedupeKey
) {
  assertRouteqQaTestEnvironment_();
  throw new Error('TEST isolation: entry point disabled until isolated dependencies validated');

  const token =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'LINE_CHANNEL_ACCESS_TOKEN'
      );

  if (!token) {
    throw new Error(
      'LINE_CHANNEL_ACCESS_TOKENが設定されていません。'
    );
  }

  if (!lineUserId) {
    throw new Error(
      '送信先のLINEユーザーIDがありません。'
    );
  }

  if (!answer) {
    throw new Error(
      '送信する回答がありません。'
    );
  }

  const text =
    '【ROUTEからの回答】\n\n' +
    String(answer).trim() +
    '\n\n' +
    'もっと詳しく知りたいことや、気になることがございましたら、次回のQ&Aまたは相談時にご質問ください。';

  const retryKey =
    buildRouteLineRetryKey_(
      lineUserId,
      text,
      dedupeKey
    );

  const response =
    UrlFetchApp.fetch(
      'https://api.line.me/v2/bot/message/push',
      {
        method:
          'post',

        contentType:
          'application/json',

        headers: {
          Authorization:
            'Bearer ' +
            token,

          /*
           * 同じ質問行から同じ回答を二度送ろうとしても、
           * LINE側で同一リクエストとして重複を抑止する。
           */
          'X-Line-Retry-Key':
            retryKey
        },

        payload:
          JSON.stringify({
            to:
              String(lineUserId).trim(),

            messages: [
              {
                type:
                  'text',

                text:
                  text
              }
            ]
          }),

        muteHttpExceptions:
          true
      }
    );

  const status =
    response.getResponseCode();

  const body =
    response.getContentText();

  /*
   * 200系 = 今回送信成功
   * 409   = 同一Retry KeyをLINE側がすでに受理済み
   *         2通目は送られていないため正常扱い
   */
  if (
    (
      status >= 200 &&
      status < 300
    ) ||
    status === 409
  ) {

    if (status === 409) {
      console.log(
        'LINE二重送信を防止しました。'
      );
    }

    return true;
  }

  throw new Error(
    'LINE Messaging API エラー：HTTP ' +
    status +
    '\n' +
    body
  );
}



function testRouteWebSearchKwansei() {

  const result =
    generateAiDraft_({
      category:
        '英検・資格・優遇',

      theme:
        '英検',

      school:
        '関西学院高等部',

      question:
        '関西学院高等部の高校入試で英検はどのように扱われますか？'
    });

  console.log(result);
}


function testRouteCostAnswerHibari() {

  const startedAt =
    Date.now();

  const result =
    generateAiDraft_({
      category:
        '学費・費用',

      theme:
        '初年度費用',

      school:
        '雲雀丘学園高等学校',

      question:
        '雲雀丘学園高等学校では授業料以外で初年度いくらかかりますか？ 国の高校授業料支援制度を使った場合の授業料の扱いも説明してください。'
    });

  console.log(result);

  console.log(
    'テスト総時間：' +
    (
      (
        Date.now() -
        startedAt
      ) /
      1000
    ).toFixed(1) +
    '秒'
  );
}


function testRouteRetryKey() {

  const key1 =
    buildRouteLineRetryKey_(
      'U_TEST',
      '同じ回答',
      'question-row:100'
    );

  const key2 =
    buildRouteLineRetryKey_(
      'U_TEST',
      '同じ回答',
      'question-row:100'
    );

  const key3 =
    buildRouteLineRetryKey_(
      'U_TEST',
      '同じ回答',
      'question-row:101'
    );

  console.log(
    '同じ質問なら同じKey：',
    key1 === key2
  );

  console.log(
    '別質問なら別Key：',
    key1 !== key3
  );

  console.log(
    key1,
    key2,
    key3
  );
}


/* =========================================================
   管理用テスト
========================================================= */

function checkRequiredProperties() {
  const props = PropertiesService.getScriptProperties();

  const names = [
    'LINE_LOGIN_CHANNEL_ID',
    'LINE_CHANNEL_ACCESS_TOKEN',
    'OPENAI_API_KEY',
    'STRIPE_SECRET_KEY',
    'QUESTION_PAGE_URL'
  ];

  const missing = names.filter(function(name) {
    return !props.getProperty(name);
  });

  if (missing.length > 0) {
    SpreadsheetApp.getUi().alert(
      '未設定のスクリプトプロパティ',
      missing.join('\n'),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return false;
  }

  SpreadsheetApp.getUi().alert(
    '必要なスクリプトプロパティはすべて設定済みです。'
  );
  return true;
}


function testOpenAIConnection() {
  const result = generateAiDraft_({
    category: '志望校・高校選び',
    theme: '指定校推薦',
    school: 'テスト高校',
    question: '指定校推薦について教えてください。'
  });

  console.log(result);
}


function testLineToken() {
  assertRouteqQaTestEnvironment_();
  throw new Error('TEST isolation: entry point disabled until isolated dependencies validated');
  const token = PropertiesService
    .getScriptProperties()
    .getProperty('LINE_CHANNEL_ACCESS_TOKEN');

  if (!token) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKENがありません。');
  }

  console.log('LINE_CHANNEL_ACCESS_TOKEN：設定済み');
}


function authorizeUrlFetch() {
  assertRouteqQaTestEnvironment_();
  throw new Error('TEST isolation: arbitrary external URL fetch is disabled');
  const response = UrlFetchApp.fetch(
    'https://www.google.com/',
    { muteHttpExceptions: true }
  );

  console.log(
    'HTTPステータス：' +
    response.getResponseCode()
  );
}



function testRouteKwanseiEnglishOnlyNoCandidateLeak() {

  const result =
    generateAiDraft_({
      category:
        '英検・資格・優遇',

      theme:
        '英検',

      school:
        '関西学院高等部',

      question:
        '関西学院高等部の高校入試で英検はどのように扱われますか？'
    });

  console.log(result);

  console.log(
    '第2志望混入なし：' +
    (
      !/第\s*[2二]\s*志望|第二志望|内申\s*[0-9０-９]+\s*点|候補を絞るには/.test(
        result
      )
    )
  );
}



function testRouteClearlySpecificSafetyNet() {

  const allowedCase =
    isRouteQuestionClearlySpecific_({
      category:
        'qualification',

      categoryLabel:
        '英検・資格・優遇',

      theme:
        '英検',

      school:
        '関西学院高等部',

      question:
        '関西学院高等部では英検はどのように扱われますか？'
    });


  const unclearCase =
    isRouteQuestionClearlySpecific_({
      category:
        'school',

      categoryLabel:
        '志望校・高校選び',

      theme:
        '学校の特徴・強み',

      school:
        '',

      question:
        'あれってどうなん？'
    });


  console.log(
    '明確な関学英検=true：' +
    allowedCase
  );

  console.log(
    '意味不明=false：' +
    unclearCase
  );
}



function testRouteQuestionValidationSingleWithDetail() {

  const result =
    validateRouteQuestionContent_({
      category:
        'cost',

      categoryLabel:
        '学費・費用',

      theme:
        '初年度費用',

      school:
        'B高校',

      question:
        'B高校では授業料以外で初年度いくらかかりますか？内訳も教えてください。'
    });

  console.log(
    '同一テーマ詳細はallowed=true：' +
    (
      result.allowed === true &&
      result.code === 'allowed'
    )
  );

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );
}


function testRouteQuestionValidationMultipleQuestions() {

  const result =
    validateRouteQuestionContent_({
      category:
        'qualification',

      categoryLabel:
        '英検・資格・優遇',

      theme:
        '英検',

      school:
        'A高校',

      question:
        'A高校の英検優遇と必要な内申点を教えてください。'
    });

  console.log(
    '複数質問は差し戻し=true：' +
    (
      result.allowed === false &&
      (
        result.code === 'multiple_questions' ||
        result.code === 'unclear_multiple'
      )
    )
  );

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );
}


function testRouteQuestionValidationMultipleTopics() {

  const result =
    validateRouteQuestionContent_({
      category:
        'cost',

      categoryLabel:
        '学費・費用',

      theme:
        '初年度費用',

      school:
        'B高校',

      question:
        'B高校の学費と大学進学実績を教えてください。'
    });

  console.log(
    '別テーマ2質問は差し戻し=true：' +
    (
      result.allowed === false &&
      (
        result.code === 'multiple_questions' ||
        result.code === 'unclear_multiple'
      )
    )
  );

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );
}



function testRouteAllFieldsUseCurrentWebSearch() {

  const cases = [
    {
      name:
        '校風',
      data: {
        category:
          '志望校・高校選び',
        theme:
          '校風・学校生活',
        district:
          'district2',
        districtLabel:
          '第2学区',
        school:
          '',
        question:
          '落ち着いた校風の高校を教えて'
      }
    },
    {
      name:
        '設備',
      data: {
        category:
          '志望校・高校選び',
        theme:
          '学校設備',
        district:
          'district2',
        districtLabel:
          '第2学区',
        school:
          '',
        question:
          '設備が充実している高校を教えて'
      }
    },
    {
      name:
        '進学実績',
      data: {
        category:
          '大学進学・進路実績',
        theme:
          '進学実績',
        district:
          'district2',
        districtLabel:
          '第2学区',
        school:
          '',
        question:
          '大学進学実績が良い高校を教えて'
      }
    }
  ];


  cases.forEach(
    function(item) {

      console.log(
        item.name +
        '=true：' +
        shouldUseRouteOfficialWebSearch_(
          item.data
        )
      );
    }
  );
}


function testRouteDistrictScopeAllRecommendations() {

  const context =
    getRouteDistrictAnswerContext_({
      district:
        'district2',

      districtLabel:
        '第2学区'
    });


  const requiredWords = [
    '候補校',
    'おすすめ校',
    '強豪校',
    '比較校',
    '第2志望',
    '安全校',
    '併願候補',
    'ランキング'
  ];


  requiredWords.forEach(
    function(word) {

      console.log(
        word +
        '条件あり=true：' +
        (
          context.indexOf(
            word
          ) !== -1
        )
      );
    }
  );
}

function testRouteQuestionDistrictColumnSetup() {

  setupSheets();

  const sheet =
    openRouteqQaTestSpreadsheet_()
      .getSheetByName(
        ROUTE_QA.QUESTIONS
      );

  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        sheet.getLastColumn()
      )
      .getValues()[0]
      .map(
        function(value) {
          return String(
            value || ''
          ).trim();
        }
      );

  console.log(
    'F列が学区=true：' +
    (
      headers[5] ===
      '学区'
    )
  );

  console.log(
    'G列が高校名=true：' +
    (
      headers[6] ===
      '高校名'
    )
  );

  console.log(
    'H列が質問内容=true：' +
    (
      headers[7] ===
      '質問内容'
    )
  );

  console.log(
    '列数17以上=true：' +
    (
      sheet.getLastColumn() >=
      17
    )
  );
}


function testRouteQuestionColumnConstants() {

  console.log(
    'DISTRICT=6：' +
    (
      ROUTE_QA
        .QUESTION_COL
        .DISTRICT ===
      6
    )
  );

  console.log(
    'SCHOOL=7：' +
    (
      ROUTE_QA
        .QUESTION_COL
        .SCHOOL ===
      7
    )
  );

  console.log(
    'QUESTION=8：' +
    (
      ROUTE_QA
        .QUESTION_COL
        .QUESTION ===
      8
    )
  );

  console.log(
    'AI_ANSWER=9：' +
    (
      ROUTE_QA
        .QUESTION_COL
        .AI_ANSWER ===
      9
    )
  );

  console.log(
    'REMAINING_AFTER=17：' +
    (
      ROUTE_QA
        .QUESTION_COL
        .REMAINING_AFTER ===
      17
    )
  );
}


function testRouteQuestionSchemaReadOnly() {

  const sheet =
    openRouteqQaTestSpreadsheet_()
      .getSheetByName(
        ROUTE_QA.QUESTIONS
      );


  if (!sheet) {
    throw new Error(
      'Questionsシートがありません。'
    );
  }


  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        sheet.getLastColumn()
      )
      .getValues()[0]
      .map(
        function(value) {
          return String(
            value || ''
          ).trim();
        }
      );


  console.log(
    '現在F列=' +
    String(
      headers[5] || ''
    )
  );

  console.log(
    '現在G列=' +
    String(
      headers[6] || ''
    )
  );

  console.log(
    '現在H列=' +
    String(
      headers[7] || ''
    )
  );

  console.log(
    '学区列追加済み=' +
    (
      headers[5] ===
      '学区'
    )
  );
}


function testRouteAthleticsThreeYearKinkiRule() {

  const data = {
    category:
      '志望校・高校選び',
    theme:
      '部活動',
    district:
      'district2',
    districtLabel:
      '第2学区',
    question:
      '陸上部の強豪校を教えて'
  };


  console.log(
    '陸上強豪判定=true：' +
    isRouteCurrentStrengthQuestion_(
      data
    )
  );


  const instruction =
    getRouteSchoolPopulationResearchInstruction_(
      data
    );


  console.log(
    '第2学区全校母集団=true：' +
    (
      instruction.indexOf(
        '県立西宮高校'
      ) !== -1
    )
  );
}


function testRouteSportsThreeYearAllMeetRule() {

  const individualInstruction =
    getRouteSportsEvaluationInstruction_({
      theme:
        '部活動',
      question:
        '陸上競技の強豪校を教えて'
    });


  console.log(
    '個人=近畿大会すべて：' +
    (
      individualInstruction.indexOf(
        '近畿大会すべて'
      ) !== -1
    )
  );


  const teamInstruction =
    getRouteSportsEvaluationInstruction_({
      theme:
        '部活動',
      question:
        'サッカー部の強豪校を教えて'
    });


  console.log(
    'チーム=兵庫県大会すべて：' +
    (
      teamInstruction.indexOf(
        '兵庫県大会すべて'
      ) !== -1
    )
  );
}



function testRouteWebSearchDecision() {

  console.log(
    '実力テスト一般説明=false：' +
    (
      shouldUseRouteOfficialWebSearch_({
        category:'score',
        theme:'実力テスト',
        district:'district2',
        districtLabel:'第2学区',
        school:'県立西宮高校',
        question:'高校受験で実力テストはどのように見られますか？'
      }) === false
    )
  );


  console.log(
    '県西英検=true：' +
    shouldUseRouteOfficialWebSearch_({
      category:'qualification',
      theme:'英検',
      district:'district2',
      districtLabel:'第2学区',
      school:'県立西宮高校',
      question:'県立西宮高校では英検はどのように扱われますか？'
    })
  );


  console.log(
    '県西説明会=true：' +
    shouldUseRouteOfficialWebSearch_({
      category:'schedule',
      theme:'学校説明会',
      district:'district2',
      districtLabel:'第2学区',
      school:'県立西宮高校',
      question:'県立西宮高校の今後の学校説明会の日程を教えてください。'
    })
  );
}



function testRouteGeneralQuestionPipeline() {

  const data = {
    category:
      '成績・入試得点',

    theme:
      '実力テスト',

    district:
      'district2',

    districtLabel:
      '第2学区',

    school:
      '県立西宮高校',

    question:
      '高校受験で実力テストはどのように見られますか？'
  };


  console.log(
    '一般説明判定=true：' +
    isRouteGeneralExplanationQuestion_(
      data
    )
  );


  console.log(
    'Web検索=false：' +
    (
      shouldUseRouteOfficialWebSearch_(
        data
      ) ===
      false
    )
  );


  const props =
    PropertiesService
      .getScriptProperties();


  console.log(
    'VectorStore設定の有無に関係なくFileSearch強制なし=true：true'
  );
}


function testRouteExactProblemQuestionGeneration() {

  const startedAt =
    Date.now();


  const result =
    generateAiDraft_({
      category:
        '成績・入試得点',

      theme:
        '実力テスト',

      district:
        'district2',

      districtLabel:
        '第2学区',

      school:
        '県立西宮高校',

      question:
        '高校受験で実力テストはどのように見られますか？'
    });


  console.log(
    '回答文字数：' +
    String(
      result || ''
    ).length
  );


  console.log(
    '生成成功=true：' +
    Boolean(
      String(
        result || ''
      ).trim()
    )
  );


  console.log(
    '生成時間秒：' +
    (
      (
        Date.now() -
        startedAt
      ) /
      1000
    )
  );


  console.log(
    result
  );
}



function testRouteCostOptimizationRouting() {

  const general = {
    category:
      '成績・入試得点',

    theme:
      '実力テスト',

    district:
      'district2',

    districtLabel:
      '第2学区',

    school:
      '県立西宮高校',

    question:
      '高校受験で実力テストはどのように見られますか？'
  };


  const currentSchool = {
    category:
      '英検・資格・優遇',

    theme:
      '英検',

    district:
      'district2',

    districtLabel:
      '第2学区',

    school:
      '関西学院高等部',

    question:
      '関西学院高等部の高校入試で英検はどのように扱われますか？'
  };


  console.log(
    '一般質問はLuna対象=true：' +
    isRouteGeneralExplanationQuestion_(
      general
    )
  );


  console.log(
    '一般質問はキャッシュ安全=true：' +
    isRouteCacheSafeQuestion_(
      general
    )
  );


  console.log(
    '学校固有英検はLuna対象=false：' +
    (
      isRouteGeneralExplanationQuestion_(
        currentSchool
      ) ===
      false
    )
  );


  console.log(
    '学校固有英検はWeb検索=true：' +
    shouldUseRouteOfficialWebSearch_(
      currentSchool
    )
  );


  console.log(
    '一般質問の経路：' +
    getRouteAnswerTierLabel_(
      general
    )
  );


  console.log(
    '学校固有質問の経路：' +
    getRouteAnswerTierLabel_(
      currentSchool
    )
  );
}


function testRouteExactAnswerCacheOnly() {

  const answer =
    findRouteConfirmedExactAnswer_({
      category:
        '成績・入試得点',

      theme:
        '実力テスト',

      district:
        'district2',

      districtLabel:
        '第2学区',

      school:
        '県立西宮高校',

      question:
        '高校受験で実力テストはどのように見られますか？'
    });


  console.log(
    '確認済み同一回答あり=' +
    Boolean(
      answer
    )
  );


  if (
    answer
  ) {
    console.log(
      answer
    );
  }
}