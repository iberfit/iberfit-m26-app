import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

const exercise={id:'u16-ex',name_es:'Sentadilla de prueba',pattern:'sentadilla',equipment:'mancuernas'};
const catalog={get:id=>id===exercise.id?exercise:null,search:()=>[exercise],facets:{}};
const defaults={id:'u16-draft',title:'Sesión ordenada',clientId:'u16-client',durationMinutes:55,
  deliveryModality:'presencial',previewAccepted:false,activeGroupId:null};
const single=(id)=>({id,type:'exercise',exerciseId:exercise.id,sets:3,reps:'8-10',restSeconds:60});
const group=(id)=>({id,type:'biserie',rounds:3,exerciseIds:[exercise.id],prescriptions:{[exercise.id]:{sets:3,reps:'8-10',restSeconds:60}}});
function render(blocks,extra={}){
  return renderSessionBuilder({draft:{...defaults,blocks,...extra},catalog,role:'coach',mediaMap:null,
    actionState:{status:'idle',message:''},query:'',filters:{}});
}
function actionControl(markup,blockId,action){
  const start=markup.indexOf('<article class="m26-builder-block m26-builder-editor" data-block-id="'+blockId+'"');
  assert.ok(start>=0,'Missing editable block '+blockId);
  const end=markup.indexOf('</article>',start);
  assert.ok(end>start,'Missing block boundary '+blockId);
  const html=markup.slice(start,end);
  const button=html.match(new RegExp('<button[^>]*data-session-action="'+action+'"[^>]*data-block-id="'+blockId+'"[^>]*>','u'))?.[0];
  assert.ok(button,'Missing reorder control '+blockId+'/'+action);
  return button;
}
function isDisabled(markup,blockId,action){
  const button=actionControl(markup,blockId,action);
  assert.equal(/\sdisabled\b/u.test(button),/aria-disabled="true"/u.test(button),'native and ARIA disabled must agree');
  return /\sdisabled\b/u.test(button);
}

test('U16: an only exercise has no impossible reorder actions, but remains editable',()=>{
  const html=render([single('only')]);
  assert.equal(isDisabled(html,'only','move-up'),true);
  assert.equal(isDisabled(html,'only','move-down'),true);
  assert.match(html,/data-session-action="duplicate-block"/u);
  assert.match(html,/data-session-action="remove-block"/u);
  assert.match(html,/data-session-action="preview"/u);
});
test('U16: first/middle/last exercise exposes only valid adjacent reorders',()=>{
  const html=render([single('first'),single('middle'),single('last')]);
  assert.equal(isDisabled(html,'first','move-up'),true);
  assert.equal(isDisabled(html,'first','move-down'),false);
  assert.equal(isDisabled(html,'middle','move-up'),false);
  assert.equal(isDisabled(html,'middle','move-down'),false);
  assert.equal(isDisabled(html,'last','move-up'),false);
  assert.equal(isDisabled(html,'last','move-down'),true);
});
test('U16: group moves obey the same list boundaries without deleting prescriptions',()=>{
  const html=render([group('group-first'),single('middle'),group('group-last')]);
  assert.equal(isDisabled(html,'group-first','move-up'),true);
  assert.equal(isDisabled(html,'group-first','move-down'),false);
  assert.equal(isDisabled(html,'middle','move-up'),false);
  assert.equal(isDisabled(html,'middle','move-down'),false);
  assert.equal(isDisabled(html,'group-last','move-up'),false);
  assert.equal(isDisabled(html,'group-last','move-down'),true);
  assert.match(html,/data-block-id="group-first"/u);
  assert.match(html,/data-block-id="group-last"/u);
});
test('U16: reorder remains handled by the existing controller and preserves keyboard focus',()=>{
  const source=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  assert.match(source,/case 'move-up': moveSessionBlock/u);
  assert.match(source,/case 'move-down': moveSessionBlock/u);
  assert.match(source,/button\.disabled\|\|button\.getAttribute\('aria-disabled'\)==='true'/u);
  assert.match(source,/builderFocusBlockId=payload\.blockId;builderFocusAction=action/u);
  assert.ok(source.includes("const inverse=action==='move-up'?'move-down':action==='move-down'?'move-up':null;"),'Boundary focus must have inverse-arrow recovery');
  assert.ok(source.includes('const focusTarget=focusable(requested)?requested:focusable(alternate)?alternate:target;'),'Never focus an arrow just disabled after reordering');
});
test('U16: preview acceptance still controls publication without false shortcut',()=>{
  const draft=render([single('only')],{previewAccepted:true});
  assert.doesNotMatch(draft,/data-session-builder-finish/u);
  assert.match(draft,/data-session-action="publish"/u);
  const builder=readFileSync(new URL('../src/m26/workflows/session-builder.js',import.meta.url),'utf8');
  assert.match(builder,/M26_SESSION_PREVIEW_REQUIRED/u);
});
