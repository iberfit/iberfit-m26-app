import test from 'node:test';
import assert from 'node:assert/strict';
import {CLIENT_SERVICE_PROMPTS,clientServicePrompt} from '../src/m26/communication/client-service-prompts.js';
import {renderCommunicationRoute} from '../src/m26/communication/route-render.js';
import {createCommunicationController} from '../src/m26/communication/controller.js';
import {buildCoachSessionReviewCues} from '../src/m26/intelligence/session-adjustment-cues.js';
import {renderSessionsRoute} from '../src/m26/modules/route-render.js';

const timestamp='2026-11-09T18:00:00Z';
function preparation(){
  return {kind:'next-session-preparation',generatedAt:timestamp,clientId:'client-fixture',
    progress:{plannedSessions:2,completedSessions:1,dataQuality:'media',
      latestCheckinAt:'2026-11-09T10:00:00Z',
      latestCheckin:{energy:2,sleep:3,stress:8,fatigue:8,pain:2}},
    session:{id:null,title:null,startable:false},
    reviewRequired:true,reviewReasons:[],
    evidence:{exerciseMemories:0},decisions:{openCount:0,open:[]},
    deviceContext:{status:'recent',metrics:{sleepMinutes:400}},
    wellbeingShift:{available:true,signals:[{key:'sleep',delta:-2.5}]},
    safety:{coachConfirmationRequired:true,note:'No hay ajustes automáticos.'},
  };
}
function threadHtml(role){
  return renderCommunicationRoute({communication:true,kind:'communication',role,
    threads:[{id:'thread-synthetic',messages:[],unreadCount:0,coachName:'Coach',
      clientName:'Cliente sintético'}],notifications:[],clients:[],
    canOpenThread:false});
}

test('Client has bounded private concierge drafts; Coach never receives Client presets',()=>{
  assert.equal(CLIENT_SERVICE_PROMPTS.length,4);
  assert.equal(clientServicePrompt('agenda')?.key,'agenda');
  assert.equal(clientServicePrompt('no-existe'),null);
  assert.equal(clientServicePrompt('__proto__'),null);
  const client=threadHtml('client'),coach=threadHtml('coach');
  for(const choice of CLIENT_SERVICE_PROMPTS){
    assert.match(client,new RegExp('data-m45-compose-prompt="'+choice.key+'"'));
    assert.ok(choice.draft.length>10&&choice.draft.length<4000);
    assert.ok(!coach.includes('data-m45-compose-prompt="'+choice.key+'"'));
  }
  assert.match(client,/No reserva ni reprograma automáticamente/u);
  assert.match(client,/no garantiza respuesta inmediata/iu);
});

test('Selecting a Client quick request writes only to the existing draft and never calls backend',()=>{
  const events=new Map(),calls=[],textarea={value:'Borrador propio',focus(){this.focused=true;},
    setSelectionRange(start,end){this.selection=[start,end];}};
  const form={querySelector(selector){
    if(selector==='textarea[name="body"]')return textarea;
    if(selector==='[name="threadId"]')return {value:'thread-synthetic'};
    return null;
  }};
  textarea.closest=(selector)=>selector==='[data-communication-form="message-send"]'?form:null;
  const root={ownerDocument:{defaultView:null,activeElement:textarea},
    querySelector(selector){return selector==='[data-communication-role]'
      ?{dataset:{communicationRole:'client',communicationIdentity:'client-fixture'}}:null;},
    querySelectorAll(){return [];},
    addEventListener(name,fn){events.set(name,fn);},
    removeEventListener(name){events.delete(name);}};
  const service={webPush:{async status(){return {active:false};}},
    async execute(){calls.push('send');throw Error('unexpected send');}};
  const controller=createCommunicationController({root,service});
  controller.mount();
  const suggestion={dataset:{m45ComposePrompt:'viaje'},
    closest(selector){return selector==='[data-communication-form="message-send"]'?form:null;}};
  events.get('click')({target:{closest(selector){
    return selector==='[data-m45-compose-prompt]'?suggestion:null;
  }},preventDefault(){}});
  assert.ok(textarea.value.startsWith('Borrador propio'));
  assert.match(textarea.value,/viajar/u);
  assert.equal(textarea.focused,true);
  assert.equal(calls.length,0);
  controller.destroy();
});

test('Coach review explains fresh corroborated signals but never changes a prescription',()=>{
  const prep=preparation(),original=structuredClone(prep);
  const result=buildCoachSessionReviewCues(prep);
  assert.equal(result.state,'review-suggested');
  assert.equal(result.automaticChange,false);
  assert.equal(result.coachReviewRequired,true);
  assert.ok(result.items.some(x=>x.kind==='pain'));
  assert.ok(result.items.some(x=>x.kind==='wellbeing'));
  assert.ok(result.items.some(x=>x.kind==='trend'));
  assert.deepEqual(prep,original);
  const html=renderSessionsRoute({kind:'sesion',role:'coach',canBuild:true,
    sessions:[],sessionCounts:{published:0},executions:[],nextSessionPreparation:prep});
  assert.match(html,/data-premium-coach-review/u);
  assert.match(html,/No se modifican cargas, ejercicios, horarios ni publicaciones automáticamente/u);
});

test('Stale, missing and ambiguous measurements cannot be used to propose load reductions',()=>{
  const prep=preparation();
  prep.progress.latestCheckinAt='2026-10-28T09:00:00Z';
  prep.deviceContext={status:'multiple-sources',metrics:{sleepMinutes:100}};
  assert.deepEqual(buildCoachSessionReviewCues(prep).items,[]);
  prep.deviceContext={status:'recent',metrics:{sleepMinutes:410}};
  assert.deepEqual(buildCoachSessionReviewCues(prep).items.map(x=>x.kind),['wearable']);
  prep.deviceContext={status:'historical',metrics:{sleepMinutes:300}};
  assert.equal(buildCoachSessionReviewCues(prep).state,'insufficient-evidence');
  assert.equal(buildCoachSessionReviewCues({}).state,'insufficient-evidence');
});
