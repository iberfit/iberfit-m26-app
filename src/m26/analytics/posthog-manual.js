// IBERFIT analytics v1: manual, anonymous, consent-first and production-only.
// This module never reads identities, URLs, form values, health data or session state.
// No SDK, cookies, auto-capture, replay, pageview or person profiles.
const EVENT_NAMES=new Set(['iberfit_workspace_viewed','iberfit_navigation_requested','iberfit_training_start_requested']);
const SAFE_ROLES=new Set(['client','coach','admin']);
const SAFE_AREAS=new Set(['hoy','agenda','clientes','planificacion','sesion','progreso','actividad','informes','ajustes','admin-inicio','admin-analitica','admin-usuarios','admin-configuracion','admin-equipo','biblioteca','iri','retos','mensajes','verificacion']);
const ALLOWED_HOSTS=new Set(['https://us.i.posthog.com','https://eu.i.posthog.com']);
let active=null;
function configValid(config,production,qaOnly){
  return production===true&&qaOnly===false&&config?.enabled===true&&
    config?.provider==='posthog'&&
    typeof config?.publicKey==='string'&&/^phc_[A-Za-z0-9]{20,180}$/u.test(config.publicKey)&&
    ALLOWED_HOSTS.has(config?.host);
}
function readRole(root){
  const role=String(root?.querySelector?.('.m26-shell[data-m26-role]')?.getAttribute?.('data-m26-role')||'');
  return SAFE_ROLES.has(role)?role:null;
}
export function posthogConsentActive(){return active?.consented===true;}
export function posthogConsentAvailable(){return active?.available===true;}
export function renderPosthogConsentPanel({admin=false}={}){
  const available=posthogConsentAvailable();
  const consented=posthogConsentActive();
  const css=admin?'m26-admin-notice m26-analytics-consent':'m26-settings-section m26-analytics-consent';
  return '<section class="'+css+'" id="m26-settings-analytics">'+
    '<header><p class="m26-eyebrow">Analítica opcional</p><h3>Ayúdanos a mejorar IBERFIT</h3>'+
    '<p>Si lo autorizas, registramos únicamente la sección visitada y algunas acciones de navegación para mejorar la facilidad de uso. No enviamos nombres, correos, identificadores de clientes, entrenamientos, registros de salud, formularios ni rutas URL.</p></header>'+
    '<label class="m26-consent"><input type="checkbox" data-iberfit-analytics-consent'+(consented?' checked':'')+(available?'':' disabled aria-disabled="true"')+'>'+
    '<span><strong>Permitir analítica anónima en esta sesión</strong><small>Desactivada por defecto; puedes revocarla aquí en cualquier momento. Sin cookies, perfiles personales ni grabaciones.</small></span></label>'+
    (!available?'<p class="m26-data-footnote">Esta función todavía no está habilitada en este entorno.</p>':'')+
    '</section>';
}
export function createIberfitPosthogObserver({root,config={},production=false,qaOnly=true,releaseSha='',scope=globalThis,fetchImpl=scope?.fetch}={}){
  const available=configValid(config,production,qaOnly)&&typeof fetchImpl==='function'&&
    typeof scope?.crypto?.randomUUID==='function';
  let consented=false,distinctId=null,sent=0;
  const release=/^[0-9a-f]{40}$/u.test(String(releaseSha||''))?releaseSha.slice(0,12):'unknown';
  const client={available, get consented(){return consented;}};
  active=client;
  function revoke(){
    consented=false;
    distinctId=null;
    if(active===client)active=client;
  }
  function emit(eventName,extra={}){
    if(!available||!consented||!distinctId||sent>=48||!EVENT_NAMES.has(eventName))return false;
    const role=readRole(root);
    if(!role)return false;
    const area=typeof extra.area==='string'&&SAFE_AREAS.has(extra.area)?extra.area:null;
    const width=Number(scope?.innerWidth);
    const device=Number.isFinite(width)&&width>0?(width<=680?'mobile':width<=1180?'tablet':'desktop'):'unknown';
    const properties={
      schema:'iberfit.anonymous-ui.v1', role, device, release,
      $process_person_profile:false,
    };
    if(eventName==='iberfit_navigation_requested'){
      if(!area)return false;
      properties.area=area;
    }
    const payload={api_key:config.publicKey,distinct_id:distinctId,event:eventName,properties};
    sent++;
    try{
      void Promise.resolve(fetchImpl(config.host+'/i/v0/e/',{
        method:'POST',mode:'cors',credentials:'omit',cache:'no-store',
        referrerPolicy:'no-referrer',keepalive:false,
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),
      })).catch(()=>{});
      return true;
    }catch{return false;}
  }
  function onChange(event){
    const target=event?.target?.closest?.('[data-iberfit-analytics-consent]');
    if(!target||!root?.contains?.(target))return;
    if(!available){target.checked=false;revoke();return;}
    if(target.checked===true){
      if(!consented){
        distinctId=scope.crypto.randomUUID();consented=true;
        emit('iberfit_workspace_viewed');
      }
    }else revoke();
  }
  function onClick(event){
    const target=event?.target?.closest?.('[data-m26-area],[data-workflow-action],[data-m26-action]');
    if(!target||!root?.contains?.(target))return;
    const action=target.getAttribute?.('data-m26-action');
    if(action==='logout'||action==='logout-clear-device'||action==='logout-all-sessions'){
      revoke();return;
    }
    if(!consented)return;
    const area=target.getAttribute?.('data-m26-area');
    if(area)emit('iberfit_navigation_requested',{area});
    if(target.getAttribute?.('data-workflow-action')==='start-published-session')
      emit('iberfit_training_start_requested');
  }
  if(root?.addEventListener){
    root.addEventListener('change',onChange);
    root.addEventListener('click',onClick,true);
  }
  function destroy(){
    revoke();
    root?.removeEventListener?.('change',onChange);
    root?.removeEventListener?.('click',onClick,true);
    if(active===client)active=null;
  }
  return Object.freeze({available,get consented(){return consented;},revoke,destroy});
}
