import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';

function vm(integrityIssueCount=0){
 return {
  admin:true,kind:'admin-usuarios',role:'admin',
  users:[{id:'qa-admin-001',name:'Cuenta sintética',status:'active',roles:['admin'],primaryRole:'admin',
   integrityIssues:integrityIssueCount?[{code:'QA_RELATION_REVIEW'}]:[]}],
  user360Summary:{total:1,activeUsers:1,pendingInvitations:0,integrityIssueCount},
  canManageStatus:true,canManageRoles:true,currentUserId:'another-synthetic-user',
 };
}
function index(html,fragment){const i=html.indexOf(fragment);assert.ok(i>=0,fragment);return i}

test('Admin Users360 prioritizes the real search before stats on desktop and mobile without CSS order hacks',()=>{
 const html=renderAdminRoute(vm());
 assert.ok(index(html,'Usuarios y accesos 360')<index(html,'data-admin-user-search'));
 assert.ok(index(html,'data-admin-user-search')<index(html,'m26-admin-user360-overview'));
 assert.ok(index(html,'m26-admin-user360-overview')<index(html,'id="m26-admin-user-results"'));
 for(const control of ['data-admin-user-filter="status"','data-admin-user-filter="role"',
   'data-admin-user-filter="attention"','data-admin-user-visible-count',
   'data-admin-user-filter-reset','data-admin-user-disclosure'])assert.ok(html.includes(control),control);
 for(const operation of ['data-admin-form="user-status"','data-admin-form="role-change"','data-admin-form="user-delete"'])
  assert.ok(html.includes(operation),operation);
});
test('Admin access anomaly stays before search and cannot be hidden by directory filtering',()=>{
 const html=renderAdminRoute(vm(1));
 assert.ok(index(html,'m26-admin-user360-integrity')<index(html,'data-admin-user-search'));
 assert.match(html,/Revisar cuentas afectadas/u);
 assert.match(html,/QA_RELATION_REVIEW/u);
 assert.match(html,/data-admin-user-results/u);
});
