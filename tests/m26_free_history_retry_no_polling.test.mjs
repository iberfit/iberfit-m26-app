import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const controller=readFileSync('src/m26/app/client-history-demand-controller.js','utf8');
test('failed history is NOT automatically retried by an asynchronous rerender',()=>{
 assert.ok(controller.includes('if(failedKey===key){notice();return;}'));
 assert.ok(controller.includes("failedKey=key;status=isOnline()?'error':'offline'"));
 assert.ok(controller.includes("event.preventDefault();failedKey='';status='idle'"));
});
test('navigating away aborts the archive so QA uses no unnecessary Egress',()=>{
 assert.ok(controller.includes("loader.cancel();request=null;status='idle';notice();return"));
 assert.ok(controller.includes("if(getOwner()!==owner||fingerprint(store.getState())!==key)"));
});
