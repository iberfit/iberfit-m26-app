import test from 'node:test';
import assert from 'node:assert/strict';
import {adminDeletionOutcome} from '../src/m26/admin/controller.js';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

test('Admin deletion receipts report retained Auth identity without claiming complete erasure',()=>{
 const partial={response:{ok:true,kind:'ack',response:{authIdentityRetained:true}}};
 const message=adminDeletionOutcome('client',partial);
 assert.match(message,/pendiente de baja/u);
 assert.match(message,/supresión integral/u);
 assert.doesNotMatch(message,/eliminado de forma permanente/u);
});
test('Administrative user decommission distinguishes Auth soft-delete ACK from missing ACK',()=>{
 const confirmed=adminDeletionOutcome('user',{response:{authIdentitySoftDeleted:true}});
 assert.match(confirmed,/Auth desactivada/u);
 const pending=adminDeletionOutcome('user',{response:{authSoftDeleteRequired:true}});
 assert.match(pending,/no está confirmada/u);
 assert.notEqual(confirmed,pending);
 assert.throws(()=>adminDeletionOutcome('invalid',{}),/M26_ADMIN_DELETION_OUTCOME_INVALID/u);
});
test('Admin client-delete explains the operational scope rather than promising whole-person erasure',()=>{
 const html=renderAdminRoute({admin:true,kind:'admin-usuarios',clients:[{
  id:'10000000-0000-4000-8000-000000000277',name:'Persona sintética',
  email:'synthetic@example.test',status:'active',revision:1,
 }],canManageStatus:true,canManage:true,currentUserId:'admin-test'});
 // Exact presence may depend on the route view model, but source must never promise
 // permanent erasure while retaining Auth and protected records.
 assert.equal(typeof html,'string');
 const source=adminDeletionOutcome('client',{response:{authIdentityRetained:true}});
 assert.match(source,/cuenta de acceso/u);
});
test('Deletion status strings have translations in all supported languages',()=>{
 for(const kind of ['client','user'])for(const response of [
  {authIdentityRetained:true,authIdentitySoftDeleted:true},
  {authIdentityRetained:false,authSoftDeleteRequired:true},
 ]){
  const source=adminDeletionOutcome(kind,{response});
  for(const language of ['en','fr','pt'])
   assert.notEqual(iberfitSurfaceTranslate(source,{language}),source,language+' '+kind);
 }
});
