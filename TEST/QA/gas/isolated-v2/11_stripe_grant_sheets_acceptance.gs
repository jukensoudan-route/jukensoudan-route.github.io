/**
 * Owner-run isolated TEST acceptance for the post-payment Sheets grant path.
 *
 * This deliberately does NOT call Stripe, create a Checkout Session, accept a
 * webhook, send LINE, or invoke AI. It uses a fixed synthetic paid Session and
 * the existing grant/recovery implementation against the isolated spreadsheet.
 * Re-running it must not grant a second time.
 */
function testRouteqQaStripeGrantSheetsAcceptance() {
  assertRouteqQaTestEnvironment_();

  const session = Object.freeze({
    id: 'cs_test_routeq_isolated_grant_20261023_001',
    payment_intent: 'pi_test_routeq_isolated_grant_20261023_001',
    payment_status: 'paid',
    amount_total: 1000,
    livemode: false,
    client_reference_id: 'U_ROUTEQ_ISOLATED_MOCK_20261023',
    metadata: Object.freeze({
      line_user_id: 'U_ROUTEQ_ISOLATED_MOCK_20261023',
      display_name: 'ROUTEQ isolated acceptance',
      ticket_code: 'ticket3',
      ticket_label: '1,000円／3回',
      grant_count: '3',
      fixture: 'ROUTEQ_QA_ISOLATED_20261023'
    })
  });

  if (session.livemode !== false) {
    throw new Error('STRIPE_ACCEPTANCE_LIVEMODE_REJECTED');
  }

  const ss = openRouteqQaTestSpreadsheet_();
  const users = ss.getSheetByName(ROUTE_QA.USERS);
  const payments = ss.getSheetByName(ROUTE_QA.PAYMENTS);
  if (!users || !payments) throw new Error('STRIPE_ACCEPTANCE_SHEETS_MISSING');

  const userRow = findRouteUserRow_(users, session.client_reference_id);
  if (userRow <= 0) throw new Error('STRIPE_ACCEPTANCE_FIXTURE_USER_MISSING');

  let paymentRow = findPaymentRowBySessionId_(payments, session.id);
  if (paymentRow <= 0) {
    const before = users.getRange(userRow, 1, 1, 12).getValues()[0];
    const beforePaid = Number(before[ROUTE_QA.USER_COL.TOTAL_PAID - 1] || 0);
    const beforeGranted = Number(before[ROUTE_QA.USER_COL.TOTAL_GRANTED - 1] || 0);
    const beforeRemaining = Number(before[ROUTE_QA.USER_COL.REMAINING - 1] || 0);
    if (![beforePaid, beforeGranted, beforeRemaining].every(function(value) {
      return Number.isSafeInteger(value) && value >= 0;
    })) {
      throw new Error('STRIPE_ACCEPTANCE_FIXTURE_COUNTER_INVALID');
    }
    payments.appendRow([
      new Date(), session.client_reference_id, session.metadata.display_name,
      'ticket3', 1000, 3, session.id, '', '作成', '未付与', '',
      new Date(), ''
    ]);
    paymentRow = payments.getLastRow();
  }

  const first = applyPaidStripeSession_(
    session,
    ROUTEQ_QA_STRIPE_GRANT_ACCEPTANCE_PERMIT_
  );
  const afterFirst = users.getRange(userRow, 1, 1, 12).getValues()[0];
  const firstRemaining = Number(afterFirst[ROUTE_QA.USER_COL.REMAINING - 1]);

  const second = applyPaidStripeSession_(
    session,
    ROUTEQ_QA_STRIPE_GRANT_ACCEPTANCE_PERMIT_
  );
  const afterSecond = users.getRange(userRow, 1, 1, 12).getValues()[0];
  const secondRemaining = Number(afterSecond[ROUTE_QA.USER_COL.REMAINING - 1]);
  const paymentValues = payments.getRange(paymentRow, 1, 1, 13).getValues()[0];

  if ((!first.granted && !first.alreadyGranted) ||
      second.alreadyGranted !== true ||
      firstRemaining !== secondRemaining ||
      String(paymentValues[7] || '') !== session.payment_intent ||
      String(paymentValues[8] || '') !== '支払済' ||
      String(paymentValues[9] || '') !== '付与済' ||
      !String(paymentValues[12] || '')) {
    throw new Error('STRIPE_ACCEPTANCE_GRANT_OR_IDEMPOTENCY_FAIL');
  }

  const result = Object.freeze({
    status: 'PASS',
    environment: 'ISOLATED_TEST',
    syntheticStripeSession: true,
    livemode: false,
    externalStripeRequests: 0,
    paymentRow: paymentRow,
    firstRunGranted: first.granted === true,
    replayAlreadyGranted: second.alreadyGranted === true,
    remainingAfterFirst: firstRemaining,
    remainingAfterReplay: secondRemaining,
    paymentState: String(paymentValues[9] || ''),
    recoveryJournalPresent: Boolean(String(paymentValues[12] || '')),
    lineRealSendExecuted: false,
    aiApiInvoked: false
  });
  console.log(JSON.stringify(result));
  return result;
}
