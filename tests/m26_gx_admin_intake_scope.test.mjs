import test from 'node:test';
import assert from 'node:assert/strict';
import {__clientCreateWizardInternals as w,createClientCreateWizard} from '../src/m26/admin/client-create-wizard.js';
function mockForm(){
  const status={textContent:''};
  const panel={contains:n=>n===subgroup,querySelectorAll:()=>[control]};
  const subgroup={};
  const control={name:'name',value:'Persona sintética',type:'text',willValidate:true,validity:{valid:false},closest:()=>panel};
  const form={elements:[control],dataset:{clientCurrentStep:'2'},querySelector:s=>s==='[data-client-step="1"]'?panel:s==='[data-client-draft-status]'?status:null,querySelectorAll:()=>[],reset(){control.value='';}};
  return {form,control,panel,subgroup,status};
}
function memory(){const map=new Map();return {map,getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
test('GX331 hidden navigation step still validates mandatory input',()=>{const {form,control}=mockForm();assert.equal(w.firstInvalid(form,1),control)});
test('GX331 hidden inapplicable subgroup and disabled control are skipped',()=>{const {form,control,subgroup}=mockForm();control.closest=()=>subgroup;assert.equal(w.firstInvalid(form,1),null);control.closest=()=>null;control.disabled=true;assert.equal(w.firstInvalid(form,1),null)});
test('GX331 valid control in hidden step does not block',()=>{const {form,control}=mockForm();control.validity.valid=true;assert.equal(w.firstInvalid(form,1),null)});
test('GX331 storage failure is not falsely reported as saved',()=>{const {form,status}=mockForm();assert.equal(w.writeDraft({setItem(){throw Error('quota')}},'key',form),null);assert.match(status.textContent,/No se pudo/);assert.equal(w.writeDraft(null,'key',form),null)});
test('GX331 successful storage still preserves draft shape',()=>{const {form,status}=mockForm(),storage=memory(),key=w.keyFor('org:a:actor:b');assert.equal(w.writeDraft(storage,key,form).fields.name,'Persona sintética');assert.match(status.textContent,/guardado automáticamente/);assert.equal(JSON.parse(storage.getItem(key)).fields.name,'Persona sintética')});
test('GX331 delayed save cannot follow changed operator scope',()=>{const {form,control}=mockForm(),storage=memory(),listeners=new Map();let scope='org:a:actor:b';const root={addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k),querySelectorAll:()=>[form]};control.closest=()=>form;const wizard=createClientCreateWizard({root,storage,persistentStorage:null,getScopeKey:()=>scope});wizard.mount();listeners.get('input')({target:control,type:'input'});scope='org:a:actor:c';listeners.get('m26:shell-rendered')();assert.equal(storage.map.size,0);assert.equal(control.value,'');wizard.destroy()});
test('GX331 no verified operator scope means no local persistence or submission',()=>{const {form}=mockForm(),storage=memory();const root={addEventListener(){},removeEventListener(){},querySelectorAll:()=>[form]};const wizard=createClientCreateWizard({root,storage,persistentStorage:null,getScopeKey:()=>''});wizard.mount();assert.equal(wizard.save(form),null);assert.equal(wizard.validateForSubmit(form),false);assert.equal(storage.map.size,0);wizard.destroy()});

test('GX331 rejects malformed draft fields before restoration',()=>{for(const fields of [null,[]]){const storage=memory();const key=w.keyFor('org:a:actor:b');storage.setItem(key,JSON.stringify({schema:w.DRAFT_SCHEMA,fields,savedAt:new Date().toISOString()}));assert.equal(w.readDraft(storage,key),null);assert.equal(storage.map.has(key),false)}});
