// Real GoTrue + Mailpit exercise inside an internal-only Docker network.
// Contains only synthetic data. Tokens, SMTP message bodies and identities never log.
import {randomBytes,createPublicKey,verify} from 'node:crypto';
import {connect} from 'node:net';
// Explicit narrow Sonar exception: HTTP here only crosses a Docker --internal
// network with NO published ports, using synthetic credentials/identities.
const A='http://m44-auth:9999'; // NOSONAR: isolated internal-only recovery test; no public transport.
const M='http://iberfit-m44-smtp-isolated:8025'; // NOSONAR: same isolated network, no published port.
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// SMTP must be reachable within the Docker --internal network before signup.
// This sends no email and never opens an external network connection.
const SMTP_HOST='iberfit-m44-smtp-isolated';
async function smtpGreeting(){
 return new Promise(resolve=>{
  const socket=connect({host:SMTP_HOST,port:1025});
  let done=false,phase='banner',response='';
  const finish=ok=>{if(done)return;done=true;socket.destroy();resolve(ok)};
  socket.setTimeout(2500,()=>finish(false));
  socket.once('error',()=>finish(false));
  socket.once('close',()=>finish(false));
  socket.on('data',chunk=>{
   response+=chunk.toString('utf8');
   if(response.length>2048)return finish(false);
   if(phase==='banner'){
    if(!response.includes('\r\n'))return;
    if(!/^220[ -]/.test(response))return finish(false);
    phase='ehlo';response='';
    socket.write('EHLO m44-recovery.local\r\n');
   }else if(/(?:^|\r\n)250 [^\r\n]*\r\n/.test(response)){
    // Mailpit must offer STARTTLS, not merely accept an unencrypted socket.
    finish(/(?:^|\r\n)250-STARTTLS\r\n/.test(response));
   }
  });
 });
}
async function waitSmtpReady(){
 for(let i=0;i<20;i++){
  try{
   const result=await fetch(M+'/api/v1/messages',
    {signal:AbortSignal.timeout(1500),redirect:'error'});
   if(result.ok&&await smtpGreeting())return;
  }catch{}
  await sleep(500);
 }
 refuse('LOCAL_SMTP_NOT_READY');
}

const refuse=code=>{throw Error('M44_AUTH_PROBE_'+code)};
async function request(url,options={},timeout=8000){
 try{return await fetch(url,{...options,signal:AbortSignal.timeout(timeout),redirect:'manual'});}
 catch{refuse('LOCAL_REQUEST_FAILED');}
}
async function json(r){try{return await r.json();}catch{refuse('JSON_INVALID');}}
// Error details never leave the isolated runner. Only enum categories from
// known server response fields can be sent to Actions; bodies stay private.
async function authFailure(response,phase){
 const allowedStatus=new Set([400,401,403,404,409,422,429,500,502,503]);
 const status=allowedStatus.has(response.status)?response.status:'OTHER';
 let category='OTHER';
 try{
  const result=await response.json();
  const raw=String(result?.code||result?.error_code||'').toLowerCase();
  const codes=new Map([
   ['email_not_confirmed','EMAIL_NOT_CONFIRMED'],
   ['invalid_credentials','INVALID_CREDENTIALS'],
   ['user_not_found','USER_NOT_FOUND'],
   ['unexpected_failure','UNEXPECTED_FAILURE'],
   ['validation_failed','VALIDATION_FAILED'],
   ['over_request_rate_limit','RATE_LIMIT'],
   ['user_banned','USER_BANNED'],
  ]);
  if(codes.has(raw))category=codes.get(raw);
  else {
   const hint=[result?.msg,result?.error_description,result?.message,result?.error]
    .filter(v=>typeof v==='string'&&v.length<=1024).join(' ').toLowerCase();
   if(/email not confirmed|email_not_confirmed/.test(hint))category='EMAIL_NOT_CONFIRMED';
   else if(/invalid login credentials|invalid credentials/.test(hint))category='INVALID_CREDENTIALS';
   else if(/database error|sqlstate|db error|error granting user/.test(hint))category='DATABASE_ERROR';
   else if(/jwt.*(invalid|sign)|invalid.*jwt/.test(hint))category='JWT_ERROR';
  }
 }catch{}
 refuse(phase+'_'+status+'_'+category);
}
async function waitHealth(){
 for(let n=0;n<45;n++){
  try{
   const r=await fetch(A+'/health',{signal:AbortSignal.timeout(1500)});
   if(r.ok)return;
  }catch{}
  await sleep(1400);
 }
 refuse('GOTRUE_UNHEALTHY');
}
function safeUrl(s){
 if(typeof s!=='string'||s.length>200000)return null;
 const prefix=A+'/verify?';
 const delimiters=new Set([' ', '\n', '\r', '\t', '"', "'", '<', '>']);
 for(let from=0,found=0;found<30;found++){
  const start=s.indexOf(prefix,from);
  if(start<0)return null;
  const max=Math.min(s.length,start+2048);
  let end=start;
  while(end<max&&!delimiters.has(s[end]))end++;
  let candidate=s.slice(start,end).replaceAll('&amp;','&');
  let finish=candidate.length;
  while(finish>0&&'),.'.includes(candidate[finish-1]))finish--;
  candidate=candidate.slice(0,finish);
  try{
   const url=new URL(candidate);
   if(url.origin===A&&url.pathname==='/verify'&&url.searchParams.has('token'))return url;
  }catch{}
  from=start+prefix.length;
 }
 return null;
}

async function confirmFromSmtp(){
 for(let n=0;n<20;n++){
  const resp=await request(M+'/api/v1/messages');
  if(resp.ok){
   const data=await json(resp);
   for(const item of data.messages||[]){
    if(!/^[a-zA-Z0-9-]{1,150}$/.test(item.ID||''))continue;
    const full=await request(M+'/api/v1/message/'+encodeURIComponent(item.ID));
    if(!full.ok)continue;
    const mail=await json(full);
    const url=safeUrl((mail.Text||'')+' '+(mail.HTML||''));
    if(url){
      const verified=await request(url.href);
      if(verified.status!==302 && verified.status!==303 && verified.status!==200)
       refuse('CONFIRMATION_DENIED');
      if(verified.status===302||verified.status===303){
       const location=verified.headers.get('location');
       let next;
       try{next=new URL(location,A);}catch{refuse('CONFIRMATION_REDIRECT_INVALID');}
       if(next.origin!==new URL(A).origin)refuse('CONFIRMATION_EXTERNAL_REDIRECT');
       const fragment=new URLSearchParams(next.hash.replace(/^#/,''));
       if(fragment.has('error')||fragment.has('error_code')||
          next.searchParams.has('error')||next.searchParams.has('error_code'))
        refuse('CONFIRMATION_REJECTED_BY_AUTH');
      }
      return true;
     }
   }
  }
  await sleep(750);
 }
 refuse('SMTP_CONFIRMATION_NOT_DELIVERED');
}
async function verifySignature(access){
 const parts=access.split('.');
 if(parts.length!==3)refuse('JWT_FORMAT_INVALID');
 let header;
 try{header=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));}catch{refuse('JWT_HEADER_INVALID');}
 if(header.alg!=='ES256'||typeof header.kid!=='string')refuse('JWT_NOT_REPLACEMENT_ES256');
 const r=await request(A+'/.well-known/jwks.json');
 if(!r.ok)refuse('LOCAL_JWKS_UNAVAILABLE');
 const jwks=await json(r);
 const pub=(jwks.keys||[]).find(k=>k.kid===header.kid);
 if(!pub || pub.kty!=='EC'||pub.crv!=='P-256'||pub.d!==undefined)refuse('LOCAL_JWKS_INVALID');
 const key=createPublicKey({key:pub,format:'jwk'});
 const valid=verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),
  {key,dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url'));
 if(!valid)refuse('ISSUED_JWT_SIGNATURE_INVALID');
}
async function run(){
 await waitHealth();
 await waitSmtpReady();
 const email='m44-recovery-'+randomBytes(9).toString('hex')+'@gmail.com';
 const password='M44#'+randomBytes(20).toString('base64url');
 const body={email,password};
 const signup=await request(A+'/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!signup.ok){
  // Fixed status/code categories only; no response body, addresses, headers
  // or tokens enter CI. The SMTP sink and network are isolated.
  let category='OTHER';
  try {
   const reply=await signup.json();
   const code=String(reply?.code||'');
   const known=new Set(['email_address_invalid','email_provider_disabled',
    'signup_disabled','validation_failed','weak_password',
    'email_address_not_authorized','unexpected_failure','over_email_send_rate_limit']);
   if(known.has(code))category=code.toUpperCase();
   else {
    // GoTrue v2 may use msg/error instead of a structured Auth code.
    // Classify fixed causes only; never emit arbitrary text from the body.
    const hint=[reply?.msg,reply?.error,reply?.message,reply?.error_description]
     .filter(v=>typeof v==='string'&&v.length<=1024).join(' ').toLowerCase();
    if(/database error|database.*(?:saving|creating)|sqlstate|constraint violation/.test(hint))
     category='DB_WRITE';
    else if(/(?:smtp|mailer|email).*(?:send|deliver|refused|failed)|(?:send|deliver).*email/.test(hint))
     category='SMTP_DELIVERY';
    else if(/(?:jwt|signing key).*(?:invalid|failed)|invalid.*(?:jwt|signing key)/.test(hint))
     category='JWT_SIGNING';
    else if(/(?:permission denied|insufficient privilege|not authorized)/.test(hint))
     category='DB_PERMISSION';
   }
  }catch{}
  const status=[400,401,403,404,409,422,429,500,502,503].includes(signup.status)?signup.status:'OTHER';
  refuse('SYNTHETIC_SIGNUP_'+status+'_'+category);
 }
 await confirmFromSmtp();
 const signin=await request(A+'/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!signin.ok)await authFailure(signin,'NEW_SESSION_LOGIN');
 const tokens=await json(signin);
 if(typeof tokens.access_token!=='string'||typeof tokens.refresh_token!=='string')refuse('NEW_SESSION_TOKENS_MISSING');
 await verifySignature(tokens.access_token);
 const refreshed=await request(A+'/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:tokens.refresh_token})});
 if(!refreshed.ok)await authFailure(refreshed,'NEW_SESSION_REFRESH');
 const next=await json(refreshed);
 if(typeof next.access_token!=='string'||typeof next.refresh_token!=='string')refuse('NEW_SESSION_REFRESH_INVALID');
 await verifySignature(next.access_token);
 const logout=await request(A+'/logout',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+next.access_token},body:'{}'});
 if(!logout.ok)refuse('NEW_SESSION_LOGOUT_FAILED');
 const replay=await request(A+'/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:next.refresh_token})});
 if(replay.ok)refuse('REVOKED_REFRESH_ACCEPTED');
 return true;
}
try{
 await run();
 console.log('M44_ISOLATED_GOTRUE_NEW_ES256_SIGNUP_SMTP_REFRESH_LOGOUT_PASS');
}catch(e){
 const code=String(e?.message||'');
 console.error(/^M44_AUTH_PROBE_[A-Z0-9_]+$/.test(code)?code:'M44_AUTH_PROBE_UNKNOWN_ERROR');
 process.exitCode=1;
}
