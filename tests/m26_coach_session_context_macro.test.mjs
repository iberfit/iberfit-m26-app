import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNextSessionPreparation} from '../src/m26/intelligence/next-session-prep.js';
import {__applicationInternals} from '../src/m26/app/application.js';
import {renderSessionsRoute} from '../src/m26/modules/route-render.js';
import {createReusableSessionDraft} from '../src/m26/productivity/session-reuse.js';

const clientId='coach-context-client';
const now=new Date('2026-10-08T12:15:00Z');
const session={id:'scheduled-session',clientId,status:'publicado',title:'Sesión programada',revision:1};
const appointment={id:'current-appointment',clientId,sessionId:session.id,status:'confirmada',startAt:'2026-10-08T12:00:00Z',endAt:'2026-10-08T13:00:00Z'};
function state(appointments=[appointment],executions=[]){
  return {collections:{appointments,sessions:[session,{...session,id:'other-session',revision:99,updatedAt:'2026-10-08T12:10:00Z'}],sessionExecutions:executions,checkins:[],iriAssessments:[],trainingCycles:[],m26Entities:[]}};
}
function prepare(value=state()){return buildNextSessionPreparation(value,clientId,{now});}
function startControl(prep){
  return renderSessionsRoute({role:'coach',serviceKind:'training',serviceActive:true,canBuild:true,
    sessions:[{...session,publication:{status:'published',visibleToClient:true}}],sessionCounts:{published:1},executions:[],nextSessionPreparation:prep,
  }).match(/<button[^>]*data-workflow-action="start-published-session"[^>]*>/u)?.[0];
}

test('la cita sigue contextualizando la sesión mientras su intervalo real esté en curso',()=>{
  const value=state([appointment,{...appointment,id:'tomorrow',sessionId:'other-session',startAt:'2026-10-09T12:00:00Z',endAt:'2026-10-09T13:00:00Z'}]);
  const before=structuredClone(value);
  const prep=prepare(value);
  assert.equal(prep.appointment.id,appointment.id);
  assert.equal(prep.session.id,session.id);
  assert.equal(prep.session.source,'appointment');
  assert.equal(prep.session.startable,true);
  assert.deepEqual(value,before);
});

test('inicio principal abre exactamente la sesión preparada, no la revisión mayor de otro plan',()=>{
  const control=startControl(prepare());
  assert.match(control,/data-entity-id="scheduled-session"/u);
  assert.doesNotMatch(control,/disabled/u);
});

test('una cita terminada o sin intervalo válido no se prolonga artificialmente',()=>{
  for(const endAt of ['2026-10-08T12:15:00Z','2026-10-08T11:59:00Z','invalid',null]){
    assert.equal(prepare(state([{...appointment,endAt}])).appointment,null);
  }
});

test('cita futura conserva aliases y sobre body sin inventar duración',()=>{
  const prep=prepare(state([{body:{...appointment,status:'scheduled',startAt:undefined,scheduled_at:'2026-10-09T12:00:00Z',endAt:null}}]));
  assert.equal(prep.appointment.id,appointment.id);
  assert.equal(prep.appointment.startAt,'2026-10-09T12:00:00Z');
  assert.equal(prep.appointment.endAt,null);
});

test('arranque reconoce todos los estados confirmados canónicos, también en body',()=>{
  for(const status of ['confirmada','confirmado','confirmed','scheduled','agendada','agendado']){
    for(const row of [{...appointment,status},{body:{...appointment,status}}]){
      const result=__applicationInternals.confirmedAppointmentForSession([row],session,now.getTime());
      assert.equal(result?.id,appointment.id,status);
      assert.equal(result.status,'confirmada');
    }
  }
});

test('citas no confirmadas o de otro cliente no habilitan arranque ni preparación',()=>{
  for(const status of ['pendiente','propuesta','cancelada','realizada','desconocido']){
    const row={...appointment,status};
    assert.equal(prepare(state([row])).appointment,null);
    assert.equal(__applicationInternals.confirmedAppointmentForSession([row],session,now.getTime()),null);
  }
  const row={...appointment,clientId:'another-client'};
  assert.equal(prepare(state([row])).appointment,null);
  assert.equal(__applicationInternals.confirmedAppointmentForSession([row],session,now.getTime()),null);
});

test('cita en curso vinculada a sesión inexistente conserva aviso y bloquea inicio genérico',()=>{
  const prep=prepare(state([{...appointment,sessionId:'absent'}]));
  assert.equal(prep.session.source,'appointment-mismatch');
  assert.match(startControl(prep),/disabled aria-disabled="true"/u);
});

test('cita de un borrador no permite que el inicio principal salte a otra sesión publicada',()=>{
  const value=state();value.collections.sessions[0]={...session,status:'borrador'};
  const prep=prepare(value);
  assert.equal(prep.session.startable,false);
  assert.match(startControl(prep),/data-entity-id="scheduled-session"/u);
  assert.match(startControl(prep),/disabled aria-disabled="true"/u);
});

test('último feedback se ordena por cierre canónico, no por inicio ni actualización posterior',()=>{
  const executions=[
    {id:'old',clientId,status:'completed',syncStatus:'clean',startAt:'2026-10-07T10:00:00Z',completedAt:'2026-10-07T11:00:00Z',updatedAt:'2026-10-08T12:00:00Z',feedback:{comment:'Anterior'}},
    {id:'latest',clientId,status:'completed',syncStatus:'clean',startAt:'2026-10-06T10:00:00Z',completedAt:'2026-10-08T11:00:00Z',feedback:{comment:'Más reciente'}},
    {id:'pending',clientId,status:'completed',syncStatus:'pending',completedAt:'2026-10-08T12:00:00Z',feedback:{comment:'No confirmado'}},
    {id:'foreign',clientId:'another-client',status:'completed',syncStatus:'clean',completedAt:'2026-10-08T12:01:00Z',feedback:{comment:'Ajeno'}},
  ];
  const prep=prepare(state([],executions));
  assert.equal(prep.lastExecution.id,'latest');
  assert.equal(prep.lastExecution.completedAt,'2026-10-08T11:00:00Z');
  assert.equal(prep.lastExecution.feedback.comment,'Más reciente');
});


function renderContextForCoach(preparation,sessions){
  return renderSessionsRoute({
    role:'coach',serviceKind:'training',serviceActive:true,canBuild:true,
    sessions,sessionCounts:{published:sessions.filter((item)=>item.publication?.status==='published').length},
    executions:[],nextSessionPreparation:preparation,
  });
}
const published=(record,visibleToClient=true)=>({...record,publication:{status:'published',visibleToClient}});

test('preparación conserva la identidad de la sesión exacta al crear una copia editable',()=>{
  const html=renderContextForCoach(prepare(),[
    published(session),published({...session,id:'other-session',revision:99}),
  ]);
  const action=html.match(/<button[^>]*data-workflow-action="reuse-session"[^>]*>Adaptar una copia de esta sesión<\/button>/u)?.[0];
  assert.ok(action,'debe ofrecer una copia independiente de la sesión preparada');
  assert.match(action,/data-entity-id="scheduled-session"/u);
  assert.doesNotMatch(action,/other-session/u);
  assert.doesNotMatch(html,/Revisar sesión en constructor/u);
});

test('una sesión preparada oculta no se habilita gracias a otra sesión publicada',()=>{
  const html=renderContextForCoach(prepare(),[
    published(session,false),published({...session,id:'other-session',revision:99}),
  ]);
  const primary=html.match(/<button[^>]*data-workflow-action="start-published-session"[^>]*>Iniciar sesión programada<\/button>/u)?.[0];
  assert.ok(primary);
  assert.match(primary,/disabled aria-disabled="true"/u);
  assert.doesNotMatch(html,/Adaptar una copia de esta sesión/u);
  assert.doesNotMatch(html,/Iniciar sesión preparada<\/button>/u);
  assert.match(html,/Continuar o crear sesión/u);
});

test('una sesión sin publicación confirmada conserva acceso al constructor sin copiar borradores ajenos',()=>{
  const value=state();
  value.collections.sessions=[{...session,status:'borrador'}];
  const prep=prepare(value);
  const html=renderContextForCoach(prep,[{...session,publication:{status:'draft',visibleToClient:false}}]);
  assert.equal(prep.session.startable,false);
  assert.doesNotMatch(html,/Adaptar una copia de esta sesión/u);
  assert.match(html,/data-workflow-action="open-session-builder"/u);
  assert.match(html,/disabled aria-disabled="true"/u);
});


test('la adaptación copia bloques, cargas y grupos sin mutar la sesión publicada',()=>{
  const source={
    ...session,durationMinutes:65,blocks:[
      {id:'exercise-source',type:'exercise',exerciseId:'squat',name:'Sentadilla',sets:3,reps:'8',plannedLoad:'10 kg',restSeconds:90,targetRpe:7,targetRir:3},
      {id:'group-source',type:'biserie',exerciseIds:['row','push'],rounds:2,
        prescriptions:{row:{reps:'10',plannedLoad:'5 kg'},push:{reps:'8',plannedLoad:''}}},
    ],
  };
  const original=structuredClone(source);
  const catalog={has:(id)=>['squat','row','push'].includes(id)};
  const draft=createReusableSessionDraft(source,{clientId,catalog});
  assert.notEqual(draft.id,source.id);
  assert.equal(draft.clientId,clientId);
  assert.equal(draft.status,'draft');
  assert.equal(draft.revision,0);
  assert.equal(draft.previewAccepted,false);
  assert.equal(draft.blocks.length,2);
  assert.notEqual(draft.blocks[0].id,source.blocks[0].id);
  assert.notEqual(draft.blocks[1].id,source.blocks[1].id);
  assert.equal(draft.blocks[0].plannedLoad,'10 kg');
  assert.equal(draft.blocks[1].type,'biserie');
  assert.equal(draft.blocks[1].prescriptions.row.reps,'10');
  draft.blocks[1].prescriptions.row.reps='12';
  assert.deepEqual(source,original);
});
