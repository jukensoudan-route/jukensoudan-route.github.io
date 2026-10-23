/**
 * B-03A offline-only approval and replay decision model.
 * Caller-supplied immutable snapshots: this does NOT persist, lock, send,
 * grant permissions, or invoke an external service.
 */
function routeqQaDecideOfflineTransition_(request, saved, now) {
  function stop(reason) {
    return Object.freeze({
      decision: 'STOP', reason: reason,
      executionAuthorized: false, externalExecutionPermitted: false,
      retryAllowed: false, networkRequests: 0
    });
  }
  function isOfflineDecisionSnapshot_(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Reflect.ownKeys(value);
    if (keys.some(function(key) { return typeof key !== 'string'; })) return false;
    keys.sort();
    const wanted = expected.slice().sort();
    if (keys.length !== wanted.length || keys.some(function(key, index) {
      return key !== wanted[index];
    })) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return keys.every(function(key) {
      return descriptors[key] && Object.prototype.hasOwnProperty.call(descriptors[key], 'value');
    });
  }
  if (!isOfflineDecisionSnapshot_(request,
      ['id', 'feature', 'fingerprint', 'approved', 'approvedAt', 'expiresAt']) ||
      !Number.isSafeInteger(now) || now < 0) return stop('INVALID_INPUT');
  const id = request.id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(id)) return stop('INVALID_ID');
  if (request.feature !== 'stripe_test' && request.feature !== 'ai' &&
      request.feature !== 'line_manual_test') return stop('INVALID_FEATURE');
  if (typeof request.fingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(request.fingerprint)) return stop('INVALID_FINGERPRINT');
  if (!Number.isSafeInteger(request.approvedAt) ||
      !Number.isSafeInteger(request.expiresAt) ||
      request.approvedAt < 0 ||
      request.expiresAt <= request.approvedAt ||
      request.expiresAt - request.approvedAt > 60000 ||
      now < request.approvedAt || now >= request.expiresAt) return stop('EXPIRED');
  if (request.approved !== true) return stop('NOT_APPROVED');
  if (saved !== null && saved !== undefined) {
    if (!isOfflineDecisionSnapshot_(saved,
        ['id', 'feature', 'fingerprint', 'approvedAt', 'expiresAt', 'state']) ||
        saved.id !== id || saved.feature !== request.feature ||
        saved.fingerprint !== request.fingerprint ||
        saved.approvedAt !== request.approvedAt ||
        saved.expiresAt !== request.expiresAt) return stop('LEDGER_MISMATCH');
    if (saved.state === 'UNKNOWN') return stop('UNKNOWN_NO_RETRY');
    if (saved.state === 'CONSUMED' || saved.state === 'SUCCEEDED' ||
        saved.state === 'FAILED' || saved.state === 'RESERVED') return stop('ALREADY_USED');
    return stop('INVALID_LEDGER_STATE');
  }
  // Candidate reservation only. A real future executor must atomically
  // persist reservation under lock BEFORE any outbound action.
  return Object.freeze({
    decision: 'RESERVE_ONLY', reason: 'OFFLINE_CANDIDATE',
    id: id, feature: request.feature, fingerprint: request.fingerprint,
    approvedAt: request.approvedAt, expiresAt: request.expiresAt,
    executionAuthorized: false, externalExecutionPermitted: false,
    retryAllowed: false, networkRequests: 0
  });
}
