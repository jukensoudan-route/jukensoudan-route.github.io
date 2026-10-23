import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import Stripe from "stripe";
import {createHmac} from "node:crypto";
import {createRouteqQaTestGateway,validateIsolatedTestSession} from "./routeq-qa-test-gateway.js";

const helper = new Stripe("sk_test_offline_fixture");
const webhookSecret="whsec_routeq_qa_offline_fixture";
const sharedSecret="A".repeat(40);
const gasUrl="https://script.google.com/macros/s/AKfyOFFLINE/exec?action=routeqQaStripeTestWebhook";
const user="U_ROUTEQ_ISOLATED_MOCK_20261023";
const marker="ROUTEQ_QA_ISOLATED_STRIPE_TEST_20261023";
const servers=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise(resolve=>s.close(resolve))));});

function session(overrides={}) {
  return {id:"cs_test_routeqQA1", payment_intent:"pi_routeqQA1", livemode:false,
    mode:"payment",status:"complete",payment_status:"paid",currency:"jpy",amount_total:1000,
    client_reference_id:user,
    metadata:{line_user_id:user,routeq_test_marker:marker,ticket_code:"ticket3",grant_count:"3"},
    ...overrides};
}
function event(overrides={}) {
  return {id:"evt_routeqQA1",type:"checkout.session.completed",livemode:false,
    data:{object:{id:"cs_test_routeqQA1"}},...overrides};
}
async function start(overrides={}) {
  let gasCalls=0,retrieveCalls=0;
  let lastEnvelope;
  const app=createRouteqQaTestGateway({
    enabled:"ON",webhookSecret,stripeTestKey:"sk_test_offline_fixture",
    sharedSecret,gasUrl,
    stripeClient:{
      webhooks:helper.webhooks,
      checkout:{sessions:{retrieve:async(id)=>{retrieveCalls++;return session(overrides.session||{});}}}
    },
    fetchImpl:async(url,options)=>{
      gasCalls++;
      assert.equal(url,gasUrl);
      lastEnvelope=JSON.parse(options.body);
      const mac=createHmac("sha256",sharedSecret)
        .update(lastEnvelope.timestamp+"."+lastEnvelope.payload,"utf8").digest("hex");
      assert.equal(lastEnvelope.signature,mac);
      assert.equal(JSON.parse(lastEnvelope.payload).stripeAccount,"acct_1TjYNMIRwv4Jy7lt");
      return new Response(JSON.stringify(overrides.gasResponse||{ok:true,environment:"ISOLATED_TEST"}),{status:overrides.gasStatus||200});
    }
  });
  const server=app.listen(0,"127.0.0.1");servers.push(server);
  await new Promise(resolve=>server.once("listening",resolve));
  return {base:"http://127.0.0.1:"+server.address().port,
    getCounts:()=>({gasCalls,retrieveCalls,lastEnvelope})};
}
async function post(base,obj=event(),valid=true){
  const body=JSON.stringify(obj);
  const signature=valid?helper.webhooks.generateTestHeaderString({payload:body,secret:webhookSecret}):"t=1,v1=invalid";
  const response=await fetch(base+"/stripe/webhook",{method:"POST",headers:{"content-type":"application/json","stripe-signature":signature},body});
  return {status:response.status,json:await response.json()};
}
test("disabled gateway fails closed without Stripe or GAS access",async()=>{
  const app=createRouteqQaTestGateway({enabled:"OFF"});
  const server=app.listen(0,"127.0.0.1");servers.push(server);await new Promise(r=>server.once("listening",r));
  assert.equal((await post("http://127.0.0.1:"+server.address().port)).status,503);
});
test("signed TEST payment is retrieved and forwarded only to isolated GAS",async()=>{
  const {base,getCounts}=await start();
  assert.equal((await post(base)).status,200);
  assert.equal(getCounts().retrieveCalls,1);
  assert.equal(getCounts().gasCalls,1);
  assert.equal(JSON.parse(getCounts().lastEnvelope.payload).session.metadata.routeq_test_marker,marker);
});
test("invalid Stripe signature cannot reach GAS",async()=>{
  const {base,getCounts}=await start();
  const r=await post(base,event(),false);
  assert.equal(r.status,400);assert.equal(getCounts().gasCalls,0);assert.equal(getCounts().retrieveCalls,0);
});
test("LIVE event or unrecognized account never retrieves payment",async()=>{
  const {base,getCounts}=await start();
  assert.equal((await post(base,event({livemode:true}))).status,200);
  assert.equal((await post(base,event({account:"acct_OTHER"}))).status,200);
  assert.equal(getCounts().retrieveCalls,0);
});
test("ordinary TEST checkout cannot grant isolated Q&A tickets",async()=>{
  const {base,getCounts}=await start({session:session({metadata:{line_user_id:user,ticket_code:"ticket3",grant_count:"3"}})});
  assert.equal((await post(base)).status,200);
  assert.equal(getCounts().gasCalls,0);
});
test("amount mismatch and metadata mismatch cannot reach GAS",async()=>{
  for(const s of [session({amount_total:999}),session({client_reference_id:"U_OTHER"}),session({livemode:true})]){
    const {base,getCounts}=await start({session:s});
    assert.equal((await post(base)).status,200);
    assert.equal(getCounts().gasCalls,0);
  }
});
test("GAS failure is retryable and never acknowledged as processed",async()=>{
  const {base,getCounts}=await start({gasResponse:{ok:false,environment:"ISOLATED_TEST"}});
  assert.equal((await post(base)).status,500);
  assert.equal((await post(base)).status,500);
  assert.equal(getCounts().gasCalls,2);
});
test("allowlisted GAS failure reason is exposed without leaking arbitrary text",async()=>{
  const safe=await start({gasResponse:{ok:false,environment:"ISOLATED_TEST",reason:"STRIPE_TEST_FIXTURE_SHEETS_INVALID"}});
  assert.deepEqual(await post(safe.base),{status:500,json:{ok:false,reason:"STRIPE_TEST_FIXTURE_SHEETS_INVALID"}});
  const unsafe=await start({gasResponse:{ok:false,environment:"ISOLATED_TEST",reason:"secret customer detail"}});
  assert.deepEqual(await post(unsafe.base),{status:500,json:{ok:false,reason:"gateway_gas_validation_failed"}});
});
test("same signed event can be retried; GAS owns durable idempotency",async()=>{
  const {base,getCounts}=await start();
  assert.equal((await post(base)).status,200);
  assert.equal((await post(base)).status,200);
  assert.equal(getCounts().gasCalls,2);
});
test("ticket10 official amount and count are accepted",()=>{
  const s=session({amount_total:3000,metadata:{line_user_id:user,routeq_test_marker:marker,ticket_code:"ticket10",grant_count:"10"}});
  assert.equal(validateIsolatedTestSession(s).ok,true);
});
