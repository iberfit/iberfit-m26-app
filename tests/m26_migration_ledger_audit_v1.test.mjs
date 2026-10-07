import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  LEDGER_REPORT_SCHEMA,
  parseRepositoryFiles,
  auditMigrationLedger,
} from '../scripts/data-safety/audit_migration_ledger.mjs';

const row=(version,name)=>({version,name});

test('#764 exact semantic names and timestamps report no drift',()=>{
  const input={
    repositoryFiles:['20261001000000_alpha.sql','20261002000000_beta.sql','README.md'],
    qaHistory:[row('20261001000000','alpha'),row('20261002000000','beta')],
    prodHistory:[row('20261001000000','alpha'),row('20261002000000','beta')],
  };
  const report=auditMigrationLedger(input);
  assert.equal(report.schema,LEDGER_REPORT_SCHEMA);
  assert.equal(report.mode,'READ_ONLY_REPORT');
  assert.equal(report.changesApplied,false);
  assert.equal(report.canAutoRepair,false);
  assert.equal(report.attentionRequired,false);
  assert.equal(report.issueCount,0);
  assert.deepEqual(report.totals,{repository:2,qa:2,prod:2});
});

test('#764 mismatched version is not treated as unapplied SQL',()=>{
  const report=auditMigrationLedger({
    repositoryFiles:['20261001000000_alpha.sql','20261002000000_beta_qa.sql'],
    qaHistory:[row('20261001000000','alpha'),row('20261002001000','beta_qa')],
    prodHistory:[row('20261001010000','alpha'),row('20261003000000','historical')],
  });
  assert.deepEqual(report.missingByName.prod,['beta_qa']);
  assert.deepEqual(report.historyNotInRepository.prod,['historical']);
  assert.deepEqual(report.versionDrift.map(v=>v.name),['alpha','beta_qa']);
  const missingInProd=report.versionDrift.find(v=>v.name==='beta_qa');
  assert.equal(missingInProd.qaAligned,false);
  assert.equal(missingInProd.prodAligned,null);
  assert.deepEqual(missingInProd.prodVersions,[]);
  assert.equal(report.versionDrift[0].qaAligned,true);
  assert.equal(report.versionDrift[0].prodAligned,false);
  assert.equal(report.attentionRequired,true);
  assert.equal(report.canAutoRepair,false);
  assert.match(report.warning,/Never db push, migration repair, or apply missing names automatically/u);
});

test('#764 duplicates are reported by semantic name separately from timestamp drift',()=>{
  const report=auditMigrationLedger({
    repositoryFiles:['20261001000000_alpha.sql','20261002000000_alpha.sql'],
    qaHistory:[row('20261001000000','alpha'),row('20261002100000','alpha')],
    prodHistory:[row('20261001000000','alpha')],
  });
  assert.deepEqual(report.duplicatedNames.repository,[{name:'alpha',versions:['20261001000000','20261002000000']}]);
  assert.deepEqual(report.duplicatedNames.qa,[{name:'alpha',versions:['20261001000000','20261002100000']}]);
  assert.deepEqual(report.duplicatedNames.prod,[]);
  assert.deepEqual(report.versionDrift,[]);
  assert.equal(report.attentionRequired,true);
});

test('#764 rejects malformed and path-like input without guessing history',()=>{
  assert.throws(()=>parseRepositoryFiles(['foo.sql']),/INVALID_FILENAME/u);
  assert.throws(()=>parseRepositoryFiles([{name:'20261001000000_alpha.sql'}]),/REPOSITORY_FILENAMES_REQUIRED/u);
  assert.throws(()=>parseRepositoryFiles(['../20261001000000_alpha.sql']),/INVALID_FILE/u);
  assert.throws(()=>auditMigrationLedger({
    repositoryFiles:[],
    qaHistory:[row('not_a_timestamp','alpha')],
    prodHistory:[],
  }),/INVALID_HISTORY_ENTRY/u);
  assert.throws(()=>auditMigrationLedger({
    repositoryFiles:[],
    qaHistory:{rows:'not-an-array'},
    prodHistory:[],
  }),/INVALID_ARRAY/u);
  assert.throws(()=>auditMigrationLedger({
    repositoryFiles:[],
    qaHistory:[row('20261001000000','alpha; drop table clients;')],
    prodHistory:[],
  }),/INVALID_HISTORY_ENTRY/u);
});

test('#764 stays read-only and produces a data-minimized report',()=>{
  const source=readFileSync('scripts/data-safety/audit_migration_ledger.mjs','utf8');
  assert.doesNotMatch(source,/\b(?:writeFileSync|execFileSync|spawn|fetch\s*\(|createClient\s*\(|apply_migration|execute_sql)\b/u);
  assert.doesNotMatch(source,/\b(?:INSERT\s+INTO|UPDATE\s+supabase_migrations|DELETE\s+FROM\s+supabase_migrations)\b/iu);
  const report=auditMigrationLedger({repositoryFiles:[],qaHistory:[],prodHistory:[]});
  assert.equal(Object.hasOwn(report,'credentials'),false);
  assert.equal(Object.hasOwn(report,'connectionString'),false);
});
