import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  IBERFIT_MEDIA_MAP_URL,
  IBERFIT_RICH_MEDIA_MAP_URL,
  createExerciseMediaBundle,
  loadExerciseMediaMap,
  resolveExerciseMedia,
  resolveExerciseMediaExperience,
  validateIberfitExerciseMediaMap,
  validateIberfitExerciseRichMediaMap,
} from '../src/m26/library/exercise-media.js';
import {
  EXERCISE_VIDEO_PLAYER_SCHEMA_VERSION,
  NATIVE_EXERCISE_VIDEO_POLICY,
  renderNativeExerciseVideo,
  renderExerciseTechnicalGuidance,
} from '../src/m26/library/exercise-video-player.js';
import {renderExerciseMedia} from '../src/m26/library/exercise-media-ui.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const json=(path)=>JSON.parse(read(path));
const legacy=json('public/iberfit/exercises/iberfit-exercise-media-v1.json');
const rich=json('public/iberfit/exercises/iberfit-exercise-media-v2.json');
const repdb=json('public/vendor/repdb/iberfit-canonical-media-map-v1.json');
const sample=repdb.items.find((item)=>item.client_visible&&item.image_paths?.length);
assert.ok(sample);

function richItem(overrides={}){
  const id=sample.iberfit_id;
  return {
    exercise_id:id,
    name_es:'Ejercicio técnico IBERFIT',
    title:'Video técnico',
    alt:'Demostración técnica',
    review_status:'approved',
    published:true,
    coach_visible:true,
    client_visible:true,
    asset_provenance:{
      rights_basis:'iberfit_owned',
      source_ref:'IBERFIT-RC63-1-TEST-ASSET',
      license_label:'IBERFIT owned',
      reviewed_at:'2026-08-17T00:00:00.000Z',
    },
    technical_video:{
      src:`/public/iberfit/exercises/video/${id}/technical.mp4`,
      poster:`/public/iberfit/exercises/images/${id}/main.webp`,
      captions:[
        {
          src:`/public/iberfit/exercises/captions/${id}/es.vtt`,
          srclang:'es',
          label:'Español',
          default:true,
        },
      ],
    },
    cues:['Mantén control del movimiento'],
    common_errors:['Evita perder la posición'],
    regressions:['Reduce el rango si es necesario'],
    ...overrides,
  };
}

function richMap(items){
  return {...rich,items,summary:{approved:items.length,published:items.length,video:items.length,pending:0}};
}

test('RC63.1 keeps legacy IBERFIT v1 valid and adds a separate v2 rich-media contract',()=>{
  assert.equal(IBERFIT_MEDIA_MAP_URL,'/public/iberfit/exercises/iberfit-exercise-media-v1.json');
  assert.equal(IBERFIT_RICH_MEDIA_MAP_URL,'/public/iberfit/exercises/iberfit-exercise-media-v2.json');
  assert.equal(validateIberfitExerciseMediaMap(legacy),legacy);
  assert.equal(validateIberfitExerciseRichMediaMap(rich),rich);
  assert.equal(rich.schemaVersion,2);
  assert.equal(rich.source.provider,'IBERFIT');
  assert.equal(rich.policy.automaticPublication,false);
  assert.equal(rich.policy.technicalVideoHumanApprovalRequired,true);
  assert.deepEqual(rich.items,[]);
});

test('RC63.1 approved rich media resolves video poster captions and written guidance',()=>{
  const manifest=createExerciseMediaBundle({iberfit:legacy,iberfitRich:richMap([richItem()]),repdb});
  const experience=resolveExerciseMediaExperience(manifest,sample.iberfit_id,{role:'client'});
  assert.equal(experience.provider,'IBERFIT');
  assert.equal(experience.video.type,'video/mp4');
  assert.match(experience.video.src,/^\/public\/iberfit\/exercises\/video\//u);
  assert.match(experience.video.poster,/^\/public\/iberfit\/exercises\/images\//u);
  assert.equal(experience.video.captions[0].srclang,'es');
  assert.deepEqual(experience.cues,['Mantén control del movimiento']);
  assert.deepEqual(experience.commonErrors,['Evita perder la posición']);
  assert.deepEqual(experience.regressions,['Reduce el rango si es necesario']);
});

test('RC63.1 rich media fails closed for review publication visibility or unsafe paths',()=>{
  const variants=[
    richItem({review_status:'technical_review'}),
    richItem({published:false}),
    richItem({client_visible:false}),
    richItem({technical_video:{src:'https://example.com/video.mp4'}}),
    richItem({technical_video:{src:'data:video/mp4;base64,AAAA'}}),
  ];
  for(const item of variants){
    const manifest=createExerciseMediaBundle({iberfit:legacy,iberfitRich:richMap([item]),repdb});
    assert.equal(resolveExerciseMediaExperience(manifest,sample.iberfit_id,{role:'client'}),null);
  }
});

test('RC63.1 rich contract never breaks the existing RepDB image fallback',()=>{
  const manifest=createExerciseMediaBundle({iberfit:legacy,iberfitRich:rich,repdb});
  const media=resolveExerciseMedia(manifest,sample.iberfit_id,{role:'client'});
  assert.equal(media.provider,'RepDB');
  assert.equal(media.owned,false);
});

test('RC63.1 loader fetches v1 v2 and RepDB independently and tolerates rich-media outage',async()=>{
  const fetchAll=async(url)=>{
    if(url===IBERFIT_MEDIA_MAP_URL)return {ok:true,json:async()=>legacy};
    if(url===IBERFIT_RICH_MEDIA_MAP_URL)return {ok:true,json:async()=>rich};
    return {ok:true,json:async()=>repdb};
  };
  const full=await loadExerciseMediaMap({fetchImpl:fetchAll});
  assert.equal(full.iberfit.source.provider,'IBERFIT');
  assert.equal(full.iberfitRich.schemaVersion,2);
  assert.equal(full.repdb.source.provider,'RepDB');

  const withoutRich=await loadExerciseMediaMap({fetchImpl:async(url)=>{
    if(url===IBERFIT_RICH_MEDIA_MAP_URL)return {ok:false,status:404};
    if(url===IBERFIT_MEDIA_MAP_URL)return {ok:true,json:async()=>legacy};
    return {ok:true,json:async()=>repdb};
  }});
  assert.equal(withoutRich.iberfitRich,null);
  assert.equal(withoutRich.repdb.source.provider,'RepDB');
});

test('RC63.1 native player is accessible demand-loaded and never autoplays',()=>{
  assert.match(EXERCISE_VIDEO_PLAYER_SCHEMA_VERSION,/^iberfit\.exercise-video-player\.v[1-9]\d*$/u);
  assert.equal(NATIVE_EXERCISE_VIDEO_POLICY.engine,'html5-native');
  assert.equal(NATIVE_EXERCISE_VIDEO_POLICY.autoplay,false);
  assert.equal(NATIVE_EXERCISE_VIDEO_POLICY.preload,'none');
  assert.equal(NATIVE_EXERCISE_VIDEO_POLICY.plyrAdopted,false);
  const experience=resolveExerciseMediaExperience(
    createExerciseMediaBundle({iberfitRich:richMap([richItem()])}),
    sample.iberfit_id,
    {role:'client'}
  );
  const html=renderNativeExerciseVideo({
    video:experience.video,
    title:experience.title,
    alt:experience.alt,
  });
  assert.match(html,/<video controls playsinline preload="none"/u);
  assert.match(html,/<source[^>]+type="video\/mp4"/u);
  assert.match(html,/<track kind="captions"/u);
  assert.match(html,/poster="\/public\/iberfit\/exercises\/images\//u);
  assert.doesNotMatch(html,/\sautoplay(?:\s|>|=)/u);
  assert.doesNotMatch(html,/onplay=|onerror=|onclick=/u);
});

test('RC63.1 written fallback exposes cues common errors and regressions',()=>{
  const html=renderExerciseTechnicalGuidance({
    cues:['Cue seguro'],
    commonErrors:['Error habitual'],
    regressions:['Regresión disponible'],
  });
  assert.match(html,/Guía técnica escrita/u);
  assert.match(html,/Cues/u);
  assert.match(html,/Errores comunes/u);
  assert.match(html,/Regresiones/u);
});

test('RC63.1 library media renderer composes rich video with legacy visual fallback',()=>{
  const manifest=createExerciseMediaBundle({iberfit:legacy,iberfitRich:richMap([richItem()]),repdb});
  const html=renderExerciseMedia({
    manifest,
    exercise:{id:sample.iberfit_id,name_es:'Ejercicio técnico'},
    role:'client',
    showCredit:true,
  });
  assert.match(html,/data-exercise-media-experience/u);
  assert.match(html,/data-exercise-video/u);
  assert.match(html,/data-exercise-media-source="RepDB"/u);
  assert.match(html,/Guía técnica escrita/u);
  assert.match(html,/RepDB \(repdb\.co\)/u);
});

test('RC63.1 production rich manifest contains no fabricated approved video assets',()=>{
  assert.equal(rich.summary.approved,0);
  assert.equal(rich.summary.published,0);
  assert.equal(rich.summary.video,0);
  assert.deepEqual(rich.items,[]);
});

test('RC63.1 keeps Plyr out until real approved video UX can be evaluated',()=>{
  const pkg=read('package.json');
  const player=read('src/m26/library/exercise-video-player.js');
  assert.doesNotMatch(pkg,/["']plyr["']/iu);
  assert.doesNotMatch(player,/from ['"]plyr|new Plyr|cdn\.plyr/iu);
  assert.match(player,/plyrAdopted:false/u);
});

test('RC63.1 media paths are same-origin and app-shell includes rich contract and player',()=>{
  const media=read('src/m26/library/exercise-media.js');
  const sw=read('public/m26/sw.js');
  assert.doesNotMatch(media,/technical_video[\s\S]{0,180}https?:\/\//u);
  assert.match(sw,/"\/public\/iberfit\/exercises\/iberfit-exercise-media-v2\.json"/u);
  assert.match(sw,/"\/src\/m26\/library\/exercise-video-player\.js"/u);
  assert.match(sw,/iberfit-exercise-media-v2\.json/u);
  const generator=read('scripts/generate_rc58_app_shell.mjs');
  assert.match(generator,/public\/iberfit\/exercises\/iberfit-exercise-media-v2\.json/u);
});

test('RC63.1 stabilizes RC62.3 PWA history and versions the native-player shell',()=>{
  const prior=read('tests/m26_rc62_3_progressive_onboarding.test.mjs');
  const sw=read('public/m26/sw.js');
  assert.match(prior,/Historical compatibility markers retained[^\n]*m26-rc62-3[^\n]*m26-rc62-2/u);
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc63-1[^\n]*m26-rc62-3/u);
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc63-1[^\n]*m26-rc62-3/u);
  assert.match(sw,/m26-rc59-0b[^\n]*m26-rc59-0a[^\n]*m26-rc58-6/u);
});

test('RC63.1 preserves durable native media foundation closeout and cross-cutting rails',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  assert.match(roadmap,/RC62=CLOSED_AGENDA_GUIDANCE_ONBOARDING/u);
  assert.match(roadmap,/RC63_1=CLOSED_MEDIA_CONTRACT_NATIVE_PLAYER/u);
  assert.match(roadmap,/PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u);
  assert.match(roadmap,/RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u);
});