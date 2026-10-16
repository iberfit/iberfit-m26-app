// IBERFIT M44 platform catalog parity check (read-only comparison).
// Inputs must originate from separately attested source and isolated restore.
// Equal hashes DO NOT prove source identity, actual isolation, plaintext
// recoverability, restored user records or hosted Supabase Auth configuration.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export const SCHEMA='iberfit.m44.platform.catalog.v1';
export const ACCESS_SCHEMA='iberfit.m44.access-acl-supplement.v1';
export const ACCESS_CATEGORIES=Object.freeze(['schema_acl','column_acl','database_acl']);
export const CATEGORIES=Object.freeze([
 'roles','role_memberships','relation_security','default_privileges',
 'function_security','policies','triggers','constraints','indexes','extensions',
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
  // Legacy v1 digests do not include pg_namespace.nspacl or
  // per-column pg_attribute.attacl. These are explicit coverage gaps.
  schemaAclVerified:false,
  columnAclVerified:false,
  effectivePrivilegesVerified:false,
  platformRecoveryVerified:false,
  requiresIndependentRestore:true
 });
}
// Supplemental v1 is intentionally independent of historical M44 backup
// manifests, and cannot upgrade their proven scope or provenance retroactively.
export function validateAccessCatalog(data){
 if(!data||typeof data!=='object'||Array.isArray(data))
  throw Error(PREFIX+'ACCESS_INVALID');
 if(data.schema!==ACCESS_SCHEMA||
  Object.keys(data).length!==ACCESS_CATEGORIES.length+1||
  Object.keys(data).some(x=>x!=='schema'&&!ACCESS_CATEGORIES.includes(x)))
  throw Error(PREFIX+'ACCESS_SCHEMA_INVALID');
 if(ACCESS_CATEGORIES.some(k=>!HEX64.test(data[k]||'')))
  throw Error(PREFIX+'ACCESS_HASH_INVALID');
 return true;
}
export function compareAccessCatalog(source,restored){
 validateAccessCatalog(source);validateAccessCatalog(restored);
 const mismatches=ACCESS_CATEGORIES.filter(k=>source[k]!==restored[k]);
 return Object.freeze({
  aclSupplementParity:mismatches.length===0,
  mismatchCategories:Object.freeze(mismatches),
  // Comparing metadata hashes never proves effective grants, live login,
  // snapshot provenance, a full Supabase platform or operational RTO/RPO.
  effectivePrivilegesVerified:false,
  platformRecoveryVerified:false
 });
}
export function certifyPlatformCatalog(source,restored){
 const result=comparePlatformCatalog(source,restored);
 if(!result.catalogParity)
  throw Error(PREFIX+'MISMATCH:'+result.mismatchCategories.join(','));
 return result;
}
function readSnapshot(filename,validate=validatePlatformCatalog){
 // The proof files are deliberately local and private; never follow a link
 // to a different file after the metadata check. Open one descriptor and
 // compare metadata before/after reading to reject obvious concurrent edits.
 let fd;
 try{
  const link=fs.lstatSync(filename);
  if(!link.isFile()||link.isSymbolicLink())throw Error(PREFIX+'FILE_INVALID');
  fd=fs.openSync(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  const before=fs.fstatSync(fd);
  if(!before.isFile()||before.nlink!==1||before.size<200||before.size>8192)
   throw Error(PREFIX+'FILE_INVALID');
  if(process.platform!=='win32'&&(before.mode&0o077)!==0)
   throw Error(PREFIX+'PRIVATE_MODE_REQUIRED');
  const content=fs.readFileSync(fd,'utf8');
  const after=fs.fstatSync(fd);
  if(before.dev!==after.dev||before.ino!==after.ino||
     before.size!==after.size||before.mtimeMs!==after.mtimeMs||
     before.ctimeMs!==after.ctimeMs)
   throw Error(PREFIX+'FILE_CHANGED_DURING_READ');
  let payload;
  try{payload=JSON.parse(content);}catch{throw Error(PREFIX+'JSON_INVALID');}
  validate(payload);
  return payload;
 }catch(error){
  const code=String(error?.message||'');
  if(code.startsWith(PREFIX))throw error;
  throw Error(PREFIX+'FILE_INVALID');
 }finally{
  if(fd!==undefined)fs.closeSync(fd);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const paths=process.argv.slice(2);
  if(![2,4].includes(paths.length)||paths.some(x=>!x))
   throw Error(PREFIX+'INPUT_COUNT_INVALID');
  // All inputs must be distinct physical files; not merely different paths.
  const realPaths=paths.map(x=>fs.realpathSync(x));
  if(new Set(realPaths).size!==realPaths.length)
   throw Error(PREFIX+'DISTINCT_FILES_REQUIRED');
  const proof=certifyPlatformCatalog(readSnapshot(paths[0]),readSnapshot(paths[1]));
  if(paths.length===4){
   const acl=compareAccessCatalog(
    readSnapshot(paths[2],validateAccessCatalog),
    readSnapshot(paths[3],validateAccessCatalog));
   if(!acl.aclSupplementParity)
    throw Error(PREFIX+'ACCESS_MISMATCH:'+acl.mismatchCategories.join(','));
   process.stdout.write('IBERFIT_PLATFORM_CATALOG_PARITY_ONLY:true:aclSupplementParity:true:hosted_auth_NOT_certified\n');
  }else{
   process.stdout.write('IBERFIT_PLATFORM_CATALOG_PARITY_ONLY:'+String(proof.catalogParity)+
    ':hosted_auth_NOT_certified\n');
  }
 }catch(error){
  // Never print file paths, source catalog values, SQL or private identifiers.
  const code=String(error?.message||'');
  process.stderr.write(code.startsWith(PREFIX)?code:PREFIX+'CHECK_FAILED');
  process.stderr.write('\n');process.exitCode=1;
 }
}
