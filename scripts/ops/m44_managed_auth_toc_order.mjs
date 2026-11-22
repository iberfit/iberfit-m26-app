// M44: In managed Supabase the already-present auth.identities and
// auth.mfa_factors tables enforce immediate non-deferrable FKs to auth.users.
// The source pg_dump TOC may enumerate alphabetically (identities before users).
// Reorder only these three TABLE DATA items before the FIRST app TABLE DATA.
// Preserve ALL other TOC entries, phase ordering and single-transaction restore.
const entry=/^[0-9]+;\s+[0-9]+\s+[0-9]+\s+TABLE DATA\s+(auth|public|private)\s+(\S+)\s+/;
const ranks=new Map([['users',0],['identities',1],['mfa_factors',2]]);
export function orderM44ManagedDataRestore(lines){
 if(!Array.isArray(lines)||lines.length<40)throw Error('M44_TOC_INVALID');
 const authData=[];const other=[];
 for(const line of lines){
  if(typeof line!=='string')throw Error('M44_TOC_INVALID');
  const m=entry.exec(line);
  if(m&&m[1]==='auth'&&ranks.has(m[2]))authData.push({line,kind:m[2]});
  else other.push(line);
 }
 if(authData.filter(x=>x.kind==='users').length!==1||
    authData.length>3||
    new Set(authData.map(x=>x.kind)).size!==authData.length)
   throw Error('M44_AUTH_TOC_DEPENDENCY_INVALID');
 const firstApp=other.findIndex(line=>{
  const m=entry.exec(line);
  return !!m&&(m[1]==='public'||m[1]==='private');
 });
 if(firstApp<0)throw Error('M44_APP_TOC_DATA_MISSING');
 const safeAuth=authData.sort((a,b)=>ranks.get(a.kind)-ranks.get(b.kind)).map(x=>x.line);
 const reordered=[...other.slice(0,firstApp),...safeAuth,...other.slice(firstApp)];
 if(reordered.length!==lines.length||
    reordered.filter(x=>entry.test(x)&&/\sTABLE DATA auth users\s/.test(x)).length!==1)
   throw Error('M44_TOC_REORDER_INTEGRITY_INVALID');
 return Object.freeze({
  lines:reordered,
  authTableCount:safeAuth.length,
  authUsersBeforeDependencies:true,
  appFirstDataIndex:firstApp+safeAuth.length
 });
}
