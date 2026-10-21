// Archived source staging only. NOT DEPLOYABLE. Needs TEST isolation and current-production version confirmation.
/**
 * =========================================================
 * ROUTE Q&A 回答モード切替.gs
 *
 * 自動返信時：
 * AI回答生成直後にはLINE送信せず、
 * 5〜10分のランダム時間後に送信する。
 *
 * 方式：
 * ・質問ごとのトリガーは作らない
 * ・共通の1分トリガーを必要時だけ1個作る
 * ・送信予定は Script Properties に保存
 * ・未処理がなくなれば共通トリガーを削除
 * =========================================================
 */

const ROUTE_DELAYED_REPLY_PREFIX =
  'ROUTE_DELAYED_REPLY_';

const ROUTE_DELAYED_REPLY_HANDLER =
  'processRouteDelayedReplies_';


function routeqQaArchived_getRouteReplyMode_(questions) {

  let ss = null;


  if (
    questions &&
    typeof questions.getParent === 'function'
  ) {

    ss =
      questions.getParent();

  }


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
 * 5分以上10分以下のランダム遅延。
 */
function routeqQaArchived_getRouteRandomReplyDelayMs_() {

  const minMs =
    5 * 60 * 1000;

  const maxMs =
    10 * 60 * 1000;


  return (
    minMs +
    Math.floor(
      Math.random() *
      (
        maxMs -
        minMs +
        1
      )
    )
  );

}


/**
 * 質問行ごとの予約キー。
 */
function getRouteDelayedReplyKey_(
  spreadsheetId,
  questionRow
) {

  return (
    ROUTE_DELAYED_REPLY_PREFIX +
    String(spreadsheetId) +
    '_' +
    String(questionRow)
  );

}


/**
 * 共通の1分トリガーがなければ1個だけ作成。
 */
function routeqQaArchived_ensureRouteDelayedReplyTrigger_() {

  const exists =
    ScriptApp
      .getProjectTriggers()
      .some(
        function(trigger) {

          return (
            trigger
              .getHandlerFunction() ===
            ROUTE_DELAYED_REPLY_HANDLER
          );

        }
      );


  if (exists) {

    return;

  }


  routeqQaRejectTriggerMutation_(
      ROUTE_DELAYED_REPLY_HANDLER
    )
    .timeBased()
    .everyMinutes(1)
    .create();

}


/**
 * 遅延返信が残っていなければ
 * 共通トリガーを削除して無駄な実行を止める。
 */
function cleanupRouteDelayedReplyTriggerIfIdle_() {

  const properties =
    PropertiesService
      .getScriptProperties()
      .getProperties();


  const hasPending =
    Object.keys(
      properties
    )
      .some(
        function(key) {

          return key.indexOf(
            ROUTE_DELAYED_REPLY_PREFIX
          ) === 0;

        }
      );


  if (hasPending) {

    return;

  }


  ScriptApp
    .getProjectTriggers()
    .forEach(
      function(trigger) {

        if (
          trigger
            .getHandlerFunction() ===
          ROUTE_DELAYED_REPLY_HANDLER
        ) {

          routeqQaRejectTriggerMutation_(
              trigger
            );

        }

      }
    );

}


/**
 * 自動返信の送信予約。
 *
 * AI回答はすでに Questions の AI_ANSWER に保存済みなので、
 * Script Propertiesには回答本文を保存しない。
 */
function routeqQaArchived_scheduleRouteDelayedReply_(
  questions,
  questionRow
) {

  if (
    !questions ||
    !questionRow
  ) {

    throw new Error(
      '遅延返信予約に必要な質問行を取得できませんでした。'
    );

  }


  const ss =
    questions.getParent();

  const spreadsheetId =
    ss.getId();

  const delayMs =
    routeqQaArchived_getRouteRandomReplyDelayMs_();

  const dueAt =
    Date.now() +
    delayMs;

  const key =
    getRouteDelayedReplyKey_(
      spreadsheetId,
      questionRow
    );


  const payload = {
    spreadsheetId:
      spreadsheetId,

    sheetName:
      questions.getName(),

    questionRow:
      Number(
        questionRow
      ),

    createdAt:
      Date.now(),

    dueAt:
      dueAt,

    retryCount:
      0
  };


  PropertiesService
    .getScriptProperties()
    .setProperty(
      key,
      JSON.stringify(
        payload
      )
    );


  questions
    .getRange(
      questionRow,
      ROUTE_QA
        .QUESTION_COL
        .SEND_STATUS
    )
    .setValue(
      '送信予約'
    );


  questions
    .getRange(
      questionRow,
      ROUTE_QA
        .QUESTION_COL
        .UPDATED_AT
    )
    .setValue(
      new Date()
    );


  routeqQaArchived_ensureRouteDelayedReplyTrigger_();


  console.log(
    'ROUTE自動返信を予約しました。予定時刻=' +
    new Date(
      dueAt
    )
  );


  return true;

}


/**
 * コード.gs からAI回答生成後に呼ばれる関数。
 *
 * 手動返信：
 * 何もしない。
 *
 * 自動返信：
 * その場では送らず5〜10分後の予約だけ行う。
 */
function routeqQaArchived_autoSendRouteAnswerIfEnabled_(
  questions,
  questionRow,
  lineUserId,
  draft
) {

  const mode =
    routeqQaArchived_getRouteReplyMode_(
      questions
    );


  if (
    mode !==
    '自動返信'
  ) {

    return false;

  }


  if (
    !lineUserId
  ) {

    throw new Error(
      '遅延返信の送信先LINEユーザーIDがありません。'
    );

  }


  if (
    !draft
  ) {

    throw new Error(
      '遅延返信するAI回答がありません。'
    );

  }


  /*
   * 重要：
   * ここでは sendLinePushMessage_ を呼ばない。
   * 即時送信を完全に防ぐ。
   */
  return routeqQaArchived_scheduleRouteDelayedReply_(
    questions,
    questionRow
  );

}


/**
 * 共通トリガーから1分ごとに呼ばれる。
 * 期限到来した質問だけLINE送信。
 */
function routeqQaArchived_processRouteDelayedReplies_() {

  const lock =
    LockService
      .getScriptLock();


  if (
    !lock.tryLock(
      20000
    )
  ) {

    return;

  }


  try {

    const props =
      PropertiesService
        .getScriptProperties();

    const all =
      props.getProperties();

    const now =
      Date.now();


    Object.keys(
      all
    )
      .filter(
        function(key) {

          return key.indexOf(
            ROUTE_DELAYED_REPLY_PREFIX
          ) === 0;

        }
      )
      .forEach(
        function(key) {

          let item = null;


          try {

            item =
              JSON.parse(
                all[key]
              );

          }
          catch(parseError) {

            console.error(
              '遅延返信予約データ破損：' +
              key
            );

            props
              .deleteProperty(
                key
              );

            return;

          }


          if (
            !item ||
            Number(
              item.dueAt || 0
            ) >
            now
          ) {

            return;

          }


          try {

            const ss =
              routeqQaOpenAllowedSpreadsheet_(
                  item.spreadsheetId
                );

            const questions =
              ss.getSheetByName(
                item.sheetName ||
                ROUTE_QA.SHEETS.QUESTIONS
              );


            if (!questions) {

              throw new Error(
                'Questionsシートを取得できませんでした。'
              );

            }


            const row =
              Number(
                item.questionRow
              );

            const c =
              ROUTE_QA
                .QUESTION_COL;


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
             * すでに送信済なら予約だけ削除。
             */
            if (
              sendStatus ===
              '送信済'
            ) {

              props
                .deleteProperty(
                  key
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
                (
                  'route-question-' +
                  item.spreadsheetId +
                  '-' +
                  row
                )
              );


            if (!sent) {

              throw new Error(
                'LINE送信結果がfalseでした。'
              );

            }


            const sentAt =
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
                sentAt
              );


            questions
              .getRange(
                row,
                c.UPDATED_AT
              )
              .setValue(
                sentAt
              );


            props
              .deleteProperty(
                key
              );


            console.log(
              'ROUTE遅延返信を送信しました。行=' +
              row
            );

          }
          catch(sendError) {

            const retryCount =
              Number(
                item.retryCount || 0
              ) +
              1;


            console.error(
              'ROUTE遅延返信エラー：' +
              (
                sendError &&
                sendError.message
                  ? sendError.message
                  : String(
                      sendError
                    )
              )
            );


            if (
              retryCount >=
              3
            ) {

              try {

                const ss =
                  routeqQaOpenAllowedSpreadsheet_(
                      item.spreadsheetId
                    );

                const questions =
                  ss.getSheetByName(
                    item.sheetName ||
                    ROUTE_QA.SHEETS.QUESTIONS
                  );

                if (questions) {

                  questions
                    .getRange(
                      Number(
                        item.questionRow
                      ),
                      ROUTE_QA
                        .QUESTION_COL
                        .SEND_STATUS
                    )
                    .setValue(
                      '送信エラー'
                    );


                  questions
                    .getRange(
                      Number(
                        item.questionRow
                      ),
                      ROUTE_QA
                        .QUESTION_COL
                        .UPDATED_AT
                    )
                    .setValue(
                      new Date()
                    );

                }

              }
              catch(sheetError) {

                console.error(
                  sheetError
                );

              }


              props
                .deleteProperty(
                  key
                );

            }
            else {

              item.retryCount =
                retryCount;

              /*
               * 失敗時は1分後に再試行。
               */
              item.dueAt =
                Date.now() +
                60 * 1000;


              props
                .setProperty(
                  key,
                  JSON.stringify(
                    item
                  )
                );

            }

          }

        }
      );


    cleanupRouteDelayedReplyTriggerIfIdle_();

  }
  finally {

    lock.releaseLock();

  }

}


/**
 * 動作確認用。
 * 20回生成して全て5〜10分内か確認。
 */
function routeqQaArchived_testRouteRandomReplyDelay() {

  let allOk =
    true;


  for (
    let i = 0;
    i < 20;
    i++
  ) {

    const ms =
      routeqQaArchived_getRouteRandomReplyDelayMs_();

    const minutes =
      ms /
      60000;


    console.log(
      'delay=' +
      minutes.toFixed(
        2
      ) +
      '分'
    );


    if (
      minutes < 5 ||
      minutes > 10
    ) {

      allOk =
        false;

    }

  }


  console.log(
    'すべて5〜10分=true：' +
    allOk
  );

}