export const IMAGE_MODEL='@cf/black-forest-labs/flux-2-klein-4b';
export const QA_MODEL='@cf/moondream/moondream3.1-9B-A2B';

const ALLOWED_IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const MAX_REFERENCE_BYTES=2_000_000;
const MAX_REFERENCE_COUNT=4;
const SCALAR_FIELDS=['prompt','width','height','seed'];

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

export async function normalizeImageMultipart(request){
  const contentType=String(request.headers.get('content-type')||'');
  if(!contentType.toLowerCase().startsWith('multipart/form-data'))throw new Error('MULTIPART_REQUIRED');

  const incoming=await request.formData();
  const normalized=new FormData();

  for(const field of SCALAR_FIELDS){
    const value=incoming.get(field);
    if(value===null)continue;
    if(typeof value!=='string')throw new Error(`SCALAR_FIELD_INVALID:${field}`);
    normalized.append(field,value);
  }

  const prompt=String(incoming.get('prompt')||'').trim();
  if(!prompt)throw new Error('PROMPT_REQUIRED');

  let referenceCount=0;
  for(let index=0;index<MAX_REFERENCE_COUNT;index+=1){
    const field=`input_image_${index}`;
    const value=incoming.get(field);
    if(value===null)continue;
    if(!isBlobLike(value))throw new Error(`REFERENCE_FILE_INVALID:${field}`);
    const mime=String(value.type||'').toLowerCase();
    if(!ALLOWED_IMAGE_TYPES.has(mime))throw new Error(`REFERENCE_MIME_INVALID:${field}:${mime||'missing'}`);
    const bytes=new Uint8Array(await value.arrayBuffer());
    if(bytes.length<32||bytes.length>MAX_REFERENCE_BYTES)throw new Error(`REFERENCE_SIZE_INVALID:${field}:${bytes.length}`);
    if(!magicMatches(bytes,mime))throw new Error(`REFERENCE_MAGIC_INVALID:${field}:${mime}`);
    const safeBlob=new Blob([bytes],{type:mime});
    normalized.append(field,safeBlob,`${field}.${extensionFor(mime)}`);
    referenceCount+=1;
  }

  const serialized=new Response(normalized);
  const normalizedContentType=String(serialized.headers.get('content-type')||'');
  if(!normalizedContentType.toLowerCase().startsWith('multipart/form-data; boundary='))throw new Error('MULTIPART_SERIALIZATION_INVALID');
  if(!serialized.body)throw new Error('MULTIPART_BODY_MISSING');
  return Object.freeze({body:serialized.body,contentType:normalizedContentType,referenceCount});
}

export async function handleRequest(request,env){
  if(!authorized(request,env))return json({ok:false,error:'UNAUTHORIZED'},401);
  if(request.method!=='POST')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  const url=new URL(request.url);
  try{
    if(url.pathname==='/generate'){
      const multipart=await normalizeImageMultipart(request);
      const result=await env.AI.run(IMAGE_MODEL,{multipart:{body:multipart.body,contentType:multipart.contentType}});
      return json({ok:true,model:IMAGE_MODEL,references:multipart.referenceCount,result});
    }
    if(url.pathname==='/qa'){
      const body=await request.json();
      const result=await env.AI.run(QA_MODEL,body);
      return json({ok:true,model:QA_MODEL,result});
    }
    if(url.pathname==='/health')return json({ok:true,ai:true});
    return json({ok:false,error:'NOT_FOUND'},404);
  }catch(error){
    return json({ok:false,error:'AI_BINDING_FAILED',detail:String(error?.message||error).slice(0,500)},502);
  }
}

export default {fetch:handleRequest};
