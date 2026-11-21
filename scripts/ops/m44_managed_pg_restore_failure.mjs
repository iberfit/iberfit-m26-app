// M44: classify PostgreSQL restore failures without exposing customer names,
// SQL text, object paths, credentials or raw stderr. This module is pure.
const PREFIX='M44_MANAGED_SQL_';
const STATES=new Map([
 ['42501','PERMISSION_OR_OWNER'],['42P01','MISSING_RELATION'],
 ['42703','COLUMN_SCHEMA_DRIFT'],['42883','FUNCTION_DEPENDENCY'],
 ['42704','MISSING_ROLE_OR_TYPE'],['42P07','OBJECT_ALREADY_EXISTS'],
 ['23503','FOREIGN_KEY_INTEGRITY'],['23505','UNIQUE_CONFLICT'],
 ['23514','CHECK_CONSTRAINT'],['0A000','UNSUPPORTED_FEATURE'],
 ['08006','CONNECTION_LOST'],['57014','QUERY_CANCELLED'],
 ['40P01','LOCK_DEADLOCK'],['XX000','SERVER_INTERNAL']
]);
const RULES=Object.freeze([
 [/permission denied|must be owner|insufficient privilege/iu,'PERMISSION_OR_OWNER'],
 [/already exists|duplicate table|duplicate object/iu,'OBJECT_ALREADY_EXISTS'],
 [/violates foreign key constraint|foreign key constraint/iu,'FOREIGN_KEY_INTEGRITY'],
 [/duplicate key value|violates unique constraint/iu,'UNIQUE_CONFLICT'],
 [/violates check constraint|not-null constraint|null value in column/iu,'CONSTRAINT_DRIFT'],
 [/column .* does not exist|missing data for column|extra data after last expected column|column .* of relation .* does not exist/iu,'COLUMN_SCHEMA_DRIFT'],
 [/function .* does not exist|undefined function/iu,'FUNCTION_DEPENDENCY'],
 [/schema .* does not exist|relation .* does not exist|type .* does not exist/iu,'MISSING_DEPENDENCY'],
 [/role .* does not exist/iu,'MISSING_ROLE_OR_TYPE'],
 [/extension .* is not available|could not open extension control file/iu,'EXTENSION_UNAVAILABLE'],
 [/could not connect|connection refused|connection unexpectedly closed|could not translate host name|timeout expired/iu,'CONNECTION_OR_POOLER'],
 [/pg_restore: error: could not execute query/iu,'POSTGRES_STATEMENT_REJECTED'],
 [/pg_restore: error: COPY failed/iu,'POSTGRES_COPY_FAILED'],
 [/signal:|killed|out of memory/iu,'RESOURCE_EXHAUSTED']
]);
export function classifyM44RestoreFailure(stderr,execution={}){
 const text=typeof stderr==='string'?stderr.slice(-131072):'';
 const state=/\bSQLSTATE(?:=|:|\s+)([A-Z0-9]{5})\b/u.exec(text)?.[1]||null;
 const byState=state?STATES.get(state):null;
 let failureClass=byState||'UNKNOWN';
 if(!byState){
  for(const [pattern,label] of RULES)if(pattern.test(text)){failureClass=label;break;}
 }
 if(execution?.error?.code==='ETIMEDOUT')failureClass='PROCESS_TIMEOUT';
 if(execution?.error?.code==='ENOBUFS')failureClass='PROCESS_OUTPUT_LIMIT';
 const status=Number.isInteger(execution?.status)&&execution.status>=0&&execution.status<=255?execution.status:null;
 return Object.freeze({
  code:PREFIX+failureClass,
  // Never emit unknown SQLSTATE strings, query excerpts or raw stderr.
  sqlstate:byState?state:null,
  exit:status,
  redacted:true,
  prodWritesAuthorized:false,
  managedRestorationCertified:false
 });
}
