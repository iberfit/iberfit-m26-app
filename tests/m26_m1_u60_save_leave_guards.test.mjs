import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {datedHasUnsubmittedInputs} from '../src/m26/workflows/occurrence-qa-ui.js';
import {M26_ACTION_REGISTRY} from '../src/m26/ui/interactive-audit.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const input=(value,type='number',checked=false)=>({value,type,checked});
const panel=(...items)=>({querySelectorAll:()=>items});

test('M1 U60 exit catches any unsubmitted set/feedback DOM value before repaint',()=>{
  assert.equal(datedHasUnsubmittedInputs(panel()),false);
  assert.equal(datedHasUnsubmittedInputs(panel(input(''))),false);
  assert.equal(datedHasUnsubmittedInputs(panel(input('  '))),false);
  assert.equal(datedHasUnsubmittedInputs(panel(input('8'))),true);
  assert.equal(datedHasUnsubmittedInputs(panel(input('0'))),true);
  assert.equal(datedHasUnsubmittedInputs(panel(input('tired','text'))),true);
  assert.equal(datedHasUnsubmittedInputs(panel(input('','checkbox',true))),true);
  assert.equal(datedHasUnsubmittedInputs(panel(input('','checkbox',false))),false);
  assert.equal(datedHasUnsubmittedInputs(null),false);
});

test('M1 save-and-exit checks encrypted local and server ACK before releasing workout focus',()=>{
  const s=readFileSync(new URL('../src/m26/workflows/occurrence-qa-ui.js',import.meta.url),'utf8');
  const action=s.indexOf("if(action==='u60-save-close'){");
  const end=s.indexOf("if(action==='u60-start'){",action);
  assert.ok(action>0&&end>action);
  const body=s.slice(action,end);
  assert.match(body,/active\.hasUncertain/u);
  assert.match(body,/await runtime\.workout\.save\(\)/u);
  assert.match(body,/receipt\.hasUncertain\|\|receipt\.unsavedWork/u);
  assert.ok(body.indexOf('await runtime.workout.save()')<body.indexOf('focus=null'));
  const click=s.slice(s.indexOf('async function onClick('));
  assert.ok(click.indexOf('datedHasUnsubmittedInputs(panel)')<click.indexOf('busy=true;failure='),
    'guard DOM inputs before repaint and network');
  assert.match(s,/data-u60-feedback-entry/u);
  assert.match(s,/data-u60-input-warning hidden/u);
  assert.match(s,/data-iberdates-action="u60-save-close"/u);
  assert.deepEqual(M26_ACTION_REGISTRY['u60-save-close'].roles,['coach','client']);
});

test('M1 typed-input safety warning is localized in EN, FR and PT',()=>{
  const msg='Hay datos escritos sin registrar. Confirma la serie o el feedback antes de salir.';
  for(const lang of ['en','fr','pt'])assert.notEqual(
    iberfitSurfaceTranslate(msg,{language:lang}),msg);
});
