import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {syncGuidedWorkflowProgress} from '../src/m26/app/workflow-controller.js';

function progress(control){
  let writes=0,text='';
  const feedback={dataset:{},hidden:false,
    get textContent(){return text;},
    set textContent(v){text=String(v);writes++;},
    get writes(){return writes;},
  };
  const form={matches:()=>true,
    querySelector:()=>feedback,querySelectorAll:()=>[control]};
  syncGuidedWorkflowProgress(form);
  return {form,feedback};
}
function field(name,label){
  return {name,required:true,disabled:false,hidden:false,
    labels:[label],type:'select-one',value:'',validity:{valid:false},
    getAttribute:()=>null,closest:()=>null};
}
test('B22 next required wellbeing field never includes nested select options',()=>{
  const label={textContent:'Energía (0–10)Seleccionar puntuación…0123456789100 muy baja',
    childNodes:[{nodeType:3,textContent:'Energía (0–10)'},
      {nodeType:1,textContent:'Seleccionar puntuación…0123456789100 muy baja'}],
    querySelector:()=>({})};
  const {form,feedback}=progress(field('energy',label));
  assert.equal(feedback.textContent,'0 de 1 datos necesarios completos · siguiente: Energía (0–10).');
  assert.doesNotMatch(feedback.textContent,/Seleccionar puntuación|012345678910/);
  syncGuidedWorkflowProgress(form);
  assert.equal(feedback.writes,1);
});
test('B22 aria-label fallback cannot leak score option text',()=>{
  const label={textContent:'012345678910',
    childNodes:[{nodeType:1,textContent:'012345678910'}],
    querySelector:()=>({})};
  const control=field('score',label);
  control.getAttribute=k=>k==='aria-label'?'Puntuación percibida':null;
  const {feedback}=progress(control);
  assert.match(feedback.textContent,/siguiente: Puntuación percibida\./);
  assert.doesNotMatch(feedback.textContent,/012345678910/);
});
test('B22 KPI and status responsive typography live in existing final stylesheet',()=>{
  const route=readFileSync('src/m26/modules/route-render.js','utf8');
  const css=readFileSync('src/m26/design/iberfit-premium-v3.css','utf8');
  assert.match(route,/strong\$\{String\(value\?\?""\)\.trim\(\)\.length>14/);
  assert.match(css,/\.m26-route \.m26-stat strong\.is-text/);
  assert.match(css,/overflow-wrap:anywhere/);
  assert.match(css,/\.m26-route-intro > \.m26-badge/);
  assert.match(css,/align-self:flex-start/);
  assert.match(css,/data-m26-role="coach"\] \.m26-content-grid/);
  assert.match(css,/@media\(forced-colors:active\)/);
});
