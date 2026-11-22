// Restore compatibility: source PROD extensions audited for the encrypted M44 snapshot.
// Explicitly allow only the missing, standard PostgreSQL extensions on the SEALED clone.
// Never accept SQL, schema identifiers or extension names from the backup or HTTP response.
export const M44_SOURCE_EXTENSIONS=Object.freeze([
 Object.freeze({name:'plpgsql',schema:'pg_catalog',install:null}),
 Object.freeze({name:'pg_stat_statements',schema:'extensions',install:null}),
 Object.freeze({name:'uuid-ossp',schema:'extensions',install:'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions'}),
 Object.freeze({name:'pgcrypto',schema:'extensions',install:'CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions'}),
 Object.freeze({name:'supabase_vault',schema:'vault',install:null}),
 Object.freeze({name:'pg_trgm',schema:'extensions',install:'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions'})
]);
export function planM44ManagedExtensionParity(rows){
 if(!Array.isArray(rows))throw Error('M44_EXTENSION_INVENTORY_INVALID');
 const observed=new Map();
 const names=new Set(M44_SOURCE_EXTENSIONS.map(e=>e.name));
 for(const row of rows){
  if(!row||typeof row.name!=='string'||typeof row.schema_name!=='string'||!names.has(row.name)||observed.has(row.name))
   throw Error('M44_EXTENSION_INVENTORY_INVALID');
  observed.set(row.name,row.schema_name);
 }
 const missing=[];const installSql=[];
 for(const expected of M44_SOURCE_EXTENSIONS){
  const actual=observed.get(expected.name);
  if(actual&&actual!==expected.schema)throw Error('M44_EXTENSION_SCHEMA_DRIFT');
  if(actual)continue;
  if(!expected.install)throw Error('M44_MANAGED_CORE_EXTENSION_MISSING');
  missing.push(expected.name);
  installSql.push(expected.install);
 }
 return Object.freeze({missing:Object.freeze(missing),installSql:Object.freeze(installSql),ready:missing.length===0});
}
export function certifyM44ManagedExtensionParity(rows){
 const plan=planM44ManagedExtensionParity(rows);
 if(!plan.ready||rows.length!==M44_SOURCE_EXTENSIONS.length||
    rows.some(row=>row.gin_trgm_ready!==true))throw Error('M44_MANAGED_EXTENSION_PARITY_NOT_VERIFIED');
 return Object.freeze({ready:true,sourceRequired:M44_SOURCE_EXTENSIONS.length,ginTrgmReady:true});
}
