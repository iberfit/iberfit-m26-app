import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
import {syncAppointmentFormState} from '../src/m26/app/workflow-controller.js';

const CLIENT='10000000-0000-4000-8000-000000000101';
const OTHER='10000000-0000-4000-8000-000000000102';
const SESSION='10000000-0000-4000-8000-000000000103';
const session={id:SESSION,clientId:CLIENT,status:'disponible',title:'Entrenamiento de fuerza',revision:4,
 deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
 visibleToClient:true,clientVisibilityLevel:'full',durationMinutes:50,
 blocks:[{type:'exercise',exerciseId:'sentadilla',sets:3}]};

test('U37 Coach appointment editor offers only published scoped sessions and keeps free appointments',()=>{
 const vm={kind:'agenda',role:'coach',selectedClientId:CLIENT,
  clients:[{id:CLIENT,name:'Cliente de ensayo'}],rc39:{
  appointments:[],confirmationOpen:0,changeRequests:0,needsPreparation:0,
  sessionProjections:[{
   id:SESSION,clientId:CLIENT,title:'Entrenamiento de fuerza',visible:true,
   session,modality:'guiada_en_app',
  },{
   id:OTHER,clientId:OTHER,title:'Otra persona',visible:true,session:{...session,id:OTHER,clientId:OTHER}
  },{
   id:'session-draft',clientId:CLIENT,title:'Borrador',visible:false,session:{...session,id:'session-draft',status:'borrador'}
  }]},
 };
 const html=renderRc39Route(vm);
 assert.match(html,/<select name="sessionId"/);
 assert.match(html,/Vincular sesión publicada/);
 assert.match(html,/Cita general sin sesión vinculada/);
 assert.match(html,new RegExp('value="'+SESSION+'"'));
 assert.doesNotMatch(html,new RegExp('value="'+OTHER+'"'));
 assert.doesNotMatch(html,/value="session-draft"/);
 assert.match(html,/data-session-duration="50"/);
});

test('U37 switching the client clears a foreign prescription and auto-fills from selected session',()=>{
 const selectedClient={dataset:{clientModality:'presencial',sessionDuration:'60',trainingAddress:'Lugar habitual'}};
 const client={value:CLIENT,selectedOptions:[selectedClient]};
 const own={value:SESSION,disabled:false,dataset:{clientId:CLIENT,modality:'guiada_en_app',sessionDuration:'50'}};
 const foreign={value:OTHER,disabled:false,dataset:{clientId:OTHER,modality:'presencial',sessionDuration:'45'}};
 const blank={value:'',disabled:false,dataset:{}};
 const linked={value:SESSION,options:[blank,own,foreign],get selectedOptions(){return [this.options.find(x=>x.value===this.value)||blank]}};
 const modality={value:'',dataset:{}};
 const start={value:'2026-10-27T10:00'};
 const end={value:'',dataset:{}};
 const location={value:'',dataset:{},setAttribute(){},removeAttribute(){}};
 const inputs={clientId:client,sessionId:linked,modality,startAt:start,endAt:end,location};
 const form={elements:{namedItem:name=>inputs[name]||null},querySelector:()=>null};
 const first=syncAppointmentFormState(form,{querySelector:()=>null});
 assert.equal(first.modality,'guiada_en_app');
 assert.equal(first.sessionDurationMinutes,50);
 assert.equal(end.value,'2026-10-27T10:50');
 assert.equal(foreign.disabled,true);
 client.value=OTHER;
 const next=syncAppointmentFormState(form,{querySelector:()=>null});
 assert.equal(linked.value,'');
 assert.equal(next.modality,'presencial');
 assert.equal(end.value,'2026-10-27T11:00');
 assert.equal(own.disabled,true);
 assert.equal(foreign.disabled,false);
});

test('U37 submit revalidates Client identity and published status against authenticated source',()=>{
 const source=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
 const start=source.indexOf('async function createAppointment(){');
 const end=source.indexOf('async function confirmAppointment(',start);
 assert.ok(start>=0&&end>start);
 const fn=source.slice(start,end);
 assert.match(fn,/const sessionId=String\(raw\.sessionId\|\|''\)\.trim\(\)/);
 assert.match(fn,/String\(item\?\.clientId\|\|item\?\.client_id\|\|body\.clientId\|\|body\.client_id\|\|''\)===clientId/);
 assert.match(fn,/M26_APPOINTMENT_LINKED_SESSION_NOT_AVAILABLE/);
 assert.match(fn,/draft\.sessionId=sessionId/);
 assert.match(fn,/buildAppointmentCommand\(draft,0\)/);
});
