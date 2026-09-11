const DRAFT_SCHEMA='iberfit.admin.client-create-draft.v2';
const DRAFT_PREFIX='iberfit:m26:admin-client-create:v2:';
const DEFAULT_STEP=1;
const MAX_STEP=5;

function clampStep(value){
  const n=Number(value);
  return Number.isInteger(n)?Math.max(1,Math.min(MAX_STEP,n)):DEFAULT_STEP;
}
function keyFor(scopeKey){
  const safe=String(scopeKey||'default').replace(/[^A-Za-z0-9._:-]/g,'_').slice(0,120)||'default';
  return `${DRAFT_PREFIX}${safe}`;
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
  return stepControls(form,step).find((control)=>!control.disabled&&typeof control.checkValidity==='function'&&!control.checkValidity())||null;
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
  const map={
    identity:['name','email','phone'],
    service:['modality','weeklyFrequency','sessionDurationMinutes'],
    objective:['objective','level'],
    logistics:['zone','address','preferredSchedule'],
    safety:['restrictions','pain','emergencyContactName'],
  };
  for(const node of form?.querySelectorAll?.('[data-client-review]')||[]){
    const key=String(node.getAttribute('data-client-review')||'');
    const names=map[key]||[key];
    const values=names.map((name)=>labelFor(form,name,'')).filter(Boolean);
    node.textContent=values.length?values.join(' · '):'Sin completar';
  }
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
function readDraft(storage,key){
  try{
    const parsed=JSON.parse(storage?.getItem?.(key)||'null');
    if(parsed?.schema!==DRAFT_SCHEMA||typeof parsed?.fields!=='object')return null;
    return parsed;
  }catch{return null;}
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
  storage=globalThis.localStorage,
  getScopeKey=()=> 'default',
}={}){
  if(!root?.addEventListener)throw new Error('M26_CLIENT_CREATE_WIZARD_ROOT_REQUIRED');
  let mounted=false;
  const draftKey=()=>keyFor(getScopeKey?.());

  function initialize(form){
    if(!form||form.dataset.clientWizardReady==='true')return false;
    form.dataset.clientWizardReady='true';
    const draft=readDraft(storage,draftKey());
    if(draft){
      assign(form,draft.fields);
      const status=form.querySelector?.('[data-client-draft-status]');
      if(status)status.textContent='Borrador recuperado';
      setStep(form,draft.step||DEFAULT_STEP);
    }else{
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
    initialize(form);
    return writeDraft(storage,draftKey(),form);
  }
  function clear(){
    try{storage?.removeItem?.(draftKey());}catch{}
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
    updateReview(form);
    save(form);
  }
  return Object.freeze({
    mount(){
      if(mounted)return;
      mounted=true;
      root.addEventListener('click',onClick);
      root.addEventListener('input',onInput);
      root.addEventListener('change',onInput);
      sync();
    },
    destroy(){
      if(!mounted)return;
      mounted=false;
      root.removeEventListener('click',onClick);
      root.removeEventListener('input',onInput);
      root.removeEventListener('change',onInput);
    },
    sync,
    save,
    clear,
    validateForSubmit,
    revealFirstInvalid,
  });
}

export const __clientCreateWizardInternals=Object.freeze({
  DRAFT_SCHEMA,DRAFT_PREFIX,MAX_STEP,clampStep,keyFor,collect,assign,setStep,readDraft,writeDraft,
});
