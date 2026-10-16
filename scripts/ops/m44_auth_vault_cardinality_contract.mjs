// M44: compare only record counts from a separately captured PostgreSQL
// source census and isolated restored DB. Never handle credentials or rows.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const P='IBERFIT_M44_AUTH_VAULT_';
export const SCHEMA='iberfit.m44.auth-vault-cardinality.v1';
export const KEYS=Object.freeze([
 'auth_users','auth_identities','auth_sessions','auth_refresh_tokens',
 'auth_mfa_factors','auth_webauthn_credentials','auth_oauth_clients',
 'auth_sso_providers','auth_saml_providers','auth_custom_oauth_providers',
 'vault_secrets','storage_buckets','storage_objects'
]);
const DATE_RE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const reject=code=>{throw Error(P+code);};

function exactKeys(object,keys){
 return object && typeof object==='object' && !Array.isArray(object) &&
   Object.keys(object).length===keys.length &&
   Object.keys(object).every(key=>keys.includes(key));
}
export function validateAuthVaultCensus(census){
 if(!exactKeys(census,['schema','captured_at','counts'])||
    census.schema!==SCHEMA||typeof census.captured_at!=='string'||
    !DATE_RE.test(census.captured_at)||
    !Number.isFinite(Date.parse(census.captured_at))||
    !exactKeys(census.counts,KEYS))reject('CENSUS_INVALID');
 for(const key of KEYS){
  const value=census.counts[key];
  if(!Number.isSafeInteger(value)||value<0)reject('INVALID_COUNT');
 }
 return Object.freeze({valid:true,tableCount:KEYS.length,hostedAuthVerified:false,
   vaultKeyRecoveryVerified:false,platformRecoveryVerified:false});
}
export function compareAuthVaultCensus(source,restored){
 validateAuthVaultCensus(source);validateAuthVaultCensus(restored);
 const mismatches=KEYS.filter(key=>source.counts[key]!==restored.counts[key]);
 return Object.freeze({cardinalityParity:mismatches.length===0,
  mismatchCount:mismatches.length,
  mismatchCategories:Object.freeze(mismatches),
  recordIdentityVerified:false,sourceBackupSnapshotProvenanceVerified:false,
  hostedAuthVerified:false,vaultKeyRecoveryVerified:false,
  rolePrivilegesVerified:false,platformRecoveryVerified:false});
}
export function certifyAuthVaultCensus(source,restored){
 const result=compareAuthVaultCensus(source,restored);
 if(!result.cardinalityParity)reject('CARDINALITY_MISMATCH');
 return result;
}
function readSnapshot(file){
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<150||stat.size>8192)
  reject('FILE_INVALID');
 let snapshot;
 try{snapshot=JSON.parse(fs.readFileSync(file,'utf8'));}
 catch{reject('JSON_INVALID');}
 validateAuthVaultCensus(snapshot);
 return snapshot;
}
export function compareCensusFiles(sourceFile,restoredFile){
 if(typeof sourceFile!=='string'||typeof restoredFile!=='string'||
    path.resolve(sourceFile)===path.resolve(restoredFile)||
    fs.realpathSync(sourceFile)===fs.realpathSync(restoredFile))
  reject('INDEPENDENT_FILES_REQUIRED');
 return certifyAuthVaultCensus(readSnapshot(sourceFile),readSnapshot(restoredFile));
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{
  if(process.argv.length!==4)reject('USAGE_INVALID');
  compareCensusFiles(process.argv[2],process.argv[3]);
  process.stdout.write('IBERFIT_M44_AUTH_VAULT_CARDINALITY_ONLY:tables='+
   KEYS.length+':hosted_auth_NOT_verified:vault_keys_NOT_verified\n');
 }catch(error){
  const msg=String(error?.message||'');
  process.stderr.write((msg.startsWith(P)?msg:P+'VALIDATION_FAILED')+'\n');
  process.exitCode=1;
 }
}
