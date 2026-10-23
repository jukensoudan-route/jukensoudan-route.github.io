/**
 * B-03A offline-only journal transition planner.
 * The caller must implement durable compare-and-swap under an exclusive lock.
 * This pure function performs no storage, network, authorization or delivery.
 */
function routeqQaPlanOfflineJournalTransition_(current, request, now) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      typeof request.id !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(request.id) ||
      typeof request.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
      !Number.isSafeInteger(request.expiresAt) || !Number.isSafeInteger(now)) {
    throw new Error('B-03A journal: invalid request');
  }
  if (current !== null && current !== undefined) {
    if (typeof current !== 'object' || current.id !== request.id ||
        current.fingerprint !== request.fingerprint ||
        !['RESERVED', 'UNKNOWN', 'COMPLETED', 'DENIED'].includes(current.state)) {
      throw new Error('B-03A journal: conflict or malformed record');
    }
    return Object.freeze({
      action: 'BLOCK_REPLAY', state: current.state,
      executionAuthorized: false, retryAllowed: false
    });
  }
  if (now >= request.expiresAt || request.expiresAt - now > 60000 || now < 0) {
    return Object.freeze({
      action: 'DENY_EXPIRED', state: 'DENIED',
      executionAuthorized: false, retryAllowed: false
    });
  }
  return Object.freeze({
    action: 'RESERVE_ONLY', state: 'RESERVED',
    id: request.id, fingerprint: request.fingerprint,
    executionAuthorized: false, retryAllowed: false
  });
}
