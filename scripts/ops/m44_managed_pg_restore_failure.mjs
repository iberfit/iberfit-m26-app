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
 [/operator class .* does not exist|operator family .* does not exist|access method .* does not exist/iu,'INDEX_OPERATOR_DEPENDENCY'],
 [/could not create unique index/iu,'INDEX_UNIQUE_DATA_CONFLICT'],
 [/could not connect|connection refused|server closed the connection|connection unexpectedly closed|could not translate host name|timeout expired/iu,'CONNECTION_OR_POOLER'],
 [/pg_restore: error: could not execute query/iu,'POSTGRES_STATEMENT_REJECTED'],
 [/pg_restore: error: COPY failed/iu,'POSTGRES_COPY_FAILED'],
 [/signal:|killed|out of memory/iu,'RESOURCE_EXHAUSTED']
]);

// Isolate ONLY the SQL verb / known object kind following the pg_restore error.
// SQL text, table names, client identifiers and values NEVER leave the runner.
function sanitizedRestoreStatementKind(stderr){
 const raw=typeof stderr==='string'?stderr.slice(-131072):'';
 const marker=raw.indexOf('Command was:');
 if(marker<0)return 'UNAVAILABLE';
 const query=raw.slice(marker+'Command was:'.length,marker+'Command was:'.length+4096)
  .replace(/^(?:\s*--[^\r\n]*(?:\r?\n|$)){0,4}/u,'').trimStart();
 if(/^COPY\s/iu.test(query))return 'COPY_DATA';
 if(/^INSERT\s/iu.test(query))return 'INSERT_DATA';
 if(/^SELECT\s+pg_catalog\.setval\s*\(/iu.test(query))return 'SEQUENCE_DATA';
 if(/^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s/iu.test(query))return 'DDL_FUNCTION';
 if(/^CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s/iu.test(query))return 'DDL_TRIGGER';
 if(/^CREATE\s+POLICY\s/iu.test(query))return 'DDL_POLICY';
 if(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s/iu.test(query))return 'DDL_INDEX';
 if(/^CREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE\s/iu.test(query))return 'DDL_TABLE';
 if(/^CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s/iu.test(query))return 'DDL_VIEW';
 if(/^CREATE\s+TYPE\s/iu.test(query))return 'DDL_TYPE';
 if(/^CREATE\s+EXTENSION\s/iu.test(query))return 'DDL_EXTENSION';
 if(/^CREATE\s+SCHEMA\s/iu.test(query))return 'DDL_SCHEMA';
 if(/^ALTER\s+TABLE\s/iu.test(query))return 'ALTER_TABLE';
 if(/^ALTER\s+(?:FUNCTION|PROCEDURE)\s/iu.test(query))return 'ALTER_FUNCTION';
 if(/^ALTER\s+TYPE\s/iu.test(query))return 'ALTER_TYPE';
 if(/^COMMENT\s+ON\s/iu.test(query))return 'COMMENT';
 if(/^GRANT\s/iu.test(query))return 'GRANT';
 if(/^REVOKE\s/iu.test(query))return 'REVOKE';
 if(/^SET\s/iu.test(query))return 'SET_CONFIG';
 if(/^DO\s+\$/iu.test(query))return 'DO_BLOCK';
 return 'OTHER_SQL_VERB';
}

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
  statementKind:sanitizedRestoreStatementKind(text),
  // Never emit unknown SQLSTATE strings, query excerpts or raw stderr.
  sqlstate:byState?state:null,
  exit:status,
  redacted:true,
  prodWritesAuthorized:false,
  managedRestorationCertified:false
 });
}
