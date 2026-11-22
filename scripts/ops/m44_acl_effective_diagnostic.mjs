// Privacy-preserving classification of an isolated M44 ACL restore mismatch.
// Raw relation names and grants stay in the private runner. Only numeric counts
// may be emitted to CI logs. This never changes a database.
const PREFIX='M44_ACL_DIAGNOSTIC_';
const fail=(s)=>{throw Error(PREFIX+s);};
const keys=['schema_name','relation_name','kind','owner_name','effective_privileges'];
function indexRows(rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>500)fail('ROWSET_INVALID');
 const indexed=new Map();
 for(const item of rows){
  if(!item||typeof item!=='object'||Array.isArray(item)||
   keys.some(k=>!(k in item))||
   ['schema_name','relation_name','kind','owner_name'].some(k=>
     typeof item[k]!=='string'||!item[k]||item[k].length>256)||
   !['public','private'].includes(item.schema_name)||
   !['r','p','v','m','S','f'].includes(item.kind)||
   !Array.isArray(item.effective_privileges)||item.effective_privileges.length>200)
   fail('ROW_INVALID');
  const key=JSON.stringify([item.schema_name,item.relation_name,item.kind]);
  if(indexed.has(key))fail('DUPLICATE_RELATION');
  const grants=new Set();
  for(const grant of item.effective_privileges){
   if(!Array.isArray(grant)||grant.length!==4||
    grant.slice(0,3).some(v=>typeof v!=='string'||!v||v.length>128)||
    typeof grant[3]!=='boolean')fail('GRANT_INVALID');
   const token=JSON.stringify(grant);
   if(grants.has(token))fail('DUPLICATE_GRANT');
   grants.add(token);
  }
  indexed.set(key,{owner:item.owner_name,grants});
 }
 return indexed;
}
export function summarizeM44EffectiveAclDifferences(sourceRows,cloneRows){
 const source=indexRows(sourceRows),clone=indexRows(cloneRows);
 const result={sourceRelations:source.size,cloneRelations:clone.size,
  missingRelations:0,extraRelations:0,ownerMismatches:0,
  relationsWithGrantDrift:0,missingGrants:0,extraGrants:0,
  invalidGrantors:0,unrecognizedGrantees:0};
 const actors=new Set(['PUBLIC','postgres','anon','authenticated','service_role']);
 for(const entry of [...source.values(),...clone.values()]){
  for(const token of entry.grants){
   const g=JSON.parse(token);
   if(g[0]!=='postgres')result.invalidGrantors++;
   if(!actors.has(g[1]))result.unrecognizedGrantees++;
  }
 }
 for(const [key,s] of source){
  const t=clone.get(key);
  if(!t){result.missingRelations++;continue;}
  if(s.owner!==t.owner)result.ownerMismatches++;
  let different=false;
  for(const g of s.grants)if(!t.grants.has(g)){result.missingGrants++;different=true;}
  for(const g of t.grants)if(!s.grants.has(g)){result.extraGrants++;different=true;}
  if(different)result.relationsWithGrantDrift++;
 }
 for(const key of clone.keys())if(!source.has(key))result.extraRelations++;
 return Object.freeze(result);
}
