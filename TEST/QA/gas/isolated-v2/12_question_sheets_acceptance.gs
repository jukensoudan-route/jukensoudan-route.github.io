/** Owner-run isolated TEST acceptance for question persistence and ticket use. */
const ROUTEQ_QA_QUESTION_ACCEPTANCE_PERMIT_ = Object.freeze({
  purpose: 'ISOLATED_TEST_QUESTION_SHEETS_ACCEPTANCE'
});

function testRouteqQaQuestionSheetsAcceptance() {
  assertRouteqQaTestEnvironment_();

  const payload = Object.freeze({
    idToken: '',
    category: 'isolated_acceptance',
    categoryLabel: '隔離TEST',
    theme: '質問保存・回数消費',
    district: '',
    districtLabel: '',
    school: '',
    question: '【隔離TEST】基本Q&Aの質問保存、固定回答、回数消費を検収します。',
    questionSource: 'owner_acceptance',
    validationToken: '1761217200000.routeq-qa-isolated-acceptance.' +
      'a7c9e2b41d86f5039a8c728f8ab2e60b9c96f0cdd52703d7fd56cdf918594a31'
  });

  const first = saveQuestionForWeb_(
    payload,
    ROUTEQ_QA_QUESTION_ACCEPTANCE_PERMIT_
  );
  const second = saveQuestionForWeb_(
    payload,
    ROUTEQ_QA_QUESTION_ACCEPTANCE_PERMIT_
  );

  const ss = openRouteqQaTestSpreadsheet_();
  const questions = ss.getSheetByName(ROUTE_QA.QUESTIONS);
  const users = ss.getSheetByName(ROUTE_QA.USERS);
  const userRow = findRouteUserRow_(users, 'U_ROUTEQ_ISOLATED_MOCK_20261023');
  const questionRow = Number(first.questionRow);
  const q = questions.getRange(
    questionRow, 1, 1, ROUTE_QA.QUESTION_COL.SUBMISSION_ID
  ).getValues()[0];
  const u = users.getRange(userRow, 1, 1, 12).getValues()[0];
  const remaining = Number(u[ROUTE_QA.USER_COL.REMAINING - 1]);

  if (!Number.isSafeInteger(questionRow) || questionRow < 2 ||
      Number(second.questionRow) !== questionRow ||
      String(q[ROUTE_QA.QUESTION_COL.LINE_USER_ID - 1]) !==
        'U_ROUTEQ_ISOLATED_MOCK_20261023' ||
      String(q[ROUTE_QA.QUESTION_COL.QUESTION - 1]) !== payload.question ||
      String(q[ROUTE_QA.QUESTION_COL.AI_ANSWER - 1]) !==
        '【隔離TEST固定回答】実AI・LINE送信なしで質問保存経路を検収しました。' ||
      String(q[ROUTE_QA.QUESTION_COL.AI_STATUS - 1]) !== '生成済' ||
      String(q[ROUTE_QA.QUESTION_COL.SEND_STATUS - 1]) !== '未送信' ||
      String(q[ROUTE_QA.QUESTION_COL.SUBMISSION_ID - 1]) !== payload.validationToken ||
      Number(q[ROUTE_QA.QUESTION_COL.REMAINING_AFTER - 1]) !== remaining ||
      Number(first.remainingCount) !== remaining ||
      Number(second.remainingCount) !== remaining) {
    throw new Error('QUESTION_ACCEPTANCE_PERSISTENCE_OR_REPLAY_FAIL');
  }

  const result = Object.freeze({
    status: 'PASS',
    environment: 'ISOLATED_TEST',
    questionRow: questionRow,
    replayQuestionRow: Number(second.questionRow),
    remainingAfterQuestion: remaining,
    fixedAiAnswerSaved: true,
    realAiInvoked: false,
    lineRealSendExecuted: false,
    replayConsumedAdditionalTicket: false
  });
  console.log(JSON.stringify(result));
  return result;
}
