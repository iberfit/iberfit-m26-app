import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fillEmptyControls,
  firstNeededControl,
  focusFirstNeededControl,
  guidedRequiredProgress,
  pendingRequiredControls,
  setControlGroupApplicable,
} from '../src/m26/ui/guided-input.js';

function control(name,value='',options={}){
  return {
    name,
    value,
    type:options.type||'text',
    required:Boolean(options.required),
    disabled:Boolean(options.disabled),
    hidden:false,
    checked:Boolean(options.checked),
    focusCalls:0,
    getAttribute(attribute){
      if(attribute==='name')return this.name;
      if(attribute==='aria-hidden')return null;
      return null;
    },
    closest(){return null;},
    checkValidity(){
      if(!this.required)return true;
      return String(this.value||'').trim().length>0;
    },
    focus(){this.focusCalls+=1;},
    setAttribute(){},
    removeAttribute(){},
  };
}

test('guided autofill only fills empty available controls and never overwrites human input',()=>{
  const name=control('name','Carlos',{required:true});
  const zone=control('zone','');
  const disabled=control('address','',{disabled:true});
  const root={querySelectorAll(){return [name,zone,disabled];}};
  const changed=fillEmptyControls(root,{name:'Otro nombre',zone:'Las Condes',address:'Dirección'});
  assert.deepEqual(changed,['zone']);
  assert.equal(name.value,'Carlos');
  assert.equal(zone.value,'Las Condes');
  assert.equal(disabled.value,'');
});

test('guided required progress ignores hidden or disabled controls and exposes the first real pending field',()=>{
  const name=control('name','Carlos',{required:true});
  const email=control('email','',{required:true});
  const hidden=control('trainingAddress','',{required:true});
  hidden.closest=()=>({hidden:true});
  const disabled=control('weeklyFrequency','',{required:true,disabled:true});
  const root={querySelectorAll(){return [name,email,hidden,disabled];}};
  const pending=pendingRequiredControls(root);
  assert.deepEqual(pending,[email]);
  const progress=guidedRequiredProgress(root);
  assert.equal(progress.total,2);
  assert.equal(progress.completedCount,1);
  assert.equal(progress.pendingCount,1);
  assert.equal(progress.first,email);
  assert.equal(progress.complete,false);
});

test('first needed prioritizes invalid required control and focus helper targets it',()=>{
  const email=control('email','',{required:true});
  const phone=control('phone','');
  const root={querySelectorAll(){return [phone,email];}};
  assert.equal(firstNeededControl(root,{requiredOnly:true}),email);
  assert.equal(focusFirstNeededControl(root,{requiredOnly:true}),email);
  assert.equal(email.focusCalls,1);
});

test('dependent groups hide and disable without clearing preserved values',()=>{
  const field=control('address','Av. Apoquindo 1');
  const wrapper={
    hidden:false,
    attrs:new Map(),
    querySelectorAll(){return [field];},
    setAttribute(name,value){this.attrs.set(name,value);},
  };
  assert.equal(setControlGroupApplicable(wrapper,false),false);
  assert.equal(wrapper.hidden,true);
  assert.equal(field.disabled,true);
  assert.equal(field.value,'Av. Apoquindo 1');
  assert.equal(setControlGroupApplicable(wrapper,true),true);
  assert.equal(wrapper.hidden,false);
  assert.equal(field.disabled,false);
  assert.equal(field.value,'Av. Apoquindo 1');
});
