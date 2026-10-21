// TEST-only candidate: backup triggers, file copies and retention deletion intentionally disabled.
/**
 * ROUTE Q&A のGoogleスプレッドシートと、紐づくGASをDriveへ複製する。
 * 毎日午前3時台（日本時間）に実行し、直近30日分を保持する。
 */

const ROUTE_BACKUP = {
  FOLDER_NAME: 'ROUTE Q&A 自動バックアップ',
  FOLDER_ID_PROPERTY: 'ROUTE_BACKUP_FOLDER_ID',
  RETENTION_DAYS: 30,
  TRIGGER_HANDLER: 'backupRouteQaSystem'
};


function setupRouteAutomaticBackup() {
  assertRouteqQaTestEnvironment_();
  throw new Error('TEST isolation: automatic backup and Drive cleanup are disabled');
  const ss = openRouteqQaTestSpreadsheet_();
  const folder = getOrCreateRouteBackupFolder_();
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === ROUTE_BACKUP.TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(ROUTE_BACKUP.TRIGGER_HANDLER)
    .timeBased()
    .atHour(3)
    .everyDays(1)
    .inTimezone('Asia/Tokyo')
    .create();

  const backup = backupRouteQaSystem();

  ss.toast(
    '毎日午前3時台の自動バックアップを設定しました。初回保存：' + backup.getName(),
    'ROUTE Q&A',
    8
  );

  return {
    folderId: folder.getId(),
    backupId: backup.getId(),
    retentionDays: ROUTE_BACKUP.RETENTION_DAYS
  };
}


function backupRouteQaSystem() {
  assertRouteqQaTestEnvironment_();
  throw new Error('TEST isolation: automatic backup and Drive cleanup are disabled');
  const ss = openRouteqQaTestSpreadsheet_();
  const sourceFile = DriveApp.getFileById(ss.getId());
  const folder = getOrCreateRouteBackupFolder_();
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd_HHmmss');
  const backupName = 'ROUTE Q&A 新規システム_' + timestamp;
  const backup = sourceFile.makeCopy(backupName, folder);

  pruneOldRouteBackups_(folder);

  console.log('ROUTE backup created: ' + backup.getId());
  return backup;
}


function getOrCreateRouteBackupFolder_() {
  assertRouteqQaTestEnvironment_();
  throw new Error('TEST isolation: automatic backup and Drive cleanup are disabled');
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty(ROUTE_BACKUP.FOLDER_ID_PROPERTY);

  if (savedId) {
    try {
      return DriveApp.getFolderById(savedId);
    }
    catch (error) {
      console.log('保存済みバックアップフォルダを再取得できません: ' + error.message);
    }
  }

  const matchingFolders = DriveApp.getFoldersByName(ROUTE_BACKUP.FOLDER_NAME);
  const folder = matchingFolders.hasNext()
    ? matchingFolders.next()
    : DriveApp.createFolder(ROUTE_BACKUP.FOLDER_NAME);

  properties.setProperty(ROUTE_BACKUP.FOLDER_ID_PROPERTY, folder.getId());
  return folder;
}


function pruneOldRouteBackups_(folder) {
  assertRouteqQaTestEnvironment_();
  throw new Error('TEST isolation: automatic backup and Drive cleanup are disabled');
  const cutoff = new Date(Date.now() - ROUTE_BACKUP.RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().indexOf('ROUTE Q&A 新規システム_') !== 0) continue;
    if (file.getDateCreated() < cutoff) file.setTrashed(true);
  }
}