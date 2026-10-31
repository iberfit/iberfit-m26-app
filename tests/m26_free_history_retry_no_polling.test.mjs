import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const controller=readFileSync('src/m26/app/client-history-demand-controller.js','utf8');

test('failed history is NOT automatically retried by an asynchronous rerender',()=>{
  assert.match(controller,/if\(explicit!==true\)\{/u);
  assert.match(controller,/if\(failedKey!==key\)status='idle';/u);
  assert.match(controller,/failedKey=key;status=isOnline\(\)\?'error':'offline'/u);
  assert.match(controller,/maybeLoad\(activeArea,\{explicit:true\}\)/u);
  // Dynamic error/retry coverage lives in m26_client_history_demand_controller_free.test.mjs.
});
test('navigating away aborts the archive so QA uses no unnecessary Egress',()=>{
  assert.match(controller,/if\(nextArea!==activeArea\)\{\s*cancelPending\(\);/u);
  assert.match(controller,/function cancelPending\(\)\{\s*if\(request\)\{loader\.cancel\(\);request=null;\}/u);
  assert.match(controller,/request===operation&&activeArea===area/u);
  assert.match(controller,/getOwner\(\)===owner&&fingerprint\(store\.getState\(\)\)===key/u);
});
test('role switch aborts a stale in-flight Client history fetch and invalidates cache identity',()=>{
  assert.match(controller,/state\?\.identity\?\.role,state\?\.hydration\?\.confirmedAt/u);
  assert.match(controller,/event\?\.detail\?\.role==='client'/u);
  assert.match(controller,/if\(!activeArea\)\{cancelPending\(\);status='idle';loadedKey='';failedKey='';/u);
  assert.match(controller,/canOfferClientHistory\(store\.getState\(\),activeArea,enabled\)/u);
});
