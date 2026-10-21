/**
 * Read-only structure smoke test for the isolated ROUTEQ Q&A sheet.
 * Run manually ONLY in the independent TEST GAS project.
 * No production resources, network calls, triggers, or writes.
 */
function testRouteqQaIsolatedSheetStructure() {
  assertRouteqQaTestEnvironment_();
  const expected = [
    'Questions', 'StripeEvents', '回答確認', 'Users', 'Payments',
    '資料DB', '設定', '絶対ルール', '資料ファイル', 'TokenUsage',
    '訂正管理', 'ルール候補', 'システム管理', '質問選択ツリー'
  ];
  const ss = openRouteqQaTestSpreadsheet_();
  const actualId = ss.getId();
  if (actualId !== ROUTEQ_QA_TEST.sheetId) {
    throw new Error('Isolated TEST spreadsheet id mismatch');
  }
  const found = ss.getSheets().map(function(s) { return s.getName(); });
  const missing = expected.filter(function(name) { return found.indexOf(name) < 0; });
  const result = {
    status: missing.length === 0 ? 'PASS' : 'FAIL',
    environment: 'ISOLATED_TEST',
    sheetCount: found.length,
    expectedSheetCount: expected.length,
    missingSheets: missing,
    // The names/counts are metadata; no cells, customer records, or secrets are read.
    testModeOnly: true
  };
  console.log(JSON.stringify(result));
  if (missing.length) throw new Error('Missing isolated TEST sheet tabs: ' + missing.join(', '));
  return result;
}
