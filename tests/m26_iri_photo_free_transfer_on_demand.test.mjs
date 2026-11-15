import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  iriPhotoShouldRenderOriginal,
  iriPhotoShouldReuseOriginal,
} from '../src/m26/workflows/iri-photogrammetry-controller.js';

const views=['front','back','left','right'];
const signed='https://pjhmrhejsoofmouedavw.supabase.co/storage/v1/object/sign/iberfit-iri-photogrammetry/private?token=opaque';

test('only the selected IRI view requests its protected original',()=>{
  for(const active of views){
    assert.equal(views.filter(view=>iriPhotoShouldRenderOriginal(view,active,signed)).length,1);
    for(const view of views)assert.equal(iriPhotoShouldRenderOriginal(view,active,signed),view===active);
  }
  assert.equal(iriPhotoShouldRenderOriginal('front','front',''),false);
  assert.equal(iriPhotoShouldRenderOriginal('front','unknown',signed),false);
  assert.equal(iriPhotoShouldRenderOriginal('__proto__','__proto__',signed),false);
});

test('preserves only the same authorized signed original in the current view',()=>{
  const image={dataset:{iriPhotoOriginalImage:'front'},getAttribute:(key)=>key==='src'?signed:null};
  assert.equal(iriPhotoShouldReuseOriginal(image,'front','front',signed),true);
  assert.equal(iriPhotoShouldReuseOriginal(image,'front','back',signed),false);
  assert.equal(iriPhotoShouldReuseOriginal(image,'front','front',signed+'&rotated=1'),false);
  assert.equal(iriPhotoShouldReuseOriginal(image,'back','back',signed),false);
  assert.equal(iriPhotoShouldReuseOriginal(null,'front','front',signed),false);
  assert.equal(iriPhotoShouldReuseOriginal(image,'front','front',''),false);
});

test('DOM rendering contains on-demand original and retains the loaded node on rerender',()=>{
  const source=readFileSync(new URL('../src/m26/workflows/iri-photogrammetry-controller.js',import.meta.url),'utf8');
  assert.match(source,/const visibleOriginal=iriPhotoShouldRenderOriginal\(view,activeView,url\)/u);
  assert.match(source,/data-iri-photo-original-image="\$\{view\}"/u);
  assert.match(source,/const preservedOriginals=new Map\(\)/u);
  assert.match(source,/iriPhotoShouldReuseOriginal\(image,view,activeView,signedUrls\[view\]\|\|''\)/u);
  assert.match(source,/placeholder\.replaceWith\?\.\(image\)/u);
  assert.match(source,/tabindex="\$\{visibleOriginal\?'0':'-1'\}"/u);
  assert.match(source,/clientSnapshotForPdf/u,'authorized original four-view PDF path remains intact');
  assert.match(source,/const urls=photosAllowed\?await signedUrlsFor\(snapshot,token\):\{\}/u);
});
