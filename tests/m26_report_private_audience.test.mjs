import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateReportDetail} from '../src/m26/workflows/report-private-detail.js';
import {buildEvolutionReportHtml} from '../src/m26/workflows/evolution-report-document.js';
const now=new Date('2026-11-25T15:00:00Z');
const report={id:'weekly',ready:true,periodStart:'2026-11-19',periodEnd:'2026-11-25',title:'Semana',summary:'Resumen confirmado',conclusions:'Conclusiones',recommendations:'Siguiente etapa',coachComment:'SECRETO INTERNO <script>',sourceType:'session_execution_period',evidence:[{label:'Sesiones confirmadas',text:'1',source:'sessionExecutions',quality:'confirmada'}]};
const execution=(id,clientId,date,results,extra={})=>({id,clientId,status:'completed',syncStatus:'clean',completedAt:date,title:'Fuerza',results,...extra});
const state={identity:{role:'coach'},selectedClientId:'c1',collections:{sessionExecutions:[
 execution('e1','c1','2026-11-24T15:00:00Z',[{exerciseId:'squat',exerciseName:'Sentadilla',setNumber:1,reps:0,loadKg:40,rir:0},{exerciseId:'squat',setNumber:2,reps:8,loadKg:50,completed:false},{exerciseId:'row',setNumber:1,reps:8,load:'sin unidad',rpe:7}]),
 execution('e2','c2','2026-11-24T15:00:00Z',[{exerciseId:'secret',exerciseName:'CLIENTE AJENO',reps:8,loadKg:100}]),
 execution('e3','c1','2026-11-01T15:00:00Z',[{exerciseId:'old',reps:8}]),
 execution('e4','c1','2026-11-24T16:00:00Z',[{exerciseId:'pending',reps:9}],{syncStatus:'pending'}),
]},pendingOperations:[],conflicts:[],rejectedOperations:[]};
test('Private detail is owner-scoped, dated, confirmed and keeps measured zero distinct from missing',()=>{
 const d=buildPrivateReportDetail(state,'c1',report,{now});
 assert.equal(d.sessions,1);assert.equal(d.observedRows,2);assert.equal(d.omittedRows,1);
 assert.equal(d.details[0].reps,0);assert.equal(d.details[0].rir,0);assert.equal(d.details[1].load,null);
 assert.equal(d.coverage.load,1);assert.equal(d.coverage.reps,2);
 assert.throws(()=>buildPrivateReportDetail({...state,identity:{role:'client'}},'c1',report,{now}),/SCOPE/);
 assert.throws(()=>buildPrivateReportDetail(state,'c2',report,{now}),/SCOPE/);
 assert.equal(buildPrivateReportDetail(state,'c1',{...report,id:'post-session',sourceId:'e1'},{now}).sessions,1);
 assert.equal(buildPrivateReportDetail(state,'c1',{...report,id:'post-session',sourceId:'e2'},{now}).sessions,0);
});
test('Client draft and published HTML cannot contain private notes or technical payload',()=>{
 const detail=buildPrivateReportDetail(state,'c1',report,{now});
 const internal=buildEvolutionReportHtml({report,audience:'internal',technicalDetail:detail});
 assert.match(internal,/ANEXO TÉCNICO PRIVADO/);assert.match(internal,/Sentadilla/);assert.match(internal,/SECRETO INTERNO &lt;script&gt;/);assert.doesNotMatch(internal,/CLIENTE AJENO/);
 for(const opts of [{audience:'client'},{audience:'internal',publicationStatus:'published'}]){
   const html=buildEvolutionReportHtml({report,technicalDetail:detail,...opts});
   assert.match(html,/m44-audience-client/);assert.doesNotMatch(html,/SECRETO INTERNO|ANEXO TÉCNICO PRIVADO|Sentadilla|CLIENTE AJENO/);
 }
 const admin=buildPrivateReportDetail({...state,identity:{role:'admin'}},'c1',report,{now});
 assert.match(buildEvolutionReportHtml({report,audience:'internal',technicalDetail:admin}),/Control interno del expediente/);
});

test('Technical longitudinal analysis requires complete matching explicit protocol, equal reps and distinct dates',()=>{
 const context={exerciseId:'sq',exerciseName:'Sentadilla técnica',variantId:'barra-alta',equipmentId:'barra',loadBasis:'total',side:'bilateral',reps:8,setNumber:1};
 const s={...state,collections:{sessionExecutions:[
 execution('a','c1','2026-11-19T15:00:00Z',[{...context,loadKg:40,rpe:8,rir:2}]),
 execution('b','c1','2026-11-21T15:00:00Z',[{...context,loadKg:45,rpe:7,rir:3},{...context,loadKg:45,rpe:9,rir:1}]),
 execution('c','c1','2026-11-24T15:00:00Z',[{...context,loadKg:50,rpe:8,rir:2},{...context,reps:5,loadKg:80},{...context,variantId:'otra',loadKg:90},{...context,equipmentId:undefined,loadKg:100}]),
 ]}};
 const d=buildPrivateReportDetail(s,'c1',report,{now});
 assert.equal(d.exerciseSummary[0].rows,7);assert.equal(d.exerciseSummary[0].exposures,3);
 assert.equal(d.loadComparisons.length,1);const c=d.loadComparisons[0];
 assert.equal(c.first.kg,40);assert.equal(c.last.kg,50);assert.equal(c.change,10);assert.equal(c.percent,25);assert.equal(c.bestKg,50);assert.equal(c.milestoneCount,2);assert.deepEqual(c.milestones.map(x=>x.kg),[45,50]);assert.equal(c.points[1].rpe,null);assert.equal(c.points[1].rir,null);
 const internal=buildEvolutionReportHtml({report,technicalDetail:d});assert.match(internal,/Comparaciones de carga por ejercicio/);assert.match(internal,/Sentadilla técnica/);
 assert.doesNotMatch(buildEvolutionReportHtml({report,technicalDetail:d,audience:'client'}),/Sentadilla técnica|Comparaciones de carga por ejercicio/);
});
