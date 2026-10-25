import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';
import {validateSessionDraft} from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder,sessionBuilderReviewReadiness} from '../src/m26/workflows/session-ui.js';

const exercises=['e1','e2','e3'];
const catalog={
  facets:{patterns:[],equipment:[],difficulty:[],intent:[]},
  has:id=>exercises.includes(id),
  get:id=>exercises.includes(id)?{id,name_es:'Ejercicio '+id,pattern:'Fuerza',equipment:'Mancuerna'}:null,
  search:()=>[],
};
const block=(id,exerciseId,sets=3)=>({
  id,type:'exercise',exerciseId,sets,reps:'8',restSeconds:60,targetRpe:7,targetRir:2,
});
const draft=blocks=>({
  id:'signature-b14-draft',clientId:'signature-b14-client',title:'Fuerza personalizada',
  durationMinutes:50,deliveryModality:'guiada_en_app',previewAccepted:false,blocks,
});
const render=source=>renderSessionBuilder({draft:source,catalog,role:'coach'});

test('B14: blocked review can jump directly to the only invalid exercise editor',()=>{
  const data=draft([block('first','e1'),block('second','e2',0),block('third','e3')]);
  const before=JSON.stringify(data);
  assert.equal(validateSessionDraft(data,catalog).ok,false);
  assert.equal(sessionBuilderReviewReadiness(data,catalog).targetBlockId,'second');
  const html=render(data);
  assert.match(html,/data-session-review-readiness role="status"[^]*?data-session-review-block="second">Revisar bloque<\/button>/u);
  assert.match(html,/data-session-action="preview" disabled aria-disabled="true"/u);
  assert.match(html,/data-session-action="save-draft"/u);
  assert.doesNotMatch(html,/data-session-action="publish"/u);
  assert.equal(JSON.stringify(data),before,'read-only guidance must never rewrite a draft');
});

test('B14: global fields retain priority, with no misleading invalid-block link',()=>{
  const data={...draft([block('first','e1'),block('second','e2',0)]),title:''};
  const ready=sessionBuilderReviewReadiness(data,catalog);
  assert.equal(ready.ready,false);
  assert.equal(ready.targetBlockId,undefined);
  assert.doesNotMatch(render(data),/>Revisar bloque<\/button>/u);
});

test('B14: group rounds are directly addressable, but duplicate exercise IDs are ambiguous',()=>{
  const p={reps:'8',restSeconds:60,targetRpe:7,targetRir:2};
  const group={id:'group-one',type:'biserie',exerciseIds:['e1','e2'],rounds:0,
    prescriptions:{e1:{...p},e2:{...p}}};
  assert.equal(sessionBuilderReviewReadiness(draft([block('first','e3'),group]),catalog).targetBlockId,'group-one');
  const duplicate=draft([block('first','e1'),block('second','e1',0)]);
  assert.equal(validateSessionDraft(duplicate,catalog).ok,false);
  assert.equal(sessionBuilderReviewReadiness(duplicate,catalog).targetBlockId,undefined);
  assert.doesNotMatch(render(duplicate),/>Revisar bloque<\/button>/u);
});

test('B14: block identifiers are HTML-escaped; navigation reuses the certified focus handler',()=>{
  const malicious='id" onmouseover="alert(1)';
  const html=render(draft([block(malicious,'e2',0)]));
  assert.match(html,/data-session-review-block="id&amp;quot;|data-session-review-block="id&quot;/u);
  assert.doesNotMatch(html,/onmouseover="alert\(1\)"/u);
  const ctrl=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  assert.match(ctrl,/focusBuilderBlock\(blockId\)/u);
});

test('B14: correction action has committed EN, FR and PT translations',()=>{
  for(const lang of ['en','fr','pt']){
    const result=iberfitSurfaceTranslate('Revisar bloque',{language:lang});
    assert.notEqual(result,'Revisar bloque');
    assert.ok(result.length>5);
  }
});
