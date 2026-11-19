// Real GoTrue + Mailpit exercise inside an internal-only Docker network.
// Contains only synthetic data. Tokens, SMTP message bodies and identities never log.
import {randomBytes,createPublicKey,verify} from 'node:crypto';
// Explicit narrow Sonar exception: HTTP here only crosses a Docker --internal
// network with NO published ports, using synthetic credentials/identities.
const A='http://m44-auth:9999'; // NOSONAR: isolated internal-only recovery test; no public transport.
const M='http://iberfit-m44-smtp-isolated:8025'; // NOSONAR: same isolated network, no published port.
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const refuse=code=>{throw Error('M44_AUTH_PROBE_'+code)};
async function request(url,options={},timeout=8000){
 try{return await fetch(url,{...options,signal:AbortSignal.timeout(timeout),redirect:'manual'});}
 catch{refuse('LOCAL_REQUEST_FAILED');}
}
async function json(r){try{return await r.json();}catch{refuse('JSON_INVALID');}}
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
  const candidate=s.slice(start,end).replaceAll('&amp;','&').replace(/[).,]+$/u,'');
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
    if(url){const verified=await request(url.href);if(verified.status!==302 && verified.status!==303 && verified.status!==200)refuse('CONFIRMATION_DENIED');return true;}
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
 const email='m44-recovery-'+randomBytes(9).toString('hex')+'@example.invalid';
 const password='M44#'+randomBytes(20).toString('base64url');
 const body={email,password};
 const signup=await request(A+'/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!signup.ok)refuse('SYNTHETIC_SIGNUP_DENIED');
 await confirmFromSmtp();
 const signin=await request(A+'/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!signin.ok)refuse('NEW_SESSION_LOGIN_FAILED');
 const tokens=await json(signin);
 if(typeof tokens.access_token!=='string'||typeof tokens.refresh_token!=='string')refuse('NEW_SESSION_TOKENS_MISSING');
 await verifySignature(tokens.access_token);
 const refreshed=await request(A+'/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:tokens.refresh_token})});
 if(!refreshed.ok)refuse('NEW_SESSION_REFRESH_FAILED');
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
