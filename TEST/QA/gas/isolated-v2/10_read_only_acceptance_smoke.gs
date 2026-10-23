/**
 * ROUTEQ isolated TEST: owner-run, read-only acceptance smoke.
 * Fixture: only synthetic Questions rows 2 & 3 and Users row 2.
 * No LIVE operations, network requests, Sheets writes or AI API charges.
 * A PASS is mock-only; it cannot certify real Stripe grant or LINE delivery.
 */
function testRouteqQaReadOnlyIntegrationSmoke() {
  assertRouteqQaTestEnvironment_();

  const classification = testRouteqQaExternalBoundary();
  if (!classification || classification.ok !== true ||
      classification.cases !== 5 || classification.networkRequests !== 0) {
    throw new Error('SMOKE_CLASSIFICATION_FAIL');
  }

  // Calling the rejection boundary is safe: it must throw before networking.
  const blockedEndpoints = [
    ['LINE', 'https://api.line.me/v2/bot/message/push'],
    ['STRIPE', 'https://api.stripe.com/v1/checkout/sessions'],
    ['OPENAI', 'https://api.openai.com/v1/responses']
  ];
  blockedEndpoints.forEach(function(item) {
    let rejected = false;
    try {
      routeqQaRejectExternalFetch_(item[1], {method:'post'});
    } catch (error) {
      rejected = String(error && error.message || error)
        .indexOf('outbound HTTP disabled (' + item[0] + ')') >= 0;
    }
    if (!rejected) throw new Error('SMOKE_BOUNDARY_NOT_BLOCKED_' + item[0]);
  });

  const ai = routeqQaSimulateAiWithoutApi_(2);
  if (!ai || ai.result !== 'MOCK_DRAFT_NOT_SAVED' ||
      ai.realAiModelInvoked !== false || ai.answerFactChecked !== false ||
      ai.questionSheetWrites !== 0 || ai.networkRequests !== 0 ||
      ai.additionalApiChargeYen !== 0 || ai.lineDeliveryAllowed !== false) {
    throw new Error('SMOKE_AI_MOCK_FAIL');
  }

  const line = routeqQaInspectLineNoSend_(3, 'U_ROUTEQ_ISOLATED_MOCK_20261023');
  if (!line || line.result !== 'MOCK_VALIDATED_NOT_SENT' ||
      line.recipientMatched !== true || line.approvedAnswerVerified !== true ||
      line.uniqueQuestionIdVerified !== true || line.uniqueUserVerified !== true ||
      line.simulatedOnly !== true || line.externalExecutionPermitted !== false ||
      line.markedAsSent !== false || line.sheetWrites !== 0 ||
      line.networkRequests !== 0 || line.additionalApiChargeYen !== 0) {
    throw new Error('SMOKE_LINE_MOCK_FAIL');
  }

  // No personal data or message body is logged.
  const result = Object.freeze({
    status: 'PASS',
    environment: 'ISOLATED_TEST',
    classificationCases: 5,
    blockedExternalEndpoints: 3,
    aiMock: 'MOCK_DRAFT_NOT_SAVED',
    lineMock: 'MOCK_VALIDATED_NOT_SENT',
    sheetWritesByTest: 0,
    directNetworkCallsByTest: 0,
    extraAiApiChargeYen: 0,
    stripeTestPaymentExecuted: false,
    lineRealSendExecuted: false,
    realAiAnswerVerified: false,
    testOnly: true
  });
  console.log(JSON.stringify(result));
  return result;
}
