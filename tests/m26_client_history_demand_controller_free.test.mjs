import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldLoadClientHistory} from '../src/m26/app/client-history-demand-controller.js';
function state(){return {identity:{id:'u',clientId:'c',role:'client'},
hydration:{status:'ready',confirmedAt:'2026-10-31T03:00:00Z'}};}
test('QA Client only and only on archival/progress routes',()=>{
 const s=state();
 assert.equal(shouldLoadClientHistory(s,'hoy',true),false);
 for(const area of ['sesion','planificacion','progreso'])
   assert.equal(shouldLoadClientHistory(s,area,true),true);
 assert.equal(shouldLoadClientHistory(s,'sesion',false),false);
 s.identity.role='coach';
 assert.equal(shouldLoadClientHistory(s,'sesion',true),false);
 s.identity.role='client';s.hydration.status='loading';
 assert.equal(shouldLoadClientHistory(s,'sesion',true),false);
});
