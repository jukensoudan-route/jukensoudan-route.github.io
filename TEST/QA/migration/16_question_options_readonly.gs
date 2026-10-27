/** Isolated TEST only. Additive candidate; no entry point is opened by this file. */
function routeqQaQuestionOptions_(e) {
  assertRouteqQaTestEnvironment_();
  var p = e && e.parameter ? e.parameter : {};
  var callback = String(p.callback || '');
  // The existing browser creates a single global identifier for JSONP.
  if (callback && !/^[A-Za-z_$][0-9A-Za-z_$]{0,127}$/.test(callback)) {
    return routeqQaOptionsOutput_({ok:false,error:'INVALID_CALLBACK'}, '');
  }
  var payload;
  try {
    if (String(p.action || '') !== 'getQuestionOptions') {
      throw new Error('UNSUPPORTED_ACTION');
    }
    var book = openRouteqQaTestSpreadsheet_();
    var sheet = book.getSheetByName('質問選択ツリー');
    if (!sheet) throw new Error('OPTIONS_SHEET_MISSING');
    var count = sheet.getLastRow();
    if (count < 2) throw new Error('OPTIONS_EMPTY');
    if (count > 2000) throw new Error('OPTIONS_TOO_LARGE');
    // Only this existing TEST master is read. No setup, writes or HTTP calls.
    payload = routeqQaBuildOptions_(sheet.getRange(1,1,count,5).getDisplayValues());
  } catch (error) {
    var code = String(error && error.message || '');
    var codes = ['UNSUPPORTED_ACTION','OPTIONS_SHEET_MISSING','OPTIONS_EMPTY',
      'OPTIONS_TOO_LARGE','OPTIONS_SCHEMA_INVALID','OPTIONS_ROW_INVALID'];
    payload = {ok:false,error:codes.indexOf(code) >= 0 ? code : 'OPTIONS_UNAVAILABLE'};
  }
  return routeqQaOptionsOutput_(payload,callback);
}

function routeqQaBuildOptions_(rows) {
  var headers = ['カテゴリキー','大項目','質問テーマ','質問内容','有効'];
  if (!Array.isArray(rows) || !Array.isArray(rows[0]) ||
      headers.some(function(h,i) { return rows[0][i] !== h; })) {
    throw new Error('OPTIONS_SCHEMA_INVALID');
  }
  var categories = [], map = Object.create(null);
  rows.slice(1).forEach(function(row) {
    var fields = [0,1,2,3,4].map(function(i) { return String(row[i] || '').trim(); });
    if (fields.every(function(v) { return !v; }) || fields[4].toUpperCase() === 'FALSE') return;
    if (fields.slice(0,4).some(function(v) { return !v || v.length > 2000; })) {
      throw new Error('OPTIONS_ROW_INVALID');
    }
    var key = fields[0], label = fields[1], themeName = fields[2], question = fields[3];
    if (!map[key]) {
      map[key] = {key:key,label:label,themes:[]}; categories.push(map[key]);
    }
    var category = map[key];
    if (category.label !== label) throw new Error('OPTIONS_ROW_INVALID');
    var theme = category.themes.find(function(v) { return v.name === themeName; });
    if (!theme) { theme = {name:themeName,questions:[]}; category.themes.push(theme); }
    if (theme.questions.indexOf(question) < 0) theme.questions.push(question);
  });
  if (!categories.length) throw new Error('OPTIONS_EMPTY');
  return {ok:true,categories:categories,cachedSeconds:0,environment:'ISOLATED_TEST'};
}

function routeqQaOptionsOutput_(payload,callback) {
  var json = JSON.stringify(payload).replace(/</g,'\\u003c').replace(/>/g,'\\u003e')
    .replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return ContentService.createTextOutput(callback ? callback + '(' + json + ');' : json)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
