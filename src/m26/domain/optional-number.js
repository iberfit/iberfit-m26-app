export function finiteOptionalNumber(value){
  if(value===null||value===undefined)return null;
  if(typeof value==='number'){
    return Number.isFinite(value)?value:null;
  }
  if(typeof value!=='string')return null;
  const normalized=value.trim();
  if(!normalized)return null;
  const number=Number(normalized);
  return Number.isFinite(number)?number:null;
}

export function hasFiniteOptionalNumber(value){
  return finiteOptionalNumber(value)!==null;
}
