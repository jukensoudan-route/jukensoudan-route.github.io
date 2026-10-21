/**
 * ROUTEQ Q&A isolated TEST: fail-closed external I/O boundary.
 *
 * Deliberately NO UrlFetchApp invocation. All direct network call sites in
 * the migrated Q&A core, Stripe and material registration modules use this
 * wrapper until an explicit TEST-only implementation is reviewed.
 *
 * This module does NOT simulate an AI response, LINE notification or payment.
 * It is only a safety barrier.
 */
function routeqQaRejectExternalFetch_(url, options) {
  assertRouteqQaTestEnvironment_();
  throw new Error('ROUTEQ isolated TEST: all outbound HTTP disabled (' +
    routeqQaClassifyExternalEndpoint_(url) + ')');
}

function routeqQaClassifyExternalEndpoint_(url) {
  const target = String(url || '');
  if (/api\.line\.me/i.test(target)) return 'LINE';
  if (/api\.stripe\.com/i.test(target)) return 'STRIPE';
  if (/api\.openai\.com/i.test(target)) return 'OPENAI';
  if (/googleapis\.com/i.test(target)) return 'GOOGLE_API';
  return 'OTHER';
}

/** An offline check; does not access Google services or the network. */
function testRouteqQaExternalBoundary() {
  const expected = [
    ['https://api.line.me/v2/profile', 'LINE'],
    ['https://api.stripe.com/v1/checkout/sessions', 'STRIPE'],
    ['https://api.openai.com/v1/responses', 'OPENAI'],
    ['https://www.googleapis.com/drive/v3/files/a', 'GOOGLE_API'],
    ['https://example.invalid/', 'OTHER']
  ];
  expected.forEach(function(entry) {
    if (routeqQaClassifyExternalEndpoint_(entry[0]) !== entry[1]) {
      throw new Error('TEST external endpoint classification mismatch');
    }
  });
  return { ok: true, cases: expected.length, networkRequests: 0 };
}
