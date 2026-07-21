import test from 'node:test';
import assert from 'node:assert/strict';
import {
  publicationStatus,publicationStatusLabel,publicationActionsFor,publicationSummary,publicationCounts,
  assertPublicationTransition,buildPublicationCommand,validateReportDraft,normalizeReportDraft,buildApproveReportDraftCommand,
  createCommand,M26_COMMAND_REGISTRY,stateFromBootstrap,createProductionState,createShellViewModel,createRouteViewModel,
  renderPlanningRoute,renderSessionsRoute,renderReportsRoute,projectCollectionsForRole,
} from '../src/m26/index.js';

const clientId='CLI-RC26-001';
const coach={id:'USR-RC26-COACH',role:'coach',name:'Entrenador'};
const client={id:'USR-RC26-CLIENT',role:'client',clientId,name:'Cliente'};
const at=()=>new Date('2026-07-21T10:00:00.000Z');
function record(status,extra={}){return {id:`REC-${status.replaceAll(/[^a-z]/gi,'-')}`,clientId,status,revision:3,title:`Contenido ${status}`,...extra};}
function data(){return {
  clients:[{id:clientId,name:'Cliente RC26',status:'activo'}],
  clientProfiles:[{id:clientId,clientId,birthDate:'1990-05-10'}],
  iriAssessments:[{id:'IRI-RC26-1',clientId,status:'completado',assessmentDate:'2026-07-01',score:78}],
  trainingCycles:[record('validado',{id:'PLAN-REVIEW'}),record('aprobado',{id:'PLAN-APPROVED'}),record('publicado',{id:'PLAN-PUBLISHED'})],
  sessions:[record('borrador',{id:'SESSION-DRAFT'}),record('aprobado',{id:'SESSION-APPROVED'}),record('publicado',{id:'SESSION-PUBLISHED',blocks:[{id:'B1',type:'exercise',exerciseId:'EX-1'}]})],
  reports:[record('aprobado',{id:'REPORT-APPROVED'}),record('publicado',{id:'REPORT-PUBLISHED'})],
  appointments:[],sessionExecutions:[],clientAccess:[],checkins:[],habits:[],habitLogs:[],privateNotes:[],intelligenceRuns:[],domainEvents:[],coachAvailability:[],wearableConnections:[],wearableDailySummaries:[],wearableSyncRuns:[],m26Entities:[],
};}
function stateFor(user,activeArea){return stateFromBootstrap({user,canary:{active:true},data:data()},createProductionState({activeArea,selectedClientId:clientId}));}

// Máquina de estados y contrato.
test('normaliza estados editoriales sin traducir la lógica de dominio',()=>{
  assert.equal(publicationStatus(record('borrador')),'draft');
  assert.equal(publicationStatus(record('validado')),'review');
  assert.equal(publicationStatus(record('aprobado')),'approved');
  assert.equal(publicationStatus(record('publicado')),'published');
  assert.equal(publicationStatus(record('retirado')),'withdrawn');
  assert.equal(publicationStatusLabel('approved'),'Aprobado');
});

test('acciones disponibles dependen del estado y nunca se conceden al Cliente',()=>{
  assert.deepEqual(publicationActionsFor({entity:'session',record:record('borrador'),role:'coach'}).map(x=>x.action),['approve']);
  assert.deepEqual(publicationActionsFor({entity:'session',record:record('aprobado'),role:'coach'}).map(x=>x.action),['publish']);
  assert.deepEqual(publicationActionsFor({entity:'session',record:record('publicado'),role:'coach'}).map(x=>x.action),['withdraw']);
  assert.deepEqual(publicationActionsFor({entity:'session',record:record('aprobado'),role:'client'}),[]);
});

test('publicar exige aprobación previa y vista previa aceptada',()=>{
  assert.throws(()=>assertPublicationTransition({entity:'session',action:'publish',record:record('borrador'),role:'coach',previewAccepted:true}),/TRANSITION_INVALID/);
  assert.throws(()=>assertPublicationTransition({entity:'session',action:'publish',record:record('aprobado'),role:'coach'}),/PREVIEW_REQUIRED/);
  assert.doesNotThrow(()=>assertPublicationTransition({entity:'session',action:'publish',record:record('aprobado'),role:'coach',previewAccepted:true}));
});

test('retirar o archivar exige un motivo explícito',()=>{
  assert.throws(()=>buildPublicationCommand({entity:'report',action:'withdraw',record:record('publicado'),role:'coach',now:at}),/REASON_REQUIRED/);
  const command=buildPublicationCommand({entity:'report',action:'withdraw',record:record('publicado'),role:'coach',reason:'Informe sustituido por una versión posterior.',now:at});
  assert.equal(command.type,'INFORME_RETIRAR');
  assert.equal(command.reason,'Informe sustituido por una versión posterior.');
  assert.equal(command.payload.patch.visibleToClient,false);
});

test('comandos de aprobación y publicación respetan el registro canónico de 44 comandos',()=>{
  const approve=buildPublicationCommand({entity:'session',action:'approve',record:record('borrador'),role:'coach',now:at});
  const publish=buildPublicationCommand({entity:'session',action:'publish',record:record('aprobado'),role:'coach',previewAccepted:true,now:at});
  assert.equal(createCommand(approve,{registry:M26_COMMAND_REGISTRY,role:'coach'}).type,'SESION_APROBAR');
  assert.equal(createCommand(publish,{registry:M26_COMMAND_REGISTRY,role:'coach'}).type,'SESION_PUBLICAR');
  assert.equal(publish.payload.patch.status,'publicado');
  assert.equal(publish.payload.patch.visibleToClient,true);
});

test('plan archivado solo puede reabrirse con trazabilidad y vuelve a borrador invisible',()=>{
  const reopen=buildPublicationCommand({entity:'planning',action:'reopen',record:record('archivado'),role:'coach',reason:'Se inicia un nuevo ajuste del ciclo.',now:at});
  assert.equal(reopen.type,'PLAN_REABRIR');
  assert.equal(reopen.payload.patch.status,'borrador');
  assert.equal(reopen.payload.patch.visibleToClient,false);
});

test('resumen interpreta visibleToClient falso aunque llegue como texto',()=>{
  const summary=publicationSummary({entity:'report',record:record('publicado',{visibleToClient:'false'}),role:'coach'});
  assert.equal(summary.visibleToClient,false);
});

test('conteos editoriales separan borradores, aprobados y publicados',()=>{
  assert.deepEqual(publicationCounts([record('borrador'),record('validado'),record('aprobado'),record('publicado'),record('publicado')]),{draft:1,review:1,approved:1,published:2,withdrawn:0,archived:0,unknown:0});
});

// Informes premium.
test('borrador de informe exige IRI trazable, cronología, contenido y revisión editorial',()=>{
  const draft={clientId,assessmentId:'IRI-RC26-1',title:'Informe de evolución',periodStart:'2026-06-01',periodEnd:'2026-07-01',summary:'Resumen suficientemente desarrollado para el periodo observado.',conclusions:'Conclusiones profesionales basadas en los datos confirmados.',recommendations:'Próximos pasos revisados por el entrenador responsable.',reviewAccepted:true};
  assert.equal(validateReportDraft(draft).ok,true);
  assert.equal(normalizeReportDraft(draft).visibleToClient,false);
  assert.equal(validateReportDraft({...draft,periodEnd:'2026-02-31'}).ok,false);
  assert.equal(validateReportDraft({...draft,reviewAccepted:false}).ok,false);
});

test('aprobar un informe nuevo no lo publica ni lo hace visible al Cliente',()=>{
  const command=buildApproveReportDraftCommand({clientId,assessmentId:'IRI-RC26-1',title:'Informe de evolución',periodStart:'2026-06-01',periodEnd:'2026-07-01',summary:'Resumen suficientemente desarrollado para el periodo observado.',conclusions:'Conclusiones profesionales basadas en los datos confirmados.',recommendations:'Próximos pasos revisados por el entrenador responsable.',reviewAccepted:true});
  const validated=createCommand(command,{registry:M26_COMMAND_REGISTRY,role:'coach'});
  assert.equal(validated.type,'INFORME_APROBAR');
  assert.equal(validated.payload.patch.status,'aprobado');
  assert.equal(validated.payload.patch.visibleToClient,false);
  assert.equal(validated.payload.patch.format,'a4-premium');
});

// Separación real de experiencia por rol.
test('proyección Cliente solo conserva publicaciones expresamente visibles',()=>{
  const projected=projectCollectionsForRole({...data(),reports:[record('publicado',{id:'VISIBLE'}),record('publicado',{id:'HIDDEN',visibleToClient:false}),record('aprobado',{id:'APPROVED'})]},client);
  assert.deepEqual(projected.reports.map(x=>x.id),['VISIBLE']);
  assert.deepEqual(projected.sessions.map(x=>x.id),['SESSION-PUBLISHED']);
  assert.deepEqual(projected.trainingCycles.map(x=>x.id),['PLAN-PUBLISHED']);
});

test('pantallas Coach muestran gestión editorial y distinguen aprobar de publicar',()=>{
  const state=stateFor(coach,'planificacion');const shell=createShellViewModel(state);const vm=createRouteViewModel(shell,state);const html=renderPlanningRoute(vm);
  assert.match(html,/Gestionar publicación/);
  assert.match(html,/Aprobar plan/);
  assert.match(html,/Publicar para el cliente/);
  assert.match(html,/Aprobar no lo hace visible para el cliente/);
  assert.doesNotMatch(html,/onclick=/);
});

test('pantallas Cliente no contienen controles editoriales ni estados internos',()=>{
  for(const area of ['planificacion','sesion','informes']){
    const state=stateFor(client,area);const shell=createShellViewModel(state);const vm=createRouteViewModel(shell,state);
    const html=area==='planificacion'?renderPlanningRoute(vm):area==='sesion'?renderSessionsRoute(vm):renderReportsRoute(vm);
    assert.doesNotMatch(html,/Gestionar publicación|Aprobar informe interno|Validar borrador|Retirar sesión|data-publication-action/);
    assert.doesNotMatch(html,/Borrador interno|Pendiente de aprobación interna/);
  }
});

test('editor de informes aparece solo para Coach y exige una evaluación IRI confirmada',()=>{
  const coachState=stateFor(coach,'informes');const coachVm=createRouteViewModel(createShellViewModel(coachState),coachState);const coachHtml=renderReportsRoute(coachVm);
  assert.match(coachHtml,/Preparar informe IBERFIT/);
  assert.match(coachHtml,/Aprobar informe interno/);
  assert.match(coachHtml,/He revisado íntegramente el contenido/);
  const clientState=stateFor(client,'informes');const clientVm=createRouteViewModel(createShellViewModel(clientState),clientState);const clientHtml=renderReportsRoute(clientVm);
  assert.doesNotMatch(clientHtml,/Preparar informe IBERFIT|Aprobar informe interno/);
});
