/**
 * B-03A offline-only approval and replay decision model.
 * Caller-supplied immutable snapshots: this does NOT persist, lock, send,
 * grant permissions, or invoke an external service.
 */
function routeqQaDecideOfflineTransition_(request, saved, now) {
  function stop(reason) {
    return Object.freeze({ decision: 'STOP', reason: reason, executionAuthorized: false });
  }
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      !Number.isSafeInteger(now) || now < 0) return stop('INVALID_INPUT');
  const id = request.id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(id)) return stop('INVALID_ID');
  if (request.feature !== 'stripe_test' && request.feature !== 'ai' &&
      request.feature !== 'line_manual_test') return stop('INVALID_FEATURE');
  if (typeof request.fingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(request.fingerprint)) return stop('INVALID_FINGERPRINT');
  if (!Number.isSafeInteger(request.approvedAt) ||
      !Number.isSafeInteger(request.expiresAt) ||
      request.expiresAt <= request.approvedAt ||
      request.expiresAt - request.approvedAt > 60000 ||
      now < request.approvedAt || now >= request.expiresAt) return stop('EXPIRED');
  if (request.approved !== true) return stop('NOT_APPROVED');
  if (saved !== null && saved !== undefined) {
    if (typeof saved !== 'object' || Array.isArray(saved) ||
        saved.id !== id || saved.feature !== request.feature ||
        saved.fingerprint !== request.fingerprint) return stop('LEDGER_MISMATCH');
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
    executionAuthorized: false
  });
}
