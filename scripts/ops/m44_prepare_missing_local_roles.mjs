// Only prepare inert role-name prerequisites for an isolated owner+ACL restore.
// The genuine pg_dumpall source is validated but NEVER replayed or logged.
// NOLOGIN placeholders do not certify memberships, role options or Hosted Auth.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateRoleGlobals} from './m44_global_roles_archive_check.mjs';

const PREFIX='M44_LOCAL_ROLE_PREREQ_';
const CORE=Object.freeze(['postgres','anon','authenticated','authenticator',
 'service_role','supabase_admin','supabase_auth_admin','supabase_storage_admin']);
const NAME=/^[a-z][a-z0-9_]{0,62}$/u;
const fail=code=>{throw Error(PREFIX+code);};

export function prepareMissingLocalRoles(source,existingNames){
 validateRoleGlobals(source);
 if(typeof existingNames!=='string'||existingNames.length>20_000||
    existingNames.includes('\0'))fail('EXISTING_NAMES_INVALID');
 const lines=existingNames.trim().split(/\r?\n/u).filter(Boolean);
 if(!lines.length||lines.length>120||lines.some(n=>!NAME.test(n))||
   new Set(lines).size!==lines.length)fail('EXISTING_NAMES_INVALID');
 if(!lines.includes('supabase_admin'))fail('RESTORE_SUPERUSER_MISSING');
 const declared=[...source.matchAll(/^CREATE ROLE (?:"([a-z][a-z0-9_]{0,62})"|([a-z][a-z0-9_]{0,62}));\s*$/gmu)]
   .map(m=>m[1]||m[2]);
 const count=(source.match(/^CREATE ROLE /gmu)||[]).length;
 if(count!==declared.length||declared.length<CORE.length||declared.length>60||
    new Set(declared).size!==declared.length||CORE.some(n=>!declared.includes(n)))
  fail('SOURCE_NAMES_INVALID');
 const found=new Set(lines);
 const missing=declared.filter(n=>!found.has(n)).sort();
 // The initial role inventory and the actual local PostgreSQL catalog may
 // differ if the managed image initializes additional roles. Check each role
 // again atomically *inside* the local server before CREATE ROLE. Never
 // overwrite or modify a pre-existing role or replay cloud role privileges.
 const sql=['-- Isolated PG17 restore prerequisites only. NOLOGIN placeholders.',
  'BEGIN;',...missing.map(n=>
   `DO $m44_local_role$ BEGIN IF NOT EXISTS (`+
   `SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='${n}') THEN `+
   `EXECUTE 'CREATE ROLE "${n}" NOLOGIN'; END IF; END $m44_local_role$;`
  ),'COMMIT;',''].join('\n');
 return Object.freeze({sql,expected:declared.length,missing:missing.length,
  placeholderRolesOnly:true,roleAttributesRestored:false,roleMembershipsRestored:false,
  platformRecoveryVerified:false});
}
function read(pathname,max){
 const st=fs.lstatSync(pathname);
 if(!st.isFile()||st.isSymbolicLink()||st.size>max||st.size<0)fail('FILE_UNSAFE');
 return fs.readFileSync(pathname,'utf8');
}
export function prepareFile(source,existing,output){
 const root=path.dirname(path.resolve(source)),out=path.dirname(path.resolve(output));
 if(path.dirname(path.resolve(existing))!==out||path.dirname(out)!==root||
    !path.basename(out).startsWith('backend-drill-private'))fail('PRIVATE_WORKSPACE_REQUIRED');
 const data=prepareMissingLocalRoles(read(source,8*1024*1024),read(existing,20_000));
 const flag=fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_CREAT|
    (fs.constants.O_NOFOLLOW||0);
 let fd;
 try{fd=fs.openSync(output,flag,0o600);fs.writeFileSync(fd,data.sql,'utf8');fs.fsyncSync(fd);}
 catch{if(fd!==undefined)try{fs.unlinkSync(output);}catch{};fail('OUTPUT_WRITE_FAILED');}
 finally{if(fd!==undefined)fs.closeSync(fd);}
 return Object.freeze({expected:data.expected,missing:data.missing});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==5)fail('USAGE');
  const x=prepareFile(...process.argv.slice(2));
  console.log('M44_LOCAL_ROLE_PREREQUISITES_NOLOGIN_ONLY:expected='+x.expected+':missing='+x.missing);
 }catch(error){const msg=String(error?.message||'');console.error(msg.startsWith(PREFIX)?msg:PREFIX+'FAILED');process.exitCode=1;}
}
