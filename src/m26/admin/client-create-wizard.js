const DRAFT_SCHEMA='iberfit.admin.client-create-draft.v4';
const DRAFT_PREFIX='iberfit:m26:admin-client-create:v4:';
const LEGACY_DRAFT_PREFIX='iberfit:m26:admin-client-create:v3:';
const LEGACY_DRAFT_PREFIX_V2='iberfit:m26:admin-client-create:v2:';
const DRAFT_MAX_AGE_MS=8*60*60*1000;
const DRAFT_FUTURE_SKEW_MS=5*60*1000;
const INPUT_SAVE_DELAY_MS=250;
const DEFAULT_STEP=1;
const MAX_STEP=5;

function safeStorage(storage){
  if(!storage)return null;
  try{
    const probe='__iberfit_client_draft_probe__';
    storage.setItem(probe,'1');
    storage.removeItem(probe);
    return storage;
  }catch{return null;}
}
function globalStorage(name){
  try{return safeStorage(globalThis[name]);}catch{return null;}
}
function defaultDraftStorage(){
  return globalStorage('sessionStorage');
}
function defaultPersistentStorage(){
  return globalStorage('localStorage');
}

function clampStep(value){
  const n=Number(value);
  return Number.isInteger(n)?Math.max(1,Math.min(MAX_STEP,n)):DEFAULT_STEP;
}
function safeScope(scopeKey){
  return String(scopeKey||'default').replace(/[^A-Za-z0-9._:-]/g,'_').slice(0,120)||'default';
}
function keyFor(scopeKey){
  return `${DRAFT_PREFIX}${safeScope(scopeKey)}`;
}
function legacyKeyFor(scopeKey){
  return `${LEGACY_DRAFT_PREFIX}${safeScope(scopeKey)}`;
}
function legacyV2KeyFor(scopeKey){
  return `${LEGACY_DRAFT_PREFIX_V2}${safeScope(scopeKey)}`;
}
function removeStored(storage,key){
  try{storage?.removeItem?.(key);}catch{}
}
function fieldValue(control){
  if(!control?.name)return null;
  if(control.type==='checkbox')return control.checked?'1':'0';
  if(control.type==='radio')return control.checked?String(control.value||''):null;
  return String(control.value??'');
}
function collect(form){
  const fields={};
  for(const control of form?.elements||[]){
    if(!control?.name||['submit','button','reset','file'].includes(String(control.type||'').toLowerCase()))continue;
    const value=fieldValue(control);
    if(value===null)continue;
    fields[control.name]=value;
  }
  return Object.freeze(fields);
}
function assign(form,fields={}){
  for(const control of form?.elements||[]){
    if(!control?.name||!(control.name in fields))continue;
    const value=String(fields[control.name]??'');
    if(control.type==='checkbox')control.checked=value==='1'||value==='true';
    else if(control.type==='radio')control.checked=String(control.value||'')===value;
    else control.value=value;
  }
}
function stepControls(form,step){
  const panel=form?.querySelector?.(`[data-client-step="${step}"]`);
  return panel?[...(panel.querySelectorAll?.('input,select,textarea')||[])]:[];
}
function firstInvalid(form,step){
  return stepControls(form,step).find((control)=>{
    if(control.disabled||control.closest?.('[hidden]'))return false;
    return typeof control.checkValidity==='function'&&!control.checkValidity();
  })||null;
}
function labelFor(form,name,fallback='Sin completar'){
  const control=form?.elements?.namedItem?.(name);
  if(!control)return fallback;
  const RadioList=globalThis.RadioNodeList;
  if(typeof RadioList==='function'&&control instanceof RadioList){
    const value=String(control.value||'').trim();
    return value||fallback;
  }
  if(control.tagName==='SELECT'){
    const option=control.options?.[control.selectedIndex];
    const text=String(option?.textContent||'').trim();
    return text&&String(option?.value||'')?text:fallback;
  }
  const value=String(control.value||'').trim();
  return value||fallback;
}
function updateReview(form){
  const iriEntry=String(form?.elements?.namedItem?.('serviceIntent')?.value||'training')==='iri';
  const accessMode=String(form?.elements?.namedItem?.('accessMode')?.value||'');
  const maps={
    identity:['name','email','phone'],
    objective:['objective','level'],
    safety:['restrictions','pain','emergencyContactName'],
  };
  for(const node of form?.querySelectorAll?.('[data-client-review]')||[]){
    const key=String(node.getAttribute('data-client-review')||'');
    let values=[];
    if(key==='service'){
      const names=iriEntry
        ?['serviceIntent','modality','coachUserId']
        :['serviceIntent','modality','weeklyFrequency','sessionDurationMinutes','coachUserId'];
      values=names.map((name)=>labelFor(form,name,'')).filter(Boolean);
      values.push(accessMode==='internal'?'Expediente interno · sin invitación':'Acceso IBERFIT · invitación');
    }else{
      const names=maps[key]||[key];
      values=names.map((name)=>labelFor(form,name,'')).filter(Boolean);
    }
    node.textContent=values.length?values.join(' · '):'Sin completar';
  }
}
function setCopy(node,text){
  if(node)node.textContent=text;
}
function updateServiceIntent(form){
  const intent=String(form?.elements?.namedItem?.('serviceIntent')?.value||'training');
  const iriEntry=intent==='iri';
  form.dataset.clientServiceIntent=intent;

  for(const wrapper of form?.querySelectorAll?.('[data-client-training-only]')||[]){
    wrapper.hidden=iriEntry;
    wrapper.setAttribute?.('aria-hidden',iriEntry?'true':'false');
    for(const field of wrapper.querySelectorAll?.('input,select,textarea')||[]){
      field.disabled=iriEntry;
      field.required=!iriEntry;
      if(iriEntry)field.removeAttribute?.('required');else field.setAttribute?.('required','');
      field.setAttribute?.('aria-required',iriEntry?'false':'true');
    }
  }

  for(const field of form?.querySelectorAll?.('[data-client-iri-required]')||[]){
    field.required=iriEntry;
    if(iriEntry)field.setAttribute?.('required','');else field.removeAttribute?.('required');
    field.setAttribute?.('aria-required',iriEntry?'true':'false');
  }
  for(const copy of form?.querySelectorAll?.('[data-client-iri-required-copy]')||[])copy.hidden=!iriEntry;

  const assessment=form?.elements?.namedItem?.('initialAssessmentMode');
  if(assessment){
    const deferred=[...(assessment.options||[])].find((option)=>option.value==='deferred');
    if(iriEntry)assessment.value='iri';
    assessment.disabled=iriEntry;
    assessment.setAttribute?.('aria-disabled',iriEntry?'true':'false');
    if(deferred){
      deferred.disabled=iriEntry;
      if(iriEntry)deferred.setAttribute?.('disabled','');else deferred.removeAttribute?.('disabled');
      deferred.hidden=iriEntry;
    }
  }

  const accessMode=form?.elements?.namedItem?.('accessMode');
  const accessExplicit=form?.elements?.namedItem?.('accessModeExplicit');
  if(accessMode&&String(accessExplicit?.value||'')!=='1'){
    accessMode.value=iriEntry?'internal':'app';
  }
  const internal=String(accessMode?.value||'')==='internal';

  const notice=form?.querySelector?.('[data-client-service-mode-notice]');
  if(notice)notice.hidden=!iriEntry;
  setCopy(form?.querySelector?.('[data-client-create-heading]'),iriEntry?'Crear persona para IRI':'Crear cliente');
  setCopy(form?.querySelector?.('[data-client-create-intro]'),iriEntry
    ?'Crea una persona y abre su Diagnóstico IRI. El entrenamiento es una relación independiente y podrá activarse más adelante sin recrear el expediente.'
    :'Completa el expediente por etapas. Puedes volver atrás y el borrador se conserva temporalmente durante esta sesión de IBERFIT.');
  setCopy(form?.querySelector?.('[data-client-address-label]'),iriEntry?'Dirección / lugar de evaluación':'Dirección de entrenamiento');
  setCopy(form?.querySelector?.('[data-client-schedule-label]'),iriEntry?'Disponibilidad puntual para la evaluación':'Disponibilidad recurrente / horario');
  setCopy(form?.querySelector?.('[data-client-objective-label]'),iriEntry?'Motivo principal de la evaluación':'Objetivo principal');
  setCopy(form?.querySelector?.('[data-client-equipment-label]'),iriEntry?'Material disponible para el IRI':'Material disponible');
  setCopy(form?.querySelector?.('[data-client-preferences-label]'),iriEntry?'Observaciones o preferencias para la evaluación':'Preferencias / observaciones');
  setCopy(form?.querySelector?.('[data-client-access-copy]'),internal
    ?'Se guardará el expediente sin crear usuario ni enviar correo de acceso. Podrás habilitarlo después.'
    :'Se enviará una invitación segura para consultar IBERFIT.');

  const outcome=form?.querySelector?.('[data-client-create-outcome] p');
  if(outcome)outcome.textContent=iriEntry
    ?internal
      ?'Se creará una persona con Diagnóstico IRI y sin servicio de entrenamiento activo. No se enviará invitación. El Coach responsable, si lo asignas, podrá completar el IRI y gestionar sus documentos privados.'
      :'Se creará una persona con Diagnóstico IRI y sin servicio de entrenamiento activo. Se enviará acceso IBERFIT para consultar su evaluación e informe.'
    :internal
      ?'Se creará el expediente de entrenamiento sin enviar invitación. El acceso podrá habilitarse posteriormente.'
      :'Se creará el expediente de entrenamiento y se enviará el acceso IBERFIT mediante autenticación alojada.';

  const submit=form?.querySelector?.('[data-client-create-submit]');
  if(submit)submit.textContent=iriEntry
    ?'Crear persona para IRI'
    :internal?'Crear cliente sin invitar':'Crear cliente y enviar acceso';
  updateReview(form);
  return iriEntry;
}

function setStep(form,step,{focus=false}={}){
  const next=clampStep(step);
  form.dataset.clientCurrentStep=String(next);
  for(const panel of form.querySelectorAll?.('[data-client-step]')||[]){
    const value=Number(panel.getAttribute('data-client-step'));
    panel.hidden=value!==next;
    panel.setAttribute('aria-hidden',value===next?'false':'true');
  }
  for(const item of form.querySelectorAll?.('[data-client-step-indicator]')||[]){
    const value=Number(item.getAttribute('data-client-step-indicator'));
    if(value===next)item.setAttribute('aria-current','step');
    else item.removeAttribute('aria-current');
    item.classList?.toggle?.('is-complete',value<next);
  }
  const current=form.querySelector?.(`[data-client-step="${next}"]`);
  if(current){
    const heading=current.querySelector?.('h4,[data-client-step-title]');
    if(focus)heading?.focus?.();
  }
  updateReview(form);
  return next;
}
function readDraft(storage,key,{now=Date.now(),maxAgeMs=DRAFT_MAX_AGE_MS}={}){
  try{
    const parsed=JSON.parse(storage?.getItem?.(key)||'null');
    if(parsed?.schema!==DRAFT_SCHEMA||typeof parsed?.fields!=='object'){
      removeStored(storage,key);
      return null;
    }
    const savedAt=Date.parse(String(parsed.savedAt||''));
    const current=Number(now);
    const maxAge=Number(maxAgeMs);
    if(!Number.isFinite(savedAt)||!Number.isFinite(current)||!Number.isFinite(maxAge)||maxAge<1||
      savedAt>current+DRAFT_FUTURE_SKEW_MS||current-savedAt>maxAge){
      removeStored(storage,key);
      return null;
    }
    return parsed;
  }catch{
    removeStored(storage,key);
    return null;
  }
}
function writeDraft(storage,key,form){
  const payload={
    schema:DRAFT_SCHEMA,
    step:clampStep(form.dataset.clientCurrentStep),
    fields:collect(form),
    savedAt:new Date().toISOString(),
  };
  try{storage?.setItem?.(key,JSON.stringify(payload));}catch{}
  const status=form.querySelector?.('[data-client-draft-status]');
  if(status)status.textContent='Borrador guardado automáticamente';
  return payload;
}

export function createClientCreateWizard({
  root,
  storage=defaultDraftStorage(),
  persistentStorage=defaultPersistentStorage(),
  getScopeKey=()=> 'default',
}={}){
  if(!root?.addEventListener)throw new Error('M26_CLIENT_CREATE_WIZARD_ROOT_REQUIRED');
  let mounted=false;
  let saveTimer=null;
  let pendingForm=null;
  const draftKey=()=>keyFor(getScopeKey?.());
  function clearPersistentDraftResidue(){
    if(!persistentStorage||persistentStorage===storage)return;
    removeStored(persistentStorage,legacyKeyFor(getScopeKey?.()));
    removeStored(persistentStorage,legacyV2KeyFor(getScopeKey?.()));
    removeStored(persistentStorage,keyFor(getScopeKey?.()));
  }
  function cancelScheduledSave(){
    if(saveTimer!==null)globalThis.clearTimeout?.(saveTimer);
    saveTimer=null;
    pendingForm=null;
  }

  function initialize(form){
    if(!form||form.dataset.clientWizardReady==='true')return false;
    form.dataset.clientWizardReady='true';
    clearPersistentDraftResidue();
    const draft=readDraft(storage,draftKey());
    if(draft){
      assign(form,draft.fields);
      const status=form.querySelector?.('[data-client-draft-status]');
      if(status)status.textContent='Borrador recuperado';
      updateServiceIntent(form);
      setStep(form,draft.step||DEFAULT_STEP);
    }else{
      updateServiceIntent(form);
      setStep(form,DEFAULT_STEP);
    }
    updateReview(form);
    return true;
  }
  function sync(){
    for(const form of root.querySelectorAll?.('form[data-admin-form="client-create"][data-client-create-wizard]')||[])initialize(form);
  }
  function currentForm(target){
    return target?.closest?.('form[data-admin-form="client-create"][data-client-create-wizard]')||null;
  }
  function save(form){
    if(!form)return null;
    cancelScheduledSave();
    initialize(form);
    return writeDraft(storage,draftKey(),form);
  }
  function scheduleSave(form){
    if(!form)return;
    pendingForm=form;
    if(saveTimer!==null)globalThis.clearTimeout?.(saveTimer);
    saveTimer=globalThis.setTimeout?.(()=>{
      const target=pendingForm;
      saveTimer=null;
      pendingForm=null;
      if(target)writeDraft(storage,draftKey(),target);
    },INPUT_SAVE_DELAY_MS)??null;
  }
  function flushScheduledSave(){
    const target=pendingForm;
    if(saveTimer!==null)globalThis.clearTimeout?.(saveTimer);
    saveTimer=null;
    pendingForm=null;
    if(target)writeDraft(storage,draftKey(),target);
  }
  function clear(){
    cancelScheduledSave();
    removeStored(storage,draftKey());
    clearPersistentDraftResidue();
  }
  function revealFirstInvalid(form){
    initialize(form);
    for(let step=1;step<=MAX_STEP;step++){
      const invalid=firstInvalid(form,step);
      if(!invalid)continue;
      setStep(form,step,{focus:true});
      invalid.reportValidity?.();
      invalid.focus?.();
      return invalid;
    }
    return null;
  }
  function validateForSubmit(form){
    return !revealFirstInvalid(form);
  }
  function onClick(event){
    const form=currentForm(event.target);
    if(!form)return;
    const nextButton=event.target.closest?.('[data-client-wizard-next]');
    const prevButton=event.target.closest?.('[data-client-wizard-prev]');
    const jumpButton=event.target.closest?.('[data-client-wizard-jump]');
    const discard=event.target.closest?.('[data-client-wizard-discard]');
    if(!nextButton&&!prevButton&&!jumpButton&&!discard)return;
    event.preventDefault();
    initialize(form);
    const current=clampStep(form.dataset.clientCurrentStep);
    if(discard){
      clear();
      form.reset?.();
      updateServiceIntent(form);
      setStep(form,DEFAULT_STEP,{focus:true});
      const status=form.querySelector?.('[data-client-draft-status]');
      if(status)status.textContent='Borrador descartado';
      return;
    }
    if(prevButton){
      setStep(form,current-1,{focus:true});
      save(form);
      return;
    }
    if(jumpButton){
      const target=clampStep(jumpButton.getAttribute('data-client-wizard-jump'));
      if(target>current)return;
      setStep(form,target,{focus:true});
      save(form);
      return;
    }
    const invalid=firstInvalid(form,current);
    if(invalid){
      invalid.reportValidity?.();
      invalid.focus?.();
      return;
    }
    setStep(form,current+1,{focus:true});
    save(form);
  }
  function onInput(event){
    const form=currentForm(event.target);
    if(!form)return;
    initialize(form);
    if(event.target?.name==='accessMode'){
      const explicit=form.elements?.namedItem?.('accessModeExplicit');
      if(explicit)explicit.value='1';
    }
    updateServiceIntent(form);
    updateReview(form);
    if(event.type==='change')save(form);
    else scheduleSave(form);
  }
  function onShellRendered(){
    flushScheduledSave();
    sync();
  }
  return Object.freeze({
    mount(){
      if(mounted)return;
      mounted=true;
      root.addEventListener('click',onClick);
      root.addEventListener('input',onInput);
      root.addEventListener('change',onInput);
      root.addEventListener('m26:shell-rendered',onShellRendered);
      sync();
    },
    destroy(){
      if(!mounted)return;
      flushScheduledSave();
      mounted=false;
      root.removeEventListener('click',onClick);
      root.removeEventListener('input',onInput);
      root.removeEventListener('change',onInput);
      root.removeEventListener('m26:shell-rendered',onShellRendered);
    },
    sync,
    save,
    clear,
    validateForSubmit,
    revealFirstInvalid,
  });
}

export const __clientCreateWizardInternals=Object.freeze({
  DRAFT_SCHEMA,DRAFT_PREFIX,LEGACY_DRAFT_PREFIX,LEGACY_DRAFT_PREFIX_V2,DRAFT_MAX_AGE_MS,INPUT_SAVE_DELAY_MS,MAX_STEP,
  clampStep,keyFor,legacyKeyFor,legacyV2KeyFor,collect,assign,setStep,readDraft,writeDraft,updateServiceIntent,
});
