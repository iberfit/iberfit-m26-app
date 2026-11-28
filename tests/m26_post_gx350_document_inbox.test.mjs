import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyConnected360DocumentInbox as verify} from '../src/m26/wearables/document-consent-contract.js';
const clientId='11111111-1111-4111-8111-111111111111',reportId='22222222-2222-4222-8222-222222222222';
const id=i=>`33333333-3333-4333-8333-${String(i).padStart(12,'0')}`;
const opts={clientId,now:new Date('2026-11-28T12:00:00Z')};
const item=i=>({requestId:id(i),reportId,reportRevision:1,provider:'health_connect',periodStart:'2026-11-21',periodEnd:'2026-11-27',revision:0,decision:'pending'});
const page=(items=[],after=null,nextAfter=null)=>({schema:'iberfit.connected360.document-inbox.v1',clientId,after,items,nextAfter});
test('empty inbox and bounded page with exact cursor and immutable receipt',()=>{
 assert.equal(verify(page(),opts).items.length,0);const items=Array.from({length:20},(_,i)=>item(i+1));
 const v=verify(page(items,null,id(20)),opts);assert.ok(Object.isFrozen(v.items)&&Object.isFrozen(v.items[0]));
 assert.equal(verify(page([item(21)],id(20)),{...opts,after:id(20)}).items.length,1);
});
test('scope, cursor, duplicates, extra data and malformed page rejected',()=>{
 for(const value of [{...page(),clientId:reportId},page([item(1)],id(2)),page([item(1),item(1)]),page([item(1)],null,id(1)),page(Array.from({length:21},(_,i)=>item(i))),page([{...item(1),evidence:{}}]),page([{...item(1),revision:2}]),page([{...item(1),periodStart:'2026-11-20'}]),page([{...item(1),periodEnd:'2026-11-28'}])])assert.throws(()=>verify(value,opts));
 assert.throws(()=>verify(page([item(1)],id(1)),{...opts,after:id(1)}));
});
test('accepted, declined, withdrawn receipts remain visible without claiming current authorization',()=>{
 const items=[{...item(1),decision:'accepted',revision:1},{...item(2),decision:'declined',revision:1},{...item(3),decision:'withdrawn',revision:2}];
 assert.deepEqual(verify(page(items),opts).items,items);assert.throws(()=>verify(page([{...items[0],authorized:true}]),opts));
});
test('SQL inbox is private, role/session scoped, bounded and no raw evidence or grant access',()=>{
 const sql=readFileSync(new URL('../supabase/release-procedures/gx_connected360_document_inbox_v1.sql',import.meta.url),'utf8');
 assert.match(sql,/STABLE SECURITY INVOKER SET search_path TO ''/);assert.match(sql,/m26_v49_live_session\(\)/);assert.match(sql,/owner_id=actor AND client_id=client/g);assert.match(sql,/role::text IN \('coach','admin'\)/);assert.match(sql,/LIMIT 21/);assert.match(sql,/LIMIT 20/);assert.match(sql,/\(q.requested_at,q.id\)<\(anchor_time,p_after\)/);assert.match(sql,/ORDER BY revision DESC LIMIT 1/);assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role/);assert.doesNotMatch(sql,/GRANT EXECUTE|source_grant_id|evidence_sha256|public\.reports|FOR UPDATE/);
});
