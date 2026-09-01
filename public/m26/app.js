import {setNextWebAuthnCeremonyMode} from '/src/m26/app/webauthn.js';

const runtime=globalThis.__IBERFIT_M26_RUNTIME__||Object.freeze({
  enabled:false,
  qaOnly:true,
});

const root=document.querySelector('#app');
if(!root)throw new Error('M26_APP_ROOT_REQUIRED');

function installAccessUx(target){
  const onClick=(event)=>{
    const button=event.target.closest?.('[data-auth-action]');
    const action=button?.getAttribute?.('data-auth-action');
    if(!action)return;

    if(action==='toggle-password'){
      event.preventDefault();
      event.stopImmediatePropagation();
      const id=String(button.getAttribute('aria-controls')||'');
      const input=id?document.getElementById(id):null;
      if(!(input instanceof HTMLInputElement))return;
      const reveal=input.type==='password';
      input.type=reveal?'text':'password';
      button.setAttribute('aria-pressed',reveal?'true':'false');
      button.setAttribute('aria-label',reveal?'Ocultar contraseña':'Mostrar contraseña');
      button.textContent=reveal?'Ocultar':'Mostrar';
      input.focus({preventScroll:true});
      return;
    }

    if(action==='mfa-use-other-device'){
      event.preventDefault();
      event.stopImmediatePropagation();
      setNextWebAuthnCeremonyMode('cross-device');
      target.querySelector?.('[data-auth-action="mfa-continue-webauthn"]')?.click();
    }
  };

  target.addEventListener('click',onClick,true);
  return ()=>target.removeEventListener('click',onClick,true);
}

const removeAccessUx=installAccessUx(root);
let fullAppPromise=null;

function scheduleQualityRuntimeObservability(){
  const start=async()=>{
    const {installQualityRuntimeObservability}=await import('/src/m26/quality/runtime-observability.js');
    const collector=installQualityRuntimeObservability({scope:globalThis});
    globalThis.__IBERFIT_M26_QUALITY_OBSERVABILITY__=collector;
    return collector;
  };

  const ready=new Promise((resolve,reject)=>{
    const run=()=>start().then(resolve,reject);
    if(typeof globalThis.requestIdleCallback==='function'){
      globalThis.requestIdleCallback(run,{timeout:2000});
    }else{
      globalThis.setTimeout(run,0);
    }
  });

  globalThis.__IBERFIT_M26_QUALITY_OBSERVABILITY_READY__=ready;
}

scheduleQualityRuntimeObservability();

async function activateFullStyles(){
  const links=[...document.querySelectorAll('link[data-iberfit-full-style]')];

  await Promise.all(links.map((link)=>new Promise((resolve,reject)=>{
    const pendingHref=link.getAttribute('data-href');
    const activeHref=link.getAttribute('href');
    const targetHref=activeHref||pendingHref;
    if(!targetHref){
      reject(new Error('M26_STYLE_HREF_REQUIRED'));
      return;
    }

    let settled=false;
    const finish=(error)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      link.removeEventListener('load',onLoad);
      link.removeEventListener('error',onError);
      if(error)reject(error);
      else resolve();
    };
    const onLoad=()=>finish();
    const onError=()=>finish(new Error(`M26_STYLE_LOAD_FAILED:${targetHref}`));
    const timer=setTimeout(()=>{
      if(link.sheet)finish();
      else finish(new Error(`M26_STYLE_LOAD_TIMEOUT:${targetHref}`));
    },5000);

    link.addEventListener('load',onLoad,{once:true});
    link.addEventListener('error',onError,{once:true});
    if(!activeHref)link.setAttribute('href',targetHref);
    link.media='all';
    if(link.sheet)queueMicrotask(()=>finish());
  })));
}

function ensureAdaptiveLayoutStyle(){
  const existing=document.querySelector('link[data-iberfit-adaptive-style]');
  if(existing)return existing;

  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/src/m26/design/adaptive-layout.css';
  link.media='not all';
  link.setAttribute('data-iberfit-full-style','');
  link.setAttribute('data-iberfit-adaptive-style','true');
  document.head.append(link);

  return link;
}

async function loadFullApplication(){
  if(fullAppPromise)return fullAppPromise;

  fullAppPromise=(async()=>{
    ensureAdaptiveLayoutStyle();
    await activateFullStyles();
    const {createM26Application}=await import('/src/m26/app/application.js');
    const app=await createM26Application();
    await app.mount();
    globalThis.__IBERFIT_M26_APP__=app;
    return app;
  })();

  try{
    return await fullAppPromise;
  }catch(error){
    fullAppPromise=null;
    throw error;
  }
}

if(runtime.enabled){
  await loadFullApplication();
}else{
  async function elevateDisabledAuth(event){
    const action=event.target.closest?.('[data-auth-action]')?.getAttribute?.('data-auth-action');
    if(action!=='forgot-password')return;

    event.preventDefault();
    event.stopImmediatePropagation();
    root.removeEventListener('click',elevateDisabledAuth,true);

    try{
      await loadFullApplication();
      root.querySelector?.('[data-auth-action="forgot-password"]')?.click();
    }catch(error){
      root.addEventListener('click',elevateDisabledAuth,true);
      throw error;
    }
  }

  root.addEventListener('click',elevateDisabledAuth,true);

  globalThis.__IBERFIT_M26_APP__=Object.freeze({
    runtime,
    mount:async()=>false,
    resume:async()=>false,
    login:async()=>{throw new Error('M26_BACKEND_DISABLED');},
    getState:()=>Object.freeze({}),
    destroy:()=>{
      root.removeEventListener('click',elevateDisabledAuth,true);
      removeAccessUx();
    },
  });
}
