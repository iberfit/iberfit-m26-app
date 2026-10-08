import {clientGuidedWelcomeLegacySeed,clientGuidedWelcomeScopeKey,normalizeClientGuidedWelcomeState} from './client-guided-welcome.js';
import {providerReadiness} from '../wearables/contracts.js';
import {zeroCostProviderReadiness} from '../wearables/free-policy.js';
import {iberfitSurfaceTranslate} from '../ui/i18n-surface.js';
import {getIberfitLanguage} from '../ui/i18n.js';

export const CONNECTED360_INVITATION_SCHEMA='iberfit.connected360.invitation.v1';
const PREFIX='iberfit.m26.connected360.invitation.v1:';
const FINAL=new Set(['chosen','dismissed','suppressed']);
const ACTIVE=new Set(['active','connected','conectado']);
const STYLE_ID='data-m26-connected360-style';
const STYLE=[
  '[data-m26-connected360-invitation]{position:fixed;z-index:1180;right:clamp(12px,2.5vw,32px);bottom:max(16px,env(safe-area-inset-bottom));width:min(435px,calc(100vw - 24px));max-height:min(78vh,680px);overflow:auto;background:#f6f0e4;color:#18362a;border:1px solid rgba(165,127,65,.48);border-radius:18px;padding:clamp(19px,3vw,29px);box-shadow:0 18px 66px rgba(7,27,20,.30);box-sizing:border-box}',
  '[data-m26-connected360-invitation] .m26-connected360-eyebrow{display:block;color:#73581f;font-size:.71rem;font-weight:760;letter-spacing:.12em;text-transform:uppercase;margin:0 0 .7rem}',
  '[data-m26-connected360-invitation] h2{margin:0;max-width:25ch;font-size:clamp(1.4rem,3vw,1.85rem);line-height:1.17;letter-spacing:-.035em;color:#17372b}',
  '[data-m26-connected360-invitation] p{font-size:.93rem;line-height:1.55;margin:.8rem 0;color:#314d40}',
  '[data-m26-connected360-invitation] .m26-connected360-provider{border-top:1px solid rgba(23,55,43,.13);padding-top:.82rem;font-size:.88rem;font-weight:650}',
  '[data-m26-connected360-invitation] .m26-connected360-actions{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.15rem}',
  '[data-m26-connected360-invitation] button{min-height:44px;padding:.65rem 1rem;border-radius:10px;font:inherit;font-weight:700;cursor:pointer}',
  '[data-m26-connected360-action=start]{background:#b99348;border:1px solid #89652a;color:#192b20}',
  '[data-m26-connected360-action=later]{background:transparent;border:1px solid rgba(23,55,43,.32);color:#18362a}',
  '[data-m26-connected360-invitation] button:focus-visible{outline:3px solid #74531b;outline-offset:3px}',
  '[data-m26-connected360-invitation] .m26-connected360-privacy{font-size:.77rem;line-height:1.5;margin-top:1.15rem;color:#51645a}',
  '@media(max-width:560px){[data-m26-connected360-invitation]{right:12px;bottom:calc(6.25rem + env(safe-area-inset-bottom));max-height:min(62dvh,540px)}}',
  '@media(prefers-reduced-motion:reduce){[data-m26-connected360-invitation]{scroll-behavior:auto;animation:none;transition:none}}',
].join('\n');
function hash(value){let result=0x811c9dc5;for(const char of String(value||'')){result^=char.charCodeAt(0);result=Math.imul(result,0x01000193);}return (result>>>0).toString(16).padStart(8,'0');}
function clean(value,max=240){return String(value??'').trim().slice(0,max);}
function storageFrom(storage,scope){if(storage!==undefined)return storage;try{return scope?.localStorage||null;}catch{return null;}}
function readJson(storage,key){try{const raw=storage?.getItem?.(key);return raw?JSON.parse(raw):null;}catch{return null;}}
function persist(storage,key,status){try{storage?.setItem?.(key,JSON.stringify({schema:CONNECTED360_INVITATION_SCHEMA,status}));return true;}catch{return false;}}
export function connected360InvitationKey({userId,role}={}){
  const id=clean(userId);
  return clean(role,32).toLowerCase()==='client'&&id?PREFIX+hash(id+'|client'):null;
}
export function connected360Capabilities(scope=globalThis){
  const rows=zeroCostProviderReadiness(providerReadiness(scope));
  const direct=rows.filter(item=>item.usableNow&&item.mode!=='local_file');
  return Object.freeze({
    direct:Object.freeze(direct.map(item=>Object.freeze({key:item.key,label:item.label}))),
    importReady:rows.some(item=>item.key==='normalized_file'&&item.importReady&&item.usableNow),
  });
}
export function connected360InvitationDecision({role='',userId='',recorded=null,guideStatus='never',connections=[],capabilities={direct:[],importReady:false}}={}){
  if(!connected360InvitationKey({role,userId}))return Object.freeze({show:false,status:'unavailable'});
  if(Array.isArray(connections)&&connections.some(item=>ACTIVE.has(clean(item?.status||item?.state,32).toLowerCase())))
    return Object.freeze({show:false,status:'connected'});
  const current=FINAL.has(recorded?.status)?recorded.status:'pending';
  if(FINAL.has(current))return Object.freeze({show:false,status:current});
  const ready=Boolean(capabilities.importReady||capabilities.direct?.length);
  return Object.freeze({show:ready&&['completed','skipped'].includes(guideStatus),status:'pending',nativeReady:Boolean(capabilities.direct?.length)});
}
export function connected360InvitationMarkup(capabilities,language='es'){
  const t=(value)=>iberfitSurfaceTranslate(value,{language});
  const direct=Boolean(capabilities.direct?.length);
  const description=direct
    ?'Autoriza una fuente compatible para incorporar actividad, entrenamiento y recuperación. Tú decides qué permisos conceder.'
    :'En la web puedes revisar una exportación compatible y confirmar qué información incorporar. La conexión automática del reloj requiere una aplicación nativa o integración cloud certificada.';
  return '<section data-m26-connected360-invitation role="dialog" aria-modal="false" aria-labelledby="m26-connected360-heading" aria-describedby="m26-connected360-desc">'
    +'<span class="m26-connected360-eyebrow">'+t('Tu actividad, desde el primer día')+'</span>'
    +'<h2 id="m26-connected360-heading">'+t('¿Quieres conectar tu reloj o dispositivo de actividad?')+'</h2>'
    +'<p id="m26-connected360-desc">'+t(description)+'</p>'
    +'<p class="m26-connected360-provider">'+t(direct?'Conexión compatible detectada':'Disponible hoy: importación de archivo verificada')+'</p>'
    +'<div class="m26-connected360-actions"><button type="button" data-m26-connected360-action="start">'+t(direct?'Conectar ahora':'Incorporar actividad')+'</button>'
    +'<button type="button" data-m26-connected360-action="later">'+t('Ahora no')+'</button></div>'
    +'<p class="m26-connected360-privacy">'+t('Es opcional. No se importa nada sin tu autorización; puedes gestionar tus datos desde Ajustes.')+'</p></section>';
}
export function createClientWearableInvitationController({root,identityProvider=()=>({}),stateProvider=()=>null,storage,scope=globalThis}={}){
  if(!root?.addEventListener)throw new Error('M26_CONNECTED360_ROOT_REQUIRED');
  const doc=root.ownerDocument||scope?.document;
  const storageValue=storageFrom(storage,scope);
  const memory=new Map();
  let mounted=false,scheduled=false,dialog=null,style=null,activeKey=null;
  function guideStatus(userId){
    const key=clientGuidedWelcomeScopeKey({userId,role:'client'});
    const recorded=readJson(storageValue,key);
    return recorded?normalizeClientGuidedWelcomeState(recorded).status:clientGuidedWelcomeLegacySeed({storage:storageValue,userId}).status;
  }
  function record(key){return readJson(storageValue,key)||memory.get(key)||null;}
  function write(key,status){memory.set(key,{schema:CONNECTED360_INVITATION_SCHEMA,status});persist(storageValue,key,status);}
  function close(){dialog?.remove?.();dialog=null;activeKey=null;}
  function ensureStyle(){
    if(doc?.querySelector?.('['+STYLE_ID+']'))return;
    style=doc?.createElement?.('style')||null;if(!style)return;
    style.setAttribute?.(STYLE_ID,'');style.textContent=STYLE;doc?.head?.append?.(style);
  }
  function identity(){
    const value=identityProvider?.()||{},role=clean(value.role,32).toLowerCase(),userId=clean(value.userId);
    const key=connected360InvitationKey({role,userId});return key?{role,userId,key}:null;
  }
  function guideIsActive(){
    return root?.getAttribute?.('data-m26-guided-tour-open')==='true'
      ||Boolean(doc?.querySelector?.('[data-m26-client-guided-welcome]'))
      ||Boolean(doc?.querySelector?.('[data-m26-guided-tour]'))
      ||Boolean(root.querySelector?.('[data-session-live-v3],[data-session-live-state],[data-session-touch-focus]'));
  }
  function render(){
    scheduled=false;if(!mounted)return;
    const ctx=identity();if(!ctx){close();return;}
    let state=record(ctx.key);
    const welcome=guideStatus(ctx.userId);
    if(!state){
      // Never interrupt an existing client who had already finished onboarding.
      write(ctx.key,['never','in-progress','paused'].includes(welcome)?'pending':'suppressed');
      state=record(ctx.key);
    }
    let connections=[];try{connections=stateProvider?.()?.collections?.wearableConnections||[];}catch{}
    const capabilities=connected360Capabilities(scope);
    const decision=connected360InvitationDecision({role:ctx.role,userId:ctx.userId,recorded:state,guideStatus:welcome,connections,capabilities});
    const area=clean(root.querySelector?.('[data-m26-area][aria-current="page"]')?.getAttribute?.('data-m26-area'),60);
    if(!decision.show||guideIsActive()||(area&&area!=='hoy')){close();return;}
    if(dialog&&activeKey===ctx.key)return;
    close();ensureStyle();if(!doc?.body?.insertAdjacentHTML)return;
    doc.body.insertAdjacentHTML('beforeend',connected360InvitationMarkup(capabilities,getIberfitLanguage()));
    dialog=doc.querySelector?.('[data-m26-connected360-invitation]')||null;
    activeKey=dialog?ctx.key:null;
    // Non-modal: no focus theft, no forced permission prompt and no overlay over the app.
  }
  function refresh(){if(!mounted||scheduled)return;scheduled=true;queueMicrotask(render);}
  function navigate(){
    const nodes=[...(root.querySelectorAll?.('[data-m26-area="actividad"]')||[])];
    const button=nodes.find(node=>node?.tagName==='BUTTON'&&node?.getClientRects?.()?.length>0)
      ||nodes.find(node=>node?.tagName==='BUTTON')||nodes[0];
    if(!button?.click)return false;button.click();return true;
  }
  function click(event){
    const btn=event.target?.closest?.('[data-m26-connected360-action]');
    if(!btn||!dialog?.contains?.(btn))return;
    const ctx=identity();if(!ctx||ctx.key!==activeKey){close();return;}
    const action=btn.getAttribute?.('data-m26-connected360-action');
    if(action==='later'){write(ctx.key,'dismissed');close();return;}
    if(action==='start'&&navigate()){write(ctx.key,'chosen');close();return;}
    const hint=dialog.querySelector?.('.m26-connected360-provider');
    if(hint)hint.textContent=iberfitSurfaceTranslate('No se ha podido abrir Actividad. Puedes encontrarla también desde Ajustes.',{language:getIberfitLanguage()});
  }
  function keydown(event){
    if(event?.key!=='Escape'||!dialog)return;
    const ctx=identity();if(ctx)write(ctx.key,'dismissed');close();
  }
  return Object.freeze({
    mount(){
      if(mounted)return;mounted=true;
      doc?.addEventListener?.('click',click);doc?.addEventListener?.('keydown',keydown);
      root.addEventListener?.('m26:client-guided-welcome-completed',refresh);
      scope?.addEventListener?.('pageshow',refresh);refresh();
    },
    refresh,
    destroy(){
      mounted=false;scheduled=false;
      doc?.removeEventListener?.('click',click);doc?.removeEventListener?.('keydown',keydown);
      root.removeEventListener?.('m26:client-guided-welcome-completed',refresh);
      scope?.removeEventListener?.('pageshow',refresh);
      close();style?.remove?.();style=null;
    },
  });
}
