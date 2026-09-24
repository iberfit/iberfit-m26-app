import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveCoachLaunchJourney,buildCoach360Rows} from '../src/m26/admin/view-model.js';

const user={id:'coach-1',userId:'coach-1',name:'Carlos',email:'coach@iberfit.cl',status:'active',primaryRole:'coach',roles:['coach'],lastAccessAt:'2026-09-06T10:00:00Z'};
const coach={id:'profile-1',userId:'coach-1',name:'Carlos',email:'coach@iberfit.cl',status:'active'};
const assignments=[{id:'a1',coachUserId:'coach-1',clientId:'client-1',status:'active'}];
const planning=[{id:'published-session-1',clientId:'client-1',status:'publicado',publishedAt:'2026-09-05T09:00:00Z'}];
const completed=[{id:'exec-1',client_id:'client-1',session_id:'published-session-1',started_by:'coach-1',execution_status:'cerrada_confirmada',remote_confirmed_at:'2026-09-05T11:00:00Z'}];

test('Coach Launch Journey stays fail-closed until all six operational milestones have explicit evidence',()=>{
  const withoutPlanning=deriveCoachLaunchJourney({coach,user,assignments,sessionExecutions:completed});
  assert.equal(withoutPlanning.ready,false);
  assert.equal(withoutPlanning.stage,'planning');
  assert.equal(withoutPlanning.milestones.find((item)=>item.id==='session').complete,true);
  assert.equal(withoutPlanning.milestones.find((item)=>item.id==='planning').complete,false);

  const ready=deriveCoachLaunchJourney({coach,user,assignments,planningSessions:planning,sessionExecutions:completed});
  assert.equal(ready.ready,true);
  assert.equal(ready.accountActive,true);
  assert.equal(ready.stage,'ready');
  assert.equal(ready.percent,100);
  assert.equal(ready.nextAction,null);
});

test('rejected or active execution never completes the first-session milestone',()=>{
  for(const execution_status of ['cierre_rechazado','activa','pausada']){
    const result=deriveCoachLaunchJourney({coach,user,assignments,planningSessions:planning,sessionExecutions:[{...completed[0],execution_status}]});
    assert.equal(result.milestones.find((item)=>item.id==='session').complete,false,execution_status);
    assert.equal(result.ready,false);
    assert.equal(result.stage,'session');
  }
});

test('Coach Launch Journey exposes invited and blocked coaches without inventing activation',()=>{
  const invited=deriveCoachLaunchJourney({user:{id:'coach-invited',userId:'coach-invited',name:'Ana',email:'ana@iberfit.cl',status:'active',primaryRole:'coach',roles:['coach']}});
  assert.equal(invited.ready,false);
  assert.equal(invited.stage,'invited');
  assert.equal(invited.milestones.find((item)=>item.id==='activated').complete,false);

  const blocked=deriveCoachLaunchJourney({
    user:{id:'coach-blocked',userId:'coach-blocked',status:'suspended',primaryRole:'coach',roles:['coach'],lastAccessAt:'2026-09-01T08:00:00Z'},
    coach:{id:'profile-b',userId:'coach-blocked',name:'Bloqueado',email:'blocked@iberfit.cl',status:'active'},
  });
  assert.equal(blocked.blocked,true);
  assert.equal(blocked.accountActive,false);
  assert.equal(blocked.ready,false);
  assert.equal(blocked.stage,'blocked');
});

test('Coach 360 derives planning and completion from real shared records',()=>{
  const rows=buildCoach360Rows({
    coaches:[{id:'profile-1',userId:'coach-1',name:'Carlos Coach',email:'coach@iberfit.cl',status:'active'}],
    users:[user,{id:'coach-2',userId:'coach-2',name:'Coach Invitada',email:'invite@iberfit.cl',status:'active',primaryRole:'coach',roles:['coach']}],
    clients:[{id:'client-1',name:'Ana',status:'active'}],
    assignments,
    appointments:[{id:'apt-1',sessionId:'published-session-1',coachUserId:'coach-1',clientId:'client-1',startAt:'2026-09-05T10:00:00Z',status:'completada'}],
    planningSessions:planning,
    sessionExecutions:completed,
    now:'2026-09-06T12:00:00Z',
  });
  const ready=rows.find((row)=>row.coachId==='coach-1');
  const invited=rows.find((row)=>row.coachId==='coach-2');
  assert.equal(ready.launchJourney.ready,true);
  assert.equal(ready.completedCount,1);
  assert.equal(invited.launchJourney.ready,false);
  assert.equal(rows.length,2);
});
