// P0 #1209: ephemeral, strictly public RPC bytes shared across QA Playwright
// worker processes in one GitHub run. Never persist auth/private responses.
// Disabled outside an authenticated QA-only GitHub job or explicit unit-test root.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';

const hex=value=>createHash('sha256').update(value).digest('hex');
function defaultRoot(){
  const env=process.env;
  if(env.GITHUB_ACTIONS!=='true'||env.M26_QA_ONLY!=='true'
    // Node test:offline runs under QA env too. Only real Playwright workers
    // have this per-worker index; never memoize independent Node unit tests.
    ||!(/^[0-9]{1,6}$/u.test(String(env.TEST_WORKER_INDEX??'')))
    ||!(/^[0-9]{1,24}$/u.test(String(env.GITHUB_RUN_ID||'')))
    ||!(/^[a-f0-9]{40}$/iu.test(String(env.GITHUB_SHA||''))))return null;
  return path.resolve('.tmp/qa-public-rpc-run-cache',
    String(env.GITHUB_RUN_ID),String(env.GITHUB_SHA).toLowerCase());
}
export function createQaPublicRpcRunCache({
  now=()=>Date.now(),root,ttlMs=600_000,maxBytes=1_000_000,maxEntries=16,
}={}){
  const folder=root===undefined?defaultRoot()
    :typeof root==='string'&&root.trim()?path.resolve(root):null;
  const pathname=key=>path.join(folder,hex(key)+'.json');
  async function read(key){
    if(!folder)return null;
    try{
      const name=pathname(key);
      const st=await fs.stat(name);
      if(!st.isFile()||st.size<80||st.size>1_400_000)return null;
      const row=JSON.parse(await fs.readFile(name,'utf8'));
      const at=Number(row?.at),age=now()-at;
      if(row?.schema!==1||row?.keyHash!==hex(key)
        ||!Number.isSafeInteger(at)||at<=0||!Number.isFinite(age)
        ||age<0||age>ttlMs||typeof row?.body!=='string'
        ||typeof row?.digest!=='string')return null;
      const body=Buffer.from(row.body,'base64');
      if(body.length>maxBytes||hex(body)!==row.digest)return null;
      return {body,createdAt:at};
    }catch{return null;}
  }
  async function write(key,body){
    if(!folder||!Buffer.isBuffer(body)||body.length>maxBytes)return false;
    let temp=null;
    try{
      await fs.mkdir(folder,{recursive:true,mode:0o700});
      const name=pathname(key);
      const names=await fs.readdir(folder);
      if(!names.includes(path.basename(name))
        &&names.filter(value=>value.endsWith('.json')).length>=maxEntries)return false;
      const at=now();
      if(!Number.isSafeInteger(at)||at<=0)return false;
      const record={schema:1,keyHash:hex(key),at,digest:hex(body),body:body.toString('base64')};
      temp=name+'.'+process.pid+'.'+randomBytes(6).toString('hex')+'.tmp';
      await fs.writeFile(temp,JSON.stringify(record),{flag:'wx',mode:0o600});
      await fs.rename(temp,name);
      return true;
    }catch{return false;}
    finally{if(temp)await fs.rm(temp,{force:true}).catch(()=>{});}
  }
  // The only caller is the allowlisted, anonymous QA public-RPC memo.
  // A per-run/SHA file lease avoids simultaneous first reads by Playwright
  // workers. Never serialize JWT, private response bodies or identifiers.
  // If the writer crashes or the filesystem is unavailable, fall back to the
  // real backend within a small deadline: no fabricated success.
  async function coalesce(key,{readCached,fetchLive,waitMs=250,pollMs=25}={}){
    if(typeof readCached!=='function'||typeof fetchLive!=='function')
      throw new Error('M26_QA_PUBLIC_LEASE_CALLBACK_INVALID');
    const cached=async()=>{try{return await readCached();}catch{return null;}};
    const network=async()=>({source:'live',result:await fetchLive()});
    if(!folder)return network();
    const lease=path.join(folder,hex(key)+'.lease');
    try{await fs.mkdir(folder,{recursive:true,mode:0o700});}
    catch{return network();}
    let handle;
    try{handle=await fs.open(lease,'wx',0o600);}
    catch(error){
      if(error?.code!=='EEXIST')return network();
      const deadline=Date.now()+Math.max(0,Math.min(500,Number(waitMs)||0));
      do{
        const item=await cached();
        if(item)return {source:'shared',result:item};
        try{await fs.stat(lease);}catch{
          const last=await cached();
          if(last)return {source:'shared',result:last};
          break;
        }
        const remaining=deadline-Date.now();
        if(remaining<=0)break;
        await new Promise(resolve=>setTimeout(resolve,
          Math.min(remaining,Math.max(10,Math.min(100,Number(pollMs)||25)))));
      }while(Date.now()<deadline);
      return network();
    }
    try{
      const item=await cached();
      if(item)return {source:'shared',result:item};
      return await network();
    }finally{
      await handle.close().catch(()=>{});
      await fs.rm(lease,{force:true}).catch(()=>{});
    }
  }
  return Object.freeze({read,write,coalesce,enabled:Boolean(folder)});
}
