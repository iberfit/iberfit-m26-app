import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createExerciseMediaTechnicalAnalytics,
  mediaLoadLatencyBucket,
  MEDIA_TECHNICAL_ANALYTICS_SCHEMA_VERSION,
} from '../src/m26/library/exercise-media-observability.js';
import {
  createExerciseMediaBundle,
  resolveExerciseMediaExperience,
  validateExerciseAssetProvenance,
} from '../src/m26/library/exercise-media.js';
import {
  EXERCISE_VIDEO_PLAYER_SCHEMA_VERSION,
  NATIVE_EXERCISE_VIDEO_POLICY,
  renderNativeExerciseVideo,
  __exerciseVideoPlayerInternals,
} from '../src/m26/library/exercise-video-player.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const json=(path)=>JSON.parse(read(path));
const rich=json('public/iberfit/exercises/iberfit-exercise-media-v2.json');
const repdb=json('public/vendor/repdb/iberfit-canonical-media-map-v1.json');
const sample=repdb.items.find((item)=>item.client_visible&&item.image_paths?.length);
assert.ok(sample);

function provenance(overrides={}){
  return {
    rights_basis:'iberfit_owned',
    source_ref:'IBERFIT-RC63-TEST-ASSET',
    license_label:'IBERFIT owned',
    reviewed_at:'2026-08-17T00:00:00.000Z',
    ...overrides,
  };
}

function item(overrides={}){
  const id=sample.iberfit_id;
  return {
    exercise_id:id,
    name_es:'Ejercicio técnico',
    review_status:'approved',
    published:true,
    coach_visible:true,
    client_visible:true,
    asset_provenance:provenance(),
    technical_video:{
      src:`/public/iberfit/exercises/video/${id}/technical.mp4`,
      poster:`/public/iberfit/exercises/images/${id}/main.webp`,
      captions:[{
        src:`/public/iberfit/exercises/captions/${id}/es.vtt`,
        srclang:'es',
        label:'Español',
        default:true,
      }],
    },
    cues:['Controla el movimiento'],
    ...overrides,
  };
}

function map(items){
  return {...rich,items,summary:{approved:items.length,published:items.length,video:items.length,pending:0}};
}

test('RC63.2 technical analytics is bounded memory-only and minimized',()=>{
  assert.equal(MEDIA_TECHNICAL_ANALYTICS_SCHEMA_VERSION,'iberfit.media-technical-analytics.v1');
  const analytics=createExerciseMediaTechnicalAnalytics({limit:10});
  for(let index=0;index<14;index++){
    analytics.record({
      eventType:'ready',
      state:'ready',
      network:'online',
      latencyBucket:'lt_500ms',
      userId:'secret-user',
      exerciseId:'secret-exercise',
      url:'https://example.com/secret.mp4',
    });
  }
  const snapshot=analytics.snapshot();
  assert.equal(snapshot.storage,'memory-only');
  assert.equal(snapshot.count,10);
  assert.equal(snapshot.events[0].sequence,5);
  assert.deepEqual(Object.keys(snapshot.events[0]).sort(),[
    'assetKind','errorClass','eventType','latencyBucket','network','schemaVersion','sequence','state',
  ]);
  const serialized=JSON.stringify(snapshot);
  assert.doesNotMatch(serialized,/secret-user|secret-exercise|example\.com/iu);
});

test('RC63.2 analytics rejects unknown events and buckets load latency coarsely',()=>{
  const analytics=createExerciseMediaTechnicalAnalytics();
  assert.equal(analytics.record({eventType:'user_opened_client_profile'}),null);
  assert.equal(mediaLoadLatencyBucket(-1),'none');
  assert.equal(mediaLoadLatencyBucket(100),'lt_500ms');
  assert.equal(mediaLoadLatencyBucket(800),'500_1499ms');
  assert.equal(mediaLoadLatencyBucket(2000),'1500_4999ms');
  assert.equal(mediaLoadLatencyBucket(9000),'gte_5000ms');
});

test('RC63.2 rich-media manifest requires auditable rights provenance',()=>{
  assert.equal(rich.policy.assetProvenanceRequired,true);
  assert.equal(rich.policy.unknownRightsBasisAllowed,false);
  assert.deepEqual(rich.policy.allowedRightsBasis,[
    'iberfit_owned','commissioned','licensed','public_domain',
  ]);
  const valid=validateExerciseAssetProvenance(provenance());
  assert.equal(valid.rightsBasis,'iberfit_owned');
  assert.equal(valid.licenseLabel,'IBERFIT owned');
});

test('RC63.2 unknown or incomplete rights provenance fails closed',()=>{
  for(const candidate of [
    null,
    provenance({rights_basis:'unknown'}),
    provenance({source_ref:''}),
    provenance({license_label:''}),
    provenance({reviewed_at:'not-a-date'}),
  ]){
    assert.throws(()=>validateExerciseAssetProvenance(candidate),/M26_IBERFIT_ASSET_PROVENANCE_INVALID/u);
  }
  assert.throws(
    ()=>createExerciseMediaBundle({iberfitRich:map([item({asset_provenance:null})])}),
    /M26_IBERFIT_ASSET_PROVENANCE_INVALID/u
  );
});

test('RC63.2 approved experience exposes license provenance without weakening media gates',()=>{
  const experience=resolveExerciseMediaExperience(
    createExerciseMediaBundle({iberfitRich:map([item()])}),
    sample.iberfit_id,
    {role:'client'}
  );
  assert.equal(experience.provenance.provider,'IBERFIT');
  assert.equal(experience.provenance.rightsBasis,'iberfit_owned');
  assert.equal(experience.provenance.licenseLabel,'IBERFIT owned');
  assert.equal(experience.provenance.reviewStatus,'approved');
});

test('RC63.2 player renders explicit state retry speed PiP provenance and captions',()=>{
  assert.equal(EXERCISE_VIDEO_PLAYER_SCHEMA_VERSION,'iberfit.exercise-video-player.v2');
  assert.equal(NATIVE_EXERCISE_VIDEO_POLICY.autoplay,false);
  assert.equal(NATIVE_EXERCISE_VIDEO_POLICY.preload,'none');
  assert.equal(NATIVE_EXERCISE_VIDEO_POLICY.playbackRate,'explicit-cycle');
  assert.equal(NATIVE_EXERCISE_VIDEO_POLICY.pictureInPicture,'explicit-when-supported');
  assert.equal(NATIVE_EXERCISE_VIDEO_POLICY.analytics,'memory-only-minimized');

  const experience=resolveExerciseMediaExperience(
    createExerciseMediaBundle({iberfitRich:map([item()])}),
    sample.iberfit_id,
    {role:'client'}
  );
  const html=renderNativeExerciseVideo({
    video:experience.video,
    title:experience.title,
    alt:experience.alt,
    provenance:experience.provenance,
  });
  assert.match(html,/data-video-state="idle"/u);
  assert.match(html,/data-exercise-video-status/u);
  assert.match(html,/data-exercise-video-retry/u);
  assert.match(html,/data-exercise-video-speed/u);
  assert.match(html,/data-exercise-video-pip hidden/u);
  assert.match(html,/data-exercise-media-provenance/u);
  assert.match(html,/<track kind="captions"/u);
  assert.doesNotMatch(html,/\sautoplay(?:\s|>|=)/u);
});

test('RC63.2 native controller defines deterministic speed and media-state transitions',()=>{
  const internals=__exerciseVideoPlayerInternals;
  assert.equal(internals.nextPlaybackRate(1),1.25);
  assert.equal(internals.nextPlaybackRate(1.25),1.5);
  assert.equal(internals.nextPlaybackRate(1.5),2);
  assert.equal(internals.nextPlaybackRate(2),1);
  assert.equal(internals.mediaStateForEvent('waiting',{online:true}),'buffering');
  assert.equal(internals.mediaStateForEvent('error',{online:true}),'error');
  assert.equal(internals.mediaStateForEvent('error',{online:false}),'offline');
  assert.equal(internals.mediaErrorClass({code:2}),'network');
  assert.equal(internals.mediaErrorClass({code:3}),'decode');
});

test('RC63.2 controller handles network retry PiP and technical events without backend surfaces',()=>{
  const player=read('src/m26/library/exercise-video-player.js');
  const observability=read('src/m26/library/exercise-media-observability.js');
  assert.match(player,/scope\?\.addEventListener\?\.\('online',onNetwork\)/u);
  assert.match(player,/scope\?\.addEventListener\?\.\('offline',onNetwork\)/u);
  assert.match(player,/data-exercise-video-retry/u);
  assert.match(player,/requestPictureInPicture/u);
  assert.match(player,/playbackRate=next/u);
  assert.match(player,/MutationObserver/u);
  assert.doesNotMatch(`${player}\n${observability}`,/commandBus|supabase|fetch\(|XMLHttpRequest|localStorage|indexedDB|service_role/iu);
});

test('RC63.2 application owns media experience lifecycle',()=>{
  const app=read('src/m26/app/application.js');
  assert.match(app,/createExerciseVideoExperienceController/u);
  assert.match(app,/mediaExperience=createExerciseVideoExperienceController\(\{root\}\)/u);
  assert.match(app,/mediaExperience\.mount\(\)/u);
  assert.match(app,/mediaExperience\?\.destroy/u);
});

test('RC63.2 service worker never stores heavy technical video and keeps it out of app shell',()=>{
  const sw=read('public/m26/sw.js');
  assert.match(sw,/NEVER_CACHE_MEDIA_PREFIXES=\['\/public\/iberfit\/exercises\/video\/'\]/u);
  assert.match(sw,/NEVER_CACHE_MEDIA_PREFIXES\.some/u);
  const appShell=sw.match(/const APP_SHELL=.*?;/s)?.[0]||'';
  assert.doesNotMatch(appShell,/\.(?:mp4|webm|vtt)"/iu);
  assert.match(appShell,/"\/src\/m26\/library\/exercise-media-observability\.js"/u);
  assert.match(appShell,/"\/src\/m26\/library\/exercise-video-player\.js"/u);
  assert.match(appShell,/"\/public\/iberfit\/exercises\/iberfit-exercise-media-v2\.json"/u);
});

test('RC63.2 hosting contract no-stores video and revalidates captions',()=>{
  const headers=read('public/m26/_headers');
  assert.match(headers,/\/public\/iberfit\/exercises\/video\/\*[\s\S]*Cache-Control: no-store/u);
  assert.match(headers,/\/public\/iberfit\/exercises\/captions\/\*[\s\S]*Cache-Control: no-cache, must-revalidate/u);
});

test('RC63.2 production manifest still contains zero fabricated approved videos',()=>{
  assert.equal(rich.summary.approved,0);
  assert.equal(rich.summary.published,0);
  assert.equal(rich.summary.video,0);
  assert.deepEqual(rich.items,[]);
});

test('RC63.2 closes on native HTML5 and leaves Plyr and Lottie out without evidence',()=>{
  const pkg=read('package.json');
  const governance=read('docs/product/EXERCISE_MEDIA_ASSET_GOVERNANCE.md');
  assert.doesNotMatch(pkg,/["'](?:plyr|lottie-web)["']/iu);
  assert.match(governance,/Plyr is not adopted in this release/u);
  assert.match(governance,/zero real approved\s+IBERFIT videos/u);
});

test('RC63.2 stabilizes historical RC62.3 and RC63.1 transient assertions',()=>{
  const rc623=read('tests/m26_rc62_3_progressive_onboarding.test.mjs');
  const rc631=read('tests/m26_rc63_1_media_contract_native_player.test.mjs');
  assert.match(rc623,/preserves durable RC62 closeout/iu);
  assert.doesNotMatch(rc623,/RC63=IN_PROGRESS_EXERCISE_MEDIA_EXPERIENCE/u);
  assert.match(rc631,/preserves durable native media foundation closeout/iu);
  assert.doesNotMatch(rc631,/RC63_2=IN_PROGRESS_NETWORK_ANALYTICS_ASSET_GOVERNANCE/u);
});

test('RC63.2 versions release shell closes RC63 and opens RC64',()=>{
  const sw=read('public/m26/sw.js');
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  assert.match(sw,/VERSION='m26-rc63-2'/u);
  assert.match(sw,/PREVIOUS_VERSION='m26-rc63-1'/u);
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc63-2[^\n]*m26-rc63-1/u);
  assert.match(sw,/m26-rc59-0b[^\n]*m26-rc59-0a[^\n]*m26-rc58-6/u);
  assert.match(roadmap,/RC63=CLOSED_EXERCISE_MEDIA_EXPERIENCE/u);
  assert.match(roadmap,/RC63_1=CLOSED_MEDIA_CONTRACT_NATIVE_PLAYER/u);
  assert.match(roadmap,/RC63_2=CLOSED_NETWORK_ANALYTICS_ASSET_GOVERNANCE/u);
  assert.match(roadmap,/RC64=IN_PROGRESS_QUALITY_PLATFORM/u);
  assert.match(roadmap,/RC63_MEDIA_ASSET_POPULATION=PENDING_REAL_APPROVED_ASSETS/u);
  assert.match(roadmap,/PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u);
  assert.match(roadmap,/RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u);
});