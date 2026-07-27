import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const checks=[];
const check=(name,ok,details='')=>checks.push({name,ok:Boolean(ok),details});
let branch=String(process.env.CF_PAGES_BRANCH||'').trim();
if(!branch){try{branch=execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim();}catch{branch='';}}

const pkg=JSON.parse(read('package.json'));
const renderer=read('src/m26/modules/route-render.js');
const controller=read('src/m26/app/workflow-controller.js');
const application=read('src/m26/app/application.js');
const transport=read('src/m26/supabase-transport.js');
const onboarding=read('src/m26/workflows/client-onboarding.js');
const firstSession=read('src/m26/workflows/iri-first-session.js');
const report=read('src/m26/workflows/iri-report-document.js');
const workflowIndex=read('src/m26/workflows/index.js');
const viewModel=read('src/m26/modules/route-view-model.js');
const css=read('src/m26/shell/shell.css');
const runtime=read('public/m26/runtime-config.js');
const commandCatalog=read('src/m26/command-catalog.js');

check('Rama canary/rc33',branch==='canary/rc33',branch||'sin rama');
for(const [key,value] of Object.entries({
  'test:m26:rc33':'node --test tests/m26_rc33_first_session_iri.test.mjs',
  'audit:rc33':'node scripts/m26_rc33_canary_gate.mjs',
  'build:rc33:canary':'npm run build:rc29 && npm run configure:rc33:canary',
  'configure:rc33:canary':'node scripts/generate_rc33_runtime_config.mjs',
  'verify:build:rc33':'node scripts/verify_rc33_canary_candidate.mjs',
  'validate:rc33:ci':'node scripts/run_rc33_ci_validation.mjs',
}))check(`Script ${key}`,pkg.scripts[key]===value,pkg.scripts[key]||'ausente');

for(const file of [
  'src/m26/workflows/client-onboarding.js',
  'src/m26/workflows/iri-first-session.js',
  'src/m26/workflows/iri-report-document.js',
  'tests/m26_rc33_first_session_iri.test.mjs',
  'scripts/generate_rc33_runtime_config.mjs',
  'scripts/verify_rc33_canary_candidate.mjs',
  'docs/RC33_FIRST_SESSION_IRI.md',
])check(`Existe ${file}`,exists(file));

check('Alta de cliente usa contrato aislado y acceso desactivado',
  /legacyClientDraftPayload/.test(onboarding)&&/accessEnabled:\s*false/.test(onboarding)&&/inviteClient:\s*false/.test(onboarding)&&/onboardingVersion:\s*['"]m26-rc33['"]/.test(onboarding));
check('Alta exige identidad contacto servicio y objetivo',
  ['name','email','birthDate','sexForNorms','modality','primaryObjective'].every((token)=>onboarding.includes(token))&&/trainingAddress/.test(onboarding));
check('Transporte limita alta a canary y RPC específico',
  /createClientDraft/.test(transport)&&/iberfit_create_client_draft/.test(transport)&&/CLIENT_CREATE_CANARY_ONLY/.test(transport)&&/p_payload/.test(transport));
check('RPC de alta no amplía catálogo canónico',
  !/CLIENTE_CREAR/.test(commandCatalog)&&!/iberfit_create_client_draft/.test(commandCatalog));
check('Aplicación inyecta alta y repositorio de borradores',
  /createClientDraft/.test(application)&&/draftRepository/.test(application)&&/client-created/.test(application));
check('Clientes presenta alta explícita sin handlers inline',
  /data-workflow-form="client-onboarding"/.test(renderer)&&/create-client-draft/.test(renderer)&&!/on(?:click|submit)\s*=/.test(renderer));
check('Expediente recupera perfil desde IRI sin romper canónico',
  /profileFromIri/.test(viewModel)&&/mergeProfileFallback/.test(viewModel)&&/personProfile/.test(viewModel));

check('Primera sesión declara siete etapas canónicas',
  /perfil/.test(firstSession)&&/entrevista/.test(firstSession)&&/composicion/.test(firstSession)&&/movilidad/.test(firstSession)&&/fuerza/.test(firstSession)&&/cardio/.test(firstSession)&&/revision/.test(firstSession)&&/iberfit-iri-first-session-v1/.test(firstSession));
check('Wizard renderiza siete etapas y navegación persistente',
  (renderer.match(/steps\.push\(iriStep\(/g)||[]).length===7&&/save-iri-draft/.test(renderer)&&/iri-prev/.test(renderer)&&/iri-next/.test(renderer));
check('Cada etapa admite no realizado con motivo',
  /bodyCompositionSkipped/.test(renderer)&&/mobilitySkipped/.test(renderer)&&/strengthSkipped/.test(renderer)&&/cardioSkipped/.test(renderer)&&/SkipReason/.test(renderer));
check('Movilidad conserva cm bilateral y observación estructurada',
  /trialInputs\('ankleLeft'/.test(renderer)&&/trialInputs\('ankleRight'/.test(renderer)&&/trialInputs\('posteriorLeft'/.test(renderer)&&/trialInputs\('posteriorRight'/.test(renderer)&&/hipRotationResult/.test(renderer)&&/squatDepth/.test(renderer));
check('Fuerza separa variantes y registra configuración TRX',
  /pushVariant/.test(renderer)&&/pushSupportHeightCm/.test(renderer)&&/trxHandleHeightCm/.test(renderer)&&/trxHeelDistanceCm/.test(renderer)&&/posteriorChainProtocol/.test(renderer));
check('Cardio usa YMCA 3 min y variante 20 cm',
  /ymca-3min-standard/.test(renderer)&&/iberfit-3min-adapted/.test(renderer)&&/30\.5/.test(renderer)&&/20/.test(renderer)&&/96/.test(renderer));
check('Temporizador está limitado y no usa handlers inline',
  /data-iri-timer-action="start"/.test(renderer)&&/180/.test(controller)&&!/on(?:click|submit|change)\s*=/.test(renderer));
check('Borrador IRI se aísla y restaura por cliente',
  /iri-first-session/.test(controller)&&/draftRepository/.test(controller)&&/queueIriSave/.test(controller)&&/initializeIriForm/.test(controller)&&/draftRepository\?\.load/.test(controller));
check('Confirmación IRI exige entidad remota',
  /IRI_REMOTE_ENTITY_REQUIRED/.test(firstSession)&&/buildIriCommand/.test(firstSession)&&/currentIriRecord/.test(controller));
check('Empuje adaptado no se mezcla con baremo estándar',
  /push\.variant===['"]standard['"]/.test(firstSession)&&/standardPush\?\{pushUps:/.test(firstSession));
check('Comando conserva trazabilidad de primera sesión',
  /firstSessionSchema/.test(firstSession)&&/assessmentDate/.test(firstSession)&&/personProfile/.test(firstSession)&&/cardio/.test(firstSession));

check('Informe ofrece variantes Cliente y Coach Admin',
  /variant===['"]client['"]/.test(report)&&/Coach \/ Admin/.test(report)&&/INFORME DE EVALUACIÓN INICIAL/.test(report));
check('Informe fija A4 y previene desbordamiento',
  /@page\{size:A4/.test(report)&&/overflow:hidden/.test(report)&&/overflow-wrap:anywhere/.test(report)&&/table-layout:fixed/.test(report)&&/raw-data/.test(report));
check('Informe usa isotipo integrado en portada, sello interior y marca de agua',
  /isotipo-iberfit\.png/.test(report)&&/class="watermark"/.test(report)&&/class="cover-mark"/.test(report)&&/class="brand-seal"/.test(report));
check('Informe Cliente tiene siete páginas y Coach trece más anexos',
  /function clientPages/.test(report)&&/function coachPages/.test(report)&&/pages.length!==7/.test(report)&&/pages.length<13/.test(report)&&/rawDataPages/.test(report));
check('Informe incorpora gráficas funcionales',
  /radarChart/.test(report)&&/heartRateChart/.test(report)&&/ratioBar/.test(report)&&/compositionDonut/.test(report)&&/symmetryRow/.test(report));
check('Informe no inventa puntuación global universal',
  !/68\s*\/\s*100/.test(report)&&/no es una puntuación normativa global|sin puntuación global|perfil por dominios/i.test(report));
check('Generación requiere revisión Coach y abre impresión protegida',
  /reviewAccepted/.test(firstSession)&&/openIriReportPrint/.test(controller)&&/URL\.createObjectURL/.test(report)&&/print\(\)/.test(report));
check('Workflows RC33 exportados desde índice',
  /client-onboarding/.test(workflowIndex)&&/iri-first-session/.test(workflowIndex)&&/iri-report-document/.test(workflowIndex));

check('CSS RC33 protege anchura, texto y acciones',
  /RC33/.test(css)&&/min-width:\s*0/.test(css)&&/overflow-wrap:\s*anywhere/.test(css)&&/max-width:\s*100%/.test(css)&&/position:\s*sticky/.test(css));
check('Controles RC33 mantienen mínimo táctil',
  /min-height:\s*(?:44px|2\.75rem)/.test(css));
check('Runtime versionado permanece fail-closed',
  /enabled:\s*false/.test(runtime)&&/publishableKey:\s*''/.test(runtime)&&/qaOnly:\s*true/.test(runtime));
check('Documentación declara límites remotos y no diagnóstico médico',
  exists('docs/RC33_FIRST_SESSION_IRI.md')&&/gate remoto/i.test(read('docs/RC33_FIRST_SESSION_IRI.md'))&&/no sustituye.*diagnóstico médico/i.test(read('docs/RC33_FIRST_SESSION_IRI.md')));

const rc33Roots=[
  'src/m26/workflows/client-onboarding.js','src/m26/workflows/iri-first-session.js','src/m26/workflows/iri-report-document.js',
  'tests/m26_rc33_first_session_iri.test.mjs','scripts/generate_rc33_runtime_config.mjs','scripts/verify_rc33_canary_candidate.mjs','scripts/m26_rc33_canary_gate.mjs','docs/RC33_FIRST_SESSION_IRI.md',
];
const serviceRoleHits=rc33Roots.filter((file)=>exists(file)&&/service[_-]?role/iu.test(read(file))&&!file.includes('runtime_config')&&!file.includes('gate')&&!file.endsWith('.md'));
check('RC33 no incorpora credenciales service_role',serviceRoleHits.length===0,serviceRoleHits.join(', '));
const prodDomainHits=rc33Roots.filter((file)=>exists(file)&&/(?:https?:\/\/)?(?:app\.|coach\.)?iberfit\.cl/iu.test(read(file))&&!/m26-canary\.iberfit\.cl/iu.test(read(file)));
check('Archivos RC33 no apuntan a producción',prodDomainHits.length===0,prodDomainHits.join(', '));

const failed=checks.filter((item)=>!item.ok);
const output={
  release:'IBERFIT_M26_CANARY_RC33',version:'26.0.0-canary.33',generatedAt:new Date().toISOString(),branch,
  baseCommit:'7e20bd5087d6acdb07d691bb029b4c44be3bc7f6',backendContract:'RC30',
  passed:checks.length-failed.length,total:checks.length,failed:failed.length,checks,ok:failed.length===0,
  productionModified:false,productionDeployed:false,remoteMutationGateExecuted:false,
};
fs.mkdirSync(path.join(root,'recovery'),{recursive:true});
fs.writeFileSync(path.join(root,'recovery','RC33_CANARY_GATE_REPORT.json'),`${JSON.stringify(output,null,2)}\n`);
console.log(JSON.stringify(output,null,2));
if(!output.ok)process.exit(1);
