import {createWorkflowController as createBaseWorkflowController} from './workflow-controller-base.js';
export * from './workflow-controller-base.js';

const ONBOARDING_SELECTOR='[data-workflow-form="client-onboarding"]';
const IRI_ONLY_REQUIRED_FIELDS=Object.freeze(['sexForNorms','weeklyFrequency','sessionDurationMinutes','primaryObjective']);

function named(form,name){return form?.elements?.namedItem?.(name)||form?.querySelector?.(`[name="${name}"]`)||null;}

export function onboardingAssessmentMode(form){
  const field=named(form,'initialAssessmentMode');
  const value=String(field?.value||'').trim().toLowerCase();
  return value==='deferred'?'deferred':'iri';
}

export function onboardingPostCreateArea(form){return onboardingAssessmentMode(form)==='deferred'?'expediente':'iri';}

function setRequired(field,required){
  if(!field)return;
  field.required=Boolean(required);
  if(required)field.setAttribute?.('required','');else field.removeAttribute?.('required');
}

export function syncFlexibleOnboardingForm(form){
  if(!form)return 'iri';
  const mode=onboardingAssessmentMode(form);
  const deferred=mode==='deferred';
  for(const name of IRI_ONLY_REQUIRED_FIELDS)setRequired(named(form,name),!deferred);
  const modality=String(named(form,'modality')?.value||'').trim().toLowerCase();
  setRequired(named(form,'trainingAddress'),!deferred&&['presencial','hibrido'].includes(modality));
  const phase=named(form,'phase');
  if(phase){
    if(deferred&&(!phase.value||phase.value==='Evaluación inicial'))phase.value='Inicio operativo';
    else if(!deferred&&phase.value==='Inicio operativo')phase.value='Evaluación inicial';
  }
  const submit=form.querySelector?.('[data-onboarding-submit]');
  if(submit)submit.textContent=deferred?'Crear expediente y empezar a trabajar':'Crear expediente y abrir evaluación IRI';
  const copy=form.querySelector?.('[data-onboarding-next-copy]');
  if(copy)copy.innerHTML=deferred
    ?'<strong>Inicio operativo.</strong> El IRI queda disponible para realizarlo más adelante sin bloquear planificación, agenda ni sesiones.'
    :'<strong>Evaluación IRI.</strong> Tras crear el expediente se abrirá la primera sesión de evaluación.';
  return mode;
}

function navigationAwareStore(store,root){
  if(!store||typeof Proxy!=='function')return store;
  return new Proxy(store,{
    get(target,property){
      if(property==='navigate')return (area,...args)=>{
        const requested=String(area||'');
        const form=root?.querySelector?.(ONBOARDING_SELECTOR);
        const destination=requested==='iri'&&form?onboardingPostCreateArea(form):requested;
        return target.navigate?.(destination,...args);
      };
      const value=Reflect.get(target,property,target);
      return typeof value==='function'?value.bind(target):value;
    },
  });
}

export function createWorkflowController(options={}){
  const {root,store}=options;
  const controller=createBaseWorkflowController({...options,store:navigationAwareStore(store,root)});
  let observer=null,mounted=false;
  const syncCurrent=()=>syncFlexibleOnboardingForm(root?.querySelector?.(ONBOARDING_SELECTOR));
  const onFormChange=(event)=>{if(event.target?.closest?.(ONBOARDING_SELECTOR))queueMicrotask(syncCurrent);};
  return Object.freeze({
    mount(){
      if(mounted)return;
      controller.mount();
      root?.addEventListener?.('change',onFormChange);
      root?.addEventListener?.('input',onFormChange);
      if(typeof MutationObserver==='function'&&root){observer=new MutationObserver(syncCurrent);observer.observe(root,{childList:true,subtree:true});}
      queueMicrotask(syncCurrent);
      mounted=true;
    },
    destroy(){
      if(!mounted)return;
      observer?.disconnect?.();observer=null;
      root?.removeEventListener?.('change',onFormChange);
      root?.removeEventListener?.('input',onFormChange);
      controller.destroy();
      mounted=false;
    },
  });
}
