/* IBERFIT Stitch private handoff: read-only, never commit generated HTML.
 * Requires STITCH_API_KEY securely in local environment and @google/stitch-sdk.
 * The production app does not import this development tool. */
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';

export const PROJECT='1399435845853535416';
const MAX=12*1024*1024;
const filename=id=>String(id).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,90);
export function argsFor(input){
  const x={project:PROJECT,title:'Cliente · Hoy',screen:'',limit:4,list:false};
  for(let i=0;i<input.length;i++){
    if(input[i]==='--list'){x.list=true;continue;}
    const name=({'--project':'project','--title':'title','--screen':'screen','--limit':'limit'})[input[i]];
    if(!name||i===input.length-1)throw Error('BAD_ARGUMENT');
    x[name]=input[++i];
  }
  if(x.screen&&!input.includes('--title'))x.title='';
  if(!/^\d{8,24}$/.test(x.project))throw Error('BAD_PROJECT');
  if(x.screen&&!/^[A-Za-z0-9_-]{8,100}$/.test(x.screen))throw Error('BAD_SCREEN_ID');
  x.limit=Number(x.limit);
  if(!Number.isInteger(x.limit)||x.limit<1||x.limit>20)throw Error('BAD_LIMIT');
  if(x.title.length>120)throw Error('BAD_TITLE');
  return x;
}
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const png=buf=>{const b=Buffer.from(buf);return b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':
  b[0]===255&&b[1]===216?'jpg':b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'?'webp':null};
function canvasLabels(raw){
  const r=raw?.structuredContent??raw;
  const out=new Map();
  for(const item of Array.isArray(r?.screenInstances)?r.screenInstances:[]){
    const id=String(item.sourceScreen||'').match(/\/screens\/([A-Za-z0-9_-]+)$/)?.[1];
    if(id&&!out.has(id))out.set(id,{title:String(item.label||''),width:item.width??null,height:item.height??null});
  }
  return out;
}
async function content(value,kind,key,request=fetch){
  if(value instanceof Uint8Array||value instanceof ArrayBuffer)return Buffer.from(value);
  if(typeof value!=='string')throw Error('INVALID_ASSET');
  if(!value.startsWith('https://'))return Buffer.from(value,kind==='html'?'utf8':'base64');
  let u=new URL(value);
  for(let n=0;n<4;n++){
    const h=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password||u.port||
       !(h==='stitch.googleapis.com'||h==='storage.googleapis.com'||h.endsWith('.googleapis.com')||h.endsWith('.googleusercontent.com')))
      throw Error('UNTRUSTED_ASSET_HOST');
    const response=await request(u.toString(),{redirect:'manual',
      headers:h==='stitch.googleapis.com'?{'X-Goog-Api-Key':key}:{}});
    if([301,302,303,307,308].includes(response.status)){
      const dest=response.headers.get('location');if(!dest)throw Error('INVALID_REDIRECT');
      u=new URL(dest,u);continue;
    }
    if(!response.ok)throw Error('ASSET_HTTP_'+response.status);
    const length=Number(response.headers.get('content-length')||0);
    if(length>MAX)throw Error('ASSET_TOO_LARGE');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>MAX)throw Error('ASSET_TOO_LARGE');
    if((response.headers.get('content-type')||'').includes('application/json')){
      const json=JSON.parse(bytes.toString('utf8'));
      if(typeof json.dataString!=='string')throw Error('INVALID_ASSET_BODY');
      return Buffer.from(json.dataString,kind==='html'?'utf8':'base64');
    }
    return bytes;
  }
  throw Error('TOO_MANY_REDIRECTS');
}
export async function exportPrivate({sdk,options,key='',root=process.cwd(),request=fetch}){
  const screens=await sdk.project(options.project).screens();
  if(!Array.isArray(screens))throw Error('INVALID_SCREENS');
  let meta={};
  try{meta=await sdk.callTool('get_project',{name:'projects/'+options.project});}catch{}
  const labels=canvasLabels(meta);
  const selected=screens.map(s=>{
    const id=String(s.id||s.screenId||'');
    const label=labels.get(id);
    return {id,title:label?.title||s.title||id,width:label?.width,height:label?.height,screen:s};
  }).filter(s=>/^[A-Za-z0-9_-]{8,100}$/.test(s.id)&&
    (!options.screen||s.id===options.screen)&&
    (!options.title||s.title.toLocaleLowerCase('es').includes(options.title.toLocaleLowerCase('es'))));
  if(!selected.length)throw Error('NO_MATCHING_SCREENS');
  if(options.list)return {total:screens.length,screens:selected.map(({id,title,width,height})=>({id,title,width,height}))};
  const output=resolve(root,'.tmp','stitch-private',filename(options.project));
  await mkdir(output,{recursive:true,mode:0o700});
  const exported=[];
  for(const item of selected.slice(0,options.limit)){
    const html=await content(await item.screen.getHtml(),'html',key,request);
    const image=await content(await item.screen.getImage(),'image',key,request);
    if(html.length>MAX||image.length>MAX||!/<(?:!doctype\s+html|html|body)\b/i.test(html.subarray(0,3000).toString()))throw Error('INVALID_HTML');
    const ext=png(image);if(!ext)throw Error('INVALID_IMAGE');
    const name=filename(item.id);
    await writeFile(join(output,name+'.html'),html,{mode:0o600});
    await writeFile(join(output,name+'.'+ext),image,{mode:0o600});
    exported.push({id:item.id,title:item.title,width:item.width??null,height:item.height??null,
      html:name+'.html',image:name+'.'+ext,sha256:{html:sha(html),image:sha(image)}});
  }
  await writeFile(join(output,'manifest.json'),JSON.stringify({schema:'IBERFIT_STITCH_PRIVATE_V1',
    project:options.project,total:screens.length,exported},null,2)+'\n',{mode:0o600});
  return {output,count:exported.length,total:screens.length};
}
if(process.argv[1]&&new URL(import.meta.url).pathname===resolve(process.argv[1])){
  try{
    const opts=argsFor(process.argv.slice(2));
    if(!process.env.STITCH_API_KEY)throw Error('STITCH_KEY_NOT_CONFIGURED');
    const {stitch}=await import('@google/stitch-sdk');
    console.log(JSON.stringify(await exportPrivate({sdk:stitch,options:opts,key:process.env.STITCH_API_KEY}),null,2));
  }catch(e){
    // A signed URL could be present in SDK errors: report only a bounded code.
    const code=String(e.code||e.message||'FAILED');
    console.error(/^[A-Z_0-9]+$/.test(code)?code:'STITCH_EXPORT_FAILED');
    process.exitCode=1;
  }
}