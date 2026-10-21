// Archived source staging only. NOT DEPLOYABLE. Needs TEST isolation and current-production version confirmation.
/**
 * Questions の最終回答を、完全一致した1箇所だけ部分訂正する。
 * 質問IDは既存運用との互換性を保つため Questions の行番号を使用する。
 */

const ROUTE_CORRECTION_LOG_SHEET = 'Correction_Log';
const ROUTE_ANSWER_RULES_SHEET = 'AnswerRules';


function showRoutePartialCorrectionForm() {
  const html = HtmlService
    .createHtmlOutputFromFile('訂正フォーム')
    .setWidth(560)
    .setHeight(760);

  SpreadsheetApp
    .getUi()
    .showModalDialog(html, '回答の部分訂正');
}


function getRouteCorrectionPreview(questionId) {
  return getRouteCorrectionPreview_(
    questionId,
    openRouteqQaTestSpreadsheet_(),
    {}
  );
}


function getRouteCorrectionPreview_(questionId, spreadsheet, options) {
  const idText = String(questionId || '').trim();
  const id = Number(idText);
  const safeOptions = options || {};
  const sheet = spreadsheet.getSheetByName(
    safeOptions.questionsSheetName || 'Questions'
  );

  if (!sheet) {
    return { ok: false, message: 'Questionsシートが見つかりません。' };
  }

  if (!/^\d+$/.test(idText) || id < 2 || id > sheet.getLastRow()) {
    return { ok: false, message: '有効な質問IDを入力してください。' };
  }

  if (!sheet.getRange(id, 1).getValue()) {
    return { ok: false, message: '質問IDに対応する質問がありません。' };
  }

  const question = String(sheet.getRange(id, 8).getDisplayValue() || '');
  const answer = String(sheet.getRange(id, 10).getDisplayValue() || '');

  if (!answer) {
    return {
      ok: false,
      question: question,
      message: 'この質問の最終回答はまだ空です。'
    };
  }

  return {
    ok: true,
    question: question,
    answer: answer,
    sentences: splitRouteAnswerIntoCorrectionTargets_(answer)
  };
}


function splitRouteAnswerIntoCorrectionTargets_(answer) {
  const matches = String(answer || '').match(
    /[^。！？!?\n]+(?:[。！？!?]+|(?=\n|$))/g
  ) || [];

  return matches
    .map(function(text) {
      return String(text || '').trim();
    })
    .filter(function(text) {
      return text.length > 0;
    });
}


function submitRoutePartialCorrection(formData) {
  return applyRoutePartialCorrection_(
    formData,
    openRouteqQaTestSpreadsheet_()
  );
}


function applyRoutePartialCorrection_(formData, spreadsheet, options) {
  const request = normalizeRoutePartialCorrectionRequest_(formData);
  const ss = spreadsheet;
  const safeOptions = options || {};
  const questionsSheetName = safeOptions.questionsSheetName || 'Questions';
  const questionsSheet = ss.getSheetByName(questionsSheetName);

  if (!questionsSheet) {
    throw new Error('Questionsシートが見つかりません。');
  }

  const validationError = validateRoutePartialCorrectionRequest_(
    request,
    questionsSheet
  );

  if (validationError) {
    appendRouteCorrectionLog_(ss, request, validationError, '', '', safeOptions);
    return {
      ok: false,
      message: validationError
    };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const answerCell = questionsSheet.getRange(request.questionId, 10);
    const beforeAnswer = String(answerCell.getValue() || '');

    if (!beforeAnswer) {
      const message = '対象の最終回答が空のため、自動変更しませんでした。';
      appendRouteCorrectionLog_(ss, request, message, beforeAnswer, beforeAnswer, safeOptions);
      return { ok: false, message: message };
    }

    const matchCount = countRouteLiteralMatches_(
      beforeAnswer,
      request.targetText
    );

    if (matchCount === 0) {
      const message = '訂正対象の文が見つからないため、自動変更しませんでした。';
      appendRouteCorrectionLog_(ss, request, message, beforeAnswer, beforeAnswer, safeOptions);
      return { ok: false, message: message };
    }

    if (matchCount > 1) {
      const message = '訂正対象の文が複数一致したため、自動変更しませんでした。';
      appendRouteCorrectionLog_(ss, request, message, beforeAnswer, beforeAnswer, safeOptions);
      return { ok: false, message: message };
    }

    const afterAnswer = beforeAnswer.replace(
      request.targetText,
      request.replacementText
    );

    answerCell.setValue(afterAnswer);

    const resultMessage = '部分訂正を1箇所反映しました。';
    appendRouteCorrectionLog_(
      ss,
      request,
      resultMessage,
      beforeAnswer,
      afterAnswer,
      safeOptions
    );

    if (request.makeCommonRule) {
      appendRouteAnswerRule_(ss, request, safeOptions);
    }

    return {
      ok: true,
      message: resultMessage
    };
  }
  finally {
    lock.releaseLock();
  }
}


function normalizeRoutePartialCorrectionRequest_(formData) {
  const data = formData || {};
  return {
    questionIdText: String(data.questionId || '').trim(),
    questionId: Number(String(data.questionId || '').trim()),
    targetText: String(data.targetText || '').trim(),
    replacementText: String(data.replacementText || '').trim(),
    reason: String(data.reason || '').trim(),
    makeCommonRule:
      String(data.makeCommonRule || '').toLowerCase() === 'yes' ||
      data.makeCommonRule === true
  };
}


function validateRoutePartialCorrectionRequest_(request, questionsSheet) {
  if (!/^\d+$/.test(request.questionIdText)) {
    return '質問IDが不正なため、自動変更しませんでした。';
  }

  if (
    request.questionId < 2 ||
    request.questionId > questionsSheet.getLastRow()
  ) {
    return '質問IDが不正なため、自動変更しませんでした。';
  }

  if (!questionsSheet.getRange(request.questionId, 1).getValue()) {
    return '質問IDに対応する質問がないため、自動変更しませんでした。';
  }

  if (!request.targetText) {
    return '訂正対象の文を入力してください。';
  }

  if (!request.replacementText) {
    return '訂正後の文を入力してください。';
  }

  if (request.targetText === request.replacementText) {
    return '訂正対象の文と訂正後の文が同じため、自動変更しませんでした。';
  }

  return '';
}


function countRouteLiteralMatches_(text, targetText) {
  if (!targetText) {
    return 0;
  }

  return String(text).split(targetText).length - 1;
}


function appendRouteCorrectionLog_(
  spreadsheet,
  request,
  result,
  beforeAnswer,
  afterAnswer,
  options
) {
  const safeOptions = options || {};
  const sheet = getOrCreateRouteTableSheet_(
    spreadsheet,
    safeOptions.correctionLogSheetName || ROUTE_CORRECTION_LOG_SHEET,
    [
      '受付日時',
      '質問ID',
      '訂正対象の文',
      '訂正後の文',
      '訂正理由',
      '今後の共通ルールにする',
      '処理結果',
      '更新前回答',
      '更新後回答',
      '登録者'
    ]
  );

  sheet.appendRow([
    new Date(),
    request.questionIdText,
    request.targetText,
    request.replacementText,
    request.reason,
    request.makeCommonRule ? 'はい' : 'いいえ',
    result,
    beforeAnswer,
    afterAnswer,
    getRouteCurrentUserEmail_()
  ]);
}


function appendRouteAnswerRule_(spreadsheet, request, options) {
  const safeOptions = options || {};
  const sheet = getOrCreateRouteTableSheet_(
    spreadsheet,
    safeOptions.answerRulesSheetName || ROUTE_ANSWER_RULES_SHEET,
    [
      '登録日時',
      '質問ID',
      '訂正対象の文',
      '訂正後の文',
      '訂正理由',
      '状態',
      '登録者'
    ]
  );

  sheet.appendRow([
    new Date(),
    request.questionIdText,
    request.targetText,
    request.replacementText,
    request.reason,
    '承認待ち',
    getRouteCurrentUserEmail_()
  ]);
}


function getOrCreateRouteTableSheet_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}


function getRouteCurrentUserEmail_() {
  return 'ROUTE';
}


function testRoutePartialCorrectionAndTokenUsage() {
  const testSs = openRouteqQaTestSpreadsheet_();
  const suffix = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHHmmss');
  const names = {
    questionsSheetName: 'TEST_Questions_' + suffix,
    correctionLogSheetName: 'TEST_Correction_Log_' + suffix,
    answerRulesSheetName: 'TEST_AnswerRules_' + suffix,
    usageSheetName: 'TEST_TokenUsage_' + suffix
  };
  const questions = testSs.insertSheet(names.questionsSheetName);
  questions.getRange('A1:J3').setValues([
    ['受付日時', '', '', '', '', '', '', '質問内容', 'AI回答案', '最終回答'],
    [new Date(), '', '', '', '', '', '', 'テスト質問1', '', '前文。訂正対象です。後文。'],
    [new Date(), '', '', '', '', '', '', 'テスト質問2', '', '変更しない回答です。']
  ]);

  const preview = getRouteCorrectionPreview_('2', testSs, names);

  const success = applyRoutePartialCorrection_({
    questionId: '2',
    targetText: '訂正対象です。',
    replacementText: '訂正済みです。',
    reason: '部分訂正テスト',
    makeCommonRule: 'yes'
  }, testSs, names);

  const notFound = applyRoutePartialCorrection_({
    questionId: '3',
    targetText: '存在しない文です。',
    replacementText: '置換されません。',
    reason: '対象文なしテスト',
    makeCommonRule: 'no'
  }, testSs, names);

  const mockResponse = {
    getContentText: function() {
      return JSON.stringify({
        id: 'resp_test_route_usage',
        usage: {
          input_tokens: 120,
          input_tokens_details: { cached_tokens: 20 },
          output_tokens: 30,
          output_tokens_details: { reasoning_tokens: 10 },
          total_tokens: 150
        },
        output: [
          { type: 'web_search_call' },
          { type: 'message' }
        ]
      });
    },
    getResponseCode: function() {
      return 200;
    }
  };

  recordRouteTokenUsage_(
    mockResponse,
    { model: 'test-model' },
    new Date(new Date().getTime() - 1250),
    {
      spreadsheet: testSs,
      questionRow: 2,
      questionText: 'TokenUsageテスト質問',
      usageSheetName: names.usageSheetName
    },
    null
  );

  const successAnswer = questions.getRange(2, 10).getValue();
  const unchangedAnswer = questions.getRange(3, 10).getValue();
  const usageSheet = testSs.getSheetByName(names.usageSheetName);
  const ruleSheet = testSs.getSheetByName(names.answerRulesSheetName);

  const result = {
    testSpreadsheetUrl: testSs.getUrl(),
    questionAndAnswerPreviewed:
      preview.ok &&
      preview.question === 'テスト質問1' &&
      preview.answer === '前文。訂正対象です。後文。' &&
      preview.sentences.indexOf('訂正対象です。') >= 0,
    partialCorrectionSuccess:
      success.ok && successAnswer === '前文。訂正済みです。後文。',
    targetNotFoundSafe:
      !notFound.ok && unchangedAnswer === '変更しない回答です。',
    tokenUsageRecorded:
      usageSheet &&
      usageSheet.getLastRow() === 2 &&
      usageSheet.getRange(2, 9).getValue() === 150,
    pendingRuleRecorded:
      ruleSheet &&
      ruleSheet.getRange(2, 6).getValue() === '承認待ち'
  };

  console.log(JSON.stringify(result));

  [
    names.questionsSheetName,
    names.correctionLogSheetName,
    names.answerRulesSheetName,
    names.usageSheetName
  ].forEach(function(sheetName) {
    const sheet = testSs.getSheetByName(sheetName);
    if (sheet) {
      testSs.deleteSheet(sheet);
    }
  });

  if (
    !result.questionAndAnswerPreviewed ||
    !result.partialCorrectionSuccess ||
    !result.targetNotFoundSafe ||
    !result.tokenUsageRecorded ||
    !result.pendingRuleRecorded
  ) {
    throw new Error('修正テストに失敗しました：' + JSON.stringify(result));
  }

  return result;
}