import {runWebAuthnCeremony} from '../app/webauthn.js';
import {createAdminCommand} from './command-catalog.js';

const PRIVILEGED_REAUTH_COMMANDS=new Set(['ADMIN_CLIENTE_ELIMINAR']);

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

async function reauthenticatePrivileged(transport,token,runCeremony=runWebAuthnCeremony){
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
  const userId=String(user?.id||'').trim();
  if(!userId)throw new Error('M26_ADMIN_PRIVILEGED_IDENTITY_INVALID');
  if(assurance?.webauthnRequired!==true||assurance?.iberfitAssurance==='verified')return true;
  if(assurance?.credentialEnrolled!==true)throw new Error('M26_ADMIN_PRIVILEGED_DEVICE_REQUIRED');

  const factorId=String(transport.privilegedWebAuthnFactorId||'').trim();
  const challenge=await transport.challengeWebAuthn(token,factorId);
  if(challenge?.type!=='request')throw new Error('M26_ADMIN_PRIVILEGED_CHALLENGE_INVALID');
  const ceremony=await runCeremony(challenge,{friendlyName:'IBERFIT · confirmar acción administrativa'});
  if(ceremony?.type!==challenge.type)throw new Error('M26_ADMIN_PRIVILEGED_CEREMONY_INVALID');
  const verified=await transport.verifyWebAuthn(token,{
    factorId,
    challengeId:challenge.challengeId,
    type:ceremony.type,
    credentialResponse:ceremony.credentialResponse,
  });
  if(String(verified?.user?.id||'').trim()!==userId)throw new Error('M26_ADMIN_PRIVILEGED_IDENTITY_MISMATCH');
  const finalAssurance=await transport.authAssuranceContext(token);
  if(finalAssurance?.webauthnRequired===true&&finalAssurance?.iberfitAssurance!=='verified'){
    throw new Error('M26_ADMIN_PRIVILEGED_REAUTH_NOT_CONFIRMED');
  }
  return true;
}

export function createAdminCommandService({
  transport,
  getToken,
  getAdminState,
  isOnline=()=>true,
  refreshState=async()=>{},
  runPrivilegedCeremony=runWebAuthnCeremony,
}={}){
  if(!transport?.execute)throw new Error('M26_ADMIN_TRANSPORT_REQUIRED');
  const inFlight=new Map();
  return Object.freeze({
    execute(input){
      if(!isOnline())return Promise.reject(new Error('M26_ADMIN_ONLINE_REQUIRED'));
      const command=createAdminCommand(input,getAdminState());
      const signature=fingerprint(command);
      const current=inFlight.get(command.operationId);
      if(current){
        if(current.signature!==signature)return Promise.reject(new Error('M26_ADMIN_OPERATION_ID_COLLISION'));
        return current.promise;
      }
      const promise=(async()=>{
        const token=await getToken();
        let response;
        try{
          response=await transport.execute(token,command);
        }catch(error){
          if(!PRIVILEGED_REAUTH_COMMANDS.has(command.type)||!privilegedAssuranceRequired(error))throw error;
          await reauthenticatePrivileged(transport,token,runPrivilegedCeremony);
          response=await transport.execute(token,command);
        }
        await refreshState({reason:'admin-mutation-ack',response});
        return Object.freeze({ok:true,command,response});
      })().finally(()=>inFlight.delete(command.operationId));
      inFlight.set(command.operationId,{signature,promise});
      return promise;
    },
  });
}

export const __adminServiceInternals=Object.freeze({
  canonical,
  fingerprint,
  privilegedAssuranceRequired,
  reauthenticatePrivileged,
});
