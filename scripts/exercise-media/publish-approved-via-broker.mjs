#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const BATCH_SCHEMA='iberfit.exercise.media.approved-batch.v1';
const PROD_ORIGIN='https://pjhmrhejsoofmouedavw.supabase.co';
const BROKER_URL=`${PROD_ORIGIN}/functions/v1/iberfit-exercise-media-publisher`;
const BUCKET='iberfit-exercise-media';
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const SAFE_REL=/^[A-Za-z0-9][A-Za-z0-9._/-]{0,499}$/u;
const SAFE_FILE=/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.(?:webp|png|jpe?g)$/iu;
const SHA256=/^[0-9a-f]{64}$/u;
const MAX_BATCH=25,MAX_BYTES=5_000_000,MAX_PARTS=32;
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
function within(root,file){const base=path.resolve(root),r=path.resolve(base,file);if(r!==base&&!r.startsWith(`${base}${path.sep}`))throw new Error('IBERFIT_APPROVED_MEDIA_LOCAL_PATH_ESCAPE');return r;}
function safeRel(v,id,kind='LOCAL_PATH'){const s=String(v||'');if(!SAFE_REL.test(s)||s.startsWith('/')||s.split('/').includes('..'))throw new Error(`IBERFIT_APPROVED_${kind}_INVALID:${id}`);return s;}
function sourceBytes(item,sourceRoot,id){
  const rel=safeRel(item?.local_path,id);
  const local=within(sourceRoot,rel);
  if(fs.existsSync(local)&&fs.statSync(local).isFile())return fs.readFileSync(local);
  const parts=item?.source_base64_parts;
  if(!Array.isArray(parts)||parts.length<1||parts.length>MAX_PARTS)throw new Error(`IBERFIT_APPROVED_FILE_MISSING:${id}`);
  const encoded=parts.map(p=>fs.readFileSync(within(sourceRoot,safeRel(p,id,'BASE64_PART_PATH')),'utf8').replace(/\s+/g,'')).join('');
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error(`IBERFIT_APPROVED_BASE64_INVALID:${id}`);
  const bytes=Buffer.from(encoded,'base64');
  if(!bytes.length)throw new Error(`IBERFIT_APPROVED_BASE64_EMPTY:${id}`);
  return bytes;
}
function jpegDimensions(b){if(b.length<4||b[0]!==0xff||b[1]!==0xd8)throw new Error('IBERFIT_APPROVED_MEDIA_JPEG_INVALID');let i=2;const sof=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);while(i+3<b.length){while(i<b.length&&b[i]!==0xff)i++;while(i<b.length&&b[i]===0xff)i++;if(i>=b.length)break;const m=b[i++];if(m===0xd8||m===0xd9||(m>=0xd0&&m<=0xd7)||m===1)continue;if(i+1>=b.length)break;const len=b.readUInt16BE(i);if(len<2||i+len>b.length)throw new Error('IBERFIT_APPROVED_MEDIA_JPEG_SEGMENT_INVALID');if(sof.has(m))return{width:b.readUInt16BE(i+5),height:b.readUInt16BE(i+3)};i+=len;}throw new Error('IBERFIT_APPROVED_MEDIA_JPEG_DIMENSIONS_MISSING');}
function pngDimensions(b){const s=Buffer.from([137,80,78,71,13,10,26,10]);if(b.length<24||!b.subarray(0,8).equals(s)||b.toString('ascii',12,16)!=='IHDR')throw new Error('IBERFIT_APPROVED_MEDIA_PNG_INVALID');return{width:b.readUInt32BE(16),height:b.readUInt32BE(20)};}
function webpDimensions(b){if(b.length<30||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WEBP')throw new Error('IBERFIT_APPROVED_MEDIA_WEBP_INVALID');let i=12;while(i+8<=b.length){const t=b.toString('ascii',i,i+4),n=b.readUInt32LE(i+4),d=i+8;if(d+n>b.length)throw new Error('IBERFIT_APPROVED_MEDIA_WEBP_CHUNK_INVALID');if(t==='VP8X'&&n>=10)return{width:1+b[d+4]+(b[d+5]<<8)+(b[d+6]<<16),height:1+b[d+7]+(b[d+8]<<8)+(b[d+9]<<16)};if(t==='VP8L'&&n>=5&&b[d]===0x2f){const b1=b[d+1],b2=b[d+2],b3=b[d+3],b4=b[d+4];return{width:1+(b1|((b2&0x3f)<<8)),height:1+((b2>>6)|(b3<<2)|((b4&0x0f)<<10))};}if(t==='VP8 '&&n>=10&&b[d+3]===0x9d&&b[d+4]===1&&b[d+5]===0x2a)return{width:b.readUInt16LE(d+6)&0x3fff,height:b.readUInt16LE(d+8)&0x3fff};i=d+n+(n%2);}throw new Error('IBERFIT_APPROVED_MEDIA_WEBP_DIMENSIONS_MISSING');}
function dimensions(b,m){if(m==='image/jpeg')return jpegDimensions(b);if(m==='image/png')return pngDimensions(b);if(m==='image/webp')return webpDimensions(b);throw new Error('IBERFIT_APPROVED_MEDIA_MIME_INVALID');}
export function validateApprovedBatch(batch,{sourceRoot='.'}={}){
  if(!batch||Array.isArray(batch)||typeof batch!=='object')throw new Error('IBERFIT_APPROVED_BATCH_INVALID');
  if(batch.schema!==BATCH_SCHEMA||batch.target!=='prod')throw new Error('IBERFIT_APPROVED_BATCH_SCHEMA_TARGET_INVALID');
  if(!Array.isArray(batch.items)||batch.items.length<1||batch.items.length>MAX_BATCH)throw new Error('IBERFIT_APPROVED_BATCH_SIZE_INVALID');
  const ids=new Set(),paths=new Set(),out=[];
  for(const item of batch.items){
    const id=String(item?.exercise_id||'');if(!SAFE_ID.test(id)||ids.has(id))throw new Error(`IBERFIT_APPROVED_EXERCISE_ID_INVALID:${id}`);ids.add(id);
    if(item?.human_approved!==true||item?.publishable!==true)throw new Error(`IBERFIT_APPROVED_HUMAN_APPROVAL_REQUIRED:${id}`);
    const a=item?.approval||{},scopes=Array.isArray(a.scopes)?a.scopes.map(String):[];
    if(a.method!=='human_owner_approval'||!scopes.includes('visual')||!scopes.includes('biomechanics'))throw new Error(`IBERFIT_APPROVED_SCOPE_INVALID:${id}`);
    if(String(a.automatic_qa||'').toLowerCase()==='failed')throw new Error(`IBERFIT_APPROVED_AUTOMATIC_QA_FAILED:${id}`);
    const media=item?.media,m=media?.movement;
    if(media?.schema!=='iberfit.exercise.visual.v1'||media?.style!=='iberfit-premium-movement-pair-v1'||media?.bucket!==BUCKET||media?.published!==true||media?.qa?.biomechanics!=='approved'||media?.qa?.visual!=='approved'||(media?.clientVisible!==true&&media?.coachVisible!==true))throw new Error(`IBERFIT_APPROVED_MEDIA_INVALID:${id}`);
    const storagePath=String(m?.path||''),pp=storagePath.split('/');if(pp.length!==2||pp[0]!==id||!SAFE_FILE.test(pp[1])||storagePath.includes('..')||paths.has(storagePath))throw new Error(`IBERFIT_APPROVED_STORAGE_PATH_INVALID:${id}`);paths.add(storagePath);
    const mime=String(m?.mime||'');if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new Error(`IBERFIT_APPROVED_MIME_INVALID:${id}`);
    const expected=String(m?.sha256||'').toLowerCase();if(!SHA256.test(expected))throw new Error(`IBERFIT_APPROVED_SHA_INVALID:${id}`);
    const bytes=sourceBytes(item,sourceRoot,id);if(bytes.length<100||bytes.length>MAX_BYTES)throw new Error(`IBERFIT_APPROVED_FILE_SIZE_INVALID:${id}`);
    const actualSha=sha256(bytes);if(actualSha!==expected)throw new Error(`IBERFIT_APPROVED_FILE_SHA_MISMATCH:${id}`);if(!pp[1].toLowerCase().includes(expected.slice(0,12)))throw new Error(`IBERFIT_APPROVED_IMMUTABLE_PATH_REQUIRED:${id}`);
    const actual=dimensions(bytes,mime);if(actual.width!==Number(m.width)||actual.height!==Number(m.height))throw new Error(`IBERFIT_APPROVED_DIMENSIONS_MISMATCH:${id}:${actual.width}x${actual.height}`);
    out.push(Object.freeze({item,id,media,bytes,mime,storagePath,sha256:actualSha,width:actual.width,height:actual.height}));
  }
  return Object.freeze(out);
}
async function verifyPublic(fetchImpl,r,sha){const url=String(r?.public_url||'');if(!url.startsWith(`${PROD_ORIGIN}/storage/v1/object/public/${BUCKET}/`))throw new Error('IBERFIT_APPROVED_PUBLIC_URL_INVALID');const res=await fetchImpl(url,{method:'GET',cache:'no-store',redirect:'error'});if(!res?.ok)throw new Error(`IBERFIT_APPROVED_PUBLIC_VERIFY_HTTP_${res?.status||0}`);const b=Buffer.from(await res.arrayBuffer());if(sha256(b)!==sha)throw new Error('IBERFIT_APPROVED_PUBLIC_VERIFY_SHA_MISMATCH');return{url,bytes:b.length};}
export async function publishApprovedBatch(batch,{sourceRoot='.',oidcToken='',apply=false,brokerUrl=BROKER_URL,fetchImpl=globalThis.fetch}={}){
  const v=validateApprovedBatch(batch,{sourceRoot});if(!apply)return Object.freeze({ok:true,applied:false,target:'prod',count:v.length});
  if(brokerUrl!==BROKER_URL)throw new Error('IBERFIT_APPROVED_BROKER_URL_INVALID');if(typeof fetchImpl!=='function')throw new Error('IBERFIT_APPROVED_FETCH_UNAVAILABLE');if(String(oidcToken).length<100)throw new Error('IBERFIT_APPROVED_GITHUB_OIDC_REQUIRED');
  const results=[];for(const e of v){const form=new FormData();form.set('item',JSON.stringify(e.item));form.set('file',new Blob([e.bytes],{type:e.mime}),path.basename(e.storagePath));const res=await fetchImpl(brokerUrl,{method:'POST',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{authorization:`Bearer ${oidcToken}`,'x-client-info':'iberfit-exercise-media-github-publisher/1'},body:form});let body=null;try{body=await res.json();}catch{}if(!res?.ok||body?.ok!==true||body?.exercise_id!==e.id||body?.sha256!==e.sha256)throw new Error(`IBERFIT_APPROVED_BROKER_FAILED:${e.id}:${res?.status||0}:${String(body?.error||'invalid_response').slice(0,300)}`);results.push(Object.freeze({...body,public_verification:await verifyPublic(fetchImpl,body,e.sha256)}));}return Object.freeze({ok:true,applied:true,target:'prod',count:results.length,results:Object.freeze(results)});
}
const readJson=f=>JSON.parse(fs.readFileSync(path.resolve(f),'utf8'));
const arg=(a,n)=>{const i=a.indexOf(n);return i>=0?a[i+1]:null};
export async function runCli(argv=process.argv.slice(2),env=process.env){const manifestPath=arg(argv,'--manifest'),sourceRoot=arg(argv,'--source-root')||'.',evidence=arg(argv,'--evidence'),apply=argv.includes('--apply');if(!manifestPath)throw new Error('USAGE: node scripts/exercise-media/publish-approved-via-broker.mjs --manifest <batch.json> --source-root <dir> [--apply] [--evidence <json>]');const r=await publishApprovedBatch(readJson(manifestPath),{sourceRoot,oidcToken:env.IBERFIT_GITHUB_OIDC_TOKEN||'',apply});if(evidence){fs.mkdirSync(path.dirname(path.resolve(evidence)),{recursive:true});fs.writeFileSync(path.resolve(evidence),`${JSON.stringify(r,null,2)}\n`);}console.log(JSON.stringify({ok:r.ok,applied:r.applied,target:r.target,count:r.count}));return r;}
const invoked=process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:'';if(invoked===import.meta.url)runCli().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
