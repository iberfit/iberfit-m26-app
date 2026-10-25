import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';
const ui=readFileSync('src/m26/workflows/session-ui.js','utf8');
const controller=readFileSync('src/m26/workflows/session-controller.js','utf8');
const css=readFileSync('src/m26/design/dark-iberfit-v2.css','utf8');
const catalog={
 facets:{patterns:[],equipment:[],difficulty:[],intent:[]},
 search:()=>[],get:id=>({id,name_es:id==='ex-1'?'Sentadilla':'Remo',pattern:'Fuerza',equipment:'Mancuerna'}),
 has:()=>true,
};
const makeDraft=blocks=>({id:'draft-b13',clientId:'client-b13',title:'Fuerza B13',durationMinutes:50,deliveryModality:'guiada_en_app',previewAccepted:false,blocks});
const block=(id,exerciseId)=>({id,type:'exercise',exerciseId,sets:3,reps:10,restSeconds:90});
const render=blocks=>renderSessionBuilder({draft:makeDraft(blocks),catalog,role:'coach'});
test('B13: no redundant navigator in empty or single block session',()=>{
 assert.doesNotMatch(render([]),/data-session-builder-block-index/u);
 assert.doesNotMatch(render([block('a','ex-1')]),/data-session-builder-block-index/u);
});
test('B13: Coach can focus either existing block without modifying commands',()=>{
 const html=render([block('a','ex-1'),block('b','ex-2')]);
 assert.match(html,/data-session-builder-block-index/u);
 assert.match(html,/data-session-review-block="a"[^>]*>1\. Sentadilla<\/button>/u);
 assert.match(html,/data-session-review-block="b"[^>]*>2\. Remo<\/button>/u);
 assert.match(html,/data-block-id="a"/u);
 assert.match(html,/data-block-id="b"/u);
 assert.match(controller,/const reviewBlock=event\.target\.closest\?\.\('\[data-session-review-block\]'\)/u);
 assert.match(controller,/focusBuilderBlock\(blockId\)/u);
 assert.match(html,/data-session-action="save-draft"/u);
 assert.match(html,/data-session-action="preview"/u);
});
test('B13: user-generated exercise names cannot inject handlers or markup',()=>{
 const malicious={...catalog,get:()=>({name_es:'Test <svg onload=alert(1)>',pattern:'Fuerza'})};
 const html=renderSessionBuilder({draft:makeDraft([block('a','ex-1'),block('b','ex-2')]),catalog:malicious,role:'coach'});
 assert.match(html,/Test &lt;svg onload=alert\(1\)&gt;/u);
 assert.doesNotMatch(html,/<svg onload=/u);
});
test('B13: native disclosure remains hidden when closed, scrollable when open and touch safe',()=>{
 const b13=css.slice(css.indexOf('/* SIGNATURE B13 ·'));
 assert.ok(b13.length>2200);
 assert.match(b13,/\.m26-builder-block-index:not\(\[open\]\)>\.m26-builder-block-index-links\{\s*display:none/u);
 assert.match(b13,/overscroll-behavior:contain/u);
 assert.match(b13,/min-height:48px/u);
 assert.match(b13,/:focus-visible/u);
 assert.match(b13,/@media\(forced-colors:active\)/u);
 assert.doesNotMatch(b13,/position:\s*(fixed|sticky)|z-index:/u);
});

test('B13: a missing visual does not consume one quarter of the Coach editor; real media remains untouched',()=>{
 const section=css.slice(css.indexOf('/* SIGNATURE B13 · Coach does not present'));
 assert.match(section,/\.m26-builder-editor>header:has\(> \.m26-exercise-media-fallback\)/u);
 assert.match(section,/grid-template-columns:auto minmax\(0,1fr\) auto/u);
 assert.match(section,/\.m26-builder-editor>header>\.m26-exercise-media-fallback\{\s*display:none/u);
 assert.match(section,/\.m26-group-prescription-heading>\.m26-exercise-media-fallback\{\s*display:none/u);
 assert.match(section,/grid-column:1 \/ -1/u);
 assert.doesNotMatch(section,/!important|display:none;\s*\/\*.*valid-media/u);
});
