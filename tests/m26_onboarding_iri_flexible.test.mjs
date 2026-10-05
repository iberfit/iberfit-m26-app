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
  assert.equal(payload.inviteClient,true);
  assert.equal(payload.onboardingVersion,'m26-v12.4-invitation');
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
