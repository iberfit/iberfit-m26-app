#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
function exact(v,n){const s=String(v||'').trim();if(!s)throw new Error(`${n}_REQUIRED`);return s;}
function extractText(payload){const x=payload?.result??payload;for(const v of [x?.response,x?.answer,x?.content,x?.result?.response,x?.result?.answer,x?.result?.content])if(typeof v==='string'&&v.trim())return v.trim();if(Array.isArray(x?.choices))for(const c of x.choices){const v=c?.message?.content??c?.text;if(typeof v==='string'&&v.trim())return v.trim();}throw new Error('LOCATE_TEXT_MISSING');}
function parseJson(v){const c=String(v).replace(/<think>[\s\S]*?<\/think>/giu,' ').replace(/^```(?:json)?\s*/iu,'').replace(/\s*```$/u,'').trim();try{return JSON.parse(c);}catch{}const a=c.indexOf('{'),b=c.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(c.slice(a,b+1));throw new Error('LOCATE_JSON_INVALID');}
async function main(){
  const imagePath=exact(arg('--image'),'IMAGE');const exerciseId=exact(arg('--exercise-id'),'EXERCISE_ID');const phase=exact(arg('--phase'),'PHASE');const outPath=exact(arg('--out'),'OUT');if(!['start','final'].includes(phase))throw new Error('PHASE_INVALID');
  const proxy=exact(process.env.IBERFIT_AI_PROXY_URL,'IBERFIT_AI_PROXY_URL').replace(/\/+$/,'')+'/qa';const token=exact(process.env.IBERFIT_AI_PROXY_TOKEN,'IBERFIT_AI_PROXY_TOKEN');const bytes=fs.readFileSync(imagePath);const ext=path.extname(imagePath).toLowerCase();const mime=ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg';const dataUri=`data:${mime};base64,${bytes.toString('base64')}`;
  const text=[
    'Locate the athlete shirt left-chest area for deterministic placement of a small official IBERFIT isotipo. Do not assess branding; the source shirt must be plain.',
    'Return coordinates normalized to the full image: x and y from 0 to 1 at the visual center of the left-chest fabric region. Estimate shirt surface rotation in degrees, clockwise positive, between -45 and 45.',
    'The anchor must be on visible shirt fabric, not skin, equipment, background or arm. If the chest is too occluded or distorted for a natural mark, shirt_visible=false and lower confidence.',
    'Return ONLY JSON: {"shirt_visible":boolean,"x":number,"y":number,"rotation_deg":number,"confidence":number,"issues":[string]}. Confidence 0..1.'
  ].join('\n');
  const body={messages:[{role:'system',content:'Output one complete JSON object only. Be conservative and precise.'},{role:'user',content:[{type:'image_url',image_url:{url:dataUri}},{type:'text',text}]}],temperature:0,stream:false,max_completion_tokens:900,reasoning_effort:'medium',response_format:{type:'json_object'}};
  const response=await fetch(proxy,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error'});if(!response.ok)throw new Error(`LOCATE_HTTP_${response.status}:${(await response.text()).slice(0,800)}`);const payload=await response.json();if(payload?.ok!==true)throw new Error(`LOCATE_PROXY_FAILED:${JSON.stringify(payload).slice(0,1000)}`);const loc=parseJson(extractText(payload));
  const x=Number(loc.x),y=Number(loc.y),rotation=Number(loc.rotation_deg),confidence=Number(loc.confidence);if(loc.shirt_visible!==true||!Number.isFinite(x)||!Number.isFinite(y)||x<0.12||x>0.88||y<0.12||y>0.82||!Number.isFinite(rotation)||rotation<-45||rotation>45||!Number.isFinite(confidence)||confidence<0.97)throw new Error(`LOCATE_CONFIDENCE_OR_GEOMETRY_INVALID:${confidence}`);
  const output={schema:'iberfit.exercise.media.auto.shirt-anchor.v1',exercise_id:exerciseId,phase,shirt_visible:true,x,y,rotation_deg:rotation,confidence,issues:Array.isArray(loc.issues)?loc.issues.map(String).slice(0,6):[]};fs.mkdirSync(path.dirname(outPath),{recursive:true});fs.writeFileSync(outPath,`${JSON.stringify(output,null,2)}\n`);console.log(JSON.stringify(output));
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});
