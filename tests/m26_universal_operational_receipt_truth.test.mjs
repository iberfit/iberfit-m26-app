import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySessionOperationOutcome,pendingSessionOperationFeedback} from '../src/m26/workflows/session-controller.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const ack={ok:true,kind:'ack',response:{remoteRevision:2}};
const receipt=(value=ack)=>({ok:true,value});
test('Operational telemetry only calls it ACK for an actual server receipt',()=>{
 assert.equal(classifySessionOperationOutcome({dispatchKind:'command',outcome:receipt()}),'ack');
 assert.equal(classifySessionOperationOutcome({dispatchKind:'command',outcome:receipt({...ack,kind:'duplicate'})}),'ack');
 assert.equal(classifySessionOperationOutcome({dispatchKind:'command',outcome:receipt({status:'active'})}),'not_confirmed');
 assert.equal(classifySessionOperationOutcome({dispatchKind:'execution',outcome:receipt()}),'not_confirmed');
 assert.equal(classifySessionOperationOutcome({dispatchKind:'command',outcome:{ok:true,value:{kind:'ack'}}}),'not_confirmed');
 assert.equal(classifySessionOperationOutcome({dispatchKind:'command',outcome:{ok:false,error:new Error('rejected')}}),'not_confirmed');
});
test('Offline queued execution and remote uncertainty are never recorded as ACK',()=>{
 assert.equal(classifySessionOperationOutcome({dispatchKind:'queued',outcome:receipt()}),'pending');
 assert.equal(classifySessionOperationOutcome({dispatchKind:'queued',outcome:{ok:true,value:{status:'active'}}}),'pending');
 assert.equal(classifySessionOperationOutcome({dispatchKind:'command',outcome:{ok:false,error:{code:'M26_SESSION_ACTION_TIMEOUT'}}}),'pending');
 assert.equal(classifySessionOperationOutcome({dispatchKind:'command',outcome:{ok:false},execution:{syncStatus:'pending'}}),'pending');
 assert.equal(classifySessionOperationOutcome({dispatchKind:null,outcome:receipt()}),'not_confirmed');
});
test('Pending server confirmation retains accessible translated status in four supported languages',()=>{
 const copy='Inicio pendiente de confirmación del servidor. Conservamos el progreso local sin presentarlo como confirmado.';
 for(const language of ['en','fr','pt']){
  const label=iberfitSurfaceTranslate(copy,{language});
  assert.notEqual(label,copy,language);
  assert.ok(label.length>30);
 }
});

test('Coach publication and Client finish never claim success without remote receipt',()=>{
 assert.equal(pendingSessionOperationFeedback('publish','ack'),null);
 assert.equal(pendingSessionOperationFeedback('finish','ack'),null);
 assert.equal(pendingSessionOperationFeedback('start','pending'),null);
 for(const operation of ['publish','finish']){
   for(const status of ['pending','not_confirmed']){
     const message=pendingSessionOperationFeedback(operation,status);
     assert.equal(typeof message,'string');
     assert.match(message,/confirmad/iu);
     for(const language of ['en','fr','pt']){
       const translated=iberfitSurfaceTranslate(message,{language});
       assert.notEqual(translated,message,language+' '+operation);
     }
   }
 }
});
