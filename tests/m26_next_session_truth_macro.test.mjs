import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNextSessionPreparation,__nextSessionPreparationInternals} from '../src/m26/intelligence/next-session-prep.js';
import {renderSessionsRoute} from '../src/m26/modules/route-render.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const clientId='client-training-truth';
const now=new Date('2026-10-07T12:00:00Z');
function state(appointments=[],extra={}){
 return {collections:{appointments,sessions:[],sessionExecutions:[],checkins:[],iriAssessments:[],trainingCycles:[],m26Entities:[],...extra}};
}
const appointment=(id,status,startAt='2026-10-09T12:00:00Z')=>({id,clientId,status,startAt,endAt:'2026-10-09T13:00:00Z'});
const next=(appointments)=>__nextSessionPreparationInternals.nextAppointment(state(appointments),clientId,now);

test('el Coach no trata una propuesta o pendiente como cita confirmada',()=>{
 assert.equal(next([appointment('proposal','propuesta'),appointment('pending','pendiente')]),null);
 assert.equal(next([appointment('draft','borrador'),appointment('rescheduled','reprogramada')]),null);
});
test('la siguiente cita confirmada prevalece aunque la propuesta sea anterior',()=>{
 const result=next([
  appointment('proposal','propuesta','2026-10-08T12:00:00Z'),
  appointment('real','confirmada','2026-10-09T12:00:00Z'),
 ]);
 assert.equal(result?.id,'real');
});
test('el status de agenda admite confirmed/scheduled sin tratar pendientes como confirmados',()=>{
 assert.equal(next([appointment('scheduled','scheduled')])?.id,'scheduled');
 assert.equal(next([appointment('confirmed','confirmed')])?.id,'confirmed');
});
test('una cita pasada no se presenta como próxima',()=>{
 assert.equal(next([{...appointment('old','confirmada','2026-10-05T12:00:00Z'),endAt:'2026-10-05T13:00:00Z'}]),null);
});
test('falta de adherencia/RPE no se convierte en cero medido',()=>{
 const prep=buildNextSessionPreparation(state(),clientId,{now});
 assert.equal(prep.progress.adherence,null);
 assert.equal(prep.progress.adherencePercent,null);
 assert.equal(prep.progress.averageRpe,null);
 assert.equal(prep.progress.lastExecutionRpe,null);
});
test('carga faltante no se transforma en 0 kg y la carga cero auténtica sigue visible',()=>{
 const label=__nextSessionPreparationInternals.loadLabel;
 assert.equal(label({value:null,unit:'kg'}),null);
 assert.equal(label({value:'',unit:'kg'}),null);
 assert.equal(label({value:0,unit:'kg'}),'0 kg');
 assert.equal(label({raw:'15 kg',value:null,unit:'kg'}),'15 kg');
});
test('RPE de feedback vacío no se convierte en cero; el RPE real se conserva',()=>{
 const feedback=__nextSessionPreparationInternals.feedbackOf;
 assert.equal(feedback({feedback:{sessionRpe:'',pain:false}}).sessionRpe,null);
 assert.equal(feedback({feedback:{sessionRpe:8,pain:false}}).sessionRpe,8);
});
function renderCheckin(latestCheckin){
 const prep={kind:'next-session-preparation',clientId,session:{id:null,title:null,status:null,startable:false},appointment:null,iri:null,
 progress:{adherencePercent:null,completedSessions:0,plannedSessions:0,lastExecutionRpe:null,lastExecutionAt:null,latestCheckinAt:null,dataQuality:'limitada',latestCheckin},
 evidence:{exerciseMemories:0},decisions:{open:[],openCount:0},reviewRequired:false,reviewReasons:[],exerciseMemory:[],lastExecution:null,safety:{note:'Datos únicamente confirmados.'}};
 return renderSessionsRoute({kind:'sesion',role:'coach',canBuild:true,canEdit:true,serviceActive:true,serviceKind:'training',sessions:[],sessionCounts:{published:0},executions:[],nextSessionPreparation:prep});
}
test('checkin antiguo con puntuaciones nulas queda sin datos comparables',()=>{
 const html=renderCheckin({energy:null,sleep:null,stress:null,pain:null,fatigue:null,motivation:null});
 assert.match(html,/Check-in registrado sin valores comparables/);
 assert.doesNotMatch(html,/<strong>null<\/strong>/);
});
test('el cero real y el valor numérico textual sí aparecen en checkin',()=>{
 const html=renderCheckin({pain:0,sleep:'7',energy:null});
 assert.match(html,/<strong>0<\/strong>/);
 assert.match(html,/<strong>7<\/strong>/);
});
test('Booleanos/arrays no pasan a puntuaciones de checkin mediante coerción',()=>{
 const html=renderCheckin({pain:false,energy:[],sleep:[0],stress:true});
 assert.match(html,/Check-in registrado sin valores comparables/);
});

test('una sesión en borrador exige revisión expresa del Coach antes de iniciar',()=>{
 const collections=state([],{
   sessions:[{id:'draft-1',clientId,status:'borrador',title:'Fuerza borrador',updatedAt:'2026-10-06T13:00:00Z'}],
 });
 const preparation=buildNextSessionPreparation(collections,clientId,{now});
 assert.equal(preparation.session.id,'draft-1');
 assert.equal(preparation.session.startable,false);
 assert.equal(preparation.session.source,'draft-fallback');
 assert.ok(preparation.reviewReasons.some((reason)=>reason.kind==='session-unpublished'));
 assert.equal(preparation.reviewRequired,true);
});

test('una cita confirmada vinculada a otra sesión no inicia un plan incorrecto',()=>{
 const prepared=state([{
   id:'appointment-mismatch',clientId,status:'confirmada',
   sessionId:'absent-session',startAt:'2026-10-09T12:00:00Z',
 }],{
   sessions:[{id:'unrelated-session',clientId,status:'publicado',title:'Plan distinto',updatedAt:'2026-10-06T13:00:00Z'}],
 });
 const context=buildNextSessionPreparation(prepared,clientId,{now});
 assert.equal(context.appointment.id,'appointment-mismatch');
 assert.equal(context.session.id,'unrelated-session');
 assert.equal(context.session.source,'appointment-mismatch');
 assert.equal(context.session.startable,false);
 assert.ok(context.reviewReasons.some((reason)=>reason.kind==='appointment-session-mismatch'));
});

test('una cita que vincula correctamente una sesión publicada sigue siendo iniciable',()=>{
 const prepared=state([{
   id:'appointment-linked',clientId,status:'confirmada',
   sessionId:'published-1',startAt:'2026-10-09T12:00:00Z',
 }],{
   sessions:[{id:'published-1',clientId,status:'publicado',title:'Fuerza programada',updatedAt:'2026-10-06T13:00:00Z'}],
 });
 const context=buildNextSessionPreparation(prepared,clientId,{now});
 assert.equal(context.session.id,'published-1');
 assert.equal(context.session.source,'appointment');
 assert.equal(context.session.startable,true);
 assert.ok(!context.reviewReasons.some((reason)=>reason.kind==='appointment-session-mismatch'));
 assert.ok(!context.reviewReasons.some((reason)=>reason.kind==='session-unpublished'));
});

test('una cita vinculada a una sesión de otra persona no permite iniciar esa sesión',()=>{
 const prepared=state([{
   id:'appointment-cross-client',clientId,status:'confirmada',
   sessionId:'other-client-session',startAt:'2026-10-09T12:00:00Z',
 }],{
   sessions:[
     {id:'other-client-session',clientId:'client-stranger',status:'publicado',title:'Sesión ajena',updatedAt:'2026-10-06T13:00:00Z'},
     {id:'local-session',clientId,status:'publicado',title:'Sesión propia',updatedAt:'2026-10-06T13:00:00Z'},
   ],
 });
 const context=buildNextSessionPreparation(prepared,clientId,{now});
 assert.equal(context.session.id,'local-session');
 assert.equal(context.session.startable,false);
 assert.equal(context.session.source,'appointment-mismatch');
 assert.ok(context.reviewRequired);
});

test('un estado de publicación ausente no se presenta como listo',()=>{
 const prepared=state([],{
   sessions:[{id:'status-unknown',clientId,title:'Sin publicar',updatedAt:'2026-10-06T13:00:00Z'}],
 });
 const context=buildNextSessionPreparation(prepared,clientId,{now});
 assert.equal(context.session.startable,false);
 assert.ok(context.reviewReasons.some((reason)=>reason.kind==='session-unpublished'));
});

function startButton(vm){
 const html=renderSessionsRoute({
   role:'coach',canBuild:true,canEdit:true,serviceKind:'training',
   serviceActive:true,sessionCounts:{published:0},sessions:[],executions:[],
   nextSessionPreparation:null,...vm,
 });
 const control=html.match(/<button[^>]*data-workflow-action="start-published-session"[^>]*>/u)?.[0];
 assert.ok(control,'primary session start control is expected');
 return {control,html};
}

test('un Coach con solo borradores no recibe un falso botón de inicio',()=>{
 const {control,html}=startButton({
   sessions:[{id:'draft-1',title:'Borrador',publication:{status:'draft',visibleToClient:false}}],
 });
 assert.match(control,/disabled aria-disabled="true"/u);
 assert.match(html,/Continuar o crear sesión/u);
});

test('el Coach sí puede iniciar una sesión publicada y visible',()=>{
 const {control}=startButton({
   sessions:[{id:'ready-1',title:'Fuerza',publication:{status:'published',visibleToClient:true}}],
   sessionCounts:{published:1},
 });
 assert.doesNotMatch(control,/disabled/u);
});

test('publicada pero expresamente invisible para el cliente no habilita inicio directo',()=>{
 const {control}=startButton({
   sessions:[{id:'hidden',title:'No entregada',publication:{status:'published',visibleToClient:false}}],
   sessionCounts:{published:1},
 });
 assert.match(control,/disabled aria-disabled="true"/u);
});

test('cita con vínculo inconsistente bloquea inicio genérico pero mantiene constructor',()=>{
 const {control,html}=startButton({
   sessions:[{id:'ready',title:'Fuerza',publication:{status:'published',visibleToClient:true}}],
   sessionCounts:{published:1},
   nextSessionPreparation:{kind:'next-session-preparation',clientId,session:{id:'ready',source:'appointment-mismatch',startable:false},
     appointment:null,reviewRequired:true,reviewReasons:[],
     progress:{plannedSessions:0,completedSessions:0,dataQuality:'limitada'},
     decisions:{open:[],openCount:0},exerciseMemory:[],evidence:{exerciseMemories:0},safety:{note:'Revisión profesional.'}},
 });
 assert.match(control,/disabled aria-disabled="true"/u);
 assert.match(html,/open-session-builder/u);
});

test('Cliente con una sesión publicada conserva su acción principal',()=>{
 const {control}=startButton({role:'client',canBuild:false,sessions:[{id:'ready-client',title:'Disponible',clientContent:{}}]});
 assert.doesNotMatch(control,/disabled/u);
});


test('avisos de planificación y cita tienen traducciones ES/EN/FR/PT',()=>{
 const messages=[
  'La sesión disponible todavía no está publicada. Revisa y publica antes de iniciar.',
  'La cita confirmada apunta a una sesión diferente o no disponible. Revisa la vinculación antes de iniciar.',
 ];
 for(const message of messages){
   assert.equal(iberfitSurfaceTranslate(message,{language:'es'}),message);
   for(const language of ['en','fr','pt']){
     const translated=iberfitSurfaceTranslate(message,{language});
     assert.notEqual(translated,message,`Falta traducción ${language}: ${message}`);
   }
 }
});
