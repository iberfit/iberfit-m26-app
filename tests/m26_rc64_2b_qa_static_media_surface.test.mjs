import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(file)=>fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');

test('RC64.2B QA surface includes authenticated static exercise-media dependencies',()=>{
  const builder=read('qa/rc64/build-current-surface.mjs');

  assert.match(builder,/\['public\/iberfit','public\/iberfit'\]/u);
  assert.match(builder,/\['public\/vendor\/repdb','public\/vendor\/repdb'\]/u);

  for(const required of [
    'public/iberfit/exercises/iberfit-exercise-media-v1.json',
    'public/iberfit/exercises/iberfit-exercise-media-v2.json',
    'public/vendor/repdb/iberfit-canonical-media-map-v1.json',
  ]){
    assert.ok(fs.existsSync(required),`RC64_2B_QA_STATIC_SOURCE_MISSING:${required}`);
  }

  const mediaMap=JSON.parse(read('public/vendor/repdb/iberfit-canonical-media-map-v1.json'));
  const imagePaths=[...new Set(
    (mediaMap.items||[])
      .flatMap((item)=>Array.isArray(item.image_paths)?item.image_paths:[])
      .filter((asset)=>typeof asset==='string'&&asset.startsWith('/public/vendor/repdb/images/')),
  )];

  assert.ok(imagePaths.length>0,'RC64_2B_QA_MEDIA_MAP_MUST_REFERENCE_LOCAL_IMAGES');
  for(const asset of imagePaths){
    assert.ok(fs.existsSync(asset.slice(1)),`RC64_2B_QA_MEDIA_ASSET_MISSING:${asset}`);
  }
});