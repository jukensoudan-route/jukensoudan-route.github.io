/**
 * Isolated Q&A TEST safety guard.
 * This file belongs ONLY to a new, separately created TEST Apps Script project.
 * Do not deploy to or paste into the production Apps Script project.
 */
const ROUTEQ_QA_TEST = Object.freeze({
  sheetId: '11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8',
  scriptId: '1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ',
  requiredEnvironment: 'ISOLATED_TEST',
  blockedProductionSheetId: '12QPlcvkLLVFStZ9bMahpfQvMo1mpwSxUB41el7rTQTE'
});

function assertRouteqQaTestEnvironment_() {
  if (ScriptApp.getScriptId() !== ROUTEQ_QA_TEST.scriptId) {
    throw new Error('TEST only: unexpected Apps Script project ID');
  }
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ROUTEQ_QA_ENVIRONMENT') !== ROUTEQ_QA_TEST.requiredEnvironment) {
    throw new Error('TEST only: ROUTEQ_QA_ENVIRONMENT must be ISOLATED_TEST');
  }
  const sheetId = props.getProperty('ROUTEQ_QA_SHEET_ID');
  if (sheetId !== ROUTEQ_QA_TEST.sheetId || sheetId === ROUTEQ_QA_TEST.blockedProductionSheetId) {
    throw new Error('TEST only: isolated spreadsheet mismatch');
  }
  if (props.getProperty('ROUTEQ_QA_EXTERNAL_SEND') !== 'DISABLED') {
    throw new Error('TEST only: external send must remain DISABLED');
  }
  if (props.getProperty('ROUTEQ_QA_LIVE_PAYMENT') !== 'DISABLED') {
    throw new Error('TEST only: live payments must remain DISABLED');
  }
  return true;
}

function openRouteqQaTestSpreadsheet_() {
  assertRouteqQaTestEnvironment_();
  const sheet = SpreadsheetApp.openById(ROUTEQ_QA_TEST.sheetId);
  if (sheet.getId() !== ROUTEQ_QA_TEST.sheetId) {
    throw new Error('TEST only: spreadsheet identity mismatch');
  }
  return sheet;
}
