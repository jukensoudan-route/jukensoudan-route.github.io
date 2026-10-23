/**
 * Isolated TEST only. One-time, additive review UI bootstrap.
 * Never deletes cells, merges ranges, changes protections, sends LINE,
 * calls OpenAI or changes Questions/Users/Payments.
 * Does not replace setupReviewSheet() or remove its safety stop.
 */
function routeqQaSetupReviewTestOnly_() {
  assertRouteqQaTestEnvironment_();
  const ss = openRouteqQaTestSpreadsheet_();
  const review = ss.getSheetByName('回答確認');
  const questions = ss.getSheetByName('Questions');
  if (!review || !questions) throw new Error('REVIEW_TEST_SHEET_MISSING');
  if (review.getMaxRows() < 52 || review.getMaxColumns() < 6) {
    throw new Error('REVIEW_TEST_SIZE_MISMATCH');
  }
  const actualTitle = String(review.getRange('A1').getDisplayValue() || '').trim();
  if (actualTitle !== 'ROUTE Q&A 回答確認') {
    throw new Error('REVIEW_TEST_TITLE_MISMATCH');
  }
  const cells = review.getRange('A1:F52').getValues();
  for (let row = 0; row < cells.length; row++) {
    for (let col = 0; col < cells[row].length; col++) {
      if (row === 0 && col === 0) continue;
      if (cells[row][col] !== '' && cells[row][col] !== null) {
        throw new Error('REVIEW_TEST_NOT_EMPTY');
      }
    }
  }
  const expectedHeaders = [
    [2, 'LINEユーザーID'], [8, '質問内容'], [9, 'AI回答案'],
    [10, '最終回答'], [12, '確認済み'], [13, '送信状態'],
    [23, '質問送信ID']
  ];
  expectedHeaders.forEach(function(item) {
    if (String(questions.getRange(1, item[0]).getDisplayValue() || '').trim() !== item[1]) {
      throw new Error('REVIEW_TEST_HEADER_MISMATCH');
    }
  });
  const labels = [
    ['A2', '隔離TEST｜質問を選択 → 回答案を確認 → 人が編集 → 保存'],
    ['A3', '質問行番号'], ['A4', '相談者'], ['D4', '大項目'],
    ['A5', '質問テーマ'], ['D5', '高校名'],
    ['A7', '質問内容'], ['A13', 'AI回答案（模擬）'],
    ['A23', '修正メモ（実AI呼出禁止）'], ['A33', '最終回答（編集用）'],
    ['A43', '状態'], ['A45', '最終回答の保存は既存 saveFinalAnswer() を実行'],
    ['A48', 'LINE実送信・自動送信は禁止']
  ];
  // No clear(), breakApart(), delete*, merge(), trigger creation or external call.
  labels.forEach(function(pair) { review.getRange(pair[0]).setValue(pair[1]); });
  review.getRange('A1').setBackground('#267EE6').setFontColor('#FFFFFF').setFontWeight('bold');
  review.getRange('A48').setFontColor('#B42318').setFontWeight('bold');
  const sourceRows = questions.getLastRow() - 1;
  if (sourceRows > 0) {
    const values = questions.getRange(2, 8, sourceRows, 1).getDisplayValues();
    const validRows = values.map(function(row, index) {
      return String(row[0] || '').trim() ? String(index + 2) : '';
    }).filter(Boolean);
    if (validRows.length) {
      review.getRange('C3').setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(validRows, true)
          .setAllowInvalid(false).build()
      );
    }
  }
  return {status:'PASS', scope:'ISOLATED_TEST_REVIEW_UI_ONLY',
    externalCalls:0, questionsWrites:0, lineSends:0};
}
