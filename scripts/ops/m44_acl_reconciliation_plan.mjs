// M44: fail-closed, offline construction of a MINIMAL app ACL reconciliation.
// Pure function: no network, SQL execution, secrets or database writes.
// The caller must validate project identity, seal, source/target fingerprints,
// transaction and post-repair readbacks before executing any returned SQL.
const PREFIX='M44_ACL_PLAN_';
const fail=x=>{throw Error(PREFIX+x);};
const ROLES=new Set(['postgres','anon','authenticated','service_role']);
const SCHEMAS=new Set(['public','private']);
const MAX={relations:500,functions:1000,schemas:2,defaults:20,columns:10000};
const q=s=>'"'+s.replaceAll('"','""')+'"';
const identifier=s=>typeof s==='string'&&s.length>0&&s.length<=128&&!/[\x00-\x1f]/.test(s);
const functionName=s=>typeof s==='string'&&s.length>5&&s.length<=512&&
 /^[A-Za-z0-9_."(), \[\]]+$/u.test(s)&&!s.includes('--')&&!s.includes('/*');
function index(category,rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>MAX[category])fail('ROWS_'+category.toUpperCase());
 const m=new Map();
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||
    !identifier(row.name)||!Array.isArray(row.privileges)||row.privileges.length>300||
    typeof row.owner_name!=='string'||!row.owner_name)fail('ROW_FORMAT');
  if(m.has(row.name))fail('DUPLICATE_OBJECT');
  if(category==='relations'&&(!SCHEMAS.has(row.schema_name)||
    !identifier(row.object_name)||!['r','p','v','m','S','f'].includes(row.object_type)))fail('RELATION_FORMAT');
  if(category==='functions'&&!functionName(row.name))fail('FUNCTION_FORMAT');
  if(category==='schemas'&&!SCHEMAS.has(row.name))fail('SCHEMA_FORMAT');
  if(category==='defaults'&&(!SCHEMAS.has(row.schema_name)||
    !['r','S','f','T','n'].includes(row.object_type)))fail('DEFAULT_FORMAT');
  if(category==='columns'&&(!SCHEMAS.has(row.schema_name)||
    !identifier(row.relation_name)||!identifier(row.column_name)))fail('COLUMN_FORMAT');
  const grants=new Set();
  for(const g of row.privileges){
   if(!Array.isArray(g)||g.length!==4||typeof g[0]!=='string'||
     typeof g[1]!=='string'||typeof g[2]!=='string'||typeof g[3]!=='boolean')fail('GRANT_FORMAT');
   const token=JSON.stringify(g);
   if(grants.has(token))fail('DUPLICATE_GRANT');
   grants.add(token);
  }
  m.set(row.name,{row,grants});
 }
 return m;
}
export function planM44AclReconciliation(source,restored){
 if(!source||!restored||typeof source!=='object'||typeof restored!=='object')fail('INPUT_INVALID');
 const categories=['defaults','functions','relations','columns','schemas'];
 const steps=[],counts={};
 for(const category of categories){
  const a=index(category,source[category]),b=index(category,restored[category]);
  if(a.size!==b.size)fail('OBJECT_COUNT_'+category.toUpperCase());
  const grouped=new Map();let add=0,remove=0;
  const accumulate=(row,actor,privilege,type)=>{
   const key=JSON.stringify([row.name,actor,type]);
   if(!grouped.has(key))grouped.set(key,{row,actor,type,privileges:new Set()});
   grouped.get(key).privileges.add(privilege);
  };
  for(const [name,item] of a){
   const target=b.get(name);if(!target)fail('OBJECT_ABSENT_'+category.toUpperCase());
   if(item.row.owner_name!==target.row.owner_name)fail('OWNER_DRIFT');
   for(const key of target.grants)if(!item.grants.has(key)){
    const [grantor,actor,priv,option]=JSON.parse(key);
    if(grantor!=='postgres'||!ROLES.has(actor)||option!==false||
      ['schemas','columns'].includes(category))fail('UNEXPECTED_EXCESS_PRIVILEGE');
    remove++;accumulate(item.row,actor,priv,'revoke');
   }
   for(const key of item.grants)if(!target.grants.has(key)){
    const [grantor,actor,priv,option]=JSON.parse(key);
    if(grantor!=='postgres'||!ROLES.has(actor)||option!==false||
      (category!=='schemas'&&category!=='columns')||
      (category==='schemas'&&priv!=='USAGE')||
      (category==='columns'&&!['SELECT','INSERT','UPDATE','REFERENCES'].includes(priv)))
      fail('MISSING_PRIVILEGE_OUTSIDE_SCOPE');
    add++;accumulate(item.row,actor,priv,'grant');
   }
   // A table-level REVOKE can cascade to column ACL grants. Replay the source
   // column-specific grants in the SAME transaction, even if initially equal.
   if(category==='columns'&&source.relations&&restored.relations){
    for(const key of item.grants){
     const [grantor,actor,priv,option]=JSON.parse(key);
     if(grantor==='postgres'&&ROLES.has(actor)&&option===false)
      accumulate(item.row,actor,priv,'grant');
     else fail('COLUMN_GRANT_UNSUPPORTED');
    }
   }
  }
  const kind={r:'TABLES',S:'SEQUENCES',f:'FUNCTIONS',T:'TYPES',n:'SCHEMAS'};
  for(const {row,actor,type,privileges} of grouped.values()){
   const ps=[...privileges].sort().join(', ');let statement;
   if(category==='relations'){
    const sequence=row.object_type==='S',allow=new Set(sequence?['USAGE','SELECT','UPDATE']:
      ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']);
    if([...privileges].some(p=>!allow.has(p)))fail('RELATION_PRIVILEGE_INVALID');
    statement=`REVOKE ${ps} ON ${sequence?'SEQUENCE':'TABLE'} ${q(row.schema_name)}.${q(row.object_name)} FROM ${q(actor)};`;
   }else if(category==='functions'){
    if(ps!=='EXECUTE')fail('FUNCTION_PRIVILEGE_INVALID');
    statement=`REVOKE EXECUTE ON FUNCTION ${row.name} FROM ${q(actor)};`;
   }else if(category==='defaults'){
    if(row.owner_name!=='postgres')fail('MANAGED_DEFAULT_PROTECTED');
    statement=`ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA ${q(row.schema_name)} REVOKE ${ps} ON ${kind[row.object_type]} FROM ${q(actor)};`;
   }else if(category==='schemas'){
    if(ps!=='USAGE')fail('SCHEMA_PRIVILEGE_INVALID');
    statement=`GRANT USAGE ON SCHEMA ${q(row.name)} TO ${q(actor)};`;
   }else if(category==='columns'){
    if(type!=='grant')fail('COLUMN_REVOKE_DENIED');
    for(const priv of privileges)if(!['SELECT','INSERT','UPDATE','REFERENCES'].includes(priv))fail('COLUMN_PRIVILEGE_INVALID');
    statement=`GRANT ${ps} (${q(row.column_name)}) ON TABLE ${q(row.schema_name)}.${q(row.relation_name)} TO ${q(actor)};`;
   }
   if(!statement||/[\x00-\x1f]/u.test(statement))fail('UNSAFE_SQL');
   steps.push(statement);
  }
  counts[category]=Object.freeze({source:a.size,restored:b.size,missing:add,extra:remove,
   commands:grouped.size});
 }
 return Object.freeze({commands:Object.freeze(steps),summary:Object.freeze(counts),
  permittedTarget:'sealed-M44-sandbox-only',executesSql:false,prodWrites:0,
  requiresAtomicGuardAndPostcheck:true});
}
