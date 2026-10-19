import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

const exercise={id:'signature-u14-squat',name_es:'Sentadilla con mancuernas',pattern:'sentadilla',equipment:'mancuernas'};
const catalog={get:id=>id===exercise.id?exercise:null,search:()=>[exercise],facets:{patterns:['sentadilla'],equipment:['mancuernas'],difficulty:[],intent:[]}};
const defaults={id:'u14-session',title:'Fuerza base A',clientId:'u14-client',durationMinutes:55,deliveryModality:'presencial',previewAccepted:false,activeGroupId:null};
const block={id:'u14-block',type:'exercise',exerciseId:exercise.id,sets:3,reps:'8-12',targetRpe:7,restSeconds:60};
function render(blocks=[],extra={}){
  return renderSessionBuilder({draft:{...defaults,blocks,...extra},catalog,role:'coach',mediaMap:null,actionState:{status:'idle',message:''},filters:{},query:''});
}
test('U14: empty plan leads to the real library without fake blocks',()=>{
  const html=render([]);
  assert.match(html,/data-session-builder-empty/u);
  assert.match(html,/data-session-jump="library"/u);
  assert.match(html,/data-session-jump-target="library"/u);
  assert.doesNotMatch(html,/data-session-builder-finish/u);
});
test('U14: coach closes planning in place, without bypassing preview',()=>{
  const html=render([block]);
  assert.ok(html.includes('data-session-builder-finish'));
  const footer=html.slice(html.indexOf('data-session-builder-finish'));
  assert.match(footer,/data-session-jump="library"/u);
  assert.match(footer,/data-session-action="save-draft"/u);
  assert.match(footer,/data-session-action="preview"/u);
  assert.doesNotMatch(footer,/data-session-action="publish"/u);
  assert.match(html,/data-session-draft-field="deliveryModality"/u);
  assert.match(html,/data-session-action="discard-draft"/u);
  assert.match(html,/data-session-action="exit-session"/u);
});
test('U14: accepted preview hides edit footer and preserves existing publication validation',()=>{
  const html=render([block],{previewAccepted:true});
  assert.doesNotMatch(html,/data-session-builder-finish/u);
  assert.match(html,/data-session-action="publish"/u);
  const source=readFileSync(new URL('../src/m26/workflows/session-builder.js',import.meta.url),'utf8');
  assert.match(source,/if\(draft\.previewAccepted!==true\)throw new Error\('M26_SESSION_PREVIEW_REQUIRED'\)/u);
});
test('U14: mobile touch footer stays in natural flow above the dock',()=>{
  const css=readFileSync(new URL('../src/m26/design/dark-iberfit-v2.css',import.meta.url),'utf8');
  const controller=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  const section=css.split('/* SIGNATURE_COACH_U14_TASK_CLOSE_BEGIN */')[1]?.split('/* SIGNATURE_COACH_U14_TASK_CLOSE_END */')[0]||'';
  assert.match(section,/\.m26-builder-finish\{/u);
  assert.match(section,/min-height:48px/u);
  assert.match(section,/@media\(max-width:680px\)/u);
  assert.doesNotMatch(section,/position:\s*(fixed|sticky)/u);
  assert.match(controller,/const jump=event\.target\.closest\?\.\('\[data-session-jump\]'\)/u);
  assert.match(controller,/target\.focus\?\.\(\{preventScroll:true\}\)/u);
});
