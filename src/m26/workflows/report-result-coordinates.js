import {stableEvidenceJson,observedSet} from '../domain/evidence-signal.js';

const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const present=v=>v!==undefined&&v!==null&&v!=='';
const values=(row,keys)=>keys.map(k=>row?.[k]).filter(present);
const exact=vs=>vs.length&&vs.every(v=>v===vs[0])?vs[0]:null;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(v);
const number=v=>Number.isSafeInteger(v)&&v>0;
const key=(blockIndex,exerciseId,setNumber)=>JSON.stringify([blockIndex,exerciseId,setNumber]);

// Preserve original storage keys; wrapper/body aliases must attest the same collection.
export function reportResultCollection(record,keys=['results','setResults','set_results']){
  const aliases=[record,record?.body].filter(object).flatMap(r=>values(r,keys));
  if(!aliases.length)return {raw:[],conflict:false};
  const raw=aliases[0];
  if(aliases.some(v=>!object(v)&&!Array.isArray(v)))return {raw:[],conflict:true};
  const signature=stableEvidenceJson(raw);
  return aliases.every(v=>stableEvidenceJson(v)===signature)?{raw,conflict:false}:{raw:[],conflict:true};
}
const entries=raw=>Array.isArray(raw)?raw.map(row=>[null,row]):Object.entries(raw);

// Reports describe observed work, including explicitly identified extra series.
// They must never attribute a row to a different block or count one coordinate twice.
export function verifiedSportCoordinates(record,snapshot){
  const results=reportResultCollection(record),skips=reportResultCollection(record,['skippedSets','skipped_sets']);
  if(results.conflict||skips.conflict||!Array.isArray(snapshot?.blocks))return [];
  const byExercise=new Map(),blockIds=new Set(),points=[];
  for(const [blockIndex,block] of snapshot.blocks.entries()){
    if(!object(block))return [];
    const ids=values(block,['id','blockId','block_id']),blockId=exact(ids);
    if(ids.length&&(!id(blockId)||blockIds.has(blockId)))return [];
    if(blockId)blockIds.add(blockId);
    const exercises=block.type==='exercise'?[exact(values(block,['exerciseId','exercise_id']))]:block.exerciseIds;
    if(!Array.isArray(exercises)||exercises.some(x=>!id(x))||new Set(exercises).size!==exercises.length)continue;
    const planned=Number(block.type==='exercise'?block.sets:block.rounds);
    for(const exerciseId of exercises){
      const point={block,blockId,blockIndex,exerciseId,planned:Number.isSafeInteger(planned)&&planned>0?planned:null};
      points.push(point);
      if(!byExercise.has(exerciseId))byExercise.set(exerciseId,[]);
      byExercise.get(exerciseId).push(point);
    }
  }
  const claims=new Map();
  const claim=(point,n,entry)=>{const k=key(point.blockIndex,point.exerciseId,n);const list=claims.get(k)||[];list.push(entry);claims.set(k,list);};
  function collect(storage,row,skip){
    if(!object(row))return;
    const exercises=values(row,['exerciseId','exercise_id']),numbers=values(row,['setNumber','set_number']),blocks=values(row,['blockId','block_id']);
    const exerciseId=exact(exercises),setNumber=exact(numbers),blockId=exact(blocks);
    const candidates=new Map();
    const add=(p,n)=>candidates.set(key(p.blockIndex,p.exerciseId,n),{p,n});
    for(const x of exercises.filter(id))for(const n of numbers.filter(number))for(const p of byExercise.get(x)||[])if(!blocks.length||blocks.includes(p.blockId))add(p,n);
    // Recognized scoped keys can corroborate a missing blockId, not contradict it.
    const suffix=typeof storage==='string'?storage.match(/:([1-9]\d*)$/u):null;
    const storageNumber=suffix?Number(suffix[1]):null;
    const scoped=number(storageNumber)?points.filter(p=>p.blockId&&storage===`${p.blockId}:${p.exerciseId}:${storageNumber}`):[];
    const legacy=number(storageNumber)?points.filter(p=>storage===`${p.exerciseId}:${storageNumber}`):[];
    for(const p of scoped)add(p,storageNumber);
    if(!scoped.length)for(const p of legacy)if(!blocks.length||p.blockId===blockId||p.exerciseId!==exerciseId||storageNumber!==setNumber)add(p,storageNumber);
    let matching=(byExercise.get(exerciseId)||[]).filter(p=>!blocks.length||p.blockId===blockId);
    if(scoped.length)matching=matching.filter(p=>scoped.includes(p));
    if(matching.length>1&&!blocks.length&&!scoped.length&&matching.every(p=>p.planned!==null)){
      const planned=matching.filter(p=>setNumber<=p.planned);
      if(planned.length===1)matching=planned;
    }
    const valid=id(exerciseId)&&number(setNumber)&&(!blocks.length||id(blockId))&&(!scoped.length||scoped.length===1&&storageNumber===setNumber&&scoped[0].exerciseId===exerciseId)&&(!legacy.length||legacy.every(p=>p.exerciseId===exerciseId)&&storageNumber===setNumber);
    if(!valid||matching.length!==1){for(const {p,n} of candidates.values())claim(p,n,null);return;}
    const p=matching[0];
    claim(p,setNumber,skip||!observedSet(row)?null:{row,...p,setNumber,repeated:(byExercise.get(exerciseId)||[]).length>1});
  }
  for(const [storage,row] of entries(results.raw))collect(storage,row,false);
  for(const [storage,row] of entries(skips.raw))collect(storage,row,true);
  return [...claims.values()].filter(list=>list.length===1&&list[0]).map(list=>list[0]);
}
