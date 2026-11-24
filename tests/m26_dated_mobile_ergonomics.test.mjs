import test from 'node:test';
import assert from 'node:assert/strict';
import {syncDatedQuickRpe,restoreDatedUnsubmittedFields} from '../src/m26/workflows/occurrence-qa-ui.js';
import {readFileSync} from 'node:fs';

function fixture(){
 const input={type:'number',value:''};
 const details={open:false};
 const reason={type:'text',value:'',closest:selector=>selector==='[data-u60-skip-details]'?details:null};
 const choices=[6,7,8,9,10].map(value=>({pressed:'false',getAttribute:()=>String(value),setAttribute(key,v){if(key==='aria-pressed')this.pressed=v;}}));
 const panel={querySelector:selector=>selector==='[name="u60Rpe"]'?input:selector==='[name="u60SkipReason"]'?reason:null,querySelectorAll:()=>choices};
 return {input,details,reason,choices,panel};
}
test('RPE quick buttons follow exact observed input and clear fractional or invalid selections',()=>{
 const f=fixture();
 for(const value of ['7','8.0','7.5','','12']){
  f.input.value=value;syncDatedQuickRpe(f.panel);
  assert.deepEqual(f.choices.map(b=>b.pressed),[6,7,8,9,10].map(n=>value&&Number(value)===n?'true':'false'));
 }
});
test('same-step draft restore reopens omission and restores real effort selection',()=>{
 const f=fixture();
 restoreDatedUnsubmittedFields(f.panel,{u60Rpe:'8',u60SkipReason:'fatigue'});
 assert.equal(f.details.open,true);assert.equal(f.reason.value,'fatigue');
 assert.equal(f.choices[2].pressed,'true');
});
test('dated mobile layout separates the primary recording action from deliberate omission',()=>{
 const ui=readFileSync(new URL('../src/m26/workflows/occurrence-qa-ui.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
 assert.match(ui,/class="m26-primary-action m26-wide" data-iberdates-action="u60-record"/u);
 assert.match(ui,/<details[^>]*data-u60-skip-details><summary>Omitir esta serie/u);
 assert.match(css,/\[data-u60-workout\][\s\S]*min-height:var\(--iberfit-size-touch-target-comfortable,48px\)/u);
 assert.match(css,/\[data-u60-workout\][\s\S]*font-size:16px/u);
});
