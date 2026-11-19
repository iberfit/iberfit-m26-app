// Production owner-attributes rehearsal ONLY inside isolated M44 PG17.
// Source is the authenticated pg_dumpall --roles-only archive. Emit no names,
// role configuration or user data to stdout; all SQL is private and NOLOGIN.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateRoleGlobals} from './m44_global_roles_archive_check.mjs';

const PREFIX='M44_LOCAL_POSTGRES_PARITY_';
const ADMINS=Object.freeze([
 'anon','authenticated','authenticator','pg_create_subscription',
 'pg_monitor','pg_read_all_data','pg_signal_backend','service_role'
]);
const NONADMIN='supabase_privileged_role';
const fail=code=>{throw Error(PREFIX+code);};

export function generateLocalExecutorRoleSql(globals){
 validateRoleGlobals(globals);
 if(/\b(?:DROP\s+(?:TABLE|SCHEMA|DATABASE)|TRUNCATE|COPY\s+|CREATE\s+FUNCTION)\b/iu.test(globals))
  fail('NON_ROLE_SQL_FORBIDDEN');
 const alter=[...globals.matchAll(/^ALTER ROLE "?postgres"? WITH ([^\r\n;]+);/gmu)];
 if(alter.length!==1)fail('OWNER_ROLE_OPTIONS_MISSING');
 const tokens=new Set(alter[0][1].trim().split(/\s+/u));
 const requireFlags=['NOSUPERUSER','INHERIT','CREATEDB','CREATEROLE',
  'LOGIN','REPLICATION','BYPASSRLS'];
 if(requireFlags.some(x=>!tokens.has(x))||tokens.has('SUPERUSER')||
    tokens.has('NOBYPASSRLS')||tokens.has('NOCREATEROLE'))fail('OWNER_ATTRIBUTES_DRIFT');
 const grants=[...globals.matchAll(/^GRANT\s+"?([a-z][a-z0-9_]*)"?\s+TO\s+"?postgres"?([^;\r\n]*);/gmu)];
 const membership=new Map();
 for(const match of grants){
  if(membership.has(match[1]))fail('DUPLICATE_OWNER_MEMBERSHIP');
  membership.set(match[1],/\bWITH ADMIN OPTION\b/u.test(match[2]));
 }
 const all=[...ADMINS,NONADMIN];
 if(membership.size!==all.length||
    ADMINS.some(n=>membership.get(n)!==true)||
    membership.get(NONADMIN)!==false)
  fail('OWNER_MEMBERSHIP_DRIFT');
 // Real cluster has LOGIN; this isolated copy explicitly does not.
 const rows=[
  '-- M44 isolated restore: source-validated role flags without LOGIN.',
  'BEGIN;',
  'ALTER ROLE "postgres" WITH NOSUPERUSER INHERIT CREATEDB CREATEROLE NOLOGIN REPLICATION BYPASSRLS;',
  ...ADMINS.map(n=>'GRANT "'+n+'" TO "postgres" WITH ADMIN OPTION;'),
  'GRANT "'+NONADMIN+'" TO "postgres";',
  'COMMIT;',
  ''
 ];
 return Object.freeze({sql:rows.join('\n'),sourceValidated:true,
  originalRolesApplied:false,privilegedLoginEnabled:false,
  platformRecoveryVerified:false,membershipCount:all.length});
}
export function writePrivateLocalExecutor(sourcePath,outputPath){
 const src=path.resolve(sourcePath),out=path.resolve(outputPath);
 if(path.dirname(path.dirname(out))!==path.dirname(src)||
    path.basename(path.dirname(out))!=='backend-drill-private'||
    path.basename(src)!=='global-roles.sql')fail('PRIVATE_PATH_REQUIRED');
 const st=fs.lstatSync(src);
 if(!st.isFile()||st.isSymbolicLink()||st.size<300||st.size>8*1024*1024)
  fail('SOURCE_INVALID');
 const value=generateLocalExecutorRoleSql(fs.readFileSync(src,'utf8'));
 const flags=fs.constants.O_CREAT|fs.constants.O_WRONLY|fs.constants.O_EXCL|
   (fs.constants.O_NOFOLLOW||0);
 let fd;
 try{
  fd=fs.openSync(out,flags,0o600);
  fs.writeFileSync(fd,value.sql,'utf8');
  fs.fsyncSync(fd);
 }catch{
  if(fd!==undefined)try{fs.unlinkSync(out);}catch{}
  fail('PRIVATE_WRITE_FAILED');
 }finally{if(fd!==undefined)fs.closeSync(fd);}
 return value;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==4)fail('USAGE');
  const result=writePrivateLocalExecutor(process.argv[2],process.argv[3]);
  console.log('M44_ISOLATED_POSTGRES_EXECUTOR_PREPARED:memberships='+result.membershipCount);
 }catch{
  console.error(PREFIX+'REJECTED');
  process.exitCode=1;
 }
}
