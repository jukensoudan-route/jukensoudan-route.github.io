/** Isolated-v2 TEST-only boundaries; no outbound send or payment enabled. */
function routeqQaBlockSensitiveEntry_(operation) { assertRouteqQaTestEnvironment_(); throw new Error('Isolated TEST: sensitive entry blocked: ' + operation); }
function routeqQaRejectTriggerMutation_() { assertRouteqQaTestEnvironment_(); throw new Error('Isolated TEST: trigger mutation disabled'); }
function routeqQaRejectDriveMutation_() { assertRouteqQaTestEnvironment_(); throw new Error('Isolated TEST: Drive access/mutation disabled'); }
function routeqQaRejectOAuthTokenAccess_() { assertRouteqQaTestEnvironment_(); throw new Error('Isolated TEST: OAuth token access disabled'); }
function routeqQaOpenAllowedSpreadsheet_(id) { assertRouteqQaTestEnvironment_(); if (String(id) !== ROUTEQ_QA_TEST.sheetId) throw new Error('Isolated TEST: non-TEST spreadsheet rejected'); return openRouteqQaTestSpreadsheet_(); }

/** Reject arbitrary parent spreadsheet objects, including production objects. */
function routeqQaAssertAllowedSpreadsheet_(ss) {
  assertRouteqQaTestEnvironment_();
  if (!ss || typeof ss.getId !== 'function' || String(ss.getId()) !== ROUTEQ_QA_TEST.sheetId) {
    throw new Error('Isolated TEST: supplied spreadsheet rejected');
  }
  return ss;
}


/**
 * B-03A preparation: read-only, fail-closed TEST feature gate validation.
 * This is NOT an outbound-transport implementation or permission to send.
 * Existing routeqQaBlockSensitiveEntry_ and routeqQaRejectExternalFetch_
 * remain hard-stop boundaries until separately reviewed and authorized.
 */
function routeqQaTestFeatureGateStatus_(feature) {
  assertRouteqQaTestEnvironment_();
  const allowed = Object.freeze({
    question: 'ROUTEQ_QA_TEST_ALLOW_QUESTION',
    ai: 'ROUTEQ_QA_TEST_ALLOW_AI',
    stripe_test: 'ROUTEQ_QA_TEST_ALLOW_STRIPE',
    line_manual_test: 'ROUTEQ_QA_TEST_ALLOW_LINE_MANUAL'
  });
  const key = Object.prototype.hasOwnProperty.call(allowed, feature)
    ? allowed[feature] : null;
  if (!key) {
    throw new Error('Isolated TEST: unrecognized feature gate');
  }
  const setting = PropertiesService.getScriptProperties().getProperty(key);
  if (setting !== null && setting !== '' && setting !== 'OFF' && setting !== 'ON') {
    throw new Error('Isolated TEST: invalid feature gate setting: ' + key);
  }
  // Even ON is informational only: no network, charging or delivery is enabled.
  return Object.freeze({
    feature: feature,
    configured: setting === 'ON',
    externalExecutionPermitted: false
  });
}
