import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('src/m26/design/iberfit-premium-v3.css');
const render=read('src/m26/modules/route-render.js');
const media=read('src/m26/library/exercise-media-ui.js');
const html=read('public/m26/index.html');

test('SIGNATURE 360 uses actual role surfaces and canonical token system',()=>{
 assert.equal(css.split('IBERFIT SIGNATURE 360 - Approved three-role experience').length,2);
 for(const role of ['admin','coach','client'])assert.match(css,new RegExp('data-m26-role="'+role+'"'));
 assert.match(css,/--iberfit-color-forest-900/);
 assert.match(css,/--iberfit-color-gold-300/);
 assert.match(html,/\/src\/m26\/design\/iberfit-premium-v3\.css/);
});

test('SIGNATURE 360 addresses actual library templates, not a demo',()=>{
 assert.match(media,/class="m26-library-card"/);
 assert.match(media,/class="m26-library-details"/);
 assert.match(media,/data-exercise-rename-form/);
 assert.match(css,/grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,22rem\),1fr\)\)/);
 assert.match(css,/@media\(max-width:390px\)/);
});

test('SIGNATURE 360 keeps real Coach and Client controls accessible',()=>{
 assert.match(render,/m26-coach-home-command/);
 assert.match(render,/m26-coach-home-quick/);
 assert.match(render,/data-workflow-action="start-published-session"/);
 assert.match(css,/data-client-session-primary/);
 for(const re of [/:focus-visible/,/prefers-reduced-motion/,/forced-colors:active/,/max-width:680px/])assert.match(css,re);
});


test('SIGNATURE 360 preserves searchable real library and collapses only secondary creation form',()=>{
 const render=read('src/m26/modules/route-render.js');
 assert.match(render,/class="m26-panel m26-panel-soft m26-library-create-disclosure"/);
 assert.match(render,/data-exercise-create-form data-guided-required-form/);
 assert.match(render,/data-library-search/);
 assert.match(render,/data-library-grid/);
 assert.match(render,/data-library-status/);
 assert.match(render,/data-exercise-create-status/);
 const scope=render.slice(render.indexOf("const creation=canCreate?"));
 assert.ok(scope.indexOf("data-exercise-create-form")<scope.indexOf("</form></div></details>"));
 assert.match(css,/m26-exercise-media-open-label/);
});
test('SIGNATURE 360 keeps the real three-role home and workout surfaces',()=>{
 assert.match(render,/m26-client-home-primary-zone/);
 assert.match(render,/m26-client-home-hero/);
 assert.match(render,/m26-coach-home-command/);
 assert.match(render,/m26-planning-workbench-v2/);
 assert.match(css,/m26-library-create-disclosure/);
 assert.match(css,/m26-client-home-compass-actions/);
});


test('SIGNATURE 360 quiet gold finish respects approved references and official identity',()=>{
 const brand=JSON.parse(read('src/m26/design/brand-truth.json'));
 assert.equal(brand.officialAsset.path,'public/isotipo-iberfit.png');
 assert.equal(brand.officialAsset.useAsIs,true);
 assert.equal(brand.officialAsset.recolorFromUiTokens,false);
 const marker='SIGNATURE 360 · APPROVED QUIET GOLD MASTER FINISH · 2026-11-12';
 assert.equal(css.split(marker).length,2);
 const finish=css.slice(css.indexOf(marker));
 assert.match(finish,/url\('\/isotipo-iberfit\.png'\)/);
 for(const role of ['admin','coach','client'])assert.match(finish,new RegExp('data-m26-role="'+role+'"'));
 assert.match(finish,/--s360-quiet-border:rgba\(197,160,89,\.16\)/);
 assert.match(finish,/--s360-quiet-border-strong:rgba\(197,160,89,\.32\)/);
 assert.doesNotMatch(finish,/text-shadow:0 0|box-shadow:0 0|drop-shadow\(0 0/);
 for(const required of ['.m26-admin-table','.m26-session-builder-v2','.m26-session-live-v3','.m26-client-home-primary-zone','.m26-library-card']){
   assert.ok(finish.includes(required),required);
 }
});
test('SIGNATURE 360 responsive finish does not replace interactions or introduce fictitious records',()=>{
 const marker='SIGNATURE 360 · APPROVED QUIET GOLD MASTER FINISH · 2026-11-12';
 const finish=css.slice(css.indexOf(marker));
 for(const breakpoint of [1024,680])assert.match(finish,new RegExp('@media\\(max-width:'+breakpoint+'px\\)'));
 assert.match(finish,/@media\(forced-colors:active\)/);
 assert.match(finish,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(finish,/content:url\(|pointer-events:none|visibility:hidden|display:none|!important/);
 assert.match(render,/data-workflow-action="start-published-session"/);
 assert.match(html,/\/src\/m26\/design\/iberfit-premium-v3\.css/);
});
