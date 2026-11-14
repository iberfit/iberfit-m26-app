import {
  detectPwaInstallPlatform,
  getBrowserPwaInstallController,
  isPwaStandalone,
  manualPwaInstallGuidance,
} from '../platform/pwa.js';

// Invitation-first PWA welcome. No Auth parameters, URLs, personal data or
// backend operations are read or retained. This is never an installation claim.
export const INSTALL_OFFER_DISMISSAL_KEY='iberfit.m26.pwa.welcome-dismissed-until.v1';
export const INSTALL_OFFER_DISMISSAL_MS=30*24*60*60*1000;

export function selectInstallOfferMode({installed=false,kind='unavailable',ios=false,android=false}={}){
  if(installed)return 'none';
  if(kind==='prompt')return 'native';
  if(ios||android||kind==='manual')return 'guide';
  return 'none';
}

export function shouldOfferPwaInstall({
  installed=false,mode='none',ready=false,sessionActive=false,
  blockingDialog=false,visible=true,dismissedUntil=0,now=Date.now(),
}={}){
  return !installed&&mode!=='none'&&ready&&!sessionActive&&!blockingDialog&&
    visible&&!(Number(dismissedUntil)>Number(now));
}

export function readInstallOfferDismissal(storage){
  try{
    const raw=storage?.getItem?.(INSTALL_OFFER_DISMISSAL_KEY);
    const until=Number(raw||0);
    return Number.isSafeInteger(until)&&until>0?until:0;
  }catch{return 0;}
}

export function dismissInstallOffer(storage,now=Date.now(),duration=INSTALL_OFFER_DISMISSAL_MS){
  try{
    const until=Math.trunc(Number(now)+Number(duration));
    if(!Number.isSafeInteger(until))return false;
    storage?.setItem?.(INSTALL_OFFER_DISMISSAL_KEY,String(until));
    return true;
  }catch{return false;}
}

function isReadyForInvitationOffer(documentLike){
  // Avoid interruption of password recovery, MFA and the initial Auth bootstrap.
  const auth=documentLike.querySelector?.('.m26-auth-card');
  if(auth){
    if(auth.getAttribute('data-auth-mode')!=='login'||
      auth.getAttribute('aria-busy')==='true')return false;
    const form=auth.querySelector?.('[data-auth-form="login"]');
    return Boolean(form&&!form.hidden);
  }
  // A returning visitor with an existing session can also install, but never
  // while operating the Coach/Admin workspace or an active Client training.
  return Boolean(documentLike.querySelector?.('.m26-shell[data-m26-role="client"]'));
}

function isTrainingOrDialogInProgress(documentLike){
  return Boolean(
    documentLike.querySelector?.(
      '.m26-session-live-v3,[data-session-live-state="active"],[data-session-live-state="rest"],'+
      '[role="dialog"][aria-modal="true"],[data-m26-overlay="open"]'
    )
  );
}

function installationInstructions(platform,navigatorLike){
  if(platform.ios){
    const safari=Boolean(platform.safari);
    return safari
      ?'En Safari, toca Compartir y elige “Añadir a pantalla de inicio”. Activa “Abrir como app web” si aparece y pulsa Añadir.'
      :'Abre app.iberfit.cl en Safari. Toca Compartir y elige “Añadir a pantalla de inicio”. Activa “Abrir como app web” si aparece.';
  }
  if(platform.android){
    return 'En Chrome, abre el menú ⋮ y elige “Instalar aplicación” o “Añadir a pantalla de inicio”, si está disponible.';
  }
  return manualPwaInstallGuidance(navigatorLike)?.instructions||
    'Utiliza la opción de instalar aplicación del menú de tu navegador, si está disponible.';
}

function makeOfferElement(documentLike){
  const panel=documentLike.createElement('aside');
  panel.className='m26-invitation-install-offer';
  panel.setAttribute('data-m26-invitation-install-offer','');
  panel.setAttribute('role','region');
  panel.setAttribute('aria-labelledby','m26-invitation-install-heading');
  // Static trusted markup only. Never interpolate an invite URL, fragment,
  // Auth session, role, user name or third-party content.
  panel.innerHTML=`
    <div class="m26-invitation-install-icon" aria-hidden="true">
      <img src="/m26/icons/icon-192.png" alt="" width="52" height="52" decoding="async">
    </div>
    <div class="m26-invitation-install-copy">
      <p class="m26-invitation-install-eyebrow">IBERFIT · Tu espacio personal</p>
      <h2 id="m26-invitation-install-heading">¿Quieres tener IBERFIT como aplicación?</h2>
      <p>Abre tus entrenamientos, planificación y progreso desde la pantalla de inicio.</p>
      <p class="m26-invitation-install-guide" data-m26-install-guide hidden></p>
      <p class="m26-invitation-install-feedback" data-m26-install-feedback role="status" aria-live="polite" hidden></p>
      <div class="m26-invitation-install-actions">
        <button type="button" class="m26-invitation-install-primary" data-m26-install-accept>Instalar IBERFIT</button>
        <button type="button" class="m26-invitation-install-later" data-m26-install-dismiss>Ahora no</button>
      </div>
    </div>
    <button type="button" class="m26-invitation-install-close" data-m26-install-dismiss aria-label="Cerrar invitación a instalar">×</button>
  `;
  return panel;
}

export function mountInvitationInstallOffer({
  target=globalThis,documentLike=globalThis.document,
  controller=getBrowserPwaInstallController(),
  storage=globalThis.localStorage,
  now=()=>Date.now(),
}={}){
  if(!documentLike?.body||!controller)return ()=>{};
  const navigatorLike=target.navigator;
  const platform=detectPwaInstallPlatform(navigatorLike);
  let panel=null,stopped=false,observer=null,scheduled=null,expiry=null;
  const mode=()=>selectInstallOfferMode({
    installed:isPwaStandalone({navigatorLike,matchMediaLike:target.matchMedia})||
      controller.getState()?.installed===true,
    kind:controller.getState()?.kind,
    ios:platform.ios,android:platform.android,
  });
  const close=(duration=INSTALL_OFFER_DISMISSAL_MS)=>{
    dismissInstallOffer(storage,now(),duration);
    panel?.remove();
    panel=null;
    stopWatching();
  };
  const onInstall=async()=>{
    const primary=panel?.querySelector?.('[data-m26-install-accept]');
    const guide=panel?.querySelector?.('[data-m26-install-guide]');
    const feedback=panel?.querySelector?.('[data-m26-install-feedback]');
    if(!primary||!guide||!feedback)return;
    const current=controller.getState();
    if(current?.kind!=='prompt'){
      guide.textContent=installationInstructions(platform,navigatorLike);
      guide.hidden=false;
      primary.textContent='Instrucciones de instalación';
      primary.setAttribute('aria-expanded','true');
      return;
    }
    primary.disabled=true;
    primary.textContent='Abriendo instalación…';
    try{
      // Called directly from the click handler; Chromium requires user activation.
      const result=await controller.install();
      if(result.ok){
        feedback.textContent='Solicitud aceptada. Busca IBERFIT en tu dispositivo.';
        feedback.hidden=false;
        close(365*24*60*60*1000);
      }else if(result.outcome==='dismissed'){
        close();
      }else{
        guide.textContent=installationInstructions(platform,navigatorLike);
        guide.hidden=false;
        primary.textContent='Ver instrucciones';
      }
    }catch{
      feedback.textContent='No se pudo abrir la instalación automática. Puedes utilizar el menú del navegador.';
      feedback.hidden=false;
      guide.textContent=installationInstructions(platform,navigatorLike);
      guide.hidden=false;
      primary.textContent='Ver instrucciones';
    }finally{
      if(panel)primary.disabled=false;
    }
  };
  const updateMode=()=>{
    if(!panel)return;
    const next=mode();
    if(next==='none'){close(365*24*60*60*1000);return;}
    const primary=panel.querySelector?.('[data-m26-install-accept]');
    if(primary&&!primary.disabled&&primary.getAttribute('aria-expanded')!=='true'){
      primary.textContent=next==='native'?'Instalar IBERFIT':'Cómo instalarla';
    }
  };
  const tryOpen=()=>{
    if(stopped||panel||!documentLike.body)return;
    const next=mode();
    if(!shouldOfferPwaInstall({
      installed:next==='none',mode:next,
      ready:isReadyForInvitationOffer(documentLike),
      sessionActive:isTrainingOrDialogInProgress(documentLike),
      visible:documentLike.visibilityState!=='hidden',
      dismissedUntil:readInstallOfferDismissal(storage),
      now:now(),
    }))return;
    panel=makeOfferElement(documentLike);
    const primary=panel.querySelector('[data-m26-install-accept]');
    primary.textContent=next==='native'?'Instalar IBERFIT':'Cómo instalarla';
    panel.querySelectorAll('[data-m26-install-dismiss]').forEach(button=>{
      button.addEventListener('click',()=>close(),{once:true});
    });
    primary.addEventListener('click',()=>{void onInstall();});
    documentLike.body.append(panel);
    stopWatching();
  };
  const check=()=>{
    if(stopped||panel)return;
    if(scheduled!==null)return;
    scheduled=target.setTimeout?.(()=>{
      scheduled=null;
      tryOpen();
    },180)??null;
  };
  const onState=()=>{if(panel)updateMode();else check();};
  const onVisibility=()=>check();
  const onInstalled=()=>close(365*24*60*60*1000);
  function stopWatching(){
    observer?.disconnect?.();observer=null;
    if(expiry!==null)target.clearTimeout?.(expiry);
    expiry=null;
    if(scheduled!==null)target.clearTimeout?.(scheduled);
    scheduled=null;
  }
  target.addEventListener?.('m26:pwa-install-state',onState);
  target.addEventListener?.('appinstalled',onInstalled);
  documentLike.addEventListener?.('visibilitychange',onVisibility);
  if(typeof target.MutationObserver==='function'){
    observer=new target.MutationObserver(check);
    const app=documentLike.querySelector('#app');
    if(app)observer.observe(app,{
      subtree:true,childList:true,attributes:true,
      attributeFilter:['data-auth-state','data-auth-mode','data-m26-role','aria-busy'],
    });
  }
  expiry=target.setTimeout?.(()=>stopWatching(),45_000)??null;
  target.setTimeout?.(check,2600);
  return ()=>{
    stopped=true;
    stopWatching();
    target.removeEventListener?.('m26:pwa-install-state',onState);
    target.removeEventListener?.('appinstalled',onInstalled);
    documentLike.removeEventListener?.('visibilitychange',onVisibility);
    panel?.remove();panel=null;
  };
}

if(typeof document!=='undefined'){
  const start=()=>{try{mountInvitationInstallOffer();}catch{/* installation is optional */}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}
