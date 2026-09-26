import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveM26Route} from '../src/m26/shell/route-guard.js';
import {
  adminMediaReviewEnabled,
  filterAdminMediaReviewNavigation,
  initialAreaFromPath,
  renderAdminMediaReviewRoute,
} from '../src/m26/admin/media-review.js';
import {M26_ADMIN_COMMAND_TYPES} from '../src/m26/admin/command-catalog.js';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
function state({role='admin',enabled=true}={}){
  return {
    identity:{id:'11111111-1111-4111-8111-111111111111',role},
    hydration:{status:'ready'},
    selectedClientId:null,
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

test('flag off removes Media Review navigation and direct path maps only to the canonical area',()=>{
  const navigation={primary:[],context:[{key:'admin-operaciones'},{key:'admin-media-review'}],tools:[],mobile:[]};
  assert.equal(filterAdminMediaReviewNavigation(navigation,state({enabled:false})).context.some((x)=>x.key==='admin-media-review'),false);
  assert.equal(filterAdminMediaReviewNavigation(navigation,state({enabled:true})).context.some((x)=>x.key==='admin-media-review'),true);
  assert.equal(initialAreaFromPath('/admin/media-review'),'admin-media-review');
  assert.equal(initialAreaFromPath('/admin/media-review/'),'admin-media-review');
  assert.equal(initialAreaFromPath('/admin/anything-else'),null);
});

test('Admin Media Review UI centers START/FINAL and exposes only explicit human actions',()=>{
  const html=renderAdminMediaReviewRoute();
  assert.match(html,/Media Review/u);
  assert.match(html,/START/u);
  assert.match(html,/FINAL/u);
  assert.match(html,/Aprobar/u);
  assert.doesNotMatch(html,/publicaci[oó]n autom[aá]tica/iu);
  assert.ok(M26_ADMIN_COMMAND_TYPES.includes('ADMIN_MEDIA_REVIEW_APROBAR_PUBLICAR'));
  assert.ok(M26_ADMIN_COMMAND_TYPES.includes('ADMIN_MEDIA_REVIEW_RECHAZAR'));
  assert.ok(M26_ADMIN_COMMAND_TYPES.includes('ADMIN_MEDIA_REVIEW_REGENERAR'));
});

test('backend contract keeps review evidence private, audited and service-role only',async()=>{
  const [migration,edge]=await Promise.all([
    read('supabase/migrations/20260926193000_admin_media_review_v1.sql'),
    read('supabase/functions/iberfit-admin-media-review-v1/index.ts'),
  ]);
  assert.match(migration,/iberfit-exercise-media-review/u);
  assert.match(migration,/public\.exercise_media_review_events/u);
  assert.match(migration,/unique\(action,operation_id\)/u);
  assert.match(migration,/enable row level security/u);
  assert.match(migration,/grant execute[\s\S]+service_role/u);
  assert.match(migration,/status='queued'/u);
  assert.match(migration,/parent_job_id/u);
  assert.match(edge,/roles\.includes\("admin"\)/u);
  assert.match(edge,/admin_media_review_enabled!==true/u);
  assert.match(edge,/createSignedUrl/u);
  assert.match(edge,/iberfit_admin_media_review_claim_v1/u);
  assert.match(edge,/iberfit_admin_media_review_publish_result_v1/u);
});

test('factory stages review pixels privately and regeneration reuses the existing factory',async()=>{
  const [factory,workflow,dispatcher]=await Promise.all([
    read('supabase/functions/iberfit-exercise-media-auto-factory-v1/index.ts'),
    read('.github/workflows/exercise-media-auto-factory.yml'),
    read('.github/workflows/exercise-media-human-regeneration.yml'),
  ]);
  assert.match(factory,/BASE_MIN_CONFIDENCE=0\.97/u);
  assert.match(factory,/INFERRED_ANATOMY_MIN_CONFIDENCE=0\.985/u);
  assert.match(factory,/stage_review/u);
  assert.match(factory,/iberfit-exercise-media-review/u);
  assert.match(factory,/status===?"queued"|status==="queued"/u);
  assert.match(workflow,/stage_review/u);
  assert.match(dispatcher,/human_regeneration/u);
  assert.match(dispatcher,/exercise-media-auto-factory\.yml\/dispatches/u);
  assert.doesNotMatch(workflow,/action=publish/u);
});

test('publication remains human gated while allowing only the internal Admin review broker path',async()=>{
  const publisher=await read('supabase/functions/iberfit-exercise-media-publisher/index.ts');
  assert.match(publisher,/human_approved !== true|human_approved!==true/u);
  assert.match(publisher,/human_owner_approval/u);
  assert.match(publisher,/visual/u);
  assert.match(publisher,/biomechanics/u);
  assert.match(publisher,/admin-media-review-v1/u);
  assert.match(publisher,/SUPABASE_SERVICE_ROLE_KEY/u);
  assert.match(publisher,/IBERFIT_PUBLISHER_/u);
});
