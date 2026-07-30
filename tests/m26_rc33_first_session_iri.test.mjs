import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  legacyClientDraftPayload,
  validateClientOnboardingDraft,
  waitForCreatedClient,
} from '../src/m26/workflows/client-onboarding.js';
import {
  buildIriCommandDraftFromFirstSession,
  firstSessionCompletion,
  normalizeFirstSessionDraft,
  validateFirstSessionDraft,
} from '../src/m26/workflows/iri-first-session.js';
import {buildIriReportHtml} from '../src/m26/workflows/iri-report-document.js';
import {renderClientsRoute,renderIriRoute} from '../src/m26/modules/route-render.js';
import {createM26Transport} from '../src/m26/supabase-transport.js';

function validRaw(overrides={}){
  return {
    assessmentDate:'2026-07-27',birthDate:'1992-04-11',sexForNorms:'female',email:'cliente@example.com',phone:'+56 9 1111 2222',modality:'hibrido',trainingAddress:'Av. IBERFIT 123',weeklyFrequency:'3',sessionDurationMinutes:'60',primaryObjective:'Mejorar fuerza general y capacidad física.',
    trainingExperience:'Intermedia',availability:'Tres días por semana',screeningAccepted:'on',sleepScore:'7',stressScore:'4',energyScore:'8',
    weightKg:'64.2',heightCm:'166',bodyFatPercent:'27.4',leanMassKg:'46.6',bodyWaterPercent:'53',bodyCompositionMethod:'BIA',bodyCompositionDevice:'InBody 270',
    ankleLeft1:'8.1',ankleLeft2:'8.4',ankleLeft3:'8.3',ankleRight1:'7.1',ankleRight2:'7.3',ankleRight3:'7.2',posteriorLeft1:'24',posteriorLeft2:'25',posteriorLeft3:'24.5',posteriorRight1:'22',posteriorRight2:'22.5',posteriorRight3:'22.2',hipRotationResult:'Asimetría leve',squatDepth:'Paralela',squatHeels:'Apoyados',squatKnees:'Alineadas',
    chairStand30s:'18',chairHeightCm:'45',chairStandValid:'on',pushVariant:'standard',pushUps:'12',pushValid:'on',trxRowRepetitions:'15',trxHandleHeightCm:'110',trxHeelDistanceCm:'85',trxPosition:'Rodillas extendidas',trxValid:'on',frontPlankSeconds:'55',sidePlankLeftSeconds:'35',sidePlankRightSeconds:'32',coreQuality:'Adecuada',posteriorChainProtocol:'',posteriorNotPerformedReason:'No se dispone de banco compatible.',
    cardioProtocol:'ymca-3min-standard',stepHeightCm:'30.5',cadenceBpm:'96',cardioDurationSeconds:'180',restingHr:'72',stepFinalHr:'156',stepOneMinuteHr:'127',twoMinuteHr:'108',cardioRpe:'6',cardioValid:'on',
    diagnosisStrengths:'Buena tolerancia al esfuerzo\nControl general adecuado',diagnosisPriorities:'Mejorar tracción\nOptimizar movilidad de tobillo',coachInterpretation:'Perfil funcional equilibrado con oportunidades concretas de progresión.',trainingImplications:'Priorizar técnica, fuerza básica y una progresión aeróbica gradual.',initialPlan:'Plan inicial de cuatro semanas con fuerza, movilidad y trabajo aeróbico progresivo.',recommendedFrequency:'3 días por semana',reevaluationDate:'2026-08-24',reviewAccepted:'on',
    ...overrides,
  };
}

test('alta de cliente normaliza contrato y mantiene acceso desactivado',()=>{
  const input={name:'  María González  ',email:'MARIA@EXAMPLE.COM',phone:'+56 9 1234 5678',birthDate:'1992-04-11',sexForNorms:'female',modality:'hibrido',weeklyFrequency:'3',sessionDurationMinutes:'60',primaryObjective:'Ganar fuerza y mejorar su condición general.',trainingAddress:'Av. IBERFIT 123',commune:'Las Condes',equipment:'TRX, mancuernas'};
  const check=validateClientOnboardingDraft(input);assert.equal(check.ok,true);
  const payload=legacyClientDraftPayload(input);assert.equal(payload.email,'maria@example.com');assert.equal(payload.modality,'Híbrido');assert.equal(payload.profile.modality,'hibrido');assert.deepEqual(payload.profile.equipment,['TRX','mancuernas']);assert.equal(payload.accessEnabled,false);
});

test('primera sesión completa produce draft trazable para IRI existente',()=>{
  const draft=normalizeFirstSessionDraft(validRaw(),{id:'IRI-RC33',clientId:'CLIENT-RC33'},'CLIENT-RC33');
  const check=validateFirstSessionDraft(draft);assert.equal(check.ok,true,check.errors.join(','));assert.equal(firstSessionCompletion(draft).percent,100);assert.equal(draft.cardio.deltaOneMinute,29);assert.equal(draft.mobility.ankle.leftBest,8.4);
  const commandDraft=buildIriCommandDraftFromFirstSession(draft,{id:'IRI-RC33',clientId:'CLIENT-RC33',revision:2});
  assert.equal(commandDraft.pushUps,12);assert.equal(commandDraft.chairStand30s,18);assert.equal(commandDraft.firstSessionSchema,'iberfit-iri-first-session-v1');assert.equal(commandDraft.cardio.protocol,'ymca-3min-standard');
});

test('variantes adaptadas de empuje no se mezclan con el baremo estándar',()=>{
  const draft=normalizeFirstSessionDraft(validRaw({pushVariant:'incline',pushSupportHeightCm:'80'}),{id:'IRI-RC33'},'CLIENT-RC33');
  const commandDraft=buildIriCommandDraftFromFirstSession(draft,{id:'IRI-RC33'});assert.equal('pushUps' in commandDraft,false);assert.equal(commandDraft.strengthPatterns.push.variant,'incline');assert.equal(commandDraft.strengthPatterns.push.supportHeightCm,80);
});

test('informes Cliente y Coach usan A4, isotipo, marca de agua y páginas cerradas',()=>{
  const draft=normalizeFirstSessionDraft(validRaw(),{id:'IRI-RC33'},'CLIENT-RC33');
  const client=buildIriReportHtml({draft,variant:'client',clientName:'María González',coachName:'Carlos Ríos',logoUrl:'/public/isotipo-iberfit.png'});
  const coach=buildIriReportHtml({draft,variant:'coach',clientName:'María González',coachName:'Carlos Ríos',clientId:'CLIENT-RC33',logoUrl:'/public/isotipo-iberfit.png'});
  assert.equal((client.match(/class="pdf-page/g)||[]).length,7);assert.ok((coach.match(/class="pdf-page/g)||[]).length>=13);
  for(const html of [client,coach]){assert.match(html,/@page\{size:A4/);assert.match(html,/class="[^"]*watermark[^"]*"/);assert.match(html,/isotipo-iberfit\.png/);assert.match(html,/overflow:hidden/);assert.doesNotMatch(html,/IRI global[^<]*68|68\/100/i);}
  assert.match(client,/INFORME DE EVALUACIÓN (?:INICIAL|IRI)/);assert.match(client,/Completitud del proceso/);assert.doesNotMatch(client,/cliente@example\.com|\+56 9 1111 2222/);assert.match(coach,/Coach \/ Admin|USO INTERNO/);assert.match(coach,/Anexo íntegro de datos/);assert.match(coach,/cliente@example\.com/);assert.match(coach,/trainingHistory/);
});

test('rutas RC33 contienen alta y wizard completo sin handlers inline',()=>{
  const clients=renderClientsRoute({clients:[],selectedClientId:null,canCreate:true});
  assert.match(clients,/data-workflow-form="client-onboarding"/);assert.match(clients,/create-client-draft/);assert.doesNotMatch(clients,/on(?:click|submit)=/i);
  const iri=renderIriRoute({current:{id:'IRI-RC33'},currentSummary:null,profile:{birthDate:'1992-04-11',sexForNorms:'female',sexForNormsLabel:'Mujer',email:'cliente@example.com',phone:'+56 9',modality:'hibrido',modalityLabel:'Híbrido',trainingAddress:'Av. IBERFIT 123'},canEdit:true,history:[]});
  assert.equal((iri.match(/data-iri-step="/g)||[]).length,7);assert.match(iri,/generate-client-iri-report/);assert.match(iri,/generate-coach-iri-report/);assert.match(iri,/data-iri-timer-action="start"/);assert.doesNotMatch(iri,/on(?:click|submit)=/i);
});

test('transporte canary expone alta mediante RPC específico sin ampliar RPC canónicos',async()=>{
  const calls=[];const fetchImpl=async(url,options)=>{calls.push({url,options});return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({client_id:'CLIENT-RC33'})};};
  const transport=createM26Transport({enabled:true,canary:true,qaOnly:true,url:'https://pjhmrhejsoofmouedavw.supabase.co',projectRef:'pjhmrhejsoofmouedavw',publishableKey:'publishable-test',timeoutMs:1000,version:'26.0.0-canary.33'}, {fetchImpl});
  const result=await transport.createClientDraft('jwt-test',{name:'María'});assert.equal(result.client_id,'CLIENT-RC33');assert.match(calls[0].url,/\/rest\/v1\/rpc\/iberfit_create_client_draft$/);assert.deepEqual(JSON.parse(calls[0].options.body),{p_payload:{name:'María'}});
  await assert.rejects(()=>transport.preflight('jwt-test',{}),/M26_HTTP|M26/).catch(()=>{});
  const source=readFileSync(new URL('../src/m26/supabase-transport.js',import.meta.url),'utf8');assert.match(source,/CANONICAL_RPC/);assert.match(source,/M26_RPC_NOT_ALLOWED/);
});


test('alta remota exige identificador y persistencia visible antes de cerrar formulario',async()=>{
  let calls=0;
  const result={client_id:'CLIENT-RC36'};
  const payload={email:'qa.rc36@example.com'};
  const verified=await waitForCreatedClient({result,payload,delays:[0,0],waitFn:async()=>{},fetchSnapshot:async()=>{calls+=1;return {data:{clients:calls===1?[]:[{id:'CLIENT-RC36',name:'QA RC36',profile:{email:payload.email}}]}};}});
  assert.equal(calls,2);assert.equal(verified.client.id,'CLIENT-RC36');
  await assert.rejects(()=>waitForCreatedClient({result,payload,delays:[0],waitFn:async()=>{},fetchSnapshot:async()=>({data:{clients:[]}})}),/M26_CLIENT_CREATE_NOT_PERSISTED/);
});

test('transporte rechaza un HTTP 200 que no confirme cliente creado',async()=>{
  const fetchImpl=async()=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({ok:true,message:'aceptado'})});
  const transport=createM26Transport({enabled:true,canary:true,qaOnly:true,url:'https://pjhmrhejsoofmouedavw.supabase.co',projectRef:'pjhmrhejsoofmouedavw',publishableKey:'publishable-test',timeoutMs:1000,version:'26.0.0-canary.36'},{fetchImpl});
  await assert.rejects(()=>transport.createClientDraft('jwt-test',{name:'María'}),/M26_CLIENT_CREATE_INVALID_RESPONSE/);
});
