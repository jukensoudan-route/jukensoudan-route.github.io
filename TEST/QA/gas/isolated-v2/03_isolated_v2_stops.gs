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
