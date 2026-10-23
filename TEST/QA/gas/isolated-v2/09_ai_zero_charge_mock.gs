/**
 * ROUTEQ Q&A isolated TEST: zero-charge AI step.
 * Validates that an existing TEST question can enter a mock AI answer stage.
 * Does not invoke OpenAI, call URLs, write to Sheets or represent a factual answer.
 */
function routeqQaSimulateAiWithoutApi_(questionRow) {
  assertRouteqQaTestEnvironment_();
  if (!Number.isSafeInteger(questionRow) || questionRow < 2)
    throw new Error('AI_MOCK_INVALID_ROW');
  const ss = openRouteqQaTestSpreadsheet_();
  const questions = ss.getSheetByName('Questions');
  if (!questions) throw new Error('AI_MOCK_QUESTIONS_MISSING');
  const headers = questions.getRange(1, 1, 1, 23).getValues()[0];
  if (headers[1] !== 'LINEユーザーID' || headers[7] !== '質問内容' ||
      headers[8] !== 'AI回答案' || headers[9] !== '最終回答' ||
      headers[22] !== '質問送信ID')
    throw new Error('AI_MOCK_COLUMN_MISMATCH');
  if (questionRow > questions.getLastRow())
    throw new Error('AI_MOCK_QUESTION_NOT_FOUND');
  const q = questions.getRange(questionRow, 1, 1, 23).getValues()[0];
  if (typeof q[7] !== 'string' || !q[7].trim() ||
      typeof q[1] !== 'string' || !q[1].trim() ||
      typeof q[22] !== 'string' ||
      !/^[A-Za-z0-9:_-]{8,160}$/.test(q[22]))
    throw new Error('AI_MOCK_QUESTION_INCOMPLETE');
  // A no-charge fixture must never overwrite any actual AI or final answer.
  if ((q[8] !== '' && q[8] !== null) ||
      (q[9] !== '' && q[9] !== null))
    throw new Error('AI_MOCK_ANSWER_ALREADY_EXISTS');
  return Object.freeze({
    result: 'MOCK_DRAFT_NOT_SAVED',
    questionRow: questionRow,
    draft: '【隔離TEST・AI回答模擬文】これは動作検収用であり、学校や入試制度に関する事実回答ではありません。経営者の確認を経て、別途最終回答を保存してください。',
    realAiModelInvoked: false,
    answerFactChecked: false,
    questionSheetWrites: 0,
    networkRequests: 0,
    additionalApiChargeYen: 0,
    lineDeliveryAllowed: false
  });
}
