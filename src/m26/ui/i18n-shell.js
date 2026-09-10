import {getIberfitLanguage,iberfitTranslate} from './i18n.js';

const SHELL_BUNDLES=Object.freeze({
  es:Object.freeze({
    'shell.skipToContent':'Saltar al contenido',
    'shell.accessibility.navigation':'Navegación IBERFIT',
    'shell.product':'Entrenamiento personal con criterio',
    'shell.access.title':'Entrenamiento personal con criterio',
    'shell.access.subtitle':'Diagnóstico, planificación, control y seguimiento.',
    'shell.access.confirming':'Confirmando identidad y permisos…',
    'shell.access.error':'No se pudo confirmar la identidad y los permisos.',
    'shell.operations.pending.one':'{count} pendiente',
    'shell.operations.pending.other':'{count} pendientes',
    'shell.operations.conflicts.one':'{count} conflicto',
    'shell.operations.conflicts.other':'{count} conflictos',
    'shell.operations.rejected.one':'{count} por revisar',
    'shell.operations.rejected.other':'{count} por revisar',
    'shell.role.admin':'Administrador',
    'shell.role.coach':'Entrenador',
    'shell.role.client':'Cliente',
  }),
  en:Object.freeze({
    'shell.skipToContent':'Skip to content',
    'shell.accessibility.navigation':'IBERFIT navigation',
    'shell.product':'Personal training with purpose',
    'shell.access.title':'Personal training with purpose',
    'shell.access.subtitle':'Assessment, planning, control and follow-up.',
    'shell.access.confirming':'Confirming identity and permissions…',
    'shell.access.error':'We could not confirm your identity and permissions.',
    'shell.operations.pending.one':'{count} pending',
    'shell.operations.pending.other':'{count} pending',
    'shell.operations.conflicts.one':'{count} conflict',
    'shell.operations.conflicts.other':'{count} conflicts',
    'shell.operations.rejected.one':'{count} to review',
    'shell.operations.rejected.other':'{count} to review',
    'shell.role.admin':'Admin',
    'shell.role.coach':'Coach',
    'shell.role.client':'Client',
  }),
  fr:Object.freeze({
    'shell.skipToContent':'Aller au contenu',
    'shell.accessibility.navigation':'Navigation IBERFIT',
    'shell.product':'Coaching personnalisé avec méthode',
    'shell.access.title':'Coaching personnalisé avec méthode',
    'shell.access.subtitle':'Diagnostic, planification, contrôle et suivi.',
    'shell.access.confirming':'Vérification de l’identité et des autorisations…',
    'shell.access.error':'Impossible de confirmer l’identité et les autorisations.',
    'shell.operations.pending.one':'{count} en attente',
    'shell.operations.pending.other':'{count} en attente',
    'shell.operations.conflicts.one':'{count} conflit',
    'shell.operations.conflicts.other':'{count} conflits',
    'shell.operations.rejected.one':'{count} à vérifier',
    'shell.operations.rejected.other':'{count} à vérifier',
    'shell.role.admin':'Administrateur',
    'shell.role.coach':'Coach',
    'shell.role.client':'Client',
  }),
  pt:Object.freeze({
    'shell.skipToContent':'Saltar para o conteúdo',
    'shell.accessibility.navigation':'Navegação IBERFIT',
    'shell.product':'Treino personalizado com critério',
    'shell.access.title':'Treino personalizado com critério',
    'shell.access.subtitle':'Diagnóstico, planeamento, controlo e acompanhamento.',
    'shell.access.confirming':'A confirmar identidade e permissões…',
    'shell.access.error':'Não foi possível confirmar a identidade e as permissões.',
    'shell.operations.pending.one':'{count} pendente',
    'shell.operations.pending.other':'{count} pendentes',
    'shell.operations.conflicts.one':'{count} conflito',
    'shell.operations.conflicts.other':'{count} conflitos',
    'shell.operations.rejected.one':'{count} por rever',
    'shell.operations.rejected.other':'{count} por rever',
    'shell.role.admin':'Administrador',
    'shell.role.coach':'Coach',
    'shell.role.client':'Cliente',
  }),
});

const LANGUAGE_CONTROL_SELECTOR='[data-m26-ui-language],[data-m26-ui-locale]';
const LANGUAGE_GUARDS=new WeakMap();

function shellLanguage(value=getIberfitLanguage()){
  const normalized=String(value||'').trim().toLowerCase();
  return Object.hasOwn(SHELL_BUNDLES,normalized)?normalized:'es';
}

function interpolate(value,params={}){
  return String(value??'').replace(/\{([a-zA-Z0-9_.-]+)\}/g,(_,key)=>String(params?.[key]??`{${key}}`));
}

function now(){
  try{return Number(globalThis?.performance?.now?.())||Date.now();}
  catch{return Date.now();}
}

function scheduleAfterPaint(callback){
  const windowLike=globalThis?.window||null;
  let settled=false;
  const run=()=>{
    if(settled)return;
    settled=true;
    callback();
  };
  if(typeof windowLike?.requestAnimationFrame==='function')windowLike.requestAnimationFrame(run);
  if(typeof globalThis.setTimeout==='function')return globalThis.setTimeout(run,250);
  run();
  return null;
}

function matchingLanguageControl(target){
  return target?.closest?.(LANGUAGE_CONTROL_SELECTOR)||null;
}

function languageControls(root){
  return [...(root?.querySelectorAll?.(LANGUAGE_CONTROL_SELECTOR)||[])];
}

function emitLanguageRuntimeEvent(root,name,detail){
  const EventLike=root?.ownerDocument?.defaultView?.CustomEvent||globalThis?.CustomEvent;
  if(typeof EventLike!=='function'||!root?.dispatchEvent)return false;
  try{
    root.dispatchEvent(new EventLike(name,{bubbles:false,detail}));
    return true;
  }catch{
    return false;
  }
}

export function iberfitShellTranslate(key,{language:requestedLanguage=getIberfitLanguage(),fallback=null,params={}}={}){
  const language=shellLanguage(requestedLanguage);
  const selected=SHELL_BUNDLES[language];
  if(Object.hasOwn(selected,key))return interpolate(selected[key],params);
  return interpolate(iberfitTranslate(key,{language,fallback:fallback??String(key||'')}),params);
}

export function iberfitShellTranslationCoverage(){
  const referenceKeys=Object.keys(SHELL_BUNDLES.es).sort();
  return Object.freeze(Object.keys(SHELL_BUNDLES).map((language)=>{
    const selected=SHELL_BUNDLES[language];
    const selectedKeys=Object.keys(selected).sort();
    const selectedSet=new Set(selectedKeys);
    const referenceSet=new Set(referenceKeys);
    const missing=referenceKeys.filter((key)=>!selectedSet.has(key));
    const extra=selectedKeys.filter((key)=>!referenceSet.has(key));
    const blank=selectedKeys.filter((key)=>String(selected[key]??'').trim()==='');
    return Object.freeze({
      language,
      total:referenceKeys.length,
      translated:referenceKeys.length-missing.length-blank.filter((key)=>referenceSet.has(key)).length,
      missing:Object.freeze(missing),
      extra:Object.freeze(extra),
      blank:Object.freeze(blank),
      complete:missing.length===0&&extra.length===0&&blank.length===0,
    });
  }));
}

export function installIberfitLanguageSwitchRuntimeGuard(
  root,
  {
    installSurfaceI18n,
    schedule=scheduleAfterPaint,
  }={}
){
  if(!root?.addEventListener)throw new Error('M26_I18N_RUNTIME_ROOT_REQUIRED');
  if(typeof installSurfaceI18n!=='function')throw new Error('M26_I18N_RUNTIME_INSTALLER_REQUIRED');

  const existing=LANGUAGE_GUARDS.get(root);
  if(existing)return existing;

  let generation=0;
  let disconnected=false;
  let surfaceState=installSurfaceI18n(root);
  const touchedControls=new Set();

  function setBusy(busy){
    if(root?.dataset){
      if(busy)root.dataset.m26I18nSwitching='true';
      else delete root.dataset.m26I18nSwitching;
    }
    const current=languageControls(root);
    if(busy){
      for(const control of current){
        touchedControls.add(control);
        control.setAttribute?.('aria-busy','true');
      }
      return;
    }
    for(const control of new Set([...touchedControls,...current]))control.removeAttribute?.('aria-busy');
    touchedControls.clear();
  }

  function settle(token,startedAt){
    if(disconnected||token!==generation)return false;
    let ok=false;
    try{
      surfaceState=installSurfaceI18n(root);
      ok=true;
      return true;
    }catch(error){
      emitLanguageRuntimeEvent(root,'m26:i18n-switch-failed',{
        generation:token,
        code:String(error?.message||'M26_I18N_RUNTIME_RECONNECT_FAILED').slice(0,120),
      });
      return false;
    }finally{
      setBusy(false);
      emitLanguageRuntimeEvent(root,'m26:i18n-switch-settled',{
        generation:token,
        ok,
        durationMs:Math.max(0,Math.round(now()-startedAt)),
      });
    }
  }

  function onChangeCapture(event){
    if(!matchingLanguageControl(event?.target))return;

    const token=++generation;
    const startedAt=now();
    setBusy(true);

    try{surfaceState?.disconnect?.();}
    catch(error){
      emitLanguageRuntimeEvent(root,'m26:i18n-switch-observer-disconnect-failed',{
        generation:token,
        code:String(error?.message||'M26_I18N_RUNTIME_DISCONNECT_FAILED').slice(0,120),
      });
    }
    surfaceState=null;

    try{
      schedule(()=>settle(token,startedAt));
    }catch(error){
      settle(token,startedAt);
      emitLanguageRuntimeEvent(root,'m26:i18n-switch-scheduler-failed',{
        generation:token,
        code:String(error?.message||'M26_I18N_RUNTIME_SCHEDULER_FAILED').slice(0,120),
      });
    }
  }

  root.addEventListener('change',onChangeCapture,true);

  const state=Object.freeze({
    disconnect(){
      if(disconnected)return;
      disconnected=true;
      generation+=1;
      root.removeEventListener?.('change',onChangeCapture,true);
      try{surfaceState?.disconnect?.();}catch{}
      surfaceState=null;
      setBusy(false);
      LANGUAGE_GUARDS.delete(root);
    },
  });

  LANGUAGE_GUARDS.set(root,state);
  return state;
}

export async function bootstrapIberfitLanguageSwitchRuntimeGuard({documentLike=globalThis?.document}={}){
  if(!documentLike?.querySelector)return null;
  const root=documentLike.querySelector('#app');
  if(!root)return null;
  try{
    const {installIberfitSurfaceI18n}=await import('./i18n-surface.js');
    return installIberfitLanguageSwitchRuntimeGuard(root,{installSurfaceI18n:installIberfitSurfaceI18n});
  }catch(error){
    try{console.error('[IBERFIT:i18n-runtime-guard]',error?.message||error);}
    catch{}
    return null;
  }
}

if(typeof document!=='undefined')void bootstrapIberfitLanguageSwitchRuntimeGuard();
