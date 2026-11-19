// M44 isolated cryptographic DR semantics: synthetic ES256 signing keys only.
// NEVER reads a live JWT, stored private key, production credential or session.
import {generateKeyPairSync,sign,verify} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const data='m44-synthetic-reauth-contract';
const pair=()=>generateKeyPairSync('ec',{namedCurve:'prime256v1'});
function makeToken(key,kid){
 const unsigned=encode({typ:'JWT',alg:'ES256',kid})+'.'+encode({iss:'m44-local-only',sub:data,aud:'authenticated'});
 const signature=sign('sha256',Buffer.from(unsigned),{key,dsaEncoding:'ieee-p1363'});
 return unsigned+'.'+signature.toString('base64url');
}
function verifies(token,publicKey){
 const parts=token.split('.');
 if(parts.length!==3)return false;
 try{
  const header=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
  if(header.alg!=='ES256'||header.typ!=='JWT')return false;
  const signature=Buffer.from(parts[2],'base64url');
  if(signature.length!==64)return false;
  return verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),
   {key:publicKey,dsaEncoding:'ieee-p1363'},signature);
 }catch{return false;}
}
export function checkIsolatedReauthSignatureBoundary(){
 const before=pair(),after=pair();
 const oldJwt=makeToken(before.privateKey,'m44-old-synthetic');
 const newJwt=makeToken(after.privateKey,'m44-new-synthetic');
 if(!verifies(oldJwt,before.publicKey)||!verifies(newJwt,after.publicKey)||
    verifies(oldJwt,after.publicKey)||verifies(newJwt,before.publicKey)||
    verifies(oldJwt+'.',before.publicKey))
  throw Error('M44_SYNTHETIC_KEY_REISSUE_BOUNDARY_FAILED');
 return Object.freeze({syntheticSignatureBoundaryVerified:true,
  previousTokenDeniedByReplacementKey:true,
  recoveredTokenAcceptedByReplacementKey:true,
  refreshSessionsInvalidated:false, // DB rehearsal required separately
  hostedAuthRestoreVerified:false, edgeRuntimeVerified:false,
  productionKeysRotated:false, platformRecoveryVerified:false});
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 checkIsolatedReauthSignatureBoundary();
 console.log('M44_ISOLATED_SYNTHETIC_ES256_REISSUE_BOUNDARY_VERIFIED_ONLY');
 console.log('M44_HOSTED_AUTH_JWT_KEY_RESTORATION_NOT_CERTIFIED');
}
