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
assert.throws(()=>validate(signed(payload()).replace(/"signature":"[0-9a-f]/,'"signature":"0')),
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
console.log('GAS signed Stripe TEST admission: 12/12 PASS; Sheets writes 0; network 0; grants 0');
