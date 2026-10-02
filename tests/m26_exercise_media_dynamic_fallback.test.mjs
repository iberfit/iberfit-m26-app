import assert from 'node:assert/strict';
import test from 'node:test';

import {loadExerciseMediaMap} from '../src/m26/library/exercise-media.js';

const QA_ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const STATIC_MANIFEST={
  schemaVersion:1,
  release:'IBERFIT_EXERCISE_MEDIA_STATIC_TEST_V1',
  generatedAt:'2026-10-02T00:00:00.000Z',
  source:{provider:'IBERFIT',ownership:'IBERFIT',attributionRequired:false,delivery:'bundled'},
  summary:{approved:1,published:1,pending:0},
  items:[{
    exercise_id:'IBF-STATIC-FALLBACK',
    name_es:'Referencia estática QA',
    review_status:'approved',
    published:true,
    coach_visible:true,
    client_visible:true,
    image_mode:'main',
    image_paths:['/public/iberfit/exercises/images/IBF-STATIC-FALLBACK/main.webp'],
    muscle_group:'control',
    revision:1,
  }],
};

test('dynamic exercise media timeout remains optional when the static manifest is valid',async()=>{
  let dynamicCalls=0;
  const fetchImpl=async(url)=>{
    const value=String(url);
    if(value==='/owned.json'){
      return {ok:true,status:200,json:async()=>STATIC_MANIFEST};
    }
    if(value===QA_ORIGIN+'/rest/v1/rpc/iberfit_exercise_media_manifest_v1'){
      dynamicCalls+=1;
      const error=new Error('simulated optional dynamic timeout');
      error.name='AbortError';
      throw error;
    }
    return {ok:false,status:503,json:async()=>({})};
  };

  const bundle=await loadExerciseMediaMap({
    fetchImpl,
    iberfitUrl:'/owned.json',
    iberfitRichUrl:'/rich.json',
    repdbUrl:'/repdb.json',
    runtimeConfig:{enabled:true,url:QA_ORIGIN,publishableKey:'qa-public-key',version:'26.0.0-test'},
    timeoutMs:500,
  });

  assert.equal(dynamicCalls,1);
  assert.equal(bundle.kind,'IBERFIT_EXERCISE_MEDIA_BUNDLE');
  assert.equal(bundle.iberfit.source.provider,'IBERFIT');
  assert.equal(bundle.iberfit.items.length,1);
  assert.equal(bundle.iberfit.items[0].exercise_id,'IBF-STATIC-FALLBACK');
  assert.equal(bundle.iberfitRich,null);
  assert.equal(bundle.repdb,null);
});
