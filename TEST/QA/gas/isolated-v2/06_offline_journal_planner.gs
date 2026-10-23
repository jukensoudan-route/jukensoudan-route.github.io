/**
 * B-03A offline-only journal transition planner.
 * The caller must implement durable compare-and-swap under an exclusive lock.
 * This pure function performs no storage, network, authorization or delivery.
 */
function routeqQaPlanOfflineJournalTransition_(current, request, now) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      typeof request.id !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(request.id) ||
      !['stripe_test', 'ai', 'line_manual_test'].includes(request.feature) ||
      typeof request.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
      !Number.isSafeInteger(request.approvedAt) ||
      !Number.isSafeInteger(request.expiresAt) || !Number.isSafeInteger(now)) {
    throw new Error('B-03A journal: invalid request');
  }
  if (current !== null && current !== undefined) {
    if (typeof current !== 'object' || current.id !== request.id ||
        current.feature !== request.feature ||
        current.fingerprint !== request.fingerprint ||
        current.approvedAt !== request.approvedAt ||
        current.expiresAt !== request.expiresAt ||
        !['RESERVED', 'UNKNOWN', 'COMPLETED', 'DENIED'].includes(current.state)) {
      throw new Error('B-03A journal: conflict or malformed record');
    }
    return Object.freeze({
      action: 'BLOCK_REPLAY', state: current.state,
      executionAuthorized: false, retryAllowed: false
    });
  }
  if (request.approved !== true) {
    return Object.freeze({
      action: 'DENY_NOT_APPROVED', state: 'DENIED',
      executionAuthorized: false, retryAllowed: false
    });
  }
  if (request.approvedAt < 0 || request.expiresAt <= request.approvedAt ||
      request.expiresAt - request.approvedAt > 60000 ||
      now < request.approvedAt || now >= request.expiresAt) {
    return Object.freeze({
      action: 'DENY_EXPIRED', state: 'DENIED',
      executionAuthorized: false, retryAllowed: false
    });
  }
  return Object.freeze({
    action: 'RESERVE_ONLY', state: 'RESERVED',
    id: request.id, feature: request.feature, fingerprint: request.fingerprint,
    approvedAt: request.approvedAt, expiresAt: request.expiresAt,
    executionAuthorized: false, retryAllowed: false
  });
}
