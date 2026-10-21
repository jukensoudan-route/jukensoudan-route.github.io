'use strict';
// Offline-only journal fault injection. No external requests or Google services.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'line_delivery_journal.gs'),'utf8');
let calls=0, failure=false, lockHeld=false, writes=0;
const data = new Map();
const ctx = {
  Date,
  assertRouteqQaTestEnvironment_: () => true,
  LockService: {getScriptLock: () => ({
    tryLock: () => { if(lockHeld) return false; lockHeld=true; return true; },
    releaseLock: () => { lockHeld=false; }
  })},
  PropertiesService: {getScriptProperties: () => ({
    getProperty: k => data.get(k) || null,
    setProperty: (k,v) => { writes++; if(failure) throw new Error('INJECT_WRITE_FAILURE');data.set(k,v); },
    deleteProperty: () => {throw new Error('JOURNAL_DELETE_FORBIDDEN');}
  }) }
};
vm.createContext(ctx);
vm.runInContext(source,ctx);
const request={questionId:'Q100',to:'U_TEST',body:'承認済み回答',retryKey:'fixed-key'};
const first=ctx.routeqLinePrepareIntent_(request);
assert.equal(first.allowed,true);calls++;
assert.equal(ctx.routeqLinePrepareIntent_(request).allowed,false);calls++;
assert.equal(ctx.routeqLinePrepareIntent_({...request,body:'changed'}).allowed,false);calls++;
const inProgress=ctx.routeqLineMarkInProgress_('Q100','fixed-key');
assert.equal(inProgress.state,'IN_PROGRESS');calls++;
assert.throws(()=>ctx.routeqLineMarkInProgress_('Q100','fixed-key'),/LINE_RETRY_BLOCKED/);calls++;
assert.equal(ctx.routeqLineSetOutcome_('Q100','fixed-key',false).state,'UNKNOWN');calls++;
assert.equal(ctx.routeqLinePrepareIntent_(request).allowed,false);calls++;
assert.equal(JSON.parse(data.get('ROUTEQ_LINE_INTENT_V1_Q100')).state,'UNKNOWN');calls++;
assert.throws(()=>ctx.routeqLineMarkInProgress_('Q100','fixed-key'),/LINE_RETRY_BLOCKED/);calls++;
lockHeld=true;
assert.throws(()=>ctx.routeqLinePrepareIntent_({...request,questionId:'Q101'}),/LINE_LOCK_UNAVAILABLE/);
lockHeld=false;calls++;
failure=true;
assert.throws(()=>ctx.routeqLinePrepareIntent_({...request,questionId:'Q102'}),/INJECT_WRITE_FAILURE/);
failure=false;calls++;
assert.equal(data.has('ROUTEQ_LINE_INTENT_V1_Q102'),false);calls++;
ctx.routeqLinePrepareIntent_({...request,questionId:'Q103'});
ctx.routeqLineMarkInProgress_('Q103','fixed-key');
assert.equal(ctx.routeqLineSetOutcome_('Q103','fixed-key',true).state,'ACCEPTED');calls++;
assert.equal(ctx.routeqLinePrepareIntent_({...request,questionId:'Q103'}).allowed,false);calls++;
assert.ok(writes>0);
console.log('LINE journal offline fault injection: '+calls+'/'+calls+' PASS; network requests: 0');
