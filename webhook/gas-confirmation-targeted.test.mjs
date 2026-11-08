import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyGasConfirmationResponse } from './gas-confirmation.mjs';
const eventId='evt_target_0401';
const good={ok:true,type:'confirmCheckout',requestId:'stripe-webhook-'+eventId,result:{paymentStatus:'paid',granted:true,alreadyGranted:false,remainingCount:3}};
const html=x=>'<html><script>const result={payload:'+JSON.stringify(x)+'};</script></html>';
const verify=x=>verifyGasConfirmationResponse(x,eventId);
test('granted: exactly one grant confirmed',()=>assert.deepEqual(verify(html(good)),{granted:true,alreadyGranted:false,remainingCount:3}));
test('alreadyGranted: valid idempotent receipt',()=>assert.deepEqual(verify(html({...good,result:{...good.result,granted:false,alreadyGranted:true}})),{granted:false,alreadyGranted:true,remainingCount:3}));
test('outer ok alone cannot succeed',()=>assert.throws(()=>verify('<html>ok:true</html>')));
test('ungranted is UNKNOWN, not success',()=>assert.throws(()=>verify(html({...good,result:{...good.result,granted:false,alreadyGranted:false}}))));
test('contradictory grant flags stopped',()=>assert.throws(()=>verify(html({...good,result:{...good.result,granted:true,alreadyGranted:true}}))));
test('manual reconciliation stopped',()=>assert.throws(()=>verify(html({...good,result:{...good.result,requiresReview:true}}))));
test('malformed reply and absent balance stopped',()=>{
  assert.throws(()=>verify('<html>not json</html>'));
  assert.throws(()=>verify(html({...good,result:{...good.result,remainingCount:null}})));
});
test('wrong requestId and unpaid stopped',()=>{
  assert.throws(()=>verify(html({...good,requestId:'stripe-webhook-other'})));
  assert.throws(()=>verify(html({...good,result:{...good.result,paymentStatus:'unpaid'}})));
});
