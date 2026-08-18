const runtime=globalThis.__IBERFIT_M26_RUNTIME__||Object.freeze({
  enabled:false,
  qaOnly:true,
});

const root=document.querySelector('#app');
if(!root)throw new Error('M26_APP_ROOT_REQUIRED');

let fullAppPromise=null;

async function activateFullStyles(){
  const links=[...document.querySelectorAll('link[data-iberfit-full-style]')];

  await Promise.all(links.map((link)=>new Promise((resolve,reject)=>{
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
    const onError=()=>finish(new Error(`M26_STYLE_LOAD_FAILED:${link.getAttribute('href')||'unknown'}`));
    const timer=setTimeout(()=>{
      if(link.sheet)finish();
      else finish(new Error(`M26_STYLE_LOAD_TIMEOUT:${link.getAttribute('href')||'unknown'}`));
    },5000);

    link.addEventListener('load',onLoad,{once:true});
    link.addEventListener('error',onError,{once:true});
    link.media='all';
    if(link.sheet)queueMicrotask(()=>finish());
  })));
}

async function loadFullApplication(){
  if(fullAppPromise)return fullAppPromise;

  fullAppPromise=(async()=>{
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
    destroy:()=>root.removeEventListener('click',elevateDisabledAuth,true),
  });
}
