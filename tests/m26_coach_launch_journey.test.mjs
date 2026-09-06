import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveCoachLaunchJourney,buildCoach360Rows} from '../src/m26/admin/view-model.js';

test('Coach Launch Journey stays fail-closed until every milestone has explicit evidence',()=>{
  const user={id:'coach-1',userId:'coach-1',name:'Carlos',email:'coach@iberfit.cl',status:'active',primaryRole:'coach',roles:['coach'],lastAccessAt:'2026-09-06T10:00:00Z'};
  const coach={id:'profile-1',userId:'coach-1',name:'Carlos',email:'coach@iberfit.cl',status:'active'};
  const assignments=[{id:'a1',coachUserId:'coach-1',clientId:'client-1',status:'active'}];

  const withoutPlanning=deriveCoachLaunchJourney({
    coach,
    user,
    assignments,
    sessions:[{id:'a1',status:'completada'}],
  });
  assert.equal(withoutPlanning.ready,false);
  assert.equal(withoutPlanning.stage,'planning');
  assert.equal(withoutPlanning.displayStatus,'Activo · planificación por verificar');
  assert.equal(withoutPlanning.milestones.find((item)=>item.id==='session').complete,true);
  assert.equal(withoutPlanning.milestones.find((item)=>item.id==='planning').complete,false);

  const ready=deriveCoachLaunchJourney({
    coach,
    user,
    assignments,
    sessions:[{id:'a1',sessionId:'published-session-1',status:'completada'}],
  });
  assert.equal(ready.ready,true);
  assert.equal(ready.stage,'ready');
  assert.equal(ready.displayStatus,'Activo · Coach listo');
  assert.equal(ready.percent,100);
  assert.equal(ready.nextAction,null);
});

test('Coach Launch Journey exposes invited and blocked coaches without inventing activation',()=>{
  const invited=deriveCoachLaunchJourney({
    user:{id:'coach-invited',userId:'coach-invited',name:'Ana',email:'ana@iberfit.cl',status:'active',primaryRole:'coach',roles:['coach']},
  });
  assert.equal(invited.ready,false);
  assert.equal(invited.stage,'invited');
  assert.equal(invited.displayStatus,'Invitado · primer acceso pendiente');
  assert.equal(invited.milestones.find((item)=>item.id==='activated').complete,false);

  const blocked=deriveCoachLaunchJourney({
    user:{id:'coach-blocked',userId:'coach-blocked',status:'suspended',primaryRole:'coach',roles:['coach'],lastAccessAt:'2026-09-01T08:00:00Z'},
    coach:{id:'profile-b',userId:'coach-blocked',name:'Bloqueado',email:'blocked@iberfit.cl',status:'active'},
  });
  assert.equal(blocked.blocked,true);
  assert.equal(blocked.ready,false);
  assert.equal(blocked.stage,'blocked');
  assert.equal(blocked.displayStatus,'Bloqueado');
  assert.equal(blocked.nextAction.area,'admin-usuarios');
});

test('Coach 360 includes invited coach identities and renders readiness through the existing status badge contract',()=>{
  const rows=buildCoach360Rows({
    coaches:[{id:'profile-1',userId:'coach-1',name:'Carlos Coach',email:'coach@iberfit.cl',status:'active'}],
    users:[
      {id:'coach-1',userId:'coach-1',name:'Carlos Coach',email:'coach@iberfit.cl',status:'active',primaryRole:'coach',roles:['coach'],lastAccessAt:'2026-09-06T09:00:00Z'},
      {id:'coach-2',userId:'coach-2',name:'Coach Invitada',email:'invite@iberfit.cl',status:'active',primaryRole:'coach',roles:['coach']},
      {id:'client-user',userId:'client-user',name:'Cliente',status:'active',primaryRole:'client',roles:['client']},
    ],
    clients:[{id:'client-1',name:'Ana',status:'active'}],
    assignments:[{id:'a1',coachUserId:'coach-1',clientId:'client-1',status:'active'}],
    appointments:[{id:'apt-1',sessionId:'session-1',coachUserId:'coach-1',clientId:'client-1',startAt:'2026-09-05T10:00:00Z',status:'completada'}],
    now:'2026-09-06T12:00:00Z',
  });

  assert.equal(rows.length,2);
  const ready=rows.find((row)=>row.coachId==='coach-1');
  const invited=rows.find((row)=>row.coachId==='coach-2');
  assert.equal(ready.status,'Activo · Coach listo');
  assert.equal(ready.launchJourney.ready,true);
  assert.equal(invited.status,'Invitado · primer acceso pendiente');
  assert.equal(invited.clientCount,0);
  assert.equal(rows.some((row)=>row.coachId==='client-user'),false);
});
