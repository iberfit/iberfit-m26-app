#!/usr/bin/env node
// IBERFIT #764 — read-only migration-ledger parity. Never runs SQL or repairs history.
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const LEDGER_REPORT_SCHEMA='iberfit.migration-ledger-audit.v1';
const MAX_ENTRIES=100_000;
const VERSION=/^\d{14}$/u;
const NAME=/^[A-Za-z0-9_]+$/u;
const FILE=/^(\d{14})_([A-Za-z0-9_]+)\.sql$/u;

function sorted(values){return [...values].sort((a,b)=>a.localeCompare(b,'en'));}

function requireList(value,label){
  const rows=Array.isArray(value)?value:(Array.isArray(value?.rows)?value.rows:value?.result);
  if(!Array.isArray(rows)||rows.length>MAX_ENTRIES)throw Error(`MIGRATION_LEDGER_INVALID_ARRAY:${label}`);
  return rows;
}

function normalizeHistory(input,label){
  const rows=requireList(input,label);
  return rows.map((row,i)=>{
    const version=String(row?.version??'');
    const name=String(row?.name??'');
    if(!VERSION.test(version)||!NAME.test(name)){
      throw Error(`MIGRATION_LEDGER_INVALID_HISTORY_ENTRY:${label}:${i}`);
    }
    return {version,name};
  });
}

export function parseRepositoryFiles(input){
  const files=requireList(input,'repositoryFiles');
  return files.filter(file=>String(file).endsWith('.sql')).map((name,i)=>{
    if(typeof name!=='string'||name!==path.basename(name)){
      throw Error(`MIGRATION_LEDGER_INVALID_FILE:${i}`);
    }
    const match=name.match(FILE);
    if(!match)throw Error(`MIGRATION_LEDGER_INVALID_FILENAME:${i}`);
    return {version:match[1],name:match[2]};
  });
}

function byName(rows){
  const map=new Map();
  for(const row of rows){
    const list=map.get(row.name)||[];
    list.push(row.version);
    map.set(row.name,list);
  }
  for(const [name,versions] of map)map.set(name,sorted(versions));
  return map;
}

function entriesWithDupes(map){
  return sorted([...map.keys()])
    .filter(name=>map.get(name).length>1)
    .map(name=>({name,versions:map.get(name)}));
}

function absent(from,to){
  return sorted([...from.keys()].filter(name=>!to.has(name)));
}

export function auditMigrationLedger({repositoryFiles,qaHistory,prodHistory}){
  const repo=parseRepositoryFiles(repositoryFiles);
  const qa=normalizeHistory(qaHistory,'qa');
  const prod=normalizeHistory(prodHistory,'prod');
  const maps={repo:byName(repo),qa:byName(qa),prod:byName(prod)};
  const duplicatedNames={
    repository:entriesWithDupes(maps.repo),
    qa:entriesWithDupes(maps.qa),
    prod:entriesWithDupes(maps.prod),
  };
  const missingByName={
    qa:absent(maps.repo,maps.qa),
    prod:absent(maps.repo,maps.prod),
  };
  const historyNotInRepository={
    qa:absent(maps.qa,maps.repo),
    prod:absent(maps.prod,maps.repo),
  };
  const versionDrift=sorted([...maps.repo.keys()]).flatMap(name=>{
    const repoVersions=maps.repo.get(name);
    const qaVersions=maps.qa.get(name);
    const prodVersions=maps.prod.get(name);
    if(!qaVersions||!prodVersions)return [];
    const qaAligned=repoVersions.some(v=>qaVersions.includes(v));
    const prodAligned=repoVersions.some(v=>prodVersions.includes(v));
    return qaAligned&&prodAligned?[]:[{
      name,
      repositoryVersions:repoVersions,
      qaVersions,
      prodVersions,
      qaAligned,
      prodAligned,
    }];
  });
  const issueCount=Object.values(duplicatedNames).reduce((n,rows)=>n+rows.length,0)
    +Object.values(missingByName).reduce((n,rows)=>n+rows.length,0)
    +Object.values(historyNotInRepository).reduce((n,rows)=>n+rows.length,0)
    +versionDrift.length;
  return {
    schema:LEDGER_REPORT_SCHEMA,
    mode:'READ_ONLY_REPORT',
    changesApplied:false,
    canAutoRepair:false,
    attentionRequired:issueCount>0,
    totals:{repository:repo.length,qa:qa.length,prod:prod.length},
    duplicatedNames,
    missingByName,
    historyNotInRepository,
    versionDrift,
    issueCount,
    warning:'Names/timestamps do not prove schema equivalence or environment eligibility. Never db push, migration repair, or apply missing names automatically.',
  };
}

const invokedDirectly=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(invokedDirectly){
  const [qaPath,prodPath,repositoryDir='supabase/migrations',extra]=process.argv.slice(2);
  if(!qaPath||!prodPath||extra){
    throw Error('USAGE: node scripts/data-safety/audit_migration_ledger.mjs <qa-history.json> <prod-history.json> [migrations-dir]');
  }
  const qaHistory=JSON.parse(readFileSync(qaPath,'utf8'));
  const prodHistory=JSON.parse(readFileSync(prodPath,'utf8'));
  const repositoryFiles=readdirSync(repositoryDir);
  const result=auditMigrationLedger({repositoryFiles,qaHistory,prodHistory});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
