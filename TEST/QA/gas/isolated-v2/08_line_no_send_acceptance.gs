/**
 * ROUTEQ Q&A isolated TEST: approved LINE answer dry-run against TEST Sheets.
 * Read-only; never contacts LINE, marks a question sent, or records a
 * persistent delivery intent. This is NOT an external delivery gateway.
 */
function routeqQaInspectLineNoSend_(questionRow, expectedLineUserId) {
  assertRouteqQaTestEnvironment_();
  if (!Number.isSafeInteger(questionRow) || questionRow < 2 ||
      typeof expectedLineUserId !== 'string' ||
      expectedLineUserId !== expectedLineUserId.trim() ||
      !/^U[A-Za-z0-9_-]{5,120}$/.test(expectedLineUserId)) {
    throw new Error('LINE_MOCK_INVALID_REQUEST');
  }
  const ss = openRouteqQaTestSpreadsheet_();
  const questions = ss.getSheetByName('Questions');
  const users = ss.getSheetByName('Users');
  if (!questions || !users) throw new Error('LINE_MOCK_MISSING_TEST_SHEET');

  // Check the actual isolated TEST column contract, not only numeric indexes.
  const qHeaders = questions.getRange(1, 1, 1, 23).getValues()[0];
  for (const [column, header] of [
    [2, 'LINEユーザーID'], [8, '質問内容'], [10, '最終回答'],
    [12, '確認済み'], [13, '送信状態'], [23, '質問送信ID']
  ]) {
    if (qHeaders[column - 1] !== header) throw new Error('LINE_MOCK_COLUMN_MISMATCH');
  }
  if (users.getRange(1, 1).getValue() !== 'LINEユーザーID')
    throw new Error('LINE_MOCK_USER_COLUMN_MISMATCH');
  const questionLast = questions.getLastRow();
  if (!Number.isSafeInteger(questionLast) || questionRow > questionLast)
    throw new Error('LINE_MOCK_QUESTION_MISSING');
  const q = questions.getRange(questionRow, 1, 1, 23).getValues()[0];
  const targetId = String(q[1] || '').trim();
  if (!targetId || targetId !== expectedLineUserId)
    throw new Error('LINE_MOCK_RECIPIENT_MISMATCH');
  if (typeof q[7] !== 'string' || !q[7].trim() ||
      typeof q[9] !== 'string' || !q[9].trim() ||
      q[11] !== '確認済')
    throw new Error('LINE_MOCK_ANSWER_NOT_APPROVED');
  // A dry-run is for unsent answers only; never silently reinterpret UNKNOWN.
  if (q[12] !== '' && q[12] !== null && q[12] !== '未送信')
    throw new Error('LINE_MOCK_ALREADY_ATTEMPTED');

  const submissionId = String(q[22] || '').trim();
  if (submissionId.length < 8 || submissionId.length > 160 ||
      !/^[A-Za-z0-9:_-]+(?:\.[A-Za-z0-9:_-]+)*$/.test(submissionId))
    throw new Error('LINE_MOCK_SUBMISSION_ID_INVALID');
  const ids = questions.getRange(2, 23, questionLast - 1, 1).getValues();
  if (ids.filter(function(item) { return item[0] === submissionId; }).length !== 1)
    throw new Error('LINE_MOCK_DUPLICATE_QUESTION_ID');

  const lastUserRow = users.getLastRow();
  if (!Number.isSafeInteger(lastUserRow) || lastUserRow < 2)
    throw new Error('LINE_MOCK_USER_MISSING');
  const registeredUsers = users.getRange(2, 1, lastUserRow - 1, 1).getValues();
  if (registeredUsers.filter(function(item) { return item[0] === targetId; }).length !== 1)
    throw new Error('LINE_MOCK_USER_NOT_UNIQUE');

  // Return only non-sensitive evidence. No answer, recipient, credentials,
  // network calls or persistent state leave this function.
  return Object.freeze({
    result: 'MOCK_VALIDATED_NOT_SENT',
    questionRow: questionRow,
    recipientMatched: true,
    approvedAnswerVerified: true,
    uniqueQuestionIdVerified: true,
    uniqueUserVerified: true,
    simulatedOnly: true,
    externalExecutionPermitted: false,
    markedAsSent: false,
    sheetWrites: 0,
    networkRequests: 0,
    additionalApiChargeYen: 0
  });
}
