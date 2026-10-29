import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCompletedSessionHistory} from '../src/m26/rc39/completed-session-history.js';

const saved={statusRaw:'completed',date:'2026-10-28T20:00:00.000Z',body:{
 status:'completed',sessionId:'4d244c01-8966-40f1-8cc7-9e6ec46d1708',
 completedAt:'2026-10-28T20:00:00.000Z',results:[{distanceKm:6.5}],
 feedback:{sessionRpe:7},privateCoachNotes:'NEVER_EXPOSE_PRIVATE_NOTE'}};
test('Client with no active sessions may still view confirmed completed workout history',()=>{
 const rendered=renderCompletedSessionHistory({executions:[saved],rc39:{sessionProjections:[]}},
  {hideEmpty:true});
 assert.match(rendered,/data-m43-session-history/);
 assert.match(rendered,/data-m43-completed-session/);
 assert.match(rendered,/Sesiones realizadas/);
 assert.match(rendered,/Completada/);
 assert.match(rendered,/1 registros/);
 assert.match(rendered,/Esfuerzo percibido 7\/10/);
 assert.doesNotMatch(rendered,/start-published-session/);
 assert.doesNotMatch(rendered,/NEVER_EXPOSE_PRIVATE_NOTE/);
});
test('Empty-session history does not invent completed entries from active or absent executions',()=>{
 assert.equal(renderCompletedSessionHistory({executions:[]},{hideEmpty:true}),'');
 assert.equal(renderCompletedSessionHistory({executions:[{...saved,statusRaw:'en_curso',
  body:{...saved.body,status:'en_curso'}}]},{hideEmpty:true}),'');
});
