/**
 * =========================================================
 * ROUTE Q&A 回答モード切替.gs
 *
 * 自動返信時：
 * 「設定」シートの最短～最長時間からランダム待機時間を決め、
 * 曜日別の返信可能時間内だけLINE送信
 *
 * 手動返信時：
 * 従来どおり自動送信しない
 *
 * 仕組み：
 * ・質問ごとに「送信予定時刻」をScript Propertiesへ保存
 * ・1分ごとの共通トリガーが予定時刻を過ぎた回答だけ送信
 * ・質問ごとにトリガーを作らないため、トリガー数上限を回避
 * =========================================================
 */


const ROUTE_DELAYED_REPLY = {
  PROPERTY_PREFIX:
    'ROUTE_DELAYED_REPLY_',

  TRIGGER_HANDLER:
    'processRouteDelayedReplies_',

  DEFAULT_MIN_DELAY_MINUTES:
    5,

  DEFAULT_MAX_DELAY_MINUTES:
    10,

  SETTINGS_SHEET:
    '設定',

  MIN_DELAY_CELL:
    'B3',

  MAX_DELAY_CELL:
    'B4',

  BUSINESS_HOURS_RANGE:
    'A8:D14'
};


/**
 * =========================================================
 * 回答モード取得
 * =========================================================
 */
function getRouteReplyMode_(questions) {

  let ss = null;


  /*
   * Webアプリ実行時は
   * Questionsシートの親Spreadsheetを最優先。
   */
  if (
    questions &&
    typeof questions.getParent === 'function'
  ) {

    ss =
      routeqQaAssertAllowedSpreadsheet_(questions.getParent());
  }


  /*
   * 手動実行時の予備。
   */
  if (!ss) {

    ss =
      openRouteqQaTestSpreadsheet_();
  }


  if (!ss) {

    throw new Error(
      'ROUTE Q&A のスプレッドシートを取得できませんでした。'
    );
  }


  const sheet =
    ss.getSheetByName(
      '設定'
    );


  if (!sheet) {

    return '手動返信';
  }


  const mode =
    String(
      sheet
        .getRange('B2')
        .getValue() ||
      '手動返信'
    )
      .trim();


  return (
    mode === '自動返信'
      ? '自動返信'
      : '手動返信'
  );
}


/**
 * =========================================================
 * 返信時間設定を取得
 *
 * 設定!B3：最短待ち時間（分）
 * 設定!B4：最長待ち時間（分）
 * 設定!A8:D14：曜日 / 返信設定 / 開始 / 終了
 * =========================================================
 */
function getRouteReplySettings_(questions) {

  const ss =
    questions &&
    typeof questions.getParent === 'function'
      ? routeqQaAssertAllowedSpreadsheet_(questions.getParent())
      : openRouteqQaTestSpreadsheet_();


  if (!ss) {
    throw new Error(
      'ROUTE Q&A のスプレッドシートを取得できませんでした。'
    );
  }


  const sheet =
    ss.getSheetByName(
      ROUTE_DELAYED_REPLY.SETTINGS_SHEET
    );


  if (!sheet) {
    throw new Error(
      '設定シートが見つかりません。'
    );
  }


  let minMinutes =
    Number(
      sheet.getRange(
        ROUTE_DELAYED_REPLY.MIN_DELAY_CELL
      ).getValue()
    );

  let maxMinutes =
    Number(
      sheet.getRange(
        ROUTE_DELAYED_REPLY.MAX_DELAY_CELL
      ).getValue()
    );


  if (!isFinite(minMinutes) || minMinutes < 0) {
    minMinutes =
      ROUTE_DELAYED_REPLY.DEFAULT_MIN_DELAY_MINUTES;
  }


  if (!isFinite(maxMinutes) || maxMinutes < 0) {
    maxMinutes =
      ROUTE_DELAYED_REPLY.DEFAULT_MAX_DELAY_MINUTES;
  }


  if (maxMinutes < minMinutes) {
    const swap = minMinutes;
    minMinutes = maxMinutes;
    maxMinutes = swap;
  }


  const dayIndexByName = {
    '日曜日': 0,
    '月曜日': 1,
    '火曜日': 2,
    '水曜日': 3,
    '木曜日': 4,
    '金曜日': 5,
    '土曜日': 6
  };


  const weekly = {};


  sheet
    .getRange(
      ROUTE_DELAYED_REPLY.BUSINESS_HOURS_RANGE
    )
    .getValues()
    .forEach(function(row) {

      const dayIndex =
        dayIndexByName[
          String(row[0] || '').trim()
        ];


      if (typeof dayIndex === 'undefined') {
        return;
      }


      weekly[dayIndex] = {
        enabled:
          String(row[1] || '').trim() === '返信する',

        startMinutes:
          routeTimeValueToMinutes_(row[2]),

        endMinutes:
          routeTimeValueToMinutes_(row[3])
      };
    });


  return {
    minDelayMinutes: minMinutes,
    maxDelayMinutes: maxMinutes,
    weekly: weekly
  };
}


function routeTimeValueToMinutes_(value) {

  if (value instanceof Date) {
    return value.getHours() * 60 + value.getMinutes();
  }


  if (typeof value === 'number' && isFinite(value)) {
    return Math.round((value % 1) * 24 * 60);
  }


  const match =
    String(value || '')
      .trim()
      .match(/^(\d{1,2}):(\d{2})$/);


  if (!match) {
    return null;
  }


  const hours = Number(match[1]);
  const minutes = Number(match[2]);


  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }


  return hours * 60 + minutes;
}


/**
 * 営業時間を判定用の形へ整える。
 * 終了が 00:00 の場合は、その日の24:00として扱う。
 * 例：09:00〜00:00 = 09:00〜24:00
 *     21:00〜02:00 = 翌日02:00まで
 */
function normalizeRouteBusinessWindow_(day) {

  if (
    !day ||
    !day.enabled ||
    day.startMinutes === null ||
    day.endMinutes === null
  ) {
    return null;
  }


  const start = Number(day.startMinutes);
  let end = Number(day.endMinutes);


  if (
    !isFinite(start) ||
    !isFinite(end) ||
    start < 0 ||
    start >= 1440 ||
    end < 0 ||
    end >= 1440
  ) {
    return null;
  }


  /* 00:00〜00:00 は24時間営業。 */
  if (start === 0 && end === 0) {
    return {
      startMinutes: 0,
      endMinutes: 1440,
      overnight: false
    };
  }


  /* 09:00〜00:00 のような設定は当日24:00まで。 */
  if (start > 0 && end === 0) {
    end = 1440;
  }


  if (start === end) {
    return null;
  }


  return {
    startMinutes: start,
    endMinutes: end,
    overnight: end < start
  };
}


function getRouteRandomReplyDelayMs_(questions, settings) {

  const config =
    settings ||
    getRouteReplySettings_(questions);

  const min =
    Math.round(config.minDelayMinutes * 60 * 1000);

  const max =
    Math.round(config.maxDelayMinutes * 60 * 1000);


  return Math.floor(
    min +
    Math.random() *
    (max - min + 1)
  );
}


function isRouteReplyBusinessTime_(date, settings) {

  const minutes =
    date.getHours() * 60 + date.getMinutes();


  const today =
    normalizeRouteBusinessWindow_(
      settings.weekly[date.getDay()]
    );


  if (today) {

    if (
      !today.overnight &&
      minutes >= today.startMinutes &&
      minutes < today.endMinutes
    ) {
      return true;
    }


    if (
      today.overnight &&
      minutes >= today.startMinutes
    ) {
      return true;
    }
  }


  /* 前日の営業時間が日付をまたぐ場合の深夜帯。 */
  const previousDayIndex =
    (date.getDay() + 6) % 7;


  const previousDay =
    normalizeRouteBusinessWindow_(
      settings.weekly[previousDayIndex]
    );


  if (
    previousDay &&
    previousDay.overnight &&
    minutes < previousDay.endMinutes
  ) {
    return true;
  }


  return false;
}


function getNextRouteBusinessOpening_(date, settings) {

  const base = new Date(date.getTime());


  if (
    isRouteReplyBusinessTime_(
      base,
      settings
    )
  ) {
    return base;
  }


  for (let offset = 0; offset < 8; offset++) {

    const candidate = new Date(base.getTime());
    candidate.setDate(base.getDate() + offset);

    const day =
      normalizeRouteBusinessWindow_(
        settings.weekly[candidate.getDay()]
      );


    if (!day) {
      continue;
    }


    const opening = new Date(candidate.getTime());
    opening.setHours(
      Math.floor(day.startMinutes / 60),
      day.startMinutes % 60,
      0,
      0
    );

    if (opening > base) {
      return opening;
    }
  }


  throw new Error(
    '返信する曜日と時間が設定されていません。'
  );
}


function calculateRouteReplyDueAt_(questions, fromDate) {

  const settings =
    getRouteReplySettings_(questions);

  const delayMs =
    getRouteRandomReplyDelayMs_(
      questions,
      settings
    );

  let start =
    getNextRouteBusinessOpening_(
      fromDate || new Date(),
      settings
    );


  let due = null;


  for (let attempt = 0; attempt < 8; attempt++) {

    due =
      new Date(start.getTime() + delayMs);


    if (
      isRouteReplyBusinessTime_(
        due,
        settings
      )
    ) {
      break;
    }


    start =
      getNextRouteBusinessOpening_(
        new Date(due.getTime() + 60000),
        settings
      );


    due = null;
  }


  if (!due) {
    throw new Error(
      '返信待ち時間が営業時間より長すぎます。設定シートを確認してください。'
    );
  }


  return {
    dueAt: due.getTime(),
    delayMs: delayMs,
    settings: settings
  };
}


/**
 * =========================================================
 * 共通の1分トリガーを1個だけ作成
 * =========================================================
 */
function ensureRouteDelayedReplyTrigger_() {

  const handler =
    ROUTE_DELAYED_REPLY
      .TRIGGER_HANDLER;


  const exists =
    ScriptApp
      .getProjectTriggers()
      .some(
        function(trigger) {

          return (
            trigger
              .getHandlerFunction() ===
            handler
          );
        }
      );


  if (exists) {

    return;
  }


  routeqQaRejectTriggerMutation_(
      handler
    )
    .timeBased()
    .everyMinutes(1)
    .create();


  console.log(
    'ROUTE遅延返信用の1分トリガーを作成しました。'
  );
}


/**
 * =========================================================
 * 遅延返信を予約
 * =========================================================
 */
function scheduleRouteDelayedReply_(
  questions,
  questionRow
) {

  if (
    !questions ||
    !questionRow
  ) {

    throw new Error(
      '遅延返信の予約情報が不足しています。'
    );
  }


  const ss =
    routeqQaAssertAllowedSpreadsheet_(questions
      .getParent());


  if (!ss) {

    throw new Error(
      'スプレッドシートを取得できませんでした。'
    );
  }


  const timing =
    calculateRouteReplyDueAt_(
      questions,
      new Date()
    );


  const delayMs =
    timing.delayMs;


  const dueAt =
    timing.dueAt;


  const key =
    ROUTE_DELAYED_REPLY
      .PROPERTY_PREFIX +
    String(
      ss.getId()
    ) +
    '_' +
    String(
      questionRow
    );


  const data = {
    spreadsheetId:
      ss.getId(),

    sheetName:
      questions.getName(),

    questionRow:
      Number(
        questionRow
      ),

    dueAt:
      dueAt,

    createdAt:
      Date.now()
  };


  PropertiesService
    .getScriptProperties()
    .setProperty(
      key,
      JSON.stringify(
        data
      )
    );


  ensureRouteDelayedReplyTrigger_();


  const c =
    ROUTE_QA
      .QUESTION_COL;


  questions
    .getRange(
      questionRow,
      c.SEND_STATUS
    )
    .setValue(
      '返信待機中'
    );


  questions
    .getRange(
      questionRow,
      c.UPDATED_AT
    )
    .setValue(
      new Date()
    );


  console.log(
    'LINE返信予約：' +
    Math.round(
      delayMs /
      1000
    ) +
    '秒後 / 行=' +
    questionRow
  );


  return {
    scheduled:
      true,

    delayMs:
      delayMs,

    dueAt:
      dueAt
  };
}


/**
 * =========================================================
 * AI回答生成後に呼ばれる
 *
 * 自動返信：
 * その場では送らず、設定された待ち時間と営業時間で予約
 *
 * 手動返信：
 * 何もしない
 * =========================================================
 */
function autoSendRouteAnswerIfEnabled_(
  questions,
  questionRow,
  lineUserId,
  draft
) {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('autoSendRouteAnswerIfEnabled_');

  const mode =
    getRouteReplyMode_(
      questions
    );


  if (
    mode !==
    '自動返信'
  ) {

    return false;
  }


  /*
   * ここではLINE送信しない。
   * 設定シートに従った送信予約だけ行う。
   */
  scheduleRouteDelayedReply_(
    questions,
    questionRow
  );


  return true;
}


/**
 * =========================================================
 * 1分ごとに呼ばれる遅延返信処理
 * =========================================================
 */
function processRouteDelayedReplies_() {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('processRouteDelayedReplies_');

  const lock =
    LockService
      .getScriptLock();


  if (
    !lock.tryLock(
      20000
    )
  ) {

    console.log(
      '別の遅延返信処理が実行中のため終了します。'
    );

    return;
  }


  try {

    const props =
      PropertiesService
        .getScriptProperties();


    const all =
      props
        .getProperties();


    const nowMs =
      Date.now();


    Object
      .keys(
        all
      )
      .filter(
        function(key) {

          return key.indexOf(
            ROUTE_DELAYED_REPLY
              .PROPERTY_PREFIX
          ) === 0;
        }
      )
      .forEach(
        function(key) {

          let item = null;


          try {

            item =
              JSON.parse(
                all[
                  key
                ]
              );

          }
          catch(parseError) {

            console.error(
              '遅延返信データ解析エラー：' +
              parseError
            );


            props
              .deleteProperty(
                key
              );


            return;
          }


          if (
            !item ||
            !item.dueAt ||
            nowMs <
              Number(
                item.dueAt
              )
          ) {

            return;
          }


          processOneRouteDelayedReply_(
            item,
            key
          );
        }
      );

  }
  finally {

    lock
      .releaseLock();
  }
}


/**
 * =========================================================
 * 1件の遅延返信を送信
 * =========================================================
 */
function processOneRouteDelayedReply_(
  item,
  propertyKey
) {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('processOneRouteDelayedReply_');

  const props =
    PropertiesService
      .getScriptProperties();


  try {

    const ss =
      routeqQaOpenAllowedSpreadsheet_(
          String(
            item.spreadsheetId
          )
        );


    const questions =
      ss.getSheetByName(
        String(
          item.sheetName ||
          'Questions'
        )
      );


    if (!questions) {

      throw new Error(
        'Questionsシートが見つかりません。'
      );
    }


    const row =
      Number(
        item.questionRow
      );


    if (
      !row ||
      row < 2
    ) {

      throw new Error(
        '質問行が不正です。'
      );
    }


    const c =
      ROUTE_QA
        .QUESTION_COL;


    /*
     * 予約後に「手動返信」へ切り替えられた場合は、
     * 自動送信を中止する。
     */
    const mode =
      getRouteReplyMode_(
        questions
      );


    if (
      mode !==
      '自動返信'
    ) {

      questions
        .getRange(
          row,
          c.SEND_STATUS
        )
        .setValue(
          '未送信'
        );


      questions
        .getRange(
          row,
          c.UPDATED_AT
        )
        .setValue(
          new Date()
        );


      props
        .deleteProperty(
          propertyKey
        );


      console.log(
        '手動返信へ変更されたため遅延送信を中止しました。行=' +
        row
      );


      return;
    }


    /*
     * 送信予定時刻になっても営業時間外なら、
     * 次の返信可能時間へ自動で繰り越す。
     * 設定シートを後から変更した場合も、送信直前の設定を優先する。
     */
    const replySettings =
      getRouteReplySettings_(
        questions
      );


    if (
      !isRouteReplyBusinessTime_(
        new Date(),
        replySettings
      )
    ) {

      const nextTiming =
        calculateRouteReplyDueAt_(
          questions,
          new Date()
        );


      item.dueAt =
        nextTiming.dueAt;


      item.rescheduledAt =
        Date.now();


      props
        .setProperty(
          propertyKey,
          JSON.stringify(item)
        );


      questions
        .getRange(
          row,
          c.SEND_STATUS
        )
        .setValue(
          '営業時間外・返信待機中'
        );


      questions
        .getRange(
          row,
          c.UPDATED_AT
        )
        .setValue(
          new Date()
        );


      console.log(
        '営業時間外のため次の返信可能時間へ繰り越しました。行=' +
        row
      );


      return;
    }


    const sendStatus =
      String(
        questions
          .getRange(
            row,
            c.SEND_STATUS
          )
          .getValue() ||
        ''
      )
        .trim();


    /*
     * すでに手動送信済みの場合は何もしない。
     */
    if (
      sendStatus ===
      '送信済'
    ) {

      props
        .deleteProperty(
          propertyKey
        );


      console.log(
        'すでに送信済みのため遅延送信をスキップしました。行=' +
        row
      );


      return;
    }


    const lineUserId =
      String(
        questions
          .getRange(
            row,
            c.LINE_USER_ID
          )
          .getValue() ||
        ''
      )
        .trim();


    /*
     * 送信時点の最新AI回答案を使う。
     */
    const draft =
      String(
        questions
          .getRange(
            row,
            c.AI_ANSWER
          )
          .getValue() ||
        ''
      )
        .trim();


    if (!lineUserId) {

      throw new Error(
        'LINEユーザーIDがありません。'
      );
    }


    if (!draft) {

      throw new Error(
        'AI回答案がありません。'
      );
    }


    const sent =
      sendLinePushMessage_(
        lineUserId,
        draft,
        'question-row-' +
        row
      );


    if (!sent) {

      questions
        .getRange(
          row,
          c.SEND_STATUS
        )
        .setValue(
          '重複送信防止'
        );


      questions
        .getRange(
          row,
          c.UPDATED_AT
        )
        .setValue(
          new Date()
        );


      props
        .deleteProperty(
          propertyKey
        );


      return;
    }


    const now =
      new Date();


    questions
      .getRange(
        row,
        c.FINAL_ANSWER
      )
      .setValue(
        draft
      );


    questions
      .getRange(
        row,
        c.CONFIRMED
      )
      .setValue(
        '確認済'
      );


    questions
      .getRange(
        row,
        c.SEND_STATUS
      )
      .setValue(
        '送信済'
      );


    questions
      .getRange(
        row,
        c.SENT_AT
      )
      .setValue(
        now
      );


    questions
      .getRange(
        row,
        c.UPDATED_AT
      )
      .setValue(
        now
      );


    props
      .deleteProperty(
        propertyKey
      );


    console.log(
      '遅延LINE返信完了：行=' +
      row
    );

  }
  catch(error) {

    console.error(
      '遅延返信エラー：' +
      (
        error &&
        error.stack
          ? error.stack
          : String(
              error
            )
      )
    );


    try {

      const ss =
        routeqQaOpenAllowedSpreadsheet_(
            String(
              item.spreadsheetId
            )
          );


      const questions =
        ss.getSheetByName(
          String(
            item.sheetName ||
            'Questions'
          )
        );


      if (
        questions &&
        item.questionRow
      ) {

        const c =
          ROUTE_QA
            .QUESTION_COL;


        questions
          .getRange(
            Number(
              item.questionRow
            ),
            c.SEND_STATUS
          )
          .setValue(
            '送信エラー'
          );


        questions
          .getRange(
            Number(
              item.questionRow
            ),
            c.UPDATED_AT
          )
          .setValue(
            new Date()
          );
      }

    }
    catch(sheetError) {

      console.error(
        '送信エラー状態の記録にも失敗：' +
        sheetError
      );
    }


    /*
     * 同じ失敗を1分ごとに無限再試行しない。
     */
    props
      .deleteProperty(
        propertyKey
      );
  }
}


/**
 * =========================================================
 * 動作確認
 * LINE送信はしない。
 * ランダム待機時間だけ確認。
 * =========================================================
 */
function testRouteRandomReplyDelay() {

  for (
    let i = 0;
    i < 10;
    i++
  ) {

    const ms =
      getRouteRandomReplyDelayMs_();


    console.log(
      (
        ms /
        60000
      )
        .toFixed(
          2
        ) +
      '分'
    );
  }
}