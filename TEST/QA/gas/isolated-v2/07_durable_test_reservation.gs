/**
 * B-03A isolated-TEST durable journal. NO network operation, no send permit.
 * A single global script lock serializes all state changes.
 * This module is deliberately not wired to an application entry point.
 */
function routeqQaB03ASnapshot_(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request))
    throw new Error('B03A_INVALID_REQUEST');
  const expected = ['id', 'feature', 'fingerprint', 'approved', 'approvedAt', 'expiresAt'].sort();
  const keys = Reflect.ownKeys(request);
  if (keys.some(function(k) { return typeof k !== 'string'; }))
    throw new Error('B03A_INVALID_REQUEST');
  keys.sort();
  const descriptors = Object.getOwnPropertyDescriptors(request);
  if (keys.length !== expected.length || keys.some(function(k, i) {
    return typeof k !== 'string' || k !== expected[i] ||
      !Object.prototype.hasOwnProperty.call(descriptors[k], 'value');
  })) throw new Error('B03A_INVALID_REQUEST');
  if (typeof request.id !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(request.id) ||
      ['stripe_test','ai','line_manual_test'].indexOf(request.feature) < 0 ||
      typeof request.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
      request.approved !== true || !Number.isSafeInteger(request.approvedAt) ||
      request.approvedAt < 0 || !Number.isSafeInteger(request.expiresAt) ||
      request.expiresAt <= request.approvedAt ||
      request.expiresAt - request.approvedAt > 60000)
    throw new Error('B03A_INVALID_REQUEST');
  return Object.freeze({id:request.id,feature:request.feature,
    fingerprint:request.fingerprint,approvedAt:request.approvedAt,
    expiresAt:request.expiresAt});
}
function routeqQaB03ARecordKey_(id) {
  return 'ROUTEQ_QA_B03A_RESERVATION_V1_' + id;
}
function routeqQaB03ARead_(props, key, snapshot) {
  const raw = props.getProperty(key);
  if (raw === null) return null;
  let r;
  try { r = JSON.parse(raw); } catch (_) { throw new Error('B03A_JOURNAL_CORRUPT'); }
  if (!r || typeof r !== 'object' || Array.isArray(r) ||
      Object.keys(r).length !== 9 || r.version !== 1 ||
      r.id !== snapshot.id || r.feature !== snapshot.feature ||
      r.fingerprint !== snapshot.fingerprint ||
      r.approvedAt !== snapshot.approvedAt ||
      r.expiresAt !== snapshot.expiresAt ||
      !Number.isSafeInteger(r.createdAt) || r.createdAt < 0 ||
      !Number.isSafeInteger(r.updatedAt) || r.updatedAt < r.createdAt ||
      ['RESERVED','UNKNOWN','COMPLETED'].indexOf(r.state) < 0)
    throw new Error('B03A_JOURNAL_CONFLICT');
  return r;
}
function routeqQaB03AWrite_(props, key, record) {
  const raw = JSON.stringify(record);
  props.setProperty(key, raw);
  if (props.getProperty(key) !== raw) throw new Error('B03A_JOURNAL_NOT_DURABLE');
}
function routeqQaB03ALocked_(operation) {
  assertRouteqQaTestEnvironment_();
  const lock = LockService.getScriptLock();
  if (!lock || !lock.tryLock(20000)) throw new Error('B03A_LOCK_UNAVAILABLE');
  try {
    assertRouteqQaTestEnvironment_();
    return operation(PropertiesService.getScriptProperties());
  } finally { lock.releaseLock(); }
}
function routeqQaB03ACheckGateAndTime_(snapshot) {
  const now = Date.now();
  if (!Number.isSafeInteger(now) || now < snapshot.approvedAt ||
      now >= snapshot.expiresAt) throw new Error('B03A_APPROVAL_EXPIRED');
  if (!routeqQaTestFeatureGateStatus_(snapshot.feature).configured)
    throw new Error('B03A_TEST_GATE_OFF');
  return now;
}
function routeqQaB03AResult_(action, state) {
  return Object.freeze({action:action,state:state,executionAuthorized:false,
    externalExecutionPermitted:false,retryAllowed:false,networkRequests:0});
}
/** One irreversible TEST reservation. Approval input alone is NOT trusted authority. */
function routeqQaReserveDurableTestRequest_(request) {
  const s = routeqQaB03ASnapshot_(request);
  return routeqQaB03ALocked_(function(props) {
    routeqQaB03ACheckGateAndTime_(s);
    const key = routeqQaB03ARecordKey_(s.id);
    const old = routeqQaB03ARead_(props, key, s);
    if (old) return routeqQaB03AResult_('BLOCK_REPLAY',old.state);
    const now = routeqQaB03ACheckGateAndTime_(s);
    routeqQaB03AWrite_(props,key,{version:1,id:s.id,feature:s.feature,
      fingerprint:s.fingerprint,approvedAt:s.approvedAt,expiresAt:s.expiresAt,
      state:'RESERVED',createdAt:now,updatedAt:now});
    return routeqQaB03AResult_('RESERVE_ONLY','RESERVED');
  });
}
/** Persist UNKNOWN BEFORE any future transport. This function does no transport. */
function routeqQaMarkDurableTestAttempt_(request) {
  const s = routeqQaB03ASnapshot_(request);
  return routeqQaB03ALocked_(function(props) {
    routeqQaB03ACheckGateAndTime_(s);
    const key = routeqQaB03ARecordKey_(s.id);
    const old = routeqQaB03ARead_(props,key,s);
    if (!old) throw new Error('B03A_RESERVATION_MISSING');
    if (old.state !== 'RESERVED') return routeqQaB03AResult_('BLOCK_REPLAY',old.state);
    old.state = 'UNKNOWN';
    old.updatedAt = routeqQaB03ACheckGateAndTime_(s);
    routeqQaB03AWrite_(props,key,old);
    return routeqQaB03AResult_('ATTEMPT_CONSUMED_NO_TRANSPORT','UNKNOWN');
  });
}
