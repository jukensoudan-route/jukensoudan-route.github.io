/**
 * ROUTEQ LINE isolated-v2: durable intent journal, fail-closed.
 * Does not send to LINE. Callers must use the same script lock.
 * This module is not wired to send entrypoints until regression is verified.
 */
function routeqLineJournalKey_(questionId) {
  var id = String(questionId || '').trim();
  if (!/^[A-Za-z0-9:_-]{1,100}$/.test(id)) throw new Error('Invalid question ID');
  return 'ROUTEQ_LINE_INTENT_V1_' + id;
}
function routeqLineWithLock_(callback) {
  assertRouteqQaTestEnvironment_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('LINE_LOCK_UNAVAILABLE');
  try { return callback(PropertiesService.getScriptProperties()); }
  finally { lock.releaseLock(); }
}
/** Caller supplies a stable Retry Key derived from the frozen request. */
function routeqLinePrepareIntent_(request) {
  assertRouteqQaTestEnvironment_();
  var id = String(request && request.questionId || '').trim();
  var to = String(request && request.to || '').trim();
  var body = String(request && request.body || '');
  var retryKey = String(request && request.retryKey || '').trim();
  if (!to || !body.trim() || !retryKey) throw new Error('LINE_INTENT_INCOMPLETE');
  return routeqLineWithLock_(function(props) {
    var key = routeqLineJournalKey_(id);
    var old = props.getProperty(key);
    if (old) {
      var existing = JSON.parse(old);
      // Fail closed, including UNKNOWN, PREPARED, IN_PROGRESS, ACCEPTED.
      return {allowed:false, reason:existing.state, intent:existing};
    }
    var intent = {version:1,questionId:id,to:to,body:body,retryKey:retryKey,
      state:'PREPARED',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    props.setProperty(key, JSON.stringify(intent));
    if (props.getProperty(key) !== JSON.stringify(intent)) throw new Error('LINE_JOURNAL_NOT_DURABLE');
    return {allowed:true,intent:intent};
  });
}
/** Called before a transport attempt; never retries an existing in-progress attempt. */
function routeqLineMarkInProgress_(questionId, retryKey) {
  return routeqLineWithLock_(function(props) {
    var key = routeqLineJournalKey_(questionId);
    var raw = props.getProperty(key);
    if (!raw) throw new Error('LINE_INTENT_MISSING');
    var item = JSON.parse(raw);
    if (item.retryKey !== retryKey || item.state !== 'PREPARED') throw new Error('LINE_RETRY_BLOCKED');
    item.state = 'IN_PROGRESS';
    item.updatedAt = new Date().toISOString();
    props.setProperty(key, JSON.stringify(item));
    if (props.getProperty(key) !== JSON.stringify(item)) throw new Error('LINE_JOURNAL_NOT_DURABLE');
    return item;
  });
}
/** Record acceptance / uncertain outcome without dropping the journal. */
function routeqLineSetOutcome_(questionId, retryKey, accepted) {
  return routeqLineWithLock_(function(props) {
    var key = routeqLineJournalKey_(questionId), raw = props.getProperty(key);
    if (!raw) throw new Error('LINE_INTENT_MISSING');
    var item = JSON.parse(raw);
    if (item.retryKey !== retryKey || item.state !== 'IN_PROGRESS') throw new Error('LINE_OUTCOME_CONFLICT');
    item.state = accepted ? 'ACCEPTED' : 'UNKNOWN';
    item.updatedAt = new Date().toISOString();
    props.setProperty(key, JSON.stringify(item));
    if (props.getProperty(key) !== JSON.stringify(item)) throw new Error('LINE_JOURNAL_NOT_DURABLE');
    return item;
  });
}
