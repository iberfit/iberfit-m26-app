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

export function onboardingChoiceMarkup(){
  return `<section class="m26-form-section m26-panel-soft" data-onboarding-assessment-choice>
    <div class="m26-form-section-title"><span>→</span><div><h3>¿Cómo quieres empezar?</h3><p>El IRI aporta un diagnóstico más completo, pero no bloquea el inicio del trabajo. Puedes realizarlo después.</p></div></div>
    <div class="m26-field-grid">
      <label class="m26-consent"><input type="radio" name="initialAssessmentMode" value="deferred" checked> <span><strong>Empezar a trabajar</strong><small> Crea el expediente con los datos esenciales y continúa directamente con planificación, agenda y sesiones.</small></span></label>
      <label class="m26-consent"><input type="radio" name="initialAssessmentMode" value="iri"> <span><strong>Realizar evaluación IRI</strong><small> Crea el expediente y abre inmediatamente la evaluación inicial IBERFIT.</small></span></label>
    </div>
  </section>`;
}

export function ensureFlexibleOnboardingUi(form){
  if(!form)return false;
  if(!form.querySelector?.('[data-onboarding-assessment-choice]'))form.insertAdjacentHTML?.('afterbegin',onboardingChoiceMarkup());
  const action=form.querySelector?.('[data-workflow-action="create-client-draft"]');
  if(action){action.setAttribute?.('data-onboarding-submit','');}
  const sticky=action?.closest?.('.m26-sticky-actions');
  const copy=sticky?.querySelector?.('p');
  if(copy)copy.setAttribute?.('data-onboarding-next-copy','');
  return true;
}

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
  const syncCurrent=()=>{
    const form=root?.querySelector?.(ONBOARDING_SELECTOR);
    if(!form)return;
    ensureFlexibleOnboardingUi(form);
    syncFlexibleOnboardingForm(form);
  };
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
