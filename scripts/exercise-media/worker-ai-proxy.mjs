export const IMAGE_MODEL='@cf/black-forest-labs/flux-2-klein-4b';
export const IMAGE_FALLBACK_MODEL='@cf/black-forest-labs/flux-2-klein-9b';
export const QA_MODEL='@cf/qwen/qwen3.8-27b';

const ALLOWED_IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const ALLOWED_IMAGE_MODELS=new Set([IMAGE_MODEL,IMAGE_FALLBACK_MODEL]);
const MAX_REFERENCE_BYTES=2_000_000;
const MAX_REFERENCE_COUNT=4;
const SCALAR_FIELDS=['prompt','width','height','seed','guidance'];

function authorized(request,env){
  const expected=String(env.SMOKE_TOKEN||'');
  const supplied=String(request.headers.get('authorization')||'');
  return expected.length>=24&&supplied===`Bearer ${expected}`;
}

function json(value,status=200){
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}

function extensionFor(mime){
  if(mime==='image/png')return 'png';
  if(mime==='image/webp')return 'webp';
  return 'jpg';
}

function magicMatches(bytes,mime){
  if(mime==='image/jpeg')return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(mime==='image/png')return bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a;
  if(mime==='image/webp')return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  return false;
}

function isBlobLike(value){
  return value&&typeof value==='object'&&typeof value.arrayBuffer==='function'&&typeof value.type==='string';
}

function serializeMultipart(fields,references){
  const form=new FormData();
  for(const [field,value] of fields)form.append(field,value);
  for(const reference of references)form.append(reference.field,reference.blob,reference.name);
  const serialized=new Response(form);
  const contentType=String(serialized.headers.get('content-type')||'');
  if(!contentType.toLowerCase().startsWith('multipart/form-data; boundary='))throw new Error('MULTIPART_SERIALIZATION_INVALID');
  if(!serialized.body)throw new Error('MULTIPART_BODY_MISSING');
  return Object.freeze({body:serialized.body,contentType});
}

export async function normalizeImageMultipart(request){
  const contentType=String(request.headers.get('content-type')||'');
  if(!contentType.toLowerCase().startsWith('multipart/form-data'))throw new Error('MULTIPART_REQUIRED');
  const incoming=await request.formData();
  const requestedModel=String(incoming.get('model')||IMAGE_MODEL).trim();
  if(!ALLOWED_IMAGE_MODELS.has(requestedModel))throw new Error(`MODEL_NOT_ALLOWED:${requestedModel||'missing'}`);
  const fields=[];
  for(const field of SCALAR_FIELDS){const value=incoming.get(field);if(value===null)continue;if(typeof value!=='string')throw new Error(`SCALAR_FIELD_INVALID:${field}`);fields.push([field,value]);}
  const prompt=String(incoming.get('prompt')||'').trim();if(!prompt)throw new Error('PROMPT_REQUIRED');
  const guidanceRaw=incoming.get('guidance');if(guidanceRaw!==null){const guidance=Number(guidanceRaw);if(!Number.isFinite(guidance)||guidance<1||guidance>10)throw new Error(`GUIDANCE_INVALID:${guidanceRaw}`);}
  const references=[];
  for(let index=0;index<MAX_REFERENCE_COUNT;index+=1){const field=`input_image_${index}`;const value=incoming.get(field);if(value===null)continue;if(!isBlobLike(value))throw new Error(`REFERENCE_FILE_INVALID:${field}`);const mime=String(value.type||'').toLowerCase();if(!ALLOWED_IMAGE_TYPES.has(mime))throw new Error(`REFERENCE_MIME_INVALID:${field}:${mime||'missing'}`);const bytes=new Uint8Array(await value.arrayBuffer());if(bytes.length<32||bytes.length>MAX_REFERENCE_BYTES)throw new Error(`REFERENCE_SIZE_INVALID:${field}:${bytes.length}`);if(!magicMatches(bytes,mime))throw new Error(`REFERENCE_MAGIC_INVALID:${field}:${mime}`);references.push(Object.freeze({field,blob:new Blob([bytes],{type:mime}),name:`${field}.${extensionFor(mime)}`}));}
  const serialized=serializeMultipart(fields,references);return Object.freeze({body:serialized.body,contentType:serialized.contentType,referenceCount:references.length,fields:Object.freeze(fields),references:Object.freeze(references),requestedModel});
}

function isRetryableModelInternalError(error){const detail=String(error?.message||error||'');return/(?:^|\D)3043(?:\D|$)/u.test(detail)||/internal server error/i.test(detail);}
async function runImageModel(env,model,fields,references){const serialized=serializeMultipart(fields,references);return env.AI.run(model,{multipart:{body:serialized.body,contentType:serialized.contentType}});}
async function diagnosticProbe(env,model,fields,references){try{await runImageModel(env,model,fields,references);return'pass';}catch(error){return`fail:${String(error?.message||error).replace(/\s+/gu,' ').slice(0,180)}`;}}
async function diagnoseInternalError(env,multipart,primaryModel,fallbackModel){const diagnosticFields=[['prompt','A neutral premium dark gym interior, realistic fitness photograph, no text.'],['width','256'],['height','320'],['seed','1']];const report={};report.primary_text=await diagnosticProbe(env,primaryModel,diagnosticFields,[]);if(report.primary_text==='pass'&&multipart.references[0])report.primary_ref0=await diagnosticProbe(env,primaryModel,diagnosticFields,[multipart.references[0]]);if(report.primary_ref0==='pass'&&multipart.references.length>=2)report.primary_two_refs=await diagnosticProbe(env,primaryModel,diagnosticFields,multipart.references.slice(0,2));if(report.primary_text!=='pass')report.fallback_text=await diagnosticProbe(env,fallbackModel,diagnosticFields,[]);else if(report.primary_two_refs&&report.primary_two_refs!=='pass')report.fallback_two_refs=await diagnosticProbe(env,fallbackModel,diagnosticFields,multipart.references.slice(0,2));return report;}

export async function handleRequest(request,env){
  if(!authorized(request,env))return json({ok:false,error:'UNAUTHORIZED'},401);
  if(request.method!=='POST')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  const url=new URL(request.url);
  try{
    if(url.pathname==='/generate'){
      const multipart=await normalizeImageMultipart(request);const primaryModel=multipart.requestedModel;const fallbackModel=primaryModel===IMAGE_MODEL?IMAGE_FALLBACK_MODEL:IMAGE_MODEL;
      try{const result=await runImageModel(env,primaryModel,multipart.fields,multipart.references);return json({ok:true,model:primaryModel,references:multipart.referenceCount,fallback:false,result});}
      catch(primaryError){if(!isRetryableModelInternalError(primaryError))throw primaryError;try{const result=await runImageModel(env,fallbackModel,multipart.fields,multipart.references);return json({ok:true,model:fallbackModel,references:multipart.referenceCount,fallback:true,fallback_from:primaryModel,result});}catch(fallbackError){const diagnostic=await diagnoseInternalError(env,multipart,primaryModel,fallbackModel);throw new Error(`PRIMARY_${primaryModel}:${String(primaryError?.message||primaryError)} | FALLBACK_${fallbackModel}:${String(fallbackError?.message||fallbackError)} | DIAG:${JSON.stringify(diagnostic)}`);}}
    }
    if(url.pathname==='/qa'){const body=await request.json();const result=await env.AI.run(QA_MODEL,body);return json({ok:true,model:QA_MODEL,result});}
    if(url.pathname==='/health')return json({ok:true,ai:true,qa_model:QA_MODEL});
    return json({ok:false,error:'NOT_FOUND'},404);
  }catch(error){return json({ok:false,error:'AI_BINDING_FAILED',detail:String(error?.message||error).slice(0,1400)},502);}
}

export default {fetch:handleRequest};
