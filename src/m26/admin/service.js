import {runWebAuthnCeremony} from '../app/webauthn.js';
import {createAdminCommand} from './command-catalog.js';
import {createInvitationAttemptTracker} from '../workflows/coach-invitation-outcome.js';

const PRIVILEGED_REAUTH_COMMANDS=new Set(['ADMIN_CLIENTE_CREAR','ADMIN_CLIENTE_REENVIAR_INVITACION','ADMIN_CLIENTE_ACTUALIZAR_FICHA','ADMIN_CLIENTE_CAMBIAR_SERVICIO','ADMIN_CLIENTE_ELIMINAR','ADMIN_USUARIO_ELIMINAR']);
const ADMIN_SERVICE_EVENT='m26:admin-service-ready';

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map((k)=>[k,canonical(value[k])]));
  return value;
}

function fingerprint(command){
  return JSON.stringify(canonical({
    type:command.type,
    entityId:command.entityId,
    organizationId:command.organizationId,
    baseRevision:command.baseRevision,
    reason:command.reason,
    payload:command.payload,
  }));
}

function privilegedAssuranceRequired(error){
  return /IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED/u.test(String(error?.message||error||''));
}

async function reauthenticatePrivileged(transport,token,runCeremony=runWebAuthnCeremony,assertCurrent=()=>{}){
  if(
    !transport?.authAssuranceContext||
    !transport?.authUser||
    !transport?.challengeWebAuthn||
    !transport?.verifyWebAuthn||
    !transport?.privilegedWebAuthnFactorId
  )throw new Error('M26_ADMIN_PRIVILEGED_REAUTH_UNAVAILABLE');

  const [assurance,user]=await Promise.all([
    transport.authAssuranceContext(token),
    transport.authUser(token),
  ]);
  assertCurrent();
  const userId=String(user?.id||'').trim();
  if(!userId)throw new Error('M26_ADMIN_PRIVILEGED_IDENTITY_INVALID');
  if(assurance?.webauthnRequired!==true||assurance?.iberfitAssurance==='verified')return true;
  if(assurance?.credentialEnrolled!==true)throw new Error('M26_ADMIN_PRIVILEGED_DEVICE_REQUIRED');

  const factorId=String(transport.privilegedWebAuthnFactorId||'').trim();
  const challenge=await transport.challengeWebAuthn(token,factorId);assertCurrent();
  if(challenge?.type!=='request')throw new Error('M26_ADMIN_PRIVILEGED_CHALLENGE_INVALID');
  const ceremony=await runCeremony(challenge,{friendlyName:'IBERFIT · confirmar acción administrativa'});assertCurrent();
  if(ceremony?.type!==challenge.type)throw new Error('M26_ADMIN_PRIVILEGED_CEREMONY_INVALID');
  const verified=await transport.verifyWebAuthn(token,{
    factorId,
    challengeId:challenge.challengeId,
    type:ceremony.type,
    credentialResponse:ceremony.credentialResponse,
  });
  assertCurrent();
  if(String(verified?.user?.id||'').trim()!==userId)throw new Error('M26_ADMIN_PRIVILEGED_IDENTITY_MISMATCH');
  const finalAssurance=await transport.authAssuranceContext(token);assertCurrent();
  if(finalAssurance?.webauthnRequired===true&&finalAssurance?.iberfitAssurance!=='verified'){
    throw new Error('M26_ADMIN_PRIVILEGED_REAUTH_NOT_CONFIRMED');
  }
  return true;
}

function announceAdminService(service){
  try{
    const EventCtor=globalThis.CustomEvent;
    if(typeof globalThis.dispatchEvent==='function'&&typeof EventCtor==='function'){
      queueMicrotask(()=>globalThis.dispatchEvent(new EventCtor(ADMIN_SERVICE_EVENT,{detail:{service}})));
    }
  }catch{}
  return service;
}

export function createAdminCommandService({
  transport,
  getToken,
  getAdminState,
  getSessionLease=null,
  isOnline=()=>true,
  refreshState=async()=>{},
  runPrivilegedCeremony=runWebAuthnCeremony,
  refreshWaitMs=180,
  onRefreshError=()=>{},
}={}){
  if(!transport?.execute)throw new Error('M26_ADMIN_TRANSPORT_REQUIRED');
  const inFlight=new Map();
  const invitationAttempts=createInvitationAttemptTracker();
  const boundedRefreshWait=Math.max(0,Math.min(Number(refreshWaitMs)||0,1_000));
  function sessionFence(){
    if(typeof getSessionLease!=='function')return ()=>{};
    const lease=getSessionLease();
    if(!lease)throw new Error('M26_ADMIN_SESSION_CHANGED');
    return ()=>{if(getSessionLease()!==lease)throw new Error('M26_ADMIN_SESSION_CHANGED');};
  }
  async function refreshAfterAck(response,assertCurrent){
    const refreshPromise=Promise.resolve()
      .then(()=>{assertCurrent();return refreshState({reason:'admin-mutation-ack',response});})
      .then(()=>Object.freeze({settled:true,ok:true}))
      .catch((error)=>{
        try{onRefreshError(error);}catch{}
        return Object.freeze({settled:true,ok:false});
      });
    const outcome=await Promise.race([
      refreshPromise,
      new Promise((resolve)=>setTimeout(()=>resolve(Object.freeze({settled:false,ok:null})),boundedRefreshWait)),
    ]);
    return Object.freeze({
      refreshPending:outcome.settled!==true,
      refreshOk:outcome.settled===true?outcome.ok:null,
      whenRefreshed:refreshPromise,
    });
  }
  const service=Object.freeze({
    async listMediaReview(){
      if(!isOnline())throw new Error('M26_ADMIN_ONLINE_REQUIRED');
      if(!transport?.listMediaReview)throw new Error('M26_ADMIN_MEDIA_REVIEW_TRANSPORT_REQUIRED');
      const assertCurrent=sessionFence();
      const token=await getToken();assertCurrent();
      const result=await transport.listMediaReview(token);assertCurrent();return result;
    },
    execute(input){
      if(!isOnline())return Promise.reject(new Error('M26_ADMIN_ONLINE_REQUIRED'));
      const assertCurrent=sessionFence();
      const lease=typeof getSessionLease==='function'?getSessionLease():null;
      const tracked=lease&&input?.type==='ADMIN_CLIENTE_REENVIAR_INVITACION'&&!input.operationId;
      let command=createAdminCommand(input,getAdminState());
      if(tracked){const operationId=invitationAttempts.begin(lease,command.entityId,()=>command.operationId);
        if(operationId!==command.operationId)command=Object.freeze({...command,operationId});}
      const signature=fingerprint(command);
      const current=inFlight.get(command.operationId);
      if(current){
        if(current.lease!==lease||current.signature!==signature)return Promise.reject(new Error('M26_ADMIN_OPERATION_ID_COLLISION'));
        return current.promise;
      }
      const promise=(async()=>{
        const token=await getToken();assertCurrent();
        let response;
        try{
          response=await transport.execute(token,command);
        }catch(error){
          assertCurrent();
          if(!PRIVILEGED_REAUTH_COMMANDS.has(command.type)||!privilegedAssuranceRequired(error))throw error;
          await reauthenticatePrivileged(transport,token,runPrivilegedCeremony,assertCurrent);
          assertCurrent();response=await transport.execute(token,command);
        }
        assertCurrent();
        if(tracked)invitationAttempts.settle(lease,command.entityId,command.operationId,response);
        const refresh=await refreshAfterAck(response,assertCurrent);assertCurrent();
        return Object.freeze({ok:true,command,response,...refresh});
      })().finally(()=>inFlight.delete(command.operationId));
      inFlight.set(command.operationId,{signature,promise,lease});
      return promise;
    },
  });
  return announceAdminService(service);
}

export const __adminServiceInternals=Object.freeze({
  canonical,
  fingerprint,
  privilegedAssuranceRequired,
  reauthenticatePrivileged,
  announceAdminService,
  ADMIN_SERVICE_EVENT,
});
