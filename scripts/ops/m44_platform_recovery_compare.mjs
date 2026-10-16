// IBERFIT M44 platform catalog parity check (read-only comparison).
// Inputs must originate from separately attested source and isolated restore.
// Equal hashes DO NOT prove source identity, actual isolation, plaintext
// recoverability, restored user records or hosted Supabase Auth configuration.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export const SCHEMA='iberfit.m44.platform.catalog.v1';
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
  validatePlatformCatalog(payload);
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
