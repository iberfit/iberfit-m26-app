function plainObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}

function parseJsonText(value,invalidError){
  const cleaned=String(value).replace(/<think>[\s\S]*?<\/think>/giu,' ').replace(/^```(?:json)?\s*/iu,'').replace(/\s*```$/u,'').trim();
  try{return JSON.parse(cleaned);}catch{}
  const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');
  if(start>=0&&end>start){try{return JSON.parse(cleaned.slice(start,end+1));}catch{}}
  throw new Error(invalidError);
}

function parseTextParts(value,invalidError){
  if(!Array.isArray(value))return null;
  for(const part of value){
    if(!plainObject(part))continue;
    const type=String(part.type||'');
    const text=typeof part.text==='string'?part.text:(typeof part.content==='string'?part.content:'');
    if(!text.trim())continue;
    if(type&& !['text','output_text'].includes(type))continue;
    return parseJsonText(text,invalidError);
  }
  return null;
}

function parseCandidate(value,invalidError){
  if(plainObject(value))return value;
  if(typeof value==='string'&&value.trim())return parseJsonText(value,invalidError);
  return parseTextParts(value,invalidError);
}

export function extractStructuredResponse(payload,{missingError='AI_RESPONSE_MISSING',invalidError='AI_JSON_INVALID'}={}){
  const root=payload?.result??payload;
  const candidates=[root?.response,root?.answer,root?.content,root?.result?.response,root?.result?.answer,root?.result?.content];
  for(const value of candidates){const parsed=parseCandidate(value,invalidError);if(parsed)return parsed;}
  if(Array.isArray(root?.choices)){
    for(const choice of root.choices){
      const parsed=plainObject(choice?.message?.parsed)?choice.message.parsed:parseCandidate(choice?.message?.content??choice?.text,invalidError);
      if(parsed)return parsed;
    }
  }
  if(Array.isArray(root?.output)){
    for(const item of root.output){
      const parsed=parseTextParts(item?.content,invalidError)??parseCandidate(item?.text,invalidError);
      if(parsed)return parsed;
    }
  }
  throw new Error(missingError);
}
