function normalize(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function searchableParts(item={}){
  const name=normalize(item.name_es||item.name);
  const pattern=normalize(item.pattern);
  const equipment=normalize(item.equipment);
  const tags=normalize((item.tags||[]).join(' '));
  const aliases=normalize((item.aliases||[]).join(' '));
  return {name,pattern,equipment,tags,aliases,text:[name,pattern,equipment,tags,aliases].filter(Boolean).join(' ')};
}
function containsAll(value,tokens){return tokens.every((token)=>value.includes(token));}
function rank(parts,phrase,tokens,index){
  let score=0;
  if(parts.name===phrase)score=1000;
  else if(parts.name.startsWith(phrase))score=850;
  else if(parts.name.includes(phrase))score=760;
  else if(containsAll(parts.name,tokens))score=700;
  else if(parts.pattern===phrase)score=620;
  else if(containsAll(`${parts.pattern} ${parts.equipment}`,tokens))score=540;
  else if(containsAll(parts.aliases,tokens))score=300;
  else if(containsAll(parts.tags,tokens))score=220;
  else if(containsAll(parts.text,tokens))score=100;
  return {score,index};
}
export function createExerciseSearchIndex(records=[]){
  const indexed=(Array.isArray(records)?records:[]).filter(Boolean).map((item,index)=>Object.freeze({item,parts:searchableParts(item),index}));
  function search(query,{limit=120}={}){
    const safeLimit=Math.max(1,Math.min(500,Math.trunc(Number(limit)||120)));
    const phrase=normalize(query);const tokens=phrase.split(' ').filter(Boolean);
    if(!tokens.length)return indexed.slice(0,safeLimit).map((entry)=>entry.item);
    const ranked=indexed.map((entry)=>({...entry,...rank(entry.parts,phrase,tokens,entry.index)})).filter((entry)=>entry.score>0);
    const direct=ranked.filter((entry)=>entry.score>=540);
    const candidates=direct.length?direct:ranked;
    return candidates.sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,safeLimit).map((entry)=>entry.item);
  }
  return Object.freeze({size:indexed.length,search});
}
