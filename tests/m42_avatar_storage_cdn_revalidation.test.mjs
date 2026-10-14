import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const avatar=readFileSync(new URL('src/m26/profile/client-avatar.js',root),'utf8');
const gate=readFileSync(new URL('scripts/remote-gates/run_qa_m42_avatar_private_gate.mjs',root),'utf8');
test('M42 cached private URL never substitutes fresh owner access or removal verification',()=>{
 assert.match(avatar,/endpoint\(clientId\)\+'\?cacheNonce='/u);
 assert.ok(avatar.includes("String(Date.now())+'-'+(++downloadNonce)"));
 assert.match(gate,/const privateInfo=id=>/u);
 assert.match(gate,/const uncachedPrivate=id=>privateUrl\(id\)\+'\?cacheNonce='\+randomUUID\(\)/u);
 assert.match(gate,/infoGone&&mediaGone/u);
 assert.match(gate,/await confirmRemoved\(a,idA,'DELETE_REMOTE_CONFIRMED'\)/u);
 assert.match(gate,/await confirmRemoved\(a,idA,'RECOVERY_CLEANUP_CONFIRMED'\)/u);
});
