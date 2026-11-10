import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/qa-migrations/20261110162000_u92_bootstrap_revision_lookup_index_qa.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/qa-rollbacks/20261110162000_u92_bootstrap_revision_lookup_index_qa.rollback.sql',import.meta.url),'utf8');
const oldSha='dbf8593be06c397e87486f2b54be5071f33cb396282207488852d68e59ac3140';
const newSha='a1b1c07767654a472f5d024bedc0191aa19170d2e6b817682918db5aef7ae990';
const beginning="    v_payload:=jsonb_set(v_payload,'{remoteRevisions}',coalesce((";
const ending="    ),'{}'::jsonb),true);";

function functionDefinition(sql){
  const marker='CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26()';
  const start=sql.indexOf(marker);
  assert.ok(start>=0,'canonical function definition present');
  const stop=sql.indexOf('$function$',sql.indexOf('$function$',start)+10);
  assert.ok(stop>start,'SQL function body terminated');
  return sql.slice(start,stop+10);
}
function splitRevisionBlock(sql){
  const start=sql.indexOf(beginning),end=sql.indexOf(ending,start);
  assert.ok(start>=0&&end>start,'unique revision visibility block');
  assert.equal(sql.indexOf(beginning,start+1)>=0,true,'separate private report filter remains');
  return {prefix:sql.slice(0,start),suffix:sql.slice(end+ending.length)};
}
function keyParts(key){
  const values=key.split(':');
  return [values[0]||'',values[1]||''];
}
const protectedTypes=new Set(['planning','session','report']);
function expectedAllows(key,entities){
  const [type,id]=keyParts(key);
  return !protectedTypes.has(type)||entities.some(e=>e&&typeof e==='object'
    &&e.entityType!==null&&e.entityType!==undefined&&e.entityId!==null&&e.entityId!==undefined
    &&String(e.entityType)===type&&String(e.entityId)===id);
}
function indexedAllows(key,index){
  const [type,id]=keyParts(key);
  return !protectedTypes.has(type)||index.has(type+':'+id);
}
function makeIndex(entities){
  const result=new Set();
  for(const e of entities){
    if(!e||typeof e!=='object'||e.entityType==null||e.entityId==null)continue;
    const type=String(e.entityType),id=String(e.entityId);
    if(type.includes(':')||id.includes(':'))continue;
    result.add(type+':'+id);
  }
  return result;
}

test('U92 is strictly QA-only, exact-version reversible and grants no new privileges',()=>{
  for(const source of [migration,rollback]){
    assert.match(source,/value#>>'{}'='QA'/);
    assert.match(source,/pg_get_userbyid\(p.proowner\)='postgres'/);
    assert.match(source,/p.prosecdef AND p.provolatile='s'/);
    assert.match(source,/has_function_privilege\('authenticated'/);
    assert.match(source,/NOT has_function_privilege\('anon'/);
    assert.match(source,/search_path=""/);
    assert.equal((source.match(/CREATE OR REPLACE FUNCTION public\.iberfit_bootstrap_v26\(\)/g)||[]).length,1);
    const withoutComments=source.replace(/^\s*--[^\n]*/gm,'');
    assert.doesNotMatch(withoutComments,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|GRANT|REVOKE|ALTER)\s+(?:TABLE|FUNCTION|INTO|ON|FROM)\b/iu);
    assert.doesNotMatch(withoutComments,/\bDO\s+\$/iu);
  }
  assert.ok(migration.includes(oldSha)&&migration.includes(newSha));
  assert.ok(rollback.includes(newSha)&&rollback.includes(oldSha));
  assert.match(migration,/63314af30e0e38682a84991847a9d97e/);
  assert.match(migration,/with visible_revision_keys as materialized/);
  assert.match(migration,/cross join visible_revision_keys k/);
  assert.match(migration,/k\.allowed \? \(split_part\(entry\.key,':',1\)/);
  assert.match(migration,/position\(':' in item->>'entityId'\)=0/);
});

test('U92 changes only the first remoteRevisions visibility block, leaving client redaction byte-identical',()=>{
  const oldFn=functionDefinition(rollback),newFn=functionDefinition(migration);
  const old=splitRevisionBlock(oldFn),current=splitRevisionBlock(newFn);
  const note='    -- U92 QA-only: compute visible entity IDs once, then check membership.\n';
  assert.ok(current.prefix.includes(note));
  assert.equal(current.prefix.slice(0,current.prefix.indexOf(note)),old.prefix);
  assert.equal(current.suffix,old.suffix);
  assert.match(current.suffix,/where split_part\(k\.key,':',1\)<>'report'/);
});

test('indexed membership preserves original split-part authorization for valid, malformed and adversarial keys',()=>{
  const cases=[
    {entities:[],keys:['session:a','planning:b','report:c','event:x','session:']},
    {entities:[{entityType:'session',entityId:'a'}],keys:['session:a','session:a:legacy','session:b','report:a','event:b']},
    {entities:[{entityType:'session',entityId:'a:b'},{entityType:'report',entityId:null}],keys:['session:a:b','session:a','report:null']},
    {entities:[null,{},[],{entityType:'session',entityId:''}],keys:['session','session:','session::extra','planning:','event']},
    {entities:[{entityType:'plan:ning',entityId:'x'},{entityType:'planning',entityId:'x:y'}],keys:['planning:x:y','plan:ning:x','planning:x']},
  ];
  let random=2166136261;
  const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random;};
  const types=['session','planning','report','event','checkin','private_note','','session:x'];
  for(let n=0;n<230;n++){
    const entities=Array.from({length:next()%18},()=>({
      entityType:types[next()%types.length],
      entityId:next()%9===0?null:String(next()%40)+(next()%11===0?':extra':''),
    }));
    const keys=Array.from({length:next()%24},()=>{
      const type=types[next()%types.length],id=String(next()%40);
      return type+':'+id+(next()%7===0?':tail':'');
    });
    cases.push({entities,keys});
  }
  for(const {entities,keys} of cases){
    const index=makeIndex(entities);
    for(const key of keys)
      assert.equal(indexedAllows(key,index),expectedAllows(key,entities),JSON.stringify({key,entities}));
  }
});
