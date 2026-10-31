import test from 'node:test';
import assert from 'node:assert/strict';
import {createClientCompletedHistoryPager} from '../src/m26/domain/client-completed-history-pager.js';
const ID='00000000-0000-4000-8000-000000000003',OTHER='00000000-0000-4000-8000-000000000004';
const a='00000000-0000-4000-8000-000000000005',b='00000000-0000-4000-8000-000000000006';
const snapshotAt='2026-10-31T03:00:00+00:00';
const row=(id,at)=>({entityType:'session',entityId:id,clientId:ID,status:'completada',
 revision:2,updatedAt:at,body:{id,clientId:ID,status:'completada',blocks:[]}});
const start=(owner={})=>({owner,pager:createClientCompletedHistoryPager({owner,clientId:ID,section:'session',limit:1})});
const page=(rows,hasMore,nextCursor,total=2)=>({schema:'iberfit.client.completed-history.page.qa.v1',
 section:'session',snapshotAt,total,rows,hasMore,nextCursor});
test('valid continuation and exact completion without losing history',()=>{
 const {owner,pager}=start();
 assert.deepEqual(pager.nextRequest(),{p_section:'session',p_snapshot_at:null,p_cursor:null,p_expected_count:null,p_limit:1});
 const first=row(a,'2026-10-31T02:59:00+00:00');
 pager.accept({requestOwner:owner,page:page([first],true,{at:first.updatedAt,id:a})});
 assert.deepEqual(pager.nextRequest(),{p_section:'session',p_snapshot_at:snapshotAt,p_cursor:{at:first.updatedAt,id:a},p_expected_count:2,p_limit:1});
 const second=row(b,'2026-10-31T02:58:00+00:00');
 assert.equal(pager.accept({requestOwner:owner,page:page([second],false,null)}).ready,true);
 assert.equal(pager.finish().length,2);
 assert.equal(pager.nextRequest(),null);
});
test('reject cross-owner, count drift, duplicates, reorder and missing history',()=>{
 const {owner,pager}=start(),first=row(a,'2026-10-31T02:59:00+00:00');
 assert.throws(()=>pager.accept({requestOwner:{},page:page([first],false,null,1)}),/OWNER_STALE/);
 assert.throws(()=>pager.accept({requestOwner:owner,page:page([first],false,null)}),/HISTORY_INCOMPLETE/);
});
test('reject returned history containing a foreign client',()=>{
 const {owner,pager}=start(),item={...row(a,'2026-10-31T02:59:00+00:00'),clientId:OTHER};
 assert.throws(()=>pager.accept({requestOwner:owner,page:page([item],false,null,1)}),/RECORD_INVALID/);
});
test('cancel/logout rejects all stale pages',()=>{
 const {owner,pager}=start();pager.cancel();
 assert.throws(()=>pager.accept({requestOwner:owner,page:page([],false,null,0)}),/OWNER_STALE/);
 assert.throws(()=>pager.nextRequest(),/OWNER_STALE/);
});
test('no phantom empty history when total indicates unseen records',()=>{
 const {owner,pager}=start();
 assert.throws(()=>pager.accept({requestOwner:owner,page:page([],false,null,2)}),/HISTORY_INCOMPLETE/);
});
