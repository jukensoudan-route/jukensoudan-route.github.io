/**
 * B-03A TEST-only outbound request preflight.
 * A successful preflight is NOT permission to execute the request.
 * routeqQaRejectExternalFetch_ remains the sole active network boundary.
 */
function routeqQaInspectTestRequest_(feature, rawUrl, method) {
  assertRouteqQaTestEnvironment_();
  const routes = {
    stripe_test: { host: 'api.stripe.com', path: /^\/v1\/(checkout\/sessions(?:\/[^/]+)?|payment_intents(?:\/[^/]+)?)$/ },
    ai: { host: 'api.openai.com', path: /^\/v1\/(responses|chat\/completions)$/ },
    line_manual_test: { host: 'api.line.me', path: /^\/v2\/bot\/message\/push$/ }
  };
  if (!Object.prototype.hasOwnProperty.call(routes, feature)) {
    throw new Error('TEST preflight: unsupported external feature');
  }
  const target = String(rawUrl || '');
  // Reject URL userinfo, fragments, query parameters, ports and suffix hosts.
  const parsed = /^https:\/\/([a-z0-9.-]+)(\/[^?#]*)$/i.exec(target);
  if (!parsed || parsed[1].toLowerCase() !== routes[feature].host ||
      !routes[feature].path.test(parsed[2]) || String(method).toUpperCase() !== 'POST') {
    throw new Error('TEST preflight: endpoint or method rejected');
  }
  const status = routeqQaTestFeatureGateStatus_(feature);
  if (!status.configured) throw new Error('TEST preflight: feature gate OFF');
  return Object.freeze({
    feature: feature, endpointValidated: true,
    executionAuthorized: false, externalExecutionPermitted: false
  });
}
