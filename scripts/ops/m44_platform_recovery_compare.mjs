// IBERFIT M44 platform catalog parity check (read-only comparison).
// Inputs must originate from separately attested source and isolated restore.
// Equal hashes DO NOT prove source identity, actual isolation, plaintext
// recoverability, restored user records or hosted Supabase Auth configuration.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export const SCHEMA='iberfit.m44.platform.catalog.v1';
export const CATEGORIES=Object.freeze([
 'roles','role_memberships','relation_security','default_privileges',
 'function_security','policies','triggers','extensions',
 'bucket_configuration','migration_history'
]);
const PREFIX='M44_PLATFORM_CATALOG_';
const HEX64=/^[a-f0-9]{64}$/;
export function validatePlatformCatalog(data){
 if(!data||typeof data!=='object'||Array.isArray(data))
  throw Error(PREFIX+'INVALID');
 if(data.schema!==SCHEMA||
  Object.keys(data).length!==CATEGORIES.length+1||
  Object.keys(data).some(x=>x!=='schema'&&!CATEGORIES.includes(x)))
  throw Error(PREFIX+'SCHEMA_INVALID');
 if(CATEGORIES.some(k=>!HEX64.test(data[k]||'')))
  throw Error(PREFIX+'HASH_INVALID');
 return true;
}
export function comparePlatformCatalog(source,restored){
 validatePlatformCatalog(source);validatePlatformCatalog(restored);
 const mismatched=CATEGORIES.filter(category=>source[category]!==restored[category]);
 return Object.freeze({
  catalogParity:mismatched.length===0,
  mismatchCount:mismatched.length,
  mismatchCategories:Object.freeze(mismatched),
  // These fingerprints never certify external Auth, secrets, running APIs,
  // encryption root keys, actual data completeness or customer login.
  platformRecoveryVerified:false,
  requiresIndependentRestore:true
 });
}
export function certifyPlatformCatalog(source,restored){
 const result=comparePlatformCatalog(source,restored);
 if(!result.catalogParity)
  throw Error(PREFIX+'MISMATCH:'+result.mismatchCategories.join(','));
 return result;
}
function readSnapshot(filename){
 const stat=fs.statSync(filename);
 if(!stat.isFile()||stat.size<200||stat.size>8192)
  throw Error(PREFIX+'FILE_INVALID');
 let payload;
 try{payload=JSON.parse(fs.readFileSync(filename,'utf8'));}
 catch{throw Error(PREFIX+'JSON_INVALID');}
 validatePlatformCatalog(payload);
 return payload;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const [sourcePath,restoredPath]=process.argv.slice(2);
  if(!sourcePath||!restoredPath||sourcePath===restoredPath||
   fs.realpathSync(sourcePath)===fs.realpathSync(restoredPath))
   throw Error(PREFIX+'DISTINCT_FILES_REQUIRED');
  const proof=certifyPlatformCatalog(readSnapshot(sourcePath),readSnapshot(restoredPath));
  process.stdout.write('IBERFIT_PLATFORM_CATALOG_PARITY_ONLY:'+String(proof.catalogParity)+
   ':hosted_auth_NOT_certified\n');
 }catch(error){
  // Never print file paths, source catalog values, SQL or private identifiers.
  const code=String(error?.message||'');
  process.stderr.write(code.startsWith(PREFIX)?code:PREFIX+'CHECK_FAILED');
  process.stderr.write('\n');process.exitCode=1;
 }
}
