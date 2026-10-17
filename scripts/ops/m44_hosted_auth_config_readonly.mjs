import path from 'node:path';
import {pathToFileURL} from 'node:url';
/**
 * M44 hosted Auth inventory probe. READ ONLY.
 * Supabase Management GET may return OAuth/SMTP secrets. Never log/persist
 * the response; only evaluate in memory, emit fixed markers and counts.
 * Not a service recovery certificate.
 */
const REF='pjhmrhejsoofmouedavw';
const ENDPOINT='https://api.supabase.com/v1/projects/'+REF+'/config/auth';
const PREFIX='M44_HOSTED_AUTH_READONLY_';
const fail=(code)=>{throw Error(PREFIX+code)};
const boolKeys=['disable_signup','external_email_enabled','mailer_autoconfirm'];
const optionalBoolKeys=['mailer_secure_email_change_enabled','external_phone_enabled','external_anonymous_users_enabled'];
const endpointName='GET v1 project auth config';
const MAX_RESPONSE_BYTES=1024*1024;
const MAX_REDIRECT_ALLOWLIST=32*1024;
function checkBool(value){return typeof value==='boolean';}
function keysArePlainObject(o){return o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;}
export function assessHostedAuthConfig(config){
 if(!keysArePlainObject(config))fail('CONFIG_TYPE_INVALID');
 for(const key of boolKeys)if(!checkBool(config[key]))fail('REQUIRED_BOOLEAN_INVALID');
 for(const key of optionalBoolKeys)if(Object.hasOwn(config,key)&&config[key]!==null&&!checkBool(config[key]))fail('OPTIONAL_BOOLEAN_INVALID');
 if(!Number.isInteger(config.jwt_exp)||config.jwt_exp<60||config.jwt_exp>604800)
  fail('JWT_EXP_INVALID');
 if(typeof config.site_url!=='string'||config.site_url.length>2048)
  fail('SITE_URL_INVALID');
 let site;
 try{site=new URL(config.site_url);}catch{fail('SITE_URL_INVALID');}
 if(site.protocol!=='https:'||site.username||site.password||site.hash)
  fail('SITE_URL_UNSAFE');
 const approvedSite=['app.iberfit.cl','iberfit.cl','www.iberfit.cl'].includes(site.hostname);
 if(typeof config.uri_allow_list!=='string'||
    config.uri_allow_list.length>MAX_REDIRECT_ALLOWLIST)fail('ALLOWLIST_INVALID');
 // Do not leak the URL or any redirect URL in errors or console output.
 if(!approvedSite)fail('SITE_URL_NOT_IBERFIT');
 if(config.external_email_enabled!==true)fail('EMAIL_LOGIN_DISABLED');
 const hasEmailConfirmation=config.mailer_autoconfirm===false;
 const providerNames=Object.keys(config).filter(key=>/^external_[a-z0-9_]+_enabled$/.test(key)&&!['external_email_enabled','external_phone_enabled','external_anonymous_users_enabled'].includes(key));
 for(const n of providerNames)if(!checkBool(config[n]))fail('PROVIDER_FLAG_INVALID');
 const enabledProviders=providerNames.filter(n=>config[n]===true).length;
 return Object.freeze({
  projectRef:REF,
  endpointName,
  inspectedPolicyFields:boolKeys.length+optionalBoolKeys.filter(k=>Object.hasOwn(config,k)).length+3+providerNames.length,
  enabledProviderCount:enabledProviders,
  // True means only configuration metadata passed this restricted audit.
  configurationShapeVerified:true,
  emailLoginConfigured:true,
  emailConfirmationConfigured:hasEmailConfirmation,
  authUserRestorationVerified:false,
  jwtSigningKeyRestorationVerified:false,
  oauthSecretsRestorationVerified:false,
  smtpDeliveryVerified:false,
  redirectRecoveryVerified:false,
  credentialContinuityVerified:false,
  platformRecoveryVerified:false,
 });
}
export async function probeHostedAuthConfig({accessToken,fetchImpl=fetch}={}){
 if(typeof accessToken!=='string'||accessToken.length<16)
  fail('MANAGEMENT_TOKEN_MISSING');
 if(typeof fetchImpl!=='function')fail('FETCH_UNAVAILABLE');
 let response;
 try{
  response=await fetchImpl(ENDPOINT,{
   method:'GET',
   headers:{Authorization:'Bearer '+accessToken,Accept:'application/json'},
   redirect:'error',
   signal:AbortSignal.timeout(20000)
  });
 }catch{fail('FETCH_FAILED');}
 if(!response||response.ok!==true)fail('REMOTE_REJECTED');
 // Limit body without writing secrets to filesystem or stdout.
 const declaredSize=Number(response.headers?.get?.('content-length')||0);
 if(declaredSize>MAX_RESPONSE_BYTES)fail('RESPONSE_TOO_LARGE');
 let text='';
 try{
  if(!response.body||typeof response.body[Symbol.asyncIterator]!=='function')fail('NO_STREAM');
  const chunks=[];let length=0;
  for await(const chunk of response.body){
   if(!(chunk instanceof Uint8Array))fail('INVALID_CHUNK');
   length+=chunk.byteLength;
   if(length>MAX_RESPONSE_BYTES)fail('RESPONSE_TOO_LARGE');
   chunks.push(Buffer.from(chunk));
  }
  text=Buffer.concat(chunks).toString('utf8');
 }catch(e){
  if(String(e?.message||'').startsWith(PREFIX))throw e;
  fail('BODY_READ_FAILED');
 }
 let value;
 try{value=JSON.parse(text);}catch{fail('INVALID_JSON');}
 // The object may contain raw provider credentials: drop the raw string
 // and never return properties or serialized configuration.
 text='';
 return assessHostedAuthConfig(value);
}
function safeRun(){
 probeHostedAuthConfig({accessToken:process.env.SUPABASE_ACCESS_TOKEN})
 .then(result=>{
  process.stdout.write('M44_HOSTED_AUTH_CONFIG_METADATA_OK:project=PROD:fields='+
    result.inspectedPolicyFields+':providers='+result.enabledProviderCount+'\n');
  process.stdout.write('M44_HOSTED_AUTH_RECOVERY_NOT_CERTIFIED:jwt_smtp_oauth_sessions=UNVERIFIED\n');
 }).catch(error=>{
  const msg=String(error?.message||'');
  process.stderr.write((msg.startsWith(PREFIX)?msg:PREFIX+'VALIDATION_FAILED')+'\n');
  process.exitCode=1;
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv.length!==2){process.stderr.write(PREFIX+'USAGE_INVALID\n');process.exitCode=1;}
 else safeRun();
}
