// M44: demonstrate continuity of EXTERNAL Edge credentials with independently
// escrowed GitHub environment secrets, comparing only SHA-256 digests returned
// by the Supabase Management API. No remote writes; never log candidate values,
// source digests, raw responses or tokens. This is NOT a full-platform DR gate.
import {createHash,timingSafeEqual} from 'node:crypto';

const PREFIX='M44_EXTERNAL_ESCROW_';
const fail=x=>{throw Error(PREFIX+x);};
const DIGEST=/^[a-f0-9]{64}$/u;
const EXTERNAL=Object.freeze([
  'GEMINI_API_KEY','GOOGLE_API_KEY',
  'IBERFIT_WEB_PUSH_VAPID_PRIVATE_KEY',
  'IBERFIT_WEB_PUSH_VAPID_PUBLIC_KEY',
  'IBERFIT_WEB_PUSH_VAPID_SUBJECT'
]);
const SUBJECT='IBERFIT_WEB_PUSH_VAPID_SUBJECT';
const VAPID=EXTERNAL.slice(2);
const MIN=Object.freeze({
  GEMINI_API_KEY:16, GOOGLE_API_KEY:16,
  IBERFIT_WEB_PUSH_VAPID_PRIVATE_KEY:32,
  IBERFIT_WEB_PUSH_VAPID_PUBLIC_KEY:32,
  IBERFIT_WEB_PUSH_VAPID_SUBJECT:6
});
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);

export function attestM44ExternalEscrow({managedSecrets,candidates,smtpCandidate}){
  if(!Array.isArray(managedSecrets)||managedSecrets.length>500||
    !candidates||typeof candidates!=='object'||Array.isArray(candidates))
    fail('INPUT_INVALID');
  if(Object.keys(candidates).some(name=>!EXTERNAL.includes(name)))
    fail('CANDIDATE_NAME_NOT_ALLOWLISTED');
  const managed=new Map();
  for(const entry of managedSecrets){
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||
      typeof entry.name!=='string'||!/^[_A-Z][_A-Z0-9]{1,120}$/u.test(entry.name))
      fail('METADATA_SHAPE_INVALID');
    if(!EXTERNAL.includes(entry.name))continue;
    if(managed.has(entry.name))fail('METADATA_DUPLICATE');
    managed.set(entry.name,entry);
  }
  const used=EXTERNAL.filter(x=>managed.has(x));
  const digestCompatible=used.length>0 && used.every(name=>
    typeof managed.get(name).value==='string'&&DIGEST.test(managed.get(name).value));
  const matches=name=>{
    const entry=managed.get(name);
    const value=own(candidates,name)?candidates[name]:undefined;
    if(!entry||typeof entry.value!=='string'||!DIGEST.test(entry.value)||
      typeof value!=='string'||value.length<MIN[name]||value.length>4096||
      value.includes('\0')||value.includes('\r')||value.includes('\n'))return false;
    // Constant-time comparison, never expose the source digest or candidate.
    const computed=createHash('sha256').update(value,'utf8').digest();
    const remote=Buffer.from(entry.value,'hex');
    return computed.length===remote.length&&timingSafeEqual(computed,remote);
  };
  // If Gemini takes precedence in deployed source, a Google fallback alone
  // cannot certify identical runtime behavior after recovery.
  const aiName=managed.has('GEMINI_API_KEY')?'GEMINI_API_KEY':
    managed.has('GOOGLE_API_KEY')?'GOOGLE_API_KEY':null;
  const aiMatched=Boolean(aiName&&matches(aiName));
  const vapidMatched=VAPID.every(name=>matches(name));
  const matchedCount=used.filter(matches).length;
  const allConfiguredMatched=used.length>=4&&matchedCount===used.length&&
    aiMatched&&vapidMatched;
  // SMTP password has no comparable digest in hosted Auth configuration.
  // Length/shape evidence MUST NOT be mistaken for equivalence or delivery.
  const smtpCandidatePresent=typeof smtpCandidate==='string'&&
    smtpCandidate.length>=12&&smtpCandidate.length<=4096&&
    !smtpCandidate.includes('\0')&&!smtpCandidate.includes('\n');
  return Object.freeze({
    managedExternalNames:used.length,
    digestMetadataCompatible:digestCompatible,
    matchingIndependentCandidates:matchedCount,
    aiCandidateMatched:aiMatched,
    vapidCandidateMatched:vapidMatched,
    allConfiguredExternalCandidatesMatched:allConfiguredMatched,
    smtpCandidatePresent, smtpPasswordMatchVerified:false,
    liveProviderContinuityVerified:false,
    authSigningKeysRecovered:false,
    fullPlatformRecoveryCertified:false,
    productionActivationAuthorized:false
  });
}
