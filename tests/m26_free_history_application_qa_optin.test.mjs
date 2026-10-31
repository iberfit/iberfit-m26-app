import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync('src/m26/app/application.js','utf8');
test('Client history demand is strictly QA-only and opt-in, never a PROD default',()=>{
 assert.match(s,/runtime\.qaOnly===true&&runtime\.canary===true\s*&&runtimeConfig\?\.freeClientCompletedHistoryDemand===true/);
 assert.match(s,/store\.getState\(\)\.identity\?\.role==='client'/);
 assert.ok(s.includes('if(freeHistoryDemandEnabled){'));
 assert.ok(s.includes('clientHistoryDemand.mount();'));
});
test('logout/role switch destroys loader and cancels all account-owned pages',()=>{
 assert.match(s,/function destroyControllers\([^]*?clientHistoryDemand\?\.destroy\?\.\(\)/);
 assert.ok(s.includes('getOwner:()=>hydrationLeaseFor(session)'));
 assert.ok(s.includes('getToken:async()=>{await refreshSessionIfNeeded();return currentToken();}'));
});
