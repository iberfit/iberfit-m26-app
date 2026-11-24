import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('rest +/- controls participate in the same pending ACK guard as Next',()=>{
 const source=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
 const guard=source.slice(source.indexOf('function syncPendingNextControls()'),source.indexOf('// Serialize shell auto-start'));
 assert.match(guard,/for\(const action of \['rest-minus','rest-plus'\]\)/u);
 assert.match(guard,/targets\.add\(button\)/u);
 assert.match(guard,/button\.disabled=true/u);
 assert.match(guard,/restoreTarget\(button\)/u);
 assert.match(source,/const wasDisabled=button\.disabled;\s*sessionActionPending=true;\s*pendingSessionAction=action;/u);
});
