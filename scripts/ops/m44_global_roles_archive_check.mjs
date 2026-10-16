// M44: Validate the *encrypted-only* PostgreSQL global role export.
// pg_dumpall --roles-only --no-role-passwords is source data for a later
// audited Supabase restore. It MUST NOT be replayed against PROD or be
// treated as hosted Auth recovery. Never print SQL, role names or credentials.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const PREFIX='IBERFIT_M44_GLOBAL_ROLES_';
const CORE=Object.freeze([
 'postgres','anon','authenticated','authenticator','service_role',
 'supabase_admin','supabase_auth_admin','supabase_storage_admin'
]);
const fail=tag=>{throw Error(PREFIX+tag);};
const reEscape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function validateRoleGlobals(sql) {
 if(typeof sql!=='string'||Buffer.byteLength(sql,'utf8')<300||
   Buffer.byteLength(sql,'utf8')>8*1024*1024)fail('EXPORT_SIZE_INVALID');
 if(!/^--\s*PostgreSQL database cluster dump/m.test(sql) &&
    !/^--\s*PostgreSQL database cluster dump/m.test(sql.trimStart()))
   fail('PG_DUMPALL_HEADER_MISSING');
 // Never accept a dump containing role passwords, whether quoted,
 // dollar-quoted or NULL. pg_dumpall --no-role-passwords must omit them.
 const statements=sql.split(/;\s*(?:\r?\n|$)/);
 if(statements.some(line=>/\b(?:CREATE|ALTER)\s+ROLE\b[\s\S]*?\bPASSWORD\s+(?:\S+)/i.test(line)))
   fail('PASSWORD_CLAUSE_FORBIDDEN');
 const created=new Set();
 for(const name of CORE) {
  const expression=new RegExp('\\bCREATE\\s+ROLE\\s+(?:"'+reEscape(name)+'"|'+reEscape(name)+')\\s*;','i');
  if(!expression.test(sql))fail('BUILTIN_ROLE_MISSING');
  created.add(name);
 }
 const createCount=(sql.match(/\bCREATE\s+ROLE\s+/gim)||[]).length;
 if(createCount<CORE.length)fail('INCOMPLETE_ROLE_SET');
 if(!/\bALTER\s+ROLE\s+/i.test(sql))fail('ROLE_OPTIONS_MISSING');
 if(!/\b(?:GRANT|ALTER ROLE)\b/i.test(sql))fail('ROLE_MEMBERSHIP_OR_OPTIONS_MISSING');
 return Object.freeze({
  valid:true,
  coreRoleCount:created.size,
  roleStatementCount:createCount,
  sha256:createHash('sha256').update(sql).digest('hex'),
  // Encrypted preservation and static inspection do not validate
  // passwords, hosted Auth, role application, RLS, GRANT or live logins.
  rolesRestored:false,
  hostedAuthVerified:false
 });
}
export function validateRoleGlobalsFile(file) {
 let stat;
 try{stat=fs.lstatSync(file);}catch{fail('FILE_UNAVAILABLE');}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<300||
    stat.size>8*1024*1024)fail('FILE_INVALID');
 let data;try{data=fs.readFileSync(file,'utf8');}
 catch{fail('FILE_UNREADABLE');}
 return validateRoleGlobals(data);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {
  if(process.argv.length!==3)fail('USAGE');
  const proof=validateRoleGlobalsFile(process.argv[2]);
  process.stdout.write('IBERFIT_GLOBAL_ROLES_ENCRYPTABLE:core='+proof.coreRoleCount+
    ':application_NOT_certified\n');
 } catch(error) {
  const msg=String(error?.message||'');
  process.stderr.write((msg.startsWith(PREFIX)?msg:PREFIX+'UNKNOWN')+'\n');
  process.exitCode=1;
 }
}
