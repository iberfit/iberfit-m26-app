import test from 'node:test';
import assert from 'node:assert/strict';
import {newU47Scope,u47WriteAuthorized} from '../qa/coach-webauthn-recurring/u47-running-policy.mjs';

const QA='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const CLIENT='10000000-0000-4000-8000-000000000471';
const SESSION='20000000-0000-4000-8000-000000000472';
const EXEC='30000000-0000-4000-8000-000000000473';
const BLOCK='40000000-0000-4000-8000-000000000474';
const TITLE='QA U47 · Running 40731417010-1';
const OP=n=>'50000000-0000-4000-8000-'+String(n).padStart(12,'0');
const old=process.env.M26_QA_U47_RUNNING;
process.env.M26_QA_U47_RUNNING='true';
process.on('exit',()=>{if(old===undefined)delete process.env.M26_QA_U47_RUNNING;else process.env.M26_QA_U47_RUNNING=old;});
const request=(cmd,endpoint='iberfit_execute_command_v26',origin=QA)=>({
 method:()=> 'POST',headers:()=>({authorization:'Bearer qa.synthetic.jwt'}),
 url:()=>origin+'/rest/v1/rpc/'+endpoint,postDataJSON:()=>({p_command:cmd}),
});
const patch=()=>({id:SESSION,clientId:CLIENT,title:TITLE,status:'published',
 visibleToClient:true,deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
 clientVisibilityLevel:'full',blocks:[{id:BLOCK,exerciseId:'IBF-CARRERA-SUAVE',
 sets:1,plannedDistanceKm:'6.5',plannedDurationMinutes:'35.75',plannedPace:'05:30'}]});
const publish=()=>({operationId:OP(1),type:'SESION_PUBLICAR',entityType:'session',
 entityId:SESSION,clientId:CLIENT,baseRevision:0,previewAccepted:true,payload:{patch:patch()}});
const start=()=>({operationId:OP(2),type:'SESION_INICIAR',entityType:'session',
 entityId:SESSION,clientId:CLIENT,baseRevision:2,payload:{executionId:EXEC,patch:{activeExecutionId:EXEC}}});
const progress=()=>({operationId:OP(3),type:'EJECUCION_GUARDAR_PROGRESO',
 entityType:'session_execution',entityId:EXEC,clientId:CLIENT,baseRevision:1,
 payload:{progressSnapshot:{sessionId:SESSION,clientId:CLIENT,status:'active'}}});
const finish=()=>({operationId:OP(4),type:'EJECUCION_COMPLETAR',
 entityType:'session_execution',entityId:EXEC,clientId:CLIENT,baseRevision:2,
 payload:{patch:{sessionId:SESSION,clientId:CLIENT,status:'completed',feedback:{sessionRpe:7}}}});
const fixture=(stage)=>{const s=newU47Scope({stage,clientId:CLIENT,title:TITLE});s.enabled=true;return s;};
test('U47 unauthorized by default; invalid identity and untrusted URL never reach write',()=>{
 const s=fixture('publish');
 process.env.M26_QA_U47_RUNNING='false';
 assert.equal(u47WriteAuthorized(request(publish()),s),false);
 process.env.M26_QA_U47_RUNNING='true';
 assert.equal(u47WriteAuthorized(request(publish(),'iberfit_execute_command_v26','https://pjhmrhejsoofmouedavw.supabase.co'),s),false);
 assert.equal(u47WriteAuthorized(request({...publish(),clientId:EXEC}),s),false);
 assert.equal(u47WriteAuthorized(request({...publish(),operationId:'bad'}),s),false);
 assert.throws(()=>newU47Scope({stage:'execute',clientId:CLIENT,title:'Sesion de usuario real'}),/U47_SCOPE_UNVERIFIED/);
 assert.equal(s.uniqueByOperation.size,0);
});
test('U47 Coach cannot publish wrong sport, extra blocks, invented cadence or wrong target',()=>{
 const s=fixture('publish'),invalid=[
  {...publish(),payload:{patch:{...patch(),blocks:[...patch().blocks,...patch().blocks]}}},
  {...publish(),payload:{patch:{...patch(),blocks:[{...patch().blocks[0],plannedDistanceKm:'5'}]}}},
  {...publish(),payload:{patch:{...patch(),blocks:[{...patch().blocks[0],plannedPace:'06:00'}]}}},
  {...publish(),payload:{patch:{...patch(),deliveryModality:'presencial'}}},
  {...publish(),entityId:EXEC},
 ];
 for(const cmd of invalid)assert.equal(u47WriteAuthorized(request(cmd),s),false);
 assert.equal(s.uniqueByOperation.size,0);
 assert.equal(u47WriteAuthorized(request(publish(), 'iberfit_command_preflight_v26'),s),true);
 assert.equal(u47WriteAuthorized(request(publish()),s),true);
 assert.equal(u47WriteAuthorized(request({...publish(),operationId:OP(8)}),s),false);
 assert.equal(s.sessionId,SESSION);
});
test('U47 Client first start requires authoritative readback, own scope and no appointment',()=>{
 const s=fixture('execute');s.sessionId=SESSION;
 assert.equal(u47WriteAuthorized(request(start()),s),false);
 s.serverPublicationConfirmed=true;s.historyClean=true;
 const withAppointment=structuredClone(start());withAppointment.payload.appointmentId=BLOCK;
 assert.equal(u47WriteAuthorized(request(withAppointment),s),false);
 assert.equal(u47WriteAuthorized(request({...start(),clientId:EXEC}),s),false);
 assert.equal(u47WriteAuthorized(request(start()),s),true);
 assert.equal(s.executionId,EXEC);
 assert.equal(u47WriteAuthorized(request({...start(),operationId:OP(9)}),s),false);
 assert.equal(u47WriteAuthorized(request(start()),s),true,'one exact idempotent retry');
 assert.equal(u47WriteAuthorized(request(start()),s),false,'third execute blocked');
});
test('U47 Client finish requires one confirmed running metric operation and exact RPE',()=>{
 const s=fixture('execute');s.sessionId=SESSION;s.serverPublicationConfirmed=true;s.historyClean=true;
 assert.equal(u47WriteAuthorized(request(start()),s),true);
 assert.equal(u47WriteAuthorized(request(finish()),s),false);
 assert.equal(u47WriteAuthorized(request(progress()),s),true);
 s.setConfirmed=true;
 assert.equal(u47WriteAuthorized(request({...finish(),payload:{patch:{...finish().payload.patch,feedback:{sessionRpe:9}}}}),s),false);
 assert.equal(u47WriteAuthorized(request(finish()),s),true);
 assert.equal(s.finished,true);
 assert.equal(u47WriteAuthorized(request({...progress(),operationId:OP(5)}),s),false);
 assert.equal(u47WriteAuthorized(request({...finish(),operationId:OP(6)}),s),false);
});
