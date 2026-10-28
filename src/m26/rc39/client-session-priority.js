
/** Stable, non-mutating user-first ordering, driven by caller-verified permissions. */
export function prioritizeClientSessionItems(items=[],actionable=()=>false){
 const records=(Array.isArray(items)?items:[]).map((item,index)=>{
   const active=Boolean(actionable(item));
   const body=item?.session?.body&&typeof item.session.body==='object'?item.session.body:item?.session||{};
   const raw=body.publishedAt||body.published_at||item?.session?.publishedAt||item?.publishedAt;
   const time=typeof raw==='string'?Date.parse(raw):NaN;
   return {item,index,active,time:Number.isFinite(time)?time:null};
 });
 records.sort((a,b)=>Number(b.active)-Number(a.active)||
   (a.active&&b.active&&a.time!==null&&b.time!==null?b.time-a.time:0)||
   (a.active&&b.active&&a.time!==null?-1:a.active&&b.active&&b.time!==null?1:0)||
   a.index-b.index);
 return records.map(x=>x.item);
}
