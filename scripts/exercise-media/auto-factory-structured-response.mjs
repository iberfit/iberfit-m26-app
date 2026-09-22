function plainObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}

function parseJsonText(value,invalidError){
  const cleaned=String(value).replace(/<think>[\s\S]*?<\/think>/giu,' ').replace(/^```(?:json)?\s*/iu,'').replace(/\s*```$/u,'').trim();
  try{return JSON.parse(cleaned);}catch{}
  const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');
  if(start>=0&&end>start){try{return JSON.parse(cleaned.slice(start,end+1));}catch{}}
  throw new Error(invalidError);
}

export function extractStructuredResponse(payload,{missingError='AI_RESPONSE_MISSING',invalidError='AI_JSON_INVALID'}={}){
  const root=payload?.result??payload;
  const candidates=[root?.response,root?.answer,root?.content,root?.result?.response,root?.result?.answer,root?.result?.content];
  for(const value of candidates){
    if(plainObject(value))return value;
    if(typeof value==='string'&&value.trim())return parseJsonText(value,invalidError);
  }
  if(Array.isArray(root?.choices)){
    for(const choice of root.choices){
      const value=choice?.message?.content??choice?.text;
      if(plainObject(value))return value;
      if(typeof value==='string'&&value.trim())return parseJsonText(value,invalidError);
    }
  }
  throw new Error(missingError);
}
