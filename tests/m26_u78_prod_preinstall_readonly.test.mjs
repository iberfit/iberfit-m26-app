import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../scripts/release/u78_prod_preinstall_readonly.sql',import.meta.url),'utf8');
test('U78 is a source readiness read-only gate, not a backup or promotion approval',()=>{
 const clean=sql.replace(/^--[^\n]*$/gm,'');
 assert.doesNotMatch(clean,/\b(?:INSERT INTO|UPDATE public|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE|GRANT EXECUTE|REVOKE EXECUTE|TRUNCATE)\b/i);
 assert.ok(clean.trim().startsWith('WITH pin('));
 assert.ok(clean.trim().endsWith('FROM checks;'));
 assert.ok(sql.includes("'deploymentApproved',false"));
 assert.ok(sql.includes("'backupCertifiedByThisQuery',false"));
});
test('U78 has exactly 21 source invariants, eight migration history versions',()=>{
 assert.equal((sql.match(/\n UNION ALL\n/g)||[]).length,20);
 for(const s of ['20261025182000','20261025194000','20261025203500','20261025210500',
 '20261025223000','20261025231500','20261025235500','20261104150000'])
  assert.ok(sql.includes(s));
 for(const s of ['same_client_fk','session_key','u30_occurrences_absent',
 'u60_gateway_absent','legacy_writers_identical','appointments_rls','sessions_rls'])
  assert.ok(sql.includes(s));
});
test('U78 pins four legacy definitions and allows CRLF only without relaxing ACL',()=>{
 for(const s of ['8a4800de487ef9f0babc51662e152fa0318cd56dd341e5b376fccda99ab5bea7',
 '5a157b889f720157223b625c7bb1314278ce506fff7cb4d06d29e88db17f1bd8',
 '78bf27593b1e6f4277c73bacf04329eb21a0354f40557249d630df6a3da8bd9e',
 'd436dd82a48644ce8701aa797b1323ebafe9b2b1dbde36872cd83c170374a9e9'])
  assert.ok(sql.includes(s));
 assert.ok(sql.includes("position(E'\\r' IN replace(p.prosrc,E'\\r\\n',''))=0"));
 assert.match(sql,/NOT has_function_privilege\('anon',p\.oid,'EXECUTE'\)/);
});
