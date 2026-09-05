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

const TRUSTED_REMOTE_ORIGINS=new Set(['https://pjhmrhejsoofmouedavw.supabase.co','https://gjztkdwfmunnzhtvxrsu.supabase.co']);
const REMOTE_PAGE_SIZE=200;
const REMOTE_MAX_ROWS=5_000;
function safeRuntime(runtime={}){
  const origin=String(runtime.url||'').replace(/\/$/u,'');
  const key=String(runtime.publishableKey||'');
  if(runtime.enabled!==true||!TRUSTED_REMOTE_ORIGINS.has(origin)||key.length<2||key.length>16_384)throw new Error('M26_EXERCISE_REMOTE_RUNTIME_INVALID');
  return {origin,key};
}
export async function loadRemoteExerciseCatalogRows({runtime,token,fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new Error('M26_EXERCISE_REMOTE_FETCH_UNAVAILABLE');
  const auth=String(token||'');if(auth.length<2||auth.length>16_384)throw new Error('M26_EXERCISE_REMOTE_AUTH_REQUIRED');
  const {origin,key}=safeRuntime(runtime);const rows=[];
  for(let offset=0;offset<REMOTE_MAX_ROWS;offset+=REMOTE_PAGE_SIZE){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.max(1_000,Math.min(Number(runtime.timeoutMs||8_000),15_000)));
    try{
      const response=await fetchImpl(`${origin}/rest/v1/rpc/iberfit_search_exercises_v2`,{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,headers:{apikey:key,authorization:`Bearer ${auth}`,'content-type':'application/json','x-client-info':`iberfit-m26-web/${String(runtime.version||'26.0.0').slice(0,80)}`},body:JSON.stringify({p_query:null,p_pattern:null,p_equipment:null,p_intent:null,p_difficulty:null,p_limit:REMOTE_PAGE_SIZE,p_offset:offset})});
      if(response.status===404)return rows;
      if(!response.ok)throw Object.assign(new Error(`M26_EXERCISE_REMOTE_HTTP_${response.status}`),{status:response.status});
      const page=await response.json();if(!Array.isArray(page)||page.length>REMOTE_PAGE_SIZE)throw new Error('M26_EXERCISE_REMOTE_RESPONSE_INVALID');
      rows.push(...page);
      if(page.length<REMOTE_PAGE_SIZE)break;
      const total=Number(page[0]?.total_count);if(Number.isFinite(total)&&rows.length>=total)break;
    }catch(error){if(error?.name==='AbortError')throw new Error('M26_EXERCISE_REMOTE_TIMEOUT');throw error;}finally{clearTimeout(timer);}
  }
  if(rows.length>REMOTE_MAX_ROWS)throw new Error('M26_EXERCISE_REMOTE_TOO_LARGE');
  return Object.freeze(rows.map((row)=>Object.freeze({...row})));
}
