/**
 * Extract and validate the real GAS HtmlService confirmation payload without
 * executing HTML/JavaScript. This is intentionally fail-closed.
 *
 * The archived GAS doPost responds:
 *   payload: { ok: true, type: "confirmCheckout",
 *              requestId: "...",
 *              result: { paymentStatus: "paid", granted: true|false,
 *                        alreadyGranted: false|true, remainingCount: N } }
 *
 * Actual deployed GAS must still be inspected before enabling production.
 */
function normalizeGasHtml(text) {
  return text
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractGasPayload(text) {
  if (typeof text !== "string" || text.length > 1000000) {
    throw new Error("gas_invalid_response");
  }
  const content = normalizeGasHtml(text);
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) {
    try { return JSON.parse(trimmed); }
    catch { throw new Error("gas_invalid_json"); }
  }

  const found = /\bpayload\s*:\s*\{/.exec(content);
  if (!found) throw new Error("gas_payload_missing");

  const open = content.indexOf("{", found.index);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = open; i < content.length; i++) {
    const ch = content[i];
    if (quoted) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        const literal = content.slice(open, i + 1);
        try { return JSON.parse(literal); }
        catch { throw new Error("gas_invalid_payload_json"); }
      }
    }
  }
  throw new Error("gas_payload_unterminated");
}

export function verifyGasConfirmationResponse(text, eventId) {
  const data = extractGasPayload(text);
  const expectedRequestId = "stripe-webhook-" + String(eventId || "");
  if (!eventId || !data || data.ok !== true ||
      data.type !== "confirmCheckout" ||
      data.requestId !== expectedRequestId) {
    throw new Error("gas_confirmation_not_verified");
  }
  const result = data.result;
  if (!result || result.paymentStatus !== "paid") {
    throw new Error("gas_payment_not_confirmed");
  }
  const newlyGranted = result.granted === true && result.alreadyGranted === false;
  const previouslyGranted = result.granted === false && result.alreadyGranted === true;
  if ((!newlyGranted && !previouslyGranted) ||
      !Number.isSafeInteger(result.remainingCount) || result.remainingCount < 0) {
    throw new Error("gas_grant_state_not_verified");
  }
  return { granted: newlyGranted, alreadyGranted: previouslyGranted, remainingCount: result.remainingCount };
}
