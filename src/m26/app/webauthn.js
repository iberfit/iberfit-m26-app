const MAX_WEBAUTHN_JSON_BYTES=512_000;
const BASE64URL_PATTERN=/^[A-Za-z0-9_-]+$/u;

function jsonClone(value,code){
  let text;
  try{text=JSON.stringify(value);}catch{throw new Error(code);}
  if(!text||text.length>MAX_WEBAUTHN_JSON_BYTES)throw new Error(code);
  try{return JSON.parse(text);}catch{throw new Error(code);}
}

function decodeBase64Url(value,code='M26_WEBAUTHN_BASE64URL_INVALID'){
  const raw=String(value||'');
  if(!raw||raw.length>131072||!BASE64URL_PATTERN.test(raw))throw new Error(code);
  const pad=(4-(raw.length%4))%4;
  const base64=raw.replace(/-/gu,'+').replace(/_/gu,'/')+'='.repeat(pad);
  let binary;
  try{
    if(typeof atob==='function')binary=atob(base64);
    else binary=Buffer.from(base64,'base64').toString('binary');
  }catch{throw new Error(code);}
  const bytes=new Uint8Array(binary.length);
  for(let index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);
  return bytes;
}

function encodeBase64Url(value,code='M26_WEBAUTHN_BUFFER_INVALID'){
  let bytes;
  try{
    if(value instanceof ArrayBuffer)bytes=new Uint8Array(value);
    else if(ArrayBuffer.isView(value))bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
    else throw new Error(code);
  }catch{throw new Error(code);}
  if(bytes.byteLength>262144)throw new Error(code);
  let binary='';
  for(let index=0;index<bytes.length;index+=1)binary+=String.fromCharCode(bytes[index]);
  const base64=typeof btoa==='function'?btoa(binary):Buffer.from(binary,'binary').toString('base64');
  return base64.replace(/\+/gu,'-').replace(/\//gu,'_').replace(/=+$/u,'');
}

function publicKeyJson(raw,code){
  const container=jsonClone(raw,code);
  const value=container?.publicKey??container;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(code);
  return value;
}

function normalizeRegistrationUser(options,friendlyName){
  if(!options?.user||typeof options.user!=='object'||Array.isArray(options.user))return options;
  const fallback=String(friendlyName||'IBERFIT').replace(/[\u0000-\u001f\u007f]/gu,' ').trim().slice(0,64)||'IBERFIT';
  if(!String(options.user.name||'').trim())options.user.name=fallback;
  if(!String(options.user.displayName||'').trim())options.user.displayName=fallback;
  return options;
}

function fallbackCreationOptions(raw,friendlyName){
  const options=normalizeRegistrationUser(publicKeyJson(raw,'M26_WEBAUTHN_CREATE_OPTIONS_INVALID'),friendlyName);
  options.challenge=decodeBase64Url(options.challenge,'M26_WEBAUTHN_CREATE_OPTIONS_INVALID');
  if(!options.user||typeof options.user!=='object'||Array.isArray(options.user))throw new Error('M26_WEBAUTHN_CREATE_OPTIONS_INVALID');
  options.user.id=decodeBase64Url(options.user.id,'M26_WEBAUTHN_CREATE_OPTIONS_INVALID');
  if(Array.isArray(options.excludeCredentials)){
    options.excludeCredentials=options.excludeCredentials.map((credential)=>({
      ...credential,
      id:decodeBase64Url(credential?.id,'M26_WEBAUTHN_CREATE_OPTIONS_INVALID'),
    }));
  }
  return options;
}

function fallbackRequestOptions(raw){
  const options=publicKeyJson(raw,'M26_WEBAUTHN_REQUEST_OPTIONS_INVALID');
  options.challenge=decodeBase64Url(options.challenge,'M26_WEBAUTHN_REQUEST_OPTIONS_INVALID');
  if(Array.isArray(options.allowCredentials)){
    options.allowCredentials=options.allowCredentials.map((credential)=>({
      ...credential,
      id:decodeBase64Url(credential?.id,'M26_WEBAUTHN_REQUEST_OPTIONS_INVALID'),
    }));
  }
  return options;
}

function creationOptions(raw,PublicKeyCredentialImpl,friendlyName){
  const json=normalizeRegistrationUser(publicKeyJson(raw,'M26_WEBAUTHN_CREATE_OPTIONS_INVALID'),friendlyName);
  const parser=PublicKeyCredentialImpl?.parseCreationOptionsFromJSON;
  if(typeof parser==='function'){
    try{return parser.call(PublicKeyCredentialImpl,json);}
    catch{throw new Error('M26_WEBAUTHN_CREATE_OPTIONS_INVALID');}
  }
  return fallbackCreationOptions(json,friendlyName);
}

function requestOptions(raw,PublicKeyCredentialImpl){
  const json=publicKeyJson(raw,'M26_WEBAUTHN_REQUEST_OPTIONS_INVALID');
  const parser=PublicKeyCredentialImpl?.parseRequestOptionsFromJSON;
  if(typeof parser==='function'){
    try{return parser.call(PublicKeyCredentialImpl,json);}
    catch{throw new Error('M26_WEBAUTHN_REQUEST_OPTIONS_INVALID');}
  }
  return fallbackRequestOptions(json);
}

function extensionResults(credential){
  const value=credential?.getClientExtensionResults?.();
  return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
}

function commonCredentialJson(credential){
  const id=String(credential?.id||'');
  const type=String(credential?.type||'');
  if(!id||id.length>8192||!BASE64URL_PATTERN.test(id)||type!=='public-key')throw new Error('M26_WEBAUTHN_CREDENTIAL_INVALID');
  return {
    id,
    rawId:encodeBase64Url(credential.rawId),
    type,
    clientExtensionResults:extensionResults(credential),
    ...(credential?.authenticatorAttachment?{authenticatorAttachment:String(credential.authenticatorAttachment)}:{}),
  };
}

function fallbackCredentialJson(credential,action){
  const common=commonCredentialJson(credential);
  const response=credential?.response;
  if(!response||typeof response!=='object')throw new Error('M26_WEBAUTHN_CREDENTIAL_INVALID');
  if(action==='create'){
    const transports=typeof response.getTransports==='function'?response.getTransports():undefined;
    return {
      ...common,
      response:{
        clientDataJSON:encodeBase64Url(response.clientDataJSON),
        attestationObject:encodeBase64Url(response.attestationObject),
        ...(Array.isArray(transports)?{transports:transports.map((item)=>String(item))}:{}),
      },
    };
  }
  return {
    ...common,
    response:{
      clientDataJSON:encodeBase64Url(response.clientDataJSON),
      authenticatorData:encodeBase64Url(response.authenticatorData),
      signature:encodeBase64Url(response.signature),
      userHandle:response.userHandle==null?null:encodeBase64Url(response.userHandle),
    },
  };
}

function credentialJson(credential,action){
  if(!credential||typeof credential!=='object')throw new Error('M26_WEBAUTHN_CREDENTIAL_INVALID');
  if(typeof credential.toJSON==='function'){
    let value;
    try{value=credential.toJSON();}catch{throw new Error('M26_WEBAUTHN_CREDENTIAL_INVALID');}
    const cloned=jsonClone(value,'M26_WEBAUTHN_CREDENTIAL_INVALID');
    if(String(cloned?.type||'')!=='public-key'||!String(cloned?.id||''))throw new Error('M26_WEBAUTHN_CREDENTIAL_INVALID');
    return cloned;
  }
  return fallbackCredentialJson(credential,action);
}

function ceremonyError(error){
  const raw=String(error?.message||'');
  if(/^M26_WEBAUTHN_[A-Z0-9_:-]+$/u.test(raw))return error;
  const name=String(error?.name||'');
  const map={
    AbortError:'M26_WEBAUTHN_ABORTED',
    InvalidStateError:'M26_WEBAUTHN_INVALID_STATE',
    NotAllowedError:'M26_WEBAUTHN_NOT_ALLOWED',
    SecurityError:'M26_WEBAUTHN_SECURITY_ERROR',
  };
  return new Error(map[name]||'M26_WEBAUTHN_CEREMONY_FAILED');
}

export function webAuthnSupported({
  navigatorLike=globalThis.navigator,
  PublicKeyCredentialImpl=globalThis.PublicKeyCredential,
}={}){
  return Boolean(
    PublicKeyCredentialImpl&&
    navigatorLike?.credentials&&
    typeof navigatorLike.credentials.create==='function'&&
    typeof navigatorLike.credentials.get==='function'
  );
}

export async function runWebAuthnCeremony(challenge,{
  navigatorLike=globalThis.navigator,
  PublicKeyCredentialImpl=globalThis.PublicKeyCredential,
  friendlyName='IBERFIT',
}={}){
  if(!webAuthnSupported({navigatorLike,PublicKeyCredentialImpl}))throw new Error('M26_WEBAUTHN_UNSUPPORTED');
  const type=String(challenge?.type||'').trim().toLowerCase();
  if(!['create','request'].includes(type))throw new Error('M26_WEBAUTHN_CHALLENGE_TYPE_INVALID');
  try{
    const publicKey=type==='create'
      ?creationOptions(challenge?.credentialOptions,PublicKeyCredentialImpl,friendlyName)
      :requestOptions(challenge?.credentialOptions,PublicKeyCredentialImpl);
    const credential=type==='create'
      ?await navigatorLike.credentials.create({publicKey})
      :await navigatorLike.credentials.get({publicKey});
    if(!credential)throw new Error('M26_WEBAUTHN_CREDENTIAL_MISSING');
    return Object.freeze({
      type,
      credentialResponse:Object.freeze(credentialJson(credential,type)),
    });
  }catch(error){
    throw ceremonyError(error);
  }
}

export const __webauthnInternals=Object.freeze({
  decodeBase64Url,
  encodeBase64Url,
  fallbackCreationOptions,
  fallbackRequestOptions,
  credentialJson,
});
