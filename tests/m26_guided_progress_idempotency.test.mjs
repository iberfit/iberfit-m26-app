import test from 'node:test';
import assert from 'node:assert/strict';

import {syncGuidedWorkflowProgress} from '../src/m26/app/workflow-controller.js';

function requiredControl({name='email',value='',valid=false}={}){
  return {
    name,
    value,
    required:true,
    disabled:false,
    hidden:false,
    type:'text',
    labels:[{textContent:'Correo electrónico'}],
    getAttribute(attribute){return attribute==='aria-hidden'?null:null;},
    closest(selector){
      if(selector==='[hidden],[aria-hidden="true"]')return null;
      if(selector==='label')return {textContent:'Correo electrónico'};
      return null;
    },
    checkValidity(){return valid;},
  };
}

function progressNode(){
  let text='';
  let writes=0;
  return {
    hidden:false,
    dataset:{},
    get textContent(){return text;},
    set textContent(value){text=String(value);writes+=1;},
    get writes(){return writes;},
  };
}

test('guided progress is idempotent so MutationObserver scans cannot self-loop',()=>{
  const control=requiredControl();
  const node=progressNode();
  const form={
    matches(selector){return selector==='[data-guided-required-form]';},
    querySelector(selector){return selector==='[data-guided-required-progress]'?node:null;},
    querySelectorAll(selector){return selector==='input,select,textarea'?[control]:[];},
  };

  const first=syncGuidedWorkflowProgress(form);
  assert.equal(first.pendingCount,1);
  assert.equal(node.dataset.status,'pending');
  assert.equal(node.writes,1);

  const second=syncGuidedWorkflowProgress(form);
  assert.equal(second.pendingCount,1);
  assert.equal(node.writes,1,'same progress must not rewrite textContent and retrigger childList observers');
});

test('guided progress only mutates again when the actual completion state changes',()=>{
  const control=requiredControl();
  const node=progressNode();
  const form={
    matches(){return true;},
    querySelector(){return node;},
    querySelectorAll(){return [control];},
  };

  syncGuidedWorkflowProgress(form);
  assert.equal(node.writes,1);
  control.value='client@example.com';
  control.checkValidity=()=>true;
  syncGuidedWorkflowProgress(form);
  assert.equal(node.writes,2);
  assert.equal(node.dataset.status,'success');
  syncGuidedWorkflowProgress(form);
  assert.equal(node.writes,2);
});
