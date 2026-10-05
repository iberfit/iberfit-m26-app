function text(value){return String(value??'').trim();}

function hiddenByTree(control){
  if(!control)return true;
  if(control.hidden===true)return true;
  if(control.getAttribute?.('aria-hidden')==='true')return true;
  return Boolean(control.closest?.('[hidden],[aria-hidden="true"]'));
}

export function guidedControlIsAvailable(control){
  return Boolean(control&&!control.disabled&&!hiddenByTree(control));
}

export function guidedControlIsEmpty(control){
  if(!control)return true;
  const type=String(control.type||'').toLowerCase();
  if(type==='checkbox'||type==='radio')return !control.checked;
  return !text(control.value);
}

export function fillEmptyControls(root,values={},{
  selector='input[name],select[name],textarea[name]',
  attribute='name',
  skip=[],
}={}){
  const changed=[];
  const skipped=new Set(skip);
  for(const control of root?.querySelectorAll?.(selector)||[]){
    const key=String(control.getAttribute?.(attribute)||control?.[attribute]||'').trim();
    if(!key||skipped.has(key)||!Object.prototype.hasOwnProperty.call(values,key))continue;
    if(!guidedControlIsAvailable(control)||!guidedControlIsEmpty(control))continue;
    const type=String(control.type||'').toLowerCase();
    if(type==='checkbox'||type==='radio')continue;
    const next=values[key];
    if(next===undefined||next===null||!text(next))continue;
    control.value=String(next);
    changed.push(key);
  }
  return Object.freeze(changed);
}

export function pendingRequiredControls(root,{
  selector='input,select,textarea',
}={}){
  return Object.freeze(
    [...(root?.querySelectorAll?.(selector)||[])]
      .filter((control)=>guidedControlIsAvailable(control)&&Boolean(control.required))
      .filter((control)=>{
        if(typeof control.checkValidity==='function')return !control.checkValidity();
        return guidedControlIsEmpty(control);
      })
  );
}

export function guidedRequiredProgress(root,options={}){
  const controls=[...(root?.querySelectorAll?.(options.selector||'input,select,textarea')||[])]
    .filter((control)=>guidedControlIsAvailable(control)&&Boolean(control.required));
  const pending=pendingRequiredControls(root,options);
  return Object.freeze({
    total:controls.length,
    pending:Object.freeze([...pending]),
    pendingCount:pending.length,
    completedCount:Math.max(0,controls.length-pending.length),
    complete:pending.length===0,
    first:pending[0]||null,
  });
}

export function firstNeededControl(root,{
  selector='input,select,textarea',
  requiredOnly=false,
}={}){
  const controls=[...(root?.querySelectorAll?.(selector)||[])];
  const invalid=controls.find((control)=>
    guidedControlIsAvailable(control)&&
    typeof control.checkValidity==='function'&&
    !control.checkValidity()
  );
  if(invalid)return invalid;
  return controls.find((control)=>
    guidedControlIsAvailable(control)&&
    (!requiredOnly||Boolean(control.required))&&
    guidedControlIsEmpty(control)
  )||null;
}

export function focusFirstNeededControl(root,options={}){
  const control=firstNeededControl(root,options);
  if(typeof control?.focus!=='function')return null;
  control.focus();
  return control;
}

export function setControlGroupApplicable(wrapper,applicable,{
  selector='input,select,textarea,button',
}={}){
  if(!wrapper)return false;
  const active=Boolean(applicable);
  wrapper.hidden=!active;
  wrapper.setAttribute?.('aria-hidden',active?'false':'true');
  for(const control of wrapper.querySelectorAll?.(selector)||[]){
    control.disabled=!active;
    if(active)control.removeAttribute?.('aria-disabled');
    else control.setAttribute?.('aria-disabled','true');
  }
  return active;
}

export const __guidedInputInternals=Object.freeze({hiddenByTree,text});
