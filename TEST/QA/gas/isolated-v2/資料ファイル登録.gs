// Archived source staging only. NOT DEPLOYABLE. Needs TEST isolation and current-production version confirmation.
/**
 * =========================================================
 * ROUTE Q&A 資料ファイル登録.gs
 * Drive資料 → PDF化 → OpenAI Files → Vector Store 登録
 * =========================================================
 *
 * 対象シート：
 * 資料ファイル
 *
 * A 有効
 * B DriveファイルURL/ID
 * C 資料名
 * D 年度
 * E 学校名
 * F 大項目
 * G 質問テーマ
 * H OpenAI File ID
 * I 登録状態
 * J 最終更新日時
 *
 * スクリプトプロパティ：
 * OPENAI_API_KEY
 * OPENAI_VECTOR_STORE_ID（初回は自動作成）
 */


const ROUTE_MATERIAL_FILE_SHEET = '資料ファイル';
const ROUTE_VECTOR_STORE_PROPERTY = 'OPENAI_VECTOR_STORE_ID';
const ROUTE_VECTOR_STORE_NAME = 'ROUTE受験Q&A資料';


/**
 * 資料ファイルシートで選択中の行を登録
 */
function registerSelectedRouteMaterialFile() {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('registerSelectedRouteMaterialFile');

  const ss = openRouteqQaTestSpreadsheet_();
  const sheet = ss.getActiveSheet();

  if (sheet.getName() !== ROUTE_MATERIAL_FILE_SHEET) {
    SpreadsheetApp.getUi().alert(
      '「資料ファイル」シートで登録したい行を選択してください。'
    );
    return;
  }

  const row = sheet.getActiveCell().getRow();

  if (row < 2) {
    SpreadsheetApp.getUi().alert(
      '登録したい資料の行を選択してください。'
    );
    return;
  }

  registerRouteMaterialRow_(sheet, row);

  SpreadsheetApp.getActive().toast(
    '資料登録処理が完了しました。',
    'ROUTE Q&A',
    4
  );
}


/**
 * A列が○の未登録資料をまとめて登録
 */
function registerAllEnabledRouteMaterialFiles() {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('registerAllEnabledRouteMaterialFiles');

  const ss = openRouteqQaTestSpreadsheet_();
  const sheet = ss.getSheetByName(ROUTE_MATERIAL_FILE_SHEET);

  if (!sheet) {
    throw new Error('資料ファイルシートが見つかりません。');
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return;
  }

  let success = 0;
  let failed = 0;

  for (let row = 2; row <= lastRow; row++) {

    const enabled = String(sheet.getRange(row, 1).getValue() || '').trim();
    const status = String(sheet.getRange(row, 9).getValue() || '').trim();

    if (enabled !== '○') {
      continue;
    }

    if (status === '登録済') {
      continue;
    }

    try {
      registerRouteMaterialRow_(sheet, row);
      success++;
    }
    catch (error) {
      failed++;
      sheet.getRange(row, 9).setValue(
        'エラー：' + (
          error && error.message
            ? error.message
            : String(error)
        )
      );
      sheet.getRange(row, 10).setValue(new Date());
    }
  }

  SpreadsheetApp.getUi().alert(
    '資料登録結果',
    '成功：' + success + '件\nエラー：' + failed + '件',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}


/**
 * 1行分をOpenAIへ登録
 */
function registerRouteMaterialRow_(sheet, row) {

  const values = sheet
    .getRange(row, 1, 1, 10)
    .getValues()[0];

  const enabled = String(values[0] || '').trim();
  const driveUrlOrId = String(values[1] || '').trim();
  const materialName = String(values[2] || '').trim();
  const year = String(values[3] || '').trim();
  const school = String(values[4] || '').trim();
  const category = String(values[5] || '').trim();
  const theme = String(values[6] || '').trim();

  if (enabled !== '○') {
    throw new Error('A列「有効」を○にしてください。');
  }

  if (!driveUrlOrId) {
    throw new Error('B列のDriveファイルURL/IDが空欄です。');
  }

  if (!materialName) {
    throw new Error('C列の資料名が空欄です。');
  }

  sheet.getRange(row, 9).setValue('登録中…');

  const fileId = extractRouteDriveFileId_(driveUrlOrId);

  const blob = exportRouteDriveFileForOpenAI_(
    fileId,
    materialName
  );

  const openAiFileId = uploadRouteFileToOpenAI_(blob);

  const vectorStoreId = ensureRouteVectorStore_();

  attachRouteFileToVectorStore_(
    vectorStoreId,
    openAiFileId,
    {
      material_name: materialName,
      year: year || '不明',
      school: school || '共通',
      category: category || '未設定',
      theme: theme || '未設定'
    }
  );

  waitForRouteVectorStoreFile_(
    vectorStoreId,
    openAiFileId
  );

  sheet.getRange(row, 8).setValue(openAiFileId);
  sheet.getRange(row, 9).setValue('登録済');
  sheet.getRange(row, 10).setValue(new Date());
}


/**
 * Drive URL / ID からID抽出
 */
function extractRouteDriveFileId_(value) {

  const text = String(value || '').trim();

  if (/^[a-zA-Z0-9_-]{20,}$/.test(text)) {
    return text;
  }

  const patterns = [
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/presentation\/d\/([a-zA-Z0-9_-]+)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  throw new Error('DriveファイルIDを取得できませんでした。');
}


/**
 * Google Workspace形式はPDF化。
 * PDF等の通常ファイルはそのまま使用。
 */
function exportRouteDriveFileForOpenAI_(fileId, materialName) {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('exportRouteDriveFileForOpenAI_');

  const file = routeqQaRejectDriveMutation_(fileId);
  const mimeType = file.getMimeType();

  const googleNativeTypes = [
    MimeType.GOOGLE_SHEETS,
    MimeType.GOOGLE_DOCS,
    MimeType.GOOGLE_SLIDES
  ];

  if (googleNativeTypes.includes(mimeType)) {

    const url =
      'https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(fileId) +
      '/export?mimeType=' +
      encodeURIComponent('application/pdf');

    const response = routeqQaRejectExternalFetch_(
      url,
      {
        method: 'get',
        headers: {
          Authorization:
            'Bearer ' +
            ScriptApp.getOAuthToken()
        },
        muteHttpExceptions: true
      }
    );

    const status = response.getResponseCode();

    if (status < 200 || status >= 300) {
      throw new Error(
        'Drive資料のPDF変換に失敗しました。HTTP ' +
        status +
        ' / ' +
        response.getContentText()
      );
    }

    return response
      .getBlob()
      .setName(
        sanitizeRouteFileName_(materialName) +
        '.pdf'
      );
  }

  const blob = file.getBlob();

  const originalName = file.getName();

  if (originalName) {
    blob.setName(originalName);
  }

  return blob;
}


/**
 * OpenAI Files APIへアップロード
 */
function uploadRouteFileToOpenAI_(blob) {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('uploadRouteFileToOpenAI_');

  const apiKey = getRouteOpenAiApiKey_();

  const response = routeqQaRejectExternalFetch_(
    'https://api.openai.com/v1/files',
    {
      method: 'post',
      headers: {
        Authorization:
          'Bearer ' +
          apiKey
      },

      /*
       * contentTypeを指定しないことで
       * Apps Scriptがmultipart/form-dataを生成。
       */
      payload: {
        purpose: 'assistants',
        file: blob
      },

      muteHttpExceptions: true
    }
  );

  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(
      'OpenAIファイルアップロード失敗：HTTP ' +
      status +
      ' / ' +
      body
    );
  }

  const json = JSON.parse(body);

  if (!json.id) {
    throw new Error(
      'OpenAI File IDを取得できませんでした。'
    );
  }

  return json.id;
}


/**
 * ROUTE専用Vector Storeを初回のみ自動作成
 */
function ensureRouteVectorStore_() {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('ensureRouteVectorStore_');

  const props =
    PropertiesService.getScriptProperties();

  const existing =
    props.getProperty(
      ROUTE_VECTOR_STORE_PROPERTY
    );

  if (existing) {
    return existing;
  }

  const apiKey = getRouteOpenAiApiKey_();

  const response = routeqQaRejectExternalFetch_(
    'https://api.openai.com/v1/vector_stores',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization:
          'Bearer ' +
          apiKey,
        'OpenAI-Beta':
          'assistants=v2'
      },
      payload: JSON.stringify({
        name:
          ROUTE_VECTOR_STORE_NAME
      }),
      muteHttpExceptions: true
    }
  );

  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(
      'Vector Store作成失敗：HTTP ' +
      status +
      ' / ' +
      body
    );
  }

  const json = JSON.parse(body);

  if (!json.id) {
    throw new Error(
      'Vector Store IDを取得できませんでした。'
    );
  }

  props.setProperty(
    ROUTE_VECTOR_STORE_PROPERTY,
    json.id
  );

  return json.id;
}


/**
 * OpenAI FileをVector Storeへ追加
 */
function attachRouteFileToVectorStore_(
  vectorStoreId,
  openAiFileId,
  attributes
) {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('attachRouteFileToVectorStore_');

  const apiKey = getRouteOpenAiApiKey_();

  const response = routeqQaRejectExternalFetch_(
    'https://api.openai.com/v1/vector_stores/' +
    encodeURIComponent(vectorStoreId) +
    '/files',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization:
          'Bearer ' +
          apiKey,
        'OpenAI-Beta':
          'assistants=v2'
      },
      payload: JSON.stringify({
        file_id: openAiFileId,
        attributes: attributes
      }),
      muteHttpExceptions: true
    }
  );

  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(
      'Vector Storeへの追加失敗：HTTP ' +
      status +
      ' / ' +
      body
    );
  }
}


/**
 * Vector Store側で解析完了まで待つ
 */
function waitForRouteVectorStoreFile_(
  vectorStoreId,
  openAiFileId
) {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('waitForRouteVectorStoreFile_');

  const apiKey = getRouteOpenAiApiKey_();

  const url =
    'https://api.openai.com/v1/vector_stores/' +
    encodeURIComponent(vectorStoreId) +
    '/files/' +
    encodeURIComponent(openAiFileId);

  for (let i = 0; i < 30; i++) {

    Utilities.sleep(1500);

    const response = routeqQaRejectExternalFetch_(
      url,
      {
        method: 'get',
        headers: {
          Authorization:
            'Bearer ' +
            apiKey,
          'OpenAI-Beta':
            'assistants=v2'
        },
        muteHttpExceptions: true
      }
    );

    const status = response.getResponseCode();
    const body = response.getContentText();

    if (status < 200 || status >= 300) {
      throw new Error(
        'Vector Store状態確認失敗：HTTP ' +
        status +
        ' / ' +
        body
      );
    }

    const json = JSON.parse(body);

    if (json.status === 'completed') {
      return;
    }

    if (
      json.status === 'failed' ||
      json.status === 'cancelled'
    ) {
      throw new Error(
        '資料解析に失敗しました：' +
        JSON.stringify(
          json.last_error || json
        )
      );
    }
  }

  throw new Error(
    '資料解析が時間内に完了しませんでした。'
  );
}


/**
 * OpenAI APIキー取得
 */
function getRouteOpenAiApiKey_() {
  assertRouteqQaTestEnvironment_();
  routeqQaBlockSensitiveEntry_('getRouteOpenAiApiKey_');

  const apiKey =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'OPENAI_API_KEY'
      );

  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEYが設定されていません。'
    );
  }

  return apiKey;
}


/**
 * ファイル名整形
 */
function sanitizeRouteFileName_(name) {

  return String(name || 'ROUTE資料')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
}


/**
 * Vector Store ID確認用
 */
function showRouteVectorStoreId() {

  const id =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        ROUTE_VECTOR_STORE_PROPERTY
      );

  SpreadsheetApp.getUi().alert(
    'ROUTE Vector Store ID',
    id || 'まだ作成されていません。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}