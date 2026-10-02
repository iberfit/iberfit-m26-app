import process from 'node:process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildHostedAuthPatch} from './sync-hosted-auth-emails.mjs';

const DEFAULT_BASE_URL='https://app.iberfit.cl';
const DEFAULT_MAX_BYTES=500_000;
const USER_AGENT='IBERFIT-Mail-Image-Proxy-Smoke/1.0';

const fail=(code)=>{throw new Error(code);};

function extensionOf(url){
  try{return path.extname(new URL(url).pathname).toLowerCase();}
  catch{return '';}
}

export function imageReferencesFromHtml(html=''){
  return [...String(html).matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/giu)]
    .map((match)=>match[1].trim())
    .filter(Boolean);
}

export function imageReferencesFromPatch(patch={}){
  const refs=new Set();
  for(const value of Object.values(patch)){
    if(typeof value!=='string'||!/<img\b/iu.test(value))continue;
    for(const ref of imageReferencesFromHtml(value))refs.add(ref);
  }
  return [...refs];
}

function parseJpegSof(bytes){
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return null;
  let offset=2;
  while(offset+3<bytes.length){
    if(bytes[offset]!==0xff){offset+=1;continue;}
    while(offset<bytes.length&&bytes[offset]===0xff)offset+=1;
    if(offset>=bytes.length)break;
    const marker=bytes[offset++];
    if(marker===0xd9||marker===0xda)break;
    if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
    if(offset+1>=bytes.length)break;
    const length=(bytes[offset]<<8)|bytes[offset+1];
    if(length<2||offset+length>bytes.length)break;
    const sof=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    if(sof.has(marker)){
      if(length<8)return null;
      return {
        marker,
        progressive:[0xc2,0xc6,0xca,0xce].includes(marker),
        precision:bytes[offset+2],
        height:(bytes[offset+3]<<8)|bytes[offset+4],
        width:(bytes[offset+5]<<8)|bytes[offset+6],
        components:bytes[offset+7],
      };
    }
    offset+=length;
  }
  return null;
}

export function inspectImagePayload(bytesLike,{url='',contentType='',maxBytes=DEFAULT_MAX_BYTES}={}){
  const bytes=bytesLike instanceof Uint8Array?bytesLike:new Uint8Array(bytesLike||[]);
  if(bytes.length===0)fail('IBERFIT_AUTH_EMAIL_ASSET_EMPTY');
  if(bytes.length>maxBytes)fail('IBERFIT_AUTH_EMAIL_ASSET_TOO_LARGE');
  const mime=String(contentType||'').split(';')[0].trim().toLowerCase();
  const extension=extensionOf(url);

  if(extension==='.jpg'||extension==='.jpeg'){
    if(mime!=='image/jpeg')fail('IBERFIT_AUTH_EMAIL_ASSET_JPEG_MIME_INVALID');
    if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9){
      fail('IBERFIT_AUTH_EMAIL_ASSET_JPEG_SIGNATURE_INVALID');
    }
    const sof=parseJpegSof(bytes);
    if(!sof)fail('IBERFIT_AUTH_EMAIL_ASSET_JPEG_SOF_MISSING');
    if(sof.progressive||sof.marker!==0xc0)fail('IBERFIT_AUTH_EMAIL_ASSET_JPEG_BASELINE_REQUIRED');
    if(sof.precision!==8||![1,3].includes(sof.components)||sof.width<1||sof.height<1){
      fail('IBERFIT_AUTH_EMAIL_ASSET_JPEG_GEOMETRY_INVALID');
    }
    return Object.freeze({format:'jpeg',bytes:bytes.length,...sof});
  }

  if(extension==='.png'){
    if(mime!=='image/png')fail('IBERFIT_AUTH_EMAIL_ASSET_PNG_MIME_INVALID');
    const signature=[137,80,78,71,13,10,26,10];
    if(bytes.length<24||!signature.every((value,index)=>bytes[index]===value)){
      fail('IBERFIT_AUTH_EMAIL_ASSET_PNG_SIGNATURE_INVALID');
    }
    const width=((bytes[16]<<24)>>>0)+(bytes[17]<<16)+(bytes[18]<<8)+bytes[19];
    const height=((bytes[20]<<24)>>>0)+(bytes[21]<<16)+(bytes[22]<<8)+bytes[23];
    if(width<1||height<1)fail('IBERFIT_AUTH_EMAIL_ASSET_PNG_GEOMETRY_INVALID');
    return Object.freeze({format:'png',bytes:bytes.length,width,height});
  }

  if(!mime.startsWith('image/'))fail('IBERFIT_AUTH_EMAIL_ASSET_MIME_NOT_IMAGE');
  return Object.freeze({format:mime.slice(6)||'image',bytes:bytes.length});
}

function targetFor(reference,baseUrl){
  const source=new URL(reference);
  const base=new URL(baseUrl);
  return new URL(`${source.pathname}${source.search}`,base).toString();
}

function assertNoRedirect(response,label){
  if(response.status<200||response.status>=300)fail(`${label}_HTTP_${response.status}`);
  if(response.headers.get('location'))fail(`${label}_REDIRECT_FORBIDDEN`);
  if(String(response.headers.get('cf-mitigated')||'').toLowerCase()==='challenge'){
    fail(`${label}_CLOUDFLARE_CHALLENGE`);
  }
}

function optionalPositiveContentLength(headers,code){
  const raw=headers.get('content-length');
  if(raw===null||String(raw).trim()==='')return null;
  const value=Number(raw);
  if(!Number.isFinite(value)||value<=0)fail(code);
  return value;
}

export async function verifyEmailAsset(reference,{baseUrl=DEFAULT_BASE_URL,fetchImpl=fetch,maxBytes=DEFAULT_MAX_BYTES}={}){
  const target=targetFor(reference,baseUrl);
  const commonHeaders={
    Accept:'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'User-Agent':USER_AGENT,
    'Cache-Control':'no-cache',
  };

  const head=await fetchImpl(target,{method:'HEAD',redirect:'manual',headers:commonHeaders});
  const headUnsupported=head.status===405||head.status===501;
  if(!headUnsupported){
    assertNoRedirect(head,'IBERFIT_AUTH_EMAIL_ASSET_HEAD');
    const headMime=String(head.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!headMime.startsWith('image/'))fail('IBERFIT_AUTH_EMAIL_ASSET_HEAD_MIME_NOT_IMAGE');
    optionalPositiveContentLength(head.headers,'IBERFIT_AUTH_EMAIL_ASSET_HEAD_LENGTH_INVALID');
  }

  const response=await fetchImpl(target,{method:'GET',redirect:'manual',headers:commonHeaders});
  assertNoRedirect(response,'IBERFIT_AUTH_EMAIL_ASSET_GET');
  const contentType=String(response.headers.get('content-type')||'');
  if(!contentType.toLowerCase().startsWith('image/'))fail('IBERFIT_AUTH_EMAIL_ASSET_GET_MIME_NOT_IMAGE');
  const body=new Uint8Array(await response.arrayBuffer());
  const info=inspectImagePayload(body,{url:target,contentType,maxBytes});
  const declaredLength=optionalPositiveContentLength(response.headers,'IBERFIT_AUTH_EMAIL_ASSET_GET_LENGTH_INVALID');

  return Object.freeze({
    reference,
    target,
    headStatus:head.status,
    getStatus:response.status,
    contentType:contentType.split(';')[0].trim().toLowerCase(),
    declaredLength:Number.isFinite(declaredLength)?declaredLength:null,
    bytes:body.length,
    cacheControl:response.headers.get('cache-control')||null,
    cfCacheStatus:response.headers.get('cf-cache-status')||null,
    etag:response.headers.get('etag')||null,
    lastModified:response.headers.get('last-modified')||null,
    ...info,
  });
}

export async function verifyHostedAuthEmailAssets({baseUrl=process.env.IBERFIT_AUTH_EMAIL_ASSET_BASE_URL||DEFAULT_BASE_URL,fetchImpl=fetch}={}){
  const built=await buildHostedAuthPatch();
  const references=imageReferencesFromPatch(built.patch);
  if(references.length===0)fail('IBERFIT_AUTH_EMAIL_ASSETS_MISSING');
  const results=[];
  for(const reference of references){
    if(!/^https:\/\//iu.test(reference))fail('IBERFIT_AUTH_EMAIL_ASSET_ABSOLUTE_HTTPS_REQUIRED');
    results.push(await verifyEmailAsset(reference,{baseUrl,fetchImpl}));
  }
  return Object.freeze({ok:true,baseUrl,assetCount:results.length,assets:Object.freeze(results)});
}

async function main(){
  const result=await verifyHostedAuthEmailAssets();
  console.log(JSON.stringify(result,null,2));
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(invoked)main().catch((error)=>{console.error(String(error?.message||error));process.exitCode=1;});
