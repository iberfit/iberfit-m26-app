import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  readPreferredApplicationRole,
  writePreferredApplicationRole,
  clearPreferredApplicationRole,
  resolveActiveRole,
} from '../src/m26/rc39/multi-role.js';
import {buildAdminUser360} from '../src/m26/admin/view-model.js';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function memoryStorage(){
  const data=new Map();
  return {
    getItem:(key)=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>data.set(key,String(value)),
    removeItem:(key)=>data.delete(key),
  };
}

test('last application preference is local continuity only and never expands server-authorized roles',()=>{
  const storage=memoryStorage();
  assert.equal(readPreferredApplicationRole('user-1',{storage}),null);
  assert.equal(writePreferredApplicationRole('user-1','coach',{storage}),'coach');
  assert.equal(readPreferredApplicationRole('user-1',{storage}),'coach');

  const authorized=['admin'];
  const stored=readPreferredApplicationRole('user-1',{storage});
  assert.equal(authorized.includes(stored),false);
  assert.equal(resolveActiveRole(authorized,authorized.includes(stored)?stored:'admin'),'admin');

  assert.throws(()=>writePreferredApplicationRole('user-1','owner',{storage}),/M26_ROLE_PREFERENCE_INVALID/u);
  assert.equal(clearPreferredApplicationRole('user-1',{storage}),true);
  assert.equal(readPreferredApplicationRole('user-1',{storage}),null);
});

test('application restores only a stored role that remains authorized and clears preference with device data',()=>{
  const app=read('src/m26/app/application.js');
  assert.match(app,/const storedRole=readPreferredApplicationRole\(session\?\.user\?\.id\);/u);
  assert.match(app,/storedRole&&authorizedRoles\.includes\(storedRole\)\?storedRole/u);
  assert.match(app,/writePreferredApplicationRole\(session\?\.user\?\.id,activeRole\);/u);
  assert.match(app,/clearPreferredApplicationRole\(preferenceScope\)/u);
  assert.match(app,/if\(requestedRole&&!authorizedRoles\.includes\(requestedRole\)\)throw new Error\('M26_ROLE_SWITCH_FORBIDDEN'\)/u);
});

test('user 360 keeps Auth identity and client contact identity separate',()=>{
  const model=buildAdminUser360({
    users:[{
      id:'u1',userId:'u1',name:'Ana',email:'login@example.com',status:'active',
      primaryRole:'client',roles:['client'],revision:3,lastAccessAt:'2026-09-10T20:00:00Z',
    }],
    applicationRoles:[{userId:'u1',role:'client',active:true}],
    clients:[{id:'c1',name:'Ana Cliente',modality:'Online',lifecycle:{status:'active'}}],
    clientAccess:[{
      id:'a1',clientId:'c1',authUserId:'u1',email:'contact@example.com',
      status:'activo',invitationAttemptCount:1,invitationSentAt:'2026-09-01T10:00:00Z',
      activatedAt:'2026-09-01T10:05:00Z',
    }],
  });

  assert.equal(model.rows.length,1);
  const row=model.rows[0];
  assert.equal(row.authEmail,'login@example.com');
  assert.equal(row.contactEmail,'contact@example.com');
  assert.equal(row.contactEmailDiffers,true);
  assert.equal(row.client.id,'c1');
  assert.equal(row.access.authLinked,true);
  assert.equal(row.access.status,'activo');
  assert.deepEqual(row.integrityIssues,[]);
});

test('user 360 never links Auth to Client by matching email and reports strong access-integrity faults',()=>{
  const model=buildAdminUser360({
    users:[
      {id:'u1',userId:'u1',name:'Ana',email:'same@example.com',status:'active',roles:['client']},
    ],
    clients:[{id:'c1',name:'Ana Cliente'}],
    clientAccess:[
      {id:'a1',clientId:'c1',authUserId:null,email:'same@example.com',status:'activo'},
      {id:'a2',clientId:'c1',authUserId:'outside-user',email:'other@example.com',status:'invitacion_pendiente'},
    ],
  });

  assert.equal(model.rows[0].access,null);
  assert.equal(model.rows[0].client,null);
  assert.deepEqual(
    model.integrityIssues.map((issue)=>issue.code).sort(),
    ['ACTIVE_ACCESS_WITHOUT_AUTH_USER','AUTH_USER_OUTSIDE_ORGANIZATION'].sort(),
  );
  assert.equal(model.summary.integrityIssueCount,2);
});

test('user 360 consolidates active application roles and Coach/client relationships',()=>{
  const model=buildAdminUser360({
    users:[{id:'u1',userId:'u1',name:'Carlos',email:'carlos@example.com',status:'active',roles:['coach'],primaryRole:'coach'}],
    applicationRoles:[
      {userId:'u1',role:'coach',active:true},
      {userId:'u1',role:'admin',active:true},
    ],
    coachProfiles:[{id:'u1',userId:'u1',name:'Carlos',email:'carlos@example.com',status:'active'}],
    assignments:[
      {id:'as1',coachUserId:'u1',clientId:'c1',status:'active'},
      {id:'as2',coachUserId:'u1',clientId:'c2',status:'ended'},
    ],
  });
  assert.deepEqual(model.rows[0].roles.sort(),['admin','coach']);
  assert.equal(model.rows[0].coach.activeClientCount,1);
});

test('Admin renders a high-signal 360 card without hiding existing status and role controls',()=>{
  const html=renderAdminRoute({
    admin:{available:true},
    kind:'admin-usuarios',
    users:[{
      id:'u1',userId:'u1',name:'Ana',authEmail:'login@example.com',email:'login@example.com',
      contactEmail:'contact@example.com',contactEmailDiffers:true,status:'active',
      roles:['client'],primaryRole:'client',revision:3,lastAccessAt:'2026-09-10T20:00:00Z',
      client:{id:'c1',name:'Ana Cliente',modality:'Online',lifecycleStatus:'active'},
      access:{status:'activo',authLinked:true,invitationAttemptCount:1,activatedAt:'2026-09-01T10:05:00Z',invitationSentAt:'2026-09-01T10:00:00Z'},
      assignedCoachNames:['Carlos'],
      integrityIssues:[],
    }],
    user360Summary:{total:1,activeUsers:1,pendingInvitations:0,integrityIssueCount:0},
    canManageStatus:true,
    canManageRoles:true,
  });

  assert.match(html,/Usuarios y accesos 360/u);
  assert.match(html,/Cuenta 360/u);
  assert.match(html,/Correo de contacto/u);
  assert.match(html,/contact@example\.com/u);
  assert.match(html,/Correo de contacto distinto del correo de acceso/u);
  assert.match(html,/Acceso activo/u);
  assert.match(html,/Vínculo Auth confirmado/u);
  assert.match(html,/Coach \/ cartera/u);
  assert.match(html,/data-admin-form="user-status"/u);
  assert.match(html,/data-admin-form="role-change"/u);
  assert.match(html,/data-admin-user-search/u);
});
