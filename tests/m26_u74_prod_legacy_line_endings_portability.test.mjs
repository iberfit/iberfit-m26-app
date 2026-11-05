import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261104150000_u60_closed_private_read_legacy_writer_fences.sql',import.meta.url),'utf8');
const audit=readFileSync(new URL('../scripts/release/u74_prod_legacy_line_endings_readonly.sql',import.meta.url),'utf8');
const pin='d436dd82a48644ce8701aa797b1323ebafe9b2b1dbde36872cd83c170374a9e9';
const sha=value=>createHash('sha256').update(value,'utf8').digest('hex');
const canonical=value=>value.replace(/\r\n/g,'\n');
test('U74: CRLF-only adaptation cannot mask semantic changes or stray CR',()=>{
 const source="declare\n begin\n  return 'check';\n end";
 const windows=source.replace(/\n/g,'\r\n');
 assert.equal(sha(source),sha(canonical(windows)));
 assert.notEqual(sha(source),sha(windows));
 assert.notEqual(sha(source),sha(canonical(windows.replace('check','changed'))));
 assert.notEqual(sha(source),sha(canonical(source.replace('begin','beg\rin'))));
});
test('U74: original U60 migration still pins all four legacy writers and exact ACL',()=>{
 for(const item of [
 '8a4800de487ef9f0babc51662e152fa0318cd56dd341e5b376fccda99ab5bea7',
 '5a157b889f720157223b625c7bb1314278ce506fff7cb4d06d29e88db17f1bd8',
 '78bf27593b1e6f4277c73bacf04329eb21a0354f40557249d630df6a3da8bd9e9',
 pin
 ])assert.ok(sql.includes(item));
 assert.ok(sql.includes(String.raw`WHERE encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')`));
 assert.ok(sql.includes(String.raw`position(E'\r' IN replace(p.prosrc,E'\r\n',''))=0`));
 assert.match(sql,/has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)=req\.auth_exec/);
 assert.match(sql,/NOT has_function_privilege\('anon',p\.oid,'EXECUTE'\)/);
 assert.match(sql,/pg_get_userbyid\(p\.proowner\)='postgres'/);
 assert.match(sql,/ledger_rows=7 AND verified_functions=8 AND drifted_functions=0/);
 assert.equal((sql.match(/WHERE encode\(sha256\(convert_to\(replace\(p\.prosrc/g)||[]).length,1);
});
test('U74 read-only diagnostic cannot mutate, disclose IDs or relax grants',()=>{
 const stripped=audit.replace(/^--.*$/gm,'');
 assert.doesNotMatch(stripped,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|DO|COPY)\b/i);
 assert.match(audit,/safeForFutureMigrationPreflight/);
 assert.match(audit,/lineEndingOnly/);
 assert.match(audit,/NOT has_function_privilege\('anon'/);
 assert.ok(audit.includes(String.raw`position(E'\r' IN replace(p.prosrc,E'\r\n',''))=0`));
 assert.ok(audit.includes(pin));
});
