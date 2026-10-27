const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../hyogo/index.html'),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
scripts.forEach((s,i)=>new vm.Script(s,{filename:'frontend-script-'+i}));
const source=scripts.find(s=>s.includes('const ROUTEQ_IS_TEST'));
async function run(origin,configured){
 const handlers={}, elements=new Map();let loads=0,liffCalls=0;
 const element=()=>({value:'',style:{},classList:{add(){},remove(){}},checked:false,disabled:true,appendChild(){},setAttribute(){},addEventListener(){}});
 const c={location:{origin,pathname:'/TEST/QA/hyogo/',hostname:new URL(origin).hostname},
 document:{createElement:element,addEventListener:(event,fn)=>handlers[event]=fn,getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}},
 window:{addEventListener(){}},console};
 vm.createContext(c);
 vm.runInContext(configured?source.replace('QUESTION_OPTIONS_URL = ROUTEQ_IS_TEST ? ""','QUESTION_OPTIONS_URL = ROUTEQ_IS_TEST ? "https://script.google.com/macros/s/TEST/exec"'):source,c);
 const actualInitialize=vm.runInContext('initializeLiff',c);
 c.markLoad=()=>loads++;c.markLiff=()=>liffCalls++;
 vm.runInContext('loadQuestionOptions=async function(){markLoad()};initializeLiff=function(){markLiff()};changeTheme=function(){};renderQuestionOptions=function(){};setLoading=function(){};',c);
 await handlers.DOMContentLoaded();
 return {loads,liffCalls,c,elements,actualInitialize};
}
(async()=>{
 const unset=await run('http://localhost',false);assert.equal(unset.loads,0);assert.equal(unset.liffCalls,0);
 const configured=await run('http://localhost',true);assert.equal(configured.loads,1);assert.equal(configured.liffCalls,0);
 const preview=await run('https://kikeroute-web-isolated-preview-q2ubytjjd-route-q.vercel.app',false);assert.equal(preview.loads,0);assert.equal(preview.liffCalls,1);
 vm.runInContext('usageData={canSubmit:false};document.getElementById("rulesAgree").checked=true;updateSubmitState();',preview.c);
 assert.equal(preview.elements.get('submitBtn').disabled,true);
 preview.c.performance={now:()=>1};preview.c.navigator={userAgent:'offline-test'};
 preview.c.liff={init:async()=>{},isInClient:()=>true,getAccessToken:()=> 'FAKE_ONLY',getProfile:async()=>({userId:'FAKE_ONLY',displayName:'架空TEST'})};
 preview.c.window.liff=preview.c.liff;
 vm.runInContext('postToGas=async function(){return {canSubmit:false}};getCachedUsage=function(){return null};confirmStripeReturnIfNeeded=async function(){};updateUsage=function(){};',preview.c);
 await preview.actualInitialize();
 assert.match(preview.elements.get('loginStatus').innerHTML,/GAS本人確認は未検証/);
 console.log(JSON.stringify({status:'PASS',cases:5,scriptSyntax:scripts.length,externalRequests:0,scope:'offline DOM mocks only'}));
})().catch(e=>{console.error(e);process.exitCode=1});
