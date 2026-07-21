function normalize(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function searchableText(item){return normalize([item?.name_es,item?.name,item?.pattern,item?.equipment,...(item?.tags||[]),...(item?.aliases||[])].filter(Boolean).join(' '));}
export function createExerciseSearchIndex(records=[]){
  const indexed=(Array.isArray(records)?records:[]).filter(Boolean).map((item)=>Object.freeze({item,text:searchableText(item)}));
  function search(query,{limit=120}={}){
    const safeLimit=Math.max(1,Math.min(500,Math.trunc(Number(limit)||120)));
    const tokens=normalize(query).split(' ').filter(Boolean);
    if(!tokens.length)return indexed.slice(0,safeLimit).map((entry)=>entry.item);
    return indexed.filter((entry)=>tokens.every((token)=>entry.text.includes(token))).slice(0,safeLimit).map((entry)=>entry.item);
  }
  return Object.freeze({size:indexed.length,search});
}
