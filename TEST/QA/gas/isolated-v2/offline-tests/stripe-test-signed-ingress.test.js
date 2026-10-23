/**
 * Zero-network signed Stripe TEST ingestion verification.
 * Exercises the exact Apps Script verifier with mocked Google services.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const secret='test-only-not-a-real-secret-0123456789abcdef';
const props=new Map([
 ['ROUTEQ_QA_STRIPE_TEST_INGRESS_ENABLED','ON'],
 ['ROUTEQ_QA_STRIPE_TEST_GATEWAY_SECRET',secret]
]);
let spreadsheetCalls=0, grants=0;
const context={
  Date, JSON, Math, Number, Object, RegExp, String,
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key)||null})},
  Utilities:{
    Charset:{UTF_8:'UTF-8'},
    computeHmacSha256Signature:(body,key)=>Array.from(
      crypto.createHmac('sha256',key).update(body,'utf8').digest()
    ).map(byte=>byte>127?byte-256:byte)
  },
  assertRouteqQaTestEnvironment_:()=>true,
  openRouteqQaTestSpreadsheet_:()=>{spreadsheetCalls++;throw Error('GAS Sheets accessed in verifier');},
  applyPaidStripeSession_:()=>{grants++;throw Error('grant called in verifier');},
};
vm.createContext(context);
vm.runInContext(
  "const ROUTE_STRIPE_TICKETS={ticket3:{amount:1000,count:3},ticket10:{amount:3000,count:10}};",
  context
);
vm.runInContext(
  fs.readFileSync(path.join(__dirname,'..','13_stripe_test_signed_ingress.gs'),'utf8'),
  context
);
const uid='U_ROUTEQ_ISOLATED_MOCK_20261023';
const marker='ROUTEQ_QA_ISOLATED_STRIPE_TEST_20261023';
const payload=(overrides={})=>({
  v:1,source:'ROUTEQ_QA_TEST_GATEWAY',stripeAccount:'acct_1TjYNMIRwv4Jy7lt',
  eventId:'evt_routeqQA1',eventType:'checkout.session.completed',
  session:{
    id:'cs_test_routeqQA1',payment_intent:'pi_routeqQA1',livemode:false,
    mode:'payment',status:'complete',payment_status:'paid',currency:'jpy',
    amount_total:1000,client_reference_id:uid,
    metadata:{line_user_id:uid,display_name:'ROUTEQ isolated TEST',
      routeq_test_marker:marker,ticket_code:'ticket3',grant_count:'3'}
  },...overrides
});
function signed(p,when=Math.floor(Date.now()/1000)){
  const body=JSON.stringify(p);
  const signature=crypto.createHmac('sha256',secret)
    .update(when+'.'+body,'utf8').digest('hex');
  return JSON.stringify({timestamp:when,payload:body,signature});
}
function validate(raw){
  return context.routeqQaValidateSignedStripeTestEnvelope_(raw);
}
const good=validate(signed(payload()));
assert.equal(good.id,'cs_test_routeqQA1');
assert.equal(good.metadata.ticket_code,'ticket3');
assert.equal(good.client_reference_id,uid);
assert.equal(good.livemode,false);
assert.throws(()=>validate(signed(payload(),Math.floor(Date.now()/1000)-600)),
  /STRIPE_TEST_ENVELOPE_EXPIRED/);
assert.throws(()=>validate(signed(payload()).replace(/("signature":")([0-9a-f])/,(_,prefix,digit)=>prefix+(digit==='0'?'1':'0'))),
  /STRIPE_TEST_ENVELOPE_SIGNATURE_INVALID/);
assert.throws(()=>validate(signed(payload({stripeAccount:'acct_OTHER'}))),
  /STRIPE_TEST_PACKET_IDENTITY_INVALID/);
assert.throws(()=>validate(signed(payload({eventType:'charge.succeeded'}))),
  /STRIPE_TEST_PACKET_IDENTITY_INVALID/);
assert.throws(()=>validate(signed(payload({session:{...payload().session,livemode:true}}))),
  /STRIPE_TEST_SESSION_IDENTITY_INVALID/);
assert.throws(()=>validate(signed(payload({session:{...payload().session,amount_total:999}}))),
  /STRIPE_TEST_SESSION_PRODUCT_INVALID/);
assert.throws(()=>validate(signed(payload({session:{...payload().session,client_reference_id:'U_OTHER'}}))),
  /STRIPE_TEST_SESSION_IDENTITY_INVALID/);
assert.throws(()=>validate(signed(payload({session:{...payload().session,metadata:{...payload().session.metadata,routeq_test_marker:'OTHER'}}}))),
  /STRIPE_TEST_SESSION_IDENTITY_INVALID/);
props.set('ROUTEQ_QA_STRIPE_TEST_INGRESS_ENABLED','OFF');
assert.throws(()=>validate(signed(payload())),/STRIPE_TEST_INGRESS_DISABLED/);
props.set('ROUTEQ_QA_STRIPE_TEST_INGRESS_ENABLED','ON');
props.set('ROUTEQ_QA_STRIPE_TEST_GATEWAY_SECRET','weak');
assert.throws(()=>validate(signed(payload())),/STRIPE_TEST_SHARED_SECRET_MISSING/);
assert.equal(spreadsheetCalls,0);
assert.equal(grants,0);
const source=fs.readFileSync(path.join(__dirname,'..','訂正シート最優先・直接参照.gs'),'utf8');
assert.match(source,/action\s*\|\|\s*''\)\s*===\s*'routeqQaStripeTestWebhook'/);
assert.match(source,/routeqQaBlockSensitiveEntry_\('doPost'\)/);

// Independently exercise the ingress-to-grant handoff with in-memory Sheets.
// No Google service or live payment is contacted.
props.set('ROUTEQ_QA_STRIPE_TEST_GATEWAY_SECRET',secret);
const rows=[];
let lockReleases=0;
const payments={
  appendRow(v){ rows.push(v); },
  getRange(row){return {getValues(){return [rows[row-2].slice()];}}}
};
context.ROUTE_QA={PAYMENTS:'Payments',USERS:'Users'};
context.openRouteqQaTestSpreadsheet_=()=>({
  getSheetByName:name=>name==='Payments'?payments:name==='Users'?{}:null
});
context.LockService={getScriptLock:()=>({
  waitLock(){},releaseLock(){lockReleases++;}
})};
context.findRouteUserRow_=()=>2;
context.findPaymentRowBySessionId_=(_sheet,id)=>{
  const i=rows.findIndex(row=>row[6]===id);
  return i<0?-1:i+2;
};
context.findPaymentRowByPaymentIntent_=(_sheet,id)=>{
  const i=rows.findIndex(row=>row[7]===id);
  return i<0?-1:i+2;
};
let mockGrantCalls=0;
context.applyPaidStripeSession_=(s,permit)=>{
  assert.strictEqual(permit,vm.runInContext('ROUTEQ_QA_STRIPE_TEST_GATEWAY_PERMIT_',context));
  assert.equal(s.client_reference_id,uid);
  mockGrantCalls++;
  rows[0][7]=s.payment_intent;
  rows[0][8]='支払済';
  rows[0][9]='付与済';
  return {granted:mockGrantCalls===1,alreadyGranted:mockGrantCalls>1};
};
const success=context.routeqQaAcceptSignedStripeTestPost_(signed(payload()));
assert.equal(success.ok,true);
assert.equal(success.granted,true);
assert.equal(rows.length,1);
const repeated=context.routeqQaAcceptSignedStripeTestPost_(signed(payload()));
assert.equal(repeated.alreadyGranted,true);
assert.equal(rows.length,1);
const other={...payload(),session:{...payload().session,id:'cs_test_otherSession1'}};
assert.throws(()=>context.routeqQaAcceptSignedStripeTestPost_(signed(other)),
 /STRIPE_TEST_INTENT_CONFLICT/);
assert.equal(rows.length,1);
assert.equal(lockReleases,3);
assert.equal(mockGrantCalls,2);
// These are mocks, NOT evidence of an actual Stripe or GAS grant.
console.log('Signed ingress staging/replay mock PASS; total appended Payments 1; no real Stripe calls');

console.log('GAS signed Stripe TEST admission: 12/12 PASS; Sheets writes 0; network 0; grants 0');
