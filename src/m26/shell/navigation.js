import { assertKnownRole } from './role-policy.js';
import {ADMIN_AREAS,ADMIN_NAVIGATION} from '../admin/navigation.js';

export const M26_AREAS = Object.freeze({
  acceso: Object.freeze({ key: 'acceso', label: 'Acceso', title: 'Acceso IBERFIT', scope: 'public', roles: [] }),
  hoy: Object.freeze({ key: 'hoy', label: 'Hoy', title: 'Hoy en IBERFIT', scope: 'global', roles: ['coach', 'client'] }),
  clientes: Object.freeze({ key: 'clientes', label: 'Clientes', title: 'Clientes', scope: 'global', roles: ['coach'] }),
  expediente: Object.freeze({ key: 'expediente', label: 'Expediente', title: 'Expediente IBERFIT', scope: 'selected-client', roles: ['coach'] }),
  iri: Object.freeze({ key: 'iri', label: 'Diagnóstico IRI', title: 'Diagnóstico IRI', scope: 'selected-client', roles: ['coach'] }),
  informes: Object.freeze({ key: 'informes', label: 'Informes', title: 'Informes', scope: 'client-context', roles: ['coach', 'client'] }),
  planificacion: Object.freeze({ key: 'planificacion', label: 'Planificación', title: 'Planificación', scope: 'client-context', roles: ['coach', 'client'] }),
  agenda: Object.freeze({ key: 'agenda', label: 'Agenda', title: 'Agenda', scope: 'global', roles: ['coach'] }),
  sesion: Object.freeze({ key: 'sesion', label: 'Sesiones', title: 'Sesiones', scope: 'client-context', roles: ['coach', 'client'] }),
  progreso: Object.freeze({ key: 'progreso', label: 'Progreso', title: 'Progreso y seguimiento', scope: 'client-context', roles: ['coach', 'client'] }),
  actividad: Object.freeze({ key: 'actividad', label: 'Actividad', title: 'Actividad, hábitos y dispositivos', scope: 'client-context', roles: ['coach', 'client'] }),
  notas: Object.freeze({ key: 'notas', label: 'Notas privadas', title: 'Notas privadas del entrenador', scope: 'selected-client', roles: ['coach'] }),
  inteligencia: Object.freeze({ key: 'inteligencia', label: 'Inteligencia', title: 'Inteligencia IBERFIT', scope: 'selected-client', roles: ['coach'] }),
  biblioteca: Object.freeze({ key: 'biblioteca', label: 'Biblioteca', title: 'Biblioteca visual', scope: 'global', roles: ['coach','admin'] }),
  retos: Object.freeze({ key: 'retos', label: 'Retos y comunidad', title: 'Retos y comunidad', scope: 'client-context', roles: ['coach', 'client'] }),
  ajustes: Object.freeze({ key: 'ajustes', label: 'Ajustes', title: 'Ajustes', scope: 'global', roles: ['coach', 'client'] }),
  verificacion: Object.freeze({ key: 'verificacion', label: 'Sincronización', title: 'Estado de cambios', scope: 'global', roles: ['coach'] }),
  mensajes: Object.freeze({ key: 'mensajes', label: 'Mensajes', title: 'Mensajes IBERFIT', scope: 'global', roles: ['coach','client'] }),
  ...ADMIN_AREAS,
});

const AREA_ALIASES = Object.freeze({
  inicio: 'hoy',home: 'hoy',cliente: 'expediente',diagnostico: 'iri',diagnóstico: 'iri',plan: 'planificacion',planificación: 'planificacion',entrenar: 'sesion',sesiones: 'sesion',informe: 'informes',reportes: 'informes',cliente360: 'progreso','cliente-360': 'progreso',cliente_360: 'progreso',library: 'biblioteca',qa: 'verificacion',mensaje:'mensajes',mensajes:'mensajes',comunicacion:'mensajes',comunicación:'mensajes',administracion:'admin-inicio',administración:'admin-inicio',usuarios:'admin-usuarios',equipo:'admin-equipo',operaciones:'admin-operaciones',auditoria:'admin-auditoria',auditoría:'admin-auditoria',
  comunidad: 'retos',
  challenges: 'retos',
  configuracion: 'ajustes',
  configuración: 'ajustes',
  settings: 'ajustes',
});

const NAVIGATION = Object.freeze({
  admin: Object.freeze({...ADMIN_NAVIGATION}),
  coach: Object.freeze({
    primary: ['hoy', 'clientes', 'agenda', 'biblioteca'],
    context: ['expediente', 'iri', 'planificacion', 'sesion', 'progreso', 'actividad', 'informes', 'retos', 'notas', 'inteligencia'],
    tools: ['mensajes', 'ajustes', 'verificacion'],
    mobile: ['hoy', 'clientes', 'agenda', 'mensajes'],
  }),
  client: Object.freeze({
    primary: ['hoy', 'planificacion', 'sesion', 'progreso'],
    context: ['informes', 'actividad', 'mensajes', 'retos'],
    tools: ['ajustes'],
    mobile: ['hoy', 'sesion', 'progreso', 'actividad'],
  }),
});

export function canonicalArea(value) {const requested=String(value||'').trim().toLowerCase();if(M26_AREAS[requested])return requested;return AREA_ALIASES[requested]||null;}
export function areaDefinition(value){const key=canonicalArea(value);return key?M26_AREAS[key]:null;}
function resolveItems(keys){return keys.map((key)=>M26_AREAS[key]);}
export function navigationForRole(value){const role=assertKnownRole(value);const model=NAVIGATION[role];return Object.freeze({role,primary:Object.freeze(resolveItems(model.primary)),context:Object.freeze(resolveItems(model.context)),tools:Object.freeze(resolveItems(model.tools)),mobile:Object.freeze(resolveItems(model.mobile))});}
export function roleHome(value){const role=assertKnownRole(value);return role==='admin'?'admin-inicio':'hoy';}
export function areaAllowedForRole(area,role){const definition=areaDefinition(area);const normalized=assertKnownRole(role);if(normalized==='admin')return Boolean((definition?.key?.startsWith('admin-')||definition?.key==='biblioteca')&&definition?.roles?.includes('admin'));return Boolean(definition?.roles?.includes(normalized));}

const MOBILE_MORE_SELECTOR='details.m26-mobile-more';
const ADMIN_SHELL_SELECTOR='.m26-shell[data-m26-role="admin"]';
const MOBILE_MORE_ROUTE_SELECTOR='[data-m26-area]';
const MOBILE_MORE_POINTER_TYPES=new Set(['touch','pen']);
const MOBILE_MORE_RETARGET_WINDOW_MS=700;
const MOBILE_MORE_BRIDGE_KEY='__IBERFIT_M26_MOBILE_MORE_TOUCH_RETARGET_V1__';
const MOBILE_MORE_DIAG_TYPES=Object.freeze(['touchstart','touchend','touchcancel']);

function normalizeMobileMorePointerType(event){
  return String(event?.pointerType||'').trim().toLowerCase();
}

function mobileMoreRouteControl(node){
  const areaButton=node?.closest?.(MOBILE_MORE_ROUTE_SELECTOR)||null;
  if(!areaButton)return null;
  const details=areaButton.closest?.(MOBILE_MORE_SELECTOR)||null;
  const adminShell=areaButton.closest?.(ADMIN_SHELL_SELECTOR)||null;
  return details&&adminShell?areaButton:null;
}

export function resolvePhysicalMobileMoreRoute(documentLike,event){
  const x=Number(event?.clientX);
  const y=Number(event?.clientY);
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  const hit=documentLike?.elementFromPoint?.(x,y)||null;
  return mobileMoreRouteControl(hit);
}

export function createMobileMoreTouchRetargetBridge({
  documentLike=globalThis.document,
  setTimeoutFn=globalThis.setTimeout?.bind?.(globalThis),
  clearTimeoutFn=globalThis.clearTimeout?.bind?.(globalThis),
}={}){
  if(!documentLike?.addEventListener||!documentLike?.removeEventListener){
    throw new Error('M26_MOBILE_MORE_TOUCH_DOCUMENT_REQUIRED');
  }

  let gesture=null;
  let expiryTimer=null;
  let installed=false;

  function diagnosticNode(node){
    if(!node)return null;
    return {
      tag:String(node.tagName||'').toLowerCase(),
      area:String(node.getAttribute?.('data-m26-area')||''),
      summary:Boolean(node.matches?.('summary')),
      classes:String(node.className||'').slice(0,160),
    };
  }

  function diagnosticPoint(event){
    const touch=event?.changedTouches?.[0]||event?.touches?.[0]||null;
    const eventX=Number(event?.clientX);
    const eventY=Number(event?.clientY);
    const touchX=Number(touch?.clientX);
    const touchY=Number(touch?.clientY);
    const x=Number.isFinite(eventX)?eventX:touchX;
    const y=Number.isFinite(eventY)?eventY:touchY;
    if(!Number.isFinite(x)||!Number.isFinite(y))return null;
    const stack=[...(documentLike.elementsFromPoint?.(x,y)||[])].slice(0,6).map(diagnosticNode);
    return {x,y,stack};
  }

  function recordDiagnostic(event,phase){
    const diag=globalThis.__IBERFIT_ADMIN_ROUTE_DIAG__;
    if(!Array.isArray(diag?.events))return;
    const target=event?.target||null;
    const point=diagnosticPoint(event);
    const targetInAdmin=Boolean(target?.closest?.(ADMIN_SHELL_SELECTOR));
    const targetInMore=Boolean(target?.closest?.(MOBILE_MORE_SELECTOR));
    const physicalAdminRoute=Boolean(point?.stack?.some((item)=>item?.area));
    if(!targetInAdmin&&!targetInMore&&!physicalAdminRoute)return;
    diag.events.push({
      type:'dom-event',
      eventType:String(event?.type||''),
      phase:String(phase||''),
      eventPhase:Number(event?.eventPhase||0),
      isTrusted:event?.isTrusted===true,
      defaultPrevented:Boolean(event?.defaultPrevented),
      pointerType:String(event?.pointerType||''),
      pointerId:Number.isFinite(Number(event?.pointerId))?Number(event.pointerId):null,
      isPrimary:event?.isPrimary===undefined?null:Boolean(event.isPrimary),
      touches:Number(event?.touches?.length||0),
      changedTouches:Number(event?.changedTouches?.length||0),
      target:diagnosticNode(target),
      point,
    });
  }

  function onDiagnosticCapture(event){recordDiagnostic(event,'capture');}
  function onDiagnosticBubble(event){recordDiagnostic(event,'bubble');}

  function clearExpiry(){
    if(expiryTimer===null)return;
    clearTimeoutFn?.(expiryTimer);
    expiryTimer=null;
  }

  function clearGesture(){
    clearExpiry();
    gesture=null;
  }

  function armExpiry(){
    clearExpiry();
    if(typeof setTimeoutFn!=='function')return;
    expiryTimer=setTimeoutFn(()=>{
      expiryTimer=null;
      gesture=null;
    },MOBILE_MORE_RETARGET_WINDOW_MS);
  }

  function onPointerDown(event){
    recordDiagnostic(event,'bridge-capture');
    clearGesture();
    if(event?.isPrimary===false)return;
    if(!MOBILE_MORE_POINTER_TYPES.has(normalizeMobileMorePointerType(event)))return;

    const button=resolvePhysicalMobileMoreRoute(documentLike,event);
    if(!button)return;
    const details=button.closest?.(MOBILE_MORE_SELECTOR)||null;
    if(!details||!(details.open||details.hasAttribute?.('open')))return;

    gesture={pointerId:event?.pointerId,button,details,armed:false};
  }

  function onPointerUp(event){
    recordDiagnostic(event,'bridge-capture');
    if(!gesture)return;
    if(event?.isPrimary===false){
      clearGesture();
      return;
    }
    if(event?.pointerId!==gesture.pointerId){
      clearGesture();
      return;
    }
    if(!MOBILE_MORE_POINTER_TYPES.has(normalizeMobileMorePointerType(event))){
      clearGesture();
      return;
    }

    const button=resolvePhysicalMobileMoreRoute(documentLike,event);
    if(button!==gesture.button){
      clearGesture();
      return;
    }

    gesture.armed=true;
    armExpiry();
  }

  function onPointerCancel(event){
    recordDiagnostic(event,'bridge-capture');
    if(!gesture)return;
    if(event?.pointerId===undefined||event.pointerId===gesture.pointerId)clearGesture();
  }

  function onClick(event){
    recordDiagnostic(event,'bridge-capture');
    const current=gesture;
    if(!current?.armed)return;

    // The shell controller's synthetic .click() is the canonical route path.
    // Leave it untouched and keep the gesture armed for any later trusted
    // browser click that may have been adjusted to the <summary> element.
    if(event?.isTrusted!==true)return;

    const directRoute=mobileMoreRouteControl(event?.target);
    if(directRoute===current.button){
      clearGesture();
      return;
    }

    const targetDetails=event?.target?.closest?.(MOBILE_MORE_SELECTOR)||null;
    const targetAdminShell=event?.target?.closest?.(ADMIN_SHELL_SELECTOR)||null;
    const button=current.button;
    const details=current.details;
    const buttonStillMounted=
      button?.isConnected!==false&&
      details?.contains?.(button)!==false;
    const retargetedWithinOriginal=targetDetails===details&&Boolean(targetAdminShell)&&buttonStillMounted;
    const residualAfterCanonicalCommit=Boolean(targetDetails)&&Boolean(targetAdminShell)&&!buttonStillMounted;

    clearGesture();
    if(!retargetedWithinOriginal&&!residualAfterCanonicalCommit)return;

    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    if(retargetedWithinOriginal)button.click?.();
  }

  function install(){
    if(installed)return false;
    installed=true;
    for(const type of MOBILE_MORE_DIAG_TYPES){
      documentLike.addEventListener(type,onDiagnosticCapture,{capture:true,passive:true});
      documentLike.addEventListener(type,onDiagnosticBubble,{passive:true});
    }
    documentLike.addEventListener('pointerdown',onPointerDown,{capture:true,passive:true});
    documentLike.addEventListener('pointerup',onPointerUp,{capture:true,passive:true});
    documentLike.addEventListener('pointercancel',onPointerCancel,{capture:true,passive:true});
    documentLike.addEventListener('click',onClick,{capture:true});
    documentLike.addEventListener('pointerdown',onDiagnosticBubble,{passive:true});
    documentLike.addEventListener('pointerup',onDiagnosticBubble,{passive:true});
    documentLike.addEventListener('pointercancel',onDiagnosticBubble,{passive:true});
    documentLike.addEventListener('click',onDiagnosticBubble);
    return true;
  }

  function destroy(){
    if(!installed)return false;
    installed=false;
    clearGesture();
    for(const type of MOBILE_MORE_DIAG_TYPES){
      documentLike.removeEventListener(type,onDiagnosticCapture,true);
      documentLike.removeEventListener(type,onDiagnosticBubble,false);
    }
    documentLike.removeEventListener('pointerdown',onPointerDown,true);
    documentLike.removeEventListener('pointerup',onPointerUp,true);
    documentLike.removeEventListener('pointercancel',onPointerCancel,true);
    documentLike.removeEventListener('click',onClick,true);
    documentLike.removeEventListener('pointerdown',onDiagnosticBubble,false);
    documentLike.removeEventListener('pointerup',onDiagnosticBubble,false);
    documentLike.removeEventListener('pointercancel',onDiagnosticBubble,false);
    documentLike.removeEventListener('click',onDiagnosticBubble,false);
    return true;
  }

  return Object.freeze({install,destroy});
}

export function installMobileMoreTouchRetargetBridge({globalLike=globalThis,documentLike=globalLike?.document}={}){
  if(!documentLike?.addEventListener)return null;
  const existing=globalLike?.[MOBILE_MORE_BRIDGE_KEY];
  if(existing?.destroy)return existing;
  const bridge=createMobileMoreTouchRetargetBridge({documentLike});
  bridge.install();
  try{globalLike[MOBILE_MORE_BRIDGE_KEY]=bridge;}catch{}
  return bridge;
}

installMobileMoreTouchRetargetBridge();
