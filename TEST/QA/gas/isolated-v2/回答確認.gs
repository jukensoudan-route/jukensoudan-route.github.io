/**
 * =========================================================
 * ROUTE Q&A 回答確認.gs
 * 最新未確認質問の自動読込 / AI回答案表示 / 最終回答保存 / LINE送信
 * =========================================================
 *
 * 注意：
 * onOpen() はこのファイルにだけ置いてください。
 * コード.gs / Stripe連携.gs 側に onOpen() がある場合は削除してください。
 */


/* =========================================================
   スプレッドシートを開いたとき
========================================================= */

function onOpen() {

  SpreadsheetApp
    .getUi()
    .createMenu('ROUTE Q&A')

    .addItem(
      '最新の未確認質問を表示',
      'loadLatestUnconfirmedQuestion'
    )

    .addItem(
      '選択行を回答確認で開く',
      'openSelectedQuestionInReview'
    )

    .addSeparator()

    .addItem(
      '最終回答を保存',
      'saveFinalAnswer'
    )

    .addItem(
      '修正指示を反映して改正版を作る',
      'generateRevisedAnswerFromReview'
    )

    .addItem(
      'LINEへ送信',
      'sendCurrentAnswerToLine'
    )

    .addItem(
      '部分訂正フォームを開く',
      'showRoutePartialCorrectionForm'
    )

    .addSeparator()

    .addItem(
      '前の質問',
      'goToPreviousQuestion'
    )

    .addItem(
      '次の質問',
      'goToNextQuestion'
    )

    .addSeparator()

    .addItem(
      '選択ユーザーに1,500円／3回を手動付与',
      'grant1500TicketToSelectedUser'
    )

    .addItem(
      '選択ユーザーに3,500円／10回を手動付与',
      'grant3500TicketToSelectedUser'
    )

    .addSeparator()

    .addItem(
      '必要設定を確認',
      'checkRequiredProperties'
    )

    .addItem(
      '回答確認シートを再作成',
      'setupReviewSheet'
    )

    .addSeparator()

    .addItem(
      '自動バックアップを設定',
      'setupRouteAutomaticBackup'
    )

    .addItem(
      '今すぐバックアップ',
      'backupRouteQaSystem'
    )

    .addToUi();


  /*
   * スプレッドシートを開いた時点で、
   * 最新の「未確認」質問を回答確認へ自動反映。
   *
   * 回答確認タブへ強制移動はしません。
   */
  try {

    loadLatestUnconfirmedQuestion_(
      false,
      false
    );

  }
  catch (error) {

    console.log(
      '回答確認自動読込：' +
      (
        error &&
        error.message
          ? error.message
          : String(error)
      )
    );

  }

}


/* =========================================================
   回答確認シート作成
========================================================= */

function setupReviewSheet() {

  const ss =
    openRouteqQaTestSpreadsheet_();


  let sheet =
    ss.getSheetByName(
      ROUTE_QA.REVIEW
    );


  if (!sheet) {

    sheet =
      ss.insertSheet(
        ROUTE_QA.REVIEW
      );

  }


  /*
   * 既存の結合を解除してから作り直す。
   */
  sheet
    .getRange(
      1,
      1,
      Math.max(
        sheet.getMaxRows(),
        45
      ),
      Math.max(
        sheet.getMaxColumns(),
        6
      )
    )
    .breakApart();


  sheet.clear();
  sheet
    .getRange(
      1,
      1,
      sheet.getMaxRows(),
      sheet.getMaxColumns()
    )
    .clearDataValidations();


  /* ---------- タイトル ---------- */

  sheet
    .getRange('A1:F1')
    .merge();

  sheet
    .getRange('A1')
    .setValue(
      'ROUTE Q&A 回答確認'
    );

  sheet
    .getRange('A2:F2')
    .merge()
    .setValue('質問番号を選ぶ → AI回答案を確認 → 修正指示を書く → 改正版を作る → 保存');


  /* ---------- 基本情報 ---------- */

  sheet.getRange('A3').setValue('◀ 前へ');
  sheet.getRange('B3').insertCheckboxes();
  sheet.getRange('C3:D3').merge().setValue('');
  sheet.getRange('E3').setValue('次へ ▶');
  sheet.getRange('F3').insertCheckboxes();

  sheet
    .getRange('A4')
    .setValue(
      '相談者'
    );

  sheet
    .getRange('D4')
    .setValue(
      '大項目'
    );

  sheet
    .getRange('A5')
    .setValue(
      '質問テーマ'
    );

  sheet
    .getRange('D5')
    .setValue(
      '高校名'
    );


  sheet
    .getRange('B4:C4')
    .merge();

  sheet
    .getRange('E4:F4')
    .merge();

  sheet
    .getRange('B5:C5')
    .merge();

  sheet
    .getRange('E5:F5')
    .merge();


  /* ---------- 質問 ---------- */

  sheet
    .getRange('A7:F7')
    .merge()
    .setValue(
      '質問内容（確認）'
    );

  sheet
    .getRange('A8:F11')
    .merge();


  /* ---------- AI回答 ---------- */

  sheet
    .getRange('A13:F13')
    .merge()
    .setValue(
      '① AI回答案を確認'
    );

  sheet
    .getRange('A14:F21')
    .merge();


  /* ---------- AIへの修正指示 ---------- */

  sheet
    .getRange('A23:F23')
    .merge()
    .setValue(
      '② AIへの修正指示を入力（訂正・追加・削除など）'
    );

  sheet
    .getRange('A24:F28')
    .merge();

  sheet
    .getRange('A30:E31')
    .merge()
    .setValue('修正指示を反映して改正版を作る →');

  sheet
    .getRange('F30:F31')
    .merge()
    .insertCheckboxes();

  /* ---------- 改正版 ---------- */

  sheet
    .getRange('A33:F33')
    .merge()
    .setValue('③ 改正版を確認・必要なら直接編集');

  sheet
    .getRange('A34:F41')
    .merge();


  /* ---------- 状態 ---------- */

  sheet
    .getRange('A43')
    .setValue(
      '状態'
    );

  sheet
    .getRange('B43:F43')
    .merge();


  /* ---------- 操作ガイド ---------- */

  sheet
    .getRange('A45:B46')
    .merge()
    .setValue(
      '④ 最終回答を保存 →'
    );

  sheet
    .getRange('C45:C46')
    .merge()
    .insertCheckboxes();

  sheet
    .getRange('D45:F46')
    .merge()
    .setValue(
      'LINEへ送信'
    );

  sheet
    .getRange('A51:F52')
    .merge()
    .setValue(
      '操作方法：上部中央で質問番号を入力・選択。前後移動と改正版作成は黄色い□をクリック。保存した改正版は今後のAI回答の参考になります。'
    );


  /* =====================================================
     デザイン
  ===================================================== */

  sheet
    .getRange('A1:F1')
    .setBackground('#267EE6')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(16)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet
    .getRange('A2:F2')
    .setBackground('#EAF2FD')
    .setFontColor('#34506F')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');


  [
    'A4',
    'D4',
    'A5',
    'D5',
    'A43'

  ].forEach(
    function(a1) {

      sheet
        .getRange(a1)
        .setBackground('#EAF2FD')
        .setFontWeight('bold');

    }
  );


  sheet.getRange('A7:F7').setBackground('#EAF2FD').setFontColor('#174A7E').setFontWeight('bold');
  sheet.getRange('A13:F13').setBackground('#DCE9FB').setFontColor('#174A7E').setFontWeight('bold');
  sheet.getRange('A23:F23').setBackground('#FFF0D5').setFontColor('#8A4B08').setFontWeight('bold');
  sheet.getRange('A33:F33').setBackground('#DDF3E4').setFontColor('#23653A').setFontWeight('bold');


  [
    'A3',
    'E3',
    'A30:E31',
    'A45:B46',
    'D45:F46'

  ].forEach(
    function(a1) {

      sheet
        .getRange(a1)
        .setBackground('#267EE6')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold')
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle');

    }
  );


  sheet
    .getRange('A24:F28')
    .setBackground('#FFF9E8');

  sheet
    .getRange('A34:F41')
    .setBackground('#F1FBF4');

  sheet
    .getRange('F30:F31')
    .setBackground('#FFF2CC')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet
    .getRange('C45:C46')
    .setBackground('#FFF2CC')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');


  [
    'A8:F11',
    'A14:F21',
    'A24:F28',
    'A34:F41'

  ].forEach(
    function(a1) {

      sheet
        .getRange(a1)
        .setWrap(true)
        .setVerticalAlignment('top');

    }
  );


  sheet
    .getRange('A51:F52')
    .setBackground('#F3F6FA')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  sheet.getRange('A3:F3').setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.getRange('B3').setBackground('#FFF2CC').setBorder(true, true, true, true, false, false, '#E0B000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.getRange('F3').setBackground('#FFF2CC').setBorder(true, true, true, true, false, false, '#E0B000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.getRange('C3:D3').setBackground('#FFF9E8').setFontWeight('bold').setFontSize(13)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  sheet.getRange('C3').setNote('質問番号を直接入力するか、プルダウンから選択してください。');

  [
    'A8:F11',
    'A14:F21',
    'A24:F28',
    'A34:F41',
    'B43:F43'
  ].forEach(function(a1) {
    sheet.getRange(a1).setBorder(true, true, true, true, false, false, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);
  });

  sheet.getRange('A30:F31').setBorder(true, true, true, true, false, false, '#E0B000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.getRange('A45:C46').setBorder(true, true, true, true, false, false, '#E0B000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.getRange('D45:F46').setBorder(true, true, true, true, false, false, '#1B5FB4', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  sheet.setRowHeight(1, 40);
  sheet.setRowHeight(2, 26);
  sheet.setRowHeight(3, 36);
  sheet.setRowHeight(7, 28);
  sheet.setRowHeight(13, 28);
  sheet.setRowHeight(23, 30);
  sheet.setRowHeight(33, 30);
  sheet.setRowHeights(30, 2, 28);
  sheet.setRowHeights(45, 2, 28);
  sheet.setHiddenGridlines(true);

  sheet.setFrozenRows(3);


  for (
    let column = 1;
    column <= 6;
    column++
  ) {

    sheet.setColumnWidth(
      column,
      150
    );

  }


  sheet.setColumnWidth(
    1,
    170
  );


  /*
   * 作成直後に最新質問を読み込む。
   */
  try {

    loadLatestUnconfirmedQuestion_(
      false,
      false
    );

  }
  catch (error) {

    console.log(
      error
    );

  }

  ensureRouteReviewEditTrigger_();


  SpreadsheetApp
    .getActive()
    .toast(
      '回答確認シートを作成しました。',
      'ROUTE Q&A',
      3
    );

}


/* =========================================================
   回答確認シート内の操作
========================================================= */

function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== ROUTE_QA.REVIEW) return;

  const a1 = e.range.getA1Notation();

  if (a1 === 'B3' && sheet.getRange('B3').getValue() === true) {
    try { goToPreviousQuestion(); }
    finally { sheet.getRange('B3').setValue(false); }
    return;
  }

  if (a1 === 'F3' && sheet.getRange('F3').getValue() === true) {
    try { goToNextQuestion(); }
    finally { sheet.getRange('F3').setValue(false); }
    return;
  }

}


function handleRouteReviewInstalledEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== ROUTE_QA.REVIEW) return;

  const a1 = e.range.getA1Notation();

  if (a1 === 'C3' || a1 === 'C3:D3') {
    const lock = LockService.getDocumentLock();
    try {
      lock.waitLock(30000);
      const row = Number(sheet.getRange('C3').getValue());
      loadQuestionToReview_(row, true);
    }
    catch (error) {
      SpreadsheetApp.getActive().toast(
        error && error.message ? error.message : String(error),
        '質問番号',
        4
      );
    }
    finally {
      try { lock.releaseLock(); }
      catch (ignore) {}
    }
    return;
  }

  if ((a1 === 'F30' || a1 === 'F30:F31') &&
      sheet.getRange('F30').getValue() === true) {
    try {
      generateRevisedAnswerFromReview();
    }
    finally {
      sheet.getRange('F30').setValue(false);
    }
    return;
  }

  if ((a1 === 'C45' || a1 === 'C45:C46') &&
      sheet.getRange('C45').getValue() === true) {
    try {
      saveFinalAnswer();
    }
    finally {
      sheet.getRange('C45').setValue(false);
    }
  }
}


function handleRouteReviewInstalledEdit_(e) {
  return handleRouteReviewInstalledEdit(e);
}


function ensureRouteReviewEditTrigger_() {
  const handler = 'handleRouteReviewInstalledEdit';
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'handleRouteReviewInstalledEdit_') {
      routeqQaRejectTriggerMutation_(trigger);
    }
  });

  const exists = triggers.some(function(trigger) {
    return trigger.getHandlerFunction() === handler;
  });

  if (!exists) {
    routeqQaRejectTriggerMutation_(handler)
      .forSpreadsheet(openRouteqQaTestSpreadsheet_())
      .onEdit()
      .create();
  }
}


function generateRevisedAnswerFromReview() {
  const ss = openRouteqQaTestSpreadsheet_();
  const review = ss.getSheetByName(ROUTE_QA.REVIEW);
  const questions = ss.getSheetByName(ROUTE_QA.QUESTIONS);
  const row = Number(review.getRange('C3').getValue());
  const instruction = String(review.getRange('A24').getValue() || '').trim();

  if (!row || row < 2 || row > questions.getLastRow()) {
    throw new Error('有効な質問番号を選択してください。');
  }
  if (!instruction) {
    throw new Error('AIへの修正指示を入力してください。');
  }

  const question = String(review.getRange('A8').getValue() || '').trim();
  const original = String(review.getRange('A14').getValue() || '').trim();
  if (!original) {
    throw new Error('AI回答案がありません。');
  }

  review.getRange('A34').setValue('改正版を生成しています…');
  SpreadsheetApp.flush();

  const payload = {
    model: OPENAI_MODEL_LOW_COST || OPENAI_MODEL,
    instructions:
      'あなたは高校受験Q&Aの回答編集者です。元の回答の事実関係と質問範囲を守り、運営者の修正指示を正確に反映してください。' +
      '指示されていない情報を勝手に追加せず、保護者に分かりやすい日本語で、改正版の回答本文だけを出力してください。',
    input:
      '【質問】\n' + question +
      '\n\n【元のAI回答案】\n' + original +
      '\n\n【運営者の修正指示】\n' + instruction,
    reasoning: { effort: 'low' },
    max_output_tokens: 1800,
    store: false
  };

  const response = callRouteOpenAiResponse_(getRouteOpenAiApiKey_(), payload);
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('改正版の生成に失敗しました。HTTP ' + status);
  }

  const answer = extractResponseText_(JSON.parse(response.getContentText()));
  if (!answer) throw new Error('改正版の本文を取得できませんでした。');

  review.getRange('A34').setValue(answer);
  SpreadsheetApp.getActive().toast(
    '改正版を作成しました。内容を確認して保存してください。',
    'ROUTE Q&A',
    5
  );
}


function applyReviewSheetPartialCorrection_() {
  const ss = openRouteqQaTestSpreadsheet_();
  const review = ss.getSheetByName(ROUTE_QA.REVIEW);

  try {
    const result = submitRoutePartialCorrection({
      questionId: review.getRange('C3').getValue(),
      targetText: review.getRange('B45').getValue(),
      replacementText: review.getRange('B48').getValue(),
      reason: review.getRange('B51').getValue(),
      makeCommonRule: review.getRange('E51').getValue() === 'はい'
    });

    SpreadsheetApp.getActive().toast(result.message, '部分訂正', 5);

    if (result.ok) {
      const row = Number(review.getRange('C3').getValue());
      review.getRange('B45').clearContent();
      review.getRange('B48').clearContent();
      review.getRange('B51').clearContent();
      review.getRange('E51').setValue('いいえ');
      loadQuestionToReview_(row, true);
    }
  }
  catch (error) {
    SpreadsheetApp.getActive().toast(
      error && error.message ? error.message : String(error),
      '部分訂正エラー',
      6
    );
  }
  finally {
    review.getRange('F54').setValue(false);
  }
}


function configureReviewSheetControls_(review, questions, currentAnswer) {
  const lastRow = questions.getLastRow();
  const questionRows = [];

  if (lastRow >= 2) {
    const values = questions
      .getRange(2, ROUTE_QA.QUESTION_COL.QUESTION, lastRow - 1, 1)
      .getDisplayValues();

    values.forEach(function(item, index) {
      if (String(item[0] || '').trim()) questionRows.push(String(index + 2));
    });
  }

  const idCell = review.getRange('C3');
  if (questionRows.length) {
    idCell.setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(questionRows, true)
        .setAllowInvalid(true)
        .setHelpText('Questionsの行番号を入力するか、一覧から選択してください。')
        .build()
    );
  }

}


/* =========================================================
   最新の未確認質問を表示
========================================================= */

function loadLatestUnconfirmedQuestion() {

  loadLatestUnconfirmedQuestion_(
    true,
    true
  );

}


/**
 * activateReview:
 *   true  = 回答確認タブへ移動
 *   false = 値だけ更新
 *
 * showNotice:
 *   true  = 対象がない場合に通知
 *   false = 無言
 */
function loadLatestUnconfirmedQuestion_(
  activateReview,
  showNotice
) {

  const ss =
    openRouteqQaTestSpreadsheet_();


  const questions =
    ss.getSheetByName(
      ROUTE_QA.QUESTIONS
    );


  if (!questions) {

    throw new Error(
      'Questionsシートが見つかりません。'
    );

  }


  const lastRow =
    questions.getLastRow();


  if (
    lastRow < 2
  ) {

    if (showNotice) {

      SpreadsheetApp
        .getActive()
        .toast(
          '質問データはまだありません。',
          'ROUTE Q&A',
          3
        );

    }

    return;

  }


  const c =
    ROUTE_QA.QUESTION_COL;


  const values =
    questions
      .getRange(
        2,
        1,
        lastRow - 1,
        17
      )
      .getValues();


  let targetRow =
    -1;


  /*
   * 下から検索し、
   * ① 質問あり
   * ② AI回答案あり
   * ③ 未確認
   * の最新行を優先。
   */
  for (
    let i =
      values.length - 1;

    i >= 0;

    i--
  ) {

    const row =
      values[i];


    const question =
      String(
        row[
          c.QUESTION - 1
        ] || ''
      )
      .trim();


    const aiAnswer =
      String(
        row[
          c.AI_ANSWER - 1
        ] || ''
      )
      .trim();


    const confirmed =
      String(
        row[
          c.CONFIRMED - 1
        ] || ''
      )
      .trim();


    if (
      question &&
      aiAnswer &&
      confirmed !== '確認済'
    ) {

      targetRow =
        i + 2;

      break;

    }

  }


  /*
   * 未確認がなければ、
   * AI回答案がある最新質問を表示。
   */
  if (
    targetRow === -1
  ) {

    for (
      let i =
        values.length - 1;

      i >= 0;

      i--
    ) {

      const row =
        values[i];


      const question =
        String(
          row[
            c.QUESTION - 1
          ] || ''
        )
        .trim();


      const aiAnswer =
        String(
          row[
            c.AI_ANSWER - 1
          ] || ''
        )
        .trim();


      if (
        question &&
        aiAnswer
      ) {

        targetRow =
          i + 2;

        break;

      }

    }

  }


  if (
    targetRow === -1
  ) {

    if (showNotice) {

      SpreadsheetApp
        .getActive()
        .toast(
          'AI回答案が生成済みの質問はありません。',
          'ROUTE Q&A',
          4
        );

    }

    return;

  }


  loadQuestionToReview_(
    targetRow,
    activateReview
  );

}


/* =========================================================
   Questionsで選択した行を回答確認へ
========================================================= */

function openSelectedQuestionInReview() {

  const ss =
    openRouteqQaTestSpreadsheet_();


  const sheet =
    ss.getActiveSheet();


  if (
    sheet.getName() !==
    ROUTE_QA.QUESTIONS
  ) {

    SpreadsheetApp
      .getUi()
      .alert(
        'Questionsシートで対象の行を選択してください。'
      );

    return;

  }


  const row =
    sheet
      .getActiveCell()
      .getRow();


  if (
    row < 2
  ) {

    SpreadsheetApp
      .getUi()
      .alert(
        '質問データの行を選択してください。'
      );

    return;

  }


  loadQuestionToReview_(
    row,
    true
  );

}


/* =========================================================
   Questions → 回答確認へ表示
========================================================= */

function loadQuestionToReview_(
  row,
  activateReview
) {

  const ss =
    openRouteqQaTestSpreadsheet_();


  const questions =
    ss.getSheetByName(
      ROUTE_QA.QUESTIONS
    );


  let review =
    ss.getSheetByName(
      ROUTE_QA.REVIEW
    );


  if (!review) {

    setupReviewSheet();

    review =
      ss.getSheetByName(
        ROUTE_QA.REVIEW
      );

  }


  if (!questions) {

    throw new Error(
      'Questionsシートが見つかりません。'
    );

  }


  const lastRow =
    questions.getLastRow();


  if (
    row < 2 ||
    row > lastRow
  ) {

    throw new Error(
      '指定された質問行が正しくありません。'
    );

  }


  const values =
    questions
      .getRange(
        row,
        1,
        1,
        17
      )
      .getValues()[0];


  const c =
    ROUTE_QA.QUESTION_COL;


  const displayName =
    values[
      c.DISPLAY_NAME - 1
    ] || '';


  const category =
    values[
      c.CATEGORY - 1
    ] || '';


  const theme =
    values[
      c.THEME - 1
    ] || '';


  const school =
    values[
      c.SCHOOL - 1
    ] || '';


  const question =
    values[
      c.QUESTION - 1
    ] || '';


  const aiAnswer =
    values[
      c.AI_ANSWER - 1
    ] || '';


  const finalAnswer =
    values[
      c.FINAL_ANSWER - 1
    ] || '';


  /* ---------- 基本情報 ---------- */

  review
    .getRange('C3')
    .setValue(
      row
    );


  review
    .getRange('B4')
    .setValue(
      displayName
    );


  review
    .getRange('E4')
    .setValue(
      category
    );


  review
    .getRange('B5')
    .setValue(
      theme
    );


  review
    .getRange('E5')
    .setValue(
      school ||
      '未選択'
    );


  /* ---------- 質問内容 ---------- */

  review
    .getRange('A8')
    .setValue(
      question
    );


  /* ---------- AI回答案 ---------- */

  review
    .getRange('A14')
    .setValue(
      aiAnswer
    );

  review.getRange('A24').clearContent();
  review.getRange('F30').setValue(false);
  review.getRange('C45').setValue(false);


  /*
   * 最終回答がまだない場合は、
   * AI回答案をそのまま編集欄へコピー。
   */
  review
    .getRange('A34')
    .setValue(
      finalAnswer ||
      aiAnswer ||
      ''
    );


  /* ---------- 番号・部分訂正の選択肢 ---------- */

  configureReviewSheetControls_(
    review,
    questions,
    finalAnswer || aiAnswer || ''
  );


  /* ---------- 状態 ---------- */

  const aiStatus =
    values[
      c.AI_STATUS - 1
    ] || '-';


  const confirmed =
    values[
      c.CONFIRMED - 1
    ] || '-';


  const sendStatus =
    values[
      c.SEND_STATUS - 1
    ] || '-';


  const ticket =
    values[
      c.TICKET_LABEL - 1
    ] || '-';


  const remaining =
    values[
      c.REMAINING_AFTER - 1
    ];


  const status =
    [
      'AI：' +
      aiStatus,

      '確認：' +
      confirmed,

      '送信：' +
      sendStatus,

      '利用：' +
      ticket,

      '残り：' +
      (
        remaining === '' ||
        remaining == null
          ? '-'
          : remaining
      ) +
      '回'

    ]
    .join(
      ' ／ '
    );


  review
    .getRange('B43')
    .setValue(
      status
    );


  /*
   * 表示時に回答欄が見やすくなるよう行高を調整。
   */
  review
    .setRowHeights(
      14,
      8,
      28
    );


  review
    .setRowHeights(
      34,
      8,
      28
    );


  if (
    activateReview !== false
  ) {

    review.activate();

    review
      .getRange('A1')
      .activate();

  }

}


/* =========================================================
   最終回答保存
========================================================= */

function saveFinalAnswer() {

  const ss =
    openRouteqQaTestSpreadsheet_();


  const review =
    ss.getSheetByName(
      ROUTE_QA.REVIEW
    );


  const questions =
    ss.getSheetByName(
      ROUTE_QA.QUESTIONS
    );


  if (
    !review ||
    !questions
  ) {

    SpreadsheetApp
      .getUi()
      .alert(
        '回答確認またはQuestionsシートが見つかりません。'
      );

    return;

  }


  const row =
    Number(
      review
        .getRange('C3')
        .getValue()
    );


  if (
    !row ||
    row < 2
  ) {

    SpreadsheetApp
      .getUi()
      .alert(
        '回答確認画面に質問が読み込まれていません。'
      );

    return;

  }


  const answer =
    String(
      review
        .getRange('A34')
        .getValue() ||
      ''
    )
    .trim();


  if (
    !answer
  ) {

    SpreadsheetApp
      .getUi()
      .alert(
        '最終回答が空欄です。'
      );

    return;

  }


  const c =
    ROUTE_QA.QUESTION_COL;


  questions
    .getRange(
      row,
      c.FINAL_ANSWER
    )
    .setValue(
      answer
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
      c.UPDATED_AT
    )
    .setValue(
      new Date()
    );


  loadQuestionToReview_(
    row,
    true
  );


  SpreadsheetApp
    .getActive()
    .toast(
      '最終回答を保存しました。',
      'ROUTE Q&A',
      3
    );

}


/* =========================================================
   前後移動
========================================================= */

function goToPreviousQuestion() {

  moveQuestion_(
    -1
  );

}


function goToNextQuestion() {

  moveQuestion_(
    1
  );

}


function moveQuestion_(
  direction
) {

  const ss =
    openRouteqQaTestSpreadsheet_();


  const review =
    ss.getSheetByName(
      ROUTE_QA.REVIEW
    );


  const questions =
    ss.getSheetByName(
      ROUTE_QA.QUESTIONS
    );


  if (
    !review ||
    !questions
  ) {

    return;

  }


  let row =
    Number(
      review
        .getRange('C3')
        .getValue()
    );


  if (
    !row ||
    row < 2
  ) {

    row =
      direction > 0
        ? 1
        : questions.getLastRow() + 1;

  }


  const lastRow =
    questions.getLastRow();


  let nextRow =
    row +
    direction;


  while (
    nextRow >= 2 &&
    nextRow <= lastRow
  ) {

    const question =
      String(
        questions
          .getRange(
            nextRow,
            ROUTE_QA
              .QUESTION_COL
              .QUESTION
          )
          .getValue() ||
        ''
      )
      .trim();


    if (
      question
    ) {

      loadQuestionToReview_(
        nextRow,
        true
      );

      return;

    }


    nextRow +=
      direction;

  }


  SpreadsheetApp
    .getActive()
    .toast(
      direction > 0
        ? '次の質問はありません。'
        : '前の質問はありません。',
      'ROUTE Q&A',
      3
    );

}


/* =========================================================
   LINE送信
========================================================= */

function sendCurrentAnswerToLine() {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('sendCurrentAnswerToLine');

  const ui =
    SpreadsheetApp
      .getUi();


  const ss =
    openRouteqQaTestSpreadsheet_();


  const review =
    ss.getSheetByName(
      ROUTE_QA.REVIEW
    );


  const questions =
    ss.getSheetByName(
      ROUTE_QA.QUESTIONS
    );


  if (
    !review ||
    !questions
  ) {

    ui.alert(
      '回答確認またはQuestionsシートが見つかりません。'
    );

    return;

  }


  const row =
    Number(
      review
        .getRange('C3')
        .getValue()
    );


  if (
    !row ||
    row < 2
  ) {

    ui.alert(
      '回答確認画面に質問が読み込まれていません。'
    );

    return;

  }


  const answer =
    String(
      review
        .getRange('A34')
        .getValue() ||
      ''
    )
    .trim();


  if (
    !answer
  ) {

    ui.alert(
      '送信する回答が空欄です。'
    );

    return;

  }


  const c =
    ROUTE_QA.QUESTION_COL;


  const values =
    questions
      .getRange(
        row,
        1,
        1,
        17
      )
      .getValues()[0];


  const lineUserId =
    String(
      values[
        c.LINE_USER_ID - 1
      ] ||
      ''
    )
    .trim();


  const displayName =
    String(
      values[
        c.DISPLAY_NAME - 1
      ] ||
      ''
    )
    .trim();


  const sendStatus =
    String(
      values[
        c.SEND_STATUS - 1
      ] ||
      ''
    )
    .trim();


  if (
    !lineUserId
  ) {

    ui.alert(
      'この質問にはLINEユーザーIDがありません。'
    );

    return;

  }


  if (
    sendStatus ===
    '送信済'
  ) {

    ui.alert(
      'この回答はすでにLINEへ送信済です。'
    );

    return;

  }


  const result =
    ui.alert(
      'LINE送信確認',
      (
        displayName
          ? displayName +
            ' さんへ\n\n'
          : ''
      ) +
      '現在表示している最終回答をLINEへ送信します。\nよろしいですか？',
      ui.ButtonSet.YES_NO
    );


  if (
    result !==
    ui.Button.YES
  ) {

    return;

  }


  /*
   * 送信直前の内容をQuestionsへ保存。
   */
  questions
    .getRange(
      row,
      c.FINAL_ANSWER
    )
    .setValue(
      answer
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
      c.UPDATED_AT
    )
    .setValue(
      new Date()
    );


  try {

    sendLinePushMessage_(
      lineUserId,
      answer,
      'question-row:' + row
    );


    const now =
      new Date();


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


    loadQuestionToReview_(
      row,
      true
    );


    SpreadsheetApp
      .getActive()
      .toast(
        'LINEへ送信しました。',
        'ROUTE Q&A',
        4
      );

  }
  catch (error) {

    questions
      .getRange(
        row,
        c.SEND_STATUS
      )
      .setValue(
        '送信エラー'
      );


    questions
      .getRange(
        row,
        c.UPDATED_AT
      )
      .setValue(
        new Date()
      );


    ui.alert(
      'LINE送信エラー',
      (
        error &&
        error.message
          ? error.message
          : String(error)
      ),
      ui.ButtonSet.OK
    );

  }

}


/* =========================================================
   管理者による手動回数付与
========================================================= */

function grant1500TicketToSelectedUser() {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('grant1500TicketToSelectedUser');

  grantRouteTicket_(
    1500,
    3,
    '1,500円／3回'
  );

}


function grant3500TicketToSelectedUser() {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('grant3500TicketToSelectedUser');

  grantRouteTicket_(
    3500,
    10,
    '3,500円／10回'
  );

}


function grantRouteTicket_(
  amount,
  count,
  label
) {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('grantRouteTicket_');

  const ui =
    SpreadsheetApp
      .getUi();


  const ss =
    openRouteqQaTestSpreadsheet_();


  const sheet =
    ss.getActiveSheet();


  if (
    sheet.getName() !==
    ROUTE_QA.USERS
  ) {

    ui.alert(
      'Usersシートで購入者の行を選択してください。'
    );

    return;

  }


  const row =
    sheet
      .getActiveCell()
      .getRow();


  if (
    row < 2
  ) {

    ui.alert(
      '購入者の行を選択してください。'
    );

    return;

  }


  const values =
    sheet
      .getRange(
        row,
        1,
        1,
        12
      )
      .getValues()[0];


  const result =
    ui.alert(
      '回数券を手動付与',
      label +
      'を付与します。\nよろしいですか？',
      ui.ButtonSet.YES_NO
    );


  if (
    result !==
    ui.Button.YES
  ) {

    return;

  }


  const currentPaid =
    Number(
      values[4] ||
      0
    );


  const currentGranted =
    Number(
      values[5] ||
      0
    );


  const currentRemaining =
    Number(
      values[7] ||
      0
    );


  sheet
    .getRange(
      row,
      ROUTE_QA
        .USER_COL
        .MEMBER_STATUS
    )
    .setValue(
      '有効'
    );


  sheet
    .getRange(
      row,
      ROUTE_QA
        .USER_COL
        .LAST_TICKET
    )
    .setValue(
      label
    );


  sheet
    .getRange(
      row,
      ROUTE_QA
        .USER_COL
        .TOTAL_PAID
    )
    .setValue(
      currentPaid +
      amount
    );


  sheet
    .getRange(
      row,
      ROUTE_QA
        .USER_COL
        .TOTAL_GRANTED
    )
    .setValue(
      currentGranted +
      count
    );


  sheet
    .getRange(
      row,
      ROUTE_QA
        .USER_COL
        .REMAINING
    )
    .setValue(
      currentRemaining +
      count
    );


  sheet
    .getRange(
      row,
      ROUTE_QA
        .USER_COL
        .UPDATED_AT
    )
    .setValue(
      new Date()
    );


  SpreadsheetApp
    .getActive()
    .toast(
      label +
      'を手動付与しました。',
      'ROUTE Q&A',
      4
    );

}