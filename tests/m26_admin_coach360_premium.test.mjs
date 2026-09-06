import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCoach360Rows} from '../src/m26/admin/view-model.js';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';

test('Coach 360 groups only the coach own clients and sessions',()=>{
  const rows=buildCoach360Rows({
    coaches:[{id:'profile-1',userId:'coach-1',name:'Carlos Coach',email:'coach@iberfit.cl',status:'active',capacityHours:20,assignedHours:15}],
    clients:[
      {id:'client-1',name:'Ana',status:'active',modality:'Presencial',nextAction:{label:'Revisar plan'}},
      {id:'client-2',name:'Luis',status:'active',modality:'Online',nextAction:{label:'Check-in'}},
    ],
    assignments:[
      {id:'a1',coachUserId:'coach-1',clientId:'client-1',status:'active'},
      {id:'a2',coachUserId:'coach-2',clientId:'client-2',status:'active'},
    ],
    appointments:[
      {id:'s1',coachUserId:'coach-1',clientId:'client-1',startAt:'2026-09-07T12:00:00Z',status:'confirmada',modality:'Presencial'},
      {id:'s0',coachUserId:'coach-1',clientId:'client-1',startAt:'2026-09-05T12:00:00Z',status:'completada'},
      {id:'foreign',coachUserId:'coach-2',clientId:'client-2',startAt:'2026-09-07T13:00:00Z',status:'confirmada'},
    ],
    now:'2026-09-06T12:00:00Z',
  });

  assert.equal(rows.length,1);
  assert.equal(rows[0].coachId,'coach-1');
  assert.equal(rows[0].clientCount,1);
  assert.equal(rows[0].clients[0].name,'Ana');
  assert.equal(rows[0].upcomingCount,1);
  assert.equal(rows[0].upcomingSessions[0].id,'s1');
  assert.equal(rows[0].recentSessions[0].id,'s0');
  assert.equal(rows[0].completedCount,1);
  assert.equal(rows[0].loadPercent,75);
  assert.ok(Object.isFrozen(rows));
  assert.ok(Object.isFrozen(rows[0].clients));
});

test('Admin team renders an accessible Coach 360 profile without privilege escalation',()=>{
  const coachProfiles360=buildCoach360Rows({
    coaches:[{id:'profile-1',userId:'coach-1',name:'Carlos Coach',email:'coach@iberfit.cl',status:'active',capacityHours:20,assignedHours:10}],
    clients:[{id:'client-1',name:'Ana',status:'active',modality:'Presencial',nextAction:{label:'Revisar plan'}}],
    assignments:[{id:'a1',coachUserId:'coach-1',clientId:'client-1',status:'active'}],
    appointments:[{id:'s1',coachUserId:'coach-1',clientId:'client-1',startAt:'2026-09-07T12:00:00Z',status:'confirmada'}],
    now:'2026-09-06T12:00:00Z',
  });
  const markup=renderAdminRoute({
    admin:true,
    kind:'admin-equipo',
    coaches:[{id:'profile-1',userId:'coach-1',name:'Carlos Coach'}],
    coachProfiles360,
    clients:[{id:'client-1',name:'Ana'}],
    assignments:[],
    canManage:false,
  });

  assert.match(markup,/Coach 360/u);
  assert.match(markup,/m26-admin-coach360/u);
  assert.match(markup,/<details/u);
  assert.match(markup,/<summary/u);
  assert.match(markup,/Ver perfil/u);
  assert.match(markup,/Clientes asignados/u);
  assert.match(markup,/Próximos entrenamientos/u);
  assert.match(markup,/Últimos entrenamientos/u);
  assert.match(markup,/Ana/u);
  assert.match(markup,/data-m26-area="admin-agenda"/u);
  assert.doesNotMatch(markup,/onclick=|javascript:/iu);
});
