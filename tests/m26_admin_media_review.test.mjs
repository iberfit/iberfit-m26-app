import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveM26Route} from '../src/m26/shell/route-guard.js';
import {shellRouteRequest} from '../src/m26/shell/shell-view-model.js';
import {enhanceAdminShellMarkup} from '../src/m26/admin/shell-enhancer.js';
import {
  adminMediaReviewEnabled,
  filterAdminMediaReviewNavigation,
  initialAreaFromPath,
  renderAdminMediaReviewRoute,
  __mediaReviewInternals,
} from '../src/m26/admin/media-review.js';
import {M26_ADMIN_COMMAND_TYPES} from '../src/m26/admin/command-catalog.js';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
function state({role='admin',enabled=true,activeArea='admin-inicio'}={}){
  return {
    identity:{id:'11111111-1111-4111-8111-111111111111',role},
    hydration:{status:'ready'},
    selectedClientId:null,
    activeArea,
    collections:{clients:[]},
    admin:{available:true,organization:{id:'00000000-0000-4000-8000-000000000140',settings:{admin_media_review_enabled:enabled}}},
  };
}

test('Media Review is fail closed behind the Admin feature flag',()=>{
  const enabled=state({enabled:true});
  const disabled=state({enabled:false});
  assert.equal(adminMediaReviewEnabled(enabled),true);
  assert.equal(adminMediaReviewEnabled(disabled),false);
  assert.deepEqual(resolveM26Route(enabled,'admin-media-review'),{area:'admin-media-review',allowed:true,reason:null,contextClientId:null});
  assert.equal(resolveM26Route(disabled,'admin-media-review').allowed,false);
  assert.equal(resolveM26Route(disabled,'admin-media-review').reason,'M26_ADMIN_MEDIA_REVIEW_DISABLED');
  assert.equal(resolveM26Route(state({role:'coach',enabled:true}),'admin-media-review').allowed,false);
});

test('flag off removes navigation while the canonical path only resolves for an Admin default route',()=>{
  const navigation={primary:[],context:[{key:'admin-operaciones'},{key:'admin-media-review'}],tools:[],mobile:[]};
  assert.equal(filterAdminMediaReviewNavigation(navigation,state({enabled:false})).context.some((x)=>x.key==='admin-media-review'),false);
  assert.equal(filterAdminMediaReviewNavigation(navigation,state({enabled:true})).context.some((x)=>x.key==='admin-media-review'),true);
  assert.equal(initialAreaFromPath('/admin/media-review'),'admin-media-review');
  assert.equal(initialAreaFromPath('/admin/media-review/'),'admin-media-review');
  assert.equal(initialAreaFromPath('/admin/anything-else'),null);
  assert.equal(shellRouteRequest(state({enabled:true,activeArea:'admin-inicio'}),{pathname:'/admin/media-review'}),'admin-media-review');
  assert.equal(shellRouteRequest(state({enabled:true,activeArea:'admin-operaciones'}),{pathname:'/admin/media-review'}),'admin-operaciones');
});

test('Admin shell renders Media Control Center with full inventory and explicit human actions',()=>{
  const route=renderAdminMediaReviewRoute();
  assert.match(route,/Centro de Media/u);
  assert.match(route,/data-media-control-summary/u);
  assert.match(route,/data-media-inventory-search/u);
  assert.match(route,/data-media-inventory-filter/u);
  assert.match(route,/data-media-inventory-list/u);
  assert.doesNotMatch(route,/publicaci[oó]n autom[aá]tica/iu);
  const candidateData={
    jobId:'11111111-1111-4111-8111-111111111111',exerciseId:'sentadilla-al-aire',exerciseName:'Sentadilla al aire',
    reviewState:'awaiting_human_approval',attempts:1,sha256:'a'.repeat(64),confidence:{biomechanics:.99,visual:.99},provenance:{},timestamps:{},
    startUrl:'https://example.invalid/start.webp',finalUrl:'https://example.invalid/final.webp',primaryMuscles:['cuádriceps'],
  };
  const candidate=__mediaReviewInternals.candidateMarkup(candidateData);
  assert.match(candidate,/Aprobar y publicar/u);
  assert.match(candidate,/Rechazar/u);
  assert.match(candidate,/Regenerar/u);
  const queued=__mediaReviewInternals.candidateMarkup({...candidateData,reviewState:'publish_requested'});
  assert.match(queued,/Publicación en cola/u);
  assert.match(queued,/disabled aria-disabled="true"/u);
  const inventory=__mediaReviewInternals.inventoryMarkup({
    exerciseId:'IBF-TEST',
    exerciseName:'Sentadilla de prueba',
    pattern:'sentadilla',
    equipment:'mancuerna',
    state:'approved',
    publicUrl:'https://example.invalid/approved.webp',
    job:null,
  });
  assert.match(inventory,/Aprobada y publicada/u);
  assert.match(inventory,/m26-media-inventory-thumb/u);
  const summary=__mediaReviewInternals.summaryMarkup({approvedPublished:15,pendingCatalog:352,awaitingHumanReview:2,failed:3,blocked:4});
  assert.match(summary,/>15</u);
  assert.match(summary,/>352</u);
  assert.ok(M26_ADMIN_COMMAND_TYPES.includes('ADMIN_MEDIA_REVIEW_APROBAR_PUBLICAR'));
  assert.ok(M26_ADMIN_COMMAND_TYPES.includes('ADMIN_MEDIA_REVIEW_RECHAZAR'));
  assert.ok(M26_ADMIN_COMMAND_TYPES.includes('ADMIN_MEDIA_REVIEW_REGENERAR'));
  const shell=enhanceAdminShellMarkup('<div class="m26-shell"><main id="m26-main">Permiso insuficiente</main><p class="m26-settings-hint"></p></div>',{mode:'authenticated',identity:{role:'admin'},activeArea:'admin-media-review',experiencePreferences:{}});
  assert.match(shell,/data-admin-media-review-route/u);
  assert.doesNotMatch(shell,/Permiso insuficiente/u);
});

test('backend contract keeps review evidence private, audited, idempotent and service-role only',async()=>{
  const [migration,edge]=await Promise.all([
    read('supabase/migrations/20260926193000_admin_media_review_v1.sql'),
    read('supabase/functions/iberfit-admin-media-review-v1/index.ts'),
  ]);
  assert.match(migration,/iberfit-exercise-media-review/u);
  assert.match(migration,/public\.exercise_media_review_events/u);
  assert.match(migration,/unique\(action,operation_id\)/u);
  assert.match(migration,/enable row level security/u);
  assert.match(migration,/grant execute[\s\S]+service_role/u);
  assert.match(migration,/insert into public\.exercise_media_jobs[\s\S]*v_job\.exercise_id,'queued',0/u);
  assert.match(migration,/parent_job_id/u);
  assert.match(migration,/iberfit_admin_media_review_publish_claim_v1/u);
  assert.match(migration,/'state','publish_requested'/u);
  assert.match(migration,/for update skip locked/u);
  assert.doesNotMatch(migration,/p_actor\s*<>\s*auth\.uid\(\)/u);
  assert.match(edge,/roles\.includes\("admin"\)/u);
  assert.match(edge,/admin_media_review_enabled!==true/u);
  assert.match(edge,/createSignedUrl/u);
  assert.match(edge,/listMediaOverview/u);
  assert.match(edge,/approvedPublicUrl/u);
  assert.match(edge,/inventoryState/u);
  assert.match(edge,/approvedPublished/u);
  assert.match(edge,/pendingCatalog/u);
  assert.match(edge,/awaitingHumanReview/u);
  assert.match(edge,/iberfit_admin_media_review_claim_v1/u);
  assert.doesNotMatch(edge,/iberfit_admin_media_review_publish_result_v1/u);
  assert.doesNotMatch(edge,/PUBLISHER_PATH/u);
});

test('Admin Media Review Edge binds Canary to QA and live Admin origins to PROD',async()=>{
  const edge=await read('supabase/functions/iberfit-admin-media-review-v1/index.ts');
  assert.match(edge,/const PROD_REF="pjhmrhejsoofmouedavw"/u);
  assert.match(edge,/const QA_REF="gjztkdwfmunnzhtvxrsu"/u);
  assert.match(edge,/\[PROD_REF,new Set\(\["https:\/\/app\.iberfit\.cl","https:\/\/coach\.iberfit\.cl"\]\)\]/u);
  assert.match(edge,/\[QA_REF,new Set\(\["https:\/\/m26-canary\.iberfit\.cl"\]\)\]/u);
  assert.match(edge,/ENV_ORIGINS\.get\(ref\)\?\.has\(origin\)!==true/u);
  assert.match(edge,/IBERFIT_MEDIA_REVIEW_ENV_ORIGIN_MISMATCH/u);
  assert.doesNotMatch(edge,/PROD_ENV_INVALID/u);
});

test('factory stages review pixels privately and regeneration reuses the existing factory',async()=>{
  const [factory,workflow,regen]=await Promise.all([
    read('supabase/functions/iberfit-exercise-media-auto-factory-v1/index.ts'),
    read('.github/workflows/exercise-media-auto-factory.yml'),
    read('.github/workflows/exercise-media-human-regeneration.yml'),
  ]);
  assert.match(factory,/BASE_MIN_CONFIDENCE=0\.97/u);
  assert.match(factory,/INFERRED_ANATOMY_MIN_CONFIDENCE=0\.985/u);
  assert.match(factory,/stage_review/u);
  assert.match(factory,/iberfit-exercise-media-review/u);
  assert.match(factory,/status===?"queued"|status==="queued"/u);
  assert.match(workflow,/Stage review pixels privately/u);
  assert.match(workflow,/-F action=stage_review/u);
  assert.match(workflow,/staging:\$staging\[0\]\.staging/u);
  assert.doesNotMatch(workflow,/action=publish/u);
  assert.match(regen,/human_regeneration/u);
  assert.match(regen,/exercise-media-auto-factory\.yml\/dispatches/u);
  assert.match(factory,/EXPECTED_REGEN_WORKFLOW_REF/u);
  assert.match(factory,/action!=="peek"\|\|mode!=="human_regeneration"/u);
  assert.match(factory,/IBERFIT_AUTO_FACTORY_REGEN_WORKFLOW_FORBIDDEN/u);
});

test('publication stays human gated and only the canonical GitHub OIDC workflow can reach the final publisher',async()=>{
  const [publisher,adminEdge,migration,broker,workflow]=await Promise.all([
    read('supabase/functions/iberfit-exercise-media-publisher/index.ts'),
    read('supabase/functions/iberfit-admin-media-review-v1/index.ts'),
    read('supabase/migrations/20260926193000_admin_media_review_v1.sql'),
    read('supabase/functions/iberfit-exercise-media-review-publish-broker-v1/index.ts'),
    read('.github/workflows/exercise-media-publish-approved.yml'),
  ]);
  assert.match(publisher,/human_approved !== true|human_approved!==true/u);
  assert.match(publisher,/human_owner_approval/u);
  assert.match(publisher,/scopes\.includes\("visual"\)/u);
  assert.match(publisher,/scopes\.includes\("biomechanics"\)/u);
  assert.match(publisher,/AUDIENCE = "iberfit-exercise-media-prod"/u);
  assert.match(publisher,/exercise-media-publish-approved\.yml@refs\/heads\/canary\/rc74-4/u);
  assert.match(publisher,/jwtVerify/u);
  assert.match(publisher,/IBERFIT_PUBLISHER_OIDC_REQUIRED/u);
  assert.doesNotMatch(publisher,/x-iberfit-internal-publisher/u);
  assert.doesNotMatch(adminEdge,/\/functions\/v1\/iberfit-exercise-media-publisher/u);
  assert.doesNotMatch(adminEdge,/x-iberfit-internal-publisher/u);
  assert.match(adminEdge,/publicationQueued:true/u);
  assert.match(migration,/'state','publish_requested'/u);
  assert.match(migration,/iberfit_admin_media_review_publish_claim_v1/u);
  assert.match(broker,/AUDIENCE="iberfit-exercise-media-prod"/u);
  assert.match(broker,/exercise-media-publish-approved\.yml@refs\/heads\/canary\/rc74-4/u);
  assert.match(broker,/jwtVerify/u);
  assert.match(broker,/iberfit_admin_media_review_publish_claim_v1/u);
  assert.match(broker,/Authorization:`Bearer \$\{token\}`/u);
  assert.match(broker,/iberfit_admin_media_review_publish_result_v1/u);
  assert.match(workflow,/review_queue/u);
  assert.match(workflow,/iberfit-exercise-media-review-publish-broker-v1/u);
  assert.match(workflow,/PUBLISH_APPROVED_MEDIA_PROD/u);
});

test('Media Control Center styling stays responsive, touch-safe and never crops exercise imagery',async()=>{
  const css=await read('src/m26/admin/media-review.css');
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/u);
  assert.match(css,/m26-media-control-summary/u);
  assert.match(css,/m26-media-inventory-list/u);
  assert.match(css,/m26-media-inventory-thumb/u);
  assert.match(css,/object-fit:contain/u);
  assert.doesNotMatch(css,/m26-media-review-phase img[^}]*object-fit:cover/u);
  assert.match(css,/@media\(max-width:680px\)/u);
  assert.match(css,/min-height:44px/u);
  assert.match(css,/focus-visible/u);
  assert.match(css,/safe-area-inset-bottom/u);
});