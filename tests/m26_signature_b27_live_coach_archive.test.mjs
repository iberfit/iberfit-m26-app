import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution,recordSet} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {COACH_SESSIONS_ARCHIVE_BATCH,COACH_SESSIONS_FIRST_PAGE,renderCoachSessionsProgressive} from '../src/m26/rc39/route-render.js';

const data=JSON.parse(readFileSync(new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url),'utf8'));
const catalog=createExerciseCatalog(data);
function workout(){
 const draft=createSessionDraft({clientId:'b27-synthetic-client',title:'Entrenamiento B27',durationMinutes:50});
 const ex=catalog.list()[0];
 addCatalogExercise(draft,ex.id,catalog,{sets:2,reps:'10',plannedLoad:'20 kg',restSeconds:75,targetRpe:7});
 return draft;
}
test('B27: real Cliente guidance precedes result fields; Coach retains professional controls',()=>{
 const session=workout(),execution=createExecution({session,clientId:session.clientId});
 startExecution(execution);
 const html=renderGuidedExecution({execution,session,catalog,role:'client'});
 assert.match(html,/data-session-next-queue-cue/);
 assert.match(html,/La siguiente serie continúa en este ejercicio/);
 assert.match(html,/data-session-client-quick-controls/);
 assert.match(html,/data-session-action="complete-set"/);
 assert.equal((html.match(/data-session-action="complete-set"/gu)||[]).length,1);
 assert.ok(html.indexOf('data-session-live-entry')>html.indexOf('data-session-client-quick-controls'));
 const coach=renderGuidedExecution({execution,session,catalog,role:'coach'});
 assert.match(coach,/data-session-coach-quick-controls/);
 assert.doesNotMatch(coach,/data-session-client-motion/u);
 assert.match(coach,/data-session-coach-set-fields/);
 for(const k of ['reps','seconds','load','rpe','rir'])assert.match(coach,new RegExp('data-set-field="'+k+'"'));
});
test('B27: queue guidance is read-only; rest retains correction and navigation',()=>{
 const session=workout(),execution=createExecution({session,clientId:session.clientId});
 startExecution(execution);
 const snapshot=JSON.stringify(execution);
 const first=renderGuidedExecution({execution,session,catalog,role:'client'});
 assert.match(first,/Siguiente paso/);
 assert.equal(JSON.stringify(execution),snapshot);
 recordSet(execution,session,{reps:10,rpe:7});
 execution.restUntil=new Date(Date.now()+75000).toISOString();
 const rest=renderGuidedExecution({execution,session,catalog,role:'client'});
 assert.match(rest,/data-session-live-state="rest"/);
 assert.doesNotMatch(rest,/data-session-client-motion/u);
 assert.match(rest,/data-session-action="next"/);
 assert.match(rest,/data-session-action="correct-set"/);
});
const row=i=>({id:'session-'+i,title:'Sesión '+i,visible:true,canClientExecute:false,
 modality:'presencial',ownership:'coach_led',visibility:'summary_only',
 session:{id:'session-'+i,status:'published',durationMinutes:50,
 blocks:[{id:'a',type:'exercise',exerciseId:'press',name:'Press',sets:3,reps:'10'}]}});
test('B27: all 327 Coach sessions and actions accessible in bounded groups',()=>{
 const rows=Array.from({length:327},(_,i)=>row(i+1));
 const html=renderCoachSessionsProgressive(rows,'presencial',{catalog:[],serviceActive:true});
 assert.equal(COACH_SESSIONS_FIRST_PAGE,6);
 assert.equal(COACH_SESSIONS_ARCHIVE_BATCH,18);
 assert.equal((html.match(/data-rc39-session="/gu)||[]).length,327);
 assert.equal((html.match(/data-coach-sessions-batch>/gu)||[]).length,18);
 assert.match(html,/Ver otras 321 sesiones/);
 assert.match(html,/Sesiones 7–24/);
 assert.match(html,/data-rc39-session="session-327"/);
 assert.match(html,/Revisar prescripción y vista del cliente/);
 assert.ok(html.indexOf('data-coach-sessions-more')>html.indexOf('data-rc39-session="session-6"'));
 assert.equal(rows[0].title,'Sesión 1');
});
test('B27: short Coach archive remains exactly one disclosure',()=>{
 const html=renderCoachSessionsProgressive(Array.from({length:17},(_,i)=>row(i+1)),'presencial',{catalog:[]});
 assert.match(html,/Ver otras 11 sesiones/);
 assert.doesNotMatch(html,/data-coach-sessions-batch/u);
 assert.equal((html.match(/data-rc39-session="/gu)||[]).length,17);
});
test('B27: mobile touch, role separation, accessibility and motion safeguards',()=>{
 const a=readFileSync(new URL('../src/m26/design/role-surfaces.css',import.meta.url),'utf8');
 const b=readFileSync(new URL('../src/m26/rc39/rc39.css',import.meta.url),'utf8');
 assert.match(a,/\.m26-session-athlete-motion/u);
 assert.match(a,/grid-template-areas:"motion" "primary" "context"/u);
 assert.match(a,/@media\(forced-colors:active\)/u);
 assert.match(b,/m26-rc39-coach-batch:not\(\[open\]\)>\.m26-rc39-coach-batch-body\{display:none\}/u);
 assert.match(b,/m26-rc39-coach-more:not\(\[open\]\)>\.m26-rc39-coach-more-grid\{display:none\}/u);
 assert.match(b,/m26-rc39-coach-batch-toggle:focus-visible/u);
 assert.match(b,/@media\(prefers-reduced-motion:reduce\)/u);
});
