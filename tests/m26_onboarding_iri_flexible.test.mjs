import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyClientDraftPayload,validateClientOnboardingDraft} from '../src/m26/workflows/client-onboarding.js';
import {initialAssessmentModeFrom,initialAssessmentPostCreateArea,isIriDeferred} from '../src/m26/domain/initial-assessment.js';
import {onboardingChoiceMarkup,onboardingPostCreateArea,syncFlexibleOnboardingForm} from '../src/m26/onboarding/progressive-onboarding.js';

const minimal={name:'Ana Pérez',email:'ana@example.com',phone:'+56911111111',birthDate:'1990-02-03',modality:'online'};

test('el comportamiento heredado sigue exigiendo IRI cuando no hay decisión explícita',()=>{
  const check=validateClientOnboardingDraft(minimal);
  assert.equal(check.ok,false);
  assert.equal(check.value.initialAssessmentMode,'iri');
  assert.ok(check.errors.includes('sexForNorms'));
  assert.ok(check.errors.includes('weeklyFrequency'));
  assert.ok(check.errors.includes('sessionDurationMinutes'));
  assert.ok(check.errors.includes('primaryObjective'));
});

test('deferred crea un expediente operativo mínimo sin fingir un IRI completado',()=>{
  const payload=legacyClientDraftPayload({...minimal,initialAssessmentMode:'deferred'});
  assert.equal(payload.initialAssessmentMode,'deferred');
  assert.equal(payload.profile.initialAssessmentMode,'deferred');
  assert.equal(payload.phase,'Inicio operativo');
  assert.equal(payload.accessEnabled,false);
  assert.equal(payload.inviteClient,false);
  assert.equal(payload.onboardingVersion,'m26-v12.5-expediente');
  assert.equal(Object.hasOwn(payload,'iriConfirmed'),false);
  assert.equal(isIriDeferred(payload),true);
  assert.equal(initialAssessmentModeFrom(payload),'deferred');
});

test('la superficie de alta ofrece las dos rutas sin eliminar el IRI',()=>{
  const html=onboardingChoiceMarkup();
  assert.match(html,/Realizar Diagnóstico IRI/);
  assert.match(html,/Posponer el IRI/);
  assert.match(html,/name="initialAssessmentMode" value="iri" checked/);
  assert.match(html,/name="initialAssessmentMode" value="deferred"/);
});

test('la navegación posterior respeta la decisión explícita',()=>{
  const form=(value)=>({elements:{namedItem:(name)=>name==='initialAssessmentMode'?{value}:null}});
  assert.equal(onboardingPostCreateArea(form('deferred')),'expediente');
  assert.equal(onboardingPostCreateArea(form('iri')),'iri');
  assert.equal(onboardingPostCreateArea(null),'iri');
});

test('la política de destino es única y mantiene IRI como fallback recomendado',()=>{
  assert.equal(initialAssessmentPostCreateArea('iri'),'iri');
  assert.equal(initialAssessmentPostCreateArea('deferred'),'expediente');
  assert.equal(initialAssessmentPostCreateArea(''),'iri');
  assert.equal(initialAssessmentPostCreateArea('desconocido'),'iri');
});

test('deferred relaja sólo los campos propios del IRI y mantiene identidad básica',()=>{
  const fields=new Map();
  const control=(value='')=>{
    const wrapper={hidden:false,attrs:new Map(),querySelectorAll(){return [field];},setAttribute(name,next){this.attrs.set(name,next);}};
    const field={
      value,
      required:true,
      disabled:false,
      closest(selector){return selector==='label'?wrapper:null;},
      setAttribute(name){if(name==='required')this.required=true;},
      removeAttribute(name){if(name==='required')this.required=false;if(name==='aria-disabled')wrapper.attrs.delete(name);},
    };
    return field;
  };
  for(const name of ['sexForNorms','weeklyFrequency','sessionDurationMinutes','primaryObjective','trainingAddress','phase'])fields.set(name,control(name==='phase'?'Evaluación inicial':''));
  fields.set('modality',control('presencial'));
  fields.set('initialAssessmentMode',control('deferred'));
  const form={elements:{namedItem:(name)=>fields.get(name)||null},querySelector:()=>null};
  assert.equal(syncFlexibleOnboardingForm(form),'deferred');
  for(const name of ['sexForNorms','weeklyFrequency','sessionDurationMinutes','primaryObjective','trainingAddress'])assert.equal(fields.get(name).required,false,name);
  assert.equal(fields.get('phase').value,'Inicio operativo');
  fields.get('initialAssessmentMode').value='iri';
  assert.equal(syncFlexibleOnboardingForm(form),'iri');
  for(const name of ['sexForNorms','weeklyFrequency','sessionDurationMinutes','primaryObjective','trainingAddress'])assert.equal(fields.get(name).required,true,name);
  assert.equal(fields.get('phase').value,'Evaluación inicial');
});

test('onboarding oculta dirección cuando no aplica sin borrar el valor humano',()=>{
  const wrapper={
    hidden:false,
    querySelectorAll(){return [address];},
    setAttribute(){},
  };
  const address={
    value:'Av. Apoquindo 1234',
    required:true,
    disabled:false,
    closest(selector){return selector==='label'?wrapper:null;},
    setAttribute(name){if(name==='required')this.required=true;},
    removeAttribute(name){if(name==='required')this.required=false;},
  };
  const controls={
    initialAssessmentMode:{value:'iri'},
    modality:{value:'online'},
    trainingAddress:address,
    sexForNorms:{required:true,setAttribute(){},removeAttribute(){}},
    weeklyFrequency:{required:true,setAttribute(){},removeAttribute(){}},
    sessionDurationMinutes:{required:true,setAttribute(){},removeAttribute(){}},
    primaryObjective:{required:true,setAttribute(){},removeAttribute(){}},
    phase:{value:'Evaluación inicial'},
  };
  const form={elements:{namedItem:(name)=>controls[name]||null},querySelector:()=>null};

  syncFlexibleOnboardingForm(form);
  assert.equal(wrapper.hidden,true);
  assert.equal(address.disabled,true);
  assert.equal(address.value,'Av. Apoquindo 1234');

  controls.modality.value='presencial';
  syncFlexibleOnboardingForm(form);
  assert.equal(wrapper.hidden,false);
  assert.equal(address.disabled,false);
  assert.equal(address.value,'Av. Apoquindo 1234');
});


test('onboarding guía por los datos obligatorios reales y oculta toda la logística física en online',()=>{
  const makeControl=(name,{value='',required=false}={})=>({
    name,
    value,
    required,
    disabled:false,
    type:'text',
    checked:false,
    setAttribute(attr){if(attr==='required')this.required=true;},
    removeAttribute(attr){if(attr==='required')this.required=false;},
    getAttribute(attr){return attr==='name'?this.name:null;},
    closest(selector){return selector==='label'?wrappers.get(name)||null:null;},
    checkValidity(){return !this.required||String(this.value||'').trim().length>0;},
  });
  const wrappers=new Map();
  const controls={
    initialAssessmentMode:makeControl('initialAssessmentMode',{value:'iri'}),
    modality:makeControl('modality',{value:'online',required:true}),
    sexForNorms:makeControl('sexForNorms',{value:'female',required:true}),
    weeklyFrequency:makeControl('weeklyFrequency',{value:'',required:true}),
    sessionDurationMinutes:makeControl('sessionDurationMinutes',{value:'60',required:true}),
    primaryObjective:makeControl('primaryObjective',{value:'Mejorar fuerza general',required:true}),
    trainingAddress:makeControl('trainingAddress',{value:'Av. Apoquindo 1234',required:true}),
    commune:makeControl('commune',{value:'Las Condes'}),
    locationType:makeControl('locationType',{value:'Gimnasio'}),
    accessInstructions:makeControl('accessInstructions',{value:'Avisar en recepción'}),
    phase:makeControl('phase',{value:'Evaluación inicial'}),
  };
  for(const name of ['trainingAddress','commune','locationType','accessInstructions']){
    const wrapper={
      hidden:false,
      attrs:new Map(),
      matches(selector){return selector==='[data-onboarding-location-only]';},
      querySelectorAll(){return [controls[name]];},
      setAttribute(name,value){this.attrs.set(name,value);},
    };
    wrappers.set(name,wrapper);
  }
  const submit={textContent:''};
  const copy={innerHTML:''};
  const all=Object.values(controls);
  const form={
    dataset:{},
    elements:{namedItem:(name)=>controls[name]||null},
    querySelector(selector){
      if(selector==='[data-onboarding-submit]')return submit;
      if(selector==='[data-onboarding-next-copy]')return copy;
      return null;
    },
    querySelectorAll(selector){
      if(selector==='[data-onboarding-location-only]')return [...wrappers.values()];
      if(selector==='input,select,textarea')return all;
      return [];
    },
  };

  assert.equal(syncFlexibleOnboardingForm(form),'iri');
  for(const wrapper of wrappers.values())assert.equal(wrapper.hidden,true);
  for(const name of ['trainingAddress','commune','locationType','accessInstructions'])assert.equal(controls[name].disabled,true,name);
  assert.equal(controls.trainingAddress.value,'Av. Apoquindo 1234');
  assert.equal(form.dataset.onboardingPendingRequired,'1');
  assert.equal(submit.textContent,'Completar 1 dato obligatorio');
  assert.match(copy.innerHTML,/Borrador protegido/);

  controls.weeklyFrequency.value='2';
  assert.equal(syncFlexibleOnboardingForm(form),'iri');
  assert.equal(form.dataset.onboardingPendingRequired,'0');
  assert.equal(submit.textContent,'Crear expediente y abrir evaluación IRI');
  assert.match(copy.innerHTML,/Evaluación IRI/);
});
