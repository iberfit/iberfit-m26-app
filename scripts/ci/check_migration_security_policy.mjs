#!/usr/bin/env node
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const PUBLIC_TABLE_POLICY_CUTOFF='20260924000000';

function normalizeIdentifier(value){
  return String(value||'').trim().replace(/^"|"$/g,'').toLowerCase();
}

function escapeRegExp(value){
  return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

/**
 * Mask SQL comments and string/dollar-quoted bodies while preserving offsets.
 * This keeps DDL detection from being fooled by examples, function bodies,
 * literals or commented-out statements.
 */
export function maskNonCode(sql){
  const source=String(sql||'');
  let out='';
  let i=0;
  let state='code';
  let dollarTag='';
  while(i<source.length){
    const ch=source[i];
    const next=source[i+1];
    if(state==='code'){
      if(ch==='-'&&next==='-'){out+='  ';i+=2;state='line-comment';continue;}
      if(ch==='/'&&next==='*'){out+='  ';i+=2;state='block-comment';continue;}
      if(ch==="'"){out+=' ';i+=1;state='single';continue;}
      if(ch==='$'){
        const match=source.slice(i).match(/^\$[A-Za-z_0-9]*\$/u);
        if(match){dollarTag=match[0];out+=' '.repeat(dollarTag.length);i+=dollarTag.length;state='dollar';continue;}
      }
      out+=ch;i+=1;continue;
    }
    if(state==='line-comment'){
      if(ch==='\n'){out+='\n';i+=1;state='code';}else{out+=' ';i+=1;}
      continue;
    }
    if(state==='block-comment'){
      if(ch==='*'&&next==='/'){out+='  ';i+=2;state='code';}
      else{out+=ch==='\n'?'\n':' ';i+=1;}
      continue;
    }
    if(state==='single'){
      if(ch==="'"&&next==="'"){out+='  ';i+=2;continue;}
      if(ch==="'"){out+=' ';i+=1;state='code';}
      else{out+=ch==='\n'?'\n':' ';i+=1;}
      continue;
    }
    if(state==='dollar'){
      if(source.startsWith(dollarTag,i)){out+=' '.repeat(dollarTag.length);i+=dollarTag.length;state='code';}
      else{out+=ch==='\n'?'\n':' ';i+=1;}
    }
  }
  return out;
}

function canonicalCode(sql){
  return maskNonCode(sql).toLowerCase().replaceAll('"','').replace(/\s+/gu,' ').trim();
}

function objectRefParts(raw){
  return String(raw||'').split('.').map(normalizeIdentifier).filter(Boolean);
}

export function findCreatedTables(sql){
  const code=maskNonCode(sql);
  const create=/\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*))?)/giu;
  const tables=[];
  for(const match of code.matchAll(create)){
    const parts=objectRefParts(match[1].replace(/\s+/gu,''));
    if(parts.length===1){tables.push({schema:null,table:parts[0],raw:match[1],index:match.index});continue;}
    if(parts.length===2){tables.push({schema:parts[0],table:parts[1],raw:match[1],index:match.index});}
  }
  return tables;
}

export function findCreatedSequences(sql){
  const code=maskNonCode(sql);
  const create=/\bcreate\s+sequence\s+(?:if\s+not\s+exists\s+)?((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*))?)/giu;
  const sequences=[];
  for(const match of code.matchAll(create)){
    const parts=objectRefParts(match[1].replace(/\s+/gu,''));
    if(parts.length===1){sequences.push({schema:null,sequence:parts[0],raw:match[1],index:match.index});continue;}
    if(parts.length===2){sequences.push({schema:parts[0],sequence:parts[1],raw:match[1],index:match.index});}
  }
  return sequences;
}

function commentValue(sql,label,objectName){
  const target=escapeRegExp(`public.${objectName}`);
  const re=new RegExp(`^\\s*--\\s*${escapeRegExp(label)}\\s*:\\s*${target}\\s*(?:::|=)\\s*(.+?)\\s*$`,'imu');
  return sql.match(re)?.[1]?.trim()||null;
}

function aclStatements(canonical,objectType,objectName){
  const target=escapeRegExp(`public.${objectName}`);
  const type=objectType==='sequence'?'sequence':'table';
  const re=new RegExp(`\\b(grant|revoke)\\s+([^;]+?)\\s+on\\s+(?:${type}\\s+)?${target}\\s+(to|from)\\s+([^;]+);`,'giu');
  return [...canonical.matchAll(re)].map((match)=>({
    kind:match[1].toLowerCase(),
    privileges:match[2].trim(),
    direction:match[3].toLowerCase(),
    roles:match[4].split(',').map((role)=>role.trim().replaceAll('"','')).filter(Boolean),
  }));
}

function hasRoleDeclaration(statements,role){
  return statements.some((statement)=>statement.roles.includes(role));
}

function hasGrantToRole(statements,role){
  return statements.some((statement)=>statement.kind==='grant'&&statement.direction==='to'&&statement.roles.includes(role));
}

function hasPolicy(canonical,table){
  const target=escapeRegExp(`public.${table}`);
  return new RegExp(`\\bcreate\\s+policy\\s+(?:[^;]+?)\\s+on\\s+${target}\\b`,'iu').test(canonical);
}

function hasRls(canonical,table,mode){
  const target=escapeRegExp(`public.${table}`);
  return new RegExp(`\\balter\\s+table\\s+(?:only\\s+)?${target}\\s+${mode}\\s+row\\s+level\\s+security\\b`,'iu').test(canonical);
}

function finding(file,object,code,message){
  return {type:'migration-public-object-security',path:file,object,code,message};
}

export function analyzeMigration(sql,{file='migration.sql'}={}){
  const canonical=canonicalCode(sql);
  const created=findCreatedTables(sql);
  const sequences=findCreatedSequences(sql);
  const findings=[];
  for(const createdTable of created){
    if(createdTable.schema===null){
      findings.push(finding(file,createdTable.table,'UNQUALIFIED_CREATE_TABLE','New tables must use an explicit schema; public tables must be written as public.<table>.'));
      continue;
    }
    if(createdTable.schema!=='public')continue;

    const table=createdTable.table;
    const tableRef=`public.${table}`;
    const accessIntent=commentValue(sql,'IBERFIT-TABLE-ACCESS',table);
    const policyIntent=commentValue(sql,'IBERFIT-POLICY',table);
    const rlsException=commentValue(sql,'IBERFIT-RLS-EXCEPTION',table);
    const rlsEnabled=hasRls(canonical,table,'enable');
    const rlsDisabled=hasRls(canonical,table,'disable');
    const statements=aclStatements(canonical,'table',table);
    const anonDeclared=hasRoleDeclaration(statements,'anon');
    const authenticatedDeclared=hasRoleDeclaration(statements,'authenticated');
    const serviceGranted=hasGrantToRole(statements,'service_role');
    const anonGranted=hasGrantToRole(statements,'anon');
    const authenticatedGranted=hasGrantToRole(statements,'authenticated');
    const clientGranted=anonGranted||authenticatedGranted;
    const policyCreated=hasPolicy(canonical,table);

    if(!accessIntent||accessIntent.length<12){
      findings.push(finding(file,tableRef,'ACCESS_INTENT_REQUIRED',`Add "-- IBERFIT-TABLE-ACCESS: ${tableRef} :: <security/access intent>" with a meaningful rationale.`));
    }

    if(!rlsEnabled){
      const validException=rlsDisabled&&rlsException&&rlsException.length>=12;
      if(!validException){
        findings.push(finding(file,tableRef,'RLS_DECLARATION_REQUIRED',`Enable RLS for ${tableRef}, or explicitly DISABLE it with "-- IBERFIT-RLS-EXCEPTION: ${tableRef} :: <reason>".`));
      }
    }

    if(!anonDeclared){
      findings.push(finding(file,tableRef,'ANON_ACCESS_UNDECLARED',`Declare anon access explicitly for ${tableRef} with GRANT or REVOKE.`));
    }
    if(!authenticatedDeclared){
      findings.push(finding(file,tableRef,'AUTHENTICATED_ACCESS_UNDECLARED',`Declare authenticated access explicitly for ${tableRef} with GRANT or REVOKE.`));
    }
    if(!serviceGranted){
      findings.push(finding(file,tableRef,'SERVICE_ROLE_ACCESS_UNDECLARED',`Grant the required privileges on ${tableRef} explicitly to service_role.`));
    }

    if(policyIntent==='service-role-only'){
      if(clientGranted){
        findings.push(finding(file,tableRef,'SERVICE_ROLE_ONLY_CLIENT_GRANT',`${tableRef} is marked service-role-only but grants direct access to anon/authenticated.`));
      }
      if(policyCreated){
        findings.push(finding(file,tableRef,'SERVICE_ROLE_ONLY_POLICY_DRIFT',`${tableRef} is marked service-role-only but also creates a client RLS policy; declare rls-client if direct client access is intended.`));
      }
    }else if(policyIntent==='rls-client'){
      if(!rlsEnabled){
        findings.push(finding(file,tableRef,'RLS_CLIENT_WITHOUT_RLS',`${tableRef} declares rls-client but RLS is not enabled.`));
      }
      if(!clientGranted){
        findings.push(finding(file,tableRef,'RLS_CLIENT_WITHOUT_CLIENT_GRANT',`${tableRef} declares rls-client but grants no direct anon/authenticated table privilege.`));
      }
      if(!policyCreated){
        findings.push(finding(file,tableRef,'RLS_CLIENT_POLICY_REQUIRED',`${tableRef} grants direct client access but creates no RLS policy in the same migration.`));
      }
    }else{
      findings.push(finding(file,tableRef,'POLICY_INTENT_REQUIRED',`Add "-- IBERFIT-POLICY: ${tableRef} = service-role-only" or "= rls-client".`));
      if(clientGranted&&!policyCreated){
        findings.push(finding(file,tableRef,'CLIENT_GRANT_WITHOUT_POLICY',`${tableRef} grants anon/authenticated access without an RLS policy.`));
      }
    }
  }

  for(const createdSequence of sequences){
    if(createdSequence.schema===null){
      findings.push(finding(file,createdSequence.sequence,'UNQUALIFIED_CREATE_SEQUENCE','New sequences must use an explicit schema; public sequences must be written as public.<sequence>.'));
      continue;
    }
    if(createdSequence.schema!=='public')continue;

    const sequence=createdSequence.sequence;
    const sequenceRef=`public.${sequence}`;
    const accessIntent=commentValue(sql,'IBERFIT-SEQUENCE-ACCESS',sequence);
    const statements=aclStatements(canonical,'sequence',sequence);

    if(!accessIntent||accessIntent.length<12){
      findings.push(finding(file,sequenceRef,'SEQUENCE_ACCESS_INTENT_REQUIRED',`Add "-- IBERFIT-SEQUENCE-ACCESS: ${sequenceRef} :: <security/access intent>" with a meaningful rationale.`));
    }
    if(!hasRoleDeclaration(statements,'anon')){
      findings.push(finding(file,sequenceRef,'SEQUENCE_ANON_ACCESS_UNDECLARED',`Declare anon access explicitly for ${sequenceRef} with GRANT or REVOKE.`));
    }
    if(!hasRoleDeclaration(statements,'authenticated')){
      findings.push(finding(file,sequenceRef,'SEQUENCE_AUTHENTICATED_ACCESS_UNDECLARED',`Declare authenticated access explicitly for ${sequenceRef} with GRANT or REVOKE.`));
    }
    if(!hasGrantToRole(statements,'service_role')){
      findings.push(finding(file,sequenceRef,'SEQUENCE_SERVICE_ROLE_ACCESS_UNDECLARED',`Grant the required privileges on ${sequenceRef} explicitly to service_role.`));
    }
  }

  return findings;
}

export function isPolicyMigrationFile(name){
  const match=String(name||'').match(/^(\d{14})_.+\.sql$/u);
  return Boolean(match&&match[1]>=PUBLIC_TABLE_POLICY_CUTOFF);
}

export async function scanMigrationSecurityPolicy(root=process.cwd()){
  const migrationDir=path.join(root,'supabase','migrations');
  const names=(await readdir(migrationDir)).filter(isPolicyMigrationFile).sort();
  const findings=[];
  for(const name of names){
    const relative=path.posix.join('supabase','migrations',name);
    const sql=await readFile(path.join(migrationDir,name),'utf8');
    findings.push(...analyzeMigration(sql,{file:relative}));
  }
  return findings;
}

async function main(){
  const findings=await scanMigrationSecurityPolicy(process.cwd());
  if(findings.length){
    console.error(JSON.stringify({ok:false,policyCutoff:PUBLIC_TABLE_POLICY_CUTOFF,findings},null,2));
    process.exitCode=1;
    return;
  }
  console.log(JSON.stringify({ok:true,policyCutoff:PUBLIC_TABLE_POLICY_CUTOFF,findings:[]},null,2));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch((error)=>{console.error(error?.stack||error);process.exitCode=1;});
}
