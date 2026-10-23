/**
 * B-03A OFFLINE control prototype. Not wired to any application entry point.
 * No transport, callback, credentials, payload, persistence or automatic retry.
 * The returned object is a one-shot simulation handle, never a send permit.
 */
function routeqQaPrepareOfflineTestRequest_(feature, url, method) {
  if (typeof feature !== 'string' || typeof url !== 'string' || typeof method !== 'string') {
    throw new Error('TEST control: primitive request fields required');
  }
  routeqQaInspectTestRequest_(feature, url, method);
  const preparedAt = Date.now();
  let consumed = false;
  return Object.freeze({
    feature: feature,
    executionAuthorized: false,
    externalExecutionPermitted: false,
    simulate: function(mode) {
      if (consumed) throw new Error('TEST control: request already consumed');
      // Consume before validation: failures cannot be retried with this handle.
      consumed = true;
      if (mode !== 'OFFLINE_DRY_RUN') {
        throw new Error('TEST control: external execution disabled');
      }
      const now = Date.now();
      if (!Number.isSafeInteger(preparedAt) || !Number.isSafeInteger(now) ||
          now < preparedAt || now - preparedAt >= 60000) {
        throw new Error('TEST control: expired or invalid clock');
      }
      // Re-read environment identity and feature gate at consumption time.
      // The caller cannot supply a preflight result, replacement URL or executor.
      routeqQaInspectTestRequest_(feature, url, method);
      return Object.freeze({
        feature: feature,
        state: 'OFFLINE_SIMULATED',
        executionAuthorized: false,
        externalExecutionPermitted: false,
        networkRequests: 0
      });
    }
  });
}
